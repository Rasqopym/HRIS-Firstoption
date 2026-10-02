import { supabase } from './supabase'

/**
 * Extracts an authentication parameter from window.location.search or window.location.hash.
 * Handles standard query strings (?k=v), hash params (#k=v), and compound URLs like /#type=recovery?code=xxx.
 */
export function getAuthParam(paramName: string): string | null {
  try {
    // 1. Check window.location.search
    const searchParams = new URLSearchParams(window.location.search)
    const sVal = searchParams.get(paramName)
    if (sVal) return sVal

    // 2. Check window.location.hash
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return null

    // Hash might contain '?' if query params were appended after a hash route
    const parts = hash.split('?')
    for (const part of parts) {
      const hashParams = new URLSearchParams(part)
      const hVal = hashParams.get(paramName)
      if (hVal) return hVal
    }

    // Direct hash params
    const directParams = new URLSearchParams(hash)
    const dVal = directParams.get(paramName)
    if (dVal) return dVal
  } catch (e) {
    console.error('Error parsing auth param:', e)
  }
  return null
}

/**
 * Checks whether the current URL indicates a password recovery attempt.
 */
export function isPasswordRecoveryUrl(): boolean {
  try {
    const type = getAuthParam('type')
    const code = getAuthParam('code')
    const tokenHash = getAuthParam('token_hash')
    const accessToken = getAuthParam('access_token')
    const hash = window.location.hash || ''
    const search = window.location.search || ''

    if (type === 'recovery') return true
    if (Boolean(code)) return true
    if (Boolean(tokenHash)) return true
    if (Boolean(accessToken) && (hash.includes('recovery') || search.includes('recovery'))) return true
    if (hash.includes('type=recovery') || search.includes('type=recovery')) return true
  } catch (e) {}
  return false
}

/**
 * Checks whether the URL contains an error payload from Supabase Auth.
 */
export function getAuthUrlError(): string | null {
  try {
    const errorDesc = getAuthParam('error_description')
    if (errorDesc) {
      return decodeURIComponent(errorDesc).replace(/\+/g, ' ')
    }
    const err = getAuthParam('error')
    if (err) return err

    const hash = window.location.hash || ''
    const search = window.location.search || ''
    if (hash.includes('otp_expired') || search.includes('otp_expired')) {
      return 'The password reset link has expired. Please request a new one.'
    }
    if (hash.includes('access_denied') || search.includes('access_denied')) {
      return 'Access denied. The reset link may have expired or already been used.'
    }
  } catch (e) {}
  return null
}

let recoveryPromise: Promise<{ success: boolean; error?: string }> | null = null

/**
 * Ensures an active Supabase auth session is established for password recovery.
 * Attempts hash token restoration, OTP verification, and PKCE code exchange with deduplication.
 */
export function establishRecoverySession(): Promise<{ success: boolean; error?: string }> {
  if (recoveryPromise) return recoveryPromise
  recoveryPromise = _establishRecoverySession().finally(() => {
    setTimeout(() => {
      recoveryPromise = null
    }, 1000)
  })
  return recoveryPromise
}

async function _establishRecoverySession(): Promise<{ success: boolean; error?: string }> {
  try {
    const urlError = getAuthUrlError()
    if (urlError) {
      return { success: false, error: urlError }
    }

    // 1. Check if session is already active
    const { data: { session: existingSession } } = await supabase.auth.getSession()
    if (existingSession?.user) {
      return { success: true }
    }

    // 2. Hash tokens (implicit flow: #access_token=...&refresh_token=...)
    const accessToken = getAuthParam('access_token')
    const refreshToken = getAuthParam('refresh_token')
    if (accessToken && refreshToken) {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
        if (!error && data.session) {
          return { success: true }
        }
      } catch (err: any) {
        console.warn('setSession failed:', err?.message)
      }
    }

    // 3. OTP verification if token_hash is present
    const tokenHash = getAuthParam('token_hash')
    if (tokenHash) {
      try {
        const type = (getAuthParam('type') || 'recovery') as any
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type === 'recovery' ? 'recovery' : 'email'
        })
        if (!error && data.session) {
          return { success: true }
        }
      } catch (err: any) {
        console.warn('verifyOtp failed:', err?.message)
      }
    }

    // 4. PKCE code exchange if ?code= is present
    const code = getAuthParam('code')
    if (code) {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error && data.session) {
          return { success: true }
        }
      } catch (err: any) {
        console.warn('exchangeCodeForSession failed:', err?.message)
      }
    }

    // 5. Allow up to 1.5 seconds for background auth state / initializePromise to settle
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 250))
      const { data: { session: retrySession } } = await supabase.auth.getSession()
      if (retrySession?.user) {
        return { success: true }
      }
    }

    return {
      success: false,
      error: 'Unable to verify reset session. The link may have expired or already been used. Please request a new reset link.'
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to establish recovery session'
    }
  }
}
