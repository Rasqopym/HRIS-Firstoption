import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { StaffMember, StaffStatus, Page } from '../../types'

interface Props {
  onNavigate: (p: Page) => void
  onSelectStaff: (id: string | null) => void
}

const statusColors: Record<StaffStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-700',
  offboarded: 'bg-slate-100 text-slate-500',
}

export default function StaffDirectory({ onNavigate, onSelectStaff }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('all')
  const [filterStatus, setFilterStatus] = useState<StaffStatus | 'all'>('all')
  const [view, setView] = useState<'table' | 'grid'>('table')

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch staff with department join
        const { data: staffData, error: staffError } = await supabase
          .from('staff')
          .select('*, departments(name)')
          .order('full_name', { ascending: true })

        if (staffError) throw staffError

        // Fetch departments for filter
        const { data: deptData, error: deptError } = await supabase
          .from('departments')
          .select('id, name')
          .order('name', { ascending: true })

        if (deptError) throw deptError

        // Map staff data to StaffMember shape
        const mappedStaff: StaffMember[] = staffData?.map(s => ({
          id: s.id,
          staffId: s.staff_code,
          name: s.full_name,
          email: s.email,
          department: s.departments?.name || 'Unassigned',
          jobTitle: s.job_title,
          status: s.status as StaffStatus,
          employmentDate: s.date_employed?.split('T')[0] || '',
          photo: s.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.full_name)}&background=random`,
        })) ?? []

        setStaff(mappedStaff)
        setDepartments(deptData ?? [])
      } catch (err) {
        console.error('Error fetching staff directory data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const filtered = staff.filter(s => {
    const q = search.toLowerCase()
    if (q && !s.name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q) && !s.staffId.toLowerCase().includes(q) && !s.jobTitle.toLowerCase().includes(q)) return false
    if (filterDept !== 'all' && s.department !== filterDept) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  const handleView = (s: StaffMember) => {
    onSelectStaff(s.id)
    onNavigate('hr-profile')
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

  return (
    <div className="p-4 sm:p-6 anim-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-lg sm:text-xl">Staff Directory</h2>
          <p className="text-xs sm:text-sm text-slate-500">{staff.length} total · {staff.filter(s => s.status === 'active').length} active</p>
        </div>
        <button
          onClick={() => {
            onSelectStaff(null)
            onNavigate('hr-add-staff')
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm w-full sm:w-auto"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Staff
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, role..."
            className="pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 focus:outline-none bg-white focus:border-blue-400"
          >
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as StaffStatus | 'all')}
            className="flex-1 sm:flex-none px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 focus:outline-none bg-white focus:border-blue-400"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="offboarded">Offboarded</option>
          </select>
          <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setView('table')}
              className={`p-1.5 rounded-md transition-all ${view === 'table' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400'}`}
              title="Table view"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <button
              onClick={() => setView('grid')}
              className={`p-1.5 rounded-md transition-all ${view === 'grid' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400'}`}
              title="Grid view"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Table view */}
      {view === 'table' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">ID</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Department</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Job Title</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Joined</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <div className="flex justify-center mb-3">
                        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                          </svg>
                        </div>
                      </div>
                      <div className="font-medium text-slate-600">{staff.length === 0 ? 'No staff records yet' : 'No staff found'}</div>
                      <div className="text-sm text-slate-400 mt-1">{staff.length === 0 ? 'Add your first staff member to get started' : 'Try adjusting your search or filters'}</div>
                    </td>
                  </tr>
                ) : filtered.map(s => (
                  <tr key={s.id} className="table-row-hover cursor-pointer" onClick={() => handleView(s)}>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img src={s.photo} alt={s.name} className="w-9 h-9 rounded-full object-cover flex-none ring-2 ring-slate-100" />
                        <div>
                          <div className="text-sm font-medium text-slate-800">{s.name}</div>
                          <div className="text-xs text-slate-400">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono-data text-slate-500">{s.staffId}</td>
                    <td className="py-3.5 px-4 text-sm text-slate-600">{s.department}</td>
                    <td className="py-3.5 px-4 text-sm text-slate-600">{s.jobTitle}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status]}`}>
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono-data text-slate-500">{s.employmentDate}</td>
                    <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleView(s)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <span className="text-xs font-medium text-slate-500">Showing {filtered.length} of {staff.length} staff members</span>
          </div>
        </div>
      )}

      {/* Grid view */}
      {view === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full py-16 text-center">
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
              </div>
              <div className="font-medium text-slate-600">{staff.length === 0 ? 'No staff records yet' : 'No staff found'}</div>
              <div className="text-sm text-slate-400 mt-1">{staff.length === 0 ? 'Add your first staff member to get started' : 'Try adjusting your search or filters'}</div>
            </div>
          ) : filtered.map(s => (
            <div
              key={s.id}
              onClick={() => handleView(s)}
              className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer card-hover"
            >
              <div className="flex flex-col items-center text-center">
                <img src={s.photo} alt={s.name} className="w-16 h-16 rounded-full object-cover ring-4 ring-slate-100 mb-3" />
                <div className="font-semibold text-slate-800 text-sm">{s.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.jobTitle}</div>
                <div className="text-xs text-slate-400 mt-0.5">{s.department}</div>
                <div className="mt-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status]}`}>
                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  </span>
                </div>
                <div className="mt-2.5 font-mono-data text-slate-400 text-xs bg-slate-50 px-2 py-0.5 rounded">{s.staffId}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
