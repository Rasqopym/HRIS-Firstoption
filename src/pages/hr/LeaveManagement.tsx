import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAction } from '../../lib/auditLog'
import type { LeaveRequest, LeaveType } from '../../types'

type Tab = 'requests' | 'calendar' | 'config'
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

const statusColors: Record<LeaveRequest['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function LeaveManagement() {
  const [tab, setTab] = useState<Tab>('requests')
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [noteModal, setNoteModal] = useState<{ id: string; action: 'approved' | 'rejected' } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [types, setTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)
  const [addTypeModal, setAddTypeModal] = useState(false)
  const [newType, setNewType] = useState({ name: '', entitlementDays: 21, paid: true, requiresDocument: false })
  const [deleteTypeModal, setDeleteTypeModal] = useState<{ id: string; name: string } | null>(null)
  const [deleteStrategy, setDeleteStrategy] = useState<'cascade' | 'reassign'>('cascade')
  const [reassignTargetId, setReassignTargetId] = useState<string>('')
  const [isDeletingType, setIsDeletingType] = useState(false)
  const [deleteTypeError, setDeleteTypeError] = useState('')

  const filtered = requests.filter(r => statusFilter === 'all' || r.status === statusFilter)

  const handleDecide = async (id: string, status: 'approved' | 'rejected') => {
    const request = requests.find(r => r.id === id)
    if (!request) return

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error('Failed to get current user:', userError)
      return
    }

    // Update leave_requests in Supabase
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status,
        approved_by: user.id,
        note: noteText || null,
      })
      .eq('id', id)

    if (error) {
      console.error('Failed to update leave request:', error)
      alert('Failed to update leave request. Please try again.')
      return
    }

    // Update local state with approver name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const approverName = profile?.full_name || 'Unknown'

    setRequests(prev => prev.map(r => r.id === id ? { ...r, status, approvedBy: approverName, note: noteText || undefined } : r))
    setNoteModal(null)
    setNoteText('')

    // Log action
    await logAction({
      action: 'UPDATE',
      entity: 'LeaveRequest',
      entityId: id,
      details: `${status === 'approved' ? 'Approved' : 'Rejected'} ${request.type} request for ${request.staffName} (${request.days} days)`,
      severity: 'medium'
    })
  }

  // Fetch leave requests and leave types on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      
      // Fetch leave_requests with joins
      const { data: requestsData, error: requestsError } = await supabase
        .from('leave_requests')
        .select(`
          id,
          staff_id,
          leave_type_id,
          start_date,
          end_date,
          reason,
          status,
          created_at,
          approved_by,
          note,
          staff!inner (
            full_name,
            photo_url,
            departments (name)
          ),
          leave_types (name)
        `)
        .order('created_at', { ascending: false })
      
      if (requestsError) {
        console.error('Failed to fetch leave requests:', requestsError)
      } else if (requestsData) {
        // Map to LeaveRequest shape
        const mappedRequests: LeaveRequest[] = await Promise.all(requestsData.map(async (r: any) => {
          const startDate = r.start_date
          const endDate = r.end_date
          const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
          
          // Get approver name if approved
          let approvedBy = undefined
          if (r.approved_by) {
            const { data: approverProfile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', r.approved_by)
              .single()
            approvedBy = approverProfile?.full_name
          }
          
          return {
            id: r.id,
            staffId: r.staff_id,
            staffName: r.staff?.full_name || 'Staff Member',
            staffPhoto: r.staff?.photo_url || '',
            department: r.staff?.departments?.name || r.staff?.department || 'Sales & Marketing',
            type: r.leave_types?.name || 'Annual Leave',
            startDate,
            endDate,
            days,
            reason: r.reason || '',
            status: r.status,
            submittedAt: r.created_at,
            approvedBy,
            note: r.note,
            leaveTypeId: r.leave_type_id,
          }
        }))
        
        // Merge LocalStorage cached leave requests submitted by staff
        let cachedReqs: LeaveRequest[] = []
        try {
          const keysToTry = ['hris_all_leave_requests', 'hris_self_leave_requests_FO-0002']
          for (const k of keysToTry) {
            const raw = localStorage.getItem(k)
            if (raw) {
              try {
                cachedReqs = [...cachedReqs, ...JSON.parse(raw)]
              } catch (e) {}
            }
          }
        } catch (e) {}

        const seenIds = new Set<string>()
        const merged: LeaveRequest[] = []
        for (const r of [...cachedReqs, ...mappedRequests]) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id)
            merged.push(r)
          }
        }
        setRequests(merged)
      }

      // Fetch leave_types
      const { data: typesData, error: typesError } = await supabase
        .from('leave_types')
        .select('id, name, annual_entitlement_days, is_paid, requires_document')
      
      if (typesError) {
        console.error('Failed to fetch leave types:', typesError)
      } else if (typesData) {
        let cachedTypesConfig: Record<string, boolean> = {}
        try {
          const rawCache = localStorage.getItem('hris_leave_types_config')
          if (rawCache) {
            const parsed = JSON.parse(rawCache)
            parsed.forEach((lt: any) => {
              cachedTypesConfig[lt.name.toLowerCase()] = lt.attractsLeaveAllowance
            })
          }
        } catch (e) {}

        let mappedTypes: LeaveType[] = typesData.map((t: any) => {
          const nameLower = t.name.toLowerCase()
          const attracts = cachedTypesConfig[nameLower] !== undefined
            ? cachedTypesConfig[nameLower]
            : (nameLower.includes('annual') && !nameLower.includes('unpaid'))
          return {
            id: t.id,
            name: t.name,
            entitlementDays: t.annual_entitlement_days,
            paid: t.is_paid,
            requiresDocument: t.requires_document,
            attractsLeaveAllowance: attracts,
          }
        })

        // Ensure both Senior Staff (21 days) and Junior Staff (12 days) Annual Leave exist
        const hasSeniorAnnual = mappedTypes.some(t => t.name.toLowerCase().includes('senior') && t.name.toLowerCase().includes('annual'))
        const hasJuniorAnnual = mappedTypes.some(t => t.name.toLowerCase().includes('junior') && t.name.toLowerCase().includes('annual'))
        const hasGenericAnnual = mappedTypes.some(t => t.name.toLowerCase() === 'annual leave')

        if (!hasSeniorAnnual && hasGenericAnnual) {
          mappedTypes = mappedTypes.map(t => {
            if (t.name.toLowerCase() === 'annual leave') {
              return { ...t, name: 'Annual Leave (Senior Staff)', entitlementDays: 21, attractsLeaveAllowance: true }
            }
            return t
          })
          mappedTypes.push({
            id: 'type-annual-junior',
            name: 'Annual Leave (Junior Staff)',
            entitlementDays: 12,
            paid: true,
            requiresDocument: false,
            attractsLeaveAllowance: true,
          })
        } else if (!hasSeniorAnnual && !hasJuniorAnnual && !hasGenericAnnual) {
          mappedTypes.unshift(
            { id: 'type-annual-senior', name: 'Annual Leave (Senior Staff)', entitlementDays: 21, paid: true, requiresDocument: false, attractsLeaveAllowance: true },
            { id: 'type-annual-junior', name: 'Annual Leave (Junior Staff)', entitlementDays: 12, paid: true, requiresDocument: false, attractsLeaveAllowance: true }
          )
        }

        // Ensure AWOL exists in the list for HR disciplinary management
        const hasAwol = mappedTypes.some(t => t.name.toLowerCase().includes('awol') || t.name.toLowerCase().includes('absence without'))
        if (!hasAwol) {
          mappedTypes.push({
            id: 'type-awol-unpaid',
            name: 'AWOL (Absence Without Official Leave)',
            entitlementDays: 0,
            paid: false,
            requiresDocument: false,
            attractsLeaveAllowance: false,
          })
        }

        setTypes(mappedTypes)
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const currentMonthLabel = `${monthNames[currentMonth]} ${currentYear}`
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

  const onLeaveToday = requests.filter(r => r.status === 'approved' && r.startDate <= today && r.endDate >= today)

  // Approved leave for current month
  const approvedLeaveThisMonth = requests.filter(r => {
    if (r.status !== 'approved') return false
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(daysInCurrentMonth).padStart(2, '0')}`
    // Check if leave range overlaps with current month
    return r.startDate <= monthEnd && r.endDate >= monthStart
  })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'requests', label: `Leave Requests (${requests.filter(r => r.status === 'pending').length} pending)` },
    { id: 'calendar', label: 'Who\'s on Leave' },
    { id: 'config', label: 'Leave Type Config' },
  ]

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-slate-500">Loading leave management...</div>
      </div>
    )
  }

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">Leave Management</h2>
          <p className="text-sm text-slate-500">{requests.filter(r => r.status === 'pending').length} pending approvals</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-5 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Leave Requests */}
      {tab === 'requests' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all border ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {s}
                {s !== 'all' && <span className="ml-1 opacity-70">({requests.filter(r => r.status === s).length})</span>}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm py-12 text-center">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                  </div>
                </div>
                <div className="font-medium text-slate-600">No {statusFilter !== 'all' ? statusFilter : ''} requests</div>
              </div>
            ) : filtered.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5 card-hover">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img src={r.staffPhoto} alt={r.staffName} className="w-10 h-10 rounded-full object-cover flex-none" />
                    <div>
                      <div className="font-medium text-slate-800">{r.staffName}</div>
                      <div className="text-xs text-slate-500">{r.department}</div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColors[r.status]}`}>
                    {r.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { l: 'Leave Type', v: r.type },
                    { l: 'Duration', v: `${r.days} ${r.days === 1 ? 'day' : 'days'}` },
                    { l: 'From', v: r.startDate },
                    { l: 'To', v: r.endDate },
                  ].map(f => (
                    <div key={f.l}>
                      <div className="text-xs text-slate-400">{f.l}</div>
                      <div className="text-sm font-medium text-slate-700">{f.v}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">{r.reason}</div>

                {r.status === 'approved' && r.approvedBy && (
                  <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Approved by {r.approvedBy}</span>
                  </div>
                )}
                {r.status === 'rejected' && r.note && (
                  <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    <span>Rejected: {r.note}</span>
                  </div>
                )}

                {r.status === 'pending' && (
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => setNoteModal({ id: r.id, action: 'approved' })}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setNoteModal({ id: r.id, action: 'rejected' })}
                      className="px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium transition-colors"
                    >
                      Reject
                    </button>
                    <span className="text-xs text-slate-400">Submitted {r.submittedAt}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Calendar / who's on leave */}
      {tab === 'calendar' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-display font-semibold text-slate-800 mb-4">Currently on Leave (Today: {todayFormatted})</h3>
            {onLeaveToday.length === 0 ? (
              <div className="py-8 text-center text-slate-400">No staff on leave today</div>
            ) : onLeaveToday.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100 mb-2">
                <img src={r.staffPhoto} alt={r.staffName} className="w-8 h-8 rounded-full object-cover" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">{r.staffName}</div>
                  <div className="text-xs text-slate-500">{r.type} · Until {r.endDate}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-display font-semibold text-slate-800 mb-4">{currentMonthLabel} — Approved Leave Overview</h3>
            <div className="space-y-2">
              {approvedLeaveThisMonth.map(r => {
                const startDate = new Date(r.startDate)
                const endDate = new Date(r.endDate)
                const monthStart = new Date(currentYear, currentMonth, 1)
                const monthEnd = new Date(currentYear, currentMonth, daysInCurrentMonth)
                
                // Calculate visible start (max of leave start and month start)
                const visibleStart = startDate < monthStart ? monthStart : startDate
                // Calculate visible end (min of leave end and month end)
                const visibleEnd = endDate > monthEnd ? monthEnd : endDate
                
                // Calculate position and width as percentages of month
                const startDay = visibleStart.getDate()
                const endDay = visibleEnd.getDate()
                const marginLeft = ((startDay - 1) / daysInCurrentMonth) * 100
                const width = ((endDay - startDay + 1) / daysInCurrentMonth) * 100
                
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    <img src={r.staffPhoto} alt={r.staffName} className="w-7 h-7 rounded-full object-cover flex-none" />
                    <div className="text-sm text-slate-700 w-40 truncate">{r.staffName}</div>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="h-6 rounded-full bg-amber-300 flex items-center px-2"
                        style={{
                          marginLeft: `${marginLeft}%`,
                          width: `${width}%`,
                        }}
                      >
                        <span className="text-xs text-amber-900 font-medium whitespace-nowrap">{r.type.split(' ')[0]}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 font-mono-data w-16 text-right">{r.startDate.slice(5)}–{r.endDate.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Leave Type Config */}
      {tab === 'config' && (
        <div className="space-y-4 max-w-4xl">
          {/* Policy Overview Callout */}
          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/80 text-xs text-slate-700 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-blue-900 text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span>Annual Leave Cadres, Bonus Rules & AWOL Disciplinary Handling</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-2.5 rounded-lg bg-white border border-blue-100 shadow-2xs">
                <strong className="block text-slate-800 font-semibold mb-1 text-xs">Cadre Entitlements:</strong>
                <span className="text-slate-600 leading-relaxed text-[11.5px]">
                  <strong>Senior Staff:</strong> 21 days annual leave entitlement.<br />
                  <strong>Junior Staff:</strong> 12 days annual leave entitlement.
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-blue-100 shadow-2xs">
                <strong className="block text-slate-800 font-semibold mb-1 text-xs">Annual Leave Bonus:</strong>
                <span className="text-slate-600 leading-relaxed text-[11.5px]">
                  Bonus is <strong>100% of 1 Month Basic Salary</strong>. Strictly payable to <strong>confirmed</strong> staff with at least <strong>1 full year of continuous service</strong> upon approved annual leave (once per calendar year).
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-blue-100 shadow-2xs">
                <strong className="block text-slate-800 font-semibold mb-1 text-xs">AWOL (Disciplinary):</strong>
                <span className="text-slate-600 leading-relaxed text-[11.5px]">
                  <strong>Hidden from staff self-service</strong>. Exclusively recorded by HR/Management. Processed in payroll as unpaid deductions with ₦0 attendance allowances.
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h3 className="font-display font-semibold text-slate-700">Leave Types Configuration</h3>
              <button onClick={() => setAddTypeModal(true)} className="text-xs text-blue-600 hover:underline">Add Type</button>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-50">
                <tr>
                  {['Leave Type', 'Entitlement (days/yr)', 'Paid', 'Attracts Bonus', 'Requires Document', ''].map(h => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {types.map(t => {
                  const nameLower = t.name.toLowerCase()
                  const isAwol = nameLower.includes('awol') || nameLower.includes('absence without')
                  const isSenior = nameLower.includes('senior') && nameLower.includes('annual')
                  const isJunior = nameLower.includes('junior') && nameLower.includes('annual')

                  return (
                    <tr key={t.id} className="table-row-hover group">
                      <td className="py-3 px-4 font-medium text-slate-800">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{t.name}</span>
                          {isAwol && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                              Administrative / HR Only (Hidden from Staff)
                            </span>
                          )}
                          {isSenior && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                              Senior Cadre (21d)
                            </span>
                          )}
                          {isJunior && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                              Junior Cadre (12d)
                            </span>
                          )}
                        </div>
                      </td>
                  <td className="py-3 px-4">
                    <input
                      type="number" value={t.entitlementDays}
                      onChange={async (e) => {
                        const newValue = Number(e.target.value)
                        const { error } = await supabase
                          .from('leave_types')
                          .update({ annual_entitlement_days: newValue })
                          .eq('id', t.id)
                        if (error) {
                          console.error('Failed to update entitlement days:', error)
                          alert('Failed to update entitlement days')
                          return
                        }
                        setTypes(prev => prev.map(x => x.id === t.id ? { ...x, entitlementDays: newValue } : x))
                        await logAction({
                          action: 'UPDATE',
                          entity: 'LeaveType',
                          details: `Updated ${t.name} entitlement days to ${newValue}`
                        })
                      }}
                      className="w-20 px-2 py-1 text-sm border border-slate-200 rounded font-mono-data focus:outline-none focus:border-blue-400"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={async () => {
                        const newValue = !t.paid
                        const { error } = await supabase
                          .from('leave_types')
                          .update({ is_paid: newValue })
                          .eq('id', t.id)
                        if (error) {
                          console.error('Failed to update paid status:', error)
                          alert('Failed to update paid status')
                          return
                        }
                        setTypes(prev => prev.map(x => x.id === t.id ? { ...x, paid: newValue } : x))
                        await logAction({
                          action: 'UPDATE',
                          entity: 'LeaveType',
                          details: `Updated ${t.name} paid status to ${newValue ? 'Paid' : 'Unpaid'}`
                        })
                      }}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${t.paid ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      {t.paid ? 'Paid' : 'Unpaid'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={async () => {
                        const newValue = !t.attractsLeaveAllowance
                        const updated = types.map(x => x.id === t.id ? { ...x, attractsLeaveAllowance: newValue } : x)
                        setTypes(updated)
                        try {
                          localStorage.setItem('hris_leave_types_config', JSON.stringify(updated))
                        } catch (e) {}
                        await logAction({
                          action: 'UPDATE',
                          entity: 'LeaveType',
                          details: `Updated ${t.name} attracts leave allowance bonus to ${newValue ? 'Yes' : 'No'}`
                        })
                      }}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors inline-flex items-center gap-1 ${t.attractsLeaveAllowance ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      {t.attractsLeaveAllowance ? (
                        <>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          <span>Bonus Pay</span>
                        </>
                      ) : 'No Bonus'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={async () => {
                        const newValue = !t.requiresDocument
                        const { error } = await supabase
                          .from('leave_types')
                          .update({ requires_document: newValue })
                          .eq('id', t.id)
                        if (error) {
                          console.error('Failed to update requires document:', error)
                          alert('Failed to update requires document')
                          return
                        }
                        setTypes(prev => prev.map(x => x.id === t.id ? { ...x, requiresDocument: newValue } : x))
                        await logAction({
                          action: 'UPDATE',
                          entity: 'LeaveType',
                          details: `Updated ${t.name} requires document to ${newValue ? 'Required' : 'Optional'}`
                        })
                      }}
                      className={`text-xs cursor-pointer hover:underline inline-flex items-center gap-1 ${t.requiresDocument ? 'text-slate-600 font-medium' : 'text-slate-400'}`}
                    >
                      {t.requiresDocument ? (
                        <>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          <span>Required</span>
                        </>
                      ) : 'Optional'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => {
                        setDeleteTypeModal({ id: t.id, name: t.name })
                        setDeleteStrategy('cascade')
                        setDeleteTypeError('')
                        const other = types.find(x => x.id !== t.id)
                        setReassignTargetId(other ? other.id : '')
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-red-500 transition-all cursor-pointer"
                      title="Delete"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

      {/* Approve/Reject modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 anim-fade-up">
            <h3 className="font-display font-semibold text-slate-800 mb-2 capitalize">{noteModal.action} Leave Request</h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Note (optional)</label>
              <textarea
                value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                placeholder={noteModal.action === 'rejected' ? 'Reason for rejection...' : 'Any notes for the staff member...'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setNoteModal(null); setNoteText('') }} className="flex-1 py-2 rounded-lg border text-sm text-slate-600">Cancel</button>
              <button
                onClick={() => handleDecide(noteModal.id, noteModal.action)}
                className={`flex-1 py-2 rounded-lg text-white text-sm font-medium capitalize ${noteModal.action === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                Confirm {noteModal.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Leave Type modal */}
      {addTypeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 anim-fade-up">
            <h3 className="font-display font-semibold text-slate-800 mb-2">Add Leave Type</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Name</label>
                <input
                  type="text" value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })}
                  placeholder="e.g., Annual Leave"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Entitlement Days (per year)</label>
                <input
                  type="number" value={newType.entitlementDays} onChange={e => setNewType({ ...newType, entitlementDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 font-mono-data"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox" id="paid" checked={newType.paid} onChange={e => setNewType({ ...newType, paid: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="paid" className="text-sm text-slate-700">Paid Leave</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox" id="requiresDoc" checked={newType.requiresDocument} onChange={e => setNewType({ ...newType, requiresDocument: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="requiresDoc" className="text-sm text-slate-700">Requires Document</label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setAddTypeModal(false); setNewType({ name: '', entitlementDays: 21, paid: true, requiresDocument: false }) }} className="flex-1 py-2 rounded-lg border text-sm text-slate-600">Cancel</button>
              <button
                onClick={async () => {
                  if (!newType.name.trim()) {
                    alert('Please enter a name')
                    return
                  }
                  const { data, error } = await supabase
                    .from('leave_types')
                    .insert({
                      name: newType.name.trim(),
                      annual_entitlement_days: newType.entitlementDays,
                      is_paid: newType.paid,
                      requires_document: newType.requiresDocument,
                    })
                    .select()
                    .single()
                  if (error) {
                    console.error('Failed to add leave type:', error)
                    alert('Failed to add leave type')
                    return
                  }
                  const addedType: LeaveType = {
                    id: data.id,
                    name: data.name,
                    entitlementDays: data.annual_entitlement_days,
                    paid: data.is_paid,
                    requiresDocument: data.requires_document,
                  }
                  setTypes(prev => [...prev, addedType])
                  setAddTypeModal(false)
                  setNewType({ name: '', entitlementDays: 21, paid: true, requiresDocument: false })
                  await logAction({
                    action: 'CREATE',
                    entity: 'LeaveType',
                    details: `Created leave type: ${addedType.name}`
                  })
                }}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
              >
                Add Type
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Leave Type modal */}
      {deleteTypeModal && (() => {
        const attachedRequests = requests.filter(r => 
          r.leaveTypeId === deleteTypeModal.id || 
          r.type?.trim().toLowerCase() === deleteTypeModal.name?.trim().toLowerCase()
        )
        const otherTypes = types.filter(t => t.id !== deleteTypeModal.id)

        const handleConfirmDelete = async () => {
          setIsDeletingType(true)
          setDeleteTypeError('')

          try {
            const targetId = deleteTypeModal.id
            const targetName = deleteTypeModal.name

            // 1. If there are attached requests, either reassign or cascade delete
            if (attachedRequests.length > 0) {
              if (deleteStrategy === 'reassign' && reassignTargetId) {
                const destType = types.find(t => t.id === reassignTargetId)
                // Update Supabase by leave_type_id
                await supabase
                  .from('leave_requests')
                  .update({ leave_type_id: reassignTargetId })
                  .eq('leave_type_id', targetId)

                // Update by IDs of matched requests
                const attachedIds = attachedRequests.map(r => r.id).filter(Boolean)
                if (attachedIds.length > 0) {
                  await supabase
                    .from('leave_requests')
                    .update({ leave_type_id: reassignTargetId })
                    .in('id', attachedIds)
                }

                // Update local requests
                setRequests(prev => prev.map(r => 
                  (r.leaveTypeId === targetId || r.type?.trim().toLowerCase() === targetName.trim().toLowerCase())
                    ? { ...r, type: destType?.name || r.type, leaveTypeId: reassignTargetId }
                    : r
                ))
              } else {
                // Cascade delete requests in Supabase
                await supabase
                  .from('leave_requests')
                  .delete()
                  .eq('leave_type_id', targetId)

                const attachedIds = attachedRequests.map(r => r.id).filter(Boolean)
                if (attachedIds.length > 0) {
                  await supabase
                    .from('leave_requests')
                    .delete()
                    .in('id', attachedIds)
                }

                // Clean local requests state
                setRequests(prev => prev.filter(r => 
                  r.leaveTypeId !== targetId && r.type?.trim().toLowerCase() !== targetName.trim().toLowerCase()
                ))

                // Clean localStorage cached requests
                try {
                  const keysToClean = ['hris_all_leave_requests', 'hris_self_leave_requests_FO-0002']
                  for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i)
                    if (k && k.startsWith('hris_')) keysToClean.push(k)
                  }
                  for (const k of Array.from(new Set(keysToClean))) {
                    const raw = localStorage.getItem(k)
                    if (raw && raw.startsWith('[')) {
                      try {
                        const parsed = JSON.parse(raw)
                        if (Array.isArray(parsed)) {
                          const updated = parsed.filter((r: any) => 
                            r.leave_type_id !== targetId && 
                            r.type?.trim().toLowerCase() !== targetName.trim().toLowerCase()
                          )
                          localStorage.setItem(k, JSON.stringify(updated))
                        }
                      } catch (e) {}
                    }
                  }
                } catch (e) {}
              }
            }

            // 2. Delete the leave type from Supabase
            const { error: delError } = await supabase
              .from('leave_types')
              .delete()
              .eq('id', targetId)

            if (delError) {
              console.error('Failed to delete leave type:', delError)
              throw new Error(delError.message || 'Failed to delete leave type from database')
            }

            // 3. Update local types state
            setTypes(prev => prev.filter(t => t.id !== targetId))

            // Clean localStorage config cache
            try {
              const rawCache = localStorage.getItem('hris_leave_types_config')
              if (rawCache) {
                const parsed = JSON.parse(rawCache)
                const updated = parsed.filter((lt: any) => lt.name?.toLowerCase() !== targetName.toLowerCase())
                localStorage.setItem('hris_leave_types_config', JSON.stringify(updated))
              }
            } catch (e) {}

            await logAction({
              action: 'DELETE',
              entity: 'LeaveType',
              details: `Deleted leave type "${targetName}"${attachedRequests.length > 0 ? ` (${deleteStrategy === 'reassign' ? 'reassigned attached requests' : 'deleted attached requests'})` : ''}`
            })

            setDeleteTypeModal(null)
          } catch (err: any) {
            console.error('Error during leave type deletion:', err)
            setDeleteTypeError(err.message || 'Failed to delete leave type. Please try again.')
          } finally {
            setIsDeletingType(false)
          }
        }

        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 anim-fade-up border border-slate-100">
              <div className="flex items-start gap-3.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center flex-none">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-slate-800 text-lg">Delete Leave Type</h3>
                  <p className="text-xs text-slate-500">
                    Are you sure you want to delete <strong>"{deleteTypeModal.name}"</strong>?
                  </p>
                </div>
              </div>

              {deleteTypeError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  {deleteTypeError}
                </div>
              )}

              {attachedRequests.length > 0 ? (
                <div className="mb-5 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-amber-900 mb-1.5">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span>{attachedRequests.length} Existing Request{attachedRequests.length === 1 ? '' : 's'} Attached</span>
                  </div>
                  <p className="text-amber-800 text-[11.5px] leading-relaxed mb-3">
                    This leave type has existing staff requests attached to it. Choose how to handle them:
                  </p>

                  <div className="space-y-2.5">
                    <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${deleteStrategy === 'cascade' ? 'bg-white border-red-300 ring-1 ring-red-200' : 'bg-amber-100/40 border-amber-200/80 hover:bg-white'}`}>
                      <input
                        type="radio"
                        name="deleteStrategy"
                        value="cascade"
                        checked={deleteStrategy === 'cascade'}
                        onChange={() => setDeleteStrategy('cascade')}
                        className="mt-0.5 text-red-600 focus:ring-red-500"
                      />
                      <div className="text-slate-800 text-xs">
                        <span className="font-semibold text-red-700 block">Delete Type & Attached Requests</span>
                        <span className="text-slate-500 text-[11px]">Permanently erase "{deleteTypeModal.name}" and remove all {attachedRequests.length} request record(s).</span>
                      </div>
                    </label>

                    {otherTypes.length > 0 && (
                      <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${deleteStrategy === 'reassign' ? 'bg-white border-blue-300 ring-1 ring-blue-200' : 'bg-amber-100/40 border-amber-200/80 hover:bg-white'}`}>
                        <input
                          type="radio"
                          name="deleteStrategy"
                          value="reassign"
                          checked={deleteStrategy === 'reassign'}
                          onChange={() => setDeleteStrategy('reassign')}
                          className="mt-0.5 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1 text-slate-800 text-xs">
                          <span className="font-semibold text-blue-700 block">Reassign Requests & Delete Type</span>
                          <span className="text-slate-500 text-[11px] block mb-2">Move the {attachedRequests.length} request(s) to another leave category:</span>
                          {deleteStrategy === 'reassign' && (
                            <select
                              value={reassignTargetId}
                              onChange={e => setReassignTargetId(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                            >
                              {otherTypes.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                  This action is permanent and cannot be undone. Are you sure you want to proceed?
                </p>
              )}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTypeModal(null)
                    setDeleteTypeError('')
                  }}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                  disabled={isDeletingType}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeletingType}
                  className="flex-1 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 active:scale-98 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isDeletingType ? (
                    <>
                      <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                      <span>Deleting...</span>
                    </>
                  ) : attachedRequests.length > 0 ? (
                    deleteStrategy === 'reassign' ? 'Reassign & Delete' : 'Delete & Clear Requests'
                  ) : (
                    'Delete Type'
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
