# module:terminal-view
<!-- Updated: 2026-01-30 -->

## What
xterm.js terminal UI component handling PTY communication, resizing, font customization, keyboard shortcuts, and session status tracking.

## Key Files
- src/renderer/src/components/TerminalView.tsx - xterm.js wrapper (~770 lines)
- src/renderer/src/components/FullscreenTerminalView.tsx - Grid layout for multiple terminals (~150 lines)
- src/renderer/src/components/SplitTerminalHeader.tsx - Split view header controls (~190 lines)
- src/renderer/src/utils/terminalPatterns.ts - Regex patterns for status detection (~630 lines)
- src/renderer/src/utils/filePathLinkProvider.ts - File path hyperlinks in terminal (~230 lines)

## How It Works
- On mount, creates xterm.js Terminal with FitAddon and calls `terminal-create` IPC
- PTY data received via `onTerminalData(id, callback)` listener
- User input sent via `writeTerminal(id, data)` IPC
- ResizeObserver triggers fit() with debounce (prevents race conditions)
- Scroll state tracked to pause resize-triggered reflows during manual scroll
- Font size/family from settings, adjustable via Cmd+/-/0
- Context menu extracts file paths from terminal output for quick actions
- Accepts `resumeCommand` prop (priority over `initialCommand`) for CLI session auto-resume
- Template `initialCommand` rewritten via `rewriteCliCommand` IPC to inject `--session-id`
- Session status polling (500ms): detects Claude Code activity via output patterns
- `terminalPatterns.ts` has extensive regex for Claude Code status, file paths, errors, URLs
- `filePathLinkProvider.ts` creates clickable hyperlinks for file paths in output

## Entry Points
- TerminalView rendered per session in App.tsx (hidden when inactive, never unmounted)
- FullscreenTerminalView rendered in separate BrowserWindow

## Gotchas
- fit() has safeguards: checks dimensions > 0, wraps in try-catch, debounced
- Scroll detection: if user scrolled up, auto-scroll paused until they scroll to bottom
- Status polling has cooldown after session switch to prevent false positives
- Terminal instances persist in DOM - switching tabs only toggles display property
- File path links support absolute and relative paths, with workspace-relative resolution

## See Also
- module:terminal-manager
- module:renderer-app
- module:cli-session-tracker
- flow:terminal-lifecycle
- flow:cli-session-resume
