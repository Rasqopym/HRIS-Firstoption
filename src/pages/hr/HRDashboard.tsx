import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Page } from '../../types'
import { getInitials, getAvatarColor } from '../../lib/avatarUtils'

interface Props { onNavigate: (p: Page) => void; onSelectStaff?: (id: string | null) => void }

interface StaffMember {
  id: string
  full_name: string
  job_title: string
  photo_url: string | null
  status: string
  date_employed: string
  created_at: string
  department_name?: string
  id_card_expires_at: string | null
}

export default function HRDashboard({ onNavigate, onSelectStaff }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStaff = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('staff')
        .select(`
          id,
          full_name,
          job_title,
          photo_url,
          status,
          date_employed,
          created_at,
          id_card_expires_at,
          departments (name)
        `)
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Failed to fetch staff:', error)
      } else if (data) {
        const mappedStaff: StaffMember[] = data.map((s: any) => ({
          id: s.id,
          full_name: s.full_name,
          job_title: s.job_title,
          photo_url: s.photo_url,
          status: s.status,
          date_employed: s.date_employed,
          created_at: s.created_at,
          department_name: s.departments?.name,
          id_card_expires_at: s.id_card_expires_at,
        }))
        setStaff(mappedStaff)
      }
      setLoading(false)
    }
    fetchStaff()
  }, [])

  const active = staff.filter(s => s.status === 'active').length
  const inactive = staff.filter(s => s.status !== 'active').length
  const recent = staff.slice(0, 3)

  // Current date calculations
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  // New hires this month
  const newHiresThisMonth = staff.filter(s => {
    if (!s.date_employed) return false
    const employedDate = new Date(s.date_employed)
    return employedDate.getMonth() === currentMonth && employedDate.getFullYear() === currentYear
  }).length

  // ID cards expiring within 30 days
  const idCardsDue = staff.filter(s => {
    if (!s.id_card_expires_at) return false
    const expiryDate = new Date(s.id_card_expires_at)
    return expiryDate <= thirtyDaysFromNow && expiryDate >= today
  }).length

  // Department counts
  const deptCounts = staff.reduce((acc, s) => {
    const dept = s.department_name || 'Unassigned'
    acc[dept] = (acc[dept] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Formatted date for heading
  const todayFormatted = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-slate-500">Loading HR dashboard...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 anim-fade-up">
      <div>
        <h2 className="font-display font-semibold text-slate-800 text-lg sm:text-xl">HR Operations Dashboard</h2>
        <p className="text-slate-500 text-xs sm:text-sm">{todayFormatted} · Live Headcount</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {[
          { 
            l: 'Total Staff', 
            v: staff.length, 
            sub: `${active} active headcount`, 
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
            bgClass: 'bg-blue-50/80',
            iconClass: 'text-blue-600',
            border: 'border-blue-100'
          },
          { 
            l: 'This Month Hires', 
            v: newHiresThisMonth, 
            sub: 'Newly onboarded staff', 
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
            bgClass: 'bg-emerald-50/80',
            iconClass: 'text-emerald-600',
            border: 'border-emerald-100'
          },
          { 
            l: 'Inactive / Suspended', 
            v: inactive, 
            sub: 'Non-active accounts', 
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
            bgClass: 'bg-amber-50/80',
            iconClass: 'text-amber-600',
            border: 'border-amber-100'
          },
          { 
            l: 'ID Cards Expiring', 
            v: idCardsDue, 
            sub: 'Due within 30 days', 
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
            bgClass: 'bg-purple-50/80',
            iconClass: 'text-purple-600',
            border: 'border-purple-100'
          },
        ].map(k => (
          <div key={k.l} className={`bg-white rounded-xl border ${k.border} shadow-sm p-4 sm:p-5 card-hover flex flex-col justify-between`}>
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{k.l}</span>
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg ${k.bgClass} flex items-center justify-center ${k.iconClass}`}>
                {k.icon}
              </div>
            </div>
            <div>
              <div className="font-display font-bold text-xl sm:text-2xl text-slate-800 tracking-tight">{k.v}</div>
              <div className="text-xs text-slate-400 mt-0.5 sm:mt-1">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <h3 className="font-display font-semibold text-slate-800 text-base">Headcount by Department</h3>
            </div>
            <button onClick={() => onNavigate('hr-directory')} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
              All staff <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <div className="space-y-4">
            {Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([dept, count]) => {
              const pct = staff.length > 0 ? Math.round((count / staff.length) * 100) : 0
              return (
                <div key={dept} className="group">
                  <div className="flex items-center justify-between mb-1.5 text-sm">
                    <span className="font-medium text-slate-700">{dept}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono-data">{pct}%</span>
                      <span className="font-semibold text-slate-800 text-xs font-mono-data px-2 py-0.5 rounded bg-slate-100">{count} staff</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-300 group-hover:brightness-110" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h3 className="font-display font-semibold text-slate-800 text-base">Recently Added Staff</h3>
              </div>
              <button onClick={() => { onSelectStaff?.(null); onNavigate('hr-add-staff') }} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">Add Staff</button>
            </div>
            <div className="space-y-3">
              {recent.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  {s.photo_url ? (
                    <img
                      src={s.photo_url}
                      alt={s.full_name}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-100 flex-none"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-none ring-2 ring-slate-100"
                      style={{ backgroundColor: getAvatarColor(s.full_name) }}
                    >
                      {getInitials(s.full_name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{s.full_name}</div>
                    <div className="text-xs text-slate-400 truncate">{s.job_title} · {s.department_name || 'Unassigned'}</div>
                  </div>
                  <div className="text-xs font-mono-data text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md">
                    {s.date_employed ? new Date(s.date_employed).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
