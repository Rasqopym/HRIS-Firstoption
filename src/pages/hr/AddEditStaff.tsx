import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAction } from '../../lib/auditLog'
import type { Page } from '../../types'

interface Props { onNavigate: (p: Page) => void; staffId?: string | null }

type Step = 'personal' | 'employment' | 'financial' | 'review'
const STEPS: Step[] = ['personal', 'employment', 'financial', 'review']
const STEP_LABELS = { personal: 'Personal Info', employment: 'Employment', financial: 'Financial', review: 'Review' }

const BANKS = ['Access Bank', 'First Bank', 'Guaranty Trust Bank', 'United Bank for Africa', 'Zenith Bank', 'Fidelity Bank', 'Union Bank', 'Sterling Bank', 'Wema Bank', 'Polaris Bank', 'Ecobank Nigeria', 'Stanbic IBTC', 'Kuda Bank', 'Titan Trust Bank', 'Heritage Bank']

export default function AddEditStaff({ onNavigate, staffId }: Props) {
  const [step, setStep] = useState<Step>('personal')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [generatedStaffId, setGeneratedStaffId] = useState('')
  const [staffCode, setStaffCode] = useState('')
  const [error, setError] = useState('')
  const [isEditMode, setIsEditMode] = useState(false)

  const [personal, setPersonal] = useState({ firstName: '', lastName: '', email: '', phone: '', dob: '', gender: 'Male', address: '', state: '', nextOfKin: '', nextOfKinPhone: '' })
  const [employment, setEmployment] = useState({ department: '', jobTitle: '', employmentDate: '', employmentType: 'Full-time' })
  const [financial, setFinancial] = useState<{ grossSalary: string; bankName: string; accountNumber: string; accountName: string }>({ grossSalary: '', bankName: BANKS[0], accountNumber: '', accountName: '' })

  const stepIdx = STEPS.indexOf(step)
  const progress = ((stepIdx + 1) / STEPS.length) * 100

  useEffect(() => {
    const fetchDepartments = async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) {
        console.error('Error fetching departments:', error)
      } else {
        setDepartments(data ?? [])
        if (data && data.length > 0) {
          setEmployment(p => ({ ...p, department: data[0].id }))
        }
      }
    }

    fetchDepartments()
  }, [])

  useEffect(() => {
    const fetchStaffData = async () => {
      if (!staffId) {
        setIsEditMode(false)
        setStaffCode('')
        return
      }

      setIsEditMode(true)
      try {
        const { data, error } = await supabase
          .from('staff')
          .select('*')
          .eq('id', staffId)
          .single()

        if (error) throw error

        if (data) {
          // Split full_name into firstName and lastName
          const nameParts = (data.full_name || '').split(' ')
          const firstName = nameParts[0] || ''
          const lastName = nameParts.slice(1).join(' ') || ''

          setPersonal({
            firstName,
            lastName,
            email: data.email || '',
            phone: data.phone || '',
            dob: data.dob || '',
            gender: data.gender || 'Male',
            address: data.address || '',
            state: data.state || '',
            nextOfKin: data.next_of_kin || '',
            nextOfKinPhone: data.next_of_kin_phone || '',
          })

          setEmployment({
            department: data.department_id || '',
            jobTitle: data.job_title || '',
            employmentDate: data.date_employed || '',
            employmentType: data.employment_type || 'Full-time',
          })

          setFinancial({
            grossSalary: data.gross_salary?.toString() || '',
            bankName: data.bank_name || BANKS[0],
            accountNumber: data.account_number || '',
            accountName: data.account_name || '',
          })

          setStaffCode(data.staff_code || '')
          setGeneratedStaffId(data.staff_code || '')
        }
      } catch (err) {
        console.error('Error fetching staff data:', err)
        setError('Failed to load staff data')
      }
    }

    fetchStaffData()
  }, [staffId])

  const validatePersonal = () => {
    if (!personal.firstName.trim() || !personal.lastName.trim() || !personal.email.trim()) {
      setError('Please fill in First Name, Last Name, and Email')
      return false
    }
    setError('')
    return true
  }

  const handleContinue = () => {
    if (step === 'personal' && !validatePersonal()) {
      return
    }
    setStep(STEPS[stepIdx + 1])
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    try {
      const fullName = `${personal.firstName} ${personal.lastName}`
      const deptObj = departments.find(d => d.id === employment.department)
      const deptName = deptObj ? deptObj.name : (employment.department || 'General Operations')
      const rawDeptId = deptObj?.id || employment.department
      const isValidUuid = (id?: string | null) => !!id && id.length === 36 && id.includes('-')
      const validDeptId = isValidUuid(rawDeptId) ? rawDeptId : null

      let data: any = null
      let error: any = null

      const basePayload: any = {
        full_name: fullName,
        email: personal.email || null,
        phone: personal.phone || null,
        dob: personal.dob || null,
        gender: personal.gender || null,
        address: personal.address || null,
        state: personal.state || null,
        next_of_kin: personal.nextOfKin || null,
        next_of_kin_phone: personal.nextOfKinPhone || null,
        job_title: employment.jobTitle || 'Staff',
        date_employed: employment.employmentDate || null,
        employment_type: employment.employmentType || 'Full-time',
        gross_salary: financial.grossSalary ? Number(financial.grossSalary) : null,
        bank_name: financial.bankName || null,
        account_number: financial.accountNumber || null,
        account_name: financial.accountName || null,
        status: 'active',
      }

      if (staffCode.trim()) {
        basePayload.staff_code = staffCode.trim().toUpperCase()
      }

      if (validDeptId) {
        basePayload.department_id = validDeptId
      }
      if (deptName) {
        basePayload.department = deptName
      }

      if (isEditMode && staffId) {
        // UPDATE existing staff
        let updateRes = await supabase
          .from('staff')
          .update(basePayload)
          .eq('id', staffId)
          .select('id, staff_code')
          .maybeSingle()

        if (updateRes.error && updateRes.error.message?.includes('department')) {
          delete basePayload.department
          updateRes = await supabase
            .from('staff')
            .update(basePayload)
            .eq('id', staffId)
            .select('id, staff_code')
            .maybeSingle()
        }

        if (updateRes.error) throw updateRes.error
        data = updateRes.data

        await logAction({
          action: 'UPDATE',
          entity: 'Staff',
          entityId: staffId,
          details: `Updated staff record for ${fullName}`,
        })
      } else {
        // INSERT new staff
        let insertRes = await supabase
          .from('staff')
          .insert(basePayload)
          .select('id, staff_code')
          .maybeSingle()

        // Fallback if 'department' column does not exist on schema
        if (insertRes.error && insertRes.error.message?.includes('department')) {
          delete basePayload.department
          insertRes = await supabase
            .from('staff')
            .insert(basePayload)
            .select('id, staff_code')
            .maybeSingle()
        }

        if (insertRes.error) throw insertRes.error
        data = insertRes.data

        setGeneratedStaffId(data?.staff_code || 'N/A')

        await logAction({
          action: 'CREATE',
          entity: 'Staff',
          entityId: data?.id || '',
          details: `Added new staff record for ${fullName}`,
        })
      }

      setSubmitted(true)
    } catch (err: any) {
      const errMsg = err?.message || err?.details || (err instanceof Error ? err.message : String(err)) || 'Failed to save staff record'
      setError(errMsg)
      console.error('Error saving staff:', err)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 max-w-sm w-full text-center anim-fade-up">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 className="font-display font-bold text-slate-800 text-2xl mb-2">
            {isEditMode ? 'Staff Updated!' : 'Staff Added!'}
          </h3>
          <p className="text-slate-500 text-sm mb-6">
            <strong>{personal.firstName} {personal.lastName}</strong> has been successfully {isEditMode ? 'updated' : 'onboarded'} to the system.
          </p>
          {!isEditMode && (
            <div className="bg-slate-50 rounded-lg p-3 mb-6">
              <div className="text-xs text-slate-500 mb-1">Staff ID</div>
              <div className="font-mono-data text-lg font-bold text-slate-800">{generatedStaffId}</div>
            </div>
          )}
          <div className="flex gap-3">
            {isEditMode ? (
              <button
                onClick={() => onNavigate('hr-profile')}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
              >
                View Profile
              </button>
            ) : (
              <button
                onClick={() => {
                  setSubmitted(false)
                  setStep('personal')
                  setPersonal({ firstName: '', lastName: '', email: '', phone: '', dob: '', gender: 'Male', address: '', state: '', nextOfKin: '', nextOfKinPhone: '' })
                  setEmployment({ department: departments[0]?.id || '', jobTitle: '', employmentDate: '', employmentType: 'Full-time' })
                  setFinancial({ grossSalary: '', bankName: BANKS[0], accountNumber: '', accountName: '' })
                  setError('')
                  setGeneratedStaffId('')
                }}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
              >
                Add Another
              </button>
            )}
            <button
              onClick={() => onNavigate('hr-directory')}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              View Directory
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 anim-fade-up">
      <button onClick={() => onNavigate('hr-directory')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Directory
      </button>
      <div className="mb-6">
        <h2 className="font-display font-semibold text-slate-800 text-xl">
          {isEditMode ? 'Edit Staff' : 'Add New Staff'}
        </h2>
        <p className="text-sm text-slate-500">
          {isEditMode ? 'Update staff information' : 'Multi-step onboarding form'}
        </p>
      </div>

      <div className="max-w-2xl">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Stepper */}
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <button
                  onClick={() => i < stepIdx && setStep(s)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    i < stepIdx ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700'
                      : i === stepIdx ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                      : 'bg-slate-100 text-slate-400 cursor-default'
                  }`}
                >
                  {i < stepIdx ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : i + 1}
                </button>
                <span className={`text-xs mt-1.5 font-medium hidden sm:block ${i === stepIdx ? 'text-blue-600' : i < stepIdx ? 'text-slate-600' : 'text-slate-400'}`}>
                  {STEP_LABELS[s]}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 transition-all ${i < stepIdx ? 'bg-blue-400' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          {/* Step 1: Personal */}
          {step === 'personal' && (
            <div className="anim-fade">
              <h3 className="font-display font-semibold text-slate-800 text-lg mb-5">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'firstName', label: 'First Name', placeholder: 'e.g. Amara' },
                  { key: 'lastName', label: 'Last Name', placeholder: 'e.g. Okafor' },
                  { key: 'email', label: 'Email Address', placeholder: 'amara.okafor@firstoption.ng', type: 'email', full: true },
                  { key: 'phone', label: 'Phone Number', placeholder: '+234 800 000 0000' },
                  { key: 'dob', label: 'Date of Birth', type: 'date' },
                  { key: 'address', label: 'Home Address', placeholder: '14 Example Street, Lagos', full: true },
                  { key: 'state', label: 'State', placeholder: 'e.g. Lagos' },
                  { key: 'nextOfKin', label: 'Next of Kin', placeholder: 'Full name' },
                  { key: 'nextOfKinPhone', label: "Next of Kin Phone", placeholder: '+234 800 000 0000' },
                ].map(f => (
                  <div key={f.key} className={f.full ? 'col-span-2' : ''}>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">{f.label}</label>
                    <input
                      type={f.type || 'text'}
                      value={personal[f.key as keyof typeof personal]}
                      onChange={e => setPersonal(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Gender</label>
                  <select
                    value={personal.gender}
                    onChange={e => setPersonal(p => ({ ...p, gender: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option>Male</option><option>Female</option><option>Prefer not to say</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Employment */}
          {step === 'employment' && (
            <div className="anim-fade">
              <h3 className="font-display font-semibold text-slate-800 text-lg mb-5">Employment Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Staff ID / Employee Code {isEditMode ? '(Editable by Admin)' : '(Optional / Manual Assignment)'}
                  </label>
                  <input
                    value={staffCode}
                    onChange={e => setStaffCode(e.target.value.toUpperCase())}
                    placeholder={isEditMode ? "e.g. FO-0001" : "Leave blank to auto-generate or type custom ID"}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 font-mono-data uppercase bg-slate-50/50"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {isEditMode ? 'Superadmin can edit or re-assign this Staff ID.' : 'Manually assign an ID or leave blank to automatically generate the next code.'}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Employment Date</label>
                  <input
                    type="date" value={employment.employmentDate}
                    onChange={e => setEmployment(p => ({ ...p, employmentDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Department</label>
                  <select
                    value={employment.department}
                    onChange={e => setEmployment(p => ({ ...p, department: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Job Title</label>
                  <input
                    value={employment.jobTitle}
                    onChange={e => setEmployment(p => ({ ...p, jobTitle: e.target.value }))}
                    placeholder="e.g. HR Coordinator"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Employment Type</label>
                  <select
                    value={employment.employmentType}
                    onChange={e => setEmployment(p => ({ ...p, employmentType: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Financial */}
          {step === 'financial' && (
            <div className="anim-fade">
              <h3 className="font-display font-semibold text-slate-800 text-lg mb-5">Financial Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Gross Monthly Salary (₦)</label>
                  <input
                    type="number" value={financial.grossSalary}
                    onChange={e => setFinancial(p => ({ ...p, grossSalary: e.target.value }))}
                    placeholder="e.g. 250000"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 font-mono-data"
                  />
                  {financial.grossSalary && (
                    <p className="text-xs text-slate-400 mt-1">
                      Net est.: ₦{Math.round(Number(financial.grossSalary) * 0.795).toLocaleString()} (after deductions)
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Bank Name</label>
                  <select
                    value={financial.bankName}
                    onChange={e => setFinancial(p => ({ ...p, bankName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Account Number</label>
                  <input
                    value={financial.accountNumber} maxLength={10}
                    onChange={e => setFinancial(p => ({ ...p, accountNumber: e.target.value }))}
                    placeholder="10-digit NUBAN"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 font-mono-data"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Account Name</label>
                  <input
                    value={financial.accountName}
                    onChange={e => setFinancial(p => ({ ...p, accountName: e.target.value }))}
                    placeholder="As on bank records"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 'review' && (
            <div className="anim-fade">
              <h3 className="font-display font-semibold text-slate-800 text-lg mb-5">Review & Confirm</h3>
              <div className="space-y-4">
                {[
                  { title: 'Personal', items: [
                    { l: 'Full Name', v: `${personal.firstName} ${personal.lastName}` },
                    { l: 'Email', v: personal.email },
                    { l: 'Phone', v: personal.phone },
                  ]},
                  { title: 'Employment', items: [
                    { l: 'Staff ID', v: staffCode || (isEditMode ? 'Unchanged' : 'Auto-generated (FO-XXXX)'), mono: true },
                    { l: 'Department', v: departments.find(d => d.id === employment.department)?.name || '—' },
                    { l: 'Job Title', v: employment.jobTitle },
                    { l: 'Employment Date', v: employment.employmentDate || '—' },
                    { l: 'Employment Type', v: employment.employmentType },
                  ]},
                  { title: 'Financial', items: [
                    { l: 'Gross Salary', v: financial.grossSalary ? `₦${Number(financial.grossSalary).toLocaleString()}` : '—' },
                    { l: 'Bank', v: financial.bankName },
                    { l: 'Account No.', v: financial.accountNumber || '—', mono: true },
                  ]},
                ].map(section => (
                  <div key={section.title} className="rounded-lg border border-slate-100 p-4">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{section.title}</h4>
                    <div className="space-y-2">
                      {section.items.map(item => (
                        <div key={item.l} className="flex justify-between text-sm">
                          <span className="text-slate-500">{item.l}</span>
                          <span className={`text-slate-800 ${item.mono ? 'font-mono-data' : ''}`}>{item.v || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-100">
            <button
              onClick={() => stepIdx > 0 && setStep(STEPS[stepIdx - 1])}
              disabled={stepIdx === 0}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {stepIdx < STEPS.length - 1 ? (
              <button
                onClick={handleContinue}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Confirm & Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
