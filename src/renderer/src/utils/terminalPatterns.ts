
export type ToolType = 'cc' | 'codex' | 'gemini' | 'generic';

export interface NotificationResult {
    type: 'info' | 'error' | 'success';
    message: string;
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
            /Welcome to Claude Code/i,
            /⏺/,
            /^cc\s*$/m
        ],
        endPatterns: [
            /Bye!/i,
            /^>\s*exit\s*$/m
        ],
        inputPatterns: [
            /\[Y\/n\]/i,
            /\[y\/N\]/i,
            /\?$/m,
            /approve|permission|allow|grant/i,
            /press any key/i,
            /press enter/i,
            /Enter to select/i,
            /Tab\/Arrow keys to navigate/i,
            />\s*$/  // Claude prompt
        ],
        errorPatterns: [
            /Error:/i,
            /Exception/i,
            /Failed to/i
        ],
        successPatterns: [
            /Task completed/i,
            /Done/i
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
            /Applied/i
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
            />\s*$/m,
            /\[y\/n\]/i
        ],
        errorPatterns: [
            /Error:/i,
            /GoogleGenerativeAIError/i
        ],
        successPatterns: [
            /Done/i
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
            /✨ Done/i,
            /Build success/i,
            /Compiled successfully/i
        ]
    }
};

export class TerminalPatternMatcher {
    private currentTool: ToolType = 'generic';
    private buffer: string = '';
    private lastNotificationTime: number = 0;
    private lastNotificationMessage: string = '';

    process(data: string): NotificationResult | null {
        this.buffer += data;
        if (this.buffer.length > 2000) {
            this.buffer = this.buffer.slice(-2000);
        }

        // 1. Detect Tool Switch
        this.detectTool();

        // 2. Check for Shell Prompt (End of tool)
        // Common shell prompts: $, %, >, #
        // But tools also use >, so we need to be careful.
        // If we are in a tool, we rely on endPatterns or strong shell indicators.
        // For now, let's stick to startPatterns and explicit endPatterns.

        // 3. Detect Patterns based on current tool
        const config = TOOLS[this.currentTool];
        const cleanText = data.replace(/\x1b\[[0-9;]*m/g, ''); // Use current chunk for immediate detection + buffer context if needed

        // Check Input (High Priority)
        for (const pattern of config.inputPatterns) {
            if (pattern.test(cleanText)) {
                return this.createNotification('info', `${this.formatToolName(this.currentTool)}: Input Required`);
            }
        }

        // Check Error
        for (const pattern of config.errorPatterns) {
            if (pattern.test(cleanText)) {
                // Extract error message if possible
                const lines = cleanText.split('\n');
                const errorLine = lines.find(l => pattern.test(l))?.trim().slice(0, 50) || 'Error detected';
                return this.createNotification('error', errorLine);
            }
        }

        // Check Success
        for (const pattern of config.successPatterns) {
            if (pattern.test(cleanText)) {
                return this.createNotification('success', `${this.formatToolName(this.currentTool)}: Task Completed`);
            }
        }

        // Fallback to generic error detection if in a tool but something looks really bad
        if (this.currentTool !== 'generic') {
            for (const pattern of TOOLS.generic.errorPatterns) {
                if (pattern.test(cleanText)) {
                    return this.createNotification('error', 'Error detected');
                }
            }
        }

        return null;
    }

    private detectTool() {
        // Check buffer for start patterns
        for (const tool of ['cc', 'codex', 'gemini'] as ToolType[]) {
            for (const pattern of TOOLS[tool].startPatterns) {
                if (pattern.test(this.buffer)) {
                    if (this.currentTool !== tool) {
                        this.currentTool = tool;
                        // Optional: Notify tool switch? No, user said "useless things shouldn't ring"
                    }
                    return;
                }
            }
        }

        // Check for end patterns
        if (this.currentTool !== 'generic') {
            for (const pattern of TOOLS[this.currentTool].endPatterns) {
                if (pattern.test(this.buffer)) {
                    this.currentTool = 'generic';
                    return;
                }
            }
        }
    }

    private createNotification(type: 'info' | 'error' | 'success', message: string): NotificationResult | null {
        const now = Date.now();
        // Debounce: 3 seconds for same message
        if (message === this.lastNotificationMessage && now - this.lastNotificationTime < 3000) {
            return null;
        }

        this.lastNotificationTime = now;
        this.lastNotificationMessage = message;
        return { type, message };
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
