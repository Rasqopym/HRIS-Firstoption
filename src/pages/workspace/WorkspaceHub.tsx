import React, { useState, useEffect, useRef, useMemo } from 'react'
import type {
  Workspace,
  WorkspaceMember,
  Team,
  TeamMember,
  Channel,
  ChatMessage,
  WorkspaceTask,
  StaffMember,
  Role,
} from '../../types'
import {
  getWorkspaces,
  createWorkspace,
  deleteWorkspace,
  getTeams,
  createTeam,
  deleteTeam,
  getChannels,
  createChannel,
  deleteChannel,
  getChannelMessages,
  sendChatMessage,
  createWorkspaceTask,
  getWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  getTeamMembers,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
} from '../../lib/workspaceManager'
import { uploadCompressedImage, formatFileSize, extractClipboardImage } from '../../lib/imageCompressor'
import { extractTaskFromMessage, ExtractedTaskDraft } from '../../lib/taskExtractor'
import { staff as mockStaff } from '../../data/mock'
import { supabase } from '../../lib/supabase'
import { sendLocalNotification } from '../../lib/pushNotification'
import {
  IconChat,
  IconKanban,
  IconTasks,
  IconChart,
  IconUsers,
  IconUser,
  IconAdminCrown,
  IconLeadStar,
  IconEyeViewer,
  IconZap,
  IconPlus,
  IconCheck,
  IconCheckCircle,
  IconAlertCircle,
  IconClock,
  IconCalendar,
  IconTrash,
  IconSearch,
  IconInfo,
  IconImage,
  IconSend,
  IconBriefcase,
  IconFilter,
  IconSparkles,
  IconBuilding,
  IconBell,
} from '../../components/icons/ClassicIcons'
import TaskBoard from './TaskBoard'
import GeminiSettingsModal from '../../components/workspace/GeminiSettingsModal'
import RichChatMessage from '../../components/workspace/RichChatMessage'
import { generateChatCopilotResponse, isGeminiConfigured, getAiProvider } from '../../lib/geminiService'
import TeamMonitoring from './TeamMonitoring'

interface Props {
  role?: Role
  currentStaffId?: string | null
  currentStaffName?: string
  currentStaffPhoto?: string
  initialTab?: TabMode
}

type TabMode = 'chat' | 'tasks' | 'calendar' | 'monitoring' | 'scorecard'

export default function WorkspaceHub({
  role = 'staff',
  currentStaffId,
  currentStaffName = 'Current Staff',
  currentStaffPhoto,
  initialTab = 'chat',
}: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)

  const [activeTab, setActiveTab] = useState<TabMode>(initialTab)

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [staffList, setStaffList] = useState<StaffMember[]>([])

  // Member Management States
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [showWorkspaceMembersModal, setShowWorkspaceMembersModal] = useState(false)
  const [showTeamMembersModal, setShowTeamMembersModal] = useState(false)
  const [selectedStaffToAdd, setSelectedStaffToAdd] = useState('')
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState<'admin' | 'lead' | 'member' | 'viewer'>('member')
  const [selectedTeamStaffToAdd, setSelectedTeamStaffToAdd] = useState('')
  const [selectedTeamRoleToAdd, setSelectedTeamRoleToAdd] = useState<'lead' | 'member'>('member')
  const [memberSearchQuery, setMemberSearchQuery] = useState('')

  // Message input state & interactive @ mention tagging
  const [inputText, setInputText] = useState('')
  const [attachments, setAttachments] = useState<any[]>([])
  const [compressingImage, setCompressingImage] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null)
  const [showGeminiSettingsModal, setShowGeminiSettingsModal] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)

  // Interactive @ Mention Autocomplete States
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Live action task proposal while typing
  const [liveTaskDraft, setLiveTaskDraft] = useState<ExtractedTaskDraft | null>(null)

  // Modals state
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [newWsDesc, setNewWsDesc] = useState('')

  const [showNewTeamModal, setShowNewTeamModal] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamDesc, setNewTeamDesc] = useState('')

  const [showNewChannelModal, setShowNewChannelModal] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelTopic, setNewChannelTopic] = useState('')

  // Quick Convert Task Modal from Message
  const [taskDraftModal, setTaskDraftModal] = useState<{
    message: ChatMessage
    draft: ExtractedTaskDraft
  } | null>(null)

  const [showRightSidebar, setShowRightSidebar] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // ── Role-Based Access Control (RBAC) ──
  const isSuperOrHr = role === 'superadmin' || role === 'hr'
  const isWorkspaceAdmin = useMemo(() => {
    if (isSuperOrHr) return true
    return workspaceMembers.some(
      m => m.staff_id === currentStaffId && (m.role === 'admin' || m.role === 'lead')
    )
  }, [isSuperOrHr, workspaceMembers, currentStaffId])

  const isSquadLead = useMemo(() => {
    if (isWorkspaceAdmin) return true
    return teamMembers.some(
      m => m.staff_id === currentStaffId && m.role === 'lead'
    )
  }, [isWorkspaceAdmin, teamMembers, currentStaffId])

  const canAccessExecutiveDigest = isWorkspaceAdmin || isSquadLead

  // 1. Initial Load: Workspaces & Staff Directory
  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    try {
      const wsList = await getWorkspaces()
      setWorkspaces(wsList)
      if (wsList.length > 0) {
        setSelectedWorkspace(wsList[0])
      }

      // Fetch staff list for mentions and assignment
      let mapped: StaffMember[] = []
      try {
        const { data: sData, error: sErr } = await supabase
          .from('staff')
          .select('id, full_name, staff_code, photo_url, departments(name), email')

        if (!sErr && sData && sData.length > 0) {
          mapped = sData.map(s => ({
            id: s.id,
            staffId: s.staff_code || s.id,
            name: s.full_name,
            email: s.email || '',
            role: 'staff',
            department: (s.departments as any)?.name || 'General',
            jobTitle: '',
            employmentDate: '',
            status: 'active',
            lastLogin: '',
            phone: '',
            photo: s.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.full_name)}&background=random`,
            bankName: '',
            accountNumber: '',
            grossSalary: 0,
            address: '',
            nextOfKin: '',
            nextOfKinPhone: '',
            state: '',
          }))
        }
      } catch (err) {
        console.warn('Could not fetch staff from Supabase:', err)
      }

      // Also fetch administrative user profiles (Superadmin, HR, Accountant, Auditor) so they can be tagged with @
      try {
        const { data: pData } = await supabase.from('profiles').select('id, full_name, email, role, photo_url')
        if (pData) {
          pData.forEach(p => {
            if (!mapped.some(s => s.id === p.id || (p.email && s.email === p.email))) {
              mapped.push({
                id: p.id,
                staffId: (p.role || 'admin').toUpperCase(),
                name: p.full_name || (p.role === 'superadmin' ? 'Super Admin' : p.role === 'hr' ? 'HR Manager' : p.role === 'accountant' ? 'Accountant' : p.role === 'auditor' ? 'Auditor' : 'Administrator'),
                email: p.email || '',
                role: p.role as any || 'staff',
                department: p.role === 'hr' ? 'Human Resources' : p.role === 'accountant' ? 'Finance & Accounts' : p.role === 'auditor' ? 'Internal Audit' : 'Executive Management',
                jobTitle: p.role?.toUpperCase() || 'Admin',
                employmentDate: '',
                status: 'active',
                lastLogin: '',
                phone: '',
                photo: p.photo_url || '',
                bankName: '',
                accountNumber: '',
                grossSalary: 0,
                address: '',
                nextOfKin: '',
                nextOfKinPhone: '',
                state: '',
              })
            }
          })
        }
      } catch (pErr) {
        console.warn('Could not fetch profiles for mentions:', pErr)
      }

      // Fallback to mockStaff so the workspace is immediately populated and usable
      if (mapped.length === 0) {
        mapped = mockStaff
      }

      setStaffList(mapped)
    } catch (err) {
      console.error('Error initializing workspace hub:', err)
      setStaffList(mockStaff)
    }
  }

  // 2. Load Teams & Workspace Members when Workspace changes
  useEffect(() => {
    if (selectedWorkspace) {
      loadTeams(selectedWorkspace.id)
      loadWorkspaceMembers(selectedWorkspace.id)
    }
  }, [selectedWorkspace])

  const loadWorkspaceMembers = async (wsId: string) => {
    const members = await getWorkspaceMembers(wsId)
    setWorkspaceMembers(members)
  }

  const loadTeams = async (wsId: string) => {
    const tList = await getTeams(wsId)
    setTeams(tList)
    if (tList.length > 0) {
      setSelectedTeam(tList[0])
    } else {
      setSelectedTeam(null)
      setChannels([])
      setSelectedChannel(null)
      setTeamMembers([])
    }
  }

  // 3. Load Channels & Team Members when Team changes
  useEffect(() => {
    if (selectedTeam) {
      loadChannels(selectedTeam.id)
      loadTeamMembers(selectedTeam.id)
    }
  }, [selectedTeam])

  const loadTeamMembers = async (tId: string) => {
    const members = await getTeamMembers(tId)
    setTeamMembers(members)
  }

  const loadChannels = async (teamId: string) => {
    const chList = await getChannels(teamId)
    setChannels(chList)
    if (chList.length > 0) {
      setSelectedChannel(chList[0])
    } else {
      setSelectedChannel(null)
      setMessages([])
    }
  }

  // 4. Load Messages & Subscribe to Realtime when Channel changes
  useEffect(() => {
    if (selectedChannel) {
      loadMessages(selectedChannel.id)

      // Single unified Realtime subscription per channel
      const channelSub = supabase
        .channel(`chat_${selectedChannel.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `channel_id=eq.${selectedChannel.id}`,
          },
          (payload) => {
            const newMsg = payload.new as any
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev
              const formatted: ChatMessage = {
                id: newMsg.id,
                channel_id: newMsg.channel_id,
                sender_id: newMsg.sender_id,
                content: newMsg.content,
                parent_id: newMsg.parent_id,
                attachments: newMsg.attachments || [],
                reactions: newMsg.reactions || {},
                mentions: newMsg.mentions || [],
                action_tasks: newMsg.action_tasks || [],
                is_pinned: newMsg.is_pinned,
                created_at: newMsg.created_at,
                sender: {
                  id: newMsg.sender_id,
                  name: newMsg.sender_id === currentStaffId ? currentStaffName : 'Colleague',
                  photo: newMsg.sender_id === currentStaffId ? currentStaffPhoto : undefined,
                },
              }
              return [...prev, formatted]
            })
            scrollToBottom()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channelSub)
      }
    }
  }, [selectedChannel])

  const loadMessages = async (chId: string) => {
    setLoadingMessages(true)
    try {
      const data = await getChannelMessages(chId)
      setMessages(data)
      scrollToBottom()
    } finally {
      setLoadingMessages(false)
    }
  }

  const scrollToBottom = () => {
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  // Active Squad Members list (only members who have been added to the current squad/team)
  const activeSquadStaffList: StaffMember[] = useMemo(() => {
    if (!selectedTeam || teamMembers.length === 0) return []
    return teamMembers.map(tm => {
      const st = tm.staff || staffList.find(s => s.id === tm.staff_id)
      if (st) {
        return {
          ...st,
          role: (tm.role === 'lead' ? 'lead' : st.role || 'staff') as any,
        }
      }
      return {
        id: tm.staff_id,
        staffId: tm.staff_id,
        name: 'Squad Member',
        email: '',
        role: tm.role === 'lead' ? 'lead' : 'staff',
        department: selectedTeam.name,
        jobTitle: '',
        employmentDate: '',
        status: 'active',
        lastLogin: '',
        phone: '',
        photo: '',
        bankName: '',
        accountNumber: '',
        grossSalary: 0,
        address: '',
        nextOfKin: '',
        nextOfKinPhone: '',
        state: '',
      } as StaffMember
    })
  }, [selectedTeam, teamMembers, staffList])

  // Filtered members for interactive @ autocomplete dropdown (strictly scoped to active squad members)
  const filteredMentionStaff = useMemo(() => {
    const list: StaffMember[] = [
      {
        id: 'gemini-ai',
        name: 'Workspace AI Copilot',
        email: 'ai@workspace',
        phone: '',
        department: 'Workspace AI Assistant',
        designation: 'AI Copilot',
        staffId: 'ai',
        role: 'member',
        status: 'active',
        joinDate: '',
        salary: 0,
        address: '',
        state: '',
      } as StaffMember,
      ...activeSquadStaffList,
    ]
    return list.filter(s => {
      if (!mentionQuery) return true
      const q = mentionQuery.toLowerCase()
      return (
        s.name.toLowerCase().includes(q) ||
        s.staffId?.toLowerCase().includes(q) ||
        s.department?.toLowerCase().includes(q) ||
        s.role?.toLowerCase().includes(q) || (q.includes('ai') && s.id === 'gemini-ai') || (q.includes('copilot') && s.id === 'gemini-ai') || (q.includes('gem') && s.id === 'gemini-ai') || (q.includes('groq') && s.id === 'gemini-ai')
      )
    }).slice(0, 8)
  }, [activeSquadStaffList, mentionQuery])

  // Live input & @ Mention Autocomplete detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setInputText(text)
    const cursorPos = e.target.selectionStart ?? text.length
    const textBeforeCursor = text.slice(0, cursorPos)

    // Check for @mention trigger immediately before cursor
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/)
    if (match) {
      const query = match[1]
      const atIndex = textBeforeCursor.lastIndexOf('@')
      setMentionStartIndex(atIndex)
      setMentionQuery(query)
      setShowMentionMenu(true)
      setSelectedMentionIndex(0)
    } else {
      setShowMentionMenu(false)
      setMentionQuery('')
    }

    // Live NLP task extractor while typing
    if (text.trim().length > 10) {
      const draft = extractTaskFromMessage(text, staffList.map(s => ({ id: s.id, name: s.name, staffCode: s.staffId })))
      if (draft.isActionable) {
        setLiveTaskDraft(draft)
      } else {
        setLiveTaskDraft(null)
      }
    } else {
      setLiveTaskDraft(null)
    }
  }

  // Insert selected mention into textarea
  const handleSelectMention = (staff: StaffMember) => {
    if (mentionStartIndex === -1 || !textareaRef.current) return
    const cursorPos = textareaRef.current.selectionStart ?? inputText.length
    const before = inputText.slice(0, mentionStartIndex)
    const after = inputText.slice(cursorPos)
    const mentionText = staff.id === 'gemini-ai' ? '@ai ' : `@${staff.name} `
    const newText = `${before}${mentionText}${after}`

    setInputText(newText)
    setShowMentionMenu(false)
    setMentionQuery('')

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + mentionText.length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newPos, newPos)
      }
    }, 10)
  }

  // Highlight @mentions in message bubbles
  const renderMessageContent = (content: string, isMe: boolean) => {
    if (!content) return null
    // Match words starting with @
    const mentionPattern = /(@[a-zA-Z0-9_.-]+(?:\s+[a-zA-Z0-9_.-]+)?)/g
    const parts = content.split(mentionPattern)

    return (
      <p className="whitespace-pre-wrap leading-relaxed">
        {parts.map((part, i) => {
          if (part.startsWith('@')) {
            const rawName = part.slice(1).trim().toLowerCase()
            const isKnownMember = staffList.some(
              s => s.name.toLowerCase().includes(rawName) || rawName.includes(s.name.toLowerCase().split(' ')[0]) || s.staffId?.toLowerCase() === rawName
            )
            if (isKnownMember || rawName.length > 0) {
              return (
                <span
                  key={i}
                  className={`inline-flex items-center font-bold px-1.5 py-0.2 mx-0.5 rounded-md text-xs shadow-2xs ${
                    isMe
                      ? 'bg-white/25 text-white border border-white/35 backdrop-blur-xs'
                      : 'bg-blue-100 text-blue-900 border border-blue-200 font-semibold'
                  }`}
                >
                  {part}
                </span>
              )
            }
          }
          return part
        })}
      </p>
    )
  }

  // Handle Screenshot Paste (Ctrl + V)
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = await extractClipboardImage(e)
    if (!file) return

    setCompressingImage(true)
    try {
      const compressed = await uploadCompressedImage(file, 'clipboard_screenshot.webp', 'chat')
      setAttachments(prev => [...prev, compressed])
    } catch (err: any) {
      alert(err.message || 'Failed to compress pasted screenshot.')
    } finally {
      setCompressingImage(false)
    }
  }

  // Handle File Picker Image Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setCompressingImage(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const compressed = await uploadCompressedImage(file, file.name, 'chat')
        setAttachments(prev => [...prev, compressed])
      }
    } catch (err: any) {
      alert(err.message || 'Failed to upload image.')
    } finally {
      setCompressingImage(false)
    }
  }

  // Send Message with @ mentions detection & notifications
  // Resolve real display name for any chat message
  const resolveSenderName = (msg: ChatMessage, isMe: boolean): string => {
    if (msg.sender_id === 'gemini-ai') return 'Workspace AI Copilot'
    if (isMe) {
      if (currentStaffName && currentStaffName !== 'Current Staff' && currentStaffName !== 'Team Member') {
        return currentStaffName
      }
      return role === 'superadmin' ? 'HRIS Admin' : role === 'hr' ? 'HR Manager' : 'Me'
    }

    // Check staffList by id or profile_id
    const foundStaff = staffList.find(s => s.id === msg.sender_id || (s as any).profile_id === msg.sender_id)
    if (foundStaff?.name) return foundStaff.name

    // Check team members
    const tm = teamMembers.find(t => t.staff_id === msg.sender_id)
    if (tm?.staff?.full_name) return tm.staff.full_name

    // Check if msg.sender has a non-generic name
    if (msg.sender?.name && msg.sender.name !== 'Team Member' && msg.sender.name !== 'Staff Member' && msg.sender.name !== 'Colleague') {
      return msg.sender.name
    }

    if (msg.sender_id === currentStaffId) {
      return (currentStaffName && currentStaffName !== 'Current Staff') ? currentStaffName : 'HRIS Admin'
    }

    return msg.sender?.name || (role === 'superadmin' ? 'HRIS Admin' : 'Team Member')
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!inputText.trim() && attachments.length === 0) || !selectedChannel) return

    const senderId = currentStaffId || 'user-current'
    const senderName = (currentStaffName && currentStaffName !== 'Current Staff' && currentStaffName !== 'Team Member')
      ? currentStaffName
      : (role === 'superadmin' ? 'HRIS Admin' : role === 'hr' ? 'HR Manager' : 'Staff Member')
    const senderPhoto = currentStaffPhoto

    // Extract mentioned staff
    const mentionedStaff = staffList.filter(s => {
      const nameMatch = inputText.toLowerCase().includes(`@${s.name.toLowerCase()}`)
      const codeMatch = s.staffId && inputText.toLowerCase().includes(`@${s.staffId.toLowerCase()}`)
      const firstNameMatch = inputText.toLowerCase().includes(`@${s.name.toLowerCase().split(' ')[0]}`)
      return nameMatch || codeMatch || firstNameMatch
    })
    const mentionedIds = mentionedStaff.map(s => s.id)

    setSendingMessage(true)
    const rawInput = inputText.trim()
    const isGeminiPrompt = rawInput.toLowerCase().includes('@gemini') || 
                           rawInput.toLowerCase().includes('@groq') ||
                           rawInput.toLowerCase().includes('@ai') || 
                           rawInput.toLowerCase().startsWith('/ai') ||
                           rawInput.toLowerCase().startsWith('/gemini') ||
                           rawInput.toLowerCase().startsWith('/groq')

    try {
      // 1. Automatically detect if message contains an actionable team task
      const taskDraft = extractTaskFromMessage(
        inputText.trim(),
        staffList.map(s => ({ id: s.id, name: s.name, staffCode: s.staffId }))
      )

      const autoCreatedTaskIds: string[] = []

      // 2. If actionable, automatically create and schedule the task immediately
      if (taskDraft.isActionable && selectedWorkspace) {
        try {
          const todayIso = new Date().toISOString().split('T')[0]
          const assignedStaff = staffList.find(s => s.id === taskDraft.assigneeId)

          const autoTask = await createWorkspaceTask({
            workspace_id: selectedWorkspace.id,
            team_id: selectedTeam?.id || null,
            channel_id: selectedChannel.id,
            title: taskDraft.title || 'Action Task',
            description: taskDraft.description || `Extracted from chat: "${taskDraft.title}"`,
            priority: taskDraft.priority || 'medium',
            status: 'todo',
            assignee_id: taskDraft.assigneeId || null,
            due_date: taskDraft.dueDate || todayIso,
            due_time: taskDraft.dueTime || '17:00',
            reminder_type: taskDraft.reminderType || '30_min',
            is_recurring: taskDraft.isRecurring || false,
            recurrence_interval: taskDraft.recurrenceInterval || 'none',
            kpi_category: taskDraft.kpiCategory || 'Operations & General Task',
            checklist: [{ id: `c-${Date.now()}`, text: taskDraft.title || 'Complete action item', completed: false }],
            creator_id: currentStaffId || null,
            assignee: assignedStaff ? {
              id: assignedStaff.id,
              name: assignedStaff.name,
              photo: assignedStaff.photo,
              department: assignedStaff.department,
            } : undefined,
          })

          if (autoTask && autoTask.id) {
            autoCreatedTaskIds.push(autoTask.id)
            try {
              sendLocalNotification({
                title: 'Team Task Auto-Created',
                body: `"${autoTask.title}" scheduled for ${taskDraft.assigneeName || assignedStaff?.name || 'team'}`,
              })
            } catch (notifErr) {}
          }
        } catch (taskErr) {
          console.error('Auto task creation failed:', taskErr)
        }
      }

      const msg = await sendChatMessage({
        channel_id: selectedChannel.id,
        sender_id: senderId,
        content: inputText.trim(),
        attachments,
        mentions: mentionedIds,
        action_tasks: autoCreatedTaskIds,
        sender_name: senderName,
        sender_photo: senderPhoto,
      })

      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      setInputText('')
      setAttachments([])
      setLiveTaskDraft(null)
      setShowMentionMenu(false)
      scrollToBottom()

      // Dispatch local notification if members were tagged
      if (mentionedStaff.length > 0) {
        try {
          const names = mentionedStaff.map(s => s.name).join(', ')
          sendLocalNotification({
            title: `Workspace Tag: #${selectedChannel.name}`,
            body: `${senderName} tagged ${names}: "${inputText.trim().substring(0, 80)}"`,
          })
        } catch (notifErr) {
          console.warn('Local notification error:', notifErr)
        }
      }
    } catch (err) {
      console.error('Failed to send chat message:', err)
    } finally {
      setSendingMessage(false)

      // 3. If user invoked Gemini AI Copilot, generate AI response
      if (isGeminiPrompt && selectedChannel) {
        setAiThinking(true)
        const cleanPrompt = rawInput
          .replace(/@gemini/gi, '')
          .replace(/@groq/gi, '')
          .replace(/@ai/gi, '')
          .replace(/^\/ai\s*/i, '')
          .replace(/^\/gemini\s*/i, '')
          .replace(/^\/groq\s*/i, '')
          .trim()

        setTimeout(async () => {
          try {
            if (!isGeminiConfigured()) {
              const helpMsg = await sendChatMessage({
                channel_id: selectedChannel.id,
                sender_id: 'gemini-ai',
                content: "⚡ **Workspace AI Copilot**: Hello! To enable AI responses, task breakdowns, and standup digests, please configure your **Workspace AI API Key** (Groq or Gemini) by clicking the **⚡ Workspace AI** button in the top navigation bar.",
                attachments: [],
                mentions: [senderId],
                action_tasks: [],
                sender_name: 'Workspace AI Copilot',
                sender_photo: '',
              })
              setMessages(prev => prev.some(m => m.id === helpMsg.id) ? prev : [...prev, helpMsg])
            } else {
              const aiAnswer = await generateChatCopilotResponse({
                prompt: cleanPrompt || rawInput,
                currentStaffName: senderName,
                channelName: selectedChannel.name,
                teamName: selectedTeam?.name,
                workspaceName: selectedWorkspace?.name,
                recentMessages: messages.slice(-6).map(m => ({ senderName: m.sender?.name || 'User', content: m.content })),
                staffList: activeSquadStaffList.map(s => ({ id: s.id, name: s.name, department: s.department })),
              })

              const aiMsg = await sendChatMessage({
                channel_id: selectedChannel.id,
                sender_id: 'gemini-ai',
                content: aiAnswer,
                attachments: [],
                mentions: [senderId],
                action_tasks: [],
                sender_name: 'Workspace AI Copilot',
                sender_photo: '',
              })

              setMessages(prev => prev.some(m => m.id === aiMsg.id) ? prev : [...prev, aiMsg])
            }
          } catch (aiErr: any) {
            console.error('AI Copilot Error:', aiErr)
            const errMsg = await sendChatMessage({
              channel_id: selectedChannel.id,
              sender_id: 'gemini-ai',
              content: `⚠️ **Workspace AI Notice**: ${aiErr.message || 'Unable to generate response. Please verify your API key and connection.'}`,
              attachments: [],
              mentions: [senderId],
              action_tasks: [],
              sender_name: 'Workspace AI Copilot',
              sender_photo: '',
            })
            setMessages(prev => prev.some(m => m.id === errMsg.id) ? prev : [...prev, errMsg])
          } finally {
            setAiThinking(false)
          }
        }, 150)
      }
    }
  }

  // Convert Message to Task Modal Trigger
  const handleTriggerConvertTask = (msg: ChatMessage) => {
    const draft = extractTaskFromMessage(msg.content, staffList.map(s => ({ id: s.id, name: s.name, staffCode: s.staffId })))
    const todayIso = new Date().toISOString().split('T')[0]
    
    // Ensure draft has valid date and time for the calendar
    if (!draft.dueDate) {
      draft.dueDate = todayIso
    }
    if (!draft.dueTime) {
      draft.dueTime = '17:00'
    }

    setTaskDraftModal({
      message: msg,
      draft,
    })
  }

  // Save Converted Task
  const handleSaveConvertedTask = async (draft: ExtractedTaskDraft, msgId: string) => {
    if (!selectedWorkspace) return
    const todayIso = new Date().toISOString().split('T')[0]
    const assignedStaff = staffList.find(s => s.id === draft.assigneeId)

    const created = await createWorkspaceTask({
      workspace_id: selectedWorkspace.id,
      team_id: selectedTeam?.id || null,
      channel_id: selectedChannel?.id || null,
      message_id: msgId,
      title: draft.title || 'Action Task',
      description: draft.description || `Extracted from message: "${draft.title}"`,
      priority: draft.priority || 'medium',
      status: 'todo',
      assignee_id: draft.assigneeId || null,
      due_date: draft.dueDate || todayIso,
      due_time: draft.dueTime || '17:00',
      reminder_type: draft.reminderType || '30_min',
      is_recurring: draft.isRecurring || false,
      recurrence_interval: draft.recurrenceInterval || 'none',
      kpi_category: draft.kpiCategory || 'Operations & General Task',
      checklist: [{ id: `c-${Date.now()}`, text: draft.title || 'Complete action item', completed: false }],
      creator_id: currentStaffId || null,
      assignee: assignedStaff ? {
        id: assignedStaff.id,
        name: assignedStaff.name,
        photo: assignedStaff.photo,
        department: assignedStaff.department,
      } : undefined,
    })

    // Mark message as having spawned a task
    setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, action_tasks: [...(m.action_tasks || []), created.id] } : m)))
    setTaskDraftModal(null)

    // Trigger local push notification for task creation
    try {
      sendLocalNotification({
        title: 'New Team Task Created',
        body: `"${created.title}" scheduled for ${draft.assigneeName || assignedStaff?.name || 'team'}`,
      })
    } catch (e) {}

    alert(`✓ Task created successfully and scheduled on calendar: "${created.title}" (Due: ${created.due_date})`)
  }

  // Workspace Member Handlers
  const handleAddWorkspaceMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWorkspace || !selectedStaffToAdd) return
    const staff = staffList.find(s => s.id === selectedStaffToAdd)
    const newMember = await addWorkspaceMember(
      selectedWorkspace.id,
      selectedStaffToAdd,
      selectedRoleToAdd,
      staff
    )
    setWorkspaceMembers(prev => {
      const filtered = prev.filter(m => m.staff_id !== selectedStaffToAdd)
      return [...filtered, newMember]
    })
    setSelectedStaffToAdd('')
  }

  const handleUpdateWorkspaceRole = async (staffId: string, newRole: 'admin' | 'lead' | 'member' | 'viewer') => {
    if (!selectedWorkspace) return
    await updateWorkspaceMemberRole(selectedWorkspace.id, staffId, newRole)
    setWorkspaceMembers(prev =>
      prev.map(m => m.staff_id === staffId ? { ...m, role: newRole } : m)
    )
  }

  const handleRemoveWorkspaceMember = async (staffId: string) => {
    if (!selectedWorkspace) return
    if (confirm('Are you sure you want to remove this member from the workspace?')) {
      await removeWorkspaceMember(selectedWorkspace.id, staffId)
      setWorkspaceMembers(prev => prev.filter(m => m.staff_id !== staffId))
    }
  }

  // Team Member Handlers
  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTeam || !selectedTeamStaffToAdd) return
    const staff = staffList.find(s => s.id === selectedTeamStaffToAdd)
    const newMember = await addTeamMember(
      selectedTeam.id,
      selectedTeamStaffToAdd,
      selectedTeamRoleToAdd,
      staff
    )
    setTeamMembers(prev => {
      const filtered = prev.filter(m => m.staff_id !== selectedTeamStaffToAdd)
      return [...filtered, newMember]
    })
    setSelectedTeamStaffToAdd('')
  }

  const handleUpdateTeamRole = async (staffId: string, newRole: 'lead' | 'member') => {
    if (!selectedTeam) return
    await updateTeamMemberRole(selectedTeam.id, staffId, newRole)
    setTeamMembers(prev =>
      prev.map(m => m.staff_id === staffId ? { ...m, role: newRole } : m)
    )
  }

  const handleRemoveTeamMember = async (staffId: string) => {
    if (!selectedTeam) return
    if (confirm('Are you sure you want to remove this member from this squad?')) {
      await removeTeamMember(selectedTeam.id, staffId)
      setTeamMembers(prev => prev.filter(m => m.staff_id !== staffId))
    }
  }

  // Workspace creation
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWsName.trim()) return
    const created = await createWorkspace({
      name: newWsName.trim(),
      description: newWsDesc.trim(),
      created_by: currentStaffId || undefined,
    })
    setWorkspaces(prev => [...prev, created])
    setSelectedWorkspace(created)
    setShowNewWorkspaceModal(false)
    setNewWsName('')
    setNewWsDesc('')
  }

  // Team creation
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTeamName.trim() || !selectedWorkspace) return
    const created = await createTeam({
      workspace_id: selectedWorkspace.id,
      name: newTeamName.trim(),
      description: newTeamDesc.trim(),
      created_by: currentStaffId || undefined,
    })
    setTeams(prev => [...prev, created])
    setSelectedTeam(created)
    setShowNewTeamModal(false)
    setNewTeamName('')
    setNewTeamDesc('')
  }

  // Channel creation
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChannelName.trim() || !selectedTeam) return
    const created = await createChannel({
      team_id: selectedTeam.id,
      name: newChannelName.trim(),
      topic: newChannelTopic.trim(),
      created_by: currentStaffId || undefined,
    })
    setChannels(prev => [...prev, created])
    setSelectedChannel(created)
    setShowNewChannelModal(false)
    setNewChannelName('')
    setNewChannelTopic('')
  }

  // Deletion Handlers
  const handleDeleteWorkspace = async (wsId: string, wsName: string) => {
    if (workspaces.length <= 1) {
      alert('Cannot delete the only remaining workspace.')
      return
    }
    if (confirm(`Are you sure you want to delete workspace "${wsName}"?\n\nThis will permanently remove all squads, channels, and tasks inside it.`)) {
      await deleteWorkspace(wsId)
      const remaining = workspaces.filter(w => w.id !== wsId)
      setWorkspaces(remaining)
      if (selectedWorkspace?.id === wsId) {
        setSelectedWorkspace(remaining[0] || null)
      }
    }
  }

  const handleDeleteTeam = async (teamId: string, teamName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (confirm(`Are you sure you want to delete squad "${teamName}"?\n\nAll channels and tasks inside this squad will be deleted.`)) {
      await deleteTeam(teamId)
      const remaining = teams.filter(t => t.id !== teamId)
      setTeams(remaining)
      if (selectedTeam?.id === teamId) {
        setSelectedTeam(remaining[0] || null)
      }
    }
  }

  const handleDeleteChannel = async (chId: string, chName: string, isGeneral?: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (isGeneral && channels.length > 1) {
      if (!confirm(`"#${chName}" is marked as the primary squad channel. Are you sure you want to delete it?`)) {
        return
      }
    } else if (!confirm(`Are you sure you want to delete channel "#${chName}"?`)) {
      return
    }
    await deleteChannel(chId)
    const remaining = channels.filter(c => c.id !== chId)
    setChannels(remaining)
    if (selectedChannel?.id === chId) {
      setSelectedChannel(remaining[0] || null)
    }
  }

  // Scorecard Digest to Chat
  const handlePostDigestToChat = async (digestText: string) => {
    if (!selectedChannel) {
      alert('Please select a squad channel to post the digest into.')
      return
    }
    try {
      await sendChatMessage({
        channel_id: selectedChannel.id,
        sender_id: currentStaffId || undefined,
        sender_name: currentStaffName,
        message: digestText,
      })
      // Switch back to chat tab so the user sees the posted digest!
      setActiveTab('chat')
    } catch (err) {
      console.error('Failed to post digest to chat:', err)
    }
  }

  return (
    <div className="h-[calc(100dvh-135px)] md:h-[calc(100vh-80px)] flex flex-col bg-slate-100 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* ═══════════════════════════════════════════════════ */}
      {/* TOP WORKSPACE NAVIGATION & TAB HEADER               */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 sm:px-4 sm:py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          {/* Workspace Selector */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600 text-white font-black flex items-center justify-center text-xs sm:text-sm shadow-xs shrink-0">
              {selectedWorkspace?.name.charAt(0) || 'W'}
            </div>
            <select
              value={selectedWorkspace?.id || ''}
              onChange={e => {
                const ws = workspaces.find(w => w.id === e.target.value)
                if (ws) setSelectedWorkspace(ws)
              }}
              className="font-bold text-xs sm:text-sm text-slate-800 bg-transparent border-none outline-none cursor-pointer hover:text-blue-600 truncate max-w-[130px] sm:max-w-[200px]"
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {(role === 'superadmin' || role === 'hr') && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowNewWorkspaceModal(true)}
                  title="Create Workspace"
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold transition-colors"
                >
                  +
                </button>
                {selectedWorkspace && workspaces.length > 1 && (
                  <button
                    onClick={() => handleDeleteWorkspace(selectedWorkspace.id, selectedWorkspace.name)}
                    title={`Delete workspace "${selectedWorkspace.name}"`}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 flex items-center justify-center text-xs transition-colors"
                  >
                    <IconTrash className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Current Team & Channel Indicator (Desktop only) */}
            {selectedTeam && selectedChannel && (
              <div className="items-center gap-1 text-xs text-slate-600 hidden lg:flex">
                <span className="font-semibold text-slate-800">{selectedTeam.name}</span>
                <span>/</span>
                <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  #{selectedChannel.name}
                </span>
              </div>
            )}

            {/* Manage Workspace Members & Roles Button */}
            <button
              onClick={() => setShowWorkspaceMembersModal(true)}
              className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1 transition-colors border border-blue-200/60 shadow-xs"
              title="Manage workspace members and assign Admins/Leads"
            >
              <IconUsers className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Members</span>
              <span className="bg-blue-200/80 text-blue-800 text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {workspaceMembers.length}
              </span>
            </button>
          </div>
        </div>

        {/* AI Engine Settings & View Switcher (Scrollable horizontally on mobile) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth w-full sm:w-auto pb-0.5 sm:pb-0">
          {role === 'superadmin' ? (
            <button
              onClick={() => setShowGeminiSettingsModal(true)}
              title="Configure Org-Wide Workspace AI (Super Admin Only)"
              className={`px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer text-white shrink-0 ${
                getAiProvider() === 'groq'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
              }`}
            >
              {getAiProvider() === 'groq' ? (
                <IconZap className="w-3.5 h-3.5 text-yellow-200" />
              ) : (
                <IconSparkles className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>Workspace AI</span>
            </button>
          ) : (
            <button
              onClick={() => setShowGeminiSettingsModal(true)}
              title={isGeminiConfigured() ? 'Workspace AI is active' : 'AI not configured — contact your Super Admin'}
              className={`px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer border shrink-0 ${
                isGeminiConfigured()
                  ? getAiProvider() === 'groq'
                    ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                    : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                  : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'
              }`}
            >
              {getAiProvider() === 'groq' ? (
                <IconZap className={`w-3.5 h-3.5 ${isGeminiConfigured() ? 'text-orange-500' : 'text-slate-400'}`} />
              ) : (
                <IconSparkles className={`w-3.5 h-3.5 ${isGeminiConfigured() ? 'text-purple-500' : 'text-slate-400'}`} />
              )}
              <span>{isGeminiConfigured() ? 'AI Active' : 'AI Off'}</span>
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => {
                setActiveTab('chat')
                setShowMobileSidebar(false)
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'chat'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconChat className="w-3.5 h-3.5" />
              <span>Team Chat</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('tasks')
                setShowMobileSidebar(false)
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'tasks'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconKanban className="w-3.5 h-3.5" />
              <span>Kanban & Tasks</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('calendar')
                setShowMobileSidebar(false)
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'calendar'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconCalendar className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('monitoring')
                setShowMobileSidebar(false)
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'monitoring'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconChart className="w-3.5 h-3.5" />
              <span>Monitoring</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('scorecard')
                setShowMobileSidebar(false)
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'scorecard'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IconSparkles className={`w-3.5 h-3.5 ${canAccessExecutiveDigest ? 'text-amber-500' : 'text-blue-500'}`} />
              <span>{canAccessExecutiveDigest ? 'KPI Scorecard' : 'Performance'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* MAIN BODY LAYOUT (SIDEBAR + CONTENT + CONTEXT)       */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT SIDEBAR: TEAMS & CHANNELS ── */}
        <div className={`bg-slate-900 text-slate-200 flex flex-col shrink-0 border-r border-slate-800 transition-all ${showMobileSidebar ? 'w-full flex-1' : 'hidden md:flex md:w-64'}`}>
          {/* Mobile Sidebar Close Bar */}
          <div className="md:hidden px-3 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Squads & Channels</span>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileSidebar(false)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 shadow-2xs"
            >
              <span>✕ Close</span>
            </button>
          </div>
          {/* Teams Header */}
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teams & Squads</span>
            <div className="flex items-center gap-1.5">
              {selectedTeam && (
                <button
                  onClick={() => setShowTeamMembersModal(true)}
                  title={`Manage squad members and leads in ${selectedTeam.name}`}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 flex items-center gap-1 text-[11px] font-bold"
                >
                  <IconUsers className="w-3 h-3 text-blue-400" />
                  <span>Leads</span>
                </button>
              )}
              {(role === 'superadmin' || role === 'hr') && (
                <button
                  onClick={() => setShowNewTeamModal(true)}
                  title="Create Team"
                  className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold"
                >
                  +
                </button>
              )}
            </div>
          </div>

          {/* Teams List */}
          <div className="p-2 space-y-1 overflow-y-auto max-h-44 border-b border-slate-800/60">
            {teams.map(t => (
              <div key={t.id} className="group/team relative flex items-center">
                <button
                  onClick={() => setSelectedTeam(t)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors pr-7 ${
                    selectedTeam?.id === t.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                  <span className="truncate">{t.name}</span>
                </button>
                {(role === 'superadmin' || role === 'hr') && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteTeam(t.id, t.name, e)}
                    title={`Delete squad "${t.name}"`}
                    className="absolute right-1.5 opacity-0 group-hover/team:opacity-100 p-1 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded transition-all"
                  >
                    <IconTrash className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Channels Header */}
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Channels</span>
            <button
              onClick={() => setShowNewChannelModal(true)}
              title="Add Channel"
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold"
            >
              +
            </button>
          </div>

          {/* Channels List */}
          <div className="p-2 space-y-0.5 overflow-y-auto flex-1">
            {channels.map(ch => (
              <div key={ch.id} className="group/ch relative flex items-center">
                <button
                  onClick={() => {
                    setSelectedChannel(ch)
                    setActiveTab('chat')
                    setShowMobileSidebar(false)
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors pr-7 ${
                    selectedChannel?.id === ch.id
                      ? 'bg-slate-800 text-blue-400 font-bold'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="text-slate-500">#</span>
                    <span className="truncate">{ch.name}</span>
                  </span>
                  {ch.is_general && (
                    <span className="text-[9px] bg-slate-700 text-slate-300 px-1 py-0.2 rounded shrink-0">main</span>
                  )}
                </button>
                {(role === 'superadmin' || role === 'hr') && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteChannel(ch.id, ch.name, ch.is_general, e)}
                    title={`Delete channel "#${ch.name}"`}
                    className="absolute right-1.5 opacity-0 group-hover/ch:opacity-100 p-1 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded transition-all"
                  >
                    <IconTrash className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* User Profile Bar at bottom */}
          <div className="p-3 bg-slate-950 border-t border-slate-800/80 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
              {currentStaffName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-slate-200 block truncate">{currentStaffName}</span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online
              </span>
            </div>
          </div>
        </div>

        {/* ── CENTER CONTENT (CHAT / KANBAN / MONITORING) ── */}
        <div className={`flex-1 flex flex-col bg-white overflow-hidden ${showMobileSidebar ? 'hidden md:flex' : 'flex'}`}>
          {/* Mobile Squad Indicator in non-chat tabs */}
          {activeTab !== 'chat' && (
            <div className="md:hidden px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-600 truncate max-w-[200px]">Squad: <strong className="text-slate-900">{selectedTeam?.name || 'Company Hub'}</strong></span>
              <button
                type="button"
                onClick={() => setShowMobileSidebar(true)}
                className="text-blue-600 font-bold text-xs hover:underline flex items-center gap-0.5"
              >
                <span>Switch Squad</span>
                <span>▾</span>
              </button>
            </div>
          )}
          {/* TAB 1: REAL-TIME TEAM CHAT */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Channel Header Banner */}
              <div className="px-3 py-2 sm:px-5 sm:py-3 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setShowMobileSidebar(true)}
                    className="md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 shadow-2xs shrink-0"
                    title="Open Teams & Channels"
                  >
                    <IconChat className="w-3.5 h-3.5 text-blue-600" />
                    <span>Squads</span>
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate">#{selectedChannel?.name || 'select-a-channel'}</h3>
                      {selectedChannel?.is_general && (
                        <span className="text-[9px] sm:text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full shrink-0">General</span>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-500 truncate max-w-[180px] sm:max-w-none">{selectedChannel?.topic || 'Collaborate with your squad in real-time'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRightSidebar(!showRightSidebar)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-2 py-1.5 sm:px-2.5 rounded-lg flex items-center gap-1 transition-colors shrink-0"
                >
                  <IconInfo className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{showRightSidebar ? 'Hide Info' : 'Show Info'}</span>
                </button>
              </div>

              {/* Chat Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2">
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                      <IconChat className="w-6 h-6 text-blue-600" />
                    </div>
                    <h4 className="font-bold text-slate-700 text-sm">Welcome to #{selectedChannel?.name}</h4>
                    <p className="text-xs max-w-sm">This is the start of the #{selectedChannel?.name} channel. Send a message or paste a screenshot to start collaborating.</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.sender_id === currentStaffId || (!currentStaffId && msg.sender_id === 'user-current')
                    const isAi = msg.sender_id === 'gemini-ai'
                    const displayName = resolveSenderName(msg, isMe)
                    const displayPhoto = isMe
                      ? (currentStaffPhoto || msg.sender?.photo)
                      : (msg.sender?.photo || staffList.find(s => s.id === msg.sender_id)?.photo)
                    const taskProposal = extractTaskFromMessage(msg.content, staffList.map(s => ({ id: s.id, name: s.name, staffCode: s.staffId })))

                    return (
                      <div key={msg.id} className={`flex gap-3 group ${isMe ? 'flex-row-reverse' : ''}`}>
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 shadow-xs overflow-hidden ${
                          isAi 
                            ? 'bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 text-amber-300 font-black ring-2 ring-purple-300' 
                            : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold'
                        }`}>
                          {isAi ? (
                            <IconZap className="w-4 h-4 text-amber-300" />
                          ) : displayPhoto ? (
                            <img src={displayPhoto} alt={displayName} className="w-full h-full object-cover" />
                          ) : (
                            displayName.charAt(0).toUpperCase()
                          )}
                        </div>

                        {/* Bubble */}
                        <div className={`max-w-[85%] sm:max-w-xl space-y-1.5 ${isMe ? 'items-end text-right' : ''}`}>
                          {/* Sender Info & Time */}
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-700">{displayName}</span>
                              {isAi && (
                                <span className="text-[9px] bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-extrabold px-1.5 py-0.2 rounded-full tracking-wider uppercase">
                                  AI Copilot
                                </span>
                              )}
                            </div>
                            <span className="text-[10px]">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>

                          {/* Message Body */}
                          <div
                            className={`p-3 rounded-2xl text-sm leading-relaxed text-left shadow-xs ${
                              isAi
                                ? 'bg-purple-50/70 border border-purple-200/70 text-slate-900 rounded-tl-xs'
                                : isMe
                                ? 'bg-blue-600 text-white rounded-tr-xs'
                                : 'bg-slate-100 text-slate-800 rounded-tl-xs border border-slate-200/60'
                            }`}
                          >
                            <RichChatMessage content={msg.content} isMe={isMe} isAi={isAi} />

                            {/* Image Attachments */}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-black/10">
                                {msg.attachments.map((att, aIdx) => (
                                  <div
                                    key={aIdx}
                                    onClick={() => setActiveLightboxImage(att.url)}
                                    className="relative group/img rounded-xl overflow-hidden border border-black/10 bg-black/5 cursor-pointer max-h-48"
                                  >
                                    <img
                                      src={att.url}
                                      alt={att.name}
                                      className="w-full h-36 object-cover group-hover/img:scale-105 transition-transform"
                                    />
                                    <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                                      {formatFileSize(att.size)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Task Auto-Created Indicator */}
                          {taskProposal.isActionable && (
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full shadow-2xs">
                                <IconCheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Task Auto-Created:</span>
                                <span className="font-semibold text-emerald-800 truncate max-w-[260px]">"{taskProposal.title}"</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
                {aiThinking && (
                  <div className="flex gap-3 items-center text-xs text-purple-800 bg-purple-50/80 border border-purple-200/80 rounded-2xl p-3 max-w-md shadow-xs animate-pulse">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <IconSparkles className="w-4 h-4 text-amber-300 animate-spin" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-bold text-purple-900">Workspace AI Copilot</p>
                      <p className="text-[11px] text-purple-700">Analyzing context and formulating response...</p>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Live Task Detection Preview Bar while typing */}
              {liveTaskDraft && (
                <div className="px-4 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 border-t border-emerald-200 flex items-center justify-between text-xs text-emerald-900 animate-fadeIn">
                  <div className="flex items-center gap-2 truncate">
                    <IconZap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-bold">Detected Action Item:</span>
                    <span className="font-semibold truncate">"{liveTaskDraft.title}"</span>
                    {liveTaskDraft.assigneeName && (
                      <span className="bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded font-bold text-[10px]">
                        @{liveTaskDraft.assigneeName}
                      </span>
                    )}
                    {liveTaskDraft.dueDate && (
                      <span className="bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded font-bold text-[10px]">
                        Due: {liveTaskDraft.dueDate} {liveTaskDraft.dueTime ? `(${liveTaskDraft.dueTime})` : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 shrink-0 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span>⚡ Auto-schedules on send</span>
                  </span>
                </div>
              )}

              {/* Chat Input Box with Clipboard Screenshot Paste Support */}
              <div className="p-3 bg-white border-t border-slate-200 space-y-2">
                {/* Pending Attachment Previews */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pb-1">
                    {attachments.map((att, idx) => (
                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50 h-16 w-20">
                        <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] text-center truncate">
                          {formatFileSize(att.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[10px] flex items-center justify-center font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {compressingImage && (
                  <div className="flex items-center gap-2 text-xs text-blue-600 font-medium py-1 animate-pulse">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    Compressing screenshot/image in browser...
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  {/* File Upload Button (Image Only) */}
                  <button
                    type="button"
                    onClick={() => {
                      setInputText(prev => prev ? `@ai ${prev}` : '@ai ')
                      textareaRef.current?.focus()
                    }}
                    title="Ask Workspace AI Copilot"
                    className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg cursor-pointer transition-colors flex items-center gap-1 text-xs font-bold"
                  >
                    <IconSparkles className="w-4 h-4 text-purple-600" />
                    <span className="hidden sm:inline">Ask AI</span>
                  </button>

                  <label
                    title="Upload Compressed Image"
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {/* Textarea with Paste Handler & @ Mention Menu */}
                  <div className="flex-1 relative">
                    {/* Mention Autocomplete Dropdown - strictly squad members */}
                    {showMentionMenu && (
                      <div className="absolute bottom-full mb-2 left-0 right-0 sm:right-auto sm:w-80 max-h-56 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 flex flex-col">
                        <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Squad Members ({filteredMentionStaff.length})</span>
                          <span className="font-normal text-slate-400 text-[9px]">
                            {filteredMentionStaff.length > 0 ? '↑↓ navigate • ↵ select' : ''}
                          </span>
                        </div>
                        {activeSquadStaffList.length === 0 ? (
                          <div className="p-3.5 text-center text-xs text-slate-500 italic space-y-1">
                            <p className="font-medium text-slate-600">No members in this squad yet.</p>
                            <p className="text-[11px] text-slate-400">Add members via "Manage" in the right squad panel.</p>
                          </div>
                        ) : filteredMentionStaff.length === 0 ? (
                          <div className="p-3.5 text-center text-xs text-slate-500 italic">
                            No squad members matching "@{mentionQuery}"
                          </div>
                        ) : (
                          <div className="overflow-y-auto max-h-56 divide-y divide-slate-100">
                            {filteredMentionStaff.map((staff, idx) => (
                              <button
                                key={staff.id}
                                type="button"
                                onMouseDown={e => {
                                  e.preventDefault()
                                  handleSelectMention(staff)
                                }}
                                className={`w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors ${
                                  idx === selectedMentionIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-800'
                                }`}
                              >
                                <div className={`w-7 h-7 rounded-full font-bold flex items-center justify-center text-xs shrink-0 overflow-hidden ${
                                  staff.id === 'gemini-ai'
                                    ? 'bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 text-amber-300 ring-1 ring-purple-300'
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {staff.id === 'gemini-ai' ? (
                                    <IconZap className="w-3.5 h-3.5" />
                                  ) : staff.photo ? (
                                    <img src={staff.photo} alt={staff.name} className="w-full h-full object-cover" />
                                  ) : (
                                    staff.name.charAt(0).toUpperCase()
                                  )}
                                </div>
                                <div className="flex-1 truncate min-w-0">
                                  <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                                    <span className="truncate">{staff.name}</span>
                                    {staff.role === 'lead' ? (
                                      <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded shrink-0">
                                        Lead
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-mono">({staff.staffId})</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {staff.department || selectedTeam?.name || 'Squad Member'}
                                  </div>
                                </div>
                                {idx === selectedMentionIndex && (
                                  <span className="text-[9px] text-blue-600 font-bold bg-blue-100/80 px-1.5 py-0.5 rounded shrink-0">
                                    Tab ↵
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <textarea
                      ref={textareaRef}
                      rows={2}
                      placeholder={`Message #${selectedChannel?.name || 'channel'} or tag @ai…`}
                      value={inputText}
                      onChange={handleInputChange}
                      onPaste={handlePaste}
                      onKeyDown={e => {
                        if (showMentionMenu && filteredMentionStaff.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            setSelectedMentionIndex(prev => (prev + 1) % filteredMentionStaff.length)
                            return
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            setSelectedMentionIndex(prev => (prev - 1 + filteredMentionStaff.length) % filteredMentionStaff.length)
                            return
                          }
                          if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault()
                            handleSelectMention(filteredMentionStaff[selectedMentionIndex])
                            return
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            setShowMentionMenu(false)
                            return
                          }
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage(e)
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-medium text-slate-800"
                    />
                  </div>

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={sendingMessage || (!inputText.trim() && attachments.length === 0)}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white p-2.5 rounded-xl font-bold transition-all shadow-xs shrink-0"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: KANBAN & TASK MANAGEMENT */}
          {activeTab === 'tasks' && (
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/60">
              <TaskBoard
                workspaceId={selectedWorkspace?.id}
                teamId={selectedTeam?.id}
                workspaceName={selectedWorkspace?.name}
                teamName={selectedTeam?.name}
                staffList={staffList}
                currentStaffId={currentStaffId}
                currentStaffName={currentStaffName}
                canAccessExecutiveDigest={canAccessExecutiveDigest}
                initialView="kanban"
                onPostDigestToChat={handlePostDigestToChat}
              />
            </div>
          )}

          {/* TAB 3: TASK CALENDAR & DUE SCHEDULE */}
          {activeTab === 'calendar' && (
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/60">
              <TaskBoard
                workspaceId={selectedWorkspace?.id}
                teamId={selectedTeam?.id}
                workspaceName={selectedWorkspace?.name}
                teamName={selectedTeam?.name}
                staffList={staffList}
                currentStaffId={currentStaffId}
                currentStaffName={currentStaffName}
                canAccessExecutiveDigest={canAccessExecutiveDigest}
                initialView="calendar"
                onPostDigestToChat={handlePostDigestToChat}
              />
            </div>
          )}

          {/* TAB 4: VELOCITY & DAILY STANDUPS MONITORING */}
          {activeTab === 'monitoring' && (
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/60">
              <TeamMonitoring
                workspaceId={selectedWorkspace?.id}
                teamId={selectedTeam?.id}
                staffList={staffList}
                currentStaffId={currentStaffId}
                currentStaffName={currentStaffName}
                canAccessExecutiveDigest={canAccessExecutiveDigest}
                squadName={selectedTeam?.name}
                onPostDigestToChat={handlePostDigestToChat}
              />
            </div>
          )}

          {/* TAB 5: WEEKLY KPI SCORECARD & PERFORMANCE DIGEST */}
          {activeTab === 'scorecard' && (
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/60">
              <TaskBoard
                workspaceId={selectedWorkspace?.id}
                teamId={selectedTeam?.id}
                workspaceName={selectedWorkspace?.name}
                teamName={selectedTeam?.name}
                staffList={staffList}
                currentStaffId={currentStaffId}
                currentStaffName={currentStaffName}
                canAccessExecutiveDigest={canAccessExecutiveDigest}
                initialView="scorecard"
                onPostDigestToChat={handlePostDigestToChat}
              />
            </div>
          )}
        </div>

        {/* ── RIGHT CONTEXT DRAWER (INFO & SQUAD STATS) ── */}
        {showRightSidebar && activeTab === 'chat' && (
          <div className="w-64 bg-slate-50 border-l border-slate-200 p-4 space-y-5 overflow-y-auto hidden lg:block">
            {/* Squad Info */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team Details</span>
              <h4 className="font-bold text-slate-900 text-sm">{selectedTeam?.name || 'Team'}</h4>
              <p className="text-xs text-slate-500 leading-snug">{selectedTeam?.description || 'Active squad'}</p>
            </div>

            {/* Quick Stats */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Workspace Code</span>
                <span className="font-bold font-mono text-blue-600">{selectedWorkspace?.code}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Channel Type</span>
                <span className="font-semibold text-slate-700">Public Channel</span>
              </div>
            </div>

            {/* Squad Members List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Squad Members ({teamMembers.length})
                </span>
                <button
                  onClick={() => setShowTeamMembersModal(true)}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors"
                >
                  Manage
                </button>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {teamMembers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No members assigned to this squad yet.</p>
                ) : (
                  teamMembers.map(tm => {
                    const st = tm.staff || staffList.find(s => s.id === tm.staff_id)
                    return (
                      <div key={tm.id} className="flex items-center gap-2 text-xs py-1">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                          {st?.name ? st.name.charAt(0) : 'U'}
                        </div>
                        <div className="flex-1 truncate min-w-0">
                          <span className="font-semibold text-slate-800 block truncate">
                            {st?.name || 'Staff Member'}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate block">
                            {st?.department || 'General'}
                          </span>
                        </div>
                        {tm.role === 'lead' ? (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded-full shrink-0 flex items-center gap-1">
                            <IconLeadStar className="w-2.5 h-2.5 text-amber-700" />
                            <span>Lead</span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold text-slate-400 shrink-0">
                            Member
                          </span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── CONVERT TO TASK MODAL ── */}
      {taskDraftModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <IconZap className="w-4 h-4 text-blue-600" />
                  <span>Schedule Task from Conversation</span>
                </h3>
                <p className="text-xs text-slate-500">Auto-extracted action item from team discussion</p>
              </div>
              <button
                onClick={() => setTaskDraftModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">Task Title</label>
                <input
                  type="text"
                  value={taskDraftModal.draft.title}
                  onChange={e => setTaskDraftModal({
                    ...taskDraftModal,
                    draft: { ...taskDraftModal.draft, title: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">Assignee</label>
                  <select
                    value={taskDraftModal.draft.assigneeId || ''}
                    onChange={e => {
                      const s = staffList.find(x => x.id === e.target.value)
                      setTaskDraftModal({
                        ...taskDraftModal,
                        draft: { ...taskDraftModal.draft, assigneeId: e.target.value, assigneeName: s?.name }
                      })
                    }}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">Priority</label>
                  <select
                    value={taskDraftModal.draft.priority || 'medium'}
                    onChange={e => setTaskDraftModal({
                      ...taskDraftModal,
                      draft: { ...taskDraftModal.draft, priority: e.target.value as any }
                    })}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Due Date, Due Time & In-App Reminder Alert */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <IconCalendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Due Date</span>
                  </label>
                  <input
                    type="date"
                    value={taskDraftModal.draft.dueDate || ''}
                    onChange={e => setTaskDraftModal({
                      ...taskDraftModal,
                      draft: { ...taskDraftModal.draft, dueDate: e.target.value }
                    })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <IconClock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Due Time</span>
                  </label>
                  <input
                    type="time"
                    value={taskDraftModal.draft.dueTime || ''}
                    onChange={e => setTaskDraftModal({
                      ...taskDraftModal,
                      draft: { ...taskDraftModal.draft, dueTime: e.target.value }
                    })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <IconBell className="w-3.5 h-3.5 text-amber-600" />
                    <span>Reminder</span>
                  </label>
                  <select
                    value={taskDraftModal.draft.reminderType || 'none'}
                    onChange={e => setTaskDraftModal({
                      ...taskDraftModal,
                      draft: { ...taskDraftModal.draft, reminderType: e.target.value as any }
                    })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-medium"
                  >
                    <option value="none">None</option>
                    <option value="on_due_time">At due time</option>
                    <option value="15_min">15m before</option>
                    <option value="30_min">30m before</option>
                    <option value="1_hour">1h before</option>
                    <option value="1_day">1d before</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">KPI Category</label>
                <select
                  value={taskDraftModal.draft.kpiCategory || 'Operations & General Task'}
                  onChange={e => setTaskDraftModal({
                    ...taskDraftModal,
                    draft: { ...taskDraftModal.draft, kpiCategory: e.target.value }
                  })}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Sales & Customer Acquisition">Sales & Customer Acquisition</option>
                  <option value="Technical & IT Procedures">Technical & IT Procedures</option>
                  <option value="HR & People Operations">HR & People Operations</option>
                  <option value="Finance & Accounting">Finance & Accounting</option>
                  <option value="Operations & General Task">Operations & General Task</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTaskDraftModal(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveConvertedTask(taskDraftModal.draft, taskDraftModal.message.id)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs"
                >
                  Confirm & Schedule Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE WORKSPACE MODAL ── */}
      {showNewWorkspaceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Create New Workspace</h3>
            <form onSubmit={handleCreateWorkspace} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Workspace Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Client Acquisition Hub"
                  value={newWsName}
                  onChange={e => setNewWsName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Operational scope..."
                  value={newWsDesc}
                  onChange={e => setNewWsDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewWorkspaceModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg"
                >
                  Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CREATE TEAM MODAL ── */}
      {showNewTeamModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Create Squad / Team</h3>
            <form onSubmit={handleCreateTeam} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Team Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise Sales Squad"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Goals and squad charter..."
                  value={newTeamDesc}
                  onChange={e => setNewTeamDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewTeamModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CREATE CHANNEL MODAL ── */}
      {showNewChannelModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add Discussion Channel</h3>
            <form onSubmit={handleCreateChannel} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Channel Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. deals-pipeline"
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Topic</label>
                <input
                  type="text"
                  placeholder="Channel topic or purpose..."
                  value={newChannelTopic}
                  onChange={e => setNewChannelTopic(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewChannelModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg"
                >
                  Add Channel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MANAGE WORKSPACE MEMBERS & ROLES MODAL ── */}
      {showWorkspaceMembersModal && selectedWorkspace && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <IconUsers className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    Workspace Members & Roles
                  </h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-mono">
                    {selectedWorkspace.name}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assign staff to this workspace and designate Workspace Admins, Leads, or Standard Members.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowWorkspaceMembersModal(false)
                  setMemberSearchQuery('')
                  setSelectedStaffToAdd('')
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Add New Member Section */}
              <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 mb-2 flex items-center gap-1.5">
                  <IconPlus className="w-3.5 h-3.5 text-blue-600" />
                  <span>Add New Member to Workspace</span>
                </h4>
                <form onSubmit={handleAddWorkspaceMember} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                  <div className="sm:col-span-6">
                    <select
                      value={selectedStaffToAdd}
                      onChange={e => setSelectedStaffToAdd(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    >
                      <option value="">-- Select Staff from Directory --</option>
                      {staffList
                        .filter(s => !workspaceMembers.some(m => m.staff_id === s.id))
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.staffId}) — {s.department}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <select
                      value={selectedRoleToAdd}
                      onChange={e => setSelectedRoleToAdd(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    >
                      <option value="admin">Workspace Admin</option>
                      <option value="lead">Workspace Lead</option>
                      <option value="member">Standard Member</option>
                      <option value="viewer">Read-Only Viewer</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={!selectedStaffToAdd}
                      className="w-full h-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1"
                    >
                      <IconPlus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Members List & Role Controls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Current Workspace Members ({workspaceMembers.length})
                  </h4>
                  <input
                    type="text"
                    placeholder="Search members..."
                    value={memberSearchQuery}
                    onChange={e => setMemberSearchQuery(e.target.value)}
                    className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg outline-none w-48 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {workspaceMembers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        No members assigned yet. Use the form above to assign staff.
                      </div>
                    ) : (
                      workspaceMembers
                        .filter(m => {
                          if (!memberSearchQuery) return true
                          const st = m.staff || staffList.find(s => s.id === m.staff_id)
                          const q = memberSearchQuery.toLowerCase()
                          return (
                            (st?.name && st.name.toLowerCase().includes(q)) ||
                            (st?.department && st.department.toLowerCase().includes(q)) ||
                            (st?.staffId && st.staffId.toLowerCase().includes(q))
                          )
                        })
                        .map(m => {
                          const st = m.staff || staffList.find(s => s.id === m.staff_id)
                          return (
                            <div key={m.id} className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                                  {st?.name ? st.name.charAt(0) : 'U'}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs text-slate-900 truncate">
                                      {st?.name || 'Staff Member'}
                                    </span>
                                    {m.role === 'admin' && (
                                      <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-black rounded-md flex items-center gap-1">
                                        <IconAdminCrown className="w-2.5 h-2.5 text-purple-700" />
                                        <span>Admin</span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                    <span>{st?.department || 'General'}</span>
                                    {st?.staffId && <span>• ID: {st.staffId}</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <select
                                  value={m.role}
                                  onChange={e => handleUpdateWorkspaceRole(m.staff_id, e.target.value as any)}
                                  className="text-xs font-semibold px-2 py-1 bg-slate-100 border border-slate-300 rounded-lg outline-none cursor-pointer hover:border-slate-400"
                                >
                                  <option value="admin">Admin</option>
                                  <option value="lead">Lead</option>
                                  <option value="member">Member</option>
                                  <option value="viewer">Viewer</option>
                                </select>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveWorkspaceMember(m.staff_id)}
                                  title="Remove from workspace"
                                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center text-sm font-bold transition-colors"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          )
                        })
                    )}
                  </div>
                </div>
              </div>

              {/* Roles Guide */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-[11px] text-slate-600">
                <span className="font-bold text-slate-800 block uppercase tracking-wide text-[10px]">
                  Role Permissions Guide:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-start gap-1.5">
                    <IconAdminCrown className="w-3.5 h-3.5 text-purple-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-purple-700">Admin: </span>
                      <span>Can configure workspace settings, create squads/channels, promote members to admin, and manage tasks.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <IconLeadStar className="w-3.5 h-3.5 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-blue-700">Lead: </span>
                      <span>Can create squads & channels, assign sprint tasks, and lead team reviews.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <IconUser className="w-3.5 h-3.5 text-slate-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-700">Member: </span>
                      <span>Full participation in team chat, Kanban task execution, and daily standups.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <IconEyeViewer className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-500">Viewer: </span>
                      <span>Read-only access to view conversations and task velocity without modifying.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowWorkspaceMembersModal(false)
                  setMemberSearchQuery('')
                  setSelectedStaffToAdd('')
                }}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MANAGE TEAM / SQUAD MEMBERS & LEADS MODAL ── */}
      {showTeamMembersModal && selectedTeam && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <IconUsers className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    Squad Members & Leads
                  </h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                    {selectedTeam.name}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assign staff to this squad and designate Squad Leads (Managers).
                </p>
              </div>
              <button
                onClick={() => {
                  setShowTeamMembersModal(false)
                  setSelectedTeamStaffToAdd('')
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Add New Squad Member */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900 mb-2 flex items-center gap-1.5">
                  <IconPlus className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Add Staff to Squad</span>
                </h4>
                <form onSubmit={handleAddTeamMember} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                  <div className="sm:col-span-6">
                    <select
                      value={selectedTeamStaffToAdd}
                      onChange={e => setSelectedTeamStaffToAdd(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    >
                      <option value="">-- Select Staff --</option>
                      {staffList
                        .filter(s => !teamMembers.some(m => m.staff_id === s.id))
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.staffId}) — {s.department}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <select
                      value={selectedTeamRoleToAdd}
                      onChange={e => setSelectedTeamRoleToAdd(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    >
                      <option value="lead">Squad Lead / Manager</option>
                      <option value="member">Squad Member</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={!selectedTeamStaffToAdd}
                      className="w-full h-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1"
                    >
                      <IconPlus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Squad Members List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Assigned Squad Members ({teamMembers.length})
                </h4>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {teamMembers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        No members assigned to this squad yet.
                      </div>
                    ) : (
                      teamMembers.map(tm => {
                        const st = tm.staff || staffList.find(s => s.id === tm.staff_id)
                        return (
                          <div key={tm.id} className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0">
                                {st?.name ? st.name.charAt(0) : 'U'}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-slate-900 truncate">
                                    {st?.name || 'Staff Member'}
                                  </span>
                                  {tm.role === 'lead' && (
                                    <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black rounded-md flex items-center gap-1">
                                      <IconLeadStar className="w-2.5 h-2.5 text-amber-700" />
                                      <span>Lead</span>
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500 block truncate">
                                  {st?.department || 'General'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                value={tm.role}
                                onChange={e => handleUpdateTeamRole(tm.staff_id, e.target.value as any)}
                                className="text-xs font-semibold px-2 py-1 bg-slate-100 border border-slate-300 rounded-lg outline-none cursor-pointer hover:border-slate-400"
                              >
                                <option value="lead">Squad Lead</option>
                                <option value="member">Squad Member</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => handleRemoveTeamMember(tm.staff_id)}
                                title="Remove from squad"
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center text-sm font-bold transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowTeamMembersModal(false)
                  setSelectedTeamStaffToAdd('')
                }}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GEMINI AI SETTINGS MODAL ── */}
      <GeminiSettingsModal
        isOpen={showGeminiSettingsModal}
        onClose={() => setShowGeminiSettingsModal(false)}
        isSuperAdmin={role === 'superadmin'}
      />

      {/* ── LIGHTBOX VIEWER ── */}
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
    </div>
  )
}
