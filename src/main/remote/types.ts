// Remote connection types for mobile feature

export interface RemoteSettings {
    enabled: boolean
    relayUrl: string
    autoConnect: boolean
}

export interface MobileConnection {
    mobileId: string
    connectedAt: number
    lastActivity: number
}

export interface RemoteSession {
    id: string
    mobileId: string
    workspaceId: string
    workspaceName: string
    createdAt: number
}

export type RemoteMessageType =
    | 'register'
    | 'registered'
    | 'mobile_connected'
    | 'mobile_disconnect'
    | 'workspace_list'
    | 'workspace_data'
    | 'session_create'
    | 'session_created'
    | 'session_close'
    | 'terminal_input'
    | 'terminal_output'
    | 'terminal_resize'
    | 'ping'
    | 'pong'
    | 'error'

export interface RemoteMessage {
    type: RemoteMessageType
    payload?: any
    timestamp?: number
    encrypted?: boolean
}

export interface DeviceInfo {
    deviceId: string
    deviceName: string
}

export type RemoteConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface RemoteState {
    status: RemoteConnectionStatus
    deviceId: string | null
    deviceName: string
    connectedMobiles: MobileConnection[]
    activeSessions: RemoteSession[]
}
