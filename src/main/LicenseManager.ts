import { app } from 'electron'
import {
    LicenseData,
    LicenseInfo,
    PlanType,
    FeatureLimits,
    PLAN_LIMITS,
    IPCResult
} from '../shared/types'

// Use any type for store to avoid complex generic issues
type LicenseStore = {
    get: (key: string) => any
    set: (key: string, value: any) => void
}

// Lemon Squeezy API response types
interface LemonSqueezyLicenseKey {
    id: number
    status: string
    key: string
    activation_limit: number
    activation_usage: number
    created_at: string
    expires_at: string | null
}

interface LemonSqueezyInstance {
    id: string
    name: string
    created_at: string
}

interface LemonSqueezyMeta {
    store_id: number
    order_id: number
    order_item_id: number
    product_id: number
    product_name: string
    variant_id: number
    variant_name: string
    customer_id: number
    customer_name: string
    customer_email: string
}

interface LemonSqueezyActivateResponse {
    activated: boolean
    error: string | null
    license_key: LemonSqueezyLicenseKey
    instance: LemonSqueezyInstance
    meta: LemonSqueezyMeta
}

interface LemonSqueezyValidateResponse {
    valid: boolean
    error: string | null
    license_key: LemonSqueezyLicenseKey
    instance: LemonSqueezyInstance | null
    meta: LemonSqueezyMeta
}

export class LicenseManager {
    private store: LicenseStore

    constructor(store: LicenseStore) {
        this.store = store
    }

    // Get unique instance name for this machine
    private getInstanceName(): string {
        const os = require('os')
        const hostname = os.hostname()
        const username = os.userInfo().username
        return `${hostname}-${username}-${app.getName()}`
    }

    // Determine plan type from variant name or ID
    private getPlanTypeFromVariant(variantName?: string, variantId?: number): PlanType {
        if (!variantName && !variantId) return 'free'

        const name = (variantName || '').toLowerCase()

        // Check by variant name
        if (name.includes('monthly') || name.includes('month')) return 'monthly'
        if (name.includes('annual') || name.includes('yearly') || name.includes('year')) return 'annual'
        if (name.includes('lifetime') || name.includes('life')) return 'lifetime'

        // Legacy licenses (before variant system) are treated as lifetime
        // This ensures existing customers keep their access
        return 'lifetime'
    }

    // Check if license is expired
    private isLicenseExpired(license: LicenseData): boolean {
        if (!license.expiresAt) return false // Lifetime license
        const expiryDate = new Date(license.expiresAt)
        return expiryDate < new Date()
    }

    // Calculate days until expiry
    private getDaysUntilExpiry(license: LicenseData): number | undefined {
        if (!license.expiresAt) return undefined // Lifetime
        const expiryDate = new Date(license.expiresAt)
        const now = new Date()
        const diffTime = expiryDate.getTime() - now.getTime()
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    }

    // Get current license info
    getLicenseInfo(): LicenseInfo {
        const license = this.store.get('license') as LicenseData | null

        if (!license) {
            return {
                planType: 'free',
                license: null,
                limits: PLAN_LIMITS.free,
                isExpired: false,
            }
        }

        const isExpired = this.isLicenseExpired(license)
        const planType = isExpired ? 'free' : this.getPlanTypeFromVariant(license.variantName, license.variantId)

        return {
            planType: isExpired ? 'free' : planType,
            license,
            limits: isExpired ? PLAN_LIMITS.free : PLAN_LIMITS[planType],
            isExpired,
            daysUntilExpiry: this.getDaysUntilExpiry(license),
        }
    }

    // Check if a specific feature is enabled
    canUseFeature(feature: keyof FeatureLimits): boolean {
        const info = this.getLicenseInfo()
        const value = info.limits[feature]
        return typeof value === 'boolean' ? value : true
    }

    // Check if user can add more workspaces
    canAddWorkspace(currentCount: number): { allowed: boolean; reason?: string } {
        const info = this.getLicenseInfo()
        const limit = info.limits.maxWorkspaces

        if (limit === -1) return { allowed: true }

        if (currentCount >= limit) {
            return {
                allowed: false,
                reason: `Free plan allows up to ${limit} workspaces. Upgrade to Pro for unlimited workspaces.`
            }
        }

        return { allowed: true }
    }

    // Check if user can add more sessions to a workspace
    canAddSession(currentSessionCount: number): { allowed: boolean; reason?: string } {
        const info = this.getLicenseInfo()
        const limit = info.limits.maxSessionsPerWorkspace

        if (limit === -1) return { allowed: true }

        if (currentSessionCount >= limit) {
            return {
                allowed: false,
                reason: `Free plan allows up to ${limit} sessions per workspace. Upgrade to Pro for unlimited sessions.`
            }
        }

        return { allowed: true }
    }

    // Check if user can add more templates
    canAddTemplate(currentCount: number): { allowed: boolean; reason?: string } {
        const info = this.getLicenseInfo()
        const limit = info.limits.maxTemplates

        if (limit === -1) return { allowed: true }

        if (currentCount >= limit) {
            return {
                allowed: false,
                reason: `Free plan allows up to ${limit} templates. Upgrade to Pro for unlimited templates.`
            }
        }

        return { allowed: true }
    }

    // Check if worktree feature is available
    canUseWorktree(): { allowed: boolean; reason?: string } {
        const info = this.getLicenseInfo()

        if (!info.limits.worktreeEnabled) {
            return {
                allowed: false,
                reason: 'Git Worktree is a Pro feature. Upgrade to unlock worktree management.'
            }
        }

        return { allowed: true }
    }

    // Activate license with Lemon Squeezy
    async activate(licenseKey: string): Promise<IPCResult<LicenseData>> {
        try {
            const instanceName = this.getInstanceName()
            console.log('[License] Activating with instance:', instanceName)

            const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    license_key: licenseKey,
                    instance_name: instanceName
                }).toString()
            })

            const data: LemonSqueezyActivateResponse = await response.json()
            console.log('[License] Activate response:', JSON.stringify(data, null, 2))

            if (data.activated) {
                const licenseData: LicenseData = {
                    licenseKey: licenseKey,
                    instanceId: data.instance?.id || '',
                    activatedAt: new Date().toISOString(),
                    customerEmail: data.meta?.customer_email,
                    customerName: data.meta?.customer_name,
                    productName: data.meta?.product_name,
                    // New fields for plan support
                    variantId: data.meta?.variant_id,
                    variantName: data.meta?.variant_name,
                    expiresAt: data.license_key?.expires_at,
                    status: data.license_key?.status as any,
                    productId: data.meta?.product_id,
                }
                console.log('[License] Plan type:', this.getPlanTypeFromVariant(licenseData.variantName, licenseData.variantId))

                this.store.set('license', licenseData)
                return { success: true, data: licenseData }
            } else {
                console.log('[License] Activation failed:', data.error)
                return {
                    success: false,
                    error: data.error || 'License activation failed',
                    errorType: 'UNKNOWN_ERROR'
                }
            }
        } catch (error: any) {
            console.error('License activation error:', error)
            return {
                success: false,
                error: error.message || 'Network error during activation',
                errorType: 'NETWORK_ERROR'
            }
        }
    }

    // Validate existing license
    async validate(): Promise<IPCResult<LicenseData>> {
        try {
            const savedLicense = this.store.get('license') as LicenseData | null

            if (!savedLicense) {
                return {
                    success: false,
                    error: 'No license found',
                    errorType: 'UNKNOWN_ERROR'
                }
            }

            const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    license_key: savedLicense.licenseKey,
                    instance_id: savedLicense.instanceId
                }).toString()
            })

            const data: LemonSqueezyValidateResponse = await response.json()

            if (data.valid) {
                // Update license with latest info from Lemon Squeezy
                const updatedLicense: LicenseData = {
                    ...savedLicense,
                    expiresAt: data.license_key?.expires_at,
                    status: data.license_key?.status as any,
                    variantId: data.meta?.variant_id || savedLicense.variantId,
                    variantName: data.meta?.variant_name || savedLicense.variantName,
                    productId: data.meta?.product_id || savedLicense.productId,
                }

                this.store.set('license', updatedLicense)
                return { success: true, data: updatedLicense }
            } else {
                // License is no longer valid
                this.store.set('license', null)
                return {
                    success: false,
                    error: data.error || 'License is no longer valid',
                    errorType: 'LICENSE_EXPIRED'
                }
            }
        } catch (error: any) {
            console.error('License validation error:', error)
            // On network error, allow cached license (offline mode)
            const savedLicense = this.store.get('license') as LicenseData | null
            if (savedLicense) {
                // Check local expiry for offline validation
                if (this.isLicenseExpired(savedLicense)) {
                    return {
                        success: false,
                        error: 'License has expired',
                        errorType: 'LICENSE_EXPIRED'
                    }
                }
                return { success: true, data: savedLicense }
            }
            return {
                success: false,
                error: error.message || 'Network error during validation',
                errorType: 'NETWORK_ERROR'
            }
        }
    }

    // Deactivate license
    async deactivate(): Promise<IPCResult<void>> {
        try {
            const savedLicense = this.store.get('license') as LicenseData | null

            if (!savedLicense) {
                console.log('[License] No license to deactivate')
                return { success: true }
            }

            console.log('[License] Deactivating instance:', savedLicense.instanceId)

            const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    license_key: savedLicense.licenseKey,
                    instance_id: savedLicense.instanceId
                }).toString()
            })

            const data = await response.json()
            console.log('[License] Deactivate response:', JSON.stringify(data, null, 2))

            // Clear local license regardless of API response
            this.store.set('license', null)
            return { success: true }
        } catch (error: any) {
            console.error('License deactivation error:', error)
            // Clear local license even on network error
            this.store.set('license', null)
            return { success: true }
        }
    }

    // Check if license exists (without full validation)
    hasLicense(): boolean {
        const savedLicense = this.store.get('license') as LicenseData | null
        return savedLicense !== null
    }

    // Migrate legacy licenses (add variant info if missing)
    async migrateLegacyLicense(): Promise<void> {
        const license = this.store.get('license') as LicenseData | null

        if (license && !license.variantId) {
            console.log('Migrating legacy license...')
            try {
                // Re-validate to get variant info
                await this.validate()
            } catch (error) {
                console.error('Failed to migrate legacy license:', error)
                // If migration fails, treat as lifetime (graceful fallback)
                const updatedLicense: LicenseData = {
                    ...license,
                    variantName: 'Lifetime (Legacy)',
                }
                this.store.set('license', updatedLicense)
            }
        }
    }
}
