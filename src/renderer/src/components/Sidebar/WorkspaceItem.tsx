import React from 'react'
import { Folder, FolderOpen, Plus, Trash2, ChevronRight, ChevronDown, GitBranch } from 'lucide-react'
import clsx from 'clsx'
import { Workspace, TerminalSession, NotificationStatus } from '../../../../shared/types'
import { SessionItem } from './SessionItem'
import { WorktreeItem } from './WorktreeItem'

interface WorkspaceItemProps {
    workspace: Workspace
    childWorktrees: Workspace[]
    expanded: boolean
    expandedSet: Set<string>  // 전체 expanded 상태를 관리하는 Set 추가
    branchInfo?: { current: string; all: string[] }
    activeSessionId?: string
    sessionNotifications?: Map<string, NotificationStatus>
    onToggleExpand: (id: string) => void
    onContextMenu: (e: React.MouseEvent, workspaceId: string) => void
    onBranchClick: (e: React.MouseEvent, workspace: Workspace) => void
    onSelect: (workspace: Workspace, session: TerminalSession) => void
    onRemoveSession: (workspaceId: string, sessionId: string) => void
    onRemoveWorkspace: (id: string) => void
    onOpenInEditor: (workspacePath: string) => void
}

/**
 * 워크스페이스 항목 컴포넌트
 * 세션 목록과 자식 워크트리들을 포함
 */
export function WorkspaceItem({
    workspace,
    childWorktrees,
    expanded,
    expandedSet,
    branchInfo,
    activeSessionId,
    sessionNotifications,
    onToggleExpand,
    onContextMenu,
    onBranchClick,
    onSelect,
    onRemoveSession,
    onRemoveWorkspace,
    onOpenInEditor
}: WorkspaceItemProps) {
    return (
        <div className="space-y-0.5">
            <div
                onClick={() => onToggleExpand(workspace.id)}
                onContextMenu={(e) => onContextMenu(e, workspace.id)}
                className="group flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer transition-colors"
            >
                <div className="flex flex-col gap-0.5 overflow-hidden flex-1 min-w-0">
                    <div className="flex items-center gap-2 overflow-hidden">
                        {expanded ? (
                            <ChevronDown size={14} className="text-gray-400 shrink-0" />
                        ) : (
                            <ChevronRight size={14} className="text-gray-400 shrink-0" />
                        )}
                        {workspace.isPlayground ? (
                            <Folder size={16} className="text-yellow-400 shrink-0" />
                        ) : (
                            <Folder size={16} className="text-blue-400 shrink-0" />
                        )}
                        <span className={clsx(
                            "font-medium text-sm truncate",
                            workspace.isPlayground ? "text-yellow-100" : ""
                        )}>
                            {workspace.name}
                        </span>
                    </div>
                    {branchInfo && (
                        <div
                            className="ml-7 flex items-center gap-1 text-[10px] text-gray-500 hover:text-blue-400 transition-colors cursor-pointer"
                            onClick={(e) => onBranchClick(e, workspace)}
                        >
                            <GitBranch size={10} />
                            <span className="truncate">{branchInfo.current}</span>
                        </div>
                    )}
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
                            onContextMenu(e, workspace.id)
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

            {expanded && (
                <div className="ml-4 pl-2 border-l border-white/5 space-y-0.5">
                    {/* 부모 workspace의 세션들 */}
                    {workspace.sessions?.map((session: TerminalSession) => (
                        <SessionItem
                            key={session.id}
                            session={session}
                            workspace={workspace}
                            isActive={activeSessionId === session.id}
                            notificationStatus={sessionNotifications?.get(session.id)}
                            onSelect={onSelect}
                            onRemove={onRemoveSession}
                        />
                    ))}

                    {/* 자식 worktree workspace들 */}
                    {childWorktrees.map(worktree => (
                        <WorktreeItem
                            key={worktree.id}
                            worktree={worktree}
                            expanded={expandedSet.has(worktree.id)}
                            activeSessionId={activeSessionId}
                            sessionNotifications={sessionNotifications}
                            onToggleExpand={onToggleExpand}
                            onContextMenu={onContextMenu}
                            onSelect={onSelect}
                            onRemoveSession={onRemoveSession}
                            onRemoveWorkspace={onRemoveWorkspace}
                            onOpenInEditor={onOpenInEditor}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
