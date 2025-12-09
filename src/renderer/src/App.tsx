import React, { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar/index'
import { TerminalView } from './components/TerminalView'
import { StatusBar } from './components/StatusBar'
import { Settings } from './components/Settings'
import { GitPanel } from './components/GitPanel'
import { ConfirmationModal } from './components/Sidebar/Modals'
import { Workspace, TerminalSession, NotificationStatus, UserSettings, IPCResult, EditorType, TerminalTemplate, PortActionLog } from '../../shared/types'
import { getErrorMessage } from './utils/errorMessages'
import { PanelLeft } from 'lucide-react'
import { Onboarding } from './components/Onboarding'

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
        },
        notifications: {
            enabled: false,  // 기본값을 false로 설정 (알림 끄기)
            tools: {
                cc: true,
                codex: true,
                gemini: true,
                generic: true
            }
        }
    })
    const [confirmationModal, setConfirmationModal] = useState<{
        isOpen: boolean
        title: string
        message: string
        onConfirm: () => void
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { }
    })

    // Sidebar state
    const [sidebarWidth, setSidebarWidth] = useState(256)
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)

    // Onboarding state
    const [showOnboarding, setShowOnboarding] = useState(false)

    // 터미널 폰트 크기 (settings.fontSize와 별도 관리 - Cmd+/-로만 조절)
    const [terminalFontSize, setTerminalFontSize] = useState(14)

    // 터미널 폰트 크기 조정 상수
    const MIN_FONT_SIZE = 8
    const MAX_FONT_SIZE = 32
    const FONT_SIZE_STEP = 1

    // Load workspaces and settings on mount
    useEffect(() => {
        window.api.getWorkspaces().then(setWorkspaces)
        window.api.getSettings().then(loadedSettings => {
            if (loadedSettings) {
                setSettings(loadedSettings)
                if (!loadedSettings.hasCompletedOnboarding) {
                    setShowOnboarding(true)
                }
            }
        }).catch(err => {
            console.error('Failed to load settings:', err)
        })
    }, [])

    // Cmd+/- 터미널 폰트 크기 조정 (Main process에서 IPC로 전달받음)
    // settings.fontSize는 UI용이므로 별도의 terminalFontSize 상태를 조절
    useEffect(() => {
        const cleanup = window.api.onTerminalZoom((key: string) => {
            // Cmd/Ctrl + = 또는 + (확대)
            if (key === '=' || key === '+') {
                setTerminalFontSize(prev => Math.min(prev + FONT_SIZE_STEP, MAX_FONT_SIZE))
            }
            // Cmd/Ctrl + - (축소)
            else if (key === '-') {
                setTerminalFontSize(prev => Math.max(prev - FONT_SIZE_STEP, MIN_FONT_SIZE))
            }
            // Cmd/Ctrl + 0 (기본 크기로 리셋)
            else if (key === '0') {
                setTerminalFontSize(14)  // 기본 폰트 크기
            }
        })

        return cleanup
    }, [])

    const handleOnboardingComplete = () => {
        setShowOnboarding(false)
        setSettings(prev => ({ ...prev, hasCompletedOnboarding: true }))
    }

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

    const handleNotification = (sessionId: string, type: 'info' | 'error' | 'success' | 'warning') => {
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
        setConfirmationModal({
            isOpen: true,
            title: 'Delete Workspace',
            message: 'Are you sure you want to delete this workspace? This action cannot be undone.',
            onConfirm: async () => {
                await window.api.removeWorkspace(id)
                setWorkspaces(prev => prev.filter(w => w.id !== id))
                if (activeWorkspace?.id === id) {
                    setActiveWorkspace(null)
                    setActiveSession(null)
                }
            }
        })
    }

    const handleRenameSession = async (workspaceId: string, sessionId: string, newName: string) => {
        const success = await window.api.renameSession(workspaceId, sessionId, newName)
        if (success) {
            setWorkspaces(prev => prev.map(w => {
                if (w.id === workspaceId) {
                    return {
                        ...w,
                        sessions: w.sessions.map(s =>
                            s.id === sessionId ? { ...s, name: newName } : s
                        )
                    }
                }
                return w
            }))
        }
    }

    // 세션 순서 변경 핸들러
    const handleReorderSessions = async (workspaceId: string, sessions: TerminalSession[]) => {
        // 1. UI 즉시 업데이트 (반응성 향상)
        setWorkspaces(prev => prev.map(w => {
            if (w.id === workspaceId) {
                return { ...w, sessions }
            }
            return w
        }))

        // 2. 서버에 순서 저장
        const sessionIds = sessions.map(s => s.id)
        await window.api.reorderSessions(workspaceId, sessionIds)
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

    const handleAddWorktreeWorkspace = async (parentWorkspaceId: string, branchName: string) => {
        const result: IPCResult<Workspace> = await window.api.addWorktreeWorkspace(parentWorkspaceId, branchName)

        if (result.success && result.data) {
            setWorkspaces(prev => [...prev, result.data!])
        } else {
            alert(getErrorMessage(result.errorType, result.error))
        }
    }

    const handleRemoveSession = async (workspaceId: string, sessionId: string) => {
        // Kill the terminal process
        await window.api.killTerminal(sessionId)

        // Remove from store
        await window.api.removeSession(workspaceId, sessionId)

        // Update UI
        setWorkspaces(prev => prev.map(w => {
            if (w.id === workspaceId) {
                return { ...w, sessions: w.sessions.filter(s => s.id !== sessionId) }
            }
            return w
        }))

        // Clear active session if it's the one being removed
        if (activeSession?.id === sessionId) {
            setActiveSession(null)
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

    const [settingsCategory, setSettingsCategory] = useState<any>('general')

    const logPortAction = async (action: 'kill' | 'ignore-port' | 'ignore-process', target: string, port?: number, details?: string) => {
        const newLog: PortActionLog = {
            timestamp: Date.now(),
            action,
            target,
            port,
            details
        }
        
        const newSettings = {
            ...settings,
            portActionLogs: [...(settings.portActionLogs || []), newLog]
        }
        
        // We need to update settings state immediately to reflect changes in UI if needed,
        // but for logs we might want to be careful about state updates if they happen frequently.
        // However, these actions are user-triggered and infrequent enough.
        setSettings(newSettings)
        await window.api.saveSettings(newSettings)
        return newSettings
    }

    const handleIgnorePort = async (port: number) => {
        const newSettings = await logPortAction('ignore-port', port.toString(), port)

        const updatedSettings = {
            ...newSettings,
            ignoredPorts: [...(newSettings.ignoredPorts || []), port]
        }
        setSettings(updatedSettings)
        await window.api.saveSettings(updatedSettings)
    }

    const handleIgnoreProcess = async (processName: string, port: number) => {
        const newSettings = await logPortAction('ignore-process', processName, port)

        const updatedSettings = {
            ...newSettings,
            ignoredProcesses: [...(newSettings.ignoredProcesses || []), processName]
        }
        setSettings(updatedSettings)
        await window.api.saveSettings(updatedSettings)
    }

    const handleKillProcess = async (pid: number, port: number) => {
        await window.api.killProcess(pid)
        await logPortAction('kill', pid.toString(), port, 'Process terminated by user')
    }

    const handleSaveSettings = async (newSettings: UserSettings) => {
        setSettings(newSettings)
        await window.api.saveSettings(newSettings)
    }

    const handleOpenSettings = (category: 'general' | 'port-monitoring') => {
        setSettingsCategory(category)
        setSettingsOpen(true)
    }

    return (
        <div className="flex h-screen w-screen bg-transparent">
            {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
            
            {isSidebarOpen && (
                <Sidebar
                    workspaces={workspaces}
                    onSelect={handleSelect}
                    onAddWorkspace={handleAddWorkspace}
                    onRemoveWorkspace={handleRemoveWorkspace}
                    onAddSession={handleAddSession}
                    onAddWorktreeWorkspace={handleAddWorktreeWorkspace}
                    onRemoveSession={handleRemoveSession}
                    onCreatePlayground={handleCreatePlayground}
                    activeSessionId={activeSession?.id}
                    sessionNotifications={sessionNotifications}
                    onOpenInEditor={handleOpenInEditor}
                    onOpenSettings={() => handleOpenSettings('general')}
                    settingsOpen={settingsOpen}
                    onRenameSession={handleRenameSession}
                    onReorderSessions={handleReorderSessions}
                    width={sidebarWidth}
                    setWidth={setSidebarWidth}
                    onClose={() => setIsSidebarOpen(false)}
                    fontSize={settings.fontSize}
                />
            )}
            <div className="flex-1 glass-panel m-2 ml-0 rounded-lg overflow-hidden flex flex-col">
                <div className="h-10 border-b border-white/10 flex items-center px-4 draggable justify-between">
                    <div className="flex items-center gap-2">
                        {!isSidebarOpen && (
                            <button
                                onClick={() => setIsSidebarOpen(true)}
                                className="p-1.5 hover:bg-white/10 rounded transition-colors no-drag text-gray-400"
                                title="Open Sidebar"
                            >
                                <PanelLeft size={16} />
                            </button>
                        )}
                        <span
                            className="text-gray-400"
                            style={{ fontSize: `${settings.fontSize}px` }}
                        >
                            {activeWorkspace ? activeWorkspace.name : 'Select a workspace to get started'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 no-drag">
                        <button
                            onClick={() => setGitPanelOpen(true)}
                            className="p-2 hover:bg-white/10 rounded transition-colors no-drag"
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
                            onClick={() => handleOpenSettings('general')}
                            className="p-2 hover:bg-white/10 rounded transition-colors no-drag"
                            title="Settings"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="flex-1 p-4 relative overflow-hidden min-h-0">
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
                                    fontSize={terminalFontSize}
                                    initialCommand={session.initialCommand}
                                    notificationSettings={settings.notifications}
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
                <StatusBar 
                    portFilter={settings.portFilter} 
                    ignoredPorts={settings.ignoredPorts}
                    ignoredProcesses={settings.ignoredProcesses}
                    onIgnorePort={handleIgnorePort}
                    onIgnoreProcess={handleIgnoreProcess}
                    onKillProcess={handleKillProcess}
                    onOpenSettings={() => handleOpenSettings('port-monitoring')}
                />
            </div>

            {/* Settings Modal */}
            <Settings
                isOpen={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                onSave={handleSaveSettings}
                initialCategory={settingsCategory}
                onResetOnboarding={() => {
                    setShowOnboarding(true)
                    setSettings(prev => ({ ...prev, hasCompletedOnboarding: false }))
                }}
            />

            {/* Git Panel */}
            <GitPanel
                workspacePath={activeWorkspace?.path}
                isOpen={gitPanelOpen}
                onClose={() => setGitPanelOpen(false)}
            />

            {/* Confirmation Modal */}
            {confirmationModal.isOpen && (
                <ConfirmationModal
                    title={confirmationModal.title}
                    message={confirmationModal.message}
                    onConfirm={() => {
                        confirmationModal.onConfirm()
                        setConfirmationModal(prev => ({ ...prev, isOpen: false }))
                    }}
                    onCancel={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
                    isDangerous={true}
                    confirmText="Delete"
                />
            )}
        </div>
    )
}

export default App
