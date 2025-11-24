import { useState, useEffect } from 'react'
import { Workspace } from '../../../shared/types'

/**
 * 워크스페이스별 브랜치 정보를 관리하는 커스텀 훅
 */
export function useWorkspaceBranches(workspaces: Workspace[]) {
    const [workspaceBranches, setWorkspaceBranches] = useState<Map<string, { current: string; all: string[] }>>(new Map())

    useEffect(() => {
        const loadBranches = async () => {
            const branchMap = new Map<string, { current: string; all: string[] }>()

            for (const workspace of workspaces) {
                try {
                    const branches = await window.api.gitListBranches(workspace.path)
                    if (branches) {
                        branchMap.set(workspace.id, {
                            current: branches.current,
                            all: branches.all.filter((b: string) => !b.startsWith('remotes/'))
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
