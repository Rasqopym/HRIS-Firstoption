/**
 * Safe LocalStorage Utilities with Automatic Quota Management & Self-Healing Pruning
 * Prevents QuotaExceededError crashes across all browsers and devices.
 */

// Keys that must NEVER be deleted during quota cleanup (Auth & Critical Settings)
const PROTECTED_KEY_PREFIXES = [
  'sb-', // Supabase Auth tokens & sessions
  'hris_authenticated_role',
  'hris_view_role',
  'hris_active_page',
  'hris_company_settings',
  'hris_custom_holidays',
  'hris_last_active_',
]

function isProtectedKey(key: string): boolean {
  return PROTECTED_KEY_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix))
}

/**
 * Calculates approximate size in bytes of an item in localStorage
 */
function getItemSizeBytes(key: string, value: string): number {
  return (key.length + value.length) * 2
}

/**
 * Proactively purges heavy, non-critical cache entries when localStorage is getting full
 */
export function pruneStorageQuota(): void {
  try {
    const keysToRemove: string[] = []
    const heavyKeys: { key: string; size: number }[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue

      if (isProtectedKey(key)) continue

      const val = localStorage.getItem(key) || ''
      const size = getItemSizeBytes(key, val)

      // Always purge old chat message caches first (can be re-fetched from Supabase)
      if (key.startsWith('hris_messages_cache_')) {
        keysToRemove.push(key)
        continue
      }

      // Purge large caches > 50KB
      if (size > 50 * 1024) {
        heavyKeys.push({ key, size })
      }
    }

    // Remove chat caches
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k) } catch {}
    })

    // Sort remaining heavy keys by size descending and remove largest
    heavyKeys.sort((a, b) => b.size - a.size)
    heavyKeys.forEach(item => {
      try { localStorage.removeItem(item.key) } catch {}
    })

    console.info(`[StorageHelper] Pruned ${keysToRemove.length + heavyKeys.length} non-critical cache items to free quota.`)
  } catch (e) {
    console.warn('[StorageHelper] Error during storage pruning:', e)
  }
}

/**
 * Safely sets an item in localStorage.
 * If quota is exceeded, automatically prunes non-critical cache entries and retries.
 * Never throws an uncaught error.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err: any) {
    // Check for QuotaExceededError
    const isQuotaError =
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014 ||
      (err.message && err.message.toLowerCase().includes('quota'))

    if (isQuotaError) {
      console.warn(`[StorageHelper] Quota exceeded while setting '${key}'. Pruning cache and retrying...`)
      pruneStorageQuota()
      try {
        localStorage.setItem(key, value)
        return true
      } catch (retryErr) {
        console.warn(`[StorageHelper] Could not persist key '${key}' after pruning. Operation safely bypassed.`)
        return false
      }
    }

    console.warn(`[StorageHelper] Error setting key '${key}':`, err)
    return false
  }
}

/**
 * Safely retrieves an item from localStorage.
 */
export function safeGetItem(key: string, fallback: string | null = null): string | null {
  try {
    const val = localStorage.getItem(key)
    return val !== null ? val : fallback
  } catch (e) {
    console.warn(`[StorageHelper] Error getting key '${key}':`, e)
    return fallback
  }
}

/**
 * Safely removes an item from localStorage.
 */
export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    console.warn(`[StorageHelper] Error removing key '${key}':`, e)
  }
}

/**
 * Sanitizes an object before writing to localStorage by removing massive Base64 strings.
 * Keeps cache size microscopic while preserving metadata and structure.
 */
export function sanitizeForCache<T>(data: T): T {
  try {
    const json = JSON.stringify(data, (key, value) => {
      // If a property is a Base64 data URL (> 500 chars), replace with placeholder
      if (typeof value === 'string' && value.startsWith('data:image/') && value.length > 500) {
        return '[data-image-attachment]'
      }
      return value
    })
    return JSON.parse(json)
  } catch {
    return data
  }
}

/**
 * Auto-cleanup check on application startup.
 * If total localStorage size exceeds 2.5MB, proactively cleans old chat & task bloat.
 */
export function autoPruneStorage(): void {
  try {
    let totalBytes = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) {
        const v = localStorage.getItem(k) || ''
        totalBytes += getItemSizeBytes(k, v)
      }
    }

    // 2.5 MB threshold (typical browser quota is 5MB)
    if (totalBytes > 2.5 * 1024 * 1024) {
      console.info(`[StorageHelper] Total localStorage size is ${(totalBytes / (1024 * 1024)).toFixed(2)} MB. Pruning non-essential caches...`)
      pruneStorageQuota()
    }
  } catch (e) {}
}
