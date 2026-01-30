# module:settings
<!-- Updated: 2026-01-30 -->

## What
Settings UI component with tabbed categories for theme, terminal, editor, git, ports, notifications, hooks, templates, and license management.

## Key Files
- src/renderer/src/components/Settings.tsx - All settings sections (~1960 lines)
- src/renderer/src/components/LicenseVerification/index.tsx - License activation UI (~225 lines)
- src/renderer/src/components/Onboarding/index.tsx - First-run wizard (~147 lines)

## How It Works
- Tab-based navigation: General, Terminal, Editor, Git/GitHub, Ports, Notifications, Hooks, Templates, License
- Settings loaded from electron-store via IPC on mount
- Changes saved immediately via `window.api.saveSettings(settings)`
- Theme toggle: dark/light (affects Tailwind classes globally)
- Terminal: font family picker (system fonts), default shell selector with path validation
- Editor: VSCode, Cursor, Antigravity, or custom path with validation
- Git: username/email config, GitHub auth status, login button
- Ports: enable/disable monitoring, min/max port range filter
- Notifications: per-tool toggle (Claude Code, Codex, Gemini, generic)
- Hooks: Claude Code session monitoring toggle, auto-dismiss timing
- Templates: CRUD for custom terminal templates (name, icon, description, command)
- License: activation form, plan info display, deactivation
- Developer section exists but is commented out (Settings.tsx:261-262)

## Entry Points
- Settings component toggled from App.tsx toolbar

## Gotchas
- Settings.tsx is the largest renderer file (~1960 lines)
- Shell/editor path validation uses IPC to check binary existence
- Template icons mapped via `getTemplateIcon()` from constants/icons.tsx
- GitHub auth uses `gh auth login --web` (opens browser)
- Developer tools section is hidden - uncomment to enable test dialogs
- Free plan description text must match PLAN_LIMITS.free values

## See Also
- module:renderer-app
- module:license-manager
