import type { SalaryComponent, StaffSalaryStructure, SalaryTemplate, TaxBand } from '../types'

const EARNING_COMPONENTS: SalaryComponent[] = [
  { id: 'basic', name: 'Basic Salary', active: true, taxable: true, rateType: 'pct_gross', rate: 60, category: 'earning', attendanceBased: false },
  { id: 'housing', name: 'Housing Allowance', active: true, taxable: true, rateType: 'pct_gross', rate: 20, category: 'earning', attendanceBased: false },
  { id: 'transport', name: 'Transport Allowance', active: true, taxable: false, rateType: 'pct_gross', rate: 10, category: 'earning', attendanceBased: false },
  { id: 'medical', name: 'Medical Allowance', active: true, taxable: false, rateType: 'pct_gross', rate: 10, category: 'earning', attendanceBased: false },
  { id: 'lunch', name: 'Lunch Allowance', active: true, taxable: false, rateType: 'per_day', rate: 500, category: 'earning', attendanceBased: true, attendanceSource: 'days_present', description: '₦500/day × Days Present' },
  { id: 'overtime', name: 'Overtime Allowance', active: true, taxable: true, rateType: 'per_hour', rate: 1250, category: 'earning', attendanceBased: true, attendanceSource: 'overtime_hours', description: '₦1,250/hr × Approved Overtime Hours' },
  { id: 'site', name: 'Site Allowance', active: false, taxable: false, rateType: 'per_day', rate: 2500, category: 'earning', attendanceBased: true, attendanceSource: 'days_on_site', description: '₦2,500/day × Days on Site' },
  { id: 'duty', name: 'Duty Allowance', active: false, taxable: true, rateType: 'monthly_manual', rate: 0, category: 'earning', attendanceBased: false },
  { id: 'performance', name: 'Performance Allowance', active: false, taxable: true, rateType: 'monthly_manual', rate: 0, category: 'earning', attendanceBased: false },
  { id: 'commission', name: 'Commission', active: false, taxable: true, rateType: 'monthly_manual', rate: 0, category: 'earning', attendanceBased: false },
  { id: 'leave_allowance', name: 'Leave Allowance', active: true, taxable: false, rateType: 'monthly_manual', rate: 0, category: 'earning', attendanceBased: true, attendanceSource: 'leave_taken', description: 'Accrues based on approved leave taken / entitlement' },
]

const DEDUCTION_COMPONENTS: SalaryComponent[] = [
  { id: 'pension', name: 'Pension (Employee 8%)', active: true, taxable: false, rateType: 'pct_basic', rate: 8, category: 'deduction', attendanceBased: false },
  { id: 'nhf', name: 'NHF (National Housing Fund)', active: true, taxable: false, rateType: 'pct_basic', rate: 2.5, category: 'deduction', attendanceBased: false },
  { id: 'cooperative', name: 'Cooperative Savings', active: false, taxable: false, rateType: 'flat', rate: 5000, category: 'deduction', attendanceBased: false },
  { id: 'loan_repay', name: 'Staff Loan Repayment', active: false, taxable: false, rateType: 'flat', rate: 0, category: 'deduction', attendanceBased: false },
  { id: 'salary_advance', name: 'Salary Advance Recovery', active: false, taxable: false, rateType: 'flat', rate: 0, category: 'deduction', attendanceBased: false },
]

function cloneComponents(comps: SalaryComponent[]): SalaryComponent[] {
  return comps.map(c => ({ ...c }))
}

export const defaultSalaryStructure: StaffSalaryStructure = {
  staffId: '',
  components: [...cloneComponents(EARNING_COMPONENTS), ...cloneComponents(DEDUCTION_COMPONENTS)],
  taxReliefs: { annualRent: 0, lifeInsurance: 0, nhfContrib: 0, pension: 0 },
  jobGrade: 'Grade 5',
  templateName: 'Standard Staff',
}

// Per-staff salary structures — keyed by staffId
export const staffSalaryStructures: Record<string, StaffSalaryStructure> = {
  'FO-001': {
    staffId: 'FO-001', jobGrade: 'Grade 10', templateName: 'Executive',
    taxReliefs: { annualRent: 1800000, lifeInsurance: 240000, nhfContrib: 0, pension: 0 },
    components: [
      ...cloneComponents(EARNING_COMPONENTS).map(c =>
        c.id === 'duty' ? { ...c, active: true, rate: 50000 } :
        c.id === 'performance' ? { ...c, active: true, rate: 75000 } : c
      ),
      ...cloneComponents(DEDUCTION_COMPONENTS),
    ],
  },
  'FO-002': {
    staffId: 'FO-002', jobGrade: 'Grade 7', templateName: 'Senior Staff',
    taxReliefs: { annualRent: 1200000, lifeInsurance: 120000, nhfContrib: 0, pension: 0 },
    components: [
      ...cloneComponents(EARNING_COMPONENTS),
      ...cloneComponents(DEDUCTION_COMPONENTS),
    ],
  },
  'FO-005': {
    staffId: 'FO-005', jobGrade: 'Grade 6', templateName: 'Standard Staff',
    taxReliefs: { annualRent: 900000, lifeInsurance: 0, nhfContrib: 0, pension: 0 },
    components: [
      ...cloneComponents(EARNING_COMPONENTS).map(c =>
        c.id === 'site' ? { ...c, active: true } : c
      ),
      ...cloneComponents(DEDUCTION_COMPONENTS),
    ],
  },
}

export function getStructure(staffId: string): StaffSalaryStructure {
  return staffSalaryStructures[staffId] || { ...defaultSalaryStructure, staffId }
}

// Company-wide salary templates
export const salaryTemplates: SalaryTemplate[] = [
  {
    id: 'T1', name: 'Standard Staff', jobGrade: 'Grade 4–6', department: 'All',
    components: cloneComponents([...EARNING_COMPONENTS, ...DEDUCTION_COMPONENTS]),
  },
  {
    id: 'T2', name: 'Senior Staff', jobGrade: 'Grade 7–8', department: 'All',
    components: cloneComponents([...EARNING_COMPONENTS, ...DEDUCTION_COMPONENTS]).map(c =>
      c.id === 'performance' ? { ...c, active: true, rate: 30000 } :
      c.id === 'cooperative' ? { ...c, active: true } : c
    ),
  },
  {
    id: 'T3', name: 'Executive', jobGrade: 'Grade 9–10', department: 'All',
    components: cloneComponents([...EARNING_COMPONENTS, ...DEDUCTION_COMPONENTS]).map(c =>
      c.id === 'duty' ? { ...c, active: true, rate: 50000 } :
      c.id === 'performance' ? { ...c, active: true, rate: 75000 } :
      c.id === 'cooperative' ? { ...c, active: true } : c
    ),
  },
  {
    id: 'T4', name: 'Site-Deployed Staff', jobGrade: 'Grade 4–6', department: 'Operations / IT',
    components: cloneComponents([...EARNING_COMPONENTS, ...DEDUCTION_COMPONENTS]).map(c =>
      c.id === 'site' ? { ...c, active: true } :
      c.id === 'overtime' ? { ...c, active: true, rate: 1500 } : c
    ),
  },
  {
    id: 'T5', name: 'Sales & Commission', jobGrade: 'Grade 4–7', department: 'Sales / Marketing',
    components: cloneComponents([...EARNING_COMPONENTS, ...DEDUCTION_COMPONENTS]).map(c =>
      c.id === 'commission' ? { ...c, active: true } :
      c.id === 'performance' ? { ...c, active: true, rate: 20000 } : c
    ),
  },
]

// PAYE Tax Bands (Nigeria — illustrative, fully configurable)
export const taxBands: TaxBand[] = [
  { id: 'B1', label: 'Band 1', from: 0, to: 800000, rate: 0 },
  { id: 'B2', label: 'Band 2', from: 800000, to: 1600000, rate: 15 },
  { id: 'B3', label: 'Band 3', from: 1600000, to: 3200000, rate: 19 },
  { id: 'B4', label: 'Band 4', from: 3200000, to: 6400000, rate: 21 },
  { id: 'B5', label: 'Band 5', from: 6400000, to: 12800000, rate: 23 },
  { id: 'B6', label: 'Band 6', from: 12800000, to: null, rate: 24 },
]

export const RATE_TYPE_LABELS: Record<string, string> = {
  flat: 'Flat ₦',
  pct_gross: '% of Gross',
  pct_basic: '% of Basic',
  per_hour: '₦ / Hour',
  per_day: '₦ / Day',
  monthly_manual: 'Monthly (manual)',
}
