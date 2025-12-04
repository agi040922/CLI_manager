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

        // 수동 새로고침 핸들러
        ipcMain.handle('refresh-ports', async () => {
            await this.checkPorts()
            return true
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

    private async checkPorts(): Promise<void> {
        try {
            // lsof -i -P -n -sTCP:LISTEN
            const { stdout } = await execAsync('lsof -i -P -n -sTCP:LISTEN')
            const ports = await this.parseLsof(stdout)
            this.broadcast(ports)
        } catch (error: any) {
            // lsof는 결과가 없으면 exit code 1을 반환함
            if (error.code !== 1) {
                console.error('lsof error:', error)
            }
            this.broadcast([])
        }
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

            // 로컬에서 리슨하는 포트 감지 (localhost, 127.0.0.1, * 모두 포함)
            // *:port는 모든 인터페이스에서 리슨하는 것을 의미
            const isLocalPort = address.includes('localhost') ||
                address.includes('127.0.0.1') ||
                address.includes('*:')
            if (!isLocalPort) {
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
                        // Use -a to ensure we get only the cwd entry for this specific pid
                        const { stdout } = await execAsync(`lsof -a -p ${pid} -d cwd -F n`)
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
