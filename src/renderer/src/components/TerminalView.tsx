import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { AlertCircle, CheckCircle, Bell } from 'lucide-react'

interface TerminalViewProps {
    id: string
    cwd: string
    visible: boolean
    onNotification?: (type: 'info' | 'error' | 'success') => void
}

interface Notification {
    id: string
    type: 'error' | 'success' | 'info'
    message: string
}

export function TerminalView({ id, cwd, visible, onNotification }: TerminalViewProps) {
    const terminalRef = useRef<HTMLDivElement>(null)
    const xtermRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const outputBufferRef = useRef<string>('')
    const lastNotificationRef = useRef<{ type: string; message: string; time: number } | null>(null)
    const claudeResponseStartRef = useRef<boolean>(false)  // Claude 응답 시작 추적

    // Detection patterns
    const detectOutput = (text: string) => {
        // Strip ANSI codes for pattern matching
        const cleanText = text.replace(/\x1b\[[0-9;]*m/g, '')

        // Claude Code 응답 시작 감지 (⏺ 기호)
        if (/⏺/.test(cleanText)) {
            claudeResponseStartRef.current = true
            return  // 시작만 감지하고 알림은 안 보냄
        }

        // Claude Code 사용자 개입 필요 패턴 (높은 우선순위)
        const interactionPatterns = [
            /\?$/m,  // 질문 끝에 ? 있는 경우
            /\[Y\/n\]/i,  // Yes/No 선택
            /\[y\/N\]/i,
            /approve|permission|allow|grant/i,  // 허가 요청
            /waiting for|awaiting|pending/i,  // 대기 중
            /continue\?|proceed\?/i,  // 계속 진행 확인
            /press any key|press enter/i,  // 키 입력 대기
            /Enter to select/i,  // 선택 대기
            /Tab\/Arrow keys to navigate/i  // 탐색 대기
        ]

        // Error patterns
        const errorPatterns = [
            /error:/i,
            /failed/i,
            /exception/i,
            /fatal/i,
            /cannot find/i,
            /command not found/i,
            /npm ERR!/i,
            /webpack compilation failed/i,
            /permission denied/i,
            /access denied/i
        ]

        // Success patterns (작업 완료 감지)
        const successPatterns = [
            // 일반 빌드/테스트 완료
            /compiled successfully/i,
            /build successful/i,
            /done in/i,
            /✓|✔/,
            /successfully installed/i,
            /webpack compiled/i,
            /✨|🎉/,  // 이모지로도 성공 표시
            /completed|finished|done/i,  // 작업 완료
            /all tests passed/i,
            /deployment successful/i,
            /success!/i,
            /ready in/i
        ]

        // Claude Code 완료 감지 (⏺ 응답 후 > 프롬프트 나타남)
        if (claudeResponseStartRef.current && /^>\s*$/m.test(cleanText)) {
            claudeResponseStartRef.current = false  // 리셋
            addNotification('success', 'Claude Code 작업 완료')
            return
        }

        let detectedType: 'error' | 'success' | 'info' | null = null
        let detectedMessage = ''

        // 우선순위: 상호작용 > 에러 > 성공
        for (const pattern of interactionPatterns) {
            if (pattern.test(cleanText)) {
                detectedType = 'info'
                const lines = cleanText.split('\n')
                const interactionLine = lines.find(line => pattern.test(line))
                detectedMessage = interactionLine?.trim().slice(0, 100) || 'User input required'
                break
            }
        }

        if (!detectedType) {
            for (const pattern of errorPatterns) {
                if (pattern.test(cleanText)) {
                    detectedType = 'error'
                    const lines = cleanText.split('\n')
                    const errorLine = lines.find(line => pattern.test(line))
                    detectedMessage = errorLine?.trim().slice(0, 100) || 'Error detected'
                    break
                }
            }
        }

        if (!detectedType) {
            for (const pattern of successPatterns) {
                if (pattern.test(cleanText)) {
                    detectedType = 'success'
                    const lines = cleanText.split('\n')
                    const successLine = lines.find(line => pattern.test(line))
                    detectedMessage = successLine?.trim().slice(0, 100) || 'Success'
                    break
                }
            }
        }

        if (detectedType) {
            addNotification(detectedType, detectedMessage)
        }
    }

    const addNotification = (type: 'error' | 'success' | 'info', message: string) => {
        // 중복 방지: 같은 타입과 메시지가 3초 이내에 온 경우 무시
        const now = Date.now()
        const last = lastNotificationRef.current
        if (last && last.type === type && last.message === message && now - last.time < 3000) {
            return
        }

        // 마지막 알림 기록
        lastNotificationRef.current = { type, message, time: now }

        const newNotif: Notification = {
            id: `${Date.now()}-${Math.random()}`,
            type,
            message
        }

        setNotifications(prev => [...prev, newNotif])

        // 부모 컴포넌트에 알림
        onNotification?.(type)

        // info 타입(사용자 개입 필요)은 10초, 나머지는 5초 후 자동 사라짐
        const dismissTime = type === 'info' ? 10000 : 5000
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== newNotif.id))
        }, dismissTime)
    }

    // Handle visibility changes
    useEffect(() => {
        if (visible && fitAddonRef.current && xtermRef.current) {
            // Small delay to ensure layout is computed after display: block
            requestAnimationFrame(() => {
                try {
                    fitAddonRef.current?.fit()
                    const { cols, rows } = xtermRef.current!
                    window.api.resizeTerminal(id, cols, rows)
                } catch (e) {
                    console.error('Failed to resize terminal:', e)
                }
            })
        }
    }, [visible, id])

    useEffect(() => {
        if (!terminalRef.current) return

        const term = new Terminal({
            theme: {
                background: '#0f0f1200', // Transparent
                foreground: '#e0e0e0',
                cursor: '#ffffff',
                selectionBackground: 'rgba(255, 255, 255, 0.3)'
            },
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 13,
            allowProposedApi: true,
            cursorBlink: true
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        term.open(terminalRef.current)

        // Initial fit
        if (visible) {
            fitAddon.fit()
        }

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

                // Accumulate output for detection
                outputBufferRef.current += data

                // Detect patterns when we have a newline (end of a message)
                if (data.includes('\n')) {
                    detectOutput(outputBufferRef.current)
                    // Keep only last 1000 chars to prevent memory issues
                    if (outputBufferRef.current.length > 1000) {
                        outputBufferRef.current = outputBufferRef.current.slice(-1000)
                    }
                }
            })

            // Initial resize is NO LONGER needed here because we passed dimensions to createTerminal
            // window.api.resizeTerminal(id, term.cols, term.rows)

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
            if (visible) {
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
    }, [id, cwd])

    return (
        <div className="w-full h-full relative">
            <div className="w-full h-full" ref={terminalRef} />

            {/* Notifications */}
            <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
                {notifications.map(notif => (
                    <div
                        key={notif.id}
                        className={`
                            pointer-events-auto
                            flex items-start gap-3 p-4 rounded-lg shadow-2xl
                            backdrop-blur-md border
                            animate-in slide-in-from-right-5 duration-300
                            ${notif.type === 'error' ? 'bg-red-500/20 border-red-500/30' : ''}
                            ${notif.type === 'success' ? 'bg-green-500/20 border-green-500/30' : ''}
                            ${notif.type === 'info' ? 'bg-amber-500/30 border-amber-500/50 ring-2 ring-amber-400/50 animate-pulse' : ''}
                        `}
                    >
                        {notif.type === 'error' && <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />}
                        {notif.type === 'success' && <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />}
                        {notif.type === 'info' && <Bell size={20} className="text-amber-300 shrink-0 mt-0.5 animate-bounce" />}
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${
                                notif.type === 'error' ? 'text-red-200' :
                                notif.type === 'success' ? 'text-green-200' :
                                'text-amber-100'
                            }`}>
                                {notif.type === 'error' ? '⚠️ Error Detected' :
                                 notif.type === 'success' ? '✅ Build Complete' :
                                 '🔔 Action Required'}
                            </p>
                            <p className={`text-xs mt-1 truncate max-w-xs ${
                                notif.type === 'info' ? 'text-amber-100 font-medium' : 'text-gray-300'
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
