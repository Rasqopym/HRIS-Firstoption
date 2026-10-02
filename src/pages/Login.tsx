import { useState, useEffect } from 'react'
import type { Role } from '../types'
import { supabase } from '../lib/supabase'
import { dbRoleToApp } from '../lib/roleMap'
import { logAction } from '../lib/auditLog'
import { useCompanySettings } from '../hooks/useCompanySettings'
import { isPasswordRecoveryUrl, establishRecoverySession, getAuthUrlError } from '../lib/authRecovery'

interface LoginProps {
  onLogin: (role: Role) => void
  initialResetPasswordMode?: boolean
  onPasswordResetComplete?: () => void
}

export default function Login({ onLogin, initialResetPasswordMode = false, onPasswordResetComplete }: LoginProps) {
  const { settings: companySettings } = useCompanySettings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  // Recovery & Reset Password State
  const [resetPasswordMode, setResetPasswordMode] = useState(() => initialResetPasswordMode || isPasswordRecoveryUrl())
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  // PWA Direct Installation State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => window.__pwaInstallPrompt || null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [showIosInstructions, setShowIosInstructions] = useState(false)
  const isIos = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
    setIsStandalone(checkStandalone)

    if (window.__pwaInstallPrompt) {
      setDeferredPrompt(window.__pwaInstallPrompt)
    }

    const listener = (p: any) => {
      setDeferredPrompt(p)
    }

    if (window.__pwaInstallListeners) {
      window.__pwaInstallListeners.push(listener)
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      window.__pwaInstallPrompt = e
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
      window.__pwaInstallPrompt = null
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Initialize password recovery session if arriving via reset link
    const initRecovery = async () => {
      const urlError = getAuthUrlError()
      if (urlError) {
        setError(urlError)
        setForgotMode(true)
        setResetPasswordMode(false)
        return
      }

      if (isPasswordRecoveryUrl() || initialResetPasswordMode) {
        setResetPasswordMode(true)
        // Background session setup - pre-fetch/exchange tokens silently without blocking
        establishRecoverySession()
      }
    }
    initRecovery()

    // Listen for Supabase auth recovery events
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setResetPasswordMode(true)
        setRecoveryError(null)
      }
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setInstalled(true)
        setDeferredPrompt(null)
      }
    } else if (isIos) {
      setShowIosInstructions(true)
    } else {
      // Fallback alert / modal guidance
      alert('To install the app, tap your browser menu (⋮) and select "Install App" or "Add to Home screen".')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Please enter your email and password.'); return }
    setLoading(true)

    // Step 1: Ask Supabase "is this email + password correct?"
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user) {
      setError('Invalid credentials. Please try again.')
      setLoading(false)
      return
    }

    // Step 2: Now that we know WHO they are, look up their ROLE
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      setError('Logged in, but no profile found. Contact Super Admin.')
      setLoading(false)
      return
    }

    if (profile.status !== 'active') {
      setError('This account has been deactivated. Contact Super Admin.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    // Log the successful login
    await logAction({
      action: 'LOGIN',
      entity: 'System',
      details: 'Successful login',
    })

    // Step 3: Send them to the right dashboard
    try {
      const mappedRole = dbRoleToApp(profile.role)
      onLogin(mappedRole)
    } catch (err) {
      setError(`Unrecognized role: ${profile.role}. Contact Super Admin.`)
      setLoading(false)
      return
    }
    setLoading(false)
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email) {
      setError('Please enter your work email address.')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      })
      if (error) throw error
      setForgotSent(true)
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!newPassword || !confirmPassword) {
      setError('Please enter and confirm your new password.')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      // Guarantee that Supabase client has an active authenticated session
      const sessionResult = await establishRecoverySession()
      if (!sessionResult.success) {
        throw new Error(sessionResult.error || 'Your recovery session has expired or is invalid. Please request a new link.')
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setResetSuccess(true)
      await logAction({
        action: 'UPDATE',
        entity: 'User',
        details: 'Password updated via recovery link',
      })
      setTimeout(() => {
        setResetPasswordMode(false)
        setForgotMode(false)
        setResetSuccess(false)
        try {
          window.location.hash = ''
          window.history.replaceState({}, document.title, window.location.pathname)
        } catch (e) {}
        onPasswordResetComplete?.()
      }, 3000)
    } catch (err: any) {
      const msg = err.message || 'Failed to update password. The link may have expired.'
      setError(msg)
      setRecoveryError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #f0f4f8 0%, #e8edf5 100%)' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] flex-none p-12" style={{ background: 'linear-gradient(160deg, #0a1f3c 0%, #1e3a5f 50%, #1e40af 100%)' }}>
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center overflow-hidden shadow-sm">
              {companySettings.logo_url ? (
                <img src={companySettings.logo_url} alt={companySettings.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-display font-bold text-base uppercase">
                  {companySettings.name ? companySettings.name.slice(0, 2) : 'FO'}
                </span>
              )}
            </div>
            <div>
              <div className="font-display font-semibold text-white text-lg">HRIS</div>
              <div className="text-blue-300 text-sm">{companySettings.subtitle || 'Workforce Platform'}</div>
            </div>
          </div>

          <h1 className="font-display font-bold text-white text-3xl leading-tight mb-4">
            People operations,<br />
            <span className="text-blue-300">streamlined.</span>
          </h1>
          <p className="text-blue-200/70 text-sm leading-relaxed mb-10">
            A unified platform for HR records, payroll processing, identity management, and compliance — purpose-built for Nigerian enterprises.
          </p>

          <div className="space-y-4">
            {[
              { 
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                ),
                label: 'Staff Records & Onboarding', desc: 'Full lifecycle management' 
              },
              { 
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                ),
                label: 'Payroll Processing', desc: 'Automated deductions & payslips' 
              },
              { 
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/>
                    <path d="M14 9h4M14 12h4M14 15h4"/>
                  </svg>
                ),
                label: 'ID Card Generator', desc: 'Bulk-print ready cards' 
              },
              { 
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                ),
                label: 'Audit & Compliance', desc: 'Tamper-evident audit trail' 
              },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white flex-none">{f.icon}</div>
                <div>
                  <div className="text-white text-sm font-medium">{f.label}</div>
                  <div className="text-blue-300/60 text-xs">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-blue-300/40 text-xs">
          Secured with Supabase Auth · Row Level Security · TLS 1.3
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center overflow-hidden shadow-sm">
              {companySettings.logo_url ? (
                <img src={companySettings.logo_url} alt={companySettings.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-display font-bold uppercase">
                  {companySettings.name ? companySettings.name.slice(0, 2) : 'FO'}
                </span>
              )}
            </div>
            <span className="font-display font-semibold text-slate-800 text-lg">
              HRIS
            </span>
          </div>

          {resetPasswordMode ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 anim-fade-up">
              {resetSuccess ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3 className="font-display font-semibold text-slate-800 text-xl mb-2">Password Updated!</h3>
                  <p className="text-slate-500 text-sm mb-6">Your password has been successfully updated. Redirecting to sign in...</p>
                </div>
              ) : (
                <>
                  <h2 className="font-display font-semibold text-slate-800 text-2xl mb-1">Create new password</h2>
                  <p className="text-slate-500 text-sm mb-7">Enter your new account password below.</p>

                  {recoveryError && (
                    <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                      <div className="font-semibold mb-1 flex items-center gap-1.5 text-amber-800">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Reset Link Expired or Invalid
                      </div>
                      <p className="text-xs text-amber-700 mb-3">{recoveryError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setResetPasswordMode(false)
                          setForgotMode(true)
                          setError('')
                          setRecoveryError(null)
                          try {
                            window.location.hash = ''
                            window.history.replaceState({}, document.title, window.location.pathname)
                          } catch (e) {}
                        }}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition"
                      >
                        Request New Password Reset Link
                      </button>
                    </div>
                  )}

                  {error && (
                    <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Minimum 6 characters"
                          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showNewPassword ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {loading ? 'Updating password...' : 'Update Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetPasswordMode(false)
                        setForgotMode(false)
                        setRecoveryError(null)
                        setError('')
                        try {
                          window.location.hash = ''
                          window.history.replaceState({}, document.title, window.location.pathname)
                        } catch (e) {}
                        onPasswordResetComplete?.()
                      }}
                      className="w-full text-center text-sm text-slate-500 hover:text-slate-800 transition-colors pt-1"
                    >
                      Back to sign in
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : !forgotMode ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 anim-fade-up">
              <h2 className="font-display font-semibold text-slate-800 text-2xl mb-1">Welcome back</h2>
              <p className="text-slate-500 text-sm mb-7">Sign in to your HRIS account</p>

              {error && (
                <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@firstoption.ng"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-slate-700">Password</label>
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      Signing in...
                    </>
                  ) : 'Sign in'}
                </button>
              </form>

              {/* Direct App Download / Install Action */}
              {!isStandalone && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-100/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-blue-600 flex-none flex items-center justify-center text-white shadow-xs">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800">Install Mobile / Desktop App</div>
                        <div className="text-[11px] text-slate-500 truncate">One-tap shift attendance & offline access</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleInstallApp}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex-none shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <span>Install</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 anim-fade-up">
              {!forgotSent ? (
                <>
                  <button
                    onClick={() => setForgotMode(false)}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                    Back to sign in
                  </button>
                  <h2 className="font-display font-semibold text-slate-800 text-2xl mb-1">Reset password</h2>
                  <p className="text-slate-500 text-sm mb-7">Enter your work email and we will send a reset link.</p>

                  {error && (
                    <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                      {error}
                    </div>
                  )}
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Work email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@firstoption.ng"
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors disabled:opacity-60"
                    >
                      {loading ? 'Sending...' : 'Send reset link'}
                    </button>
                  </form>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3 className="font-display font-semibold text-slate-800 text-xl mb-2">Check your email</h3>
                  <p className="text-slate-500 text-sm mb-6">A password reset link has been sent to <strong>{email}</strong>. Check your inbox and spam folder.</p>
                  <button onClick={() => { setForgotMode(false); setForgotSent(false) }} className="text-sm text-blue-600 hover:underline">
                    Return to sign in
                  </button>
                </div>
              )}
            </div>
          )}

          {/* iOS Safari Installation Modal Dialog */}
          {showIosInstructions && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 anim-fade-up">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      FO
                    </div>
                    <h3 className="font-display font-bold text-slate-800 text-base">Install on iPhone / iPad</h3>
                  </div>
                  <button
                    onClick={() => setShowIosInstructions(false)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <div className="space-y-3 text-xs text-slate-600">
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-none">1</span>
                    <div>
                      Tap the <strong className="text-slate-800">Share</strong> button at the bottom of Safari (the square icon with arrow pointing up <span className="text-blue-600 font-bold">↑</span>).
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-none">2</span>
                    <div>
                      Scroll down and tap <strong className="text-slate-800">"Add to Home Screen"</strong>.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-none">3</span>
                    <div>
                      Tap <strong className="text-slate-800">Add</strong> in the top-right corner to launch the standalone app.
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowIosInstructions(false)}
                  className="w-full py-2 rounded-xl bg-blue-600 text-white font-semibold text-xs shadow-xs"
                >
                  Got It
                </button>
              </div>
            </div>
          )}

          <p className="text-center text-xs text-slate-400 mt-6 font-medium">
            {companySettings.footer_text ? companySettings.footer_text.replace(/\s*support\s*services/gi, '') : `© ${new Date().getFullYear()} ${companySettings.name || 'Firstoption'}`}
          </p>
        </div>
      </div>
    </div>
  )
}