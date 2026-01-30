# module:git-panel
<!-- Updated: 2026-01-30 -->

## What
Git operations UI panel with status display, staging, commit, push/pull, history, branch management, and GitHub integration.

## Key Files
- src/renderer/src/components/GitPanel.tsx - Full git UI (~1020 lines)

## How It Works
- Slides in from right side of App when toggled
- Fetches git status on open and after operations: staged, modified, untracked, conflicted, renamed files
- File staging: individual or select-all, with checkbox UI
- Commit: message input with Cmd+Enter shortcut
- Push/Pull: with upstream tracking and conflict detection
- History tab: commit log with reset capability (soft/mixed/hard)
- Branch management: list, checkout, create, delete branches
- Merge: select branch to merge into current, conflict UI
- GitHub integration section:
  - Auth status check via `gh auth status`
  - Push branch to origin
  - Create PR with title/body form
  - List open PRs
  - View GitHub Actions workflow status
  - Merge PR

## Entry Points
- GitPanel component toggled from App.tsx toolbar

## Gotchas
- Git status refreshes after every operation (commit, push, pull, etc.)
- Merge conflicts detected via MERGE_HEAD file, not just conflicted array
- GitHub features require gh CLI installed and authenticated
- PR creation auto-pushes branch before creating PR
- File diff not shown inline - only status (modified/added/deleted)

## See Also
- module:main-process (git IPC handlers)
- module:renderer-app
