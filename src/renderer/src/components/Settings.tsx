import React, { useState, useEffect } from 'react'
import { UserSettings, EditorType, TerminalTemplate, LicenseInfo, PLAN_LIMITS, HooksSettings } from '../../../shared/types'
import { X, Check, AlertCircle, CircleAlert, Plus, Trash2, Code2, Play, Package, GitBranch, Terminal, Settings as SettingsIcon, Bell, Monitor, Github, FolderOpen, Folder, Download, RefreshCw, Loader2, Crown, Home, Keyboard, Bug, Webhook } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error'

interface UpdateState {
    status: UpdateStatus
    version?: string
    percent?: number
    message?: string
}

interface SettingsProps {
    isOpen: boolean
    onClose: () => void
    onSave?: (settings: UserSettings) => void
    initialCategory?: SettingsCategory
    onResetOnboarding?: () => void
    licenseInfo?: LicenseInfo
    onLicenseChange?: (info: LicenseInfo) => void
}

type SettingsCategory = 'general' | 'editor' | 'terminal' | 'keyboard' | 'hooks' | 'notifications' | 'port-monitoring' | 'templates' | 'git' | 'github' | 'license'

export function Settings({ isOpen, onClose, onSave, initialCategory = 'general', onResetOnboarding, licenseInfo, onLicenseChange }: SettingsProps) {
    const [settings, setSettings] = useState<UserSettings>({
        theme: 'dark',
        fontSize: 14,
        fontFamily: 'Monaco, Courier New, monospace',
        defaultShell: 'zsh',
        defaultEditor: 'vscode',
        portFilter: {
            enabled: true,
            minPort: 3000,
            maxPort: 9000
        },
        github: undefined,
        notifications: {
            enabled: false,  // 기본값을 false로 설정 (알림 끄기)
            tools: {
                cc: true,
                codex: true,
                gemini: true,
                generic: true
            }
        }
    })
    const [githubCheckStatus, setGithubCheckStatus] = useState<'checking' | 'success' | 'error' | null>(null)
    const [templates, setTemplates] = useState<TerminalTemplate[]>([])
    const [editingTemplate, setEditingTemplate] = useState<TerminalTemplate | null>(null)
    const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory)
    const [appVersion, setAppVersion] = useState<string>('')
    const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
    // Shell configuration states
    const [isCustomShell, setIsCustomShell] = useState(false)
    const [shellValidation, setShellValidation] = useState<{ status: 'idle' | 'checking' | 'valid' | 'invalid', message?: string }>({ status: 'idle' })
    const standardShells = ['zsh', 'bash', 'fish', 'sh', '/bin/zsh', '/bin/bash']
    // Editor configuration states
    const [isCustomEditor, setIsCustomEditor] = useState(false)
    const [editorValidation, setEditorValidation] = useState<{ status: 'idle' | 'checking' | 'valid' | 'invalid', message?: string }>({ status: 'idle' })
    const [customEditorPath, setCustomEditorPath] = useState('')
    const standardEditors: EditorType[] = ['vscode', 'cursor', 'antigravity']

    useEffect(() => {
        if (isOpen) {
            setActiveCategory(initialCategory)
            // Load settings from main process
            window.api.getSettings().then((loadedSettings: UserSettings) => {
                if (loadedSettings) {
                    setSettings(loadedSettings)
                    // Check if current shell is a custom path
                    setIsCustomShell(!standardShells.includes(loadedSettings.defaultShell))
                    // Check if current editor is custom
                    setIsCustomEditor(loadedSettings.defaultEditor === 'custom')
                    setCustomEditorPath(loadedSettings.customEditorPath || '')
                }
            }).catch(() => {
                // If getSettings is not available, use defaults
            })

            // Load templates
            window.api.getTemplates().then(setTemplates).catch(() => {
                // If getTemplates is not available, use empty array
            })

            // Automatically check git config when settings open
            checkGitConfig()

            // Get app version
            window.api.getAppVersion().then(setAppVersion)

            // Listen for update status
            const unsubscribe = window.api.onUpdateStatus((data) => {
                setUpdateState({
                    status: data.status as UpdateStatus,
                    version: data.version,
                    percent: data.percent,
                    message: data.message
                })
            })

            return () => unsubscribe()
        }
    }, [isOpen, initialCategory])

    const handleCheckForUpdate = async () => {
        setUpdateState({ status: 'checking' })
        try {
            const result = await window.api.checkForUpdate() as any

            if (result.isDev) {
                // Dev mode - can't check updates
                setUpdateState({ status: 'error', message: 'Dev mode' })
                return
            }

            if (!result.success) {
                setUpdateState({ status: 'error', message: result.error })
                return
            }

            if (result.hasUpdate) {
                // Update available - autoUpdater events will handle the rest
                setUpdateState({ status: 'available', version: result.version })
            } else {
                // Already up to date
                setUpdateState({ status: 'not-available' })
            }
        } catch (error: any) {
            setUpdateState({ status: 'error', message: error.message })
        }
    }

    const handleDownloadUpdate = () => {
        setUpdateState(prev => ({ ...prev, status: 'downloading', percent: 0 }))
        window.api.downloadUpdate()
    }

    const handleInstallUpdate = () => {
        window.api.installUpdate()
    }

    const handleSave = async () => {
        await window.api.saveSettings(settings)
        await window.api.saveTemplates(templates)
        onSave?.(settings)
        onClose()
    }

    const handleAddTemplate = async () => {
        // Check template limit (Free: 3, Pro: unlimited)
        const limit = licenseInfo?.limits.maxTemplates ?? 3
        if (limit !== -1 && templates.length >= limit) {
            await window.api.showMessageBox({
                type: 'warning',
                title: 'Template Limit Reached',
                message: `Free plan allows up to ${limit} templates. Upgrade to Pro for unlimited templates.`,
                buttons: ['OK']
            })
            return
        }

        const newTemplate: TerminalTemplate = {
            id: uuidv4(),
            name: 'New Template',
            icon: 'terminal',
            description: '',
            command: ''
        }
        setEditingTemplate(newTemplate)
    }

    const handleSaveTemplate = () => {
        if (editingTemplate) {
            const existingIndex = templates.findIndex(t => t.id === editingTemplate.id)
            if (existingIndex >= 0) {
                setTemplates(prev => prev.map((t, i) => i === existingIndex ? editingTemplate : t))
            } else {
                setTemplates(prev => [...prev, editingTemplate])
            }
            setEditingTemplate(null)
        }
    }

    const handleDeleteTemplate = (id: string) => {
        setTemplates(prev => prev.filter(t => t.id !== id))
    }

    const getTemplateIcon = (iconName: string) => {
        switch (iconName) {
            case 'code': return <Code2 size={16} />
            case 'play': return <Play size={16} />
            case 'package': return <Package size={16} />
            case 'git': return <GitBranch size={16} />
            default: return <Terminal size={16} />
        }
    }

    const checkGitConfig = async () => {
        setGithubCheckStatus('checking')
        try {
            const config = await window.api.checkGitConfig()
            if (config) {
                setSettings(prev => ({
                    ...prev,
                    github: {
                        username: config.username || '',
                        email: config.email || '',
                        isAuthenticated: !!(config.username && config.email)
                    }
                }))
                setGithubCheckStatus('success')
            } else {
                setGithubCheckStatus('error')
            }
        } catch (error) {
            setGithubCheckStatus('error')
        }
    }

    if (!isOpen) return null

    const categories = [
        { id: 'general' as const, label: 'General', icon: <SettingsIcon size={16} /> },
        { id: 'editor' as const, label: 'Editor', icon: <Code2 size={16} /> },
        { id: 'terminal' as const, label: 'Terminal', icon: <Terminal size={16} /> },
        { id: 'keyboard' as const, label: 'Keyboard', icon: <Keyboard size={16} /> },
        { id: 'hooks' as const, label: 'Hooks', icon: <Webhook size={16} /> },
        { id: 'notifications' as const, label: 'Notifications', icon: <Bell size={16} /> },
        { id: 'port-monitoring' as const, label: 'Port Monitoring', icon: <Monitor size={16} /> },
        { id: 'templates' as const, label: 'Templates', icon: <Play size={16} /> },
        { id: 'git' as const, label: 'Git (Local)', icon: <GitBranch size={16} /> },
        { id: 'github' as const, label: 'GitHub', icon: <Github size={16} /> },
        { id: 'license' as const, label: 'License', icon: <Crown size={16} /> },
    ]

    return (
        <>
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-[#1e1e20] border border-white/10 rounded-lg w-[800px] h-[600px] overflow-hidden shadow-2xl flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                        <h2 className="text-lg font-semibold text-white">Settings</h2>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                            <X size={18} className="text-gray-400" />
                        </button>
                    </div>

                    {/* Content - Split Layout */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Left Sidebar - Categories */}
                        <div className="w-48 border-r border-white/10 bg-black/20 overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-y-auto p-2">
                                {categories.map(category => (
                                    <button
                                        key={category.id}
                                        onClick={() => setActiveCategory(category.id)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${activeCategory === category.id
                                                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                            }`}
                                    >
                                        {category.icon}
                                        <span>{category.label}</span>
                                    </button>
                                ))}
                            </div>
                            {/* Version and Update Section */}
                            <div className="p-3 border-t border-white/5 space-y-2">
                                {appVersion && (
                                    <div className="text-center leading-tight">
                                        <div className="text-[10px] text-gray-500">
                                            v{appVersion}
                                        </div>
                                        <a
                                            href="https://www.solhun.com/changelog"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[9px] text-blue-500 hover:text-blue-400"
                                        >
                                            view changelog
                                        </a>
                                    </div>
                                )}

                                {/* Update Status */}
                                {updateState.status === 'checking' && (
                                    <div className="flex items-center justify-center gap-1 text-[10px] text-blue-400">
                                        <Loader2 size={10} className="animate-spin" />
                                        <span>Checking...</span>
                                    </div>
                                )}

                                {updateState.status === 'available' && (
                                    <button
                                        onClick={handleDownloadUpdate}
                                        className="w-full px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center justify-center gap-1"
                                    >
                                        <Download size={10} />
                                        Download v{updateState.version}
                                    </button>
                                )}

                                {updateState.status === 'downloading' && (
                                    <div className="space-y-1">
                                        <div className="text-[10px] text-blue-400 text-center">
                                            Downloading... {updateState.percent}%
                                        </div>
                                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 transition-all duration-300"
                                                style={{ width: `${updateState.percent || 0}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {updateState.status === 'ready' && (
                                    <button
                                        onClick={handleInstallUpdate}
                                        className="w-full px-2 py-1 text-[10px] bg-green-600 hover:bg-green-500 text-white rounded transition-colors flex items-center justify-center gap-1"
                                    >
                                        <Download size={10} />
                                        Install v{updateState.version}
                                    </button>
                                )}

                                {updateState.status === 'not-available' && (
                                    <div className="text-[10px] text-gray-500 text-center">
                                        Up to date
                                    </div>
                                )}

                                {updateState.status === 'error' && (
                                    <div className="text-[10px] text-red-400 text-center truncate" title={updateState.message}>
                                        Update error
                                    </div>
                                )}

                                {(updateState.status === 'idle' || updateState.status === 'not-available' || updateState.status === 'error') && (
                                    <button
                                        onClick={handleCheckForUpdate}
                                        className="w-full px-2 py-1 text-[10px] bg-white/10 hover:bg-white/20 text-gray-300 rounded transition-colors flex items-center justify-center gap-1"
                                    >
                                        <RefreshCw size={10} />
                                        Check Updates
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Right Content Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* General Settings */}
                            {activeCategory === 'general' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-3">Appearance</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Theme</label>
                                                <select
                                                    value={settings.theme}
                                                    onChange={e => setSettings(prev => ({ ...prev, theme: e.target.value as 'dark' | 'light' }))}
                                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="dark">Dark</option>
                                                    <option value="light">Light</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Sidebar Font Size</label>
                                                <p className="text-xs text-gray-500 mb-2">
                                                    Adjust the font size for workspace and session names in the sidebar
                                                </p>
                                                <input
                                                    type="number"
                                                    min={10}
                                                    max={18}
                                                    value={settings.fontSize}
                                                    onChange={e => setSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) || 14 }))}
                                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-6 pt-6 border-t border-white/10">
                                        <h3 className="text-sm font-semibold text-white mb-3">Onboarding</h3>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-gray-300">Show Welcome Screen</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Display the setup guide on next launch
                                                </p>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    const newSettings = { ...settings, hasCompletedOnboarding: false }
                                                    setSettings(newSettings)
                                                    await window.api.saveSettings(newSettings)
                                                    onResetOnboarding?.()
                                                    onClose()
                                                }}
                                                className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                                            >
                                                Show Again
                                            </button>
                                        </div>
                                    </div>

                                    {/* Home Workspace Settings */}
                                    <div className="mt-6 pt-6 border-t border-white/10">
                                        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                                            <Home size={14} className="text-emerald-400" />
                                            Home Workspace
                                        </h3>
                                        <p className="text-xs text-gray-400 mb-4">
                                            Configure the home workspace that appears at the top of the sidebar
                                        </p>

                                        <div className="space-y-4">
                                            {/* Toggle */}
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-gray-300">Show Home Workspace</p>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        Display home directory as a workspace in the sidebar
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => setSettings(prev => ({
                                                        ...prev,
                                                        showHomeWorkspace: !(prev.showHomeWorkspace ?? true)
                                                    }))}
                                                    className={`relative w-11 h-6 rounded-full transition-colors ${
                                                        (settings.showHomeWorkspace ?? true)
                                                            ? 'bg-emerald-600'
                                                            : 'bg-white/20'
                                                    }`}
                                                >
                                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                                        (settings.showHomeWorkspace ?? true)
                                                            ? 'translate-x-6'
                                                            : 'translate-x-1'
                                                    }`} />
                                                </button>
                                            </div>

                                            {/* Custom Path */}
                                            {(settings.showHomeWorkspace ?? true) && (
                                                <div>
                                                    <label className="block text-xs text-gray-400 mb-1">Custom Home Path (Optional)</label>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={settings.homeWorkspacePath || ''}
                                                            onChange={e => setSettings(prev => ({
                                                                ...prev,
                                                                homeWorkspacePath: e.target.value || undefined
                                                            }))}
                                                            placeholder="Leave empty for system home directory"
                                                            className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                        <button
                                                            onClick={async () => {
                                                                const result = await window.api.selectDirectory?.()
                                                                if (result) {
                                                                    setSettings(prev => ({ ...prev, homeWorkspacePath: result }))
                                                                }
                                                            }}
                                                            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded transition-colors flex items-center gap-1"
                                                            title="Browse folder"
                                                        >
                                                            <FolderOpen size={14} />
                                                        </button>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-2">
                                                        Set a custom directory to use as your home workspace instead of the system home
                                                    </p>
                                                    {settings.homeWorkspacePath && (
                                                        <button
                                                            onClick={() => setSettings(prev => ({ ...prev, homeWorkspacePath: undefined }))}
                                                            className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
                                                        >
                                                            Reset to system home
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Editor Settings */}
                            {activeCategory === 'editor' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-1">Default Editor</h3>
                                        <p className="text-xs text-gray-400 mb-3">
                                            Choose which editor to open workspace folders with
                                        </p>
                                        <div className="space-y-3">
                                            {!isCustomEditor ? (
                                                <select
                                                    value={settings.defaultEditor}
                                                    onChange={e => {
                                                        if (e.target.value === 'custom') {
                                                            setIsCustomEditor(true)
                                                            setEditorValidation({ status: 'idle' })
                                                            setSettings(prev => ({ ...prev, defaultEditor: 'custom' }))
                                                        } else {
                                                            setSettings(prev => ({ ...prev, defaultEditor: e.target.value as EditorType }))
                                                            setEditorValidation({ status: 'idle' })
                                                        }
                                                    }}
                                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="vscode">VS Code</option>
                                                    <option value="cursor">Cursor</option>
                                                    <option value="antigravity">Antigravity</option>
                                                    <option value="custom">Custom command...</option>
                                                </select>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={customEditorPath}
                                                            onChange={e => {
                                                                setCustomEditorPath(e.target.value)
                                                                setSettings(prev => ({ ...prev, customEditorPath: e.target.value }))
                                                                setEditorValidation({ status: 'idle' })
                                                            }}
                                                            placeholder="e.g., /usr/local/bin/subl or sublime"
                                                            className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                        <button
                                                            onClick={async () => {
                                                                setEditorValidation({ status: 'checking' })
                                                                try {
                                                                    const result = await window.api.validateEditorPath(customEditorPath)
                                                                    if (result.valid) {
                                                                        setEditorValidation({ status: 'valid', message: 'Editor opened successfully!' })
                                                                    } else {
                                                                        setEditorValidation({ status: 'invalid', message: result.error || 'Failed to open' })
                                                                    }
                                                                } catch {
                                                                    setEditorValidation({ status: 'invalid', message: 'Failed to open editor' })
                                                                }
                                                            }}
                                                            disabled={editorValidation.status === 'checking' || !customEditorPath}
                                                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
                                                        >
                                                            {editorValidation.status === 'checking' ? 'Opening...' : 'Test'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setIsCustomEditor(false)
                                                                setSettings(prev => ({ ...prev, defaultEditor: 'vscode', customEditorPath: undefined }))
                                                                setCustomEditorPath('')
                                                                setEditorValidation({ status: 'idle' })
                                                            }}
                                                            className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                    {editorValidation.status === 'valid' && (
                                                        <p className="text-xs text-green-400 flex items-center gap-1">
                                                            <Check size={12} /> {editorValidation.message}
                                                        </p>
                                                    )}
                                                    {editorValidation.status === 'invalid' && (
                                                        <p className="text-xs text-red-400 flex items-center gap-1">
                                                            <CircleAlert size={12} /> {editorValidation.message}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-gray-500">
                                                        Enter a command (e.g., open -a "Antigravity") and click Test to verify it opens.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Terminal Settings */}
                            {activeCategory === 'terminal' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-3">Terminal Configuration</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Default Shell</label>
                                                {!isCustomShell ? (
                                                    <select
                                                        value={settings.defaultShell}
                                                        onChange={e => {
                                                            if (e.target.value === 'custom') {
                                                                setIsCustomShell(true)
                                                                setShellValidation({ status: 'idle' })
                                                            } else {
                                                                setSettings(prev => ({ ...prev, defaultShell: e.target.value }))
                                                                setShellValidation({ status: 'idle' })
                                                            }
                                                        }}
                                                        className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                    >
                                                        <option value="zsh">zsh</option>
                                                        <option value="bash">bash</option>
                                                        <option value="fish">fish</option>
                                                        <option value="sh">sh</option>
                                                        <option value="/bin/zsh">/bin/zsh</option>
                                                        <option value="/bin/bash">/bin/bash</option>
                                                        <option value="custom">Custom path...</option>
                                                    </select>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={settings.defaultShell}
                                                                onChange={e => {
                                                                    setSettings(prev => ({ ...prev, defaultShell: e.target.value }))
                                                                    setShellValidation({ status: 'idle' })
                                                                }}
                                                                placeholder="/usr/local/bin/fish"
                                                                className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    setShellValidation({ status: 'checking' })
                                                                    try {
                                                                        const result = await window.api.validateShellPath(settings.defaultShell)
                                                                        if (result.valid) {
                                                                            setShellValidation({ status: 'valid', message: `Found: ${result.resolvedPath}` })
                                                                        } else {
                                                                            setShellValidation({ status: 'invalid', message: result.error || 'Invalid path' })
                                                                        }
                                                                    } catch {
                                                                        setShellValidation({ status: 'invalid', message: 'Failed to validate' })
                                                                    }
                                                                }}
                                                                disabled={shellValidation.status === 'checking'}
                                                                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-sm text-white transition-colors"
                                                            >
                                                                {shellValidation.status === 'checking' ? 'Checking...' : 'Verify'}
                                                            </button>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setIsCustomShell(false)
                                                                setSettings(prev => ({ ...prev, defaultShell: 'zsh' }))
                                                                setShellValidation({ status: 'idle' })
                                                            }}
                                                            className="text-xs text-blue-400 hover:text-blue-300"
                                                        >
                                                            ← Back to preset options
                                                        </button>
                                                        {shellValidation.status === 'valid' && (
                                                            <p className="text-xs text-green-400 flex items-center gap-1">
                                                                <Check size={12} /> {shellValidation.message}
                                                            </p>
                                                        )}
                                                        {shellValidation.status === 'invalid' && (
                                                            <p className="text-xs text-red-400 flex items-center gap-1">
                                                                <CircleAlert size={12} /> {shellValidation.message}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Shell used for new terminal sessions. Changes apply to new terminals only.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-6 border-t border-white/10">
                                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded">
                                            <p className="text-xs text-blue-200">
                                                <strong>Tip:</strong> Use <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px]">⌘+</kbd> / <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px]">⌘-</kbd> to adjust terminal font size, <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px]">⌘0</kbd> to reset
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded">
                                            <p className="text-xs text-blue-200">
                                                <strong>Tip:</strong> If the screen freezes, please press Enter
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Keyboard Settings */}
                            {activeCategory === 'keyboard' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-1">Keyboard Shortcuts</h3>
                                        <p className="text-xs text-gray-400 mb-4">
                                            Configure keyboard shortcuts for terminal control
                                        </p>

                                        <div className="space-y-4">
                                            {/* Scroll Shortcuts */}
                                            <div className="p-4 bg-black/20 border border-white/10 rounded-lg">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm text-white">Scroll Shortcuts</p>
                                                                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-gray-400">⌘↑</kbd>
                                                                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-gray-400">⌘↓</kbd>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setSettings(prev => ({
                                                            ...prev,
                                                            keyboard: {
                                                                scrollShortcuts: !(prev.keyboard?.scrollShortcuts ?? true),
                                                                showScrollButtons: prev.keyboard?.showScrollButtons ?? true
                                                            }
                                                        }))}
                                                        className={`relative w-11 h-6 rounded-full transition-colors ${
                                                            (settings.keyboard?.scrollShortcuts ?? true)
                                                                ? 'bg-blue-600'
                                                                : 'bg-white/20'
                                                        }`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                                            (settings.keyboard?.scrollShortcuts ?? true)
                                                                ? 'translate-x-6'
                                                                : 'translate-x-1'
                                                        }`} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Floating Scroll Buttons */}
                                            <div className="p-4 bg-black/20 border border-white/10 rounded-lg">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <p className="text-sm text-white">Floating Scroll Buttons</p>
                                                    </div>
                                                    <button
                                                        onClick={() => setSettings(prev => ({
                                                            ...prev,
                                                            keyboard: {
                                                                scrollShortcuts: prev.keyboard?.scrollShortcuts ?? true,
                                                                showScrollButtons: !(prev.keyboard?.showScrollButtons ?? true)
                                                            }
                                                        }))}
                                                        className={`relative w-11 h-6 rounded-full transition-colors ${
                                                            (settings.keyboard?.showScrollButtons ?? true)
                                                                ? 'bg-blue-600'
                                                                : 'bg-white/20'
                                                        }`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                                            (settings.keyboard?.showScrollButtons ?? true)
                                                                ? 'translate-x-6'
                                                                : 'translate-x-1'
                                                        }`} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 pt-4 border-t border-white/10">
                                            <p className="text-xs text-gray-500">
                                                <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px]">⌘+/-/0</kbd> Font size · <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px]">⌘↑/↓</kbd> Scroll
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Hooks Settings (Session Monitoring) */}
                            {activeCategory === 'hooks' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-1">Session Monitoring</h3>
                                        <p className="text-xs text-gray-400 mb-4">
                                            Show status indicator next to AI tool sessions in the sidebar
                                        </p>

                                        {/* Master Toggle */}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-gray-300">Enable Session Monitoring</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Monitor AI tool session status
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newEnabled = !(settings.hooks?.enabled ?? false)
                                                    setSettings(prev => ({
                                                        ...prev,
                                                        hooks: {
                                                            enabled: newEnabled,
                                                            claudeCode: prev.hooks?.claudeCode ?? {
                                                                enabled: true,
                                                                detectRunning: true,
                                                                detectReady: true,
                                                                detectError: true,
                                                                showInSidebar: true,
                                                                autoDismissSeconds: 5
                                                            }
                                                        }
                                                    }))
                                                }}
                                                className={`relative w-11 h-6 rounded-full transition-colors ${
                                                    (settings.hooks?.enabled ?? false)
                                                        ? 'bg-blue-600'
                                                        : 'bg-white/20'
                                                }`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                                    (settings.hooks?.enabled ?? false)
                                                        ? 'translate-x-6'
                                                        : 'translate-x-1'
                                                }`} />
                                            </button>
                                        </div>

                                        {/* Claude Code Section - only show when enabled */}
                                        {(settings.hooks?.enabled ?? false) && (
                                            <div className="mt-6 pt-4 border-t border-white/10">
                                                <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                                                    <Terminal size={14} className="text-blue-400" />
                                                    Claude Code
                                                </h4>

                                                {/* Status toggles */}
                                                <div className="space-y-3">
                                                    {/* Running */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                                            <span className="text-sm text-gray-300">Running</span>
                                                        </div>
                                                        <button
                                                            onClick={() => setSettings(prev => ({
                                                                ...prev,
                                                                hooks: {
                                                                    ...prev.hooks!,
                                                                    claudeCode: {
                                                                        ...prev.hooks!.claudeCode,
                                                                        detectRunning: !(prev.hooks?.claudeCode?.detectRunning ?? true)
                                                                    }
                                                                }
                                                            }))}
                                                            className={`relative w-9 h-5 rounded-full transition-colors ${
                                                                (settings.hooks?.claudeCode?.detectRunning ?? true)
                                                                    ? 'bg-blue-600'
                                                                    : 'bg-white/20'
                                                            }`}
                                                        >
                                                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                                                                (settings.hooks?.claudeCode?.detectRunning ?? true)
                                                                    ? 'translate-x-4'
                                                                    : 'translate-x-0.5'
                                                            }`} />
                                                        </button>
                                                    </div>

                                                    {/* Ready */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                            <span className="text-sm text-gray-300">Ready (Waiting)</span>
                                                        </div>
                                                        <button
                                                            onClick={() => setSettings(prev => ({
                                                                ...prev,
                                                                hooks: {
                                                                    ...prev.hooks!,
                                                                    claudeCode: {
                                                                        ...prev.hooks!.claudeCode,
                                                                        detectReady: !(prev.hooks?.claudeCode?.detectReady ?? true)
                                                                    }
                                                                }
                                                            }))}
                                                            className={`relative w-9 h-5 rounded-full transition-colors ${
                                                                (settings.hooks?.claudeCode?.detectReady ?? true)
                                                                    ? 'bg-blue-600'
                                                                    : 'bg-white/20'
                                                            }`}
                                                        >
                                                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                                                                (settings.hooks?.claudeCode?.detectReady ?? true)
                                                                    ? 'translate-x-4'
                                                                    : 'translate-x-0.5'
                                                            }`} />
                                                        </button>
                                                    </div>

                                                    {/* Error */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                            <span className="text-sm text-gray-300">Error</span>
                                                        </div>
                                                        <button
                                                            onClick={() => setSettings(prev => ({
                                                                ...prev,
                                                                hooks: {
                                                                    ...prev.hooks!,
                                                                    claudeCode: {
                                                                        ...prev.hooks!.claudeCode,
                                                                        detectError: !(prev.hooks?.claudeCode?.detectError ?? true)
                                                                    }
                                                                }
                                                            }))}
                                                            className={`relative w-9 h-5 rounded-full transition-colors ${
                                                                (settings.hooks?.claudeCode?.detectError ?? true)
                                                                    ? 'bg-blue-600'
                                                                    : 'bg-white/20'
                                                            }`}
                                                        >
                                                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                                                                (settings.hooks?.claudeCode?.detectError ?? true)
                                                                    ? 'translate-x-4'
                                                                    : 'translate-x-0.5'
                                                            }`} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Tip Box */}
                                                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded mt-4">
                                                    <p className="text-xs text-blue-200">
                                                        <strong>Tip:</strong> Currently only Claude Code is supported. More AI tools will be added in future updates.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Notification Settings */}
                            {activeCategory === 'notifications' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-1">Terminal Output Notifications</h3>
                                        <p className="text-xs text-gray-400 mb-3">
                                            Configure when to receive notifications from terminal output
                                        </p>

                                        {/* Coming Soon Notice */}
                                        <div className="flex flex-col items-center justify-center py-12 text-center">
                                            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                                                <Bell size={28} className="text-blue-400" />
                                            </div>
                                            <h4 className="text-lg font-medium text-white mb-2">Coming Soon</h4>
                                            <p className="text-sm text-gray-400 max-w-sm">
                                                Terminal output notifications for Claude Code, Codex, and other AI tools
                                                will be available in a future update.
                                            </p>
                                            <div className="mt-4 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
                                                <span className="text-xs text-blue-300">In Development</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Port Monitoring Settings */}
                            {activeCategory === 'port-monitoring' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-1">Port Filter</h3>
                                        <p className="text-xs text-gray-400 mb-3">
                                            Enable filter to show only development server ports
                                        </p>

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.portFilter?.enabled ?? true}
                                                    onChange={e => setSettings(prev => ({
                                                        ...prev,
                                                        portFilter: {
                                                            enabled: e.target.checked,
                                                            minPort: prev.portFilter?.minPort ?? 3000,
                                                            maxPort: prev.portFilter?.maxPort ?? 9000
                                                        }
                                                    }))}
                                                    className="w-4 h-4 rounded border-white/10 bg-black/30 text-blue-600 focus:ring-blue-500"
                                                />
                                                <label className="text-sm text-gray-300">Enable port filter</label>
                                            </div>

                                            {settings.portFilter?.enabled && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs text-gray-400 mb-1">Min Port</label>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={65535}
                                                            value={settings.portFilter?.minPort ?? 3000}
                                                            onChange={e => setSettings(prev => ({
                                                                ...prev,
                                                                portFilter: {
                                                                    enabled: prev.portFilter?.enabled ?? true,
                                                                    minPort: parseInt(e.target.value) || 3000,
                                                                    maxPort: prev.portFilter?.maxPort ?? 9000
                                                                }
                                                            }))}
                                                            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-400 mb-1">Max Port</label>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={65535}
                                                            value={settings.portFilter?.maxPort ?? 9000}
                                                            onChange={e => setSettings(prev => ({
                                                                ...prev,
                                                                portFilter: {
                                                                    enabled: prev.portFilter?.enabled ?? true,
                                                                    minPort: prev.portFilter?.minPort ?? 3000,
                                                                    maxPort: parseInt(e.target.value) || 9000
                                                                }
                                                            }))}
                                                            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <p className="text-xs text-gray-500">
                                                Common dev ports: 3000 (React), 5173 (Vite), 8080 (Server)
                                            </p>
                                        </div>
                                    </div>

                                    {/* Ignored Items Section */}
                                    <div className="mt-8 pt-8 border-t border-white/10">
                                        <h3 className="text-sm font-semibold text-white mb-3">Ignored Items</h3>
                                        <p className="text-xs text-gray-400 mb-4">
                                            Ports and processes that are hidden from monitoring
                                        </p>

                                        {/* Ignored Ports */}
                                        <div className="mb-4">
                                            <label className="block text-xs text-gray-400 mb-2">Ignored Ports</label>
                                            <div className="flex flex-wrap gap-2">
                                                {settings.ignoredPorts && settings.ignoredPorts.length > 0 ? (
                                                    settings.ignoredPorts.map(port => (
                                                        <div
                                                            key={port}
                                                            className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs"
                                                        >
                                                            <span className="text-yellow-300 font-mono">{port}</span>
                                                            <button
                                                                onClick={() => setSettings(prev => ({
                                                                    ...prev,
                                                                    ignoredPorts: prev.ignoredPorts?.filter(p => p !== port)
                                                                }))}
                                                                className="p-0.5 hover:bg-white/10 rounded transition-colors"
                                                                title="Remove from ignored"
                                                            >
                                                                <X size={12} className="text-yellow-400 hover:text-white" />
                                                            </button>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-gray-600 italic">No ignored ports</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Ignored Processes */}
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-2">Ignored Processes (Folders)</label>
                                            <div className="flex flex-wrap gap-2">
                                                {settings.ignoredProcesses && settings.ignoredProcesses.length > 0 ? (
                                                    settings.ignoredProcesses.map(process => (
                                                        <div
                                                            key={process}
                                                            className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-xs"
                                                        >
                                                            <Folder size={12} className="text-blue-400" />
                                                            <span className="text-blue-300">{process}</span>
                                                            <button
                                                                onClick={() => setSettings(prev => ({
                                                                    ...prev,
                                                                    ignoredProcesses: prev.ignoredProcesses?.filter(p => p !== process)
                                                                }))}
                                                                className="p-0.5 hover:bg-white/10 rounded transition-colors"
                                                                title="Remove from ignored"
                                                            >
                                                                <X size={12} className="text-blue-400 hover:text-white" />
                                                            </button>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-gray-600 italic">No ignored processes</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-8 border-t border-white/10">
                                        <h3 className="text-sm font-semibold text-white mb-3">Action Logs</h3>
                                        <p className="text-xs text-gray-400 mb-3">
                                            History of port and process actions
                                        </p>

                                        <div className="border border-white/10 rounded overflow-hidden">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-white/5 text-gray-400">
                                                    <tr>
                                                        <th className="px-3 py-2 font-medium">Time</th>
                                                        <th className="px-3 py-2 font-medium">Action</th>
                                                        <th className="px-3 py-2 font-medium">Port</th>
                                                        <th className="px-3 py-2 font-medium">Target</th>
                                                        <th className="px-3 py-2 font-medium">Details</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {settings.portActionLogs?.slice().reverse().map((log, i) => (
                                                        <tr key={i} className="hover:bg-white/5">
                                                            <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                                                                {new Date(log.timestamp).toLocaleString()}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-medium ${
                                                                    log.action === 'kill' ? 'bg-red-500/20 text-red-300' :
                                                                    log.action === 'ignore-port' ? 'bg-yellow-500/20 text-yellow-300' :
                                                                    'bg-blue-500/20 text-blue-300'
                                                                }`}>
                                                                    {log.action.replace('-', ' ')}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-blue-300 font-mono">
                                                                {log.port || '-'}
                                                            </td>
                                                            <td className="px-3 py-2 text-white font-mono">
                                                                {log.target}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-500">
                                                                {log.details || '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {(!settings.portActionLogs || settings.portActionLogs.length === 0) && (
                                                        <tr>
                                                            <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                                                                No actions recorded yet
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Terminal Templates */}
                            {activeCategory === 'templates' && (
                                <>
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <h3 className="text-sm font-semibold text-white">Terminal Templates</h3>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Create custom terminal templates with preset commands
                                                </p>
                                            </div>
                                            <button
                                                onClick={handleAddTemplate}
                                                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1"
                                            >
                                                <Plus size={14} />
                                                Add Template
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {templates.map(template => (
                                                <div
                                                    key={template.id}
                                                    className="p-3 bg-black/20 border border-white/10 rounded hover:border-white/20 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex items-start gap-2 flex-1">
                                                            <div className="text-gray-400 mt-0.5">
                                                                {getTemplateIcon(template.icon)}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm font-medium text-white">{template.name}</div>
                                                                {template.description && (
                                                                    <div className="text-xs text-gray-500 mt-0.5">{template.description}</div>
                                                                )}
                                                                {template.command && (
                                                                    <code className="block text-xs text-blue-300 mt-1 bg-black/30 px-2 py-1 rounded">
                                                                        {template.command}
                                                                    </code>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => setEditingTemplate(template)}
                                                                className="p-1 hover:bg-white/10 rounded transition-colors"
                                                                title="Edit"
                                                            >
                                                                <SettingsIcon size={12} className="text-gray-400" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteTemplate(template.id)}
                                                                className="p-1 hover:bg-red-500/20 rounded transition-colors"
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={12} className="text-gray-400 hover:text-red-400" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {templates.length === 0 && (
                                                <div className="text-center py-12 text-gray-500 text-sm">
                                                    No templates yet. Click "Add Template" to create one.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Git (Local) Settings */}
                            {activeCategory === 'git' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-1">Git Worktree Settings</h3>
                                        <p className="text-xs text-gray-400 mb-4">
                                            Configure local Git worktree storage location
                                        </p>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Worktree Storage Path</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={settings.worktreePath || ''}
                                                        onChange={e => setSettings(prev => ({ ...prev, worktreePath: e.target.value || undefined }))}
                                                        placeholder="Leave empty for default (next to workspace)"
                                                        className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            // Open folder selection dialog
                                                            const result = await window.api.selectDirectory?.()
                                                            if (result) {
                                                                setSettings(prev => ({ ...prev, worktreePath: result }))
                                                            }
                                                        }}
                                                        className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded transition-colors flex items-center gap-1"
                                                        title="Browse folder"
                                                    >
                                                        <FolderOpen size={14} />
                                                    </button>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-2">
                                                    Default: <code className="bg-black/30 px-1 rounded">{'<workspace>/../<name>-worktrees/<branch>'}</code>
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Custom: <code className="bg-black/30 px-1 rounded">{'<custom-path>/<workspace-name>/<branch>'}</code>
                                                </p>
                                            </div>

                                            {settings.worktreePath && (
                                                <button
                                                    onClick={() => setSettings(prev => ({ ...prev, worktreePath: undefined }))}
                                                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                                >
                                                    Reset to default path
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-8 border-t border-white/10">
                                        <h3 className="text-sm font-semibold text-white mb-1">Worktree Deletion Options</h3>
                                        <p className="text-xs text-gray-400 mb-4">
                                            Configure what happens when deleting a worktree
                                        </p>

                                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
                                            <p className="text-xs text-yellow-200">
                                                <strong>Note:</strong> Deleting a worktree removes the local directory and git worktree metadata.
                                                The local branch is also deleted by default. Remote branches on GitHub are not affected.
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* GitHub Settings */}
                            {activeCategory === 'github' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-1">GitHub Configuration</h3>
                                        <p className="text-xs text-gray-400 mb-3">
                                            Check your local Git configuration for GitHub authentication
                                        </p>

                                        <button
                                            onClick={checkGitConfig}
                                            disabled={githubCheckStatus === 'checking'}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {githubCheckStatus === 'checking' ? 'Checking...' : 'Check Git Config'}
                                        </button>

                                        {settings.github && githubCheckStatus === 'success' && (
                                            <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded">
                                                <div className="flex items-start gap-2">
                                                    <Check size={16} className="text-green-400 mt-0.5" />
                                                    <div className="flex-1">
                                                        <p className="text-sm text-green-300 font-medium">Git configured</p>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            Username: <span className="text-white">{settings.github.username}</span>
                                                        </p>
                                                        <p className="text-xs text-gray-400">
                                                            Email: <span className="text-white">{settings.github.email}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {githubCheckStatus === 'error' && (
                                            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded">
                                                <div className="flex items-start gap-2">
                                                    <AlertCircle size={16} className="text-red-400 mt-0.5" />
                                                    <div className="flex-1">
                                                        <p className="text-sm text-red-300 font-medium">Git not configured</p>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            Git is not installed or configured. Set it up with these commands:
                                                        </p>
                                                        <div className="mt-2 space-y-1">
                                                            <code className="block text-xs text-white bg-black/30 px-2 py-1 rounded">
                                                                git config --global user.name "Your Name"
                                                            </code>
                                                            <code className="block text-xs text-white bg-black/30 px-2 py-1 rounded">
                                                                git config --global user.email "your@email.com"
                                                            </code>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {activeCategory === 'license' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-1">License & Plan</h3>
                                        <p className="text-xs text-gray-400 mb-4">
                                            Manage your CLI Manager license and subscription
                                        </p>

                                        {/* Current Plan Card */}
                                        <div className={`p-4 rounded-lg border ${licenseInfo?.planType === 'free'
                                            ? 'bg-gray-500/10 border-gray-500/20'
                                            : 'bg-purple-500/10 border-purple-500/20'}`}>
                                            <div className="flex items-center gap-3 mb-3">
                                                {licenseInfo?.planType !== 'free' && (
                                                    <Crown size={24} className="text-purple-400" />
                                                )}
                                                <div>
                                                    <h4 className="text-lg font-semibold text-white capitalize">
                                                        {licenseInfo?.planType || 'Free'} Plan
                                                    </h4>
                                                    {licenseInfo?.license?.customerEmail && (
                                                        <p className="text-xs text-gray-400">
                                                            {licenseInfo.license.customerEmail}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Plan Summary */}
                                            <p className="text-xs text-gray-400 mt-2">
                                                {licenseInfo?.planType === 'free' ? (
                                                    <>
                                                        {licenseInfo?.limits.maxWorkspaces} workspaces, {licenseInfo?.limits.maxSessionsPerWorkspace} sessions, {licenseInfo?.limits.maxTemplates} templates
                                                    </>
                                                ) : (
                                                    <>Unlimited workspaces, sessions, templates & Git Worktree</>
                                                )}
                                            </p>

                                            {/* Expiry Info */}
                                            {licenseInfo?.license?.expiresAt && (
                                                <div className="mt-3 pt-3 border-t border-white/10">
                                                    <p className="text-xs text-gray-400">
                                                        {licenseInfo.isExpired ? (
                                                            <span className="text-red-400">License expired</span>
                                                        ) : licenseInfo.daysUntilExpiry !== undefined ? (
                                                            <>Renews in <span className="text-white">{licenseInfo.daysUntilExpiry} days</span></>
                                                        ) : null}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Upgrade Button for Free Users */}
                                        {licenseInfo?.planType === 'free' && (
                                            <div className="mt-4">
                                                <button
                                                    onClick={() => window.open('https://solhun.com', '_blank')}
                                                    className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <Crown size={16} />
                                                    Upgrade to Pro
                                                </button>
                                                <p className="text-xs text-gray-500 text-center mt-2">
                                                    Unlock unlimited workspaces, sessions, and Git Worktree
                                                </p>
                                            </div>
                                        )}

                                        {/* License Key Input */}
                                        <div className="mt-6 pt-4 border-t border-white/10">
                                            <h4 className="text-sm font-medium text-white mb-2">Enter License Key</h4>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                                                    className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                                                    id="license-key-input"
                                                />
                                                <button
                                                    onClick={async () => {
                                                        const input = document.getElementById('license-key-input') as HTMLInputElement
                                                        if (input?.value) {
                                                            const result = await window.api.licenseActivate(input.value)
                                                            if (result.success) {
                                                                const info = await window.api.licenseGetInfo()
                                                                if (info.success && info.data && onLicenseChange) {
                                                                    onLicenseChange(info.data)
                                                                }
                                                                input.value = ''
                                                            } else {
                                                                await window.api.showMessageBox({
                                                                    type: 'error',
                                                                    title: 'Activation Failed',
                                                                    message: result.error || 'Invalid license key',
                                                                    buttons: ['OK']
                                                                })
                                                            }
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                                                >
                                                    Activate
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">
                                                Having trouble? Contact <span className="text-gray-400">solhun.jeong@gmail.com</span>
                                            </p>
                                        </div>

                                    </div>
                                </>
                            )}


                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>

            {/* Template Edit Modal */}
            {editingTemplate && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#1e1e20] border border-white/10 rounded-lg w-[500px] shadow-2xl" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <h3 className="text-lg font-semibold text-white">
                                {templates.find(t => t.id === editingTemplate.id) ? 'Edit Template' : 'New Template'}
                            </h3>
                            <button
                                onClick={() => setEditingTemplate(null)}
                                className="p-1 hover:bg-white/10 rounded transition-colors"
                            >
                                <X size={18} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Template Name</label>
                                <input
                                    type="text"
                                    value={editingTemplate.name}
                                    onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                                    placeholder="e.g., Claude Code, npm dev"
                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
                                <input
                                    type="text"
                                    value={editingTemplate.description}
                                    onChange={e => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                                    placeholder="Brief description"
                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Command</label>
                                <input
                                    type="text"
                                    value={editingTemplate.command}
                                    onChange={e => setEditingTemplate({ ...editingTemplate, command: e.target.value })}
                                    placeholder="e.g., cld, npm run dev, pnpm dev"
                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Command will be executed when terminal is created
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Icon</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {['terminal', 'code', 'play', 'package', 'git'].map(iconName => (
                                        <button
                                            key={iconName}
                                            onClick={() => setEditingTemplate({ ...editingTemplate, icon: iconName })}
                                            className={`p-3 rounded border transition-colors flex items-center justify-center ${editingTemplate.icon === iconName
                                                    ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                                                    : 'border-white/10 bg-black/30 text-gray-400 hover:border-white/20'
                                                }`}
                                        >
                                            {getTemplateIcon(iconName)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10">
                            <button
                                onClick={() => setEditingTemplate(null)}
                                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveTemplate}
                                disabled={!editingTemplate.name.trim()}
                                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Save Template
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
