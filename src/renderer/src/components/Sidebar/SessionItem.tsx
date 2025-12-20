import React from 'react'
import { Terminal, Trash2, GripVertical } from 'lucide-react'
import clsx from 'clsx'
import { Reorder, useDragControls } from 'framer-motion'
import { TerminalSession, NotificationStatus, Workspace, SessionStatus } from '../../../../shared/types'
import { NOTIFICATION_COLORS } from '../../constants/styles'

// Session status colors (claude-squad 방식)
const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
    idle: 'bg-gray-500',
    running: 'bg-blue-500 animate-pulse',
    ready: 'bg-amber-500',
    error: 'bg-red-500'
}

const SESSION_STATUS_TITLES: Record<SessionStatus, string> = {
    idle: 'Idle',
    running: 'Running (output being generated)',
    ready: 'Ready (waiting for input)',
    error: 'Error occurred'
}

interface SessionItemProps {
    session: TerminalSession
    workspace: Workspace
    isActive: boolean
    notificationStatus?: NotificationStatus
    sessionStatus?: SessionStatus
    isClaudeCodeSession?: boolean
    showStatusInSidebar?: boolean
    fontSize?: number  // Sidebar font size
    onSelect: (workspace: Workspace, session: TerminalSession) => void
    onRemove: (workspaceId: string, sessionId: string) => void
    onRename: (workspaceId: string, sessionId: string, newName: string) => void
    isRenaming?: boolean
    onContextMenu: (e: React.MouseEvent, workspaceId: string, sessionId: string) => void
    onRenameCancel: () => void
}

/**
 * 터미널 세션 항목 컴포넌트
 * 세션 선택, 알림 표시, 삭제 기능 제공
 * 드래그 앤 드롭으로 같은 워크스페이스 내에서 순서 변경 가능
 */
export function SessionItem({
    session,
    workspace,
    isActive,
    notificationStatus,
    sessionStatus,
    isClaudeCodeSession,
    showStatusInSidebar = true,
    fontSize = 14,
    onSelect,
    onRemove,
    onRename,
    isRenaming,
    onContextMenu,
    onRenameCancel
}: SessionItemProps) {
    const [tempName, setTempName] = React.useState(session.name)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const dragControls = useDragControls()

    React.useEffect(() => {
        if (isRenaming && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isRenaming])

    const handleRenameSubmit = () => {
        if (tempName.trim() && tempName !== session.name) {
            onRename(workspace.id, session.id, tempName.trim())
        } else {
            setTempName(session.name)
            onRenameCancel()
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRenameSubmit()
        } else if (e.key === 'Escape') {
            setTempName(session.name)
            onRenameCancel()
        }
    }

    const getNotificationBadge = () => {
        if (!notificationStatus || notificationStatus === 'none') return null

        return (
            <div
                className={`w-2 h-2 rounded-full ${NOTIFICATION_COLORS[notificationStatus]} animate-pulse shrink-0`}
            />
        )
    }

    // Session status indicator for Claude Code sessions
    const getSessionStatusBadge = () => {
        // Don't show for active session (user is already looking at it)
        if (isActive) return null
        // Only show if enabled and it's a Claude Code session
        if (!showStatusInSidebar || !isClaudeCodeSession || !sessionStatus) return null
        // Don't show idle status to reduce visual noise
        if (sessionStatus === 'idle') return null

        return (
            <div
                className={`w-2 h-2 rounded-full ${SESSION_STATUS_COLORS[sessionStatus]} shrink-0`}
                title={SESSION_STATUS_TITLES[sessionStatus]}
            />
        )
    }

    return (
        <Reorder.Item
            value={session}
            dragListener={false}
            dragControls={dragControls}
            transition={{ layout: { duration: 0 } }}
            className={clsx(
                "flex items-center gap-1 py-1 px-1.5 rounded transition-colors text-sm group",
                isActive
                    ? "bg-blue-500/20 text-blue-200"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-300"
            )}
            onContextMenu={(e) => onContextMenu(e, workspace.id, session.id)}
            whileDrag={{
                scale: 1.02,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                // Note: backgroundColor 제거 - 드래그 종료 후에도 색상이 유지되는 버그 방지
            }}
        >
            {/* 드래그 핸들 */}
            <div
                onPointerDown={(e) => dragControls.start(e)}
                className="cursor-grab active:cursor-grabbing p-0.5 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity shrink-0"
                title="Drag to reorder"
            >
                <GripVertical size={12} className="text-gray-500" />
            </div>

            <div
                onClick={() => !isRenaming && onSelect(workspace, session)}
                className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
            >
                <Terminal size={14} className="shrink-0" />
                {isRenaming ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-black/50 border border-blue-500/50 rounded px-1 py-0.5 text-xs text-white focus:outline-none min-w-0"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="truncate flex-1" style={{ fontSize: `${fontSize}px` }}>{session.name}</span>
                )}
                {getSessionStatusBadge()}
                {getNotificationBadge()}
            </div>
            {!isRenaming && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove(workspace.id, session.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all shrink-0"
                    title="Delete session"
                >
                    <Trash2 size={12} className="text-gray-500 hover:text-red-400" />
                </button>
            )}
        </Reorder.Item>
    )
}
