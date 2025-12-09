export type NotificationStatus = 'none' | 'info' | 'error' | 'success' | 'warning'

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
    cwd?: string
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
    fontSize: number  // UI 요소(사이드바 파일/폴더명 등)에만 적용
    fontFamily?: string  // deprecated - 사용 안 함
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
    ignoredPorts?: number[]
    ignoredProcesses?: string[]
    portActionLogs?: PortActionLog[]
    // Git Worktree 설정
    worktreePath?: string  // 커스텀 worktree 저장 경로 (없으면 기본 경로 사용)
    hasCompletedOnboarding?: boolean
}

export interface PortActionLog {
    timestamp: number
    action: 'kill' | 'ignore-port' | 'ignore-process'
    target: string
    port?: number  // 관련 포트 번호
    details?: string
}

export interface PortInfo {
    port: number
    pid: number
    command: string
    cwd?: string
}
