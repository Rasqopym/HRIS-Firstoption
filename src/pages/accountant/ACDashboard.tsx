import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Page } from '../../types'

const fmt = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')

interface Props { onNavigate: (p: Page) => void }

export default function ACDashboard({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalGross, setTotalGross] = useState(0)
  const [totalNet, setTotalNet] = useState(0)
  const [totalStaff, setTotalStaff] = useState(0)
  const [paidCount, setPaidCount] = useState(0)
  const [deptTotals, setDeptTotals] = useState<Record<string, number>>({})
  const [periodLabel, setPeriodLabel] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Get most recent payroll period with processed/paid payslips
        const { data: periods } = await supabase
          .from('payroll_periods')
          .select('id, period_label')
          .order('start_date', { ascending: false })
          .limit(1)

        if (!periods || periods.length === 0) {
          setTotalGross(0)
          setTotalNet(0)
          setTotalStaff(0)
          setPaidCount(0)
          setDeptTotals({})
          setPeriodLabel('')
          setLoading(false)
          return
        }

        const period = periods[0]
        setPeriodLabel(period.period_label)

        // Get total active staff count
        const { count: staffCount } = await supabase
          .from('staff')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
        setTotalStaff(staffCount || 0)

        // Get payslips for the period
        const { data: payslips } = await supabase
          .from('payslips')
          .select(`
            id,
            gross_earnings,
            net_pay,
            status,
            staff_id,
            staff!inner (
              id,
              staff_code,
              full_name,
              departments (name)
            )
          `)
          .eq('period_id', period.id)
          .in('status', ['processed', 'paid'])

        if (!payslips || payslips.length === 0) {
          setTotalGross(0)
          setTotalNet(0)
          setPaidCount(0)
          setDeptTotals({})
          setLoading(false)
          return
        }

        // Calculate totals
        const gross = payslips.reduce((sum, p) => sum + p.gross_earnings, 0)
        const net = payslips.reduce((sum, p) => sum + p.net_pay, 0)
        const paid = payslips.filter(p => p.status === 'paid').length

        setTotalGross(gross)
        setTotalNet(net)
        setPaidCount(paid)

        // Calculate department totals
        const deptMap: Record<string, number> = {}
        for (const payslip of payslips) {
          const staff = payslip.staff as any
          const dept = staff.departments?.[0]?.name || 'Unassigned'
          deptMap[dept] = (deptMap[dept] || 0) + payslip.gross_earnings
        }
        setDeptTotals(deptMap)

      } catch (err) {
        console.error('Error fetching dashboard data:', err)
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) return <div className="p-6 text-center text-slate-500">Loading dashboard...</div>
  if (error) return <div className="p-6 text-center text-red-500">{error}</div>

  const cards = [
    { 
      label: 'Gross Payroll', 
      value: fmt(totalGross), 
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
      color: 'text-blue-600', 
      bg: 'bg-blue-50' 
    },
    { 
      label: 'Net Payroll', 
      value: fmt(totalNet), 
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50' 
    },
    { 
      label: 'Total Staff', 
      value: totalStaff, 
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      color: 'text-slate-600', 
      bg: 'bg-slate-100' 
    },
    { 
      label: 'Paid', 
      value: paidCount, 
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
      color: 'text-violet-600', 
      bg: 'bg-violet-50' 
    },
  ]

  return (
    <div className="p-6 space-y-5 anim-fade-up">
      <div>
        <h2 className="font-display font-semibold text-slate-800 text-xl">Finance Dashboard</h2>
        <p className="text-slate-500 text-sm">{periodLabel || 'No payroll data'} · Payroll Overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5 card-hover flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 tracking-wide uppercase">{card.label}</span>
              <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center ${card.color}`}>
                {card.icon}
              </div>
            </div>
            <div>
              <div className="font-display font-bold text-2xl text-slate-800 font-mono-data tracking-tight">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <h3 className="font-display font-semibold text-slate-800 text-base">Payroll Breakdown by Department</h3>
          </div>
          <button onClick={() => onNavigate('ac-reports')} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
            View financial reports <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        {Object.keys(deptTotals).length === 0 ? (
          <div className="text-center text-slate-400 py-12 text-sm">No department payroll data recorded for the current period</div>
        ) : (
          <div className="space-y-4">
            {Object.entries(deptTotals).sort((a, b) => b[1] - a[1]).map(([dept, amount]) => {
              const pct = totalGross > 0 ? Math.round((amount / totalGross) * 100) : 0
              return (
                <div key={dept} className="group">
                  <div className="flex items-center justify-between mb-1.5 text-sm">
                    <span className="font-medium text-slate-700">{dept}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-mono-data">{pct}%</span>
                      <span className="font-semibold text-slate-800 text-xs font-mono-data px-2 py-0.5 rounded bg-slate-100">{fmt(amount)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full transition-all duration-300 group-hover:brightness-110" style={{ width: totalGross > 0 ? `${(amount / totalGross) * 100}%` : '0%' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}


