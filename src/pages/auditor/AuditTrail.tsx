import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { AuditEntry } from '../../types'

type ActionFilter = 'all' | AuditEntry['action']
type SeverityFilter = 'all' | AuditEntry['severity']

const actionColors: Record<AuditEntry['action'], string> = {
  CREATE: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-slate-100 text-slate-600',
  EXPORT: 'bg-violet-100 text-violet-700',
  VIEW: 'bg-slate-100 text-slate-500',
}

const severityColors: Record<AuditEntry['severity'], string> = {
  low: 'bg-slate-100 text-slate-500',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
}

const severityDot: Record<AuditEntry['severity'], string> = {
  low: 'bg-slate-400',
  medium: 'bg-amber-500',
  high: 'bg-red-500',
}

const PAGE_SIZE = 50

export default function AuditTrail() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState<ActionFilter>('all')
  const [filterSeverity, setFilterSeverity] = useState<SeverityFilter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [flagModal, setFlagModal] = useState<AuditEntry | null>(null)
  const [flagNote, setFlagNote] = useState('')
  const [flagging, setFlagging] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        setLoading(true)
        
        // Get total count for pagination
        const { count } = await supabase
          .from('audit_log')
          .select('*', { count: 'exact', head: true })
        setTotalCount(count || 0)

        // Fetch paginated logs with flag status
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        
        const { data, error } = await supabase
          .from('audit_log')
          .select(`
            id, actor_name, actor_role, action, entity, entity_id, details, severity, metadata, created_at,
            audit_flags (id, status)
          `)
          .order('created_at', { ascending: false })
          .range(from, to)

        if (error) throw error

        const mappedLogs: AuditEntry[] = data?.map(log => ({
          id: log.id,
          user: log.actor_name,
          role: log.actor_role,
          action: log.action,
          entity: log.entity,
          entityId: log.entity_id || '',
          timestamp: log.created_at,
          details: log.details,
          before: log.metadata ? JSON.stringify(log.metadata, null, 2) : '',
          after: '',
          severity: log.severity,
          hasFlag: (log.audit_flags?.length || 0) > 0,
        })) ?? []

        setLogs(mappedLogs)
      } catch (err) {
        console.error('Error fetching audit logs:', err)
        setError('Failed to load audit logs')
      } finally {
        setLoading(false)
      }
    }

    fetchAuditLogs()
  }, [page])

  const filtered = logs.filter(e => {
    const q = search.toLowerCase()
    if (q && !e.user.toLowerCase().includes(q) && !e.entity.toLowerCase().includes(q) && !e.details.toLowerCase().includes(q)) return false
    if (filterAction !== 'all' && e.action !== filterAction) return false
    if (filterSeverity !== 'all' && e.severity !== filterSeverity) return false
    return true
  })

  const handleFlag = async () => {
    if (!flagModal) return
    setFlagging(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      let userName = 'Admin'

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.full_name) userName = profile.full_name
      }

      const { error: insertError } = await supabase
        .from('audit_flags')
        .insert({
          audit_log_id: flagModal.id,
          flagged_by: user?.id || null,
          flagged_by_name: userName,
          comment: flagNote || 'Flagged for audit review',
          status: 'open'
        })

      if (insertError) throw insertError

      setFlagModal(null)
      setFlagNote('')
    } catch (err: any) {
      setError('Failed to flag entry: ' + (err.message || 'Error'))
      console.error('Error flagging entry:', err)
    } finally {
      setFlagging(false)
    }
  }

  // Compute stats from real data
  const today = new Date().toISOString().slice(0, 10)
  const highSeverity = logs.filter(e => e.severity === 'high').length
  const todayCount = logs.filter(e => e.timestamp.startsWith(today)).length

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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">Audit Trail</h2>
          <p className="text-sm text-slate-500">Tamper-evident log of all system actions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span className="text-amber-700 text-xs font-medium">View Only</span>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Log
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total Entries', value: totalCount, sub: 'All time' },
          { label: 'High Severity', value: highSeverity, sub: 'Require review', color: 'text-red-600' },
          { label: 'Open Flags', value: logs.filter(e => e.hasFlag).length, sub: 'Flagged by auditor', color: 'text-amber-600' },
          { label: 'Today', value: todayCount, sub: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">{c.label}</div>
            <div className={`font-display font-bold text-2xl ${c.color || 'text-slate-800'}`}>{c.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 w-64"
          />
        </div>
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value as ActionFilter)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none bg-white focus:border-blue-400"
        >
          <option value="all">All Actions</option>
          {(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'VIEW'] as AuditEntry['action'][]).map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={filterSeverity}
          onChange={e => setFilterSeverity(e.target.value as SeverityFilter)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none bg-white focus:border-blue-400"
        >
          <option value="all">All Severity</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} entries</span>
      </div>

      {/* Log table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-4"></th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Timestamp</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Entity</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Details</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Severity</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex justify-center mb-3">
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                        </svg>
                      </div>
                    </div>
                    <div className="text-slate-500 font-medium">No audit logs found</div>
                    <div className="text-slate-400 text-sm">Actions will appear here as users interact with the system</div>
                  </td>
                </tr>
              ) : filtered.map(e => (
                <>
                  <tr
                    key={e.id}
                    className="table-row-hover cursor-pointer"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <td className="py-3.5 px-4">
                      <span className={`inline-block w-2 h-2 rounded-full ${severityDot[e.severity]}`} />
                    </td>
                    <td className="py-3.5 px-4 font-mono-data text-slate-500 whitespace-nowrap text-xs">{e.timestamp}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800 text-sm">{e.user}</div>
                      <div className="text-xs text-slate-400">{e.role}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium font-mono-data ${actionColors[e.action]}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-sm text-slate-700">{e.entity}</div>
                      <div className="text-xs font-mono-data text-slate-400">{e.entityId}</div>
                    </td>
                    <td className="py-3.5 px-4 text-sm text-slate-600 max-w-xs truncate">{e.details}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${severityColors[e.severity]}`}>
                        {e.severity}
                      </span>
                    </td>
                    <td className="py-3.5 px-4" onClick={evt => evt.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {e.hasFlag ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Flagged
                          </span>
                        ) : (
                          <button
                            onClick={() => setFlagModal(e)}
                            className="px-2 py-1 text-xs rounded text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Flag this entry"
                          >
                            Flag
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === e.id && e.before && (
                    <tr key={`${e.id}-detail`}>
                      <td colSpan={8} className="px-4 pb-3">
                        <div className="ml-10 p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-xs">
                            <div className="font-semibold text-slate-600 mb-1 uppercase tracking-wide">Metadata</div>
                            <pre className="font-mono-data text-slate-600 bg-white px-3 py-2 rounded text-xs overflow-auto max-h-48">{e.before}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="text-xs text-slate-500">
          Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE)} · {totalCount} total entries
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={(page + 1) * PAGE_SIZE >= totalCount}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>

      {/* Flag modal */}
      {flagModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md anim-fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-display font-semibold text-slate-800">Flag Entry for Review</h3>
                <p className="text-xs text-slate-500 mt-0.5">ID: {flagModal.id} · {flagModal.action} on {flagModal.entity}</p>
              </div>
              <button onClick={() => { setFlagModal(null); setFlagNote('') }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">{flagModal.details}</div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Audit Note / Reason for Flagging *</label>
                <textarea
                  value={flagNote}
                  onChange={e => setFlagNote(e.target.value)}
                  rows={3}
                  placeholder="Describe the issue or anomaly observed..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setFlagModal(null); setFlagNote('') }} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button
                  onClick={handleFlag}
                  disabled={!flagNote.trim() || flagging}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {flagging ? 'Flagging...' : 'Submit Flag'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

