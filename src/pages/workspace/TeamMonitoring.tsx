import React, { useState, useEffect, useMemo } from 'react'
import type { WorkspaceTask, DailyStandup, StaffMember } from '../../types'
import { getWorkspaceTasks, getDailyStandups, submitDailyStandup } from '../../lib/workspaceManager'
import { generateExecutiveStandupDigest, isGeminiConfigured } from '../../lib/geminiService'
import {
  IconChart,
  IconCalendar,
  IconClock,
  IconPlus,
  IconCheckCircle,
  IconAlertCircle,
  IconCheck,
  IconUser,
  IconFlame,
  IconActivity,
  IconUsers,
  IconShieldCheck,
  IconSparkles,
  IconWand,
} from '../../components/icons/ClassicIcons'

interface Props {
  workspaceId?: string
  teamId?: string
  staffList?: StaffMember[]
  currentStaffId?: string | null
  currentStaffName?: string
  canAccessExecutiveDigest?: boolean
  squadName?: string
  onPostDigestToChat?: (digest: string) => void
}

export default function TeamMonitoring({
  workspaceId,
  teamId,
  staffList = [],
  currentStaffId,
  currentStaffName = 'Staff Member',
  canAccessExecutiveDigest = true,
  squadName,
  onPostDigestToChat,
}: Props) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([])
  const [standups, setStandups] = useState<DailyStandup[]>([])
  const [loading, setLoading] = useState(true)
  const [showStandupModal, setShowStandupModal] = useState(false)

  // Standup form
  const [yesterdayWork, setYesterdayWork] = useState('')
  const [todayPlan, setTodayPlan] = useState('')
  const [blockers, setBlockers] = useState('')
  const [submittingStandup, setSubmittingStandup] = useState(false)
  const [standupSuccess, setStandupSuccess] = useState(false)
  const [aiDigestLoading, setAiDigestLoading] = useState(false)
  const [aiDigestModal, setAiDigestModal] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [workspaceId, teamId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [tData, sData] = await Promise.all([
        getWorkspaceTasks(workspaceId, teamId),
        getDailyStandups(teamId),
      ])
      setTasks(tData)
      setStandups(sData)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateAiStandupDigest = async () => {
    if (!isGeminiConfigured()) {
      alert('Please configure your Google Gemini API key first using the ✨ Gemini AI button in the top navigation bar.')
      return
    }

    setAiDigestLoading(true)
    try {
      const digest = await generateExecutiveStandupDigest({
        squadName: squadName || 'Core Squad',
        date: today,
        standups: standups.map(s => {
          const st = staffList.find(stf => stf.id === s.staff_id)
          return {
            staffName: st?.name || s.staff?.name || 'Staff Member',
            planToday: s.today_plan,
            blockers: s.blockers,
            accomplishedYesterday: s.yesterday_work,
          }
        }),
        tasksSummary: {
          totalTasks,
          completedTasks,
          inFlightTasks: inProgressTasks,
          overdueTasks: overdueTasks.length,
        },
      })
      setAiDigestModal(digest)
    } catch (err: any) {
      alert(`Gemini AI Error: ${err.message || 'Failed to generate standup synthesis.'}`)
    } finally {
      setAiDigestLoading(false)
    }
  }

  const handleStandupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentStaffId || !yesterdayWork.trim() || !todayPlan.trim()) return

    setSubmittingStandup(true)
    try {
      const created = await submitDailyStandup({
        workspace_id: workspaceId || 'ws-main',
        team_id: teamId || 'team-general',
        staff_id: currentStaffId,
        yesterday_work: yesterdayWork.trim(),
        today_plan: todayPlan.trim(),
        blockers: blockers.trim(),
      })

      setStandups(prev => [created, ...prev.filter(s => s.staff_id !== currentStaffId)])
      setStandupSuccess(true)
      setTimeout(() => {
        setStandupSuccess(false)
        setShowStandupModal(false)
        setYesterdayWork('')
        setTodayPlan('')
        setBlockers('')
      }, 1500)
    } finally {
      setSubmittingStandup(false)
    }
  }

  // Calculate Metrics based on Role (Manager/Lead vs Regular Staff)
  const today = new Date().toISOString().split('T')[0]

  const relevantTasks = useMemo(() => {
    if (canAccessExecutiveDigest) return tasks
    return tasks.filter(t => t.assignee_id === currentStaffId)
  }, [tasks, canAccessExecutiveDigest, currentStaffId])

  const totalTasks = relevantTasks.length
  const completedTasks = relevantTasks.filter(t => t.status === 'done').length
  const inProgressTasks = relevantTasks.filter(t => t.status === 'in_progress' || t.status === 'review').length
  const todoTasks = relevantTasks.filter(t => t.status === 'todo').length
  const overdueTasks = relevantTasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < today)
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const hasMyStandupToday = useMemo(() => {
    return standups.some(s => s.staff_id === currentStaffId)
  }, [standups, currentStaffId])

  // Workload Map (Full for Leads, Filtered for Staff)
  const staffWorkloadMap: Record<
    string,
    { total: number; done: number; inProgress: number; overdue: number; name: string; department?: string }
  > = {}

  tasks.forEach(t => {
    const sId = t.assignee_id || 'unassigned'
    // If regular staff, only record their own workload row
    if (!canAccessExecutiveDigest && sId !== currentStaffId) {
      return
    }

    const sName = t.assignee?.name || (sId === 'unassigned' ? 'Unassigned' : 'Staff Member')
    const sDept = t.assignee?.department || 'General'

    if (!staffWorkloadMap[sId]) {
      staffWorkloadMap[sId] = { total: 0, done: 0, inProgress: 0, overdue: 0, name: sName, department: sDept }
    }
    staffWorkloadMap[sId].total += 1
    if (t.status === 'done') staffWorkloadMap[sId].done += 1
    if (t.status === 'in_progress' || t.status === 'review') staffWorkloadMap[sId].inProgress += 1
    if (t.status !== 'done' && t.due_date && t.due_date < today) staffWorkloadMap[sId].overdue += 1
  })

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Check-in */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 rounded-2xl p-5 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-xs px-2.5 py-0.5 rounded-full text-xs font-semibold">
            <IconActivity className="w-3.5 h-3.5" />
            <span>{canAccessExecutiveDigest ? 'Daily Team Pulse & Health' : 'My Daily Standup & Productivity'}</span>
          </div>
          <h2 className="text-xl font-bold">
            {canAccessExecutiveDigest ? 'Team Productivity & Velocity Monitor' : 'My Daily Standup & Activity Monitor'}
          </h2>
          <p className="text-xs text-blue-100 max-w-xl">
            {canAccessExecutiveDigest
              ? 'Real-time delivery progress, milestone health, workload balance, and asynchronous daily standups.'
              : `Track your daily focus, submit morning standup check-ins, and coordinate seamlessly with ${currentStaffName}'s squad.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleGenerateAiStandupDigest}
            disabled={aiDigestLoading}
            className="bg-white/20 hover:bg-white/30 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs transition-all border border-white/30 flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            title="Use Gemini AI to synthesize all standup check-ins and overdue velocity"
          >
            <IconSparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{aiDigestLoading ? 'AI Synthesizing...' : '✨ AI Standup & Velocity Synthesis'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowStandupModal(true)}
          className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md self-start sm:self-auto flex items-center gap-1.5 cursor-pointer"
        >
          <IconPlus className="w-3.5 h-3.5" />
          <span>{hasMyStandupToday ? 'Update Today\'s Standup' : 'Submit Daily Standup'}</span>
        </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Completion Rate */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            {canAccessExecutiveDigest ? 'Completion Rate' : 'My Completion Rate'}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{completionRate}%</span>
            <span className="text-xs text-emerald-600 font-semibold">{completedTasks}/{totalTasks} Done</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${completionRate}%` }} />
          </div>
        </div>

        {/* In Progress & Velocity */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            {canAccessExecutiveDigest ? 'Active In-Flight' : 'My Active Tasks'}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-blue-600">{inProgressTasks}</span>
            <span className="text-xs text-slate-500 font-medium">In motion</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{todoTasks} queued in backlog</p>
        </div>

        {/* Overdue Alarms */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            {canAccessExecutiveDigest ? 'Overdue Risk' : 'My Overdue Tasks'}
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${overdueTasks.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {overdueTasks.length}
            </span>
            <span className="text-xs text-slate-500 font-medium">Missed deadlines</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {overdueTasks.length === 0 ? 'All tasks on schedule' : (canAccessExecutiveDigest ? 'Requires escalation' : 'Needs attention')}
          </p>
        </div>

        {/* Today's Standups Status */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            {canAccessExecutiveDigest ? 'Daily Check-Ins' : 'My Standup Status'}
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${canAccessExecutiveDigest ? 'text-indigo-600' : (hasMyStandupToday ? 'text-emerald-600' : 'text-amber-600')}`}>
              {canAccessExecutiveDigest ? standups.length : (hasMyStandupToday ? 'Logged' : 'Pending')}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {canAccessExecutiveDigest ? 'Reported today' : 'Today\'s Check-in'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {hasMyStandupToday ? '✓ Check-in recorded' : 'Please submit morning focus'}
          </p>
        </div>
      </div>

      {/* Grid: Workload Balance + Daily Standup Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Workload Distribution & Overdue Tasks */}
        <div className="lg:col-span-2 space-y-6">
          {/* Workload Distribution Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {canAccessExecutiveDigest ? 'Staff Workload & Capacity Heatmap' : 'My Current Workload & Queue'}
                </h3>
                <p className="text-xs text-slate-500">
                  {canAccessExecutiveDigest
                    ? 'Monitor individual task loading to ensure balanced team distribution'
                    : 'Personal active workload allocation and deliverable completion status'}
                </p>
              </div>
            </div>

            {Object.keys(staffWorkloadMap).length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">No assigned tasks currently.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(staffWorkloadMap).map(([sId, stats]) => {
                  const staffPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0
                  return (
                    <div key={sId} className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                            {stats.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-800 block">{stats.name}</span>
                            <span className="text-[10px] text-slate-400">{stats.department || 'Staff'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                            {stats.inProgress} active
                          </span>
                          {stats.overdue > 0 && (
                            <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                              {stats.overdue} overdue
                            </span>
                          )}
                          <span className="font-bold text-slate-700">{staffPct}% complete</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${staffPct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Overdue Bottlenecks */}
          {overdueTasks.length > 0 && (
            <div className="bg-red-50/60 border border-red-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                <IconAlertCircle className="w-4 h-4 text-red-600" />
                <span>
                  {canAccessExecutiveDigest
                    ? `Overdue Tasks Requiring Attention (${overdueTasks.length})`
                    : `My Overdue Tasks Requiring Action (${overdueTasks.length})`}
                </span>
              </div>
              <div className="space-y-2">
                {overdueTasks.map(t => (
                  <div key={t.id} className="bg-white p-3 rounded-lg border border-red-100 shadow-xs flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">{t.title}</span>
                      <span className="text-[11px] text-slate-500">
                        Assigned to: <strong className="text-slate-700">{t.assignee?.name || 'Unassigned'}</strong> • Due Date: <span className="text-red-600 font-semibold">{t.due_date}</span>
                      </span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 shrink-0">
                      Overdue
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Daily Standup Roll-Up Feed */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <IconCalendar className="w-4 h-4 text-blue-600" />
                <span>Today's Squad Standups ({standups.length})</span>
              </h3>
            </div>

            {standups.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 space-y-2">
                <p>No standup check-ins submitted yet today.</p>
                <button
                  onClick={() => setShowStandupModal(true)}
                  className="text-blue-600 font-bold hover:underline block mx-auto cursor-pointer"
                >
                  Be the first to submit
                </button>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[600px] overflow-y-auto pr-1">
                {standups.map(s => {
                  const isMe = s.staff_id === currentStaffId
                  return (
                    <div
                      key={s.id}
                      className={`p-3.5 rounded-xl border space-y-2 text-xs transition-colors ${
                        isMe ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200/80 bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{s.staff?.name || 'Staff'}</span>
                          {isMe && (
                            <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full">
                              You
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Yesterday */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Completed Yesterday</span>
                        <p className="text-slate-700 mt-0.5 leading-relaxed">{s.yesterday_work}</p>
                      </div>

                      {/* Today */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Today's Focus</span>
                        <p className="text-slate-700 mt-0.5 leading-relaxed">{s.today_plan}</p>
                      </div>

                      {/* Blockers */}
                      {s.blockers && (
                        <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-amber-900">
                          <span className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 text-amber-800">
                            <IconAlertCircle className="w-3 h-3 text-amber-700" />
                            <span>Blockers / Needs Support</span>
                          </span>
                          <p className="mt-0.5">{s.blockers}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── DAILY STANDUP MODAL ── */}
      {showStandupModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Daily Standup Check-in</h3>
                <p className="text-xs text-slate-500">Quick 2-minute async update for your squad</p>
              </div>
              <button
                onClick={() => setShowStandupModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {standupSuccess ? (
              <div className="p-6 text-center text-emerald-600 font-bold text-sm animate-pulse flex items-center justify-center gap-2">
                <IconCheckCircle className="w-5 h-5 text-emerald-600" />
                <span>Daily Standup Submitted Successfully!</span>
              </div>
            ) : (
              <form onSubmit={handleStandupSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                    1. What did you accomplish yesterday? *
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Finalized onboarding documentation and resolved client tickets..."
                    value={yesterdayWork}
                    onChange={e => setYesterdayWork(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                    2. What is your main focus today? *
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Deploy inventory sync and coordinate afternoon meeting..."
                    value={todayPlan}
                    onChange={e => setTodayPlan(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                    3. Do you have any blockers or require team support? (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Waiting on API credentials or supervisor review..."
                    value={blockers}
                    onChange={e => setBlockers(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowStandupModal(false)}
                    className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingStandup}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {submittingStandup ? 'Saving...' : 'Submit Standup'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
