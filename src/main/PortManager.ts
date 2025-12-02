import { exec } from 'child_process'
import { BrowserWindow, ipcMain } from 'electron'
import { PortInfo } from '../shared/types'
import { promisify } from 'util'

const execAsync = promisify(exec)

export class PortManager {
    private interval: NodeJS.Timeout | null = null

    constructor() {
        // Start monitoring
        this.startMonitoring()
        
        // Register IPC handlers
        ipcMain.handle('kill-process', async (_, pid: number) => {
            return this.killProcess(pid)
        })
    }

    private startMonitoring() {
        // Run immediately
        this.checkPorts()

        // Then every 5 seconds
        this.interval = setInterval(() => {
            this.checkPorts()
        }, 5000)
    }

    private async checkPorts() {
        // lsof -i -P -n -sTCP:LISTEN
        exec('lsof -i -P -n -sTCP:LISTEN', async (error, stdout) => {
            if (error) {
                if (error.code !== 1) {
                    console.error('lsof error:', error)
                }
                this.broadcast([])
                return
            }

            const ports = await this.parseLsof(stdout)
            this.broadcast(ports)
        })
    }

    private async parseLsof(output: string): Promise<PortInfo[]> {
        const lines = output.split('\n')
        const ports: PortInfo[] = []
        const seen = new Set<string>()

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue

            const parts = line.split(/\s+/)
            if (parts.length < 9) continue

            const command = parts[0]
            const pid = parseInt(parts[1])
            const address = parts[8]

            // Only show localhost ports (127.0.0.1 or localhost)
            // User requested to see where it's open, so maybe we should relax this?
            // But for now, let's stick to localhost as per original design but add CWD info.
            if (!address.includes('localhost') && !address.includes('127.0.0.1')) {
                continue
            }

            const portMatch = address.match(/:(\d+)/)
            if (portMatch) {
                const port = parseInt(portMatch[1])
                const key = `${port}-${pid}`

                if (!seen.has(key)) {
                    // Fetch CWD
                    let cwd = ''
                    try {
                        const { stdout } = await execAsync(`lsof -p ${pid} -d cwd -F n`)
                        const match = stdout.match(/^n(.+)$/m)
                        if (match) {
                            cwd = match[1]
                        }
                    } catch (e) {
                        // Ignore error
                    }

                    ports.push({ port, pid, command, cwd })
                    seen.add(key)
                }
            }
        }

        return ports.sort((a, b) => a.port - b.port)
    }

    private broadcast(ports: PortInfo[]) {
        const windows = BrowserWindow.getAllWindows()
        windows.forEach((win: any) => {
            win.webContents.send('port-update', ports)
        })
    }

    public async killProcess(pid: number): Promise<boolean> {
        try {
            process.kill(pid)
            // Force refresh
            this.checkPorts()
            return true
        } catch (e) {
            console.error(`Failed to kill process ${pid}:`, e)
            return false
        }
    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval)
        }
    }
}
