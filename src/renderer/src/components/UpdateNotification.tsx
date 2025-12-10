import React from 'react'

interface UpdateNotificationProps {
    onInstall?: () => void
    onLater?: () => void
    version?: string
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
    onInstall = () => {},
    onLater = () => {},
    version
}) => {
    return (
        <div className="fixed bottom-4 left-4 z-50 animate-fade-in">
            <div className="bg-[#1e1e1e] border border-white/10 rounded-lg shadow-lg p-2.5 w-[240px] flex flex-col gap-2 backdrop-blur-md bg-opacity-90">
                <div className="flex flex-col gap-0.5 px-0.5">
                    <h3 className="text-sm font-medium text-white">Update Available</h3>
                    {version && <span className="text-xs text-gray-400">v{version}</span>}
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={onLater}
                        className="flex-1 px-2 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Later
                    </button>
                    <button 
                        onClick={onInstall}
                        className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    >
                        Install
                    </button>
                </div>
            </div>
        </div>
    )
}
