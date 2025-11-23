import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import Store from 'electron-store'
import { AppConfig, Workspace, TerminalSession, UserSettings } from '../shared/types'
import { v4 as uuidv4 } from 'uuid'
import simpleGit from 'simple-git'
import { existsSync, mkdirSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

import { TerminalManager } from './TerminalManager'
import { PortManager } from './PortManager'

const execAsync = promisify(exec)

const store = new Store<AppConfig>({
    defaults: {
        workspaces: [],
        playgroundPath: app.getPath('downloads'),
        settings: {
            theme: 'dark',
            fontSize: 14,
            fontFamily: 'Monaco, Courier New, monospace',
            defaultShell: 'zsh'
        }
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
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow.show()
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
    electronApp.setAppUserModelId('com.electron')

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

    ipcMain.handle('add-session', async (_, workspaceId: string, type: 'regular' | 'worktree', branchName?: string) => {
        const workspaces = store.get('workspaces')
        const workspace = workspaces.find((w: any) => w.id === workspaceId)

        if (!workspace) return null

        let newSession: TerminalSession = {
            id: uuidv4(),
            name: 'Main',
            cwd: workspace.path,
            type
        }

        // Worktree logic
        if (type === 'worktree' && branchName) {
            const git = simpleGit(workspace.path)
            const worktreePath = path.join(path.dirname(workspace.path), `${workspace.name}-worktrees`, branchName)

            // Create worktree directory parent if it doesn't exist
            const worktreesDir = path.dirname(worktreePath)
            if (!existsSync(worktreesDir)) {
                mkdirSync(worktreesDir, { recursive: true })
            }

            try {
                // Check if it's a git repository
                const isRepo = await git.checkIsRepo()
                if (!isRepo) {
                    console.error('Not a git repository')
                    return null
                }

                // Use raw() method for worktree command
                // git worktree add -b <branch> <path>
                await git.raw(['worktree', 'add', '-b', branchName, worktreePath])

                newSession.cwd = worktreePath
                newSession.name = `🌿 ${branchName}`
            } catch (e) {
                console.error('Failed to create worktree:', e)
                return null
            }
        }

        workspace.sessions.push(newSession)

        // Update workspace in store
        store.set('workspaces', workspaces)

        return newSession
    })

    ipcMain.handle('remove-workspace', (_, id: string) => {
        const workspaces = store.get('workspaces') as Workspace[]
        store.set('workspaces', workspaces.filter((w: Workspace) => w.id !== id))
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

    ipcMain.handle('check-git-config', async () => {
        try {
            const { stdout: username } = await execAsync('git config --global user.name')
            const { stdout: email } = await execAsync('git config --global user.email')
            return {
                username: username.trim(),
                email: email.trim()
            }
        } catch (e) {
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
            const cmd = `cd "${workspacePath}" && gh repo view --json name,owner,url,description,defaultBranch`
            const { stdout } = await execAsync(cmd)
            return JSON.parse(stdout)
        } catch (e: any) {
            console.error('GitHub repo view error:', e)
            return null
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
