import { useState, useEffect } from 'react'
import { Workspace, TerminalSession } from '../../shared/types'
import { Folder, Plus, Terminal, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

interface SidebarProps {
    workspaces: Workspace[]
    onSelect: (workspace: Workspace, session: TerminalSession) => void
    onAddWorkspace: () => void
    onRemoveWorkspace: (id: string) => void
    onAddSession: (workspaceId: string, type: 'regular' | 'worktree', branchName?: string) => void
    onCreatePlayground: () => void
    activeSessionId?: string
}

export function Sidebar({
    workspaces,
    onSelect,
    onAddWorkspace,
    onRemoveWorkspace,
    onAddSession,
    onCreatePlayground,
    activeSessionId
}: SidebarProps): JSX.Element {
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    useEffect(() => {
        // Auto expand new workspaces
        if (workspaces.length > 0) {
            setExpanded(prev => {
                const next = new Set(prev)
                workspaces.forEach(w => next.add(w.id))
                return next
            })
        }
    }, [workspaces.length])

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expanded)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpanded(newExpanded)
    }

    const [menuOpen, setMenuOpen] = useState<{ id: string, x: number, y: number } | null>(null)

    useEffect(() => {
        const handleClickOutside = () => setMenuOpen(null)
        window.addEventListener('click', handleClickOutside)
        return () => window.removeEventListener('click', handleClickOutside)
    }, [])

    const handleAddClick = (e: React.MouseEvent, workspaceId: string) => {
        e.stopPropagation()
        const rect = (e.target as HTMLElement).getBoundingClientRect()
        setMenuOpen({ id: workspaceId, x: rect.right + 10, y: rect.top })
    }

    const handleAddRegular = (workspaceId: string) => {
        onAddSession(workspaceId, 'regular')
        setMenuOpen(null)
    }

    const handleAddWorktree = (workspaceId: string) => {
        const branchName = prompt('Enter new branch name for worktree:')
        if (branchName) {
            onAddSession(workspaceId, 'worktree', branchName)
        }
        setMenuOpen(null)
    }

    return (
        <div className="glass-sidebar h-full w-[250px] flex flex-col text-gray-300 relative">
            {/* Context Menu */}
            {menuOpen && (
                <div
                    className="fixed z-50 bg-[#1e1e20] border border-white/10 rounded shadow-xl py-1 w-40 backdrop-blur-md"
                    style={{ top: menuOpen.y, left: menuOpen.x }}
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                        onClick={() => handleAddRegular(menuOpen.id)}
                    >
                        New Terminal
                    </button>
                    <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-green-500/20 hover:text-green-400 transition-colors"
                        onClick={() => handleAddWorktree(menuOpen.id)}
                    >
                        New Worktree
                    </button>
                </div>
            )}

            <div className="p-4 border-b border-white/10 flex justify-between items-center draggable">
                <span className="font-semibold text-sm tracking-wide">PROJECTS</span>
                <button
                    onClick={onAddWorkspace}
                    className="p-1 hover:bg-white/10 rounded transition-colors no-drag"
                >
                    <Plus size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {workspaces.map(workspace => (
                    <div key={workspace.id} className="mb-2">
                        <div
                            onClick={() => toggleExpand(workspace.id)}
                            className="group flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer transition-colors"
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                {expanded.has(workspace.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Folder size={16} className="text-blue-400 shrink-0" />
                                <span className="font-medium text-sm truncate">{workspace.name}</span>
                            </div>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => handleAddClick(e, workspace.id)}
                                    className="p-1 hover:text-green-400"
                                    title="Add Terminal"
                                >
                                    <Plus size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemoveWorkspace(workspace.id)
                                    }}
                                    className="p-1 hover:text-red-400"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        {expanded.has(workspace.id) && (
                            <div className="ml-6 space-y-1 mt-1 border-l border-white/10 pl-2">
                                {workspace.sessions?.map(session => (
                                    <div
                                        key={session.id}
                                        onClick={() => onSelect(workspace, session)}
                                        className={clsx(
                                            "flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors",
                                            activeSessionId === session.id ? "bg-white/10 text-white" : "hover:bg-white/5 text-gray-400"
                                        )}
                                    >
                                        <Terminal size={14} className={session.type === 'worktree' ? 'text-green-400' : ''} />
                                        <span className="truncate">{session.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="p-4 border-t border-white/10">
                <div className="text-xs font-semibold text-gray-500 mb-2">PLAYGROUND</div>
                <button
                    onClick={onCreatePlayground}
                    className="w-full flex items-center gap-2 p-2 rounded hover:bg-white/5 text-sm transition-colors"
                >
                    <Plus size={16} />
                    <span>New Playground</span>
                </button>
            </div>
        </div>
    )
}
