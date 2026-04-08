/**
 * Adapted from VS Code's TerminalResizeDebouncer.
 * Keeps resize work cheap while the terminal is hidden and reduces horizontal reflow churn.
 */
export class TerminalResizeManager {
    private latestCols = 0
    private latestRows = 0
    private resizeXTimer: NodeJS.Timeout | null = null
    private resizeYTimer: NodeJS.Timeout | null = null
    private idleCallbackId: number | null = null

    constructor(
        private readonly isVisible: () => boolean,
        private readonly getBufferLength: () => number,
        private readonly resizeBoth: (cols: number, rows: number) => void,
        private readonly resizeX: (cols: number) => void,
        private readonly resizeY: (rows: number) => void
    ) { }

    resize(cols: number, rows: number, immediate: boolean): void {
        this.latestCols = cols
        this.latestRows = rows

        if (immediate || this.getBufferLength() < 200) {
            this.clearTimers()
            this.resizeBoth(cols, rows)
            return
        }

        if (!this.isVisible()) {
            this.scheduleIdleResize()
            return
        }

        // Vertical resize is cheap. Horizontal resize triggers more reflow in xterm.
        this.resizeY(rows)
        if (this.resizeXTimer) {
            clearTimeout(this.resizeXTimer)
        }
        this.resizeXTimer = setTimeout(() => {
            this.resizeXTimer = null
            this.resizeX(this.latestCols)
        }, 100)
    }

    flush(): void {
        this.cancelIdleResize()

        if (this.resizeXTimer || this.resizeYTimer) {
            this.clearTimers()
            this.resizeBoth(this.latestCols, this.latestRows)
        }
    }

    dispose(): void {
        this.clearTimers()
        this.cancelIdleResize()
    }

    private scheduleIdleResize(): void {
        if (this.idleCallbackId !== null) {
            return
        }

        const callback = () => {
            this.idleCallbackId = null
            this.resizeX(this.latestCols)
            this.resizeY(this.latestRows)
        }

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            this.idleCallbackId = window.requestIdleCallback(callback)
            return
        }

        this.resizeYTimer = setTimeout(() => {
            this.resizeYTimer = null
            callback()
        }, 100)
    }

    private clearTimers(): void {
        if (this.resizeXTimer) {
            clearTimeout(this.resizeXTimer)
            this.resizeXTimer = null
        }
        if (this.resizeYTimer) {
            clearTimeout(this.resizeYTimer)
            this.resizeYTimer = null
        }
    }

    private cancelIdleResize(): void {
        if (typeof window !== 'undefined' && 'cancelIdleCallback' in window && this.idleCallbackId !== null) {
            window.cancelIdleCallback(this.idleCallbackId)
        }
        this.idleCallbackId = null
    }
}
