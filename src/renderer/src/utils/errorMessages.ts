import { ErrorType } from '../../../shared/types'

export function getErrorMessage(errorType?: ErrorType, originalError?: string): string {
    switch (errorType) {
        case 'GIT_NOT_FOUND':
            return 'Git is not installed. Please install Git.'
        case 'NOT_A_REPO':
            return 'This workspace is not a Git repository.'
        case 'BRANCH_EXISTS':
            return 'Branch already exists. Please use a different name.'
        case 'INVALID_BRANCH_NAME':
            return 'Invalid branch name.'
        case 'WORKTREE_EXISTS':
            return 'Worktree already exists at this path.'
        case 'GH_CLI_NOT_FOUND':
            return 'GitHub CLI (gh) is not installed. Please install it and try again.'
        case 'GH_NOT_AUTHENTICATED':
            return 'Not authenticated with GitHub. Please login in settings.'
        case 'NETWORK_ERROR':
            return 'Network error. Please check your internet connection.'
        default:
            return `An error occurred: ${originalError || 'Unknown error'}`
    }
}
