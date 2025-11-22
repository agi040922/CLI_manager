/// <reference types="vite/client" />

import { ElectronAPI } from '@electron-toolkit/preload'
import { Workspace, TerminalSession, UserSettings } from '../../shared/types'

declare global {
    interface Window {
        electron: ElectronAPI
        api: {
            getWorkspaces: () => Promise<Workspace[]>
            addWorkspace: () => Promise<Workspace>
            removeWorkspace: (id: string) => Promise<boolean>
            addSession: (workspaceId: string, type: 'regular' | 'worktree', branchName?: string) => Promise<TerminalSession | null>
            createPlayground: () => Promise<Workspace | null>

            // Settings
            getSettings: () => Promise<UserSettings>
            saveSettings: (settings: UserSettings) => Promise<boolean>
            checkGitConfig: () => Promise<{ username: string; email: string } | null>

            // Git
            getGitStatus: (workspacePath: string) => Promise<any>
            gitStage: (workspacePath: string, file: string) => Promise<boolean>
            gitUnstage: (workspacePath: string, file: string) => Promise<boolean>
            gitCommit: (workspacePath: string, message: string) => Promise<boolean>
            gitPush: (workspacePath: string) => Promise<boolean>
            gitPull: (workspacePath: string) => Promise<boolean>
            gitLog: (workspacePath: string, limit?: number) => Promise<any[]>
            gitReset: (workspacePath: string, commitHash: string, hard?: boolean) => Promise<boolean>

            // Terminal
            createTerminal: (id: string, cwd: string, cols: number, rows: number) => Promise<boolean>
            resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>
            writeTerminal: (id: string, data: string) => void
            onTerminalData: (id: string, callback: (data: string) => void) => () => void

            // Ports
            onPortUpdate: (callback: (ports: { port: number, pid: number, command: string }[]) => void) => () => void
        }
    }
}
