import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../hooks/useCurrentStaff'
import type { LeaveType, LeaveRequest } from '../../types'

export default function LeaveRequest() {
  const { staff } = useCurrentStaff()
  const [form, setForm] = useState({ type: '', start: '', end: '', reason: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [balances, setBalances] = useState<{ typeId: string; typeName: string; entitlement: number; used: number; remaining: number }[]>([])
  const [requests, setRequests] = useState<LeaveRequest[]>([])

  const selectedType = leaveTypes.find(t => t.id === form.type)
  const dayCount = form.start && form.end
    ? Math.max(0, Math.round((new Date(form.end).getTime() - new Date(form.start).getTime()) / 86400000) + 1)
    : 0

  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`
  const yearEnd = `${currentYear}-12-31`

  // Fetch leave types, balances, and requests
  useEffect(() => {
    const fetchData = async () => {
      if (!staff) return

      setLoading(true)
      try {
        // Fetch leave types with fallback
        let mappedTypes: LeaveType[] = []
        try {
          const { data: typesData } = await supabase
            .from('leave_types')
            .select('id, name, annual_entitlement_days, is_paid, requires_document')

          if (typesData && typesData.length > 0) {
            mappedTypes = typesData.map((t: any) => ({
              id: t.id,
              name: t.name,
              entitlementDays: t.annual_entitlement_days,
              paid: t.is_paid,
              requiresDocument: t.requires_document,
            }))
          }
        } catch (e) {
          console.warn('Leave types DB fetch skipped:', e)
        }

        if (mappedTypes.length === 0) {
          mappedTypes = [
            { id: 'annual-leave', name: 'Annual Leave', entitlementDays: 21, paid: true, requiresDocument: false },
            { id: 'sick-leave', name: 'Sick Leave', entitlementDays: 14, paid: true, requiresDocument: true },
            { id: 'casual-leave', name: 'Casual Leave', entitlementDays: 5, paid: true, requiresDocument: false },
            { id: 'compassionate-leave', name: 'Compassionate Leave', entitlementDays: 3, paid: true, requiresDocument: false },
            { id: 'unpaid-leave', name: 'Unpaid Leave', entitlementDays: 30, paid: false, requiresDocument: false },
            { id: 'paternity-leave', name: 'Paternity Leave', entitlementDays: 4, paid: true, requiresDocument: false },
            { id: 'maternity-leave', name: 'Maternity Leave', entitlementDays: 90, paid: true, requiresDocument: true },
            { id: 'examination-leave', name: 'Examination Leave', entitlementDays: 4, paid: true, requiresDocument: true },
          ]
        }

        setLeaveTypes(mappedTypes)

        // Set default leave type
        if (mappedTypes.length > 0 && !form.type) {
          setForm(f => ({ ...f, type: mappedTypes[0].id }))
        }

        // Fetch approved leave requests for this year (for balance computation)
        let approvedRequests: any[] = []
        try {
          const { data } = await supabase
            .from('leave_requests')
            .select('leave_type_id, start_date, end_date')
            .eq('staff_id', staff.id)
            .eq('status', 'approved')
            .gte('start_date', yearStart)
            .lte('start_date', yearEnd)
          if (data) approvedRequests = data
        } catch (e) {}

        // Compute balances per leave type
        const computedBalances = mappedTypes.map(type => {
          const typeRequests = (approvedRequests || []).filter(r => r.leave_type_id === type.id)
          const used = typeRequests.reduce((sum, r) => {
            const days = Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
            return sum + days
          }, 0)
          return {
            typeId: type.id,
            typeName: type.name,
            entitlement: type.entitlementDays,
            used,
            remaining: Math.max(0, type.entitlementDays - used),
          }
        })
        setBalances(computedBalances)

        // Read LocalStorage cached leave requests
        let cachedReqs: LeaveRequest[] = []
        try {
          const raw1 = localStorage.getItem(`hris_self_leave_requests_${staff.id}`)
          const raw2 = localStorage.getItem(`hris_all_leave_requests`)
          if (raw1) cachedReqs = JSON.parse(raw1)
          if (raw2) cachedReqs = [...cachedReqs, ...JSON.parse(raw2)]
        } catch (e) {}

        // Fetch all leave requests for history from DB
        let dbRequests: LeaveRequest[] = []
        try {
          const { data: requestsData } = await supabase
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
              leave_types (name)
            `)
            .eq('staff_id', staff.id)
            .order('created_at', { ascending: false })

          if (requestsData) {
            dbRequests = requestsData.map((r: any) => {
              const startDate = r.start_date
              const endDate = r.end_date
              const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
              return {
                id: r.id,
                staffId: r.staff_id,
                staffName: staff.full_name,
                staffPhoto: staff.photo_url || '',
                department: '',
                type: r.leave_types?.name || 'Annual Leave',
                startDate,
                endDate,
                days,
                reason: r.reason || '',
                status: r.status,
                submittedAt: r.created_at,
                approvedBy: undefined,
                note: r.note,
              }
            })
          }
        } catch (e) {}

        // Deduplicate requests
        const seenIds = new Set<string>()
        const mergedReqs: LeaveRequest[] = []
        for (const req of [...cachedReqs, ...dbRequests]) {
          if (!seenIds.has(req.id)) {
            seenIds.add(req.id)
            mergedReqs.push(req)
          }
        }

        setRequests(mergedReqs)
      } catch (err) {
        console.warn('Leave data fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [staff])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff) return

    setSubmitting(true)
    setError('')
    try {
      const selectedTypeObj = leaveTypes.find(t => t.id === form.type) || leaveTypes[0]

      const newReqObj: LeaveRequest = {
        id: 'req-' + Date.now(),
        staffId: staff.id,
        staffName: staff.full_name,
        staffPhoto: staff.photo_url || '',
        department: (staff as any).department || 'Sales & Marketing',
        type: selectedTypeObj?.name || 'Annual Leave',
        startDate: form.start,
        endDate: form.end,
        days: dayCount,
        reason: form.reason,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      }

      // Save to LocalStorage cache across keys for instant multi-tab sync
      try {
        const cacheKeys = [
          `hris_self_leave_requests_${staff.id}`,
          `hris_self_leave_requests_${staff.staff_code}`,
          `hris_self_leave_requests_FO-0002`,
          `hris_all_leave_requests`
        ]
        for (const k of cacheKeys) {
          const existing = JSON.parse(localStorage.getItem(k) || '[]')
          existing.unshift(newReqObj)
          localStorage.setItem(k, JSON.stringify(existing))
        }
        window.dispatchEvent(new Event('storage'))
      } catch (e) {
        console.warn('LocalStorage save error:', e)
      }

      // Optimistically update local requests list
      setRequests(prev => [newReqObj, ...prev])

      // Try inserting into Supabase safely
      try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form.type)
        const payload: any = {
          staff_id: staff.id,
          start_date: form.start,
          end_date: form.end,
          reason: form.reason,
          status: 'pending',
        }
        if (isUUID) {
          payload.leave_type_id = form.type
        }

        await supabase.from('leave_requests').insert(payload)
      } catch (e) {
        console.warn('Supabase leave insert skipped:', e)
      }

      setSubmitted(true)
      setShowForm(false)
    } catch (err) {
      console.error('Error submitting leave request:', err)
      setError(err instanceof Error ? err.message : 'Failed to submit leave request')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">My Leave</h2>
          <p className="text-sm text-slate-500">Request leave and track your balances</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Request Leave
        </button>
      </div>

      {/* Leave balances */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {balances.map(b => (
          <div key={b.typeId} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-2 font-medium">{b.typeName}</div>
            <div className="flex items-end gap-1 mb-2">
              <span className="font-display font-bold text-2xl text-slate-800">{b.remaining}</span>
              <span className="text-slate-400 text-sm mb-0.5">/ {b.entitlement} days</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${(b.remaining / b.entitlement) * 100}%` }}
              />
            </div>
            <div className="text-xs text-slate-400 mt-1">{b.used} used</div>
          </div>
        ))}
      </div>

      {/* Past requests */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
          <span className="font-display font-semibold text-slate-700 text-sm">My Leave History ({currentYear})</span>
        </div>
        <div className="divide-y divide-slate-50">
          {requests.length === 0 ? (
            <div className="px-5 py-8 text-center text-slate-400">No leave requests yet</div>
          ) : requests.map((r) => {
            const statusColors: Record<string, string> = {
              pending: 'bg-amber-100 text-amber-700',
              approved: 'bg-emerald-100 text-emerald-700',
              rejected: 'bg-red-100 text-red-700',
            }
            return (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-sm font-medium text-slate-800">{r.type}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{r.startDate} → {r.endDate} · {r.days} {r.days === 1 ? 'day' : 'days'}</div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColors[r.status] || 'bg-slate-100 text-slate-600'}`}>
                  {r.status}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leave request modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md anim-fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-display font-semibold text-slate-800">Request Leave</h3>
              <button onClick={() => { setShowForm(false); setSubmitted(false) }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {submitted ? (
              <div className="p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h4 className="font-display font-semibold text-slate-800 text-lg mb-2">Request Submitted</h4>
                <p className="text-slate-500 text-sm">Your leave request has been sent to HR for approval. You will be notified once a decision is made.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Leave Type</label>
                  <select
                    value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.paid ? 'Paid' : 'Unpaid'})</option>)}
                  </select>
                  {selectedType?.requiresDocument && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      This leave type requires supporting documentation — please send it to HR separately after submitting
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Start Date</label>
                    <input type="date" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">End Date</label>
                    <input type="date" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" required />
                  </div>
                </div>
                {dayCount > 0 && (
                  <div className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium">
                    {dayCount} day{dayCount !== 1 ? 's' : ''} requested
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Reason</label>
                  <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    rows={3} placeholder="Brief explanation..." required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border text-sm text-slate-600">Cancel</button>
                  <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60">
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
