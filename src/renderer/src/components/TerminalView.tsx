import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { TerminalPatternMatcher } from '../utils/terminalPatterns'
import { SessionStatus, HooksSettings } from '../../../shared/types'

interface TerminalViewProps {
    id: string
    cwd: string
    visible: boolean
    onSessionStatusChange?: (sessionId: string, status: SessionStatus, isClaudeCode: boolean) => void
    fontSize?: number
    initialCommand?: string
    shell?: string  // User's preferred shell from settings
    keyboardSettings?: {
        scrollShortcuts: boolean
        showScrollButtons: boolean
    }
    hooksSettings?: HooksSettings
}

// 터미널 폰트 패밀리 (고정값)
const TERMINAL_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace'

export function TerminalView({
    id,
    cwd,
    visible,
    onSessionStatusChange,
    fontSize = 14,
    initialCommand,
    shell,
    keyboardSettings,
    hooksSettings
}: TerminalViewProps) {
    const terminalRef = useRef<HTMLDivElement>(null)
    const xtermRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const matcherRef = useRef<TerminalPatternMatcher>(new TerminalPatternMatcher())
    // 초기화 직후 불필요한 resize를 방지하기 위한 플래그
    const isInitializedRef = useRef<boolean>(false)
    // fit() 중복 호출 방지 플래그 (race condition 방지)
    const isFittingRef = useRef<boolean>(false)
    // ResizeObserver debounce 타이머
    const resizeDebounceRef = useRef<NodeJS.Timeout | null>(null)
    // fit() 요청 큐 (pending 상태 추적)
    const fitPendingRef = useRef<boolean>(false)
    // initialCommand가 이미 실행되었는지 추적 (StrictMode에서 2번 실행 방지)
    const initialCommandExecutedRef = useRef<boolean>(false)
    // keyboardSettings를 ref로 저장하여 실시간 적용 지원
    const keyboardSettingsRef = useRef(keyboardSettings)

    // keyboardSettings가 변경될 때 ref 업데이트 (실시간 적용)
    useEffect(() => {
        keyboardSettingsRef.current = keyboardSettings
    }, [keyboardSettings])

    // hooksSettings를 ref로 저장하여 실시간 적용 지원
    const hooksSettingsRef = useRef(hooksSettings)
    useEffect(() => {
        hooksSettingsRef.current = hooksSettings
    }, [hooksSettings])

    // Track last session status to avoid duplicate callbacks
    const lastSessionStatusRef = useRef<SessionStatus>('idle')
    // claude-squad 방식 폴링 타이머 (500ms마다 상태 체크)
    const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
    // 세션을 떠난 시점 기록 (쿨다운용)
    const leftSessionTimeRef = useRef<number>(0)
    // 쿨다운 시간 (ms) - 세션 떠난 후 이 시간 동안은 상태 업데이트 무시
    const STATUS_COOLDOWN_MS = 1500
    // 쿨다운이 끝난 후 첫 폴링인지 추적 (해시 동기화용)
    const needsSyncAfterCooldownRef = useRef<boolean>(false)
    // Ready → Running 전환 debounce (깜빡임 방지)
    // 2초(4회 폴링) 동안 연속 Running 판정 시에만 전환
    const runningCountRef = useRef<number>(0)
    const RUNNING_DEBOUNCE_COUNT = 4  // 500ms * 4 = 2초

    // visible을 ref로 추적 (closure 문제 해결)
    const visibleRef = useRef<boolean>(visible)
    useEffect(() => {
        // visible이 true→false로 바뀔 때 (세션을 나올 때)
        if (visibleRef.current && !visible) {
            leftSessionTimeRef.current = Date.now()
            // 쿨다운 후 첫 폴링에서 해시 동기화 필요 표시
            needsSyncAfterCooldownRef.current = true
        }
        visibleRef.current = visible
    }, [visible])

    /**
     * 안전한 fit() 호출 - 중복 호출 방지 및 throttle 적용
     * xterm.js의 fit()은 재진입 불안전(non-reentrant)하므로 동시 호출 방지
     *
     * 문제 해결:
     * - 스크롤 중 ResizeObserver 트리거로 인한 viewport 충돌 방지
     * - 여러 useEffect에서 동시에 fit() 호출 시 race condition 방지
     */
    const safeFit = (options?: { focus?: boolean }) => {
        // 이미 fitting 중이면 pending으로 표시하고 skip
        if (isFittingRef.current) {
            fitPendingRef.current = true
            return
        }

        if (!fitAddonRef.current || !xtermRef.current) return

        isFittingRef.current = true

        // requestAnimationFrame으로 렌더링 사이클과 동기화
        requestAnimationFrame(() => {
            try {
                fitAddonRef.current?.fit()
                if (xtermRef.current) {
                    window.api.resizeTerminal(id, xtermRef.current.cols, xtermRef.current.rows)
                    if (options?.focus) {
                        xtermRef.current.focus()
                    }
                }
            } catch (e) {
                console.error('Failed to fit terminal:', e)
            } finally {
                isFittingRef.current = false

                // pending 요청이 있으면 다음 프레임에서 처리
                if (fitPendingRef.current) {
                    fitPendingRef.current = false
                    // 다음 이벤트 루프에서 처리 (즉시 재귀 방지)
                    setTimeout(() => safeFit(options), 0)
                }
            }
        })
    }

    /**
     * 터미널 출력 처리
     * 버퍼만 업데이트하고, 상태 결정은 pollStatus()에서 처리
     */
    const detectOutput = (text: string) => {
        const hooks = hooksSettingsRef.current

        // Check if hooks are globally enabled
        if (!hooks?.enabled) return

        // Check if Claude Code monitoring is enabled
        if (!hooks?.claudeCode?.enabled) return

        // 버퍼 업데이트만 수행 (상태 변경은 pollStatus에서)
        matcherRef.current.processWithStatus(text)
    }

    /**
     * claude-squad 방식 폴링
     * 500ms마다 버퍼 해시 비교로 상태 결정
     *
     * claude-squad 로직 (app.go):
     * updated, prompt := instance.HasUpdated()
     * if updated {
     *     instance.SetStatus(Running)   // 해시가 다르면 = Running
     * } else {
     *     instance.SetStatus(Ready)     // 해시가 같으면 = Ready
     * }
     */
    const pollStatus = () => {
        // 현재 보고 있는 세션에는 상태 업데이트 하지 않음
        if (visibleRef.current) return

        // 쿨다운 체크
        const isInCooldown = Date.now() - leftSessionTimeRef.current < STATUS_COOLDOWN_MS
        if (isInCooldown) return

        // 쿨다운이 끝난 후 첫 폴링: 해시만 동기화하고 상태는 변경하지 않음
        // 이렇게 하면 세션 나온 후 파란색 깜빡임 방지
        if (needsSyncAfterCooldownRef.current) {
            needsSyncAfterCooldownRef.current = false
            matcherRef.current.syncHash()
            return  // 이번 폴링은 스킵
        }

        const hooks = hooksSettingsRef.current
        if (!hooks?.enabled || !hooks?.claudeCode?.enabled || !hooks?.claudeCode?.showInSidebar) return

        // 폴링으로 상태 결정
        const { status, isClaudeCode } = matcherRef.current.pollStatus()

        if (!isClaudeCode) return

        // 설정에 따라 상태 필터링
        let newStatus: SessionStatus = status
        if (status === 'running' && !(hooks.claudeCode.detectRunning ?? true)) {
            newStatus = 'idle'
        }
        if (status === 'ready' && !hooks.claudeCode.detectReady) {
            newStatus = 'idle'
        }

        // Ready → Running 전환에 debounce 적용 (깜빡임 방지)
        // 현재 Ready이고 새 상태가 Running이면 debounce
        if (lastSessionStatusRef.current === 'ready' && newStatus === 'running') {
            runningCountRef.current++
            // 2초(4회) 연속 Running 판정이 아니면 전환하지 않음
            if (runningCountRef.current < RUNNING_DEBOUNCE_COUNT) {
                return  // Ready 유지
            }
            // 2초 지났으면 Running으로 전환
        } else {
            // Running 판정이 아니면 카운터 리셋
            runningCountRef.current = 0
        }

        if (newStatus !== lastSessionStatusRef.current) {
            lastSessionStatusRef.current = newStatus
            onSessionStatusChange?.(id, newStatus, isClaudeCode)
        }
    }

    // claude-squad 방식 폴링 타이머 설정 (500ms 간격)
    useEffect(() => {
        const pollInterval = matcherRef.current.getPollInterval()

        pollTimerRef.current = setInterval(() => {
            pollStatus()
        }, pollInterval)

        return () => {
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, onSessionStatusChange])

    // Handle visibility changes
    useEffect(() => {
        // 초기화 직후에는 resize 건너뛰기 (createTerminal에서 이미 올바른 크기로 생성됨)
        if (!isInitializedRef.current) return

        if (visible && fitAddonRef.current && xtermRef.current) {
            // 터미널로 돌아올 때: 백그라운드에서 쌓인 텍스트 렌더링 시간 확보
            // 즉시 fit()하면 렌더링 중인 xterm과 충돌할 수 있음
            // 100ms 후에 safeFit() 호출하여 렌더링이 어느정도 진행된 후 처리
            setTimeout(() => {
                safeFit({ focus: true })
            }, 100)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, id])

    // fontSize 변경 시 터미널 재생성 없이 동적으로 업데이트
    useEffect(() => {
        if (xtermRef.current && fitAddonRef.current) {
            xtermRef.current.options.fontSize = fontSize
            // visible 상태일 때만 fit 호출 (display:none 상태에서는 크기 계산이 잘못됨)
            // 비활성 터미널은 visible이 true가 될 때 visibility useEffect에서 fit 호출됨
            if (visible) {
                safeFit()
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fontSize, id, visible])

    useEffect(() => {
        if (!terminalRef.current) return

        const term = new Terminal({
            theme: {
                background: '#0f0f1200', // Transparent
                foreground: '#e0e0e0',
                cursor: '#ffffff',
                selectionBackground: 'rgba(255, 255, 255, 0.3)'
            },
            fontFamily: TERMINAL_FONT_FAMILY,
            fontSize,
            allowProposedApi: true,
            cursorBlink: true
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        term.open(terminalRef.current)

        xtermRef.current = term
        fitAddonRef.current = fitAddon

        // Initialize backend terminal
        let initialCols = 80
        let initialRows = 30

        if (visible) {
            try {
                fitAddon.fit()
                initialCols = term.cols
                initialRows = term.rows
            } catch (e) {
                console.error('Failed to fit terminal initially:', e)
            }
        }

        window.api.createTerminal(id, cwd, initialCols, initialRows, shell).then(() => {
            // Handle scroll shortcuts (⌘↑/⌘↓)
            term.attachCustomKeyEventHandler((event) => {
                const scrollShortcutsEnabled = keyboardSettingsRef.current?.scrollShortcuts ?? true
                if (scrollShortcutsEnabled) {
                    if (event.metaKey && event.key === 'ArrowUp') {
                        term.scrollToTop()
                        return false  // Prevent default
                    }
                    if (event.metaKey && event.key === 'ArrowDown') {
                        term.scrollToBottom()
                        return false  // Prevent default
                    }
                }
                return true  // Allow other keys
            })

            // Handle input
            term.onData((data) => {
                window.api.writeTerminal(id, data)
            })

            // Handle output
            const cleanup = window.api.onTerminalData(id, (data) => {
                term.write(data)

                try {
                    detectOutput(data)
                } catch (e) {
                    console.error('Failed to detect terminal notification', e)
                }
            })

            // Execute initial command if provided (only once)
            if (initialCommand && !initialCommandExecutedRef.current) {
                initialCommandExecutedRef.current = true
                // Wait a bit for the terminal to be ready
                setTimeout(() => {
                    window.api.writeTerminal(id, initialCommand + '\n')
                }, 500)
            }

            // 초기화 완료 표시 - 이후 resize 이벤트는 정상 처리됨
            // 약간의 딜레이를 두어 초기 프롬프트가 완전히 출력된 후에 resize 허용
            setTimeout(() => {
                isInitializedRef.current = true
            }, 300)

            return () => {
                cleanup()
                window.api.writeTerminal(id, 'exit\n') // Try to close gracefully
            }
        })

        // Handle resize - safeFit()으로 중복 호출 방지
        const handleResize = () => {
            safeFit()
        }

        window.addEventListener('resize', handleResize)

        // Add ResizeObserver for container size changes (e.g. display: block)
        // IMPORTANT: debounce 적용으로 스크롤 중 멈춤 현상 방지
        // 문제: 스크롤 시 ResizeObserver가 연속 트리거되어 xterm viewport 충돌 발생
        // 해결: 150ms debounce로 연속 이벤트를 병합
        const resizeObserver = new ResizeObserver(() => {
            // 초기화 완료 후에만 resize 처리
            if (visible && isInitializedRef.current) {
                // debounce: 이전 타이머 취소하고 새로 설정
                if (resizeDebounceRef.current) {
                    clearTimeout(resizeDebounceRef.current)
                }
                resizeDebounceRef.current = setTimeout(() => {
                    resizeDebounceRef.current = null
                    safeFit()
                }, 150)  // 150ms debounce
            }
        })

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current)
        }

        return () => {
            window.removeEventListener('resize', handleResize)
            resizeObserver.disconnect()
            // debounce 타이머 정리
            if (resizeDebounceRef.current) {
                clearTimeout(resizeDebounceRef.current)
                resizeDebounceRef.current = null
            }
            term.dispose()
            // 폴링 타이머는 별도 useEffect에서 정리됨
        }
    // fontSize는 별도 useEffect에서 동적으로 처리하므로 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, cwd])

    // 파일 드래그 앤 드롭 핸들러
    // 파일을 터미널로 드래그하면 경로가 입력됨
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()

        const files = e.dataTransfer.files
        if (files.length > 0) {
            // 파일 경로들을 공백으로 구분하여 입력
            // 경로에 공백이 있으면 이스케이프 처리
            const paths = Array.from(files)
                .map(file => {
                    // Electron에서는 file.path로 전체 경로를 얻을 수 있음
                    const filePath = (file as any).path as string
                    // 공백이 포함된 경로는 백슬래시로 이스케이프
                    return filePath.replace(/ /g, '\\ ')
                })
                .join(' ')

            // 터미널에 경로 입력
            if (xtermRef.current) {
                window.api.writeTerminal(id, paths)
            }
        }
    }

    return (
        <div
            className="w-full h-full relative"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <div className="w-full h-full" ref={terminalRef} />

            {/* Floating Scroll Buttons */}
            {(keyboardSettings?.showScrollButtons ?? true) && (
                <div className="absolute right-2 bottom-20 flex flex-col gap-2 z-40 opacity-40 hover:opacity-100 transition-opacity duration-200">
                    <button
                        onClick={() => xtermRef.current?.scrollToTop()}
                        className="w-8 h-8 bg-blue-600/80 hover:bg-blue-500 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110"
                        title="Scroll to top (⌘↑)"
                    >
                        <ChevronUp size={18} className="text-white" />
                    </button>
                    <button
                        onClick={() => xtermRef.current?.scrollToBottom()}
                        className="w-8 h-8 bg-blue-600/80 hover:bg-blue-500 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110"
                        title="Scroll to bottom (⌘↓)"
                    >
                        <ChevronDown size={18} className="text-white" />
                    </button>
                </div>
            )}
        </div>
    )
}
