# flow:ipc-communication
<!-- Updated: 2026-01-30 -->

## What
IPC communication patterns between Electron main, preload, and renderer processes.

## Key Files
- src/main/index.ts - ipcMain.handle() and ipcMain.on() handlers
- src/preload/index.ts - contextBridge.exposeInMainWorld() with ipcRenderer wrappers
- src/preload/window.d.ts - TypeScript types for window.api

## How It Works
- **Request-Response** (invoke/handle): Used for CRUD operations, git commands, license checks
  - Renderer: `window.api.getWorkspaces()` -> Preload: `ipcRenderer.invoke('get-workspaces')` -> Main: `ipcMain.handle('get-workspaces', handler)`
  - Returns `IPCResult<T>` with success/data/error/errorType
- **Fire-and-Forget** (send/on): Used for terminal input
  - Renderer: `window.api.writeTerminal(id, data)` -> `ipcRenderer.send('terminal-input', id, data)`
- **Event Streaming** (webContents.send/on): Used for terminal output, port updates
  - Main: `win.webContents.send('terminal-output-{id}', data)` -> Renderer: `window.api.onTerminalData(id, cb)`
  - Broadcasts to ALL BrowserWindows - renderer filters by session ID
- **Adding a new IPC channel** requires changes in 3 files:
  1. Main: add `ipcMain.handle('channel', handler)` in index.ts
  2. Preload: add method in `contextBridge.exposeInMainWorld()` in index.ts
  3. Types: add method signature in window.d.ts

## Entry Points
- Any renderer component calling window.api methods

## Gotchas
- Terminal output broadcasts to ALL windows - each TerminalView filters by its own ID
- Event listeners from `ipcRenderer.on()` must be cleaned up (returned function)
- License gate errors use `errorType: 'UPGRADE_REQUIRED'`, not HTTP status codes
- Git operations use `execWithShell()` in main process for PATH resolution
- Fullscreen terminal window receives same broadcasts as main window
- CLI session IPC: `update-session-cli-info`, `clear-session-cli-info`, `rewrite-cli-command` (invoke/handle)
- CLI session event: `cli-session-detected` (main → renderer broadcast via webContents.send)

## See Also
- module:main-process
- module:preload-bridge
- module:renderer-app
