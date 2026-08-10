import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { dbRateTypeToApp, appRateTypeToDb } from '../../lib/rateTypeMap'
import { logAction } from '../../lib/auditLog'
import type { SalaryComponent, StaffSalaryStructure, RateType } from '../../types'

interface Props {
  staffId?: string
}

type ToggleVariant = 'active' | 'taxable'
type Role = 'superadmin' | 'hr' | 'accountant' | 'auditor' | 'staff'

const RATE_TYPE_LABELS: Record<RateType, string> = {
  flat: 'Flat Amount',
  pct_gross: '% of Gross',
  pct_basic: '% of Basic',
  per_hour: 'Per Hour',
  per_day: 'Per Day',
  monthly_manual: 'Manual Monthly',
}

function Toggle({ value, onChange, variant }: { value: boolean; onChange: (v: boolean) => void; variant: ToggleVariant }) {
  const on = variant === 'active'
    ? 'bg-emerald-500'
    : 'bg-violet-500'

  const label = variant === 'active'
    ? (value ? 'On' : 'Off')
    : (value ? 'Taxable' : 'Exempt')

  const labelColor = value
    ? (variant === 'active' ? 'text-emerald-700' : 'text-violet-700')
    : 'text-slate-400'

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-none ${value ? on : 'bg-slate-200'}`}
        style={{ boxShadow: value ? undefined : 'inset 0 1px 3px rgba(0,0,0,0.12)' }}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
      <span className={`text-xs font-medium leading-none ${labelColor}`}>{label}</span>
    </div>
  )
}

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-slate-300 hover:text-slate-500 transition-colors ml-1"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  )
}

export default function SalaryStructure({ staffId }: Props) {
  const [staff, setStaff] = useState<any>(null)
  const [components, setComponents] = useState<SalaryComponent[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [reliefs, setReliefs] = useState({ annualRent: 0, lifeInsurance: 0, nhfContrib: 0, pension: 0 })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null)

  useEffect(() => {
    const fetchCurrentUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile) {
          setCurrentUserRole(profile.role as Role)
        }
      } catch (err) {
        console.error('Error fetching current user role:', err)
      }
    }

    fetchCurrentUserRole()
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      if (!staffId) return

      setLoading(true)
      setError('')

      try {
        // Fetch staff (required - if this fails, we can't continue)
        const { data: staffData, error: staffError } = await supabase
          .from('staff')
          .select('id, full_name, staff_code, job_title, gross_salary, photo_url')
          .eq('id', staffId)
          .single()

        if (staffError) throw staffError
        setStaff(staffData)

        // Fetch staff salary components (independent)
        let compData
        try {
          const compResult = await supabase
            .from('staff_salary_components')
            .select('*, salary_components(name, category, default_rate_type)')
            .eq('staff_id', staffId)

          compData = compResult.data
          console.log('Raw staff_salary_components data:', JSON.stringify(compData?.[0], null, 2))
          if (compResult.error) throw compResult.error

          // If no components exist, create default ones
          if (!compData || compData.length === 0) {
            const { data: allComponents } = await supabase
              .from('salary_components')
              .select('*')
              .order('name')

            if (allComponents) {
              const inserts = allComponents.map(c => ({
                staff_id: staffId,
                component_id: c.id,
                is_active: false,
                is_taxable: false,
                rate_type: c.default_rate_type,
                rate: 0,
              }))

              const { error: insertError } = await supabase
                .from('staff_salary_components')
                .insert(inserts)

              if (insertError) throw insertError

              // Re-fetch after insert
              const refetchResult = await supabase
                .from('staff_salary_components')
                .select('*, salary_components(name, category, default_rate_type)')
                .eq('staff_id', staffId)

              compData = refetchResult.data
            }
          }

          // Map components to SalaryComponent shape
          const mappedComponents: SalaryComponent[] = (compData || []).map(c => ({
            id: c.id,
            name: c.salary_components?.name || 'Unknown',
            category: c.salary_components?.category === 'allowance' ? 'earning' : 'deduction',
            active: c.is_active,
            taxable: c.is_taxable,
            rateType: dbRateTypeToApp(c.rate_type),
            rate: c.rate || 0,
            attendanceBased: false,
            attendanceSource: undefined,
            description: undefined,
          }))

          setComponents(mappedComponents)
        } catch (err) {
          console.error('Error fetching staff salary components:', err)
        }

        // Fetch templates (independent)
        try {
          const { data: templateData, error: templateError } = await supabase
            .from('salary_templates')
            .select('id, name, job_grade, department')
            .order('name')

          if (templateError) throw templateError
          setTemplates(templateData || [])
        } catch (err) {
          console.error('Error fetching templates:', err)
        }

        // Fetch tax reliefs (independent - use maybeSingle to handle no row gracefully)
        try {
          const { data: reliefData, error: reliefError } = await supabase
            .from('staff_tax_reliefs')
            .select('*')
            .eq('staff_id', staffId)
            .maybeSingle()

          if (reliefError) throw reliefError

          setReliefs({
            annualRent: reliefData?.annual_rent_paid || 0,
            lifeInsurance: reliefData?.life_assurance_premium || 0,
            nhfContrib: 0, // Not in DB yet
            pension: 0, // Not in DB yet
          })
        } catch (err) {
          console.error('Error fetching tax reliefs:', err)
          // Default to all-zero values on error
          setReliefs({
            annualRent: 0,
            lifeInsurance: 0,
            nhfContrib: 0,
            pension: 0,
          })
        }
      } catch (err) {
        // Only set error state for critical failures (like staff fetch)
        setError(err instanceof Error ? err.message : 'Failed to load salary structure')
        console.error('Critical error fetching salary structure:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [staffId])

  const earnings = components.filter(c => c.category === 'earning')
  const deductions = components.filter(c => c.category === 'deduction')

  const updateComponent = (id: string, patch: Partial<SalaryComponent>) => {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  const handleSave = async () => {
    if (!staffId || saving) return

    setSaving(true)
    setError('')

    try {
      // Update each component
      for (const comp of components) {
        const { error } = await supabase
          .from('staff_salary_components')
          .update({
            is_active: comp.active,
            is_taxable: comp.taxable,
            rate_type: appRateTypeToDb(comp.rateType),
            rate: comp.rate,
          })
          .eq('id', comp.id)

        if (error) throw error
      }

      // Upsert tax reliefs
      const { error: reliefError } = await supabase
        .from('staff_tax_reliefs')
        .upsert({
          staff_id: staffId,
          annual_rent_paid: reliefs.annualRent,
          life_assurance_premium: reliefs.lifeInsurance,
          // nhfContrib and pension not in DB yet - local only for now
        })

      if (reliefError) throw reliefError

      // Log action
      await logAction({
        action: 'UPDATE',
        entity: 'SalaryStructure',
        entityId: staffId,
        details: `Updated salary structure for ${staff?.full_name}`,
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save salary structure')
      console.error('Error saving salary structure:', err)
    } finally {
      setSaving(false)
    }
  }

  const applyTemplate = async (templateId: string) => {
    if (!staffId) return

    try {
      // Fetch template components
      const { data: templateComps, error: templateError } = await supabase
        .from('salary_template_components')
        .select('*, salary_components(name, category)')
        .eq('template_id', templateId)

      if (templateError) throw templateError

      // Update each staff component with template values
      for (const tComp of templateComps || []) {
        const { error } = await supabase
          .from('staff_salary_components')
          .update({
            is_active: tComp.is_active,
            is_taxable: tComp.is_taxable,
            rate_type: tComp.rate_type,
            rate: tComp.rate,
          })
          .eq('staff_id', staffId)
          .eq('component_id', tComp.component_id)

        if (error) throw error
      }

      // Re-fetch components
      const { data: refetched } = await supabase
        .from('staff_salary_components')
        .select('*, salary_components(name, category, default_rate_type)')
        .eq('staff_id', staffId)

      if (refetched) {
        const mapped = refetched.map(c => ({
          id: c.id,
          name: c.salary_components?.name || 'Unknown',
          category: c.salary_components?.category === 'allowance' ? 'earning' : 'deduction',
          active: c.is_active,
          taxable: c.is_taxable,
          rateType: dbRateTypeToApp(c.rate_type),
          rate: c.rate || 0,
          attendanceBased: false,
          attendanceSource: undefined,
          description: undefined,
        }))
        setComponents(mapped)
      }

      setShowTemplateModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template')
      console.error('Error applying template:', err)
    }
  }

  const totalEarnings = (comp: SalaryComponent[]): string => {
    const fixed = comp.filter(c => c.active && !c.attendanceBased)
    const pctGross = fixed.filter(c => c.rateType === 'pct_gross').reduce((a, c) => a + c.rate, 0)
    return `${pctGross}% of gross + variable`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!staff) {
    return (
      <div className="text-center py-16">
        <svg className="text-slate-400 mb-3 mx-auto" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <div className="text-slate-500">Staff not found</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 anim-fade">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img 
            src={staff.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(staff.full_name)}&background=random&size=64`} 
            alt={staff.full_name} 
            className="w-10 h-10 rounded-full object-cover" 
          />
          <div>
            <h3 className="font-display font-semibold text-slate-800">Salary Structure — {staff.full_name}</h3>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono-data">{staff.staff_code || '—'}</span>
              <span>·</span>
              <span>{staff.job_title || '—'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentUserRole !== 'staff' && (
            <>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
                Copy from Template
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-60`}
              >
                {saving ? 'Saving...' : saved ? <span className="flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>Saved</span> : 'Save Structure'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Earnings table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h4 className="font-display font-semibold text-slate-700">Earnings Components</h4>
          <span className="text-xs text-slate-400">{totalEarnings(earnings)}</span>
        </div>
        {/* Column legend */}
        <div className="grid items-center border-b border-slate-100 bg-slate-50/30 px-6 py-2" style={{ gridTemplateColumns: '1fr 80px 92px 160px 160px 1fr' }}>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Component</span>
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center">Active</span>
          <span className="text-xs font-semibold text-violet-600 uppercase tracking-wide text-center">Taxable</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide pl-2">Rate Type</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide pl-2">Amount / Rate</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide pl-4">Computed value</span>
        </div>
        <div className="divide-y divide-slate-50">
          {earnings.map(comp => (
            <div
              key={comp.id}
              className={`grid items-center px-6 py-4 gap-4 transition-colors hover:bg-slate-50/40 ${!comp.active ? 'opacity-40' : ''}`}
              style={{ gridTemplateColumns: '1fr 80px 92px 160px 160px 1fr' }}
            >
              {/* Component name */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 text-sm">{comp.name}</span>
                  {comp.attendanceBased && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-medium">
                      attendance
                    </span>
                  )}
                  {comp.description && <Tooltip text={comp.description} />}
                </div>
                {comp.attendanceSource && (
                  <span className="text-xs text-slate-400">source: {comp.attendanceSource.replace(/_/g, ' ')}</span>
                )}
              </div>

              {/* Active toggle — emerald */}
              <div className="flex justify-center">
                {currentUserRole === 'staff' ? (
                  <span className={`text-xs font-medium ${comp.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {comp.active ? 'On' : 'Off'}
                  </span>
                ) : (
                  <Toggle value={comp.active} onChange={v => updateComponent(comp.id, { active: v })} variant="active" />
                )}
              </div>

              {/* Taxable toggle — violet */}
              <div className="flex justify-center">
                {currentUserRole === 'staff' ? (
                  <span className={`text-xs font-medium ${comp.taxable ? 'text-violet-700' : 'text-slate-400'}`}>
                    {comp.taxable ? 'Taxable' : 'Exempt'}
                  </span>
                ) : (
                  <Toggle value={comp.taxable} onChange={v => updateComponent(comp.id, { taxable: v })} variant="taxable" />
                )}
              </div>

              {/* Rate Type */}
              <div>
                {currentUserRole === 'staff' ? (
                  <div className="text-sm text-slate-700 py-2">{RATE_TYPE_LABELS[comp.rateType]}</div>
                ) : (
                  <select
                    value={comp.rateType}
                    onChange={e => updateComponent(comp.id, { rateType: e.target.value as RateType })}
                    disabled={!comp.active}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 disabled:opacity-50 disabled:bg-slate-50"
                  >
                    {Object.entries(RATE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Amount / Rate input */}
              <div>
                {currentUserRole === 'staff' ? (
                  <div className="flex items-center gap-1.5 py-2">
                    {(comp.rateType !== 'pct_gross' && comp.rateType !== 'pct_basic') && (
                      <span className="text-slate-400 text-sm flex-none">₦</span>
                    )}
                    <span className="text-sm font-mono-data text-slate-700">{comp.rate}</span>
                    {(comp.rateType === 'pct_gross' || comp.rateType === 'pct_basic') && (
                      <span className="text-slate-400 text-sm flex-none">%</span>
                    )}
                  </div>
                ) : (
                  <>
                    {comp.rateType !== 'monthly_manual' ? (
                      <div className="flex items-center gap-1.5">
                        {(comp.rateType !== 'pct_gross' && comp.rateType !== 'pct_basic') && (
                          <span className="text-slate-400 text-sm flex-none">₦</span>
                        )}
                        <input
                          type="number"
                          value={comp.rate}
                          onChange={e => updateComponent(comp.id, { rate: Number(e.target.value) })}
                          disabled={!comp.active}
                          className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono-data focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 disabled:opacity-50 disabled:bg-slate-50"
                        />
                        {(comp.rateType === 'pct_gross' || comp.rateType === 'pct_basic') && (
                          <span className="text-slate-400 text-sm flex-none">%</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400 italic">Entered each month</span>
                    )}
                  </>
                )}
              </div>

              {/* Computed note */}
              <div className="text-xs text-slate-400 pl-4 leading-relaxed">
                {comp.rateType === 'pct_gross'
                  ? <><span className="font-mono-data text-slate-600">₦{Math.round((staff.gross_salary || 0) * comp.rate / 100).toLocaleString()}</span> <span className="text-slate-300">({comp.rate}% of gross)</span></>
                  : comp.rateType === 'pct_basic'
                  ? `${comp.rate}% of basic`
                  : comp.rateType === 'per_hour'
                  ? `₦${comp.rate.toLocaleString()} per hour`
                  : comp.rateType === 'per_day'
                  ? `₦${comp.rate.toLocaleString()} per day`
                  : comp.rateType === 'flat'
                  ? `Fixed monthly`
                  : 'Manual input'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deductions table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <h4 className="font-display font-semibold text-slate-700">Deduction Components</h4>
        </div>
        {/* Column legend */}
        <div className="grid items-center border-b border-slate-100 bg-slate-50/30 px-6 py-2" style={{ gridTemplateColumns: '1fr 80px 160px 160px 1fr' }}>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Component</span>
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide text-center">Active</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide pl-2">Rate Type</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide pl-2">Amount / Rate</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide pl-4">Computed value</span>
        </div>
        <div className="divide-y divide-slate-50">
          {deductions.map(comp => (
            <div
              key={comp.id}
              className={`grid items-center px-6 py-4 gap-4 transition-colors hover:bg-slate-50/40 ${!comp.active ? 'opacity-40' : ''}`}
              style={{ gridTemplateColumns: '1fr 80px 160px 160px 1fr' }}
            >
              <div className="font-semibold text-slate-800 text-sm">{comp.name}</div>

              <div className="flex justify-center">
                {currentUserRole === 'staff' ? (
                  <span className={`text-xs font-medium ${comp.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {comp.active ? 'On' : 'Off'}
                  </span>
                ) : (
                  <Toggle value={comp.active} onChange={v => updateComponent(comp.id, { active: v })} variant="active" />
                )}
              </div>

              <div>
                {currentUserRole === 'staff' ? (
                  <div className="text-sm text-slate-700 py-2">{RATE_TYPE_LABELS[comp.rateType]}</div>
                ) : (
                  <select
                    value={comp.rateType}
                    onChange={e => updateComponent(comp.id, { rateType: e.target.value as RateType })}
                    disabled={!comp.active}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 disabled:opacity-50 disabled:bg-slate-50"
                  >
                    {Object.entries(RATE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                {currentUserRole === 'staff' ? (
                  <div className="flex items-center gap-1.5 py-2">
                    <span className="text-sm font-mono-data text-slate-700">{comp.rate}</span>
                    {(comp.rateType === 'pct_gross' || comp.rateType === 'pct_basic') && (
                      <span className="text-slate-400 text-sm flex-none">%</span>
                    )}
                  </div>
                ) : (
                  <>
                    {comp.rateType !== 'monthly_manual' ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={comp.rate}
                          onChange={e => updateComponent(comp.id, { rate: Number(e.target.value) })}
                          disabled={!comp.active}
                          className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono-data focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 disabled:opacity-50 disabled:bg-slate-50"
                        />
                        {(comp.rateType === 'pct_gross' || comp.rateType === 'pct_basic') && (
                          <span className="text-slate-400 text-sm">%</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400 italic">Entered monthly</span>
                    )}
                  </>
                )}
              </div>

              <div className="text-xs text-slate-400 pl-4">
                {comp.rateType === 'pct_basic'
                  ? `${comp.rate}% of basic salary`
                  : comp.rateType === 'flat'
                  ? `Fixed ₦${comp.rate.toLocaleString()}`
                  : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tax Reliefs section */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <h4 className="font-display font-semibold text-slate-700 text-sm">Individual Tax Reliefs</h4>
          <Tooltip text="These reliefs reduce this staff member's taxable income before PAYE is calculated. Values should be the annual amounts as declared by the employee." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'annualRent' as const, label: 'Annual Rent Paid (₦)', desc: 'Reduces taxable income' },
            { key: 'lifeInsurance' as const, label: 'Life Insurance Premium (₦)', desc: 'NHIS / group life' },
            { key: 'nhfContrib' as const, label: 'Additional NHF Contributions (₦)', desc: 'Beyond statutory 2.5%' },
            { key: 'pension' as const, label: 'Voluntary Pension Contributions (₦)', desc: 'Beyond statutory 8%' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
              {currentUserRole === 'staff' ? (
                <div className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 font-mono-data text-slate-700">
                  {reliefs[f.key] || 0}
                </div>
              ) : (
                <input
                  type="number"
                  value={reliefs[f.key]}
                  onChange={e => setReliefs(r => ({ ...r, [f.key]: Number(e.target.value) }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 font-mono-data"
                />
              )}
              <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Template modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg anim-fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-display font-semibold text-slate-800">Copy from Template</h3>
                <p className="text-xs text-slate-500">Applies default structure — you can adjust afterwards</p>
              </div>
              <button onClick={() => setShowTemplateModal(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-4 space-y-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.id)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all text-left"
                >
                  <div>
                    <div className="font-medium text-slate-800">{t.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.job_grade} · {t.department}</div>
                  </div>
                  <div className="text-xs text-slate-400">
                    Template
                  </div>
                </button>
              ))}
              {templates.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No templates available
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
