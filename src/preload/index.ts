import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Workspace, TerminalSession } from '../shared/types'

// Custom APIs for renderer
const api = {
    getWorkspaces: (): Promise<Workspace[]> => ipcRenderer.invoke('get-workspaces'),
    addWorkspace: (): Promise<Workspace | null> => ipcRenderer.invoke('add-workspace'),
    addSession: (workspaceId: string, type: 'regular' | 'worktree', branchName?: string): Promise<TerminalSession | null> => ipcRenderer.invoke('add-session', workspaceId, type, branchName),
    removeWorkspace: (id: string): Promise<boolean> => ipcRenderer.invoke('remove-workspace', id),
    createPlayground: (): Promise<Workspace | null> => ipcRenderer.invoke('create-playground'),

    // Terminal
    createTerminal: (id: string, cwd: string): Promise<boolean> => ipcRenderer.invoke('terminal-create', id, cwd),
    resizeTerminal: (id: string, cols: number, rows: number): Promise<void> => ipcRenderer.invoke('terminal-resize', id, cols, rows),
    writeTerminal: (id: string, data: string): void => ipcRenderer.send('terminal-input', id, data),
    onTerminalData: (id: string, callback: (data: string) => void): () => void => {
        const channel = `terminal-output-${id}`
        const listener = (_, data) => callback(data)
        ipcRenderer.on(channel, listener)
        return () => ipcRenderer.removeListener(channel, listener)
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
