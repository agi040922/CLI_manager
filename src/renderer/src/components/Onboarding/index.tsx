import React, { useEffect, useState } from 'react'
import { Check, X, Terminal, Github, Coffee } from 'lucide-react'

interface OnboardingProps {
    onComplete: () => void
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [tools, setTools] = useState<{ git: boolean; gh: boolean; brew: boolean } | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const check = async () => {
            try {
                const result = await window.api.checkTools()
                setTools(result)
            } catch (error) {
                console.error('Failed to check tools:', error)
            } finally {
                setLoading(false)
            }
        }
        check()
    }, [])

    const handleContinue = async () => {
        try {
            const currentSettings = await window.api.getSettings()
            await window.api.saveSettings({
                ...currentSettings,
                hasCompletedOnboarding: true
            })
            onComplete()
        } catch (error) {
            console.error('Failed to save settings:', error)
        }
    }

    const ToolStatus = ({ 
        name, 
        installed, 
        icon: Icon, 
        description,
        installCmd 
    }: { 
        name: string
        installed: boolean
        icon: React.ElementType
        description: string
        installCmd: string
    }) => (
        <div className="flex items-start justify-between p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="flex gap-3">
                <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${installed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    <Icon size={16} />
                </div>
                <div>
                    <h3 className="text-sm font-medium text-white">{name}</h3>
                    <p className="text-xs text-gray-400">{description}</p>
                    {!installed && (
                        <div className="mt-1.5 bg-black/50 p-1.5 rounded text-[10px] font-mono text-gray-300 select-all inline-block">
                            {installCmd}
                        </div>
                    )}
                </div>
            </div>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border ${
                installed 
                    ? 'bg-green-500/10 border-green-500/20 text-green-400' 
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
                {installed ? (
                    <>
                        <Check size={10} />
                        <span>Installed</span>
                    </>
                ) : (
                    <>
                        <X size={10} />
                        <span>Missing</span>
                    </>
                )}
            </div>
        </div>
    )

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-xl bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-6 text-center border-b border-white/5">
                    <div className="w-12 h-12 bg-purple-600 rounded-xl mx-auto mb-3 flex items-center justify-center shadow-[0_0_30px_rgba(147,51,234,0.3)]">
                        <Terminal size={24} className="text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-1">Welcome to CLI Manager</h1>
                    <p className="text-sm text-gray-400">Let's make sure you have everything needed to get started.</p>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
                            <p className="text-sm text-gray-400">Checking system requirements...</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <ToolStatus 
                                name="Git" 
                                installed={tools?.git ?? false} 
                                icon={Terminal}
                                description="Required for version control and repository management."
                                installCmd="brew install git"
                            />
                            <ToolStatus 
                                name="GitHub CLI" 
                                installed={tools?.gh ?? false} 
                                icon={Github}
                                description="Required for pull requests and issue management."
                                installCmd="brew install gh"
                            />
                            <ToolStatus 
                                name="Homebrew" 
                                installed={tools?.brew ?? false} 
                                icon={Coffee}
                                description="Recommended package manager for macOS."
                                installCmd='/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white/5 border-t border-white/5 flex justify-end">
                    <button
                        onClick={handleContinue}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-medium transition-colors shadow-lg shadow-purple-900/20 flex items-center gap-2"
                    >
                        <Check size={16} />
                        Accept and Continue
                    </button>
                </div>
            </div>
        </div>
    )
}
