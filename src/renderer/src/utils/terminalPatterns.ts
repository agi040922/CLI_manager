/**
 * Terminal Pattern Matcher for Claude Code, Codex, Gemini
 *
 * Inspired by claude-squad's status detection:
 * - Running: Screen content changed (output is being generated)
 * - Ready: Screen content stopped changing (waiting for user input)
 * - hasPrompt: Contains prompt string like "No, and tell Claude what to do differently"
 *
 * claude-squad 방식:
 * 1. CapturePaneContent()로 화면 내용 캡처
 * 2. SHA256 해시로 이전 출력과 비교
 * 3. 변경됨 = Running, 변경 없음 = Ready
 */

import { SessionStatus } from '../../../shared/types'

export type ToolType = 'cc' | 'codex' | 'gemini' | 'generic'

export type NotificationType = 'info' | 'error' | 'success' | 'warning'

export interface NotificationResult {
    type: NotificationType
    message: string
    tool: ToolType
    eventType?: ClaudeEventType
}

// Extended result including session status (inspired by claude-squad)
export interface StatusResult {
    notification: NotificationResult | null
    sessionStatus: SessionStatus
    isClaudeCode: boolean
    hasPrompt: boolean  // claude-squad와 동일: 프롬프트 문자열 포함 여부
}

// Claude Code JSON 이벤트 타입
export type ClaudeEventType =
    | 'permission_request'
    | 'user_input_request'
    | 'error'
    | 'context_exceeded'
    | 'mcp_waiting'
    | 'rate_limit'

// Claude Code JSON 이벤트 인터페이스
interface ClaudePermissionEvent {
    event: 'permission_request'
    tool: string
    command?: string
    requires_approval: boolean
}

interface ClaudeUserInputEvent {
    event: 'user_input_request'
    question: string
}

type ClaudeEvent = ClaudePermissionEvent | ClaudeUserInputEvent

interface ToolConfig {
    name: ToolType
    startPatterns: RegExp[]
    endPatterns: RegExp[]
}

// 도구 시작/종료 감지 패턴
export const TOOLS: Record<ToolType, ToolConfig> = {
    cc: {
        name: 'cc',
        startPatterns: [
            /Claude Code v\d+/i,
            /Welcome to Claude Code/i,
            /^claude\s*$/m,  // claude 명령어 추가
            /^cc\s*$/m
        ],
        endPatterns: [
            /Bye!/i,
            /^>\s*exit\s*$/m
        ]
    },
    codex: {
        name: 'codex',
        startPatterns: [
            /^codex\s*$/m,
            /OpenAI Codex/i
        ],
        endPatterns: [
            /Goodbye/i
        ]
    },
    gemini: {
        name: 'gemini',
        startPatterns: [
            /^gemini\s/m,
            /Welcome to Gemini/i
        ],
        endPatterns: []
    },
    generic: {
        name: 'generic',
        startPatterns: [],
        endPatterns: []
    }
}

// 알림 메시지 템플릿
const NOTIFICATION_MESSAGES = {
    permission_request: (tool: string, command?: string) =>
        `🔐 권한 승인 필요: ${tool}${command ? ` - ${command.slice(0, 50)}` : ''}`,
    user_input_request: (question: string) =>
        `❓ 입력 대기 중: ${question.slice(0, 60)}${question.length > 60 ? '...' : ''}`,
    error: (message: string) => `❌ 오류: ${message.slice(0, 80)}`,
    context_exceeded: () => '⚠️ 컨텍스트 초과 - 재시작을 고려해주세요',
    mcp_waiting: (url: string) => `⏳ MCP 서버 연결 대기 중: ${url}`,
    rate_limit: () => '⏱️ Rate limit 초과 - 잠시 후 다시 시도해주세요',
}

// Claude Code prompt patterns (from claude-squad)
// claude-squad: hasPrompt = strings.Contains(content, "No, and tell Claude what to do differently")
const CC_PROMPT_PATTERNS = [
    /No, and tell Claude what to do differently/,
]

// Claude Code session end patterns
const CC_END_PATTERNS = [
    /Bye!/,
    /Session ended/i,
    /Goodbye!/i,
]

export class TerminalPatternMatcher {
    private currentTool: ToolType = 'generic'
    private buffer: string = ''
    private lastNotificationTime: number = 0
    private lastNotificationSignature: string = ''
    private lastToolActivity: number = Date.now()

    // claude-squad 방식: 화면 변경 감지
    // - 출력이 들어오면 Running (화면이 변경됨)
    // - 일정 시간 출력이 없으면 Ready (화면이 멈춤)
    private lastOutputTime: number = 0
    private readyTimeoutMs: number = 500  // claude-squad의 tick 간격과 동일

    // MCP 서버 대기 추적
    private mcpWaitStartTime: number | null = null
    private mcpWaitUrl: string | null = null
    private mcpNotified: boolean = false

    // 디버그 모드
    private debug = false

    /**
     * claude-squad 방식의 상태 감지
     *
     * claude-squad 로직:
     * updated, prompt := instance.HasUpdated()
     * if updated {
     *     instance.SetStatus(Running)   // 화면이 바뀌면 = Running
     * } else {
     *     instance.SetStatus(Ready)     // 변경 없으면 = Ready
     * }
     *
     * CLImanger에서는 이벤트 기반이므로:
     * - 출력이 들어오면 → Running
     * - 일정 시간 출력이 없으면 → Ready
     */
    processWithStatus(data: string): StatusResult {
        const cleanChunk = this.stripAnsi(data)
        const notification = this.process(data)
        const now = Date.now()

        // 도구 감지
        this.detectTool(cleanChunk)

        // Claude Code가 아니면 idle
        if (this.currentTool !== 'cc') {
            return {
                notification,
                sessionStatus: 'idle',
                isClaudeCode: false,
                hasPrompt: false
            }
        }

        // claude-squad 방식: hasPrompt 체크
        // hasPrompt = strings.Contains(content, "No, and tell Claude what to do differently")
        let hasPrompt = false
        for (const pattern of CC_PROMPT_PATTERNS) {
            if (pattern.test(this.buffer)) {
                hasPrompt = true
                break
            }
        }

        // 세션 종료 체크
        for (const pattern of CC_END_PATTERNS) {
            if (pattern.test(cleanChunk)) {
                return {
                    notification,
                    sessionStatus: 'idle',
                    isClaudeCode: false,
                    hasPrompt: false
                }
            }
        }

        // claude-squad 방식: 출력이 들어왔으므로 Running
        // (화면이 변경됨 = updated = true)
        this.lastOutputTime = now

        return {
            notification,
            sessionStatus: 'running',  // 출력이 들어왔으므로 Running
            isClaudeCode: true,
            hasPrompt
        }
    }

    /**
     * Ready 상태 체크 (출력이 멈췄는지)
     * TerminalView에서 주기적으로 호출하여 Ready 상태 전환 확인
     */
    checkReadyStatus(): { isReady: boolean, hasPrompt: boolean } {
        if (this.currentTool !== 'cc') {
            return { isReady: false, hasPrompt: false }
        }

        const now = Date.now()
        const timeSinceLastOutput = now - this.lastOutputTime

        // 일정 시간 출력이 없으면 Ready
        const isReady = this.lastOutputTime > 0 && timeSinceLastOutput > this.readyTimeoutMs

        // hasPrompt 체크
        let hasPrompt = false
        for (const pattern of CC_PROMPT_PATTERNS) {
            if (pattern.test(this.buffer)) {
                hasPrompt = true
                break
            }
        }

        return { isReady, hasPrompt }
    }

    // JSON 이벤트를 우선 파싱하고, 없으면 텍스트 패턴 매칭
    process(data: string): NotificationResult | null {
        // ANSI 이스케이프 시퀀스 완전 제거 (24-bit 색상 포함)
        const cleanChunk = this.stripAnsi(data)
        if (!cleanChunk.trim()) return null

        // 디버그: 실제 들어오는 데이터 확인
        if (this.debug) {
            const preview = cleanChunk.slice(0, 150).replace(/\n/g, '\\n')
            console.log(`[PatternMatcher] tool=${this.currentTool} | "${preview}"`)
        }

        // 버퍼 관리 (최근 4000자 유지)
        this.buffer = (this.buffer + cleanChunk).slice(-4000)

        // 도구 감지
        this.detectTool(cleanChunk)

        // 텍스트 패턴 매칭
        const result = this.matchTextPatterns(cleanChunk)
        if (this.debug && result) {
            console.log('[PatternMatcher] MATCHED:', result)
        }
        return result
    }

    /**
     * ANSI 이스케이프 시퀀스 완전 제거
     * - 기본 색상: \x1b[31m
     * - 24-bit 색상: \x1b[38;2;255;107;128m
     * - 커서 이동, 화면 지우기 등 모든 제어 시퀀스
     */
    private stripAnsi(text: string): string {
        return text
            // 모든 ANSI 이스케이프 시퀀스 제거
            .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
            // OSC 시퀀스 제거 (타이틀 설정 등)
            .replace(/\x1b\][^\x07]*\x07/g, '')
            // 기타 이스케이프 제거
            .replace(/\x1b[^[]/g, '')
    }

    /**
     * JSON 이벤트 파싱
     * Claude Code는 특정 상황에서 JSON 형태로 이벤트를 출력함
     */
    private parseJsonEvent(chunk: string): NotificationResult | null {
        // JSON 객체 패턴 찾기
        const jsonMatches = chunk.match(/\{[^{}]*"event"[^{}]*\}/g)
        if (!jsonMatches) return null

        for (const jsonStr of jsonMatches) {
            try {
                const event = JSON.parse(jsonStr) as ClaudeEvent

                if (event.event === 'permission_request') {
                    const permEvent = event as ClaudePermissionEvent
                    return this.createNotification(
                        'info',
                        NOTIFICATION_MESSAGES.permission_request(permEvent.tool, permEvent.command),
                        'cc',
                        'permission_request'
                    )
                }

                if (event.event === 'user_input_request') {
                    const inputEvent = event as ClaudeUserInputEvent
                    return this.createNotification(
                        'info',
                        NOTIFICATION_MESSAGES.user_input_request(inputEvent.question),
                        'cc',
                        'user_input_request'
                    )
                }
            } catch {
                // JSON 파싱 실패 - 계속 진행
            }
        }

        return null
    }

    /**
     * 텍스트 패턴 매칭
     * Claude Code의 실제 출력 패턴 기반
     */
    private matchTextPatterns(chunk: string): NotificationResult | null {
        const recentLines = this.getRecentLines()
        const tool = this.currentTool

        // === Claude Code 전용 패턴 ===
        if (tool === 'cc') {
            // 1. 선택 입력 대기 (AskUserQuestion 등)
            // "Enter to select · Tab/Arrow keys to navigate"
            if (/Enter to select.*Tab\/Arrow keys/i.test(chunk)) {
                return this.createNotification(
                    'info',
                    '🔔 선택 입력 대기 중 (Enter로 선택)',
                    'cc',
                    'user_input_request'
                )
            }

            // 2. Y/n 형태의 확인 요청
            for (const line of recentLines) {
                // "? Allow ..." 또는 "(Y/n)" 패턴
                if (/\?\s*\(Y\/n\)/i.test(line) || /\?\s*\[Y\/n\]/i.test(line)) {
                    const cleanLine = line.replace(/[^\w\s가-힣?]/g, '').trim()
                    return this.createNotification(
                        'info',
                        `🔐 확인 필요: ${cleanLine.slice(0, 50)}`,
                        'cc',
                        'permission_request'
                    )
                }
            }

            // 2. 컨텍스트 초과 감지
            if (/Context window exceeded/i.test(chunk) || /compacting context/i.test(chunk)) {
                return this.createNotification(
                    'warning',
                    NOTIFICATION_MESSAGES.context_exceeded(),
                    'cc',
                    'context_exceeded'
                )
            }

            // 3. MCP 서버 대기 감지
            const mcpMatch = chunk.match(/Waiting for MCP server at (ws:\/\/[^\s]+)/i)
            if (mcpMatch) {
                const url = mcpMatch[1]
                if (!this.mcpWaitStartTime || this.mcpWaitUrl !== url) {
                    // 새로운 MCP 대기 시작
                    this.mcpWaitStartTime = Date.now()
                    this.mcpWaitUrl = url
                    this.mcpNotified = false
                }

                // 10초 이상 대기 시 알림
                if (!this.mcpNotified && Date.now() - this.mcpWaitStartTime > 10000) {
                    this.mcpNotified = true
                    return this.createNotification(
                        'warning',
                        NOTIFICATION_MESSAGES.mcp_waiting(url),
                        'cc',
                        'mcp_waiting'
                    )
                }
            } else {
                // MCP 대기 상태 리셋
                this.mcpWaitStartTime = null
                this.mcpWaitUrl = null
                this.mcpNotified = false
            }

            // 4. Rate limit 초과
            if (/Rate limit exceeded/i.test(chunk)) {
                return this.createNotification(
                    'error',
                    NOTIFICATION_MESSAGES.rate_limit(),
                    'cc',
                    'rate_limit'
                )
            }
        }

        // === 공통 패턴 ===

        // 에러 감지
        const errorPatterns = [
            { pattern: /^Error:/i, extract: true },
            { pattern: /Command failed/i, extract: true },
            { pattern: /Permission denied/i, extract: false },
            { pattern: /fatal:/i, extract: true },
            { pattern: /npm ERR!/i, extract: true },
            { pattern: /Failed to/i, extract: true }
        ]
        for (const line of recentLines) {
            for (const { pattern, extract } of errorPatterns) {
                if (pattern.test(line)) {
                    const message = extract ? line.trim() : '권한이 거부되었습니다'
                    return this.createNotification(
                        'error',
                        NOTIFICATION_MESSAGES.error(message),
                        tool,
                        'error'
                    )
                }
            }
        }

        // === 기타 도구 전용 패턴 ===
        if (tool === 'codex') {
            // Codex 전용 패턴
            if (/\[y\/n\]/i.test(chunk) || /\(y\/n\)/i.test(chunk)) {
                return this.createNotification(
                    'info',
                    '🔐 Codex 입력 대기 중',
                    'codex',
                    'user_input_request'
                )
            }
        }

        if (tool === 'gemini') {
            // Gemini 전용 패턴
            if (/GoogleGenerativeAIError/i.test(chunk)) {
                return this.createNotification(
                    'error',
                    '❌ Gemini API 오류',
                    'gemini',
                    'error'
                )
            }
        }

        return null
    }

    /**
     * 현재 활성 도구 감지
     * Claude Code는 TUI 기반이라 셸 프롬프트로 종료 판단하면 안 됨
     */
    private detectTool(chunk: string): void {
        const now = Date.now()

        // Claude Code 활성 상태 패턴 (이게 보이면 아직 cc 실행 중)
        const ccActivePatterns = [
            /Thinking…/,
            /Kneading…/,
            /Percolating…/,
            /Discombobulating…/,
            /Spelunking…/,
            /Churning…/,
            /Sussing…/,
            /bypass permissions/,
            /Enter to select/,
            /Tab\/Arrow keys/,
            /esc to interrupt/,
            /ctrl\+o to show thinking/,
            /Claude Code v\d+/,
        ]

        // Claude Code 활성 상태면 cc 유지
        if (this.currentTool === 'cc') {
            const stillActive = ccActivePatterns.some(p => p.test(chunk))
            if (stillActive) {
                this.lastToolActivity = now
                return
            }
        }

        // 도구 시작 패턴 확인
        for (const tool of ['cc', 'codex', 'gemini'] as ToolType[]) {
            for (const pattern of TOOLS[tool].startPatterns) {
                if (pattern.test(chunk)) {
                    this.currentTool = tool
                    this.lastToolActivity = now
                    return
                }
            }
        }

        // 도구 종료 감지 - Claude Code는 명시적 종료만
        if (this.currentTool !== 'generic') {
            const config = TOOLS[this.currentTool]
            const seenEndPattern = config.endPatterns.some(p => p.test(chunk))

            // 명시적 종료 패턴 또는 10분 비활동 시에만 종료
            if (seenEndPattern || now - this.lastToolActivity > 10 * 60 * 1000) {
                this.currentTool = 'generic'
                this.lastToolActivity = now
            }
        }
    }

    /**
     * 최근 줄 가져오기
     */
    private getRecentLines(): string[] {
        return this.buffer.split(/\r?\n/).slice(-10)
    }

    /**
     * 알림 생성 (강화된 중복 방지)
     */
    private createNotification(
        type: NotificationType,
        message: string,
        tool: ToolType,
        eventType?: ClaudeEventType
    ): NotificationResult | null {
        const now = Date.now()

        // 이벤트 타입별 쿨다운 시간 (ms)
        const cooldowns: Record<string, number> = {
            'permission_request': 10000,  // 권한 요청: 10초
            'user_input_request': 10000,  // 입력 대기: 10초
            'error': 3000,                // 에러: 3초
            'context_exceeded': 30000,    // 컨텍스트 초과: 30초
            'mcp_waiting': 30000,         // MCP 대기: 30초
            'rate_limit': 60000,          // Rate limit: 60초
            'default': 5000               // 기본: 5초
        }

        const cooldown = cooldowns[eventType || 'default'] || cooldowns.default

        // 중복 알림 방지: 같은 이벤트 타입은 쿨다운 시간 내 무시
        const signature = `${tool}:${eventType || type}`
        if (signature === this.lastNotificationSignature && now - this.lastNotificationTime < cooldown) {
            return null
        }

        this.lastNotificationSignature = signature
        this.lastNotificationTime = now
        this.lastToolActivity = now

        return { type, message, tool, eventType }
    }

    /**
     * 현재 도구 상태 가져오기 (디버깅용)
     */
    getCurrentTool(): ToolType {
        return this.currentTool
    }

    /**
     * 상태 리셋
     */
    reset(): void {
        this.currentTool = 'generic'
        this.buffer = ''
        this.lastNotificationTime = 0
        this.lastNotificationSignature = ''
        this.lastToolActivity = Date.now()
        this.lastOutputTime = 0
        this.mcpWaitStartTime = null
        this.mcpWaitUrl = null
        this.mcpNotified = false
    }

    /**
     * Check if Claude Code is currently active
     */
    isClaudeCodeActive(): boolean {
        return this.currentTool === 'cc'
    }
}
