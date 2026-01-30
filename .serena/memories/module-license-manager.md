# module:license-manager
<!-- Updated: 2026-01-30 -->

## What
Manages license lifecycle with Lemon Squeezy API: activation, validation, deactivation, and feature limit enforcement.

## Key Files
- src/main/LicenseManager.ts - Lemon Squeezy API, plan checks (~415 lines)
- src/shared/types.ts - PLAN_LIMITS constant, FeatureLimits interface

## How It Works
- `activate(key)` calls Lemon Squeezy activate endpoint with instance_name (hostname-username-appname)
- `validate()` calls Lemon Squeezy validate endpoint with cached license key + instance ID
- Plan type determined by variant name: "monthly", "annual"/"yearly", "lifetime"
- Legacy licenses (no variant) treated as "lifetime"
- Feature limits defined in PLAN_LIMITS: Free (2 ws, 5 sessions, 3 templates, no worktree/split) vs Pro (unlimited)
- `canAddWorkspace/Session/Template(count)` checks current count against plan limit (-1 = unlimited)
- `canUseWorktree()` and `canUseSplitView()` check boolean flags
- Offline validation uses cached license data with local expiry check
- `migrateLegacyLicense()` upgrades old licenses to variant format

## Entry Points
- IPC: `license-activate`, `license-validate`, `license-deactivate`, `license-check`, `license-get-info`
- Called by index.ts before workspace/session/template creation

## Gotchas
- Network errors don't block access - cached license continues working
- `daysUntilExpiry` only set for expiring licenses (undefined for lifetime)
- `-1` in limits means unlimited
- Feature gate errors always use `errorType: 'UPGRADE_REQUIRED'`
- Instance name format: `{hostname}-{username}-climanger`

## See Also
- module:main-process
- flow:license-check
