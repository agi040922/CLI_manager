import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalView } from './components/TerminalView'
import { Workspace, TerminalSession } from '../../shared/types'

function App(): JSX.Element {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([])
    const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
    const [activeSession, setActiveSession] = useState<TerminalSession | null>(null)

    // Load workspaces on mount
    useState(() => {
        window.api.getWorkspaces().then(setWorkspaces)
    })

    const handleSelect = (workspace: Workspace, session: TerminalSession) => {
        setActiveWorkspace(workspace)
        setActiveSession(session)
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
            />
            <div className="flex-1 glass-panel m-2 ml-0 rounded-lg overflow-hidden flex flex-col">
                <div className="h-10 border-b border-white/10 flex items-center px-4 draggable">
                    <span className="text-sm text-gray-400">
                        {activeWorkspace && activeSession
                            ? `${activeWorkspace.name} / ${activeSession.name}`
                            : 'Select a terminal to get started'}
                    </span>
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
            </div>
        </div>
    )
}

export default App
