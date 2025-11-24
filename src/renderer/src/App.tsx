import React, { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalView } from './components/TerminalView'
import { StatusBar } from './components/StatusBar'
import { Settings } from './components/Settings'
import { GitPanel } from './components/GitPanel'
import { Workspace, TerminalSession, NotificationStatus, UserSettings } from '../../shared/types'

function App() {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([])
    const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
    const [activeSession, setActiveSession] = useState<TerminalSession | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [gitPanelOpen, setGitPanelOpen] = useState(false)
    const [sessionNotifications, setSessionNotifications] = useState<Map<string, NotificationStatus>>(new Map())
    const [settings, setSettings] = useState<UserSettings>({
        theme: 'dark',
        fontSize: 14,
        fontFamily: 'Monaco, Courier New, monospace',
        defaultShell: 'zsh',
        defaultEditor: 'vscode',
        portFilter: {
            enabled: true,
            minPort: 3000,
            maxPort: 9000
        }
    })

    // Load workspaces and settings on mount
    useEffect(() => {
        window.api.getWorkspaces().then(setWorkspaces)
        window.api.getSettings().then(loadedSettings => {
            if (loadedSettings) {
                setSettings(loadedSettings)
            }
        }).catch(err => {
            console.error('Failed to load settings:', err)
        })
    }, [])

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

    const handleAddSession = async (workspaceId: string, type: 'regular' | 'worktree' = 'regular', branchName?: string, initialCommand?: string) => {
        const newSession = await window.api.addSession(workspaceId, type, branchName, initialCommand)
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

    const handleOpenInEditor = async (workspacePath: string) => {
        try {
            const result = await window.api.openInEditor(workspacePath)
            if (!result.success) {
                console.error('Failed to open in editor:', result.error)
            }
        } catch (error) {
            console.error('Failed to open in editor:', error)
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
                onOpenInEditor={handleOpenInEditor}
                onOpenSettings={() => setSettingsOpen(true)}
                settingsOpen={settingsOpen}
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
                                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
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
                                    fontSize={settings.fontSize}
                                    fontFamily={settings.fontFamily}
                                    initialCommand={session.initialCommand}
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
                <StatusBar portFilter={settings.portFilter} />
            </div>

            {/* Settings Modal */}
            <Settings
                isOpen={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                onSave={(newSettings) => setSettings(newSettings)}
            />

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
