export type NotificationStatus = 'none' | 'info' | 'error' | 'success' | 'warning'

// Session status for Claude Code monitoring (claude-squad 방식)
// idle: No activity detected / Claude Code not running
// running: Output being generated (화면이 변경됨)
// ready: Waiting for user input (출력이 멈춤)
// error: Error occurred
export type SessionStatus = 'idle' | 'running' | 'ready' | 'error'

export type EditorType = 'vscode' | 'cursor' | 'antigravity' | 'custom'

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
    | 'UPGRADE_REQUIRED'
    | 'LICENSE_EXPIRED'

// ============================================
// License & Pricing Types
// ============================================

export type PlanType = 'free' | 'monthly' | 'annual' | 'lifetime'

export type LicenseStatus = 'active' | 'expired' | 'disabled' | 'inactive'

export interface LicenseData {
    licenseKey: string
    instanceId: string
    activatedAt: string
    customerEmail?: string
    customerName?: string
    productName?: string
    // Plan information from Lemon Squeezy
    variantId?: number
    variantName?: string
    expiresAt?: string | null  // null for lifetime
    status?: LicenseStatus
    productId?: number
}

export interface FeatureLimits {
    maxWorkspaces: number        // -1 means unlimited
    maxSessionsPerWorkspace: number
    maxTemplates: number
    worktreeEnabled: boolean
    githubIntegrationEnabled: boolean
    portMonitoringEnabled: boolean
}

// Plan limits configuration
export const PLAN_LIMITS: Record<PlanType, FeatureLimits> = {
    free: {
        maxWorkspaces: 3,
        maxSessionsPerWorkspace: 5,
        maxTemplates: 3,
        worktreeEnabled: false,
        githubIntegrationEnabled: true,  // GitHub is available for free
        portMonitoringEnabled: true,
    },
    monthly: {
        maxWorkspaces: -1,
        maxSessionsPerWorkspace: -1,
        maxTemplates: -1,
        worktreeEnabled: true,
        githubIntegrationEnabled: true,
        portMonitoringEnabled: true,
    },
    annual: {
        maxWorkspaces: -1,
        maxSessionsPerWorkspace: -1,
        maxTemplates: -1,
        worktreeEnabled: true,
        githubIntegrationEnabled: true,
        portMonitoringEnabled: true,
    },
    lifetime: {
        maxWorkspaces: -1,
        maxSessionsPerWorkspace: -1,
        maxTemplates: -1,
        worktreeEnabled: true,
        githubIntegrationEnabled: true,
        portMonitoringEnabled: true,
    },
}

export interface LicenseInfo {
    planType: PlanType
    license: LicenseData | null
    limits: FeatureLimits
    isExpired: boolean
    daysUntilExpiry?: number
}

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
    isHome?: boolean  // Home directory workspace (cannot be deleted)
    parentWorkspaceId?: string  // Worktree인 경우 부모 workspace ID
    branchName?: string  // Worktree의 브랜치명
    baseBranch?: string  // Worktree 생성 시 분기한 브랜치 (merge 대상)
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
    customEditorPath?: string  // Custom editor command or path
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
    // Home Workspace 설정
    showHomeWorkspace?: boolean  // 홈 워크스페이스 표시 여부 (기본값: true)
    homeWorkspacePath?: string   // 커스텀 홈 워크스페이스 경로 (없으면 시스템 홈 디렉토리)
    // License 설정
    licenseScreenCompleted?: boolean  // 라이선스 화면 완료 여부 (true면 다시 안 보임)
    // Keyboard 설정
    keyboard?: {
        scrollShortcuts: boolean    // ⌘↑/⌘↓ 스크롤 단축키 활성화 (기본값: true)
        showScrollButtons: boolean  // 플로팅 스크롤 버튼 표시 (기본값: true)
    }
    // Terminal Preview 설정 (hover 시 마지막 N줄 미리보기)
    terminalPreview?: {
        enabled: boolean            // 미리보기 활성화 (기본값: true)
        lineCount: number           // 표시할 줄 수 (기본값: 5, 최대 10)
    }
    // Hooks 설정 (Claude Code 세션 모니터링)
    hooks?: HooksSettings
}

// Hooks settings for AI tool session monitoring
// claude-squad 방식: 화면 변경 = Running, 변경 없음 = Ready
export interface HooksSettings {
    enabled: boolean                    // Master switch for hooks
    claudeCode: {
        enabled: boolean                // Enable Claude Code monitoring
        detectRunning: boolean          // Detect "Running" state (output being generated)
        detectReady: boolean            // Detect "Ready" state (output stopped)
        detectError: boolean            // Detect errors
        showInSidebar: boolean          // Show status indicator in sidebar
        autoDismissSeconds: number      // Auto-dismiss notification time (default: 5)
    }
    // Future: codex, gemini, etc.
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
