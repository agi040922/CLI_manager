import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, PanelLeftClose } from 'lucide-react'
import { Workspace, TerminalSession, NotificationStatus } from '../../../../shared/types'
import { useWorkspaceBranches } from '../../hooks/useWorkspaceBranches'
import { useTemplates } from '../../hooks/useTemplates'
import { WorkspaceItem } from './WorkspaceItem'
import { WorkspaceContextMenu, WorktreeContextMenu, BranchMenu, SessionContextMenu } from './ContextMenus'
import { BranchPromptModal } from './Modals'

interface SidebarProps {
    workspaces: Workspace[]
    onSelect: (workspace: Workspace, session: TerminalSession) => void
    onAddWorkspace: () => void
    onRemoveWorkspace: (id: string) => void
    onAddSession: (workspaceId: string, type: 'regular' | 'worktree', branchName?: string, initialCommand?: string) => void
    onAddWorktreeWorkspace: (parentWorkspaceId: string, branchName: string) => void
    onRemoveSession: (workspaceId: string, sessionId: string) => void
    onCreatePlayground: () => void
    activeSessionId?: string
    sessionNotifications?: Map<string, NotificationStatus>
    onOpenInEditor: (workspacePath: string) => void
    onOpenSettings: () => void
    settingsOpen?: boolean
    onRenameSession: (workspaceId: string, sessionId: string, newName: string) => void
    onReorderSessions: (workspaceId: string, sessions: TerminalSession[]) => void
    width: number
    setWidth: (width: number) => void
    onClose: () => void
}

/**
 * 사이드바 컴포넌트
 * 워크스페이스와 터미널 세션 관리 UI 제공
 *
 * 리팩토링 포인트:
 * - 820줄에서 200줄 이하로 축소
 * - 커스텀 훅으로 상태 관리 분리 (useWorkspaceBranches, useTemplates)
 * - 재사용 가능한 컴포넌트로 분리 (WorkspaceItem, ContextMenus, Modals)
 */
export function Sidebar({
    workspaces,
    onSelect,
    onAddWorkspace,
    onRemoveWorkspace,
    onAddSession,
    onAddWorktreeWorkspace,
    onRemoveSession,
    onCreatePlayground,
    activeSessionId,
    sessionNotifications,
    onOpenInEditor,
    onOpenSettings,
    settingsOpen,
    onRenameSession,
    onReorderSessions,
    width,
    setWidth,
    onClose
}: SidebarProps) {
    // 커스텀 훅으로 상태 관리
    const customTemplates = useTemplates(settingsOpen)
    const { workspaceBranches, setWorkspaceBranches } = useWorkspaceBranches(workspaces)

    // UI 상태
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [menuOpen, setMenuOpen] = useState<{ x: number, y: number, workspaceId: string } | null>(null)
    const [worktreeMenuOpen, setWorktreeMenuOpen] = useState<{ x: number, y: number, workspace: Workspace } | null>(null)
    const [branchMenuOpen, setBranchMenuOpen] = useState<{ x: number, y: number, workspaceId: string, workspacePath: string } | null>(null)
    const [sessionMenuOpen, setSessionMenuOpen] = useState<{ x: number, y: number, workspaceId: string, sessionId: string } | null>(null)
    const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
    const [showPrompt, setShowPrompt] = useState<{ workspaceId: string } | null>(null)

    // Resizing logic
    const isResizing = useRef(false)
    const sidebarRef = useRef<HTMLDivElement>(null)

    const startResizing = useCallback(() => {
        isResizing.current = true
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none' // Prevent text selection while resizing
    }, [])

    const stopResizing = useCallback(() => {
        isResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }, [])

    const resize = useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing.current) {
                const newWidth = mouseMoveEvent.clientX
                if (newWidth >= 50 && newWidth <= 480) { // Min 50px, Max 480px
                    setWidth(newWidth)
                }
            }
        },
        [setWidth]
    )

    useEffect(() => {
        window.addEventListener('mousemove', resize)
        window.addEventListener('mouseup', stopResizing)
        return () => {
            window.removeEventListener('mousemove', resize)
            window.removeEventListener('mouseup', stopResizing)
        }
    }, [resize, stopResizing])


    // 워크스페이스 자동 펼치기
    useEffect(() => {
        if (workspaces.length > 0) {
            setExpanded(prev => {
                const newExpanded = new Set(prev)
                workspaces.forEach(w => newExpanded.add(w.id))
                return newExpanded
            })
        }
    }, [workspaces.length])

    // 메뉴 외부 클릭 시 닫기
    useEffect(() => {
        const handleClick = () => {
            setMenuOpen(null)
            setBranchMenuOpen(null)
            setWorktreeMenuOpen(null)
            setSessionMenuOpen(null)
        }
        window.addEventListener('click', handleClick)
        return () => window.removeEventListener('click', handleClick)
    }, [])

    const toggleExpand = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const handleContextMenu = (e: React.MouseEvent, workspaceId: string) => {
        e.preventDefault()
        e.stopPropagation()

        const workspace = workspaces.find(w => w.id === workspaceId)

        // Worktree workspace인 경우 별도 메뉴
        if (workspace?.parentWorkspaceId) {
            setWorktreeMenuOpen({ x: e.clientX, y: e.clientY, workspace })
        } else {
            setMenuOpen({ x: e.clientX, y: e.clientY, workspaceId })
        }
    }

    const handleSessionContextMenu = (e: React.MouseEvent, workspaceId: string, sessionId: string) => {
        e.preventDefault()
        e.stopPropagation()
        setSessionMenuOpen({ x: e.clientX, y: e.clientY, workspaceId, sessionId })
    }

    const handleBranchClick = (e: React.MouseEvent, workspace: Workspace) => {
        e.preventDefault()
        e.stopPropagation()

        const branches = workspaceBranches.get(workspace.id)
        if (!branches) return

        setBranchMenuOpen({
            x: e.clientX,
            y: e.clientY,
            workspaceId: workspace.id,
            workspacePath: workspace.path
        })
    }

    const handleBranchCheckout = async (branchName: string) => {
        if (!branchMenuOpen) return

        try {
            await window.api.gitCheckout(branchMenuOpen.workspacePath, branchName)

            // 브랜치 정보 재로드
            const branches = await window.api.gitListBranches(branchMenuOpen.workspacePath)
            if (branches) {
                setWorkspaceBranches(prev => {
                    const next = new Map(prev)
                    next.set(branchMenuOpen.workspaceId, {
                        current: branches.current,
                        all: branches.all.filter((b: string) => !b.startsWith('remotes/'))
                    })
                    return next
                })
            }
        } catch (err) {
            console.error('Failed to checkout branch:', err)
            alert('Failed to checkout branch. Make sure you have no uncommitted changes.')
        }
    }

    // Local Git handlers
    const handleMergeToMain = async () => {
        if (!worktreeMenuOpen) return

        const parentWorkspace = workspaces.find(w => w.id === worktreeMenuOpen.workspace.parentWorkspaceId)
        if (!parentWorkspace) {
            alert('Parent workspace not found.')
            return
        }

        const confirmed = window.confirm(
            `Merge "${worktreeMenuOpen.workspace.branchName}" into main/master?\n\n` +
            `This will be performed in the parent workspace (${parentWorkspace.name}).`
        )
        if (!confirmed) return

        try {
            const result = await window.api.gitMerge(parentWorkspace.path, worktreeMenuOpen.workspace.branchName!)
            if (result.success) {
                alert('Merge completed successfully!')
            } else {
                if (result.data?.conflicts && result.data.conflicts.length > 0) {
                    alert(`Merge conflict occurred:\n${result.data.conflicts.join('\n')}\n\nPlease resolve conflicts and commit.`)
                } else {
                    alert(`Merge failed: ${result.error}`)
                }
            }
        } catch (err: any) {
            alert(`Merge failed: ${err.message}`)
        }
    }

    const handlePullFromMain = async () => {
        if (!worktreeMenuOpen) return

        const parentWorkspace = workspaces.find(w => w.id === worktreeMenuOpen.workspace.parentWorkspaceId)
        if (!parentWorkspace) {
            alert('Parent workspace not found.')
            return
        }

        const parentBranches = workspaceBranches.get(parentWorkspace.id)
        const mainBranch = parentBranches?.current || 'main'

        const confirmed = window.confirm(
            `Pull changes from "${mainBranch}" into "${worktreeMenuOpen.workspace.branchName}"?`
        )
        if (!confirmed) return

        try {
            const result = await window.api.gitMerge(worktreeMenuOpen.workspace.path, mainBranch)
            if (result.success) {
                alert('Successfully pulled changes from main!')
            } else {
                if (result.data?.conflicts && result.data.conflicts.length > 0) {
                    alert(`Merge conflict occurred:\n${result.data.conflicts.join('\n')}\n\nPlease resolve conflicts and commit.`)
                } else {
                    alert(`Merge failed: ${result.error}`)
                }
            }
        } catch (err: any) {
            alert(`Merge failed: ${err.message}`)
        }
    }

    const handleRenameSubmit = (workspaceId: string, sessionId: string, newName: string) => {
        onRenameSession(workspaceId, sessionId, newName)
        setRenamingSessionId(null)
    }

    // 일반 워크스페이스와 Playground 분리
    const regularWorkspaces = workspaces.filter(w => !w.isPlayground && !w.parentWorkspaceId)
    const playgroundWorkspaces = workspaces.filter(w => w.isPlayground)

    return (
        <>
            {/* Context Menus */}
            {menuOpen && (
                <WorkspaceContextMenu
                    x={menuOpen.x}
                    y={menuOpen.y}
                    templates={customTemplates}
                    onAddSession={(type, template) => {
                        if (type === 'worktree') {
                            setShowPrompt({ workspaceId: menuOpen.workspaceId })
                        } else {
                            onAddSession(menuOpen.workspaceId, 'regular', undefined, template?.command)
                        }
                    }}
                    onOpenSettings={onOpenSettings}
                    onClose={() => setMenuOpen(null)}
                />
            )}

            {worktreeMenuOpen && (
                <WorktreeContextMenu
                    x={worktreeMenuOpen.x}
                    y={worktreeMenuOpen.y}
                    workspace={worktreeMenuOpen.workspace}
                    templates={customTemplates}
                    onMergeToMain={handleMergeToMain}
                    onPullFromMain={handlePullFromMain}
                    onAddSession={(workspaceId, template) => {
                        onAddSession(workspaceId, 'regular', undefined, template?.command)
                    }}
                    onClose={() => setWorktreeMenuOpen(null)}
                />
            )}

            {branchMenuOpen && (
                <BranchMenu
                    x={branchMenuOpen.x}
                    y={branchMenuOpen.y}
                    branches={workspaceBranches.get(branchMenuOpen.workspaceId)?.all || []}
                    currentBranch={workspaceBranches.get(branchMenuOpen.workspaceId)?.current || ''}
                    onCheckout={handleBranchCheckout}
                    onClose={() => setBranchMenuOpen(null)}
                />
            )}

            {sessionMenuOpen && (
                <SessionContextMenu
                    x={sessionMenuOpen.x}
                    y={sessionMenuOpen.y}
                    onRename={() => {
                        setRenamingSessionId(sessionMenuOpen.sessionId)
                        setSessionMenuOpen(null)
                    }}
                    onDelete={() => {
                        onRemoveSession(sessionMenuOpen.workspaceId, sessionMenuOpen.sessionId)
                        setSessionMenuOpen(null)
                    }}
                    onClose={() => setSessionMenuOpen(null)}
                />
            )}

            {/* Modals */}
            {showPrompt && (
                <BranchPromptModal
                    onSubmit={(branchName) => {
                        onAddWorktreeWorkspace(showPrompt.workspaceId, branchName)
                        setShowPrompt(null)
                    }}
                    onCancel={() => setShowPrompt(null)}
                />
            )}

            {/* Sidebar Content */}
            <div
                ref={sidebarRef}
                className="glass-panel mx-2 mb-2 mt-1 rounded-lg flex flex-col overflow-hidden relative"
                style={{ width: width, minWidth: 50, maxWidth: 480 }}
            >
                <div className="py-1.5 px-2 border-b border-white/10 flex items-center justify-between draggable">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Workspaces</span>
                    <div className="flex items-center gap-1 no-drag">
                        <button
                            onClick={onAddWorkspace}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                            title="Add Workspace"
                        >
                            <Plus size={14} className="text-gray-400" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                            title="Close Sidebar"
                        >
                            <PanelLeftClose size={14} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {regularWorkspaces.map(workspace => {
                        const childWorktrees = workspaces.filter(w => w.parentWorkspaceId === workspace.id)
                        return (
                            <WorkspaceItem
                                key={workspace.id}
                                workspace={workspace}
                                childWorktrees={childWorktrees}
                                expanded={expanded.has(workspace.id)}
                                expandedSet={expanded}
                                branchInfo={workspaceBranches.get(workspace.id)}
                                activeSessionId={activeSessionId}
                                sessionNotifications={sessionNotifications}
                                renamingSessionId={renamingSessionId}
                                onToggleExpand={toggleExpand}
                                onContextMenu={handleContextMenu}
                                onSessionContextMenu={handleSessionContextMenu}
                                onBranchClick={handleBranchClick}
                                onSelect={onSelect}
                                onRemoveSession={onRemoveSession}
                                onRemoveWorkspace={onRemoveWorkspace}
                                onOpenInEditor={onOpenInEditor}
                                onRenameSession={handleRenameSubmit}
                                onRenameCancel={() => setRenamingSessionId(null)}
                                onReorderSessions={onReorderSessions}
                            />
                        )
                    })}
                </div>

                <div className="border-t border-white/10">
                    <div className="p-4">
                        <div className="text-xs font-semibold text-gray-500 mb-2">PLAYGROUND</div>

                        {/* Playground list */}
                        <div className="space-y-0.5 mb-3">
                            {playgroundWorkspaces.map(workspace => (
                                <WorkspaceItem
                                    key={workspace.id}
                                    workspace={workspace}
                                    childWorktrees={[]}
                                    expanded={expanded.has(workspace.id)}
                                    expandedSet={expanded}
                                    branchInfo={workspaceBranches.get(workspace.id)}
                                    activeSessionId={activeSessionId}
                                    sessionNotifications={sessionNotifications}
                                    renamingSessionId={renamingSessionId}
                                    onToggleExpand={toggleExpand}
                                    onContextMenu={handleContextMenu}
                                    onSessionContextMenu={handleSessionContextMenu}
                                    onBranchClick={handleBranchClick}
                                    onSelect={onSelect}
                                    onRemoveSession={onRemoveSession}
                                    onRemoveWorkspace={onRemoveWorkspace}
                                    onOpenInEditor={onOpenInEditor}
                                    onRenameSession={handleRenameSubmit}
                                    onRenameCancel={() => setRenamingSessionId(null)}
                                    onReorderSessions={onReorderSessions}
                                />
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

                {/* Resize Handle */}
                <div
                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-50"
                    onMouseDown={startResizing}
                />
            </div>
        </>
    )
}
