# AGENTS.md

This file provides instructions for Codex/oh-my-codex when working in this repository.

## Project Overview
CLImanger is an Electron-based terminal management application.
It supports multiple workspaces and terminal sessions, manages Git worktrees as separate workspaces, includes GitHub integration, and monitors local ports.

## Tech Stack
- Framework: Electron + React
- Build Tool: electron-vite
- UI: TailwindCSS + framer-motion
- Terminal: xterm.js + node-pty
- Storage: electron-store
- Git: simple-git
- GitHub: gh CLI
- Package Manager: pnpm

## Development Commands
- pnpm dev: start dev server (HMR)
- pnpm build: production build
- pnpm preview: preview built app
- pnpm start: alias for preview
- pnpm typecheck: run type check

## Architecture

### Process Structure (Electron Multi-Process)
1. Main Process (`src/main/`)
   - `index.ts`: app bootstrap, IPC handlers, workspace/session orchestration
   - `TerminalManager.ts`: node-pty terminal process creation/management
   - `PortManager.ts`: localhost port monitoring (5s interval on macOS/Linux)
2. Renderer Process (`src/renderer/`)
   - `App.tsx`: main app shell and state
   - `components/Sidebar/*`: modular sidebar components
   - `components/TerminalView.tsx`: xterm-based terminal rendering
   - `components/StatusBar.tsx`: port monitor display
   - `components/GitPanel.tsx`: git status/workflow UI
   - `components/Settings.tsx`: user settings
   - `hooks/`: custom hooks (`useWorkspaceBranches`, `useTemplates`)
   - `constants/`: shared constants and utility styles
3. Preload (`src/preload/`)
   - `index.ts`: IPC bridge via contextBridge
   - `index.d.ts`: preload types
4. Shared (`src/shared/`)
   - `types.ts`: shared TypeScript types

## Architecture Notes
- Preserve modular component boundaries.
- Keep logic in hooks/services rather than large monolithic components.
- Reuse utilities and avoid duplication.
- Maintain TypeScript type safety for props and state.

## Key Features
1. Workspace Management
   - Add/remove folders as workspaces
   - Manage terminal sessions per workspace
   - Store independent session lists for each workspace
2. Playground
   - Auto-create temporary working directories (Downloads, timestamped)
3. Git Worktree Support (NEW)
   - Worktree shown as nested workspace
   - Each worktree workspace can have multiple sessions
   - Auto-create on branch entry, auto-remove via `git worktree remove` on deletion
4. GitHub Integration (NEW)
   - Push worktree branch (`git push --set-upstream`)
   - Create PR (`gh pr create`)
   - Workflow status checks
5. Port Monitoring
   - Real-time local port detection
   - Port range filter
6. Session Persistence
   - Keep terminal sessions mounted in DOM and hide inactive tabs with `display: none`
7. Custom Terminal Templates
   - Save command templates (name, icon, description, command)
   - Use templates when creating sessions

## Data Flow
User action (Renderer) -> IPC (Preload) -> Main handlers -> (electron-store / simple-git / gh) -> Renderer update.

## Terminal Session Lifecycle
1. User adds session
2. Main creates session id and persists metadata
3. Renderer mounts TerminalView
4. TerminalView requests `terminal-create` via IPC
5. Main TerminalManager spawns node-pty process
6. Output is emitted via `terminal-output-{id}` channel
7. TerminalView renders output in xterm

## Storage Schema (electron-store)
```ts
{
  workspaces: [
    {
      id: string,
      name: string,
      path: string,
      sessions: [
        {
          id: string,
          name: string,
          cwd: string,
          type: 'regular' | 'worktree'
        }
      ],
      createdAt: number,
      isPlayground?: boolean,
      parentWorkspaceId?: string,
      branchName?: string
    }
  ],
  playgroundPath: string,
  customTemplates: TerminalTemplate[],
  settings: UserSettings
}
```

## Important Operational Notes

### macOS-Specific / Platform Notes
- `lsof` port monitor is macOS/Linux focused.
- Vibrancy effect is macOS-specific.
- Shell defaults: zsh on macOS, powershell.exe on Windows.

### External Command Execution (PATH)
Finder/Spotlight launches may miss shell PATH.
Use login shell for external commands (`code`, `gh`, `git`) via:
- `exec('/bin/zsh -l -c "<command>"')`

### Git Worktree details
- Worktree path pattern: `{workspace-path}/../{workspace-name}-worktrees/{branch-name}`
- Removal uses `git worktree remove --force`
- Prevent creating duplicate branch worktrees

### GitHub Integration
- gh CLI must be installed and authenticated.
- Push command: `git push origin <branch> --set-upstream`
- PR flow uses `gh pr create` after push

## IPC API Surface

Workspace:
- `get-workspaces`
- `add-workspace`
- `add-worktree-workspace`
- `remove-workspace`
- `add-session`
- `remove-session`

Git:
- `git-list-branches`
- `git-checkout`
- `git-status`
- `git-commit`
- `git-push`
- `git-pull`

GitHub:
- `gh-check-auth`
- `gh-push-branch`
- `gh-create-pr-from-worktree`
- `gh-list-prs`
- `gh-workflow-status`

Communication pattern:
- Invoke/Handle: async request-response
- Send/On: broadcast terminal stream and port updates

## Premium Feature Limits
Defined in `src/shared/types.ts` (`PLAN_LIMITS`).

- Free: Workspaces 2 / Sessions 5 / Templates 3 / no worktree / no split view
- Pro: Unlimited workspaces/sessions/templates, worktree on, split view on

Error contract:
- Limit exceeded error type must be `UPGRADE_REQUIRED`
- Display/upgrade path uses `https://solhun.com`

## Development Policy
- Keep components concise; target below 300 lines where practical.
- Use explicit types and avoid implicit state.
- Use custom hooks for complex logic.
- Reuse utilities and avoid duplication.
- Add JSDoc for complex logic.

## Language Policy
- Application code: variable names, comments, user-visible UI text, logs, errors should be in English.
- Explanations to humans can be Korean.

## Debugging
- Main-process logs -> terminal
- Renderer logs -> DevTools (F12)
- Track IPC with both sides when troubleshooting

## Security & Production
- Do not hardcode personal data (paths, API keys, names).
- Ensure config/behavior is robust for different user environments.
- Before production release, verify commits are pushed.

## Process Rules
- Do not edit code before understanding root cause.
- Investigate deeply: runtime behavior -> failure reason -> flow impact -> side effects.
- Propose solution and obtain confirmation before editing.

## Developer Tooling
- There is a commented-out Developer tools UI entry in `Settings.tsx` for testing dialog actions.
- Treat any commented sections as intentionally disabled; enable only when requested.

