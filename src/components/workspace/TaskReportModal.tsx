import React, { useState, useMemo } from 'react'
import type { WorkspaceTask, StaffMember } from '../../types'
import {
  IconFileSpreadsheet,
  IconFileText,
  IconDownload,
  IconPrinter,
  IconCalendar,
  IconFilter,
  IconCheckCircle,
  IconClock,
  IconShieldCheck,
  IconUsers,
  IconChart,
} from '../icons/ClassicIcons'
import { exportTasksToExcel, exportTasksToPdf, exportTasksToCsv, printTaskReport } from '../../lib/taskReportExporter'

interface Props {
  isOpen: boolean
  onClose: () => void
  tasks: WorkspaceTask[]
  staffList?: StaffMember[]
  workspaceName?: string
  teamName?: string
  currentStaffId?: string | null
  currentStaffName?: string
  canAccessExecutiveDigest?: boolean
}

type DateFilterPreset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'today' | 'all_time' | 'custom'

const KPI_CATEGORIES = [
  'Operations, Admin & Compliance',
  'Logistics, Warehouse & Inventory',
  'Sales & Customer Acquisition',
  'Technical & IT Procedures',
  'HR & People Operations',
  'Finance & Accounting',
]

export default function TaskReportModal({
  isOpen,
  onClose,
  tasks,
  staffList = [],
  workspaceName = 'Workspace',
  teamName,
  currentStaffId,
  currentStaffName = 'HRIS User',
  canAccessExecutiveDigest = true,
}: Props) {
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('this_week')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedPriority, setSelectedPriority] = useState('all')
  const [selectedAssignee, setSelectedAssignee] = useState<string>(
    canAccessExecutiveDigest ? 'all' : (currentStaffId || 'all')
  )
  const [exporting, setExporting] = useState<string | null>(null)

  // Calculate Date Boundaries
  const dateRange = useMemo(() => {
    const now = new Date()
    const currentDay = now.getDay()
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay

    let start = new Date(now)
    let end = new Date(now)
    let label = 'This Week'

    if (datePreset === 'today') {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      label = 'Today (' + now.toLocaleDateString() + ')'
    } else if (datePreset === 'this_week') {
      start.setDate(now.getDate() + mondayOffset)
      start.setHours(0, 0, 0, 0)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      label = 'This Week (' + start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' + end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ')'
    } else if (datePreset === 'last_week') {
      start.setDate(now.getDate() + mondayOffset - 7)
      start.setHours(0, 0, 0, 0)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      label = 'Last Week (' + start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' + end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ')'
    } else if (datePreset === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      label = 'This Month (' + now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ')'
    } else if (datePreset === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      label = 'Last Month (' + start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ')'
    } else if (datePreset === 'custom') {
      if (customStartDate) start = new Date(customStartDate)
      else start = new Date(0)
      if (customEndDate) {
        end = new Date(customEndDate)
        end.setHours(23, 59, 59, 999)
      } else end = new Date()
      label = `Custom (${customStartDate || 'start'} to ${customEndDate || 'today'})`
    } else {
      start = new Date(0)
      end = new Date(3000, 0, 1)
      label = 'All Time'
    }

    return { start, end, label }
  }, [datePreset, customStartDate, customEndDate])

  // Filter Tasks based on all user parameters
  const filteredTasks = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const effectiveAssignee = canAccessExecutiveDigest ? selectedAssignee : (currentStaffId || selectedAssignee)

    return tasks.filter(t => {
      // 1. Date Filter
      if (datePreset !== 'all_time') {
        const taskDate = t.due_date ? new Date(t.due_date) : new Date(t.created_at)
        if (taskDate < dateRange.start || taskDate > dateRange.end) return false
      }

      // 2. Category Filter
      if (selectedCategory !== 'all' && t.kpi_category !== selectedCategory) {
        return false
      }

      // 3. Status Filter
      if (selectedStatus === 'overdue') {
        if (t.status === 'done' || !t.due_date || t.due_date >= todayStr) return false
      } else if (selectedStatus !== 'all' && t.status !== selectedStatus) {
        return false
      }

      // 4. Priority Filter
      if (selectedPriority !== 'all' && t.priority !== selectedPriority) {
        return false
      }

      // 5. Assignee Filter
      if (effectiveAssignee !== 'all') {
        if (effectiveAssignee === 'unassigned') {
          if (t.assignee_id) return false
        } else if (t.assignee_id !== effectiveAssignee) {
          return false
        }
      }

      return true
    })
  }, [tasks, datePreset, dateRange, selectedCategory, selectedStatus, selectedPriority, selectedAssignee, canAccessExecutiveDigest, currentStaffId])

  // Aggregate Metrics for Live Preview
  const previewMetrics = useMemo(() => {
    const total = filteredTasks.length
    const completed = filteredTasks.filter(t => t.status === 'done').length
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0
    const actualHours = parseFloat(filteredTasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0).toFixed(1))
    const estHours = parseFloat(filteredTasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0).toFixed(1))
    const proofs = filteredTasks.filter(
      t => (t.comments && t.comments.some(c => c.is_proof)) || (t.image_attachments && t.image_attachments.length > 0)
    ).length

    return { total, completed, rate, actualHours, estHours, proofs }
  }, [filteredTasks])

  if (!isOpen) return null

  const handleExportExcel = () => {
    setExporting('excel')
    setTimeout(() => {
      exportTasksToExcel(filteredTasks, {
        workspaceName,
        teamName,
        dateRangeLabel: dateRange.label,
        generatedBy: currentStaffName,
      })
      setExporting(null)
    }, 100)
  }

  const handleExportPdf = () => {
    setExporting('pdf')
    setTimeout(() => {
      exportTasksToPdf(filteredTasks, {
        workspaceName,
        teamName,
        dateRangeLabel: dateRange.label,
        generatedBy: currentStaffName,
      })
      setExporting(null)
    }, 100)
  }

  const handleExportCsv = () => {
    setExporting('csv')
    setTimeout(() => {
      exportTasksToCsv(filteredTasks, {
        workspaceName,
        teamName,
        dateRangeLabel: dateRange.label,
        generatedBy: currentStaffName,
      })
      setExporting(null)
    }, 100)
  }

  const handlePrint = () => {
    printTaskReport(filteredTasks, {
      workspaceName,
      teamName,
      dateRangeLabel: dateRange.label,
      generatedBy: currentStaffName,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100 flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
              <IconFileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {canAccessExecutiveDigest ? 'Task & KPI Report Generator' : 'Personal Task Report Generator'}
              </h3>
              <p className="text-xs text-slate-500">
                {canAccessExecutiveDigest
                  ? '1-Click executive PDF, multi-sheet Excel spreadsheet, or structured CSV export'
                  : `Export personal task deliverables, logged hours, and verified proofs for ${currentStaffName}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 flex-1">
          {/* 1. Date Range Preset Pills */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <IconCalendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Report Time Period</span>
            </label>
            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              {(
                [
                  { key: 'this_week', label: 'This Week' },
                  { key: 'last_week', label: 'Last Week' },
                  { key: 'this_month', label: 'This Month' },
                  { key: 'last_month', label: 'Last Month' },
                  { key: 'today', label: 'Today' },
                  { key: 'all_time', label: 'All Time' },
                  { key: 'custom', label: 'Custom Range' },
                ] as { key: DateFilterPreset; label: string }[]
              ).map(preset => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setDatePreset(preset.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    datePreset === preset.key
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {datePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">From Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">To Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 2. Granular Filter Controls */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <IconFilter className="w-3.5 h-3.5 text-blue-600" />
              <span>Scope & Department Filters</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* KPI Category Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">KPI Category</label>
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50 outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="all">All KPI Categories (6 Categories)</option>
                  {KPI_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Task Status</label>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50 outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="all">All Task Statuses</option>
                  <option value="done">Completed Only</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Under Review</option>
                  <option value="todo">To Do (Pending)</option>
                  <option value="overdue">Overdue Deadline Alert</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Priority Level</label>
                <select
                  value={selectedPriority}
                  onChange={e => setSelectedPriority(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50 outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="all">All Priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              {/* Assignee Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Team Member</label>
                <select
                  value={selectedAssignee}
                  disabled={!canAccessExecutiveDigest}
                  onChange={e => setSelectedAssignee(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50 outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 disabled:opacity-75 disabled:bg-slate-100"
                >
                  {canAccessExecutiveDigest ? (
                    <>
                      <option value="all">All Team Members</option>
                      <option value="unassigned">Unassigned Tasks Only</option>
                      {staffList.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.department || 'General'})</option>
                      ))}
                    </>
                  ) : (
                    <option value={currentStaffId || 'me'}>Personal Tasks Only ({currentStaffName})</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* 3. Live Preview Summary Box */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <IconChart className="w-3.5 h-3.5 text-blue-600" />
                <span>Export Dataset Preview</span>
              </span>
              <span className="text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {previewMetrics.total} tasks selected
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Completed</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {previewMetrics.completed} <span className="text-[10px] font-normal text-slate-400">({previewMetrics.rate}%)</span>
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Hours Logged</span>
                <span className="text-sm font-extrabold text-purple-700 font-mono">
                  {previewMetrics.actualHours}h <span className="text-[10px] font-normal text-slate-400">/{previewMetrics.estHours}h</span>
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Proofs Verified</span>
                <span className="text-sm font-extrabold text-emerald-700">
                  {previewMetrics.proofs} submissions
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Scope</span>
                <span className="text-xs font-bold text-slate-700 truncate block" title={workspaceName}>
                  {workspaceName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer / 1-Click Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {/* CSV Button */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredTasks.length === 0 || !!exporting}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <IconDownload className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>

            {/* Print Friendly View */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={filteredTasks.length === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <IconPrinter className="w-3.5 h-3.5 text-slate-600" />
              <span>Print Friendly</span>
            </button>

            {/* PDF Report Button */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={filteredTasks.length === 0 || !!exporting}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <IconFileText className="w-3.5 h-3.5" />
              <span>{exporting === 'pdf' ? 'Generating PDF...' : 'Download PDF Report'}</span>
            </button>

            {/* Excel Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredTasks.length === 0 || !!exporting}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <IconFileSpreadsheet className="w-3.5 h-3.5" />
              <span>{exporting === 'excel' ? 'Building Excel...' : 'Download Excel (.xlsx)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
