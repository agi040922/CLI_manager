import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { AlertCircle, CheckCircle, Bell, AlertTriangle } from 'lucide-react'
import { TerminalPatternMatcher, ToolType, NotificationType } from '../utils/terminalPatterns'

interface TerminalViewProps {
    id: string
    cwd: string
    visible: boolean
    onNotification?: (type: NotificationType) => void
    fontSize?: number
    initialCommand?: string
    notificationSettings?: {
        enabled: boolean
        tools: {
            cc: boolean
            codex: boolean
            gemini: boolean
            generic: boolean
        }
    }
}

interface Notification {
    id: string
    type: NotificationType
    message: string
}

// 터미널 폰트 패밀리 (고정값)
const TERMINAL_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace'

export function TerminalView({
    id,
    cwd,
    visible,
    onNotification,
    fontSize = 14,
    initialCommand,
    notificationSettings
}: TerminalViewProps) {
    const terminalRef = useRef<HTMLDivElement>(null)
    const xtermRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const lastNotificationRef = useRef<{ type: string; message: string; time: number } | null>(null)
    const matcherRef = useRef<TerminalPatternMatcher>(new TerminalPatternMatcher())
    // 초기화 직후 불필요한 resize를 방지하기 위한 플래그
    const isInitializedRef = useRef<boolean>(false)

    // Detection patterns - DISABLED: Will be enabled in a future update
    const detectOutput = (_text: string) => {
        // Notification feature is temporarily disabled
        // Will be re-enabled when the pattern matching is improved
        return

        /*
        // Check if notifications are globally enabled
        if (notificationSettings?.enabled === false) return

        const result = matcherRef.current.process(text)
        if (result) {
            const toolKey: ToolType = result.tool ?? 'generic'
            const isEnabled = notificationSettings?.tools?.[toolKey] ?? true

            if (isEnabled) {
                addNotification(result.type, result.message)
            }
        }
        */
    }

    const addNotification = (type: NotificationType, message: string) => {
        // Prevent duplicates: ignore if same type and message within 3 seconds
        const now = Date.now()
        const last = lastNotificationRef.current
        if (last && last.type === type && last.message === message && now - last.time < 3000) {
            return
        }

        // Record last notification
        lastNotificationRef.current = { type, message, time: now }

        const newNotif: Notification = {
            id: `${Date.now()}-${Math.random()}`,
            type,
            message
        }

        setNotifications(prev => [...prev, newNotif])

        // Notify parent component
        onNotification?.(type)

        // info/warning (user intervention needed): 10s, others: 5s auto dismiss
        const dismissTime = (type === 'info' || type === 'warning') ? 10000 : 5000
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== newNotif.id))
        }, dismissTime)
    }

    // Handle visibility changes
    useEffect(() => {
        // 초기화 직후에는 resize 건너뛰기 (createTerminal에서 이미 올바른 크기로 생성됨)
        if (!isInitializedRef.current) return

        if (visible && fitAddonRef.current && xtermRef.current) {
            // Small delay to ensure layout is computed after display: block
            requestAnimationFrame(() => {
                try {
                    fitAddonRef.current?.fit()
                    const { cols, rows } = xtermRef.current!
                    window.api.resizeTerminal(id, cols, rows)
                    // Auto-focus terminal when it becomes visible
                    xtermRef.current?.focus()
                } catch (e) {
                    console.error('Failed to resize terminal:', e)
                }
            })
        }
    }, [visible, id])

    // fontSize 변경 시 터미널 재생성 없이 동적으로 업데이트
    useEffect(() => {
        if (xtermRef.current && fitAddonRef.current) {
            xtermRef.current.options.fontSize = fontSize
            // visible 상태일 때만 fit 호출 (display:none 상태에서는 크기 계산이 잘못됨)
            // 비활성 터미널은 visible이 true가 될 때 visibility useEffect에서 fit 호출됨
            if (visible) {
                requestAnimationFrame(() => {
                    try {
                        fitAddonRef.current?.fit()
                        const { cols, rows } = xtermRef.current!
                        window.api.resizeTerminal(id, cols, rows)
                    } catch (e) {
                        console.error('Failed to resize after font change:', e)
                    }
                })
            }
        }
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

        window.api.createTerminal(id, cwd, initialCols, initialRows).then(() => {
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

            // Execute initial command if provided
            if (initialCommand) {
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

        // Handle resize
        const handleResize = () => {
            try {
                fitAddon.fit()
                if (xtermRef.current) {
                    window.api.resizeTerminal(id, xtermRef.current.cols, xtermRef.current.rows)
                }
            } catch (e) {
                // Ignore resize errors (e.g. when hidden)
            }
        }

        window.addEventListener('resize', handleResize)

        // Add ResizeObserver for container size changes (e.g. display: block)
        const resizeObserver = new ResizeObserver(() => {
            // 초기화 완료 후에만 resize 처리
            if (visible && isInitializedRef.current) {
                // Small delay to ensure layout is computed
                requestAnimationFrame(() => {
                    handleResize()
                })
            }
        })

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current)
        }

        return () => {
            window.removeEventListener('resize', handleResize)
            resizeObserver.disconnect()
            term.dispose()
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

            {/* Notifications */}
            <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
                {notifications.map(notif => (
                    <div
                        key={notif.id}
                        className={`
                            pointer-events-auto
                            flex items-start gap-3 p-4 rounded-lg shadow-2xl
                            backdrop-blur-md border min-w-[300px] max-w-[400px]
                            animate-in slide-in-from-right-5 duration-300
                            ${notif.type === 'error' ? 'bg-red-500/20 border-red-500/30' : ''}
                            ${notif.type === 'success' ? 'bg-green-500/20 border-green-500/30' : ''}
                            ${notif.type === 'warning' ? 'bg-orange-500/20 border-orange-500/30 ring-1 ring-orange-400/30' : ''}
                            ${notif.type === 'info' ? 'bg-amber-500/30 border-amber-500/50 ring-2 ring-amber-400/50 animate-pulse' : ''}
                        `}
                    >
                        {notif.type === 'error' && <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />}
                        {notif.type === 'success' && <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />}
                        {notif.type === 'warning' && <AlertTriangle size={20} className="text-orange-400 shrink-0 mt-0.5" />}
                        {notif.type === 'info' && <Bell size={20} className="text-amber-300 shrink-0 mt-0.5 animate-bounce" />}
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${
                                notif.type === 'error' ? 'text-red-200' :
                                notif.type === 'success' ? 'text-green-200' :
                                notif.type === 'warning' ? 'text-orange-200' :
                                'text-amber-100'
                            }`}>
                                {notif.type === 'error' ? '❌ 오류 발생' :
                                 notif.type === 'success' ? '✅ 완료' :
                                 notif.type === 'warning' ? '⚠️ 주의' :
                                 '🔔 입력 필요'}
                            </p>
                            <p className={`text-xs mt-1 break-words ${
                                notif.type === 'info' ? 'text-amber-100 font-medium' :
                                notif.type === 'warning' ? 'text-orange-100' :
                                'text-gray-300'
                            }`}>
                                {notif.message}
                            </p>
                        </div>
                        <button
                            onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}
