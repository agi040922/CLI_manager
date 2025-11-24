import React, { useState, useEffect } from 'react'
import { Activity, Filter } from 'lucide-react'

interface PortInfo {
    port: number
    pid: number
    command: string
}

interface PortFilter {
    enabled: boolean
    minPort: number
    maxPort: number
}

interface StatusBarProps {
    portFilter?: PortFilter
}

export function StatusBar({ portFilter }: StatusBarProps) {
    const [allPorts, setAllPorts] = useState<PortInfo[]>([])

    useEffect(() => {
        const cleanup = window.api.onPortUpdate((updatedPorts) => {
            setAllPorts(updatedPorts)
        })
        return cleanup
    }, [])

    // Filter ports based on settings
    const ports = portFilter?.enabled
        ? allPorts.filter(p => p.port >= portFilter.minPort && p.port <= portFilter.maxPort)
        : allPorts

    return (
        <div className="h-6 bg-[#1e1e20]/80 border-t border-white/10 flex items-center px-4 text-xs text-gray-400 gap-4 select-none backdrop-blur-md">
            <div className="flex items-center gap-2">
                <Activity size={12} className={ports.length > 0 ? "text-green-400" : "text-gray-500"} />
                <span>{ports.length > 0 ? 'Active Ports:' : 'No Active Ports'}</span>
                {portFilter?.enabled && (
                    <div className="flex items-center gap-1 text-xs text-gray-500" title={`Filtering ports ${portFilter.minPort}-${portFilter.maxPort}`}>
                        <Filter size={10} />
                        <span>{portFilter.minPort}-{portFilter.maxPort}</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
                {ports.map(p => (
                    <div key={`${p.port}-${p.pid}`} className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded hover:bg-white/10 transition-colors cursor-default" title={`PID: ${p.pid}`}>
                        <span className="text-blue-300 font-mono">{p.port}</span>
                        <span className="text-gray-500">({p.command})</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
