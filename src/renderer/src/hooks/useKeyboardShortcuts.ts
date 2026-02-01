import { useEffect, useCallback } from 'react'
import {
    Workspace,
    TerminalSession,
    UserSettings,
    SplitTerminalLayout,
    KeyBinding,
    KeyboardShortcutMap,
    ShortcutAction,
    DEFAULT_SHORTCUTS,
} from '../../../shared/types'

interface UseKeyboardShortcutsConfig {
    settings: UserSettings
    activeWorkspace: Workspace | null
    activeSession: TerminalSession | null
    sortedWorkspaces: Workspace[]
    splitLayout: SplitTerminalLayout | null
    activeSplitIndex: number
    settingsOpen: boolean
    fileSearchOpen: boolean
    onSelectSession: (workspace: Workspace, session: TerminalSession) => void
    onSetActiveSplitIndex: (index: number) => void
    onSetFileSearchOpen: (open: boolean) => void
    onSetFileSearchMode: (mode: 'files' | 'content') => void
    onToggleSidebar: () => void
    onToggleSettings: () => void
    onAddSession: (workspaceId: string) => void
}

function getShortcuts(settings: UserSettings): KeyboardShortcutMap {
    return { ...DEFAULT_SHORTCUTS, ...settings.keyboard?.shortcuts }
}

function matchShortcut(e: KeyboardEvent, binding: KeyBinding): boolean {
    if (e.key.toLowerCase() !== binding.code.toLowerCase()) return false

    const needsMod = binding.modifiers.includes('mod')
    const needsShift = binding.modifiers.includes('shift')
    const needsAlt = binding.modifiers.includes('alt')

    const hasMod = e.metaKey || e.ctrlKey
    const hasShift = e.shiftKey
    const hasAlt = e.altKey

    if (needsMod !== hasMod) return false
    if (needsShift !== hasShift) return false
    if (needsAlt !== hasAlt) return false

    return true
}

/**
 * Centralized keyboard shortcut handler for the application.
 * Uses capture phase to intercept events before xterm.js consumes them.
 */
export function useKeyboardShortcuts(config: UseKeyboardShortcutsConfig): void {
    const {
        settings,
        activeWorkspace,
        activeSession,
        sortedWorkspaces,
        splitLayout,
        activeSplitIndex,
        settingsOpen,
        fileSearchOpen,
        onSelectSession,
        onSetActiveSplitIndex,
        onSetFileSearchOpen,
        onSetFileSearchMode,
        onToggleSidebar,
        onToggleSettings,
        onAddSession,
    } = config

    const navigateSplitPane = useCallback((direction: 1 | -1) => {
        if (!splitLayout || splitLayout.sessionIds.length === 0) return
        const count = splitLayout.sessionIds.length
        const nextIndex = (activeSplitIndex + direction + count) % count
        console.log(`[Shortcuts] navigateSplitPane: ${activeSplitIndex} → ${nextIndex}`)
        onSetActiveSplitIndex(nextIndex)
    }, [splitLayout, activeSplitIndex, onSetActiveSplitIndex])

    const navigateSession = useCallback((direction: 1 | -1) => {
        if (!activeWorkspace || activeWorkspace.sessions.length === 0) {
            console.log('[Shortcuts] navigateTab: no active workspace or no sessions')
            return
        }

        // In split view, delegate to split pane navigation
        if (splitLayout && splitLayout.sessionIds.length > 0) {
            navigateSplitPane(direction)
            return
        }

        const sessions = activeWorkspace.sessions
        const currentIndex = activeSession
            ? sessions.findIndex(s => s.id === activeSession.id)
            : -1
        const nextIndex = currentIndex < 0
            ? 0
            : (currentIndex + direction + sessions.length) % sessions.length
        console.log(`[Shortcuts] navigateTab: ${currentIndex} → ${nextIndex} (${sessions[nextIndex]?.name})`)
        onSelectSession(activeWorkspace, sessions[nextIndex])
    }, [activeWorkspace, activeSession, splitLayout, onSelectSession, navigateSplitPane])

    const navigateWorkspace = useCallback((direction: 1 | -1) => {
        const workspacesWithSessions = sortedWorkspaces.filter(w => w.sessions.length > 0)
        if (workspacesWithSessions.length === 0) {
            console.log('[Shortcuts] navigateWorkspace: no workspaces with sessions')
            return
        }

        const currentIndex = activeWorkspace
            ? workspacesWithSessions.findIndex(w => w.id === activeWorkspace.id)
            : -1
        const nextIndex = currentIndex < 0
            ? 0
            : (currentIndex + direction + workspacesWithSessions.length) % workspacesWithSessions.length
        const targetWorkspace = workspacesWithSessions[nextIndex]
        console.log(`[Shortcuts] navigateWorkspace: ${currentIndex} → ${nextIndex} (${targetWorkspace.name})`)
        onSelectSession(targetWorkspace, targetWorkspace.sessions[0])
    }, [sortedWorkspaces, activeWorkspace, onSelectSession])

    useEffect(() => {
        const shortcuts = getShortcuts(settings)
        console.log('[Shortcuts] Effect mounted, registering capture listener')

        const handleKeyDown = (e: KeyboardEvent) => {
            // Only process events with at least one modifier
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) return
            // Allow toggleSettings even when modals are open
            if (matchShortcut(e, shortcuts.toggleSettings)) {
                console.log('[Shortcuts] matched: toggleSettings')
                e.preventDefault()
                e.stopPropagation()
                onToggleSettings()
                return
            }

            // Skip when typing in real input fields, but NOT xterm's hidden textarea
            const el = document.activeElement as HTMLElement | null
            if (el) {
                const tag = el.tagName.toLowerCase()
                if (tag === 'input') return
                if (tag === 'textarea' && !el.closest('.xterm')) return
            }

            // Skip when modals are open (except toggleSettings handled above)
            if (settingsOpen || fileSearchOpen) return

            const actionHandlers: Partial<Record<ShortcutAction, () => void>> = {
                nextSession: () => navigateSession(1),
                prevSession: () => navigateSession(-1),
                nextWorkspace: () => navigateWorkspace(1),
                prevWorkspace: () => navigateWorkspace(-1),
                nextSplitPane: () => navigateSplitPane(1),
                prevSplitPane: () => navigateSplitPane(-1),
                toggleSidebar: () => onToggleSidebar(),
                fileSearch: () => {
                    if (activeWorkspace) {
                        onSetFileSearchMode('files')
                        onSetFileSearchOpen(true)
                    }
                },
                contentSearch: () => {
                    if (activeWorkspace) {
                        onSetFileSearchMode('content')
                        onSetFileSearchOpen(true)
                    }
                },
                newSession: () => {
                    if (activeWorkspace) {
                        onAddSession(activeWorkspace.id)
                    }
                },
            }

            for (const [action, handler] of Object.entries(actionHandlers)) {
                const binding = shortcuts[action as ShortcutAction]
                if (binding && matchShortcut(e, binding)) {
                    console.log(`[Shortcuts] matched: ${action} (key=${e.key}, meta=${e.metaKey}, ctrl=${e.ctrlKey}, shift=${e.shiftKey})`)
                    e.preventDefault()
                    e.stopPropagation()
                    handler()
                    return
                }
            }
        }

        // Use capture phase so we intercept before xterm.js handles the event
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [
        settings,
        settingsOpen,
        fileSearchOpen,
        activeWorkspace,
        navigateSession,
        navigateWorkspace,
        navigateSplitPane,
        onToggleSidebar,
        onToggleSettings,
        onSetFileSearchOpen,
        onSetFileSearchMode,
        onAddSession,
    ])
}
