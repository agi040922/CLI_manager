import React, { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalView } from './components/TerminalView'
import { StatusBar } from './components/StatusBar'
import { Settings } from './components/Settings'
import { GitPanel } from './components/GitPanel'
import { Workspace, TerminalSession, NotificationStatus } from '../../shared/types'

function App() {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([])
    const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
    const [activeSession, setActiveSession] = useState<TerminalSession | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [gitPanelOpen, setGitPanelOpen] = useState(false)
    const [sessionNotifications, setSessionNotifications] = useState<Map<string, NotificationStatus>>(new Map())

    // Load workspaces on mount
    useState(() => {
        window.api.getWorkspaces().then(setWorkspaces)
    })

    const handleSelect = (workspace: Workspace, session: TerminalSession) => {
        setActiveWorkspace(workspace)
        setActiveSession(session)
        // 세션 선택 시 알림 초기화
        setSessionNotifications(prev => {
            const next = new Map(prev)
            next.set(session.id, 'none')
            return next
        })
    }

    const handleNotification = (sessionId: string, type: 'info' | 'error' | 'success') => {
        // 현재 활성 세션이 아닐 때만 알림 표시
        if (activeSession?.id !== sessionId) {
            setSessionNotifications(prev => {
                const next = new Map(prev)
                next.set(sessionId, type)
                return next
            })
        }
    }

    const handleAddWorkspace = async () => {
        const newWorkspace = await window.api.addWorkspace()
        if (newWorkspace) {
            setWorkspaces(prev => [...prev, newWorkspace])
        }
    }

    const handleRemoveWorkspace = async (id: string) => {
        await window.api.removeWorkspace(id)
        setWorkspaces(prev => prev.filter(w => w.id !== id))
        if (activeWorkspace?.id === id) {
            setActiveWorkspace(null)
            setActiveSession(null)
        }
    }

    const handleAddSession = async (workspaceId: string, type: 'regular' | 'worktree' = 'regular', branchName?: string) => {
        const newSession = await window.api.addSession(workspaceId, type, branchName)
        if (newSession) {
            setWorkspaces(prev => prev.map(w => {
                if (w.id === workspaceId) {
                    return { ...w, sessions: [...w.sessions, newSession] }
                }
                return w
            }))
        }
    }

    const handleCreatePlayground = async () => {
        const newWorkspace = await window.api.createPlayground()
        if (newWorkspace) {
            setWorkspaces(prev => [...prev, newWorkspace])
        }
    }

    return (
        <div className="flex h-screen w-screen bg-transparent">
            <Sidebar
                workspaces={workspaces}
                onSelect={handleSelect}
                onAddWorkspace={handleAddWorkspace}
                onRemoveWorkspace={handleRemoveWorkspace}
                onAddSession={handleAddSession}
                onCreatePlayground={handleCreatePlayground}
                activeSessionId={activeSession?.id}
                sessionNotifications={sessionNotifications}
            />
            <div className="flex-1 glass-panel m-2 ml-0 rounded-lg overflow-hidden flex flex-col">
                <div className="h-10 border-b border-white/10 flex items-center px-4 draggable justify-between">
                    <span className="text-sm text-gray-400">
                        {activeWorkspace ? activeWorkspace.name : 'Select a workspace to get started'}
                    </span>
                    <div className="flex items-center gap-2 no-drag">
                        <button
                            onClick={() => setGitPanelOpen(true)}
                            className="p-1.5 hover:bg-white/10 rounded transition-colors"
                            title="Source Control"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                <line x1="6" y1="3" x2="6" y2="15"></line>
                                <circle cx="18" cy="6" r="3"></circle>
                                <circle cx="6" cy="18" r="3"></circle>
                                <path d="M18 9a9 9 0 0 1-9 9"></path>
                            </svg>
                        </button>
                        <button
                            onClick={() => setSettingsOpen(true)}
                            className="p-1.5 hover:bg-white/10 rounded transition-colors"
                            title="Settings"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M12 1v6m0 6v6m-9-9h6m6 0h6m-3.5-8.5 4.5 4.5m-9 9 4.5 4.5m-.5-18.5-4.5 4.5m9 9-4.5 4.5"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="flex-1 p-4 relative">
                    {/* Render ALL sessions but hide inactive ones to keep them alive */}
                    {workspaces.map(workspace => (
                        workspace.sessions?.map(session => (
                            <div
                                key={session.id}
                                style={{
                                    display: activeSession?.id === session.id ? 'block' : 'none',
                                    height: '100%',
                                    width: '100%'
                                }}
                            >
                                <TerminalView
                                    id={session.id}
                                    cwd={session.cwd}
                                    visible={activeSession?.id === session.id}
                                    onNotification={(type) => handleNotification(session.id, type)}
                                />
                            </div>
                        ))
                    ))}

                    {!activeSession && (
                        <div className="h-full flex items-center justify-center text-gray-500">
                            No active terminal
                        </div>
                    )}
                </div>
                <StatusBar />
            </div>

            {/* Settings Modal */}
            <Settings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

            {/* Git Panel */}
            <GitPanel
                workspacePath={activeWorkspace?.path}
                isOpen={gitPanelOpen}
                onClose={() => setGitPanelOpen(false)}
            />
        </div>
    )
}

export default App
