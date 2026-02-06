// Remote Server - Manages WebSocket connection to relay server
// Handles mobile device pairing, terminal creation/IO, and status broadcasting.

import WebSocket from 'ws'
import { BrowserWindow } from 'electron'
import Store from 'electron-store'
import { v4 as uuidv4 } from 'uuid'
import {
    RemoteMessage,
    RemoteSettings,
    MobileConnection,
    RemoteSession,
    RemoteConnectionStatus,
    RemoteState
} from './types'
import { getOrCreateDeviceId, getDeviceName } from './deviceId'
import { RemoteTerminalManager } from './RemoteTerminalManager'
import { Workspace } from '../../shared/types'

const DEFAULT_RELAY_URL = 'wss://climanger-relay.jkh040922.workers.dev'

// Keepalive ping interval (30 seconds)
const PING_INTERVAL_MS = 30_000

// Reconnect delay after disconnect (5 seconds)
const RECONNECT_DELAY_MS = 5_000

interface RemoteServerStore {
    settings: RemoteSettings
    pin?: {
        value: string
        expiresAt: number
    }
}

export class RemoteServer {
    private store: any
    private socket: WebSocket | null = null
    private terminalManager: RemoteTerminalManager
    private status: RemoteConnectionStatus = 'disconnected'
    private connectedMobiles: Map<string, MobileConnection> = new Map()
    private activeSessions: Map<string, RemoteSession> = new Map()
    private reconnectTimer: NodeJS.Timeout | null = null
    private pingTimer: NodeJS.Timeout | null = null
    private getWorkspaces: () => Workspace[]

    constructor(getWorkspaces: () => Workspace[]) {
        this.store = new Store({
            name: 'remote-server',
            defaults: {
                settings: {
                    enabled: false,
                    relayUrl: DEFAULT_RELAY_URL,
                    autoConnect: false
                }
            }
        })

        this.getWorkspaces = getWorkspaces

        // Initialize terminal manager with output/exit callbacks
        this.terminalManager = new RemoteTerminalManager(
            (sessionId, mobileId, data) => this.handleTerminalOutput(sessionId, mobileId, data),
            (sessionId, mobileId) => this.handleTerminalExit(sessionId, mobileId)
        )
    }

    // =============================================
    // Public API
    // =============================================

    /**
     * Connect to relay server via WebSocket.
     * Registers this desktop with its device ID and name.
     */
    async connect(): Promise<boolean> {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log('[RemoteServer] Already connected')
            return true
        }

        const settings = this.store.get('settings')
        const deviceId = getOrCreateDeviceId()
        const deviceName = getDeviceName()

        const url = `${settings.relayUrl}/connect/${deviceId}?type=desktop`

        this.setStatus('connecting')

        return new Promise((resolve) => {
            try {
                this.socket = new WebSocket(url)

                this.socket.on('open', () => {
                    console.log('[RemoteServer] Connected to relay')
                    this.setStatus('connected')

                    // Register this desktop with the relay server
                    this.send({
                        type: 'register',
                        payload: { deviceId, deviceName }
                    })

                    this.startPing()
                    resolve(true)
                })

                this.socket.on('message', (data: WebSocket.RawData) => {
                    try {
                        const message: RemoteMessage = JSON.parse(data.toString())
                        this.handleMessage(message)
                    } catch (error) {
                        console.error('[RemoteServer] Failed to parse message:', error)
                    }
                })

                this.socket.on('close', (code: number, reason: Buffer) => {
                    console.log('[RemoteServer] Disconnected:', code, reason.toString())
                    this.handleDisconnect()
                    resolve(false)
                })

                this.socket.on('error', (error: Error) => {
                    console.error('[RemoteServer] WebSocket error:', error)
                    this.setStatus('error')
                    resolve(false)
                })
            } catch (error) {
                console.error('[RemoteServer] Connection error:', error)
                this.setStatus('error')
                resolve(false)
            }
        })
    }

    /**
     * Disconnect from relay server and clean up all resources
     */
    disconnect(): void {
        this.stopPing()
        this.stopReconnect()

        if (this.socket) {
            this.socket.close(1000, 'User disconnect')
            this.socket = null
        }

        // Close all mobile-owned terminal sessions
        this.terminalManager.closeAll()
        this.connectedMobiles.clear()
        this.activeSessions.clear()

        this.setStatus('disconnected')
        console.log('[RemoteServer] Disconnected')
    }

    /**
     * Create a PIN code for mobile pairing.
     * Sends HTTP POST to the relay server which returns a short-lived PIN.
     */
    async createPin(): Promise<{ pin: string; expiresAt: number } | null> {
        const settings = this.store.get('settings')
        const deviceId = getOrCreateDeviceId()
        const deviceName = getDeviceName()

        try {
            // Convert WebSocket URL to HTTPS for the REST endpoint
            const httpUrl = settings.relayUrl.replace('wss://', 'https://')

            const response = await fetch(`${httpUrl}/pin/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, deviceName })
            })

            const result = await response.json() as { success: boolean; data?: { pin: string; expiresAt: number } }

            if (result.success && result.data) {
                const pinData = {
                    value: result.data.pin,
                    expiresAt: result.data.expiresAt
                }
                this.store.set('pin', pinData)
                return { pin: pinData.value, expiresAt: pinData.expiresAt }
            }

            return null
        } catch (error) {
            console.error('[RemoteServer] Failed to create PIN:', error)
            return null
        }
    }

    /**
     * Get current remote connection state (for renderer display)
     */
    getState(): RemoteState {
        return {
            status: this.status,
            deviceId: getOrCreateDeviceId(),
            deviceName: getDeviceName(),
            connectedMobiles: Array.from(this.connectedMobiles.values()),
            activeSessions: Array.from(this.activeSessions.values())
        }
    }

    /**
     * Get saved remote settings
     */
    getSettings(): RemoteSettings {
        return this.store.get('settings')
    }

    /**
     * Save remote settings and auto-connect/disconnect based on enabled state
     */
    saveSettings(settings: RemoteSettings): void {
        this.store.set('settings', settings)

        if (settings.enabled && this.status === 'disconnected') {
            this.connect()
        } else if (!settings.enabled && this.status !== 'disconnected') {
            this.disconnect()
        }
    }

    /**
     * Check if currently connected to the relay server
     */
    isConnected(): boolean {
        return this.status === 'connected'
    }

    // =============================================
    // Message Handling
    // =============================================

    /**
     * Route incoming messages from the relay server to the appropriate handler
     */
    private handleMessage(message: RemoteMessage): void {
        const { type, payload } = message

        switch (type) {
            case 'registered':
                console.log('[RemoteServer] Registered with relay')
                this.broadcastStatus()
                break

            case 'mobile_connected':
                this.handleMobileConnect(payload.mobileId)
                break

            case 'mobile_disconnect':
                this.handleMobileDisconnect(payload.mobileId)
                break

            case 'workspace_list':
                this.handleWorkspaceListRequest(payload.requestFrom)
                break

            case 'session_create':
                this.handleSessionCreate(payload)
                break

            case 'session_close':
                this.handleSessionClose(payload)
                break

            case 'terminal_input':
                this.handleTerminalInput(payload)
                break

            case 'terminal_resize':
                this.handleTerminalResize(payload)
                break

            case 'pong':
                // Keep-alive response acknowledged, no action needed
                break

            case 'error':
                console.error('[RemoteServer] Error from relay:', payload.message)
                break

            default:
                console.log('[RemoteServer] Unknown message type:', type)
        }
    }

    // =============================================
    // Mobile Connection Handlers
    // =============================================

    private handleMobileConnect(mobileId: string): void {
        this.connectedMobiles.set(mobileId, {
            mobileId,
            connectedAt: Date.now(),
            lastActivity: Date.now()
        })
        console.log('[RemoteServer] Mobile connected:', mobileId)
        this.broadcastStatus()
    }

    private handleMobileDisconnect(mobileId: string): void {
        this.connectedMobiles.delete(mobileId)
        this.terminalManager.closeSessionsForMobile(mobileId)

        // Remove active sessions owned by this mobile
        for (const [sessionId, session] of this.activeSessions) {
            if (session.mobileId === mobileId) {
                this.activeSessions.delete(sessionId)
            }
        }

        console.log('[RemoteServer] Mobile disconnected:', mobileId)
        this.broadcastStatus()
    }

    // =============================================
    // Workspace & Session Handlers
    // =============================================

    /**
     * Respond to a mobile device's workspace list request
     * with a simplified view of all workspaces (no terminal sessions).
     */
    private handleWorkspaceListRequest(mobileId: string): void {
        const workspaces = this.getWorkspaces()

        const workspaceData = workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            path: w.path,
            branch: w.branchName,
            isWorktree: !!w.parentWorkspaceId
        }))

        this.send({
            type: 'workspace_data',
            payload: {
                requestTo: mobileId,
                workspaces: workspaceData
            }
        })
    }

    /**
     * Create a terminal session requested by a mobile device
     */
    private handleSessionCreate(payload: {
        workspaceId: string
        name: string
        requestFrom: string
    }): void {
        const workspaces = this.getWorkspaces()
        const workspace = workspaces.find((w) => w.id === payload.workspaceId)

        if (!workspace) {
            console.error('[RemoteServer] Workspace not found:', payload.workspaceId)
            return
        }

        const sessionId = uuidv4()
        const session: RemoteSession = {
            id: sessionId,
            mobileId: payload.requestFrom,
            workspaceId: payload.workspaceId,
            workspaceName: workspace.name,
            createdAt: Date.now()
        }

        const success = this.terminalManager.createSession(session, workspace.path)

        if (success) {
            this.activeSessions.set(sessionId, session)

            // Notify mobile that the session was created
            this.send({
                type: 'session_created',
                payload: {
                    requestTo: payload.requestFrom,
                    sessionId,
                    name: payload.name
                }
            })

            console.log('[RemoteServer] Created session:', sessionId)
        }
    }

    /**
     * Close a terminal session requested by a mobile device
     */
    private handleSessionClose(payload: { sessionId: string; requestFrom: string }): void {
        this.terminalManager.closeSession(payload.sessionId)
        this.activeSessions.delete(payload.sessionId)
        console.log('[RemoteServer] Closed session:', payload.sessionId)
    }

    // =============================================
    // Terminal I/O Handlers
    // =============================================

    private handleTerminalInput(payload: { sessionId: string; data: string; from: string }): void {
        this.terminalManager.write(payload.sessionId, payload.data)

        // Update last activity timestamp for the mobile connection
        const mobile = this.connectedMobiles.get(payload.from)
        if (mobile) {
            mobile.lastActivity = Date.now()
        }
    }

    private handleTerminalResize(payload: { sessionId: string; cols: number; rows: number }): void {
        this.terminalManager.resize(payload.sessionId, payload.cols, payload.rows)
    }

    /**
     * Forward terminal output to the mobile device via relay
     */
    private handleTerminalOutput(sessionId: string, mobileId: string, data: string): void {
        this.send({
            type: 'terminal_output',
            payload: {
                sessionId,
                to: mobileId,
                data
            }
        })
    }

    /**
     * Handle terminal process exit and notify the mobile device
     */
    private handleTerminalExit(sessionId: string, mobileId: string): void {
        this.activeSessions.delete(sessionId)
        this.send({
            type: 'session_close',
            payload: {
                sessionId,
                to: mobileId
            }
        })
    }

    // =============================================
    // Connection Management (reconnect, ping, status)
    // =============================================

    private handleDisconnect(): void {
        this.socket = null
        this.stopPing()
        this.setStatus('disconnected')

        // Auto-reconnect if settings allow it
        const settings = this.store.get('settings')
        if (settings.enabled && settings.autoConnect) {
            this.scheduleReconnect()
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return

        console.log(`[RemoteServer] Scheduling reconnect in ${RECONNECT_DELAY_MS / 1000}s`)
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this.connect()
        }, RECONNECT_DELAY_MS)
    }

    private stopReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
    }

    private startPing(): void {
        this.stopPing()
        this.pingTimer = setInterval(() => {
            this.send({ type: 'ping' })
        }, PING_INTERVAL_MS)
    }

    private stopPing(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer)
            this.pingTimer = null
        }
    }

    /**
     * Send a message to the relay server via WebSocket
     */
    private send(message: RemoteMessage): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(
                JSON.stringify({
                    ...message,
                    timestamp: Date.now()
                })
            )
        }
    }

    /**
     * Update internal status and broadcast to all renderer windows
     */
    private setStatus(status: RemoteConnectionStatus): void {
        this.status = status
        this.broadcastStatus()
    }

    /**
     * Send current state to all BrowserWindow instances
     * so the renderer can display connection status in real time.
     */
    private broadcastStatus(): void {
        const windows = BrowserWindow.getAllWindows()
        const state = this.getState()

        windows.forEach((win) => {
            win.webContents.send('remote-status', state)
        })
    }
}
