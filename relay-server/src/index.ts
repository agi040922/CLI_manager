/**
 * CLImanger Relay Server - Cloudflare Worker Entry Point
 *
 * This is the main request handler that routes HTTP requests
 * to the appropriate handler. WebSocket connections are forwarded
 * to the DeviceRoom Durable Object.
 *
 * API Endpoints:
 * - GET  /                      Health check
 * - POST /pin/create            Create a PIN for mobile pairing
 * - POST /auth                  Authenticate with PIN, receive JWT
 * - GET  /verify                Verify JWT token validity
 * - GET  /connect/:deviceId     WebSocket connection (desktop or mobile)
 * - GET  /device/:deviceId/status  Device connection status
 */

import type { Env, ApiResponse, PinCreateRequest, AuthRequest } from "./types";
import {
  createToken,
  verifyToken,
  generatePin,
  generateMobileId,
  generateSessionId,
  generateQRData,
  isValidDeviceId,
  isValidPin,
  storePin,
  getPin,
  deletePin,
} from "./auth";

// Re-export DeviceRoom so wrangler can discover it
export { DeviceRoom } from "./DeviceRoom";

// ============== CORS Utilities ==============

/**
 * Build CORS headers based on the request origin and allowed origins config.
 * If ALLOWED_ORIGINS is not set or contains "*", all origins are allowed.
 */
function getCorsHeaders(request: Request, allowedOrigins?: string): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const origins = allowedOrigins ? allowedOrigins.split(",").map((o) => o.trim()) : ["*"];
  const isAllowed = origins.includes("*") || origins.includes(origin);

  return {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Origin": isAllowed ? origin || "*" : origins[0],
    "Access-Control-Allow-Credentials": "true",
  };
}

/** Handle CORS preflight (OPTIONS) requests */
function handleCorsPreFlight(request: Request, allowedOrigins?: string): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, allowedOrigins),
  });
}

/** Clone a response with CORS headers added */
function addCorsHeaders(response: Response, request: Request, allowedOrigins?: string): Response {
  const corsHeaders = getCorsHeaders(request, allowedOrigins);
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ============== JSON Response Helper ==============

function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ============== Route Handlers ==============

/**
 * POST /pin/create
 *
 * Desktop creates a PIN that the mobile user will enter to authenticate.
 * The PIN is stored in KV with a TTL (default: 5 minutes).
 * Also returns QR data that can be scanned by the mobile app.
 */
async function handlePinCreate(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as PinCreateRequest;

  if (!body.deviceId || !isValidDeviceId(body.deviceId)) {
    return jsonResponse({ success: false, error: "Invalid device ID" }, 400);
  }

  const pin = generatePin();
  const pinData = await storePin(env, body.deviceId, body.deviceName || body.deviceId, pin);

  // Build QR data with relay URL for mobile scanning
  const relayUrl = new URL(request.url);
  const qrData = generateQRData(body.deviceId, pin, `https://${relayUrl.host}`);

  return jsonResponse({
    success: true,
    data: { pin, expiresAt: pinData.expiresAt, qrData },
  });
}

/**
 * POST /auth
 *
 * Mobile authenticates with a device ID and PIN.
 * On success: deletes the PIN (one-time use) and returns a JWT.
 * The JWT contains deviceId, mobileId, and sessionId.
 */
async function handleAuth(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as AuthRequest;

  if (!body.deviceId || !isValidDeviceId(body.deviceId)) {
    return jsonResponse({ success: false, error: "Invalid device ID" }, 400);
  }

  if (!body.pin || !isValidPin(body.pin)) {
    return jsonResponse({ success: false, error: "Invalid PIN format" }, 400);
  }

  // Look up stored PIN
  const pinData = await getPin(env, body.deviceId);
  if (!pinData) {
    return jsonResponse({ success: false, error: "PIN expired or not found" }, 401);
  }

  // Verify PIN matches
  if (pinData.pin !== body.pin) {
    return jsonResponse({ success: false, error: "Invalid PIN" }, 401);
  }

  // Check expiration (KV TTL handles cleanup, but double-check)
  if (Date.now() > pinData.expiresAt) {
    await deletePin(env, body.deviceId);
    return jsonResponse({ success: false, error: "PIN expired" }, 401);
  }

  // Generate mobile credentials
  const mobileId = generateMobileId();
  const sessionId = generateSessionId();
  const sessionExpiry = parseInt(env.SESSION_EXPIRY_SECONDS || "86400");

  const token = await createToken(
    { deviceId: body.deviceId, mobileId, sessionId },
    env.JWT_SECRET,
    sessionExpiry
  );

  // Delete PIN after successful auth (one-time use)
  await deletePin(env, body.deviceId);

  return jsonResponse({
    success: true,
    data: { token, expiresIn: sessionExpiry, deviceName: pinData.deviceName },
  });
}

/**
 * GET /verify
 *
 * Verify a JWT token and return its claims.
 * Used by the mobile app to check if the session is still valid.
 */
async function handleVerify(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ success: false, error: "Missing authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, env.JWT_SECRET);

  if (!payload) {
    return jsonResponse({ success: false, error: "Invalid or expired token" }, 401);
  }

  return jsonResponse({
    success: true,
    data: {
      deviceId: payload.deviceId,
      mobileId: payload.mobileId,
      sessionId: payload.sessionId,
      expiresAt: payload.exp * 1000, // Convert to milliseconds
    },
  });
}

/**
 * GET /connect/:deviceId?type=desktop
 * GET /connect/:deviceId?type=mobile&token=xxx
 *
 * WebSocket upgrade endpoint. Routes the connection to the
 * appropriate DeviceRoom Durable Object.
 *
 * Desktop: connects directly (no auth required for the WS itself).
 * Mobile: requires a valid JWT token as query parameter.
 */
async function handleWebSocketConnect(request: Request, env: Env, url: URL): Promise<Response> {
  const pathParts = url.pathname.split("/");
  const deviceId = pathParts[2];

  if (!deviceId || !isValidDeviceId(deviceId)) {
    return jsonResponse({ success: false, error: "Invalid device ID" }, 400);
  }

  const type = url.searchParams.get("type");
  if (type !== "desktop" && type !== "mobile") {
    return jsonResponse({ success: false, error: "Invalid connection type" }, 400);
  }

  // Mobile connections require JWT verification
  if (type === "mobile") {
    const token = url.searchParams.get("token");
    if (!token) {
      return jsonResponse({ success: false, error: "Missing token" }, 401);
    }

    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload || payload.deviceId !== deviceId) {
      return jsonResponse({ success: false, error: "Invalid token" }, 401);
    }

    // Inject mobileId into the URL so the Durable Object can read it
    url.searchParams.set("mobileId", payload.mobileId);
  }

  // Forward to the DeviceRoom Durable Object
  // Use modified URL (with mobileId injected) to construct a new request
  const roomId = env.DEVICE_ROOMS.idFromName(deviceId);
  const room = env.DEVICE_ROOMS.get(roomId);

  return room.fetch(new Request(url.toString(), request));
}

/**
 * GET /device/:deviceId/status
 *
 * Query the connection status of a specific device room.
 * Returns desktop/mobile connection info.
 */
async function handleDeviceStatus(request: Request, env: Env, url: URL): Promise<Response> {
  const pathParts = url.pathname.split("/");
  const deviceId = pathParts[2];

  if (!deviceId || !isValidDeviceId(deviceId)) {
    return jsonResponse({ success: false, error: "Invalid device ID" }, 400);
  }

  const roomId = env.DEVICE_ROOMS.idFromName(deviceId);
  const room = env.DEVICE_ROOMS.get(roomId);

  // Forward a status request to the Durable Object
  const statusUrl = new URL(request.url);
  statusUrl.pathname = "/status";

  return room.fetch(new Request(statusUrl.toString()));
}

// ============== Worker Export ==============

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCorsPreFlight(request, env.ALLOWED_ORIGINS);
    }

    let response: Response;

    try {
      // Route based on pathname
      if (url.pathname === "/") {
        response = jsonResponse({
          success: true,
          data: {
            name: "CLImanger Relay Server",
            version: "1.0.0",
            status: "running",
          },
        });
      } else if (url.pathname === "/pin/create" && request.method === "POST") {
        response = await handlePinCreate(request, env);
      } else if (url.pathname === "/auth" && request.method === "POST") {
        response = await handleAuth(request, env);
      } else if (url.pathname === "/verify" && request.method === "GET") {
        response = await handleVerify(request, env);
      } else if (url.pathname.startsWith("/connect/")) {
        // WebSocket upgrades return status 101 which cannot be wrapped
        // by addCorsHeaders (Response constructor rejects it), so return directly
        return await handleWebSocketConnect(request, env, url);
      } else if (url.pathname.startsWith("/device/") && url.pathname.endsWith("/status")) {
        response = await handleDeviceStatus(request, env, url);
      } else {
        response = jsonResponse({ success: false, error: "Not Found" }, 404);
      }
    } catch (error) {
      console.error("Request error:", error);
      response = jsonResponse(
        {
          success: false,
          error: error instanceof Error ? error.message : "Internal Server Error",
        },
        500
      );
    }

    // Add CORS headers to all non-WebSocket responses
    return addCorsHeaders(response, request, env.ALLOWED_ORIGINS);
  },
};
