import React, { useState, useEffect } from 'react'
import { Activity } from 'lucide-react'

interface PortInfo {
    port: number
    pid: number
    command: string
}

export function StatusBar() {
    const [ports, setPorts] = useState<PortInfo[]>([])

    useEffect(() => {
        const cleanup = window.api.onPortUpdate((updatedPorts) => {
            setPorts(updatedPorts)
        })
        return cleanup
    }, [])

    return (
        <div className="h-6 bg-[#1e1e20]/80 border-t border-white/10 flex items-center px-4 text-xs text-gray-400 gap-4 select-none backdrop-blur-md">
            <div className="flex items-center gap-2">
                <Activity size={12} className={ports.length > 0 ? "text-green-400" : "text-gray-500"} />
                <span>{ports.length > 0 ? 'Active Ports:' : 'No Active Ports'}</span>
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
