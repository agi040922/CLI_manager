# std:code-patterns
<!-- Updated: 2026-01-30 -->

## What
Standard coding patterns and conventions used across the CLI_manager codebase.

## Key Files
- CLAUDE.md - Full project guidelines
- src/shared/types.ts - Type definitions and constants
- .claude/rules/ - Additional rules (tip-box-style, production-guidelines)

## How It Works
- **Language**: Code/UI in English, explanations in Korean
- **IPC Result Pattern**: All IPC handlers return `IPCResult<T>` with success/data/error/errorType
- **Error Type Convention**: Feature gates use `errorType: 'UPGRADE_REQUIRED'`, all error types in ErrorType union
- **Shell Execution**: External commands wrapped in `execWithShell()` for PATH resolution
- **Component Size**: Max 300 lines per component, extract to custom hooks
- **State Management**: React useState/useEffect in App.tsx (no Redux/Context)
- **Terminal Persistence**: `display: none` not unmount - preserves PTY state
- **Styling**: TailwindCSS classes, framer-motion for animations
- **Icons**: lucide-react library, template icons via getTemplateIcon()
- **Tip Boxes**: `p-3 bg-blue-500/10 border border-blue-500/20 rounded` with `text-xs text-blue-200`, no emojis
- **Premium Feature Addition**: 5-step process (types -> LicenseManager -> IPC -> Renderer -> UI sync)

## Gotchas
- No emojis in tip boxes (use `<strong>Tip:</strong>` text)
- Production app: no hardcoded personal info, handle diverse environments
- Settings.tsx has hidden Developer section (uncomment to enable)
- macOS vibrancy effect used - test on non-mac platforms

## See Also
- CLAUDE.md for full guidelines
- .claude/rules/ for specific style rules
