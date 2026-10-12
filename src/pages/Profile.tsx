import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dbRoleToApp } from '../lib/roleMap'
import type { Role, Page } from '../types'

const roleLabels: Record<Role, string> = {
  superadmin: 'Super Admin',
  hr: 'HR Manager',
  accountant: 'Accountant',
  auditor: 'Auditor',
  staff: 'Staff',
}

interface Profile {
  id: string
  full_name: string
  role: string
  email: string
  phone: string
  photo_url: string
  status: string
}

interface ProfileProps {
  onNavigate?: (p: Page) => void
}

function getInitials(name: string, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email) {
    return email.slice(0, 2).toUpperCase()
  }
  return 'U'
}

export default function Profile({ onNavigate }: ProfileProps = {}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [imgError, setImgError] = useState(false)

  // Password change state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  // Email change state
  const [newEmail, setNewEmail] = useState('')
  const [changingEmail, setChangingEmail] = useState(false)
  const [emailError, setEmailError] = useState('')

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        let pData: Profile | null = null

        // 1. Try profiles table by auth user ID
        const { data: profileById } = await supabase
          .from('profiles')
          .select('id, full_name, role, email, phone, photo_url, status')
          .eq('id', user.id)
          .maybeSingle()

        if (profileById && profileById.full_name) {
          pData = profileById
        } else if (user.email) {
          // 2. Try profiles table by email
          const { data: profileByEmail } = await supabase
            .from('profiles')
            .select('id, full_name, role, email, phone, photo_url, status')
            .ilike('email', user.email)
            .maybeSingle()
          if (profileByEmail && profileByEmail.full_name) {
            pData = { ...profileByEmail, id: user.id }
          }
        }

        // 3. If not in profiles, query staff directory table
        if (!pData) {
          const { data: staffRow } = await supabase
            .from('staff')
            .select('id, full_name, email, phone, photo_url, avatar_url, status, profile_id')
            .or(`profile_id.eq.${user.id},email.ilike.${user.email || ''},id.eq.${user.id}`)
            .maybeSingle()

          if (staffRow) {
            pData = {
              id: user.id,
              full_name: staffRow.full_name || '',
              role: 'staff',
              email: staffRow.email || user.email || '',
              phone: staffRow.phone || '',
              photo_url: staffRow.photo_url || staffRow.avatar_url || '',
              status: staffRow.status || 'active',
            }

            // Auto-heal linking in background
            try {
              if (!staffRow.profile_id || staffRow.profile_id !== user.id) {
                await supabase.from('staff').update({ profile_id: user.id }).eq('id', staffRow.id)
              }
              await supabase.from('profiles').upsert({
                id: user.id,
                email: user.email || staffRow.email,
                full_name: staffRow.full_name,
                role: 'staff',
                phone: staffRow.phone || null,
                photo_url: staffRow.photo_url || staffRow.avatar_url || null,
                status: staffRow.status || 'active',
              }, { onConflict: 'id' })
            } catch (healErr) {
              console.warn('Auto-link profile error:', healErr)
            }
          }
        }

        // 4. Safe fallback if still not found
        if (!pData) {
          pData = {
            id: user.id,
            full_name: user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'User'),
            role: 'staff',
            email: user.email || '',
            phone: user.user_metadata?.phone || user.phone || '',
            photo_url: user.user_metadata?.avatar_url || '',
            status: 'active',
          }

          try {
            await supabase.from('profiles').upsert({
              id: user.id,
              email: user.email,
              full_name: pData.full_name,
              role: 'staff',
              phone: pData.phone || null,
              photo_url: pData.photo_url || null,
              status: 'active',
            }, { onConflict: 'id' })
          } catch {}
        }

        setProfile(pData)
        setFullName(pData.full_name || '')
        setPhone(pData.phone || '')
        setPhotoUrl(pData.photo_url || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
        console.error('Error fetching profile:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    setUploading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const fileExt = file.name.split('.').pop()
      const filePath = `${user.id}/avatar.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Upsert profile record with new photo URL
      await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          photo_url: publicUrl,
          full_name: fullName || profile?.full_name || '',
          email: profile?.email || user.email || '',
          role: profile?.role || 'staff',
          status: profile?.status || 'active',
        }, { onConflict: 'id' })

      // Also update staff directory record
      await supabase
        .from('staff')
        .update({ photo_url: publicUrl, avatar_url: publicUrl })
        .or(`profile_id.eq.${user.id},email.ilike.${user.email || profile?.email || ''}`)

      setPhotoUrl(publicUrl)
      setImgError(false)
      setSuccess('Photo updated successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo')
      console.error('Error uploading photo:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!profile) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const targetUserId = user?.id || profile.id

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: targetUserId,
          full_name: fullName,
          phone,
          email: profile.email || user?.email || '',
          role: profile.role || 'staff',
          status: profile.status || 'active',
          photo_url: photoUrl || profile.photo_url || undefined,
        }, { onConflict: 'id' })

      if (error) throw error

      await supabase
        .from('staff')
        .update({ full_name: fullName, phone, photo_url: photoUrl || undefined })
        .or(`profile_id.eq.${targetUserId},email.ilike.${profile.email || user?.email || ''}`)

      setSuccess('Changes saved successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
      console.error('Error saving profile:', err)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    setPasswordError('')
    setError('')

    // Validation
    if (!newPassword || !confirmPassword) {
      setPasswordError('Please fill in both password fields')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setSuccess('Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password')
      console.error('Error updating password:', err)
    } finally {
      setChangingPassword(false)
    }
  }

  const handleEmailChange = async () => {
    setEmailError('')
    setError('')

    if (!newEmail || !newEmail.includes('@')) {
      setEmailError('Please enter a valid email address')
      return
    }

    setChangingEmail(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      if (error) throw error

      setSuccess(`Confirmation link sent to ${newEmail}. Check your inbox (and spam folder) to complete the change.`)
      setNewEmail('')
      setTimeout(() => setSuccess(''), 5000)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send confirmation link')
      console.error('Error updating email:', err)
    } finally {
      setChangingEmail(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full"></div>
          <span className="text-xs font-medium text-slate-500">Loading profile...</span>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="text-center bg-white p-8 rounded-2xl border border-slate-200/80 shadow-xs max-w-sm w-full">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h3 className="font-semibold text-slate-800 text-base mb-1">Profile Not Found</h3>
          <p className="text-xs text-slate-500">Unable to retrieve account details. Please sign in again.</p>
        </div>
      </div>
    )
  }

  const appRole = dbRoleToApp(profile.role)

  return (
    <div className="px-3.5 py-4 sm:p-6 md:p-8 anim-fade-up max-w-2xl mx-auto pb-28 md:pb-12">
      {/* Page Title */}
      <div className="mb-4 sm:mb-6">
        <h2 className="font-display font-bold text-slate-800 text-xl sm:text-2xl tracking-tight">My Profile</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Manage your personal information, contact info, and security credentials</p>
      </div>

      {/* Staff Employment Link Banner */}
      {appRole === 'staff' && onNavigate && (
        <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div>
            <div className="text-sm font-semibold text-slate-800">Employment & Payroll Records</div>
            <div className="text-xs text-slate-500 mt-0.5">Looking for your job title, department, salary structure, payslips, or staff ID card?</div>
          </div>
          <button
            onClick={() => onNavigate('st-profile')}
            className="self-start sm:self-auto shrink-0 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
          >
            View Staff Records &rarr;
          </button>
        </div>
      )}

      {/* Global Alerts */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200/80 text-red-700 text-xs sm:text-sm flex items-start gap-2.5 shadow-xs">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none mt-0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div className="flex-1">{error}</div>
        </div>
      )}

      {success && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5 shadow-xs">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-emerald-600 mt-0.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div className="flex-1">{success}</div>
        </div>
      )}

      {/* Main Profile Information Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 mb-5">
        {/* Photo & Identity Section - fully responsive stacked on mobile, row on tablet/desktop */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 pb-6 border-b border-slate-100 mb-6">
          {/* Avatar with Camera Badge */}
          <div className="relative group shrink-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full ring-4 ring-slate-100 overflow-hidden shadow-xs bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white font-bold text-2xl sm:text-3xl select-none">
              {photoUrl && !imgError ? (
                <img
                  src={photoUrl}
                  alt={fullName || 'Profile'}
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{getInitials(fullName, profile.email)}</span>
              )}
            </div>

            {uploading && (
              <div className="absolute inset-0 bg-slate-900/60 rounded-full flex flex-col items-center justify-center text-white text-[11px] font-medium backdrop-blur-xs">
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mb-1"></div>
                <span>Uploading</span>
              </div>
            )}

            <label
              htmlFor="photo-upload"
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center shadow-md cursor-pointer ring-2 ring-white transition"
              title="Change Photo"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </label>
            <input
              type="file"
              id="photo-upload"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
              disabled={uploading}
            />
          </div>

          {/* User Details */}
          <div className="flex-1 text-center sm:text-left min-w-0 w-full">
            <h3 className="font-display font-bold text-slate-800 text-lg sm:text-xl truncate">
              {fullName || 'Your Name'}
            </h3>
            <p className="text-slate-500 text-xs sm:text-sm truncate mt-0.5 mb-2.5">
              {profile.email}
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${
                appRole === 'superadmin' ? 'bg-purple-50 text-purple-700 border border-purple-200/60' :
                appRole === 'hr' ? 'bg-blue-50 text-blue-700 border border-blue-200/60' :
                appRole === 'accountant' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' :
                appRole === 'auditor' ? 'bg-amber-50 text-amber-700 border border-amber-200/60' :
                'bg-slate-100 text-slate-600'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                {roleLabels[appRole]}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Active
              </span>
            </div>

            <div className="mt-3 sm:mt-2.5">
              <label
                htmlFor="photo-upload"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 active:scale-95 cursor-pointer transition px-2.5 py-1 rounded-lg bg-blue-50/60 hover:bg-blue-50"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                {uploading ? 'Uploading...' : 'Change Photo'}
              </label>
            </div>
          </div>
        </div>

        {/* Profile Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-[15px] sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 transition shadow-xs"
                placeholder="Enter your full name"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Email Address
              </label>
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Locked
              </span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200/90 text-[15px] sm:text-sm bg-slate-50/80 text-slate-500 cursor-not-allowed select-none"
                placeholder="your.email@example.com"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Primary login email. Contact administrator to update.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Phone Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-[15px] sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 transition shadow-xs"
                placeholder="+234 800 000 0000"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Change Password Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <h3 className="font-display font-bold text-slate-800 text-base sm:text-lg">Security & Password</h3>
            <p className="text-xs text-slate-500">Ensure your account uses a secure password</p>
          </div>
        </div>

        {passwordError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{passwordError}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-[15px] sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 transition shadow-xs"
                placeholder="Enter at least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-[15px] sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 transition shadow-xs"
                placeholder="Re-enter new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                {showConfirmPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handlePasswordChange}
              disabled={changingPassword}
              className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-slate-800 hover:bg-slate-900 active:scale-[0.99] text-white text-sm font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {changingPassword ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Change Email Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 mb-8">
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <div>
            <h3 className="font-display font-bold text-slate-800 text-base sm:text-lg">Change Email</h3>
            <p className="text-xs text-slate-500">Request an email address update via confirmation link</p>
          </div>
        </div>

        {emailError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{emailError}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              New Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-[15px] sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/60 transition shadow-xs"
                placeholder="new.email@example.com"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              We'll send a confirmation link to this address. Your login email will update once verified.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={handleEmailChange}
              disabled={changingEmail}
              className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-sm font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {changingEmail ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Sending Link...</span>
                </>
              ) : (
                <span>Send Confirmation Link</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
