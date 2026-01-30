# module:preload-bridge
<!-- Updated: 2026-01-30 -->

## What
Electron preload script exposing safe IPC methods to renderer via contextBridge, with TypeScript type definitions.

## Key Files
- src/preload/index.ts - contextBridge API exposure (~204 lines)
- src/preload/window.d.ts - TypeScript type definitions for window.api (~150 lines)

## How It Works
- Uses `contextBridge.exposeInMainWorld('api', { ... })` to expose IPC methods
- All methods wrap `ipcRenderer.invoke()` (request-response) or `ipcRenderer.send()` (fire-and-forget)
- Event listeners use `ipcRenderer.on()` with cleanup via returned removeListener function
- 150+ methods exposed covering: workspace CRUD, session CRUD, git ops, GitHub ops, terminal I/O, port monitoring, license, settings, file ops, editor, dialogs, zoom, updates

## Entry Points
- Renderer accesses via `window.api.methodName()`
- Types available via `window.d.ts` augmentation

## Gotchas
- Every new IPC channel needs: main handler (index.ts) + preload exposure (index.ts) + type def (window.d.ts)
- Terminal data uses `on`/`send` pattern (streaming), not `invoke` (request-response)
- Event listeners return cleanup functions - must be called to prevent memory leaks
- Port updates and terminal output are broadcast to ALL windows

## See Also
- module:main-process
- flow:ipc-communication
