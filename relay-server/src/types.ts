/**
 * CLImanger Relay Server - Type Definitions
 *
 * All shared types for the relay server including WebSocket messages,
 * environment bindings, and connection state.
 */

// ============== Cloudflare Bindings ==============

export interface Env {
  /** Durable Object binding for device room management */
  DEVICE_ROOMS: DurableObjectNamespace;
  /** KV namespace for temporary PIN storage */
  PIN_STORE: KVNamespace;
  /** Secret key for JWT signing (set via `wrangler secret`) */
  JWT_SECRET: string;
  /** Comma-separated allowed origins for CORS (set via `wrangler secret`) */
  ALLOWED_ORIGINS?: string;
  /** Environment name */
  ENVIRONMENT: string;
  /** Maximum mobile connections per device (default: "3") */
  MAX_CONNECTIONS_PER_DEVICE: string;
  /** PIN expiry in seconds (default: "300") */
  PIN_EXPIRY_SECONDS: string;
  /** Session expiry in seconds (default: "86400") */
  SESSION_EXPIRY_SECONDS: string;
}

// ============== Connection Types ==============

export type ConnectionType = "desktop" | "mobile";

export interface ConnectionInfo {
  id: string;
  type: ConnectionType;
  socket: WebSocket;
  mobileId?: string;
  connectedAt: number;
  lastPing: number;
}

/** Data persisted via serializeAttachment for hibernation recovery */
export interface WebSocketAttachment {
  connectionId: string;
  type: ConnectionType;
  mobileId?: string;
}

// ============== WebSocket Message Types ==============

export type MessageType =
  | "register"
  | "registered"
  | "ping"
  | "pong"
  | "workspace_list"
  | "workspace_data"
  | "session_create"
  | "session_created"
  | "session_close"
  | "terminal_input"
  | "terminal_output"
  | "terminal_resize"
  | "mobile_connected"
  | "mobile_disconnect"
  | "error";

/** Base shape for all WebSocket messages */
export interface WebSocketMessage {
  type: MessageType;
  payload?: Record<string, unknown>;
  encrypted?: boolean;
  timestamp?: number;
}

// -- Inbound messages (client -> server) --

export interface RegisterMessage extends WebSocketMessage {
  type: "register";
  payload: {
    deviceId: string;
    deviceName?: string;
    publicKey?: string;
  };
}

export interface PingMessage extends WebSocketMessage {
  type: "ping";
}

export interface WorkspaceListRequestMessage extends WebSocketMessage {
  type: "workspace_list";
}

export interface WorkspaceDataMessage extends WebSocketMessage {
  type: "workspace_data";
  payload: {
    requestTo: string;
    workspaces: unknown[];
  };
}

export interface SessionCreateMessage extends WebSocketMessage {
  type: "session_create";
  payload: {
    workspaceId: string;
    name?: string;
  };
}

export interface SessionCreatedMessage extends WebSocketMessage {
  type: "session_created";
  payload: {
    requestTo: string;
    sessionId: string;
    name: string;
  };
}

export interface SessionCloseMessage extends WebSocketMessage {
  type: "session_close";
  payload: {
    sessionId: string;
  };
}

export interface TerminalInputMessage extends WebSocketMessage {
  type: "terminal_input";
  payload: {
    sessionId: string;
    data: string;
  };
  encrypted?: boolean;
}

export interface TerminalOutputMessage extends WebSocketMessage {
  type: "terminal_output";
  payload: {
    to: string;
    sessionId: string;
    data: string;
  };
  encrypted?: boolean;
}

export interface TerminalResizeMessage extends WebSocketMessage {
  type: "terminal_resize";
  payload: {
    sessionId: string;
    cols: number;
    rows: number;
  };
}

export interface MobileDisconnectMessage extends WebSocketMessage {
  type: "mobile_disconnect";
}

// -- Outbound-only messages (server -> client) --

export interface RegisteredMessage extends WebSocketMessage {
  type: "registered";
  payload: { success: boolean };
}

export interface PongMessage extends WebSocketMessage {
  type: "pong";
  timestamp: number;
}

export interface ErrorMessage extends WebSocketMessage {
  type: "error";
  payload: { message: string };
}

export interface MobileConnectedMessage extends WebSocketMessage {
  type: "mobile_connected";
  payload: { mobileId: string };
}

// ============== REST API Types ==============

export interface PinCreateRequest {
  deviceId: string;
  deviceName?: string;
}

export interface AuthRequest {
  deviceId: string;
  pin: string;
}

export interface PinStoreData {
  deviceId: string;
  deviceName: string;
  pin: string;
  createdAt: number;
  expiresAt: number;
}

export interface JwtPayload {
  deviceId: string;
  mobileId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface QRData {
  type: "climanger";
  version: number;
  deviceId: string;
  pin: string;
  relay: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DeviceStatus {
  deviceId: string;
  deviceName: string;
  desktopConnected: boolean;
  mobileConnections: Array<{
    mobileId: string;
    connectedAt: number;
    lastPing: number;
  }>;
  totalConnections: number;
}
