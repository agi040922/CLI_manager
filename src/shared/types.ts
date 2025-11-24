export type NotificationStatus = 'none' | 'info' | 'error' | 'success'

export type EditorType = 'vscode' | 'cursor' | 'antigravity'

export interface TerminalSession {
    id: string
    name: string
    cwd: string
    type: 'regular' | 'worktree'
    notificationStatus?: NotificationStatus
}

export interface Workspace {
    id: string
    name: string
    path: string
    sessions: TerminalSession[]
    createdAt: number
    isPlayground?: boolean
}

export interface AppConfig {
    workspaces: Workspace[]
    playgroundPath: string
    settings?: UserSettings
}

export interface UserSettings {
    theme: 'dark' | 'light'
    fontSize: number
    fontFamily: string
    defaultShell: string
    defaultEditor: EditorType
    github?: {
        username: string
        email: string
        isAuthenticated: boolean
    }
}
