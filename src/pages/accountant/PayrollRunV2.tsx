import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { calculatePayrollForStaff } from '../../lib/payrollEngine'
import { logAction } from '../../lib/auditLog'
import { getInitials, getAvatarColor } from '../../lib/avatarUtils'

const fmt = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')

interface ComputedLineItem {
  id: string
  label: string
  amount: number
  type: 'fixed' | 'attendance' | 'manual' | 'deduction'
  breakdown?: string
  taxable: boolean
  attendanceTag?: string
  needsManualInput?: boolean
}

interface StaffPayrollRow {
  staffId: string
  staffDbId: string
  payslipId?: string
  name: string
  department: string
  photo: string | null
  grossBase: number
  items: ComputedLineItem[]
  taxableIncome: number
  paye: number
  totalDeductions: number
  netPay: number
  status: 'pending' | 'processed' | 'paid'
  hasManualItems: boolean
}

interface StaffMember {
  id: string
  staff_code: string
  full_name: string
  photo_url: string | null
  department_name?: string
}

function mapEngineResultToRow(engineResult: any, staff: StaffMember): StaffPayrollRow {
  const items: ComputedLineItem[] = engineResult.lineItems.map((item: any) => {
    let type: ComputedLineItem['type'] = 'fixed'
    let breakdown: string | undefined
    let attendanceTag: string | undefined

    if (item.rateType === 'percentage_of_gross' || item.rateType === 'percentage_of_basic' || item.rateType === 'flat_amount') {
      type = 'fixed'
      if (item.rateType === 'percentage_of_gross') {
        breakdown = `${item.rate}% of gross`
      } else if (item.rateType === 'percentage_of_basic') {
        breakdown = `${item.rate}% of basic`
      }
    } else if (item.rateType === 'per_day') {
      type = 'attendance'
      breakdown = `₦${item.rate.toLocaleString()}/day × ${item.quantity || 0} days`
      attendanceTag = `${item.quantity || 0}d present`
    } else if (item.rateType === 'per_hour') {
      type = 'attendance'
      breakdown = `₦${item.rate.toLocaleString()}/hr × ${item.quantity || 0} OT hrs`
      attendanceTag = `${item.quantity || 0}h OT`
    } else if (item.rateType === 'manual_monthly') {
      type = 'manual'
    }

    return {
      id: item.componentId,
      label: item.componentName,
      amount: item.amount,
      type,
      breakdown,
      taxable: item.isTaxable,
      attendanceTag,
      needsManualInput: item.needsManualInput,
    }
  })

  const hasManualItems = items.some(i => i.needsManualInput)

  return {
    staffId: staff.staff_code,
    staffDbId: staff.id,
    name: staff.full_name,
    department: staff.department_name || 'Unassigned',
    photo: staff.photo_url || null,
    grossBase: engineResult.grossEarnings,
    items,
    taxableIncome: engineResult.taxableIncome,
    paye: engineResult.paye,
    totalDeductions: engineResult.totalDeductions,
    netPay: engineResult.netPay,
    status: 'pending',
    hasManualItems,
  }
}

const statusStyle = (s: StaffPayrollRow['status']) =>
  s === 'paid' ? 'bg-emerald-100 text-emerald-700' :
  s === 'processed' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'

const itemTypeStyle = (t: ComputedLineItem['type']) =>
  t === 'attendance' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
  t === 'manual' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
  t === 'fixed' ? 'bg-slate-100 text-slate-500' : ''

export default function PayrollRunV2({ onSelectPayslip, onNavigate }: { onSelectPayslip?: (payslipId: string) => void, onNavigate?: (page: any) => void }) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [manualValues, setManualValues] = useState<Record<string, Record<string, number>>>({})
  const [rows, setRows] = useState<StaffPayrollRow[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [approvalModal, setApprovalModal] = useState(false)
  const [loading, setLoading] = useState(true)

  // Month navigation state
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const getPeriodRange = () => {
    const firstDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
    const lastDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${new Date(selectedYear, selectedMonth + 1, 0).getDate()}`
    return { firstDay, lastDay }
  }

  const getOrCreatePayrollPeriod = async (month: number, year: number) => {
    const periodLabel = `${MONTHS[month]} ${year}`
    const { firstDay, lastDay } = getPeriodRange()

    // Check if period already exists
    const { data: existingPeriod } = await supabase
      .from('payroll_periods')
      .select('id')
      .eq('period_label', periodLabel)
      .single()

    if (existingPeriod) {
      return existingPeriod.id
    }

    // Create new period
    const { data: newPeriod, error } = await supabase
      .from('payroll_periods')
      .insert({
        period_label: periodLabel,
        start_date: firstDay,
        end_date: lastDay,
        status: 'open'
      })
      .select('id')
      .single()

    if (error) throw error
    return newPeriod.id
  }

  const fetchStaffAndComputePayroll = async () => {
    setLoading(true)
    const { firstDay, lastDay } = getPeriodRange()

    try {
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select(`
          id,
          staff_code,
          full_name,
          photo_url,
          departments (name)
        `)
        .eq('status', 'active')

      if (staffError) {
        console.error('Failed to fetch staff:', staffError)
        setLoading(false)
        return
      }

      const mappedStaff: StaffMember[] = (staffData || []).map((s: any) => ({
        id: s.id,
        staff_code: s.staff_code,
        full_name: s.full_name,
        photo_url: s.photo_url,
        department_name: s.departments?.name,
      }))

      setStaff(mappedStaff)

      // Get or create payroll period
      const periodId = await getOrCreatePayrollPeriod(selectedMonth, selectedYear)

      // Fetch existing payslips for this period
      const { data: existingPayslips } = await supabase
        .from('payslips')
        .select('*, staff_id, period_id, status')
        .eq('period_id', periodId)

      const existingPayslipsMap = new Map(
        (existingPayslips || []).map((p: any) => [p.staff_id, p])
      )

      // Compute payroll for each staff member
      const payrollRows: StaffPayrollRow[] = []
      for (const s of mappedStaff) {
        const existingPayslip = existingPayslipsMap.get(s.id)
        
        if (existingPayslip) {
          // Load from existing payslip
          const { data: lineItems } = await supabase
            .from('payslip_line_items')
            .select('*, salary_components(name, category)')
            .eq('payslip_id', existingPayslip.id)

          const mappedItems: ComputedLineItem[] = (lineItems || []).map((item: any) => ({
            id: item.id,
            label: item.salary_components?.name || 'Unknown',
            amount: item.amount,
            type: item.salary_components?.category === 'deduction' ? 'deduction' : 'fixed',
            taxable: item.was_taxable,
          }))

          payrollRows.push({
            staffId: s.staff_code,
            staffDbId: s.id,
            payslipId: existingPayslip.id,
            name: s.full_name,
            department: s.department_name || 'Unassigned',
            photo: s.photo_url || null,
            grossBase: existingPayslip.gross_earnings,
            items: mappedItems,
            taxableIncome: existingPayslip.taxable_income,
            paye: existingPayslip.paye_tax,
            totalDeductions: existingPayslip.total_deductions,
            netPay: existingPayslip.net_pay,
            status: existingPayslip.status,
            hasManualItems: mappedItems.some(i => i.type === 'manual'),
          })
        } else {
          // Calculate fresh
          try {
            const engineResult = await calculatePayrollForStaff(
              s.id,
              firstDay,
              lastDay,
              manualValues[s.staff_code]
            )
            payrollRows.push(mapEngineResultToRow(engineResult, s))
          } catch (error) {
            console.error(`Failed to compute payroll for ${s.full_name}:`, error)
          }
        }
      }

      setRows(payrollRows)
    } catch (error) {
      console.error('Error in fetchStaffAndComputePayroll:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStaffAndComputePayroll()
  }, [selectedMonth, selectedYear])

  const setManual = async (staffId: string, compId: string, value: number) => {
    const updated = { ...manualValues, [staffId]: { ...(manualValues[staffId] || {}), [compId]: value } }
    setManualValues(updated)

    const staffMember = staff.find(s => s.staff_code === staffId)
    if (!staffMember) return

    const { firstDay, lastDay } = getPeriodRange()
    try {
      const engineResult = await calculatePayrollForStaff(
        staffMember.id,
        firstDay,
        lastDay,
        updated[staffId]
      )
      setRows(prev => prev.map(r => r.staffId === staffId ? mapEngineResultToRow(engineResult, staffMember) : r))
    } catch (error) {
      console.error('Failed to recompute payroll:', error)
    }
  }

  const totalNet = rows.reduce((a, r) => a + r.netPay, 0)
  const totalGross = rows.reduce((a, r) => a + r.grossBase, 0)
  const totalTax = rows.reduce((a, r) => a + r.paye, 0)
  const pending = rows.filter(r => r.status === 'pending').length
  const processed = rows.filter(r => r.status === 'processed').length

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11)
      setSelectedYear(selectedYear - 1)
    } else {
      setSelectedMonth(selectedMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0)
      setSelectedYear(selectedYear + 1)
    } else {
      setSelectedMonth(selectedMonth + 1)
    }
  }

  const handleRun = async (staffId: string) => {
    setRunning(staffId)
    const row = rows.find(r => r.staffId === staffId)
    if (!row) {
      setRunning(null)
      return
    }

    const staffMember = staff.find(s => s.staff_code === staffId)
    if (!staffMember) {
      setRunning(null)
      return
    }

    try {
      const { firstDay, lastDay } = getPeriodRange()
      const periodId = await getOrCreatePayrollPeriod(selectedMonth, selectedYear)

      // Recalculate payroll
      const engineResult = await calculatePayrollForStaff(
        staffMember.id,
        firstDay,
        lastDay,
        manualValues[staffId]
      )

      // Upsert payslip
      const { data: payslip, error: payslipError } = await supabase
        .from('payslips')
        .upsert({
          staff_id: staffMember.id,
          period_id: periodId,
          gross_earnings: engineResult.grossEarnings,
          taxable_income: engineResult.taxableIncome,
          paye_tax: engineResult.paye,
          total_deductions: engineResult.totalDeductions,
          net_pay: engineResult.netPay,
          status: 'processed'
        }, {
          onConflict: 'staff_id,period_id'
        })
        .select('id')
        .single()

      if (payslipError) throw payslipError

      // Delete existing line items
      await supabase
        .from('payslip_line_items')
        .delete()
        .eq('payslip_id', payslip.id)

      // Insert fresh line items
      const lineItemsToInsert = engineResult.lineItems.map((item: any) => ({
        payslip_id: payslip.id,
        component_id: item.componentId,
        quantity: item.quantity || null,
        rate_applied: item.rate,
        amount: item.amount,
        was_taxable: item.isTaxable
      }))

      const { error: lineItemsError } = await supabase
        .from('payslip_line_items')
        .insert(lineItemsToInsert)

      if (lineItemsError) throw lineItemsError

      // Update local state
      setRows(prev => prev.map(r => 
        r.staffId === staffId 
          ? { ...mapEngineResultToRow(engineResult, staffMember), status: 'processed', payslipId: payslip.id }
          : r
      ))

      // Log action
      await logAction({
        action: 'CREATE',
        entity: 'Payslip',
        entityId: staffMember.id,
        details: `Processed payroll for ${staffMember.full_name} — ${MONTHS[selectedMonth]} ${selectedYear}: Net Pay ${fmt(engineResult.netPay)}`
      })

    } catch (error) {
      console.error('Failed to run payroll:', error)
      alert('Failed to save payroll. Please try again.')
    } finally {
      setRunning(null)
    }
  }

  const handleApproveAll = async () => {
    try {
      const periodId = await getOrCreatePayrollPeriod(selectedMonth, selectedYear)
      const processedRows = rows.filter(r => r.status === 'processed')
      
      // Update all processed payslips to paid
      for (const row of processedRows) {
        const staffMember = staff.find(s => s.staff_code === row.staffId)
        if (staffMember) {
          await supabase
            .from('payslips')
            .update({ status: 'paid' })
            .eq('staff_id', staffMember.id)
            .eq('period_id', periodId)
        }
      }

      // Close the payroll period
      const { error: periodError } = await supabase
        .from('payroll_periods')
        .update({ status: 'closed' })
        .eq('id', periodId)

      if (periodError) throw periodError

      // Update local state
      setRows(prev => prev.map(r => r.status === 'processed' ? { ...r, status: 'paid' } : r))
      setApprovalModal(false)

      // Log action
      const totalNet = processedRows.reduce((a, r) => a + r.netPay, 0)
      await logAction({
        action: 'UPDATE',
        entity: 'PayrollPeriod',
        details: `Approved and disbursed payroll for ${MONTHS[selectedMonth]} ${selectedYear} — ${processedRows.length} staff, ${fmt(totalNet)} total`,
        severity: 'high'
      })

    } catch (error) {
      console.error('Failed to approve payroll:', error)
      alert('Failed to approve payroll. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-slate-500">Loading payroll data...</div>
      </div>
    )
  }

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">Payroll Run</h2>
          <p className="text-sm text-slate-500">Attendance-driven · expand each row to see computation breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month navigation */}
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center">
            {MONTHS[selectedMonth]} {selectedYear}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
          {pending > 0 && (
            <button
              onClick={async () => {
                for (const r of rows.filter(x => x.status === 'pending')) {
                  await handleRun(r.staffId)
                }
                setApprovalModal(true)
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Run All Pending ({pending})
            </button>
          )}
          {processed > 0 && (
            <button onClick={() => setApprovalModal(true)} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
              Approve & Disburse ({processed})
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {[
          { l: 'Total Gross', v: fmt(totalGross), color: 'text-slate-800' },
          { l: 'Total PAYE', v: fmt(totalTax), color: 'text-red-600' },
          { l: 'Net Disbursement', v: fmt(totalNet), color: 'text-emerald-600' },
          { l: 'Progress', v: `${rows.length - pending}/${rows.length}`, color: 'text-blue-600', sub: `${pending} pending` },
        ].map(c => (
          <div key={c.l} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className={`font-display font-bold text-xl ${c.color} font-mono-data`}>{c.v}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.l}</div>
            {c.sub && <div className="text-xs text-slate-400">{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Expandable payroll rows */}
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.staffId} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Collapsed header */}
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setExpanded(expanded === row.staffId ? null : row.staffId)}
            >
              <svg
                className={`text-slate-400 transition-transform flex-none ${expanded === row.staffId ? 'rotate-90' : ''}`}
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              {row.photo ? (
                <img src={row.photo} alt={row.name} className="w-8 h-8 rounded-full object-cover flex-none" />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-none"
                  style={{ backgroundColor: getAvatarColor(row.name) }}
                >
                  {getInitials(row.name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{row.name}</span>
                  <span className="font-mono-data text-slate-400 text-xs">{row.staffId}</span>
                  {row.hasManualItems && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-100">needs manual input</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{row.department}</div>
              </div>
              <div className="hidden xl:flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-xs text-slate-400">Gross Base</div>
                  <div className="font-mono-data text-slate-700">{fmt(row.grossBase)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Taxable</div>
                  <div className="font-mono-data text-slate-700">{fmt(row.taxableIncome)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">PAYE</div>
                  <div className="font-mono-data text-red-500">-{fmt(row.paye)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Net Pay</div>
                  <div className="font-mono-data font-semibold text-emerald-600">{fmt(row.netPay)}</div>
                </div>
              </div>
              <span className={`ml-3 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusStyle(row.status)}`}>
                {row.status}
              </span>
              {row.status === 'pending' && (
                <button
                  onClick={e => { e.stopPropagation(); handleRun(row.staffId) }}
                  disabled={running === row.staffId}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium transition-colors disabled:opacity-60"
                >
                  {running === row.staffId ? 'Running...' : 'Run'}
                </button>
              )}
              {(row.status === 'processed' || row.status === 'paid') && row.payslipId && onNavigate && onSelectPayslip && (
                <button
                  onClick={e => { e.stopPropagation(); onSelectPayslip(row.payslipId!); onNavigate('ac-payslip') }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs font-medium transition-colors"
                >
                  View Payslip
                </button>
              )}
            </div>

            {/* Expanded breakdown */}
            {expanded === row.staffId && (
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/40 anim-fade">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Earnings */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Earnings Breakdown</h4>
                    <div className="space-y-1.5">
                      {row.items.filter(i => i.type !== 'deduction').map(item => (
                        <div key={item.id} className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`text-xs px-1.5 py-0.5 rounded flex-none font-medium ${itemTypeStyle(item.type)}`}>
                              {item.type === 'attendance' ? 'attendance' : item.type === 'manual' ? 'manual' : 'fixed'}
                            </span>
                            <div>
                              <div className="text-sm text-slate-700">{item.label}</div>
                              {item.breakdown && (
                                <div className="text-xs text-slate-400 mt-0.5">{item.breakdown}</div>
                              )}
                              {item.type === 'manual' && (
                                <div className="mt-1">
                                  <input
                                    type="number"
                                    value={manualValues[row.staffId]?.[item.id] || 0}
                                    onChange={e => setManual(row.staffId, item.id, Number(e.target.value))}
                                    onClick={e => e.stopPropagation()}
                                    placeholder="Enter amount..."
                                    className="px-2 py-1 text-xs rounded border border-orange-200 focus:outline-none focus:border-orange-400 w-32 font-mono-data"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-none">
                            <div className="font-mono-data text-slate-800 text-sm">{fmt(item.amount)}</div>
                            {item.taxable && <div className="text-xs text-violet-500">taxable</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Deductions + net */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Deductions & Net</h4>
                    <div className="space-y-1.5 mb-4">
                      {/* Taxable income line */}
                      <div className="flex justify-between text-sm py-1.5 border-b border-slate-200">
                        <span className="text-slate-600 font-medium">Taxable Income (monthly)</span>
                        <span className="font-mono-data font-medium text-violet-700">{fmt(row.taxableIncome)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1">
                        <div>
                          <span className="text-slate-500">PAYE</span>
                          <div className="text-xs text-slate-400">Progressive bands · annual basis</div>
                        </div>
                        <span className="font-mono-data text-red-500">-{fmt(row.paye)}</span>
                      </div>
                      {row.items.filter(i => i.type === 'deduction').map(item => (
                        <div key={item.id} className="flex justify-between text-sm py-1">
                          <span className="text-slate-500">{item.label}</span>
                          <span className="font-mono-data text-red-500">-{fmt(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-slate-200 pt-3 flex justify-between items-end">
                      <div>
                        <div className="text-xs text-slate-400">Total Deductions</div>
                        <div className="font-mono-data text-red-600 font-semibold">-{fmt(row.totalDeductions)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Net Pay</div>
                        <div className="font-display font-bold text-emerald-600 text-xl font-mono-data">{fmt(row.netPay)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">Legend:</span>
        {[
          { l: 'fixed', s: 'bg-slate-100 text-slate-500' },
          { l: 'attendance', s: 'bg-blue-50 text-blue-600 border border-blue-100' },
          { l: 'manual', s: 'bg-orange-50 text-orange-600 border border-orange-100' },
        ].map(b => (
          <div key={b.l} className="flex items-center gap-1">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${b.s}`}>{b.l}</span>
            <span className="text-xs text-slate-400">
              {b.l === 'fixed' ? '— salary structure %/flat' :
               b.l === 'attendance' ? '— computed from attendance data' :
               '— entered manually each month'}
            </span>
          </div>
        ))}
      </div>

      {/* Approval modal */}
      {approvalModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 anim-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <h3 className="font-display font-semibold text-slate-800">Approve Payroll</h3>
                <p className="text-sm text-slate-500">{MONTHS[selectedMonth]} {selectedYear}</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 mb-5 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Staff count</span><span>{rows.filter(r => r.status === 'processed').length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total PAYE</span><span className="font-mono-data text-red-600">{fmt(rows.filter(r => r.status === 'processed').reduce((a, r) => a + r.paye, 0))}</span></div>
              <div className="flex justify-between font-semibold"><span className="text-slate-600">Net Disbursement</span><span className="font-mono-data text-emerald-600">{fmt(rows.filter(r => r.status === 'processed').reduce((a, r) => a + r.netPay, 0))}</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setApprovalModal(false)} className="flex-1 py-2.5 rounded-lg border text-sm text-slate-600">Cancel</button>
              <button onClick={handleApproveAll} className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">Approve & Disburse</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
