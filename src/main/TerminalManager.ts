import { ipcMain } from 'electron'
import os from 'os'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
const pty = require('node-pty')

// Default shell based on platform
const DEFAULT_SHELL = os.platform() === 'win32' ? 'powershell.exe' : 'zsh'

// Standard shell paths to try as fallback
const FALLBACK_SHELLS = os.platform() === 'win32'
    ? ['powershell.exe', 'cmd.exe']
    : ['/bin/zsh', '/bin/bash', '/bin/sh']

export class TerminalManager {
    private terminals: Map<string, any> = new Map()

    constructor() {
        this.setupIpc()
    }

    /**
     * Resolve and validate shell path
     * - If absolute path: check file exists
     * - If relative: use which command to find
     * - Fallback to default shells if not found
     */
    private resolveShell(requestedShell?: string): string {
        // If no shell requested, use default
        if (!requestedShell) {
            return DEFAULT_SHELL
        }

        // Absolute path - check if exists
        if (requestedShell.startsWith('/')) {
            if (existsSync(requestedShell)) {
                return requestedShell
            }
            console.warn(`Shell not found at ${requestedShell}, trying fallbacks...`)
        } else {
            // Relative path - try to resolve with which
            try {
                const resolvedPath = execSync(`which ${requestedShell}`, { encoding: 'utf-8' }).trim()
                if (resolvedPath && existsSync(resolvedPath)) {
                    return resolvedPath
                }
            } catch {
                console.warn(`Shell '${requestedShell}' not found in PATH, trying fallbacks...`)
            }
        }

        // Try fallback shells
        for (const fallback of FALLBACK_SHELLS) {
            if (fallback.startsWith('/')) {
                if (existsSync(fallback)) {
                    console.log(`Using fallback shell: ${fallback}`)
                    return fallback
                }
            } else {
                try {
                    const resolved = execSync(`which ${fallback}`, { encoding: 'utf-8' }).trim()
                    if (resolved && existsSync(resolved)) {
                        console.log(`Using fallback shell: ${resolved}`)
                        return resolved
                    }
                } catch {
                    // Continue to next fallback
                }
            }
        }

        // Last resort: return default
        console.warn(`No valid shell found, using default: ${DEFAULT_SHELL}`)
        return DEFAULT_SHELL
    }

    private setupIpc() {
        ipcMain.handle('terminal-create', (_, id: string, cwd: string, cols: number, rows: number, shell?: string) => {
            this.createTerminal(id, cwd, cols, rows, shell)
            return true
        })

        ipcMain.on('terminal-input', (_, id: string, data: string) => {
            const ptyProcess = this.terminals.get(id)
            if (ptyProcess) {
                ptyProcess.write(data)
            }
        })

        ipcMain.handle('terminal-resize', (_, id: string, cols: number, rows: number) => {
            const ptyProcess = this.terminals.get(id)
            if (ptyProcess) {
                ptyProcess.resize(cols, rows)
            }
        })

        ipcMain.handle('terminal-kill', (_, id: string) => {
            const ptyProcess = this.terminals.get(id)
            if (ptyProcess) {
                ptyProcess.kill()
                this.terminals.delete(id)
            }
        })

        // Check if terminal has running child processes
        ipcMain.handle('terminal-has-running-process', (_, id: string): boolean => {
            const ptyProcess = this.terminals.get(id)
            if (!ptyProcess) return false

            try {
                const pid = ptyProcess.pid
                // Use pgrep to check for child processes (macOS/Linux)
                // Returns non-empty if there are child processes
                const result = execSync(`pgrep -P ${pid}`, { encoding: 'utf-8' }).trim()
                return result.length > 0
            } catch {
                // pgrep returns exit code 1 if no processes found
                return false
            }
        })
    }

    private createTerminal(id: string, cwd: string, cols: number = 80, rows: number = 30, requestedShell?: string) {
        // 이미 존재하는 터미널이면 생성 건너뛰기
        if (this.terminals.has(id)) {
            console.log(`Terminal ${id} already exists, skipping creation`)
            return
        }

        // Resolve shell with validation and fallback
        const shell = this.resolveShell(requestedShell)
        console.log(`Creating terminal with shell: ${shell}`)

        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd,
            encoding: 'utf8',  // Enable UTF-8 for Korean/CJK input
            env: {
                ...process.env,
                TERM_PROGRAM: 'CLImanger',
                // Disable zsh's partial line indicator (the % that appears when no newline at end)
                PROMPT_EOL_MARK: '',
                // Ensure UTF-8 locale for proper Korean input
                LANG: process.env.LANG || 'en_US.UTF-8',
                LC_ALL: process.env.LC_ALL || 'en_US.UTF-8'
            } as any
        })

        ptyProcess.onData((data: string) => {
            // Send data to renderer
            // We need a way to send to the specific window or all windows
            // For now, we'll broadcast, but ideally we should target the sender
            // But since we are in the main process, we can use webContents
            // However, we don't have the sender webContents here easily without passing it
            // So we will emit a global event that the renderer listens to
            // But we need to filter by ID on the renderer side
            const windows = require('electron').BrowserWindow.getAllWindows()
            windows.forEach((win: any) => {
                win.webContents.send(`terminal-output-${id}`, data)
            })
        })

        this.terminals.set(id, ptyProcess)
    }
}
