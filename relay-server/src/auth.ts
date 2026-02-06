/**
 * CLImanger Relay Server - Authentication Module
 *
 * JWT creation/verification using Web Crypto API (HMAC-SHA256).
 * PIN generation and validation utilities.
 * No external dependencies required.
 */

import type { Env, JwtPayload, PinStoreData, QRData } from "./types";

// ============== Encoding Helpers ==============

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encode a Uint8Array to a base64url string (no padding).
 * Required by JWT spec (RFC 7515 Section 2).
 */
function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a base64url string back to a Uint8Array.
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ============== HMAC Key Management ==============

/**
 * Import a raw string secret as an HMAC-SHA256 CryptoKey.
 * The key is non-extractable and only supports sign/verify.
 */
async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Sign data with HMAC-SHA256 and return as base64url string.
 */
async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Verify an HMAC-SHA256 signature against the original data.
 */
async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const key = await getHmacKey(secret);
  const signatureBytes = base64UrlDecode(signature);
  return crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(data));
}

// ============== JWT Operations ==============

/**
 * Create a signed JWT token with the given payload.
 *
 * Structure: header.payload.signature
 * - Header: { alg: "HS256", typ: "JWT" }
 * - Payload: user data + iat (issued at) + exp (expiration)
 * - Signature: HMAC-SHA256 of "header.payload"
 *
 * @param payload - Data to embed in the token
 * @param secret - HMAC secret key
 * @param expiresInSeconds - Token lifetime (default: 24 hours)
 * @returns Signed JWT string
 */
export async function createToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  expiresInSeconds: number = 86400
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const signature = await hmacSign(`${headerB64}.${payloadB64}`, secret);

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify and decode a JWT token.
 *
 * Checks:
 * 1. Token has exactly 3 parts (header.payload.signature)
 * 2. HMAC-SHA256 signature is valid
 * 3. Token has not expired (exp > current time)
 *
 * @param token - JWT string to verify
 * @param secret - HMAC secret key (must match the one used for signing)
 * @returns Decoded payload if valid, null otherwise
 */
export async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;
    const isValid = await hmacVerify(`${headerB64}.${payloadB64}`, signature, secret);
    if (!isValid) return null;

    const payload: JwtPayload = JSON.parse(decoder.decode(base64UrlDecode(payloadB64)));

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ============== PIN Utilities ==============

/**
 * Generate a cryptographically random 6-digit PIN.
 * Uses Web Crypto API for secure randomness.
 */
export function generatePin(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return (array[0] % 1000000).toString().padStart(6, "0");
}

/**
 * Generate a random 32-character hex mobile identifier.
 */
export function generateMobileId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a session ID combining timestamp and random hex.
 * Format: <base36-timestamp>-<8-char-random-hex>
 */
export function generateSessionId(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  const timestamp = Date.now().toString(36);
  const random = Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
  return `${timestamp}-${random}`;
}

// ============== Validation ==============

/** Device ID format: word-word-digits (e.g. "cool-breeze-42") */
const DEVICE_ID_PATTERN = /^[a-z]+-[a-z]+-\d{2}$/;

/** PIN format: exactly 6 digits */
const PIN_PATTERN = /^\d{6}$/;

export function isValidDeviceId(deviceId: string): boolean {
  return DEVICE_ID_PATTERN.test(deviceId);
}

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

// ============== QR Code Data ==============

/**
 * Generate the JSON payload for QR code scanning.
 * The mobile app scans this to get connection details.
 */
export function generateQRData(deviceId: string, pin: string, relayUrl: string): string {
  const data: QRData = {
    type: "climanger",
    version: 1,
    deviceId,
    pin,
    relay: relayUrl,
  };
  return JSON.stringify(data);
}

// ============== PIN Store Operations ==============

/**
 * Store a PIN in KV with auto-expiry.
 *
 * @param env - Worker environment bindings
 * @param deviceId - Target device identifier
 * @param deviceName - Human-readable device name
 * @param pin - Generated 6-digit PIN
 * @returns Stored PIN data including expiration timestamp
 */
export async function storePin(
  env: Env,
  deviceId: string,
  deviceName: string,
  pin: string
): Promise<PinStoreData> {
  const expirySeconds = parseInt(env.PIN_EXPIRY_SECONDS || "300");
  const now = Date.now();

  const pinData: PinStoreData = {
    deviceId,
    deviceName,
    pin,
    createdAt: now,
    expiresAt: now + expirySeconds * 1000,
  };

  await env.PIN_STORE.put(`pin:${deviceId}`, JSON.stringify(pinData), {
    expirationTtl: expirySeconds,
  });

  return pinData;
}

/**
 * Retrieve and parse PIN data from KV.
 *
 * @returns Parsed PIN data or null if not found/expired
 */
export async function getPin(env: Env, deviceId: string): Promise<PinStoreData | null> {
  const stored = await env.PIN_STORE.get(`pin:${deviceId}`);
  if (!stored) return null;

  return JSON.parse(stored) as PinStoreData;
}

/**
 * Delete a PIN from KV after successful authentication.
 */
export async function deletePin(env: Env, deviceId: string): Promise<void> {
  await env.PIN_STORE.delete(`pin:${deviceId}`);
}
