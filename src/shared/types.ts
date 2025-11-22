export interface TerminalSession {
    id: string
    name: string
    cwd: string
    type: 'regular' | 'worktree'
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
}
