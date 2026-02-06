// CLImanger Mobile Web Client
// Main application component managing view state (login -> workspaces -> terminal)

import { useState, useEffect, useCallback, useRef } from 'react'
import { LoginPage } from './components/LoginPage'
import { WorkspaceList } from './components/WorkspaceList'
import { TerminalView, writeToTerminal } from './components/TerminalView'
import { RelayConnection } from './api/relay'
import type { Workspace, Session, ConnectionStatus } from './types'

type AppView = 'login' | 'workspaces' | 'terminal'

const STORAGE_KEY = 'climanger_mobile_session'

function App() {
  // --- Auth state ---
  const [token, setToken] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState<string | null>(null)

  // --- Connection state ---
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const connectionRef = useRef<RelayConnection | null>(null)

  // --- Data state ---
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // --- View state ---
  const [view, setView] = useState<AppView>('login')

  // --- Auth handlers ---

  const handleLogin = useCallback(
    (newToken: string, newDeviceId: string, newDeviceName: string) => {
      setToken(newToken)
      setDeviceId(newDeviceId)
      setDeviceName(newDeviceName)
      setView('workspaces')
    },
    [],
  )

  const handleLogout = useCallback(() => {
    // Disconnect WebSocket
    if (connectionRef.current) {
      connectionRef.current.disconnect()
      connectionRef.current = null
    }

    // Reset all state
    setToken(null)
    setDeviceId(null)
    setDeviceName(null)
    setWorkspaces([])
    setSessions([])
    setActiveSessionId(null)
    setStatus('disconnected')
    setView('login')

    // Clear stored session
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  // --- WebSocket connection lifecycle ---

  useEffect(() => {
    if (!token || !deviceId) return

    const connection = new RelayConnection(token, deviceId)
    connectionRef.current = connection

    // Subscribe to relay events
    connection.on('status_change', (newStatus) => {
      setStatus(newStatus)
      if (newStatus === 'connected') {
        setLoading(false)
      }
    })

    connection.on('workspace_data', (data) => {
      setWorkspaces(data)
      setLoading(false)
    })

    connection.on('session_created', (data) => {
      const newSession: Session = {
        id: data.sessionId,
        workspaceId: '',
        workspaceName: data.name,
        createdAt: Date.now(),
      }
      setSessions((prev) => {
        // Remove any temp session and add the real one
        const filtered = prev.filter((s) => !s.id.startsWith('temp-'))
        return [...filtered, newSession]
      })
      setActiveSessionId(data.sessionId)
      setView('terminal')
    })

    connection.on('terminal_output', (data) => {
      writeToTerminal(data.sessionId, data.data)
    })

    connection.on('session_closed', (sessionId) => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      setActiveSessionId((current) => {
        if (current === sessionId) {
          // Go back to workspace list if the active session was closed
          setView('workspaces')
          return null
        }
        return current
      })
    })

    connection.on('error', (message) => {
      console.error('[App] Relay error:', message)
    })

    // Initiate connection
    setLoading(true)
    connection.connect()

    return () => {
      connection.disconnect()
    }
  }, [token, deviceId])

  // --- Session handlers ---

  const handleCreateSession = useCallback(
    (workspaceId: string, name: string) => {
      if (!connectionRef.current) return

      connectionRef.current.createSession(workspaceId, name)

      // Optimistic temp session (replaced when server confirms)
      const workspace = workspaces.find((w) => w.id === workspaceId)
      const tempSession: Session = {
        id: `temp-${Date.now()}`,
        workspaceId,
        workspaceName: workspace?.name || name,
        createdAt: Date.now(),
      }
      setSessions((prev) => [...prev, tempSession])
    },
    [workspaces],
  )

  const handleTerminalInput = useCallback(
    (data: string) => {
      if (!connectionRef.current || !activeSessionId) return
      connectionRef.current.sendTerminalInput(activeSessionId, data)
    },
    [activeSessionId],
  )

  const handleTerminalResize = useCallback(
    (cols: number, rows: number) => {
      if (!connectionRef.current || !activeSessionId) return
      connectionRef.current.sendTerminalResize(activeSessionId, cols, rows)
    },
    [activeSessionId],
  )

  const handleCloseSession = useCallback(
    (sessionId: string) => {
      if (!connectionRef.current) return
      connectionRef.current.closeSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))

      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
        setView('workspaces')
      }
    },
    [activeSessionId],
  )

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
    setView('terminal')
  }, [])

  const handleRefresh = useCallback(() => {
    if (!connectionRef.current) return
    setLoading(true)
    connectionRef.current.requestWorkspaces()
  }, [])

  // --- Render based on current view ---

  // Show login if not authenticated
  if (view === 'login' || !token) {
    return <LoginPage onLogin={handleLogin} />
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const showTerminal = view === 'terminal' && activeSession

  // Keep all views mounted, toggle visibility with CSS
  // This preserves xterm.js terminal buffer when switching views
  return (
    <>
      <div style={{ display: showTerminal ? 'none' : 'block', height: '100%' }}>
        <WorkspaceList
          deviceName={deviceName || 'Unknown'}
          status={status}
          workspaces={workspaces}
          sessions={sessions}
          onCreateSession={handleCreateSession}
          onSelectSession={handleSelectSession}
          onCloseSession={handleCloseSession}
          onRefresh={handleRefresh}
          onLogout={handleLogout}
          loading={loading || status === 'connecting'}
        />
      </div>
      {activeSession && (
        <div style={{ display: showTerminal ? 'block' : 'none', height: '100%' }}>
          <TerminalView
            sessionId={activeSession.id}
            workspaceName={activeSession.workspaceName}
            onInput={handleTerminalInput}
            onResize={handleTerminalResize}
            onBack={() => setView('workspaces')}
          />
        </div>
      )}
    </>
  )
}

export default App
