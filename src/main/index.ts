import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import Store from 'electron-store'
import { AppConfig, Workspace, TerminalSession, UserSettings, IPCResult } from '../shared/types'
import { v4 as uuidv4 } from 'uuid'
import simpleGit from 'simple-git'
import { existsSync, mkdirSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

import { TerminalManager } from './TerminalManager'
import { PortManager } from './PortManager'
import { net } from 'electron'

// Set app name for development mode
app.setName('CLI Manager')

// Auto Updater 설정
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

const execAsync = promisify(exec)

// License storage interface
interface LicenseData {
    licenseKey: string
    instanceId: string
    activatedAt: string
    customerEmail?: string
    customerName?: string
    productName?: string
}

const store = new Store<AppConfig>({
    defaults: {
        workspaces: [],
        playgroundPath: app.getPath('downloads'),
        customTemplates: [],
        settings: {
            theme: 'dark',
            fontSize: 14,
            fontFamily: 'Monaco, Courier New, monospace',
            defaultShell: 'zsh',
            defaultEditor: 'vscode',
            portFilter: {
                enabled: true,
                minPort: 3000,
                maxPort: 9000
            },
            ignoredPorts: [],
            ignoredProcesses: [],
            portActionLogs: []
        }
    }
}) as any

// Separate store for license data (to keep it secure)
const licenseStore = new Store({
    name: 'license',
    defaults: {
        license: null as LicenseData | null
    }
}) as any

const terminalManager = new TerminalManager()
const portManager = new PortManager()

function createWindow(): void {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        autoHideMenuBar: true,
        titleBarStyle: 'hiddenInset', // Mac-style title bar
        vibrancy: 'under-window', // Glass effect
        visualEffectState: 'active',
        trafficLightPosition: { x: 15, y: 10 },
        icon,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
            zoomFactor: 1  // 줌 팩터를 1로 고정
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow.show()
    })

    // Cmd+/- 기본 줌 완전 비활성화 (터미널 폰트만 조정)
    // 줌 레벨을 1로 고정하여 전체 UI 줌 방지
    mainWindow.webContents.setZoomFactor(1)
    mainWindow.webContents.setZoomLevel(0)
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1)

    // before-input-event로 Cmd+/-/0 키를 가로채서 터미널 폰트 조정
    mainWindow.webContents.on('before-input-event', (event, input) => {
        // macOS: meta (Cmd), Windows/Linux: control
        const isModifier = input.meta || input.control

        if (isModifier && (input.key === '=' || input.key === '+' || input.key === '-' || input.key === '0')) {
            // 기본 줌 동작 방지
            event.preventDefault()
            // 렌더러로 IPC 전송 (터미널 폰트 크기 조정)
            mainWindow.webContents.send('terminal-zoom', input.key)
        }
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.climanager.app')

    // Set dock icon for macOS (built app uses icon.icns automatically)
    if (process.platform === 'darwin' && app.dock) {
        try {
            app.dock.setIcon(icon)
        } catch (e) {
            // Icon loading may fail in packaged app, but icon.icns is used automatically
            console.log('Dock icon set via icon.icns')
        }
    }

    // 자동 업데이트 체크 (프로덕션 환경에서만)
    if (!is.dev) {
        autoUpdater.checkForUpdatesAndNotify()
    }

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // IPC Handlers
    ipcMain.handle('get-workspaces', () => {
        return store.get('workspaces')
    })

    ipcMain.handle('add-workspace', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory']
        })

        if (result.canceled || result.filePaths.length === 0) {
            return null
        }

        const path = result.filePaths[0]
        const name = path.split('/').pop() || 'Untitled'

        const newWorkspace: Workspace = {
            id: uuidv4(),
            name,
            path,
            sessions: [
                {
                    id: uuidv4(),
                    name: 'Main',
                    cwd: path,
                    type: 'regular'
                }
            ],
            createdAt: Date.now()
        }

        const workspaces = store.get('workspaces')
        store.set('workspaces', [...workspaces, newWorkspace])
        return newWorkspace
    })

    ipcMain.handle('add-session', async (_, workspaceId: string, type: 'regular' | 'worktree', branchName?: string, initialCommand?: string) => {
        const workspaces = store.get('workspaces')
        const workspace = workspaces.find((w: any) => w.id === workspaceId)

        if (!workspace) return null

        // Worktree is now created as a separate workspace, not a session
        if (type === 'worktree') {
            console.warn('Use add-worktree-workspace instead')
            return null
        }

        let newSession: TerminalSession = {
            id: uuidv4(),
            name: 'Main',
            cwd: workspace.path,
            type,
            initialCommand
        }

        workspace.sessions.push(newSession)

        // Update workspace in store
        store.set('workspaces', workspaces)

        return newSession
    })

    // Create worktree as a separate workspace
    ipcMain.handle('add-worktree-workspace', async (_, parentWorkspaceId: string, branchName: string): Promise<IPCResult<Workspace>> => {
        const workspaces = store.get('workspaces') as Workspace[]
        const parentWorkspace = workspaces.find((w: Workspace) => w.id === parentWorkspaceId)

        if (!parentWorkspace) {
            return { success: false, error: 'Parent workspace not found', errorType: 'UNKNOWN_ERROR' }
        }

        const git = simpleGit(parentWorkspace.path)
        const settings = store.get('settings') as UserSettings

        // Replace slashes in branch name with hyphens
        const sanitizedBranchName = branchName.replace(/\//g, '-')

        // Determine worktree path: use custom path if set, otherwise default
        let worktreePath: string
        if (settings?.worktreePath) {
            // Custom path: {worktreePath}/{workspace-name}/{branch-name}
            worktreePath = path.join(settings.worktreePath, parentWorkspace.name, sanitizedBranchName)
        } else {
            // Default path: {workspace}/../{name}-worktrees/{branch}
            worktreePath = path.join(
                path.dirname(parentWorkspace.path),
                `${parentWorkspace.name}-worktrees`,
                sanitizedBranchName
            )
        }

        // Create worktree directory parent if it doesn't exist
        const worktreesDir = path.dirname(worktreePath)
        if (!existsSync(worktreesDir)) {
            mkdirSync(worktreesDir, { recursive: true })
        }

        try {
            // Check if it's a git repository
            const isRepo = await git.checkIsRepo()
            if (!isRepo) {
                return { success: false, error: 'Not a git repository', errorType: 'NOT_A_REPO' }
            }

            // Check if branch already exists
            const branches = await git.branch()
            if (branches.all.includes(branchName)) {
                return { success: false, error: `Branch '${branchName}' already exists`, errorType: 'BRANCH_EXISTS' }
            }

            // Check if worktree path already exists
            if (existsSync(worktreePath)) {
                return { success: false, error: `Worktree path '${worktreePath}' already exists`, errorType: 'WORKTREE_EXISTS' }
            }

            // git worktree add -b <branch> <path>
            await git.raw(['worktree', 'add', '-b', branchName, worktreePath])

            // Create new worktree workspace
            const newWorktreeWorkspace: Workspace = {
                id: uuidv4(),
                name: branchName,
                path: worktreePath,
                sessions: [
                    {
                        id: uuidv4(),
                        name: 'Main',
                        cwd: worktreePath,
                        type: 'regular'
                    }
                ],
                createdAt: Date.now(),
                parentWorkspaceId: parentWorkspaceId,
                branchName: branchName
            }

            store.set('workspaces', [...workspaces, newWorktreeWorkspace])
            return { success: true, data: newWorktreeWorkspace }
        } catch (e: any) {
            console.error('Failed to create worktree:', e)
            return { success: false, error: e.message, errorType: 'UNKNOWN_ERROR' }
        }
    })

    ipcMain.handle('remove-workspace', async (_, id: string, deleteBranch: boolean = true) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === id)

        if (!workspace) return false

        // Worktree workspace인 경우 git worktree remove 실행
        if (workspace.parentWorkspaceId && workspace.branchName) {
            const parentWorkspace = workspaces.find((w: Workspace) => w.id === workspace.parentWorkspaceId)

            if (parentWorkspace) {
                const git = simpleGit(parentWorkspace.path)

                try {
                    // 1. git worktree remove <path>
                    await git.raw(['worktree', 'remove', workspace.path, '--force'])
                    console.log(`Removed worktree: ${workspace.path}`)
                } catch (e) {
                    console.error('Failed to remove worktree:', e)
                    // Continue even if failed (may already be deleted)
                }

                // 2. Delete local branch (if deleteBranch is true)
                if (deleteBranch) {
                    try {
                        // -D flag for force delete (including unmerged branches)
                        await git.branch(['-D', workspace.branchName])
                        console.log(`Deleted local branch: ${workspace.branchName}`)
                    } catch (e) {
                        console.error('Failed to delete branch:', e)
                        // Continue with workspace deletion even if branch deletion fails
                    }
                }
            }
        }

        store.set('workspaces', workspaces.filter((w: Workspace) => w.id !== id))
        return true
    })

    ipcMain.handle('remove-session', (_, workspaceId: string, sessionId: string) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)

        if (!workspace) return false

        // Remove session from workspace
        workspace.sessions = workspace.sessions.filter(s => s.id !== sessionId)

        // Update store
        store.set('workspaces', workspaces.map(w =>
            w.id === workspaceId ? workspace : w
        ))

        return true
    })

    ipcMain.handle('rename-session', (_, workspaceId: string, sessionId: string, newName: string) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)

        if (!workspace) return false

        const session = workspace.sessions.find(s => s.id === sessionId)
        if (!session) return false

        session.name = newName

        // Update store
        store.set('workspaces', workspaces.map(w =>
            w.id === workspaceId ? workspace : w
        ))

        return true
    })

    // 세션 순서 변경 핸들러
    ipcMain.handle('reorder-sessions', (_, workspaceId: string, sessionIds: string[]) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)

        if (!workspace) return false

        // sessionIds 순서대로 세션 정렬
        const reorderedSessions = sessionIds
            .map(id => workspace.sessions.find(s => s.id === id))
            .filter((s): s is TerminalSession => s !== undefined)

        workspace.sessions = reorderedSessions

        // Update store
        store.set('workspaces', workspaces.map(w =>
            w.id === workspaceId ? workspace : w
        ))

        return true
    })

    ipcMain.handle('create-playground', async () => {
        // Create a readable timestamp for the playground name
        const now = new Date()
        const timestamp = `${now.getMonth() + 1}-${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        const playgroundName = `Playground ${timestamp}`
        const playgroundPath = path.join(app.getPath('downloads'), `playground-${now.getTime()}`)

        if (!existsSync(playgroundPath)) {
            mkdirSync(playgroundPath, { recursive: true })
        }

        const newWorkspace: Workspace = {
            id: uuidv4(),
            name: playgroundName,
            path: playgroundPath,
            sessions: [
                {
                    id: uuidv4(),
                    name: 'Main',
                    cwd: playgroundPath,
                    type: 'regular'
                }
            ],
            createdAt: Date.now(),
            isPlayground: true
        }

        const workspaces = store.get('workspaces') as Workspace[]
        store.set('workspaces', [...workspaces, newWorkspace])

        return newWorkspace
    })

    // Settings handlers
    ipcMain.handle('get-settings', () => {
        return store.get('settings')
    })

    ipcMain.handle('save-settings', (_, settings: UserSettings) => {
        store.set('settings', settings)
        return true
    })

    // App Version
    ipcMain.handle('get-app-version', () => {
        return app.getVersion()
    })

    // Template handlers
    ipcMain.handle('get-templates', () => {
        return store.get('customTemplates') || []
    })

    ipcMain.handle('save-templates', (_, templates: any[]) => {
        store.set('customTemplates', templates)
        return true
    })

    ipcMain.handle('check-git-config', async () => {
        try {
            // First, check if git is installed
            try {
                await execAsync('git --version')
            } catch (e) {
                console.error('Git is not installed:', e)
                return null
            }

            let username = ''
            let email = ''

            // Check username
            try {
                const result = await execAsync('git config --global user.name')
                username = result.stdout.trim()
            } catch (e) {
                // Username not set - this is okay, we'll return empty string
            }

            // Check email
            try {
                const result = await execAsync('git config --global user.email')
                email = result.stdout.trim()
            } catch (e) {
                // Email not set - this is okay, we'll return empty string
            }

            // Return null if both are empty (git is installed but not configured)
            if (!username && !email) {
                return null
            }

            return {
                username,
                email
            }
        } catch (e) {
            console.error('Git config check error:', e)
            return null
        }
    })

    // Git handlers
    ipcMain.handle('get-git-status', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            const isRepo = await git.checkIsRepo()
            if (!isRepo) return null

            const status = await git.status()
            return {
                branch: status.current || 'unknown',
                modified: status.modified,
                staged: status.staged,
                untracked: status.not_added,
                ahead: status.ahead,
                behind: status.behind
            }
        } catch (e) {
            console.error('Git status error:', e)
            return null
        }
    })

    ipcMain.handle('git-stage', async (_, workspacePath: string, file: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.add(file)
            return true
        } catch (e) {
            console.error('Git stage error:', e)
            throw e
        }
    })

    ipcMain.handle('git-stage-all', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.add('.')
            return true
        } catch (e) {
            console.error('Git stage all error:', e)
            throw e
        }
    })

    ipcMain.handle('git-unstage', async (_, workspacePath: string, file: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.reset(['HEAD', file])
            return true
        } catch (e) {
            console.error('Git unstage error:', e)
            throw e
        }
    })

    ipcMain.handle('git-unstage-all', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.reset(['HEAD']) // Reset mixed (default) unstages everything
            return true
        } catch (e) {
            console.error('Git unstage all error:', e)
            throw e
        }
    })

    ipcMain.handle('git-commit', async (_, workspacePath: string, message: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.commit(message)
            return true
        } catch (e) {
            console.error('Git commit error:', e)
            throw e
        }
    })

    ipcMain.handle('git-push', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.push()
            return true
        } catch (e) {
            console.error('Git push error:', e)
            throw e
        }
    })

    ipcMain.handle('git-pull', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.pull()
            return true
        } catch (e) {
            console.error('Git pull error:', e)
            throw e
        }
    })

    ipcMain.handle('git-log', async (_, workspacePath: string, limit: number = 20) => {
        try {
            const git = simpleGit(workspacePath)
            const log = await git.log({ maxCount: limit })
            return log.all.map(commit => ({
                hash: commit.hash,
                message: commit.message,
                author: commit.author_name,
                date: commit.date
            }))
        } catch (e) {
            console.error('Git log error:', e)
            throw e
        }
    })

    ipcMain.handle('git-reset', async (_, workspacePath: string, commitHash: string, hard: boolean = false) => {
        try {
            const git = simpleGit(workspacePath)
            if (hard) {
                await git.reset(['--hard', commitHash])
            } else {
                await git.reset(['--soft', commitHash])
            }
            return true
        } catch (e) {
            console.error('Git reset error:', e)
            throw e
        }
    })

    ipcMain.handle('git-list-branches', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            const isRepo = await git.checkIsRepo()
            if (!isRepo) return null

            const branchSummary = await git.branch()
            return {
                current: branchSummary.current,
                all: branchSummary.all,
                branches: branchSummary.branches
            }
        } catch (e) {
            console.error('Git list branches error:', e)
            throw e
        }
    })

    ipcMain.handle('git-checkout', async (_, workspacePath: string, branchName: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.checkout(branchName)
            return true
        } catch (e) {
            console.error('Git checkout error:', e)
            throw e
        }
    })

    // Git merge - merge local branches
    ipcMain.handle('git-merge', async (_, workspacePath: string, branchName: string): Promise<IPCResult<{ merged: boolean; conflicts?: string[] }>> => {
        try {
            const git = simpleGit(workspacePath)

            // Execute merge
            const result = await git.merge([branchName])

            // Check for conflicts
            if (result.failed) {
                const status = await git.status()
                return {
                    success: false,
                    error: 'Merge conflict occurred',
                    errorType: 'UNKNOWN_ERROR',
                    data: { merged: false, conflicts: status.conflicted }
                }
            }

            return { success: true, data: { merged: true } }
        } catch (e: any) {
            console.error('Git merge error:', e)
            // Handle conflict case
            if (e.message?.includes('CONFLICTS') || e.message?.includes('conflict')) {
                const git = simpleGit(workspacePath)
                const status = await git.status()
                return {
                    success: false,
                    error: 'Merge conflict occurred',
                    errorType: 'UNKNOWN_ERROR',
                    data: { merged: false, conflicts: status.conflicted }
                }
            }
            return { success: false, error: e.message, errorType: 'UNKNOWN_ERROR' }
        }
    })

    // Git merge abort - cancel merge
    ipcMain.handle('git-merge-abort', async (_, workspacePath: string): Promise<IPCResult<void>> => {
        try {
            const git = simpleGit(workspacePath)
            await git.merge(['--abort'])
            return { success: true }
        } catch (e: any) {
            console.error('Git merge abort error:', e)
            return { success: false, error: e.message, errorType: 'UNKNOWN_ERROR' }
        }
    })

    // Git branch delete - delete local branch
    ipcMain.handle('git-delete-branch', async (_, workspacePath: string, branchName: string, force: boolean = false): Promise<IPCResult<void>> => {
        try {
            const git = simpleGit(workspacePath)
            // -d for merged branches only, -D for force delete
            const flag = force ? '-D' : '-d'
            await git.branch([flag, branchName])
            return { success: true }
        } catch (e: any) {
            console.error('Git delete branch error:', e)
            return { success: false, error: e.message, errorType: 'UNKNOWN_ERROR' }
        }
    })

    // GitHub CLI handlers
    ipcMain.handle('gh-check-auth', async () => {
        try {
            // gh auth status 명령어로 인증 상태 확인
            const { stdout } = await execAsync('gh auth status')
            return { authenticated: true, message: stdout }
        } catch (e: any) {
            // 인증되지 않은 경우
            return { authenticated: false, message: e.message }
        }
    })

    ipcMain.handle('gh-auth-login', async () => {
        try {
            // gh auth login --web 으로 브라우저 인증
            const { stdout, stderr } = await execAsync('gh auth login --web')
            return { success: true, message: stdout || stderr }
        } catch (e: any) {
            return { success: false, message: e.message }
        }
    })

    ipcMain.handle('gh-create-pr', async (_, workspacePath: string, title: string, body: string) => {
        try {
            const cmd = `cd "${workspacePath}" && gh pr create --title "${title}" --body "${body}"`
            const { stdout } = await execAsync(cmd)
            return { success: true, url: stdout.trim() }
        } catch (e: any) {
            console.error('GitHub PR creation error:', e)
            throw new Error(e.message)
        }
    })

    ipcMain.handle('gh-list-prs', async (_, workspacePath: string) => {
        try {
            const cmd = `cd "${workspacePath}" && gh pr list --json number,title,state,author,url`
            const { stdout } = await execAsync(cmd)
            return JSON.parse(stdout)
        } catch (e: any) {
            console.error('GitHub PR list error:', e)
            throw new Error(e.message)
        }
    })

    ipcMain.handle('gh-repo-view', async (_, workspacePath: string) => {
        try {
            const cmd = `cd "${workspacePath}" && gh repo view --json name,owner,url,description,defaultBranchRef`
            const { stdout } = await execAsync(cmd)
            return JSON.parse(stdout)
        } catch (e: any) {
            console.error('GitHub repo view error:', e)
            return null
        }
    })

    ipcMain.handle('gh-workflow-status', async (_, workspacePath: string) => {
        try {
            const cmd = `cd "${workspacePath}" && gh run list --json status,conclusion,name,headBranch,createdAt,url --limit 10`
            const { stdout } = await execAsync(cmd)
            return { success: true, data: JSON.parse(stdout) }
        } catch (e: any) {
            console.error('GitHub workflow status error:', e)
            return { success: false, error: e.message, errorType: 'UNKNOWN_ERROR' }
        }
    })

    // Worktree용 GitHub 기능
    ipcMain.handle('gh-push-branch', async (_, workspacePath: string, branchName: string): Promise<IPCResult<void>> => {
        try {
            // Check if gh is installed
            try {
                await execAsync('gh --version')
            } catch {
                return { success: false, error: 'GitHub CLI not found', errorType: 'GH_CLI_NOT_FOUND' }
            }

            // Check auth status
            try {
                await execAsync('gh auth status')
            } catch {
                return { success: false, error: 'Not authenticated with GitHub', errorType: 'GH_NOT_AUTHENTICATED' }
            }

            const git = simpleGit(workspacePath)
            // Push branch to origin
            await git.push('origin', branchName, ['--set-upstream'])
            return { success: true }
        } catch (e: any) {
            console.error('GitHub push error:', e)
            return { success: false, error: e.message, errorType: 'UNKNOWN_ERROR' }
        }
    })

    ipcMain.handle('gh-merge-pr', async (_, workspacePath: string, prNumber: number) => {
        try {
            const cmd = `cd "${workspacePath}" && gh pr merge ${prNumber} --merge`
            const { stdout } = await execAsync(cmd)
            return { success: true, message: stdout }
        } catch (e: any) {
            console.error('GitHub PR merge error:', e)
            throw new Error(e.message)
        }
    })

    ipcMain.handle('gh-create-pr-from-worktree', async (_, workspacePath: string, branchName: string, title: string, body: string): Promise<IPCResult<{ url: string }>> => {
        try {
            // Check if gh is installed
            try {
                await execAsync('gh --version')
            } catch {
                return { success: false, error: 'GitHub CLI not found', errorType: 'GH_CLI_NOT_FOUND' }
            }

            // Check auth status
            try {
                await execAsync('gh auth status')
            } catch {
                return { success: false, error: 'Not authenticated with GitHub', errorType: 'GH_NOT_AUTHENTICATED' }
            }

            // First, check if branch is pushed
            const git = simpleGit(workspacePath)
            const status = await git.status()

            if (status.ahead > 0) {
                // Push first
                await git.push('origin', branchName, ['--set-upstream'])
            }

            // Create PR
            const cmd = `cd "${workspacePath}" && gh pr create --title "${title}" --body "${body}" --head "${branchName}"`
            const { stdout } = await execAsync(cmd)
            return { success: true, data: { url: stdout.trim() } }
        } catch (e: any) {
            console.error('GitHub PR creation error:', e)
            return { success: false, error: e.message, errorType: 'UNKNOWN_ERROR' }
        }
    })

    // Directory selection dialog
    ipcMain.handle('select-directory', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
        })

        if (result.canceled || result.filePaths.length === 0) {
            return null
        }

        return result.filePaths[0]
    })

    ipcMain.handle('check-tools', async () => {
        const tools = {
            git: false,
            gh: false,
            brew: false
        }

        try {
            await execAsync('git --version')
            tools.git = true
        } catch (e) {
            console.log('Git not found')
        }

        try {
            await execAsync('gh --version')
            tools.gh = true
        } catch (e) {
            console.log('GitHub CLI not found')
        }

        try {
            await execAsync('brew --version')
            tools.brew = true
        } catch (e) {
            console.log('Homebrew not found')
        }

        return tools
    })

    // Editor open handler
    ipcMain.handle('open-in-editor', async (_, workspacePath: string, editorType?: string) => {
        try {
            // Get default editor from settings if not specified
            const editor = editorType || (store.get('settings') as UserSettings)?.defaultEditor || 'vscode'

            // Map editor type to command
            const editorCommands: Record<string, string> = {
                'vscode': 'code',
                'cursor': 'cursor',
                'antigravity': 'antigravity'
            }

            const command = editorCommands[editor]
            if (!command) {
                throw new Error(`Unknown editor type: ${editor}`)
            }

            // Execute editor command in the workspace directory
            const cmd = `cd "${workspacePath}" && ${command} .`
            await execAsync(cmd)

            return { success: true, editor }
        } catch (e: any) {
            console.error('Open in editor error:', e)
            return { success: false, error: e.message }
        }
    })

    // ============================================
    // Lemon Squeezy License Handlers
    // ============================================

    // Get unique instance name for this machine
    const getInstanceName = (): string => {
        const hostname = require('os').hostname()
        const username = require('os').userInfo().username
        return `${hostname}-${username}-${app.getName()}`
    }

    // Activate license with Lemon Squeezy
    ipcMain.handle('license-activate', async (_, licenseKey: string): Promise<IPCResult<LicenseData>> => {
        try {
            const instanceName = getInstanceName()

            // Lemon Squeezy License API endpoint
            const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    license_key: licenseKey,
                    instance_name: instanceName
                }).toString()
            })

            const data = await response.json()

            if (data.activated) {
                // Successfully activated
                const licenseData: LicenseData = {
                    licenseKey: licenseKey,
                    instanceId: data.instance?.id || '',
                    activatedAt: new Date().toISOString(),
                    customerEmail: data.meta?.customer_email,
                    customerName: data.meta?.customer_name,
                    productName: data.meta?.product_name
                }

                // Save to license store
                licenseStore.set('license', licenseData)

                return { success: true, data: licenseData }
            } else {
                // Activation failed
                return {
                    success: false,
                    error: data.error || 'License activation failed',
                    errorType: 'UNKNOWN_ERROR'
                }
            }
        } catch (error: any) {
            console.error('License activation error:', error)
            return {
                success: false,
                error: error.message || 'Network error during activation',
                errorType: 'UNKNOWN_ERROR'
            }
        }
    })

    // Validate existing license
    ipcMain.handle('license-validate', async (): Promise<IPCResult<LicenseData>> => {
        try {
            const savedLicense = licenseStore.get('license') as LicenseData | null

            if (!savedLicense) {
                return {
                    success: false,
                    error: 'No license found',
                    errorType: 'UNKNOWN_ERROR'
                }
            }

            // Validate with Lemon Squeezy
            const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    license_key: savedLicense.licenseKey,
                    instance_id: savedLicense.instanceId
                }).toString()
            })

            const data = await response.json()

            if (data.valid) {
                return { success: true, data: savedLicense }
            } else {
                // License is no longer valid, clear it
                licenseStore.set('license', null)
                return {
                    success: false,
                    error: data.error || 'License is no longer valid',
                    errorType: 'UNKNOWN_ERROR'
                }
            }
        } catch (error: any) {
            console.error('License validation error:', error)
            // On network error, allow cached license (offline mode)
            const savedLicense = licenseStore.get('license') as LicenseData | null
            if (savedLicense) {
                return { success: true, data: savedLicense }
            }
            return {
                success: false,
                error: error.message || 'Network error during validation',
                errorType: 'UNKNOWN_ERROR'
            }
        }
    })

    // Deactivate license
    ipcMain.handle('license-deactivate', async (): Promise<IPCResult<void>> => {
        try {
            const savedLicense = licenseStore.get('license') as LicenseData | null

            if (!savedLicense) {
                return { success: true }
            }

            // Deactivate with Lemon Squeezy
            const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    license_key: savedLicense.licenseKey,
                    instance_id: savedLicense.instanceId
                }).toString()
            })

            const data = await response.json()

            // Clear local license regardless of API response
            licenseStore.set('license', null)

            if (data.deactivated) {
                return { success: true }
            } else {
                return { success: true } // Still consider it success since we cleared local
            }
        } catch (error: any) {
            console.error('License deactivation error:', error)
            // Clear local license even on network error
            licenseStore.set('license', null)
            return { success: true }
        }
    })

    // Check if license exists (without validation)
    ipcMain.handle('license-check', async (): Promise<IPCResult<{ hasLicense: boolean }>> => {
        const savedLicense = licenseStore.get('license') as LicenseData | null
        return {
            success: true,
            data: { hasLicense: savedLicense !== null }
        }
    })

    createWindow()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

// ============================================
// Auto Updater 이벤트 핸들러
// ============================================

// Helper to send update status to all windows
function sendUpdateStatus(status: string, data?: any) {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('update-status', { status, ...data })
    })
}

autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...')
    sendUpdateStatus('checking')
})

autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version)
    sendUpdateStatus('available', { version: info.version })
})

autoUpdater.on('update-not-available', () => {
    console.log('Already up to date.')
    sendUpdateStatus('not-available')
})

autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`)
    sendUpdateStatus('downloading', { percent: Math.round(progress.percent) })
})

autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version)
    sendUpdateStatus('ready', { version: info.version })
})

autoUpdater.on('error', (err) => {
    console.error('Update error:', err)
    sendUpdateStatus('error', { message: err.message })
})

// IPC handlers for manual update control
ipcMain.handle('check-for-update', async () => {
    // In dev mode, auto-updater doesn't work properly
    if (is.dev) {
        return { success: false, error: 'dev-mode', isDev: true }
    }

    try {
        const result = await autoUpdater.checkForUpdates()
        const currentVersion = app.getVersion()
        const latestVersion = result?.updateInfo?.version

        if (latestVersion && latestVersion !== currentVersion) {
            return { success: true, version: latestVersion, hasUpdate: true }
        } else {
            return { success: true, version: currentVersion, hasUpdate: false }
        }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
})

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall()
})
