import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Workspace, TerminalSession, NotificationStatus, TerminalTemplate } from '../../../shared/types'
import { Folder, FolderOpen, Plus, Terminal, Trash2, ChevronRight, ChevronDown, Settings as SettingsIcon, GitBranch, Code2, Play, Package, Database } from 'lucide-react'
import clsx from 'clsx'

interface SidebarProps {
    workspaces: Workspace[]
    onSelect: (workspace: Workspace, session: TerminalSession) => void
    onAddWorkspace: () => void
    onRemoveWorkspace: (id: string) => void
    onAddSession: (workspaceId: string, type: 'regular' | 'worktree', branchName?: string, initialCommand?: string) => void
    onCreatePlayground: () => void
    activeSessionId?: string
    sessionNotifications?: Map<string, NotificationStatus>
    onOpenInEditor: (workspacePath: string) => void
    onOpenSettings: () => void
    settingsOpen?: boolean
}

export function Sidebar({
    workspaces,
    onSelect,
    onAddWorkspace,
    onRemoveWorkspace,
    onAddSession,
    onCreatePlayground,
    activeSessionId,
    sessionNotifications,
    onOpenInEditor,
    onOpenSettings,
    settingsOpen
}: SidebarProps) {
    const [customTemplates, setCustomTemplates] = useState<TerminalTemplate[]>([])

    // Load custom templates
    useEffect(() => {
        window.api.getTemplates().then(setCustomTemplates).catch(err => {
            console.error('Failed to load templates:', err)
        })
    }, [])

    // Reload templates when settings close
    useEffect(() => {
        if (settingsOpen === false) {
            window.api.getTemplates().then(setCustomTemplates).catch(err => {
                console.error('Failed to reload templates:', err)
            })
        }
    }, [settingsOpen])
    // Notification badge color
    const getNotificationBadge = (sessionId: string) => {
        const status = sessionNotifications?.get(sessionId)
        if (!status || status === 'none') return null

        const colors = {
            info: 'bg-amber-500',      // 🔔 Yellow: User input needed
            error: 'bg-red-500',        // ❌ Red: Error
            success: 'bg-green-500'     // ✅ Green: Success
        }

        return (
            <div className={`w-2 h-2 rounded-full ${colors[status]} animate-pulse shrink-0`} />
        )
    }
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [menuOpen, setMenuOpen] = useState<{ x: number, y: number, workspaceId: string } | null>(null)
    const [showPrompt, setShowPrompt] = useState<{ workspaceId: string } | null>(null)
    const [branchName, setBranchName] = useState('')

    // Initialize expanded state with all workspace IDs when workspaces change
    useEffect(() => {
        if (workspaces.length > 0) {
            setExpanded(prev => {
                const newExpanded = new Set(prev)
                workspaces.forEach(w => newExpanded.add(w.id))
                return newExpanded
            })
        }
    }, [workspaces.length]) // Only run when workspace count changes

    const toggleExpand = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleContextMenu = (e: React.MouseEvent, workspaceId: string) => {
        e.preventDefault()
        e.stopPropagation()
        setMenuOpen({ x: e.clientX, y: e.clientY, workspaceId })
    }

    const handleAddSessionClick = (type: 'regular' | 'worktree', template?: TerminalTemplate) => {
        if (menuOpen) {
            if (type === 'worktree') {
                setShowPrompt({ workspaceId: menuOpen.workspaceId })
            } else {
                onAddSession(menuOpen.workspaceId, 'regular', undefined, template?.command)
            }
            setMenuOpen(null)
        }
    }

    const getTemplateIcon = (iconName: string) => {
        switch (iconName) {
            case 'code': return <Code2 size={12} />
            case 'play': return <Play size={12} />
            case 'package': return <Package size={12} />
            case 'git': return <GitBranch size={12} />
            default: return <Terminal size={12} />
        }
    }

    const handlePromptSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (showPrompt && branchName) {
            onAddSession(showPrompt.workspaceId, 'worktree', branchName)
            setShowPrompt(null)
            setBranchName('')
        }
    }

    // Close menu on click outside
    useEffect(() => {
        const handleClick = () => setMenuOpen(null)
        window.addEventListener('click', handleClick)
        return () => window.removeEventListener('click', handleClick)
    }, [])

    return (
        <>
            {/* Context Menu - Portal to body */}
            {menuOpen && createPortal(
                <div
                    className="fixed z-[9999] bg-[#1e1e20] border border-white/10 rounded shadow-xl py-0.5 w-44 backdrop-blur-md"
                    style={{ top: menuOpen.y, left: menuOpen.x }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        New Terminal
                    </div>

                    {/* Plain Terminal */}
                    <button
                        className="w-full text-left px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                        onClick={() => handleAddSessionClick('regular', { id: 'plain', name: 'Plain Terminal', icon: 'terminal', description: 'Basic terminal', command: '' })}
                        title="Basic terminal"
                    >
                        <Terminal size={12} className="text-gray-400 shrink-0" />
                        <span className="truncate">Plain Terminal</span>
                    </button>

                    {/* Custom Templates */}
                    {customTemplates.map(template => (
                        <button
                            key={template.id}
                            className="w-full text-left px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                            onClick={() => handleAddSessionClick('regular', template)}
                            title={template.description || template.command}
                        >
                            <span className="text-gray-400 shrink-0">
                                {getTemplateIcon(template.icon)}
                            </span>
                            <span className="truncate">{template.name}</span>
                        </button>
                    ))}

                    <div className="border-t border-white/10 my-0.5"></div>

                    {/* Worktree */}
                    <button
                        className="w-full text-left px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                        onClick={() => handleAddSessionClick('worktree')}
                        title="Create git worktree"
                    >
                        <GitBranch size={12} className="text-gray-400 shrink-0" />
                        <span className="truncate">New Worktree</span>
                    </button>

                    <div className="border-t border-white/10 my-0.5"></div>

                    {/* Manage Templates */}
                    <button
                        className="w-full text-left px-2.5 py-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
                        onClick={() => {
                            setMenuOpen(null)
                            onOpenSettings()
                        }}
                    >
                        <SettingsIcon size={10} />
                        <span>Manage Templates...</span>
                    </button>
                </div>,
                document.body
            )}

            {/* Prompt Modal - Portal to body */}
            {showPrompt && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-[#1e1e20] border border-white/10 rounded-lg p-4 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-medium text-white mb-3">Enter Branch Name</h3>
                        <form onSubmit={handlePromptSubmit}>
                            <input
                                type="text"
                                autoFocus
                                value={branchName}
                                onChange={e => setBranchName(e.target.value)}
                                placeholder="feature/my-branch"
                                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 mb-3"
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPrompt(null)}
                                    className="px-3 py-1 text-xs text-gray-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                                >
                                    Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            <div className="w-64 glass-panel m-2 rounded-lg flex flex-col overflow-hidden">

            <div className="p-3 border-b border-white/10 flex items-center justify-between draggable">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Workspaces</span>
                <button
                    onClick={onAddWorkspace}
                    className="p-1 hover:bg-white/10 rounded transition-colors no-drag"
                >
                    <Plus size={14} className="text-gray-400" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {workspaces.filter(w => !w.isPlayground).map(workspace => (
                    <div key={workspace.id} className="space-y-0.5">
                        <div
                            onClick={() => toggleExpand(workspace.id)}
                            onContextMenu={(e) => handleContextMenu(e, workspace.id)}
                            className="group flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer transition-colors"
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                {expanded.has(workspace.id) ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                                {workspace.isPlayground ? (
                                    <Folder size={16} className="text-yellow-400 shrink-0" />
                                ) : (
                                    <Folder size={16} className="text-blue-400 shrink-0" />
                                )}
                                <span className={clsx(
                                    "font-medium text-sm truncate",
                                    workspace.isPlayground ? "text-yellow-100" : ""
                                )}>{workspace.name}</span>
                            </div>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onOpenInEditor(workspace.path)
                                    }}
                                    className="p-1 hover:bg-blue-500/20 rounded mr-1"
                                    title="Open in editor"
                                >
                                    <FolderOpen size={12} className="text-gray-400 hover:text-blue-400" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleContextMenu(e, workspace.id)
                                    }}
                                    className="p-1 hover:bg-white/10 rounded mr-1"
                                >
                                    <Plus size={12} className="text-gray-400" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemoveWorkspace(workspace.id)
                                    }}
                                    className="p-1 hover:bg-red-500/20 rounded"
                                >
                                    <Trash2 size={12} className="text-gray-400 hover:text-red-400" />
                                </button>
                            </div>
                        </div>

                        {expanded.has(workspace.id) && (
                            <div className="ml-4 pl-2 border-l border-white/5 space-y-0.5">
                                {workspace.sessions?.map((session: TerminalSession) => (
                                    <div
                                        key={session.id}
                                        onClick={() => onSelect(workspace, session)}
                                        className={clsx(
                                            "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm",
                                            activeSessionId === session.id
                                                ? "bg-blue-500/20 text-blue-200"
                                                : "text-gray-400 hover:bg-white/5 hover:text-gray-300"
                                        )}
                                    >
                                        <Terminal size={14} />
                                        <span className="truncate flex-1">{session.name}</span>
                                        {getNotificationBadge(session.id)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="border-t border-white/10">
                <div className="p-4">
                    <div className="text-xs font-semibold text-gray-500 mb-2">PLAYGROUND</div>

                    {/* Playground list */}
                    <div className="space-y-0.5 mb-3">
                        {workspaces.filter(w => w.isPlayground).map(workspace => (
                            <div key={workspace.id} className="space-y-0.5">
                                <div
                                    onClick={() => toggleExpand(workspace.id)}
                                    onContextMenu={(e) => handleContextMenu(e, workspace.id)}
                                    className="group flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {expanded.has(workspace.id) ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                                        <Folder size={16} className="text-yellow-400 shrink-0" />
                                        <span className="font-medium text-sm text-yellow-100 truncate">{workspace.name}</span>
                                    </div>
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onOpenInEditor(workspace.path)
                                            }}
                                            className="p-1 hover:bg-blue-500/20 rounded mr-1"
                                            title="Open in editor"
                                        >
                                            <FolderOpen size={12} className="text-gray-400 hover:text-blue-400" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleContextMenu(e, workspace.id)
                                            }}
                                            className="p-1 hover:bg-white/10 rounded mr-1"
                                        >
                                            <Plus size={12} className="text-gray-400" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onRemoveWorkspace(workspace.id)
                                            }}
                                            className="p-1 hover:bg-red-500/20 rounded"
                                        >
                                            <Trash2 size={12} className="text-gray-400 hover:text-red-400" />
                                        </button>
                                    </div>
                                </div>

                                {expanded.has(workspace.id) && (
                                    <div className="ml-4 pl-2 border-l border-white/5 space-y-0.5">
                                        {workspace.sessions?.map((session: TerminalSession) => (
                                            <div
                                                key={session.id}
                                                onClick={() => onSelect(workspace, session)}
                                                className={clsx(
                                                    "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm",
                                                    activeSessionId === session.id
                                                        ? "bg-blue-500/20 text-blue-200"
                                                        : "text-gray-400 hover:bg-white/5 hover:text-gray-300"
                                                )}
                                            >
                                                <Terminal size={14} />
                                                <span className="truncate flex-1">{session.name}</span>
                                                {getNotificationBadge(session.id)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={onCreatePlayground}
                        className="w-full flex items-center gap-2 p-2 rounded hover:bg-white/5 text-sm transition-colors"
                    >
                        <Plus size={16} />
                        <span>New Playground</span>
                    </button>
                </div>
            </div>
        </div>
        </>
    )
}
