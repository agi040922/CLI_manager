# flow:cli-session-resume
<!-- Updated: 2026-01-30 -->

## What
End-to-end flow for tracking CLI tool sessions (Claude Code) and auto-resuming them on app restart.

## Key Files
- src/main/CLISessionTracker.ts - Interception and rewrite logic
- src/main/TerminalManager.ts - Routes terminal-input through tracker
- src/main/index.ts - IPC handlers, onSessionDetected callback, store persistence
- src/preload/index.ts + window.d.ts - IPC bridge methods
- src/renderer/src/App.tsx - Resume command computation, exit detection
- src/renderer/src/components/TerminalView.tsx - Sends resume/rewritten commands
- src/shared/types.ts - cliSessionId, cliToolName on TerminalSession

## How It Works

### Flow A: Template Session (e.g., "Claude Code" template)
1. User selects template → `addSession(initialCommand: "claude")`
2. TerminalView mounts → calls `rewriteCliCommand("claude")` IPC
3. Main process returns `{ command: "claude --session-id <uuid>", cliSessionId, cliToolName }`
4. TerminalView calls `updateSessionCliInfo()` to persist, then writes rewritten command to PTY

### Flow B: Manual Typing
1. User types `c-l-a-u-d-e` → each char forwarded to PTY AND buffered in CLISessionTracker
2. User presses Enter → buffer = "claude" → passes `shouldIntercept()` check
3. Tracker sends Ctrl+U (clear line) + `"claude --session-id <uuid>\r"` to PTY via writeFn
4. `onSessionDetected` fires → main process persists to electron-store → notifies renderer via `cli-session-detected` IPC event

### Flow C: Non-Interactive Command (SKIPPED)
1. User types `claude install` → buffer = "claude install"
2. On Enter → `shouldIntercept()` detects "install" in nonInteractiveSubcommands → returns null
3. Enter forwarded normally, no interception

### Flow D: App Restart with Active CLI Session
1. App starts → loads workspaces from store → session has `cliSessionId` + `cliToolName`
2. App.tsx computes `resumeCommand = "claude --resume <id>"`
3. TerminalView mounts → sees `resumeCommand` prop → sends it instead of `initialCommand`
4. Claude Code resumes previous conversation

### Flow E: User Exits Claude → Next Restart Normal
1. User runs Claude Code → Ctrl+C or `/exit` → Claude exits
2. TerminalView's status polling detects `isClaudeCode: true → false` transition
3. App.tsx `handleSessionStatusChange` detects transition → calls `clearSessionCliInfo()` IPC
4. Main process deletes `cliSessionId`/`cliToolName` from session in store
5. On next restart → no `cliSessionId` → template's `initialCommand` runs normally

### Flow F: App Crash While Claude Running
1. Claude running → app crashes → `cliSessionId` still in store (never cleared)
2. App restarts → `cliSessionId` found → sends `claude --resume <id>`
3. Claude resumes (correct crash-recovery behavior)

## Entry Points
- Template selection or manual typing of CLI tool command
- App restart with persisted `cliSessionId`

## Gotchas
- Exit detection relies on TerminalPatternMatcher's `isClaudeCode` polling (500ms interval)
- `cliSessionId` persists through app crashes (intentional: enables crash recovery)
- `cliSessionId` cleared only when Claude Code exits normally (isClaudeCode: true → false)
- Multiple Claude sessions in same workspace: each terminal tracks its own cliSessionId
- Session deletion removes cliSessionId with the session object (no orphans)
- `resumeCommand` prop takes priority over `initialCommand` in TerminalView

## See Also
- module:cli-session-tracker
- flow:terminal-lifecycle
- module:terminal-view
- module:renderer-app
