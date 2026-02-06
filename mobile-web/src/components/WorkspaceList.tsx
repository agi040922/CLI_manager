// WorkspaceList - Display workspaces with worktree grouping
// Users can create terminal sessions from any workspace

import { useState } from 'react'
import {
  Folder,
  GitBranch,
  Plus,
  LogOut,
  RefreshCw,
  ChevronRight,
  Loader2,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react'
import type { Workspace, Session, ConnectionStatus } from '../types'

interface WorkspaceListProps {
  deviceName: string
  status: ConnectionStatus
  workspaces: Workspace[]
  sessions: Session[]
  onCreateSession: (workspaceId: string, name: string) => void
  onSelectSession: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onRefresh: () => void
  onLogout: () => void
  loading: boolean
}

export function WorkspaceList({
  deviceName,
  status,
  workspaces,
  sessions,
  onCreateSession,
  onSelectSession,
  onCloseSession,
  onRefresh,
  onLogout,
  loading,
}: WorkspaceListProps) {
  const [creatingFor, setCreatingFor] = useState<string | null>(null)

  const handleCreateSession = (workspace: Workspace) => {
    setCreatingFor(workspace.id)
    onCreateSession(workspace.id, `Mobile - ${workspace.name}`)

    // Reset loading state after timeout (server confirmation will override)
    setTimeout(() => setCreatingFor(null), 3000)
  }

  // Group worktrees under their parent workspace
  const mainWorkspaces = workspaces.filter((w) => !w.isWorktree)
  const worktreesByParent = new Map<string, Workspace[]>()

  for (const w of workspaces.filter((w) => w.isWorktree)) {
    // Match worktree to parent by parentWorkspaceId or path-based heuristic
    const parentId =
      w.parentWorkspaceId ||
      mainWorkspaces.find((m) => w.path.includes(m.name))?.id
    if (parentId) {
      const group = worktreesByParent.get(parentId) || []
      group.push(w)
      worktreesByParent.set(parentId, group)
    }
  }

  return (
    <div className="h-full flex flex-col safe-top safe-bottom">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold">Workspaces</h1>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span
                  className={`status-dot status-dot--${status}`}
                  title={status}
                />
                <span>{deviceName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2.5 hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw
                className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={onLogout}
              className="p-2.5 hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors"
              title="Disconnect"
            >
              <LogOut className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Active sessions section */}
      {sessions.length > 0 && (
        <div className="flex-shrink-0 p-4 border-b border-white/10 bg-blue-500/5">
          <h2 className="text-xs text-gray-500 uppercase tracking-wide mb-3">
            Active Sessions ({sessions.length})
          </h2>
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg animate-fade-in"
              >
                <button
                  onClick={() => onSelectSession(session.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <TerminalIcon className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {session.workspaceName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(session.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseSession(session.id)
                  }}
                  className="ml-2 p-2 hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workspace list (scrollable) */}
      <div className="flex-1 overflow-y-auto p-4">
        {workspaces.length === 0 ? (
          <EmptyState loading={loading} onRefresh={onRefresh} />
        ) : (
          <div className="space-y-2">
            {mainWorkspaces.map((workspace) => {
              const worktrees = worktreesByParent.get(workspace.id) || []

              return (
                <div key={workspace.id} className="animate-fade-in">
                  {/* Main workspace item */}
                  <WorkspaceItem
                    workspace={workspace}
                    isCreating={creatingFor === workspace.id}
                    onCreateSession={() => handleCreateSession(workspace)}
                  />

                  {/* Grouped worktrees */}
                  {worktrees.length > 0 && (
                    <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                      {worktrees.map((worktree) => (
                        <WorkspaceItem
                          key={worktree.id}
                          workspace={worktree}
                          isCreating={creatingFor === worktree.id}
                          onCreateSession={() => handleCreateSession(worktree)}
                          variant="worktree"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Sub-components ---

interface WorkspaceItemProps {
  workspace: Workspace
  isCreating: boolean
  onCreateSession: () => void
  variant?: 'default' | 'worktree'
}

function WorkspaceItem({
  workspace,
  isCreating,
  onCreateSession,
  variant = 'default',
}: WorkspaceItemProps) {
  const isWorktree = variant === 'worktree'

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
        isWorktree
          ? 'bg-white/[0.03] hover:bg-white/[0.06]'
          : 'bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Icon */}
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isWorktree ? 'bg-purple-500/20' : 'bg-blue-500/20'
          }`}
        >
          {isWorktree ? (
            <GitBranch className="w-5 h-5 text-purple-400" />
          ) : (
            <Folder className="w-5 h-5 text-blue-400" />
          )}
        </div>

        {/* Name and branch */}
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate text-sm">{workspace.name}</div>
          {workspace.branch && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
              <GitBranch className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{workspace.branch}</span>
            </div>
          )}
        </div>
      </div>

      {/* Create session button */}
      <button
        onClick={onCreateSession}
        disabled={isCreating}
        className="ml-2 p-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-600/40 rounded-lg transition-colors flex-shrink-0"
      >
        {isCreating ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Plus className="w-5 h-5" />
        )}
      </button>
    </div>
  )
}

interface EmptyStateProps {
  loading: boolean
  onRefresh: () => void
}

function EmptyState({ loading, onRefresh }: EmptyStateProps) {
  return (
    <div className="h-full flex items-center justify-center">
      {loading ? (
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading workspaces...</p>
        </div>
      ) : (
        <div className="text-center">
          <Folder className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-3">No workspaces found</p>
          <button
            onClick={onRefresh}
            className="text-blue-400 text-sm hover:text-blue-300 transition-colors"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}
