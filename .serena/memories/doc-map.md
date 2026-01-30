# doc-map
<!-- Updated: 2026-01-30 -->

## What
Navigation guide for the CLI_manager project - read this first in any new session.

## Project Summary
Electron + React terminal management app with workspace/session management, Git worktree support, GitHub integration, port monitoring, and license-based feature gating.

## Architecture at a Glance
```
Renderer (React) <-> Preload (contextBridge) <-> Main (Electron) <-> OS/Git/GitHub
```
- Main process: src/main/ (4 files, ~3150 lines)
- Renderer: src/renderer/src/ (15+ components, ~10300 lines)
- Preload: src/preload/ (2 files, ~350 lines)
- Shared: src/shared/types.ts (~250 lines)
- Total: ~14,000 lines TypeScript

## Memory Index

### Modules (what each part does)
- **module-main-process** - Electron main: IPC handlers, app lifecycle, manager orchestration
- **module-terminal-manager** - node-pty spawn, I/O streaming, preview buffers
- **module-port-manager** - localhost port monitoring via lsof
- **module-license-manager** - Lemon Squeezy license, plan limits
- **module-renderer-app** - Root React component, all top-level state
- **module-sidebar** - 7-file modular sidebar: workspace/session UI, drag-and-drop, context menus
- **module-terminal-view** - xterm.js wrapper, resize, status polling, file path links
- **module-git-panel** - Git status, staging, commit, push/pull, GitHub PR/workflow
- **module-settings** - Tabbed settings UI (~1960 lines), all configuration
- **module-preload-bridge** - IPC bridge, 150+ exposed methods
- **module-shared-types** - TypeScript interfaces, PLAN_LIMITS constant

### Flows (how things connect)
- **flow-ipc-communication** - Request-response vs streaming patterns, 3-file change rule
- **flow-terminal-lifecycle** - Session creation -> PTY spawn -> I/O -> tab switch -> destruction
- **flow-worktree-management** - Worktree create -> workspace link -> sessions -> cleanup
- **flow-license-check** - Feature gate enforcement, validation, upgrade dialog

### Standards & Ops
- **std-code-patterns** - Coding conventions, component rules, premium feature checklist
- **ops-build-deploy** - Dev/build/release commands, platform configs

## Quick Reference: File Map

### Main Process (src/main/)
| File | Lines | Purpose |
|------|-------|---------|
| index.ts | ~2250 | App init, ALL IPC handlers, window mgmt |
| TerminalManager.ts | ~360 | PTY processes, I/O, preview buffer |
| PortManager.ts | ~130 | lsof port monitoring |
| LicenseManager.ts | ~415 | Lemon Squeezy API, feature gates |

### Renderer Components (src/renderer/src/components/)
| File | Lines | Purpose |
|------|-------|---------|
| Sidebar/index.tsx | ~830 | Workspace list, templates, drag-drop |
| Sidebar/SessionItem.tsx | ~330 | Session row, status, preview |
| Sidebar/ContextMenus.tsx | ~480 | Right-click menus |
| Sidebar/WorkspaceItem.tsx | ~220 | Workspace expand/collapse |
| Sidebar/Modals.tsx | ~190 | Branch prompt, confirmation |
| Sidebar/WorktreeItem.tsx | ~140 | Worktree workspace row |
| TerminalView.tsx | ~770 | xterm.js terminal |
| GitPanel.tsx | ~1020 | Git operations UI |
| Settings.tsx | ~1960 | All settings |
| StatusBar.tsx | ~240 | Port display |
| FileSearch.tsx | ~400 | File/content search |
| FilePreview.tsx | ~290 | File preview |
| FullscreenTerminalView.tsx | ~150 | Grid terminal layout |
| SplitTerminalHeader.tsx | ~190 | Split view controls |

### Other Key Files
| File | Lines | Purpose |
|------|-------|---------|
| App.tsx | ~1300 | Root component, all state |
| src/shared/types.ts | ~250 | Shared TypeScript types |
| src/preload/index.ts | ~200 | IPC bridge (150+ methods) |
| utils/terminalPatterns.ts | ~630 | Terminal output regex |
| utils/filePathLinkProvider.ts | ~230 | File path hyperlinks |
| hooks/useWorkspaceBranches.ts | ~44 | Branch state management |
| hooks/useTemplates.ts | ~31 | Template loading |

## Where to Start
- **Understanding the app**: Read module-main-process, then module-renderer-app
- **Adding a feature**: Read std-code-patterns, then the relevant module memory
- **Adding IPC channel**: Read flow-ipc-communication (3-file change rule)
- **Terminal work**: Read flow-terminal-lifecycle, module-terminal-manager, module-terminal-view
- **Git/GitHub work**: Read module-git-panel, module-main-process
- **License/premium**: Read flow-license-check, module-license-manager, module-shared-types
- **UI components**: Read module-sidebar, module-settings
- **Build/release**: Read ops-build-deploy
