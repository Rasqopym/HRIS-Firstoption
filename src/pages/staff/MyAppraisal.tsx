import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Page } from '../../types'
import {
  SELF_APPRAISAL_QUESTIONS, CATEGORIES_360, SUPERVISOR_AREAS,
  QUALITATIVE_QUESTIONS, RATING_OPTIONS, DEPARTMENT_KPIS,
  SECTION_WEIGHTS, getClassification,
  calc360CategoryAvg, calc360OverallAvg, calcSupervisorAvg,
  calcKPIWeightedAvg
} from '../hr/appraisal/appraisalData'

interface Props {
  onNavigate?: (p: Page) => void
}

interface CycleInfo {
  id: string
  name: string
  start_date: string
  end_date: string
  status: string
}

interface ReviewAssignment {
  employee_id: string
  employee_name: string
  employee_code: string
  department: string
  sections: { section: string; status: string }[]
}

type MainTab = 'self' | 'reviews' | 'results'
type ReviewSection = '360' | 'kpi' | 'supervisor' | 'qualitative'

const REVIEW_SECTION_LABELS: Record<ReviewSection, string> = {
  '360': '360° Assessment',
  kpi: 'Role KPIs',
  supervisor: 'Supervisor Assessment',
  qualitative: 'Qualitative Feedback',
}

export default function MyAppraisal({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true)
  const [cycles, setCycles] = useState<CycleInfo[]>([])
  const [selectedCycle, setSelectedCycle] = useState('')
  const [staffId, setStaffId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<MainTab>('self')

  // Self-appraisal state
  const [selfResponses, setSelfResponses] = useState<Record<string, string>>({})
  const [selfSubmitted, setSelfSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Summary state
  const [summary, setSummary] = useState<any>(null)
  const [categoryAverages360, setCategoryAverages360] = useState<Record<string, number>>({})

  // Reviews state
  const [reviewAssignments, setReviewAssignments] = useState<ReviewAssignment[]>([])
  const [activeReview, setActiveReview] = useState<string | null>(null) // employee_id being reviewed
  const [activeReviewSection, setActiveReviewSection] = useState<ReviewSection>('360')

  // Review form state — 360°
  const [ratings360, setRatings360] = useState<Record<string, number | null>>({})
  const [comments360, setComments360] = useState<Record<string, string>>({})
  const [collapsed360, setCollapsed360] = useState<Record<string, boolean>>({})

  // Review form state — KPI (for supervisors)
  const [kpiDept, setKpiDept] = useState('')
  const [kpiRatings, setKpiRatings] = useState<Record<string, number | null>>({})
  const [kpiComments, setKpiComments] = useState<Record<string, string>>({})

  // Review form state — Supervisor
  const [supRatings, setSupRatings] = useState<Record<string, number | null>>({})
  const [supComments, setSupComments] = useState<Record<string, string>>({})

  // Review form state — Qualitative
  const [qualResponses, setQualResponses] = useState<Record<string, string>>({})

  useEffect(() => { resolveStaffAndCycles() }, [])

  useEffect(() => {
    if (selectedCycle && staffId) {
      loadSelfAppraisal()
      loadSummary()
      loadReviewAssignments()
    }
  }, [selectedCycle, staffId])

  useEffect(() => {
    if (activeReview && staffId && selectedCycle) loadReviewFormData()
  }, [activeReview, activeReviewSection])

  const showSaved = (msg = 'Saved') => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 3000) }

  const resolveStaffAndCycles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let sid: string | null = null
      const { data: byProfile } = await supabase.from('staff').select('id')
        .or(`profile_id.eq.${user.id},id.eq.${user.id}`).maybeSingle()
      if (byProfile) sid = byProfile.id

      if (!sid && user.email) {
        const { data: byEmail } = await supabase.from('staff').select('id')
          .ilike('email', `%${user.email}%`).maybeSingle()
        if (byEmail) sid = byEmail.id
      }
      setStaffId(sid)

      if (sid) {
        const { data: assignments } = await supabase.from('appraisal_assignments').select('cycle_id')
          .or(`employee_id.eq.${sid},reviewer_id.eq.${sid}`)
        const cycleIds = [...new Set((assignments || []).map(a => a.cycle_id))]
        if (cycleIds.length > 0) {
          const { data: cycleData } = await supabase.from('appraisal_cycles').select('*')
            .in('id', cycleIds).order('created_at', { ascending: false })
          setCycles(cycleData || [])
          if (cycleData && cycleData.length > 0) setSelectedCycle(cycleData[0].id)
        }
      }
    } catch (err) { console.error('Error resolving staff/cycles:', err) }
    finally { setLoading(false) }
  }

  // ── Self Appraisal ─────────────────────────────────────
  const loadSelfAppraisal = async () => {
    if (!staffId || !selectedCycle) return
    try {
      const { data } = await supabase.from('appraisal_self_responses').select('*')
        .eq('cycle_id', selectedCycle).eq('employee_id', staffId).maybeSingle()
      if (data) { setSelfResponses(data.responses || {}); setSelfSubmitted(!!data.submitted_at) }
      else { setSelfResponses({}); setSelfSubmitted(false) }
    } catch (err) { console.error('Error loading self:', err) }
  }

  const handleSaveSelf = async (submit = false) => {
    if (!staffId || !selectedCycle) return
    setSaving(true)
    try {
      const payload = {
        cycle_id: selectedCycle, employee_id: staffId, responses: selfResponses,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_self_responses').select('id')
        .eq('cycle_id', selectedCycle).eq('employee_id', staffId).maybeSingle()
      if (ex) await supabase.from('appraisal_self_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_self_responses').insert(payload)

      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selectedCycle).eq('employee_id', staffId).eq('section', 'self')
      if (submit) setSelfSubmitted(true)
      showSaved(submit ? 'Submitted!' : 'Draft Saved')
    } catch (err) { console.error('Error saving self:', err) }
    finally { setSaving(false) }
  }

  // ── Summary / Results ──────────────────────────────────
  const loadSummary = async () => {
    if (!staffId || !selectedCycle) return
    try {
      const { data: sumData } = await supabase.from('appraisal_final_summary').select('*')
        .eq('cycle_id', selectedCycle).eq('employee_id', staffId).maybeSingle()
      setSummary(sumData)

      const { data: r360 } = await supabase.from('appraisal_360_responses').select('category_averages, overall_average')
        .eq('cycle_id', selectedCycle).eq('employee_id', staffId)
      if (r360 && r360.length > 0) {
        const blended: Record<string, number[]> = {}
        for (const r of r360) {
          const ca = r.category_averages || {}
          for (const [key, val] of Object.entries(ca)) {
            if (!blended[key]) blended[key] = []
            if (typeof val === 'number' && val > 0) blended[key].push(val)
          }
        }
        const avgMap: Record<string, number> = {}
        for (const [key, vals] of Object.entries(blended)) {
          avgMap[key] = vals.reduce((s, v) => s + v, 0) / vals.length
        }
        setCategoryAverages360(avgMap)
      }
    } catch (err) { console.error('Error loading summary:', err) }
  }

  // ── Reviews to Complete ────────────────────────────────
  const loadReviewAssignments = async () => {
    if (!staffId || !selectedCycle) return
    try {
      const { data: assignments } = await supabase.from('appraisal_assignments').select('*')
        .eq('cycle_id', selectedCycle).eq('reviewer_id', staffId)
        .in('section', ['360', 'kpi', 'supervisor', 'qualitative'])

      if (!assignments || assignments.length === 0) { setReviewAssignments([]); return }

      const empIds = [...new Set(assignments.map(a => a.employee_id))]
      const { data: empData } = await supabase.from('staff')
        .select('id, full_name, staff_code, departments(name)')
        .in('id', empIds)

      const empMap = new Map((empData || []).map(e => [e.id, e]))
      const grouped: Record<string, ReviewAssignment> = {}

      for (const a of assignments) {
        if (a.employee_id === staffId) continue // skip self-assignments in reviews tab
        if (!grouped[a.employee_id]) {
          const emp = empMap.get(a.employee_id)
          grouped[a.employee_id] = {
            employee_id: a.employee_id,
            employee_name: emp?.full_name || 'Unknown',
            employee_code: emp?.staff_code || '',
            department: (emp?.departments as any)?.name || '',
            sections: [],
          }
        }
        grouped[a.employee_id].sections.push({ section: a.section, status: a.status })
      }
      setReviewAssignments(Object.values(grouped))
    } catch (err) { console.error('Error loading review assignments:', err) }
  }

  const loadReviewFormData = async () => {
    if (!activeReview || !staffId || !selectedCycle) return
    try {
      if (activeReviewSection === '360') {
        const { data } = await supabase.from('appraisal_360_responses').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
        setRatings360(data?.ratings || {}); setComments360(data?.comments || {}); setCollapsed360({})
      } else if (activeReviewSection === 'kpi') {
        const { data } = await supabase.from('appraisal_kpi_responses').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
        setKpiRatings(data?.ratings || {})
        setKpiComments(data?.comments || {})
        setKpiDept(data?.department_category || '')
      } else if (activeReviewSection === 'supervisor') {
        const { data } = await supabase.from('appraisal_supervisor_responses').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
        setSupRatings(data?.ratings || {}); setSupComments(data?.comments || {})
      } else if (activeReviewSection === 'qualitative') {
        const { data } = await supabase.from('appraisal_qualitative_responses').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
        setQualResponses(data?.responses || {})
      }
    } catch (err) { console.error('Error loading review data:', err) }
  }

  const saveReview360 = async (submit = false) => {
    if (!activeReview || !staffId || !selectedCycle) return
    setSaving(true)
    try {
      const catAvgs: Record<string, number> = {}
      for (const cat of CATEGORIES_360) {
        catAvgs[cat.key] = calc360CategoryAvg(ratings360, cat.statements.map(s => s.id))
      }
      const overall = calc360OverallAvg(catAvgs)
      const payload = {
        cycle_id: selectedCycle, employee_id: activeReview, reviewer_id: staffId,
        ratings: ratings360, comments: comments360,
        category_averages: catAvgs, overall_average: overall,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_360_responses').select('id')
        .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
      if (ex) await supabase.from('appraisal_360_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_360_responses').insert(payload)
      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).eq('section', '360')
      showSaved(submit ? 'Submitted!' : 'Draft Saved')
      if (submit) loadReviewAssignments()
    } catch (err) { console.error('Error saving 360:', err) }
    finally { setSaving(false) }
  }

  const saveReviewKpi = async (submit = false) => {
    if (!activeReview || !staffId || !selectedCycle || !kpiDept) return
    setSaving(true)
    try {
      const selectedDept = DEPARTMENT_KPIS.find(d => d.key === kpiDept)
      const kpiAvg = selectedDept ? calcKPIWeightedAvg(kpiRatings, selectedDept.items) : 0
      const payload = {
        cycle_id: selectedCycle, employee_id: activeReview, reviewer_id: staffId,
        department_category: kpiDept, ratings: kpiRatings, comments: kpiComments,
        weighted_average: kpiAvg,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_kpi_responses').select('id')
        .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
      if (ex) await supabase.from('appraisal_kpi_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_kpi_responses').insert(payload)
      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).eq('section', 'kpi')
      showSaved(submit ? 'Submitted!' : 'Draft Saved')
      if (submit) loadReviewAssignments()
    } catch (err) { console.error('Error saving KPI:', err) }
    finally { setSaving(false) }
  }

  const saveReviewSupervisor = async (submit = false) => {
    if (!activeReview || !staffId || !selectedCycle) return
    setSaving(true)
    try {
      const avg = calcSupervisorAvg(supRatings)
      const payload = {
        cycle_id: selectedCycle, employee_id: activeReview, reviewer_id: staffId,
        ratings: supRatings, comments: supComments, average_score: avg,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_supervisor_responses').select('id')
        .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
      if (ex) await supabase.from('appraisal_supervisor_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_supervisor_responses').insert(payload)
      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).eq('section', 'supervisor')
      showSaved(submit ? 'Submitted!' : 'Draft Saved')
      if (submit) loadReviewAssignments()
    } catch (err) { console.error('Error saving supervisor:', err) }
    finally { setSaving(false) }
  }

  const saveReviewQualitative = async (submit = false) => {
    if (!activeReview || !staffId || !selectedCycle) return
    setSaving(true)
    try {
      const payload = {
        cycle_id: selectedCycle, employee_id: activeReview, reviewer_id: staffId,
        responses: qualResponses,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_qualitative_responses').select('id')
        .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
      if (ex) await supabase.from('appraisal_qualitative_responses').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_qualitative_responses').insert(payload)
      await supabase.from('appraisal_assignments').update({ status: submit ? 'complete' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).eq('section', 'qualitative')
      showSaved(submit ? 'Submitted!' : 'Draft Saved')
      if (submit) loadReviewAssignments()
    } catch (err) { console.error('Error saving qualitative:', err) }
    finally { setSaving(false) }
  }

  // ── Render helpers ─────────────────────────────────────
  const sectionStatus = (sections: { section: string; status: string }[], key: string) => {
    const s = sections.find(x => x.section === key)
    return s?.status || 'not_started'
  }

  const statusDot = (status: string) => {
    const colors: Record<string, string> = { not_started: 'bg-slate-300', in_progress: 'bg-amber-400', complete: 'bg-emerald-500' }
    return <span className={`w-2.5 h-2.5 rounded-full inline-block ${colors[status] || 'bg-slate-300'}`} />
  }

  const pendingCount = reviewAssignments.reduce((count, r) => {
    return count + r.sections.filter(s => s.status !== 'complete').length
  }, 0)

  const selectedDeptKpi = DEPARTMENT_KPIS.find(d => d.key === kpiDept)
  const currentKpiAvg = selectedDeptKpi ? calcKPIWeightedAvg(kpiRatings, selectedDeptKpi.items) : 0

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!staffId) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6"/></svg>
          </div>
          <h3 className="font-display font-semibold text-slate-600 text-lg">No Staff Record Found</h3>
          <p className="text-slate-400 text-sm mt-1">Your account is not linked to a staff record.</p>
        </div>
      </div>
    )
  }

  if (cycles.length === 0) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-800">My Performance Appraisal</h1>
          <p className="text-sm text-slate-500 mt-1">View and complete your performance appraisals</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6"/></svg>
          </div>
          <h3 className="font-display font-semibold text-slate-600 text-lg">No Appraisals Assigned</h3>
          <p className="text-slate-400 text-sm mt-1">You have not been assigned to any appraisal cycle yet.</p>
        </div>
      </div>
    )
  }

  const selectedCycleInfo = cycles.find(c => c.id === selectedCycle)
  const classInfo = summary ? getClassification(summary.final_score || 0) : null
  const activeReviewInfo = reviewAssignments.find(r => r.employee_id === activeReview)

  // Available sections for active review
  const availableReviewSections = activeReviewInfo
    ? (['360', 'kpi', 'supervisor', 'qualitative'] as ReviewSection[]).filter(sec =>
        activeReviewInfo.sections.some(s => s.section === sec)
      )
    : []

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-800">My Performance Appraisal</h1>
          <p className="text-sm text-slate-500 mt-1">Complete your self-appraisal, review assigned colleagues, and view your results</p>
        </div>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full sm:w-auto focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}>
          {cycles.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
        </select>
      </div>

      {/* Cycle Info Bar */}
      {selectedCycleInfo && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-4 text-sm">
          <div><span className="text-slate-400">Period:</span> <span className="font-medium text-slate-700">{selectedCycleInfo.name}</span></div>
          <div><span className="text-slate-400">Dates:</span> <span className="font-medium text-slate-700">{new Date(selectedCycleInfo.start_date).toLocaleDateString()} – {new Date(selectedCycleInfo.end_date).toLocaleDateString()}</span></div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            selectedCycleInfo.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
            selectedCycleInfo.status === 'closed' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
          }`}>{selectedCycleInfo.status.charAt(0).toUpperCase() + selectedCycleInfo.status.slice(1)}</span>
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setActiveTab('self'); setActiveReview(null) }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'self' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'}`}>
          Self Appraisal
        </button>
        <button onClick={() => { setActiveTab('reviews'); setActiveReview(null) }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${activeTab === 'reviews' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'}`}>
          Reviews to Complete
          {pendingCount > 0 && (
            <span className={`absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${
              activeTab === 'reviews' ? 'bg-white text-blue-600' : 'bg-red-500 text-white'
            }`}>{pendingCount}</span>
          )}
        </button>
        <button onClick={() => { setActiveTab('results'); setActiveReview(null) }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'results' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'}`}>
          My Results
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: SELF APPRAISAL                                 */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'self' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Self Appraisal</h2>
              <p className="text-sm text-slate-500 mt-0.5">Reflect on your own performance during this appraisal period</p>
            </div>
            {selfSubmitted && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                Submitted
              </span>
            )}
          </div>

          {SELF_APPRAISAL_QUESTIONS.map((q, idx) => (
            <div key={q.key} className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-semibold text-xs mr-2">{idx + 1}</span>
                {q.text}
              </label>
              <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Type your response here..." value={selfResponses[q.key] || ''}
                onChange={e => setSelfResponses({ ...selfResponses, [q.key]: e.target.value })}
                disabled={selfSubmitted} />
            </div>
          ))}

          {!selfSubmitted && (
            <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
              <button onClick={() => handleSaveSelf(false)} disabled={saving}
                className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button onClick={() => { if (confirm('Once submitted, you cannot edit. Continue?')) handleSaveSelf(true) }} disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-50">
                Submit Self Appraisal
              </button>
              {saveMsg && (
                <span className="text-emerald-600 text-sm font-medium animate-pulse inline-flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>{saveMsg}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: REVIEWS TO COMPLETE                            */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'reviews' && !activeReview && (
        <div className="space-y-4">
          {reviewAssignments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h3 className="font-display font-semibold text-slate-600 text-lg">No Pending Reviews</h3>
              <p className="text-slate-400 text-sm mt-1">You don't have any colleague reviews to complete for this cycle.</p>
            </div>
          ) : (
            <>
              <div className="text-sm text-slate-500">
                You have been assigned to review <strong className="text-slate-700">{reviewAssignments.length}</strong> colleague{reviewAssignments.length > 1 ? 's' : ''}. Click on a colleague to open the review form.
              </div>
              {reviewAssignments.map(ra => {
                const allComplete = ra.sections.every(s => s.status === 'complete')
                const isSupervisorReview = ra.sections.some(s => s.section === 'kpi' || s.section === 'supervisor')

                return (
                  <div key={ra.employee_id}
                    onClick={() => {
                      setActiveReview(ra.employee_id)
                      const firstSec = (ra.sections[0]?.section as ReviewSection) || '360'
                      setActiveReviewSection(firstSec)
                    }}
                    className={`bg-white rounded-xl border shadow-sm p-4 sm:p-5 cursor-pointer transition-all hover:shadow-md ${
                      allComplete ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 hover:border-blue-200'
                    }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-800">{ra.employee_name}</h3>
                          <span className="text-xs font-mono text-slate-400">{ra.employee_code}</span>
                          {isSupervisorReview ? (
                            <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Supervisor Review</span>
                          ) : (
                            <span className="text-[11px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Peer Review (360°)</span>
                          )}
                        </div>
                        {ra.department && <p className="text-xs text-slate-500 mt-0.5">{ra.department}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {ra.sections.map(s => (
                          <div key={s.section} className="flex items-center gap-1.5">
                            {statusDot(s.status)}
                            <span className="text-slate-600 font-medium">
                              {REVIEW_SECTION_LABELS[s.section as ReviewSection] || s.section}
                            </span>
                          </div>
                        ))}
                      </div>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-4 text-xs text-slate-500 pt-2">
                <span className="flex items-center gap-1.5">{statusDot('not_started')} Not Started</span>
                <span className="flex items-center gap-1.5">{statusDot('in_progress')} In Progress</span>
                <span className="flex items-center gap-1.5">{statusDot('complete')} Complete</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* REVIEW FORM (inline when reviewing a colleague)     */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'reviews' && activeReview && activeReviewInfo && (
        <div className="space-y-4">
          {/* Back + Employee Header */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <button onClick={() => setActiveReview(null)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back to list
            </button>
            <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
            <div className="flex-1">
              <span className="text-sm text-slate-500">Reviewing:</span>
              <span className="font-semibold text-slate-800 ml-1">{activeReviewInfo.employee_name}</span>
              <span className="text-xs text-slate-400 ml-2 font-mono">{activeReviewInfo.employee_code}</span>
              {activeReviewInfo.department && (
                <span className="text-xs text-slate-500 ml-2">({activeReviewInfo.department})</span>
              )}
            </div>
          </div>

          {/* Dynamic Section Tabs (ONLY sections assigned to this reviewer) */}
          <div className="flex flex-wrap gap-2">
            {availableReviewSections.map(secKey => (
              <button key={secKey} onClick={() => setActiveReviewSection(secKey)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeReviewSection === secKey ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
                }`}>
                {statusDot(sectionStatus(activeReviewInfo.sections, secKey))}
                {REVIEW_SECTION_LABELS[secKey]}
              </button>
            ))}
          </div>

          {/* ── 360° Form ── */}
          {activeReviewSection === '360' && (
            <div className="space-y-4">
              {CATEGORIES_360.map(cat => {
                const isCollapsed = collapsed360[cat.key]
                const avg = calc360CategoryAvg(ratings360, cat.statements.map(s => s.id))
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
                <button onClick={() => saveReview360(false)} disabled={saving}
                  className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">Save Draft</button>
                <button onClick={() => saveReview360(true)} disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50">Submit 360°</button>
                {saveMsg && (
                <span className="text-emerald-600 text-sm font-medium animate-pulse inline-flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>{saveMsg}</span>
                </span>
              )}
              </div>
            </div>
          )}

          {/* ── Role KPIs Form (Supervisor only) ── */}
          {activeReviewSection === 'kpi' && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Role-Specific KPIs (50% Weight)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Evaluate the key performance metrics relevant to this employee's department/role</p>
                </div>
                {currentKpiAvg > 0 && (
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold self-start sm:self-auto">
                    KPI Average: {currentKpiAvg.toFixed(2)} / 5.0
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Department / Role Category</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={kpiDept} onChange={e => setKpiDept(e.target.value)}>
                  <option value="">Select department category...</option>
                  {DEPARTMENT_KPIS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>

              {selectedDeptKpi && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">KPI</th>
                          <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5 w-20">Weight</th>
                          <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5 w-40">Rating</th>
                          <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5 w-24">Weighted</th>
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Evidence / Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDeptKpi.items.map((item, idx) => {
                          const r = kpiRatings[item.key]
                          const wc = r && r > 0 ? (r * item.weight / 100) : 0
                          return (
                            <tr key={item.key} className={`border-b border-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                              <td className="px-3 py-3 text-slate-700 font-medium">{item.label}</td>
                              <td className="px-3 py-3 text-center"><span className="inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">{item.weight}%</span></td>
                              <td className="px-3 py-3 text-center">
                                <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                  value={r ?? ''} onChange={e => setKpiRatings({ ...kpiRatings, [item.key]: e.target.value === '' ? null : Number(e.target.value) })}>
                                  <option value="">— Select —</option>
                                  {[5,4,3,2,1].map(v => <option key={v} value={v}>{v} — {v === 5 ? 'Excellent' : v === 4 ? 'Very Good' : v === 3 ? 'Good' : v === 2 ? 'Needs Imp.' : 'Poor'}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-3 text-center font-medium text-slate-700">{wc > 0 ? wc.toFixed(2) : '—'}</td>
                              <td className="px-3 py-3">
                                <input type="text" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
                                  placeholder="Evidence / remarks..." value={kpiComments[item.key] || ''}
                                  onChange={e => setKpiComments({ ...kpiComments, [item.key]: e.target.value })} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={() => saveReviewKpi(false)} disabled={saving} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">Save Draft</button>
                    <button onClick={() => saveReviewKpi(true)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50">Submit Role KPIs</button>
                    {saveMsg && (
                <span className="text-emerald-600 text-sm font-medium animate-pulse inline-flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>{saveMsg}</span>
                </span>
              )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Supervisor Assessment Form ── */}
          {activeReviewSection === 'supervisor' && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">Supervisor Assessment (20% Weight)</h2>
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
                <button onClick={() => saveReviewSupervisor(false)} disabled={saving}
                  className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">Save Draft</button>
                <button onClick={() => saveReviewSupervisor(true)} disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50">Submit Supervisor Assessment</button>
                {saveMsg && (
                <span className="text-emerald-600 text-sm font-medium animate-pulse inline-flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>{saveMsg}</span>
                </span>
              )}
              </div>
            </div>
          )}

          {/* ── Qualitative Form ── */}
          {activeReviewSection === 'qualitative' && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-5">
              <h2 className="text-lg font-semibold text-slate-800">Qualitative Feedback</h2>
              {QUALITATIVE_QUESTIONS.map((q, idx) => (
                <div key={q.key}>
                  <label className="text-sm font-medium text-slate-700">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-semibold text-xs mr-2">{idx + 1}</span>
                    {q.text}
                  </label>
                  <textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[70px] resize-y focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Type your response..." value={qualResponses[q.key] || ''}
                    onChange={e => setQualResponses({ ...qualResponses, [q.key]: e.target.value })} />
                </div>
              ))}
              <div className="flex items-center gap-3 pt-2">
                <button onClick={() => saveReviewQualitative(false)} disabled={saving}
                  className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50">Save Draft</button>
                <button onClick={() => saveReviewQualitative(true)} disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50">Submit Qualitative Feedback</button>
                {saveMsg && (
                <span className="text-emerald-600 text-sm font-medium animate-pulse inline-flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>{saveMsg}</span>
                </span>
              )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: MY RESULTS                                     */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'results' && (
        <div className="space-y-6">
          {summary ? (
            <>
              {/* Score Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                  <div className="text-xs text-slate-500 mb-1">360° Assessment</div>
                  <div className="font-display font-bold text-2xl text-slate-800">{(summary.avg_360 || 0).toFixed(2)}<span className="text-sm text-slate-400 font-normal">/5</span></div>
                  <div className="text-xs text-slate-400 mt-0.5">Weighted: {(summary.weighted_360 || 0).toFixed(2)} (30%)</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                  <div className="text-xs text-slate-500 mb-1">Role KPI</div>
                  <div className="font-display font-bold text-2xl text-slate-800">{(summary.avg_kpi || 0).toFixed(2)}<span className="text-sm text-slate-400 font-normal">/5</span></div>
                  <div className="text-xs text-slate-400 mt-0.5">Weighted: {(summary.weighted_kpi || 0).toFixed(2)} (50%)</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                  <div className="text-xs text-slate-500 mb-1">Supervisor</div>
                  <div className="font-display font-bold text-2xl text-slate-800">{(summary.avg_supervisor || 0).toFixed(2)}<span className="text-sm text-slate-400 font-normal">/5</span></div>
                  <div className="text-xs text-slate-400 mt-0.5">Weighted: {(summary.weighted_supervisor || 0).toFixed(2)} (20%)</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                  <div className="text-xs text-slate-500 mb-1">Final Score</div>
                  <div className="font-display font-bold text-2xl text-slate-800">{(summary.final_score || 0).toFixed(1)}%</div>
                  {classInfo && (
                    <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: classInfo.bg, color: classInfo.color }}>
                      {classInfo.label}
                    </span>
                  )}
                </div>
              </div>

              {/* 360° Category Bars */}
              {Object.keys(categoryAverages360).length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">360° Assessment — Category Averages</h3>
                  <div className="space-y-3">
                    {CATEGORIES_360.map(cat => {
                      const avg = categoryAverages360[cat.key] || 0
                      return (
                        <div key={cat.key} className="flex items-center gap-4">
                          <span className="text-sm text-slate-600 w-48 flex-shrink-0 truncate">{cat.label}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(avg / 5) * 100}%` }} />
                          </div>
                          <span className="text-sm font-medium text-slate-700 w-12 text-right">{avg.toFixed(1)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Management Feedback */}
              {(summary.recommended_action || summary.management_comments) && (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Management Feedback</h3>
                  {summary.recommended_action && (
                    <div>
                      <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Recommended Action</div>
                      <p className="text-sm text-slate-700">{summary.recommended_action}</p>
                    </div>
                  )}
                  {summary.management_comments && (
                    <div>
                      <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Management Comments</div>
                      <p className="text-sm text-slate-700">{summary.management_comments}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h3 className="font-display font-semibold text-slate-600 text-lg">Results Not Ready Yet</h3>
              <p className="text-slate-400 text-sm mt-1">Your appraisal results will appear here once all sections are completed and reviewed.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
