import React, { useState, useEffect, useRef } from 'react'
import { X, File, FileText, Search as SearchIcon } from 'lucide-react'

interface FileSearchProps {
    isOpen: boolean
    onClose: () => void
    workspacePath: string | null
    onFileSelect: (filePath: string, line?: number) => void
    initialMode?: 'files' | 'content'
}

interface FileResult {
    path: string
    relativePath: string
    name: string
}

interface ContentResult {
    path: string
    relativePath: string
    line: number
    column: number
    text: string
    matches: Array<{ start: number; end: number }>
}

export function FileSearch({ isOpen, onClose, workspacePath, onFileSelect, initialMode = 'files' }: FileSearchProps) {
    const [searchMode, setSearchMode] = useState<'files' | 'content'>(initialMode)
    const [searchQuery, setSearchQuery] = useState('')
    const [fileResults, setFileResults] = useState<FileResult[]>([])
    const [contentResults, setContentResults] = useState<ContentResult[]>([])
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [isSearching, setIsSearching] = useState(false)
    const [searchMethod, setSearchMethod] = useState<string>('')
    const inputRef = useRef<HTMLInputElement>(null)
    const resultsRef = useRef<HTMLDivElement>(null)

    // Focus input when opened (keep search query and results)
    useEffect(() => {
        if (isOpen) {
            setSearchMode(initialMode)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [isOpen, initialMode])

    // Search when query or mode changes
    useEffect(() => {
        if (!workspacePath || !searchQuery.trim()) {
            setFileResults([])
            setContentResults([])
            return
        }

        const performSearch = async () => {
            setIsSearching(true)
            try {
                if (searchMode === 'files') {
                    const result = await window.api.searchFiles(workspacePath, searchQuery)
                    if (result.success) {
                        setFileResults(result.files)
                        setSelectedIndex(0)
                    }
                } else {
                    const result = await window.api.searchContent(workspacePath, searchQuery)
                    if (result.success) {
                        setContentResults(result.results)
                        setSearchMethod(result.method || '')
                        setSelectedIndex(0)
                    }
                }
            } catch (error) {
                console.error('Search error:', error)
            } finally {
                setIsSearching(false)
            }
        }

        const debounce = setTimeout(performSearch, 200)
        return () => clearTimeout(debounce)
    }, [searchQuery, searchMode, workspacePath])

    // Scroll selected item into view
    useEffect(() => {
        if (resultsRef.current) {
            const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' })
            }
        }
    }, [selectedIndex])

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        const results = searchMode === 'files' ? fileResults : contentResults

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault()
            if (searchMode === 'files') {
                handleFileSelect(fileResults[selectedIndex])
            } else {
                handleContentSelect(contentResults[selectedIndex])
            }
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }

    const handleFileSelect = (file: FileResult) => {
        onFileSelect(file.path)
        // Keep modal open so user can open multiple files
    }

    const handleContentSelect = (result: ContentResult) => {
        onFileSelect(result.path, result.line)
        // Keep modal open so user can open multiple files
    }

    // Truncate text around match and adjust match positions
    const truncateAroundMatch = (text: string, matches: Array<{ start: number; end: number }>, contextLength: number = 60) => {
        if (!matches.length) return { text, matches }

        const firstMatch = matches[0]
        const matchStart = firstMatch.start
        const matchEnd = firstMatch.end

        // Calculate visible range around the first match
        let visibleStart = Math.max(0, matchStart - contextLength)
        let visibleEnd = Math.min(text.length, matchEnd + contextLength)

        // Try to expand to word boundaries
        while (visibleStart > 0 && text[visibleStart] !== ' ' && matchStart - visibleStart < contextLength + 20) {
            visibleStart--
        }
        while (visibleEnd < text.length && text[visibleEnd] !== ' ' && visibleEnd - matchEnd < contextLength + 20) {
            visibleEnd++
        }

        let truncated = text.substring(visibleStart, visibleEnd)

        // Calculate leading spaces before trim (needed for offset calculation)
        const leadingSpaces = truncated.length - truncated.trimStart().length
        truncated = truncated.trim()

        // Add ellipsis
        const hasPrefix = visibleStart > 0
        const hasSuffix = visibleEnd < text.length
        if (hasPrefix) truncated = '...' + truncated
        if (hasSuffix) truncated = truncated + '...'

        // Adjust match positions for truncated text
        // Original position - (visibleStart + leadingSpaces removed by trim) + ("..." prefix length)
        const offset = visibleStart + leadingSpaces
        const adjustedMatches = matches
            .filter(m => m.start >= visibleStart && m.end <= visibleEnd)
            .map(m => ({
                start: m.start - offset + (hasPrefix ? 3 : 0),
                end: m.end - offset + (hasPrefix ? 3 : 0)
            }))

        return { text: truncated, matches: adjustedMatches }
    }

    const highlightMatches = (text: string, matches: Array<{ start: number; end: number }>) => {
        if (!matches.length) return text

        const parts: React.ReactNode[] = []
        let lastIndex = 0

        matches.forEach(({ start, end }, i) => {
            // Add text before match
            if (start > lastIndex) {
                parts.push(text.substring(lastIndex, start))
            }
            // Add highlighted match
            parts.push(
                <span key={i} className="bg-yellow-500/30 text-yellow-200">
                    {text.substring(start, end)}
                </span>
            )
            lastIndex = end
        })

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex))
        }

        return parts
    }

    if (!isOpen) return null

    const results = searchMode === 'files' ? fileResults : contentResults

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Search Modal */}
            <div className="relative w-full max-w-3xl glass-panel rounded-lg shadow-2xl overflow-hidden">
                {/* Search Input & Mode Toggle */}
                <div className="flex items-center gap-3 p-4 border-b border-white/10">
                    <SearchIcon size={16} className="text-gray-400" />

                    {/* Mode Toggle */}
                    <div className="flex bg-white/5 rounded p-1">
                        <button
                            onClick={() => setSearchMode('files')}
                            className={`px-3 py-1 rounded text-xs transition-colors ${
                                searchMode === 'files'
                                    ? 'bg-blue-500 text-white'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            <File size={12} className="inline mr-1" />
                            Files
                        </button>
                        <button
                            onClick={() => setSearchMode('content')}
                            className={`px-3 py-1 rounded text-xs transition-colors ${
                                searchMode === 'content'
                                    ? 'bg-blue-500 text-white'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            <FileText size={12} className="inline mr-1" />
                            Content
                        </button>
                    </div>

                    <input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={searchMode === 'files' ? 'Search files...' : 'Search in files...'}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-gray-500"
                    />

                    {isSearching && (
                        <div className="text-xs text-gray-500">Searching...</div>
                    )}

                    {searchMethod && (
                        <div className="text-xs text-gray-500">
                            ({searchMethod})
                        </div>
                    )}

                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                        <X size={16} className="text-gray-400" />
                    </button>
                </div>

                {/* Results */}
                <div
                    ref={resultsRef}
                    className="max-h-96 overflow-y-auto"
                >
                    {!searchQuery && (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            {searchMode === 'files'
                                ? 'Type to search for files...'
                                : 'Type to search file contents...'}
                        </div>
                    )}

                    {searchQuery && results.length === 0 && !isSearching && (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            No results found
                        </div>
                    )}

                    {/* File Results */}
                    {searchMode === 'files' && fileResults.map((file, index) => (
                        <button
                            key={file.path}
                            onClick={() => handleFileSelect(file)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                index === selectedIndex
                                    ? 'bg-blue-500/20 border-l-2 border-blue-500'
                                    : 'hover:bg-white/5 border-l-2 border-transparent'
                            }`}
                        >
                            <File size={14} className="text-gray-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-white truncate">
                                    {file.name}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                    {file.relativePath}
                                </div>
                            </div>
                        </button>
                    ))}

                    {/* Content Results */}
                    {searchMode === 'content' && contentResults.map((result, index) => {
                        const { text, matches } = truncateAroundMatch(result.text, result.matches)
                        return (
                            <button
                                key={`${result.path}:${result.line}`}
                                onClick={() => handleContentSelect(result)}
                                className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                                    index === selectedIndex
                                        ? 'bg-blue-500/20 border-l-2 border-blue-500'
                                        : 'hover:bg-white/5 border-l-2 border-transparent'
                                }`}
                            >
                                <FileText size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs text-gray-500 truncate mb-1">
                                        {result.relativePath}:{result.line}
                                    </div>
                                    <div className="text-sm text-white font-mono">
                                        {highlightMatches(text, matches)}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* Footer - Keyboard hints */}
                <div className="px-4 py-2 border-t border-white/10 flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-white/10 rounded">↑↓</kbd>
                        <span>Navigate</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-white/10 rounded">Enter</kbd>
                        <span>Open</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-white/10 rounded">Esc</kbd>
                        <span>Close</span>
                    </div>
                    <div className="flex-1"></div>
                    <div className="text-xs text-gray-600">
                        {searchMode === 'files' ? 'Cmd+P' : 'Cmd+Shift+F'}
                    </div>
                </div>
            </div>
        </div>
    )
}
