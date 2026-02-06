// TerminalView - xterm.js terminal with mobile-optimized controls
// Provides control bar (ESC, TAB, Ctrl+C, arrows) and quick commands

import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  ArrowLeft,
  Maximize2,
  Keyboard,
  Send,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

// --- Terminal Output Registry ---
// Instead of polluting window, use a module-level Map to write output to terminals

const terminalWriters = new Map<string, (data: string) => void>()

export function writeToTerminal(sessionId: string, data: string): void {
  const writer = terminalWriters.get(sessionId)
  if (writer) {
    writer(data)
  }
}

// --- Terminal Theme ---

const TERMINAL_THEME = {
  background: '#1a1a1a',
  foreground: '#d4d4d4',
  cursor: '#ffffff',
  cursorAccent: '#1a1a1a',
  selectionBackground: 'rgba(255, 255, 255, 0.25)',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
} as const

// --- Control Bar Buttons ---

interface ControlButton {
  label: string
  data: string
  className?: string
}

// Special key controls (always visible)
const CONTROL_KEYS: ControlButton[] = [
  { label: 'ESC', data: '\x1b' },
  { label: 'TAB', data: '\t' },
  { label: 'Ctrl+C', data: '\x03', className: 'text-red-400' },
  { label: 'Ctrl+D', data: '\x04' },
  { label: 'Ctrl+Z', data: '\x1a' },
]

// Quick commands (common shell operations)
const QUICK_COMMANDS: ControlButton[] = [
  { label: 'ls', data: 'ls\r' },
  { label: 'cd ..', data: 'cd ..\r' },
  { label: 'git status', data: 'git status\r' },
  { label: 'clear', data: 'clear\r' },
]

// --- Component ---

interface TerminalViewProps {
  sessionId: string
  workspaceName: string
  onInput: (data: string) => void
  onResize: (cols: number, rows: number) => void
  onBack: () => void
}

export function TerminalView({
  sessionId,
  workspaceName,
  onInput,
  onResize,
  onBack,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [showInput, setShowInput] = useState(true) // Default open on mobile
  const [inputText, setInputText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: TERMINAL_THEME,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 1000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)

    // Initial fit after DOM layout
    requestAnimationFrame(() => {
      fitAddon.fit()
      onResize(terminal.cols, terminal.rows)
    })

    // Forward terminal input to relay
    const inputDisposable = terminal.onData((data) => {
      onInput(data)
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Register writer for this session
    terminalWriters.set(sessionId, (data: string) => {
      terminal.write(data)
    })

    // Handle window resize and orientation change
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        onResize(terminalRef.current.cols, terminalRef.current.rows)
      }
    }

    window.addEventListener('resize', handleResize)

    // Orientation change needs a small delay for layout recalculation
    const handleOrientation = () => setTimeout(handleResize, 150)
    window.addEventListener('orientationchange', handleOrientation)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleOrientation)
      inputDisposable.dispose()
      terminalWriters.delete(sessionId)
      terminal.dispose()
    }
  }, [sessionId, onInput, onResize])

  // Re-fit terminal when input panel visibility changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fitAddonRef.current?.fit()
      if (terminalRef.current) {
        onResize(terminalRef.current.cols, terminalRef.current.rows)
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [showInput, onResize])

  // Focus the visible input field on terminal tap
  const handleTerminalTap = useCallback(() => {
    if (showInput) {
      inputRef.current?.focus()
    }
  }, [showInput])

  // Manual fit button
  const handleFit = useCallback(() => {
    fitAddonRef.current?.fit()
    if (terminalRef.current) {
      onResize(terminalRef.current.cols, terminalRef.current.rows)
    }
  }, [onResize])

  // Toggle text input panel
  const toggleInput = useCallback(() => {
    setShowInput((prev) => {
      const next = !prev
      if (next) {
        // Focus input field after panel slides in
        setTimeout(() => inputRef.current?.focus(), 100)
      }
      return next
    })
  }, [])

  // Send text from input field (Enter sends even if empty, like pressing Enter in terminal)
  const handleSendInput = useCallback(() => {
    onInput(inputText + '\r')
    setInputText('')
  }, [inputText, onInput])

  // Auto-focus input when panel is shown
  useEffect(() => {
    if (showInput) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [showInput])

  return (
    <div className="h-full flex flex-col bg-[#1a1a1a]">
      {/* Top header bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-black/40 safe-top">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="text-sm font-medium truncate mx-3 max-w-[50%]">
          {workspaceName}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleInput}
            className={`p-2 rounded-lg transition-colors ${
              showInput ? 'bg-blue-600' : 'hover:bg-white/10 active:bg-white/15'
            }`}
          >
            <Keyboard className="w-5 h-5" />
          </button>
          <button
            onClick={handleFit}
            className="p-2 hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        onClick={handleTerminalTap}
      />

      {/* Control bar: special keys + arrow keys */}
      <div className="flex-shrink-0 bg-black/50 border-t border-white/5">
        {/* Row 1: Special keys */}
        <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto">
          {CONTROL_KEYS.map((btn) => (
            <ControlBarButton
              key={btn.label}
              label={btn.label}
              className={btn.className}
              onPress={() => onInput(btn.data)}
            />
          ))}

          {/* Separator */}
          <div className="w-px h-5 bg-white/10 mx-1 flex-shrink-0" />

          {/* Arrow keys */}
          <ControlBarButton
            label={<ChevronLeft className="w-4 h-4" />}
            onPress={() => onInput('\x1b[D')}
          />
          <ControlBarButton
            label={<ChevronUp className="w-4 h-4" />}
            onPress={() => onInput('\x1b[A')}
          />
          <ControlBarButton
            label={<ChevronDown className="w-4 h-4" />}
            onPress={() => onInput('\x1b[B')}
          />
          <ControlBarButton
            label={<ChevronRight className="w-4 h-4" />}
            onPress={() => onInput('\x1b[C')}
          />
        </div>

        {/* Row 2: Quick commands */}
        <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto">
          {QUICK_COMMANDS.map((cmd) => (
            <ControlBarButton
              key={cmd.label}
              label={cmd.label}
              variant="command"
              onPress={() => onInput(cmd.data)}
            />
          ))}
        </div>
      </div>

      {/* Text input panel (toggleable) */}
      {showInput && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-black/60 border-t border-white/10 safe-bottom animate-slide-up">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSendInput()
              }
            }}
            placeholder="Type command..."
            className="flex-1 px-4 py-2.5 bg-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={handleSendInput}
            className="p-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Safe area spacer when input is not shown */}
      {!showInput && <div className="safe-bottom" />}
    </div>
  )
}

// --- Control Bar Button ---

interface ControlBarButtonProps {
  label: React.ReactNode
  onPress: () => void
  className?: string
  variant?: 'key' | 'command'
}

function ControlBarButton({
  label,
  onPress,
  className = '',
  variant = 'key',
}: ControlBarButtonProps) {
  const baseClass =
    variant === 'command'
      ? 'px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] active:bg-white/[0.18] rounded text-xs text-blue-300 font-mono'
      : 'px-2.5 py-1.5 bg-white/[0.08] hover:bg-white/[0.15] active:bg-white/[0.22] rounded text-xs font-mono'

  return (
    <button
      onClick={onPress}
      className={`${baseClass} whitespace-nowrap transition-colors flex-shrink-0 min-w-[44px] flex items-center justify-center ${className}`}
    >
      {label}
    </button>
  )
}
