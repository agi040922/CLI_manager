# module:sidebar
<!-- Updated: 2026-01-30 -->

## What
Modular sidebar component system for workspace/session navigation, drag-and-drop reordering, context menus, and modals.

## Key Files
- src/renderer/src/components/Sidebar/index.tsx - Main container, workspace list, templates dropdown (~830 lines)
- src/renderer/src/components/Sidebar/WorkspaceItem.tsx - Workspace row with expand/collapse (~220 lines)
- src/renderer/src/components/Sidebar/WorktreeItem.tsx - Worktree-specific workspace rendering (~140 lines)
- src/renderer/src/components/Sidebar/SessionItem.tsx - Session row with status/preview/rename (~330 lines)
- src/renderer/src/components/Sidebar/ContextMenus.tsx - Right-click menus for workspace/session/branch (~480 lines)
- src/renderer/src/components/Sidebar/Modals.tsx - BranchPromptModal, ConfirmationModal (~190 lines)

## How It Works
- Sidebar index renders workspace list with framer-motion Reorder for drag-and-drop
- Each WorkspaceItem expands to show sessions, with nested Reorder for session ordering
- WorktreeItem renders worktree workspaces as children under parent workspace
- SessionItem shows terminal name, status badge, notification indicator, and hover preview
- ContextMenus provide: add session, open editor, rename, delete workspace; branch checkout; session rename/kill/delete
- BranchPromptModal collects branch name for worktree creation
- Playground section at bottom with resizable height divider
- Custom template dropdown for new session creation
- Sidebar itself is horizontally resizable

## Entry Points
- Sidebar component rendered in App.tsx

## Gotchas
- Sidebar was refactored from 820 lines to 7 modules (75% reduction in main file)
- Context menus use absolute positioning with viewport boundary detection
- Session preview (hover tooltip) fetches last N lines from TerminalManager
- Workspace drag-and-drop and session drag-and-drop are separate Reorder contexts
- Worktree workspaces appear indented under parent, not as top-level items

## See Also
- module:renderer-app
- flow:worktree-management
