import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts'

const fmt = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')

interface PayrollPeriod {
  id: string
  period_label: string
  start_date: string
  end_date: string
}

interface PeriodCost {
  period: string
  totalGross: number
  totalNet: number
  totalPAYE: number
  totalPension: number
  totalNHF: number
  headcount: number
}

interface DeptCost {
  department: string
  totalCost: number
}

interface TaxRemittance {
  id: string
  period_label: string
  tax_type: string
  amount: number
  status: 'pending' | 'remitted'
  remitted_date: string | null
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function FinancialReports() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periodCosts, setPeriodCosts] = useState<PeriodCost[]>([])
  const [deptCosts, setDeptCosts] = useState<DeptCost[]>([])
  const [taxRemittances, setTaxRemittances] = useState<TaxRemittance[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'pending'>('all')
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch all payroll periods with processed/paid payslips
        const { data: periodsData } = await supabase
          .from('payroll_periods')
          .select('id, period_label, start_date, end_date')
          .order('start_date', { ascending: true })

        if (!periodsData || periodsData.length === 0) {
          setPeriodCosts([])
          setDeptCosts([])
          setTaxRemittances([])
          setPeriods([])
          setLoading(false)
          return
        }

        setPeriods(periodsData)
        const periodIds = periodsData.map(p => p.id)

        // Fetch payslips for all periods
        const { data: payslips } = await supabase
          .from('payslips')
          .select(`
            id,
            period_id,
            gross_earnings,
            net_pay,
            paye_tax,
            staff:staff_id (
              id,
              staff_code,
              full_name,
              departments (name)
            )
          `)
          .in('period_id', periodIds)
          .in('status', ['processed', 'paid'])

        if (!payslips || payslips.length === 0) {
          setPeriodCosts([])
          setDeptCosts([])
          setTaxRemittances([])
          setPeriods(periodsData)
          setLoading(false)
          return
        }

        // Get salary components for pension/NHF identification
        const { data: salaryComponents } = await supabase
          .from('salary_components')
          .select('id, name')

        const pensionCompIds = salaryComponents
          ?.filter(c => c.name.toLowerCase().includes('pension'))
          .map(c => c.id) || []
        const nhfCompIds = salaryComponents
          ?.filter(c => c.name.toLowerCase().includes('nhf'))
          .map(c => c.id) || []

        // Get line items for pension/NHF
        const payslipIds = payslips.map(p => p.id)
        const { data: lineItems } = await supabase
          .from('payslip_line_items')
          .select('payslip_id, component_id, amount')
          .in('payslip_id', payslipIds)
          .in('component_id', [...pensionCompIds, ...nhfCompIds])

        // Build period costs
        const periodMap = new Map<string, PeriodCost>()
        for (const period of periodsData) {
          periodMap.set(period.id, {
            period: period.period_label,
            totalGross: 0,
            totalNet: 0,
            totalPAYE: 0,
            totalPension: 0,
            totalNHF: 0,
            headcount: 0
          })
        }

        for (const payslip of payslips) {
          const periodCost = periodMap.get(payslip.period_id)
          if (!periodCost) continue

          periodCost.totalGross += payslip.gross_earnings
          periodCost.totalNet += payslip.net_pay
          periodCost.totalPAYE += payslip.paye_tax
          periodCost.headcount += 1

          // Calculate pension/NHF for this payslip
          const staffPension = lineItems
            ?.filter(li => li.payslip_id === payslip.id && pensionCompIds.includes(li.component_id))
            .reduce((sum, li) => sum + li.amount, 0) || 0
          const staffNHF = lineItems
            ?.filter(li => li.payslip_id === payslip.id && nhfCompIds.includes(li.component_id))
            .reduce((sum, li) => sum + li.amount, 0) || 0

          periodCost.totalPension += staffPension
          periodCost.totalNHF += staffNHF
        }

        setPeriodCosts(Array.from(periodMap.values()))

        // Set default selected period to most recent
        const mostRecentPeriod = periodsData[periodsData.length - 1]
        setSelectedPeriod(mostRecentPeriod.id)

        // Calculate department costs for most recent period
        const selectedPeriodPayslips = payslips.filter(p => p.period_id === mostRecentPeriod.id)
        const selectedDeptMap = new Map<string, number>()
        for (const payslip of selectedPeriodPayslips) {
          const dept = payslip.staff.departments?.name || 'Unassigned'
          selectedDeptMap.set(dept, (selectedDeptMap.get(dept) || 0) + payslip.gross_earnings)
        }
        setDeptCosts(Array.from(selectedDeptMap.entries()).map(([dept, cost]) => ({ department: dept, totalCost: cost })))

        // Fetch tax remittances
        const { data: remittances } = await supabase
          .from('tax_remittances')
          .select(`
            id,
            tax_type,
            amount,
            status,
            remitted_date,
            payroll_periods (period_label)
          `)
          .in('period_id', periodIds)

        const formattedRemittances: TaxRemittance[] = (remittances || []).map(r => ({
          id: r.id,
          period_label: r.payroll_periods?.period_label || 'Unknown',
          tax_type: r.tax_type,
          amount: r.amount,
          status: r.status as 'pending' | 'remitted',
          remitted_date: r.remitted_date
        }))

        setTaxRemittances(formattedRemittances)

      } catch (err) {
        console.error('Error fetching financial reports data:', err)
        setError('Failed to load financial reports data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Update department costs when selected period changes
  useEffect(() => {
    if (!selectedPeriod || periodCosts.length === 0) return

    const updateDeptCosts = async () => {
      const { data: payslips } = await supabase
        .from('payslips')
        .select(`
          id,
          gross_earnings,
          staff:staff_id (
            departments (name)
          )
        `)
        .eq('period_id', selectedPeriod)
        .in('status', ['processed', 'paid'])

      if (!payslips) return

      const deptMap = new Map<string, number>()
      for (const payslip of payslips) {
        const dept = payslip.staff.departments?.name || 'Unassigned'
        deptMap.set(dept, (deptMap.get(dept) || 0) + payslip.gross_earnings)
      }

      setDeptCosts(Array.from(deptMap.entries()).map(([dept, cost]) => ({ department: dept, totalCost: cost })))
    }

    updateDeptCosts()
  }, [selectedPeriod])

  const filteredRemittances = complianceFilter === 'pending'
    ? taxRemittances.filter(r => r.status === 'pending')
    : taxRemittances

  const allTimeTotals = periodCosts.reduce((acc, p) => ({
    totalGross: acc.totalGross + p.totalGross,
    totalNet: acc.totalNet + p.totalNet,
    totalPAYE: acc.totalPAYE + p.totalPAYE,
    totalPension: acc.totalPension + p.totalPension,
    totalNHF: acc.totalNHF + p.totalNHF
  }), { totalGross: 0, totalNet: 0, totalPAYE: 0, totalPension: 0, totalNHF: 0 })

  if (loading) return <div className="p-6 text-center text-slate-500">Loading financial reports...</div>
  if (error) return <div className="p-6 text-center text-red-500">{error}</div>

  return (
    <div className="p-6 anim-fade-up">
      <div className="mb-6">
        <h2 className="font-display font-semibold text-slate-800 text-xl">Financial Reports</h2>
        <p className="text-sm text-slate-500">Payroll cost overview and compliance tracking</p>
      </div>

      {periodCosts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-500">
          No payroll data found. Run payroll to generate financial reports.
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">Total Gross Paid</div>
              <div className="font-display font-bold text-2xl text-slate-800 font-mono-data">{fmt(allTimeTotals.totalGross)}</div>
              <div className="text-xs text-slate-400 mt-0.5">All time</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">Total Net Paid</div>
              <div className="font-display font-bold text-2xl text-emerald-600 font-mono-data">{fmt(allTimeTotals.totalNet)}</div>
              <div className="text-xs text-slate-400 mt-0.5">All time</div>
            </div>
            <div className="bg-white rounded-xl border border-red-100 shadow-sm p-5">
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">Total PAYE</div>
              <div className="font-display font-bold text-2xl text-red-600 font-mono-data">{fmt(allTimeTotals.totalPAYE)}</div>
              <div className="text-xs text-slate-400 mt-0.5">All time</div>
            </div>
            <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5">
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">Total Pension</div>
              <div className="font-display font-bold text-2xl text-blue-600 font-mono-data">{fmt(allTimeTotals.totalPension)}</div>
              <div className="text-xs text-slate-400 mt-0.5">All time</div>
            </div>
            <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-5">
              <div className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">Total NHF</div>
              <div className="font-display font-bold text-2xl text-amber-600 font-mono-data">{fmt(allTimeTotals.totalNHF)}</div>
              <div className="text-xs text-slate-400 mt-0.5">All time</div>
            </div>
          </div>

          {/* Payroll Cost Trend */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-6">
            <h3 className="font-display font-semibold text-slate-700 text-sm mb-4">Payroll Cost Trend</h3>
            {periodCosts.length === 1 ? (
              <div className="text-center text-slate-500 py-8">
                Single period data point: {periodCosts[0].period} — {fmt(periodCosts[0].totalGross)}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={periodCosts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => '₦' + (v / 1000000).toFixed(1) + 'M'} />
                  <Tooltip 
                    formatter={(value: number) => fmt(value)}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="totalGross" stroke="#3b82f6" strokeWidth={2} name="Gross Payroll" />
                  <Line type="monotone" dataKey="totalNet" stroke="#10b981" strokeWidth={2} name="Net Payroll" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Headcount Trend */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-6">
            <h3 className="font-display font-semibold text-slate-700 text-sm mb-4">Headcount Trend (Paid Staff)</h3>
            {periodCosts.length === 1 ? (
              <div className="text-center text-slate-500 py-8">
                Single period: {periodCosts[0].headcount} staff paid
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={periodCosts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    formatter={(value: number) => value.toString()}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Bar dataKey="headcount" fill="#8b5cf6" name="Staff Count" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Department Breakdown */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-slate-700 text-sm">Department Breakdown</h3>
              <select 
                value={selectedPeriod || ''}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
              >
                {periods.map(p => <option key={p.id} value={p.id}>{p.period_label}</option>)}
              </select>
            </div>
            {deptCosts.length === 0 ? (
              <div className="text-center text-slate-500 py-8">No department data for selected period</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deptCosts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" fontSize={12} tickFormatter={(v) => '₦' + (v / 1000).toFixed(0) + 'k'} />
                  <YAxis type="category" dataKey="department" stroke="#64748b" fontSize={12} width={120} />
                  <Tooltip 
                    formatter={(value: number) => fmt(value)}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Bar dataKey="totalCost" fill="#f59e0b" name="Total Cost" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Compliance Tracking */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-slate-700 text-sm">Compliance Tracking</h3>
              <select 
                value={complianceFilter}
                onChange={(e) => setComplianceFilter(e.target.value as 'all' | 'pending')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
              >
                <option value="all">All Items</option>
                <option value="pending">Pending Only</option>
              </select>
            </div>
            {filteredRemittances.length === 0 ? (
              <div className="text-center text-slate-500 py-8">
                {complianceFilter === 'pending' ? 'No pending items' : 'No compliance data found'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Period</th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Tax Type</th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Amount</th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Remitted Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredRemittances.map(r => (
                      <tr key={r.id} className="table-row-hover">
                        <td className="py-3 px-3 text-slate-700">{r.period_label}</td>
                        <td className="py-3 px-3 text-slate-700 capitalize">{r.tax_type}</td>
                        <td className="py-3 px-3 font-mono-data text-slate-700">{fmt(r.amount)}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${
                            r.status === 'remitted' 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {r.status === 'remitted' ? 'Remitted' : 'Pending'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {r.remitted_date ? new Date(r.remitted_date).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
