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
  const [showConfirmModal, setShowConfirmModal] = useState<{ action: 'activate' | 'deactivate' | 'delete'; ids: string[] } | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null)
  const [editingRole, setEditingRole] = useState<{ userId: string; newRole: Role; oldRole: Role } | null>(null)
  const [updatingRole, setUpdatingRole] = useState(false)
  const [roleUpdateError, setRoleUpdateError] = useState('')

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
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            role,
            status,
            email,
            created_at,
            photo_url,
            phone,
            staff (
              id,
              staff_code,
              full_name,
              job_title,
              department_id,
              date_employed,
              departments (name),
              status
            )
          `)
        
        if (error) throw error

        const staffMembers: StaffMember[] = (profiles || []).map(p => ({
          id: p.id,
          staffId: p.staff?.[0]?.staff_code || `FO-${p.id.slice(0, 6).toUpperCase()}`,
          staffTableId: p.staff?.[0]?.id,
          name: p.full_name || '—',
          email: p.email || '—',
          role: dbRoleToApp(p.role),
          department: p.staff?.[0]?.departments?.name || '—',
          jobTitle: p.staff?.[0]?.job_title || '',
          employmentDate: p.staff?.[0]?.date_employed || p.created_at?.slice(0, 10) || '—',
          status: (p.staff?.[0]?.status || p.status) as StaffStatus,
          lastLogin: 'Never',
          phone: p.phone || '',
          photo: p.photo_url || null,
          bankName: '',
          accountNumber: '',
          grossSalary: 0,
          address: '',
          nextOfKin: '',
          nextOfKinPhone: '',
          state: '',
        }))

        setUsers(staffMembers)
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

  const bulkAction = async (action: 'activate' | 'deactivate') => {
    const newStatus = action === 'activate' ? 'active' : 'suspended'
    try {
      // Separate users with and without staff records
      const usersWithStaff = selected.map(id => users.find(u => u.id === id && u.staffTableId)).filter(Boolean) as StaffMember[]
      const usersWithoutStaff = selected.map(id => users.find(u => u.id === id && !u.staffTableId)).filter(Boolean) as StaffMember[]
      
      // Update staff table for users with staff records
      if (usersWithStaff.length > 0) {
        const staffIds = usersWithStaff.map(u => u.staffTableId).filter(Boolean) as string[]
        const { error: staffError } = await supabase
          .from('staff')
          .update({ status: newStatus })
          .in('id', staffIds)
        
        if (staffError) throw staffError
      }
      
      // Update profiles table for users without staff records
      if (usersWithoutStaff.length > 0) {
        const profileIds = usersWithoutStaff.map(u => u.id)
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ status: newStatus })
          .in('id', profileIds)
        
        if (profileError) throw profileError
      }

      // Log the action for each affected user
      for (const id of selected) {
        const user = users.find(u => u.id === id)
        if (user) {
          await logAction({
            action: 'UPDATE',
            entity: 'User',
            entityId: id,
            details: `${action === 'activate' ? 'Activated' : 'Suspended'} account for ${user.name}`,
            severity: 'medium',
          })
        }
      }

      setUsers(us => us.map(u =>
        selected.includes(u.id) ? { ...u, status: newStatus } : u
      ))
      setSelected([])
      setShowConfirmModal(null)
    } catch (err) {
      setError(`Failed to ${action} users. Please try again.`)
      console.error('Error updating status:', err)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    setTempPassword('')

    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: form.email,
          full_name: form.name,
          role: appRoleToDb(form.role),
        },
      })

      if (error) throw new Error(error.message)
      if (!data?.success) throw new Error(data?.error || 'Failed to create user')

      setTempPassword(data.temp_password)

      // Log the action
      await logAction({
        action: 'CREATE',
        entity: 'User',
        entityId: data.user_id,
        details: `Created ${form.role} account for ${form.name}`,
      })

      // Add the new user to the local list with real data
      const newUser: StaffMember = {
        id: data.user_id,
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
        photo: null,
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
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            >
              Suspend
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
                    <div className="flex items-center gap-1">
                      {u.status === 'active' ? (
                        <button
                          onClick={async () => {
                            try {
                              if (u.staffTableId) {
                                const { error } = await supabase
                                  .from('staff')
                                  .update({ status: 'suspended' })
                                  .eq('id', u.staffTableId)
                                if (error) throw error
                              } else {
                                const { error } = await supabase
                                  .from('profiles')
                                  .update({ status: 'suspended' })
                                  .eq('id', u.id)
                                if (error) throw error
                              }
                              
                              await logAction({
                                action: 'UPDATE',
                                entity: 'User',
                                entityId: u.id,
                                details: `Suspended account for ${u.name}`,
                                severity: 'medium',
                              })
                              
                              setUsers(us => us.map(x => x.id === u.id ? { ...x, status: 'suspended' } : x))
                            } catch (err) {
                              setError('Failed to suspend user. Please try again.')
                              console.error('Error suspending user:', err)
                            }
                          }}
                          className="px-2.5 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                          Suspend
                        </button>
                      ) : u.status === 'suspended' ? (
                        <button
                          onClick={async () => {
                            try {
                              if (u.staffTableId) {
                                const { error } = await supabase
                                  .from('staff')
                                  .update({ status: 'active' })
                                  .eq('id', u.staffTableId)
                                if (error) throw error
                              } else {
                                const { error } = await supabase
                                  .from('profiles')
                                  .update({ status: 'active' })
                                  .eq('id', u.id)
                                if (error) throw error
                              }
                              
                              await logAction({
                                action: 'UPDATE',
                                entity: 'User',
                                entityId: u.id,
                                details: `Activated account for ${u.name}`,
                                severity: 'medium',
                              })
                              
                              setUsers(us => us.map(x => x.id === u.id ? { ...x, status: 'active' } : x))
                            } catch (err) {
                              setError('Failed to activate user. Please try again.')
                              console.error('Error activating user:', err)
                            }
                          }}
                          className="px-2.5 py-1 text-xs rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                        >
                          Activate
                        </button>
                      ) : null}
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
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 anim-fade-up">
            <h3 className="font-display font-semibold text-slate-800 mb-2">Confirm Action</h3>
            <p className="text-slate-500 text-sm mb-5">
              {showConfirmModal.action === 'activate' ? 'Activate' : 'Suspend'} {showConfirmModal.ids.length} selected {showConfirmModal.ids.length === 1 ? 'account' : 'accounts'}?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(null)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => bulkAction(showConfirmModal.action as 'activate' | 'deactivate')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium text-white ${showConfirmModal.action === 'activate' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  )
}
