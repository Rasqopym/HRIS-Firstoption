import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import type { Page } from '../../../types'
import { getActiveCrossRefRules } from './appraisalData'
import { getAppraisalTemplates, type AppraisalTemplate } from '../../../lib/appraisalManager'

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

const STAFF_TEMPLATE_STORAGE_KEY = 'hris_staff_assigned_templates_map'

export default function AppraisalCycles({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true)
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [staffList, setStaffList] = useState<StaffItem[]>([])
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editCycle, setEditCycle] = useState<Partial<Cycle> | null>(null)
  const [saving, setSaving] = useState(false)

  // Sub-tabs: 'roster' | 'templates'
  const [activeMainTab, setActiveMainTab] = useState<'roster' | 'templates'>('roster')

  // Templates State
  const [templates, setTemplates] = useState<AppraisalTemplate[]>([])
  const [previewTemplate, setPreviewTemplate] = useState<AppraisalTemplate | null>(null)
  const [templateFilter, setTemplateFilter] = useState<string>('all')

  // Staff Template Mapping (cycleId_employeeId -> templateId)
  const [staffTemplateMap, setStaffTemplateMap] = useState<Record<string, string>>({})

  // Single Staff / Confirmation Appraisal Modal
  const [showInitiateModal, setShowInitiateModal] = useState(false)
  const [initiateForm, setInitiateForm] = useState<{
    employeeId: string
    templateId: string
    cycleId: string
    supervisorId: string
    peerIds: string[]
    appraisalType: string
  }>({
    employeeId: '',
    templateId: 'tmpl-probation',
    cycleId: '',
    supervisorId: '',
    peerIds: [],
    appraisalType: 'confirmation',
  })

  // Supervisor assignment state
  const [showAssignSupervisor, setShowAssignSupervisor] = useState<string | null>(null)
  const [supervisorSearch, setSupervisorSearch] = useState('')
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('')

  // Peer reviewer assignment state
  const [showAssignPeers, setShowAssignPeers] = useState<string | null>(null)
  const [checkedPeers, setCheckedPeers] = useState<Set<string>>(new Set())
  const [peerSearch, setPeerSearch] = useState('')
  const [savingPeers, setSavingPeers] = useState(false)
  const [crossRefMessage, setCrossRefMessage] = useState('')

  // Load staff-template map from local storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STAFF_TEMPLATE_STORAGE_KEY)
      if (stored) {
        setStaffTemplateMap(JSON.parse(stored))
      }
    } catch {}
  }, [])

  const saveStaffTemplate = (cycleId: string, employeeId: string, templateId: string) => {
    const key = `${cycleId}_${employeeId}`
    const updated = { ...staffTemplateMap, [key]: templateId }
    setStaffTemplateMap(updated)
    try {
      localStorage.setItem(STAFF_TEMPLATE_STORAGE_KEY, JSON.stringify(updated))
    } catch {}
  }

  const getTemplateForStaff = (cycleId: string, employeeId: string): AppraisalTemplate | undefined => {
    const key = `${cycleId}_${employeeId}`
    const tmplId = staffTemplateMap[key] || 'tmpl-annual-360'
    return templates.find(t => t.id === tmplId) || templates[0]
  }

  const handleAutoAssignCrossRefPeers = async () => {
    if (!selectedCycleId || staffList.length === 0) return
    setSaving(true)
    try {
      const rules = getActiveCrossRefRules()
      if (!rules || rules.length === 0) {
        alert('No Cross-Reference rules configured in the active Appraisal Template. Pairings can be configured under Appraisal & Assessments.')
        setSaving(false)
        return
      }

      const rows: any[] = []
      let totalPaired = 0

      for (const rule of rules) {
        const evaluators = staffList.filter(s => (s.departments?.name || '').toLowerCase() === rule.evaluatorDepartment.toLowerCase())
        const targets = staffList.filter(s => (s.departments?.name || '').toLowerCase() === rule.targetDepartment.toLowerCase())

        for (const target of targets) {
          const chosenEvaluators = evaluators.filter(e => e.id !== target.id).slice(0, 2)
          for (const evaluator of chosenEvaluators) {
            rows.push({
              cycle_id: selectedCycleId,
              employee_id: target.id,
              reviewer_id: evaluator.id,
              section: '360',
              status: 'not_started',
            })
            totalPaired++
          }
        }
      }

      if (rows.length > 0) {
        await supabase.from('appraisal_assignments').upsert(rows, {
          onConflict: 'cycle_id,employee_id,reviewer_id,section',
        })
        setCrossRefMessage(`✓ Successfully paired ${totalPaired} cross-department reviewers!`)
        setTimeout(() => setCrossRefMessage(''), 4500)
      } else {
        setCrossRefMessage('No active staff found in the paired departments.')
        setTimeout(() => setCrossRefMessage(''), 4500)
      }
      fetchAssignments()
    } catch (err) {
      console.error('Error auto-assigning cross-refs:', err)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { if (selectedCycleId) fetchAssignments() }, [selectedCycleId])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [{ data: cData }, { data: sData }, tmpls] = await Promise.all([
        supabase.from('appraisal_cycles').select('*').order('created_at', { ascending: false }),
        supabase.from('staff').select('id, full_name, email, staff_code, department_id, departments(name)').eq('status', 'active'),
        getAppraisalTemplates(),
      ])
      setCycles(cData || [])
      setStaffList(sData || [])
      setTemplates(tmpls || [])
      if (cData && cData.length > 0 && !selectedCycleId) {
        setSelectedCycleId(cData[0].id)
        setInitiateForm(prev => ({ ...prev, cycleId: cData[0].id }))
      }
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

  // Handle Complete Single Staff / Confirmation Appraisal Setup
  const handleLaunchInitiatedAppraisal = async () => {
    if (!initiateForm.employeeId || !initiateForm.cycleId) {
      alert('Please select an employee and an appraisal cycle.')
      return
    }
    setSaving(true)
    try {
      const cycleId = initiateForm.cycleId
      const empId = initiateForm.employeeId
      const templateId = initiateForm.templateId

      // 1. Create base assignments for all sections
      const rows: any[] = [
        { cycle_id: cycleId, employee_id: empId, reviewer_id: empId, section: 'self', status: 'not_started' },
      ]

      // 2. If supervisor selected, assign supervisor sections
      if (initiateForm.supervisorId) {
        rows.push(
          { cycle_id: cycleId, employee_id: empId, reviewer_id: initiateForm.supervisorId, section: 'kpi', status: 'not_started' },
          { cycle_id: cycleId, employee_id: empId, reviewer_id: initiateForm.supervisorId, section: 'supervisor', status: 'not_started' },
          { cycle_id: cycleId, employee_id: empId, reviewer_id: initiateForm.supervisorId, section: 'qualitative', status: 'not_started' },
          { cycle_id: cycleId, employee_id: empId, reviewer_id: initiateForm.supervisorId, section: '360', status: 'not_started' },
        )
      }

      // 3. If peer reviewers selected, assign 360 section
      for (const peerId of initiateForm.peerIds) {
        if (peerId !== empId && peerId !== initiateForm.supervisorId) {
          rows.push({
            cycle_id: cycleId,
            employee_id: empId,
            reviewer_id: peerId,
            section: '360',
            status: 'not_started',
          })
        }
      }

      // Save to Supabase
      await supabase.from('appraisal_assignments').upsert(rows, {
        onConflict: 'cycle_id,employee_id,reviewer_id,section',
      })

      // Store chosen template
      saveStaffTemplate(cycleId, empId, templateId)

      setShowInitiateModal(false)
      setSelectedCycleId(cycleId)
      setActiveMainTab('roster')
      fetchAssignments()
    } catch (err) {
      console.error('Error initiating appraisal:', err)
    } finally {
      setSaving(false)
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

  // Filter templates
  const filteredTemplates = templates.filter(t => {
    if (templateFilter === 'all') return true
    return t.frameworkType === templateFilter
  })

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
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900">Appraisal & Confirmation Operations</h1>
          <p className="text-sm text-slate-600 mt-1">Assign staff to appraisal questionnaires, set evaluators/supervisors, and pair peer reviewers.</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              setInitiateForm({
                employeeId: unassignedStaff[0]?.id || staffList[0]?.id || '',
                templateId: 'tmpl-probation',
                cycleId: selectedCycleId || cycles[0]?.id || '',
                supervisorId: '',
                peerIds: [],
                appraisalType: 'confirmation',
              })
              setShowInitiateModal(true)
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors flex items-center gap-2 shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            <span>+ Appraise / Confirm Staff</span>
          </button>
          <button
            onClick={() => { setEditCycle({ status: 'draft' }); setShowModal(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors flex items-center gap-2 shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Cycle
          </button>
        </div>
      </div>

      {/* Main View Mode Selector Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveMainTab('roster')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeMainTab === 'roster'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Cycles & Staff Appraisal Roster
        </button>
        <button
          onClick={() => setActiveMainTab('templates')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeMainTab === 'templates'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Appraisal Templates & Questionnaires ({templates.length})
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 1: CYCLES & STAFF ROSTER */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeMainTab === 'roster' && (
        <div className="space-y-6">
          {/* Cycles Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Appraisal Cycles</h2>
                <p className="text-xs text-slate-500">Select a cycle below to inspect or manage staff assignments</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-3">Cycle Name</th>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-3">Start Date</th>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-3">End Date</th>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-3">Assigned Staff</th>
                    <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-3">Actions</th>
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
                          isSelected ? 'bg-blue-50/70 font-medium' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <td className="px-4 py-3 text-slate-900 flex items-center gap-2">
                          {isSelected && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
                          <span className="font-semibold">{c.name}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{new Date(c.start_date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-slate-700">{new Date(c.end_date).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            c.status === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            c.status === 'closed' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-semibold">{selectedCycleId === c.id ? assignedEmployeeIds.length : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={e => { e.stopPropagation(); setEditCycle(c); setShowModal(true) }}
                              className="text-slate-500 hover:text-blue-600 transition-colors p-1"
                              title="Edit Cycle Dates/Status"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            {c.status === 'draft' && (
                              <button
                                onClick={e => { e.stopPropagation(); handleToggleCycleStatus(c.id, 'active') }}
                                className="text-xs px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors font-semibold"
                              >Open</button>
                            )}
                            {c.status === 'active' && (
                              <button
                                onClick={e => { e.stopPropagation(); handleToggleCycleStatus(c.id, 'closed') }}
                                className="text-xs px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors font-semibold"
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
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Staff Appraisal Roster — {selectedCycle.name}
                  </h2>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {assignedEmployeeIds.length} staff enrolled · {unassignedStaff.length} unassigned
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  {crossRefMessage && (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                      {crossRefMessage}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setInitiateForm({
                        employeeId: unassignedStaff[0]?.id || staffList[0]?.id || '',
                        templateId: 'tmpl-probation',
                        cycleId: selectedCycleId,
                        supervisorId: '',
                        peerIds: [],
                        appraisalType: 'confirmation',
                      })
                      setShowInitiateModal(true)
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-3.5 py-2 text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>+ Appraise / Confirm Staff</span>
                  </button>
                  <button
                    onClick={handleAutoAssignCrossRefPeers}
                    disabled={saving || assignedEmployeeIds.length === 0}
                    className="bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 font-semibold rounded-lg px-3.5 py-2 text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    title="Auto-pair peer reviewers across collaborating departments based on organizational cross-reference rules"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
                    <span>Auto-Pair Cross-Dept Peers</span>
                  </button>
                  <button
                    onClick={handleAssignAllStaff}
                    disabled={saving || unassignedStaff.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-3.5 py-2 text-xs transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {saving ? 'Assigning...' : `Enroll All Active Staff (${unassignedStaff.length})`}
                  </button>
                </div>
              </div>

              {/* Assigned Employees Table */}
              {assignedEmployeeIds.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left text-xs font-bold text-slate-700 uppercase tracking-wide px-3 py-3">Employee Being Appraised</th>
                        <th className="text-left text-xs font-bold text-slate-700 uppercase tracking-wide px-3 py-3">Appraisal Questionnaire</th>
                        {SECTIONS.map(s => (
                          <th key={s} className="text-center text-xs font-bold text-slate-700 uppercase tracking-wide px-2 py-3">{SECTION_LABELS[s]}</th>
                        ))}
                        <th className="text-left text-xs font-bold text-slate-700 uppercase tracking-wide px-3 py-3">Evaluator / Supervisor</th>
                        <th className="text-left text-xs font-bold text-slate-700 uppercase tracking-wide px-3 py-3">Cross-Ref Peers</th>
                        <th className="text-right text-xs font-bold text-slate-700 uppercase tracking-wide px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {assignedEmployeeIds.map(empId => {
                        const staff = staffList.find(s => s.id === empId)
                        if (!staff) return null
                        const sections = getEmployeeSections(empId)
                        const supervisor = getSupervisor(empId)
                        const peerReviewers = getPeerReviewers(empId)
                        const assignedTmpl = getTemplateForStaff(selectedCycleId, empId)

                        return (
                          <tr key={empId} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-3 py-3">
                              <div className="font-bold text-slate-900">{staff.full_name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-xs text-slate-500">{staff.staff_code}</span>
                                {(staff.departments as any)?.name && (
                                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                                    {(staff.departments as any).name}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Assigned Template / Questionnaire Badge */}
                            <td className="px-3 py-3">
                              {assignedTmpl ? (
                                <button
                                  onClick={() => setPreviewTemplate(assignedTmpl)}
                                  className="group inline-flex items-center gap-1.5 text-left bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                                  title="Click to view questionnaire structure and questions"
                                >
                                  <svg className="w-3.5 h-3.5 text-purple-600 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
                                  <span>{assignedTmpl.name}</span>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">Standard 360°</span>
                              )}
                            </td>

                            {sections.map(s => (
                              <td key={s.section} className="px-2 py-3 text-center">
                                <div className={`w-3 h-3 rounded-full mx-auto ${statusColors[s.status]}`} title={`${SECTION_LABELS[s.section]}: ${s.status.replace('_', ' ')}`} />
                              </td>
                            ))}

                            {/* Supervisor Column */}
                            <td className="px-3 py-3">
                              {supervisor ? (
                                <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-semibold">
                                  <span>{supervisor.full_name}</span>
                                  <button
                                    onClick={() => handleRemoveSupervisor(empId)}
                                    className="text-amber-600 hover:text-red-600 transition-colors ml-1"
                                    title="Remove supervisor"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => openSupervisorModal(empId)}
                                  className="text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 font-semibold px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  + Assign Evaluator
                                </button>
                              )}
                            </td>

                            {/* Peer Reviewers Column */}
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {peerReviewers.map(r => (
                                  <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-800 font-medium px-2 py-0.5 rounded-md border border-slate-200">
                                    {r.full_name.split(' ')[0]}
                                    <button onClick={() => handleRemovePeerReviewer(empId, r.id)}
                                      className="text-slate-400 hover:text-red-600 transition-colors ml-0.5" title="Remove peer reviewer">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  </span>
                                ))}
                                <button
                                  onClick={() => openPeersModal(empId)}
                                  className="text-xs text-blue-700 hover:text-blue-800 font-semibold px-2 py-0.5 rounded border border-dashed border-blue-400 hover:bg-blue-50 transition-colors"
                                >
                                  {peerReviewers.length > 0 ? 'Edit Peers' : '+ Assign Peers'}
                                </button>
                              </div>
                            </td>

                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => onNavigate?.('hr-appraisal-form')}
                                  className="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors font-semibold shadow-sm"
                                >Audit / Grade</button>
                                <button
                                  onClick={() => handleRemoveStaff(empId)}
                                  className="text-slate-400 hover:text-red-600 transition-colors p-1"
                                  title="Remove from cycle"
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-800">Unassigned Staff Available for Appraisal</h3>
                    <span className="text-xs text-slate-500 font-medium">Click any staff member to quick-assign</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unassignedStaff.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setInitiateForm({
                            employeeId: s.id,
                            templateId: 'tmpl-probation',
                            cycleId: selectedCycleId,
                            supervisorId: '',
                            peerIds: [],
                            appraisalType: 'confirmation',
                          })
                          setShowInitiateModal(true)
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-800 hover:bg-blue-50 hover:border-blue-400 font-medium transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>{s.full_name}</span>
                        {(s.departments as any)?.name && (
                          <span className="text-[11px] text-slate-500 bg-slate-100 px-1 rounded">{(s.departments as any).name}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Section Legend */}
              <div className="flex items-center gap-4 text-xs text-slate-600 pt-2 border-t border-slate-100 font-medium">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> Not Started</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> In Progress</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Complete</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 2: TEMPLATES & QUESTIONNAIRES CATALOG */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeMainTab === 'templates' && (
        <div className="space-y-6">
          {/* Banner */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Appraisal Questionnaires & Evaluation Frameworks</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  Review appraisal structures, rating weights, and question criteria, and assign them directly to staff members (e.g., staff due for probation confirmation or annual review).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold px-3 py-1.5 bg-white border border-blue-200 text-blue-800 rounded-lg shadow-xs">
                Frameworks Catalog
              </span>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: 'all', label: 'All Frameworks' },
              { id: 'probation_confirmation', label: 'Probation & Confirmation' },
              { id: 'annual_360', label: 'Annual 360° Assessment' },
              { id: 'leadership', label: 'Leadership & Executive' },
              { id: 'technical_field', label: 'Technical & Field' },
              { id: 'cross_department', label: 'Cross-Department' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setTemplateFilter(f.id)}
                className={`text-xs font-bold px-3.5 py-2 rounded-lg transition-all ${
                  templateFilter === f.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Templates Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTemplates.map(tmpl => {
              const totalItems = tmpl.sections.reduce((acc, s) => acc + (s.items?.length || 0), 0)
              const isProbation = tmpl.frameworkType === 'probation_confirmation'

              return (
                <div
                  key={tmpl.id}
                  className={`bg-white rounded-xl border p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between ${
                    isProbation ? 'border-purple-300 ring-2 ring-purple-100' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                        isProbation ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                        tmpl.frameworkType === 'leadership' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}>
                        {tmpl.frameworkType.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-mono text-slate-500 font-medium">{tmpl.code}</span>
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-slate-900 leading-snug">{tmpl.name}</h4>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-3 leading-relaxed">{tmpl.description}</p>
                    </div>

                    {/* Meta stats */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-semibold">Sections</span>
                        <span className="font-bold text-slate-800">{tmpl.sections.length} Sections</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-semibold">Total Criteria</span>
                        <span className="font-bold text-slate-800">{totalItems} Criteria Items</span>
                      </div>
                    </div>

                    {/* Section weights breakdown */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Section Breakdown</span>
                      <div className="flex flex-wrap gap-1.5">
                        {tmpl.sections.map(s => (
                          <span key={s.id} className="text-[11px] bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded border border-slate-200">
                            {s.title.split(' ')[0]} ({s.weight}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => setPreviewTemplate(tmpl)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                      <span>Preview Questions</span>
                    </button>
                    <button
                      onClick={() => {
                        setInitiateForm({
                          employeeId: unassignedStaff[0]?.id || staffList[0]?.id || '',
                          templateId: tmpl.id,
                          cycleId: selectedCycleId || cycles[0]?.id || '',
                          supervisorId: '',
                          peerIds: [],
                          appraisalType: isProbation ? 'confirmation' : 'regular',
                        })
                        setShowInitiateModal(true)
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                      <span>Assign to Staff</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL 1: INITIATE STAFF APPRAISAL / CONFIRMATION REVIEW */}
      {/* ──────────────────────────────────────────────────────────── */}
      {showInitiateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowInitiateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-5 my-8" onClick={e => e.stopPropagation()}>
            <div className="border-b border-slate-100 pb-3 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Assign Appraisal / Confirmation Assessment</h3>
                <p className="text-xs text-slate-500 mt-0.5">Select the staff member, assessment questionnaire, and evaluators.</p>
              </div>
              <button onClick={() => setShowInitiateModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">×</button>
            </div>

            <div className="space-y-4">
              {/* 1. Select Staff Member */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  1. Staff Member Being Appraised *
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-slate-900"
                  value={initiateForm.employeeId}
                  onChange={e => setInitiateForm({ ...initiateForm, employeeId: e.target.value })}
                >
                  <option value="">-- Choose Employee --</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.staff_code}) {s.departments?.name ? `— [${s.departments.name}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Select Questionnaire */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  2. Assessment Questionnaire *
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-slate-900"
                  value={initiateForm.templateId}
                  onChange={e => setInitiateForm({ ...initiateForm, templateId: e.target.value })}
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code}) — {t.sections.length} Sections
                    </option>
                  ))}
                </select>
                {(() => {
                  const tmpl = templates.find(t => t.id === initiateForm.templateId)
                  if (!tmpl) return null
                  return (
                    <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200 text-xs text-purple-900">
                      <strong>Template Details:</strong> {tmpl.description}
                    </div>
                  )
                })()}
              </div>

              {/* 3. Select Appraisal Cycle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  3. Appraisal Cycle *
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-slate-900"
                  value={initiateForm.cycleId}
                  onChange={e => setInitiateForm({ ...initiateForm, cycleId: e.target.value })}
                >
                  {cycles.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                  ))}
                </select>
              </div>

              {/* 4. Select Primary Evaluator / Line Manager */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  4. Primary Evaluator / Line Manager (For Confirmation & KPIs)
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-slate-900"
                  value={initiateForm.supervisorId}
                  onChange={e => setInitiateForm({ ...initiateForm, supervisorId: e.target.value })}
                >
                  <option value="">-- Select Line Manager / Supervisor --</option>
                  {staffList.filter(s => s.id !== initiateForm.employeeId).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.staff_code}) {s.departments?.name ? `— [${s.departments.name}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Select Peer Reviewers (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  5. Cross-Reference Peer Reviewers (Optional 360° Evaluation)
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                  {staffList.filter(s => s.id !== initiateForm.employeeId && s.id !== initiateForm.supervisorId).map(s => {
                    const isChecked = initiateForm.peerIds.includes(s.id)
                    return (
                      <label key={s.id} className="flex items-center gap-2 text-xs text-slate-800 p-1 hover:bg-white rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setInitiateForm({ ...initiateForm, peerIds: [...initiateForm.peerIds, s.id] })
                            } else {
                              setInitiateForm({ ...initiateForm, peerIds: initiateForm.peerIds.filter(id => id !== s.id) })
                            }
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>{s.full_name} ({s.staff_code})</span>
                        {s.departments?.name && <span className="text-[10px] text-slate-500">[{s.departments.name}]</span>}
                      </label>
                    )
                  })}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {initiateForm.peerIds.length} peer reviewer(s) selected
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowInitiateModal(false)}
                className="border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLaunchInitiatedAppraisal}
                disabled={saving || !initiateForm.employeeId || !initiateForm.cycleId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
              >
                {saving ? 'Assigning...' : 'Assign & Launch Appraisal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL 2: QUESTIONNAIRE PREVIEW */}
      {/* ──────────────────────────────────────────────────────────── */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setPreviewTemplate(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col my-6" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-50/80 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full">
                    {previewTemplate.frameworkType.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-mono text-slate-500 font-medium">{previewTemplate.code}</span>
                  <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
                    Assessment Framework • Preview Mode
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{previewTemplate.name}</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">{previewTemplate.description}</p>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="text-slate-400 hover:text-slate-700 text-2xl font-bold">×</button>
            </div>

            {/* Modal Body: Sections & Questions */}
            <div className="p-5 overflow-y-auto space-y-6">
              {previewTemplate.sections.map((sec, idx) => (
                <div key={sec.id || idx} className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        Section {idx + 1}: {sec.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">{sec.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg">
                        Weight: {sec.weight}%
                      </span>
                    </div>
                  </div>

                  {/* Criteria Items */}
                  <div className="space-y-2">
                    {sec.items?.map((item, itemIdx) => (
                      <div key={item.id || itemIdx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-start justify-between gap-3 text-xs">
                        <div className="space-y-0.5 flex-1">
                          <span className="font-bold text-slate-800">
                            {itemIdx + 1}. {item.text}
                          </span>
                          {item.description && (
                            <p className="text-[11px] text-slate-500">{item.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded font-medium">
                            {item.scoringType}
                          </span>
                          <span className="font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                            {item.weight}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-b-2xl">
              <span className="text-xs text-slate-500 font-medium">
                Standardized organizational evaluation framework.
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const tmpl = previewTemplate
                    setPreviewTemplate(null)
                    setInitiateForm({
                      employeeId: unassignedStaff[0]?.id || staffList[0]?.id || '',
                      templateId: tmpl.id,
                      cycleId: selectedCycleId || cycles[0]?.id || '',
                      supervisorId: '',
                      peerIds: [],
                      appraisalType: tmpl.frameworkType === 'probation_confirmation' ? 'confirmation' : 'regular',
                    })
                    setShowInitiateModal(true)
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors shadow-sm"
                >
                  Appraise Staff with this Questionnaire
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL 3: ASSIGN SUPERVISOR */}
      {/* ──────────────────────────────────────────────────────────── */}
      {showAssignSupervisor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAssignSupervisor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Assign Line Manager / Evaluator</h3>
              <p className="text-sm text-slate-600 mt-1">
                For <strong>{staffList.find(s => s.id === showAssignSupervisor)?.full_name}</strong>
              </p>
              <p className="text-xs text-amber-900 bg-amber-50 p-2.5 rounded-lg mt-2 border border-amber-200">
                The evaluator is responsible for grading <strong>Role KPIs</strong>, <strong>Supervisor Assessment</strong>, and <strong>Confirmation Recommendations</strong>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Select Evaluator</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-slate-900"
                value={selectedSupervisor}
                onChange={e => setSelectedSupervisor(e.target.value)}
              >
                <option value="">No Evaluator (Unassigned)</option>
                {staffList.filter(s => s.id !== showAssignSupervisor).map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.staff_code})</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAssignSupervisor(null)}
                className="border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              >Cancel</button>
              <button
                onClick={() => handleSetSupervisor(showAssignSupervisor)}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 shadow-sm"
              >
                {saving ? 'Saving...' : 'Save Evaluator'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL 4: ASSIGN PEER REVIEWERS */}
      {/* ──────────────────────────────────────────────────────────── */}
      {showAssignPeers && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAssignPeers(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Assign Peer Reviewers (360°)</h3>
              <p className="text-sm text-slate-600 mt-1">
                For <strong>{staffList.find(s => s.id === showAssignPeers)?.full_name}</strong>
              </p>
              <p className="text-xs text-blue-900 bg-blue-50 p-2.5 rounded-lg mt-2 border border-blue-200">
                Peer reviewers provide <strong>360° behavioral cross-reference feedback</strong> across core organizational dimensions.
              </p>

              {/* Search */}
              <div className="mt-3 relative">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="absolute left-3 top-2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" placeholder="Search colleagues..."
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  value={peerSearch} onChange={e => setPeerSearch(e.target.value)} />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto p-2">
              {(() => {
                const supervisor = getSupervisor(showAssignPeers)
                const availablePeers = staffList.filter(s =>
                  s.id !== showAssignPeers &&
                  s.id !== supervisor?.id &&
                  (s.full_name.toLowerCase().includes(peerSearch.toLowerCase()) ||
                   s.staff_code.toLowerCase().includes(peerSearch.toLowerCase()) ||
                   (s.departments as any)?.name?.toLowerCase().includes(peerSearch.toLowerCase()))
                )

                if (availablePeers.length === 0) {
                  return <p className="text-center text-xs text-slate-400 py-6">No eligible colleagues found</p>
                }

                return availablePeers.map(peer => {
                  const isChecked = checkedPeers.has(peer.id)
                  return (
                    <label
                      key={peer.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                        isChecked ? 'bg-blue-50/80 border border-blue-200' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        checked={isChecked}
                        onChange={e => {
                          const next = new Set(checkedPeers)
                          if (e.target.checked) next.add(peer.id)
                          else next.delete(peer.id)
                          setCheckedPeers(next)
                        }}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800">{peer.full_name}</div>
                        <div className="text-xs text-slate-400">
                          {peer.staff_code} {(peer.departments as any)?.name ? `· ${(peer.departments as any).name}` : ''}
                        </div>
                      </div>
                    </label>
                  )
                })
              })()}
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 rounded-b-2xl">
              <span className="text-xs text-slate-600 font-semibold">{checkedPeers.size} peer{checkedPeers.size !== 1 ? 's' : ''} selected</span>
              <div className="flex gap-2">
                <button onClick={() => setShowAssignPeers(null)}
                  className="border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg px-4 py-2 text-sm font-semibold transition-colors">Cancel</button>
                <button onClick={() => handleSavePeerReviewers(showAssignPeers)} disabled={savingPeers}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 shadow-sm">
                  {savingPeers ? 'Saving...' : 'Save Peers'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL 5: CREATE / EDIT CYCLE */}
      {/* ──────────────────────────────────────────────────────────── */}
      {showModal && editCycle && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">
              {editCycle.id ? 'Edit Cycle' : 'New Appraisal Cycle'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Cycle Name</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  placeholder="e.g. Q3 2026 Performance Review"
                  value={editCycle.name || ''}
                  onChange={e => setEditCycle({ ...editCycle, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    value={editCycle.start_date || ''}
                    onChange={e => setEditCycle({ ...editCycle, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    value={editCycle.end_date || ''}
                    onChange={e => setEditCycle({ ...editCycle, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
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
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              >Cancel</button>
              <button
                onClick={handleSaveCycle}
                disabled={saving || !editCycle.name || !editCycle.start_date || !editCycle.end_date}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 shadow-sm"
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
