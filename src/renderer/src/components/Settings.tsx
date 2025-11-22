import React, { useState, useEffect } from 'react'
import { UserSettings } from '../../../shared/types'
import { X, Check, AlertCircle } from 'lucide-react'

interface SettingsProps {
    isOpen: boolean
    onClose: () => void
}

export function Settings({ isOpen, onClose }: SettingsProps) {
    const [settings, setSettings] = useState<UserSettings>({
        theme: 'dark',
        fontSize: 14,
        fontFamily: 'Monaco, Courier New, monospace',
        defaultShell: 'zsh',
        github: undefined
    })
    const [githubCheckStatus, setGithubCheckStatus] = useState<'checking' | 'success' | 'error' | null>(null)

    useEffect(() => {
        if (isOpen) {
            // Load settings from main process
            window.api.getSettings().then((loadedSettings: UserSettings) => {
                if (loadedSettings) {
                    setSettings(loadedSettings)
                }
            }).catch(() => {
                // If getSettings is not available, use defaults
            })
        }
    }, [isOpen])

    const handleSave = async () => {
        await window.api.saveSettings(settings)
        onClose()
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

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1e1e20] border border-white/10 rounded-lg w-[600px] max-h-[80vh] overflow-hidden shadow-2xl">
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

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                    {/* GitHub Section */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-white">GitHub Configuration</h3>
                        <p className="text-xs text-gray-400">
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
                                            Please configure Git with: <code className="text-white bg-black/30 px-1 rounded">git config --global user.name</code> and <code className="text-white bg-black/30 px-1 rounded">git config --global user.email</code>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Terminal Settings */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-white">Terminal</h3>

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

                    {/* Appearance */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-white">Appearance</h3>

                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Theme</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSettings(prev => ({ ...prev, theme: 'dark' }))}
                                    className={`flex-1 px-4 py-2 text-sm rounded transition-colors ${
                                        settings.theme === 'dark'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-black/30 text-gray-400 hover:bg-white/5'
                                    }`}
                                >
                                    Dark
                                </button>
                                <button
                                    onClick={() => setSettings(prev => ({ ...prev, theme: 'light' }))}
                                    className={`flex-1 px-4 py-2 text-sm rounded transition-colors ${
                                        settings.theme === 'light'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-black/30 text-gray-400 hover:bg-white/5'
                                    }`}
                                >
                                    Light
                                </button>
                            </div>
                        </div>
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
    )
}
