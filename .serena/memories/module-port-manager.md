# module:port-manager
<!-- Updated: 2026-01-30 -->

## What
Monitors localhost ports using macOS `lsof` command with 5-second polling interval.

## Key Files
- src/main/PortManager.ts - lsof parsing, broadcast, process kill (~130 lines)

## How It Works
- `startMonitoring()` sets up 5000ms interval calling `checkPorts()`
- `checkPorts()` executes `lsof -i -P -n -sTCP:LISTEN` and parses output
- `parseLsof(output)` extracts port, pid, command name from each line
- Deduplicates results by `{port}-{pid}` key
- Fetches CWD for each process via `lsof -a -p {pid} -d cwd -F n`
- Filters to localhost bindings only (127.0.0.1, localhost, *)
- `broadcast(ports)` sends PortInfo[] to all BrowserWindows via `port-update` channel
- `killProcess(pid)` terminates process by PID

## Entry Points
- IPC: `kill-process`, `refresh-ports`
- Auto-start on PortManager instantiation

## Gotchas
- macOS/Linux only (lsof command)
- lsof exit code 1 means no results (expected, not an error)
- On error, broadcasts empty array (no crash)
- Port filtering (min/max range) is done in renderer, not here

## See Also
- module:main-process
