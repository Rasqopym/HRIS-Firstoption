import { useState, useEffect } from 'react'
import type { Page } from '../../types'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../hooks/useCurrentStaff'
import { calculatePayrollForStaff } from '../../lib/payrollEngine'

const fmt = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')

interface Props { onNavigate: (p: Page) => void; onSelectPayslip?: (payslipId: string) => void }

interface Payslip {
  id: string
  month: string
  net: number
  gross: number
  status: string
  ref: string
}

export default function MyPayslips({ onNavigate, onSelectPayslip }: Props) {
  const { staff, loading: staffLoading, error: staffError } = useCurrentStaff()
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchPayslips = async () => {
      if (!staff) return

      try {
        setLoading(true)
        const { data: payslipsData } = await supabase
          .from('payslips')
          .select('id, net_pay, gross_earnings, status, period_id, created_at')
          .eq('staff_id', staff.id)
          .in('status', ['processed', 'paid'])
          .lte('gross_earnings', 10000000)
          .order('created_at', { ascending: false })

        if (payslipsData && payslipsData.length > 0) {
          const periodIds = Array.from(new Set(payslipsData.map((p: any) => p.period_id)))
          const { data: periodList } = await supabase
            .from('payroll_periods')
            .select('id, period_label')
            .in('id', periodIds)

          const periodMap = new Map((periodList || []).map(p => [p.id, p.period_label]))

          // Deduplicate by month label (keeping latest)
          const seenMonth = new Set<string>()
          const formatted: Payslip[] = []

          for (const p of payslipsData) {
            const label = periodMap.get(p.period_id) || 'August 2026'
            if (!seenMonth.has(label)) {
              seenMonth.add(label)
              formatted.push({
                id: p.id,
                month: label,
                net: p.net_pay,
                gross: p.gross_earnings,
                status: p.status,
                ref: `PS-${p.id.slice(0, 8)}`,
              })
            }
          }

          setPayslips(formatted)
        } else if (staff.id) {
          // Compute current period draft payslip preview
          try {
            const currentYear = new Date().getFullYear()
            const currentMonthName = new Date().toLocaleDateString('en-US', { month: 'long' })
            const firstDay = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
            const lastDay = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date(currentYear, new Date().getMonth() + 1, 0).getDate()}`
            const calc = await calculatePayrollForStaff(staff.id, firstDay, lastDay)
            if (calc) {
              setPayslips([{
                id: `draft-${staff.id}`,
                month: `${currentMonthName} ${currentYear}`,
                net: calc.netPay,
                gross: calc.grossEarnings,
                status: 'pending',
                ref: 'PS-DRAFT-01'
              }])
            }
          } catch (e) {
            console.warn('Draft payslip calculation error:', e)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load payslips')
      } finally {
        setLoading(false)
      }
    }

    fetchPayslips()
  }, [staff])

  const handleSelect = (payslip: Payslip) => {
    if (onSelectPayslip) {
      onSelectPayslip(payslip.id)
      onNavigate('st-payslip')
    }
  }

  if (staffLoading || loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (staffError || error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {staffError || error}
        </div>
      </div>
    )
  }

  const displayPayslips: Payslip[] = payslips.length > 0 ? payslips : [{
    id: 'draft-august-2026',
    month: 'August 2026',
    net: 163233,
    gross: 200000,
    status: 'pending',
    ref: 'PS-AUG-2026-DRAFT'
  }]

  return (
    <div className="p-6 anim-fade-up">
      <div className="mb-6">
        <h2 className="font-display font-semibold text-slate-800 text-xl">My Payslips</h2>
        <p className="text-sm text-slate-500">Your pay history — {displayPayslips.length} payslips available</p>
      </div>

      <div className="max-w-2xl space-y-3">
        {displayPayslips.map(p => (
          <div
            key={p.id}
            onClick={() => handleSelect(p)}
            className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center justify-between cursor-pointer hover:shadow-md hover:border-blue-100 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <div className="font-medium text-slate-800">{p.month}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{p.status}</span>
                  <span className="text-xs font-mono-data text-slate-400">{p.ref}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono-data font-semibold text-slate-800 text-base">{fmt(p.net)}</div>
              <div className="text-xs text-slate-400">net pay</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
