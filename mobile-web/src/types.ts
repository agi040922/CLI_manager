// Shared type definitions for mobile web client

export interface Workspace {
  id: string
  name: string
  path: string
  branch?: string
  isWorktree: boolean
  parentWorkspaceId?: string
}

export interface Session {
  id: string
  workspaceId: string
  workspaceName: string
  createdAt: number
}

export interface AuthResponse {
  success: boolean
  data?: {
    token: string
    expiresIn: number
    deviceName: string
  }
  error?: string
}

export interface RelayMessage {
  type: string
  payload?: Record<string, unknown>
  timestamp?: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// Stored session for auto-login via localStorage
export interface StoredSession {
  token: string
  deviceId: string
  deviceName: string
  expiresAt: number
}

// Relay event types for type-safe event handling
export type RelayEventMap = {
  status_change: ConnectionStatus
  workspace_data: Workspace[]
  session_created: { sessionId: string; name: string }
  terminal_output: { sessionId: string; data: string }
  session_closed: string
  error: string
}

export type RelayEventType = keyof RelayEventMap
