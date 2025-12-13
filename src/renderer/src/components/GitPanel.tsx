import React, { useState, useEffect } from 'react'
import { GitBranch, GitCommit, GitPullRequest, Upload, RefreshCw, Check, X, FileText, Github, ExternalLink, Play, CheckCircle2, XCircle, Clock, AlertTriangle, GitMerge } from 'lucide-react'

interface GitStatus {
    branch: string
    modified: string[]
    staged: string[]
    untracked: string[]
    conflicted: string[]  // Merge conflict files
    ahead: number
    behind: number
    isMerging: boolean    // Merge in progress
}

interface GitCommit {
    hash: string
    message: string
    author: string
    date: string
}

interface GitPanelProps {
    workspacePath?: string
    isOpen: boolean
    onClose: () => void
}

export function GitPanel({ workspacePath, isOpen, onClose }: GitPanelProps) {
    const [status, setStatus] = useState<GitStatus | null>(null)
    const [loading, setLoading] = useState(false)
    const [commitMessage, setCommitMessage] = useState('')
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [error, setError] = useState<string | null>(null)
    const [commits, setCommits] = useState<GitCommit[]>([])
    const [showHistory, setShowHistory] = useState(false)

    // GitHub state
    const [ghAuth, setGhAuth] = useState<boolean>(false)
    const [ghRepo, setGhRepo] = useState<any>(null)
    const [ghPRs, setGhPRs] = useState<any[]>([])
    const [ghWorkflows, setGhWorkflows] = useState<any[]>([])
    const [showGitHub, setShowGitHub] = useState(false)
    const [showWorkflows, setShowWorkflows] = useState(false)
    const [prTitle, setPrTitle] = useState('')
    const [prBody, setPrBody] = useState('')

    const loadStatus = async () => {
        if (!workspacePath) return

        setLoading(true)
        setError(null)
        try {
            const gitStatus = await window.api.getGitStatus(workspacePath)
            if (gitStatus) {
                setStatus(gitStatus)
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load git status')
        } finally {
            setLoading(false)
        }
    }

    const loadHistory = async () => {
        if (!workspacePath) return

        try {
            const history = await window.api.gitLog(workspacePath, 20)
            setCommits(history)
        } catch (err: any) {
            console.error('Failed to load git history:', err)
        }
    }

    const handleReset = async (commitHash: string, hard: boolean = false) => {
        if (!workspacePath) return

        const confirmMessage = hard
            ? 'Reset to this commit. All changes will be deleted. Continue?'
            : 'Reset to this commit (keep changes). Continue?'

        const result = await window.api.showMessageBox({
            type: hard ? 'warning' : 'question',
            title: 'Git Reset',
            message: confirmMessage,
            buttons: ['Cancel', 'Reset']
        })
        if (result.response !== 1) return

        setLoading(true)
        try {
            await window.api.gitReset(workspacePath, commitHash, hard)
            await loadStatus()
            await loadHistory()
        } catch (err: any) {
            setError(err.message || 'Failed to reset')
        } finally {
            setLoading(false)
        }
    }

    // Check GitHub authentication
    const checkGitHubAuth = async () => {
        if (!workspacePath) return

        try {
            const authStatus = await window.api.ghCheckAuth()
            setGhAuth(authStatus.authenticated)
            if (authStatus.authenticated) {
                const repo = await window.api.ghRepoView(workspacePath)
                setGhRepo(repo)
                const prs = await window.api.ghListPRs(workspacePath)
                setGhPRs(prs)
                const workflows = await window.api.ghWorkflowStatus(workspacePath)
                if (workflows.success && workflows.data) {
                    setGhWorkflows(workflows.data)
                }
            }
        } catch (err) {
            console.error('GitHub auth check failed:', err)
            setGhAuth(false)
            setGhRepo(null)
            setGhPRs([])
            setGhWorkflows([])
        }
    }

    // Refresh workflow status
    const refreshWorkflows = async () => {
        if (!workspacePath || !ghAuth) return
        setLoading(true)
        try {
            const workflows = await window.api.ghWorkflowStatus(workspacePath)
            if (workflows.success && workflows.data) {
                setGhWorkflows(workflows.data)
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load workflows')
        } finally {
            setLoading(false)
        }
    }

    // GitHub login
    const handleGitHubLogin = async () => {
        setLoading(true)
        try {
            const result = await window.api.ghAuthLogin()
            if (result.success) {
                await checkGitHubAuth()
            } else {
                setError('GitHub login failed')
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // Create PR
    const handleCreatePR = async () => {
        if (!workspacePath || !prTitle.trim()) return

        setLoading(true)
        try {
            const result = await window.api.ghCreatePR(workspacePath, prTitle, prBody)
            if (result.success) {
                setPrTitle('')
                setPrBody('')
                await checkGitHubAuth() // Refresh PR list
            }
        } catch (err: any) {
            setError(err.message || 'Failed to create PR')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (isOpen && workspacePath) {
            loadStatus()
            loadHistory()
            checkGitHubAuth()
        }
        // Cleanup: Reset loading state when panel closes
        return () => {
            if (!isOpen) {
                setLoading(false)
            }
        }
    }, [isOpen, workspacePath])

    const handleStage = async (file: string) => {
        if (!workspacePath) return

        setLoading(true)
        try {
            await window.api.gitStage(workspacePath, file)
            await loadStatus()
        } catch (err: any) {
            setError(err.message || 'Failed to stage file')
        } finally {
            setLoading(false)
        }
    }

    const handleUnstage = async (file: string) => {
        if (!workspacePath) return

        setLoading(true)
        try {
            await window.api.gitUnstage(workspacePath, file)
            await loadStatus()
        } catch (err: any) {
            setError(err.message || 'Failed to unstage file')
        } finally {
            setLoading(false)
        }
    }

    const handleStageAll = async (files: string[]) => {
        if (!workspacePath || files.length === 0) return

        setLoading(true)
        try {
            // 병렬로 처리하여 속도 향상
            await Promise.all(files.map(file => window.api.gitStage(workspacePath, file)))
            await loadStatus()
        } catch (err: any) {
            setError(err.message || 'Failed to stage all files')
        } finally {
            setLoading(false)
        }
    }

    const handleUnstageAll = async () => {
        if (!workspacePath) return

        setLoading(true)
        try {
            await window.api.gitUnstageAll(workspacePath)
            await loadStatus()
        } catch (err: any) {
            setError(err.message || 'Failed to unstage all files')
        } finally {
            setLoading(false)
        }
    }

    const handleStageAllChanges = async () => {
        if (!workspacePath || !status) return

        setLoading(true)
        try {
            await window.api.gitStageAll(workspacePath)
            await loadStatus()
        } catch (err: any) {
            setError(err.message || 'Failed to stage all changes')
        } finally {
            setLoading(false)
        }
    }

    const handleCommit = async () => {
        if (!workspacePath || !commitMessage.trim()) return

        setLoading(true)
        try {
            await window.api.gitCommit(workspacePath, commitMessage)
            setCommitMessage('')
            await loadStatus()
        } catch (err: any) {
            setError(err.message || 'Failed to commit')
        } finally {
            setLoading(false)
        }
    }

    const handleCommitAndPush = async () => {
        if (!workspacePath || !commitMessage.trim()) return

        setLoading(true)
        try {
            await window.api.gitCommit(workspacePath, commitMessage)
            await window.api.gitPush(workspacePath)
            setCommitMessage('')
            await loadStatus()
        } catch (err: any) {
            setError(err.message || 'Failed to commit and push')
        } finally {
            setLoading(false)
        }
    }

    const handlePush = async () => {
        if (!workspacePath) return

        setLoading(true)
        try {
            await window.api.gitPush(workspacePath)
            await loadStatus()
        } catch (err: any) {
            setError(err.message || 'Failed to push')
        } finally {
            setLoading(false)
        }
    }

    const handlePull = async () => {
        if (!workspacePath) return

        setLoading(true)
        try {
            await window.api.gitPull(workspacePath)
            await loadStatus()
        } catch (err: any) {
            setError(err.message || 'Failed to pull')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[500] bg-black/20" onClick={onClose}>
            {/* Panel */}
            <div
                className="absolute right-0 top-0 bottom-0 w-96 bg-[#1e1e20] border-l border-white/10 shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 min-h-[56px]">
                    <div className="flex items-center gap-2">
                        <GitBranch size={16} className="text-blue-400" />
                        <h2 className="text-sm font-semibold text-white">Source Control</h2>
                    </div>
                    <div className="flex items-center gap-1.5 no-drag">
                        <button
                            onClick={() => setShowGitHub(!showGitHub)}
                            title="GitHub"
                            className={`p-2 hover:bg-white/10 rounded transition-colors no-drag ${showGitHub ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400'}`}
                        >
                            <Github size={16} />
                        </button>
                        <button
                            onClick={() => loadStatus()}
                            disabled={loading}
                            title="Refresh"
                            className="p-2 hover:bg-white/10 rounded transition-colors text-gray-400 disabled:opacity-50 no-drag"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={onClose}
                            title="Close"
                            className="p-2 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white no-drag"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* GitHub Section */}
                {showGitHub && (
                    <div className="p-4 border-b border-white/10 bg-black/20">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Github size={16} className="text-purple-400" />
                                <h3 className="text-sm font-semibold text-white">GitHub</h3>
                            </div>
                            {ghAuth && ghRepo && (
                                <a
                                    href={ghRepo.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                >
                                    {ghRepo.owner.login}/{ghRepo.name}
                                    <ExternalLink size={12} />
                                </a>
                            )}
                        </div>

                        {!ghAuth ? (
                            <div className="space-y-2">
                                <p className="text-xs text-gray-400">GitHub CLI authentication required</p>
                                <button
                                    onClick={handleGitHubLogin}
                                    disabled={loading}
                                    className="w-full px-3 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors disabled:opacity-50"
                                >
                                    GitHub Login
                                </button>
                                <p className="text-xs text-gray-500">Authenticate in browser and return</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Create PR */}
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Create Pull Request</label>
                                    <input
                                        type="text"
                                        value={prTitle}
                                        onChange={e => setPrTitle(e.target.value)}
                                        placeholder="PR title"
                                        className="w-full bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 mb-2"
                                    />
                                    <textarea
                                        value={prBody}
                                        onChange={e => setPrBody(e.target.value)}
                                        placeholder="PR description (optional)"
                                        className="w-full bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
                                        rows={2}
                                    />
                                    <button
                                        onClick={handleCreatePR}
                                        disabled={loading || !prTitle.trim()}
                                        className="mt-2 w-full px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors disabled:opacity-50"
                                    >
                                        <GitPullRequest size={14} className="inline mr-1" />
                                        Create PR
                                    </button>
                                </div>

                                {/* PR List */}
                                {ghPRs.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-400 mb-2">Recent Pull Requests</h4>
                                        <div className="space-y-1 max-h-40 overflow-y-auto">
                                            {ghPRs.slice(0, 5).map(pr => (
                                                <a
                                                    key={pr.number}
                                                    href={pr.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block p-2 bg-black/30 hover:bg-white/5 rounded text-xs transition-colors"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-white font-medium truncate">#{pr.number} {pr.title}</span>
                                                        <span className={`text-xs px-1.5 py-0.5 rounded ${pr.state === 'OPEN' ? 'bg-green-500/20 text-green-300' :
                                                            pr.state === 'MERGED' ? 'bg-purple-500/20 text-purple-300' :
                                                                'bg-red-500/20 text-red-300'
                                                            }`}>
                                                            {pr.state}
                                                        </span>
                                                    </div>
                                                    <div className="text-gray-500 mt-1">by {pr.author.login}</div>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* GitHub Actions */}
                                {ghWorkflows.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-white/10">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                                                <Play size={12} />
                                                Actions ({ghWorkflows.length})
                                            </h4>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={refreshWorkflows}
                                                    disabled={loading}
                                                    className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                                                    title="Refresh"
                                                >
                                                    <RefreshCw size={12} className="text-gray-400" />
                                                </button>
                                                <button
                                                    onClick={() => setShowWorkflows(!showWorkflows)}
                                                    className="text-xs text-blue-400 hover:text-blue-300"
                                                >
                                                    {showWorkflows ? 'Hide' : 'Show'}
                                                </button>
                                            </div>
                                        </div>

                                        {showWorkflows && (
                                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                                {ghWorkflows.map((workflow, index) => {
                                                    const isRunning = workflow.status === 'in_progress' || workflow.status === 'queued'
                                                    const isSuccess = workflow.conclusion === 'success'
                                                    const isFailure = workflow.conclusion === 'failure'

                                                    return (
                                                        <a
                                                            key={index}
                                                            href={workflow.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="block p-2 bg-black/30 hover:bg-white/5 rounded text-xs transition-colors"
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                {/* 상태 아이콘 */}
                                                                {isRunning && (
                                                                    <Clock size={14} className="text-yellow-400 shrink-0 mt-0.5 animate-pulse" />
                                                                )}
                                                                {isSuccess && (
                                                                    <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" />
                                                                )}
                                                                {isFailure && (
                                                                    <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                                                                )}
                                                                {!isRunning && !isSuccess && !isFailure && (
                                                                    <div className="w-3.5 h-3.5 rounded-full bg-gray-500 shrink-0 mt-0.5" />
                                                                )}

                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-white font-medium truncate">{workflow.name}</div>
                                                                    <div className="text-gray-500 mt-1 flex items-center gap-2">
                                                                        <span>{workflow.headBranch}</span>
                                                                        <span>•</span>
                                                                        <span className={`${isRunning ? 'text-yellow-400' :
                                                                            isSuccess ? 'text-green-400' :
                                                                                isFailure ? 'text-red-400' :
                                                                                    'text-gray-400'
                                                                            }`}>
                                                                            {isRunning ? 'Running...' : workflow.conclusion || workflow.status}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </a>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded">
                        <p className="text-xs text-red-300">{error}</p>
                    </div>
                )}

                {/* Branch Info */}
                {status && (
                    <div className="p-4 border-b border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <GitBranch size={14} className="text-blue-400" />
                                <span className="text-sm text-white font-medium">{status.branch}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                {status.ahead > 0 && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded font-medium">
                                        ↑ {status.ahead} to push
                                    </span>
                                )}
                                {status.behind > 0 && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                        ↓ {status.behind} to pull
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={handlePull}
                                disabled={loading}
                                className="flex-1 px-3 py-1.5 text-xs bg-black/30 hover:bg-white/5 text-gray-300 rounded transition-colors disabled:opacity-50"
                            >
                                Pull {status.behind > 0 && `(${status.behind})`}
                            </button>
                            <button
                                onClick={handlePush}
                                disabled={loading || status.ahead === 0}
                                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-50 ${
                                    status.ahead > 0
                                        ? 'bg-orange-600 hover:bg-orange-500 text-white'
                                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                                }`}
                            >
                                Push {status.ahead > 0 && `(${status.ahead})`}
                            </button>
                        </div>
                    </div>
                )}

                {/* Commit Section */}
                <div className="p-4 border-b border-white/10">
                    <textarea
                        value={commitMessage}
                        onChange={e => setCommitMessage(e.target.value)}
                        placeholder="Commit message (⌘+Enter to commit)"
                        onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                handleCommit()
                            }
                        }}
                        className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                        rows={3}
                    />
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={handleCommit}
                            disabled={loading || !commitMessage.trim() || !status || status.staged.length === 0}
                            className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <GitCommit size={16} />
                            Commit ({status?.staged.length || 0})
                        </button>
                        <button
                            onClick={handleCommitAndPush}
                            disabled={loading || !commitMessage.trim() || !status || status.staged.length === 0}
                            className="flex-1 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Upload size={16} />
                            Commit & Push
                        </button>
                    </div>
                </div>

                {/* Changes List */}
                <div className="flex-1 overflow-y-auto">
                    {status && (
                        <>
                            {/* Stage All Button */}
                            {(status.modified.length > 0 || status.untracked.length > 0) && (
                                <div className="p-4 pb-0">
                                    <button
                                        onClick={handleStageAllChanges}
                                        disabled={loading}
                                        className="w-full px-3 py-2 text-sm bg-white/5 hover:bg-white/10 text-blue-400 border border-blue-500/30 rounded transition-colors flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle2 size={16} />
                                        Stage All Changes ({status.modified.length + status.untracked.length})
                                    </button>
                                </div>
                            )}
                            {/* Merge in Progress Banner */}
                            {status.isMerging && (
                                <div className="mx-4 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                    <div className="flex items-center gap-2 text-amber-400">
                                        <GitMerge size={16} />
                                        <span className="text-sm font-medium">Merge in Progress</span>
                                    </div>
                                    <p className="text-xs text-amber-300/70 mt-1">
                                        {status.conflicted && status.conflicted.length > 0
                                            ? 'Resolve conflicts, stage files, then commit to complete the merge.'
                                            : 'All conflicts resolved! Stage changes and commit to complete the merge.'}
                                    </p>
                                </div>
                            )}

                            {/* Conflicted Files */}
                            {status.conflicted && status.conflicted.length > 0 && (
                                <div className="p-4 border-b border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1">
                                            <AlertTriangle size={12} />
                                            Conflicts ({status.conflicted.length})
                                        </h3>
                                        <button
                                            onClick={() => handleStageAll(status.conflicted)}
                                            className="text-xs text-blue-400 hover:text-blue-300"
                                        >
                                            Stage All (Resolved)
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {status.conflicted.map(file => (
                                            <div
                                                key={file}
                                                className="group flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors bg-red-500/5 border border-red-500/20"
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <AlertTriangle size={14} className="text-red-400 shrink-0" />
                                                    <span className="text-sm text-gray-300 truncate">{file}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleStage(file)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                                                    title="Mark as resolved"
                                                >
                                                    <Check size={12} className="text-green-400" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Edit files to resolve conflicts, then click ✓ to mark as resolved.
                                    </p>
                                </div>
                            )}

                            {/* Staged Changes */}
                            {status.staged.length > 0 && (
                                <div className="p-4 border-b border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                            Staged Changes ({status.staged.length})
                                        </h3>
                                        <button
                                            onClick={() => handleUnstageAll()}
                                            className="text-xs text-blue-400 hover:text-blue-300"
                                        >
                                            Unstage All
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {status.staged.map(file => (
                                            <div
                                                key={file}
                                                className="group flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText size={14} className="text-green-400 shrink-0" />
                                                    <span className="text-sm text-gray-300 truncate">{file}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleUnstage(file)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                                                >
                                                    <X size={12} className="text-gray-400" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Modified Files */}
                            {status.modified.length > 0 && (
                                <div className="p-4 border-b border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                            Changes ({status.modified.length})
                                        </h3>
                                        <button
                                            onClick={() => handleStageAll(status.modified)}
                                            className="text-xs text-blue-400 hover:text-blue-300"
                                        >
                                            Stage All
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {status.modified.map(file => (
                                            <div
                                                key={file}
                                                className="group flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText size={14} className="text-yellow-400 shrink-0" />
                                                    <span className="text-sm text-gray-300 truncate">{file}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleStage(file)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                                                >
                                                    <Check size={12} className="text-gray-400" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Untracked Files */}
                            {status.untracked.length > 0 && (
                                <div className="p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                            Untracked ({status.untracked.length})
                                        </h3>
                                        <button
                                            onClick={() => handleStageAll(status.untracked)}
                                            className="text-xs text-blue-400 hover:text-blue-300"
                                        >
                                            Stage All
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {status.untracked.map(file => (
                                            <div
                                                key={file}
                                                className="group flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText size={14} className="text-gray-500 shrink-0" />
                                                    <span className="text-sm text-gray-300 truncate">{file}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleStage(file)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                                                >
                                                    <Check size={12} className="text-gray-400" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Commit History */}
                            {commits.length > 0 && (
                                <div className="p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                            History ({commits.length})
                                        </h3>
                                        <button
                                            onClick={() => setShowHistory(!showHistory)}
                                            className="text-xs text-blue-400 hover:text-blue-300"
                                        >
                                            {showHistory ? 'Hide' : 'Show'}
                                        </button>
                                    </div>

                                    {showHistory && (
                                        <div className="space-y-2 mt-2">
                                            {commits.map((commit, index) => (
                                                <div
                                                    key={commit.hash}
                                                    className="group p-3 bg-black/20 border border-white/5 rounded hover:border-white/10 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-white font-medium truncate">
                                                                {commit.message}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs text-gray-500">{commit.author}</span>
                                                                <span className="text-xs text-gray-600">•</span>
                                                                <span className="text-xs text-gray-500 font-mono">{commit.hash.slice(0, 7)}</span>
                                                            </div>
                                                            <p className="text-xs text-gray-600 mt-1">
                                                                {new Date(commit.date).toLocaleString('ko-KR')}
                                                            </p>
                                                        </div>
                                                        {index > 0 && (
                                                            <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                                                                <button
                                                                    onClick={() => handleReset(commit.hash, false)}
                                                                    className="px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded transition-colors"
                                                                    title="Soft reset (keep changes)"
                                                                >
                                                                    Restore
                                                                </button>
                                                                <button
                                                                    onClick={() => handleReset(commit.hash, true)}
                                                                    className="px-2 py-1 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded transition-colors"
                                                                    title="Hard reset (delete changes)"
                                                                >
                                                                    Reset
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {status.modified.length === 0 && status.staged.length === 0 && status.untracked.length === 0 && (!status.conflicted || status.conflicted.length === 0) && (
                                <div className="p-8 text-center text-gray-500">
                                    <Check size={32} className="mx-auto mb-2 text-gray-600" />
                                    <p className="text-sm">No changes</p>
                                </div>
                            )}
                        </>
                    )}

                    {!status && !loading && (
                        <div className="p-8 text-center text-gray-500">
                            <p className="text-sm">Not a git repository</p>
                        </div>
                    )}

                    {loading && !status && (
                        <div className="p-8 text-center text-gray-500">
                            <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
                            <p className="text-sm">Loading...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
