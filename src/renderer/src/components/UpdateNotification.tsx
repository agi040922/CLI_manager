import React from 'react'
import { Download, Loader2 } from 'lucide-react'

// Update status: 'available' | 'downloading' | 'ready'
export type UpdateStatus = 'available' | 'downloading' | 'ready'

interface UpdateNotificationProps {
    status: UpdateStatus
    version?: string
    percent?: number
    onDownload?: () => void
    onInstall?: () => void
    onLater?: () => void
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
    status,
    version,
    percent = 0,
    onDownload = () => {},
    onInstall = () => {},
    onLater = () => {}
}) => {
    return (
        <div className="fixed bottom-4 left-4 z-50 animate-fade-in">
            <div className="bg-[#1e1e1e] border border-white/10 rounded-lg shadow-lg p-2.5 w-[240px] flex flex-col gap-2 backdrop-blur-md bg-opacity-90">
                <div className="flex flex-col gap-0.5 px-0.5">
                    <h3 className="text-sm font-medium text-white">
                        {status === 'ready' ? 'Update Ready' : 'Update Available'}
                    </h3>
                    {version && <span className="text-xs text-gray-400">v{version}</span>}
                </div>

                {/* Download Progress */}
                {status === 'downloading' && (
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-blue-400">
                            <Loader2 size={12} className="animate-spin" />
                            <span>Downloading... {percent}%</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${percent}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Buttons */}
                {status !== 'downloading' && (
                    <div className="flex gap-2">
                        <button
                            onClick={onLater}
                            className="flex-1 px-2 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            Later
                        </button>

                        {status === 'available' && (
                            <button
                                onClick={onDownload}
                                className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center justify-center gap-1"
                            >
                                <Download size={12} />
                                Download
                            </button>
                        )}

                        {status === 'ready' && (
                            <button
                                onClick={onInstall}
                                className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors"
                            >
                                Install
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
