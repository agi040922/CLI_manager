export type NotificationStatus = 'none' | 'info' | 'error' | 'success'

export type EditorType = 'vscode' | 'cursor' | 'antigravity'

export type ErrorType =
    | 'GIT_NOT_FOUND'
    | 'NOT_A_REPO'
    | 'BRANCH_EXISTS'
    | 'INVALID_BRANCH_NAME'
    | 'WORKTREE_EXISTS'
    | 'GH_CLI_NOT_FOUND'
    | 'GH_NOT_AUTHENTICATED'
    | 'NETWORK_ERROR'
    | 'UNKNOWN_ERROR'

export interface IPCResult<T> {
    success: boolean
    data?: T
    error?: string
    errorType?: ErrorType
}

export interface TerminalSession {
    id: string
    name: string
    cwd: string
    type: 'regular' | 'worktree'
    notificationStatus?: NotificationStatus
    initialCommand?: string
}

export interface TerminalTemplate {
    id: string
    name: string
    icon: string
    description: string
    command: string
}

export interface Workspace {
    id: string
    name: string
    path: string
    sessions: TerminalSession[]
    createdAt: number
    isPlayground?: boolean
    parentWorkspaceId?: string  // Worktree인 경우 부모 workspace ID
    branchName?: string  // Worktree의 브랜치명
}

export interface AppConfig {
    workspaces: Workspace[]
    playgroundPath: string
    settings?: UserSettings
    customTemplates?: TerminalTemplate[]
}

export interface UserSettings {
    theme: 'dark' | 'light'
    fontSize: number
    fontFamily: string
    defaultShell: string
    defaultEditor: EditorType
    portFilter?: {
        enabled: boolean
        minPort: number
        maxPort: number
    }
    github?: {
        username: string
        email: string
        isAuthenticated: boolean
    }
    notifications?: {
        enabled: boolean
        tools: {
            cc: boolean
            codex: boolean
            gemini: boolean
            generic: boolean
        }
    }
}
