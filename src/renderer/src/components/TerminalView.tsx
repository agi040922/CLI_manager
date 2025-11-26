import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { AlertCircle, CheckCircle, Bell } from 'lucide-react'
import { TerminalPatternMatcher } from '../utils/terminalPatterns'

interface TerminalViewProps {
    id: string
    cwd: string
    visible: boolean
    onNotification?: (type: 'info' | 'error' | 'success') => void
    fontSize?: number
    fontFamily?: string
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
    type: 'error' | 'success' | 'info'
    message: string
}

export function TerminalView({
    id,
    cwd,
    visible,
    onNotification,
    fontSize = 13,
    fontFamily = 'Menlo, Monaco, "Courier New", monospace',
    initialCommand,
    notificationSettings
}: TerminalViewProps) {
    const terminalRef = useRef<HTMLDivElement>(null)
    const xtermRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const outputBufferRef = useRef<string>('')
    const lastNotificationRef = useRef<{ type: string; message: string; time: number } | null>(null)
    const matcherRef = useRef<TerminalPatternMatcher>(new TerminalPatternMatcher())

    // Detection patterns
    const detectOutput = (text: string) => {
        // Check if notifications are globally enabled
        if (notificationSettings?.enabled === false) return

        const result = matcherRef.current.process(text)
        if (result) {
            // Check if specific tool notification is enabled
            // We need to map the tool name from the matcher to the settings key
            // matcher returns 'cc', 'codex', 'gemini', 'generic'
            // settings has keys cc, codex, gemini, generic

            // Extract tool name from message or context if possible, 
            // but TerminalPatternMatcher doesn't return the raw tool key directly in the result.
            // Let's update TerminalPatternMatcher to return the tool key or infer it.
            // Actually, looking at TerminalPatternMatcher, it returns { type, message }.
            // The message usually contains the tool name prefix e.g. "Claude Code: ..."

            let toolKey = 'generic'
            if (result.message.startsWith('Claude Code')) toolKey = 'cc'
            else if (result.message.startsWith('Codex')) toolKey = 'codex'
            else if (result.message.startsWith('Gemini')) toolKey = 'gemini'

            const isEnabled = notificationSettings?.tools?.[toolKey as keyof typeof notificationSettings.tools] ?? true

            if (isEnabled) {
                addNotification(result.type, result.message)
            }
        }
    }

    const addNotification = (type: 'error' | 'success' | 'info', message: string) => {
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

        // info type (user intervention needed): 10s, others: 5s auto dismiss
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
            fontFamily,
            fontSize,
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

            // Execute initial command if provided
            if (initialCommand) {
                // Wait a bit for the terminal to be ready
                setTimeout(() => {
                    window.api.writeTerminal(id, initialCommand + '\n')
                }, 500)
            }

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
    }, [id, cwd, fontSize, fontFamily])

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
                            <p className={`text-sm font-medium ${notif.type === 'error' ? 'text-red-200' :
                                notif.type === 'success' ? 'text-green-200' :
                                    'text-amber-100'
                                }`}>
                                {notif.type === 'error' ? '⚠️ Error Detected' :
                                    notif.type === 'success' ? '✅ Build Complete' :
                                        '🔔 Action Required'}
                            </p>
                            <p className={`text-xs mt-1 truncate max-w-xs ${notif.type === 'info' ? 'text-amber-100 font-medium' : 'text-gray-300'
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
