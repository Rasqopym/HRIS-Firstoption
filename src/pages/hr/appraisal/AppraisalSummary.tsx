import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import type { Page } from '../../../types'
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'
import {
  CATEGORIES_360, DEPARTMENT_KPIS, SUPERVISOR_AREAS,
  SELF_APPRAISAL_QUESTIONS, QUALITATIVE_QUESTIONS,
  SECTION_WEIGHTS, CLASSIFICATION_BANDS, getClassification,
  calc360CategoryAvg, calc360OverallAvg, calcKPIWeightedAvg,
  calcSupervisorAvg, calcFinalScore
} from './appraisalData'

interface Props {
  onNavigate?: (p: Page) => void
  employeeId?: string
  cycleId?: string
}

export default function AppraisalSummary({ onNavigate, employeeId, cycleId }: Props) {
  const summaryRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Selectors
  const [cycles, setCycles] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [selCycleId, setSelCycleId] = useState(cycleId || '')
  const [selEmployeeId, setSelEmployeeId] = useState(employeeId || '')

  // Data
  const [employee, setEmployee] = useState<any>(null)
  const [cycleInfo, setCycleInfo] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [reviewerNames, setReviewerNames] = useState<string[]>([])
  const [catAvg360, setCatAvg360] = useState<Record<string, number>>({})
  const [kpiData, setKpiData] = useState<any>(null)
  const [supData, setSupData] = useState<any>(null)
  const [selfData, setSelfData] = useState<any>(null)
  const [qualData, setQualData] = useState<any>(null)
  const [companySettings, setCompanySettings] = useState<any>(null)

  // HR-editable
  const [recommendedAction, setRecommendedAction] = useState('')
  const [managementComments, setManagementComments] = useState('')

  // Collapse state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ scores: true })

  useEffect(() => { fetchInitial() }, [])
  useEffect(() => { if (selCycleId && selEmployeeId) fetchSummaryData() }, [selCycleId, selEmployeeId])

  const fetchInitial = async () => {
    try {
      const [{ data: cData }, { data: sData }, { data: csData }] = await Promise.all([
        supabase.from('appraisal_cycles').select('*').order('created_at', { ascending: false }),
        supabase.from('staff').select('id, full_name, email, staff_code, department_id, departments(name), photo_url').eq('status', 'active'),
        supabase.from('company_settings').select('*').maybeSingle(),
      ])
      setCycles(cData || [])
      setStaffList(sData || [])
      setCompanySettings(csData)
      if (!selCycleId && cData && cData.length > 0) setSelCycleId(cData[0].id)
    } catch (err) {
      console.error('Error fetching initial data:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchSummaryData = async () => {
    if (!selCycleId || !selEmployeeId) return
    try {
      // Employee info
      const emp = staffList.find((s: any) => s.id === selEmployeeId)
      setEmployee(emp || null)

      // Cycle info
      const cycle = cycles.find((c: any) => c.id === selCycleId)
      setCycleInfo(cycle || null)

      // Final summary
      const { data: sumData } = await supabase.from('appraisal_final_summary').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).maybeSingle()
      setSummary(sumData)
      setRecommendedAction(sumData?.recommended_action || '')
      setManagementComments(sumData?.management_comments || '')

      // 360 responses (all reviewers)
      const { data: r360 } = await supabase.from('appraisal_360_responses').select('*, reviewer:reviewer_id(full_name)')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId)
      if (r360 && r360.length > 0) {
        const names = r360.map((r: any) => (r.reviewer as any)?.full_name || 'Unknown').filter(Boolean)
        setReviewerNames([...new Set(names)])
        // Blend category averages
        const blended: Record<string, number[]> = {}
        for (const resp of r360) {
          const ca = resp.category_averages || {}
          for (const [key, val] of Object.entries(ca)) {
            if (!blended[key]) blended[key] = []
            if (typeof val === 'number' && val > 0) blended[key].push(val)
          }
        }
        const avgMap: Record<string, number> = {}
        for (const [key, vals] of Object.entries(blended)) {
          avgMap[key] = vals.reduce((s, v) => s + v, 0) / vals.length
        }
        setCatAvg360(avgMap)
      } else {
        setReviewerNames([])
        setCatAvg360({})
      }

      // KPI
      const { data: kData } = await supabase.from('appraisal_kpi_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).limit(1).maybeSingle()
      setKpiData(kData)

      // Supervisor
      const { data: sData } = await supabase.from('appraisal_supervisor_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).limit(1).maybeSingle()
      setSupData(sData)

      // Self
      const { data: seData } = await supabase.from('appraisal_self_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).maybeSingle()
      setSelfData(seData)

      // Qualitative
      const { data: qData } = await supabase.from('appraisal_qualitative_responses').select('*')
        .eq('cycle_id', selCycleId).eq('employee_id', selEmployeeId).limit(1).maybeSingle()
      setQualData(qData)
    } catch (err) {
      console.error('Error fetching summary data:', err)
    }
  }

  const handleSaveHRFields = async () => {
    if (!summary?.id) return
    setSaving(true)
    try {
      await supabase.from('appraisal_final_summary').update({
        recommended_action: recommendedAction,
        management_comments: managementComments,
        updated_at: new Date().toISOString(),
      }).eq('id', summary.id)
    } catch (err) {
      console.error('Error saving HR fields:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleExportPDF = async () => {
    const element = summaryRef.current
    if (!element) return
    setExporting(true)
    try {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false })
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [imgWidth, imgHeight],
      })
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight)
      pdf.save(`appraisal-${employee?.full_name || 'summary'}-${cycleInfo?.name || ''}.pdf`)
    } catch (err) {
      console.error('Error exporting PDF:', err)
    } finally {
      setExporting(false)
    }
  }

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  // Computed scores from summary or raw data
  const avg360 = summary?.avg_360 || 0
  const w360 = summary?.weighted_360 || 0
  const avgKpi = summary?.avg_kpi || 0
  const wKpi = summary?.weighted_kpi || 0
  const avgSup = summary?.avg_supervisor || 0
  const wSup = summary?.weighted_supervisor || 0
  const finalScore = summary?.final_score || 0
  const classInfo = getClassification(finalScore)

  // KPI department info
  const kpiDeptInfo = kpiData ? DEPARTMENT_KPIS.find(d => d.key === kpiData.department_category) : null

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header + Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-800">Appraisal Summary</h1>
          <p className="text-sm text-slate-500 mt-1">Final performance appraisal report</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPDF} disabled={exporting || !summary}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {exporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Selectors */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Appraisal Cycle</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={selCycleId} onChange={e => setSelCycleId(e.target.value)}>
            <option value="">Select cycle...</option>
            {cycles.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Employee</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={selEmployeeId} onChange={e => setSelEmployeeId(e.target.value)}>
            <option value="">Select employee...</option>
            {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.full_name} ({s.staff_code})</option>)}
          </select>
        </div>
      </div>

      {!summary && selCycleId && selEmployeeId && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h3 className="font-display font-semibold text-slate-600 text-lg">No Final Summary Yet</h3>
          <p className="text-slate-400 text-sm mt-1">Go to the Appraisal Form and click "Generate Final Summary" after completing all sections.</p>
          <button onClick={() => onNavigate?.('hr-appraisal-form')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors">
            Open Appraisal Form
          </button>
        </div>
      )}

      {/* Summary Content */}
      {summary && employee && (
        <div ref={summaryRef} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 sm:p-8 space-y-8">
          {/* Header */}
          <div className="text-center border-b border-slate-200 pb-6">
            {companySettings?.logo_url && (
              <img src={companySettings.logo_url} alt="Logo" className="h-12 mx-auto mb-3" crossOrigin="anonymous" />
            )}
            <h2 className="text-xl font-display font-bold text-slate-800 uppercase tracking-wide">
              Performance Appraisal — Final Summary
            </h2>
            <p className="text-sm text-slate-500 mt-1">{companySettings?.name || 'Firstoption'}</p>
          </div>

          {/* Employee Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div><span className="text-slate-400">Employee:</span> <span className="font-medium text-slate-800">{employee.full_name}</span></div>
            <div><span className="text-slate-400">Staff Code:</span> <span className="font-medium text-slate-800">{employee.staff_code}</span></div>
            <div><span className="text-slate-400">Department:</span> <span className="font-medium text-slate-800">{(employee.departments as any)?.name || '—'}</span></div>
            <div><span className="text-slate-400">Period:</span> <span className="font-medium text-slate-800">{cycleInfo?.name || '—'}</span></div>
          </div>

          {cycleInfo && (
            <div className="text-sm text-slate-500">
              <span className="text-slate-400">Dates:</span> {new Date(cycleInfo.start_date).toLocaleDateString()} – {new Date(cycleInfo.end_date).toLocaleDateString()}
              {reviewerNames.length > 0 && (
                <span className="ml-4"><span className="text-slate-400">Reviewer(s):</span> {reviewerNames.join(', ')}</span>
              )}
            </div>
          )}

          {/* Score Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200/50">
              <div className="text-xs text-blue-600 font-medium mb-1">360° Assessment</div>
              <div className="text-2xl font-bold text-slate-800">{avg360.toFixed(2)}<span className="text-sm font-normal text-slate-400">/5</span></div>
              <div className="text-xs text-blue-500 mt-1">Weighted: {w360.toFixed(2)} (30%)</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200/50">
              <div className="text-xs text-emerald-600 font-medium mb-1">Role KPI</div>
              <div className="text-2xl font-bold text-slate-800">{avgKpi.toFixed(2)}<span className="text-sm font-normal text-slate-400">/5</span></div>
              <div className="text-xs text-emerald-500 mt-1">Weighted: {wKpi.toFixed(2)} (50%)</div>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200/50">
              <div className="text-xs text-amber-600 font-medium mb-1">Supervisor</div>
              <div className="text-2xl font-bold text-slate-800">{avgSup.toFixed(2)}<span className="text-sm font-normal text-slate-400">/5</span></div>
              <div className="text-xs text-amber-500 mt-1">Weighted: {wSup.toFixed(2)} (20%)</div>
            </div>
            <div className="rounded-xl p-4 border-2" style={{ borderColor: classInfo.color, background: classInfo.bg }}>
              <div className="text-xs font-medium mb-1" style={{ color: classInfo.color }}>Final Score</div>
              <div className="text-2xl font-bold text-slate-800">{finalScore.toFixed(1)}%</div>
              <span className="inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: classInfo.color, color: '#fff' }}>
                {classInfo.label}
              </span>
            </div>
          </div>

          {/* Classification Bar */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Performance Classification</div>
            <div className="flex h-6 rounded-full overflow-hidden">
              {CLASSIFICATION_BANDS.slice().reverse().map(band => {
                const width = band.max - band.min + 1
                const isActive = finalScore >= band.min && finalScore <= band.max
                return (
                  <div key={band.label} className="relative flex items-center justify-center transition-all"
                    style={{ width: `${width}%`, background: isActive ? band.color : band.bg, opacity: isActive ? 1 : 0.4 }}>
                    <span className={`text-[9px] font-semibold ${isActive ? 'text-white' : 'text-slate-500'} truncate px-1`}>
                      {band.label}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex text-[10px] text-slate-400">
              {CLASSIFICATION_BANDS.slice().reverse().map(b => (
                <div key={b.label} style={{ width: `${b.max - b.min + 1}%` }} className="text-center">{b.min}–{b.max}%</div>
              ))}
            </div>
          </div>

          {/* 360° Category Breakdown */}
          <div>
            <button onClick={() => toggle('360')} className="w-full flex items-center justify-between py-3 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-800">360° Assessment — Category Averages</h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expanded['360'] ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {expanded['360'] && (
              <div className="mt-3 space-y-2">
                {CATEGORIES_360.map(cat => {
                  const avg = catAvg360[cat.key] || 0
                  return (
                    <div key={cat.key} className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 w-52 flex-shrink-0 truncate">{cat.label}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(avg / 5) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium text-slate-700 w-10 text-right">{avg.toFixed(1)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* KPI Breakdown */}
          {kpiData && kpiDeptInfo && (
            <div>
              <button onClick={() => toggle('kpi')} className="w-full flex items-center justify-between py-3 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-800">Role KPIs — {kpiDeptInfo.label}</h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expanded.kpi ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {expanded.kpi && (
                <table className="w-full text-sm mt-3">
                  <thead>
                    <tr className="text-xs text-slate-400 uppercase">
                      <th className="text-left py-2">KPI</th><th className="text-center py-2 w-16">Weight</th>
                      <th className="text-center py-2 w-16">Rating</th><th className="text-center py-2 w-20">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiDeptInfo.items.map(item => {
                      const r = kpiData.ratings?.[item.key]
                      const w = r && r > 0 ? (r * item.weight / 100) : 0
                      return (
                        <tr key={item.key} className="border-b border-slate-50">
                          <td className="py-2 text-slate-700">{item.label}</td>
                          <td className="py-2 text-center text-slate-500">{item.weight}%</td>
                          <td className="py-2 text-center font-medium text-slate-800">{r || '—'}</td>
                          <td className="py-2 text-center font-medium text-slate-700">{w > 0 ? w.toFixed(2) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Supervisor Breakdown */}
          {supData && (
            <div>
              <button onClick={() => toggle('sup')} className="w-full flex items-center justify-between py-3 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-800">Supervisor Assessment</h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expanded.sup ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {expanded.sup && (
                <div className="mt-3 space-y-2">
                  {SUPERVISOR_AREAS.map(area => {
                    const r = supData.ratings?.[area.key]
                    return (
                      <div key={area.key} className="flex items-center gap-3">
                        <span className="text-sm text-slate-600 w-52 flex-shrink-0 truncate">{area.label}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${((r || 0) / 5) * 100}%` }} />
                        </div>
                        <span className="text-sm font-medium text-slate-700 w-10 text-right">{r || '—'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Self Appraisal */}
          {selfData && (
            <div>
              <button onClick={() => toggle('self')} className="w-full flex items-center justify-between py-3 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-800">Self Appraisal</h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expanded.self ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {expanded.self && (
                <div className="mt-3 space-y-4">
                  {SELF_APPRAISAL_QUESTIONS.map((q, idx) => (
                    <div key={q.key}>
                      <p className="text-sm font-medium text-slate-700"><span className="text-blue-600 mr-1">{idx + 1}.</span>{q.text}</p>
                      <p className="text-sm text-slate-600 mt-1 pl-5">{selfData.responses?.[q.key] || <span className="text-slate-400 italic">No response</span>}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Qualitative Feedback */}
          {qualData && (
            <div>
              <button onClick={() => toggle('qual')} className="w-full flex items-center justify-between py-3 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-800">Qualitative Feedback</h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expanded.qual ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {expanded.qual && (
                <div className="mt-3 space-y-4">
                  {QUALITATIVE_QUESTIONS.map((q, idx) => (
                    <div key={q.key}>
                      <p className="text-sm font-medium text-slate-700"><span className="text-blue-600 mr-1">{idx + 1}.</span>{q.text}</p>
                      <p className="text-sm text-slate-600 mt-1 pl-5">{qualData.responses?.[q.key] || <span className="text-slate-400 italic">No response</span>}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* HR-Editable Section (outside the PDF ref) */}
      {summary && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-800">HR / Management Notes</h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Recommended Action</label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[60px] resize-y focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Promotion, Training, PIP, Bonus..."
              value={recommendedAction} onChange={e => setRecommendedAction(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Management Comments</label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[60px] resize-y focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Additional management comments..."
              value={managementComments} onChange={e => setManagementComments(e.target.value)} />
          </div>
          <button onClick={handleSaveHRFields} disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
      )}
    </div>
  )
}
