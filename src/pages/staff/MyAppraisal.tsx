import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Page } from '../../types'
import { useCurrentStaff } from '../../hooks/useCurrentStaff'
import { getAppraisalTemplates, type AppraisalTemplate } from '../../lib/appraisalManager'
import {
  SELF_APPRAISAL_QUESTIONS, CATEGORIES_360, SUPERVISOR_AREAS,
  QUALITATIVE_QUESTIONS, RATING_OPTIONS, DEPARTMENT_KPIS,
  SECTION_WEIGHTS, getClassification, getKpiItemsForDepartment,
  calc360CategoryAvg, calc360OverallAvg, calcSupervisorAvg,
  calcKPIWeightedAvg, checkCrossDepartmentReview,
  resolveTemplateDeptKpis, templateHasKpiSection,
  getAvailableTemplateDeptCategories
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
type ReviewSection = '360' | 'kpi' | 'supervisor' | 'qualitative' | 'prob_core' | 'prob_attendance' | 'prob_verdict' | string

const REVIEW_SECTION_LABELS: Record<string, string> = {
  '360': '360° Assessment',
  kpi: 'Role KPIs',
  supervisor: 'Supervisor Assessment',
  qualitative: 'Qualitative Feedback',
  prob_core: '1. Learning & Core Skills',
  prob_attendance: '2. Attendance & Discipline',
  prob_verdict: '3. Confirmation Verdict',
}

const STAFF_TEMPLATE_STORAGE_KEY = 'hris_staff_assigned_templates_map'

export const PROBATION_SELF_QUESTIONS = [
  { key: 'prob_milestones', text: '1. Key Milestones & Deliverables: What core responsibilities, key projects, and accomplishments have you delivered during your probation period?' },
  { key: 'prob_skills_tools', text: '2. Tools, Systems & Processes: What company systems, technical tools, SOPs, and departmental workflows have you successfully learned and adopted?' },
  { key: 'prob_challenges', text: '3. Challenges & Problem Solving: What challenges or hurdles did you face during your probation, and what proactive steps did you take to overcome them?' },
  { key: 'prob_team_collab', text: '4. Teamwork & Collaboration: How has your interaction and cross-functional collaboration with your team, supervisor, and peer departments progressed?' },
  { key: 'prob_goals_post_conf', text: '5. Post-Confirmation Commitments: What goals, value-added initiatives, and measurable targets do you plan to drive once fully confirmed?' },
  { key: 'prob_support_needed', text: '6. Support & Training Requirements: What additional resources, mentorship, or skill development do you need from leadership to excel in your role?' },
]

export default function MyAppraisal({ onNavigate }: Props) {
  const { staff, loading: staffLoading } = useCurrentStaff()
  const [loading, setLoading] = useState(true)
  const [cycles, setCycles] = useState<CycleInfo[]>([])
  const [selectedCycle, setSelectedCycle] = useState('')
  const [activeTab, setActiveTab] = useState<MainTab>('self')
  const [allTemplates, setAllTemplates] = useState<AppraisalTemplate[]>([])
  const [staffTemplateMap, setStaffTemplateMap] = useState<Record<string, string>>({})

  // Self-appraisal state
  const [isSelfAppraisee, setIsSelfAppraisee] = useState(false)
  const [selfResponses, setSelfResponses] = useState<Record<string, string>>({})
  const [selfSubmitted, setSelfSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Summary state
  const [summary, setSummary] = useState<any>(null)
  const [categoryAverages360, setCategoryAverages360] = useState<Record<string, number>>({})

  // Reviews state
  const [reviewAssignments, setReviewAssignments] = useState<ReviewAssignment[]>([])
  const [activeReview, setActiveReview] = useState<string | null>(null)
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

  // Review form state — Probation
  const [probRatings, setProbRatings] = useState<Record<string, number | null>>({})
  const [probComments, setProbComments] = useState<Record<string, string>>({})
  const [confirmationVerdict, setConfirmationVerdict] = useState<string>('confirm_full')
  const [confirmationNotes, setConfirmationNotes] = useState<string>('')

  const staffId = staff?.id || null
  const reviewerDept = staff?.department || (staff?.departments as any)?.name || ''

  useEffect(() => {
    fetchInitialCyclesAndTemplates()
  }, [staff])

  useEffect(() => {
    if (selectedCycle && staffId) {
      loadSelfAppraisal()
      loadSummary()
      loadReviewAssignments()
    }
  }, [selectedCycle, staffId])

  useEffect(() => {
    if (!isSelfAppraisee && activeTab === 'self' && reviewAssignments.length > 0) {
      setActiveTab('reviews')
    }
  }, [isSelfAppraisee, reviewAssignments])

  useEffect(() => {
    if (activeReview && staffId && selectedCycle) loadReviewFormData()
  }, [activeReview, activeReviewSection])

  const showSaved = (msg = 'Saved') => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 3000) }

  const fetchInitialCyclesAndTemplates = async () => {
    try {
      setLoading(true)
      // 1. Fetch templates
      const tmpls = await getAppraisalTemplates()
      setAllTemplates(tmpls || [])

      // 2. Fetch local storage mapping
      try {
        const stored = localStorage.getItem(STAFF_TEMPLATE_STORAGE_KEY)
        if (stored) setStaffTemplateMap(JSON.parse(stored))
      } catch {}

      // 3. Fetch cycles
      const { data: cycleData } = await supabase
        .from('appraisal_cycles')
        .select('*')
        .order('created_at', { ascending: false })

      if (cycleData && cycleData.length > 0) {
        setCycles(cycleData)
        if (!selectedCycle) setSelectedCycle(cycleData[0].id)
      } else {
        const defaultCycles: CycleInfo[] = [
          { id: 'cycle-2026-annual', name: 'Annual Performance Review 2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'active' },
          { id: 'cycle-2026-probation', name: 'Probation & Staff Confirmation Review 2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'active' }
        ]
        setCycles(defaultCycles)
        if (!selectedCycle) setSelectedCycle(defaultCycles[0].id)
      }
    } catch (err) {
      console.error('Error fetching appraisal cycles/templates:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Self Appraisal ─────────────────────────────────────
  const loadSelfAppraisal = async () => {
    if (!staffId || !selectedCycle) return
    try {
      // Check if current user is enrolled as appraisee in this cycle
      const { data: selfAssign } = await supabase.from('appraisal_assignments')
        .select('id, section')
        .eq('cycle_id', selectedCycle)
        .eq('employee_id', staffId)
        .limit(1)

      const enrolled = !!(selfAssign && selfAssign.length > 0)
      setIsSelfAppraisee(enrolled)

      if (enrolled) {
        const { data } = await supabase.from('appraisal_self_responses').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', staffId).maybeSingle()
        if (data) { setSelfResponses(data.responses || {}); setSelfSubmitted(!!data.submitted_at) }
        else { setSelfResponses({}); setSelfSubmitted(false) }
      } else {
        setSelfResponses({})
        setSelfSubmitted(false)
      }
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

  const getColleagueTemplate = (empId: string) => {
    const key = `${selectedCycle}_${empId}`
    const tmplId = staffTemplateMap[key] || staffTemplateMap[empId] || ''
    let tmpl = allTemplates.find(t => t.id === tmplId)
    if (!tmpl && (tmplId === 'tmpl-probation' || tmplId === 'tmpl-probation-confirm')) {
      tmpl = allTemplates.find(t => t.frameworkType === 'probation_confirmation')
    }
    if (!tmpl) {
      tmpl = allTemplates.find(t => t.id === 'tmpl-annual-360') || allTemplates[0]
    }
    const isProb = tmpl?.frameworkType === 'probation_confirmation'
    return { tmpl, isProbation: isProb }
  }

  const loadReviewFormData = async () => {
    if (!activeReview || !staffId || !selectedCycle) return
    try {
      const [
        { data: dSup },
        { data: dKpi },
        { data: d360 },
        { data: dQual },
        { data: dSum }
      ] = await Promise.all([
        supabase.from('appraisal_supervisor_responses').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle(),
        supabase.from('appraisal_kpi_responses').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle(),
        supabase.from('appraisal_360_responses').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle(),
        supabase.from('appraisal_qualitative_responses').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle(),
        supabase.from('appraisal_final_summary').select('*')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).maybeSingle()
      ])

      const mergedRatings = { ...(d360?.ratings || {}), ...(dSup?.ratings || {}), ...(dKpi?.ratings || {}) }
      const mergedComments = { ...(d360?.comments || {}), ...(dSup?.comments || {}), ...(dKpi?.comments || {}) }

      setSupRatings(mergedRatings)
      setSupComments(mergedComments)
      setRatings360(mergedRatings)
      setComments360(mergedComments)
      setProbRatings(mergedRatings)
      setProbComments(mergedComments)
      setKpiRatings(dKpi?.ratings || mergedRatings)
      setKpiComments(dKpi?.comments || mergedComments)
      setQualResponses(dQual?.responses || {})

      if (dSum?.recommended_action) setConfirmationVerdict(dSum.recommended_action)
      if (dSum?.management_comments) setConfirmationNotes(dSum.management_comments)
    } catch (err) { console.error('Error loading review data:', err) }
  }

  const saveReviewDynamic = async (submit = false) => {
    if (!activeReview || !staffId || !selectedCycle) return
    setSaving(true)
    try {
      const { tmpl: activeReviewTmpl } = getColleagueTemplate(activeReview)
      const sectionsList = (activeReviewTmpl?.sections && activeReviewTmpl.sections.length > 0)
        ? activeReviewTmpl.sections
        : (allTemplates[0]?.sections || [])

      // Compute dynamic scores
      let compositeScore = 0
      let totalWeight = 0

      for (const sec of sectionsList) {
        const w = sec.weight || 0
        totalWeight += w
        if (sec.key === 'role_kpis' || sec.key === 'department_kpis' || sec.items?.some(it => it.scoringType === 'weighted_kpi')) {
          let kpiAvg = 0
          if (sec.items && sec.items.length > 0) {
            let sum = 0, itemW = 0
            for (const it of sec.items) {
              const k = it.id || it.key
              const r = kpiRatings[k] ?? supRatings[k] ?? 0
              const iw = it.weight || (100 / sec.items.length)
              sum += r * iw
              itemW += iw
            }
            kpiAvg = itemW > 0 ? (sum / itemW) : 0
          } else {
            kpiAvg = selectedDeptKpi ? calcKPIWeightedAvg(kpiRatings, selectedDeptKpi.items) : 0
          }
          compositeScore += (kpiAvg * w / 100)
        } else if (sec.key === 'confirmation_verdict' || sec.id === 'sec-prob-recommendation') {
          const verdictScore = confirmationVerdict === 'confirm_full' ? 5 : confirmationVerdict === 'extend_3m' ? 3 : 2
          compositeScore += (verdictScore * w / 100)
        } else if (sec.items && sec.items.length > 0) {
          let secSum = 0, secW = 0
          for (const it of sec.items) {
            const itemKey = it.id || it.key
            const r = supRatings[itemKey] ?? ratings360[itemKey] ?? probRatings[itemKey] ?? 0
            const iw = it.weight || (100 / sec.items.length)
            secSum += r * iw
            secW += iw
          }
          const secAvg = secW > 0 ? (secSum / secW) : 0
          compositeScore += (secAvg * w / 100)
        }
      }

      const finalPct = Math.min(100, Math.max(0, (compositeScore / 5) * 100))
      const classResult = getClassification(finalPct)

      // 1. Save Supervisor / Custom Responses
      const mergedRatings = { ...kpiRatings, ...supRatings, ...ratings360, ...probRatings }
      const mergedComments = { ...kpiComments, ...supComments, ...comments360, ...probComments }
      const supPayload = {
        cycle_id: selectedCycle, employee_id: activeReview, reviewer_id: staffId,
        ratings: mergedRatings, comments: mergedComments,
        average_score: compositeScore,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: exSup } = await supabase.from('appraisal_supervisor_responses').select('id')
        .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
      if (exSup) await supabase.from('appraisal_supervisor_responses').update(supPayload).eq('id', exSup.id)
      else await supabase.from('appraisal_supervisor_responses').insert(supPayload)

      // 2. Save KPI responses
      if (Object.keys(kpiRatings).length > 0) {
        const kpiPayload = {
          cycle_id: selectedCycle, employee_id: activeReview, reviewer_id: staffId,
          department_category: selectedDeptKpi?.key || 'sales', ratings: kpiRatings, comments: kpiComments,
          weighted_average: compositeScore,
          submitted_at: submit ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }
        const { data: exKpi } = await supabase.from('appraisal_kpi_responses').select('id')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
        if (exKpi) await supabase.from('appraisal_kpi_responses').update(kpiPayload).eq('id', exKpi.id)
        else await supabase.from('appraisal_kpi_responses').insert(kpiPayload)
      }

      // 3. Save Qualitative responses
      if (Object.keys(qualResponses).length > 0) {
        const qualPayload = {
          cycle_id: selectedCycle, employee_id: activeReview, reviewer_id: staffId,
          responses: qualResponses,
          submitted_at: submit ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }
        const { data: exQual } = await supabase.from('appraisal_qualitative_responses').select('id')
          .eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId).maybeSingle()
        if (exQual) await supabase.from('appraisal_qualitative_responses').update(qualPayload).eq('id', exQual.id)
        else await supabase.from('appraisal_qualitative_responses').insert(qualPayload)
      }

      // 4. Update Summary
      await supabase.from('appraisal_final_summary').upsert({
        cycle_id: selectedCycle,
        employee_id: activeReview,
        avg_supervisor: compositeScore,
        weighted_supervisor: compositeScore,
        final_score: finalPct,
        classification: classResult.label,
        recommended_action: confirmationVerdict,
        management_comments: confirmationNotes,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'cycle_id,employee_id' })

      // 5. Update assignment status
      await supabase.from('appraisal_assignments').update({
        status: submit ? 'complete' : 'in_progress',
        updated_at: new Date().toISOString()
      }).eq('cycle_id', selectedCycle).eq('employee_id', activeReview).eq('reviewer_id', staffId)

      showSaved(submit ? 'Review Submitted Successfully!' : 'Draft Saved')
      if (submit) loadReviewAssignments()
    } catch (err) {
      console.error('Error saving dynamic review:', err)
    } finally {
      setSaving(false)
    }
  }

  const saveProbationReview = (submit = false) => saveReviewDynamic(submit)
  const saveReviewCustomFramework = (submit = false) => saveReviewDynamic(submit)
  const saveReview360 = (submit = false) => saveReviewDynamic(submit)
  const saveReviewKpi = (submit = false) => saveReviewDynamic(submit)
  const saveReviewSupervisor = (submit = false) => saveReviewDynamic(submit)
  const saveReviewQualitative = (submit = false) => saveReviewDynamic(submit)

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
  const { tmpl: activeReviewTmplInfo } = activeReviewInfo ? getColleagueTemplate(activeReviewInfo.employee_id) : { tmpl: null }
  const selectedDeptKpi = resolveTemplateDeptKpis(activeReviewTmplInfo, kpiDept || activeReviewInfo?.department || '')
  const currentKpiAvg = selectedDeptKpi ? calcKPIWeightedAvg(kpiRatings, selectedDeptKpi.items) : 0

  // Resolve assigned template for current staff member (only if enrolled as appraisee)
  const tmplKey = `${selectedCycle}_${staffId}`
  const tmplId = staffTemplateMap[tmplKey] || staffTemplateMap[staffId || '']
  let assignedTemplate = isSelfAppraisee ? allTemplates.find(t => t.id === tmplId) : null
  if (isSelfAppraisee && !assignedTemplate && (tmplId === 'tmpl-probation' || tmplId === 'tmpl-probation-confirm')) {
    assignedTemplate = allTemplates.find(t => t.frameworkType === 'probation_confirmation')
  }
  const isProbation = isSelfAppraisee && (assignedTemplate?.frameworkType === 'probation_confirmation' || tmplId === 'tmpl-probation' || tmplId === 'tmpl-probation-confirm')
  const selfQuestionsToUse = isProbation ? PROBATION_SELF_QUESTIONS : SELF_APPRAISAL_QUESTIONS

  // Available sections for active review
  const availableReviewSections = activeReviewInfo
    ? (['360', 'kpi', 'supervisor', 'qualitative'] as ReviewSection[]).filter(sec => {
        if (sec === 'kpi' && activeReviewTmplInfo && !templateHasKpiSection(activeReviewTmplInfo)) {
          return false
        }
        return activeReviewInfo.sections.some(s => s.section === sec)
      })
    : []

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-800">My Performance Appraisal</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSelfAppraisee
              ? 'Complete your self-appraisal, review assigned colleagues, and view your results'
              : 'Complete your assigned colleague reviews and evaluations'}
          </p>
        </div>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full sm:w-auto focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
          value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}>
          {cycles.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
        </select>
      </div>

      {/* Cycle Info Bar */}
      {selectedCycleInfo && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div><span className="text-slate-400">Period:</span> <span className="font-medium text-slate-700">{selectedCycleInfo.name}</span></div>
            <div><span className="text-slate-400">Dates:</span> <span className="font-medium text-slate-700">{new Date(selectedCycleInfo.start_date).toLocaleDateString()} – {new Date(selectedCycleInfo.end_date).toLocaleDateString()}</span></div>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              selectedCycleInfo.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
              selectedCycleInfo.status === 'closed' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}>{selectedCycleInfo.status.charAt(0).toUpperCase() + selectedCycleInfo.status.slice(1)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{isSelfAppraisee ? 'Assigned Questionnaire:' : 'Your Role:'}</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
              isSelfAppraisee
                ? 'bg-blue-50 text-blue-700 border-blue-100'
                : 'bg-purple-50 text-purple-700 border-purple-200'
            }`}>
              {isSelfAppraisee
                ? (assignedTemplate?.name || (isProbation ? 'Probation & Confirmation Review Questionnaire' : 'Standard 360° & Role KPI Appraisal'))
                : (reviewAssignments.length > 0 ? 'Reviewer / Supervisor' : 'Not Enrolled as Appraisee')}
            </span>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex flex-wrap gap-2">
        {isSelfAppraisee && (
          <button onClick={() => { setActiveTab('self'); setActiveReview(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'self' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'}`}>
            {isProbation ? 'Probation Self-Reflection' : 'Self Appraisal'}
          </button>
        )}
        <button onClick={() => { setActiveTab('reviews'); setActiveReview(null) }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${activeTab === 'reviews' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'}`}>
          Reviews to Complete
          {pendingCount > 0 && (
            <span className={`absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${
              activeTab === 'reviews' ? 'bg-white text-blue-600' : 'bg-red-500 text-white'
            }`}>{pendingCount}</span>
          )}
        </button>
        {isSelfAppraisee && (
          <button onClick={() => { setActiveTab('results'); setActiveReview(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'results' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'}`}>
            My Results
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: SELF APPRAISAL                                 */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'self' && (
        !isSelfAppraisee ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h3 className="font-display font-semibold text-slate-800 text-base">No Self-Appraisal Required</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              You are not enrolled as an appraisee in the <strong className="text-slate-700">{selectedCycleInfo?.name}</strong> cycle.
              {reviewAssignments.length > 0 ? ` You have ${reviewAssignments.length} colleague review(s) assigned to you.` : ''}
            </p>
            {reviewAssignments.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setActiveTab('reviews')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors shadow-sm"
                >
                  Go to Reviews to Complete ({pendingCount})
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  {isProbation ? 'Probation Self-Reflection & Confirmation Assessment' : 'Self Appraisal'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {isProbation
                    ? 'Reflect on your probation period milestones, systems mastered, challenges, and support required for confirmation.'
                    : 'Reflect on your own performance, achievements, and development areas during this appraisal period.'}
                </p>
              </div>
              {selfSubmitted && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 self-start sm:self-auto">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  Submitted
                </span>
              )}
            </div>

            {selfQuestionsToUse.map((q, idx) => (
              <div key={q.key} className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block leading-relaxed">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-semibold text-xs mr-2">{idx + 1}</span>
                  {q.text}
                </label>
                <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[90px] resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
        )
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
                You have been assigned to review <strong className="text-slate-700">{reviewAssignments.length}</strong> colleague{reviewAssignments.length > 1 ? 's' : ''}. Click on a colleague to open their review form.
              </div>
              {reviewAssignments.map(ra => {
                const allComplete = ra.sections.every(s => s.status === 'complete')
                const { tmpl: raTmpl, isProbation: isRaProb } = getColleagueTemplate(ra.employee_id)
                const secList = (raTmpl?.sections && raTmpl.sections.length > 0) ? raTmpl.sections : (allTemplates[0]?.sections || [])

                return (
                  <div key={ra.employee_id}
                    onClick={() => {
                      setActiveReview(ra.employee_id)
                      const firstSecKey = secList[0]?.id || secList[0]?.key || (ra.sections[0]?.section as ReviewSection) || '0'
                      setActiveReviewSection(firstSecKey)
                    }}
                    className={`bg-white rounded-xl border shadow-sm p-4 sm:p-5 cursor-pointer transition-all hover:shadow-md ${
                      allComplete ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 hover:border-blue-200'
                    }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-800">{ra.employee_name}</h3>
                          <span className="text-xs font-mono text-slate-400">{ra.employee_code}</span>
                          <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            {raTmpl?.name || (isRaProb ? 'Probation Confirmation Review' : 'Standard Performance Appraisal')}
                          </span>
                        </div>
                        {ra.department && <p className="text-xs text-slate-500 mt-0.5">{ra.department}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {secList.map((s, idx) => (
                          <div key={s.id || s.key || idx} className="flex items-center gap-1.5">
                            {statusDot(allComplete ? 'complete' : 'in_progress')}
                            <span className="text-slate-600 font-medium">
                              {s.title.replace(/^\d+\.\s*/, '')}
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
      {activeTab === 'reviews' && activeReview && activeReviewInfo && (() => {
        const { tmpl: activeReviewTmpl } = getColleagueTemplate(activeReviewInfo.employee_id)
        const targetTmpl = activeReviewTmpl || allTemplates[0]
        const sectionsList = (targetTmpl?.sections && targetTmpl.sections.length > 0)
          ? targetTmpl.sections
          : (allTemplates[0]?.sections || [])

        const currentSec = sectionsList.find(s => (s.id || s.key) === activeReviewSection) || sectionsList[0]
        const curSecKey = currentSec ? (currentSec.id || currentSec.key || '0') : '0'
        const curSecIdx = sectionsList.findIndex(s => (s.id || s.key) === (currentSec?.id || currentSec?.key))
        const isLastSec = curSecIdx >= sectionsList.length - 1

        const isVerdictSec = currentSec && (
          currentSec.key === 'confirmation_verdict' ||
          currentSec.id === 'sec-prob-recommendation' ||
          currentSec.id === 'prob_verdict' ||
          currentSec.title.toLowerCase().includes('recommendation') ||
          currentSec.title.toLowerCase().includes('verdict') ||
          currentSec.title.toLowerCase().includes('confirmation decision')
        )

        const isKpiSec = currentSec && (
          currentSec.key === 'role_kpis' ||
          currentSec.key === 'department_kpis' ||
          currentSec.title.toLowerCase().includes('kpi') ||
          currentSec.title.toLowerCase().includes('role-specific') ||
          currentSec.title.toLowerCase().includes('department & role')
        )

        const isQualSec = currentSec && (
          currentSec.key === 'qualitative' ||
          currentSec.title.toLowerCase().includes('qualitative') ||
          currentSec.title.toLowerCase().includes('cross-feedback') ||
          currentSec.title.toLowerCase().includes('open feedback') ||
          currentSec.items?.some(it => it.type === 'text')
        )

        const is360StandardSec = currentSec && currentSec.key === '360' && (!currentSec.items || currentSec.items.length === 0)

        return (
          <div className="space-y-4">
            {/* Back + Employee Header */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => setActiveReview(null)}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  Back to list
                </button>
                <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
                <div>
                  <span className="text-sm text-slate-500">Reviewing:</span>
                  <span className="font-semibold text-slate-800 ml-1">{activeReviewInfo.employee_name}</span>
                  <span className="text-xs text-slate-400 ml-2 font-mono">{activeReviewInfo.employee_code}</span>
                  {activeReviewInfo.department && (
                    <span className="text-xs text-slate-500 ml-2">({activeReviewInfo.department})</span>
                  )}
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full border self-start sm:self-auto bg-indigo-50 text-indigo-800 border-indigo-200">
                {targetTmpl?.name || 'Standard Performance Appraisal'}
              </span>
            </div>

            {/* Cross-Department Peer Review Context Banner */}
            {(() => {
              const crossCheck = checkCrossDepartmentReview(reviewerDept, activeReviewInfo.department)
              if (!crossCheck.isCrossRef) return null
              return (
                <div className="bg-purple-50 text-purple-900 border border-purple-200 p-3.5 rounded-xl text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-purple-900">
                    <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                    Inter-Departmental Cross-Reference Evaluation
                  </div>
                  <p className="text-purple-700">
                    {crossCheck.rule?.description || `Evaluating cross-departmental collaboration, responsiveness, and operational support.`}
                  </p>
                </div>
              )
            })()}

            {/* Dynamic Section Tabs (Driven 100% by the assigned template's sections) */}
            <div className="flex flex-wrap gap-2">
              {sectionsList.map((sec, sIdx) => {
                const secKey = sec.id || sec.key || String(sIdx)
                const isActive = (activeReviewSection === secKey) || (!sectionsList.some(s => (s.id || s.key) === activeReviewSection) && sIdx === 0)
                return (
                  <button
                    key={sec.id || sec.key || sIdx}
                    onClick={() => setActiveReviewSection(secKey)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-700 hover:bg-slate-100 bg-white border border-slate-200'
                    }`}
                  >
                    <span>{sIdx + 1}. {sec.title.replace(/^\d+\.\s*/, '')}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${isActive ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {sec.weight}%
                    </span>
                  </button>
                )
              })}
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* SECTION RENDERER                                            */}
            {/* ════════════════════════════════════════════════════════════ */}
            {currentSec && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5">
                {/* Section Header */}
                <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{currentSec.title}</h3>
                    {currentSec.description && <p className="text-xs text-slate-600 mt-0.5">{currentSec.description}</p>}
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0 self-start sm:self-auto">
                    Weight: {currentSec.weight}%
                  </span>
                </div>

                {/* ── CASE 1: CONFIRMATION RECOMMENDATION / VERDICT ── */}
                {isVerdictSec && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-2 uppercase tracking-wide">
                        Confirmation Decision
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { key: 'confirm_full', label: 'Full Confirmation of Employment', desc: 'Met or exceeded all probation expectations and core competence.' },
                          { key: 'extend_3m', label: 'Extend Probation (3 Months)', desc: 'Demonstrates promise but requires further improvement in key areas.' },
                          { key: 'extend_1m', label: 'Extend Probation (1 Month)', desc: 'Final review period before making final determination.' },
                          { key: 'pip_required', label: 'Place on Improvement Plan (PIP)', desc: 'Performance is below expected standard; structured guidance required.' },
                          { key: 'terminate', label: 'Do Not Confirm / Conclude Appointment', desc: 'Performance/conduct does not meet organizational requirements.' },
                        ].map(opt => (
                          <label
                            key={opt.key}
                            onClick={() => setConfirmationVerdict(opt.key)}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                              confirmationVerdict === opt.key
                                ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <input
                              type="radio"
                              name="confirmationVerdictStaffDynamic"
                              checked={confirmationVerdict === opt.key}
                              onChange={() => setConfirmationVerdict(opt.key)}
                              className="mt-1 text-purple-600 focus:ring-purple-500"
                            />
                            <div>
                              <div className="text-sm font-bold text-slate-800">{opt.label}</div>
                              <div className="text-xs text-slate-500 mt-0.5 leading-snug">{opt.desc}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1 uppercase tracking-wide">
                        Supervisor Summary & Justification
                      </label>
                      <textarea
                        rows={4}
                        className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        placeholder="Detail specific milestones, strengths observed, areas needing development, and rationale for confirmation verdict..."
                        value={confirmationNotes}
                        onChange={e => setConfirmationNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* ── CASE 2: ROLE / DEPARTMENT KPIS ── */}
                {isKpiSec && !isVerdictSec && (
                  <div className="space-y-4">
                    {currentSec.items && currentSec.items.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">KPI Item</th>
                              <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5 w-24">Weight</th>
                              <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5 w-44">Rating</th>
                              <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5 w-24">Weighted</th>
                              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Evidence / Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentSec.items.map((item, idx) => {
                              const itemKey = item.id || item.key || `kpi-${idx}`
                              const r = kpiRatings[itemKey] ?? supRatings[itemKey] ?? null
                              const itemWeight = item.weight || (100 / currentSec.items.length)
                              const wc = r && r > 0 ? (r * itemWeight / 100) : 0
                              const commentVal = kpiComments[itemKey] || supComments[itemKey] || ''

                              return (
                                <tr key={itemKey} className={`border-b border-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                                  <td className="px-3 py-3 text-slate-800 font-medium">{item.text || item.label || ''}</td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">{itemWeight}%</span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <select
                                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                                      value={r ?? ''}
                                      onChange={e => {
                                        const val = e.target.value === '' ? null : Number(e.target.value)
                                        setKpiRatings(prev => ({ ...prev, [itemKey]: val }))
                                        setSupRatings(prev => ({ ...prev, [itemKey]: val }))
                                      }}
                                    >
                                      <option value="">— Select —</option>
                                      {[5,4,3,2,1].map(v => (
                                        <option key={v} value={v}>
                                          {v} — {v === 5 ? 'Exceptional (5)' : v === 4 ? 'Very Good (4)' : v === 3 ? 'Meets Standards (3)' : v === 2 ? 'Needs Improvement (2)' : 'Unsatisfactory (1)'}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-3 text-center font-semibold text-slate-700">{wc > 0 ? wc.toFixed(2) : '—'}</td>
                                  <td className="px-3 py-3">
                                    <input
                                      type="text"
                                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
                                      placeholder="Evidence / remarks..."
                                      value={commentVal}
                                      onChange={e => {
                                        const val = e.target.value
                                        setKpiComments(prev => ({ ...prev, [itemKey]: val }))
                                        setSupComments(prev => ({ ...prev, [itemKey]: val }))
                                      }}
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Department / Role Category</label>
                          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                            value={selectedDeptKpi.key} onChange={e => setKpiDept(e.target.value)}>
                            {getAvailableTemplateDeptCategories(targetTmpl).map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                          </select>
                        </div>
                        {selectedDeptKpi && (
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
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── CASE 3: QUALITATIVE FEEDBACK ── */}
                {isQualSec && !isVerdictSec && !isKpiSec && (
                  <div className="space-y-4">
                    {currentSec.items && currentSec.items.length > 0 ? (
                      currentSec.items.map((q, idx) => {
                        const itemKey = q.id || q.key || `qual-${idx}`
                        const currentVal = qualResponses[itemKey] || supComments[itemKey] || ''
                        return (
                          <div key={itemKey} className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-800 block">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-bold text-xs mr-2">{idx + 1}</span>
                              {q.text || q.label || ''}
                            </label>
                            <textarea
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[85px] resize-y focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="Type detailed feedback / observations..."
                              value={currentVal}
                              onChange={e => {
                                const val = e.target.value
                                setQualResponses(prev => ({ ...prev, [itemKey]: val }))
                                setSupComments(prev => ({ ...prev, [itemKey]: val }))
                              }}
                            />
                          </div>
                        )
                      })
                    ) : (
                      QUALITATIVE_QUESTIONS.map((q, idx) => (
                        <div key={q.key} className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-800 block">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-bold text-xs mr-2">{idx + 1}</span>
                            {q.text}
                          </label>
                          <textarea
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[85px] resize-y focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Type your response..."
                            value={qualResponses[q.key] || ''}
                            onChange={e => setQualResponses({ ...qualResponses, [q.key]: e.target.value })}
                          />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── CASE 4: 360° STANDARD ACCORDION ── */}
                {is360StandardSec && !isVerdictSec && !isKpiSec && !isQualSec && (
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
                  </div>
                )}

                {/* ── CASE 5: COMPETENCIES & BEHAVIOURAL / GENERIC CRITERIA ITEMS ── */}
                {!isVerdictSec && !isKpiSec && !isQualSec && !is360StandardSec && currentSec.items && (
                  <div className="space-y-4">
                    {currentSec.items.map((item, idx) => {
                      const itemKey = item.id || item.key || `item-${idx}`
                      const currentRating = supRatings[itemKey] ?? ratings360[itemKey] ?? probRatings[itemKey] ?? null
                      const currentComment = supComments[itemKey] ?? comments360[itemKey] ?? probComments[itemKey] ?? ''

                      return (
                        <div key={itemKey} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-800 leading-snug">
                              <span className="text-blue-600 font-bold mr-1.5">{idx + 1}.</span>
                              {item.text || item.label || ''}
                            </p>
                            <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded shrink-0">
                              Weight: {item.weight || (100 / currentSec.items.length)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div className="sm:col-span-1">
                              <select
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={currentRating ?? ''}
                                onChange={e => {
                                  const val = e.target.value === '' ? null : Number(e.target.value)
                                  setSupRatings(prev => ({ ...prev, [itemKey]: val }))
                                  setRatings360(prev => ({ ...prev, [itemKey]: val }))
                                  setProbRatings(prev => ({ ...prev, [itemKey]: val }))
                                }}
                              >
                                <option value="">Select rating...</option>
                                {[5,4,3,2,1].map(v => (
                                  <option key={v} value={v}>
                                    {v} — {v === 5 ? 'Exceptional (5)' : v === 4 ? 'Very Good (4)' : v === 3 ? 'Meets Standards (3)' : v === 2 ? 'Needs Improvement (2)' : 'Unsatisfactory (1)'}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <input
                                type="text"
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Supervisor / Reviewer observation & evidence..."
                                value={currentComment}
                                onChange={e => {
                                  const val = e.target.value
                                  setSupComments(prev => ({ ...prev, [itemKey]: val }))
                                  setComments360(prev => ({ ...prev, [itemKey]: val }))
                                  setProbComments(prev => ({ ...prev, [itemKey]: val }))
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Navigation and Action Footer */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => saveReviewDynamic(false)}
                    disabled={saving}
                    className="border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Save Draft
                  </button>
                  {!isLastSec ? (
                    <button
                      onClick={() => {
                        saveReviewDynamic(false)
                        const nextSec = sectionsList[curSecIdx + 1]
                        if (nextSec) setActiveReviewSection(nextSec.id || nextSec.key || String(curSecIdx + 1))
                      }}
                      disabled={saving}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50 shadow-sm"
                    >
                      Save & Proceed to Next Section
                    </button>
                  ) : (
                    <button
                      onClick={() => saveReviewDynamic(true)}
                      disabled={saving}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50 shadow-sm"
                    >
                      Submit Full Review
                    </button>
                  )}
                  {saveMsg && (
                    <span className="text-emerald-600 text-sm font-semibold animate-pulse inline-flex items-center gap-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>{saveMsg}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })()}

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
