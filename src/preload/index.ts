import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Workspace, TerminalSession, UserSettings } from '../shared/types'

// Custom APIs for renderer
const api = {
    getWorkspaces: (): Promise<Workspace[]> => ipcRenderer.invoke('get-workspaces'),
    addWorkspace: (): Promise<Workspace | null> => ipcRenderer.invoke('add-workspace'),
    addSession: (workspaceId: string, type: 'regular' | 'worktree', branchName?: string): Promise<TerminalSession | null> => ipcRenderer.invoke('add-session', workspaceId, type, branchName),
    removeWorkspace: (id: string): Promise<boolean> => ipcRenderer.invoke('remove-workspace', id),
    createPlayground: (): Promise<Workspace | null> => ipcRenderer.invoke('create-playground'),

    // Settings
    getSettings: (): Promise<UserSettings> => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings: UserSettings): Promise<boolean> => ipcRenderer.invoke('save-settings', settings),
    checkGitConfig: (): Promise<{ username: string; email: string } | null> => ipcRenderer.invoke('check-git-config'),

    // Git
    getGitStatus: (workspacePath: string): Promise<any> => ipcRenderer.invoke('get-git-status', workspacePath),
    gitStage: (workspacePath: string, file: string): Promise<boolean> => ipcRenderer.invoke('git-stage', workspacePath, file),
    gitUnstage: (workspacePath: string, file: string): Promise<boolean> => ipcRenderer.invoke('git-unstage', workspacePath, file),
    gitCommit: (workspacePath: string, message: string): Promise<boolean> => ipcRenderer.invoke('git-commit', workspacePath, message),
    gitPush: (workspacePath: string): Promise<boolean> => ipcRenderer.invoke('git-push', workspacePath),
    gitPull: (workspacePath: string): Promise<boolean> => ipcRenderer.invoke('git-pull', workspacePath),
    gitLog: (workspacePath: string, limit?: number): Promise<any[]> => ipcRenderer.invoke('git-log', workspacePath, limit),
    gitReset: (workspacePath: string, commitHash: string, hard?: boolean): Promise<boolean> => ipcRenderer.invoke('git-reset', workspacePath, commitHash, hard),

    // GitHub CLI
    ghCheckAuth: (): Promise<{ authenticated: boolean; message: string }> => ipcRenderer.invoke('gh-check-auth'),
    ghAuthLogin: (): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('gh-auth-login'),
    ghCreatePR: (workspacePath: string, title: string, body: string): Promise<{ success: boolean; url: string }> => ipcRenderer.invoke('gh-create-pr', workspacePath, title, body),
    ghListPRs: (workspacePath: string): Promise<any[]> => ipcRenderer.invoke('gh-list-prs', workspacePath),
    ghRepoView: (workspacePath: string): Promise<any> => ipcRenderer.invoke('gh-repo-view', workspacePath),
    ghWorkflowStatus: (workspacePath: string): Promise<any[]> => ipcRenderer.invoke('gh-workflow-status', workspacePath),

    // Editor
    openInEditor: (workspacePath: string, editorType?: string): Promise<{ success: boolean; editor?: string; error?: string }> => ipcRenderer.invoke('open-in-editor', workspacePath, editorType),

    // Terminal
    createTerminal: (id: string, cwd: string, cols: number, rows: number): Promise<boolean> => ipcRenderer.invoke('terminal-create', id, cwd, cols, rows),
    resizeTerminal: (id: string, cols: number, rows: number): Promise<void> => ipcRenderer.invoke('terminal-resize', id, cols, rows),
    writeTerminal: (id: string, data: string): void => ipcRenderer.send('terminal-input', id, data),
    onTerminalData: (id: string, callback: (data: string) => void): () => void => {
        const channel = `terminal-output-${id}`
        const listener = (_: any, data: string) => callback(data)
        ipcRenderer.on(channel, listener)
        return () => ipcRenderer.removeListener(channel, listener)
    },

    // Ports
    onPortUpdate: (callback: (ports: any[]) => void): () => void => {
        const listener = (_: any, ports: any[]) => callback(ports)
        ipcRenderer.on('port-update', listener)
        return () => ipcRenderer.removeListener('port-update', listener)
    }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
    // @ts-ignore (define in dts)
    window.api = api
}
