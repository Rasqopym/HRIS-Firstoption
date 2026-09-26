import React, { useState } from 'react'
import type { WorkspaceTask, TaskPriority, TaskStatus, StaffMember } from '../../types'
import {
  IconCalendar,
  IconClock,
  IconBell,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconCheckCircle,
  IconAlertCircle,
  IconUser,
  IconFilter,
} from '../icons/ClassicIcons'

interface Props {
  tasks: WorkspaceTask[]
  onSelectTask: (task: WorkspaceTask) => void
  onCreateTaskOnDate: (dateStr: string) => void
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void
  staffList?: StaffMember[]
}

type CalendarSubView = 'month' | 'week' | 'agenda'

const PRIORITY_THEMES: Record<TaskPriority, { border: string; bg: string; text: string; dot: string; label: string }> = {
  urgent: { border: 'border-red-300', bg: 'bg-red-50 hover:bg-red-100/80', text: 'text-red-700', dot: 'bg-red-500', label: 'Urgent' },
  high: { border: 'border-amber-300', bg: 'bg-amber-50 hover:bg-amber-100/80', text: 'text-amber-800', dot: 'bg-amber-500', label: 'High' },
  medium: { border: 'border-blue-300', bg: 'bg-blue-50 hover:bg-blue-100/80', text: 'text-blue-800', dot: 'bg-blue-500', label: 'Medium' },
  low: { border: 'border-slate-300', bg: 'bg-slate-50 hover:bg-slate-100/80', text: 'text-slate-700', dot: 'bg-slate-400', label: 'Low' },
}

const STATUS_LABELS: Record<TaskStatus, { label: string; bg: string; text: string }> = {
  todo: { label: 'To Do', bg: 'bg-slate-100', text: 'text-slate-700' },
  in_progress: { label: 'In Progress', bg: 'bg-blue-100', text: 'text-blue-700' },
  review: { label: 'Review', bg: 'bg-amber-100', text: 'text-amber-800' },
  done: { label: 'Completed', bg: 'bg-emerald-100', text: 'text-emerald-800' },
}

export default function TaskCalendar({
  tasks,
  onSelectTask,
  onCreateTaskOnDate,
  onStatusChange,
  staffList = [],
}: Props) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [calendarView, setCalendarView] = useState<CalendarSubView>('month')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (assigneeFilter !== 'all' && t.assignee_id !== assigneeFilter) return false
    return true
  })

  // Date navigation handlers
  const handlePrev = () => {
    if (calendarView === 'month') {
      setCurrentDate(new Date(year, month - 1, 1))
    } else if (calendarView === 'week') {
      const d = new Date(currentDate)
      d.setDate(d.getDate() - 7)
      setCurrentDate(d)
    } else {
      setCurrentDate(new Date(year, month - 1, 1))
    }
  }

  const handleNext = () => {
    if (calendarView === 'month') {
      setCurrentDate(new Date(year, month + 1, 1))
    } else if (calendarView === 'week') {
      const d = new Date(currentDate)
      d.setDate(d.getDate() + 7)
      setCurrentDate(d)
    } else {
      setCurrentDate(new Date(year, month + 1, 1))
    }
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Format Helper
  const formatTimeDisplay = (timeStr?: string | null) => {
    if (!timeStr) return null
    const [hStr, mStr] = timeStr.split(':')
    let h = parseInt(hStr, 10)
    const m = mStr || '00'
    const ampm = h >= 12 ? 'PM' : 'AM'
    if (h > 12) h -= 12
    if (h === 0) h = 12
    return `${h}:${m} ${ampm}`
  }

  const formatIsoDate = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const todayIso = formatIsoDate(new Date())

  // Generate Month Grid Matrix
  const generateMonthGrid = () => {
    const firstDayIndex = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean }[] = []

    // Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, daysInPrevMonth - i)
      const iso = formatIsoDate(prevDate)
      cells.push({
        dateStr: iso,
        dayNum: daysInPrevMonth - i,
        isCurrentMonth: false,
        isToday: iso === todayIso,
      })
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const curDate = new Date(year, month, day)
      const iso = formatIsoDate(curDate)
      cells.push({
        dateStr: iso,
        dayNum: day,
        isCurrentMonth: true,
        isToday: iso === todayIso,
      })
    }

    // Next month leading days to complete 35 or 42 grid cells
    const remaining = 35 - cells.length > 0 ? 35 - cells.length : (42 - cells.length > 0 ? 42 - cells.length : 0)
    for (let day = 1; day <= remaining; day++) {
      const nextDate = new Date(year, month + 1, day)
      const iso = formatIsoDate(nextDate)
      cells.push({
        dateStr: iso,
        dayNum: day,
        isCurrentMonth: false,
        isToday: iso === todayIso,
      })
    }

    return cells
  }

  // Generate Week Grid Days
  const generateWeekDays = () => {
    const startOfWeek = new Date(currentDate)
    const day = startOfWeek.getDay()
    startOfWeek.setDate(startOfWeek.getDate() - day)

    const weekDays: { date: Date; dateStr: string; dayName: string; dayNum: number; isToday: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(d.getDate() + i)
      const iso = formatIsoDate(d)
      weekDays.push({
        date: d,
        dateStr: iso,
        dayName: dayNames[i],
        dayNum: d.getDate(),
        isToday: iso === todayIso,
      })
    }
    return weekDays
  }

  // Group tasks by date for fast lookup
  const tasksByDate: Record<string, WorkspaceTask[]> = {}
  filteredTasks.forEach(task => {
    const dateKey = task.due_date || (task.created_at ? task.created_at.split('T')[0] : null)
    if (dateKey) {
      if (!tasksByDate[dateKey]) {
        tasksByDate[dateKey] = []
      }
      tasksByDate[dateKey].push(task)
    }
  })

  // Sort tasks by due_time within each date
  Object.keys(tasksByDate).forEach(dateStr => {
    tasksByDate[dateStr].sort((a, b) => {
      const timeA = a.due_time || '23:59'
      const timeB = b.due_time || '23:59'
      return timeA.localeCompare(timeB)
    })
  })

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      {/* ── TOP CALENDAR HEADER BAR ── */}
      <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
        {/* Navigation & Current Month/Year */}
        <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3 w-full md:w-auto">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              title="Previous"
              className="p-1.5 sm:p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <IconChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 border-x border-slate-200 transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              title="Next"
              className="p-1.5 sm:p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <IconChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5 sm:gap-2 truncate">
            <IconCalendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0" />
            <span className="truncate">
              {monthNames[month]} {year}
            </span>
          </h3>
        </div>

        {/* Filters & Subview Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
          {/* Filters 2-column grid on mobile */}
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="w-full sm:w-auto text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Under Review</option>
              <option value="done">Completed</option>
            </select>
          </div>

          {/* Subview Switcher: equal widths on mobile */}
          <div className="grid grid-cols-3 sm:flex items-center bg-slate-200/80 p-0.5 rounded-lg border border-slate-300 w-full sm:w-auto">
            <button
              onClick={() => setCalendarView('month')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all text-center ${
                calendarView === 'month'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setCalendarView('week')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all text-center ${
                calendarView === 'week'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setCalendarView('agenda')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all text-center ${
                calendarView === 'agenda'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Agenda
            </button>
          </div>
        </div>
      </div>

      {/* ── 1. MONTH VIEW ── */}
      {calendarView === 'month' && (
        <div className="flex flex-col">
          {/* Weekday Labels */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-center py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">
            {dayNames.map(day => (
              <div key={day}>
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden inline">{day.charAt(0)}</span>
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 border-collapse">
            {generateMonthGrid().map((cell, idx) => {
              const dayTasks = tasksByDate[cell.dateStr] || []

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (window.innerWidth < 640 && dayTasks.length > 0) {
                      setCurrentDate(new Date(cell.dateStr))
                      setCalendarView('agenda')
                    }
                  }}
                  className={`min-h-[58px] sm:min-h-[120px] p-1 sm:p-2 border-r border-b border-slate-200 transition-colors flex flex-col group relative ${
                    cell.isCurrentMonth ? 'bg-white' : 'bg-slate-50/50 text-slate-400'
                  } ${cell.isToday ? 'bg-blue-50/30' : ''}`}
                >
                  {/* Cell Header: Day Number + Quick Add Task Button */}
                  <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                    <span
                      className={`text-[10px] sm:text-xs font-bold rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center ${
                        cell.isToday
                          ? 'bg-blue-600 text-white font-extrabold shadow-xs'
                          : cell.isCurrentMonth
                          ? 'text-slate-800'
                          : 'text-slate-400'
                      }`}
                    >
                      {cell.dayNum}
                    </span>

                    <button
                      type="button"
                      title={`Create task on ${cell.dateStr}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onCreateTaskOnDate(cell.dateStr)
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 sm:p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <IconPlus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>

                  {/* Mobile Compact Indicators (< sm) */}
                  <div className="sm:hidden flex flex-wrap gap-1 mt-0.5 items-center justify-center">
                    {dayTasks.slice(0, 3).map((t, tIdx) => (
                      <span
                        key={tIdx}
                        className={`w-1.5 h-1.5 rounded-full ${
                          t.priority === 'urgent' ? 'bg-red-500' :
                          t.priority === 'high' ? 'bg-amber-500' :
                          t.priority === 'medium' ? 'bg-blue-500' : 'bg-slate-400'
                        }`}
                      />
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[8px] font-bold text-slate-500">+{dayTasks.length - 3}</span>
                    )}
                  </div>

                  {/* Desktop Tasks in this Day Cell (>= sm) */}
                  <div className="hidden sm:block space-y-1.5 flex-1 overflow-hidden">
                    {dayTasks.slice(0, 3).map(task => {
                      const theme = PRIORITY_THEMES[task.priority]
                      const isDone = task.status === 'done'

                      return (
                        <div
                          key={task.id}
                          onClick={() => onSelectTask(task)}
                          className={`p-1.5 rounded-lg border text-left cursor-pointer transition-all shadow-2xs ${
                            theme.bg
                          } ${theme.border} ${isDone ? 'opacity-60 line-through bg-emerald-50 border-emerald-200' : ''}`}
                          title={`${task.title} ${task.due_time ? `(${formatTimeDisplay(task.due_time)})` : ''}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-semibold text-slate-900 truncate flex-1">
                              {task.title}
                            </span>
                            {task.reminder_type && task.reminder_type !== 'none' && (
                              <IconBell className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[10px] mt-0.5 text-slate-600">
                            {task.due_time ? (
                              <span className="font-bold flex items-center gap-0.5 text-slate-700">
                                <IconClock className="w-2.5 h-2.5 text-slate-500" />
                                {formatTimeDisplay(task.due_time)}
                              </span>
                            ) : (
                              <span className="text-[9px] uppercase font-bold text-slate-400">All day</span>
                            )}

                            {task.assignee && (
                              <span className="truncate max-w-[60px] text-slate-500 text-[9px]">
                                {task.assignee.name.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {dayTasks.length > 3 && (
                      <button
                        onClick={() => {
                          setCalendarView('agenda')
                          setCurrentDate(new Date(cell.dateStr))
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 text-left block w-full pt-0.5"
                      >
                        +{dayTasks.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 2. WEEK VIEW ── */}
      {calendarView === 'week' && (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 divide-x divide-slate-200 min-w-[700px] min-h-[500px]">
          {generateWeekDays().map((dayObj, i) => {
            const dayTasks = tasksByDate[dayObj.dateStr] || []

            return (
              <div
                key={i}
                className={`p-3 flex flex-col space-y-3 ${dayObj.isToday ? 'bg-blue-50/20' : 'bg-white'}`}
              >
                {/* Day Header */}
                <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                      {dayObj.dayName}
                    </span>
                    <span
                      className={`text-base font-extrabold ${
                        dayObj.isToday ? 'text-blue-600' : 'text-slate-800'
                      }`}
                    >
                      {dayObj.dayNum}
                    </span>
                  </div>

                  <button
                    onClick={() => onCreateTaskOnDate(dayObj.dateStr)}
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title={`Create task on ${dayObj.dateStr}`}
                  >
                    <IconPlus className="w-4 h-4" />
                  </button>
                </div>

                {/* Day Tasks List */}
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {dayTasks.length === 0 ? (
                    <div className="h-24 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-[11px] text-slate-400">
                      No tasks
                    </div>
                  ) : (
                    dayTasks.map(task => {
                      const theme = PRIORITY_THEMES[task.priority]
                      const isDone = task.status === 'done'

                      return (
                        <div
                          key={task.id}
                          onClick={() => onSelectTask(task)}
                          className={`p-2.5 rounded-xl border cursor-pointer hover:shadow-md transition-all space-y-1.5 ${
                            theme.bg
                          } ${theme.border} ${isDone ? 'opacity-65 line-through' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${theme.border} ${theme.text}`}>
                              {theme.label}
                            </span>
                            {task.reminder_type && task.reminder_type !== 'none' && (
                              <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                                <IconBell className="w-2.5 h-2.5" />
                                <span>Reminder</span>
                              </span>
                            )}
                          </div>

                          <h5 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                            {task.title}
                          </h5>

                          <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-black/5">
                            <span className="font-semibold flex items-center gap-1">
                              <IconClock className="w-3 h-3 text-slate-400" />
                              {task.due_time ? formatTimeDisplay(task.due_time) : 'All Day'}
                            </span>
                            {task.assignee && (
                              <span className="text-[10px] font-medium text-slate-500 truncate max-w-[80px]">
                                {task.assignee.name.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}

      {/* ── 3. AGENDA VIEW ── */}
      {calendarView === 'agenda' && (
        <div className="p-4 space-y-6 max-h-[calc(100vh-280px)] overflow-y-auto">
          {Object.keys(tasksByDate).length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <IconCalendar className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-medium">No tasks scheduled with due dates.</p>
            </div>
          ) : (
            Object.keys(tasksByDate)
              .sort()
              .map(dateStr => {
                const dayTasks = tasksByDate[dateStr]
                const d = new Date(`${dateStr}T00:00:00`)
                const isToday = dateStr === todayIso

                return (
                  <div key={dateStr} className="space-y-2.5">
                    <div className="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                      <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isToday ? 'text-blue-700' : 'text-slate-700'}`}>
                        <IconCalendar className="w-3.5 h-3.5" />
                        {d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                        {isToday && (
                          <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                            Today
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => onCreateTaskOnDate(dateStr)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <IconPlus className="w-3.5 h-3.5" />
                        <span>Add Task</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {dayTasks.map(task => {
                        const theme = PRIORITY_THEMES[task.priority]
                        const statusBadge = STATUS_LABELS[task.status]
                        const isDone = task.status === 'done'

                        return (
                          <div
                            key={task.id}
                            onClick={() => onSelectTask(task)}
                            className={`p-3.5 rounded-xl border bg-white hover:shadow-md transition-all cursor-pointer space-y-2 border-slate-200 ${
                              isDone ? 'opacity-65' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${theme.bg} ${theme.text} ${theme.border}`}>
                                {theme.label}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.bg} ${statusBadge.text}`}>
                                {statusBadge.label}
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-slate-800 line-clamp-2">
                              {task.title}
                            </h4>

                            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                              <span className="flex items-center gap-1 font-semibold text-slate-700">
                                <IconClock className="w-3.5 h-3.5 text-blue-600" />
                                {task.due_time ? formatTimeDisplay(task.due_time) : 'All Day'}
                              </span>

                              {task.reminder_type && task.reminder_type !== 'none' && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  <IconBell className="w-3 h-3 text-amber-600" />
                                  <span>{task.reminder_type.replace('_', ' ')}</span>
                                </span>
                              )}
                            </div>

                            {task.assignee && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-600 pt-1">
                                <IconUser className="w-3.5 h-3.5 text-slate-400" />
                                <span className="font-medium">{task.assignee.name}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
          )}
        </div>
      )}
    </div>
  )
}
