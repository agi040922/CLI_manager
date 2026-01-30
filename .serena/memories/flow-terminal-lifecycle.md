# flow:terminal-lifecycle
<!-- Updated: 2026-01-30 -->

## What
End-to-end lifecycle of a terminal session from creation to destruction.

## Key Files
- src/main/index.ts - add-session/remove-session IPC handlers
- src/main/TerminalManager.ts - PTY spawn and management
- src/renderer/src/components/TerminalView.tsx - xterm.js UI
- src/renderer/src/App.tsx - session state management

## How It Works
- **Creation**:
  1. User clicks "+" or selects template in Sidebar
  2. App calls `window.api.addSession(workspaceId, name?, cwd?, type?, command?)`
  3. Main generates UUID, stores session in electron-store, returns TerminalSession
  4. App adds session to local state, sets it active
  5. TerminalView component renders (or already exists if re-activating)
  6. On mount, TerminalView calls `window.api.createTerminal(id, cwd, cols, rows, shell)`
  7. TerminalManager spawns node-pty process with login shell
  8. If `initialCommand` set, it's written to PTY after creation
- **I/O Streaming**:
  1. PTY output -> `terminal-output-{id}` broadcast to all windows
  2. TerminalView listener filters by matching session ID
  3. xterm.js `write()` renders output
  4. User keystrokes -> `terminal-input` IPC -> PTY `write()`
- **Tab Switching**:
  1. Active session changes in App state
  2. Previous TerminalView gets `display: none` (NOT unmounted)
  3. New active TerminalView gets `display: block`
  4. xterm.js `fit()` called on resize/visibility change
- **Destruction**:
  1. User deletes session via context menu
  2. App calls `window.api.removeSession(workspaceId, sessionId)`
  3. Main removes from store, calls `TerminalManager.killTerminal(id)`
  4. PTY process terminated, cleanup listeners

## Entry Points
- Sidebar "+" button or template selection
- Session context menu "Delete"

## Gotchas
- TerminalView is NEVER unmounted on tab switch - only hidden
- PTY process runs independently of React component lifecycle
- Output buffer (preview) maintained separately in TerminalManager
- Resize during scroll is paused to prevent layout thrashing
- Initial command runs via PTY write, not shell args

## See Also
- module:terminal-manager
- module:terminal-view
- flow:ipc-communication
