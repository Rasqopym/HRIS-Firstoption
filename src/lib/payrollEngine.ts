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

  const rawComponents = (staffComponents || [])
    .filter(sc => sc.salary_components)
    .map(sc => ({
      ...sc,
      salary_components: Array.isArray(sc.salary_components) ? sc.salary_components[0] : sc.salary_components
    })) as StaffSalaryComponent[]

  // Deduplicate by component name
  const seenComponentNames = new Set<string>()
  const activeComponents: StaffSalaryComponent[] = []
  for (const sc of rawComponents) {
    const compName = sc.salary_components?.name?.trim().toLowerCase()
    if (compName && !seenComponentNames.has(compName)) {
      seenComponentNames.add(compName)
      activeComponents.push(sc)
    }
  }

  // Check localStorage cache for freshly saved salary components or applied templates
  if (typeof window !== 'undefined') {
    try {
      const cachedStr = localStorage.getItem(`hris_salary_structure_${staffId}`)
      if (cachedStr) {
        const cachedList = JSON.parse(cachedStr)
        if (Array.isArray(cachedList) && cachedList.length > 0) {
          activeComponents.length = 0 // Override with user's customized structure
          seenComponentNames.clear()
          for (const item of cachedList) {
            if (!item.active) continue
            const compName = (item.name || '').trim().toLowerCase()
            if (compName && !seenComponentNames.has(compName)) {
              seenComponentNames.add(compName)
              activeComponents.push({
                id: item.id || `comp-${compName}`,
                staff_id: staffId,
                component_id: item.id || `comp-${compName}`,
                rate: item.rate || 0,
                is_active: item.active,
                is_taxable: item.taxable,
                rate_type: item.rateType === 'pct_gross' ? 'percentage_of_gross' :
                           item.rateType === 'pct_basic' ? 'percentage_of_basic' :
                           item.rateType === 'per_day' ? 'per_day' :
                           item.rateType === 'per_hour' ? 'per_hour' : 'flat_amount',
                salary_components: {
                  id: item.id || `comp-${compName}`,
                  name: item.name,
                  category: item.category === 'earning' ? 'allowance' : 'deduction',
                  default_rate_type: 'flat_amount'
                }
              })
            }
          }
        }
      }
    } catch (e) {
      console.warn('[payrollEngine] LocalStorage cache read skipped:', e)
    }
  }

  // Synthesize default salary breakdown if no staff_salary_components exist yet for staff with gross_salary
  if (activeComponents.length === 0 && (staff.gross_salary || 0) > 0) {
    activeComponents.push(
      {
        id: 'default-basic',
        staff_id: staffId,
        component_id: 'comp-basic',
        rate: 40,
        is_active: true,
        is_taxable: true,
        rate_type: 'percentage_of_gross',
        salary_components: { id: 'comp-basic', name: 'Basic Salary', category: 'allowance', default_rate_type: 'percentage_of_gross' }
      },
      {
        id: 'default-housing',
        staff_id: staffId,
        component_id: 'comp-housing',
        rate: 30,
        is_active: true,
        is_taxable: true,
        rate_type: 'percentage_of_gross',
        salary_components: { id: 'comp-housing', name: 'Housing Allowance', category: 'allowance', default_rate_type: 'percentage_of_gross' }
      },
      {
        id: 'default-transport',
        staff_id: staffId,
        component_id: 'comp-transport',
        rate: 30,
        is_active: true,
        is_taxable: true,
        rate_type: 'percentage_of_gross',
        salary_components: { id: 'comp-transport', name: 'Transport Allowance', category: 'allowance', default_rate_type: 'percentage_of_gross' }
      }
    )
  }

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

  // 3b. Fetch approved leave requests for the period
  let hasApprovedAnnualLeave = false
  let unpaidLeaveDays = 0

  try {
    const { data: leaveRequests } = await supabase
      .from('leave_requests')
      .select('id, leave_type_id, start_date, end_date, status, leave_types(name, is_paid)')
      .eq('staff_id', staffId)
      .eq('status', 'approved')

    const activeLeaves = (leaveRequests || []).filter((lr: any) => {
      const sDate = lr.start_date
      return sDate >= periodStart && sDate <= periodEnd
    })

    hasApprovedAnnualLeave = activeLeaves.some((lr: any) => {
      const typeName = (lr.leave_types?.name || '').toLowerCase()
      return typeName.includes('annual')
    })

    const unpaidLeaves = activeLeaves.filter((lr: any) => {
      const typeName = (lr.leave_types?.name || '').toLowerCase()
      const isPaid = lr.leave_types?.is_paid
      return typeName.includes('unpaid') || isPaid === false
    })

    unpaidLeaves.forEach((ul: any) => {
      const start = new Date(ul.start_date)
      const end = new Date(ul.end_date)
      const diffTime = Math.abs(end.getTime() - start.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
      unpaidLeaveDays += diffDays
    })
  } catch (e) {
    console.warn('Error fetching leave requests for payroll:', e)
  }

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
    const rateType = basicComponent.rate_type || basicComponent.salary_components.default_rate_type
    if (rateType === 'flat_amount' || rateType === 'flat' || basicComponent.rate > 100) {
      basicSalaryAmount = basicComponent.rate
    } else {
      basicSalaryAmount = staff.gross_salary * (basicComponent.rate / 100)
    }

    lineItems.push({
      componentId: basicComponent.salary_components.id,
      componentName: basicComponent.salary_components.name,
      category: basicComponent.salary_components.category,
      rateType: rateType,
      rate: basicComponent.rate,
      amount: basicSalaryAmount,
      isTaxable: basicComponent.is_taxable,
      needsManualInput: false,
    })
  }

  // Second pass: calculate all other components
  for (const sc of activeComponents) {
    // Skip basic salary (already calculated) and PAYE (calculated statutorily below)
    const compNameLower = sc.salary_components.name.toLowerCase()
    if (compNameLower.includes('basic') || compNameLower.includes('paye')) {
      continue
    }

    const component = sc.salary_components
    const rateType = sc.rate_type || component.default_rate_type
    let amount = 0
    let quantity: number | undefined
    let needsManualInput = false

    // If Leave Allowance component and staff has NO approved annual leave this period, skip/zero out
    if (compNameLower.includes('leave') && !compNameLower.includes('unpaid') && !hasApprovedAnnualLeave) {
      amount = 0
    } else {
      switch (rateType) {
        case 'percentage_of_gross':
        case 'pct_gross':
          amount = sc.rate > 100 ? sc.rate : staff.gross_salary * (sc.rate / 100)
          break

        case 'percentage_of_basic':
        case 'pct_basic':
          amount = sc.rate > 100 ? sc.rate : basicSalaryAmount * (sc.rate / 100)
          break

        case 'flat_amount':
        case 'flat':
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

  // Add automatic Unpaid Leave Salary Deduction item if unpaid leave days exist
  if (unpaidLeaveDays > 0) {
    const dailyRate = (staff.gross_salary || 165500) / 22
    const unpaidDeductionAmount = Math.round(dailyRate * unpaidLeaveDays)
    lineItems.push({
      componentId: 'unpaid-leave-deduction',
      componentName: `Unpaid Leave Deduction (${unpaidLeaveDays} day${unpaidLeaveDays > 1 ? 's' : ''})`,
      category: 'deduction',
      rateType: 'per_day',
      rate: Math.round(dailyRate),
      quantity: unpaidLeaveDays,
      amount: unpaidDeductionAmount,
      isTaxable: false,
      needsManualInput: false,
    })
  }

  // 7. Separate earnings and deductions
  const earnings = lineItems.filter(li => li.category === 'allowance')
  const deductions = lineItems.filter(li => li.category === 'deduction')

  // Sum taxable earnings
  const taxableEarnings = earnings
    .filter(li => li.isTaxable)
    .reduce((sum, li) => sum + li.amount, 0)

  const annualTaxableGross = taxableEarnings * 12

  // Nigerian Consolidated Relief Allowance (CRA): Higher of N200,000 or 1% of Gross + 20% of Gross
  const craFixed = Math.max(200000, annualTaxableGross * 0.01)
  const craPercent = annualTaxableGross * 0.20
  const annualCRA = craFixed + craPercent

  // Calculate additional tax reliefs (Rent & Life Assurance)
  const monthlyRentPaid = reliefs.annual_rent_paid / 12
  const monthlyLifeAssurance = reliefs.life_assurance_premium / 12
  const maxAnnualRentRelief = Math.min(staff.gross_salary * 12 * 0.2, 500000)
  const monthlyRentRelief = Math.min(monthlyRentPaid, maxAnnualRentRelief / 12)
  const annualOtherReliefs = (monthlyRentRelief + monthlyLifeAssurance) * 12

  // 8. Calculate annual and monthly taxable income after CRA and reliefs
  const annualTaxableIncome = Math.max(0, annualTaxableGross - annualCRA - annualOtherReliefs)
  const monthlyTaxableIncome = Math.round(annualTaxableIncome / 12)

  // 9. Calculate PAYE using progressive tax bands
  let annualTax = 0
  for (const band of (taxBands || []) as TaxBand[]) {
    if (annualTaxableIncome <= band.lower_bound) continue

    const taxableInBand = Math.min(
      annualTaxableIncome,
      band.upper_bound != null ? band.upper_bound : Infinity
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
    taxableIncome: monthlyTaxableIncome,
    totalDeductions,
    paye: monthlyPaye,
    netPay,
  }
}
