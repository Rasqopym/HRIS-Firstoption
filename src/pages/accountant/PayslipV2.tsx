import { useState, useEffect } from 'react'
import React from 'react'
import { supabase } from '../../lib/supabase'
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'

const fmt = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')

interface Props {
  payslipId?: string
  onNavigate?: (page: any) => void
}

// Rate type to unit label mapping
const RATE_UNIT_MAP: Record<string, string> = {
  'flat_amount': '',
  'percentage_of_gross': '%',
  'percentage_of_basic': '%',
  'per_hour': '/hr',
  'per_day': '/day',
  'manual_monthly': '',
}

export default function PayslipV2({ payslipId }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payslip, setPayslip] = useState<any>(null)
  const [staff, setStaff] = useState<any>(null)
  const [period, setPeriod] = useState<any>(null)
  const [lineItems, setLineItems] = useState<any[]>([])
  const [taxBands, setTaxBands] = useState<any[]>([])
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [companySettings, setCompanySettings] = useState<{ name: string; address: string; logo_url: string | null } | null>(null)

  const toggleRow = (label: string) =>
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })

  const handleDownloadPDF = async () => {
    const element = document.querySelector('.payslip-print') as HTMLElement
    if (!element) return

    setDownloading(true)
    try {
      // Capture to canvas using html2canvas-pro (supports oklch/color-mix)
      const canvas = await html2canvas(element, {
        scale: 2, // higher resolution
        useCORS: true,
        logging: false
      })
      
      // Use actual canvas dimensions
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      
      // Create PDF with page size matching canvas dimensions exactly
      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [imgWidth, imgHeight]
      })
      
      // Add image using the same dimensions as the canvas
      const dataUrl = canvas.toDataURL('image/png')
      pdf.addImage(dataUrl, 'PNG', 0, 0, imgWidth, imgHeight)
      
      pdf.save(`payslip-${staff?.staff_code || 'unknown'}-${period?.period_label || 'unknown'}.pdf`)
    } catch (err) {
      console.error('PDF generation failed:', err)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    const fetchPayslip = async () => {
      if (!payslipId) {
        setError('No payslip ID provided')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // Fetch payslip with joins
        const { data: payslipData, error: payslipError } = await supabase
          .from('payslips')
          .select(`
            *,
            staff:staff_id (
              id,
              staff_code,
              full_name,
              job_title,
              photo_url,
              bank_name,
              account_number,
              departments (name),
              profiles (photo_url)
            ),
            period:period_id (
              id,
              period_label,
              start_date,
              end_date
            )
          `)
          .eq('id', payslipId)
          .maybeSingle()

        if (payslipError) throw payslipError
        if (!payslipData) {
          setError('Payslip not found')
          setLoading(false)
          return
        }

        setPayslip(payslipData)
        setStaff(payslipData.staff)
        setPeriod(payslipData.period)

        // Fetch line items
        const { data: itemsData, error: itemsError } = await supabase
          .from('payslip_line_items')
          .select(`
            *,
            salary_components (
              id,
              name,
              category,
              default_rate_type
            )
          `)
          .eq('payslip_id', payslipId)

        if (itemsError) throw itemsError
        setLineItems(itemsData || [])

        // Fetch tax bands for PAYE breakdown
        const { data: taxBandsData, error: taxBandsError } = await supabase
          .from('tax_bands')
          .select('*')
          .order('lower_bound', { ascending: true })

        if (taxBandsError) throw taxBandsError
        setTaxBands(taxBandsData || [])

      } catch (err) {
        console.error('Failed to fetch payslip:', err)
        setError('Failed to load payslip. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchPayslip()
  }, [payslipId])

  useEffect(() => {
    const fetchCompanySettings = async () => {
      try {
        const { data } = await supabase
          .from('company_settings')
          .select('name, address, logo_url')
          .single()

        if (data) {
          setCompanySettings({
            name: data.name || 'Firstoption HRIS',
            address: data.address || '12 Marina Street, Victoria Island, Lagos',
            logo_url: data.logo_url || null,
          })
        }
      } catch (err) {
        console.error('Error fetching company settings:', err)
      }
    }

    fetchCompanySettings()
  }, [])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-slate-500">Loading payslip...</div>
      </div>
    )
  }

  if (error || !payslip || !staff || !period) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
          </div>
          <h3 className="font-display font-semibold text-slate-600 text-xl">Payslip Not Found</h3>
          <p className="text-slate-400 text-sm mt-1">{error || 'This payslip does not exist or you do not have permission to view it.'}</p>
        </div>
      </div>
    )
  }

  const earnings = lineItems.filter(i => i.salary_components?.category === 'allowance')
  const deductions = lineItems.filter(i => i.salary_components?.category === 'deduction')
  const totalEarnings = earnings.reduce((a, e) => a + e.amount, 0)
  const totalStatutory = deductions.reduce((a, d) => a + d.amount, 0)
  const totalDeductions = totalStatutory + payslip.paye_tax
  const netPay = payslip.net_pay

  // Compute PAYE breakdown
  const annualTaxableIncome = payslip.taxable_income * 12
  const payeBands: { label: string; amount: number; rate: number; tax: number }[] = []
  let remaining = annualTaxableIncome
  for (const band of taxBands) {
    if (remaining <= 0) break
    const bandWidth = band.upper_bound != null ? band.upper_bound - band.lower_bound : remaining
    const inBand = Math.min(remaining, Math.max(0, bandWidth))
    const tax = Math.round(inBand * band.rate)
    if (inBand > 0) {
      payeBands.push({ label: `₦${band.lower_bound.toLocaleString()} - ${band.upper_bound ? band.upper_bound.toLocaleString() : '∞'}`, amount: inBand, rate: band.rate * 100, tax })
    }
    remaining -= inBand
    if (band.upper_bound == null) break
  }
  const annualPAYE = payeBands.reduce((a, b) => a + b.tax, 0)

  const today = new Date()

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-5 no-print">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">Payslip — {period.period_label}</h2>
          <p className="text-sm text-slate-500">Enhanced view with taxable income and PAYE breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-60"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {downloading ? 'Downloading...' : 'Download PDF'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v-5a2 2 0 0 1-2-2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print Payslip
          </button>
        </div>
      </div>

      {/* Payslip document */}
      <div className="payslip-print bg-white rounded-2xl border border-slate-200 shadow-sm max-w-3xl mx-auto overflow-hidden">
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)' }} className="px-8 py-6 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {companySettings?.logo_url && (
                <img
                  src={companySettings.logo_url}
                  alt="Company Logo"
                  className="w-10 h-10 rounded-lg object-cover bg-white/10"
                  crossOrigin="anonymous"
                />
              )}
              <div>
                <div className="font-display font-bold text-xl">{companySettings?.name || 'Firstoption HRIS'}</div>
                <div className="text-blue-300 text-xs mt-1">{companySettings?.address || '12 Marina Street, Victoria Island, Lagos'}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-display font-semibold text-lg">PAYSLIP</div>
              <div className="text-blue-200 text-sm">{period.period_label}</div>
              <div className="font-mono-data text-blue-300 text-xs mt-1">{today.toLocaleDateString('en-NG')}</div>
            </div>
          </div>
        </div>

        {/* Staff info */}
        <div className="px-8 py-5 border-b border-slate-100" style={{ backgroundColor: 'rgba(248, 250, 252, 0.4)' }}>
          <div className="flex items-center gap-4">
            {(staff.photo_url || staff.profiles?.photo_url) ? (
              <img src={staff.photo_url || staff.profiles?.photo_url} alt={staff.full_name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                {staff.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { l: 'Name', v: staff.full_name },
                { l: 'Staff ID', v: staff.staff_code },
                { l: 'Department', v: staff.departments?.name || 'Unassigned' },
                { l: 'Position', v: staff.job_title || '—' },
                { l: 'Bank', v: staff.bank_name || '—' },
                { l: 'Account No.', v: staff.account_number || '—' },
              ].map(f => (
                <div key={f.l}>
                  <div className="text-xs text-slate-400">{f.l}</div>
                  <div className="text-sm font-medium text-slate-700 font-mono-data">{f.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Earnings & Deductions */}
        <div className="px-8 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Earnings */}
          <div>
            <h3 className="font-display font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">Earnings</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-1.5 text-left text-xs text-slate-400 font-medium">Description</th>
                  <th className="py-1.5 text-right text-xs text-slate-400 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map(e => {
                  const isOpen = expandedRows.has(e.id)
                  const hasCalc = e.quantity !== null && e.quantity > 0
                  const rateType = e.salary_components?.default_rate_type || ''
                  const rateUnit = RATE_UNIT_MAP[rateType] || ''
                  return (
                    <React.Fragment key={e.id}>
                      <tr className="border-t border-slate-50 first:border-t-0">
                        <td className="py-2 pr-2">
                          <div className="flex items-start gap-1.5">
                            {hasCalc && (
                              <button
                                onClick={() => toggleRow(e.id)}
                                className="mt-0.5 flex-none text-blue-400 hover:text-blue-600 transition-colors"
                                title="How this was calculated"
                              >
                                <svg
                                  width="13" height="13" viewBox="0 0 24 24" fill="none"
                                  stroke="currentColor" strokeWidth="2.5"
                                  className={`transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                                >
                                  <polyline points="9 18 15 12 9 6"/>
                                </svg>
                              </button>
                            )}
                            <div>
                              <div className={`text-slate-700 ${hasCalc ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                                onClick={() => hasCalc && toggleRow(e.id)}>
                                {e.salary_components?.name || 'Unknown'}
                              </div>
                              {e.was_taxable && <span className="text-xs text-violet-500">taxable</span>}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 text-right font-mono-data text-slate-800 align-top">{fmt(e.amount)}</td>
                      </tr>
                      {hasCalc && isOpen && (
                        <tr key={`${e.id}-calc`}>
                          <td colSpan={2} className="pb-2.5 pt-0">
                            <div className="ml-5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
                              <div className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1.5">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                How this was calculated
                              </div>
                              <div className="space-y-1.5 text-xs text-slate-600">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500">Rate</span>
                                  <span className="font-mono-data font-semibold text-slate-700">
                                    ₦{e.rate_applied.toLocaleString()}{rateUnit}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500">Quantity</span>
                                  <span className="font-mono-data font-semibold text-slate-700">
                                    {e.quantity}
                                  </span>
                                </div>
                                <div className="border-t border-blue-100 pt-1.5 flex items-center justify-between font-semibold">
                                  <span className="text-slate-600">
                                    ₦{e.rate_applied.toLocaleString()} × {e.quantity}
                                  </span>
                                  <span className="font-mono-data text-blue-700">{fmt(e.amount)}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="pt-2 font-semibold text-slate-800">Total Earnings</td>
                  <td className="pt-2 text-right font-mono-data font-bold text-slate-800">{fmt(totalEarnings)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deductions */}
          <div>
            <h3 className="font-display font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">Deductions</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-1.5 text-left text-xs text-slate-400 font-medium">Description</th>
                  <th className="py-1.5 text-right text-xs text-slate-400 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {deductions.map(d => (
                  <tr key={d.id}>
                    <td className="py-2 text-slate-700">{d.salary_components?.name || 'Unknown'}</td>
                    <td className="py-2 text-right font-mono-data text-slate-600">-{fmt(d.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 text-slate-700">
                    PAYE Tax
                    <div className="text-xs text-slate-400">₦{(annualTaxableIncome / 1000).toFixed(0)}k annual taxable basis</div>
                  </td>
                  <td className="py-2 text-right font-mono-data text-red-600">-{fmt(payslip.paye_tax)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="pt-2 font-semibold text-slate-800">Total Deductions</td>
                  <td className="pt-2 text-right font-mono-data font-bold text-red-600">-{fmt(totalDeductions)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Taxable income section */}
        <div className="mx-8 mb-5 border border-violet-100 rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(245, 243, 255, 0.3)' }}>
          <div className="px-5 py-3 border-b border-violet-100 bg-violet-50">
            <h3 className="font-display font-semibold text-violet-800 text-sm">Taxable Income Computation</h3>
            <p className="text-xs text-violet-500">How PAYE was calculated for this month</p>
          </div>
          <div className="px-5 py-4">
            <div className="space-y-1.5 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-slate-600">Monthly Taxable Income</span>
                <span className="font-mono-data">{fmt(payslip.taxable_income)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">× 12 (annualised)</span>
                <span className="font-mono-data">{fmt(payslip.taxable_income * 12)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-violet-200 pt-1.5">
                <span className="text-violet-800">Annual Chargeable Income</span>
                <span className="font-mono-data text-violet-700">{fmt(annualTaxableIncome)}</span>
              </div>
            </div>

            {/* Band breakdown */}
            <div className="border-t border-violet-100 pt-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">PAYE Band Application (Annual)</div>
              <div className="space-y-1">
                {payeBands.map(b => (
                  <div key={b.label} className="flex items-center gap-3 text-xs">
                    <div className="w-24 text-slate-500">{b.label}</div>
                    <div className="flex-1 bg-slate-100 rounded h-3 relative">
                      <div
                        className="h-3 rounded"
                        style={{ width: `${Math.min(100, (b.amount / annualTaxableIncome) * 100)}%`, background: `hsl(${220 - b.rate * 6}, 75%, ${65 - b.rate}%)` }}
                      />
                    </div>
                    <div className="font-mono-data text-slate-500 w-24 text-right">{fmt(b.amount)} @ {b.rate.toFixed(1)}%</div>
                    <div className="font-mono-data text-red-500 w-20 text-right">{fmt(b.tax)}</div>
                  </div>
                ))}
                <div className="flex justify-between pt-1.5 border-t border-violet-100 font-semibold text-xs">
                  <span className="text-slate-700">Annual PAYE</span>
                  <span className="font-mono-data text-red-600">{fmt(annualPAYE)}</span>
                </div>
                <div className="flex justify-between font-semibold text-sm">
                  <span className="text-slate-800">Monthly PAYE (÷12)</span>
                  <span className="font-mono-data text-red-700">{fmt(payslip.paye_tax)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Net pay */}
        <div className="mx-8 mb-8 rounded-xl bg-emerald-600 px-6 py-5 flex items-center justify-between text-white">
          <div>
            <div className="text-emerald-100 text-sm">Net Pay (Take-Home)</div>
            <div className="font-display font-bold text-3xl font-mono-data mt-0.5">{fmt(netPay)}</div>
            <div className="text-emerald-200 text-xs mt-1">Paid to {staff.bank_name || '—'} · {staff.account_number || '—'}</div>
          </div>
          <div className="text-right text-sm text-emerald-100 space-y-0.5">
            <div>Gross: <span className="font-mono-data font-semibold text-white">{fmt(totalEarnings)}</span></div>
            <div>PAYE: <span className="font-mono-data text-red-200">-{fmt(payslip.paye_tax)}</span></div>
            <div>Statutory: <span className="font-mono-data text-red-200">-{fmt(totalStatutory)}</span></div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-400">
          <span>This payslip is computer-generated and does not require a signature.</span>
          <span className="font-mono-data">Ref: PS-{staff.staff_code}-{period.period_label.replace(' ', '-')}-{payslip.id.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  )
}
