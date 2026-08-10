import { supabase } from './supabase'

interface LineItem {
  componentId: string
  componentName: string
  category: 'allowance' | 'deduction'
  rateType: string
  rate: number
  quantity?: number
  amount: number
  isTaxable: boolean
  needsManualInput: boolean
}

interface PayrollCalculation {
  staffId: string
  staffName: string
  lineItems: LineItem[]
  grossEarnings: number
  taxableIncome: number
  totalDeductions: number
  paye: number
  netPay: number
}

interface SalaryComponent {
  id: string
  name: string
  category: 'allowance' | 'deduction'
  default_rate_type: string
}

interface StaffSalaryComponent {
  id: string
  staff_id: string
  component_id: string
  rate: number
  is_active: boolean
  is_taxable: boolean
  rate_type: string
  salary_components: SalaryComponent
}

interface StaffTaxRelief {
  id: string
  staff_id: string
  annual_rent_paid: number
  life_assurance_premium: number
}

interface TaxBand {
  id: string
  band_order: number
  lower_bound: number
  upper_bound: number | null
  rate: number
}

export async function calculatePayrollForStaff(
  staffId: string,
  periodStart: string,
  periodEnd: string,
  manualOverrides?: Record<string, number>
): Promise<PayrollCalculation> {
  // 1. Fetch staff row
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, full_name, gross_salary')
    .eq('id', staffId)
    .single()

  if (staffError || !staff) {
    throw new Error(`Failed to fetch staff: ${staffError?.message}`)
  }

  // 2. Fetch staff's salary components
  const { data: staffComponents, error: componentsError } = await supabase
    .from('staff_salary_components')
    .select(`
      id,
      staff_id,
      component_id,
      rate,
      is_active,
      is_taxable,
      rate_type,
      salary_components (
        id,
        name,
        category,
        default_rate_type
      )
    `)
    .eq('staff_id', staffId)
    .eq('is_active', true)

  if (componentsError) {
    throw new Error(`Failed to fetch salary components: ${componentsError.message}`)
  }

  const activeComponents = (staffComponents || [])
    .filter(sc => sc.salary_components)
    .map(sc => ({
      ...sc,
      salary_components: Array.isArray(sc.salary_components) ? sc.salary_components[0] : sc.salary_components
    })) as StaffSalaryComponent[]

  // 3. Fetch attendance records for the period
  const { data: attendanceRecords, error: attendanceError } = await supabase
    .from('attendance_records')
    .select('status, overtime_hours, overtime_approval, on_site')
    .eq('staff_id', staffId)
    .gte('attendance_date', periodStart)
    .lte('attendance_date', periodEnd)

  if (attendanceError) {
    throw new Error(`Failed to fetch attendance records: ${attendanceError.message}`)
  }

  // Calculate attendance metrics
  const daysPresent = (attendanceRecords || []).filter(
    r => r.status === 'present'
  ).length

  const approvedOvertimeHours = (attendanceRecords || []).reduce((sum, r) => {
    if (r.overtime_approval === 'approved' && r.overtime_hours) {
      return sum + r.overtime_hours
    }
    return sum
  }, 0)

  const daysOnSite = (attendanceRecords || []).filter(r => r.on_site === true).length

  // 4. Fetch tax reliefs (default to zero if none)
  const { data: taxReliefs } = await supabase
    .from('staff_tax_reliefs')
    .select('*')
    .eq('staff_id', staffId)
    .single()

  const reliefs = taxReliefs || {
    annual_rent_paid: 0,
    life_assurance_premium: 0,
  } as StaffTaxRelief

  // 5. Fetch tax bands
  const { data: taxBands, error: taxBandsError } = await supabase
    .from('tax_bands')
    .select('*')
    .order('band_order', { ascending: true })

  if (taxBandsError) {
    throw new Error(`Failed to fetch tax bands: ${taxBandsError.message}`)
  }

  // 6. Calculate each component's amount
  const lineItems: LineItem[] = []
  let basicSalaryAmount = 0

  // First pass: calculate Basic Salary if present (needed for percentage_of_basic)
  const basicComponent = activeComponents.find(
    sc => sc.salary_components.name.toLowerCase().includes('basic')
  )
  if (basicComponent) {
    basicSalaryAmount = staff.gross_salary * (basicComponent.rate / 100)
    lineItems.push({
      componentId: basicComponent.salary_components.id,
      componentName: basicComponent.salary_components.name,
      category: basicComponent.salary_components.category,
      rateType: basicComponent.rate_type || basicComponent.salary_components.default_rate_type,
      rate: basicComponent.rate,
      amount: basicSalaryAmount,
      isTaxable: basicComponent.is_taxable,
      needsManualInput: false,
    })
  }

  // Second pass: calculate all other components
  for (const sc of activeComponents) {
    // Skip basic salary as it was already calculated
    if (sc.salary_components.name.toLowerCase().includes('basic')) {
      continue
    }

    const component = sc.salary_components
    const rateType = sc.rate_type || component.default_rate_type
    let amount = 0
    let quantity: number | undefined
    let needsManualInput = false

    switch (rateType) {
      case 'percentage_of_gross':
        amount = staff.gross_salary * (sc.rate / 100)
        break

      case 'percentage_of_basic':
        amount = basicSalaryAmount * (sc.rate / 100)
        break

      case 'flat_amount':
        amount = sc.rate
        break

      case 'per_day':
        if (component.name.toLowerCase().includes('lunch')) {
          quantity = daysPresent
          amount = sc.rate * daysPresent
        } else if (component.name.toLowerCase().includes('site')) {
          quantity = daysOnSite
          amount = sc.rate * daysOnSite
        } else {
          // Default to days present for other per-day components
          quantity = daysPresent
          amount = sc.rate * daysPresent
        }
        break

      case 'per_hour':
        quantity = approvedOvertimeHours
        amount = sc.rate * approvedOvertimeHours
        break

      case 'manual_monthly':
        amount = manualOverrides?.[component.id] || 0
        needsManualInput = !manualOverrides || !(component.id in manualOverrides)
        break

      default:
        amount = 0
    }

    lineItems.push({
      componentId: component.id,
      componentName: component.name,
      category: component.category,
      rateType: rateType,
      rate: sc.rate,
      quantity,
      amount,
      isTaxable: sc.is_taxable,
      needsManualInput,
    })
  }

  // 7. Separate earnings and deductions
  const earnings = lineItems.filter(li => li.category === 'allowance')
  const deductions = lineItems.filter(li => li.category === 'deduction')

  // Sum taxable earnings
  const taxableEarnings = earnings
    .filter(li => li.isTaxable)
    .reduce((sum, li) => sum + li.amount, 0)

  // Calculate tax reliefs (monthly)
  const monthlyRentPaid = reliefs.annual_rent_paid / 12
  const monthlyLifeAssurance = reliefs.life_assurance_premium / 12

  // Rent relief capped at 20% of gross income or ₦500,000/year, whichever is lower
  const maxAnnualRentRelief = Math.min(staff.gross_salary * 12 * 0.2, 500000)
  const monthlyRentRelief = Math.min(monthlyRentPaid, maxAnnualRentRelief / 12)

  const totalTaxReliefs = monthlyRentRelief + monthlyLifeAssurance

  // 8. Calculate taxable income
  const taxableIncome = Math.max(0, taxableEarnings - totalTaxReliefs)

  // 9. Calculate PAYE using progressive tax bands
  const annualTaxableIncome = taxableIncome * 12
  let annualTax = 0

  for (const band of (taxBands || []) as TaxBand[]) {
    if (annualTaxableIncome <= band.lower_bound) continue

    const taxableInBand = Math.min(
      annualTaxableIncome,
      band.upper_bound || Infinity
    ) - band.lower_bound

    if (taxableInBand > 0) {
      annualTax += taxableInBand * band.rate
    }
  }

  const monthlyPaye = Math.round(annualTax / 12)

  // 10. Total deductions
  const deductionAmounts = deductions.reduce((sum, li) => sum + li.amount, 0)
  const totalDeductions = Math.round(deductionAmounts + monthlyPaye)

  // 11. Net pay
  const grossEarnings = earnings.reduce((sum, li) => sum + li.amount, 0)
  const netPay = Math.round(grossEarnings - totalDeductions)

  // 12. Return calculation object
  return {
    staffId: staff.id,
    staffName: staff.full_name,
    lineItems: lineItems.map(li => ({ ...li, amount: Math.round(li.amount) })),
    grossEarnings: Math.round(grossEarnings),
    taxableIncome: Math.round(taxableIncome),
    totalDeductions,
    paye: monthlyPaye,
    netPay,
  }
}
