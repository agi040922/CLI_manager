
export type ToolType = 'cc' | 'codex' | 'gemini' | 'generic';

export interface NotificationResult {
    type: 'info' | 'error' | 'success';
    message: string;
    tool: ToolType;
}

interface ToolConfig {
    name: ToolType;
    startPatterns: RegExp[];
    endPatterns: RegExp[];
    inputPatterns: RegExp[];
    errorPatterns: RegExp[];
    successPatterns: RegExp[];
}

export const TOOLS: Record<ToolType, ToolConfig> = {
    cc: {
        name: 'cc',
        startPatterns: [
            /Claude Code v\d+/i,
            /Welcome to Claude Code/i,
            // ⏺ 이모지 패턴 제거 - 중복 알림 원인
            /^cc\s*$/m
        ],
        endPatterns: [
            /Bye!/i,
            /^>\s*exit\s*$/m
        ],
        inputPatterns: [
            /\[Y\/n\]/i,
            /\[y\/N\]/i,
            /approve|permission|allow|grant/i,
            /press any key/i,
            /press enter/i,
            /Enter to select/i,
            /Tab\/Arrow keys to navigate/i,
            /Do you want to proceed\?/i
        ],
        errorPatterns: [
            /Error:/i,
            /Exception/i,
            /Failed to/i
        ],
        successPatterns: [
            /Task completed/i,
            /All tasks completed/i,
            /Finished applying/i
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
        ],
        inputPatterns: [
            /\[y\/n\]/i,
            /\(y\/n\)/i,
            /confirm/i,
            /Enter to/i
        ],
        errorPatterns: [
            /Error:/i,
            /Invalid/i
        ],
        successPatterns: [
            /Generated/i,
            /Applied/i,
            /Complete!/i
        ]
    },
    gemini: {
        name: 'gemini',
        startPatterns: [
            /^gemini\s/m,
            /Welcome to Gemini/i
        ],
        endPatterns: [],
        inputPatterns: [
            /\[y\/n\]/i
        ],
        errorPatterns: [
            /Error:/i,
            /GoogleGenerativeAIError/i
        ],
        successPatterns: [
            /Done/i,
            /Completed/i
        ]
    },
    generic: {
        name: 'generic',
        startPatterns: [],
        endPatterns: [],
        inputPatterns: [], // Generic input is risky, might be too noisy
        errorPatterns: [
            /fatal:/i,
            /command not found/i,
            /npm ERR!/i,
            /yarn error/i,
            /failed to compile/i
        ],
        successPatterns: [
            /Build (succeeded|success|complete|completed)/i,
            /Compiled successfully/i,
            /Tests? (passed|green)/i
        ]
    }
};

export class TerminalPatternMatcher {
    private currentTool: ToolType = 'generic';
    private buffer: string = '';
    private lastNotificationTime: number = 0;
    private lastNotificationSignature: string = '';
    private lastToolActivity: number = Date.now();

    process(data: string): NotificationResult | null {
        const cleanChunk = data.replace(/\x1b\[[0-9;]*m/g, '');
        if (!cleanChunk.trim()) return null;

        this.buffer = (this.buffer + cleanChunk).slice(-4000);
        this.detectTool(cleanChunk);

        const recentLines = this.getRecentLines();
        const config = TOOLS[this.currentTool];

        const inputLine = this.findMatchingLine(recentLines, config.inputPatterns);
        if (inputLine) {
            return this.createNotification('info', `${this.formatToolName(this.currentTool)} waiting: ${inputLine}`, this.currentTool);
        }

        const errorLine = this.findMatchingLine(recentLines, config.errorPatterns) ||
            (this.currentTool !== 'generic' ? this.findMatchingLine(recentLines, TOOLS.generic.errorPatterns) : null);
        if (errorLine) {
            return this.createNotification('error', errorLine, this.currentTool);
        }

        const successPatterns = this.currentTool === 'generic' ? TOOLS.generic.successPatterns : config.successPatterns;
        const successLine = this.findMatchingLine(recentLines, successPatterns);
        if (successLine) {
            return this.createNotification('success', `${this.formatToolName(this.currentTool)} finished: ${successLine}`, this.currentTool);
        }

        return null;
    }

    private detectTool(chunk: string) {
        const now = Date.now();

        for (const tool of ['cc', 'codex', 'gemini'] as ToolType[]) {
            for (const pattern of TOOLS[tool].startPatterns) {
                if (pattern.test(chunk)) {
                    this.currentTool = tool;
                    this.lastToolActivity = now;
                    return;
                }
            }
        }

        if (this.currentTool !== 'generic') {
            const config = TOOLS[this.currentTool];
            const shellPromptPatterns = [
                /[\n\r][\w.@~-]+[: ][\w~/.-]+[$#]\s$/,
                /[\n\r][$#]\s$/
            ];

            const seenEndPattern = config.endPatterns.some(p => p.test(chunk));
            const seenShellPrompt = shellPromptPatterns.some(p => p.test(this.buffer));

            if (seenEndPattern || seenShellPrompt || now - this.lastToolActivity > 5 * 60 * 1000) {
                this.currentTool = 'generic';
                this.lastToolActivity = now;
            }
        }
    }

    private findMatchingLine(lines: string[], patterns: RegExp[]): string | null {
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            for (const pattern of patterns) {
                if (pattern.test(trimmed)) {
                    return trimmed.length > 140 ? trimmed.slice(0, 140) + '...' : trimmed;
                }
            }
        }
        return null;
    }

    private getRecentLines(): string[] {
        return this.buffer.split(/\r?\n/).slice(-8);
    }

    private createNotification(type: 'info' | 'error' | 'success', message: string, tool: ToolType): NotificationResult | null {
        const now = Date.now();
        const signature = `${tool}:${type}:${message}`;
        if (signature === this.lastNotificationSignature && now - this.lastNotificationTime < 3000) {
            return null;
        }

        this.lastNotificationSignature = signature;
        this.lastNotificationTime = now;
        this.lastToolActivity = now;
        return { type, message, tool };
    }

    private formatToolName(tool: ToolType): string {
        switch (tool) {
            case 'cc': return 'Claude Code';
            case 'codex': return 'Codex';
            case 'gemini': return 'Gemini';
            default: return 'System';
        }
    }
}
