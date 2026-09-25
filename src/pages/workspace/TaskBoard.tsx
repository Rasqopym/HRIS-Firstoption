import React, { useState, useEffect } from 'react'
import type { WorkspaceTask, TaskPriority, TaskStatus, StaffMember, RecurrenceInterval, TaskComment, TaskTimeLog, ActiveTaskTimer } from '../../types'
import {
  getWorkspaceTasks,
  createWorkspaceTask,
  updateTaskStatus,
  updateWorkspaceTask,
  deleteWorkspaceTask,
  addTaskComment,
  deleteTaskComment,
  getActiveTaskTimer,
  startTaskTimer,
  stopTaskTimer,
  cancelTaskTimer,
  logTaskTimeManually,
  deleteTaskTimeLog,
} from '../../lib/workspaceManager'
import { uploadCompressedImage, formatFileSize, extractClipboardImage } from '../../lib/imageCompressor'
import {
  generateTaskBreakdown,
  polishTaskDetails,
  summarizeTaskThread,
  isGeminiConfigured,
} from '../../lib/geminiService'
import { supabase } from '../../lib/supabase'
import {
  IconSearch,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconCalendar,
  IconPlus,
  IconPencil,
  IconTrash,
  IconAlertCircle,
  IconFilter,
  IconImage,
  IconBell,
  IconRepeat,
  IconChat,
  IconChart,
  IconDownload,
  IconFileSpreadsheet,
  IconSparkles,
  IconWand,
} from '../../components/icons/ClassicIcons'
import TaskCalendar from '../../components/workspace/TaskCalendar'
import KpiScorecard from '../../components/workspace/KpiScorecard'
import TaskReportModal from '../../components/workspace/TaskReportModal'

interface Props {
  workspaceId?: string
  teamId?: string
  workspaceName?: string
  teamName?: string
  staffList?: StaffMember[]
  currentStaffId?: string | null
  currentStaffName?: string
  canAccessExecutiveDigest?: boolean
  onTaskCreated?: (task: WorkspaceTask) => void
  onPostDigestToChat?: (digestText: string) => void
  initialView?: 'kanban' | 'list' | 'calendar' | 'scorecard'
}

const COLUMNS: { key: TaskStatus; label: string; color: string; bg: string; border: string }[] = [
  { key: 'todo', label: 'To Do', color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
  { key: 'in_progress', label: 'In Progress', color: 'text-blue-700', bg: 'bg-blue-50/50', border: 'border-blue-200' },
  { key: 'review', label: 'Under Review', color: 'text-amber-700', bg: 'bg-amber-50/50', border: 'border-amber-200' },
  { key: 'done', label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50/50', border: 'border-emerald-200' },
]

const PRIORITY_BADGES: Record<TaskPriority, { bg: string; text: string; label: string }> = {
  urgent: { bg: 'bg-red-100 border-red-200', text: 'text-red-700', label: 'Urgent' },
  high: { bg: 'bg-amber-100 border-amber-200', text: 'text-amber-700', label: 'High' },
  medium: { bg: 'bg-blue-100 border-blue-200', text: 'text-blue-700', label: 'Medium' },
  low: { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', label: 'Low' },
}

export default function TaskBoard({
  workspaceId,
  teamId,
  workspaceName,
  teamName,
  staffList = [],
  currentStaffId,
  currentStaffName = 'HRIS User',
  canAccessExecutiveDigest = true,
  onTaskCreated,
  onPostDigestToChat,
  initialView = 'kanban',
}: Props) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [selectedTask, setSelectedTask] = useState<WorkspaceTask | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'calendar' | 'scorecard'>(initialView)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiSummaryModal, setAiSummaryModal] = useState<string | null>(null)
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)

  // Edit Task State
  const [editingTask, setEditingTask] = useState<WorkspaceTask | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium')
  const [editStatus, setEditStatus] = useState<TaskStatus>('todo')
  const [editAssignee, setEditAssignee] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editDueTime, setEditDueTime] = useState('')
  const [editReminderType, setEditReminderType] = useState<WorkspaceTask['reminder_type']>('none')
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceInterval>('none')
  const [editKpi, setEditKpi] = useState('Operations, Admin & Compliance')
  const [editChecklist, setEditChecklist] = useState<Array<{ id: string; text: string; completed: boolean }>>([])
  const [newEditChecklistText, setNewEditChecklistText] = useState('')

  useEffect(() => {
    if (initialView) {
      setViewMode(initialView)
    }
  }, [initialView])

  // Create Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [newTaskDueTime, setNewTaskDueTime] = useState('')
  const [newTaskReminderType, setNewTaskReminderType] = useState<WorkspaceTask['reminder_type']>('none')
  const [newTaskRecurrence, setNewTaskRecurrence] = useState<RecurrenceInterval>('none')
  const [newTaskHours, setNewTaskHours] = useState('2')
  const [newTaskKpi, setNewTaskKpi] = useState('Operations, Admin & Compliance')
  const [newChecklistText, setNewChecklistText] = useState('')
  const [newTaskChecklist, setNewTaskChecklist] = useState<string[]>([])
  const [newTaskImages, setNewTaskImages] = useState<any[]>([])
  const [compressingImage, setCompressingImage] = useState(false)
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null)

  // Task Discussion & Proof Comments State
  const [commentText, setCommentText] = useState('')
  const [isProofComment, setIsProofComment] = useState(false)
  const [commentImages, setCommentImages] = useState<any[]>([])
  const [isPostingComment, setIsPostingComment] = useState(false)
  const [compressingCommentImg, setCompressingCommentImg] = useState(false)

  // Live Timer & Manual Time Tracking State
  const [activeTimer, setActiveTimer] = useState<ActiveTaskTimer | null>(getActiveTaskTimer())
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [showManualLogModal, setShowManualLogModal] = useState(false)
  const [manualMinutes, setManualMinutes] = useState('30')
  const [manualNotes, setManualNotes] = useState('')
  const [stopTimerNotes, setStopTimerNotes] = useState('')
  const [showStopTimerModal, setShowStopTimerModal] = useState(false)

  // Realtime Timer Ticker
  useEffect(() => {
    const checkTimer = () => {
      const current = getActiveTaskTimer()
      setActiveTimer(current)
      if (current && current.isRunning) {
        const elapsed = Math.floor((Date.now() - current.startTime) / 1000)
        setTimerSeconds(elapsed)
      } else {
        setTimerSeconds(0)
      }
    }

    checkTimer()
    const interval = setInterval(checkTimer, 1000)

    const handleTimerUpdate = (e: any) => {
      setActiveTimer(e.detail || null)
      if (e.detail?.startTime) {
        setTimerSeconds(Math.floor((Date.now() - e.detail.startTime) / 1000))
      } else {
        setTimerSeconds(0)
      }
    }

    window.addEventListener('task_timer_updated', handleTimerUpdate)

    return () => {
      clearInterval(interval)
      window.removeEventListener('task_timer_updated', handleTimerUpdate)
    }
  }, [])

  const formatTimerDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 1. Auto-synchronization & Realtime loading
  useEffect(() => {
    loadTasks()

    const handleSync = () => {
      loadTasks()
    }

    window.addEventListener('workspace_task_created', handleSync)
    window.addEventListener('workspace_task_updated', handleSync)
    window.addEventListener('workspace_task_deleted', handleSync)
    window.addEventListener('storage', handleSync)

    // Supabase Realtime channel subscription
    const channel = supabase
      .channel(`realtime:tasks:${workspaceId || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => {
          loadTasks()
        }
      )
      .subscribe()

    return () => {
      window.removeEventListener('workspace_task_created', handleSync)
      window.removeEventListener('workspace_task_updated', handleSync)
      window.removeEventListener('workspace_task_deleted', handleSync)
      window.removeEventListener('storage', handleSync)
      supabase.removeChannel(channel)
    }
  }, [workspaceId, teamId])

  const loadTasks = async () => {
    setLoading(true)
    try {
      const data = await getWorkspaceTasks(workspaceId, teamId)
      setTasks(data)
      setSelectedTask(prev => {
        if (!prev) return null
        const found = data.find(t => t.id === prev.id)
        return found || prev
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    // Optimistic UI update
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)))
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask({ ...selectedTask, status: newStatus })
    }
    await updateTaskStatus(taskId, newStatus, currentStaffId || undefined)
  }

  // Edit Task Handlers
  const handleOpenEditTask = (task: WorkspaceTask, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingTask(task)
    setEditTitle(task.title)
    setEditDesc(task.description || '')
    setEditPriority(task.priority || 'medium')
    setEditStatus(task.status || 'todo')
    setEditAssignee(task.assignee_id || '')
    setEditDueDate(task.due_date || '')
    setEditDueTime(task.due_time || '')
    setEditReminderType(task.reminder_type || 'none')
    setEditRecurrence(task.recurrence_interval || (task.is_recurring ? 'weekly' : 'none'))
    setEditKpi(task.kpi_category || 'Operations, Admin & Compliance')
    setEditChecklist(task.checklist || [])
    setNewEditChecklistText('')
  }

  const handleSaveEditTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTask || !editTitle.trim()) return

    const assignedStaff = staffList.find(s => s.id === editAssignee)
    const updates: Partial<WorkspaceTask> = {
      title: editTitle.trim(),
      description: editDesc.trim(),
      priority: editPriority,
      status: editStatus,
      assignee_id: editAssignee || null,
      due_date: editDueDate || null,
      due_time: editDueTime || null,
      reminder_type: editReminderType,
      is_recurring: editRecurrence !== 'none',
      recurrence_interval: editRecurrence,
      kpi_category: editKpi,
      checklist: editChecklist,
      assignee: assignedStaff ? {
        id: assignedStaff.id,
        name: assignedStaff.name,
        photo: assignedStaff.photo,
        department: assignedStaff.department,
      } : undefined,
    }

    const updated = await updateWorkspaceTask(editingTask.id, updates, currentStaffId || undefined)
    if (updated) {
      setTasks(prev => prev.map(t => (t.id === editingTask.id ? { ...t, ...updates } : t)))
      if (selectedTask?.id === editingTask.id) {
        setSelectedTask({ ...selectedTask, ...updates })
      }
    }
    setEditingTask(null)
  }

  const handleDeleteTask = async (taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (confirm('Are you sure you want to permanently delete this task?')) {
      await deleteWorkspaceTask(taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
      if (selectedTask?.id === taskId) {
        setSelectedTask(null)
      }
      if (editingTask?.id === taskId) {
        setEditingTask(null)
      }
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setCompressingImage(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const compressed = await uploadCompressedImage(file, file.name, 'tasks')
        setNewTaskImages(prev => [...prev, compressed])
      }
    } catch (err: any) {
      alert(err.message || 'Failed to compress image.')
    } finally {
      setCompressingImage(false)
    }
  }

  const handlePasteImage = async (e: React.ClipboardEvent) => {
    const file = await extractClipboardImage(e)
    if (!file) return
    setCompressingImage(true)
    try {
      const compressed = await uploadCompressedImage(file, 'clipboard_screenshot.webp', 'tasks')
      setNewTaskImages(prev => [...prev, compressed])
    } catch (err: any) {
      alert(err.message || 'Failed to compress screenshot')
    } finally {
      setCompressingImage(false)
    }
  }

  // Task Comments Handlers
  const handleAddComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedTask || (!commentText.trim() && commentImages.length === 0)) return
    setIsPostingComment(true)
    try {
      const currentStaff = staffList.find(s => s.id === currentStaffId)
      const newComment = await addTaskComment(selectedTask.id, {
        staff_id: currentStaffId || 'user',
        staff_name: currentStaff?.name || 'Staff Member',
        staff_photo: currentStaff?.photo,
        staff_department: currentStaff?.department,
        content: commentText.trim(),
        is_proof: isProofComment,
        attachments: commentImages,
      })

      const updatedComments = [...(selectedTask.comments || []), newComment]
      const updatedTask = { ...selectedTask, comments: updatedComments }
      setSelectedTask(updatedTask)
      setTasks(prev => prev.map(t => (t.id === selectedTask.id ? updatedTask : t)))
      setCommentText('')
      setIsProofComment(false)
      setCommentImages([])
    } catch (err: any) {
      alert(err.message || 'Failed to post comment')
    } finally {
      setIsPostingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedTask) return
    if (confirm('Are you sure you want to delete this comment?')) {
      await deleteTaskComment(selectedTask.id, commentId)
      const updatedComments = (selectedTask.comments || []).filter(c => c.id !== commentId)
      const updatedTask = { ...selectedTask, comments: updatedComments }
      setSelectedTask(updatedTask)
      setTasks(prev => prev.map(t => (t.id === selectedTask.id ? updatedTask : t)))
    }
  }

  const handleCommentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setCompressingCommentImg(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const compressed = await uploadCompressedImage(file, file.name, 'task-comments')
        setCommentImages(prev => [...prev, compressed])
      }
    } catch (err: any) {
      alert(err.message || 'Failed to upload proof image')
    } finally {
      setCompressingCommentImg(false)
    }
  }

  // ── Live Task Timer Handlers ──
  const handleStartTimer = (task: WorkspaceTask, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const currentStaff = staffList.find(s => s.id === currentStaffId)
    const timer = startTaskTimer({
      taskId: task.id,
      taskTitle: task.title,
      staffId: currentStaffId || 'user',
      staffName: currentStaff?.name || 'Staff Member',
    })
    setActiveTimer(timer)
  }

  const handleOpenStopTimerModal = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setStopTimerNotes('')
    setShowStopTimerModal(true)
  }

  const handleConfirmStopTimer = async () => {
    const res = await stopTaskTimer(stopTimerNotes.trim())
    setShowStopTimerModal(false)
    setStopTimerNotes('')
    setActiveTimer(null)
    if (res && selectedTask && selectedTask.id === res.updatedTask.id) {
      setSelectedTask(res.updatedTask)
    }
    loadTasks()
  }

  const handleCancelTimer = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (confirm('Discard current timer without saving?')) {
      cancelTaskTimer()
      setActiveTimer(null)
    }
  }

  const handleManualLogTime = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTask) return
    const mins = parseInt(manualMinutes, 10)
    if (isNaN(mins) || mins <= 0) return

    const currentStaff = staffList.find(s => s.id === currentStaffId)
    const res = await logTaskTimeManually(selectedTask.id, {
      staff_id: currentStaffId || 'user',
      staff_name: currentStaff?.name || 'Staff Member',
      staff_photo: currentStaff?.photo,
      duration_minutes: mins,
      notes: manualNotes.trim() || undefined,
    })

    if (res) {
      setSelectedTask(res.updatedTask)
      setTasks(prev => prev.map(t => t.id === res.updatedTask.id ? res.updatedTask : t))
    }
    setShowManualLogModal(false)
    setManualNotes('')
    setManualMinutes('30')
  }

  const handleDeleteTimeLog = async (logId: string) => {
    if (!selectedTask) return
    if (confirm('Delete this logged work session?')) {
      await deleteTaskTimeLog(selectedTask.id, logId)
      const updatedLogs = (selectedTask.time_logs || []).filter(l => l.id !== logId)
      const totalLoggedHours = parseFloat(
        updatedLogs.reduce((sum, l) => sum + (l.duration_minutes / 60), 0).toFixed(2)
      )
      const updatedTask = { ...selectedTask, actual_hours: totalLoggedHours, time_logs: updatedLogs }
      setSelectedTask(updatedTask)
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? updatedTask : t))
    }
  }

  const handleCreateTaskOnDate = (dateStr: string) => {
    setNewTaskDueDate(dateStr)
    setShowCreateModal(true)
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return

    const assignedStaff = staffList.find(s => s.id === newTaskAssignee)
    const taskPayload: Partial<WorkspaceTask> = {
      workspace_id: workspaceId || 'ws-main',
      team_id: teamId || null,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      priority: newTaskPriority,
      status: 'todo',
      assignee_id: newTaskAssignee || null,
      assignee: assignedStaff ? { id: assignedStaff.id, name: assignedStaff.name, photo: assignedStaff.photo, department: assignedStaff.department } : undefined,
      due_date: newTaskDueDate || null,
      due_time: newTaskDueTime || null,
      reminder_type: newTaskReminderType || 'none',
      is_recurring: newTaskRecurrence !== 'none',
      recurrence_interval: newTaskRecurrence,
      estimated_hours: Number(newTaskHours) || 0,
      kpi_category: newTaskKpi,
      checklist: newTaskChecklist.map((text, idx) => ({ id: `c-${idx}-${Date.now()}`, text, completed: false })),
      image_attachments: newTaskImages,
      tags: [newTaskKpi.split(' ')[0]],
      creator_id: currentStaffId || null,
    }

    const created = await createWorkspaceTask(taskPayload)
    setTasks(prev => [created, ...prev])
    if (onTaskCreated) onTaskCreated(created)

    // Reset Form
    setNewTaskTitle('')
    setNewTaskDesc('')
    setNewTaskPriority('medium')
    setNewTaskAssignee('')
    setNewTaskDueDate('')
    setNewTaskDueTime('')
    setNewTaskReminderType('none')
    setNewTaskRecurrence('none')
    setNewTaskChecklist([])
    setNewTaskImages([])
    setShowCreateModal(false)
  }

  const toggleChecklistItem = async (task: WorkspaceTask, checkId: string) => {
    const updatedChecklist = task.checklist.map(item => {
      if (item.id === checkId) {
        return {
          ...item,
          completed: !item.completed,
          completed_by: !item.completed ? currentStaffId || undefined : undefined,
          completed_at: !item.completed ? new Date().toISOString() : undefined,
        }
      }
      return item
    })

    const updatedTask = { ...task, checklist: updatedChecklist }
    setTasks(prev => prev.map(t => (t.id === task.id ? updatedTask : t)))
    setSelectedTask(updatedTask)

    try {
      await supabase.from('tasks').update({ checklist: updatedChecklist, updated_at: new Date().toISOString() }).eq('id', task.id)
    } catch {}
  }

  // Filter Tasks
  const filteredTasks = tasks.filter(t => {
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false
    if (filterAssignee !== 'all' && t.assignee_id !== filterAssignee) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const inTitle = t.title.toLowerCase().includes(q)
      const inDesc = t.description?.toLowerCase().includes(q)
      const inAssignee = t.assignee?.name.toLowerCase().includes(q)
      if (!inTitle && !inDesc && !inAssignee) return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Search tasks or assignees..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
            />
          </div>

          {/* Priority Filter */}
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
            className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 outline-none"
          >
            <option value="all">All Assignees</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-100 p-0.5 ml-auto md:ml-0">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 transition-colors ${
                viewMode === 'kanban' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/></svg>
              Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 transition-colors ${
                viewMode === 'list' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 transition-colors ${
                viewMode === 'calendar' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconCalendar className="w-3.5 h-3.5" />
              Calendar
            </button>
            <button
              onClick={() => setViewMode('scorecard')}
              className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 transition-colors ${
                viewMode === 'scorecard' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconChart className="w-3.5 h-3.5" />
              <span>{canAccessExecutiveDigest ? 'Scorecard' : 'My Scorecard'}</span>
            </button>
          </div>
        </div>

        {/* Action Buttons: Export Report & Create Task */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            title="1-Click PDF / Excel Task Report Generator"
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <IconFileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Export Report</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm shrink-0 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Task
          </button>
        </div>
      </div>

      {/* ── KANBAN VIEW ── */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {COLUMNS.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.key)
            return (
              <div key={col.key} className={`rounded-xl border ${col.border} ${col.bg} p-3 space-y-3 flex flex-col min-h-[500px]`}>
                {/* Column Header */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>{col.label}</span>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                {/* Task Cards Container */}
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-280px)] pr-0.5">
                  {colTasks.length === 0 ? (
                    <div className="h-32 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400 font-medium">
                      No tasks in {col.label}
                    </div>
                  ) : (
                    colTasks.map(task => {
                      const completedChecks = task.checklist.filter(c => c.completed).length
                      const totalChecks = task.checklist.length
                      const pBadge = PRIORITY_BADGES[task.priority]

                      return (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer space-y-2.5 group"
                        >
                          {/* Priority & KPI Badge & Reminder & Quick Actions */}
                          <div className="flex items-center justify-between gap-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pBadge.bg} ${pBadge.text}`}>
                              {pBadge.label}
                            </span>
                            <div className="flex items-center gap-1">
                              {task.reminder_type && task.reminder_type !== 'none' && (
                                <span title={`Reminder: ${task.reminder_type.replace('_', ' ')}`} className="text-amber-600 bg-amber-50 p-1 rounded-md border border-amber-200">
                                  <IconBell className="w-2.5 h-2.5" />
                                </span>
                              )}
                              {task.kpi_category && (
                                <span className="text-[10px] font-medium text-slate-500 truncate max-w-[90px]" title={task.kpi_category}>
                                  {task.kpi_category.split(' ')[0]}
                                </span>
                              )}
                              {/* Edit & Delete Action Buttons */}
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  title="Edit Task"
                                  onClick={(e) => handleOpenEditTask(task, e)}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                >
                                  <IconPencil className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete Task"
                                  onClick={(e) => handleDeleteTask(task.id, e)}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                >
                                  <IconTrash className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Title */}
                          <h4 className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors leading-snug line-clamp-2">
                            {task.title}
                          </h4>

                          {/* Thumbnail if compressed screenshot exists */}
                          {task.image_attachments && task.image_attachments.length > 0 && (
                            <div className="relative rounded-lg overflow-hidden border border-slate-100 bg-slate-50 max-h-24">
                              <img
                                src={task.image_attachments[0].url}
                                alt="attachment preview"
                                className="w-full h-24 object-cover"
                              />
                              {task.image_attachments.length > 1 && (
                                <span className="absolute bottom-1 right-1 text-[10px] font-bold bg-slate-900/80 text-white px-1.5 py-0.5 rounded">
                                  +{task.image_attachments.length - 1}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Progress, Comments & Due Date / Due Time & Recurrence */}
                          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                            <div className="flex items-center gap-1.5">
                              {totalChecks > 0 && (
                                <span className={`flex items-center gap-1 font-medium ${completedChecks === totalChecks ? 'text-emerald-600' : 'text-slate-500'}`}>
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                  {completedChecks}/{totalChecks}
                                </span>
                              )}

                              {task.comments && task.comments.length > 0 && (
                                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded border border-slate-200/60" title={`${task.comments.length} updates/comments`}>
                                  <IconChat className="w-3 h-3 text-slate-400" />
                                  <span>{task.comments.length}</span>
                                  {task.comments.some(c => c.is_proof) && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Contains deliverable proof" />
                                  )}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {task.is_recurring && task.recurrence_interval && task.recurrence_interval !== 'none' && (
                                <span title={`Recurrent task: ${task.recurrence_interval}`} className="flex items-center gap-0.5 text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 capitalize">
                                  <IconRepeat className="w-2.5 h-2.5 text-purple-600" />
                                  <span>{task.recurrence_interval}</span>
                                </span>
                              )}

                              {task.due_date && (
                                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                                  <IconCalendar className="w-3 h-3 text-slate-400" />
                                  <span>{new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                  {task.due_time && (
                                    <span className="text-blue-600 font-bold ml-0.5">
                                      {task.due_time}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Assignee, Logged Hours & Live Timer / Move Shortcuts */}
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-1.5">
                              {task.assignee ? (
                                <div className="flex items-center gap-1">
                                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                                    {task.assignee.name.charAt(0)}
                                  </div>
                                  <span className="text-[11px] font-medium text-slate-600 truncate max-w-[70px]">
                                    {task.assignee.name.split(' ')[0]}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                              )}

                              {(task.actual_hours !== undefined || task.estimated_hours) && (
                                <span title={`${task.actual_hours || 0}h logged / ${task.estimated_hours || 0}h estimated`} className="text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 flex items-center gap-0.5">
                                  <IconClock className="w-2.5 h-2.5 text-slate-400" />
                                  <span>{task.actual_hours || 0}h{task.estimated_hours ? `/${task.estimated_hours}h` : ''}</span>
                                </span>
                              )}
                            </div>

                            {/* Live Timer & Quick Status Buttons */}
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              {activeTimer?.taskId === task.id ? (
                                <button
                                  type="button"
                                  title="Active Stopwatch - Click to Stop & Save"
                                  onClick={handleOpenStopTimerModal}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-mono font-bold animate-pulse shadow-xs"
                                >
                                  <span className="w-2 h-2 rounded-xs bg-white inline-block" />
                                  <span>{formatTimerDuration(timerSeconds)}</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  title="Start Live Timer"
                                  onClick={(e) => handleStartTimer(task, e)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all flex items-center gap-0.5 text-[10px]"
                                >
                                  <IconClock className="w-3 h-3 text-slate-500" />
                                </button>
                              )}

                              {col.key !== 'todo' && (
                                <button
                                  title="Move Left"
                                  onClick={() => handleStatusChange(task.id, col.key === 'done' ? 'review' : col.key === 'review' ? 'in_progress' : 'todo')}
                                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs"
                                >
                                  ←
                                </button>
                              )}
                              {col.key !== 'done' && (
                                <button
                                  title="Move Right"
                                  onClick={() => handleStatusChange(task.id, col.key === 'todo' ? 'in_progress' : col.key === 'in_progress' ? 'review' : 'done')}
                                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center text-xs font-bold"
                                >
                                  →
                                </button>
                              )}
                            </div>
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
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Task Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Due Schedule</th>
                  <th className="px-4 py-3">Checklist</th>
                  <th className="px-4 py-3">Logged / Est</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">No tasks found matching criteria.</td>
                  </tr>
                ) : (
                  filteredTasks.map(task => {
                    const pBadge = PRIORITY_BADGES[task.priority]
                    return (
                      <tr
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate">
                          {task.title}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={task.status}
                            onClick={e => e.stopPropagation()}
                            onChange={e => handleStatusChange(task.id, e.target.value as TaskStatus)}
                            className="text-xs font-semibold rounded-md border border-slate-200 px-2 py-1 bg-white"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="review">Under Review</option>
                            <option value="done">Completed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pBadge.bg} ${pBadge.text}`}>
                            {pBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {task.assignee?.name || <span className="text-slate-400 italic">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {task.due_date ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span>{new Date(task.due_date).toLocaleDateString()}</span>
                                {task.due_time && (
                                  <span className="font-bold text-blue-600 flex items-center gap-0.5">
                                    <IconClock className="w-3 h-3" />
                                    {task.due_time}
                                  </span>
                                )}
                                {task.reminder_type && task.reminder_type !== 'none' && (
                                  <span title={`Reminder: ${task.reminder_type}`} className="text-amber-600">
                                    <IconBell className="w-3 h-3" />
                                  </span>
                                )}
                              </div>
                              {task.is_recurring && task.recurrence_interval && task.recurrence_interval !== 'none' && (
                                <span title={`Recurrent task: ${task.recurrence_interval}`} className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 capitalize w-fit">
                                  <IconRepeat className="w-2.5 h-2.5 text-purple-600" />
                                  <span>Repeats {task.recurrence_interval}</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          <div className="flex items-center gap-2">
                            {task.checklist.length > 0 && (
                              <span>{task.checklist.filter(c => c.completed).length}/{task.checklist.length}</span>
                            )}
                            {task.comments && task.comments.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200" title={`${task.comments.length} comments`}>
                                <IconChat className="w-3 h-3 text-slate-400" />
                                <span>{task.comments.length}</span>
                                {task.comments.some(c => c.is_proof) && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Contains deliverable proof" />
                                )}
                              </span>
                            )}
                            {task.checklist.length === 0 && (!task.comments || task.comments.length === 0) && '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-700">
                              {task.actual_hours || 0}h
                              <span className="text-slate-400 font-normal">{task.estimated_hours ? `/${task.estimated_hours}h` : ''}</span>
                            </span>
                            {activeTimer?.taskId === task.id ? (
                              <button
                                type="button"
                                title="Active Stopwatch - Click to Stop & Save"
                                onClick={handleOpenStopTimerModal}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-mono font-bold animate-pulse shadow-xs"
                              >
                                <span className="w-2 h-2 rounded-xs bg-white inline-block" />
                                <span>{formatTimerDuration(timerSeconds)}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Start Live Timer"
                                onClick={(e) => handleStartTimer(task, e)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                              >
                                <IconClock className="w-3.5 h-3.5 text-slate-500" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="Edit Task"
                              onClick={(e) => handleOpenEditTask(task, e)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <IconPencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete Task"
                              onClick={(e) => handleDeleteTask(task.id, e)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <IconTrash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CALENDAR VIEW ── */}
      {viewMode === 'calendar' && (
        <TaskCalendar
          tasks={filteredTasks}
          onSelectTask={setSelectedTask}
          onCreateTaskOnDate={handleCreateTaskOnDate}
          onStatusChange={handleStatusChange}
          staffList={staffList}
        />
      )}

      {/* ── SCORECARD & DIGEST VIEW ── */}
      {viewMode === 'scorecard' && (
        <KpiScorecard
          tasks={tasks}
          staffList={staffList}
          workspaceName={workspaceName}
          teamName={teamName}
          currentStaffId={currentStaffId}
          currentStaffName={currentStaffName}
          canAccessExecutiveDigest={canAccessExecutiveDigest}
          onSelectTask={setSelectedTask}
          onPostDigestToChat={onPostDigestToChat}
        />
      )}

      {/* ── AI SUMMARY MODAL ── */}
      {aiSummaryModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col">
            <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 text-amber-300">
                  <IconSparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Gemini AI Executive Progress Summary</h3>
                  <p className="text-xs text-purple-100 truncate max-w-md">Task: "{selectedTask?.title}"</p>
                </div>
              </div>
              <button
                onClick={() => setAiSummaryModal(null)}
                className="text-white/70 hover:text-white hover:bg-white/10 rounded-lg p-1.5"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-3 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {aiSummaryModal}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">Generated by Google Gemini 2.5 Flash</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(aiSummaryModal)
                    alert('Executive summary copied to clipboard!')
                  }}
                  className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  Copy Summary
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (selectedTask) {
                      setCommentText(`🤖 **Gemini AI Executive Summary**:\n${aiSummaryModal}`)
                      setAiSummaryModal(null)
                    }
                  }}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  Insert as Comment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE TASK MODAL ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            onPaste={handlePasteImage}
            className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Create New Team Task</h3>
                <p className="text-xs text-slate-500">Add deliverables, set due dates, and track milestone execution</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-sm">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Deliver Q3 Corporate Sales Pitch to Zenith"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Description & Context
                  </label>
                  <button
                    type="button"
                    onClick={handleAiPolishNewTask}
                    disabled={aiGenerating || !newTaskTitle.trim()}
                    className="text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <IconWand className="w-3 h-3 text-purple-600" />
                    <span>{aiGenerating ? 'Polishing...' : 'Polish with AI'}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  placeholder="Provide background, guidelines, and expected deliverables..."
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              {/* Priority & Assignee */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value as TaskPriority)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg outline-none font-medium bg-white"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Assignee</label>
                  <select
                    value={newTaskAssignee}
                    onChange={e => setNewTaskAssignee(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg outline-none font-medium bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.department})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due Date, Due Time & In-App Reminder */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <IconCalendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Due Date</span>
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none font-medium bg-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <IconClock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Due Time</span>
                  </label>
                  <input
                    type="time"
                    value={newTaskDueTime}
                    onChange={e => setNewTaskDueTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none font-medium bg-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <IconBell className="w-3.5 h-3.5 text-amber-600" />
                    <span>Set Reminder</span>
                  </label>
                  <select
                    value={newTaskReminderType || 'none'}
                    onChange={e => setNewTaskReminderType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none font-medium bg-white text-xs"
                  >
                    <option value="none">No Reminder</option>
                    <option value="on_due_time">At time of due</option>
                    <option value="15_min">15 minutes before</option>
                    <option value="30_min">30 minutes before</option>
                    <option value="1_hour">1 hour before</option>
                    <option value="1_day">1 day before</option>
                  </select>
                </div>
              </div>

              {/* Recurrence Schedule (Repeat Routine) */}
              <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-200 space-y-1">
                <label className="block text-xs font-bold text-purple-900 uppercase tracking-wide flex items-center gap-1.5">
                  <IconRepeat className="w-3.5 h-3.5 text-purple-600" />
                  <span>Task Recurrence / Repeat Schedule</span>
                </label>
                <select
                  value={newTaskRecurrence}
                  onChange={e => setNewTaskRecurrence(e.target.value as RecurrenceInterval)}
                  className="w-full px-2.5 py-1.5 border border-purple-200 rounded-lg outline-none font-medium bg-white text-xs text-purple-900"
                >
                  <option value="none">No Recurrence (One-Time Deliverable)</option>
                  <option value="daily">Daily (Repeats every single day)</option>
                  <option value="weekdays">Weekdays (Repeats Monday to Friday)</option>
                  <option value="weekly">Weekly (Repeats once every week)</option>
                  <option value="biweekly">Bi-weekly (Repeats every 2 weeks)</option>
                  <option value="monthly">Monthly (Repeats once every month)</option>
                  <option value="quarterly">Quarterly (Repeats every 3 months)</option>
                </select>
                <p className="text-[11px] text-purple-700">
                  Recurring tasks automatically schedule their next cycle upon completion.
                </p>
              </div>

              {/* KPI Category & Estimated Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">KPI Category</label>
                  <select
                    value={newTaskKpi}
                    onChange={e => setNewTaskKpi(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg outline-none font-medium bg-white"
                  >
                    <option value="Operations, Admin & Compliance">Operations, Admin & Compliance</option>
                    <option value="Logistics, Warehouse & Inventory">Logistics, Warehouse & Inventory</option>
                    <option value="Sales & Customer Acquisition">Sales & Customer Acquisition</option>
                    <option value="Technical & IT Procedures">Technical & IT Procedures</option>
                    <option value="HR & People Operations">HR & People Operations</option>
                    <option value="Finance & Accounting">Finance & Accounting</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Est. Hours</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={newTaskHours}
                    onChange={e => setNewTaskHours(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none font-medium"
                  />
                </div>
              </div>

              {/* Checklist Subtasks */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Subtask Checklist
                  </label>
                  <button
                    type="button"
                    onClick={handleAiBreakdownNewTask}
                    disabled={aiGenerating || !newTaskTitle.trim()}
                    className="text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <IconSparkles className="w-3 h-3 text-purple-600" />
                    <span>{aiGenerating ? 'AI Analyzing...' : '✨ Auto-Generate Subtasks with AI'}</span>
                  </button>
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Add a checklist item (e.g. Slide 4 review)"
                    value={newChecklistText}
                    onChange={e => setNewChecklistText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (newChecklistText.trim()) {
                          setNewTaskChecklist([...newTaskChecklist, newChecklistText.trim()])
                          setNewChecklistText('')
                        }
                      }
                    }}
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newChecklistText.trim()) {
                        setNewTaskChecklist([...newTaskChecklist, newChecklistText.trim()])
                        setNewChecklistText('')
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                  >
                    Add
                  </button>
                </div>

                {newTaskChecklist.length > 0 && (
                  <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    {newTaskChecklist.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs text-slate-700">
                        <span>• {item}</span>
                        <button
                          type="button"
                          onClick={() => setNewTaskChecklist(newTaskChecklist.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* In-App Compressed Image Attachment (Strictly Image Only) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Screenshot / Image Attachments (Auto-Compressed)
                </label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2 rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors">
                    <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Choose Images
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Tip: Press <kbd className="bg-slate-100 border border-slate-300 px-1 py-0.5 rounded text-[10px] font-mono">Ctrl+V</kbd> to paste screenshots directly
                  </span>
                </div>

                {compressingImage && (
                  <div className="flex items-center gap-2 text-xs text-blue-600 font-medium mt-2 animate-pulse">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    Compressing and optimizing image in browser...
                  </div>
                )}

                {newTaskImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {newTaskImages.map((img, idx) => (
                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 h-16">
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1 truncate text-center">
                          {formatFileSize(img.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setNewTaskImages(newTaskImages.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[10px] flex items-center justify-center font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit / Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TASK DETAILS MODAL ── */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_BADGES[selectedTask.priority].bg} ${PRIORITY_BADGES[selectedTask.priority].text}`}>
                    {PRIORITY_BADGES[selectedTask.priority].label}
                  </span>
                  {selectedTask.kpi_category && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                      KPI: {selectedTask.kpi_category}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900 leading-snug">{selectedTask.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Edit Task"
                  onClick={() => {
                    const taskToEdit = selectedTask
                    setSelectedTask(null)
                    handleOpenEditTask(taskToEdit)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors border border-blue-200"
                >
                  <IconPencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  title="Delete Task"
                  onClick={() => handleDeleteTask(selectedTask.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg transition-colors border border-red-200"
                >
                  <IconTrash className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Status Selector Bar */}
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide px-2">Status:</span>
              <div className="flex flex-wrap gap-1">
                {COLUMNS.map(col => (
                  <button
                    key={col.key}
                    onClick={() => handleStatusChange(selectedTask.id, col.key)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      selectedTask.status === col.key
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {col.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            {selectedTask.description && (
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Description</h4>
                <p className="text-sm text-slate-700 bg-slate-50/70 p-3 rounded-lg border border-slate-100 leading-relaxed whitespace-pre-wrap">
                  {selectedTask.description}
                </p>
              </div>
            )}

            {/* Meta Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Assignee</span>
                <span className="font-semibold text-slate-800">{selectedTask.assignee?.name || 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Due Date & Time</span>
                <span className="font-semibold text-slate-800">
                  {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : 'No deadline'}
                  {selectedTask.due_time && <span className="text-blue-600 font-bold ml-1">({selectedTask.due_time})</span>}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Recurrence</span>
                <span className="font-semibold text-purple-700 capitalize flex items-center gap-1">
                  <IconRepeat className="w-3.5 h-3.5 text-purple-600" />
                  <span>{selectedTask.recurrence_interval && selectedTask.recurrence_interval !== 'none' ? selectedTask.recurrence_interval : 'One-time'}</span>
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Reminder Alert</span>
                <span className="font-semibold text-amber-700 flex items-center gap-1">
                  <IconBell className="w-3.5 h-3.5 text-amber-600" />
                  {selectedTask.reminder_type && selectedTask.reminder_type !== 'none'
                    ? selectedTask.reminder_type.replace('_', ' ')
                    : 'None'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Estimated / Actual</span>
                <span className="font-semibold text-slate-800">{selectedTask.estimated_hours || 0}h est / {selectedTask.actual_hours || 0}h logged</span>
              </div>
            </div>

            {/* ── LIVE TIMER & ACTUAL HOURS TRACKER CARD ── */}
            <div className="bg-slate-50/90 rounded-xl p-4 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconClock className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Live Timer & Time Tracking
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  {/* Stopwatch Button */}
                  {activeTimer?.taskId === selectedTask.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleOpenStopTimerModal}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 animate-pulse"
                      >
                        <span>⏹️ Stop Timer ({formatTimerDuration(timerSeconds)})</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelTimer}
                        title="Cancel without saving"
                        className="px-2 py-1.5 text-slate-400 hover:text-red-500 text-xs font-bold hover:bg-slate-200 rounded-lg"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleStartTimer(selectedTask, e)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
                    >
                      <span>▶️ {activeTimer ? 'Switch Timer to This' : 'Start Live Timer'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowManualLogModal(true)}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
                  >
                    + Log Time
                  </button>
                </div>
              </div>

              {/* Progress Bar & Budget comparison */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-600">
                    Logged: <strong className="text-slate-900">{selectedTask.actual_hours || 0} hrs</strong>
                    {selectedTask.estimated_hours ? ` of ${selectedTask.estimated_hours} hrs budget` : ''}
                  </span>
                  {selectedTask.estimated_hours ? (
                    <span className={`text-[11px] font-bold ${
                      (selectedTask.actual_hours || 0) > selectedTask.estimated_hours
                        ? 'text-red-600'
                        : (selectedTask.actual_hours || 0) >= selectedTask.estimated_hours * 0.8
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}>
                      {Math.round(((selectedTask.actual_hours || 0) / selectedTask.estimated_hours) * 100)}% utilized
                      {(selectedTask.actual_hours || 0) > selectedTask.estimated_hours && ' (Overtime)'}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[11px]">No budget set</span>
                  )}
                </div>

                {selectedTask.estimated_hours && (
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        (selectedTask.actual_hours || 0) > selectedTask.estimated_hours
                          ? 'bg-red-500'
                          : (selectedTask.actual_hours || 0) >= selectedTask.estimated_hours * 0.8
                          ? 'bg-amber-500'
                          : 'bg-blue-600'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round(((selectedTask.actual_hours || 0) / selectedTask.estimated_hours) * 100))}%`
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Logged Work Sessions History */}
              {selectedTask.time_logs && selectedTask.time_logs.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200/70">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                    Logged Work Sessions ({selectedTask.time_logs.length})
                  </span>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {selectedTask.time_logs.map(log => (
                      <div key={log.id} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{log.staff_name}</span>
                          <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            {log.duration_minutes >= 60 ? `${(log.duration_minutes / 60).toFixed(1)}h` : `${log.duration_minutes}m`}
                          </span>
                          {log.notes && (
                            <span className="text-slate-500 italic truncate max-w-[160px] sm:max-w-xs" title={log.notes}>
                              "{log.notes}"
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">
                            {new Date(log.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteTimeLog(log.id)}
                            title="Delete log"
                            className="text-slate-300 hover:text-red-500 font-bold px-1"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Checklist ({selectedTask.checklist.filter(c => c.completed).length}/{selectedTask.checklist.length})
                </h4>
              </div>
              {selectedTask.checklist.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No checklist items on this task.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedTask.checklist.map(item => (
                    <label
                      key={item.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => toggleChecklistItem(selectedTask, item.id)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className={`text-sm ${item.completed ? 'line-through text-slate-400 font-normal' : 'text-slate-800 font-medium'}`}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Compressed Screenshots Gallery */}
            {selectedTask.image_attachments && selectedTask.image_attachments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Compressed Screenshots & Visual Proof ({selectedTask.image_attachments.length})
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {selectedTask.image_attachments.map((img, idx) => (
                    <div
                      key={idx}
                      onClick={() => setActiveLightboxImage(img.url)}
                      className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-28 cursor-pointer hover:shadow-md transition-all"
                    >
                      <img src={img.url} alt={img.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                        <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold bg-slate-900/80 px-2.5 py-1 rounded flex items-center gap-1.5 shadow-md">
                          <IconSearch className="w-3.5 h-3.5" />
                          <span>View Full</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── DISCUSSION THREAD & PROOF OF WORK ── */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconChat className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Discussion & Proof of Work ({selectedTask.comments?.length || 0})
                  </h4>
                </div>
                {selectedTask.comments?.some(c => c.is_proof) && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <IconCheckCircle className="w-3 h-3 text-emerald-600" />
                    <span>Proof Attached</span>
                  </span>
                )}
              </div>

              {/* Comments Timeline */}
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {(!selectedTask.comments || selectedTask.comments.length === 0) ? (
                  <div className="bg-slate-50/80 border border-dashed border-slate-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-slate-500 font-medium">No comments or proof updates yet.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Post a progress note, question, or upload deliverable evidence below.</p>
                  </div>
                ) : (
                  selectedTask.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`p-3 rounded-xl border text-xs space-y-2 transition-all ${
                        comment.is_proof
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-slate-50/70 border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 overflow-hidden">
                            {comment.staff_photo ? (
                              <img src={comment.staff_photo} alt={comment.staff_name} className="w-full h-full object-cover" />
                            ) : (
                              (comment.staff_name || 'U').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800">{comment.staff_name}</span>
                              {comment.staff_department && (
                                <span className="text-[10px] text-slate-400">({comment.staff_department})</span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(comment.created_at).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {comment.is_proof && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                              <IconCheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>Deliverable Proof</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(comment.id)}
                            title="Delete comment"
                            className="text-slate-300 hover:text-red-500 font-bold px-1 transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {comment.content && (
                        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed pl-8">
                          {comment.content}
                        </p>
                      )}

                      {/* Comment Image Attachments */}
                      {comment.attachments && comment.attachments.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 pt-1 pl-8">
                          {comment.attachments.map((att, attIdx) => (
                            <div
                              key={attIdx}
                              onClick={() => setActiveLightboxImage(att.url)}
                              className="relative rounded-lg overflow-hidden border border-slate-200 bg-white h-20 cursor-pointer group hover:shadow-xs"
                            >
                              <img src={att.url} alt={att.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                                <span className="opacity-0 group-hover:opacity-100 text-[10px] bg-slate-900/80 text-white px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                  <IconSearch className="w-3 h-3" />
                                  <span>View</span>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment / Proof Input Box */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                <textarea
                  rows={2}
                  placeholder="Write a status update, ask a question, or describe deliverable proof... (Shift+Enter for newline, Enter to post)"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAddComment()
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:ring-1 focus:ring-blue-500"
                />

                {/* Attached image preview thumbnails */}
                {commentImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {commentImages.map((img, idx) => (
                      <div key={idx} className="relative group rounded-md overflow-hidden border border-slate-300 h-14 w-14">
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setCommentImages(commentImages.filter((_, i) => i !== idx))}
                          className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] shadow-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] sm:text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 select-none hover:bg-emerald-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={isProofComment}
                        onChange={e => setIsProofComment(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>🎯 Mark as Deliverable Proof</span>
                    </label>

                    <label className="flex items-center gap-1 text-[11px] sm:text-xs text-slate-600 hover:text-blue-600 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                      <IconImage className="w-3.5 h-3.5 text-slate-500" />
                      <span>{compressingCommentImg ? 'Compressing...' : 'Attach Proof / Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleCommentImageUpload}
                        className="hidden"
                        disabled={compressingCommentImg}
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={isPostingComment || (!commentText.trim() && commentImages.length === 0)}
                    onClick={() => handleAddComment()}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1"
                  >
                    <span>{isPostingComment ? 'Posting...' : isProofComment ? 'Submit Proof' : 'Post Update'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT TASK MODAL ── */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <IconPencil className="w-5 h-5 text-blue-600" />
                  <span>Edit Task Details</span>
                </h3>
                <p className="text-xs text-slate-500">Update deliverables, deadline schedules, recurrence, and checklist</p>
              </div>
              <button
                onClick={() => setEditingTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditTask} className="space-y-4 text-sm">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Task title..."
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Description & Context
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide background, guidelines, and context..."
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              {/* Status, Priority & Assignee */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as TaskStatus)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg outline-none font-medium bg-white"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Under Review</option>
                    <option value="done">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={e => setEditPriority(e.target.value as TaskPriority)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg outline-none font-medium bg-white"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Assignee</label>
                  <select
                    value={editAssignee}
                    onChange={e => setEditAssignee(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg outline-none font-medium bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.department})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due Date, Due Time & In-App Reminder */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <IconCalendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Due Date</span>
                  </label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={e => setEditDueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none font-medium bg-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <IconClock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Due Time</span>
                  </label>
                  <input
                    type="time"
                    value={editDueTime}
                    onChange={e => setEditDueTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none font-medium bg-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <IconBell className="w-3.5 h-3.5 text-amber-600" />
                    <span>Set Reminder</span>
                  </label>
                  <select
                    value={editReminderType || 'none'}
                    onChange={e => setEditReminderType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none font-medium bg-white text-xs"
                  >
                    <option value="none">No Reminder</option>
                    <option value="on_due_time">At time of due</option>
                    <option value="15_min">15 minutes before</option>
                    <option value="30_min">30 minutes before</option>
                    <option value="1_hour">1 hour before</option>
                    <option value="1_day">1 day before</option>
                  </select>
                </div>
              </div>

              {/* Recurrence Schedule (Repeat Routine) */}
              <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-200 space-y-1">
                <label className="block text-xs font-bold text-purple-900 uppercase tracking-wide flex items-center gap-1.5">
                  <IconRepeat className="w-3.5 h-3.5 text-purple-600" />
                  <span>Task Recurrence / Repeat Schedule</span>
                </label>
                <select
                  value={editRecurrence}
                  onChange={e => setEditRecurrence(e.target.value as RecurrenceInterval)}
                  className="w-full px-2.5 py-1.5 border border-purple-200 rounded-lg outline-none font-medium bg-white text-xs text-purple-900"
                >
                  <option value="none">No Recurrence (One-Time Deliverable)</option>
                  <option value="daily">Daily (Repeats every single day)</option>
                  <option value="weekdays">Weekdays (Repeats Monday to Friday)</option>
                  <option value="weekly">Weekly (Repeats once every week)</option>
                  <option value="biweekly">Bi-weekly (Repeats every 2 weeks)</option>
                  <option value="monthly">Monthly (Repeats once every month)</option>
                  <option value="quarterly">Quarterly (Repeats every 3 months)</option>
                </select>
                <p className="text-[11px] text-purple-700">
                  Recurring tasks automatically schedule their next cycle upon completion.
                </p>
              </div>

              {/* KPI Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">KPI Category</label>
                <select
                  value={editKpi}
                  onChange={e => setEditKpi(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg outline-none font-medium bg-white"
                >
                  <option value="Operations, Admin & Compliance">Operations, Admin & Compliance</option>
                  <option value="Logistics, Warehouse & Inventory">Logistics, Warehouse & Inventory</option>
                  <option value="Sales & Customer Acquisition">Sales & Customer Acquisition</option>
                  <option value="Technical & IT Procedures">Technical & IT Procedures</option>
                  <option value="HR & People Operations">HR & People Operations</option>
                  <option value="Finance & Accounting">Finance & Accounting</option>
                </select>
              </div>

              {/* Checklist Subtasks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Subtask Checklist
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Add a checklist item..."
                    value={newEditChecklistText}
                    onChange={e => setNewEditChecklistText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (newEditChecklistText.trim()) {
                          setEditChecklist([
                            ...editChecklist,
                            {
                              id: 'c-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
                              text: newEditChecklistText.trim(),
                              completed: false,
                            },
                          ])
                          setNewEditChecklistText('')
                        }
                      }
                    }}
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newEditChecklistText.trim()) {
                        setEditChecklist([
                          ...editChecklist,
                          {
                            id: 'c-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
                            text: newEditChecklistText.trim(),
                            completed: false,
                          },
                        ])
                        setNewEditChecklistText('')
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                  >
                    Add
                  </button>
                </div>

                {editChecklist.length > 0 && (
                  <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    {editChecklist.map((item, idx) => (
                      <div key={item.id || idx} className="flex items-center justify-between text-xs text-slate-700">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => {
                              setEditChecklist(editChecklist.map((c, i) => i === idx ? { ...c, completed: !c.completed } : c))
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span className={item.completed ? 'line-through text-slate-400' : ''}>{item.text}</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setEditChecklist(editChecklist.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700 font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit / Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleDeleteTask(editingTask.id)}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg text-xs flex items-center gap-1.5 border border-red-200"
                >
                  <IconTrash className="w-3.5 h-3.5" />
                  <span>Delete Task</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX VIEWER MODAL ── */}
      {activeLightboxImage && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setActiveLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            <img
              src={activeLightboxImage}
              alt="Fullscreen Preview"
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
            />
            <button
              onClick={() => setActiveLightboxImage(null)}
              className="absolute -top-4 -right-4 w-9 h-9 bg-white text-slate-800 rounded-full font-bold shadow-lg flex items-center justify-center hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── STOP TIMER NOTES & CONFIRMATION MODAL ── */}
      {showStopTimerModal && activeTimer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <IconClock className="w-5 h-5 text-emerald-600" />
                  <span>Log Work Session</span>
                </h3>
                <p className="text-xs text-slate-500">Save elapsed time to task actual hours</p>
              </div>
              <button
                onClick={() => setShowStopTimerModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">Task</span>
              <p className="text-xs font-bold text-slate-800">{activeTimer.taskTitle}</p>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-600">Total Duration:</span>
                <span className="font-mono text-sm font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  {formatTimerDuration(timerSeconds)} ({Math.max(1, Math.round(timerSeconds / 60))} mins)
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Work Summary / Notes (Optional)</label>
              <textarea
                rows={2}
                placeholder="What was completed during this work session?"
                value={stopTimerNotes}
                onChange={e => setStopTimerNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowStopTimerModal(false)}
                className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold"
              >
                Keep Timing
              </button>
              <button
                type="button"
                onClick={handleConfirmStopTimer}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
              >
                Save & Log Time
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MANUAL LOG TIME MODAL ── */}
      {showManualLogModal && selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <IconClock className="w-5 h-5 text-blue-600" />
                  <span>Manual Time Entry</span>
                </h3>
                <p className="text-xs text-slate-500">Log offline work completed on this task</p>
              </div>
              <button
                onClick={() => setShowManualLogModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualLogTime} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">Task</span>
                <p className="text-xs font-bold text-slate-800">{selectedTask.title}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Time Spent (Minutes)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="5"
                    value={manualMinutes}
                    onChange={e => setManualMinutes(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-slate-500 shrink-0">
                    ≈ {(parseInt(manualMinutes || '0', 10) / 60).toFixed(1)} hrs
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[15, 30, 45, 60, 90, 120].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setManualMinutes(mins.toString())}
                      className={`px-2 py-1 rounded text-xs font-semibold border transition-colors ${
                        manualMinutes === mins.toString()
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Work Description / Accomplishment (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Conducted client follow-up calls and finalized spreadsheet"
                  value={manualNotes}
                  onChange={e => setManualNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualLogModal(false)}
                  className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                >
                  Save Logged Time
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── STICKY FLOATING LIVE TASK TIMER BAR ── */}
      {activeTimer && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white rounded-2xl p-3.5 shadow-2xl border border-slate-700 max-w-sm w-full flex items-center justify-between gap-3 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="relative flex items-center justify-center shrink-0">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping absolute" />
              <span className="w-3 h-3 rounded-full bg-emerald-400 relative" />
            </div>
            <div className="overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-emerald-400">
                  {formatTimerDuration(timerSeconds)}
                </span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Live Stopwatch</span>
              </div>
              <p className="text-xs text-slate-200 font-medium truncate max-w-[190px]" title={activeTimer.taskTitle}>
                {activeTimer.taskTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenStopTimerModal}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1"
            >
              <span>Stop & Save</span>
            </button>
            <button
              type="button"
              onClick={handleCancelTimer}
              title="Discard timer without saving"
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
