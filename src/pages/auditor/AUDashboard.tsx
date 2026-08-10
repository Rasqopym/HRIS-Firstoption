import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Page } from '../../types'

interface Props { onNavigate: (p: Page) => void }

export default function AUDashboard({ onNavigate }: Props) {
  const [totalEntries, setTotalEntries] = useState(0)
  const [highSeverity, setHighSeverity] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [openFlags, setOpenFlags] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        
        // Get total entries
        const { count } = await supabase
          .from('audit_log')
          .select('*', { count: 'exact', head: true })
        setTotalEntries(count || 0)

        // Get high severity count
        const { count: highCount } = await supabase
          .from('audit_log')
          .select('*', { count: 'exact', head: true })
          .eq('severity', 'high')
        setHighSeverity(highCount || 0)

        // Get today's count
        const today = new Date().toISOString().slice(0, 10)
        const { count: todayCountData } = await supabase
          .from('audit_log')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', today)
        setTodayCount(todayCountData || 0)

        // Get open flags count
        const { count: flagsCount } = await supabase
          .from('audit_flags')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open')
        setOpenFlags(flagsCount || 0)

      } catch (err) {
        console.error('Error fetching dashboard stats:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

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
    <div className="p-6 space-y-5 anim-fade-up">
      <div>
        <h2 className="font-display font-semibold text-slate-800 text-xl">Audit & Compliance Overview</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-slate-500 text-sm">System Compliance Monitoring</span>
          <span className="px-2.5 py-0.5 rounded-full bg-amber-100/80 text-amber-800 text-xs font-semibold border border-amber-200/60">View Only Mode</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { 
            l: 'Total Log Entries', v: totalEntries, sub: 'All system actions logged', 
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            ),
            bgClass: 'bg-blue-50/80', iconClass: 'text-blue-600', border: 'border-blue-100'
          },
          { 
            l: 'High Severity Events', v: highSeverity, sub: 'Require auditor review', 
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4"/><path d="M12 17h.01"/>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              </svg>
            ),
            bgClass: 'bg-red-50/80', iconClass: 'text-red-600', border: 'border-red-100'
          },
          { 
            l: "Today's Activity", v: todayCount, sub: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
              </svg>
            ),
            bgClass: 'bg-emerald-50/80', iconClass: 'text-emerald-600', border: 'border-emerald-100'
          },
          { 
            l: 'Open Audit Flags', v: openFlags, sub: 'Awaiting resolution', 
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                <line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
            ),
            bgClass: 'bg-amber-50/80', iconClass: 'text-amber-600', border: 'border-amber-100'
          },
        ].map(k => (
          <div key={k.l} className={`bg-white rounded-xl border ${k.border} shadow-sm p-5 card-hover flex flex-col justify-between`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{k.l}</span>
              <div className={`w-10 h-10 rounded-lg ${k.bgClass} flex items-center justify-center ${k.iconClass}`}>
                {k.icon}
              </div>
            </div>
            <div>
              <div className="font-display font-bold text-2xl text-slate-800 tracking-tight">{k.v}</div>
              <div className="text-xs text-slate-400 mt-1 font-medium">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-slate-800 text-base">Auditor Tools</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <button
            onClick={() => onNavigate('au-audit')}
            className="flex items-center gap-3.5 p-4 rounded-xl border border-slate-200/80 hover:border-blue-200 bg-white hover:bg-slate-50/80 transition-all text-left card-hover group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-none group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 text-sm">System Audit Trail</div>
              <div className="text-xs text-slate-500 truncate">Browse all tamper-evident system logs</div>
            </div>
          </button>
          <button
            onClick={() => onNavigate('au-flags')}
            className="flex items-center gap-3.5 p-4 rounded-xl border border-slate-200/80 hover:border-amber-200 bg-white hover:bg-slate-50/80 transition-all text-left card-hover group"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-none group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 text-sm">Flags & Exception Comments</div>
              <div className="text-xs text-slate-500 truncate">{openFlags} open flag{openFlags !== 1 ? 's' : ''} awaiting review</div>
            </div>
          </button>
          <button
            onClick={() => onNavigate('au-compliance')}
            className="flex items-center gap-3.5 p-4 rounded-xl border border-slate-200/80 hover:border-emerald-200 bg-white hover:bg-slate-50/80 transition-all text-left card-hover group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-none group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 text-sm">Compliance & Tax Reports</div>
              <div className="text-xs text-slate-500 truncate">Tax remittance & statutory verification</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
