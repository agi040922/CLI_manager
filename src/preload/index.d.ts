import { ElectronAPI } from '@electron-toolkit/preload'
import { Workspace, TerminalSession, UserSettings } from '../shared/types'

declare global {
    interface Window {
        electron: ElectronAPI
        api: {
            getWorkspaces: () => Promise<Workspace[]>
            addWorkspace: () => Promise<Workspace | null>
            addSession: (workspaceId: string, type: 'regular' | 'worktree', branchName?: string) => Promise<import('../shared/types').TerminalSession | null>
            removeWorkspace: (id: string) => Promise<boolean>
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

            // GitHub CLI
            ghCheckAuth: () => Promise<{ authenticated: boolean; message: string }>
            ghAuthLogin: () => Promise<{ success: boolean; message: string }>
            ghCreatePR: (workspacePath: string, title: string, body: string) => Promise<{ success: boolean; url: string }>
            ghListPRs: (workspacePath: string) => Promise<any[]>
            ghRepoView: (workspacePath: string) => Promise<any>
            ghWorkflowStatus: (workspacePath: string) => Promise<any[]>

            // Editor
            openInEditor: (workspacePath: string, editorType?: string) => Promise<{ success: boolean; editor?: string; error?: string }>

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
