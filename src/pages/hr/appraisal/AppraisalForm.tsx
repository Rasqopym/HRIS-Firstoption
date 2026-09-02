import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import type { Page } from '../../../types'
import {
  CATEGORIES_360, DEPARTMENT_KPIS, SELF_APPRAISAL_QUESTIONS,
  SUPERVISOR_AREAS, QUALITATIVE_QUESTIONS, RATING_OPTIONS,
  SECTION_WEIGHTS, calc360CategoryAvg, calc360OverallAvg,
  calcKPIWeightedAvg, calcSupervisorAvg, calcFinalScore,
  getClassification
} from './appraisalData'

interface Props {
  onNavigate?: (p: Page) => void
  employeeId?: string
  cycleId?: string
  reviewerId?: string
  section?: string
}

type TabKey = '360' | 'kpi' | 'self' | 'supervisor' | 'qualitative'

const TABS: { key: TabKey; label: string }[] = [
  { key: '360', label: '360° Assessment' },
  { key: 'kpi', label: 'Role KPIs' },
  { key: 'self', label: 'Self Appraisal' },
  { key: 'supervisor', label: 'Supervisor Assessment' },
  { key: 'qualitative', label: 'Qualitative Feedback' },
]

export default function AppraisalForm({ onNavigate, employeeId, cycleId, reviewerId, section }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>((section as TabKey) || '360')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Cycle & employee selection
  const [cycles, setCycles] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [selCycleId, setSelCycleId] = useState(cycleId || '')
  const [selEmployeeId, setSelEmployeeId] = useState(employeeId || '')
  const [selReviewerId, setSelReviewerId] = useState(reviewerId || '')

  // 360° state
  const [ratings360, setRatings360] = useState<Record<string, number | null>>({})
  const [comments360, setComments360] = useState<Record<string, string>>({})
  const [collapsed360, setCollapsed360] = useState<Record<string, boolean>>({})

  // KPI state
  const [kpiDept, setKpiDept] = useState('')
  const [kpiRatings, setKpiRatings] = useState<Record<string, number | null>>({})
  const [kpiComments, setKpiComments] = useState<Record<string, string>>({})

  // Self appraisal state
  const [selfResponses, setSelfResponses] = useState<Record<string, string>>({})

  // Supervisor state
  const [supRatings, setSupRatings] = useState<Record<string, number | null>>({})
  const [supComments, setSupComments] = useState<Record<string, string>>({})

  // Qualitative state
  const [qualResponses, setQualResponses] = useState<Record<string, string>>({})

  useEffect(() => { fetchInitial() }, [])
  useEffect(() => { if (selCycleId && selEmployeeId) loadAllResponses() }, [selCycleId, selEmployeeId, selReviewerId])

  const fetchInitial = async () => {
    try {
      const [{ data: cData }, { data: sData }] = await Promise.all([
        supabase.from('appraisal_cycles').select('*').in('status', ['active', 'draft']).order('created_at', { ascending: false }),
        supabase.from('staff').select('id, full_name, email, staff_code, department_id, departments(name)').eq('status', 'active'),
      ])
      setCycles(cData || [])
      setStaffList(sData || [])
      if (!selCycleId && cData && cData.length > 0) setSelCycleId(cData[0].id)
      if (!selReviewerId && sData && sData.length > 0) {
        // Default reviewer to current user's staff record
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const match = (sData || []).find((s: any) => s.email === user.email)
            if (match) setSelReviewerId(match.id)
          }
        } catch {}
      }
    } catch (err) {
      console.error('Error fetching initial data:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadAllResponses = async () => {
    if (!selCycleId || !selEmployeeId) return
    const rid = selReviewerId || selEmployeeId
    try {
      // Load 360
      const { data: d360 } = await supabase.from('appraisal_360_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
      if (d360) { setRatings360(d360.ratings || {}); setComments360(d360.comments || {}) }
      else { setRatings360({}); setComments360({}) }

      // Load KPI
      const { data: dKpi } = await supabase.from('appraisal_kpi_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
      if (dKpi) { setKpiRatings(dKpi.ratings || {}); setKpiComments(dKpi.comments || {}); setKpiDept(dKpi.department_category || '') }
      else { setKpiRatings({}); setKpiComments({}); setKpiDept('') }

      // Load Self
      const { data: dSelf } = await supabase.from('appraisal_self_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).maybeSingle()
      if (dSelf) setSelfResponses(dSelf.responses || {})
      else setSelfResponses({})

      // Load Supervisor
      const { data: dSup } = await supabase.from('appraisal_supervisor_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
      if (dSup) { setSupRatings(dSup.ratings || {}); setSupComments(dSup.comments || {}) }
      else { setSupRatings({}); setSupComments({}) }

      // Load Qualitative
      const { data: dQual } = await supabase.from('appraisal_qualitative_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
      if (dQual) setQualResponses(dQual.responses || {})
      else setQualResponses({})
    } catch (err) {
      console.error('Error loading responses:', err)
    }
  }

  // ── Calculated scores ──────────────────────────────────
  const catAverages360: Record<string, number> = {}
  for (const cat of CATEGORIES_360) {
    catAverages360[cat.key] = calc360CategoryAvg(ratings360, cat.statements.map(s => s.id))
  }
  const overall360 = calc360OverallAvg(catAverages360)
  const weighted360 = overall360 * SECTION_WEIGHTS.section360

  const selectedDeptKpi = DEPARTMENT_KPIS.find(d => d.key === kpiDept)
  const kpiAvg = selectedDeptKpi ? calcKPIWeightedAvg(kpiRatings, selectedDeptKpi.items) : 0
  const weightedKpi = kpiAvg * SECTION_WEIGHTS.kpi

  const supAvg = calcSupervisorAvg(supRatings)
  const weightedSup = supAvg * SECTION_WEIGHTS.supervisor

  const finalScore = calcFinalScore(overall360, kpiAvg, supAvg)
  const classification = getClassification(finalScore)

  // ── Save handlers ──────────────────────────────────────
  const showSaveSuccess = (msg = 'Saved') => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 3000) }

  const save360 = async (submit = false) => {
    if (!selCycleId || !selEmployeeId || !selReviewerId) return
    setSaving(true)
    try {
      const payload = {
        cycle_id: selCycleId, employee_id: selEmployeeId, reviewer_id: selReviewerId,
        ratings: ratings360, comments: comments360,
        category_averages: catAverages360, overall_average: overall360,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_360_responses').select('id')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', selReviewerId).maybeSingle()
      if (ex) await supabase.from('appraisal_360_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_360_responses').insert(payload)
      // Update assignment
      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('section', '360')
      showSaveSuccess(submit ? 'Submitted!' : 'Draft Saved')
    } catch (err) { console.error('Error saving 360:', err) }
    finally { setSaving(false) }
  }

  const saveKpi = async (submit = false) => {
    if (!selCycleId || !selEmployeeId || !selReviewerId || !kpiDept) return
    setSaving(true)
    try {
      const payload = {
        cycle_id: selCycleId, employee_id: selEmployeeId, reviewer_id: selReviewerId,
        department_category: kpiDept, ratings: kpiRatings, comments: kpiComments,
        weighted_average: kpiAvg,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_kpi_responses').select('id')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', selReviewerId).maybeSingle()
      if (ex) await supabase.from('appraisal_kpi_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_kpi_responses').insert(payload)
      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('section', 'kpi')
      showSaveSuccess(submit ? 'Submitted!' : 'Draft Saved')
    } catch (err) { console.error('Error saving KPI:', err) }
    finally { setSaving(false) }
  }

  const saveSelf = async (submit = false) => {
    if (!selCycleId || !selEmployeeId) return
    setSaving(true)
    try {
      const payload = {
        cycle_id: selCycleId, employee_id: selEmployeeId,
        responses: selfResponses,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_self_responses').select('id')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).maybeSingle()
      if (ex) await supabase.from('appraisal_self_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_self_responses').insert(payload)
      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('section', 'self')
      showSaveSuccess(submit ? 'Submitted!' : 'Draft Saved')
    } catch (err) { console.error('Error saving self appraisal:', err) }
    finally { setSaving(false) }
  }

  const saveSupervisor = async (submit = false) => {
    if (!selCycleId || !selEmployeeId || !selReviewerId) return
    setSaving(true)
    try {
      const payload = {
        cycle_id: selCycleId, employee_id: selEmployeeId, reviewer_id: selReviewerId,
        ratings: supRatings, comments: supComments, average_score: supAvg,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_supervisor_responses').select('id')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', selReviewerId).maybeSingle()
      if (ex) await supabase.from('appraisal_supervisor_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_supervisor_responses').insert(payload)
      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('section', 'supervisor')
      showSaveSuccess(submit ? 'Submitted!' : 'Draft Saved')
    } catch (err) { console.error('Error saving supervisor:', err) }
    finally { setSaving(false) }
  }

  const saveQualitative = async (submit = false) => {
    if (!selCycleId || !selEmployeeId || !selReviewerId) return
    setSaving(true)
    try {
      const payload = {
        cycle_id: selCycleId, employee_id: selEmployeeId, reviewer_id: selReviewerId,
        responses: qualResponses,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_qualitative_responses').select('id')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', selReviewerId).maybeSingle()
      if (ex) await supabase.from('appraisal_qualitative_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_qualitative_responses').insert(payload)
      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('section', 'qualitative')
      showSaveSuccess(submit ? 'Submitted!' : 'Draft Saved')
    } catch (err) { console.error('Error saving qualitative:', err) }
    finally { setSaving(false) }
  }

  const generateFinalSummary = async () => {
    if (!selCycleId || !selEmployeeId) return
    setSaving(true)
    try {
      const payload = {
        cycle_id: selCycleId, employee_id: selEmployeeId,
        avg_360: overall360, weighted_360: weighted360,
        avg_kpi: kpiAvg, weighted_kpi: weightedKpi,
        avg_supervisor: supAvg, weighted_supervisor: weightedSup,
        final_score: finalScore,
        classification: classification.label,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_final_summary').select('id')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).maybeSingle()
      if (ex) await supabase.from('appraisal_final_summary').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_final_summary').insert(payload)
      showSaveSuccess('Final Summary Generated!')
    } catch (err) { console.error('Error generating summary:', err) }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  const employeeInfo = staffList.find((s: any) => s.id === selEmployeeId)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-800">Performance Appraisal Form</h1>
        <p className="text-sm text-slate-500 mt-1">Complete the appraisal sections for the selected employee</p>
      </div>

      {/* Selectors */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Appraisal Cycle</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={selCycleId} onChange={e => setSelCycleId(e.target.value)}>
            <option value="">Select cycle...</option>
            {cycles.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Employee Being Appraised</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={selEmployeeId} onChange={e => setSelEmployeeId(e.target.value)}>
            <option value="">Select employee...</option>
            {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.full_name} ({s.staff_code})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Reviewer (You)</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={selReviewerId} onChange={e => setSelReviewerId(e.target.value)}>
            <option value="">Select reviewer...</option>
            {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
      </div>

      {selCycleId && selEmployeeId && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main form area */}
          <div className="flex-1 space-y-4">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'}`}
                >{t.label}</button>
              ))}
            </div>

            {/* ══ TAB: 360° ══ */}
            {activeTab === '360' && (
              <div className="space-y-4">
                {CATEGORIES_360.map(cat => {
                  const isCollapsed = collapsed360[cat.key]
                  const avg = catAverages360[cat.key]
                  return (
                    <div key={cat.key} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                      <button onClick={() => setCollapsed360({ ...collapsed360, [cat.key]: !isCollapsed })}
                        className="w-full flex items-center justify-between px-4 sm:px-6 py-4 hover:bg-slate-50 transition-colors">
                        <h3 className="text-base font-semibold text-slate-800">{cat.label}</h3>
                        <div className="flex items-center gap-3">
                          {avg > 0 && <span className="text-sm font-medium text-blue-600">{avg.toFixed(2)}/5</span>}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            className={`transition-transform ${isCollapsed ? '' : 'rotate-180'}`}><polyline points="6 9 12 15 18 9"/></svg>
                        </div>
                      </button>
                      {!isCollapsed && (
                        <div className="border-t border-slate-100">
                          {cat.statements.map((st, idx) => (
                            <div key={st.id} className={`px-4 sm:px-6 py-4 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                              <p className="text-sm text-slate-700 mb-2 leading-relaxed">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-semibold text-xs mr-2 flex-shrink-0">{st.id}</span>
                                {st.text}
                              </p>
                              <div className="flex flex-col sm:flex-row gap-2 sm:items-center pl-8">
                                <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full sm:w-56 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                  value={ratings360[String(st.id)] ?? ''} onChange={e => setRatings360({ ...ratings360, [String(st.id)]: e.target.value === '' ? null : Number(e.target.value) })}>
                                  <option value="">Select rating...</option>
                                  {RATING_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                                <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[38px] resize-y focus:ring-2 focus:ring-blue-500 outline-none"
                                  placeholder="Optional comment..." rows={1} value={comments360[String(st.id)] || ''}
                                  onChange={e => setComments360({ ...comments360, [String(st.id)]: e.target.value })} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="flex items-center gap-3">
                  <button onClick={() => save360(false)} disabled={saving} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">Save Draft</button>
                  <button onClick={() => save360(true)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50">Submit 360°</button>
                  {saveMsg && <span className="text-emerald-600 text-sm font-medium animate-pulse">✓ {saveMsg}</span>}
                </div>
              </div>
            )}

            {/* ══ TAB: KPI ══ */}
            {activeTab === 'kpi' && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Department / Role Category</label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={kpiDept} onChange={e => setKpiDept(e.target.value)}>
                    <option value="">Select department...</option>
                    {DEPARTMENT_KPIS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </div>
                {selectedDeptKpi && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2">KPI</th>
                            <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2 w-20">Weight</th>
                            <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2 w-40">Rating</th>
                            <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2 w-24">Weighted</th>
                            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2">Evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDeptKpi.items.map((item, idx) => {
                            const r = kpiRatings[item.key]
                            const wc = r && r > 0 ? (r * item.weight / 100) : 0
                            return (
                              <tr key={item.key} className={`border-b border-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                                <td className="px-3 py-3 text-slate-700">{item.label}</td>
                                <td className="px-3 py-3 text-center"><span className="inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">{item.weight}%</span></td>
                                <td className="px-3 py-3 text-center">
                                  <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={r ?? ''} onChange={e => setKpiRatings({ ...kpiRatings, [item.key]: e.target.value === '' ? null : Number(e.target.value) })}>
                                    <option value="">—</option>
                                    {[5,4,3,2,1].map(v => <option key={v} value={v}>{v}</option>)}
                                  </select>
                                </td>
                                <td className="px-3 py-3 text-center font-medium text-slate-700">{wc > 0 ? wc.toFixed(2) : '—'}</td>
                                <td className="px-3 py-3">
                                  <input type="text" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Evidence..." value={kpiComments[item.key] || ''}
                                    onChange={e => setKpiComments({ ...kpiComments, [item.key]: e.target.value })} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <button onClick={() => saveKpi(false)} disabled={saving} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">Save Draft</button>
                      <button onClick={() => saveKpi(true)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50">Submit KPIs</button>
                      {saveMsg && <span className="text-emerald-600 text-sm font-medium animate-pulse">✓ {saveMsg}</span>}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ══ TAB: SELF ══ */}
            {activeTab === 'self' && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-5">
                <h2 className="text-lg font-semibold text-slate-800">Self Appraisal</h2>
                {SELF_APPRAISAL_QUESTIONS.map((q, idx) => (
                  <div key={q.key}>
                    <label className="text-sm font-medium text-slate-700"><span className="text-blue-600 font-semibold mr-1">{idx + 1}.</span>{q.text}</label>
                    <textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[70px] resize-y focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Type your response..." value={selfResponses[q.key] || ''}
                      onChange={e => setSelfResponses({ ...selfResponses, [q.key]: e.target.value })} />
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={() => saveSelf(false)} disabled={saving} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">Save Draft</button>
                  <button onClick={() => saveSelf(true)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50">Submit Self Appraisal</button>
                  {saveMsg && <span className="text-emerald-600 text-sm font-medium animate-pulse">✓ {saveMsg}</span>}
                </div>
              </div>
            )}

            {/* ══ TAB: SUPERVISOR ══ */}
            {activeTab === 'supervisor' && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">Supervisor Assessment</h2>
                {SUPERVISOR_AREAS.map((area, idx) => (
                  <div key={area.key} className={`p-4 rounded-lg ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <p className="text-sm text-slate-700 mb-2 leading-relaxed">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-semibold text-xs mr-2 flex-shrink-0">{idx + 1}</span>
                      {area.label}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center pl-8">
                      <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full sm:w-56 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        value={supRatings[area.key] ?? ''} onChange={e => setSupRatings({ ...supRatings, [area.key]: e.target.value === '' ? null : Number(e.target.value) })}>
                        <option value="">Select rating...</option>
                        {[5,4,3,2,1].map(v => <option key={v} value={v}>{v} — {v === 5 ? 'Excellent' : v === 4 ? 'Very Good' : v === 3 ? 'Good' : v === 2 ? 'Needs Improvement' : 'Poor'}</option>)}
                      </select>
                      <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[38px] resize-y focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Evidence / comments..." rows={1} value={supComments[area.key] || ''}
                        onChange={e => setSupComments({ ...supComments, [area.key]: e.target.value })} />
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={() => saveSupervisor(false)} disabled={saving} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">Save Draft</button>
                  <button onClick={() => saveSupervisor(true)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50">Submit Supervisor Assessment</button>
                  {saveMsg && <span className="text-emerald-600 text-sm font-medium animate-pulse">✓ {saveMsg}</span>}
                </div>
              </div>
            )}

            {/* ══ TAB: QUALITATIVE ══ */}
            {activeTab === 'qualitative' && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-5">
                <h2 className="text-lg font-semibold text-slate-800">Qualitative Feedback</h2>
                {QUALITATIVE_QUESTIONS.map((q, idx) => (
                  <div key={q.key}>
                    <label className="text-sm font-medium text-slate-700"><span className="text-blue-600 font-semibold mr-1">{idx + 1}.</span>{q.text}</label>
                    <textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[70px] resize-y focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Type your response..." value={qualResponses[q.key] || ''}
                      onChange={e => setQualResponses({ ...qualResponses, [q.key]: e.target.value })} />
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={() => saveQualitative(false)} disabled={saving} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">Save Draft</button>
                  <button onClick={() => saveQualitative(true)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50">Submit Qualitative Feedback</button>
                  {saveMsg && <span className="text-emerald-600 text-sm font-medium animate-pulse">✓ {saveMsg}</span>}
                </div>
              </div>
            )}
          </div>

          {/* ── Score Panel (Sidebar) ── */}
          <div className="lg:w-72 flex-shrink-0">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-xl p-5 space-y-4 sticky top-24">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Live Score</h3>
              {employeeInfo && <p className="text-sm text-slate-400">{employeeInfo.full_name}</p>}

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1"><span>360° Assessment</span><span>30%</span></div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold">{overall360.toFixed(2)}</span><span className="text-xs text-slate-400">/5</span>
                    <span className="ml-auto text-sm text-blue-400">{weighted360.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1"><div className="bg-blue-400 h-1.5 rounded-full transition-all" style={{ width: `${(overall360 / 5) * 100}%` }} /></div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Role KPIs</span><span>50%</span></div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold">{kpiAvg.toFixed(2)}</span><span className="text-xs text-slate-400">/5</span>
                    <span className="ml-auto text-sm text-emerald-400">{weightedKpi.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1"><div className="bg-emerald-400 h-1.5 rounded-full transition-all" style={{ width: `${(kpiAvg / 5) * 100}%` }} /></div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Supervisor</span><span>20%</span></div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold">{supAvg.toFixed(2)}</span><span className="text-xs text-slate-400">/5</span>
                    <span className="ml-auto text-sm text-amber-400">{weightedSup.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1"><div className="bg-amber-400 h-1.5 rounded-full transition-all" style={{ width: `${(supAvg / 5) * 100}%` }} /></div>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <div className="text-xs text-slate-400 mb-1">Final Score</div>
                <div className="text-3xl font-bold">{finalScore.toFixed(1)}%</div>
                <span className="inline-flex mt-2 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: classification.bg, color: classification.color }}>
                  {classification.label}
                </span>
              </div>

              <button onClick={generateFinalSummary} disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50 mt-2">
                {saving ? 'Generating...' : 'Generate Final Summary'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
