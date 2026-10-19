import { supabase } from './supabase'
import { calculateWorkingDaysInMonth, type PublicHoliday } from './holidays'

interface LineItem {
  componentId: string
  componentName: string
  category: 'allowance' | 'deduction'
  rateType: string
  rate: number
  dailyRate?: number
  quantity?: number
  amount: number
  isTaxable: boolean
  needsManualInput: boolean
  breakdown?: string
  attendanceTag?: string
  isAttendanceProrated?: boolean
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
    .select('id, staff_code, profile_id, email, full_name, gross_salary, is_confirmed, confirmation_date, date_employed, job_title')
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

  // 3. Determine working days in period (excluding weekends and statutory/custom public holidays)
  const pStartDate = new Date(periodStart)
  const periodYear = pStartDate.getFullYear()
  const periodMonth = pStartDate.getMonth()

  let customHolidays: PublicHoliday[] = []
  try {
    const { data: settingsData } = await supabase
      .from('company_settings')
      .select('custom_holidays')
      .eq('id', 1)
      .maybeSingle()

    if (settingsData?.custom_holidays && Array.isArray(settingsData.custom_holidays)) {
      customHolidays = settingsData.custom_holidays
    } else if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('hris_custom_holidays')
      if (cached) customHolidays = JSON.parse(cached)
    }
  } catch (e) {
    console.warn('[payrollEngine] Error loading holidays:', e)
  }

  const { totalWorkingDays } = calculateWorkingDaysInMonth(periodYear, periodMonth, customHolidays)
  const workingDays = totalWorkingDays > 0 ? totalWorkingDays : 22

  // 3b. Fetch attendance records for the period across candidate identifiers
  const candidateIds = [staff.id, staff.staff_code, staff.profile_id, staff.email].filter(Boolean) as string[]
  const attendanceRecordsMap: Record<string, any> = {}

  // Merge client-side localStorage attendance cache if available
  if (typeof window !== 'undefined') {
    try {
      candidateIds.forEach(cid => {
        const raw1 = localStorage.getItem(`hris_self_attendance_${cid}`)
        const raw2 = localStorage.getItem(`hris_attendance_daily_${cid}`)
        if (raw1) Object.assign(attendanceRecordsMap, JSON.parse(raw1))
        if (raw2) Object.assign(attendanceRecordsMap, JSON.parse(raw2))
      })
    } catch (e) {}
  }

  // Fetch from Supabase
  try {
    const { data: dbRecords } = await supabase
      .from('attendance_records')
      .select('status, overtime_hours, overtime_approval, on_site, attendance_date, staff_id')
      .in('staff_id', candidateIds)
      .gte('attendance_date', periodStart)
      .lte('attendance_date', periodEnd)

    if (dbRecords && dbRecords.length > 0) {
      dbRecords.forEach(r => {
        attendanceRecordsMap[r.attendance_date] = r
      })
    }
  } catch (e) {
    console.warn('[payrollEngine] Error fetching attendance from Supabase:', e)
  }

  const allAttendanceList = Object.values(attendanceRecordsMap)
  const daysPresent = allAttendanceList.filter(r => r.status === 'present').length

  const approvedOvertimeHours = allAttendanceList.reduce((sum, r) => {
    if (r.overtime_approval === 'approved' && r.overtime_hours) {
      return sum + (Number(r.overtime_hours) || 0)
    }
    return sum
  }, 0)

  const daysOnSite = allAttendanceList.filter(r => r.on_site === true).length

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

    // Unpaid leave and AWOL are treated as unpaid deductions
    const unpaidLeaves = activeLeaves.filter((lr: any) => {
      const typeName = (lr.leave_types?.name || '').toLowerCase()
      const isPaid = lr.leave_types?.is_paid
      return typeName.includes('unpaid') || typeName.includes('awol') || isPaid === false
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

  // 3c. Check Annual Leave Bonus Eligibility:
  // - Staff must be confirmed
  // - Staff must have at least 1 full year of service
  // - Only paid once per calendar year
  const isStaffConfirmed = Boolean((staff as any).is_confirmed)
  let hasOneYearService = false
  let serviceDays = 0
  let serviceYears = 0

  if (staff.date_employed) {
    const empDate = new Date(staff.date_employed)
    const pDate = new Date(periodStart)
    serviceDays = Math.floor((pDate.getTime() - empDate.getTime()) / (1000 * 60 * 60 * 24))
    serviceYears = Math.floor(serviceDays / 365)
    hasOneYearService = serviceDays >= 365
  }

  let alreadyPaidBonusThisYear = false
  try {
    const yearStart = `${periodYear}-01-01`
    const { data: pastPayslips } = await supabase
      .from('payslips')
      .select(`
        id,
        payroll_periods!inner (start_date),
        payslip_line_items (amount, salary_components(name))
      `)
      .eq('staff_id', staffId)
      .gte('payroll_periods.start_date', yearStart)
      .lt('payroll_periods.start_date', periodStart)

    if (pastPayslips && pastPayslips.length > 0) {
      for (const p of pastPayslips) {
        const items = (p as any).payslip_line_items || []
        const foundBonus = items.some((li: any) => {
          const cName = (li.salary_components?.name || '').toLowerCase()
          return cName.includes('leave') && !cName.includes('unpaid') && li.amount > 0
        })
        if (foundBonus) {
          alreadyPaidBonusThisYear = true
          break
        }
      }
    }
  } catch (e) {
    console.warn('[payrollEngine] Error checking past leave bonus:', e)
  }

  const isEligibleForLeaveBonus = 
    hasApprovedAnnualLeave && 
    isStaffConfirmed && 
    hasOneYearService && 
    !alreadyPaidBonusThisYear

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
    let dailyRate: number | undefined
    let needsManualInput = false
    let breakdown: string | undefined
    let attendanceTag: string | undefined
    let isAttendanceProrated = false

    const isLunchOrTransport = compNameLower.includes('lunch') || compNameLower.includes('transport')
    const isAttendanceProratedComp = isLunchOrTransport || (sc as any).attendance_based === true || (sc as any).attendanceBased === true
    const isLeaveAllowance = compNameLower.includes('leave') && !compNameLower.includes('unpaid')

    // Handle Annual Leave Bonus (1 Month Basic Salary):
    // Requires: approved annual leave this period + confirmed employment + at least 1 full year of service
    if (isLeaveAllowance) {
      if (isEligibleForLeaveBonus) {
        amount = Math.round(basicSalaryAmount) // Exactly 1 Month Basic Salary!
        quantity = 1
        dailyRate = Math.round(basicSalaryAmount)
        isAttendanceProrated = false
        breakdown = `100% of Basic Salary (₦${Math.round(basicSalaryAmount).toLocaleString()}) — Confirmed staff (${serviceYears} yr(s) service)`
        attendanceTag = 'Confirmed · >1yr'
      } else {
        amount = 0
        quantity = 0
        isAttendanceProrated = false
        if (!hasApprovedAnnualLeave) {
          breakdown = '₦0 (No approved annual leave this period)'
        } else if (!isStaffConfirmed) {
          breakdown = '₦0 (Ineligible: Staff employment is not yet confirmed)'
        } else if (!hasOneYearService) {
          breakdown = `₦0 (Ineligible: Requires 1 full year of service. Current tenure: ${Math.max(0, Math.floor(serviceDays / 30))} months)`
        } else if (alreadyPaidBonusThisYear) {
          breakdown = `₦0 (Already received Annual Leave Bonus for year ${periodYear})`
        }
      }
    } else if (isAttendanceProratedComp && (rateType === 'percentage_of_gross' || rateType === 'pct_gross')) {
      // Percentage of Gross prorated by working days in month and days present
      const monthlyAllocation = sc.rate > 100 ? sc.rate : (staff.gross_salary || 0) * (sc.rate / 100)
      const computedDailyRate = workingDays > 0 ? (monthlyAllocation / workingDays) : (monthlyAllocation / 22)
      dailyRate = Math.round(computedDailyRate)
      // If staff is absent on standard working days, they are not paid for those days.
      // If staff clocks in on Saturday/weekend, they are compensated with additional daily allowance.
      amount = Math.round(computedDailyRate * daysPresent)
      quantity = daysPresent
      isAttendanceProrated = true
      const extraWeekendDays = daysPresent > workingDays ? daysPresent - workingDays : 0
      breakdown = `${sc.rate}% of gross (₦${Math.round(monthlyAllocation).toLocaleString()}) ÷ ${workingDays} working days = ₦${Math.round(computedDailyRate).toLocaleString()}/day × ${daysPresent}d present${extraWeekendDays > 0 ? ` (includes ${extraWeekendDays} weekend shift${extraWeekendDays > 1 ? 's' : ''})` : ''}`
      attendanceTag = `${daysPresent}d present`
    } else if (isAttendanceProratedComp && (rateType === 'flat_amount' || rateType === 'flat') && isLunchOrTransport) {
      // Flat monthly amount prorated by working days
      const monthlyAllocation = sc.rate
      const computedDailyRate = workingDays > 0 ? (monthlyAllocation / workingDays) : (monthlyAllocation / 22)
      dailyRate = Math.round(computedDailyRate)
      amount = Math.round(computedDailyRate * daysPresent)
      quantity = daysPresent
      isAttendanceProrated = true
      const extraWeekendDays = daysPresent > workingDays ? daysPresent - workingDays : 0
      breakdown = `₦${Math.round(monthlyAllocation).toLocaleString()}/mo ÷ ${workingDays} working days = ₦${Math.round(computedDailyRate).toLocaleString()}/day × ${daysPresent}d present${extraWeekendDays > 0 ? ` (includes ${extraWeekendDays} weekend shift${extraWeekendDays > 1 ? 's' : ''})` : ''}`
      attendanceTag = `${daysPresent}d present`
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
          if (isLunchOrTransport) {
            quantity = daysPresent
            dailyRate = sc.rate
            amount = sc.rate * daysPresent
            isAttendanceProrated = true
            breakdown = `₦${sc.rate.toLocaleString()}/day × ${daysPresent} days present`
            attendanceTag = `${daysPresent}d present`
          } else if (component.name.toLowerCase().includes('site')) {
            quantity = daysOnSite
            dailyRate = sc.rate
            amount = sc.rate * daysOnSite
            isAttendanceProrated = true
            breakdown = `₦${sc.rate.toLocaleString()}/day × ${daysOnSite} days on site`
            attendanceTag = `${daysOnSite}d on site`
          } else {
            quantity = daysPresent
            dailyRate = sc.rate
            amount = sc.rate * daysPresent
            isAttendanceProrated = true
          }
          break

        case 'per_hour':
          quantity = approvedOvertimeHours
          dailyRate = sc.rate
          amount = sc.rate * approvedOvertimeHours
          isAttendanceProrated = true
          breakdown = `₦${sc.rate.toLocaleString()}/hr × ${approvedOvertimeHours} OT hrs`
          attendanceTag = `${approvedOvertimeHours}h OT`
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
      dailyRate,
      quantity,
      amount,
      isTaxable: sc.is_taxable,
      needsManualInput,
      breakdown,
      attendanceTag,
      isAttendanceProrated,
    })
  }

  // If staff is eligible for Leave Bonus but template had no Leave Allowance component, auto-inject it
  const hasLeaveLineItem = lineItems.some(li => li.componentName.toLowerCase().includes('leave') && !li.componentName.toLowerCase().includes('unpaid'))
  if (!hasLeaveLineItem && isEligibleForLeaveBonus) {
    lineItems.push({
      componentId: 'leave-allowance-bonus',
      componentName: 'Annual Leave Bonus (1 Month Basic)',
      category: 'allowance',
      rateType: 'flat_amount',
      rate: Math.round(basicSalaryAmount),
      dailyRate: Math.round(basicSalaryAmount),
      quantity: 1,
      amount: Math.round(basicSalaryAmount),
      isTaxable: true,
      needsManualInput: false,
      breakdown: `100% of Basic Salary (₦${Math.round(basicSalaryAmount).toLocaleString()}) — Confirmed staff (${serviceYears} yr(s) service)`,
      attendanceTag: 'Confirmed · >1yr',
      isAttendanceProrated: false,
    })
  }

  // Add automatic Unpaid Leave Salary Deduction item if unpaid leave days exist
  if (unpaidLeaveDays > 0) {
    const dailyRate = (staff.gross_salary || 165500) / workingDays
    const unpaidDeductionAmount = Math.round(dailyRate * unpaidLeaveDays)
    lineItems.push({
      componentId: 'unpaid-leave-deduction',
      componentName: `Unpaid Leave Deduction (${unpaidLeaveDays} day${unpaidLeaveDays > 1 ? 's' : ''})`,
      category: 'deduction',
      rateType: 'per_day',
      rate: Math.round(dailyRate),
      dailyRate: Math.round(dailyRate),
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
