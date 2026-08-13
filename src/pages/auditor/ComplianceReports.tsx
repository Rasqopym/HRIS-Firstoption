import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const fmt = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')

interface TaxRemittance {
  id: string
  period_label: string
  tax_type: string
  amount: number
  status: 'pending' | 'remitted'
  remitted_date: string | null
}

export default function ComplianceReports() {
  const [remittances, setRemittances] = useState<TaxRemittance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchRemittances = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('tax_remittances')
          .select(`
            id,
            amount,
            status,
            remitted_date,
            tax_type,
            payroll_periods (period_label)
          `)
          .order('created_at', { ascending: false })
          .limit(100)

        if (error) throw error

        const formatted: TaxRemittance[] = (data || []).map(r => ({
          id: r.id,
          period_label: (r.payroll_periods as any)?.[0]?.period_label || (r.payroll_periods as any)?.period_label || 'August 2026',
          tax_type: r.tax_type,
          amount: r.amount,
          status: r.status as 'pending' | 'remitted',
          remitted_date: r.remitted_date
        }))

        setRemittances(formatted)
      } catch (err) {
        console.error('Error fetching compliance data:', err)
        setError('Failed to load compliance reports')
      } finally {
        setLoading(false)
      }
    }

    fetchRemittances()
  }, [])

  const pendingCount = remittances.filter(r => r.status === 'pending').length
  const remittedCount = remittances.filter(r => r.status === 'remitted').length
  const totalPendingAmount = remittances.filter(r => r.status === 'pending').reduce((sum, r) => sum + r.amount, 0)

  if (loading) {
    return (
      <div className="p-6 anim-fade-up">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">Compliance Reports</h2>
          <p className="text-sm text-slate-500">Tax remittance compliance tracking (read-only)</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span className="text-amber-700 text-xs font-medium">View Only</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="text-xs text-slate-500 mb-1">Total Items</div>
          <div className="font-display font-bold text-2xl text-slate-800">{remittances.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">All periods</div>
        </div>
        <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-5">
          <div className="text-xs text-slate-500 mb-1">Pending Remittance</div>
          <div className="font-display font-bold text-2xl text-amber-600">{pendingCount}</div>
          <div className="text-xs text-slate-400 mt-0.5">Awaiting payment</div>
        </div>
        <div className="bg-white rounded-xl border border-emerald-100 shadow-sm p-5">
          <div className="text-xs text-slate-500 mb-1">Remitted</div>
          <div className="font-display font-bold text-2xl text-emerald-600">{remittedCount}</div>
          <div className="text-xs text-slate-400 mt-0.5">Successfully paid</div>
        </div>
      </div>

      {/* Outstanding amount alert */}
      {pendingCount > 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            <span className="text-amber-800 text-sm font-medium">
              {pendingCount} outstanding remittance(s) totaling {fmt(totalPendingAmount)} require attention
            </span>
          </div>
        </div>
      )}

      {/* Remittance table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tax Type</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Remitted Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {remittances.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <div className="flex justify-center mb-3">
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                          <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
                        </svg>
                      </div>
                    </div>
                    <div className="text-slate-500 font-medium">No compliance data found</div>
                    <div className="text-slate-400 text-sm">Run payroll to generate tax remittance data</div>
                  </td>
                </tr>
              ) : remittances.map(r => (
                <tr key={r.id} className="table-row-hover">
                  <td className="py-3.5 px-4 text-slate-700">{r.period_label}</td>
                  <td className="py-3.5 px-4">
                    <span className="capitalize text-slate-700">{r.tax_type}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono-data text-slate-700">{fmt(r.amount)}</td>
                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      r.status === 'remitted' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">
                    {r.remitted_date ? new Date(r.remitted_date).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
