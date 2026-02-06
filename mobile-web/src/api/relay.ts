// Relay Server API Client
// Handles REST authentication and WebSocket communication with the relay server

import type {
  AuthResponse,
  RelayMessage,
  Workspace,
  RelayEventType,
  RelayEventMap,
} from '../types'

const RELAY_URL =
  import.meta.env.VITE_RELAY_URL || 'https://climanger-relay.jkh040922.workers.dev'

// --- REST API ---

export async function authenticate(
  deviceId: string,
  pin: string,
): Promise<AuthResponse> {
  const response = await fetch(`${RELAY_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, pin }),
  })
  return response.json()
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${RELAY_URL}/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json()
    return result.success === true
  } catch {
    return false
  }
}

// --- WebSocket Connection ---

type Listener<T extends RelayEventType> = (data: RelayEventMap[T]) => void

/**
 * Manages WebSocket connection to the relay server.
 * Uses a type-safe event listener pattern (Map<string, Function[]>).
 */
export class RelayConnection {
  private ws: WebSocket | null = null
  private token: string
  private deviceId: string
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true

  // Type-safe event listeners
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map()

  constructor(token: string, deviceId: string) {
    this.token = token
    this.deviceId = deviceId
  }

  // --- Event System ---

  on<T extends RelayEventType>(event: T, callback: Listener<T>): void {
    const existing = this.listeners.get(event) || []
    existing.push(callback)
    this.listeners.set(event, existing)
  }

  off<T extends RelayEventType>(event: T, callback: Listener<T>): void {
    const existing = this.listeners.get(event) || []
    this.listeners.set(
      event,
      existing.filter((fn) => fn !== callback),
    )
  }

  private emit<T extends RelayEventType>(event: T, data: RelayEventMap[T]): void {
    const handlers = this.listeners.get(event) || []
    for (const handler of handlers) {
      handler(data)
    }
  }

  // --- Connection Lifecycle ---

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    this.shouldReconnect = true
    this.emit('status_change', 'connecting')

    // Build WebSocket URL: replace https with wss
    const wsUrl = `${RELAY_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/connect/${this.deviceId}?type=mobile&token=${this.token}`

    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      console.log('[Relay] Connected')
      this.emit('status_change', 'connected')
      this.stopReconnect()

      // Automatically request workspace list on connect
      this.requestWorkspaces()
    }

    this.ws.onmessage = (event) => {
      try {
        const message: RelayMessage = JSON.parse(event.data)
        this.handleMessage(message)
      } catch (e) {
        console.error('[Relay] Failed to parse message:', e)
      }
    }

    this.ws.onclose = (event) => {
      console.log('[Relay] Disconnected:', event.code, event.reason)
      this.emit('status_change', 'disconnected')

      if (this.shouldReconnect) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      console.error('[Relay] WebSocket error')
      this.emit('status_change', 'error')
    }
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.stopReconnect()

    if (this.ws) {
      this.ws.close(1000, 'User disconnect')
      this.ws = null
    }

    // Clear all listeners
    this.listeners.clear()
  }

  private handleMessage(message: RelayMessage): void {
    const { type, payload } = message

    switch (type) {
      case 'workspace_data':
        if (payload?.workspaces) {
          this.emit('workspace_data', payload.workspaces as Workspace[])
        }
        break

      case 'session_created':
        if (payload) {
          this.emit(
            'session_created',
            payload as { sessionId: string; name: string },
          )
        }
        break

      case 'terminal_output':
        if (payload) {
          this.emit(
            'terminal_output',
            payload as { sessionId: string; data: string },
          )
        }
        break

      case 'session_close':
        if (payload?.sessionId) {
          this.emit('session_closed', payload.sessionId as string)
        }
        break

      case 'error':
        this.emit('error', (payload?.message as string) || 'Unknown error')
        break

      case 'pong':
        // Keep-alive response, no action needed
        break

      default:
        console.log('[Relay] Unknown message type:', type)
    }
  }

  private send(message: RelayMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          ...message,
          timestamp: Date.now(),
        }),
      )
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return

    console.log('[Relay] Reconnecting in 3 seconds...')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // --- Public Actions ---

  requestWorkspaces(): void {
    this.send({ type: 'workspace_list' })
  }

  createSession(workspaceId: string, name: string): void {
    this.send({
      type: 'session_create',
      payload: { workspaceId, name },
    })
  }

  closeSession(sessionId: string): void {
    this.send({
      type: 'session_close',
      payload: { sessionId },
    })
  }

  sendTerminalInput(sessionId: string, data: string): void {
    this.send({
      type: 'terminal_input',
      payload: { sessionId, data },
    })
  }

  sendTerminalResize(sessionId: string, cols: number, rows: number): void {
    this.send({
      type: 'terminal_resize',
      payload: { sessionId, cols, rows },
    })
  }
}
