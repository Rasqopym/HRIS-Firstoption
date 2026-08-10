import { useState } from 'react'
import type { Role } from '../types'
import { supabase } from '../lib/supabase'
import { dbRoleToApp } from '../lib/roleMap'
import { logAction } from '../lib/auditLog'

interface LoginProps {
  onLogin: (role: Role) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

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
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) {
      setError(error.message)
    } else {
      setForgotSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #f0f4f8 0%, #e8edf5 100%)' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] flex-none p-12" style={{ background: 'linear-gradient(160deg, #0a1f3c 0%, #1e3a5f 50%, #1e40af 100%)' }}>
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-white font-display font-bold text-base">FO</span>
            </div>
            <div>
              <div className="font-display font-semibold text-white text-lg">Firstoption</div>
              <div className="text-blue-300 text-sm">HRIS Platform</div>
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
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-white font-display font-bold">FO</span>
            </div>
            <span className="font-display font-semibold text-slate-800 text-lg">Firstoption HRIS</span>
          </div>

          {!forgotMode ? (
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

          <p className="text-center text-xs text-slate-400 mt-6 font-medium">
            © 2026 Firstoption Support Services
          </p>
        </div>
      </div>
    </div>
  )
}