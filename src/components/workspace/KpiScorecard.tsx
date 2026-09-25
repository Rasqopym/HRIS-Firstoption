import React, { useState, useMemo } from 'react'
import type { WorkspaceTask, StaffMember } from '../../types'
import {
  IconChart,
  IconClock,
  IconCheckCircle,
  IconAlertCircle,
  IconCalendar,
  IconUsers,
  IconSend,
  IconCheck,
  IconSparkles,
  IconPackage,
  IconTrendingUp,
  IconTerminal,
  IconCreditCard,
  IconBuilding,
  IconBriefcase,
  IconAward,
  IconShieldCheck,
  IconTarget,
  IconZap,
  IconFileSpreadsheet,
  IconFileText,
  IconDownload,
  IconPrinter,
  IconLock,
} from '../icons/ClassicIcons'
import { exportTasksToExcel, exportTasksToPdf } from '../../lib/taskReportExporter'
import TaskReportModal from './TaskReportModal'

interface Props {
  tasks: WorkspaceTask[]
  staffList?: StaffMember[]
  workspaceName?: string
  teamName?: string
  currentStaffId?: string | null
  currentStaffName?: string
  canAccessExecutiveDigest?: boolean
  onSelectTask?: (task: WorkspaceTask) => void
  onPostDigestToChat?: (digestText: string) => void
}

type TimeRange = 'this_week' | 'last_week' | 'this_month' | 'all_time'

interface KpiCategoryDef {
  name: string
  color: 'blue' | 'amber' | 'emerald' | 'purple' | 'rose' | 'cyan'
  iconKey: 'building' | 'package' | 'trending-up' | 'terminal' | 'users' | 'credit-card'
}

const KPI_CATEGORIES: KpiCategoryDef[] = [
  { name: 'Operations, Admin & Compliance', color: 'blue', iconKey: 'building' },
  { name: 'Logistics, Warehouse & Inventory', color: 'amber', iconKey: 'package' },
  { name: 'Sales & Customer Acquisition', color: 'emerald', iconKey: 'trending-up' },
  { name: 'Technical & IT Procedures', color: 'purple', iconKey: 'terminal' },
  { name: 'HR & People Operations', color: 'rose', iconKey: 'users' },
  { name: 'Finance & Accounting', color: 'cyan', iconKey: 'credit-card' },
]

export default function KpiScorecard({
  tasks,
  staffList = [],
  workspaceName = 'Workspace',
  teamName,
  currentStaffId,
  currentStaffName = 'HRIS User',
  canAccessExecutiveDigest = true,
  onSelectTask,
  onPostDigestToChat,
}: Props) {
  const [timeRange, setTimeRange] = useState<TimeRange>('this_week')
  const [copiedDigest, setCopiedDigest] = useState(false)
  const [postedToChat, setPostedToChat] = useState(false)
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>(
    canAccessExecutiveDigest ? 'all' : (currentStaffId || 'all')
  )
  const [showReportModal, setShowReportModal] = useState(false)

  // Calculate Date Range Boundaries
  const dateRangeInfo = useMemo(() => {
    const now = new Date()
    const currentDay = now.getDay()
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay

    let start = new Date(now)
    let end = new Date(now)

    if (timeRange === 'this_week') {
      start.setDate(now.getDate() + mondayOffset)
      start.setHours(0, 0, 0, 0)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
    } else if (timeRange === 'last_week') {
      start.setDate(now.getDate() + mondayOffset - 7)
      start.setHours(0, 0, 0, 0)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
    } else if (timeRange === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    } else {
      start = new Date(0)
      end = new Date(3000, 0, 1)
    }

    return { start, end, label: timeRange === 'this_week' ? 'This Week' : timeRange === 'last_week' ? 'Last Week' : timeRange === 'this_month' ? 'This Month' : 'All Time' }
  }, [timeRange])

  // Filter Tasks by Selected Time Range and Staff Filter
  const filteredTasks = useMemo(() => {
    const effectiveStaffFilter = canAccessExecutiveDigest ? selectedStaffFilter : (currentStaffId || selectedStaffFilter)

    return tasks.filter(task => {
      if (effectiveStaffFilter !== 'all' && task.assignee_id !== effectiveStaffFilter) {
        return false
      }

      if (timeRange === 'all_time') return true

      const taskDate = task.due_date ? new Date(task.due_date) : new Date(task.created_at)
      return taskDate >= dateRangeInfo.start && taskDate <= dateRangeInfo.end
    })
  }, [tasks, timeRange, dateRangeInfo, selectedStaffFilter, canAccessExecutiveDigest, currentStaffId])

  // Aggregated Scorecard Metrics
  const metrics = useMemo(() => {
    const total = filteredTasks.length
    const completed = filteredTasks.filter(t => t.status === 'done').length
    const inProgress = filteredTasks.filter(t => t.status === 'in_progress' || t.status === 'review').length
    const pending = filteredTasks.filter(t => t.status === 'todo').length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    const todayStr = new Date().toISOString().split('T')[0]
    let overdueCount = 0
    let onTimeCompleted = 0

    filteredTasks.forEach(t => {
      if (t.status === 'done') {
        if (!t.due_date || !t.completed_at || t.completed_at.split('T')[0] <= t.due_date) {
          onTimeCompleted++
        } else {
          overdueCount++
        }
      } else {
        if (t.due_date && t.due_date < todayStr) {
          overdueCount++
        }
      }
    })

    const onTimeRate = total > 0 ? Math.round((Math.max(0, total - overdueCount) / total) * 100) : 100

    const totalEstHours = parseFloat(
      filteredTasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0).toFixed(1)
    )
    const totalActualHours = parseFloat(
      filteredTasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0).toFixed(1)
    )

    const proofCount = filteredTasks.filter(
      t => (t.comments && t.comments.some(c => c.is_proof)) || (t.image_attachments && t.image_attachments.length > 0)
    ).length

    return {
      total,
      completed,
      inProgress,
      pending,
      completionRate,
      overdueCount,
      onTimeCompleted,
      onTimeRate,
      totalEstHours,
      totalActualHours,
      proofCount,
    }
  }, [filteredTasks])

  // 6-Category KPI Breakdown
  const categoryStats = useMemo(() => {
    return KPI_CATEGORIES.map(cat => {
      const catTasks = filteredTasks.filter(t => t.kpi_category === cat.name)
      const total = catTasks.length
      const completed = catTasks.filter(t => t.status === 'done').length
      const inProgress = catTasks.filter(t => t.status === 'in_progress' || t.status === 'review').length
      const estHours = catTasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0)
      const actualHours = catTasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0)
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

      return {
        ...cat,
        total,
        completed,
        inProgress,
        estHours: parseFloat(estHours.toFixed(1)),
        actualHours: parseFloat(actualHours.toFixed(1)),
        completionRate,
      }
    })
  }, [filteredTasks])

  // Staff Performance Leaderboard
  const staffLeaderboard = useMemo(() => {
    const staffMap: Record<
      string,
      {
        id: string
        name: string
        photo?: string
        department?: string
        total: number
        completed: number
        actualHours: number
        proofs: number
        overdue: number
      }
    > = {}

    filteredTasks.forEach(task => {
      const staffId = task.assignee_id || 'unassigned'
      const staffName = task.assignee?.name || (staffId === 'unassigned' ? 'Unassigned' : 'Staff Member')
      const staffPhoto = task.assignee?.photo
      const staffDept = task.assignee?.department || 'General'

      if (!staffMap[staffId]) {
        staffMap[staffId] = {
          id: staffId,
          name: staffName,
          photo: staffPhoto,
          department: staffDept,
          total: 0,
          completed: 0,
          actualHours: 0,
          proofs: 0,
          overdue: 0,
        }
      }

      staffMap[staffId].total++
      if (task.status === 'done') staffMap[staffId].completed++
      staffMap[staffId].actualHours += task.actual_hours || 0
      if ((task.comments && task.comments.some(c => c.is_proof)) || (task.image_attachments && task.image_attachments.length > 0)) {
        staffMap[staffId].proofs++
      }
      const todayStr = new Date().toISOString().split('T')[0]
      if (task.status !== 'done' && task.due_date && task.due_date < todayStr) {
        staffMap[staffId].overdue++
      }
    })

    const list = Object.values(staffMap).sort((a, b) => {
      const rateA = a.total > 0 ? a.completed / a.total : 0
      const rateB = b.total > 0 ? b.completed / b.total : 0
      if (rateB !== rateA) return rateB - rateA
      return b.completed - a.completed
    })

    // If regular staff, only show their own record (preserve privacy of other staff)
    if (!canAccessExecutiveDigest && currentStaffId) {
      return list.filter(s => s.id === currentStaffId)
    }

    return list
  }, [filteredTasks, canAccessExecutiveDigest, currentStaffId])

  // Automated Digest Synthesis (Executive briefing vs Personal summary)
  const generatedDigest = useMemo(() => {
    const dateStr = `${dateRangeInfo.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${dateRangeInfo.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    const topPerformer = staffLeaderboard.filter(s => s.id !== 'unassigned')[0]

    const headerTitle = canAccessExecutiveDigest ? 'EXECUTIVE BRIEFING' : 'PERSONAL PERFORMANCE SUMMARY'
    let summary = `[${headerTitle}] Weekly KPI Scorecard & Digest (${dateRangeInfo.label})\n`
    summary += `Period: ${dateStr}\n`
    summary += `Scope: ${workspaceName}${teamName ? ` / ${teamName}` : ''}\n`
    if (!canAccessExecutiveDigest) {
      summary += `Staff Member: ${currentStaffName}\n`
    }
    summary += `\n--- Deliverables Summary ---\n`
    summary += `• Deliverable Completion: ${metrics.completionRate}% (${metrics.completed}/${metrics.total} tasks completed)\n`
    summary += `• On-Time Execution Rate: ${metrics.onTimeRate}% (${metrics.overdueCount > 0 ? `${metrics.overdueCount} delayed items` : 'Zero overdue items'})\n`
    summary += `• Time Utilization: ${metrics.totalActualHours} hrs logged vs ${metrics.totalEstHours} hrs budgeted\n`
    summary += `• Milestone Deliverable Proofs: ${metrics.proofCount} verified submissions\n\n`

    summary += `--- KPI Category Breakdown ---\n`
    categoryStats.forEach(cat => {
      if (cat.total > 0) {
        summary += `• [${cat.name}]: ${cat.completed}/${cat.total} done (${cat.completionRate}%) | ${cat.actualHours}h logged\n`
      }
    })

    if (canAccessExecutiveDigest && topPerformer && topPerformer.total > 0) {
      summary += `\n--- Top Contributor Spotlight ---\n`
      summary += `• ${topPerformer.name} (${topPerformer.department}): ${topPerformer.completed}/${topPerformer.total} tasks completed (${Math.round((topPerformer.completed / topPerformer.total) * 100)}%), ${topPerformer.actualHours.toFixed(1)}h logged, ${topPerformer.proofs} deliverable proofs.\n`
    }

    if (metrics.overdueCount > 0) {
      summary += `\n--- Action Required ---\n`
      summary += `• ${metrics.overdueCount} task(s) currently exceed deadline schedule. Supervisors are advised to conduct morning check-ins.\n`
    } else {
      summary += `\n--- Operational Health ---\n`
      summary += `• All planned deliverables are pacing on schedule.\n`
    }

    return summary
  }, [metrics, categoryStats, staffLeaderboard, dateRangeInfo, workspaceName, teamName, canAccessExecutiveDigest, currentStaffName])

  const handleCopyDigest = async () => {
    try {
      await navigator.clipboard.writeText(generatedDigest)
      setCopiedDigest(true)
      setTimeout(() => setCopiedDigest(false), 2500)
    } catch {}
  }

  const handlePostDigest = () => {
    if (onPostDigestToChat) {
      onPostDigestToChat(generatedDigest)
      setPostedToChat(true)
      setTimeout(() => setPostedToChat(false), 3000)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handle1ClickExcel = () => {
    exportTasksToExcel(filteredTasks, {
      workspaceName,
      teamName,
      dateRangeLabel: dateRangeInfo.label,
      generatedBy: currentStaffName,
    })
  }

  const handle1ClickPdf = () => {
    exportTasksToPdf(filteredTasks, {
      workspaceName,
      teamName,
      dateRangeLabel: dateRangeInfo.label,
      generatedBy: currentStaffName,
    })
  }

  const renderCategoryIcon = (iconKey: KpiCategoryDef['iconKey']) => {
    switch (iconKey) {
      case 'building':
        return <IconBuilding className="w-4 h-4" />
      case 'package':
        return <IconPackage className="w-4 h-4" />
      case 'trending-up':
        return <IconTrendingUp className="w-4 h-4" />
      case 'terminal':
        return <IconTerminal className="w-4 h-4" />
      case 'users':
        return <IconUsers className="w-4 h-4" />
      case 'credit-card':
        return <IconCreditCard className="w-4 h-4" />
      default:
        return <IconBriefcase className="w-4 h-4" />
    }
  }

  return (
    <div className="space-y-6 print:m-0 print:p-0">
      {/* ── TOP CONTROLS & RANGE SELECTOR ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <IconChart className="w-5 h-5 text-blue-600" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>{canAccessExecutiveDigest ? 'Weekly KPI Scorecard & Performance Digest' : 'My Personal KPI Scorecard & Output'}</span>
              </h2>
              <p className="text-xs text-slate-500">
                {canAccessExecutiveDigest
                  ? 'Automated performance digest across 6 KPI categories, on-time rates, and logged hours'
                  : `Tracking personal deliverable completion, actual hours, and verified proofs for ${currentStaffName}`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            {(['this_week', 'last_week', 'this_month', 'all_time'] as TimeRange[]).map(range => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-lg transition-all capitalize ${
                  timeRange === range
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {range.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Staff Filter Dropdown (Locked if regular staff) */}
          {canAccessExecutiveDigest ? (
            <select
              value={selectedStaffFilter}
              onChange={e => setSelectedStaffFilter(e.target.value)}
              className="text-xs font-semibold px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-slate-700 hover:border-blue-300 transition-colors"
            >
              <option value="all">All Team Members</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : (
            <div className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 flex items-center gap-1.5">
              <IconUsers className="w-3.5 h-3.5 text-blue-600" />
              <span>{currentStaffName}</span>
            </div>
          )}

          {/* 1-Click Excel Export */}
          <button
            type="button"
            onClick={handle1ClickExcel}
            title="Download multi-sheet Excel spreadsheet with deliverables & KPI summary"
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <IconFileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Excel (.xlsx)</span>
          </button>

          {/* 1-Click PDF Report */}
          <button
            type="button"
            onClick={handle1ClickPdf}
            title="Download executive PDF task report"
            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold rounded-xl border border-rose-200 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <IconFileText className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden sm:inline">PDF Report</span>
          </button>

          {/* Full Custom Report Modal Generator Button */}
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            title="Open comprehensive task & KPI report generator with custom filters"
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <IconDownload className="w-3.5 h-3.5" />
            <span>Generate Report</span>
          </button>
        </div>
      </div>

      {/* ── PRINT HEADER (Only visible on print) ── */}
      <div className="hidden print:block border-b border-slate-300 pb-4 mb-4">
        <h1 className="text-2xl font-bold text-slate-900">FirstOption HRIS — Weekly KPI Scorecard</h1>
        <p className="text-sm text-slate-600">
          Scope: {workspaceName} {teamName ? `· Team: ${teamName}` : ''} | Period: {dateRangeInfo.label}
        </p>
      </div>

      {/* ── 4 KEY EXECUTIVE STAT CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Deliverables Completion */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Deliverables Done</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 font-bold text-xs">
              {metrics.completionRate}%
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{metrics.completed}</span>
            <span className="text-xs font-semibold text-slate-400">/ {metrics.total} tasks</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${metrics.completionRate}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 flex items-center gap-1 pt-1">
            <span className="font-semibold text-blue-700">{metrics.inProgress} in progress</span>
            <span>· {metrics.pending} queued</span>
          </p>
        </div>

        {/* On-Time Rate */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">On-Time Execution</span>
            <span className={`p-1.5 rounded-lg font-bold text-xs ${
              metrics.overdueCount === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>{metrics.onTimeRate}%</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{metrics.onTimeRate}%</span>
            <span className="text-xs font-semibold text-slate-400">on schedule</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                metrics.onTimeRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${metrics.onTimeRate}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 pt-1">
            {metrics.overdueCount > 0 ? (
              <span className="text-amber-600 font-semibold flex items-center gap-1">
                <IconAlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>{metrics.overdueCount} task(s) overdue schedule</span>
              </span>
            ) : (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <IconCheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Zero delayed tasks</span>
              </span>
            )}
          </p>
        </div>

        {/* Hours Logged & Budget */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Hours Logged</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700 font-bold text-xs flex items-center gap-1">
              <IconClock className="w-3.5 h-3.5 text-purple-600" />
              <span>{metrics.totalActualHours}h</span>
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{metrics.totalActualHours}</span>
            <span className="text-xs font-semibold text-slate-400">/ {metrics.totalEstHours}h budgeted</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                metrics.totalEstHours > 0 && metrics.totalActualHours > metrics.totalEstHours ? 'bg-red-500' : 'bg-purple-600'
              }`}
              style={{
                width: `${metrics.totalEstHours > 0 ? Math.min(100, Math.round((metrics.totalActualHours / metrics.totalEstHours) * 100)) : 100}%`
              }}
            />
          </div>
          <p className="text-[11px] text-slate-500 pt-1">
            {metrics.totalEstHours > 0 ? (
              <span>
                {Math.round((metrics.totalActualHours / metrics.totalEstHours) * 100)}% budget utilization
              </span>
            ) : (
              <span>Time tracking active</span>
            )}
          </p>
        </div>

        {/* Deliverable Proofs */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Deliverable Proofs</span>
            <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center gap-1 border border-emerald-200/60">
              <IconShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verified</span>
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{metrics.proofCount}</span>
            <span className="text-xs font-semibold text-slate-400">proof submissions</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${metrics.total > 0 ? Math.round((metrics.proofCount / metrics.total) * 100) : 0}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 pt-1">
            {metrics.proofCount > 0 ? `${metrics.proofCount} tasks contain visual proof evidence` : 'No proof submitted yet'}
          </p>
        </div>
      </div>

      {/* ── 6-CATEGORY KPI BREAKDOWN & AUTOMATED PERFORMANCE DIGEST ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 6 KPI Categories Breakdown (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span>KPI Category Performance Breakdown</span>
              </h3>
              <p className="text-xs text-slate-500">Deliverable completion across standard operational domains</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
              6 Categories
            </span>
          </div>

          <div className="space-y-3.5">
            {categoryStats.map(cat => {
              const bgBadgeColor =
                cat.color === 'blue'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : cat.color === 'amber'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : cat.color === 'emerald'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : cat.color === 'purple'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : cat.color === 'rose'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-cyan-50 text-cyan-700 border-cyan-200'

              return (
                <div key={cat.name} className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`p-2 rounded-lg border ${bgBadgeColor} flex items-center justify-center shrink-0`}>
                        {renderCategoryIcon(cat.iconKey)}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{cat.name}</h4>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {cat.completed} done of {cat.total} tasks · {cat.actualHours}h logged
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-extrabold text-slate-900">{cat.completionRate}%</span>
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {cat.inProgress > 0 ? `${cat.inProgress} active` : 'All resolved'}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        cat.completionRate === 100
                          ? 'bg-emerald-500'
                          : cat.completionRate >= 50
                          ? 'bg-blue-600'
                          : cat.completionRate > 0
                          ? 'bg-amber-500'
                          : 'bg-slate-300'
                      }`}
                      style={{ width: `${cat.completionRate}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Automated Performance Digest (5 cols) */}
        <div className="lg:col-span-5 bg-gradient-to-b from-blue-900 to-indigo-950 text-white rounded-2xl p-5 shadow-md flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-400/20">
                  <IconSparkles className="w-4 h-4 text-blue-300" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                    {canAccessExecutiveDigest ? 'Executive Performance Digest' : 'Personal Performance Summary'}
                  </h3>
                  <span className="text-[11px] text-blue-200">
                    {canAccessExecutiveDigest ? 'Synthesized Management Briefing' : 'Individual Output Briefing'}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30">
                Auto-Generated
              </span>
            </div>

            {/* Formatted Summary Box */}
            <div className="bg-black/25 rounded-xl p-3.5 border border-white/10 text-xs text-blue-100 font-mono leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap select-all">
              {generatedDigest}
            </div>
          </div>

          {/* Action Triggers */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10 print:hidden">
            <button
              type="button"
              onClick={handleCopyDigest}
              className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/15 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedDigest ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconSend className="w-3.5 h-3.5" />}
              <span>{copiedDigest ? 'Copied to Clipboard!' : (canAccessExecutiveDigest ? 'Copy Digest' : 'Copy Summary')}</span>
            </button>

            {/* Post to Squad Channel is strictly authorized for Admins & Squad Leads */}
            {canAccessExecutiveDigest && onPostDigestToChat && (
              <button
                type="button"
                onClick={handlePostDigest}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {postedToChat ? <IconCheckCircle className="w-3.5 h-3.5" /> : <IconSend className="w-3.5 h-3.5" />}
                <span>{postedToChat ? 'Posted to Chat!' : 'Post to Channel'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── STAFF PERFORMANCE LEADERBOARD & SCORECARDS ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <IconUsers className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                {canAccessExecutiveDigest
                  ? 'Staff Performance Leaderboard & Individual Scorecards'
                  : 'My Deliverable Performance & Logged Hours'}
              </h3>
              <p className="text-xs text-slate-500">
                {canAccessExecutiveDigest
                  ? 'Individual deliverable outputs, time logged, and milestone proofs'
                  : 'Your verified task outputs, logged time, and milestone completion'}
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
            {canAccessExecutiveDigest ? `${staffLeaderboard.length} Contributors` : 'Personal Record'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Team Member</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 text-center">Tasks Done</th>
                <th className="px-4 py-3 text-center">Completion Rate</th>
                <th className="px-4 py-3 text-center">Hours Logged</th>
                <th className="px-4 py-3 text-center">
                  <div className="inline-flex items-center gap-1 justify-center">
                    <IconTarget className="w-3.5 h-3.5 text-slate-500" />
                    <span>Proofs</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center">Performance Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {staffLeaderboard.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No task metrics recorded for this time range.
                  </td>
                </tr>
              ) : (
                staffLeaderboard.map((staff, idx) => {
                  const rate = staff.total > 0 ? Math.round((staff.completed / staff.total) * 100) : 0
                  const isTop = canAccessExecutiveDigest && idx === 0 && staff.completed > 0 && staff.id !== 'unassigned'

                  return (
                    <tr key={staff.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                          {staff.photo ? (
                            <img src={staff.photo} alt={staff.name} className="w-full h-full object-cover" />
                          ) : (
                            staff.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{staff.name}</span>
                            {isTop && (
                              <span title="Top Contributor" className="inline-flex items-center">
                                <IconAward className="w-3.5 h-3.5 text-amber-500" />
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {staff.total} assigned tasks
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-slate-600">
                        {staff.department}
                      </td>

                      <td className="px-4 py-3 text-center font-bold text-slate-900">
                        {staff.completed} / {staff.total}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className="font-bold text-slate-800">{rate}%</span>
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                rate === 100 ? 'bg-emerald-500' : rate >= 60 ? 'bg-blue-600' : 'bg-amber-500'
                              }`}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-800">
                        {staff.actualHours.toFixed(1)} hrs
                      </td>

                      <td className="px-4 py-3 text-center">
                        {staff.proofs > 0 ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <IconShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>{staff.proofs}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {rate === 100 && staff.completed > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <IconAward className="w-3 h-3 text-emerald-700" />
                            <span>Star Performer</span>
                          </span>
                        ) : rate >= 70 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            <IconZap className="w-3 h-3 text-blue-700" />
                            <span>Solid Output</span>
                          </span>
                        ) : staff.overdue > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                            <IconAlertCircle className="w-3 h-3 text-red-700" />
                            <span>Overdue Alert</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            <IconClock className="w-3 h-3 text-slate-600" />
                            <span>In Progress</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 1-CLICK TASK & KPI REPORT GENERATOR MODAL ── */}
      <TaskReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        tasks={tasks}
        staffList={staffList}
        workspaceName={workspaceName}
        teamName={teamName}
        currentStaffId={currentStaffId}
        currentStaffName={currentStaffName}
        canAccessExecutiveDigest={canAccessExecutiveDigest}
      />
    </div>
  )
}
