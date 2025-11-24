import React, { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Workspace, TerminalSession, NotificationStatus } from '../../../../shared/types'
import { useWorkspaceBranches } from '../../hooks/useWorkspaceBranches'
import { useTemplates } from '../../hooks/useTemplates'
import { WorkspaceItem } from './WorkspaceItem'
import { WorkspaceContextMenu, WorktreeContextMenu, BranchMenu } from './ContextMenus'
import { BranchPromptModal, PRPromptModal } from './Modals'

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
    settingsOpen
}: SidebarProps) {
    // 커스텀 훅으로 상태 관리
    const customTemplates = useTemplates(settingsOpen)
    const { workspaceBranches, setWorkspaceBranches } = useWorkspaceBranches(workspaces)

    // UI 상태
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [menuOpen, setMenuOpen] = useState<{ x: number, y: number, workspaceId: string } | null>(null)
    const [worktreeMenuOpen, setWorktreeMenuOpen] = useState<{ x: number, y: number, workspace: Workspace } | null>(null)
    const [branchMenuOpen, setBranchMenuOpen] = useState<{ x: number, y: number, workspaceId: string, workspacePath: string } | null>(null)
    const [showPrompt, setShowPrompt] = useState<{ workspaceId: string } | null>(null)
    const [showPRPrompt, setShowPRPrompt] = useState<{ workspace: Workspace } | null>(null)

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

    // GitHub 관련 핸들러
    const handlePushToGitHub = async () => {
        if (!worktreeMenuOpen) return

        try {
            await window.api.ghPushBranch(worktreeMenuOpen.workspace.path, worktreeMenuOpen.workspace.branchName!)
            alert('Successfully pushed to GitHub!')
        } catch (err: any) {
            alert(`Failed to push: ${err.message}`)
        }
    }

    const handleCreatePR = () => {
        if (!worktreeMenuOpen) return
        setShowPRPrompt({ workspace: worktreeMenuOpen.workspace })
    }

    const handlePRSubmit = async (title: string, body: string) => {
        if (!showPRPrompt) return

        try {
            const result = await window.api.ghCreatePRFromWorktree(
                showPRPrompt.workspace.path,
                showPRPrompt.workspace.branchName!,
                title,
                body
            )
            alert(`PR created: ${result.url}`)
        } catch (err: any) {
            alert(`Failed to create PR: ${err.message}`)
        } finally {
            setShowPRPrompt(null)
        }
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
                    onPushToGitHub={handlePushToGitHub}
                    onCreatePR={handleCreatePR}
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

            {showPRPrompt && (
                <PRPromptModal
                    onSubmit={handlePRSubmit}
                    onCancel={() => setShowPRPrompt(null)}
                />
            )}

            {/* Sidebar Content */}
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
                                onToggleExpand={toggleExpand}
                                onContextMenu={handleContextMenu}
                                onBranchClick={handleBranchClick}
                                onSelect={onSelect}
                                onRemoveSession={onRemoveSession}
                                onRemoveWorkspace={onRemoveWorkspace}
                                onOpenInEditor={onOpenInEditor}
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
                                    onToggleExpand={toggleExpand}
                                    onContextMenu={handleContextMenu}
                                    onBranchClick={handleBranchClick}
                                    onSelect={onSelect}
                                    onRemoveSession={onRemoveSession}
                                    onRemoveWorkspace={onRemoveWorkspace}
                                    onOpenInEditor={onOpenInEditor}
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
            </div>
        </>
    )
}
