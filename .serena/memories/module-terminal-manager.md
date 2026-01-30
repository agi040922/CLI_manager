# module:terminal-manager
<!-- Updated: 2026-01-30 -->

## What
Manages node-pty terminal processes, handles I/O streaming, output buffering for previews, and shell resolution.

## Key Files
- src/main/TerminalManager.ts - PTY spawn, I/O, buffer management (~370 lines)
- src/main/CLISessionTracker.ts - CLI tool command interception (injected dependency)

## How It Works
- `createTerminal(id, cwd, cols, rows, shell?)` spawns node-pty process with login shell args
- `resolveShell(requestedShell)` validates shell binary existence, falls back to zsh/bash/sh
- PTY spawned with `xterm-256color` TERM, UTF-8 encoding, and `PROMPT_EOL_MARK=''`
- Output data broadcast to ALL BrowserWindows via `terminal-output-{id}` channel
- `appendToBuffer(id, data)` maintains rolling preview buffer (last 10 lines per terminal)
- `stripAnsi(text)` removes ANSI escape codes (CSI, OSC, DCS + carriage returns)
- `isMeaningfulLine(line)` filters out separators, prompt chars, Claude Code status, fragments
- `hasRunningProcess(id)` uses `pgrep -P {pid}` to detect child processes
- `killAll()` terminates all PTY processes on app quit
- Optional `CLISessionTracker` injected via constructor for CLI command interception
- `terminal-input` handler routes data through `cliTracker.processInput()` before PTY write
- `terminal-kill` handler calls `cliTracker.cleanup(id)` to clear input buffers

## Entry Points
- IPC: `terminal-create`, `terminal-input`, `terminal-resize`, `terminal-kill`
- IPC: `terminal-has-running-process`, `terminal-get-preview`

## Gotchas
- Shell args: `['--login']` on Unix, `[]` on Windows
- `pgrep` returns exit code 1 when no children found (not an error)
- Output broadcast goes to ALL windows - renderer filters by session ID
- Preview buffer is 10 lines max, with duplicate line detection (last 5 lines)
- Login shell mode ensures ~/.zshrc is loaded for proper PATH

## See Also
- module:main-process
- module:cli-session-tracker
- flow:terminal-lifecycle
- flow:cli-session-resume
