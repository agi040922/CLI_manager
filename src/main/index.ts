import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import Store from 'electron-store'
import { AppConfig, Workspace, TerminalSession } from '../shared/types'
import { v4 as uuidv4 } from 'uuid'
import simpleGit from 'simple-git'
import { existsSync, mkdirSync } from 'fs'

import { TerminalManager } from './TerminalManager'
import { PortManager } from './PortManager'

const store = new Store<AppConfig>({
    defaults: {
        workspaces: [],
        playgroundPath: app.getPath('downloads')
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
            const git = simpleGit(workspace.path) as any
            const worktreePath = path.join(path.dirname(workspace.path), `${workspace.name}-worktrees`, branchName)

            // Create worktree directory if it doesn't exist
            if (!existsSync(path.dirname(worktreePath))) {
                mkdirSync(path.dirname(worktreePath), { recursive: true })
            }

            try {
                await git.checkIsRepo()
                await git.worktree(['add', '-b', branchName, worktreePath])

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
        const playgroundPath = path.join(app.getPath('downloads'), `playground-${new Date().toISOString().replace(/[:.]/g, '-')}`)

        if (!existsSync(playgroundPath)) {
            mkdirSync(playgroundPath, { recursive: true })
        }

        const newWorkspace: Workspace = {
            id: uuidv4(),
            name: 'Playground',
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
