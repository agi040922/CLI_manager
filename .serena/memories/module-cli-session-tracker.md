# module:cli-session-tracker
<!-- Updated: 2026-01-30 -->

## What
Intercepts CLI tool commands (Claude Code, future Codex) in terminals to inject `--session-id` tracking, enabling transparent auto-resume on app restart.

## Key Files
- src/main/CLISessionTracker.ts - Core interception, buffering, rewrite, filtering (~213 lines)

## How It Works
- Registers CLI tools as `CLIToolConfig` objects (currently: claude)
- **Manual typing interception** (`processInput`):
  - Buffers single printable ASCII chars per terminal in `lineBuffers` Map
  - Handles backspace (trim buffer), Ctrl+C/D (clear buffer), Ctrl+U (clear buffer)
  - Multi-byte data (paste, escape sequences) clears buffer and passes through
  - On Enter: checks buffer against CLI tool patterns via `shouldIntercept()`
  - If match: sends Ctrl+U (clear line) + rewritten command with `--session-id <uuid>` to PTY
  - Fires `onSessionDetected` callback with terminal ID, tool name, and session UUID
- **Template/initialCommand rewriting** (`rewriteCommand`):
  - Called via IPC from TerminalView before sending initialCommand to PTY
  - Same filtering logic as manual interception
  - Returns rewritten command + session metadata, or null if no match
- **Filtering** (`shouldIntercept`):
  - Splits command on whitespace, matches first token against tool's `commands` list
  - Supports full paths (extracts basename: `/usr/local/bin/claude` → `claude`)
  - Skips non-interactive subcommands: `install`, `uninstall`, `update`, `config`, `mcp`, `doctor`, `api-key`
  - Skips commands with existing session flags: `--session-id`, `--resume`, `-r`, `-c`, `-p`, `--help`, etc.
- **Resume command generation** (`getResumeCommand`):
  - Returns `claude --resume <id>` from stored tool name + session ID

## Entry Points
- `processInput()` called from TerminalManager on every `terminal-input` IPC event
- `rewriteCommand()` called via `rewrite-cli-command` IPC from renderer
- `onSessionDetected` callback set in main index.ts

## Gotchas
- Only buffers ASCII printable chars (0x20-0x7E); non-ASCII clears buffer
- Tab-completed and arrow-key recalled commands NOT intercepted (shell-side completion)
- Only works at main shell prompt (not inside vim, ssh, nested shells)
- Extensible: add Codex by adding one `CLIToolConfig` entry to DEFAULT_CLI_TOOLS array
- `cleanup(terminalId)` must be called on terminal kill to prevent buffer leaks

## See Also
- flow:cli-session-resume
- module:terminal-manager
- module:terminal-view
