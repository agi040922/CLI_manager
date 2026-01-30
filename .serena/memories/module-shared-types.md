# module:shared-types
<!-- Updated: 2026-01-30 -->

## What
Shared TypeScript type definitions used by both main and renderer processes.

## Key Files
- src/shared/types.ts - All shared interfaces, types, constants (~247 lines)

## How It Works
- Core interfaces: Workspace, TerminalSession, TerminalTemplate, UserSettings
- License types: PlanType (free/monthly/annual/lifetime), LicenseStatus, LicenseData, LicenseInfo
- Feature limits: FeatureLimits interface + PLAN_LIMITS constant (single source of truth)
- IPC result pattern: `IPCResult<T>` with success/data/error/errorType
- Error types: ErrorType union covering git, GitHub, license, and network errors
- Split view: SplitTerminalLayout (max 4), FullscreenTerminalLayout (max 6)
- Session status: SessionStatus (idle/running/ready/error), NotificationStatus
- Editor types: EditorType union (vscode/cursor/antigravity/custom)
- Hooks: HooksSettings with ClaudeCodeHooksSettings nested
- Keyboard shortcuts: ShortcutAction (11 actions), KeyBinding, KeyboardShortcutMap, DEFAULT_SHORTCUTS

## Entry Points
- Imported by main process, renderer, and preload

## Gotchas
- PLAN_LIMITS is the single source of truth for feature gates
- `-1` means unlimited in numeric limits
- Workspace has optional fields: isPlayground, isHome, parentWorkspaceId, branchName, baseBranch
- TerminalSession.type is 'regular' | 'worktree'
- TerminalSession has optional `cliSessionId` and `cliToolName` for CLI auto-resume tracking

## See Also
- module:license-manager
- module:main-process
