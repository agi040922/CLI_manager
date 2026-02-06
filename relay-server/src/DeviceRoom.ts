/**
 * CLImanger Relay Server - DeviceRoom Durable Object
 *
 * Manages WebSocket connections between a single desktop and
 * multiple mobile clients. Uses Cloudflare Durable Object
 * Hibernation API so the DO can be evicted from memory between
 * messages without losing WebSocket connections.
 *
 * Key concepts:
 * - Each device (desktop) gets its own DeviceRoom instance
 * - Mobile clients connect after PIN-based authentication
 * - Messages are routed between desktop <-> mobile pairs
 * - serializeAttachment/deserializeAttachment persists state across hibernation
 */

import { DurableObject } from "cloudflare:workers";
import type {
  Env,
  ConnectionInfo,
  ConnectionType,
  WebSocketAttachment,
  WebSocketMessage,
  DeviceStatus,
} from "./types";

export class DeviceRoom extends DurableObject<Env> {
  /**
   * In-memory connection map. This is rebuilt from WebSocket
   * attachments after hibernation wake-up.
   */
  private connections: Map<string, ConnectionInfo> = new Map();

  /** Reference to the single desktop connection (if any) */
  private desktopConnection: ConnectionInfo | null = null;

  /** Device metadata (set during "register" message from desktop) */
  private deviceId: string = "";
  private deviceName: string = "";
  private publicKey: string = "";

  // ============== HTTP Entry Point ==============

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Non-WebSocket status endpoint
    if (url.pathname.endsWith("/status")) {
      return this.handleStatus();
    }

    // All other requests must be WebSocket upgrades
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const type = url.searchParams.get("type") as ConnectionType | null;
    const mobileId = url.searchParams.get("mobileId");

    // Validate connection type
    if (!type || (type !== "desktop" && type !== "mobile")) {
      return new Response("Invalid connection type", { status: 400 });
    }

    // Mobile connections require a mobileId (set by the Worker after JWT verification)
    if (type === "mobile" && !mobileId) {
      return new Response("Mobile ID required", { status: 400 });
    }

    // Enforce connection limit for mobile clients
    if (type === "mobile") {
      const mobileCount = this.countMobileConnections();
      const maxConnections = parseInt(this.env.MAX_CONNECTIONS_PER_DEVICE || "3");
      if (mobileCount >= maxConnections) {
        return new Response("Max connections reached", { status: 429 });
      }
    }

    // Create WebSocket pair and accept with hibernation support
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // acceptWebSocket enables hibernation: the DO can sleep between messages
    this.ctx.acceptWebSocket(server);

    const connectionId = crypto.randomUUID();
    const connection: ConnectionInfo = {
      id: connectionId,
      type,
      socket: server,
      mobileId: type === "mobile" ? mobileId! : undefined,
      connectedAt: Date.now(),
      lastPing: Date.now(),
    };

    // Persist connection metadata for hibernation recovery
    const attachment: WebSocketAttachment = {
      connectionId,
      type,
      mobileId: connection.mobileId,
    };
    server.serializeAttachment(attachment);

    // Store in memory
    this.connections.set(connectionId, connection);

    if (type === "desktop") {
      // Only one desktop connection allowed; close the previous one
      if (this.desktopConnection) {
        this.closeConnection(this.desktopConnection.id);
      }
      this.desktopConnection = connection;
    } else {
      // Notify desktop that a new mobile client connected
      this.notifyDesktop("mobile_connected", { mobileId });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ============== Hibernation API Callbacks ==============

  /**
   * Called when a WebSocket receives a message.
   * This is the main entry point after hibernation wake-up.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const connection = this.findConnectionBySocket(ws);
    if (!connection) return;

    connection.lastPing = Date.now();

    try {
      const data: WebSocketMessage =
        typeof message === "string"
          ? JSON.parse(message)
          : JSON.parse(new TextDecoder().decode(message));

      await this.handleMessage(connection, data);
    } catch (error) {
      console.error("Failed to handle message:", error);
      this.sendError(ws, "Invalid message format");
    }
  }

  /**
   * Called when a WebSocket is closed (either by client or server).
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const connection = this.findConnectionBySocket(ws);
    if (connection) {
      this.handleDisconnect(connection);
    }
  }

  /**
   * Called when a WebSocket encounters an error.
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket error:", error);
    const connection = this.findConnectionBySocket(ws);
    if (connection) {
      this.handleDisconnect(connection);
    }
  }

  // ============== Message Routing ==============

  /**
   * Route incoming messages based on type.
   *
   * Desktop messages are forwarded to the target mobile client.
   * Mobile messages are forwarded to the desktop.
   * This relay pattern ensures desktop and mobile never communicate directly.
   */
  private async handleMessage(connection: ConnectionInfo, message: WebSocketMessage): Promise<void> {
    const { type, payload } = message;

    switch (type) {
      // Desktop registers itself with device metadata
      case "register": {
        if (connection.type !== "desktop") break;
        const p = payload as { deviceId: string; deviceName?: string; publicKey?: string };
        this.deviceId = p.deviceId;
        this.deviceName = p.deviceName || p.deviceId;
        this.publicKey = p.publicKey || "";
        this.send(connection.socket, { type: "registered", payload: { success: true } });
        break;
      }

      // Heartbeat: respond immediately
      case "ping": {
        this.send(connection.socket, { type: "pong", timestamp: Date.now() });
        break;
      }

      // Mobile requests workspace list -> forward to desktop
      case "workspace_list": {
        if (connection.type !== "mobile") break;
        const desktopSocket = this.getDesktopSocket();
        if (desktopSocket) {
          this.send(desktopSocket, {
            type: "workspace_list",
            payload: { requestFrom: connection.mobileId },
          });
        }
        break;
      }

      // Desktop responds with workspace data -> forward to requesting mobile
      case "workspace_data": {
        if (connection.type !== "desktop") break;
        const p = payload as { requestTo: string; workspaces: unknown[] };
        if (!p.requestTo) break;
        const mobileConn = this.findMobileConnection(p.requestTo);
        if (mobileConn) {
          this.send(mobileConn.socket, {
            type: "workspace_data",
            payload: { workspaces: p.workspaces },
          });
        }
        break;
      }

      // Mobile requests session creation -> forward to desktop
      case "session_create": {
        if (connection.type !== "mobile") break;
        const desktopSocket = this.getDesktopSocket();
        if (desktopSocket) {
          this.send(desktopSocket, {
            type: "session_create",
            payload: { ...payload, requestFrom: connection.mobileId },
          });
        }
        break;
      }

      // Desktop confirms session creation -> forward to requesting mobile
      case "session_created": {
        if (connection.type !== "desktop") break;
        const p = payload as { requestTo: string; sessionId: string; name: string };
        if (!p.requestTo) break;
        const mobileConn = this.findMobileConnection(p.requestTo);
        if (mobileConn) {
          this.send(mobileConn.socket, {
            type: "session_created",
            payload: { sessionId: p.sessionId, name: p.name },
          });
        }
        break;
      }

      // Mobile requests session close -> forward to desktop
      case "session_close": {
        if (connection.type !== "mobile") break;
        const desktopSocket = this.getDesktopSocket();
        if (desktopSocket) {
          this.send(desktopSocket, {
            type: "session_close",
            payload: { ...payload, requestFrom: connection.mobileId },
          });
        }
        break;
      }

      // Mobile sends terminal input -> forward to desktop
      case "terminal_input": {
        if (connection.type !== "mobile") break;
        const desktopSocket = this.getDesktopSocket();
        if (desktopSocket) {
          this.send(desktopSocket, {
            type: "terminal_input",
            payload: { ...payload, from: connection.mobileId },
            encrypted: message.encrypted,
          });
        }
        break;
      }

      // Desktop sends terminal output -> forward to target mobile
      case "terminal_output": {
        if (connection.type !== "desktop") break;
        const p = payload as { to: string; sessionId: string; data: string };
        if (!p.to) break;
        const mobileConn = this.findMobileConnection(p.to);
        if (mobileConn) {
          this.send(mobileConn.socket, {
            type: "terminal_output",
            payload: { data: p.data, sessionId: p.sessionId },
            encrypted: message.encrypted,
          });
        }
        break;
      }

      // Mobile sends terminal resize -> forward to desktop
      case "terminal_resize": {
        if (connection.type !== "mobile") break;
        const desktopSocket = this.getDesktopSocket();
        if (desktopSocket) {
          this.send(desktopSocket, {
            type: "terminal_resize",
            payload: { ...payload, from: connection.mobileId },
          });
        }
        break;
      }

      // Mobile explicitly disconnects
      case "mobile_disconnect": {
        this.handleDisconnect(connection);
        break;
      }

      default:
        console.log("Unknown message type:", type);
    }
  }

  // ============== Connection Lifecycle ==============

  /**
   * Handle a client disconnection.
   *
   * When desktop disconnects: close all mobile connections (they cannot operate alone).
   * When mobile disconnects: notify desktop so it can clean up resources.
   */
  private handleDisconnect(connection: ConnectionInfo): void {
    this.connections.delete(connection.id);

    if (connection.type === "desktop") {
      this.desktopConnection = null;

      // Close all remaining mobile connections
      for (const conn of this.connections.values()) {
        if (conn.type === "mobile") {
          this.send(conn.socket, {
            type: "error",
            payload: { message: "Desktop disconnected" },
          });
          try {
            conn.socket.close(1000, "Desktop disconnected");
          } catch {
            // Socket may already be closed
          }
        }
      }
      this.connections.clear();
    } else if (connection.type === "mobile") {
      this.notifyDesktop("mobile_disconnect", { mobileId: connection.mobileId });
    }
  }

  /**
   * Close a specific connection by ID.
   * Used when replacing an existing desktop connection.
   */
  private closeConnection(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      try {
        conn.socket.close(1000, "Connection replaced");
      } catch {
        // Socket may already be closed
      }
      this.connections.delete(id);
    }
  }

  // ============== Socket Lookup (Hibernation-Safe) ==============

  /**
   * Find the ConnectionInfo for a given WebSocket.
   *
   * After hibernation, in-memory maps are empty, so we fall back
   * to deserializeAttachment to reconstruct the connection info.
   */
  private findConnectionBySocket(socket: WebSocket): ConnectionInfo | undefined {
    // Try in-memory lookup first (fast path)
    for (const conn of this.connections.values()) {
      if (conn.socket === socket) return conn;
    }

    // Restore from attachment after hibernation wake-up
    try {
      const attachment = socket.deserializeAttachment() as WebSocketAttachment | null;
      if (attachment) {
        const connection: ConnectionInfo = {
          id: attachment.connectionId,
          type: attachment.type,
          socket,
          mobileId: attachment.mobileId,
          connectedAt: Date.now(),
          lastPing: Date.now(),
        };
        this.connections.set(attachment.connectionId, connection);

        // Restore desktop reference
        if (attachment.type === "desktop") {
          this.desktopConnection = connection;
        }

        return connection;
      }
    } catch (e) {
      console.error("Failed to restore connection:", e);
    }

    return undefined;
  }

  /**
   * Find a mobile connection by its mobileId.
   * Checks in-memory map first, then falls back to scanning all
   * WebSocket attachments (hibernation recovery).
   */
  private findMobileConnection(mobileId: string): ConnectionInfo | undefined {
    // Check in-memory first
    for (const conn of this.connections.values()) {
      if (conn.type === "mobile" && conn.mobileId === mobileId) {
        return conn;
      }
    }

    // Scan all WebSockets for hibernation recovery
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try {
        const attachment = socket.deserializeAttachment() as WebSocketAttachment | null;
        if (attachment && attachment.type === "mobile" && attachment.mobileId === mobileId) {
          const connection: ConnectionInfo = {
            id: attachment.connectionId,
            type: "mobile",
            socket,
            mobileId: attachment.mobileId,
            connectedAt: Date.now(),
            lastPing: Date.now(),
          };
          this.connections.set(attachment.connectionId, connection);
          return connection;
        }
      } catch {
        // Skip invalid sockets
      }
    }

    return undefined;
  }

  /**
   * Get the desktop WebSocket, checking in-memory first,
   * then scanning all sockets for hibernation recovery.
   */
  private getDesktopSocket(): WebSocket | null {
    if (this.desktopConnection) {
      return this.desktopConnection.socket;
    }

    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try {
        const attachment = socket.deserializeAttachment() as WebSocketAttachment | null;
        if (attachment && attachment.type === "desktop") {
          return socket;
        }
      } catch {
        // Skip
      }
    }

    return null;
  }

  /**
   * Count current mobile connections using the hibernation-safe socket list.
   */
  private countMobileConnections(): number {
    let count = 0;
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try {
        const attachment = socket.deserializeAttachment() as WebSocketAttachment | null;
        if (attachment && attachment.type === "mobile") {
          count++;
        }
      } catch {
        // Skip
      }
    }
    return count;
  }

  // ============== Message Sending ==============

  /**
   * Send a JSON message through a WebSocket.
   * Automatically appends a timestamp field.
   */
  private send(socket: WebSocket, message: Record<string, unknown>): void {
    try {
      socket.send(JSON.stringify({ ...message, timestamp: Date.now() }));
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }

  /**
   * Send an error message to a specific WebSocket.
   */
  private sendError(socket: WebSocket, message: string): void {
    this.send(socket, { type: "error", payload: { message } });
  }

  /**
   * Send a message to the desktop connection (if available).
   * Tries in-memory reference first, then scans all sockets.
   */
  private notifyDesktop(type: string, payload: Record<string, unknown>): void {
    if (this.desktopConnection) {
      this.send(this.desktopConnection.socket, { type, payload });
      return;
    }

    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try {
        const attachment = socket.deserializeAttachment() as WebSocketAttachment | null;
        if (attachment && attachment.type === "desktop") {
          this.send(socket, { type, payload });
          return;
        }
      } catch {
        // Skip
      }
    }
  }

  // ============== Status Endpoint ==============

  /**
   * Return current device room status as JSON.
   * Uses ctx.getWebSockets() for accurate count that survives hibernation.
   */
  private handleStatus(): Response {
    const sockets = this.ctx.getWebSockets();
    let desktopConnected = false;
    const mobileConnections: DeviceStatus["mobileConnections"] = [];

    for (const socket of sockets) {
      try {
        const attachment = socket.deserializeAttachment() as WebSocketAttachment | null;
        if (!attachment) continue;

        if (attachment.type === "desktop") {
          desktopConnected = true;
        } else if (attachment.type === "mobile") {
          mobileConnections.push({
            mobileId: attachment.mobileId || "unknown",
            connectedAt: Date.now(),
            lastPing: Date.now(),
          });
        }
      } catch {
        // Skip invalid sockets
      }
    }

    const status: DeviceStatus = {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      desktopConnected,
      mobileConnections,
      totalConnections: sockets.length,
    };

    return new Response(JSON.stringify(status), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
