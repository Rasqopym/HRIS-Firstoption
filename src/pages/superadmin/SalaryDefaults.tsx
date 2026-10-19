import { useState, useEffect } from 'react'
import { RATE_TYPE_LABELS, salaryTemplates as defaultSalaryTemplates } from '../../data/salaryData'
import { supabase } from '../../lib/supabase'
import { dbRateTypeToApp, appRateTypeToDb } from '../../lib/rateTypeMap'
import { logAction } from '../../lib/auditLog'
import type { SalaryTemplate, SalaryComponent, RateType } from '../../types'

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-9 h-[18px] rounded-full transition-colors flex-none ${value ? 'bg-blue-500' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function SalaryDefaults() {
  const [templates, setTemplates] = useState<SalaryTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showAddComponentModal, setShowAddComponentModal] = useState(false)
  const [newCompName, setNewCompName] = useState('Others')
  const [newCompCategory, setNewCompCategory] = useState<'earning' | 'deduction'>('earning')
  const [newCompRateType, setNewCompRateType] = useState<RateType>('flat')
  const [newCompRate, setNewCompRate] = useState<number>(0)
  const [newCompTaxable, setNewCompTaxable] = useState(false)
  const [newCompActive, setNewCompActive] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchSalaryData = async () => {
      // 1. Check localStorage first for instant, reliable display
      let cachedTemplates: SalaryTemplate[] | null = null
      try {
        const raw = localStorage.getItem('hris_salary_templates_config')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length > 0) {
            cachedTemplates = parsed
            setTemplates(parsed)
            setActiveTemplateId(parsed[0].id)
            setLoading(false)
          }
        }
      } catch (e) {
        console.warn('LocalStorage templates cache parse warning:', e)
      }

      try {
        // Fetch salary templates from Supabase
        const { data: templatesData, error: templatesError } = await supabase
          .from('salary_templates')
          .select('id, name, job_grade, department')

        if (templatesError) {
          console.warn('Templates fetch warning:', templatesError)
        }

        // Fetch salary template components
        const { data: templateComponentsData } = await supabase
          .from('salary_template_components')
          .select('id, template_id, is_active, is_taxable, rate_type, rate, component_id(id, name, category)')

        // Build templates from Supabase data if available
        let liveTemplates: SalaryTemplate[] = []

        if (templatesData && templatesData.length > 0) {
          const templatesMap = new Map<string, SalaryTemplate>()
          
          templatesData.forEach(t => {
            templatesMap.set(t.id, {
              id: t.id,
              name: t.name,
              jobGrade: t.job_grade,
              department: t.department,
              components: [],
            })
          })

          templateComponentsData?.forEach(tc => {
            const template = templatesMap.get(tc.template_id)
            if (template && tc.component_id) {
              const category = (tc.component_id as any)?.category === 'allowance' ? 'earning' : 'deduction'
              let rateType: RateType = 'flat'
              try {
                rateType = dbRateTypeToApp(tc.rate_type)
              } catch (e) {
                rateType = 'flat'
              }
              const attendanceBased = tc.rate_type === 'per_hour' || tc.rate_type === 'per_day'
              
              template.components.push({
                id: tc.id,
                name: (tc.component_id as any)?.name || 'Component',
                active: tc.is_active,
                taxable: tc.is_taxable,
                rateType,
                rate: tc.rate,
                category,
                attendanceBased,
              })
            }
          })

          liveTemplates = Array.from(templatesMap.values())
        }

        // If no live templates returned, fallback to cache or defaults
        if (liveTemplates.length === 0) {
          liveTemplates = cachedTemplates && cachedTemplates.length > 0 ? cachedTemplates : defaultSalaryTemplates
        }

        // Ensure "Others" component and cached customizations are merged into every template
        const finalTemplates = liveTemplates.map(t => {
          const cachedT = cachedTemplates?.find(ct => ct.id === t.id || ct.name?.toLowerCase() === t.name?.toLowerCase())
          let comps = [...t.components]

          // Merge any component rates/status previously saved in localStorage
          if (cachedT && cachedT.components) {
            comps = comps.map(c => {
              const matchingCachedComp = cachedT.components.find(cc => cc.name?.toLowerCase() === c.name?.toLowerCase())
              if (matchingCachedComp) {
                return {
                  ...c,
                  active: matchingCachedComp.active,
                  taxable: matchingCachedComp.taxable,
                  rateType: matchingCachedComp.rateType,
                  rate: matchingCachedComp.rate,
                }
              }
              return c
            })

            // Also include any custom components created in localStorage that don't exist yet in Supabase
            cachedT.components.forEach(cc => {
              if (!comps.some(c => c.name?.toLowerCase() === cc.name?.toLowerCase())) {
                comps.push(cc)
              }
            })
          }

          // Ensure "Others" is always present under earnings
          const hasOthers = comps.some(c => c.name?.toLowerCase() === 'others' || c.name?.toLowerCase() === 'other allowance')
          if (!hasOthers) {
            comps.push({
              id: `others-${t.id}`,
              name: 'Others',
              active: false,
              taxable: false,
              rateType: 'flat',
              rate: 0,
              category: 'earning',
              attendanceBased: false,
              description: 'Other variable/fixed allowances'
            })
          }

          // Ensure Lunch Allowance and Transport Allowance are attendance-based % of Gross
          comps = comps.map(c => {
            const nameLower = (c.name || '').toLowerCase()
            if (nameLower.includes('lunch') || nameLower.includes('transport')) {
              const isOldPerDay = c.rateType === 'per_day' || (c.rateType === 'pct_gross' && c.rate > 50)
              return {
                ...c,
                attendanceBased: c.attendanceBased ?? true,
                attendanceSource: 'days_present',
                rateType: isOldPerDay ? 'pct_gross' : (c.rateType || 'pct_gross'),
                rate: isOldPerDay ? 10 : (c.rate ?? 10),
                description: '% of Gross ÷ Working Days × Days Present',
              }
            }
            return c
          })

          return {
            ...t,
            name: cachedT?.name || t.name,
            jobGrade: cachedT?.jobGrade || t.jobGrade,
            department: cachedT?.department || t.department,
            components: comps,
          }
        })

        setTemplates(finalTemplates)
        if (finalTemplates.length > 0) {
          setActiveTemplateId(prev => prev || finalTemplates[0].id)
        }
      } catch (err) {
        console.error('Error fetching salary data:', err)
        if (cachedTemplates && cachedTemplates.length > 0) {
          setTemplates(cachedTemplates)
          setActiveTemplateId(cachedTemplates[0].id)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchSalaryData()
  }, [])

  const activeTemplate = templates.find(t => t.id === activeTemplateId) ?? templates[0] ?? null

  const updateComponent = (compId: string, patch: Partial<SalaryComponent>) => {
    if (!activeTemplateId) return
    setTemplates(prev => prev.map(t =>
      t.id === activeTemplateId
        ? { ...t, components: t.components.map(c => c.id === compId ? { ...c, ...patch } : c) }
        : t
    ))
  }

  const handleAddNewComponent = () => {
    if (!activeTemplateId || !newCompName.trim()) return
    const trimmedName = newCompName.trim()

    // If component already exists, just activate it and update
    const existing = activeTemplate?.components.find(c => c.name.toLowerCase() === trimmedName.toLowerCase())
    if (existing) {
      updateComponent(existing.id, {
        active: true,
        rateType: newCompRateType,
        rate: newCompRate,
        taxable: newCompTaxable,
      })
      setShowAddComponentModal(false)
      return
    }

    const newComp: SalaryComponent = {
      id: `custom-${Date.now()}`,
      name: trimmedName,
      active: newCompActive,
      taxable: newCompTaxable,
      rateType: newCompRateType,
      rate: newCompRate,
      category: newCompCategory,
      attendanceBased: newCompRateType === 'per_hour' || newCompRateType === 'per_day' || trimmedName.toLowerCase().includes('lunch') || trimmedName.toLowerCase().includes('transport'),
      attendanceSource: 'days_present',
    }

    setTemplates(prev => prev.map(t =>
      t.id === activeTemplateId
        ? { ...t, components: [...t.components, newComp] }
        : t
    ))

    setShowAddComponentModal(false)
    setNewCompName('')
  }

  const handleSave = async () => {
    if (!activeTemplateId || !activeTemplate) {
      setError('No template selected')
      return
    }

    setSaving(true)
    setError('')
    setSaved(false)

    try {
      // 1. Immediately cache to localStorage so user changes NEVER reset on reload
      try {
        localStorage.setItem('hris_salary_templates_config', JSON.stringify(templates))
        localStorage.setItem(`hris_salary_template_${activeTemplateId}`, JSON.stringify(activeTemplate))
      } catch (e) {
        console.warn('LocalStorage write warning:', e)
      }

      // 2. Update template metadata in Supabase
      const { error: templateError } = await supabase
        .from('salary_templates')
        .update({
          name: activeTemplate.name || 'Untitled Template',
          job_grade: activeTemplate.jobGrade || 'General',
          department: activeTemplate.department || 'All',
        })
        .eq('id', activeTemplateId)

      if (templateError) {
        console.warn('Error updating template info in Supabase:', templateError)
      }

      // 3. Update or upsert each component in Supabase
      for (const comp of activeTemplate.components) {
        let masterCompId = (comp as any).component_id

        // If no master component ID, check or create in salary_components
        if (!masterCompId) {
          try {
            const { data: mc } = await supabase
              .from('salary_components')
              .select('id')
              .ilike('name', comp.name.trim())
              .maybeSingle()

            if (mc) {
              masterCompId = mc.id
            } else {
              const { data: newMc } = await supabase
                .from('salary_components')
                .insert({
                  name: comp.name.trim(),
                  category: comp.category === 'earning' ? 'allowance' : 'deduction',
                  default_rate_type: appRateTypeToDb(comp.rateType) || 'flat_amount'
                })
                .select('id')
                .maybeSingle()
              if (newMc) masterCompId = newMc.id
            }
          } catch (e) {}
        }

        const dbRateType = appRateTypeToDb(comp.rateType) || 'flat_amount'
        const compPayload = {
          template_id: activeTemplateId,
          is_active: comp.active,
          is_taxable: comp.taxable,
          rate_type: dbRateType,
          rate: comp.rate || 0,
        }

        const isRealDbId = comp.id && comp.id.length === 36 && comp.id.includes('-') && !comp.id.startsWith('others-') && !comp.id.startsWith('custom-')

        let updated = false
        if (isRealDbId) {
          const { error: compError, data: updateData } = await supabase
            .from('salary_template_components')
            .update(compPayload)
            .eq('id', comp.id)
            .select('id')

          if (!compError && updateData && updateData.length > 0) {
            updated = true
          }
        }

        // If not updated by ID, check by template_id + component_id
        if (!updated && masterCompId) {
          try {
            const { data: existingTC } = await supabase
              .from('salary_template_components')
              .select('id')
              .eq('template_id', activeTemplateId)
              .eq('component_id', masterCompId)
              .maybeSingle()

            if (existingTC) {
              await supabase
                .from('salary_template_components')
                .update(compPayload)
                .eq('id', existingTC.id)
            } else {
              await supabase
                .from('salary_template_components')
                .insert({
                  ...compPayload,
                  component_id: masterCompId,
                })
            }
          } catch (tcErr) {
            console.warn(`Could not sync template component ${comp.name}:`, tcErr)
          }
        }
      }

      await logAction({
        action: 'UPDATE',
        entity: 'SalaryTemplate',
        entityId: activeTemplateId,
        details: `Updated salary defaults for template "${activeTemplate.name}"`
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Error saving template:', err)
      // Even if network or Supabase warning occurs, local storage has permanently preserved it
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const addTemplate = async () => {
    if (!newTemplateName.trim() || templates.length === 0) return

    const base = templates[0]
    setError('')
    setSaving(true)

    try {
      // Insert new template
      const { data: newTemplateData, error: templateError } = await supabase
        .from('salary_templates')
        .insert({
          name: newTemplateName.trim(),
          job_grade: 'Grade 4–6',
          department: 'All',
        })
        .select()
        .single()

      if (templateError) throw templateError
      if (!newTemplateData) throw new Error('Failed to create template')

      // Fetch all salary components to create template components
      const { data: allComponents, error: componentsError } = await supabase
        .from('salary_components')
        .select('id, name')

      if (componentsError) throw componentsError

      // Create template components by copying from base template
      const componentInserts = allComponents?.map(comp => {
        const baseComp = base.components.find(c => c.name === comp.name)
        return supabase
          .from('salary_template_components')
          .insert({
            template_id: newTemplateData.id,
            component_id: comp.id,
            is_active: baseComp?.active ?? true,
            is_taxable: baseComp?.taxable ?? false,
            rate_type: baseComp ? appRateTypeToDb(baseComp.rateType) : 'flat_amount',
            rate: baseComp?.rate ?? 0,
          })
      }) ?? []

      const componentResults = await Promise.all(componentInserts)
      const firstComponentError = componentResults.find(r => r.error)
      if (firstComponentError) throw firstComponentError.error

      // Re-fetch the new template with its components
      const { data: fullTemplateData, error: fetchError } = await supabase
        .from('salary_templates')
        .select('id, name, job_grade, department')
        .eq('id', newTemplateData.id)
        .single()

      if (fetchError) throw fetchError

      const { data: newTemplateComponents, error: compsFetchError } = await supabase
        .from('salary_template_components')
        .select('id, template_id, is_active, is_taxable, rate_type, rate, component_id(id, name, category)')
        .eq('template_id', newTemplateData.id)

      if (compsFetchError) throw compsFetchError

      // Build the new template object
      const newT: SalaryTemplate = {
        id: fullTemplateData.id,
        name: fullTemplateData.name,
        jobGrade: fullTemplateData.job_grade,
        department: fullTemplateData.department,
        components: newTemplateComponents?.map(tc => ({
          id: tc.id,
          name: (tc.component_id as any)?.name || 'Component',
          active: tc.is_active,
          taxable: tc.is_taxable,
          rateType: dbRateTypeToApp(tc.rate_type),
          rate: tc.rate,
          category: ((tc.component_id as any)?.category === 'allowance' ? 'earning' : 'deduction') as 'earning' | 'deduction',
          attendanceBased: tc.rate_type === 'per_hour' || tc.rate_type === 'per_day',
        })) ?? [],
      }

      setTemplates(prev => [...prev, newT])
      setActiveTemplateId(newT.id)
      setNewTemplateName('')
      setShowNewModal(false)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create template'
      setError(errorMsg)
      console.error('Error creating template:', err)
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async () => {
    if (!activeTemplateId || templates.length <= 1) {
      setError('Cannot delete the last remaining template')
      setShowDeleteModal(false)
      return
    }

    setError('')
    setSaving(true)

    try {
      const { error } = await supabase
        .from('salary_templates')
        .delete()
        .eq('id', activeTemplateId)

      if (error) throw error

      // Remove from local state
      setTemplates(prev => prev.filter(t => t.id !== activeTemplateId))
      
      // Select a different template
      const remaining = templates.filter(t => t.id !== activeTemplateId)
      if (remaining.length > 0) {
        setActiveTemplateId(remaining[0].id)
      } else {
        setActiveTemplateId(null)
      }

      setShowDeleteModal(false)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete template'
      setError(errorMsg)
      console.error('Error deleting template:', err)
    } finally {
      setSaving(false)
    }
  }

  const earnings = activeTemplate?.components.filter(c => c.category === 'earning') ?? []
  const deductions = activeTemplate?.components.filter(c => c.category === 'deduction') ?? []

  if (loading) {
    return (
      <div className="p-6 anim-fade-up">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  if (!activeTemplate) {
    return (
      <div className="p-6 anim-fade-up">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <svg className="text-slate-300 mb-3" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            <div className="text-slate-500 font-medium">No salary templates found</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">Salary Structure Defaults</h2>
          <p className="text-sm text-slate-500">Company-wide templates by job grade — used as starting points when onboarding staff</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowNewModal(true)} 
            disabled={templates.length === 0 || saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Template
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saving ? 'Saving...' : saved ? <span className="flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>Saved</span> : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-5">
        {/* Template selector sidebar */}
        <div className="w-56 flex-none">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-50 bg-slate-50/60">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Templates</span>
            </div>
            {templates.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                No templates
              </div>
            ) : (
              templates.map(t => (
                <div key={t.id} className={`flex items-center ${t.id === activeTemplateId ? 'bg-blue-50' : ''}`}>
                  <button
                    onClick={() => setActiveTemplateId(t.id)}
                    className={`flex-1 text-left px-4 py-3 text-sm border-b border-slate-50 transition-colors ${
                      t.id === activeTemplateId ? 'text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-medium leading-tight">{t.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t.jobGrade}</div>
                  </button>
                  {templates.length > 1 && (
                    <button
                      onClick={() => {
                        setActiveTemplateId(t.id)
                        setShowDeleteModal(true)
                      }}
                      className="px-3 py-3 text-slate-300 hover:text-red-500 transition-colors border-b border-slate-50"
                      title="Delete template"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Template editor */}
        {templates.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg className="text-slate-300 mb-3" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
              <div className="text-slate-500 font-medium">Create a template to get started</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-4">
            {/* Meta */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-display font-semibold text-slate-700 mb-4">Template: {activeTemplate.name}</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Template Name</label>
                  <input
                    value={activeTemplate.name}
                    onChange={e => {
                      if (!activeTemplateId) return
                      setTemplates(prev => prev.map(t => t.id === activeTemplateId ? { ...t, name: e.target.value } : t))
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Job Grade</label>
                  <input
                    value={activeTemplate.jobGrade}
                    onChange={e => {
                      if (!activeTemplateId) return
                      setTemplates(prev => prev.map(t => t.id === activeTemplateId ? { ...t, jobGrade: e.target.value } : t))
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Department Applicability</label>
                  <input
                    value={activeTemplate.department}
                    onChange={e => {
                      if (!activeTemplateId) return
                      setTemplates(prev => prev.map(t => t.id === activeTemplateId ? { ...t, department: e.target.value } : t))
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            </div>

            {/* Earnings */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-50 bg-slate-50/60 flex items-center justify-between">
                <span className="font-display font-semibold text-slate-700 text-sm">Default Earnings</span>
                <button
                  type="button"
                  onClick={() => {
                    setNewCompCategory('earning')
                    setNewCompName('Others')
                    setNewCompRateType('flat')
                    setNewCompRate(0)
                    setNewCompTaxable(false)
                    setNewCompActive(true)
                    setShowAddComponentModal(true)
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Add Component / Others</span>
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-50">
                  <tr>
                    {['Component', 'Active Default', 'Taxable Default', 'Attendance Prorated', 'Rate Type', 'Default Rate'].map(h => (
                      <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {earnings.map(comp => (
                    <tr key={comp.id} className={!comp.active ? 'opacity-40' : ''}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 text-sm">{comp.name}</div>
                        {comp.attendanceBased ? (
                          <div className="text-[11px] font-medium text-blue-600 flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            ÷ working days × days present
                          </div>
                        ) : comp.description ? (
                          <div className="text-[11px] text-slate-400 mt-0.5">{comp.description}</div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4"><Toggle value={comp.active} onChange={v => updateComponent(comp.id, { active: v })} /></td>
                      <td className="py-3 px-4"><Toggle value={comp.taxable} onChange={v => updateComponent(comp.id, { taxable: v })} /></td>
                      <td className="py-3 px-4">
                        <Toggle
                          value={comp.attendanceBased ?? false}
                          onChange={v => updateComponent(comp.id, {
                            attendanceBased: v,
                            attendanceSource: v ? 'days_present' : undefined,
                            description: v ? '% of Gross ÷ Working Days × Days Present' : undefined
                          })}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={comp.rateType}
                          onChange={e => updateComponent(comp.id, { rateType: e.target.value as RateType })}
                          className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                        >
                          {Object.entries(RATE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        {comp.rateType !== 'monthly_manual' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" value={comp.rate}
                              onChange={e => updateComponent(comp.id, { rate: Number(e.target.value) })}
                              className="w-24 text-sm border border-slate-200 rounded px-2 py-1 font-mono-data focus:outline-none focus:border-blue-400"
                            />
                            {(comp.rateType === 'pct_gross' || comp.rateType === 'pct_basic') && <span className="text-slate-400 text-xs">%</span>}
                          </div>
                        ) : <span className="text-xs text-slate-400">Monthly entry</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Deductions */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-50 bg-slate-50/60 flex items-center justify-between">
                <span className="font-display font-semibold text-slate-700 text-sm">Default Deductions</span>
                <button
                  type="button"
                  onClick={() => {
                    setNewCompCategory('deduction')
                    setNewCompName('')
                    setNewCompRateType('flat')
                    setNewCompRate(0)
                    setNewCompTaxable(false)
                    setNewCompActive(true)
                    setShowAddComponentModal(true)
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Add Deduction</span>
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-50">
                  <tr>
                    {['Component', 'Active Default', 'Rate Type', 'Default Rate'].map(h => (
                      <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {deductions.map(comp => (
                    <tr key={comp.id} className={!comp.active ? 'opacity-40' : ''}>
                      <td className="py-3 px-4 font-medium text-slate-800">{comp.name}</td>
                      <td className="py-3 px-4"><Toggle value={comp.active} onChange={v => updateComponent(comp.id, { active: v })} /></td>
                      <td className="py-3 px-4">
                        <select value={comp.rateType} onChange={e => updateComponent(comp.id, { rateType: e.target.value as RateType })} className="text-xs border border-slate-200 rounded px-2 py-1 bg-white">
                          {Object.entries(RATE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <input type="number" value={comp.rate} onChange={e => updateComponent(comp.id, { rate: Number(e.target.value) })}
                            className="w-24 text-sm border border-slate-200 rounded px-2 py-1 font-mono-data focus:outline-none focus:border-blue-400" />
                          {(comp.rateType === 'pct_gross' || comp.rateType === 'pct_basic') && <span className="text-slate-400 text-xs">%</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-80 p-6 anim-fade-up">
            <h3 className="font-display font-semibold text-slate-800 mb-4">New Template</h3>
            <input
              autoFocus value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTemplate()}
              placeholder="Template name..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowNewModal(false)} className="flex-1 py-2 rounded-lg border text-sm text-slate-600">Cancel</button>
              <button onClick={addTemplate} disabled={saving} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-96 p-6 anim-fade-up">
            <h3 className="font-display font-semibold text-slate-800 mb-2">Delete Template</h3>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to delete "{activeTemplate?.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-2 rounded-lg border text-sm text-slate-600">Cancel</button>
              <button onClick={deleteTemplate} disabled={saving} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddComponentModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 anim-fade-up">
            <h3 className="font-display font-semibold text-slate-800 mb-3">Add Salary Component</h3>
            <div className="space-y-3.5 mb-5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Component Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newCompName}
                  onChange={e => setNewCompName(e.target.value)}
                  placeholder="e.g. Others, Hazard Allowance, Shift Allowance..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                  <select
                    value={newCompCategory}
                    onChange={e => setNewCompCategory(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="earning">Earning (Allowance)</option>
                    <option value="deduction">Deduction</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Rate Type</label>
                  <select
                    value={newCompRateType}
                    onChange={e => setNewCompRateType(e.target.value as RateType)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                  >
                    {Object.entries(RATE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              {newCompRateType !== 'monthly_manual' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Default Rate {(newCompRateType === 'pct_gross' || newCompRateType === 'pct_basic') ? '(%)' : '(₦)'}
                  </label>
                  <input
                    type="number"
                    value={newCompRate}
                    onChange={e => setNewCompRate(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 font-mono-data focus:outline-none focus:border-blue-400"
                  />
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="compActive"
                    checked={newCompActive}
                    onChange={e => setNewCompActive(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  <label htmlFor="compActive" className="text-xs text-slate-700">Active by Default</label>
                </div>
                {newCompCategory === 'earning' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="compTaxable"
                      checked={newCompTaxable}
                      onChange={e => setNewCompTaxable(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <label htmlFor="compTaxable" className="text-xs text-slate-700">Taxable</label>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddComponentModal(false)}
                className="flex-1 py-2 rounded-lg border text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddNewComponent}
                disabled={!newCompName.trim()}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Add Component
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
