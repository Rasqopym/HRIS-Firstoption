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
            staffName: r.staff.full_name,
            staffPhoto: r.staff.photo_url || '',
            department: r.staff.departments?.name || 'Unknown',
            type: r.leave_types?.name || 'Unknown',
            startDate,
            endDate,
            days,
            reason: r.reason || '',
            status: r.status,
            submittedAt: r.created_at,
            approvedBy,
            note: r.note,
          }
        }))
        setRequests(mappedRequests)
      }

      // Fetch leave_types
      const { data: typesData, error: typesError } = await supabase
        .from('leave_types')
        .select('id, name, annual_entitlement_days, is_paid, requires_document')
      
      if (typesError) {
        console.error('Failed to fetch leave types:', typesError)
      } else if (typesData) {
        const mappedTypes: LeaveType[] = typesData.map((t: any) => ({
          id: t.id,
          name: t.name,
          entitlementDays: t.annual_entitlement_days,
          paid: t.is_paid,
          requiresDocument: t.requires_document,
        }))
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
                  <div className="mt-2 text-xs text-emerald-600">✓ Approved by {r.approvedBy}</div>
                )}
                {r.status === 'rejected' && r.note && (
                  <div className="mt-2 text-xs text-red-600">✗ Rejected: {r.note}</div>
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
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden max-w-2xl">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <h3 className="font-display font-semibold text-slate-700">Leave Types Configuration</h3>
            <button onClick={() => setAddTypeModal(true)} className="text-xs text-blue-600 hover:underline">Add Type</button>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-50">
              <tr>
                {['Leave Type', 'Entitlement (days/yr)', 'Paid', 'Requires Document', ''].map(h => (
                  <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {types.map(t => (
                <tr key={t.id} className="table-row-hover group">
                  <td className="py-3 px-4 font-medium text-slate-800">{t.name}</td>
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
                      className={`text-xs cursor-pointer hover:underline ${t.requiresDocument ? 'text-slate-600' : 'text-slate-400'}`}
                    >
                      {t.requiresDocument ? '✓ Required' : 'Optional'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setDeleteTypeModal({ id: t.id, name: t.name })}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-red-500 transition-all"
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
      {deleteTypeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 anim-fade-up">
            <h3 className="font-display font-semibold text-slate-800 mb-2">Delete Leave Type</h3>
            <p className="text-sm text-slate-600 mb-4">
              Delete "{deleteTypeModal.name}"? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTypeModal(null)} className="flex-1 py-2 rounded-lg border text-sm text-slate-600">Cancel</button>
              <button
                onClick={async () => {
                  const { error } = await supabase
                    .from('leave_types')
                    .delete()
                    .eq('id', deleteTypeModal.id)
                  
                  if (error) {
                    console.error('Failed to delete leave type:', error)
                    if (error.code === '23503') {
                      alert("Can't delete: this leave type has existing requests attached to it")
                    } else {
                      alert('Failed to delete leave type')
                    }
                    return
                  }
                  
                  setTypes(prev => prev.filter(t => t.id !== deleteTypeModal.id))
                  setDeleteTypeModal(null)
                  
                  await logAction({
                    action: 'DELETE',
                    entity: 'LeaveType',
                    details: `Deleted leave type "${deleteTypeModal.name}"`
                  })
                }}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
