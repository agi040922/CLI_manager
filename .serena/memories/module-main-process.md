# module:main-process
<!-- Updated: 2026-01-30 -->

## What
Electron main process orchestrating all IPC handlers, app lifecycle, workspace/session CRUD, git/GitHub operations, and manager delegation.

## Key Files
- src/main/index.ts - Core app init, all IPC handlers, window management (~2250 lines)
- src/main/TerminalManager.ts - PTY process management (delegated)
- src/main/PortManager.ts - Port monitoring (delegated)
- src/main/LicenseManager.ts - License validation (delegated)

## How It Works
- `createWindow()` creates main BrowserWindow with vibrancy effect (macOS)
- `ensureHomeWorkspace()` auto-creates home workspace on launch (username@hostname format)
- `execWithShell(cmd, opts)` wraps all external commands in login shell (`/bin/zsh -l -c "cmd"`) to resolve PATH
- `fixPath()` extracts PATH from login shell at app start (fixes Finder/Spotlight launches)
- IPC handlers registered for: workspaces (CRUD + reorder), sessions (CRUD + reorder + rename), git (status/stage/commit/push/pull/merge/reset/branches), GitHub CLI (auth/PR/workflow/push), terminal (delegated to TerminalManager), ports (delegated to PortManager), license (delegated to LicenseManager), file ops (search/read/open), editor (open workspace/file), updates (check/download/install)
- License checks gate feature-creation operations, returning `{ success: false, errorType: 'UPGRADE_REQUIRED' }`
- `createFullscreenTerminalWindow()` opens separate BrowserWindow for grid terminal view
- Background/tray mode keeps terminals running when window closes
- Auto-updater via electron-updater with GitHub releases

## Entry Points
- `app.whenReady()` triggers `createWindow()` and manager initialization
- All IPC handlers are entry points from renderer process

## Gotchas
- External commands (git, gh, code) MUST use `execWithShell()` to load PATH properly
- File paths in editor commands need single-quote escaping
- ripgrep search has 3-level fallback: bundled → system → Node.js
- Git merge conflict detection uses MERGE_HEAD file existence, not just conflicted files array
- Terminal zoom intercepts Cmd+/-/0 globally, sends as IPC event (not native zoom)
- Home workspace has special behavior: no delete button, custom path from settings

## See Also
- module:terminal-manager
- module:port-manager
- module:license-manager
- flow:ipc-communication
