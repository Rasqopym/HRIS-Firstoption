import { useState, useEffect } from 'react'
import type { Page } from '../../types'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../hooks/useCurrentStaff'
import { getInitials, getAvatarColor } from '../../lib/avatarUtils'

interface Props { onNavigate: (p: Page) => void }

const fmt = (n: number) => `₦${n.toLocaleString()}`

interface Payslip {
  month: string
  net: number
  gross: number
  status: string
}

export default function SelfServiceDashboard({ onNavigate }: Props) {
  const { staff, loading: staffLoading, error: staffError } = useCurrentStaff()
  const [profile, setProfile] = useState<any>(null)
  const [recentPayslips, setRecentPayslips] = useState<Payslip[]>([])
  const [currentPayroll, setCurrentPayroll] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!staff) {
        setLoading(false)
        return
      }

      try {
        // Initialize profile with email and phone from staff.profiles
        setProfile({
          email: staff.profiles?.email || '—',
          phone: staff.profiles?.phone || '—',
        })

        // Fetch most recent payslips
        const { data: payslipsData } = await supabase
          .from('payslips')
          .select('*, period:period_id (period_label)')
          .eq('staff_id', staff.id)
          .in('status', ['processed', 'paid'])
          .order('created_at', { ascending: false })
          .limit(3)

        console.log('Raw payslip full shape:', JSON.stringify(payslipsData?.[0], null, 2))

        if (payslipsData && payslipsData.length > 0) {
          const formattedPayslips = payslipsData.map((p: any) => ({
            month: (p.period as any)?.period_label || 'Unknown',
            net: p.net_pay,
            gross: p.gross_earnings,
            status: p.status,
          }))
          setRecentPayslips(formattedPayslips)
          setCurrentPayroll(payslipsData[0])
        }

        // Fetch staff bank details
        const { data: staffWithBank } = await supabase
          .from('staff')
          .select('bank_name, account_number')
          .eq('id', staff.id)
          .single()

        if (staffWithBank) {
          setProfile((prev: any) => ({ ...prev, ...staffWithBank }))
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [staff])

  if (staffLoading || loading) {
    return (
      <div className="p-6 anim-fade-up">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  if (staffError || !staff) {
    return (
      <div className="p-6 anim-fade-up">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <div className="text-red-600 font-medium">{staffError || 'No staff record found'}</div>
          <div className="text-red-500 text-sm mt-1">Please contact HR to set up your staff profile.</div>
        </div>
      </div>
    )
  }

  const s = staff
  const deptName = s.departments?.name || 'Unassigned'

  return (
    <div className="p-6 anim-fade-up">
      {/* Welcome banner */}
      <div className="rounded-2xl overflow-hidden mb-6 shadow-md border border-slate-800/50" style={{ background: 'linear-gradient(135deg, #0a1f3c 0%, #1e3a5f 60%, #1d4ed8 100%)' }}>
        <div className="px-6 py-6 flex items-center gap-5">
          {(s.photo_url || s.profiles?.photo_url) ? (
            <img src={s.photo_url || s.profiles?.photo_url} alt={s.full_name} className="w-16 h-16 rounded-xl object-cover ring-4 ring-white/20 shadow-sm flex-none" />
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex-none flex items-center justify-center text-white text-xl font-bold ring-4 ring-white/20 shadow-sm"
              style={{ backgroundColor: getAvatarColor(s.full_name) }}
            >
              {getInitials(s.full_name)}
            </div>
          )}
          <div className="flex-1">
            <p className="text-blue-300 text-xs uppercase tracking-wider font-semibold">Staff Self-Service</p>
            <h2 className="font-display font-bold text-white text-2xl tracking-tight">{s.full_name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-blue-100 text-sm font-medium">{s.job_title || '—'}</span>
              <span className="text-blue-400">·</span>
              <span className="text-blue-200 text-sm">{deptName}</span>
              <span className="text-blue-400">·</span>
              <span className="text-blue-300/80 font-mono-data text-xs bg-white/10 px-2 py-0.5 rounded">{s.staff_code || '—'}</span>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-blue-300 text-xs font-medium">Employment Date</div>
            <div className="text-white font-mono-data text-sm font-semibold">{s.date_employed?.slice(0, 10) || '—'}</div>
          </div>
        </div>
        <div className="px-6 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-white/10 pt-4 bg-black/10">
          {[
            { label: 'Monthly Net Pay', value: currentPayroll ? fmt(currentPayroll.net_pay) : '—', color: 'text-emerald-300' },
            { label: 'Gross Earnings', value: currentPayroll ? fmt(currentPayroll.gross_earnings) : '—', color: 'text-white' },
            { label: 'PAYE Tax Deduction', value: currentPayroll ? fmt(currentPayroll.paye_tax) : '—', color: 'text-blue-200' },
          ].map(c => (
            <div key={c.label} className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-3 border border-white/10">
              <div className="text-blue-200 text-xs font-medium">{c.label}</div>
              <div className={`font-display font-bold text-lg font-mono-data tracking-tight ${c.color}`}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <h3 className="font-display font-semibold text-slate-800 mb-4">Quick Shortcuts</h3>
          <div className="space-y-2.5">
            {[
              { label: 'View My Payslips', icon: <svg key="payslips" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, page: 'st-payslips' as Page, desc: 'Download monthly pay statements' },
              { label: 'My Profile', icon: <svg key="profile" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, page: 'st-profile' as Page, desc: 'View & update personal info' },
              { label: 'My ID Card', icon: <svg key="idcard" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="10" y2="16"/></svg>, page: 'st-id-card' as Page, desc: 'Download digital staff ID card' },
            ].map(a => (
              <button
                key={a.label}
                onClick={() => onNavigate(a.page)}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-slate-50 border border-slate-100 hover:border-blue-200 transition-all card-hover text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-none group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{a.label}</div>
                  <div className="text-xs text-slate-500 truncate">{a.desc}</div>
                </div>
                <svg className="text-slate-300 group-hover:text-blue-600 transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
        </div>

        {/* Recent payslips */}
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-800">Recent Payslips</h3>
            <button onClick={() => onNavigate('st-payslips')} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">View all</button>
          </div>
          <div className="space-y-3">
            {recentPayslips.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No payslips available yet</div>
            ) : (
              recentPayslips.map(p => (
                <div key={p.month} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 border border-slate-100 transition-all cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100/80 flex items-center justify-center text-blue-600">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{p.month}</div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{p.status}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-data font-bold text-slate-800 text-sm">{fmt(p.net)}</div>
                    <div className="text-[11px] text-slate-400 font-medium">Net pay</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* My profile summary */}
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-800">My Info Summary</h3>
            <button onClick={() => onNavigate('st-profile')} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">Edit</button>
          </div>
          <dl className="space-y-3">
            {[
              { l: 'Email', v: profile?.email || '—' },
              { l: 'Phone', v: profile?.phone || '—' },
              { l: 'Department', v: deptName },
              { l: 'Bank', v: profile?.bank_name || '—' },
              { l: 'Account No.', v: profile?.account_number || '—', mono: true },
            ].map(f => (
              <div key={f.l} className="flex justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                <dt className="text-slate-500 font-medium">{f.l}</dt>
                <dd className={`text-slate-800 font-medium ${f.mono ? 'font-mono-data' : ''}`}>{f.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Responsive note */}
      <div className="mt-5 p-4 rounded-xl border border-blue-100 bg-blue-50/60 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-none mt-0.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-blue-900">Protected Self-Service Session</div>
            <p className="text-xs text-blue-700/80 mt-0.5 leading-relaxed">
              Your personal records are protected with row-level security. If you notice any discrepancies in your salary or personal details, please contact HR.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
