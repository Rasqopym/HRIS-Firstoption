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
        // Fetch leave types
        const { data: typesData, error: typesError } = await supabase
          .from('leave_types')
          .select('id, name, annual_entitlement_days, is_paid, requires_document')

        if (typesError) throw typesError

        const mappedTypes: LeaveType[] = (typesData || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          entitlementDays: t.annual_entitlement_days,
          paid: t.is_paid,
          requiresDocument: t.requires_document,
        }))
        setLeaveTypes(mappedTypes)

        // Set default leave type
        if (mappedTypes.length > 0 && !form.type) {
          setForm(f => ({ ...f, type: mappedTypes[0].id }))
        }

        // Fetch approved leave requests for this year (for balance computation)
        const { data: approvedRequests, error: approvedError } = await supabase
          .from('leave_requests')
          .select('leave_type_id, start_date, end_date')
          .eq('staff_id', staff.id)
          .eq('status', 'approved')
          .gte('start_date', yearStart)
          .lte('start_date', yearEnd)

        if (approvedError) throw approvedError

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

        // Fetch all leave requests for history
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
            leave_types (name)
          `)
          .eq('staff_id', staff.id)
          .order('created_at', { ascending: false })

        if (requestsError) throw requestsError

        const mappedRequests: LeaveRequest[] = (requestsData || []).map((r: any) => {
          const startDate = r.start_date
          const endDate = r.end_date
          const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
          return {
            id: r.id,
            staffId: r.staff_id,
            staffName: '',
            staffPhoto: '',
            department: '',
            type: r.leave_types?.name || 'Unknown',
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
        setRequests(mappedRequests)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leave data')
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
    try {
      const { error } = await supabase
        .from('leave_requests')
        .insert({
          staff_id: staff.id,
          leave_type_id: form.type,
          start_date: form.start,
          end_date: form.end,
          reason: form.reason,
          status: 'pending',
        })

      if (error) throw error

      // Refresh data
      const fetchData = async () => {
        if (!staff) return

        // Re-fetch approved requests for balances
        const { data: approvedRequests } = await supabase
          .from('leave_requests')
          .select('leave_type_id, start_date, end_date')
          .eq('staff_id', staff.id)
          .eq('status', 'approved')
          .gte('start_date', yearStart)
          .lte('start_date', yearEnd)

        const computedBalances = leaveTypes.map(type => {
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

        // Re-fetch all requests
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

        const mappedRequests: LeaveRequest[] = (requestsData || []).map((r: any) => {
          const startDate = r.start_date
          const endDate = r.end_date
          const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
          return {
            id: r.id,
            staffId: r.staff_id,
            staffName: '',
            staffPhoto: '',
            department: '',
            type: r.leave_types?.name || 'Unknown',
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
        setRequests(mappedRequests)
      }

      await fetchData()
      setSubmitted(true)
    } catch (err) {
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
