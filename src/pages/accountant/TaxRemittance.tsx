import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import { dbRoleToApp } from '../../lib/roleMap'
import { logAction } from '../../lib/auditLog'
import type { Role } from '../../types'

const fmt = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

interface DeptTax {
  department: string
  staffCount: number
  totalGross: number
  totalTaxable: number
  totalPAYE: number
}

interface StaffTaxRow {
  staffId: string
  name: string
  department: string
  grossSalary: number
  taxableIncome: number
  annualPAYE: number
  monthlyPAYE: number
  pension: number
  nhf: number
}

interface RemittanceStatus {
  id: string
  status: 'pending' | 'remitted'
  remittedDate: string | null
  amount: number
}

export default function TaxRemittance() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [taxRows, setTaxRows] = useState<StaffTaxRow[]>([])
  const [deptRows, setDeptRows] = useState<DeptTax[]>([])
  const [taxBands, setTaxBands] = useState<any[]>([])
  const [remittanceStatus, setRemittanceStatus] = useState<Record<string, RemittanceStatus>>({})
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [totalEmployerPension, setTotalEmployerPension] = useState(0)

  const getPeriodRange = () => {
    const firstDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
    const lastDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${new Date(selectedYear, selectedMonth + 1, 0).getDate()}`
    return { firstDay, lastDay }
  }

  const fetchRemittanceStatus = async (periodId: string) => {
    const { data } = await supabase
      .from('tax_remittances')
      .select('*')
      .eq('period_id', periodId)
    
    const statusMap: Record<string, RemittanceStatus> = {}
    for (const r of data || []) {
      statusMap[r.tax_type] = {
        id: r.id,
        status: r.status as 'pending' | 'remitted',
        remittedDate: r.remitted_date,
        amount: r.amount
      }
    }
    setRemittanceStatus(statusMap)
  }

  const toggleRemittanceStatus = async (taxType: string, amount: number) => {
    const current = remittanceStatus[taxType]
    const { firstDay, lastDay } = getPeriodRange()
    const periodLabel = `${MONTHS[selectedMonth]} ${selectedYear}`
    
    // Get or create period
    const { data: period } = await supabase
      .from('payroll_periods')
      .select('id')
      .eq('period_label', periodLabel)
      .single()
    
    if (!period) {
      alert('Payroll period not found. Please run payroll for this period first.')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    
    let remittanceId: string | undefined
    let newStatus: string
    
    if (current && current.status === 'remitted') {
      // Revert to pending
      await supabase
        .from('tax_remittances')
        .update({ status: 'pending', remitted_date: null, remitted_by: null })
        .eq('id', current.id)
      remittanceId = current.id
      newStatus = 'pending'
    } else {
      // Mark as remitted
      if (current) {
        await supabase
          .from('tax_remittances')
          .update({ 
            status: 'remitted', 
            remitted_date: new Date().toISOString(), 
            remitted_by: user?.id,
            amount
          })
          .eq('id', current.id)
        remittanceId = current.id
        newStatus = 'remitted'
      } else {
        const { data: inserted } = await supabase
          .from('tax_remittances')
          .insert({
            period_id: period.id,
            tax_type: taxType,
            status: 'remitted',
            remitted_date: new Date().toISOString(),
            remitted_by: user?.id,
            amount
          })
          .select('id')
          .single()
        remittanceId = inserted?.id
        newStatus = 'remitted'
      }
    }
    
    // Log the action
    await logAction({
      action: 'UPDATE',
      entity: 'TaxRemittance',
      entityId: remittanceId,
      details: `${taxType.toUpperCase()} remittance for ${periodLabel} marked as ${newStatus} (${fmt(amount)})`,
      severity: 'high'
    })
    
    await fetchRemittanceStatus(period.id)
  }

  const handleDownloadPDF = async () => {
    const element = document.querySelector('.tax-report-print') as HTMLElement
    if (!element) return

    setDownloading(true)
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false
      })
      
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      
      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [imgWidth, imgHeight]
      })
      
      const dataUrl = canvas.toDataURL('image/png')
      pdf.addImage(dataUrl, 'PNG', 0, 0, imgWidth, imgHeight)
      
      pdf.save(`tax-remittance-${MONTHS[selectedMonth]}-${selectedYear}.pdf`)
    } catch (err) {
      console.error('PDF generation failed:', err)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handleExportExcel = () => {
    const worksheetData = [
      ['Staff', 'Staff ID', 'Department', 'Monthly Gross', 'Monthly Taxable', 'Annual Taxable', 'Annual PAYE', 'Monthly PAYE', 'Pension', 'NHF'],
      ...taxRows.map(r => [
        r.name,
        r.staffId,
        r.department,
        r.grossSalary,
        r.taxableIncome,
        r.taxableIncome * 12,
        r.annualPAYE,
        r.monthlyPAYE,
        r.pension,
        r.nhf
      ])
    ]
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tax Remittance')
    XLSX.writeFile(workbook, `tax-remittance-${MONTHS[selectedMonth]}-${selectedYear}.xlsx`)
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const { firstDay, lastDay } = getPeriodRange()
        const periodLabel = `${MONTHS[selectedMonth]} ${selectedYear}`

        // Get current user role
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
          if (profile) {
            setCurrentUserRole(dbRoleToApp(profile.role))
          }
        }

        // Get period
        const { data: period } = await supabase
          .from('payroll_periods')
          .select('id')
          .eq('period_label', periodLabel)
          .maybeSingle()

        if (!period) {
          setTaxRows([])
          setDeptRows([])
          setLoading(false)
          return
        }

        // Fetch payslips for period
        const { data: payslips } = await supabase
          .from('payslips')
          .select(`
            id,
            paye_tax,
            gross_earnings,
            taxable_income,
            status,
            staff:staff_id (
              id,
              staff_code,
              full_name,
              departments (name)
            )
          `)
          .eq('period_id', period.id)
          .in('status', ['processed', 'paid'])

        if (!payslips || payslips.length === 0) {
          setTaxRows([])
          setDeptRows([])
          setLoading(false)
          return
        }

        // Get salary components to identify pension/NHF
        const { data: salaryComponents } = await supabase
          .from('salary_components')
          .select('id, name')

        const pensionComps = salaryComponents?.filter(c => c.name.toLowerCase().includes('pension')) || []
        const nhfComps = salaryComponents?.filter(c => c.name.toLowerCase().includes('nhf')) || []
        
        // Check for employer-side pension contribution component
        const employerPensionComps = salaryComponents?.filter(c => 
          c.name.toLowerCase().includes('employer') && c.name.toLowerCase().includes('pension')
        ) || []
        
        console.log('Pension components matched:', pensionComps.map(c => c.name))
        console.log('NHF components matched:', nhfComps.map(c => c.name))
        console.log('Employer pension components matched:', employerPensionComps.map(c => c.name))

        const pensionCompIds = pensionComps.map(c => c.id)
        const nhfCompIds = nhfComps.map(c => c.id)
        const employerPensionCompIds = employerPensionComps.map(c => c.id)

        // Get line items for pension/NHF amounts
        const payslipIds = payslips.map(p => p.id)
        const { data: lineItems } = await supabase
          .from('payslip_line_items')
          .select('payslip_id, component_id, amount')
          .in('payslip_id', payslipIds)
          .in('component_id', [...pensionCompIds, ...nhfCompIds, ...employerPensionCompIds])

        // Build staff tax rows
        const rows: StaffTaxRow[] = payslips.map(p => {
          const staffPension = lineItems
            ?.filter(li => li.payslip_id === p.id && pensionCompIds.includes(li.component_id))
            .reduce((sum, li) => sum + li.amount, 0) || 0
          const staffNHF = lineItems
            ?.filter(li => li.payslip_id === p.id && nhfCompIds.includes(li.component_id))
            .reduce((sum, li) => sum + li.amount, 0) || 0

          return {
            staffId: p.staff.staff_code,
            name: p.staff.full_name,
            department: p.staff.departments?.name || 'Unassigned',
            grossSalary: p.gross_earnings,
            taxableIncome: p.taxable_income,
            annualPAYE: Math.round(p.paye_tax * 12),
            monthlyPAYE: p.paye_tax,
            pension: staffPension,
            nhf: staffNHF
          }
        })

        setTaxRows(rows)

        // Calculate total employer pension
        const totalEmployer = lineItems
          ?.filter(li => employerPensionCompIds.includes(li.component_id))
          .reduce((sum, li) => sum + li.amount, 0) || 0
        setTotalEmployerPension(totalEmployer)

        // Build department breakdown
        const deptMap = new Map<string, DeptTax>()
        for (const row of rows) {
          const d = deptMap.get(row.department) || { 
            department: row.department, 
            staffCount: 0, 
            totalGross: 0, 
            totalTaxable: 0, 
            totalPAYE: 0 
          }
          d.staffCount++
          d.totalGross += row.grossSalary
          d.totalTaxable += row.taxableIncome
          d.totalPAYE += row.monthlyPAYE
          deptMap.set(row.department, d)
        }
        setDeptRows(Array.from(deptMap.values()).sort((a, b) => b.totalPAYE - a.totalPAYE))

        // Fetch tax bands
        const { data: bands } = await supabase
          .from('tax_bands')
          .select('*')
          .order('lower_bound')
        setTaxBands(bands || [])

        // Fetch remittance status
        await fetchRemittanceStatus(period.id)

      } catch (err) {
        console.error('Error fetching tax remittance data:', err)
        setError('Failed to load tax remittance data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedMonth, selectedYear])

  const totalPAYE = taxRows.reduce((a, r) => a + r.monthlyPAYE, 0)
  const totalPension = taxRows.reduce((a, r) => a + r.pension, 0)
  const totalNHF = taxRows.reduce((a, r) => a + r.nhf, 0)
  const totalGross = taxRows.reduce((a, r) => a + r.grossSalary, 0)
  if (loading) return <div className="p-6 text-center text-slate-500">Loading...</div>
  if (error) return <div className="p-6 text-center text-red-500">{error}</div>

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">Tax Remittance Report</h2>
          <p className="text-sm text-slate-500">{MONTHS[selectedMonth]} {selectedYear} · Amounts to remit to FIRS and relevant authorities</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
          >
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
          >
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button 
            onClick={handleDownloadPDF}
            disabled={downloading || taxRows.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
          <button 
            onClick={handleExportExcel}
            disabled={taxRows.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Excel
          </button>
        </div>
      </div>

      {taxRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-500">
          No processed payslips found for {MONTHS[selectedMonth]} {selectedYear}. Run payroll first to generate tax remittance data.
        </div>
      ) : (
        <div className="tax-report-print">

      {/* Summary remittance cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">PAYE — FIRS</div>
              <div className="font-display font-bold text-2xl text-red-600 font-mono-data">{fmt(totalPAYE)}</div>
              <div className="text-xs text-slate-400 mt-0.5">Monthly · {taxRows.length} employees</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
              <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${(totalPAYE / totalGross) * 100}%` }} />
            </div>
            <span className="text-xs text-slate-400 font-mono-data">{((totalPAYE / totalGross) * 100).toFixed(1)}% of gross</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className={`text-xs font-medium ${remittanceStatus['paye']?.status === 'remitted' ? 'text-emerald-600' : 'text-slate-400'}`}>
              {remittanceStatus['paye']?.status === 'remitted' ? 'Remitted' : 'Pending'}
            </span>
            {(currentUserRole === 'accountant' || currentUserRole === 'superadmin') && (
              <button 
                onClick={() => toggleRemittanceStatus('paye', totalPAYE)}
                className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
              >
                {remittanceStatus['paye']?.status === 'remitted' ? 'Revert' : 'Mark Remitted'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">Pension — PFAs</div>
              <div className="font-display font-bold text-2xl text-blue-600 font-mono-data">{fmt(totalPension)}</div>
              <div className="text-xs text-slate-400 mt-0.5">Employee contribution</div>
              {totalEmployerPension > 0 && (
                <div className="mt-1 text-xs text-slate-400">Employer contribution: {fmt(totalEmployerPension)} additional</div>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className={`text-xs font-medium ${remittanceStatus['pension']?.status === 'remitted' ? 'text-emerald-600' : 'text-slate-400'}`}>
              {remittanceStatus['pension']?.status === 'remitted' ? 'Remitted' : 'Pending'}
            </span>
            {(currentUserRole === 'accountant' || currentUserRole === 'superadmin') && (
              <button 
                onClick={() => toggleRemittanceStatus('pension', totalPension)}
                className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
              >
                {remittanceStatus['pension']?.status === 'remitted' ? 'Revert' : 'Mark Remitted'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">NHF — Federal Mortgage</div>
              <div className="font-display font-bold text-2xl text-amber-600 font-mono-data">{fmt(totalNHF)}</div>
              <div className="text-xs text-slate-400 mt-0.5">National Housing Fund contribution</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className={`text-xs font-medium ${remittanceStatus['nhf']?.status === 'remitted' ? 'text-emerald-600' : 'text-slate-400'}`}>
              {remittanceStatus['nhf']?.status === 'remitted' ? 'Remitted' : 'Pending'}
            </span>
            {(currentUserRole === 'accountant' || currentUserRole === 'superadmin') && (
              <button 
                onClick={() => toggleRemittanceStatus('nhf', totalNHF)}
                className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
              >
                {remittanceStatus['nhf']?.status === 'remitted' ? 'Revert' : 'Mark Remitted'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PAYE tax bands in use */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-5">
        <h3 className="font-display font-semibold text-slate-800 mb-4 text-sm">Applied PAYE Bands (Annual Chargeable Income)</h3>
        <div className="space-y-2">
          {taxBands.map(band => (
            <div key={band.id} className="flex items-center gap-3">
              <div className="w-36 text-xs font-mono-data text-slate-500">
                {band.upper_bound != null
                  ? `₦${(band.lower_bound / 1000).toFixed(0)}k – ₦${(band.upper_bound / 1000).toFixed(0)}k`
                  : `₦${(band.lower_bound / 1000000).toFixed(1)}M+`}
              </div>
              <div className="flex-1 bg-slate-100 rounded-full h-4 relative overflow-hidden">
                <div
                  className="h-4 rounded-full flex items-center px-2"
                  style={{
                    width: `${Math.max(5, band.rate * 4)}%`,
                    background: `hsl(${220 - band.rate * 6}, 75%, ${65 - band.rate}%)`,
                  }}
                >
                  {band.rate > 0 && <span className="text-white text-xs font-mono-data font-semibold">{band.rate}%</span>}
                </div>
              </div>
              <div className="w-12 text-right text-xs font-mono-data text-slate-400">{band.rate === 0 ? 'Exempt' : `${band.rate}%`}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">Bands are progressive and applied to Annual Chargeable Income = Annual Taxable Earnings − Personal Reliefs (CRA, pension, NHF, life insurance, rent)</p>
      </div>

      {/* Department breakdown */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h3 className="font-display font-semibold text-slate-700 text-sm">PAYE by Department</h3>
          <span className="text-xs text-slate-400">{deptRows.length} departments</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-50">
              {['Department', 'Staff', 'Total Gross', 'Taxable Income', 'PAYE to Remit', 'Effective Rate'].map(h => (
                <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {deptRows.map(d => (
              <tr key={d.department} className="table-row-hover">
                <td className="py-3 px-4 font-medium text-slate-800">{d.department}</td>
                <td className="py-3 px-4 font-mono-data text-slate-600">{d.staffCount}</td>
                <td className="py-3 px-4 font-mono-data text-slate-700">{fmt(d.totalGross)}</td>
                <td className="py-3 px-4 font-mono-data text-violet-700">{fmt(d.totalTaxable)}</td>
                <td className="py-3 px-4 font-mono-data font-semibold text-red-600">{fmt(d.totalPAYE)}</td>
                <td className="py-3 px-4 font-mono-data text-slate-500">
                  {d.totalGross > 0 ? `${((d.totalPAYE / d.totalGross) * 100).toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50/60">
              <td className="py-3 px-4 font-semibold text-slate-800">Total</td>
              <td className="py-3 px-4 font-mono-data font-semibold">{taxRows.length}</td>
              <td className="py-3 px-4 font-mono-data font-semibold">{fmt(totalGross)}</td>
              <td className="py-3 px-4 font-mono-data font-semibold text-violet-700">
                {fmt(taxRows.reduce((a, r) => a + r.taxableIncome, 0))}
              </td>
              <td className="py-3 px-4 font-mono-data font-bold text-red-600">{fmt(totalPAYE)}</td>
              <td className="py-3 px-4 font-mono-data text-slate-600">{((totalPAYE / totalGross) * 100).toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Per-staff detail */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h3 className="font-display font-semibold text-slate-700 text-sm">Per-Staff PAYE Detail</h3>
          <span className="text-xs text-slate-400">All active employees</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50">
                {['Staff', 'Dept', 'Monthly Gross', 'Monthly Taxable', 'Annual Taxable', 'Annual PAYE', 'Monthly PAYE', 'Pension', 'NHF'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {taxRows.map(r => (
                <tr key={r.staffId} className="table-row-hover">
                  <td className="py-3 px-3">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="font-mono-data text-xs text-slate-400">{r.staffId}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{r.department}</td>
                  <td className="py-3 px-3 font-mono-data text-slate-700">{fmt(r.grossSalary)}</td>
                  <td className="py-3 px-3 font-mono-data text-violet-600">{fmt(r.taxableIncome)}</td>
                  <td className="py-3 px-3 font-mono-data text-slate-500">{fmt(r.taxableIncome * 12)}</td>
                  <td className="py-3 px-3 font-mono-data text-red-500">{fmt(r.annualPAYE)}</td>
                  <td className="py-3 px-3 font-mono-data font-semibold text-red-600">{fmt(r.monthlyPAYE)}</td>
                  <td className="py-3 px-3 font-mono-data text-blue-600">{fmt(r.pension)}</td>
                  <td className="py-3 px-3 font-mono-data text-amber-600">{fmt(r.nhf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          PAYE computed using progressive bands on annual chargeable income. Reliefs applied per staff salary structure. This report is illustrative — confirm with a FIRS-certified tax consultant before filing.
        </div>
      </div>
      </div>
      )}
    </div>
  )
}
