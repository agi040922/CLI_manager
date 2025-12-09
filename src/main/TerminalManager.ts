import { ipcMain } from 'electron'
import os from 'os'
const pty = require('node-pty')

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'zsh'

export class TerminalManager {
    private terminals: Map<string, any> = new Map()

    constructor() {
        this.setupIpc()
    }

    private setupIpc() {
        ipcMain.handle('terminal-create', (_, id: string, cwd: string, cols: number, rows: number) => {
            this.createTerminal(id, cwd, cols, rows)
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
    }

    private createTerminal(id: string, cwd: string, cols: number = 80, rows: number = 30) {
        // 이미 존재하는 터미널이면 생성 건너뛰기
        if (this.terminals.has(id)) {
            console.log(`Terminal ${id} already exists, skipping creation`)
            return
        }

        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd,
            env: {
                ...process.env,
                TERM_PROGRAM: 'CLImanger',
                // Disable zsh's partial line indicator (the % that appears when no newline at end)
                PROMPT_EOL_MARK: ''
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
