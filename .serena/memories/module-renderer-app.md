# module:renderer-app
<!-- Updated: 2026-01-30 -->

## What
Root React component (App.tsx) managing all application state, routing between views, and coordinating child components.

## Key Files
- src/renderer/src/App.tsx - Root component, state management, event handlers (~1300 lines)
- src/renderer/src/main.tsx - React entry point
- src/renderer/src/assets/ - CSS and static assets

## How It Works
- Manages top-level state: workspaces, activeWorkspace/Session, settings, licenseInfo, splitLayout
- `loadWorkspaces()` fetches workspace list from main process on mount
- Session/workspace CRUD delegates to IPC then updates local state
- Terminal font size controlled via Cmd+/-/0 (intercepted, not native zoom)
- Split view state (`splitLayout`) holds up to 4 session IDs for split terminal
- `gridViewSessionIds` syncs with fullscreen terminal window
- `sessionStatuses` map tracks Claude Code hook states per session
- License info loaded on mount and checked before gated operations
- Settings panel toggles inline (not a route)
- Git panel slides in from right side
- File search modal overlay

## Entry Points
- App component mounted from main.tsx
- All user interactions flow through App state handlers

## Gotchas
- App.tsx is ~1300 lines - largest renderer file, holds all top-level state
- Terminal views are NEVER unmounted - hidden via `display: none` to preserve PTY state
- Session statuses use polling (500ms) not events
- Font size range: 8-32px, persisted in settings
- Workspace reorder uses index-based swap, not drag position

## See Also
- module:sidebar
- module:terminal-view
- module:git-panel
- module:settings
