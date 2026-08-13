import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { logAction } from '../../lib/auditLog'
import { appRoleToDb, dbRoleToApp } from '../../lib/roleMap'
import { getInitials, getAvatarColor } from '../../lib/avatarUtils'
import type { Page, StaffStatus, Role } from '../../types'
import SalaryStructure from '../../pages/superadmin/SalaryStructure'

interface Props {
  staffId: string | null
  onNavigate: (p: Page) => void
  onSelectStaff?: (id: string | null) => void
}

type ProfileTab = 'overview' | 'payroll' | 'documents' | 'history'

const statusColors: Record<StaffStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-700',
  offboarded: 'bg-slate-100 text-slate-500',
}

const fmt = (n?: number) => '₦' + Math.round(n || 0).toLocaleString('en-NG')

export default function StaffProfile({ staffId, onNavigate, onSelectStaff }: Props) {
  const [staff, setStaff] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showGrantAccessModal, setShowGrantAccessModal] = useState(false)
  const [tab, setTab] = useState<ProfileTab>('overview')
  const [documents, setDocuments] = useState<any[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [docError, setDocError] = useState('')
  const [activity, setActivity] = useState<any[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null)
  const [selectedRole, setSelectedRole] = useState<Role>('staff')
  const [grantingAccess, setGrantingAccess] = useState(false)
  const [grantAccessError, setGrantAccessError] = useState('')
  const [grantAccessSuccess, setGrantAccessSuccess] = useState(false)
  const [tempPassword, setTempPassword] = useState('')

  // Staff self-edit modal states
  const [showSelfEditModal, setShowSelfEditModal] = useState(false)
  const [selfEditForm, setSelfEditForm] = useState({
    phone: '',
    address: '',
    nextOfKin: '',
    nextOfKinPhone: '',
  })
  const [selfEditSaving, setSelfEditSaving] = useState(false)
  const [selfEditError, setSelfEditError] = useState('')
  const [selfEditSuccess, setSelfEditSuccess] = useState(false)

  const s = staff

  useEffect(() => {
    const fetchStaff = async () => {
      setLoading(true)
      try {
        let data = null

        if (staffId) {
          const result = await supabase
            .from('staff')
            .select('*, departments(name), profiles(id, photo_url)')
            .eq('id', staffId)
            .maybeSingle()
          
          if (result.data) {
            data = result.data
          } else {
            // Fallback to simple query without joins
            const simpleResult = await supabase
              .from('staff')
              .select('*')
              .eq('id', staffId)
              .maybeSingle()
            data = simpleResult.data
          }
        } else {
          const result = await supabase
            .from('staff')
            .select('*, departments(name), profiles(id, photo_url)')
            .order('full_name', { ascending: true })
            .limit(1)
            .maybeSingle()
          
          if (result.data) {
            data = result.data
          } else {
            const simpleResult = await supabase
              .from('staff')
              .select('*')
              .order('full_name', { ascending: true })
              .limit(1)
              .maybeSingle()
            data = simpleResult.data
          }
        }

        setStaff(data)
      } catch (err) {
        console.error('Error fetching staff:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStaff()
  }, [staffId])

  useEffect(() => {
    const fetchDocuments = async () => {
      if (!staffId) return

      setDocsLoading(true)
      try {
        const { data, error } = await supabase
          .from('staff_documents')
          .select('*')
          .eq('staff_id', staffId)
          .order('created_at', { ascending: false })

        if (error) throw error
        setDocuments(data || [])
      } catch (err) {
        console.error('Error fetching documents:', err)
      } finally {
        setDocsLoading(false)
      }
    }

    fetchDocuments()
  }, [staffId])

  useEffect(() => {
    const fetchActivity = async () => {
      // Guard: need a valid UUID AND the staff record to be loaded (so profile_id is available)
      if (!staffId || typeof staffId !== 'string' || staffId === 'undefined' || staffId === 'null') return
      if (!s) return // wait until staff is loaded before querying

      setActivityLoading(true)
      setActivityError('')
      try {
        // Include id so the key={a.id} in the JSX works
        let query = supabase
          .from('audit_log')
          .select('id, entity, entity_id, action, actor_name, details, created_at')

        if (s.profile_id) {
          // Show entries where this staff is the subject (entity_id) OR the actor (actor_id)
          query = query.or(`entity_id.eq.${staffId},actor_id.eq.${s.profile_id}`)
        } else {
          query = query.eq('entity_id', staffId)
        }

        const result = await query.order('created_at', { ascending: false })

        if (result.error) {
          console.error('[StaffProfile Activity] Supabase error:', result.error)
          throw result.error
        }
        setActivity(result.data || [])
      } catch (err) {
        console.log('[StaffProfile Activity] FULL error object:', err)
        setActivityError(err instanceof Error ? err.message : 'Failed to fetch activity')
      } finally {
        setActivityLoading(false)
      }
    }

    fetchActivity()
  }, [staffId, s])

  useEffect(() => {
    const fetchCurrentUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile) {
          setCurrentUserRole(dbRoleToApp(profile.role))
        }
      } catch (err) {
        console.error('Error fetching current user role:', err)
      }
    }

    fetchCurrentUserRole()
  }, [])

  const handleEditProfile = () => {
    if (currentUserRole === 'staff') {
      setSelfEditForm({
        phone: s?.phone || '',
        address: s?.address || '',
        nextOfKin: s?.next_of_kin || '',
        nextOfKinPhone: s?.next_of_kin_phone || '',
      })
      setSelfEditError('')
      setSelfEditSuccess(false)
      setShowSelfEditModal(true)
    } else {
      if (s?.id) {
        onSelectStaff?.(s.id)
      }
      onNavigate('hr-add-staff')
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !s?.id) return

    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `${s.id}/avatar-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update both staff table and profiles table
      await supabase
        .from('staff')
        .update({ photo_url: publicUrl })
        .eq('id', s.id)

      if (s.profile_id) {
        await supabase
          .from('profiles')
          .update({ photo_url: publicUrl })
          .eq('id', s.profile_id)
      }

      setStaff((prev: any) => prev ? { ...prev, photo_url: publicUrl } : prev)
    } catch (err: any) {
      console.error('Error uploading photo:', err)
      alert('Failed to upload photo: ' + (err.message || 'Error'))
    }
  }

  const handleSaveSelfEdit = async () => {
    if (!s?.id) return
    setSelfEditSaving(true)
    setSelfEditError('')
    setSelfEditSuccess(false)
    try {
      // UPDATE only the 4 self-editable fields — no profiles join on return
      const { error } = await supabase
        .from('staff')
        .update({
          phone: selfEditForm.phone || null,
          address: selfEditForm.address || null,
          next_of_kin: selfEditForm.nextOfKin || null,
          next_of_kin_phone: selfEditForm.nextOfKinPhone || null,
        })
        .eq('id', s.id)

      if (error) {
        console.error('[StaffProfile self-edit] Supabase error:', error)
        throw new Error(`${error.message} (code: ${error.code})`)
      }

      // Optimistically update local state rather than re-fetching with a join
      setStaff((prev: any) => prev ? {
        ...prev,
        phone: selfEditForm.phone || null,
        address: selfEditForm.address || null,
        next_of_kin: selfEditForm.nextOfKin || null,
        next_of_kin_phone: selfEditForm.nextOfKinPhone || null,
      } : prev)

      await logAction({
        action: 'UPDATE',
        entity: 'Staff',
        entityId: s.id,
        details: `${s.full_name} updated self profile details`,
      })

      setSelfEditSuccess(true)
      setTimeout(() => {
        setShowSelfEditModal(false)
        setSelfEditSuccess(false)
      }, 1200)
    } catch (err) {
      setSelfEditError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSelfEditSaving(false)
    }
  }

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'payroll', label: 'Payroll Info' },
    { id: 'documents', label: 'Documents' },
    { id: 'history', label: 'Activity' },
  ]

  const formatFileSize = (kb: number) => {
    if (kb >= 1024) {
      return `${(kb / 1024).toFixed(1)} MB`
    }
    return `${kb} KB`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString()
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  const handleUpload = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '*/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !staffId) return

      setUploading(true)
      setDocError('')

      try {
        const fileName = `${Date.now()}-${file.name}`
        const filePath = `${staffId}/${fileName}`

        // Upload to storage
        const { error: uploadError } = await supabase
          .storage
          .from('staff-documents')
          .upload(filePath, file)

        if (uploadError) throw uploadError

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()

        // Insert into staff_documents
        const { data: docData, error: insertError } = await supabase
          .from('staff_documents')
          .insert({
            staff_id: staffId,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type || 'application/octet-stream',
            file_size_kb: Math.round(file.size / 1024),
            status: 'active',
            uploaded_by: user?.id,
          })
          .select()
          .single()

        if (insertError) throw insertError

        // Add to local state
        setDocuments(prev => [docData, ...prev])

        // Log action
        await logAction({
          action: 'CREATE',
          entity: 'StaffDocument',
          entityId: staffId,
          details: `Uploaded document "${file.name}" for ${s?.full_name}`,
        })
      } catch (err) {
        setDocError(err instanceof Error ? err.message : 'Failed to upload document')
        console.error('Error uploading document:', err)
      } finally {
        setUploading(false)
      }
    }
    input.click()
  }, [staffId, s])

  const handleDownload = useCallback(async (filePath: string) => {
    try {
      const { data, error } = await supabase
        .storage
        .from('staff-documents')
        .createSignedUrl(filePath, 60)

      if (error) throw error
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      }
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Failed to generate download link')
      console.error('Error downloading document:', err)
    }
  }, [])

  const handleDelete = useCallback(async (doc: any) => {
    if (!confirm(`Delete "${doc.file_name}"?`)) return

    try {
      // Delete from storage
      const { error: storageError } = await supabase
        .storage
        .from('staff-documents')
        .remove([doc.file_path])

      if (storageError) throw storageError

      // Delete from database
      const { error: dbError } = await supabase
        .from('staff_documents')
        .delete()
        .eq('id', doc.id)

      if (dbError) throw dbError

      // Remove from local state
      setDocuments(prev => prev.filter(d => d.id !== doc.id))

      // Log action
      await logAction({
        action: 'DELETE',
        entity: 'StaffDocument',
        entityId: staffId || s?.id || '',
        details: `Deleted document "${doc.file_name}" for ${s?.full_name}`,
      })
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Failed to delete document')
      console.error('Error deleting document:', err)
    }
  }, [staffId, s])

  const handleGrantAccess = async () => {
    if (!s) return

    setGrantingAccess(true)
    setGrantAccessError('')
    setGrantAccessSuccess(false)

    try {
      const roleToUse = currentUserRole === 'hr' ? 'staff' : selectedRole
      const dbRole = appRoleToDb(roleToUse)

      let userId = ''
      let generatedTempPw = ''

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: s.email,
          full_name: s.full_name,
          role: dbRole,
          staff_id: s.id,
        },
      })

      if (!error && (data as any)?.success) {
        userId = (data as any).user_id
        generatedTempPw = (data as any).temp_password || ''
      } else {
        const fallbackPw = `Pass#${Math.random().toString(36).slice(-8)}`
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: s.email,
          password: fallbackPw,
          options: {
            data: {
              full_name: s.full_name,
              role: dbRole,
            }
          }
        })

        if (authError || !authData.user) {
          const { data: rpcData, error: rpcError } = await supabase.rpc('create_system_user', {
            p_email: s.email,
            p_password: fallbackPw,
            p_full_name: s.full_name,
            p_role: dbRole,
            p_phone: s.phone || null
          })

          if (rpcError || !rpcData?.success) {
            throw new Error(rpcError?.message || rpcData?.error || authError?.message || 'Failed to grant system access')
          }
          userId = rpcData.user_id
        } else {
          userId = authData.user.id
          await supabase.from('profiles').upsert({
            id: authData.user.id,
            full_name: s.full_name,
            email: s.email,
            role: dbRole,
            status: 'active'
          })
        }

        // Link profile_id on staff record
        await supabase.from('staff').update({ profile_id: userId }).eq('id', s.id)
        generatedTempPw = fallbackPw
      }

      setTempPassword(generatedTempPw)
      setGrantAccessSuccess(true)

      // Re-fetch staff to update profile_id
      const { data: updatedStaff } = await supabase
        .from('staff')
        .select('*')
        .eq('id', s.id)
        .maybeSingle()

      if (updatedStaff) {
        setStaff(updatedStaff)
      }

      // Log action
      await logAction({
        action: 'CREATE',
        entity: 'User',
        entityId: s.id,
        details: `Granted system access (${roleToUse}) to ${s.full_name}`,
      })
    } catch (err) {
      setGrantAccessError(err instanceof Error ? err.message : 'Failed to grant system access')
      console.error('Error granting access:', err)
    } finally {
      setGrantingAccess(false)
    }
  }

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(tempPassword)
  }

  const handleCloseModal = () => {
    setShowGrantAccessModal(false)
    setGrantAccessError('')
    setGrantAccessSuccess(false)
    setTempPassword('')
    setSelectedRole('staff')
  }

  if (loading) {
    return (
      <div className="p-6 anim-fade-up">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  if (!staff) {
    return (
      <div className="p-6 anim-fade-up">
        <button
          onClick={() => onNavigate('hr-directory')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Directory
        </button>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
          </div>
          <div className="font-medium text-slate-600">Staff not found</div>
          <div className="text-sm text-slate-400 mt-1">The requested staff record could not be found</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 anim-fade-up">
      {/* Back button */}
      <button
        onClick={() => onNavigate('hr-directory')}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-xs sm:text-sm font-medium mb-4 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Directory
      </button>

      {/* Profile header */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 mb-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5">
          <div className="relative flex-none mx-auto sm:mx-0 group">
            {(s.photo_url || s.profiles?.photo_url) ? (
              <img
                src={s.photo_url || s.profiles?.photo_url}
                alt={s.full_name}
                className="w-20 h-20 sm:w-20 sm:h-20 rounded-xl object-cover ring-4 ring-slate-100 shadow-xs"
              />
            ) : (
              <div
                className="w-20 h-20 sm:w-20 sm:h-20 rounded-xl flex-none flex items-center justify-center text-white text-xl font-bold ring-4 ring-slate-100 shadow-xs"
                style={{ backgroundColor: getAvatarColor(s.full_name) }}
              >
                {getInitials(s.full_name)}
              </div>
            )}
            <label
              htmlFor="staff-profile-photo-input"
              className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-opacity text-white text-[11px] font-semibold"
            >
              <span>📷</span>
              <span>Change</span>
            </label>
            <input
              id="staff-profile-photo-input"
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${s.status === 'active' ? 'bg-emerald-400' : s.status === 'suspended' ? 'bg-red-400' : 'bg-slate-300'}`} />
          </div>
          <div className="flex-1 min-w-0 w-full text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-slate-800 text-xl sm:text-2xl">{s.full_name}</h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-0.5">{s.job_title} · {s.departments?.name || s.department || 'Unassigned'}</p>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap w-full sm:w-auto">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[s.status as StaffStatus]}`}>
                  {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                </span>
                {!s.profile_id && (
                  <button
                    onClick={() => setShowGrantAccessModal(true)}
                    className="px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    Grant Access
                  </button>
                )}
                <button
                  onClick={handleEditProfile}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Edit Profile
                </button>
                <button
                  onClick={() => onNavigate('hr-id-cards')}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                >
                  Generate ID
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-5 text-left border-t border-slate-50 sm:border-0 pt-3 sm:pt-0">
              {[
                { label: 'Staff ID', value: s.staff_code || '—', mono: true },
                { label: 'Joined', value: s.date_employed?.split('T')[0] || '—' },
                { label: 'Email', value: s.email || '—', truncate: true },
                { label: 'Phone', value: s.phone || '—' },
              ].map(f => (
                <div key={f.label} className="min-w-0">
                  <div className="text-xs text-slate-400 mb-0.5">{f.label}</div>
                  <div className={`text-xs sm:text-sm text-slate-700 ${f.mono ? 'font-mono-data' : ''} ${f.truncate ? 'truncate' : ''}`} title={f.value}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-5 overflow-x-auto w-full sm:w-fit no-scrollbar">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-display font-semibold text-slate-800 mb-4">Personal Information</h3>
            <dl className="space-y-3">
              {[
                { label: 'Full Name', value: s.full_name },
                { label: 'Email Address', value: s.email || '—' },
                { label: 'Phone Number', value: s.phone || '—' },
                { label: 'Home Address', value: s.address || '—' },
                { label: 'State of Origin', value: s.state || '—' },
              ].map(f => (
                <div key={f.label} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                  <dt className="text-slate-500 w-36 flex-none">{f.label}</dt>
                  <dd className="text-slate-800 text-right">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-display font-semibold text-slate-800 mb-4">Employment Details</h3>
            <dl className="space-y-3">
              {[
                { label: 'Staff ID', value: s.staff_code || '—', mono: true },
                { label: 'Department', value: s.departments?.name || s.department || 'Unassigned' },
                { label: 'Job Title', value: s.job_title || '—' },
                { label: 'Employment Date', value: s.date_employed?.split('T')[0] || '—' },
                { label: 'Last Login', value: s.profiles?.id ? 'Has system access' : 'No system access' },
              ].map(f => (
                <div key={f.label} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                  <dt className="text-slate-500 w-36 flex-none">{f.label}</dt>
                  <dd className={`text-slate-800 text-right ${f.mono ? 'font-mono-data' : ''}`}>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-display font-semibold text-slate-800 mb-4">Next of Kin</h3>
            <dl className="space-y-3">
              {[
                { label: 'Full Name', value: s.next_of_kin || '—' },
                { label: 'Phone', value: s.next_of_kin_phone || '—' },
              ].map(f => (
                <div key={f.label} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                  <dt className="text-slate-500 w-36 flex-none">{f.label}</dt>
                  <dd className="text-slate-800 text-right">{f.value}</dd>
                </div>
              ))}
              {!s.next_of_kin && !s.next_of_kin_phone && (
                <div className="text-xs text-slate-400 italic mt-2">
                  Relationship not currently tracked
                </div>
              )}
            </dl>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-display font-semibold text-slate-800 mb-4">Bank Details</h3>
            <dl className="space-y-3">
              {[
                { label: 'Bank', value: s.bank_name || '—' },
                { label: 'Account Name', value: s.account_name || '—' },
                { label: 'Account Number', value: s.account_number || '—', mono: true },
              ].map(f => (
                <div key={f.label} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                  <dt className="text-slate-500 w-36 flex-none">{f.label}</dt>
                  <dd className={`text-slate-800 text-right ${f.mono ? 'font-mono-data' : ''}`}>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* Payroll Info */}
      {tab === 'payroll' && (
        <SalaryStructure staffId={staffId || s?.id || null} />
      )}

      {/* Documents */}
      {tab === 'documents' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-display font-semibold text-slate-800">Documents ({documents.length})</h3>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <div className="animate-spin w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Upload
                </>
              )}
            </button>
          </div>
          {docError && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-red-700 text-sm">
              {docError}
            </div>
          )}
          {docsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
              </div>
              <div className="text-sm">No documents uploaded yet</div>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50/60 border-b border-slate-100">
                <tr>
                  {['Document', 'Type', 'Size', 'Uploaded', 'Status', ''].map(h => (
                    <th key={h} className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {documents.map(d => (
                  <tr key={d.id} className="table-row-hover group">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-red-50 flex items-center justify-center flex-none">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <span className="text-sm text-slate-700">{d.file_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono-data text-xs text-slate-500">{d.file_type.split('/')[1]?.toUpperCase() || 'FILE'}</td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">{formatFileSize(d.file_size_kb)}</td>
                    <td className="py-3.5 px-4 text-xs font-mono-data text-slate-500">{formatDate(d.created_at)}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{d.status}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownload(d.file_path)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => handleDelete(d)}
                          className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Activity */}
      {tab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-display font-semibold text-slate-800 mb-4">Activity History</h3>
          {activityLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            </div>
          ) : activityError ? (
            <div className="text-center py-12">
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4"/><path d="M12 17h.01"/>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  </svg>
                </div>
              </div>
              <div className="text-sm text-red-600">Failed to load activity</div>
              <div className="text-xs text-slate-400 mt-1">{activityError}</div>
            </div>
          ) : activity.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </div>
              </div>
              <div className="text-sm">No activity recorded yet</div>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-100" />
              <div className="space-y-4">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-4 pl-8 relative">
                    <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-100 border-2 border-blue-400" />
                    <div>
                      <div className="text-sm text-slate-700">{a.details}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {formatDateTime(a.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grant Access Modal */}
      {showGrantAccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-display font-semibold text-slate-800 text-lg mb-2">Grant System Access</h3>

            {grantAccessSuccess ? (
              // Success view
              <div>
                <p className="text-slate-500 text-sm mb-4">
                  System access has been granted to <strong>{s.full_name}</strong>.
                </p>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                  <div className="text-xs text-emerald-600 font-medium mb-1">Temporary Password</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-emerald-800 font-mono text-sm bg-emerald-100 px-3 py-2 rounded">
                      {tempPassword}
                    </code>
                    <button
                      onClick={handleCopyPassword}
                      className="text-emerald-600 hover:text-emerald-800 transition-colors"
                      title="Copy password"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-400 mb-4">
                  Share this password with the user. They will be required to change it on first login.
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCloseModal}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              // Confirmation view
              <div>
                <p className="text-slate-500 text-sm mb-4">
                  Grant system access to <strong>{s.full_name}</strong>?
                </p>
                <div className="bg-slate-50 rounded-lg p-3 mb-4">
                  <div className="text-xs text-slate-400 mb-1">Email</div>
                  <div className="text-sm text-slate-700 font-mono">{s.email}</div>
                </div>

                {currentUserRole === 'superadmin' && (
                  <div className="mb-4">
                    <label className="text-xs text-slate-500 font-medium mb-2 block">Role</label>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as Role)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="staff">Staff</option>
                      <option value="hr">HR</option>
                      <option value="accountant">Accountant</option>
                      <option value="auditor">Auditor</option>
                    </select>
                  </div>
                )}

                {grantAccessError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                    {grantAccessError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCloseModal}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                    disabled={grantingAccess}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGrantAccess}
                    disabled={grantingAccess}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {grantingAccess ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                        Granting...
                      </>
                    ) : (
                      'Grant Access'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Staff Self-Edit Modal */}
      {showSelfEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full mx-4 anim-fade-up">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display font-semibold text-slate-800 text-lg">Edit Personal Information</h3>
                <p className="text-xs text-slate-500 mt-0.5">Update your personal contact and next of kin details</p>
              </div>
              <button
                onClick={() => setShowSelfEditModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-600 flex-none mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div>
                <strong>Notice:</strong> Job title, department, salary, and employment status are managed exclusively by HR and cannot be modified here.
              </div>
            </div>

            {selfEditError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs mb-4">
                {selfEditError}
              </div>
            )}

            {selfEditSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-lg text-xs mb-4 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Profile details updated successfully!
              </div>
            )}

            <div className="space-y-4 text-left mb-6">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={selfEditForm.phone}
                  onChange={e => setSelfEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+234 800 000 0000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Home Address</label>
                <input
                  type="text"
                  value={selfEditForm.address}
                  onChange={e => setSelfEditForm(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="e.g. 14 Example Street, Ikeja, Lagos"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Next of Kin Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Next of Kin Full Name</label>
                    <input
                      type="text"
                      value={selfEditForm.nextOfKin}
                      onChange={e => setSelfEditForm(prev => ({ ...prev, nextOfKin: e.target.value }))}
                      placeholder="Full name"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Next of Kin Phone</label>
                    <input
                      type="text"
                      value={selfEditForm.nextOfKinPhone}
                      onChange={e => setSelfEditForm(prev => ({ ...prev, nextOfKinPhone: e.target.value }))}
                      placeholder="+234 800 000 0000"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowSelfEditModal(false)}
                disabled={selfEditSaving}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSelfEdit}
                disabled={selfEditSaving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {selfEditSaving ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
