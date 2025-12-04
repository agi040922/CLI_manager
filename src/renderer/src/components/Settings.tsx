import React, { useState, useEffect } from 'react'
import { UserSettings, EditorType, TerminalTemplate } from '../../../shared/types'
import { X, Check, AlertCircle, Plus, Trash2, Code2, Play, Package, GitBranch, Terminal, Settings as SettingsIcon, Bell, Monitor, Github, FolderOpen } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

interface SettingsProps {
    isOpen: boolean
    onClose: () => void
    onSave?: (settings: UserSettings) => void
    initialCategory?: SettingsCategory
}

type SettingsCategory = 'general' | 'editor' | 'terminal' | 'notifications' | 'port-monitoring' | 'templates' | 'git' | 'github'

export function Settings({ isOpen, onClose, onSave, initialCategory = 'general' }: SettingsProps) {
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

    useEffect(() => {
        if (isOpen) {
            setActiveCategory(initialCategory)
            // Load settings from main process
            window.api.getSettings().then((loadedSettings: UserSettings) => {
                if (loadedSettings) {
                    setSettings(loadedSettings)
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
        }
    }, [isOpen, initialCategory])

    const handleSave = async () => {
        await window.api.saveSettings(settings)
        await window.api.saveTemplates(templates)
        onSave?.(settings)
        onClose()
    }

    const handleAddTemplate = () => {
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
        { id: 'notifications' as const, label: 'Notifications', icon: <Bell size={16} /> },
        { id: 'port-monitoring' as const, label: 'Port Monitoring', icon: <Monitor size={16} /> },
        { id: 'templates' as const, label: 'Templates', icon: <Play size={16} /> },
        { id: 'git' as const, label: 'Git (Local)', icon: <GitBranch size={16} /> },
        { id: 'github' as const, label: 'GitHub', icon: <Github size={16} /> },
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
                        <div className="w-48 border-r border-white/10 bg-black/20 p-2 overflow-y-auto">
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

                        {/* Right Content Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* General Settings */}
                            {activeCategory === 'general' && (
                                <>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white mb-3">Appearance</h3>
                                        <div className="space-y-3">
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
                                        <div>
                                            <select
                                                value={settings.defaultEditor}
                                                onChange={e => setSettings(prev => ({ ...prev, defaultEditor: e.target.value as EditorType }))}
                                                className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="vscode">VS Code</option>
                                                <option value="cursor">Cursor</option>
                                                <option value="antigravity">Antigravity</option>
                                            </select>
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
                                                <select
                                                    value={settings.defaultShell}
                                                    onChange={e => setSettings(prev => ({ ...prev, defaultShell: e.target.value }))}
                                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="zsh">zsh</option>
                                                    <option value="bash">bash</option>
                                                    <option value="fish">fish</option>
                                                    <option value="sh">sh</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Font Size</label>
                                                <input
                                                    type="number"
                                                    min={10}
                                                    max={24}
                                                    value={settings.fontSize}
                                                    onChange={e => setSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) || 14 }))}
                                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Font Family</label>
                                                <input
                                                    type="text"
                                                    value={settings.fontFamily}
                                                    onChange={e => setSettings(prev => ({ ...prev, fontFamily: e.target.value }))}
                                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
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
