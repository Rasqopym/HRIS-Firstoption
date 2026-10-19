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

  // Cadre determination: Automatically linked to Salary Template / Structure, Job Grade, Gross Salary, or Title
  const staffSalaryTemplate = typeof window !== 'undefined'
    ? localStorage.getItem(`hris_staff_salary_template_${staff?.id}`) ||
      localStorage.getItem(`hris_staff_salary_template_${staff?.staff_code}`) ||
      (staff as any)?.salary_template || ''
    : (staff as any)?.salary_template || ''

  const staffJobGrade = (staff as any)?.job_grade || (typeof window !== 'undefined'
    ? localStorage.getItem(`hris_staff_job_grade_${staff?.id}`) || ''
    : '')

  const isSeniorStaff = Boolean(
    // A. Explicit Salary Template Name (from Salary Structure Defaults, e.g. "Senior Staff", "Executive")
    /(senior|executive|management|lead|director)/i.test(staffSalaryTemplate) ||
    // B. Job Grade from Salary Structure (e.g. Grade 9-12, Grade 7-8)
    /(grade\s*(7|8|9|10|11|12|[7-9]\d*)|senior|executive)/i.test(staffJobGrade) ||
    // C. Gross Salary from Salary Structure (Senior benchmark >= ₦200,000)
    Number(staff?.gross_salary || 0) >= 200000 ||
    // D. Job Title / Role Keywords Fallback
    /(director|manager|lead|senior|head|executive|principal|chief|supervisor|partner|officer)/i.test(staff?.job_title || '')
  )
  const cadreLabel = isSeniorStaff ? 'Senior Staff' : 'Junior Staff'

  // Tenure & Confirmation: 1 full year service (365 days) + confirmed staff
  const isConfirmed = Boolean(staff?.is_confirmed)
  let tenureDays = 0
  let tenureYears = 0
  let tenureMonths = 0
  if (staff?.date_employed) {
    const empDate = new Date(staff.date_employed)
    const now = new Date()
    tenureDays = Math.max(0, Math.floor((now.getTime() - empDate.getTime()) / (1000 * 60 * 60 * 24)))
    tenureYears = Math.floor(tenureDays / 365)
    tenureMonths = Math.floor((tenureDays % 365) / 30)
  }
  const hasOneYearTenure = tenureDays >= 365
  const isBonusEligible = isConfirmed && hasOneYearTenure

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

        // 1. Exclude AWOL (Absence Without Official Leave) - strictly administrative/disciplinary, hidden from staff
        mappedTypes = mappedTypes.filter(t => {
          const n = t.name.toLowerCase()
          return !n.includes('awol') && !n.includes('absence without')
        })

        const seniorType = mappedTypes.find(t => t.name.toLowerCase().includes('senior') && t.name.toLowerCase().includes('annual'))
        const juniorType = mappedTypes.find(t => t.name.toLowerCase().includes('junior') && t.name.toLowerCase().includes('annual'))
        const dynamicAnnualDays = isSeniorStaff
          ? (seniorType?.entitlementDays ?? 21)
          : (juniorType?.entitlementDays ?? 12)

        // 2. Filter cadre-specific annual leave types if present
        mappedTypes = mappedTypes.filter(t => {
          const n = t.name.toLowerCase()
          if (n.includes('senior') && n.includes('annual')) {
            return isSeniorStaff
          }
          if (n.includes('junior') && n.includes('annual')) {
            return !isSeniorStaff
          }
          return true
        })

        // 3. Adapt Annual Leave entitlement and label according to cadre (Senior vs Junior)
        mappedTypes = mappedTypes.map(t => {
          const n = t.name.toLowerCase()
          if (n.includes('annual')) {
            const isSen = n.includes('senior')
            const isJun = n.includes('junior')
            const entDays = isSen ? (seniorType?.entitlementDays ?? 21) : isJun ? (juniorType?.entitlementDays ?? 12) : dynamicAnnualDays
            return {
              ...t,
              name: isSeniorStaff ? 'Annual Leave (Senior Staff)' : 'Annual Leave (Junior Staff)',
              entitlementDays: entDays,
            }
          }
          return t
        })

        if (mappedTypes.length === 0) {
          mappedTypes = [
            { id: isSeniorStaff ? 'annual-leave-senior' : 'annual-leave-junior', name: isSeniorStaff ? 'Annual Leave (Senior Staff)' : 'Annual Leave (Junior Staff)', entitlementDays: dynamicAnnualDays, paid: true, requiresDocument: false },
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

      {/* Cadre & Leave Bonus Eligibility Banner */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start md:items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${isSeniorStaff ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
              {isSeniorStaff ? 'SR' : 'JR'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800 text-sm">{staff?.full_name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${isSeniorStaff ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                  {cadreLabel} ({annualLeaveDays} Days Annual Leave)
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${isConfirmed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                  {isConfirmed ? 'Confirmed Staff' : 'Under Probation'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <span>Role: <strong className="text-slate-700">{staff?.job_title || 'Staff Member'}</strong></span>
                <span>•</span>
                <span>Tenure: <strong className="text-slate-700">{tenureYears > 0 ? `${tenureYears} yr${tenureYears > 1 ? 's' : ''} ` : ''}{tenureMonths} mo(s)</strong> ({staff?.date_employed ? new Date(staff.date_employed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'})</span>
              </div>
            </div>
          </div>

          <div className={`p-3 rounded-xl border flex items-center gap-3 text-xs ${isBonusEligible ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-none ${isBonusEligible ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div className="font-semibold flex items-center gap-1.5">
                <span>Annual Leave Bonus (1 Month Basic):</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${isBonusEligible ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-700'}`}>
                  {isBonusEligible ? 'ELIGIBLE' : 'NOT YET ELIGIBLE'}
                </span>
              </div>
              <p className="text-[11px] mt-0.5 text-slate-600">
                {isBonusEligible
                  ? 'Bonus equivalent to 1 full month basic salary will be paid with payroll when you take approved Annual Leave (once per calendar year).'
                  : !isConfirmed && !hasOneYearTenure
                  ? 'Requires both Staff Confirmation and at least 1 full year of continuous service.'
                  : !isConfirmed
                  ? 'Staff confirmation is required to qualify for leave bonus.'
                  : `Requires at least 1 full year of service (${Math.max(0, 365 - tenureDays)} days remaining).`}
              </p>
            </div>
          </div>
        </div>
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
