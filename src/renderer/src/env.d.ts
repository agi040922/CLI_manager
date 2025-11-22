/// <reference types="vite/client" />

import { ElectronAPI } from '@electron-toolkit/preload'
import { Workspace, TerminalSession } from '../../shared/types'

declare global {
    interface Window {
        electron: ElectronAPI
        api: {
            getWorkspaces: () => Promise<Workspace[]>
            addWorkspace: () => Promise<Workspace>
            removeWorkspace: (id: string) => Promise<boolean>
            addSession: (workspaceId: string, type: 'regular' | 'worktree', branchName?: string) => Promise<TerminalSession | null>
            createPlayground: () => Promise<Workspace | null>
            createTerminal: (id: string, cwd: string, cols: number, rows: number) => Promise<boolean>
            resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>
            writeTerminal: (id: string, data: string) => void
            onTerminalData: (id: string, callback: (data: string) => void) => () => void
            onPortUpdate: (callback: (ports: { port: number, pid: number, command: string }[]) => void) => () => void
        }
    }
}
