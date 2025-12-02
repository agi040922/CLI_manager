import React, { useState, useEffect } from 'react'
import { Activity, Filter, Folder, XCircle } from 'lucide-react'
import { PortInfo } from '../../../shared/types'

interface PortFilter {
    enabled: boolean
    minPort: number
    maxPort: number
}

interface StatusBarProps {
    portFilter?: {
        enabled: boolean
        minPort: number
        maxPort: number
    }
    ignoredPorts?: number[]
    ignoredProcesses?: string[]
    onIgnorePort: (port: number) => void
    onIgnoreProcess: (processName: string) => void
    onKillProcess: (pid: number) => void
    onOpenSettings?: () => void
}

export function StatusBar({ 
    portFilter, 
    ignoredPorts = [], 
    ignoredProcesses = [], 
    onIgnorePort, 
    onIgnoreProcess,
    onKillProcess,
    onOpenSettings
}: StatusBarProps) {
    const [ports, setPorts] = useState<PortInfo[]>([])
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, port: PortInfo } | null>(null)

    useEffect(() => {
        // Subscribe to port updates
        const unsubscribe = window.api.onPortUpdate((updatedPorts) => {
            setPorts(updatedPorts)
        })

        // Cleanup subscription
        return () => {
            unsubscribe()
        }
    }, [])

    // Close context menu on click outside
    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null)
        window.addEventListener('click', handleClickOutside)
        return () => window.removeEventListener('click', handleClickOutside)
    }, [])

    const handleContextMenu = (e: React.MouseEvent, port: PortInfo) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, port })
    }

    const handleKillProcess = async () => {
        if (contextMenu) {
            onKillProcess(contextMenu.port.pid)
            setContextMenu(null)
        }
    }

    const handleIgnorePort = () => {
        if (contextMenu) {
            onIgnorePort(contextMenu.port.port)
            setContextMenu(null)
        }
    }

    const handleIgnoreProcess = () => {
        if (contextMenu) {
            const processName = getProcessName(contextMenu.port.cwd)
            if (processName) {
                onIgnoreProcess(processName)
            }
            setContextMenu(null)
        }
    }

    const getProcessName = (cwd?: string) => {
        if (!cwd) return ''
        const parts = cwd.split('/')
        return parts[parts.length - 1]
    }

    const filteredPorts = ports.filter(p => {
        // Filter by port range if enabled
        if (portFilter?.enabled) {
            if (p.port < portFilter.minPort || p.port > portFilter.maxPort) {
                return false
            }
        }
        
        // Filter ignored ports
        if (ignoredPorts.includes(p.port)) {
            return false
        }

        // Filter ignored processes
        const processName = getProcessName(p.cwd)
        if (processName && ignoredProcesses.includes(processName)) {
            return false
        }

        return true
    })

    return (
        <div className="h-6 bg-[#1e1e20] border-t border-white/10 flex items-center px-3 text-[10px] select-none relative">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-gray-400">
                    <Activity size={12} className="text-green-400" />
                    <span>Active Ports:</span>
                    {portFilter?.enabled && (
                        <div 
                            onClick={onOpenSettings}
                            className="flex items-center gap-1 text-gray-500 hover:text-blue-400 cursor-pointer transition-colors"
                            title="Click to configure port range"
                        >
                            <Filter size={10} />
                            <span>{portFilter.minPort}-{portFilter.maxPort}</span>
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-3">
                    {filteredPorts.map(p => (
                        <div 
                            key={`${p.port}-${p.pid}`} 
                            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-white/5 cursor-context-menu transition-colors group relative"
                            title={`PID: ${p.pid}\nCommand: ${p.command}\nPath: ${p.cwd || 'Unknown'}`}
                            onContextMenu={(e) => handleContextMenu(e, p)}
                        >
                            <span className="text-blue-300 font-mono font-medium">{p.port}</span>
                            {p.cwd && (
                                <span className="flex items-center gap-1 text-gray-500 group-hover:text-gray-300">
                                    <Folder size={10} />
                                    <span>{getProcessName(p.cwd)}</span>
                                </span>
                            )}
                        </div>
                    ))}
                    {filteredPorts.length === 0 && (
                        <span className="text-gray-600 italic">No active ports detected</span>
                    )}
                </div>
            </div>

            {/* Custom Context Menu */}
            {contextMenu && (
                <div 
                    className="fixed z-50 bg-[#252526] border border-white/10 rounded shadow-xl py-1 min-w-[160px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-white/5 mb-1">
                        Port {contextMenu.port.port} ({getProcessName(contextMenu.port.cwd)})
                    </div>
                    <button 
                        onClick={handleKillProcess}
                        className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-white/5 flex items-center gap-2"
                    >
                        <XCircle size={12} />
                        Kill Process
                    </button>
                    <button 
                        onClick={handleIgnorePort}
                        className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-white/5 flex items-center gap-2"
                    >
                        <Filter size={12} />
                        Ignore Port {contextMenu.port.port}
                    </button>
                    {contextMenu.port.cwd && (
                        <button 
                            onClick={handleIgnoreProcess}
                            className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-white/5 flex items-center gap-2"
                        >
                            <Folder size={12} />
                            Ignore '{getProcessName(contextMenu.port.cwd)}'
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
