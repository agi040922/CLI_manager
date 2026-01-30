# flow:worktree-management
<!-- Updated: 2026-01-30 -->

## What
Git worktree creation, management, and cleanup flow - worktrees are treated as child workspaces.

## Key Files
- src/main/index.ts - add-worktree-workspace, remove-workspace IPC handlers
- src/renderer/src/components/Sidebar/ContextMenus.tsx - WorktreeContextMenu
- src/renderer/src/components/Sidebar/Modals.tsx - BranchPromptModal
- src/shared/types.ts - Workspace.parentWorkspaceId, Workspace.branchName

## How It Works
- **Creation**:
  1. User right-clicks workspace -> "Add Worktree" -> BranchPromptModal opens
  2. User enters branch name (and optional base branch)
  3. App calls `window.api.addWorktreeWorkspace(parentId, branchName, baseBranch?)`
  4. Main process: license check (Pro only) -> simple-git `worktree add`
  5. Directory created at `{parent-path}/../{parent-name}-worktrees/{branchName}`
  6. New Workspace created with `parentWorkspaceId` set to parent ID
  7. Workspace stored and returned to renderer
- **Display**:
  1. Sidebar groups worktree workspaces under parent
  2. WorktreeItem renders with indentation and branch indicator
  3. Each worktree workspace has independent session list
- **Deletion**:
  1. User right-clicks worktree workspace -> "Delete"
  2. Main process runs `git worktree remove --force {path}`
  3. Workspace removed from store
  4. Directory cleaned up
- **GitHub Integration**:
  1. Push worktree branch: `git push origin {branch} --set-upstream`
  2. Create PR from worktree: `gh pr create` with branch context

## Entry Points
- WorkspaceContextMenu "Add Worktree" action
- WorktreeContextMenu for management actions

## Gotchas
- Worktree is a Pro-only feature (license gated)
- Branch must not already exist when creating worktree
- Directory structure: `{workspace}-worktrees/{branch}` (sibling to workspace dir)
- `git worktree remove --force` used for cleanup (handles dirty trees)
- Worktree workspaces have `type: 'worktree'` sessions by default
- baseBranch stored for PR target branch reference

## See Also
- module:sidebar
- module:main-process
- module:license-manager
