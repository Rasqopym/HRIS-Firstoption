import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dbRoleToApp } from '../lib/roleMap'
import type { Role } from '../types'

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

export default function Profile() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')

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

        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('id, full_name, role, email, phone, photo_url, status')
          .eq('id', user.id)
          .single()

        if (error) throw error
        if (!profileData) throw new Error('Profile not found')

        setProfile(profileData)
        setFullName(profileData.full_name || '')
        setPhone(profileData.phone || '')
        setPhotoUrl(profileData.photo_url || '')
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

      console.log('Photo upload - User ID:', user.id)

      const fileExt = file.name.split('.').pop()
      const filePath = `${user.id}/avatar.${fileExt}`

      console.log('Photo upload - File path:', filePath)

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      console.log('Photo upload - Storage upload successful')

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      console.log('Photo upload - Public URL:', publicUrl)

      // Debug: Log user.id from the initial getUser call
      console.log('[Photo Upload Debug] user.id from initial getUser:', user.id)

      // Debug: Get fresh session to check auth.uid()
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[Photo Upload Debug] auth.uid() from fresh session:', session?.user?.id)
      console.log('[Photo Upload Debug] IDs match?', user.id === session?.user?.id)

      const updateResult = await supabase
        .from('profiles')
        .update({ photo_url: publicUrl })
        .eq('id', user.id)

      console.log('[Photo Upload Debug] FULL update result:', updateResult)
      console.log('[Photo Upload Debug] Update affected rows:', updateResult.count)

      if (updateResult.error) throw updateResult.error

      console.log('Photo upload - Database update successful')

      setPhotoUrl(publicUrl)
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
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, phone })
        .eq('id', profile.id)

      if (error) throw error

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
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
          </div>
          <div className="text-slate-500 font-medium">Profile not found</div>
        </div>
      </div>
    )
  }

  const appRole = dbRoleToApp(profile.role)

  return (
    <div className="p-6 anim-fade-up max-w-2xl mx-auto">
      <h2 className="font-display font-semibold text-slate-800 text-2xl mb-6">My Profile</h2>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {/* Photo section */}
        <div className="flex items-start gap-6 mb-8">
          <div className="relative">
            <img
              src={photoUrl || `https://i.pravatar.cc/150?u=${profile.id}`}
              alt={fullName || 'Profile'}
              className="w-24 h-24 rounded-full object-cover border-2 border-slate-200"
            />
            {uploading && (
              <div className="absolute inset-0 bg-white/70 rounded-full flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-display font-semibold text-slate-800 text-lg">{fullName || 'Your Name'}</h3>
            <p className="text-slate-500 text-sm mb-2">{profile.email}</p>
            <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${
              appRole === 'superadmin' ? 'bg-purple-100 text-purple-700' :
              appRole === 'hr' ? 'bg-blue-100 text-blue-700' :
              appRole === 'accountant' ? 'bg-emerald-100 text-emerald-700' :
              appRole === 'auditor' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {roleLabels[appRole]}
            </span>
          </div>
          <div>
            <input
              type="file"
              id="photo-upload"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
              disabled={uploading}
            />
            <label
              htmlFor="photo-upload"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Change Photo
            </label>
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
              placeholder="your.email@example.com"
            />
            <p className="text-xs text-slate-400 mt-1">Email cannot be changed. Contact admin for email updates.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="+234 800 000 0000"
            />
          </div>

          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Change Password Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mt-6">
        <h3 className="font-display font-semibold text-slate-800 text-lg mb-4">Change Password</h3>
        
        {passwordError && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {passwordError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="Enter new password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="Confirm new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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

          <div className="pt-4">
            <button
              onClick={handlePasswordChange}
              disabled={changingPassword}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {changingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>
      </div>

      {/* Change Email Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mt-6">
        <h3 className="font-display font-semibold text-slate-800 text-lg mb-4">Change Email</h3>
        
        {emailError && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {emailError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">New Email Address</label>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="new.email@example.com"
            />
            <p className="text-xs text-slate-400 mt-1">
              We'll send a confirmation link to this address. Your login email won't change until you click it.
            </p>
          </div>

          <div className="pt-4">
            <button
              onClick={handleEmailChange}
              disabled={changingEmail}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {changingEmail ? 'Sending...' : 'Send Confirmation Link'}
            </button>
          </div>
        </div>
        {/* 
          NOTE: We're not updating the profiles table's email column here.
          This needs a database trigger to automatically sync the email from 
          auth.users to profiles.email when the email change is confirmed.
          To be added later.
        */}
      </div>
    </div>
  )
}
