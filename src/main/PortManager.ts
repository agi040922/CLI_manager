import { exec } from 'child_process'
import { BrowserWindow } from 'electron'

interface PortInfo {
    port: number
    pid: number
    command: string
}

export class PortManager {
    private interval: NodeJS.Timeout | null = null

    constructor() {
        // Start monitoring
        this.startMonitoring()
    }

    private startMonitoring() {
        // Run immediately
        this.checkPorts()

        // Then every 5 seconds
        this.interval = setInterval(() => {
            this.checkPorts()
        }, 5000)
    }

    private checkPorts() {
        // lsof -i -P -n -sTCP:LISTEN
        // -i: internet files
        // -P: no port names
        // -n: no host names
        // -sTCP:LISTEN: only TCP listeners
        exec('lsof -i -P -n -sTCP:LISTEN', (error, stdout) => {
            if (error) {
                // lsof returns exit code 1 if no ports are found, which is fine
                if (error.code !== 1) {
                    console.error('lsof error:', error)
                }
                this.broadcast([])
                return
            }

            const ports = this.parseLsof(stdout)
            this.broadcast(ports)
        })
    }

    private parseLsof(output: string): PortInfo[] {
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
            const address = parts[8] // e.g., "localhost:3000" or "*:8080" or "127.0.0.1:3000"

            // Only show localhost ports (127.0.0.1 or localhost)
            if (!address.includes('localhost') && !address.includes('127.0.0.1')) {
                continue
            }

            const portMatch = address.match(/:(\d+)/)
            if (portMatch) {
                const port = parseInt(portMatch[1])
                const key = `${port}-${pid}`

                if (!seen.has(key)) {
                    ports.push({ port, pid, command })
                    seen.add(key)
                }
            }
        }

        return ports.sort((a, b) => a.port - b.port)
    }

    private broadcast(ports: PortInfo[]) {
        const windows = require('electron').BrowserWindow.getAllWindows()
        windows.forEach((win: any) => {
            win.webContents.send('port-update', ports)
        })
    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval)
        }
    }
}
