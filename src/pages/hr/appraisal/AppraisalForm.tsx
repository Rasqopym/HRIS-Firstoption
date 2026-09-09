import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import type { Page } from '../../../types'
import {
  CATEGORIES_360, DEPARTMENT_KPIS, SELF_APPRAISAL_QUESTIONS,
  SUPERVISOR_AREAS, QUALITATIVE_QUESTIONS, RATING_OPTIONS,
  SECTION_WEIGHTS, calc360CategoryAvg, calc360OverallAvg,
  calcKPIWeightedAvg, calcSupervisorAvg, calcFinalScore,
  getClassification, getKpiItemsForDepartment,
  resolveTemplateDeptKpis, templateHasKpiSection,
  getAvailableTemplateDeptCategories
} from './appraisalData'
import { getAppraisalTemplates, type AppraisalTemplate } from '../../../lib/appraisalManager'

interface Props {
  onNavigate?: (p: Page) => void
  employeeId?: string
  cycleId?: string
  reviewerId?: string
  section?: string
}

const STAFF_TEMPLATE_STORAGE_KEY = 'hris_staff_assigned_templates_map'

export default function AppraisalForm({ onNavigate, employeeId, cycleId, reviewerId, section }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Cycle & employee selection
  const [cycles, setCycles] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [systemDepartments, setSystemDepartments] = useState<{ id: string; name: string }[]>([])
  const [allTemplates, setAllTemplates] = useState<AppraisalTemplate[]>([])
  const [staffTemplateMap, setStaffTemplateMap] = useState<Record<string, string>>({})

  const [selCycleId, setSelCycleId] = useState(cycleId || '')
  const [selEmployeeId, setSelEmployeeId] = useState(employeeId || '')
  const [selReviewerId, setSelReviewerId] = useState(reviewerId || '')

  // Active Template
  const [assignedTemplate, setAssignedTemplate] = useState<AppraisalTemplate | null>(null)
  const [activeTab, setActiveTab] = useState<string>('360')

  // 360° state
  const [ratings360, setRatings360] = useState<Record<string, number | null>>({})
  const [comments360, setComments360] = useState<Record<string, string>>({})
  const [collapsed360, setCollapsed360] = useState<Record<string, boolean>>({})

  // Dynamic / Custom Template Item Ratings & Comments
  // key: itemId -> rating (1-5 or value) / comment
  const [templateItemRatings, setTemplateItemRatings] = useState<Record<string, number | null>>({})
  const [templateItemComments, setTemplateItemComments] = useState<Record<string, string>>({})
  const [confirmationVerdict, setConfirmationVerdict] = useState<string>('confirm_full')
  const [confirmationNotes, setConfirmationNotes] = useState<string>('')

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

  // 1. Initial Load
  useEffect(() => { fetchInitial() }, [])

  // 2. Load responses & template when selection changes
  useEffect(() => {
    if (selCycleId && selEmployeeId) {
      resolveAssignedTemplate()
      loadAllResponses()
    }
  }, [selCycleId, selEmployeeId, selReviewerId, allTemplates, staffTemplateMap])

  const fetchInitial = async () => {
    try {
      const [{ data: cData }, { data: sData }, { data: dData }, tmpls] = await Promise.all([
        supabase.from('appraisal_cycles').select('*').in('status', ['active', 'draft']).order('created_at', { ascending: false }),
        supabase.from('staff').select('id, full_name, email, staff_code, department_id, departments(id, name)').eq('status', 'active'),
        supabase.from('departments').select('id, name').order('name'),
        getAppraisalTemplates(),
      ])
      setCycles(cData || [])
      setStaffList(sData || [])
      setAllTemplates(tmpls || [])

      // Load staff-template mapping from local storage
      try {
        const storedMap = localStorage.getItem(STAFF_TEMPLATE_STORAGE_KEY)
        if (storedMap) {
          setStaffTemplateMap(JSON.parse(storedMap))
        }
      } catch {}

      const depts = dData && dData.length > 0 ? dData : [
        { id: '1', name: 'Sales & Marketing' },
        { id: '2', name: 'Accounting & Finance' },
        { id: '3', name: 'General Operations' },
        { id: '4', name: 'Human Resources' },
        { id: '5', name: 'Media & Marketing' },
        { id: '6', name: 'Technical & Field Services' },
        { id: '7', name: 'Customer Support' },
      ]
      setSystemDepartments(depts)

      const initialCycle = selCycleId || (cData && cData.length > 0 ? cData[0].id : '')
      const initialEmployee = selEmployeeId || (sData && sData.length > 0 ? sData[0].id : '')
      if (!selCycleId && initialCycle) setSelCycleId(initialCycle)
      if (!selEmployeeId && initialEmployee) setSelEmployeeId(initialEmployee)

      if (!selReviewerId && sData && sData.length > 0) {
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

  // Resolve which template applies to (selCycleId, selEmployeeId)
  const resolveAssignedTemplate = () => {
    if (!selCycleId || !selEmployeeId || allTemplates.length === 0) return
    const key = `${selCycleId}_${selEmployeeId}`
    const tmplId = staffTemplateMap[key]

    let found = allTemplates.find(t => t.id === tmplId)
    // Fallback normalizer for 'tmpl-probation' vs 'tmpl-probation-confirm'
    if (!found && (tmplId === 'tmpl-probation' || tmplId === 'tmpl-probation-confirm')) {
      found = allTemplates.find(t => t.frameworkType === 'probation_confirmation')
    }

    // Default to annual-360 if not specified
    if (!found) {
      found = allTemplates.find(t => t.id === 'tmpl-annual-360') || allTemplates[0]
    }

    setAssignedTemplate(found || null)

    // Set default active tab
    if (found?.frameworkType === 'probation_confirmation') {
      setActiveTab('prob_core')
    } else if (found?.frameworkType === 'annual_360') {
      setActiveTab('360')
    } else if (found?.sections && found.sections.length > 0) {
      setActiveTab(found.sections[0].key || found.sections[0].id)
    }

    const emp = staffList.find((s: any) => s.id === selEmployeeId)
    if (emp) {
      const deptName = emp.departments?.name || emp.department || ''
      const autoKpi = getKpiItemsForDepartment(deptName)
      setKpiDept(autoKpi.key)
    }
  }

  const loadAllResponses = async () => {
    if (!selCycleId || !selEmployeeId) return
    const rid = selReviewerId || selEmployeeId
    try {
      // 1. Load 360
      const { data: d360 } = await supabase.from('appraisal_360_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
      if (d360) { setRatings360(d360.ratings || {}); setComments360(d360.comments || {}) }
      else { setRatings360({}); setComments360({}) }

      // 2. Load KPI
      const { data: dKpi } = await supabase.from('appraisal_kpi_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
      if (dKpi) {
        setKpiRatings(dKpi.ratings || {})
        setKpiComments(dKpi.comments || {})
        setKpiDept(dKpi.department_category || '')
      } else {
        setKpiRatings({})
        setKpiComments({})
        const emp = staffList.find((s: any) => s.id === selEmployeeId)
        const deptName = emp?.departments?.name || emp?.department || ''
        const autoKpi = getKpiItemsForDepartment(deptName)
        setKpiDept(autoKpi.key)
      }

      // 3. Load Self
      const { data: dSelf } = await supabase.from('appraisal_self_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).maybeSingle()
      if (dSelf) setSelfResponses(dSelf.responses || {})
      else setSelfResponses({})

      // 4. Load Supervisor & Template Responses
      const { data: dSup } = await supabase.from('appraisal_supervisor_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
      if (dSup) {
        setSupRatings(dSup.ratings || {})
        setSupComments(dSup.comments || {})
        setTemplateItemRatings(dSup.ratings || {})
        setTemplateItemComments(dSup.comments || {})
      } else {
        setSupRatings({})
        setSupComments({})
        setTemplateItemRatings({})
        setTemplateItemComments({})
      }

      // 5. Load Qualitative
      const { data: dQual } = await supabase.from('appraisal_qualitative_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
      if (dQual) setQualResponses(dQual.responses || {})
      else setQualResponses({})

      // 6. Load Summary (Confirmation verdict if stored)
      const { data: dSum } = await supabase.from('appraisal_final_summary').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).maybeSingle()
      if (dSum?.recommended_action) {
        setConfirmationVerdict(dSum.recommended_action)
      }
      if (dSum?.management_comments) {
        setConfirmationNotes(dSum.management_comments)
      }
    } catch (err) {
      console.error('Error loading responses:', err)
    }
  }

  // ── Calculated scores ──────────────────────────────────
  const isProbation = assignedTemplate?.frameworkType === 'probation_confirmation'

  // Standard 360 calculations
  const catAverages360: Record<string, number> = {}
  for (const cat of CATEGORIES_360) {
    catAverages360[cat.key] = calc360CategoryAvg(ratings360, cat.statements.map(s => s.id))
  }
  const overall360 = calc360OverallAvg(catAverages360)
  const weighted360 = overall360 * SECTION_WEIGHTS.section360

  const selEmpObj = staffList.find((s: any) => s.id === selEmployeeId)
  const selEmployeeDept = selEmpObj?.departments?.name || selEmpObj?.department || ''
  const selectedDeptKpi = resolveTemplateDeptKpis(assignedTemplate, kpiDept || selEmployeeDept)
  const kpiAvg = selectedDeptKpi ? calcKPIWeightedAvg(kpiRatings, selectedDeptKpi.items) : 0
  const weightedKpi = kpiAvg * SECTION_WEIGHTS.kpi

  const supAvg = calcSupervisorAvg(supRatings)
  const weightedSup = supAvg * SECTION_WEIGHTS.supervisor

  // Dynamic template sections resolution
  const sectionsList = (assignedTemplate?.sections && assignedTemplate.sections.length > 0)
    ? assignedTemplate.sections
    : [
        { id: 'sec-360', key: 'core_360', title: '360° Assessment', description: 'Core competency evaluation statements', weight: 30, evaluatorRole: 'all', items: [] },
        { id: 'sec-kpis', key: 'role_kpis', title: 'Role KPIs', description: 'Role-specific performance metrics', weight: 50, evaluatorRole: 'supervisor', items: [] },
        { id: 'sec-sup', key: 'supervisor_eval', title: 'Supervisor Assessment', description: 'Direct manager growth review', weight: 20, evaluatorRole: 'supervisor', items: [] },
      ]

  // Dynamic section score calculation
  const calculateSectionScore = (sec: any): number => {
    if (!sec) return 0

    // 1. Role KPIs
    if (sec.key === 'role_kpis' || sec.id === 'sec-kpis' || sec.items?.some((it: any) => it.scoringType === 'weighted_kpi')) {
      return kpiAvg
    }

    // 2. Confirmation Verdict
    if (sec.key === 'confirmation_verdict' || sec.id === 'sec-prob-recommendation') {
      return confirmationVerdict === 'confirm_full' ? 5 :
             confirmationVerdict === 'extend_3_months' ? 3 :
             confirmationVerdict === 'extend_1_month' ? 2.5 : 1
    }

    // 3. Open text (Qualitative/Self)
    if (sec.items && sec.items.length > 0 && sec.items.every((it: any) => it.scoringType === 'open_text')) {
      return 0
    }

    // 4. Standard Likert items
    if (sec.items && sec.items.length > 0) {
      let weightedSum = 0
      let totalItemWeight = 0
      for (const item of sec.items) {
        const idKey = String(item.id)
        const rawVal = templateItemRatings[item.id] ?? templateItemRatings[item.key] ?? ratings360[idKey] ?? supRatings[item.key]
        const weight = item.weight || (100 / sec.items.length)
        if (rawVal !== undefined && rawVal !== null && rawVal > 0) {
          weightedSum += rawVal * weight
          totalItemWeight += weight
        }
      }
      return totalItemWeight > 0 ? (weightedSum / totalItemWeight) : 0
    }

    return 0
  }

  // Composite final score calculation
  let compositePoints = 0
  let totalApplicableWeight = 0
  for (const sec of sectionsList) {
    if (sec.weight > 0) {
      const avg = calculateSectionScore(sec)
      compositePoints += (avg / 5) * sec.weight
      totalApplicableWeight += sec.weight
    }
  }

  const finalScore = totalApplicableWeight > 0 ? (compositePoints / totalApplicableWeight) * 100 : 0
  const classification = getClassification(finalScore)

  // Determine effective active tab
  const effectiveActiveTab = sectionsList.some(s => (s.id || s.key) === activeTab)
    ? activeTab
    : (sectionsList[0]?.id || sectionsList[0]?.key || 'default')

  const activeSecIndex = sectionsList.findIndex(s => (s.id || s.key) === effectiveActiveTab)
  const activeSec = sectionsList[activeSecIndex >= 0 ? activeSecIndex : 0]
  const nextSec = activeSecIndex >= 0 && activeSecIndex < sectionsList.length - 1 ? sectionsList[activeSecIndex + 1] : null

  // ── Save handlers ──────────────────────────────────────
  const showSaveSuccess = (msg = 'Saved') => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 3000) }

  const saveActiveSection = async (submit = false, nextSectionKey?: string) => {
    if (!selCycleId || !selEmployeeId) return
    const rid = selReviewerId || selEmployeeId
    setSaving(true)
    try {
      // 1. Save ratings to supervisor responses
      const payloadSup = {
        cycle_id: selCycleId,
        employee_id: selEmployeeId,
        reviewer_id: rid,
        ratings: { ...supRatings, ...ratings360, ...templateItemRatings },
        comments: { ...supComments, ...comments360, ...templateItemComments },
        average_score: (finalScore / 20),
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { data: exSup } = await supabase.from('appraisal_supervisor_responses').select('id')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
      if (exSup) await supabase.from('appraisal_supervisor_responses').update(payloadSup).eq('id', exSup.id)
      else await supabase.from('appraisal_supervisor_responses').insert(payloadSup)

      // 2. Also save 360 table if 360 items exist
      if (Object.keys(ratings360).length > 0) {
        const payload360 = {
          cycle_id: selCycleId, employee_id: selEmployeeId, reviewer_id: rid,
          ratings: ratings360, comments: comments360,
          category_averages: catAverages360, overall_average: overall360,
          submitted_at: submit ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }
        const { data: ex360 } = await supabase.from('appraisal_360_responses').select('id')
          .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
        if (ex360) await supabase.from('appraisal_360_responses').update(payload360).eq('id', ex360.id)
        else await supabase.from('appraisal_360_responses').insert(payload360)
      }

      // 3. Also save KPI table if KPI items exist
      if (Object.keys(kpiRatings).length > 0) {
        const payloadKpi = {
          cycle_id: selCycleId, employee_id: selEmployeeId, reviewer_id: rid,
          department_category: selectedDeptKpi.key, ratings: kpiRatings, comments: kpiComments,
          weighted_average: kpiAvg,
          submitted_at: submit ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }
        const { data: exKpi } = await supabase.from('appraisal_kpi_responses').select('id')
          .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
        if (exKpi) await supabase.from('appraisal_kpi_responses').update(payloadKpi).eq('id', exKpi.id)
        else await supabase.from('appraisal_kpi_responses').insert(payloadKpi)
      }

      // 4. Save qualitative responses if exists
      if (Object.keys(qualResponses).length > 0) {
        const payloadQual = {
          cycle_id: selCycleId, employee_id: selEmployeeId, reviewer_id: rid,
          responses: qualResponses,
          submitted_at: submit ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }
        const { data: exQual } = await supabase.from('appraisal_qualitative_responses').select('id')
          .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).eq('reviewer_id', rid).maybeSingle()
        if (exQual) await supabase.from('appraisal_qualitative_responses').update(payloadQual).eq('id', exQual.id)
        else await supabase.from('appraisal_qualitative_responses').insert(payloadQual)
      }

      // 5. Update summary
      await supabase.from('appraisal_final_summary').upsert({
        cycle_id: selCycleId,
        employee_id: selEmployeeId,
        avg_360: overall360,
        weighted_360: weighted360,
        avg_kpi: kpiAvg,
        weighted_kpi: weightedKpi,
        avg_supervisor: supAvg,
        weighted_supervisor: weightedSup,
        final_score: finalScore,
        classification: classification.label,
        recommended_action: confirmationVerdict,
        management_comments: confirmationNotes,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'cycle_id,employee_id' })

      // 6. Update assignments
      await supabase.from('appraisal_assignments').update({
        status: submit ? 'complete' : 'in_progress',
        updated_at: new Date().toISOString()
      }).eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId)

      showSaveSuccess(submit ? 'Section Submitted Successfully!' : 'Draft Saved')
      if (nextSectionKey) {
        setActiveTab(nextSectionKey)
      }
    } catch (err) {
      console.error('Error saving appraisal section:', err)
    } finally {
      setSaving(false)
    }
  }

  const generateFinalSummary = async () => {
    if (!selCycleId || !selEmployeeId) return
    setSaving(true)
    try {
      const payload = {
        cycle_id: selCycleId,
        employee_id: selEmployeeId,
        avg_360: overall360,
        weighted_360: weighted360,
        avg_kpi: kpiAvg,
        weighted_kpi: weightedKpi,
        avg_supervisor: supAvg,
        weighted_supervisor: weightedSup,
        final_score: finalScore,
        classification: classification.label,
        recommended_action: confirmationVerdict,
        management_comments: confirmationNotes,
        updated_at: new Date().toISOString(),
      }
      const { data: ex } = await supabase.from('appraisal_final_summary').select('id')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).maybeSingle()
      if (ex) await supabase.from('appraisal_final_summary').update(payload).eq('id', ex.id)
      else await supabase.from('appraisal_final_summary').insert(payload)
      showSaveSuccess('Final Summary Generated & Saved!')
    } catch (err) {
      console.error('Error generating summary:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  const employeeInfo = staffList.find((s: any) => s.id === selEmployeeId)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse"></span>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900">
            Performance Appraisal Inspection & Audit Console
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
          Review live submitted appraisals, audit multi-rater scores, or record administrative offline entries for employees.
        </p>
      </div>

      {/* Active Framework Context Banner */}
      {assignedTemplate && (
        <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-purple-600 text-white flex-shrink-0 mt-0.5 shadow-xs">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-purple-950 text-sm">
                  Active Framework: {assignedTemplate.name}
                </span>
                <span className="bg-purple-200 text-purple-900 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                  {assignedTemplate.frameworkType.replace('_', ' ')}
                </span>
              </div>
              <p className="text-purple-900 leading-relaxed font-normal">
                {assignedTemplate.description} · <strong>{sectionsList.length} Assessment Sections</strong>
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={() => onNavigate?.('hr-appraisal-cycles')}
              className="bg-white hover:bg-purple-100 text-purple-800 border border-purple-300 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
            >
              Switch Questionnaire / Roster
            </button>
          </div>
        </div>
      )}

      {/* Selectors */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1">1. Appraisal Cycle</label>
          <select className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white text-slate-900 focus:ring-2 focus:ring-purple-500 outline-none font-medium"
            value={selCycleId} onChange={e => setSelCycleId(e.target.value)}>
            <option value="">Select cycle...</option>
            {cycles.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1">2. Employee Being Evaluated</label>
          <select className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white text-slate-900 focus:ring-2 focus:ring-purple-500 outline-none font-medium"
            value={selEmployeeId}
            onChange={e => {
              const newEmpId = e.target.value
              setSelEmployeeId(newEmpId)
              const emp = staffList.find((s: any) => s.id === newEmpId)
              const deptName = emp?.departments?.name || emp?.department || ''
              const autoKpi = getKpiItemsForDepartment(deptName)
              setKpiDept(autoKpi.key)
            }}>
            <option value="">Select employee...</option>
            {staffList.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.staff_code || (s.departments as any)?.name || 'Staff'})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1">3. Evaluator / Reviewer Submission</label>
          <select className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white text-slate-900 focus:ring-2 focus:ring-purple-500 outline-none font-medium"
            value={selReviewerId} onChange={e => setSelReviewerId(e.target.value)}>
            <option value="">Select reviewer submission to inspect...</option>
            {staffList.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.id === selEmployeeId ? 'Self' : (s.departments as any)?.name || 'Reviewer'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selCycleId && selEmployeeId && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main form area */}
          <div className="flex-1 space-y-4">
            
            {/* ──────────────────────────────────────────────────────────── */}
            {/* TAB SELECTOR (100% DYNAMICALLY FROM ASSIGNED TEMPLATE) */}
            {/* ──────────────────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
              {sectionsList.map((sec, idx) => {
                const secKey = sec.id || sec.key
                const isSelected = effectiveActiveTab === secKey
                return (
                  <button
                    key={secKey}
                    onClick={() => setActiveTab(secKey)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-500/30'
                        : 'text-slate-700 hover:bg-slate-100 bg-white border border-slate-200'
                    }`}
                  >
                    <span className="opacity-75">{idx + 1}.</span>
                    <span>{sec.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {sec.weight}%
                    </span>
                  </button>
                )
              })}
            </div>

            {/* ──────────────────────────────────────────────────────────── */}
            {/* TAB CONTENT: DYNAMIC SECTION RENDERING */}
            {/* ──────────────────────────────────────────────────────────── */}
            {activeSec && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-6">
                
                {/* Section Header */}
                <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <span>{activeSec.title}</span>
                      <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-lg">
                        {activeSec.weight}% Weight
                      </span>
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      {activeSec.description || 'Evaluate the performance criteria for this section.'}
                    </p>
                  </div>
                  {activeSec.weight > 0 && (
                    <span className="text-xs font-bold text-purple-800 bg-purple-50 border border-purple-200 px-3.5 py-1.5 rounded-xl self-start sm:self-auto">
                      Section Avg: {calculateSectionScore(activeSec).toFixed(2)} / 5.0
                    </span>
                  )}
                </div>

                {/* ── CASE 1: Role KPIs Section ── */}
                {(activeSec.key === 'role_kpis' || activeSec.id === 'sec-kpis' || activeSec.items?.some((it: any) => it.scoringType === 'weighted_kpi')) && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Department / Role Category
                      </label>
                      <select
                        className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none font-medium bg-white text-slate-900"
                        value={selectedDeptKpi.key}
                        onChange={e => setKpiDept(e.target.value)}
                      >
                        {getAvailableTemplateDeptCategories(assignedTemplate, systemDepartments).map(d => (
                          <option key={d.key} value={d.key}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedDeptKpi && (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="text-left text-xs font-bold text-slate-700 uppercase tracking-wide px-4 py-3">KPI Objective</th>
                              <th className="text-center text-xs font-bold text-slate-700 uppercase tracking-wide px-3 py-3 w-20">Weight</th>
                              <th className="text-center text-xs font-bold text-slate-700 uppercase tracking-wide px-3 py-3 w-40">Rating (1-5)</th>
                              <th className="text-center text-xs font-bold text-slate-700 uppercase tracking-wide px-3 py-3 w-24">Weighted</th>
                              <th className="text-left text-xs font-bold text-slate-700 uppercase tracking-wide px-3 py-3">Evidence / Metric</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedDeptKpi.items.map((item, idx) => {
                              const r = kpiRatings[item.key]
                              const wc = r && r > 0 ? (r * item.weight / 100) : 0
                              return (
                                <tr key={item.key} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                  <td className="px-4 py-3 font-semibold text-slate-800">{item.label}</td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="inline-flex px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-bold">{item.weight}%</span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <select
                                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-purple-500 outline-none font-medium bg-white"
                                      value={r ?? ''}
                                      onChange={e => setKpiRatings({ ...kpiRatings, [item.key]: e.target.value === '' ? null : Number(e.target.value) })}
                                    >
                                      <option value="">—</option>
                                      {[5,4,3,2,1].map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-3 text-center font-bold text-slate-800">{wc > 0 ? wc.toFixed(2) : '—'}</td>
                                  <td className="px-3 py-3">
                                    <input
                                      type="text"
                                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm w-full focus:ring-2 focus:ring-purple-500 outline-none"
                                      placeholder="Evidence..."
                                      value={kpiComments[item.key] || ''}
                                      onChange={e => setKpiComments({ ...kpiComments, [item.key]: e.target.value })}
                                    />
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

                {/* ── CASE 2: Confirmation Recommendation & Verdict ── */}
                {(activeSec.key === 'confirmation_verdict' || activeSec.id === 'sec-prob-recommendation') && (
                  <div className="space-y-5">
                    {activeSec.items && activeSec.items.length > 0 && (
                      <div className="space-y-4">
                        {activeSec.items.map((item: any, idx: number) => {
                          const currentRating = templateItemRatings[item.id] ?? templateItemRatings[item.key] ?? null
                          const currentComment = templateItemComments[item.id] ?? templateItemComments[item.key] ?? ''

                          return (
                            <div key={item.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-800 leading-snug">
                                  <span className="text-purple-600 font-bold mr-1.5">{idx + 1}.</span>
                                  {item.text || item.label || ''}
                                </p>
                                <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded shrink-0">
                                  Weight: {item.weight}%
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                                <div className="sm:col-span-1">
                                  <select
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-medium text-slate-900 focus:ring-2 focus:ring-purple-500 outline-none"
                                    value={currentRating ?? ''}
                                    onChange={e => {
                                      const val = e.target.value === '' ? null : Number(e.target.value)
                                      setTemplateItemRatings({ ...templateItemRatings, [item.id]: val, [item.key]: val })
                                    }}
                                  >
                                    <option value="">Select rating...</option>
                                    {[5,4,3,2,1].map(v => (
                                      <option key={v} value={v}>
                                        {v} — {v === 5 ? 'Strongly Confirm' : v === 4 ? 'Confirm' : v === 3 ? 'Satisfactory' : v === 2 ? 'Extend Probation' : 'Do Not Confirm'}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="sm:col-span-2">
                                  <input
                                    type="text"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    placeholder="Evaluation comments..."
                                    value={currentComment}
                                    onChange={e => {
                                      const val = e.target.value
                                      setTemplateItemComments({ ...templateItemComments, [item.id]: val, [item.key]: val })
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 space-y-3">
                      <h4 className="font-bold text-purple-950 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                        Final Executive Confirmation Recommendation
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-purple-900 mb-1">Recommended Action</label>
                          <select
                            className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm bg-white font-semibold text-purple-950 focus:ring-2 focus:ring-purple-500 outline-none"
                            value={confirmationVerdict}
                            onChange={e => setConfirmationVerdict(e.target.value)}
                          >
                            <option value="confirm_full">✓ Confirm as Full Permanent Staff</option>
                            <option value="extend_3_months">Extend Probation by 3 Months (With PIP)</option>
                            <option value="extend_1_month">Extend Probation by 1 Month</option>
                            <option value="terminate">Do Not Confirm (Conclude Appointment)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-purple-900 mb-1">HR / HOD Confirmation Justification</label>
                          <input
                            type="text"
                            className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                            placeholder="e.g. Completed onboarding milestones with distinction..."
                            value={confirmationNotes}
                            onChange={e => setConfirmationNotes(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── CASE 3: Open-Text / Qualitative / Self Responses ── */}
                {(activeSec.key === 'qualitative_feedback' || activeSec.key === 'self_eval' || (activeSec.items && activeSec.items.length > 0 && activeSec.items.every((it: any) => it.scoringType === 'open_text'))) && (
                  <div className="space-y-4">
                    {(activeSec.items && activeSec.items.length > 0 ? activeSec.items : QUALITATIVE_QUESTIONS).map((q: any, idx: number) => {
                      const qKey = q.key || q.id || `q_${idx}`
                      const currentText = qualResponses[qKey] || selfResponses[qKey] || templateItemComments[qKey] || ''
                      return (
                        <div key={qKey} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                          <label className="text-sm font-semibold text-slate-800 block">
                            <span className="text-purple-600 font-bold mr-1.5">{idx + 1}.</span>
                            {q.text || q.label || ''}
                          </label>
                          <textarea
                            className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm min-h-[75px] resize-y focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                            placeholder="Type evaluation response..."
                            value={currentText}
                            onChange={e => {
                              const val = e.target.value
                              setQualResponses(prev => ({ ...prev, [qKey]: val }))
                              setSelfResponses(prev => ({ ...prev, [qKey]: val }))
                              setTemplateItemComments(prev => ({ ...prev, [qKey]: val }))
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── CASE 4: Standard Evaluation Criteria (Executive Leadership, Technical, 360 Core, Custom, etc.) ── */}
                {activeSec.key !== 'role_kpis' &&
                 activeSec.id !== 'sec-kpis' &&
                 activeSec.key !== 'confirmation_verdict' &&
                 activeSec.id !== 'sec-prob-recommendation' &&
                 activeSec.key !== 'qualitative_feedback' &&
                 activeSec.key !== 'self_eval' &&
                 !(activeSec.items && activeSec.items.length > 0 && activeSec.items.every((it: any) => it.scoringType === 'open_text')) &&
                 !activeSec.items?.some((it: any) => it.scoringType === 'weighted_kpi') && (
                  <div className="space-y-4">
                    {activeSec.items && activeSec.items.length > 0 ? (
                      activeSec.items.map((item: any, idx: number) => {
                        const idKey = String(item.id)
                        const currentRating = templateItemRatings[item.id] ?? templateItemRatings[item.key] ?? ratings360[idKey] ?? supRatings[item.key] ?? null
                        const currentComment = templateItemComments[item.id] ?? templateItemComments[item.key] ?? comments360[idKey] ?? supComments[item.key] ?? ''

                        return (
                          <div key={item.id || idx} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-800 leading-snug">
                                <span className="text-purple-600 font-bold mr-1.5">{idx + 1}.</span>
                                {item.text || item.label || ''}
                              </p>
                              {item.weight > 0 && (
                                <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded shrink-0">
                                  Weight: {item.weight}%
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                              <div className="sm:col-span-1">
                                <select
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white font-medium text-slate-900 focus:ring-2 focus:ring-purple-500 outline-none"
                                  value={currentRating ?? ''}
                                  onChange={e => {
                                    const val = e.target.value === '' ? null : Number(e.target.value)
                                    setTemplateItemRatings(prev => ({ ...prev, [item.id]: val, [item.key]: val }))
                                    setRatings360(prev => ({ ...prev, [idKey]: val, [String(item.key)]: val }))
                                    setSupRatings(prev => ({ ...prev, [item.key]: val, [item.id]: val }))
                                  }}
                                >
                                  <option value="">Select rating...</option>
                                  {[5,4,3,2,1].map(v => (
                                    <option key={v} value={v}>
                                      {v} — {v === 5 ? '5 - Exceptional' : v === 4 ? '4 - Very Good' : v === 3 ? '3 - Meets Standards' : v === 2 ? '2 - Needs Improvement' : '1 - Unsatisfactory'}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="sm:col-span-2">
                                <input
                                  type="text"
                                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                                  placeholder="Observation notes, metric proof, or supervisor comments..."
                                  value={currentComment}
                                  onChange={e => {
                                    const val = e.target.value
                                    setTemplateItemComments(prev => ({ ...prev, [item.id]: val, [item.key]: val }))
                                    setComments360(prev => ({ ...prev, [idKey]: val, [String(item.key)]: val }))
                                    setSupComments(prev => ({ ...prev, [item.key]: val, [item.id]: val }))
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        No criteria items configured for this section yet.
                      </div>
                    )}
                  </div>
                )}

                {/* Section Action Footer */}
                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => saveActiveSection(false)}
                    disabled={saving}
                    className="border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Save Draft
                  </button>

                  {nextSec ? (
                    <button
                      onClick={() => saveActiveSection(false, nextSec.id || nextSec.key)}
                      disabled={saving}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl px-6 py-2.5 text-sm transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
                    >
                      <span>Save & Proceed to Next Section</span>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => saveActiveSection(true)}
                      disabled={saving}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-6 py-2.5 text-sm transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>Submit Complete Appraisal</span>
                    </button>
                  )}

                  {saveMsg && (
                    <span className="text-emerald-600 text-sm font-semibold animate-pulse flex items-center gap-1.5 ml-auto">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      {saveMsg}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ──────────────────────────────────────────────────────────── */}
          {/* SIDEBAR: DYNAMIC LIVE SCORECARD & AUDIT PANEL */}
          {/* ──────────────────────────────────────────────────────────── */}
          <div className="lg:w-80 flex-shrink-0">
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 space-y-5 sticky top-24 shadow-xl border border-slate-700">
              <div className="border-b border-slate-700/80 pb-3">
                <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
                  Live Framework Scorecard
                </span>
                {employeeInfo && (
                  <h3 className="text-base font-bold text-white mt-0.5">{employeeInfo.full_name}</h3>
                )}
                {assignedTemplate && (
                  <p className="text-xs text-purple-200 font-medium mt-0.5">{assignedTemplate.name}</p>
                )}
              </div>

              {/* Dynamic Section Score Breakdown */}
              <div className="space-y-3.5">
                {sectionsList.filter(s => s.weight > 0).map((sec, idx) => {
                  const secAvg = calculateSectionScore(sec)
                  const secWeighted = (secAvg * sec.weight / 100)
                  return (
                    <div key={sec.id || sec.key || idx}>
                      <div className="flex justify-between text-xs text-slate-300 mb-1 font-medium">
                        <span className="truncate pr-2">{idx + 1}. {sec.title}</span>
                        <span className="shrink-0 font-bold text-slate-400">{sec.weight}%</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white">{secAvg.toFixed(2)}</span>
                        <span className="text-xs text-slate-400">/5</span>
                        <span className="ml-auto text-sm font-bold text-purple-400">
                          {secWeighted.toFixed(2)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-indigo-400 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, (secAvg / 5) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )
                })}

                {isProbation && (
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs space-y-1">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Verdict Recommendation</span>
                    <span className="font-bold text-purple-300">
                      {confirmationVerdict === 'confirm_full' ? '✓ Confirm Full Permanent Staff' :
                       confirmationVerdict === 'extend_3_months' ? 'Extend Probation 3 Months (PIP)' :
                       confirmationVerdict === 'extend_1_month' ? 'Extend Probation 1 Month' : 'Do Not Confirm'}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-700 pt-4">
                <div className="text-xs text-slate-400 font-semibold mb-1">Composite Framework Score</div>
                <div className="text-3xl font-extrabold text-white">{finalScore.toFixed(1)}%</div>
                <span
                  className="inline-flex mt-2 px-3 py-1 rounded-full text-xs font-bold shadow-xs"
                  style={{ background: classification.bg, color: classification.color }}
                >
                  {classification.label}
                </span>
              </div>

              <button
                onClick={generateFinalSummary}
                disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>{saving ? 'Generating...' : 'Finalize & Save Summary'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
