import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface AuditFlag {
  id: string
  audit_log_id: string
  flagged_by_name: string
  comment: string
  status: 'open' | 'resolved'
  resolved_at: string | null
  resolved_by_name: string | null
  created_at: string
  audit_log: {
    actor_name: string
    actor_role: string
    action: string
    entity: string
    details: string
    created_at: string
  }[]
}

export default function FlagsComments() {
  const [flags, setFlags] = useState<AuditFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'resolved'>('all')
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchFlags = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('audit_flags')
          .select(`
            id, audit_log_id, flagged_by_name, comment, status, resolved_at, resolved_by_name, created_at,
            audit_log (actor_name, actor_role, action, entity, details, created_at)
          `)
          .order('audit_flags.created_at', { ascending: false })

        if (error) throw error
        setFlags(data || [])
      } catch (err) {
        console.error('Error fetching flags:', err)
        setError('Failed to load flags')
      } finally {
        setLoading(false)
      }
    }

    fetchFlags()
  }, [])

  const handleResolve = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      const { error } = await supabase
        .from('audit_flags')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by_name: profile?.full_name || 'Unknown'
        })
        .eq('id', id)

      if (error) throw error

      setFlags(prev => prev.map(f => 
        f.id === id 
          ? { ...f, status: 'resolved', resolved_at: new Date().toISOString(), resolved_by_name: profile?.full_name || 'Unknown' }
          : f
      ))
    } catch (err) {
      console.error('Error resolving flag:', err)
      setError('Failed to resolve flag')
    }
  }

  const filtered = filterStatus === 'all' 
    ? flags 
    : flags.filter(f => f.status === filterStatus)

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
          <h2 className="font-display font-semibold text-slate-800 text-xl">Flags & Comments</h2>
          <p className="text-sm text-slate-500">Auditor flags and resolution tracking</p>
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as 'all' | 'open' | 'resolved')}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none bg-white focus:border-blue-400"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Flagged By</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Original Action</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Comment</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Resolved By</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex justify-center mb-3">
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                          <line x1="4" y1="22" x2="4" y2="15"/>
                        </svg>
                      </div>
                    </div>
                    <div className="text-slate-500 font-medium">No audit flags recorded</div>
                    <div className="text-slate-400 text-sm">Flagged entries will appear here</div>
                  </td>
                </tr>
              ) : filtered.map(flag => (
                <tr key={flag.id} className="table-row-hover">
                  <td className="py-3.5 px-4 font-mono-data text-slate-500 whitespace-nowrap text-xs">
                    {new Date(flag.created_at).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-medium text-slate-800 text-sm">{flag.flagged_by_name}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="text-xs text-slate-500">
                      <span className="font-medium">{flag.audit_log?.[0]?.action}</span> on {flag.audit_log?.[0]?.entity}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      by {flag.audit_log?.[0]?.actor_name} ({flag.audit_log?.[0]?.actor_role})
                    </div>
                    <div className="text-xs text-slate-400 truncate max-w-xs mt-0.5">
                      {flag.audit_log?.[0]?.details}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-sm text-slate-600 max-w-xs">{flag.comment}</td>
                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      flag.status === 'resolved' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {flag.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-500">
                    {flag.resolved_by_name ? (
                      <div>{flag.resolved_by_name}</div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    {flag.resolved_at && (
                      <div className="text-slate-400 mt-0.5">
                        {new Date(flag.resolved_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {flag.status === 'open' && (
                      <button
                        onClick={() => handleResolve(flag.id)}
                        className="px-2 py-1 text-xs rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        Mark Resolved
                      </button>
                    )}
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
