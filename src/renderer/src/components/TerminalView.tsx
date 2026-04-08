import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon, ITerminalDimensions } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { ChevronUp, ChevronDown, FolderOpen, ExternalLink, Code } from 'lucide-react'
import { TerminalPatternMatcher } from '../utils/terminalPatterns'
import { registerFilePathLinks } from '../utils/filePathLinkProvider'
import { TerminalResizeManager } from '../utils/terminalResizeManager'
import { SessionStatus, HooksSettings } from '../../../shared/types'

interface TerminalViewProps {
    id: string
    cwd: string
    visible: boolean
    onSessionStatusChange?: (sessionId: string, status: SessionStatus, isClaudeCode: boolean) => void
    onFocus?: (sessionId: string) => void  // Called when terminal gains focus (for split view active pane)
    fontSize?: number
    fontFamily?: string  // User's preferred terminal font from settings
    initialCommand?: string
    resumeCommand?: string  // CLI tool resume command (takes priority over initialCommand)
    workspaceId?: string    // Workspace ID for CLI session tracking
    shell?: string  // User's preferred shell from settings
    keyboardSettings?: {
        scrollShortcuts: boolean
        showScrollButtons: boolean
    }
    hooksSettings?: HooksSettings
    // Grid Window에서는 PTY resize를 비활성화 (메인 앱과 크기 충돌 방지)
    disablePtyResize?: boolean
}

// Default terminal font family (fallback when no custom font is set)
const DEFAULT_TERMINAL_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace'
const VIEWPORT_REFRESH_ANSI_REGEX = /\x1b\[[0-9;?]*[HJJKf]|\x1b\[\?1049[hl]/

export function TerminalView({
    id,
    cwd,
    visible,
    onSessionStatusChange,
    onFocus,
    fontSize = 14,
    fontFamily,
    initialCommand,
    resumeCommand,
    workspaceId,
    shell,
    keyboardSettings,
    hooksSettings,
    disablePtyResize = false
}: TerminalViewProps) {
    // Compute effective font family with fallback
    // Empty string means user selected "Custom" but didn't enter a value yet
    const effectiveFontFamily = fontFamily && fontFamily.trim() !== ''
        ? fontFamily
        : DEFAULT_TERMINAL_FONT_FAMILY
    const terminalRef = useRef<HTMLDivElement>(null)
    const xtermRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const matcherRef = useRef<TerminalPatternMatcher>(new TerminalPatternMatcher())
    // 초기화 직후 불필요한 resize를 방지하기 위한 플래그
    const isInitializedRef = useRef<boolean>(false)
    // 스크롤 중인지 추적 (스크롤 중에는 ResizeObserver 무시)
    const isScrollingRef = useRef<boolean>(false)
    // 마지막 크기 추적 (1px 이상 변화만 감지)
    const lastSizeRef = useRef<{ width: number; height: number } | null>(null)
    // VS Code식 visible-aware resize coordinator
    const resizeManagerRef = useRef<TerminalResizeManager | null>(null)
    const wasNearBottomBeforeHideRef = useRef<boolean>(true)
    const pendingViewportRefreshWritesRef = useRef<number>(0)
    // initialCommand가 이미 실행되었는지 추적 (StrictMode에서 2번 실행 방지)
    const initialCommandExecutedRef = useRef<boolean>(false)
    // keyboardSettings를 ref로 저장하여 실시간 적용 지원
    const keyboardSettingsRef = useRef(keyboardSettings)

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{
        visible: boolean
        x: number
        y: number
        selectedText: string
    }>({ visible: false, x: 0, y: 0, selectedText: '' })

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
            const terminal = xtermRef.current
            if (terminal) {
                const buffer = terminal.buffer.active
                wasNearBottomBeforeHideRef.current = buffer.viewportY + terminal.rows >= buffer.length - 2
            }
        }
        visibleRef.current = visible
    }, [visible])

    // 마지막으로 PTY에 전달한 터미널 크기 (중복 호출 방지)
    const lastPtySizeRef = useRef<{ cols: number; rows: number } | null>(null)

    const forceViewportRefresh = useCallback((terminal?: Terminal | null) => {
        const target = terminal ?? xtermRef.current
        if (!target) return
        const terminalCore = (target as Terminal & {
            _core?: { viewport?: { _innerRefresh?: () => void } }
        })._core
        terminalCore?.viewport?._innerRefresh?.()
    }, [])

    const isViewportNearBottom = useCallback((terminal?: Terminal | null) => {
        const target = terminal ?? xtermRef.current
        if (!target) return true
        const buffer = target.buffer.active
        return buffer.viewportY + target.rows >= buffer.length - 2
    }, [])

    const applyTerminalDimensions = useCallback((
        dimensions: ITerminalDimensions,
        options?: { focus?: boolean }
    ) => {
        const terminal = xtermRef.current
        if (!terminal) return

        let didResize = false
        if (terminal.cols !== dimensions.cols || terminal.rows !== dimensions.rows) {
            terminal.resize(dimensions.cols, dimensions.rows)
            didResize = true
        }

        if (options?.focus) {
            terminal.focus()
        }

        if (didResize) {
            requestAnimationFrame(() => {
                forceViewportRefresh(terminal)
            })
        }

        if (disablePtyResize) {
            return
        }

        const lastSize = lastPtySizeRef.current
        if (!lastSize || lastSize.cols !== dimensions.cols || lastSize.rows !== dimensions.rows) {
            lastPtySizeRef.current = dimensions
            window.api.resizeTerminal(id, dimensions.cols, dimensions.rows)
        }
    }, [disablePtyResize, forceViewportRefresh, id])

    const getProposedDimensions = useCallback((): ITerminalDimensions | null => {
        const fitAddon = fitAddonRef.current
        const terminal = xtermRef.current
        const terminalElement = terminalRef.current
        if (!fitAddon || !terminal || !terminalElement) {
            return null
        }

        const rect = terminalElement.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) {
            return null
        }

        const proposed = fitAddon.proposeDimensions()
        if (!proposed || Number.isNaN(proposed.cols) || Number.isNaN(proposed.rows)) {
            return null
        }

        return proposed
    }, [])

    const requestResize = useCallback((options?: {
        immediate?: boolean
        focus?: boolean
        flush?: boolean
    }) => {
        if (options?.flush) {
            resizeManagerRef.current?.flush()
        }

        const dimensions = getProposedDimensions()
        if (!dimensions) return

        if (options?.immediate || options?.focus) {
            applyTerminalDimensions(dimensions, options)
            return
        }

        resizeManagerRef.current?.resize(dimensions.cols, dimensions.rows, false)
    }, [applyTerminalDimensions, getProposedDimensions])

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

    // Listen for terminal clear events (Cmd+K)
    useEffect(() => {
        const cleanup = window.api.onTerminalClear(id, () => {
            if (xtermRef.current) {
                xtermRef.current.clear()  // Clear scrollback buffer and screen
            }
        })
        return cleanup
    }, [id])

    // Handle visibility changes
    useEffect(() => {
        // 초기화 직후에는 resize 건너뛰기 (createTerminal에서 이미 올바른 크기로 생성됨)
        if (!isInitializedRef.current) return

        if (visible && fitAddonRef.current && xtermRef.current) {
            // VS Code setVisible 흐름처럼 pending resize를 flush한 뒤 최신 dimensions로 다시 맞춘다.
            lastPtySizeRef.current = null
            pendingViewportRefreshWritesRef.current = 4
            requestAnimationFrame(() => {
                requestResize({
                    immediate: true,
                    flush: true,
                    focus: true
                })
                requestAnimationFrame(() => {
                    forceViewportRefresh()
                    if (wasNearBottomBeforeHideRef.current) {
                        xtermRef.current?.scrollToBottom()
                    }
                })
            })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, id])

    // fontSize/fontFamily 변경 시 터미널 재생성 없이 동적으로 업데이트
    // IMPORTANT: visible은 의존성에서 제거 - visible 변경 시에는 visibility useEffect에서 처리함
    // visible을 의존성에 넣으면 세션 전환 시 불필요한 resize가 먼저 실행될 수 있음
    useEffect(() => {
        if (xtermRef.current && fitAddonRef.current && isInitializedRef.current) {
            xtermRef.current.options.fontSize = fontSize
            // fontFamily 동적 업데이트 (빈 문자열이면 기본 폰트 사용)
            xtermRef.current.options.fontFamily = effectiveFontFamily
            // visible 상태일 때만 fit 호출 (display:none 상태에서는 크기 계산이 잘못됨)
            // 비활성 터미널은 visible이 true가 될 때 visibility useEffect에서 fit 호출됨
            if (visible) {
                requestResize({ immediate: true })
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fontSize, fontFamily, id])  // visible 제거! effectiveFontFamily는 fontFamily에서 파생됨

    useEffect(() => {
        if (!terminalRef.current) return

        const term = new Terminal({
            theme: {
                background: '#0f0f1200', // Transparent
                foreground: '#e0e0e0',
                cursor: '#ffffff',
                selectionBackground: 'rgba(255, 255, 255, 0.3)'
            },
            fontFamily: effectiveFontFamily,
            fontSize,
            allowProposedApi: true,
            cursorBlink: true,
            scrollback: 10000  // 기본값 1000 → 10000 (더 많은 히스토리 보관)
        } as any)

        // VS Code also enables this to handle full-screen erase/redraw sequences more predictably.
        ;(term.options as typeof term.options & { scrollOnEraseInDisplay?: boolean }).scrollOnEraseInDisplay = true

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        // URL links addon (http://, https://, localhost, etc.)
        const webLinksAddon = new WebLinksAddon((_event, uri) => {
            console.log('[WebLinks] Clicked:', uri)
            window.open(uri, '_blank')
        })
        term.loadAddon(webLinksAddon)

        term.open(terminalRef.current)

        xtermRef.current = term
        fitAddonRef.current = fitAddon
        resizeManagerRef.current = new TerminalResizeManager(
            () => visibleRef.current,
            () => xtermRef.current?.buffer.normal.length ?? 0,
            (cols, rows) => applyTerminalDimensions({ cols, rows }),
            (cols) => applyTerminalDimensions({ cols, rows: xtermRef.current?.rows ?? term.rows }),
            (rows) => applyTerminalDimensions({ cols: xtermRef.current?.cols ?? term.cols, rows })
        )

        // Register file path link provider (Cmd+Click to open in editor)
        registerFilePathLinks(term, cwd)

        // Context menu handler for right-click on selected text
        const contextMenuHandler = (e: MouseEvent) => {
            const selection = term.getSelection()?.trim()

            if (!selection) {
                return // No selection, let default context menu show
            }

            e.preventDefault()
            e.stopPropagation()

            setContextMenu({
                visible: true,
                x: e.clientX,
                y: e.clientY,
                selectedText: selection
            })
        }

        // Use capture phase to catch event before xterm.js handles it
        terminalRef.current?.addEventListener('contextmenu', contextMenuHandler, { capture: true })

        // Initialize backend terminal
        let initialCols = 80
        let initialRows = 30

        if (visible) {
            try {
                const proposed = fitAddon.proposeDimensions()
                if (proposed) {
                    initialCols = proposed.cols
                    initialRows = proposed.rows
                    term.resize(proposed.cols, proposed.rows)
                }
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


            // Handle scroll events (스크롤 중에는 ResizeObserver 무시)
            let scrollTimeout: NodeJS.Timeout | null = null
            term.onScroll(() => {
                isScrollingRef.current = true

                // 스크롤 멈춘 지 200ms 후에 "스크롤 끝"으로 표시
                if (scrollTimeout) clearTimeout(scrollTimeout)
                scrollTimeout = setTimeout(() => {
                    isScrollingRef.current = false
                }, 200)
            })

            // Handle output
            const cleanup = window.api.onTerminalData(id, (data) => {
                const shouldRefreshViewport = VIEWPORT_REFRESH_ANSI_REGEX.test(data)
                term.write(data, () => {
                    if (!visibleRef.current) return

                    if (pendingViewportRefreshWritesRef.current > 0) {
                        pendingViewportRefreshWritesRef.current--
                        forceViewportRefresh(term)
                        return
                    }

                    if (shouldRefreshViewport) {
                        forceViewportRefresh(term)
                    }
                })

                try {
                    detectOutput(data)
                } catch (e) {
                    console.error('Failed to detect terminal notification', e)
                }
            })

            // Execute initial/resume command if provided (only once)
            if (!initialCommandExecutedRef.current) {
                if (resumeCommand) {
                    // Resume a previous CLI session (takes priority over initialCommand)
                    initialCommandExecutedRef.current = true
                    setTimeout(() => {
                        window.api.writeTerminal(id, resumeCommand + '\n')
                    }, 500)
                } else if (initialCommand) {
                    initialCommandExecutedRef.current = true
                    // Try to rewrite CLI tool commands to inject --session-id
                    setTimeout(async () => {
                        const rewritten = await window.api.rewriteCliCommand(initialCommand)
                        if (rewritten && workspaceId) {
                            // Store CLI session info and send rewritten command
                            window.api.updateSessionCliInfo(workspaceId, id, rewritten.cliSessionId, rewritten.cliToolName)
                            window.api.writeTerminal(id, rewritten.command + '\n')
                        } else {
                            window.api.writeTerminal(id, initialCommand + '\n')
                        }
                    }, 500)
                }
            }

            // 초기화 완료 표시 - 이후 resize 이벤트는 정상 처리됨
            // 약간의 딜레이를 두어 초기 프롬프트가 완전히 출력된 후에 resize 허용
            setTimeout(() => {
                isInitializedRef.current = true
                // Force resize after initialization to ensure proper display
                // This triggers SIGWINCH in the shell, causing it to redraw
                // Essential for Grid View where PTY already exists but xterm is new
                if (visibleRef.current) {
                    requestResize({ immediate: true })
                }
            }, 300)

            return () => {
                cleanup()
                window.api.writeTerminal(id, 'exit\n') // Try to close gracefully
            }
        })

        // Handle resize with debounce - 창 크기 변경 시 너무 자주 호출되는 것 방지
        // window resize 이벤트는 드래그 중 매 프레임마다 발생하므로 debounce 필수
        const handleResize = () => {
            if (!isInitializedRef.current) return

            const rect = terminalRef.current?.getBoundingClientRect()
            if (!rect) return

            const newWidth = Math.round(rect.width)
            const newHeight = Math.round(rect.height)

            // DEBUG 로그
            console.log(`[Terminal ${id.slice(0, 8)}] handleResize: container=${newWidth}x${newHeight}`)

            if (!lastSizeRef.current) {
                lastSizeRef.current = { width: newWidth, height: newHeight }
                console.log(`[Terminal ${id.slice(0, 8)}] handleResize: initial size set`)
                return
            }

            const widthChanged = Math.abs(newWidth - lastSizeRef.current.width) >= 1
            const heightChanged = Math.abs(newHeight - lastSizeRef.current.height) >= 1

            if (!widthChanged && !heightChanged) {
                console.log(`[Terminal ${id.slice(0, 8)}] handleResize: no change, skipping`)
                return
            }

            console.log(`[Terminal ${id.slice(0, 8)}] handleResize: size changed from ${lastSizeRef.current.width}x${lastSizeRef.current.height}`)
            lastSizeRef.current = { width: newWidth, height: newHeight }

            requestResize()
        }

        window.addEventListener('resize', handleResize)

        // Add ResizeObserver for container size changes (e.g. display: block)
        // IMPORTANT: 스크롤 중 멈춤 현상 방지
        // - 스크롤 중에는 ResizeObserver 무시
        // - 1px 이상 변화만 감지 (불필요한 트리거 방지)
        // - 150ms debounce로 연속 이벤트 병합
        const resizeObserver = new ResizeObserver(() => {
            if (!isInitializedRef.current) return

            // 스크롤 중이면 무시
            if (visibleRef.current && isScrollingRef.current) return

            const rect = terminalRef.current?.getBoundingClientRect()
            if (!rect) return

            const newWidth = Math.round(rect.width)
            const newHeight = Math.round(rect.height)

            // DEBUG 로그
            console.log(`[Terminal ${id.slice(0, 8)}] ResizeObserver: container=${newWidth}x${newHeight}`)

            // 초기값 설정
            if (!lastSizeRef.current) {
                lastSizeRef.current = { width: newWidth, height: newHeight }
                console.log(`[Terminal ${id.slice(0, 8)}] ResizeObserver: initial size set`)
                return
            }

            // 1px 이상 변화만 감지
            const widthChanged = Math.abs(newWidth - lastSizeRef.current.width) >= 1
            const heightChanged = Math.abs(newHeight - lastSizeRef.current.height) >= 1

            if (!widthChanged && !heightChanged) {
                console.log(`[Terminal ${id.slice(0, 8)}] ResizeObserver: no change, skipping`)
                return
            }

            console.log(`[Terminal ${id.slice(0, 8)}] ResizeObserver: size changed from ${lastSizeRef.current.width}x${lastSizeRef.current.height}`)
            lastSizeRef.current = { width: newWidth, height: newHeight }

            requestResize()
        })

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current)
        }

        // Store ref for cleanup
        const terminalElement = terminalRef.current

        return () => {
            window.removeEventListener('resize', handleResize)
            resizeObserver.disconnect()
            terminalElement?.removeEventListener('contextmenu', contextMenuHandler, { capture: true })
            resizeManagerRef.current?.dispose()
            resizeManagerRef.current = null
            term.dispose()
            // 폴링 타이머는 별도 useEffect에서 정리됨
        }
    // fontSize는 별도 useEffect에서 동적으로 처리하므로 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, cwd])

    // Context menu handlers
    const closeContextMenu = useCallback(() => {
        setContextMenu({ visible: false, x: 0, y: 0, selectedText: '' })
    }, [])

    const handleOpenInEditor = useCallback(async () => {
        const text = contextMenu.selectedText
        closeContextMenu()

        // Parse line:column if present (e.g., file.ts:42:10)
        const match = text.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/)
        if (match) {
            const filePath = match[1]
            const line = match[2] ? parseInt(match[2], 10) : undefined
            const column = match[3] ? parseInt(match[3], 10) : undefined
            await window.api.openFileInEditor(filePath, cwd, line, column)
        }
    }, [contextMenu.selectedText, cwd, closeContextMenu])

    const handleRevealInFinder = useCallback(async () => {
        const text = contextMenu.selectedText
        closeContextMenu()

        // Remove line:column suffix if present
        const filePath = text.replace(/:\d+(:\d+)?$/, '')
        await window.api.revealInFinder(filePath, cwd)
    }, [contextMenu.selectedText, cwd, closeContextMenu])

    const handleOpenAsLink = useCallback(async () => {
        let text = contextMenu.selectedText
        closeContextMenu()

        // Add https:// if no protocol
        if (!/^https?:\/\//i.test(text)) {
            text = `https://${text}`
        }
        await window.api.openExternal(text)
    }, [contextMenu.selectedText, closeContextMenu])

    // Close context menu on click outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu.visible) {
                closeContextMenu()
            }
        }

        if (contextMenu.visible) {
            document.addEventListener('click', handleClickOutside)
            document.addEventListener('contextmenu', handleClickOutside)
        }

        return () => {
            document.removeEventListener('click', handleClickOutside)
            document.removeEventListener('contextmenu', handleClickOutside)
        }
    }, [contextMenu.visible, closeContextMenu])


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
                    // Electron 9.0+ requires webUtils.getPathForFile()
                    // file.path is deprecated and removed in newer Electron versions
                    const filePath = window.api.getFilePath(file)
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
            onClick={() => onFocus?.(id)}
            onFocus={() => onFocus?.(id)}
        >
            <div className="w-full h-full" ref={terminalRef} />

            {/* Context Menu - rendered via Portal to avoid transform issues */}
            {contextMenu.visible && createPortal(
                <div
                    className="fixed z-[9999] bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[180px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                        onClick={handleOpenInEditor}
                    >
                        <Code size={14} />
                        Open in Editor
                    </button>
                    <button
                        className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                        onClick={handleRevealInFinder}
                    >
                        <FolderOpen size={14} />
                        Reveal in Finder
                    </button>
                    <button
                        className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                        onClick={handleOpenAsLink}
                    >
                        <ExternalLink size={14} />
                        Open as Link
                    </button>
                </div>,
                document.body
            )}

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
