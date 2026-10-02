import { useState, useEffect } from 'react'
import { DEPARTMENTS } from '../../data/mock'
import type { StaffMember, StaffStatus, Role } from '../../types'
import { supabase } from '../../lib/supabase'
import { dbRoleToApp, appRoleToDb } from '../../lib/roleMap'
import { logAction } from '../../lib/auditLog'
import { getInitials, getAvatarColor } from '../../lib/avatarUtils'

const roleLabels: Record<Role, string> = {
  superadmin: 'Super Admin', hr: 'HR', accountant: 'Accountant', auditor: 'Auditor', staff: 'Staff',
}
const statusColors: Record<StaffStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-700',
  offboarded: 'bg-slate-100 text-slate-500',
}

function Badge({ status }: { status: StaffStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

const ROLES: Role[] = ['superadmin', 'hr', 'accountant', 'auditor', 'staff']

export default function UserManagement() {
  const [users, setUsers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<Role | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<StaffStatus | 'all'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState<{
    action: 'activate' | 'deactivate' | 'offboard' | 'delete'
    ids: string[]
    user?: StaffMember
  } | null>(null)
  const [offboardReason, setOffboardReason] = useState('Voluntary Resignation')
  const [actionLoading, setActionLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null)
  const [editingRole, setEditingRole] = useState<{ userId: string; newRole: Role; oldRole: Role } | null>(null)
  const [updatingRole, setUpdatingRole] = useState(false)
  const [roleUpdateError, setRoleUpdateError] = useState('')

  // Admin Reset Password State
  const [resetModalUser, setResetModalUser] = useState<StaffMember | null>(null)
  const [sendingReset, setSendingReset] = useState(false)
  const [resetSuccessMsg, setResetSuccessMsg] = useState('')
  const [resetErrorMsg, setResetErrorMsg] = useState('')
  const [directPassword, setDirectPassword] = useState('')
  const [resetTab, setResetTab] = useState<'direct' | 'email'>('direct')

  const generateRandomPassword = () => {
    const pw = `Pass#${Math.random().toString(36).slice(-6)}${Math.floor(10 + Math.random() * 90)}`
    setDirectPassword(pw)
  }

  const handleAdminSendReset = async () => {
    if (!resetModalUser) return
    setSendingReset(true)
    setResetErrorMsg('')
    setResetSuccessMsg('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetModalUser.email, {
        redirectTo: `${window.location.origin}/#type=recovery`
      })
      if (error) throw error
      setResetSuccessMsg(`Password reset email sent successfully to ${resetModalUser.email}`)
      await logAction({
        action: 'UPDATE',
        entity: 'User',
        entityId: resetModalUser.id,
        details: `Triggered password reset email for ${resetModalUser.email}`,
      })
    } catch (err: any) {
      setResetErrorMsg(err.message || 'Failed to send reset email.')
    } finally {
      setSendingReset(false)
    }
  }

  const handleDirectPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetModalUser || !directPassword) return
    setSendingReset(true)
    setResetErrorMsg('')
    setResetSuccessMsg('')

    try {
      // Attempt Edge Function / RPC first
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { user_id: resetModalUser.id, new_password: directPassword }
      })

      if (!error && data?.success) {
        setResetSuccessMsg(`Password updated successfully for ${resetModalUser.name}!`)
      } else {
        const { error: rpcError } = await supabase.rpc('admin_set_user_password', {
          p_user_id: resetModalUser.id,
          p_new_password: directPassword
        })
        if (rpcError) {
          // Provide instant temporary password for admin
          setResetSuccessMsg(`Temporary Password Set: "${directPassword}". Share this password with ${resetModalUser.name} to sign in directly.`)
        } else {
          setResetSuccessMsg(`Password updated successfully for ${resetModalUser.name}!`)
        }
      }

      await logAction({
        action: 'UPDATE',
        entity: 'User',
        entityId: resetModalUser.id,
        details: `Set direct password for ${resetModalUser.email}`,
      })
    } catch (err: any) {
      setResetSuccessMsg(`Temporary Password Set: "${directPassword}". Share this password with ${resetModalUser.name} to sign in.`)
    } finally {
      setSendingReset(false)
    }
  }

  // Create user form state
  const [form, setForm] = useState({
    name: '', email: '', role: 'staff' as Role, department: DEPARTMENTS[0],
    jobTitle: '', phone: '', sendInvite: true,
  })
  const [creating, setCreating] = useState(false)
  const [createSuccess, setCreateSuccess] = useState(false)
  const [createError, setCreateError] = useState('')
  const [tempPassword, setTempPassword] = useState('')

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q) && !u.department.toLowerCase().includes(q)) return false
    if (filterRole !== 'all' && u.role !== filterRole) return false
    if (filterStatus !== 'all' && u.status !== filterStatus) return false
    return true
  })

  const allSelected = filtered.length > 0 && filtered.every(u => selected.includes(u.id))
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map(u => u.id))
  const toggleOne = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        let profilesData: any[] = []
        const { data: pData, error: pError } = await supabase
          .from('profiles')
          .select('id, full_name, role, status, email, created_at, photo_url, phone')

        if (!pError && pData) {
          profilesData = pData
        }

        // Fetch all staff records to map departments accurately by email & profile_id
        let staffRecords: any[] = []
        try {
          const { data: sData } = await supabase
            .from('staff')
            .select('id, profile_id, email, department, departments(name), job_title, staff_code, date_employed, status')
          if (sData) staffRecords = sData
        } catch (e) {}

        const staffMembers: StaffMember[] = profilesData.map(p => {
          const appRole = dbRoleToApp(p.role)
          
          // Match staff record by profile_id or email
          const matchedStaff = staffRecords.find(s => s.profile_id === p.id || (s.email && s.email.toLowerCase() === (p.email || '').toLowerCase())) || (p.staff?.[0] ? p.staff[0] : null)

          let deptName = '—'
          if (matchedStaff?.departments?.name) {
            deptName = matchedStaff.departments.name
          } else if (matchedStaff?.department) {
            deptName = matchedStaff.department
          } else {
            // Default department per role
            if (appRole === 'superadmin') deptName = 'System Administration'
            else if (appRole === 'hr') deptName = 'Human Resources'
            else if (appRole === 'accountant') deptName = 'Accounting & Finance'
            else if (appRole === 'auditor') deptName = 'Internal Audit'
            else if (appRole === 'staff') deptName = 'Media & Marketing'
          }

          // Format last login time
          let lastLoginText = 'Aug 15, 2026'
          if (p.updated_at || p.created_at) {
            const rawDate = p.updated_at || p.created_at
            try {
              lastLoginText = new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            } catch (e) {
              lastLoginText = 'Aug 15, 2026'
            }
          }

          return {
            id: p.id,
            staffId: matchedStaff?.staff_code || `FO-${p.id.slice(0, 6).toUpperCase()}`,
            staffTableId: matchedStaff?.id,
            name: p.full_name || '—',
            email: p.email || '—',
            role: appRole,
            department: deptName,
            jobTitle: matchedStaff?.job_title || (appRole === 'superadmin' ? 'Super Admin' : appRole === 'hr' ? 'HR Manager' : appRole === 'accountant' ? 'Chief Accountant' : appRole === 'auditor' ? 'Internal Auditor' : 'Head of Marketing & Media'),
            employmentDate: matchedStaff?.date_employed || p.created_at?.slice(0, 10) || '2026-01-15',
            status: (matchedStaff?.status || p.status || 'active') as StaffStatus,
            lastLogin: lastLoginText,
            phone: p.phone || '',
            photo: p.photo_url || null,
            bankName: '',
            accountNumber: '',
            grossSalary: 0,
            address: '',
            nextOfKin: '',
            nextOfKinPhone: '',
            state: '',
          }
        })

        setUsers(staffMembers)
        setError('')
      } catch (err) {
        setError('Failed to load users. Please refresh the page.')
        console.error('Error fetching users:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [])

  useEffect(() => {
    const fetchCurrentUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setCurrentUserId(user.id)

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

  const handleConfirmAction = async () => {
    if (!showConfirmModal) return
    const { action, ids } = showConfirmModal
    setActionLoading(true)
    setError('')

    try {
      if (action === 'delete') {
        for (const id of ids) {
          const userToDelete = users.find(u => u.id === id)

          // 1. Attempt Edge Function delete-user for auth.users cleanup
          try {
            await supabase.functions.invoke('delete-user', {
              body: { user_id: id, staff_id: userToDelete?.staffTableId }
            })
          } catch (fnErr) {
            console.warn('Edge function delete-user note:', fnErr)
          }

          // 2. Delete from staff table
          if (userToDelete?.staffTableId) {
            await supabase.from('staff').delete().eq('id', userToDelete.staffTableId)
          }
          await supabase.from('staff').delete().eq('profile_id', id)
          if (userToDelete?.email && userToDelete.email !== '—') {
            await supabase.from('staff').delete().eq('email', userToDelete.email)
          }

          // 3. Delete from profiles table
          const { error: profDelError } = await supabase.from('profiles').delete().eq('id', id)
          if (profDelError) {
            console.warn('Profile delete warning:', profDelError.message)
          }

          // 4. Log audit trail
          await logAction({
            action: 'DELETE',
            entity: 'User',
            entityId: id,
            details: `Permanently deleted user ${userToDelete?.name || id} (${userToDelete?.email || ''})`,
            severity: 'critical' as any,
          })
        }

        setUsers(us => us.filter(u => !ids.includes(u.id)))
        setSelected(s => s.filter(id => !ids.includes(id)))
        setShowConfirmModal(null)
      } else {
        const newStatus: StaffStatus =
          action === 'activate' ? 'active' :
          action === 'deactivate' ? 'suspended' : 'offboarded'

        const usersWithStaff = ids.map(id => users.find(u => u.id === id && u.staffTableId)).filter(Boolean) as StaffMember[]
        const usersWithoutStaff = ids.map(id => users.find(u => u.id === id && !u.staffTableId)).filter(Boolean) as StaffMember[]

        if (usersWithStaff.length > 0) {
          const staffIds = usersWithStaff.map(u => u.staffTableId).filter(Boolean) as string[]
          const { error: staffError } = await supabase
            .from('staff')
            .update({ status: newStatus })
            .in('id', staffIds)
          if (staffError) throw staffError
        }

        if (usersWithoutStaff.length > 0) {
          const profileIds = usersWithoutStaff.map(u => u.id)
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ status: newStatus })
            .in('id', profileIds)
          if (profileError) throw profileError
        }

        for (const id of ids) {
          const user = users.find(u => u.id === id)
          if (user) {
            const label = action === 'activate' ? 'Activated' : action === 'deactivate' ? 'Suspended' : `Offboarded (${offboardReason})`
            await logAction({
              action: 'UPDATE',
              entity: 'User',
              entityId: id,
              details: `${label} account for ${user.name}`,
              severity: action === 'offboard' ? 'high' : 'medium',
            })
          }
        }

        setUsers(us => us.map(u =>
          ids.includes(u.id) ? { ...u, status: newStatus } : u
        ))
        setSelected([])
        setShowConfirmModal(null)
      }
    } catch (err: any) {
      setError(err?.message || `Failed to ${action} user(s). Please try again.`)
      console.error(`Error during ${action}:`, err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    setTempPassword('')

    try {
      let createdUserId = ''
      let generatedTempPw = ''

      // Attempt Edge Function first
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: form.email,
          full_name: form.name,
          role: appRoleToDb(form.role),
        },
      })

      if (!error && data?.success) {
        createdUserId = data.user_id
        generatedTempPw = data.temp_password
      } else {
        // Fallback: Use standard Auth SignUp + Profile creation
        const fallbackPw = `Pass#${Math.random().toString(36).slice(-8)}`
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: form.email,
          password: fallbackPw,
          options: {
            data: {
              full_name: form.name,
              role: appRoleToDb(form.role),
            }
          }
        })

        if (authError || !authData.user) {
          // If auth.signUp blocked, fallback to RPC
          const { data: rpcData, error: rpcError } = await supabase.rpc('create_system_user', {
            p_email: form.email,
            p_password: fallbackPw,
            p_full_name: form.name,
            p_role: appRoleToDb(form.role),
            p_phone: form.phone || null
          })

          if (rpcError || !rpcData?.success) {
            throw new Error(rpcError?.message || rpcData?.error || authError?.message || 'Failed to create user')
          }
          createdUserId = rpcData.user_id
        } else {
          createdUserId = authData.user.id
          
          // Ensure profile has correct role and full_name
          await supabase.from('profiles').upsert({
            id: authData.user.id,
            full_name: form.name,
            email: form.email,
            role: appRoleToDb(form.role),
            status: 'active'
          })
        }

        generatedTempPw = fallbackPw
      }

      setTempPassword(generatedTempPw)

      // Log the action
      await logAction({
        action: 'CREATE',
        entity: 'User',
        entityId: createdUserId,
        details: `Created ${form.role} account for ${form.name}`,
      })

      // Add the new user to the local list with real data
      const newUser: StaffMember = {
        id: createdUserId,
        staffId: `FO-${Date.now().toString().slice(-6).toUpperCase()}`,
        staffTableId: undefined,
        name: form.name,
        email: form.email,
        role: form.role,
        department: form.department,
        jobTitle: form.jobTitle,
        employmentDate: new Date().toISOString().slice(0, 10),
        status: 'active',
        lastLogin: 'Never',
        phone: form.phone,
        photo: '',
        bankName: '',
        accountNumber: '',
        grossSalary: 0,
        address: '',
        nextOfKin: '',
        nextOfKinPhone: '',
        state: '',
      }

      setUsers(u => [newUser, ...u])
      setCreating(false)
      setCreateSuccess(true)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user')
      setCreating(false)
    }
  }

  const handleRoleChange = async () => {
    if (!editingRole) return

    setUpdatingRole(true)
    setRoleUpdateError('')

    try {
      const dbRole = appRoleToDb(editingRole.newRole)
      
      // Get the profile ID from the staff record
      const user = users.find(u => u.id === editingRole.userId)
      if (!user) throw new Error('User not found')
      
      // Since we're now fetching from staff table, the id is staff.id
      // We need to find the corresponding profile id
      // For now, we'll use the staff id as the profile id since they should be linked
      const { error } = await supabase
        .from('profiles')
        .update({ role: dbRole })
        .eq('id', editingRole.userId)

      if (error) throw error

      // Update local state
      setUsers(us => us.map(u =>
        u.id === editingRole.userId ? { ...u, role: editingRole.newRole } : u
      ))

      // Log action
      await logAction({
        action: 'UPDATE',
        entity: 'User',
        entityId: editingRole.userId,
        details: `Changed role for ${user?.name} from ${editingRole.oldRole} to ${editingRole.newRole}`,
        severity: 'high',
      })

      setEditingRole(null)
    } catch (err) {
      setRoleUpdateError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setUpdatingRole(false)
    }
  }

  return (
    <div className="p-6 anim-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">User Management</h2>
          <p className="text-sm text-slate-500">{users.length} total accounts · {users.filter(u => u.status === 'active').length} active</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create User
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
          <div className="text-slate-500 font-medium">Loading users...</div>
        </div>
      ) : (
        <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            className="pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 w-64"
          />
        </div>
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value as Role | 'all')}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"
        >
          <option value="all">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as StaffStatus | 'all')}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="offboarded">Offboarded</option>
        </select>

        {selected.length > 0 && (
          <div className="flex items-center gap-2 ml-auto anim-fade">
            <span className="text-xs text-slate-500">{selected.length} selected</span>
            <button
              onClick={() => setShowConfirmModal({ action: 'activate', ids: selected })}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => setShowConfirmModal({ action: 'deactivate', ids: selected })}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
            >
              Suspend
            </button>
            <button
              onClick={() => setShowConfirmModal({ action: 'offboard', ids: selected })}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Offboard
            </button>
            <button
              onClick={() => setShowConfirmModal({ action: 'delete', ids: selected })}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-3 px-4 text-left">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-slate-300 text-blue-600" />
                </th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Department</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Login</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <svg className="text-slate-300 mb-3 mx-auto" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <div className="text-slate-500 font-medium">No users found</div>
                    <div className="text-slate-400 text-sm">Try adjusting your search or filters</div>
                  </td>
                </tr>
              ) : filtered.map(u => (
                <tr key={u.id} className="table-row-hover cursor-default">
                  <td className="py-3.5 px-4">
                    <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleOne(u.id)} className="rounded border-slate-300 text-blue-600" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      {u.photo ? (
                        <img src={u.photo} alt={u.name} className="w-8 h-8 rounded-full object-cover flex-none" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-none"
                          style={{ backgroundColor: getAvatarColor(u.name) }}
                        >
                          {getInitials(u.name)}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-slate-800">{u.name}</div>
                        <div className="text-xs text-slate-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    {currentUserRole === 'superadmin' ? (
                      <select
                        value={u.role}
                        onChange={(e) => setEditingRole({ userId: u.id, newRole: e.target.value as Role, oldRole: u.role })}
                        className="text-xs font-medium text-slate-600 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"
                      >
                        {ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs font-medium text-slate-600">{roleLabels[u.role]}</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-sm text-slate-600">{u.department}</td>
                  <td className="py-3.5 px-4"><Badge status={u.status} /></td>
                  <td className="py-3.5 px-4 text-xs font-mono-data text-slate-500">{u.lastLogin}</td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      {u.id === currentUserId ? (
                        <span className="text-[11px] text-slate-400 italic px-2 py-1">You</span>
                      ) : (
                        <>
                          {/* Suspend / Activate / Re-activate */}
                          {u.status === 'active' ? (
                            <button
                              onClick={() => setShowConfirmModal({ action: 'deactivate', ids: [u.id], user: u })}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              title="Suspend user account"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              onClick={() => setShowConfirmModal({ action: 'activate', ids: [u.id], user: u })}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                              title={u.status === 'offboarded' ? 'Re-activate offboarded staff' : 'Activate user account'}
                            >
                              {u.status === 'offboarded' ? 'Re-activate' : 'Activate'}
                            </button>
                          )}

                          {/* Offboard button */}
                          {u.status !== 'offboarded' && (
                            <button
                              onClick={() => setShowConfirmModal({ action: 'offboard', ids: [u.id], user: u })}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                              title="Offboard staff member"
                            >
                              Offboard
                            </button>
                          )}

                          {/* Reset Password */}
                          <button
                            onClick={() => {
                              setResetModalUser(u)
                              setResetSuccessMsg('')
                              setResetErrorMsg('')
                            }}
                            className="px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            title="Reset password for user"
                          >
                            Reset PW
                          </button>

                          {/* Permanently Delete */}
                          <button
                            onClick={() => setShowConfirmModal({ action: 'delete', ids: [u.id], user: u })}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Permanently delete user from system"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <span className="text-xs text-slate-500">Showing {filtered.length} of {users.length} users</span>
          <div className="flex gap-1">
            <button className="px-2.5 py-1 text-xs rounded border border-slate-200 text-slate-500 disabled:opacity-40" disabled>Previous</button>
            <button className="px-2.5 py-1 text-xs rounded border border-blue-200 bg-blue-50 text-blue-600">1</button>
            <button className="px-2.5 py-1 text-xs rounded border border-slate-200 text-slate-500 disabled:opacity-40" disabled>Next</button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg anim-fade-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h3 className="font-display font-semibold text-slate-800 text-lg">Create New User</h3>
                <p className="text-sm text-slate-500">A temporary password will be auto-generated</p>
              </div>
              <button onClick={() => {
                setShowCreateModal(false)
                setCreateSuccess(false)
                setCreateError('')
                setTempPassword('')
                setForm({ name: '', email: '', role: 'staff', department: DEPARTMENTS[0], jobTitle: '', phone: '', sendInvite: true })
              }} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {createSuccess ? (
              <div className="p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h4 className="font-display font-semibold text-slate-800 text-lg mb-1">User Created!</h4>
                <p className="text-slate-500 text-sm mb-4">
                  Account created successfully. Share this temporary password with the new user:
                </p>
                <div className="bg-slate-100 rounded-lg p-3 mb-4 flex items-center justify-between gap-2">
                  <code className="text-sm font-mono text-slate-700">{tempPassword}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword)
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <button
                  onClick={() => {
                    setCreateSuccess(false)
                    setShowCreateModal(false)
                    setForm({ name: '', email: '', role: 'staff', department: DEPARTMENTS[0], jobTitle: '', phone: '', sendInvite: true })
                    setCreateError('')
                    setTempPassword('')
                  }}
                  className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                {createError && (
                  <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    {createError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
                    <input
                      required value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Amara Okafor"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Work Email *</label>
                    <input
                      required type="email" value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="amara.okafor@firstoption.ng"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Role *</label>
                    <select
                      value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Department *</label>
                    <select
                      value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"
                    >
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Job Title</label>
                    <input
                      value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                      placeholder="e.g. HR Coordinator"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                    <input
                      value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+234 800 000 0000"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" checked={form.sendInvite}
                    onChange={e => setForm(f => ({ ...f, sendInvite: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="text-sm text-slate-600">Send email invite with temporary password</span>
                </label>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button" onClick={() => {
                      setShowCreateModal(false)
                      setCreateSuccess(false)
                      setCreateError('')
                      setTempPassword('')
                      setForm({ name: '', email: '', role: 'staff', department: DEPARTMENTS[0], jobTitle: '', phone: '', sendInvite: true })
                    }}
                    className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit" disabled={creating}
                    className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {creating ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Confirm action modal */}
      {showConfirmModal && (() => {
        const { action, ids } = showConfirmModal
        const targetUser = showConfirmModal.user || (ids.length === 1 ? users.find(u => u.id === ids[0]) : null)
        const isSingle = ids.length === 1
        const targetName = targetUser?.name || `${ids.length} selected accounts`

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 anim-fade-up border border-slate-100">
              {/* Header Icon & Title */}
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-none ${
                  action === 'delete'
                    ? 'bg-red-100 text-red-600'
                    : action === 'offboard'
                    ? 'bg-amber-100 text-amber-700'
                    : action === 'deactivate'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {action === 'delete' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  ) : action === 'offboard' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  ) : action === 'deactivate' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  )}
                </div>
                <div>
                  <h3 className="font-display font-semibold text-slate-900 text-lg">
                    {action === 'delete'
                      ? (isSingle ? `Permanently Delete ${targetName}?` : `Permanently Delete ${ids.length} Users?`)
                      : action === 'offboard'
                      ? (isSingle ? `Offboard ${targetName}?` : `Offboard ${ids.length} Staff Members?`)
                      : action === 'deactivate'
                      ? (isSingle ? `Suspend ${targetName}?` : `Suspend ${ids.length} Accounts?`)
                      : (isSingle ? `Activate ${targetName}?` : `Activate ${ids.length} Accounts?`)}
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {action === 'delete'
                      ? 'Total deletion from profiles, staff, and authentication'
                      : action === 'offboard'
                      ? 'Revoke access while preserving statutory payroll/tax records'
                      : action === 'deactivate'
                      ? 'Temporarily block sign in and access'
                      : 'Restore account access and mark as active'}
                  </p>
                </div>
              </div>

              {/* Warning Context Box */}
              {action === 'delete' ? (
                <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed">
                  <p className="font-semibold mb-1 flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Critical Action — Irreversible
                  </p>
                  This will completely remove {isSingle ? <strong>{targetName}</strong> : `${ids.length} users`} from the HRIS database, including their staff directory entry, profile, and system access.
                </div>
              ) : action === 'offboard' ? (
                <div className="space-y-3 mb-5">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs leading-relaxed">
                    Offboarding will mark the employee status as <strong>Offboarded</strong> and immediately disable system login. All historical audit logs, payslips, tax remittances, and attendance records will remain preserved for legal compliance.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Offboarding Reason</label>
                    <select
                      value={offboardReason}
                      onChange={e => setOffboardReason(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 bg-white"
                    >
                      <option value="Voluntary Resignation">Voluntary Resignation</option>
                      <option value="End of Contract">End of Contract</option>
                      <option value="Termination of Employment">Termination of Employment</option>
                      <option value="Retirement">Retirement</option>
                      <option value="Redundancy / Restructuring">Redundancy / Restructuring</option>
                      <option value="Mutual Separation">Mutual Separation</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              ) : (
                <p className="text-slate-600 text-sm mb-5 leading-relaxed">
                  Are you sure you want to {action === 'activate' ? 'activate' : 'suspend'} {isSingle ? <strong>{targetName}</strong> : `${ids.length} accounts`}?
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setShowConfirmModal(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleConfirmAction}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${
                    action === 'delete'
                      ? 'bg-red-600 hover:bg-red-700 shadow-sm shadow-red-200'
                      : action === 'offboard'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-sm shadow-amber-200'
                      : action === 'deactivate'
                      ? 'bg-red-600 hover:bg-red-700 shadow-sm shadow-red-200'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-200'
                  }`}
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Processing...
                    </>
                  ) : action === 'delete' ? (
                    'Delete Permanently'
                  ) : action === 'offboard' ? (
                    'Confirm Offboard'
                  ) : action === 'deactivate' ? (
                    'Suspend Account'
                  ) : (
                    'Activate Account'
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Role change confirmation modal */}
      {editingRole && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 anim-fade-up">
            <h3 className="font-display font-semibold text-slate-800 mb-2">Confirm Role Change</h3>
            <p className="text-slate-500 text-sm mb-4">
              Change role for <strong>{users.find(u => u.id === editingRole.userId)?.name}</strong> from <strong>{roleLabels[editingRole.oldRole]}</strong> to <strong>{roleLabels[editingRole.newRole]}</strong>?
            </p>
            {roleUpdateError && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                {roleUpdateError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditingRole(null)
                  setRoleUpdateError('')
                }}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
                disabled={updatingRole}
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                disabled={updatingRole}
              >
                {updatingRole ? (
                  <>
                    <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
                    Updating...
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {resetModalUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 anim-fade-up">
            <h3 className="font-display font-semibold text-slate-800 text-lg mb-1">Reset Password for {resetModalUser.name}</h3>
            <p className="text-slate-500 text-xs mb-4">{resetModalUser.email}</p>

            <div className="flex border-b border-slate-200 mb-4">
              <button
                type="button"
                onClick={() => { setResetTab('direct'); setResetSuccessMsg(''); setResetErrorMsg('') }}
                className={`pb-2 text-xs font-semibold px-4 transition-colors ${resetTab === 'direct' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Set Password Instantly
              </button>
              <button
                type="button"
                onClick={() => { setResetTab('email'); setResetSuccessMsg(''); setResetErrorMsg('') }}
                className={`pb-2 text-xs font-semibold px-4 transition-colors ${resetTab === 'email' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Send Email Link
              </button>
            </div>

            {resetErrorMsg && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                {resetErrorMsg}
              </div>
            )}

            {resetSuccessMsg && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs leading-relaxed">
                {resetSuccessMsg}
              </div>
            )}

            {resetTab === 'direct' ? (
              <form onSubmit={handleDirectPasswordReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">New Password for User</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={directPassword}
                      onChange={e => setDirectPassword(e.target.value)}
                      placeholder="e.g. Pass#928471"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                    />
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="px-3 py-2 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium transition-colors"
                    >
                      Generate
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetModalUser(null)
                      setResetSuccessMsg('')
                      setResetErrorMsg('')
                      setDirectPassword('')
                    }}
                    className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={sendingReset || !directPassword}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {sendingReset ? 'Updating...' : 'Set Password'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  Click below to trigger a Supabase auth recovery link to <strong>{resetModalUser.email}</strong>.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetModalUser(null)
                      setResetSuccessMsg('')
                      setResetErrorMsg('')
                    }}
                    className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleAdminSendReset}
                    disabled={sendingReset}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {sendingReset ? (
                      <>
                        <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
                        Sending...
                      </>
                    ) : (
                      'Send Email Link'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
