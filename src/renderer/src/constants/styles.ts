/**
 * 알림 상태별 배지 색상
 */
export const NOTIFICATION_COLORS = {
    info: 'bg-amber-500',     // 🔔 Yellow: User input needed
    error: 'bg-red-500',       // ❌ Red: Error
    success: 'bg-green-500'    // ✅ Green: Success
} as const

/**
 * 메뉴 Z-index
 */
export const MENU_Z_INDEX = 9999

/**
 * 공통 transition 클래스
 */
export const TRANSITION_CLASSES = {
    default: 'transition-colors',
    opacity: 'transition-opacity',
    all: 'transition-all'
} as const
