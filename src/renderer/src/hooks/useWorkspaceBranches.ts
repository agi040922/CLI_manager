import { useState, useEffect } from 'react'
import { Workspace } from '../../../shared/types'

interface BranchInfo {
    current: string
    all: string[]
    worktreeBranches: string[]  // Branches checked out in worktrees
}

/**
 * 워크스페이스별 브랜치 정보를 관리하는 커스텀 훅
 * worktreeBranches: worktree로 체크아웃된 브랜치 목록 (선택 불가)
 */
export function useWorkspaceBranches(workspaces: Workspace[]) {
    const [workspaceBranches, setWorkspaceBranches] = useState<Map<string, BranchInfo>>(new Map())

    useEffect(() => {
        const loadBranches = async () => {
            const branchMap = new Map<string, BranchInfo>()

            for (const workspace of workspaces) {
                try {
                    const branches = await window.api.gitListBranches(workspace.path) as { current: string; all: string[]; branches: any; worktreeBranches?: string[] } | null
                    if (branches) {
                        branchMap.set(workspace.id, {
                            current: branches.current,
                            all: branches.all.filter((b: string) => !b.startsWith('remotes/')),
                            worktreeBranches: branches.worktreeBranches ?? []
                        })
                    }
                } catch (err) {
                    // Workspace is not a git repo or error occurred
                    console.debug(`Could not load branches for ${workspace.name}`)
                }
            }

            setWorkspaceBranches(branchMap)
        }

        loadBranches()
    }, [workspaces])

    return { workspaceBranches, setWorkspaceBranches }
}
