// Remote Terminal Manager for mobile connections
// Manages terminal processes (node-pty) created from mobile devices.
// Each mobile connection can own multiple terminal sessions.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty = require('node-pty')
import os from 'os'
import { RemoteSession } from './types'

interface RemoteTerminal {
    session: RemoteSession
    ptyProcess: any
    mobileId: string
}

type OutputCallback = (sessionId: string, mobileId: string, data: string) => void
type ExitCallback = (sessionId: string, mobileId: string) => void

export class RemoteTerminalManager {
    private terminals: Map<string, RemoteTerminal> = new Map()
    private onOutput: OutputCallback
    private onExit: ExitCallback

    constructor(onOutput: OutputCallback, onExit: ExitCallback) {
        this.onOutput = onOutput
        this.onExit = onExit
    }

    /**
     * Create a new terminal session for a mobile connection.
     * Spawns a node-pty process in the given working directory.
     */
    createSession(
        session: RemoteSession,
        cwd: string,
        shell?: string,
        cols: number = 80,
        rows: number = 24
    ): boolean {
        if (this.terminals.has(session.id)) {
            console.warn('[RemoteTerminal] Session already exists:', session.id)
            return false
        }

        try {
            const shellPath =
                shell || process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash')

            const ptyProcess = pty.spawn(shellPath, [], {
                name: 'xterm-color',
                cols,
                rows,
                cwd,
                env: process.env as { [key: string]: string }
            })

            // Forward terminal output to the callback (relayed to mobile)
            ptyProcess.onData((data: string) => {
                this.onOutput(session.id, session.mobileId, data)
            })

            // Handle process exit: clean up and notify
            ptyProcess.onExit(() => {
                this.terminals.delete(session.id)
                this.onExit(session.id, session.mobileId)
            })

            this.terminals.set(session.id, {
                session,
                ptyProcess,
                mobileId: session.mobileId
            })

            console.log('[RemoteTerminal] Created session:', session.id, 'for mobile:', session.mobileId)
            return true
        } catch (error) {
            console.error('[RemoteTerminal] Failed to create session:', error)
            return false
        }
    }

    /**
     * Write input data to a terminal session
     */
    write(sessionId: string, data: string): boolean {
        const terminal = this.terminals.get(sessionId)
        if (!terminal) {
            console.warn('[RemoteTerminal] Session not found:', sessionId)
            return false
        }

        try {
            terminal.ptyProcess.write(data)
            return true
        } catch (error) {
            console.error('[RemoteTerminal] Write error:', error)
            return false
        }
    }

    /**
     * Resize a terminal session
     */
    resize(sessionId: string, cols: number, rows: number): boolean {
        const terminal = this.terminals.get(sessionId)
        if (!terminal) {
            return false
        }

        try {
            terminal.ptyProcess.resize(cols, rows)
            return true
        } catch (error) {
            console.error('[RemoteTerminal] Resize error:', error)
            return false
        }
    }

    /**
     * Close a single terminal session
     */
    closeSession(sessionId: string): boolean {
        const terminal = this.terminals.get(sessionId)
        if (!terminal) {
            return false
        }

        try {
            terminal.ptyProcess.kill()
            this.terminals.delete(sessionId)
            console.log('[RemoteTerminal] Closed session:', sessionId)
            return true
        } catch (error) {
            console.error('[RemoteTerminal] Close error:', error)
            return false
        }
    }

    /**
     * Close all terminal sessions owned by a specific mobile connection
     */
    closeSessionsForMobile(mobileId: string): number {
        let count = 0
        for (const [sessionId, terminal] of this.terminals) {
            if (terminal.mobileId === mobileId) {
                this.closeSession(sessionId)
                count++
            }
        }
        console.log('[RemoteTerminal] Closed', count, 'sessions for mobile:', mobileId)
        return count
    }

    /**
     * Close all terminal sessions (used during app shutdown)
     */
    closeAll(): void {
        for (const sessionId of this.terminals.keys()) {
            this.closeSession(sessionId)
        }
        console.log('[RemoteTerminal] Closed all sessions')
    }

    /**
     * Get total session count
     */
    getSessionCount(): number {
        return this.terminals.size
    }

    /**
     * Get sessions belonging to a specific mobile connection
     */
    getSessionsForMobile(mobileId: string): RemoteSession[] {
        const sessions: RemoteSession[] = []
        for (const terminal of this.terminals.values()) {
            if (terminal.mobileId === mobileId) {
                sessions.push(terminal.session)
            }
        }
        return sessions
    }

    /**
     * Check if a session exists
     */
    hasSession(sessionId: string): boolean {
        return this.terminals.has(sessionId)
    }
}
