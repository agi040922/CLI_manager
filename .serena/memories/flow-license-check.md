# flow:license-check
<!-- Updated: 2026-01-30 -->

## What
License verification flow from user action to feature gate enforcement.

## Key Files
- src/main/LicenseManager.ts - canUse* methods, plan limit checks
- src/main/index.ts - License check before IPC handler execution
- src/shared/types.ts - PLAN_LIMITS, FeatureLimits
- src/renderer/src/App.tsx - UPGRADE_REQUIRED error handling
- src/renderer/src/components/LicenseVerification/index.tsx - Upgrade dialog

## How It Works
- **Check Flow**:
  1. User triggers gated action (add workspace, add worktree, etc.)
  2. IPC handler in index.ts calls LicenseManager.canAddWorkspace(count) or similar
  3. LicenseManager checks cached license -> determines PlanType -> looks up PLAN_LIMITS
  4. If limit exceeded: returns `{ success: false, errorType: 'UPGRADE_REQUIRED' }`
  5. Renderer receives error, shows upgrade dialog pointing to https://solhun.com
- **Validation Flow**:
  1. On app launch: `LicenseManager.validate()` called
  2. Sends cached key+instanceId to Lemon Squeezy API
  3. Updates local cache with response (status, expiry)
  4. On network failure: uses cached data with local expiry check
- **Plan Limits** (from PLAN_LIMITS):
  - Free: 2 workspaces, 5 sessions/workspace, 3 templates, no worktree, no split view
  - Pro (monthly/annual/lifetime): all unlimited, all features enabled

## Entry Points
- App launch triggers validation
- Every gated IPC handler triggers limit check

## Gotchas
- Network errors don't block app usage - cached license used
- Lifetime plans have no expiry date (expiresAt is null)
- Feature gate is in main process, not renderer (can't bypass)
- Adding new premium feature requires changes in 5 places (see CLAUDE.md)

## See Also
- module:license-manager
- module:shared-types
- module:main-process
