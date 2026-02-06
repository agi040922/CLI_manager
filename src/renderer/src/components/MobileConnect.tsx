// Mobile Connection UI - Shows device ID, PIN generation, and connection status
// Displayed as a popover from the Smartphone icon in the Sidebar header

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Smartphone, Copy, RefreshCw, X, Wifi, WifiOff, Loader2 } from 'lucide-react'

type RemoteConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface RemoteState {
    status: RemoteConnectionStatus
    deviceId: string | null
    deviceName: string
    connectedMobiles: Array<{
        mobileId: string
        connectedAt: number
        lastActivity: number
    }>
    activeSessions: Array<{
        id: string
        mobileId: string
        workspaceId: string
        workspaceName: string
        createdAt: number
    }>
}

interface MobileConnectProps {
    className?: string
}

export function MobileConnectButton({ className }: MobileConnectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [state, setState] = useState<RemoteState | null>(null)
    const [pin, setPin] = useState<string | null>(null)
    const [pinExpiresAt, setPinExpiresAt] = useState<number | null>(null)
    const [pinLoading, setPinLoading] = useState(false)
    const [copied, setCopied] = useState(false)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)
    const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })

    // Load initial state
    useEffect(() => {
        window.api.mobileGetState().then(setState)
    }, [])

    // Listen for status updates from main process
    useEffect(() => {
        const cleanup = window.api.onRemoteStatus((newState: RemoteState) => {
            setState(newState)
        })
        return cleanup
    }, [])

    // Close popover on outside click
    useEffect(() => {
        if (!isOpen) return
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node
            const clickedInPopover = popoverRef.current?.contains(target)
            const clickedOnButton = buttonRef.current?.contains(target)
            if (!clickedInPopover && !clickedOnButton) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [isOpen])

    // Calculate popover position from button rect
    useEffect(() => {
        if (!isOpen || !buttonRef.current) return
        const rect = buttonRef.current.getBoundingClientRect()
        setPopoverPos({
            top: rect.bottom + 4,
            left: Math.max(8, rect.left)
        })
    }, [isOpen])

    // PIN expiry countdown
    useEffect(() => {
        if (!pinExpiresAt) return
        const interval = setInterval(() => {
            if (Date.now() > pinExpiresAt) {
                setPin(null)
                setPinExpiresAt(null)
            }
        }, 1000)
        return () => clearInterval(interval)
    }, [pinExpiresAt])

    const handleGeneratePin = useCallback(async () => {
        setPinLoading(true)
        try {
            // Auto-connect if not connected
            if (!state || state.status === 'disconnected') {
                await window.api.mobileConnect()
            }
            const result = await window.api.mobileCreatePin()
            if (result) {
                setPin(result.pin)
                setPinExpiresAt(result.expiresAt)
            }
        } finally {
            setPinLoading(false)
        }
    }, [state])

    const handleDisconnect = useCallback(async () => {
        await window.api.mobileDisconnect()
        setPin(null)
        setPinExpiresAt(null)
    }, [])

    const handleCopyDeviceId = useCallback(() => {
        if (state?.deviceId) {
            navigator.clipboard.writeText(state.deviceId)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }, [state?.deviceId])

    const status = state?.status || 'disconnected'
    const mobileCount = state?.connectedMobiles?.length || 0

    // Status indicator color
    const statusColor = {
        disconnected: 'text-gray-500',
        connecting: 'text-yellow-400',
        connected: mobileCount > 0 ? 'text-green-400' : 'text-blue-400',
        error: 'text-red-400',
    }[status]

    const remainingSeconds = pinExpiresAt ? Math.max(0, Math.floor((pinExpiresAt - Date.now()) / 1000)) : 0

    return (
        <>
            {/* Trigger button */}
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`p-1 hover:bg-white/10 rounded transition-colors relative ${className || ''}`}
                title="Mobile Connection"
            >
                <Smartphone size={14} className={statusColor} />
                {/* Badge: connected mobile count */}
                {mobileCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                        {mobileCount}
                    </span>
                )}
            </button>

            {/* Popover - rendered via portal to escape overflow:hidden */}
            {isOpen && createPortal(
                <div
                    ref={popoverRef}
                    className="fixed w-64 bg-gray-800/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl z-[9999] overflow-hidden"
                    style={{ top: popoverPos.top, left: popoverPos.left }}
                >
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-300">Mobile Connection</span>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-0.5 hover:bg-white/10 rounded transition-colors"
                        >
                            <X size={12} className="text-gray-500" />
                        </button>
                    </div>

                    <div className="p-3 space-y-3">
                        {/* Connection Status */}
                        <div className="flex items-center gap-2">
                            {status === 'connected' ? (
                                <Wifi size={14} className="text-green-400" />
                            ) : status === 'connecting' ? (
                                <Loader2 size={14} className="text-yellow-400 animate-spin" />
                            ) : (
                                <WifiOff size={14} className="text-gray-500" />
                            )}
                            <span className="text-xs text-gray-400">
                                {status === 'connected'
                                    ? `Connected${mobileCount > 0 ? ` (${mobileCount} mobile${mobileCount > 1 ? 's' : ''})` : ''}`
                                    : status === 'connecting'
                                        ? 'Connecting...'
                                        : status === 'error'
                                            ? 'Connection error'
                                            : 'Not connected'}
                            </span>
                        </div>

                        {/* Device ID */}
                        {state?.deviceId && (
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Device ID</label>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <code className="text-xs text-blue-300 font-mono bg-white/5 px-2 py-1 rounded flex-1 truncate">
                                        {state.deviceId}
                                    </code>
                                    <button
                                        onClick={handleCopyDeviceId}
                                        className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                        title="Copy Device ID"
                                    >
                                        <Copy size={12} className={copied ? 'text-green-400' : 'text-gray-400'} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* PIN Section */}
                        {pin && remainingSeconds > 0 ? (
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Connection PIN</label>
                                <div className="mt-1 bg-white/5 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-mono font-bold text-white tracking-[0.3em]">
                                        {pin.slice(0, 3)} {pin.slice(3)}
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-1">
                                        Expires in {Math.floor(remainingSeconds / 60)}:{(remainingSeconds % 60).toString().padStart(2, '0')}
                                    </div>
                                </div>
                                <button
                                    onClick={handleGeneratePin}
                                    disabled={pinLoading}
                                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                                >
                                    <RefreshCw size={11} className={pinLoading ? 'animate-spin' : ''} />
                                    New PIN
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleGeneratePin}
                                disabled={pinLoading}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-xs text-blue-300 transition-colors disabled:opacity-50"
                            >
                                {pinLoading ? (
                                    <Loader2 size={12} className="animate-spin" />
                                ) : (
                                    <Smartphone size={12} />
                                )}
                                Generate Connection PIN
                            </button>
                        )}

                        {/* Tip */}
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded">
                            <p className="text-xs text-blue-200">
                                <strong>Tip:</strong> Open the mobile web app and enter your Device ID + PIN to connect.
                            </p>
                        </div>

                        {/* Disconnect button */}
                        {status === 'connected' && (
                            <button
                                onClick={handleDisconnect}
                                className="w-full px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                            >
                                Disconnect
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
