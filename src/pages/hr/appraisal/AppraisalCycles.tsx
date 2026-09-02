import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import type { Page } from '../../../types'

interface Props {
  onNavigate?: (p: Page) => void
}

interface Cycle {
  id: string
  name: string
  start_date: string
  end_date: string
  status: string
  created_at: string
}

interface StaffItem {
  id: string
  full_name: string
  email: string
  staff_code: string
  departments?: { name: string } | null
}

interface Assignment {
  id: string
  cycle_id: string
  employee_id: string
  reviewer_id: string | null
  section: string
  status: string
}

const SECTIONS = ['self', '360', 'kpi', 'supervisor', 'qualitative']
const SECTION_LABELS: Record<string, string> = {
  self: 'Self',
  '360': '360°',
  kpi: 'KPI',
  supervisor: 'Supervisor',
  qualitative: 'Qualitative',
}

const statusColors: Record<string, string> = {
  not_started: 'bg-slate-300',
  in_progress: 'bg-amber-400',
  complete: 'bg-emerald-500',
}

export default function AppraisalCycles({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true)
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [staffList, setStaffList] = useState<StaffItem[]>([])
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editCycle, setEditCycle] = useState<Partial<Cycle> | null>(null)
  const [saving, setSaving] = useState(false)

  // Supervisor assignment state
  const [showAssignSupervisor, setShowAssignSupervisor] = useState<string | null>(null)
  const [supervisorSearch, setSupervisorSearch] = useState('')
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('')

  // Peer reviewer assignment state
  const [showAssignPeers, setShowAssignPeers] = useState<string | null>(null)
  const [checkedPeers, setCheckedPeers] = useState<Set<string>>(new Set())
  const [peerSearch, setPeerSearch] = useState('')
  const [savingPeers, setSavingPeers] = useState(false)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { if (selectedCycleId) fetchAssignments() }, [selectedCycleId])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [{ data: cData }, { data: sData }] = await Promise.all([
        supabase.from('appraisal_cycles').select('*').order('created_at', { ascending: false }),
        supabase.from('staff').select('id, full_name, email, staff_code, department_id, departments(name)').eq('status', 'active'),
      ])
      setCycles(cData || [])
      setStaffList(sData || [])
      if (cData && cData.length > 0 && !selectedCycleId) setSelectedCycleId(cData[0].id)
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAssignments = async () => {
    if (!selectedCycleId) return
    try {
      const { data } = await supabase
        .from('appraisal_assignments')
        .select('*')
        .eq('cycle_id', selectedCycleId)
      setAssignments(data || [])
    } catch (err) {
      console.error('Error fetching assignments:', err)
    }
  }

  const handleSaveCycle = async () => {
    if (!editCycle?.name || !editCycle?.start_date || !editCycle?.end_date) return
    setSaving(true)
    try {
      const payload = {
        name: editCycle.name,
        start_date: editCycle.start_date,
        end_date: editCycle.end_date,
        status: editCycle.status || 'draft',
        updated_at: new Date().toISOString(),
      }
      if (editCycle.id) {
        await supabase.from('appraisal_cycles').update(payload).eq('id', editCycle.id)
      } else {
        await supabase.from('appraisal_cycles').insert(payload)
      }
      setShowModal(false)
      setEditCycle(null)
      fetchAll()
    } catch (err) {
      console.error('Error saving cycle:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleAssignAllStaff = async () => {
    if (!selectedCycleId || staffList.length === 0) return
    setSaving(true)
    try {
      const assignedEmployeeIds = new Set(assignments.map(a => a.employee_id))
      const newAssignments: any[] = []
      for (const staff of staffList) {
        if (assignedEmployeeIds.has(staff.id)) continue
        for (const section of SECTIONS) {
          newAssignments.push({
            cycle_id: selectedCycleId,
            employee_id: staff.id,
            reviewer_id: section === 'self' ? staff.id : null,
            section,
            status: 'not_started',
          })
        }
      }
      if (newAssignments.length > 0) {
        await supabase.from('appraisal_assignments').insert(newAssignments)
      }
      fetchAssignments()
    } catch (err) {
      console.error('Error assigning staff:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleAssignSingleStaff = async (staffId: string) => {
    if (!selectedCycleId) return
    try {
      const existing = assignments.filter(a => a.employee_id === staffId)
      if (existing.length > 0) return
      const rows = SECTIONS.map(section => ({
        cycle_id: selectedCycleId,
        employee_id: staffId,
        reviewer_id: section === 'self' ? staffId : null,
        section,
        status: 'not_started',
      }))
      await supabase.from('appraisal_assignments').insert(rows)
      fetchAssignments()
    } catch (err) {
      console.error('Error assigning staff:', err)
    }
  }

  const handleRemoveStaff = async (staffId: string) => {
    if (!selectedCycleId) return
    try {
      await supabase
        .from('appraisal_assignments')
        .delete()
        .eq('cycle_id', selectedCycleId)
        .eq('employee_id', staffId)
      fetchAssignments()
    } catch (err) {
      console.error('Error removing staff:', err)
    }
  }

  // ── Supervisor assignment ──────────────────────────────────────────
  const getSupervisor = (empId: string): StaffItem | null => {
    const supAssignment = assignments.find(
      a => a.employee_id === empId && a.reviewer_id && a.reviewer_id !== empId && (a.section === 'supervisor' || a.section === 'kpi')
    )
    if (!supAssignment) return null
    return staffList.find(s => s.id === supAssignment.reviewer_id) || null
  }

  const openSupervisorModal = (empId: string) => {
    const current = getSupervisor(empId)
    setSelectedSupervisor(current?.id || '')
    setSupervisorSearch('')
    setShowAssignSupervisor(empId)
  }

  const handleSetSupervisor = async (empId: string) => {
    if (!selectedCycleId) return
    setSaving(true)
    try {
      const current = getSupervisor(empId)
      if (current) {
        // Remove previous supervisor assignments
        await supabase.from('appraisal_assignments').delete()
          .eq('cycle_id', selectedCycleId)
          .eq('employee_id', empId)
          .eq('reviewer_id', current.id)
          .in('section', ['kpi', 'supervisor', 'qualitative'])
      }

      if (selectedSupervisor) {
        // Assign new supervisor for kpi, supervisor, qualitative, and 360
        const rows = ['kpi', 'supervisor', 'qualitative', '360'].map(section => ({
          cycle_id: selectedCycleId,
          employee_id: empId,
          reviewer_id: selectedSupervisor,
          section,
          status: 'not_started',
        }))
        await supabase.from('appraisal_assignments').upsert(rows, {
          onConflict: 'cycle_id,employee_id,reviewer_id,section',
        })
      }

      setShowAssignSupervisor(null)
      fetchAssignments()
    } catch (err) {
      console.error('Error setting supervisor:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveSupervisor = async (empId: string) => {
    if (!selectedCycleId) return
    const current = getSupervisor(empId)
    if (!current) return
    try {
      await supabase.from('appraisal_assignments').delete()
        .eq('cycle_id', selectedCycleId)
        .eq('employee_id', empId)
        .eq('reviewer_id', current.id)
        .in('section', ['kpi', 'supervisor', 'qualitative'])
      fetchAssignments()
    } catch (err) {
      console.error('Error removing supervisor:', err)
    }
  }

  // ── Peer reviewers assignment (360° only) ──────────────────────────
  const getPeerReviewers = (empId: string): StaffItem[] => {
    const supervisor = getSupervisor(empId)
    const peerIds = [...new Set(
      assignments
        .filter(a => a.employee_id === empId && a.reviewer_id && a.reviewer_id !== empId && a.section === '360' && a.reviewer_id !== supervisor?.id)
        .map(a => a.reviewer_id!)
    )]
    return peerIds.map(pid => staffList.find(s => s.id === pid)).filter(Boolean) as StaffItem[]
  }

  const openPeersModal = (empId: string) => {
    const peers = getPeerReviewers(empId)
    setCheckedPeers(new Set(peers.map(p => p.id)))
    setPeerSearch('')
    setShowAssignPeers(empId)
  }

  const handleSavePeerReviewers = async (empId: string) => {
    if (!selectedCycleId) return
    setSavingPeers(true)
    try {
      const supervisor = getSupervisor(empId)
      const currentPeers = new Set(
        assignments
          .filter(a => a.employee_id === empId && a.reviewer_id && a.reviewer_id !== empId && a.section === '360' && a.reviewer_id !== supervisor?.id)
          .map(a => a.reviewer_id!)
      )

      const toAdd = [...checkedPeers].filter(rid => !currentPeers.has(rid) && rid !== supervisor?.id && rid !== empId)
      const toRemove = [...currentPeers].filter(rid => !checkedPeers.has(rid))

      if (toAdd.length > 0) {
        const rows = toAdd.map(rid => ({
          cycle_id: selectedCycleId,
          employee_id: empId,
          reviewer_id: rid,
          section: '360',
          status: 'not_started',
        }))
        await supabase.from('appraisal_assignments').upsert(rows, {
          onConflict: 'cycle_id,employee_id,reviewer_id,section',
        })
      }

      for (const rid of toRemove) {
        await supabase.from('appraisal_assignments').delete()
          .eq('cycle_id', selectedCycleId)
          .eq('employee_id', empId)
          .eq('reviewer_id', rid)
          .eq('section', '360')
      }

      setShowAssignPeers(null)
      fetchAssignments()
    } catch (err) {
      console.error('Error saving peer reviewers:', err)
    } finally {
      setSavingPeers(false)
    }
  }

  const handleRemovePeerReviewer = async (empId: string, reviewerId: string) => {
    if (!selectedCycleId) return
    try {
      await supabase.from('appraisal_assignments').delete()
        .eq('cycle_id', selectedCycleId)
        .eq('employee_id', empId)
        .eq('reviewer_id', reviewerId)
        .eq('section', '360')
      fetchAssignments()
    } catch (err) {
      console.error('Error removing peer reviewer:', err)
    }
  }

  const handleToggleCycleStatus = async (cycleId: string, newStatus: string) => {
    try {
      await supabase.from('appraisal_cycles').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', cycleId)
      fetchAll()
    } catch (err) {
      console.error('Error updating cycle status:', err)
    }
  }

  const selectedCycle = cycles.find(c => c.id === selectedCycleId)
  const assignedEmployeeIds = [...new Set(assignments.map(a => a.employee_id))]
  const unassignedStaff = staffList.filter(s => !assignedEmployeeIds.includes(s.id))

  const getEmployeeSections = (empId: string) => {
    return SECTIONS.map(section => {
      const matches = assignments.filter(a => a.employee_id === empId && a.section === section)
      const isComplete = matches.length > 0 && matches.every(m => m.status === 'complete')
      const isInProgress = matches.some(m => m.status === 'in_progress')
      const status = isComplete ? 'complete' : isInProgress ? 'in_progress' : 'not_started'
      return { section, status }
    })
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-800">Appraisal Cycles</h1>
          <p className="text-sm text-slate-500 mt-1">Create and manage performance appraisal periods, supervisors, and peer reviewers</p>
        </div>
        <button
          onClick={() => { setEditCycle({ status: 'draft' }); setShowModal(true) }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors flex items-center gap-2 self-start sm:self-auto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Cycle
        </button>
      </div>

      {/* Cycles Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">All Cycles</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Start Date</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">End Date</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Staff</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map(c => {
                const isSelected = c.id === selectedCycleId
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCycleId(c.id)}
                    className={`border-b border-slate-50 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/60 font-medium' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <td className="px-4 py-3 text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(c.start_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(c.end_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                        c.status === 'closed' ? 'bg-blue-50 text-blue-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{selectedCycleId === c.id ? assignedEmployeeIds.length : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); setEditCycle(c); setShowModal(true) }}
                          className="text-slate-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        {c.status === 'draft' && (
                          <button
                            onClick={e => { e.stopPropagation(); handleToggleCycleStatus(c.id, 'active') }}
                            className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >Open</button>
                        )}
                        {c.status === 'active' && (
                          <button
                            onClick={e => { e.stopPropagation(); handleToggleCycleStatus(c.id, 'closed') }}
                            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          >Close</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Assignment Panel */}
      {selectedCycle && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                Staff Appraisal Roster — {selectedCycle.name}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {assignedEmployeeIds.length} assigned · {unassignedStaff.length} unassigned
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleAssignAllStaff}
                disabled={saving || unassignedStaff.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Assigning...' : `Assign All Staff (${unassignedStaff.length})`}
              </button>
            </div>
          </div>

          {/* Assigned Employees Table */}
          {assignedEmployeeIds.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Employee</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Code</th>
                    {SECTIONS.map(s => (
                      <th key={s} className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">{SECTION_LABELS[s]}</th>
                    ))}
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Supervisor (KPI & Review)</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Peer Reviewers (360°)</th>
                    <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedEmployeeIds.map(empId => {
                    const staff = staffList.find(s => s.id === empId)
                    if (!staff) return null
                    const sections = getEmployeeSections(empId)
                    const supervisor = getSupervisor(empId)
                    const peerReviewers = getPeerReviewers(empId)

                    return (
                      <tr key={empId} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-3 py-3 font-medium text-slate-800">
                          <div>{staff.full_name}</div>
                          {(staff.departments as any)?.name && (
                            <div className="text-[11px] text-slate-400 font-normal">{(staff.departments as any).name}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-500 font-mono text-xs">{staff.staff_code}</td>
                        {sections.map(s => (
                          <td key={s.section} className="px-3 py-3 text-center">
                            <div className={`w-3 h-3 rounded-full mx-auto ${statusColors[s.status]}`} title={`${SECTION_LABELS[s.section]}: ${s.status.replace('_', ' ')}`} />
                          </td>
                        ))}

                        {/* Supervisor Column */}
                        <td className="px-3 py-3">
                          {supervisor ? (
                            <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200/60 px-2.5 py-1 rounded-lg text-xs font-medium">
                              <span>{supervisor.full_name}</span>
                              <button
                                onClick={() => handleRemoveSupervisor(empId)}
                                className="text-amber-500 hover:text-red-500 transition-colors ml-1"
                                title="Remove supervisor"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => openSupervisorModal(empId)}
                              className="text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 font-medium px-2.5 py-1 rounded-lg transition-colors"
                            >
                              + Assign Supervisor
                            </button>
                          )}
                        </td>

                        {/* Peer Reviewers Column */}
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {peerReviewers.map(r => (
                              <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                                {r.full_name.split(' ')[0]}
                                <button onClick={() => handleRemovePeerReviewer(empId, r.id)}
                                  className="text-slate-400 hover:text-red-500 transition-colors ml-0.5" title="Remove peer reviewer">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              </span>
                            ))}
                            <button
                              onClick={() => openPeersModal(empId)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-0.5 rounded border border-dashed border-blue-300 hover:bg-blue-50 transition-colors"
                            >
                              {peerReviewers.length > 0 ? 'Edit Peers' : '+ Assign Peers'}
                            </button>
                          </div>
                        </td>

                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => onNavigate?.('hr-appraisal-form')}
                              className="text-xs px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium"
                            >Review</button>
                            <button
                              onClick={() => handleRemoveStaff(empId)}
                              className="text-slate-400 hover:text-red-500 transition-colors"
                              title="Remove from cycle"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Unassigned Staff */}
          {unassignedStaff.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-500 mb-3">Unassigned Staff</h3>
              <div className="flex flex-wrap gap-2">
                {unassignedStaff.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleAssignSingleStaff(s.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600 hover:bg-slate-50 hover:border-blue-300 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    {s.full_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section Legend */}
          <div className="flex items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> Not Started</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> In Progress</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Complete</span>
          </div>
        </div>
      )}

      {/* ── Assign Supervisor Modal ── */}
      {showAssignSupervisor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAssignSupervisor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Assign Line Manager / Supervisor</h3>
              <p className="text-sm text-slate-500 mt-1">
                For <strong>{staffList.find(s => s.id === showAssignSupervisor)?.full_name}</strong>
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg mt-2 border border-amber-200/50">
                The supervisor is responsible for evaluating <strong>Role KPIs</strong> (50%), <strong>Supervisor Assessment</strong> (20%), and <strong>Qualitative Feedback</strong>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Select Supervisor</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                value={selectedSupervisor}
                onChange={e => setSelectedSupervisor(e.target.value)}
              >
                <option value="">No Supervisor (Unassigned)</option>
                {staffList.filter(s => s.id !== showAssignSupervisor).map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.staff_code})</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAssignSupervisor(null)}
                className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm transition-colors"
              >Cancel</button>
              <button
                onClick={() => handleSetSupervisor(showAssignSupervisor)}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Supervisor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Peer Reviewers Modal (Multi-Select) ── */}
      {showAssignPeers && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAssignPeers(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">Assign Peer Reviewers</h3>
              <p className="text-sm text-slate-500 mt-1">
                For <strong>{staffList.find(s => s.id === showAssignPeers)?.full_name}</strong>
              </p>
              <p className="text-xs text-blue-700 bg-blue-50 p-2.5 rounded-lg mt-2 border border-blue-200/50">
                Peer reviewers only complete the <strong>360° Behavioural Assessment</strong> (30% weight).
              </p>

              {/* Search */}
              <div className="mt-3 relative">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="absolute left-3 top-2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" placeholder="Search colleagues..."
                  className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={peerSearch} onChange={e => setPeerSearch(e.target.value)} />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto p-2">
              {(() => {
                const supervisor = getSupervisor(showAssignPeers)
                const filteredStaff = staffList
                  .filter(s => s.id !== showAssignPeers && s.id !== supervisor?.id)
                  .filter(s => !peerSearch || s.full_name.toLowerCase().includes(peerSearch.toLowerCase()) || s.staff_code.toLowerCase().includes(peerSearch.toLowerCase()))

                if (filteredStaff.length === 0) {
                  return <p className="text-sm text-slate-400 text-center py-6">No colleagues found.</p>
                }

                return (
                  <>
                    <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer border-b border-slate-100 mb-1">
                      <input type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={filteredStaff.length > 0 && filteredStaff.every(s => checkedPeers.has(s.id))}
                        onChange={e => {
                          const next = new Set(checkedPeers)
                          if (e.target.checked) filteredStaff.forEach(s => next.add(s.id))
                          else filteredStaff.forEach(s => next.delete(s.id))
                          setCheckedPeers(next)
                        }} />
                      <span className="text-sm font-medium text-slate-700">Select All</span>
                      <span className="text-xs text-slate-400 ml-auto">{checkedPeers.size} selected</span>
                    </label>
                    {filteredStaff.map(s => (
                      <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={checkedPeers.has(s.id)}
                          onChange={e => {
                            const next = new Set(checkedPeers)
                            if (e.target.checked) next.add(s.id)
                            else next.delete(s.id)
                            setCheckedPeers(next)
                          }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-800 font-medium">{s.full_name}</span>
                          <span className="text-xs text-slate-400 ml-2 font-mono">{s.staff_code}</span>
                          {(s.departments as any)?.name && (
                            <span className="text-xs text-slate-400 ml-2">· {(s.departments as any).name}</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </>
                )
              })()}
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">{checkedPeers.size} peer{checkedPeers.size !== 1 ? 's' : ''} selected</span>
              <div className="flex gap-2">
                <button onClick={() => setShowAssignPeers(null)}
                  className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm transition-colors">Cancel</button>
                <button onClick={() => handleSavePeerReviewers(showAssignPeers)} disabled={savingPeers}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50">
                  {savingPeers ? 'Saving...' : 'Save Peers'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Cycle Modal */}
      {showModal && editCycle && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">
              {editCycle.id ? 'Edit Cycle' : 'New Appraisal Cycle'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cycle Name</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="e.g. Q3 2026 Performance Review"
                  value={editCycle.name || ''}
                  onChange={e => setEditCycle({ ...editCycle, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    value={editCycle.start_date || ''}
                    onChange={e => setEditCycle({ ...editCycle, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    value={editCycle.end_date || ''}
                    onChange={e => setEditCycle({ ...editCycle, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={editCycle.status || 'draft'}
                  onChange={e => setEditCycle({ ...editCycle, status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowModal(false); setEditCycle(null) }}
                className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm transition-colors"
              >Cancel</button>
              <button
                onClick={handleSaveCycle}
                disabled={saving || !editCycle.name || !editCycle.start_date || !editCycle.end_date}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editCycle.id ? 'Update Cycle' : 'Create Cycle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
