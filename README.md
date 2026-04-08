# CLI Manager

A powerful Electron-based terminal manager that lets you organize multiple workspaces, terminal sessions, Git worktrees, and more — all in one place.

## Features

- **Workspace Management** — Add folders as workspaces and manage multiple terminal sessions per workspace
- **Terminal Sessions** — Create, rename, reorder, and switch between sessions without losing state
- **Git Worktree Support** — Create and manage Git worktrees as independent workspaces
- **GitHub Integration** — Push branches, create pull requests, and check workflow status via `gh` CLI
- **Port Monitoring** — Real-time detection of local development server ports (macOS)
- **Session Memo** — Per-session notepad with auto-save for quick notes
- **Custom Templates** — Save frequently used commands as templates for fast session creation
- **Split View** — View multiple terminals side by side
- **File Search** — Search files and content across your workspace
- **Keyboard Shortcuts** — Fully configurable keyboard shortcuts

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [pnpm](https://pnpm.io/) v8 or later
- [Git](https://git-scm.com/)
- [gh CLI](https://cli.github.com/) (optional, required for GitHub integration)

## Getting Started

### Install dependencies

```bash
pnpm install
```

### Start development server

```bash
pnpm dev
```

This starts the Electron app with HMR (Hot Module Replacement) enabled.

## Build

```bash
pnpm build
```

The built app will be output to the `dist/` directory.

### Preview the built app

```bash
pnpm preview
# or
pnpm start
```

## Type Check

```bash
pnpm typecheck
```

## Project Structure

```
src/
  main/         # Electron main process (IPC handlers, terminal management)
  preload/      # Context bridge between main and renderer
  renderer/     # React frontend
    src/
      components/   # UI components
      hooks/        # Custom React hooks
      utils/        # Utility functions
  shared/       # Shared TypeScript types
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute.

## License

MIT — see [LICENSE](./LICENSE) for details.
