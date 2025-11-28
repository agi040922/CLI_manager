import React from 'react'
import { Terminal, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { TerminalSession, NotificationStatus, Workspace } from '../../../../shared/types'
import { NOTIFICATION_COLORS } from '../../constants/styles'

interface SessionItemProps {
    session: TerminalSession
    workspace: Workspace
    isActive: boolean
    notificationStatus?: NotificationStatus
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
 */
export function SessionItem({
    session,
    workspace,
    isActive,
    notificationStatus,
    onSelect,
    onRemove,
    onRename,
    isRenaming,
    onContextMenu,
    onRenameCancel
}: SessionItemProps) {
    const [tempName, setTempName] = React.useState(session.name)
    const inputRef = React.useRef<HTMLInputElement>(null)

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

    return (
        <div
            className={clsx(
                "flex items-center gap-2 p-2 rounded transition-colors text-sm group",
                isActive
                    ? "bg-blue-500/20 text-blue-200"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-300"
            )}
            onContextMenu={(e) => onContextMenu(e, workspace.id, session.id)}
        >
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
                    <span className="truncate flex-1">{session.name}</span>
                )}
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
        </div>
    )
}
