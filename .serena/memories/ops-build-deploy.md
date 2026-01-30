# ops:build-deploy
<!-- Updated: 2026-01-30 -->

## What
Build, test, and deployment commands and configuration for the Electron app.

## Key Files
- package.json - Scripts and dependencies
- electron-vite.config.ts - Build configuration (main/preload/renderer)
- electron-builder.yml - Distribution packaging config
- tsconfig.json - TypeScript configuration

## How It Works
- **Dev**: `pnpm dev` starts electron-vite HMR server (localhost:5173 for renderer)
- **Type Check**: `pnpm typecheck` runs tsc --noEmit across all processes
- **Build**: `pnpm build` bundles main (CJS), preload (CJS), renderer (ESM+React) via electron-vite
- **Preview**: `pnpm preview` or `pnpm start` runs built app
- **Distribution**:
  - macOS: `pnpm build:mac` -> DMG + ZIP (x64 + arm64), code signing + notarization
  - Windows: `pnpm build:win` -> NSIS installer (x64)
  - Linux: `pnpm build:linux` -> AppImage + DEB
- **Auto-Update**: `pnpm publish:mac` / `pnpm publish:all` -> GitHub releases with electron-updater
- **Package Manager**: pnpm (strict)
- **Module System**: Main/Preload = CommonJS, Renderer = ESM

## Entry Points
- `pnpm dev` for development
- `pnpm build` + `pnpm build:mac` for release

## Gotchas
- electron-vite bundles 3 processes separately (not one config)
- Main/Preload use CommonJS (`type: "commonjs"` in package.json)
- macOS notarization requires APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID env vars
- Code signing requires CSC_LINK, CSC_KEY_PASSWORD env vars
- node-pty is a native module - rebuilt per platform via electron-rebuild
- ASAR compression enabled - native modules use `asarUnpack`

## See Also
- module:main-process
