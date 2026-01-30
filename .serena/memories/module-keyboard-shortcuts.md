# module:keyboard-shortcuts
<!-- Updated: 2026-01-30 -->

## What
Centralized keyboard shortcut handler using capture-phase keydown listener to intercept shortcuts before xterm.js consumes them.

## Key Files
- src/renderer/src/hooks/useKeyboardShortcuts.ts - Hook with all shortcut logic (~208 lines)
- src/shared/types.ts:254-282 - ShortcutAction, KeyBinding, KeyboardShortcutMap, DEFAULT_SHORTCUTS

## How It Works
- `useKeyboardShortcuts()` hook registers a capture-phase `keydown` listener on `window`
- Capture phase ensures shortcuts fire before xterm.js (which listens in bubble phase)
- Only processes events with at least one modifier key (meta/ctrl/shift/alt)
- `matchShortcut()` compares KeyboardEvent against KeyBinding (key + modifiers)
- Shortcuts merge: user overrides from `settings.keyboard.shortcuts` over DEFAULT_SHORTCUTS
- `toggleSettings` (Cmd+,) is handled first and works even when modals are open
- Input guard skips shortcuts when focus is on `<input>` or real `<textarea>` (not xterm)
- xterm.js detection: textarea inside `.xterm` container is NOT treated as a real input field
- When modals (settings/fileSearch) are open, all shortcuts except toggleSettings are suppressed

## Supported Actions
- nextSession/prevSession (Cmd+]/[) - Cycle terminal tabs
- nextWorkspace/prevWorkspace (Cmd+Shift+]/[) - Cycle workspaces with sessions
- nextSplitPane/prevSplitPane (Cmd+`/Cmd+Shift+`) - Cycle split view panes
- toggleSidebar (Cmd+B) - Show/hide sidebar
- toggleSettings (Cmd+,) - Open/close settings
- fileSearch/contentSearch (Cmd+P / Cmd+Shift+F) - Open search modal
- newSession (Cmd+T) - Create new terminal session

## Entry Points
- Hook consumed in App.tsx, wired to all navigation/toggle callbacks

## Gotchas
- xterm.js uses a hidden `<textarea>` for keyboard capture inside `.xterm` container
- The input guard must use `el.closest('.xterm')` to distinguish xterm's textarea from real textareas
- Without this, all shortcuts fail when terminal has focus (the bug fixed on 2026-01-30)
- Cmd+C/Cmd+V are NOT intercepted — they have no matching ShortcutAction, so they pass through to xterm
- Split view navigation delegates from navigateSession when splitLayout is active

## See Also
- module:renderer-app
- module:terminal-view
- module:settings
- module:shared-types
