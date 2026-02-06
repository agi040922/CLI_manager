// LoginPage - Device ID + 6-digit PIN authentication
// Supports auto-login via localStorage stored session

import { useState, useEffect, useRef } from 'react'
import { Terminal, Loader2, AlertCircle, Smartphone } from 'lucide-react'
import { authenticate, verifyToken } from '../api/relay'
import type { StoredSession } from '../types'

const STORAGE_KEY = 'climanger_mobile_session'

// Device ID format: adjective-animal-00
const DEVICE_ID_PATTERN = /^[a-z]+-[a-z]+-\d{2}$/
const PIN_LENGTH = 6

interface LoginPageProps {
  onLogin: (token: string, deviceId: string, deviceName: string) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [deviceId, setDeviceId] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)
  const pinInputRef = useRef<HTMLInputElement>(null)

  // Try to restore session from localStorage on mount
  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) return

        const session: StoredSession = JSON.parse(stored)

        // Skip if token has expired
        if (session.expiresAt <= Date.now()) {
          localStorage.removeItem(STORAGE_KEY)
          return
        }

        // Verify token is still valid on the server
        const isValid = await verifyToken(session.token)
        if (!cancelled && isValid) {
          onLogin(session.token, session.deviceId, session.deviceName)
          return
        }

        localStorage.removeItem(STORAGE_KEY)
      } catch (e) {
        console.error('Failed to restore session:', e)
        localStorage.removeItem(STORAGE_KEY)
      } finally {
        if (!cancelled) {
          setInitializing(false)
        }
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [onLogin])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const cleanDeviceId = deviceId.trim().toLowerCase()
      const cleanPin = pin.trim()

      // Validate Device ID format
      if (!cleanDeviceId || !DEVICE_ID_PATTERN.test(cleanDeviceId)) {
        throw new Error('Invalid Device ID format (e.g., swift-tiger-42)')
      }

      // Validate PIN: exactly 6 digits
      if (!cleanPin || cleanPin.length !== PIN_LENGTH) {
        throw new Error(`PIN must be ${PIN_LENGTH} digits`)
      }

      const result = await authenticate(cleanDeviceId, cleanPin)

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Authentication failed')
      }

      // Persist session for auto-login
      const session: StoredSession = {
        token: result.data.token,
        deviceId: cleanDeviceId,
        deviceName: result.data.deviceName,
        expiresAt: Date.now() + result.data.expiresIn * 1000,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))

      onLogin(result.data.token, cleanDeviceId, result.data.deviceName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setLoading(false)
    }
  }

  // Auto-submit when PIN reaches 6 digits
  const handlePinChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, PIN_LENGTH)
    setPin(digitsOnly)
  }

  // Show loading spinner while checking stored session
  if (initializing) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col safe-top safe-bottom">
      {/* Header with logo */}
      <div className="flex-shrink-0 pt-12 pb-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/20 mb-4">
          <Terminal className="w-8 h-8 text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold mb-1">CLImanger</h1>
        <p className="text-gray-400 text-sm">Connect to your desktop terminal</p>
      </div>

      {/* Login form */}
      <div className="flex-1 px-6 pb-6">
        <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-5">
          {/* Device ID input */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wide">
              Device ID
            </label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="swift-tiger-42"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
            />
          </div>

          {/* 6-digit PIN input (numeric, masked) */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wide">
              Connection PIN
            </label>
            <input
              ref={pinInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              placeholder="000000"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-center text-2xl font-mono tracking-[0.3em] placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              maxLength={PIN_LENGTH}
              disabled={loading}
              autoComplete="one-time-code"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Connect button */}
          <button
            type="submit"
            disabled={loading || !deviceId.trim() || pin.length !== PIN_LENGTH}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-600/40 disabled:cursor-not-allowed rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Smartphone className="w-5 h-5" />
                Connect
              </>
            )}
          </button>
        </form>

        {/* Connection instructions */}
        <div className="mt-8 p-4 glass-panel rounded-xl max-w-sm mx-auto">
          <p className="text-xs text-gray-400 leading-relaxed">
            <strong className="text-gray-300">How to connect:</strong>
            <br />
            1. Open CLImanger on your desktop
            <br />
            2. Go to Settings and enable Mobile Connection
            <br />
            3. Enter the Device ID and PIN shown on screen
          </p>
        </div>
      </div>
    </div>
  )
}
