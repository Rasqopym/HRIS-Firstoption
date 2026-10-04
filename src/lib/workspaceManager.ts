import { supabase } from './supabase'
import type {
  Workspace,
  WorkspaceMember,
  Team,
  TeamMember,
  Channel,
  ChatMessage,
  WorkspaceTask,
  TaskComment,
  TaskTimeLog,
  ActiveTaskTimer,
  RecurrenceInterval,
  DailyStandup,
  CompressedImageAttachment,
} from '../types'

const LOCAL_WORKSPACE_KEY = 'hris_workspaces_cache'
const LOCAL_TASKS_KEY = 'hris_tasks_cache'
const LOCAL_MESSAGES_KEY = 'hris_messages_cache'
const LOCAL_WS_MEMBERS_KEY = 'hris_ws_members_cache'
const LOCAL_TEAM_MEMBERS_KEY = 'hris_team_members_cache'

// ── Default Seed Data for Instant Out-of-the-Box Experience ──────────────────
export const DEFAULT_WORKSPACES: Workspace[] = [
  {
    id: 'ws-main',
    name: 'FirstOption Headquarters',
    code: 'FOHQ',
    description: 'Main corporate workspace for cross-functional company collaboration and operations',
    icon: 'Building2',
    color: '#2563eb',
    is_default: true,
  },
  {
    id: 'ws-sales',
    name: 'Sales & Growth Operations',
    code: 'SALES',
    description: 'Lead generation, client pipeline, onboarding, and revenue acceleration hub',
    icon: 'TrendingUp',
    color: '#059669',
    is_default: false,
  },
  {
    id: 'ws-tech',
    name: 'Technology & Product Engineering',
    code: 'TECH',
    description: 'Software development, IT infrastructure, sprint backlogs, and technical SOPs',
    icon: 'Terminal',
    color: '#7c3aed',
    is_default: false,
  },
]

export const DEFAULT_TEAMS: Team[] = [
  {
    id: 'team-general',
    workspace_id: 'ws-main',
    name: 'Company Wide Hub',
    description: 'General announcements, townhalls, and company-wide collaborative discussions',
    icon: 'Megaphone',
    is_private: false,
  },
  {
    id: 'team-sales',
    workspace_id: 'ws-sales',
    name: 'Enterprise Sales Squad',
    description: 'Outbound sales, pitch decks, customer meetings, and contract negotiations',
    icon: 'Target',
    is_private: false,
  },
  {
    id: 'team-ops',
    workspace_id: 'ws-main',
    name: 'People & Business Operations',
    description: 'HR policy, payroll reviews, procurement, and facility management',
    icon: 'Briefcase',
    is_private: false,
  },
  {
    id: 'team-eng',
    workspace_id: 'ws-tech',
    name: 'Core Platform Engineering',
    description: 'Fullstack app development, database optimization, and cloud architecture',
    icon: 'Code',
    is_private: false,
  },
]

export const DEFAULT_CHANNELS: Channel[] = [
  { id: 'ch-announcements', team_id: 'team-general', name: 'announcements', topic: 'Official company-wide updates', is_general: true },
  { id: 'ch-watercooler', team_id: 'team-general', name: 'general-chat', topic: 'Casual team banter and daily check-ins', is_general: false },
  { id: 'ch-sales-pipeline', team_id: 'team-sales', name: 'sales-pipeline', topic: 'Live leads and opportunity tracking', is_general: true },
  { id: 'ch-sales-deals', team_id: 'team-sales', name: 'closed-deals', topic: 'Celebrate closed revenue wins and contract executions', is_general: false },
  { id: 'ch-ops-tasks', team_id: 'team-ops', name: 'operations-tasks', topic: 'Operational execution and compliance tasks', is_general: true },
  { id: 'ch-eng-sprint', team_id: 'team-eng', name: 'sprint-board', topic: 'Sprint tasks, code reviews, and deployments', is_general: true },
]

export const DEFAULT_TASKS: WorkspaceTask[] = [
  {
    id: 'task-1',
    workspace_id: 'ws-sales',
    team_id: 'team-sales',
    channel_id: 'ch-sales-pipeline',
    title: 'Prepare Corporate Pitch Deck for Zenith Partners',
    description: 'Customize the corporate slide deck with our Q3 enterprise case studies and SLA pricing schedule.',
    priority: 'high',
    status: 'in_progress',
    due_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    due_time: '14:30',
    reminder_type: '30_min',
    reminder_at: new Date(Date.now() + 86400000 * 2 - 30 * 60000).toISOString(),
    reminder_sent: false,
    estimated_hours: 4,
    actual_hours: 1.5,
    kpi_category: 'Sales & Customer Acquisition',
    checklist: [
      { id: 'c1', text: 'Update slide 4 with client testimonials', completed: true },
      { id: 'c2', text: 'Attach pricing tier breakdown for 500+ licenses', completed: false },
      { id: 'c3', text: 'Review presentation with team lead', completed: false },
    ],
    image_attachments: [],
    tags: ['Sales', 'Pitch', 'Zenith'],
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'task-2',
    workspace_id: 'ws-tech',
    team_id: 'team-eng',
    channel_id: 'ch-eng-sprint',
    title: 'Implement In-App Compressed Image Lightbox Viewer',
    description: 'Add image magnification modal for crisp WebP screenshot previews in team chat.',
    priority: 'urgent',
    status: 'todo',
    due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    due_time: '11:00',
    reminder_type: '1_hour',
    reminder_at: new Date(Date.now() + 86400000 - 60 * 60000).toISOString(),
    reminder_sent: false,
    estimated_hours: 3,
    actual_hours: 0,
    kpi_category: 'Technical & IT Procedures',
    checklist: [
      { id: 'c1', text: 'Build zoomable lightbox modal', completed: false },
      { id: 'c2', text: 'Ensure touch gestures work on mobile browsers', completed: false },
    ],
    image_attachments: [],
    tags: ['Frontend', 'UI', 'Performance'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'task-3',
    workspace_id: 'ws-main',
    team_id: 'team-ops',
    channel_id: 'ch-ops-tasks',
    title: 'Complete Staff Confirmation Review Documentation for Q3',
    description: 'Review probation milestones and supervisor appraisals for eligible personnel.',
    priority: 'medium',
    status: 'done',
    due_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    due_time: '16:00',
    reminder_type: '15_min',
    reminder_at: new Date(Date.now() - 86400000 - 15 * 60000).toISOString(),
    reminder_sent: true,
    estimated_hours: 2,
    actual_hours: 2,
    kpi_category: 'HR & People Operations',
    checklist: [
      { id: 'c1', text: 'Cross-check supervisor ratings against sales metrics', completed: true },
      { id: 'c2', text: 'Prepare confirmation appointment letters', completed: true },
    ],
    image_attachments: [],
    tags: ['HR', 'Appraisal', 'Operations'],
    completed_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// ── Workspaces Queries ───────────────────────────────────────────────────────
export async function getWorkspaces(): Promise<Workspace[]> {
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    if (error || !data || data.length === 0) {
      const cached = localStorage.getItem(LOCAL_WORKSPACE_KEY)
      if (cached) return JSON.parse(cached)
      return DEFAULT_WORKSPACES
    }
    const cleaned = data.map(ws => ({
      ...ws,
      description: ws.description ? ws.description.replace(/<!--AI_CONFIG:[\s\S]*?-->/g, '').trim() : ws.description
    }))
    localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(cleaned))
    return cleaned
  } catch {
    const cached = localStorage.getItem(LOCAL_WORKSPACE_KEY)
    return cached ? JSON.parse(cached) : DEFAULT_WORKSPACES
  }
}

export async function getUserWorkspaces(
  staffId?: string | null,
  role?: string,
  departmentName?: string
): Promise<Workspace[]> {
  const allWorkspaces = await getWorkspaces()
  if (role === 'superadmin' || !staffId) {
    return allWorkspaces
  }

  // 1. Direct workspace memberships from Supabase
  const userWsIds = new Set<string>()
  try {
    const { data: wm } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('staff_id', staffId)
    if (wm) {
      wm.forEach((m: any) => {
        if (m.workspace_id) userWsIds.add(m.workspace_id)
      })
    }
  } catch {}

  // 2. Check local storage cache for workspace members
  for (const ws of allWorkspaces) {
    try {
      const cached = localStorage.getItem(`${LOCAL_WS_MEMBERS_KEY}_${ws.id}`)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.some((m: any) => m.staff_id === staffId)) {
          userWsIds.add(ws.id)
        }
      }
    } catch {}
  }

  // 3. Team memberships from Supabase
  const userTeamWsIds = new Set<string>()
  try {
    const { data: tm } = await supabase
      .from('team_members')
      .select('team_id, teams (workspace_id)')
      .eq('staff_id', staffId)
    if (tm) {
      tm.forEach((m: any) => {
        const wsId = m.teams?.workspace_id
        if (wsId) userTeamWsIds.add(wsId)
      })
    }
  } catch {}

  // 4. Resolve staff department if not provided
  let resolvedDept = departmentName
  if (!resolvedDept && staffId) {
    try {
      const { data: staff } = await supabase
        .from('staff')
        .select('departments (name)')
        .eq('id', staffId)
        .maybeSingle()
      if (staff) {
        resolvedDept = (staff.departments as any)?.name
      }
    } catch {}
  }

  const deptLower = (resolvedDept || '').toLowerCase()

  return allWorkspaces.filter(ws => {
    // Explicit workspace member
    if (userWsIds.has(ws.id)) return true
    // Explicit member of a team in this workspace
    if (userTeamWsIds.has(ws.id)) return true
    // Default company-wide workspace
    if (ws.is_default) return true
    // Department match
    if (deptLower) {
      const wsName = ws.name.toLowerCase()
      const wsCode = (ws.code || '').toLowerCase()
      if (
        (deptLower.includes('sales') && (wsName.includes('sales') || wsCode.includes('sale'))) ||
        (deptLower.includes('marketing') && (wsName.includes('marketing') || wsName.includes('media') || wsCode.includes('medi'))) ||
        ((deptLower.includes('tech') || deptLower.includes('engineer') || deptLower.includes('it')) && (wsName.includes('tech') || wsCode.includes('tech'))) ||
        (deptLower.includes('human') && (wsName.includes('human') || wsName.includes('people') || wsName.includes('hr'))) ||
        (deptLower.includes('account') && (wsName.includes('account') || wsName.includes('finance'))) ||
        (deptLower.includes('operation') && (wsName.includes('operation') || wsName.includes('ops'))) ||
        (deptLower.includes('customer') && (wsName.includes('customer') || wsName.includes('support'))) ||
        (deptLower.includes('admin') && (wsName.includes('admin') || wsName.includes('headquarters') || wsName.includes('fohq')))
      ) {
        return true
      }
    }
    return false
  })
}

export async function createWorkspace(ws: Partial<Workspace>): Promise<Workspace> {
  const payload = {
    name: ws.name || 'New Workspace',
    code: (ws.code || ws.name?.substring(0, 4) || 'WS').toUpperCase(),
    description: ws.description || '',
    icon: ws.icon || 'Briefcase',
    color: ws.color || '#3b82f6',
    is_default: ws.is_default || false,
    created_by: ws.created_by || null,
  }

  try {
    const { data, error } = await supabase
      .from('workspaces')
      .insert(payload)
      .select()
      .single()

    if (error || !data) {
      const local: Workspace = { ...payload, id: `ws-${Date.now()}`, created_at: new Date().toISOString() }
      const list = await getWorkspaces()
      localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify([...list, local]))
      return local
    }
    return data
  } catch {
    const local: Workspace = { ...payload, id: `ws-${Date.now()}`, created_at: new Date().toISOString() }
    const list = await getWorkspaces()
    localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify([...list, local]))
    return local
  }
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  try {
    await supabase.from('workspaces').delete().eq('id', workspaceId)
  } catch (err) {
    console.warn('Supabase deleteWorkspace error:', err)
  }

  try {
    const list = await getWorkspaces()
    const updated = list.filter(w => w.id !== workspaceId)
    localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(updated))
  } catch {}
}

// ── Teams Queries ────────────────────────────────────────────────────────────
export async function getTeams(workspaceId?: string): Promise<Team[]> {
  try {
    let q = supabase.from('teams').select('*').order('name')
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data, error } = await q

    if (error || !data || data.length === 0) {
      if (workspaceId) return DEFAULT_TEAMS.filter(t => t.workspace_id === workspaceId)
      return DEFAULT_TEAMS
    }
    return data
  } catch {
    if (workspaceId) return DEFAULT_TEAMS.filter(t => t.workspace_id === workspaceId)
    return DEFAULT_TEAMS
  }
}

export async function createTeam(team: Partial<Team>): Promise<Team> {
  const payload = {
    workspace_id: team.workspace_id || 'ws-main',
    name: team.name || 'New Team',
    description: team.description || '',
    icon: team.icon || 'Users',
    is_private: team.is_private || false,
    created_by: team.created_by || null,
  }

  try {
    const { data, error } = await supabase
      .from('teams')
      .insert(payload)
      .select()
      .single()

    if (error || !data) {
      return { ...payload, id: `team-${Date.now()}`, created_at: new Date().toISOString() }
    }

    // Automatically create a #general channel for this team
    await createChannel({
      team_id: data.id,
      name: 'general',
      topic: `${data.name} discussions and announcements`,
      is_general: true,
      created_by: team.created_by,
    })

    return data
  } catch {
    return { ...payload, id: `team-${Date.now()}`, created_at: new Date().toISOString() }
  }
}

export async function deleteTeam(teamId: string): Promise<void> {
  try {
    await supabase.from('teams').delete().eq('id', teamId)
  } catch (err) {
    console.warn('Supabase deleteTeam error:', err)
  }
}

// ── Channels Queries ─────────────────────────────────────────────────────────
export async function getChannels(teamId?: string): Promise<Channel[]> {
  try {
    let q = supabase.from('channels').select('*').order('is_general', { ascending: false }).order('name')
    if (teamId) q = q.eq('team_id', teamId)
    const { data, error } = await q

    if (error || !data || data.length === 0) {
      if (teamId) return DEFAULT_CHANNELS.filter(c => c.team_id === teamId)
      return DEFAULT_CHANNELS
    }
    return data
  } catch {
    if (teamId) return DEFAULT_CHANNELS.filter(c => c.team_id === teamId)
    return DEFAULT_CHANNELS
  }
}

export async function createChannel(ch: Partial<Channel>): Promise<Channel> {
  const payload = {
    team_id: ch.team_id || 'team-general',
    name: (ch.name || 'general').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, ''),
    topic: ch.topic || '',
    is_private: ch.is_private || false,
    is_general: ch.is_general || false,
    created_by: ch.created_by || null,
  }

  try {
    const { data, error } = await supabase
      .from('channels')
      .insert(payload)
      .select()
      .single()

    if (error || !data) {
      return { ...payload, id: `ch-${Date.now()}`, created_at: new Date().toISOString() }
    }
    return data
  } catch {
    return { ...payload, id: `ch-${Date.now()}`, created_at: new Date().toISOString() }
  }
}

export async function deleteChannel(channelId: string): Promise<void> {
  try {
    await supabase.from('channels').delete().eq('id', channelId)
  } catch (err) {
    console.warn('Supabase deleteChannel error:', err)
  }
}

// ── Chat Messages Queries ───────────────────────────────────────────────────
export async function getChannelMessages(channelId: string, limit: number = 50): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error || !data) {
      const cached = localStorage.getItem(`${LOCAL_MESSAGES_KEY}_${channelId}`)
      return cached ? JSON.parse(cached) : []
    }

    // Enrich sender names and avatars from staff & profiles
    const senderIds = Array.from(new Set(data.map(m => m.sender_id).filter(Boolean)))
    let senderMap: Record<string, any> = {}

    if (senderIds.length > 0) {
      try {
        // 1. Query staff table (without nonexistent role column)
        const { data: staffData } = await supabase
          .from('staff')
          .select('id, profile_id, full_name, staff_code, photo_url, departments(name)')
          .in('id', senderIds)

        if (staffData) {
          staffData.forEach(s => {
            const entry = {
              id: s.id,
              name: s.full_name,
              photo: s.photo_url,
              department: (s.departments as any)?.name || 'General',
            }
            senderMap[s.id] = entry
            if (s.profile_id) senderMap[s.profile_id] = entry
          })
        }

        // Also query staff by profile_id in case sender_id is auth user profile ID
        const { data: staffByProfile } = await supabase
          .from('staff')
          .select('id, profile_id, full_name, staff_code, photo_url, departments(name)')
          .in('profile_id', senderIds)

        if (staffByProfile) {
          staffByProfile.forEach(s => {
            const entry = {
              id: s.id,
              name: s.full_name,
              photo: s.photo_url,
              department: (s.departments as any)?.name || 'General',
            }
            if (s.profile_id) senderMap[s.profile_id] = entry
            senderMap[s.id] = entry
          })
        }

        // 2. Query profiles table for administrative users
        const { data: profData } = await supabase
          .from('profiles')
          .select('id, full_name, photo_url, role')
          .in('id', senderIds)

        if (profData) {
          profData.forEach(p => {
            if (!senderMap[p.id] || senderMap[p.id].name === 'Team Member') {
              senderMap[p.id] = {
                id: p.id,
                name: p.full_name || 'Staff Member',
                photo: p.photo_url,
                role: p.role,
              }
            }
          })
        }
      } catch (enrichErr) {
        console.warn('Sender enrichment warning:', enrichErr)
      }
    }

    const formatted: ChatMessage[] = data.map(m => {
      const resolvedSender = senderMap[m.sender_id] || (m as any).sender || (m as any).sender_name ? {
        id: m.sender_id,
        name: senderMap[m.sender_id]?.name || (m as any).sender_name || 'Staff Member',
        photo: senderMap[m.sender_id]?.photo || (m as any).sender_photo,
      } : {
        id: m.sender_id,
        name: 'Staff Member',
      }

      return {
        id: m.id,
        channel_id: m.channel_id,
        sender_id: m.sender_id,
        content: m.content,
        parent_id: m.parent_id,
        attachments: m.attachments || [],
        reactions: m.reactions || {},
        mentions: m.mentions || [],
        action_tasks: m.action_tasks || [],
        is_pinned: m.is_pinned || false,
        created_at: m.created_at,
        updated_at: m.updated_at,
        sender: resolvedSender,
      }
    })

    // Merge with any offline/optimistic messages in local cache
    const cachedRaw = localStorage.getItem(`${LOCAL_MESSAGES_KEY}_${channelId}`)
    const cached: ChatMessage[] = cachedRaw ? JSON.parse(cachedRaw) : []
    const combined = [...formatted]
    for (const c of cached) {
      if (!combined.some(item => item.id === c.id)) {
        combined.push(c)
      }
    }
    combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    localStorage.setItem(`${LOCAL_MESSAGES_KEY}_${channelId}`, JSON.stringify(combined))
    return combined
  } catch {
    const cached = localStorage.getItem(`${LOCAL_MESSAGES_KEY}_${channelId}`)
    return cached ? JSON.parse(cached) : []
  }
}

export async function sendChatMessage(msg: {
  channel_id: string
  sender_id?: string | null
  content?: string
  message?: string
  parent_id?: string | null
  attachments?: CompressedImageAttachment[]
  mentions?: string[]
  action_tasks?: string[]
  sender_name?: string
  sender_photo?: string
}): Promise<ChatMessage> {
  const localId = `msg-${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  const textContent = (msg.content ?? msg.message ?? '').trim()
  const resolvedSenderId = msg.sender_id || 'user-current'

  const payload = {
    channel_id: msg.channel_id,
    sender_id: resolvedSenderId,
    content: textContent,
    parent_id: msg.parent_id || null,
    attachments: msg.attachments || [],
    reactions: {},
    mentions: msg.mentions || [],
    action_tasks: msg.action_tasks || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  let finalId = localId

  try {
    const isUuid = msg.sender_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msg.sender_id)
    // The database column chat_messages.sender_id is a UUID NOT NULL.
    // When sender_id is not a UUID (e.g. 'gemini-ai', 'user-superadmin', or undefined),
    // we use the system admin staff UUID so the insert succeeds without violating NOT NULL or UUID syntax.
    const fallbackSenderUuid = 'cdcaa32a-ea56-4e20-b6bc-adfa20722c25'
    const dbPayload = {
      ...payload,
      sender_id: isUuid ? msg.sender_id : fallbackSenderUuid,
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert(dbPayload)
      .select()
      .maybeSingle()

    if (!error && data?.id) {
      finalId = data.id
    } else if (error) {
      console.warn('Supabase chat_messages insert:', error.message)
    }
  } catch (err) {
    console.warn('Supabase chat_messages exception:', err)
  }

  const result: ChatMessage = {
    id: finalId,
    ...payload,
    sender: {
      id: msg.sender_id,
      name: msg.sender_name || 'Me',
      photo: msg.sender_photo,
    },
  }

  // Always update local cache so the message appears instantly
  try {
    const key = `${LOCAL_MESSAGES_KEY}_${msg.channel_id}`
    const existing: ChatMessage[] = JSON.parse(localStorage.getItem(key) || '[]')
    if (!existing.some(m => m.id === result.id)) {
      localStorage.setItem(key, JSON.stringify([...existing, result]))
    }
  } catch {}

  return result
}

// ── Tasks Queries ────────────────────────────────────────────────────────────
export async function getWorkspaceTasks(workspaceId?: string, teamId?: string): Promise<WorkspaceTask[]> {
  try {
    let q = supabase
      .from('tasks')
      .select(`
        *,
        assignee:assignee_id (id, full_name, photo_url, departments(name)),
        creator:creator_id (id, full_name),
        team:team_id (id, name)
      `)
      .order('created_at', { ascending: false })

    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    if (teamId) q = q.eq('team_id', teamId)

    const { data, error } = await q

    if (error || !data || data.length === 0) {
      const cached = localStorage.getItem(LOCAL_TASKS_KEY)
      if (cached) {
        let parsed: WorkspaceTask[] = JSON.parse(cached)
        if (workspaceId) parsed = parsed.filter(t => t.workspace_id === workspaceId)
        if (teamId) parsed = parsed.filter(t => t.team_id === teamId)
        return parsed
      }
      return DEFAULT_TASKS
    }

    const formatted: WorkspaceTask[] = data.map(t => ({
      id: t.id,
      workspace_id: t.workspace_id,
      team_id: t.team_id,
      channel_id: t.channel_id,
      message_id: t.message_id,
      title: t.title,
      description: t.description,
      assignee_id: t.assignee_id,
      creator_id: t.creator_id,
      priority: t.priority,
      status: t.status,
      due_date: t.due_date,
      due_time: t.due_time,
      reminder_type: t.reminder_type,
      reminder_at: t.reminder_at,
      reminder_sent: t.reminder_sent,
      is_recurring: t.is_recurring || false,
      recurrence_interval: t.recurrence_interval || 'none',
      recurrence_end_date: t.recurrence_end_date || null,
      next_recurrence_date: t.next_recurrence_date || null,
      estimated_hours: Number(t.estimated_hours || 0),
      actual_hours: Number(t.actual_hours || 0),
      kpi_category: t.kpi_category,
      checklist: t.checklist || [],
      image_attachments: t.image_attachments || [],
      tags: t.tags || [],
      comments: t.comments || [],
      time_logs: t.time_logs || [],
      completed_at: t.completed_at,
      created_at: t.created_at,
      updated_at: t.updated_at,
      assignee: t.assignee ? {
        id: t.assignee.id,
        name: t.assignee.full_name,
        photo: t.assignee.photo_url,
        department: t.assignee.departments?.name,
      } : undefined,
      creator: t.creator ? {
        id: t.creator.id,
        name: t.creator.full_name,
      } : undefined,
      team: t.team ? {
        id: t.team.id,
        name: t.team.name,
      } : undefined,
    }))

    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(formatted))
    return formatted
  } catch {
    const cached = localStorage.getItem(LOCAL_TASKS_KEY)
    return cached ? JSON.parse(cached) : DEFAULT_TASKS
  }
}

export function calculateNextRecurrenceDate(currentDueDate: string, interval?: RecurrenceInterval): string {
  const baseDate = currentDueDate ? new Date(currentDueDate) : new Date()
  if (isNaN(baseDate.getTime())) return new Date().toISOString().split('T')[0]
  
  const d = new Date(baseDate)
  switch (interval) {
    case 'daily':
      d.setDate(d.getDate() + 1)
      break
    case 'weekdays': {
      d.setDate(d.getDate() + 1)
      while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() + 1)
      }
      break
    }
    case 'weekly':
      d.setDate(d.getDate() + 7)
      break
    case 'biweekly':
      d.setDate(d.getDate() + 14)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
    case 'quarterly':
      d.setMonth(d.getMonth() + 3)
      break
    default:
      d.setDate(d.getDate() + 7)
      break
  }
  return d.toISOString().split('T')[0]
}

export function calculateReminderAt(
  dueDate?: string | null,
  dueTime?: string | null,
  reminderType?: WorkspaceTask['reminder_type']
): string | null {
  if (!dueDate || !reminderType || reminderType === 'none') return null
  const timeStr = dueTime || '17:00'
  const dueDateTime = new Date(`${dueDate}T${timeStr}:00`)
  if (isNaN(dueDateTime.getTime())) return null

  let offsetMs = 0
  switch (reminderType) {
    case '15_min':
      offsetMs = 15 * 60 * 1000
      break
    case '30_min':
      offsetMs = 30 * 60 * 1000
      break
    case '1_hour':
      offsetMs = 60 * 60 * 1000
      break
    case '1_day':
      offsetMs = 24 * 60 * 60 * 1000
      break
    case 'on_due_time':
    default:
      offsetMs = 0
      break
  }

  return new Date(dueDateTime.getTime() - offsetMs).toISOString()
}

export async function createWorkspaceTask(task: Partial<WorkspaceTask>): Promise<WorkspaceTask> {
  const reminder_at = task.reminder_at !== undefined
    ? task.reminder_at
    : calculateReminderAt(task.due_date, task.due_time, task.reminder_type)

  const is_recurring = task.is_recurring || (task.recurrence_interval && task.recurrence_interval !== 'none') || false
  const recurrence_interval = task.recurrence_interval || (is_recurring ? 'weekly' : 'none')

  const payload = {
    workspace_id: task.workspace_id || 'ws-main',
    team_id: task.team_id || null,
    channel_id: task.channel_id || null,
    message_id: task.message_id || null,
    title: task.title || 'Untitled Task',
    description: task.description || '',
    assignee_id: task.assignee_id || null,
    creator_id: task.creator_id || null,
    priority: task.priority || 'medium',
    status: task.status || 'todo',
    due_date: task.due_date || null,
    due_time: task.due_time || null,
    reminder_type: task.reminder_type || 'none',
    reminder_at: reminder_at || null,
    reminder_sent: false,
    is_recurring,
    recurrence_interval,
    recurrence_end_date: task.recurrence_end_date || null,
    next_recurrence_date: is_recurring ? calculateNextRecurrenceDate(task.due_date || new Date().toISOString().split('T')[0], recurrence_interval) : null,
    estimated_hours: task.estimated_hours || 0,
    actual_hours: task.actual_hours || 0,
    kpi_category: task.kpi_category || 'General Operations',
    checklist: task.checklist || [],
    image_attachments: task.image_attachments || [],
    tags: task.tags || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  try {
    const { data, error } = await supabase
      .from('tasks')
      .insert(payload)
      .select()
      .single()

    const created: WorkspaceTask = {
      id: data?.id || `task-${Date.now()}`,
      ...payload,
      assignee: task.assignee,
      creator: task.creator,
      team: task.team,
    }

    const currentList = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify([created, ...currentList]))

    // If spawned from a message, link task to message
    if (task.message_id) {
      try {
        await supabase.from('chat_messages').update({
          action_tasks: supabase.rpc ? undefined : [created.id]
        }).eq('id', task.message_id)
      } catch {}
    }

    try {
      window.dispatchEvent(new CustomEvent('workspace_task_created', { detail: created }))
    } catch {}

    return created
  } catch {
    const fallback: WorkspaceTask = {
      id: `task-${Date.now()}`,
      ...payload,
      assignee: task.assignee,
      creator: task.creator,
      team: task.team,
    }
    const currentList = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify([fallback, ...currentList]))
    try {
      window.dispatchEvent(new CustomEvent('workspace_task_created', { detail: fallback }))
    } catch {}
    return fallback
  }
}

export async function updateTaskStatus(taskId: string, status: WorkspaceTask['status'], staffId?: string): Promise<void> {
  const updates: any = {
    status,
    updated_at: new Date().toISOString(),
    completed_at: status === 'done' ? new Date().toISOString() : null,
  }

  try {
    await supabase.from('tasks').update(updates).eq('id', taskId)

    // Log activity
    if (staffId) {
      await supabase.from('task_activity_logs').insert({
        task_id: taskId,
        staff_id: staffId,
        action: 'status_changed',
        details: { new_status: status },
      })
    }
  } catch {}

  // Update local cache & handle recurring task next cycle rollover
  try {
    const list: WorkspaceTask[] = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    const idx = list.findIndex(t => t.id === taskId)
    if (idx !== -1) {
      const currentTask = list[idx]
      list[idx] = { ...currentTask, ...updates }
      localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(list))

      // If task is completed and is recurring, auto-schedule next occurrence
      if (status === 'done' && currentTask.is_recurring && currentTask.recurrence_interval && currentTask.recurrence_interval !== 'none') {
        const nextDue = calculateNextRecurrenceDate(currentTask.due_date || new Date().toISOString().split('T')[0], currentTask.recurrence_interval)
        setTimeout(() => {
          createWorkspaceTask({
            workspace_id: currentTask.workspace_id,
            team_id: currentTask.team_id,
            channel_id: currentTask.channel_id,
            title: currentTask.title,
            description: currentTask.description,
            assignee_id: currentTask.assignee_id,
            creator_id: currentTask.creator_id,
            priority: currentTask.priority,
            status: 'todo',
            due_date: nextDue,
            due_time: currentTask.due_time,
            reminder_type: currentTask.reminder_type,
            is_recurring: true,
            recurrence_interval: currentTask.recurrence_interval,
            kpi_category: currentTask.kpi_category,
            checklist: (currentTask.checklist || []).map(c => ({ ...c, completed: false })),
            assignee: currentTask.assignee,
            creator: currentTask.creator,
            team: currentTask.team,
          })
        }, 300)
      }
    }
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('workspace_task_updated', { detail: { taskId, updates } }))
  } catch {}
}

export async function updateWorkspaceTask(
  taskId: string,
  updates: Partial<WorkspaceTask>,
  staffId?: string
): Promise<WorkspaceTask | null> {
  const payload: any = {
    ...updates,
    updated_at: new Date().toISOString(),
  }
  delete payload.assignee
  delete payload.creator
  delete payload.team

  try {
    await supabase.from('tasks').update(payload).eq('id', taskId)
  } catch (err) {
    console.warn('Supabase update task error:', err)
  }

  let updated: WorkspaceTask | null = null
  try {
    const list: WorkspaceTask[] = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    const idx = list.findIndex(t => t.id === taskId)
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() }
      updated = list[idx]
      localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(list))
    }
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('workspace_task_updated', { detail: { taskId, updates } }))
  } catch {}

  return updated
}

export async function deleteWorkspaceTask(taskId: string): Promise<void> {
  try {
    await supabase.from('tasks').delete().eq('id', taskId)
  } catch (err) {
    console.warn('Supabase delete task error:', err)
  }

  try {
    const list: WorkspaceTask[] = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    const filtered = list.filter(t => t.id !== taskId)
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(filtered))
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('workspace_task_deleted', { detail: { taskId } }))
  } catch {}
}

export async function addTaskComment(
  taskId: string,
  commentData: {
    staff_id: string
    staff_name: string
    staff_photo?: string
    staff_department?: string
    content: string
    is_proof?: boolean
    attachments?: CompressedImageAttachment[]
  }
): Promise<TaskComment> {
  const newComment: TaskComment = {
    id: 'tc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    task_id: taskId,
    staff_id: commentData.staff_id,
    staff_name: commentData.staff_name,
    staff_photo: commentData.staff_photo,
    staff_department: commentData.staff_department,
    content: commentData.content.trim(),
    is_proof: !!commentData.is_proof,
    attachments: commentData.attachments || [],
    created_at: new Date().toISOString(),
  }

  // Update in local cache
  try {
    const list: WorkspaceTask[] = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    const idx = list.findIndex(t => t.id === taskId)
    if (idx !== -1) {
      const task = list[idx]
      const comments = task.comments || []
      const updatedComments = [...comments, newComment]
      list[idx] = { ...task, comments: updatedComments, updated_at: new Date().toISOString() }
      localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(list))

      // Also try saving to Supabase
      try {
        await supabase.from('tasks').update({
          comments: updatedComments,
          updated_at: new Date().toISOString(),
        }).eq('id', taskId)
      } catch {}
    }
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('workspace_task_updated', { detail: { taskId, commentAdded: newComment } }))
  } catch {}

  return newComment
}

export async function deleteTaskComment(taskId: string, commentId: string): Promise<void> {
  try {
    const list: WorkspaceTask[] = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    const idx = list.findIndex(t => t.id === taskId)
    if (idx !== -1) {
      const task = list[idx]
      const comments = (task.comments || []).filter(c => c.id !== commentId)
      list[idx] = { ...task, comments, updated_at: new Date().toISOString() }
      localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(list))

      try {
        await supabase.from('tasks').update({
          comments,
          updated_at: new Date().toISOString(),
        }).eq('id', taskId)
      } catch {}
    }
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('workspace_task_updated', { detail: { taskId, commentDeleted: commentId } }))
  } catch {}
}

// ── Live Task Timer & Actual Hours Tracker ──────────────────────────────────
export const LOCAL_ACTIVE_TIMER_KEY = 'hris_active_task_timer'

export function getActiveTaskTimer(): ActiveTaskTimer | null {
  try {
    const raw = localStorage.getItem(LOCAL_ACTIVE_TIMER_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function startTaskTimer(timerData: {
  taskId: string
  taskTitle: string
  staffId: string
  staffName: string
}): ActiveTaskTimer {
  const timer: ActiveTaskTimer = {
    taskId: timerData.taskId,
    taskTitle: timerData.taskTitle,
    staffId: timerData.staffId,
    staffName: timerData.staffName,
    startTime: Date.now(),
    isRunning: true,
  }
  localStorage.setItem(LOCAL_ACTIVE_TIMER_KEY, JSON.stringify(timer))
  try {
    window.dispatchEvent(new CustomEvent('task_timer_updated', { detail: timer }))
  } catch {}
  return timer
}

export async function stopTaskTimer(notes?: string): Promise<{ timeLog: TaskTimeLog; updatedTask: WorkspaceTask } | null> {
  const active = getActiveTaskTimer()
  if (!active || !active.isRunning) {
    localStorage.removeItem(LOCAL_ACTIVE_TIMER_KEY)
    try {
      window.dispatchEvent(new CustomEvent('task_timer_updated', { detail: null }))
    } catch {}
    return null
  }

  const endTime = Date.now()
  const durationMs = Math.max(1000, endTime - active.startTime)
  const durationMinutes = Math.max(1, Math.round(durationMs / (60 * 1000)))

  const newLog: TaskTimeLog = {
    id: 'tl-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    task_id: active.taskId,
    staff_id: active.staffId,
    staff_name: active.staffName,
    started_at: new Date(active.startTime).toISOString(),
    ended_at: new Date(endTime).toISOString(),
    duration_minutes: durationMinutes,
    notes: notes || active.notes || undefined,
    created_at: new Date().toISOString(),
  }

  // Clear active timer
  localStorage.removeItem(LOCAL_ACTIVE_TIMER_KEY)
  try {
    window.dispatchEvent(new CustomEvent('task_timer_updated', { detail: null }))
  } catch {}

  // Update Task Actual Hours & Log History
  let updatedTask: WorkspaceTask | null = null
  try {
    const list: WorkspaceTask[] = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    const idx = list.findIndex(t => t.id === active.taskId)
    if (idx !== -1) {
      const task = list[idx]
      const logs = task.time_logs || []
      const updatedLogs = [newLog, ...logs]
      const totalLoggedHours = parseFloat(
        updatedLogs.reduce((sum, l) => sum + (l.duration_minutes / 60), 0).toFixed(2)
      )

      const statusUpdate = (task.status === 'todo') ? 'in_progress' : task.status
      list[idx] = {
        ...task,
        status: statusUpdate,
        actual_hours: totalLoggedHours,
        time_logs: updatedLogs,
        updated_at: new Date().toISOString(),
      }
      updatedTask = list[idx]
      localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(list))

      try {
        await supabase.from('tasks').update({
          status: statusUpdate,
          actual_hours: totalLoggedHours,
          time_logs: updatedLogs,
          updated_at: new Date().toISOString(),
        }).eq('id', active.taskId)
      } catch {}
    }
  } catch {}

  if (updatedTask) {
    try {
      window.dispatchEvent(new CustomEvent('workspace_task_updated', { detail: { taskId: active.taskId, timeLogged: newLog } }))
    } catch {}
    return { timeLog: newLog, updatedTask }
  }

  return null
}

export function cancelTaskTimer(): void {
  localStorage.removeItem(LOCAL_ACTIVE_TIMER_KEY)
  try {
    window.dispatchEvent(new CustomEvent('task_timer_updated', { detail: null }))
  } catch {}
}

export async function logTaskTimeManually(
  taskId: string,
  logData: {
    staff_id: string
    staff_name: string
    staff_photo?: string
    duration_minutes: number
    notes?: string
  }
): Promise<{ timeLog: TaskTimeLog; updatedTask: WorkspaceTask } | null> {
  const durationMinutes = Math.max(1, logData.duration_minutes)
  const now = Date.now()
  const startedAt = new Date(now - durationMinutes * 60 * 1000).toISOString()
  const endedAt = new Date(now).toISOString()

  const newLog: TaskTimeLog = {
    id: 'tl-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    task_id: taskId,
    staff_id: logData.staff_id,
    staff_name: logData.staff_name,
    staff_photo: logData.staff_photo,
    started_at: startedAt,
    ended_at: endedAt,
    duration_minutes: durationMinutes,
    notes: logData.notes?.trim() || undefined,
    created_at: new Date().toISOString(),
  }

  let updatedTask: WorkspaceTask | null = null
  try {
    const list: WorkspaceTask[] = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    const idx = list.findIndex(t => t.id === taskId)
    if (idx !== -1) {
      const task = list[idx]
      const logs = task.time_logs || []
      const updatedLogs = [newLog, ...logs]
      const totalLoggedHours = parseFloat(
        updatedLogs.reduce((sum, l) => sum + (l.duration_minutes / 60), 0).toFixed(2)
      )

      list[idx] = {
        ...task,
        actual_hours: totalLoggedHours,
        time_logs: updatedLogs,
        updated_at: new Date().toISOString(),
      }
      updatedTask = list[idx]
      localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(list))

      try {
        await supabase.from('tasks').update({
          actual_hours: totalLoggedHours,
          time_logs: updatedLogs,
          updated_at: new Date().toISOString(),
        }).eq('id', taskId)
      } catch {}
    }
  } catch {}

  if (updatedTask) {
    try {
      window.dispatchEvent(new CustomEvent('workspace_task_updated', { detail: { taskId, timeLogged: newLog } }))
    } catch {}
    return { timeLog: newLog, updatedTask }
  }

  return null
}

export async function deleteTaskTimeLog(taskId: string, logId: string): Promise<void> {
  try {
    const list: WorkspaceTask[] = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]')
    const idx = list.findIndex(t => t.id === taskId)
    if (idx !== -1) {
      const task = list[idx]
      const logs = (task.time_logs || []).filter(l => l.id !== logId)
      const totalLoggedHours = parseFloat(
        logs.reduce((sum, l) => sum + (l.duration_minutes / 60), 0).toFixed(2)
      )

      list[idx] = {
        ...task,
        actual_hours: totalLoggedHours,
        time_logs: logs,
        updated_at: new Date().toISOString(),
      }
      localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(list))

      try {
        await supabase.from('tasks').update({
          actual_hours: totalLoggedHours,
          time_logs: logs,
          updated_at: new Date().toISOString(),
        }).eq('id', taskId)
      } catch {}
    }
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('workspace_task_updated', { detail: { taskId, logDeleted: logId } }))
  } catch {}
}

// ── Daily Standups Queries ───────────────────────────────────────────────────
export async function getDailyStandups(teamId?: string, date?: string): Promise<DailyStandup[]> {
  const targetDate = date || new Date().toISOString().split('T')[0]
  try {
    let q = supabase
      .from('daily_standups')
      .select(`
        *,
        staff:staff_id (id, full_name, photo_url, departments(name))
      `)
      .eq('standup_date', targetDate)
      .order('created_at', { ascending: false })

    if (teamId) q = q.eq('team_id', teamId)
    const { data, error } = await q

    if (error || !data) return []

    return data.map(s => ({
      id: s.id,
      workspace_id: s.workspace_id,
      team_id: s.team_id,
      staff_id: s.staff_id,
      yesterday_work: s.yesterday_work,
      today_plan: s.today_plan,
      blockers: s.blockers,
      standup_date: s.standup_date,
      created_at: s.created_at,
      staff: s.staff ? {
        id: s.staff.id,
        name: s.staff.full_name,
        photo: s.staff.photo_url,
        department: s.staff.departments?.name,
      } : undefined,
    }))
  } catch {
    return []
  }
}

export async function submitDailyStandup(standup: Partial<DailyStandup>): Promise<DailyStandup> {
  const payload = {
    workspace_id: standup.workspace_id || 'ws-main',
    team_id: standup.team_id || 'team-general',
    staff_id: standup.staff_id!,
    yesterday_work: standup.yesterday_work || '',
    today_plan: standup.today_plan || '',
    blockers: standup.blockers || '',
    standup_date: standup.standup_date || new Date().toISOString().split('T')[0],
  }

  try {
    const { data, error } = await supabase
      .from('daily_standups')
      .upsert(payload, { onConflict: 'team_id,staff_id,standup_date' })
      .select()
      .single()

    return {
      id: data?.id || `standup-${Date.now()}`,
      ...payload,
      created_at: new Date().toISOString(),
    }
  } catch {
    return {
      id: `standup-${Date.now()}`,
      ...payload,
      created_at: new Date().toISOString(),
    }
  }
}

// ── Workspace Member Management ──────────────────────────────────────────────
// ── Workspace Member Management ──────────────────────────────────────────────
export const DEFAULT_WORKSPACE_MEMBERS: WorkspaceMember[] = []

export const DEFAULT_TEAM_MEMBERS: TeamMember[] = []

/**
 * Resolves an effective staff UUID for workspace / team membership.
 * If the provided staffId is already in public.staff, returns it.
 * If staffId is a profile_id, finds the matching staff row or creates one.
 * If the user only exists in profiles (e.g. Super Admin or Executive like Adepoju Ayodeji),
 * automatically creates a matching record in public.staff so foreign key constraints are met.
 */
async function resolveEffectiveStaffId(staffId: string, staffDetails?: any): Promise<string> {
  if (!staffId) return staffId

  try {
    // 1. Check if staffId directly matches an ID in public.staff
    const { data: direct } = await supabase
      .from('staff')
      .select('id')
      .eq('id', staffId)
      .maybeSingle()

    if (direct?.id) {
      return direct.id
    }

    // 2. Check if staffId matches profile_id in public.staff
    const { data: byProfile } = await supabase
      .from('staff')
      .select('id')
      .eq('profile_id', staffId)
      .maybeSingle()

    if (byProfile?.id) {
      return byProfile.id
    }

    // 3. Check if staffDetails email matches a staff row
    if (staffDetails?.email) {
      const { data: byEmail } = await supabase
        .from('staff')
        .select('id')
        .ilike('email', staffDetails.email.trim())
        .maybeSingle()

      if (byEmail?.id) {
        try {
          await supabase.from('staff').update({ profile_id: staffId }).eq('id', byEmail.id)
        } catch {}
        return byEmail.id
      }
    }

    // 4. If user exists in profiles but not staff, create a staff record for them
    const staffCode = `ADM-${Math.random().toString(36).slice(-4).toUpperCase()}`
    const { data: created, error: createErr } = await supabase
      .from('staff')
      .insert({
        profile_id: staffId,
        staff_code: staffCode,
        full_name: staffDetails?.name || 'Administrative Staff',
        email: staffDetails?.email || '',
        department: staffDetails?.department || 'Executive Management',
        job_title: staffDetails?.jobTitle || staffDetails?.department || 'Executive',
        status: 'active',
        date_employed: new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .maybeSingle()

    if (created?.id) {
      return created.id
    }
  } catch (err) {
    console.warn('Error resolving effective staff ID for workspace:', err)
  }

  return staffId
}

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  try {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: true })

    if (error || !data || data.length === 0) {
      const cached = localStorage.getItem(`${LOCAL_WS_MEMBERS_KEY}_${workspaceId}`)
      if (cached !== null) {
        try {
          return JSON.parse(cached)
        } catch {
          return []
        }
      }
      return []
    }

    const staffIds = Array.from(new Set(data.map(m => m.staff_id).filter(Boolean)))
    let staffMap: Record<string, any> = {}
    if (staffIds.length > 0) {
      try {
        const { data: sData } = await supabase
          .from('staff')
          .select('id, profile_id, full_name, staff_code, photo_url, departments(name), email, department, job_title')
          .in('id', staffIds)
        if (sData) {
          sData.forEach(s => {
            const mappedStaff = {
              id: s.id,
              staffId: s.staff_code || s.id,
              name: s.full_name,
              email: s.email || '',
              role: 'staff',
              department: (s.departments as any)?.name || s.department || 'General',
              jobTitle: s.job_title || '',
              photo: s.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.full_name)}&background=random`,
            }
            staffMap[s.id] = mappedStaff
            if (s.profile_id) {
              staffMap[s.profile_id] = mappedStaff
            }
          })
        }
      } catch {}

      // Fallback: check profiles for any staff_id that might be a profile_id
      const missingStaffIds = staffIds.filter(id => !staffMap[id])
      if (missingStaffIds.length > 0) {
        try {
          const { data: pData } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, photo_url')
            .in('id', missingStaffIds)
          if (pData) {
            pData.forEach(p => {
              staffMap[p.id] = {
                id: p.id,
                staffId: (p.role || 'admin').toUpperCase(),
                name: p.full_name || 'Staff Member',
                email: p.email || '',
                role: p.role || 'staff',
                department: p.role === 'super_admin' || p.role === 'superadmin' ? 'Executive Management' : 'Administration',
                photo: p.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.full_name || 'U')}&background=random`,
              }
            })
          }
        } catch {}
      }
    }

    const members: WorkspaceMember[] = data.map((m: any) => ({
      id: m.id,
      workspace_id: m.workspace_id,
      staff_id: m.staff_id,
      role: m.role || 'member',
      joined_at: m.joined_at,
      staff: staffMap[m.staff_id] || undefined,
    }))

    localStorage.setItem(`${LOCAL_WS_MEMBERS_KEY}_${workspaceId}`, JSON.stringify(members))
    return members
  } catch {
    const cached = localStorage.getItem(`${LOCAL_WS_MEMBERS_KEY}_${workspaceId}`)
    if (cached !== null) {
      try {
        return JSON.parse(cached)
      } catch {
        return []
      }
    }
    return []
  }
}

export async function addWorkspaceMember(
  workspaceId: string,
  staffId: string,
  role: 'admin' | 'lead' | 'member' | 'viewer' = 'member',
  staffDetails?: any
): Promise<WorkspaceMember> {
  const effectiveStaffId = await resolveEffectiveStaffId(staffId, staffDetails)

  const newMember: WorkspaceMember = {
    id: `wsm-${Date.now()}`,
    workspace_id: workspaceId,
    staff_id: effectiveStaffId,
    role,
    joined_at: new Date().toISOString(),
    staff: staffDetails,
  }

  try {
    const { data, error } = await supabase
      .from('workspace_members')
      .upsert({
        workspace_id: workspaceId,
        staff_id: effectiveStaffId,
        role,
      }, { onConflict: 'workspace_id,staff_id' })
      .select()
      .maybeSingle()

    if (data?.id) {
      newMember.id = data.id
    }
  } catch (err) {
    console.warn('Could not persist workspace member to Supabase, saving locally:', err)
  }

  // Update local cache
  try {
    const cached: WorkspaceMember[] = JSON.parse(localStorage.getItem(`${LOCAL_WS_MEMBERS_KEY}_${workspaceId}`) || '[]')
    const filtered = cached.filter(m => m.staff_id !== staffId && m.staff_id !== effectiveStaffId)
    const updated = [...filtered, newMember]
    localStorage.setItem(`${LOCAL_WS_MEMBERS_KEY}_${workspaceId}`, JSON.stringify(updated))
  } catch {}

  return newMember
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  staffId: string,
  role: 'admin' | 'lead' | 'member' | 'viewer'
): Promise<void> {
  const effectiveStaffId = await resolveEffectiveStaffId(staffId)

  try {
    const { data: updated } = await supabase
      .from('workspace_members')
      .update({ role })
      .eq('workspace_id', workspaceId)
      .eq('staff_id', effectiveStaffId)
      .select()

    if (!updated || updated.length === 0) {
      await supabase
        .from('workspace_members')
        .update({ role })
        .eq('workspace_id', workspaceId)
        .eq('staff_id', staffId)
    }
  } catch (err) {
    console.warn('Could not update role on Supabase, updating locally:', err)
  }

  try {
    const cached: WorkspaceMember[] = JSON.parse(localStorage.getItem(`${LOCAL_WS_MEMBERS_KEY}_${workspaceId}`) || '[]')
    const updated = cached.map(m => (m.staff_id === staffId || m.staff_id === effectiveStaffId) ? { ...m, role } : m)
    localStorage.setItem(`${LOCAL_WS_MEMBERS_KEY}_${workspaceId}`, JSON.stringify(updated))
  } catch {}
}

export async function removeWorkspaceMember(workspaceId: string, staffId: string): Promise<void> {
  const effectiveStaffId = await resolveEffectiveStaffId(staffId)

  try {
    await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .or(`staff_id.eq.${effectiveStaffId},staff_id.eq.${staffId}`)
  } catch (err) {
    console.warn('Could not delete member from Supabase, removing locally:', err)
  }

  try {
    const cached: WorkspaceMember[] = JSON.parse(localStorage.getItem(`${LOCAL_WS_MEMBERS_KEY}_${workspaceId}`) || '[]')
    const updated = cached.filter(m => m.staff_id !== staffId && m.staff_id !== effectiveStaffId)
    localStorage.setItem(`${LOCAL_WS_MEMBERS_KEY}_${workspaceId}`, JSON.stringify(updated))
  } catch {}
}

// ── Team Member Management ──────────────────────────────────────────────────
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true })

    if (error || !data || data.length === 0) {
      const cached = localStorage.getItem(`${LOCAL_TEAM_MEMBERS_KEY}_${teamId}`)
      if (cached !== null) {
        try {
          return JSON.parse(cached)
        } catch {
          return []
        }
      }
      return []
    }

    const staffIds = Array.from(new Set(data.map(m => m.staff_id).filter(Boolean)))
    let staffMap: Record<string, any> = {}
    if (staffIds.length > 0) {
      try {
        const { data: sData } = await supabase
          .from('staff')
          .select('id, profile_id, full_name, staff_code, photo_url, departments(name), email, department, job_title')
          .in('id', staffIds)
        if (sData) {
          sData.forEach(s => {
            const mappedStaff = {
              id: s.id,
              staffId: s.staff_code || s.id,
              name: s.full_name,
              email: s.email || '',
              role: 'staff',
              department: (s.departments as any)?.name || s.department || 'General',
              jobTitle: s.job_title || '',
              photo: s.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.full_name)}&background=random`,
            }
            staffMap[s.id] = mappedStaff
            if (s.profile_id) {
              staffMap[s.profile_id] = mappedStaff
            }
          })
        }
      } catch {}

      // Fallback: check profiles for missing staff_ids
      const missingStaffIds = staffIds.filter(id => !staffMap[id])
      if (missingStaffIds.length > 0) {
        try {
          const { data: pData } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, photo_url')
            .in('id', missingStaffIds)
          if (pData) {
            pData.forEach(p => {
              staffMap[p.id] = {
                id: p.id,
                staffId: (p.role || 'admin').toUpperCase(),
                name: p.full_name || 'Staff Member',
                email: p.email || '',
                role: p.role || 'staff',
                department: p.role === 'super_admin' || p.role === 'superadmin' ? 'Executive Management' : 'Administration',
                photo: p.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.full_name || 'U')}&background=random`,
              }
            })
          }
        } catch {}
      }
    }

    const members: TeamMember[] = data.map((m: any) => ({
      id: m.id,
      team_id: m.team_id,
      staff_id: m.staff_id,
      role: m.role || 'member',
      joined_at: m.joined_at,
      staff: staffMap[m.staff_id] || undefined,
    }))

    localStorage.setItem(`${LOCAL_TEAM_MEMBERS_KEY}_${teamId}`, JSON.stringify(members))
    return members
  } catch {
    const cached = localStorage.getItem(`${LOCAL_TEAM_MEMBERS_KEY}_${teamId}`)
    if (cached !== null) {
      try {
        return JSON.parse(cached)
      } catch {
        return []
      }
    }
    return []
  }
}

export async function addTeamMember(
  teamId: string,
  staffId: string,
  role: 'lead' | 'member' = 'member',
  staffDetails?: any
): Promise<TeamMember> {
  const effectiveStaffId = await resolveEffectiveStaffId(staffId, staffDetails)

  const newMember: TeamMember = {
    id: `tm-${Date.now()}`,
    team_id: teamId,
    staff_id: effectiveStaffId,
    role,
    joined_at: new Date().toISOString(),
    staff: staffDetails,
  }

  try {
    const { data, error } = await supabase
      .from('team_members')
      .upsert({
        team_id: teamId,
        staff_id: effectiveStaffId,
        role,
      }, { onConflict: 'team_id,staff_id' })
      .select()
      .maybeSingle()

    if (data?.id) {
      newMember.id = data.id
    }
  } catch (err) {
    console.warn('Could not persist team member to Supabase, saving locally:', err)
  }

  // Update local cache
  try {
    const cached: TeamMember[] = JSON.parse(localStorage.getItem(`${LOCAL_TEAM_MEMBERS_KEY}_${teamId}`) || '[]')
    const filtered = cached.filter(m => m.staff_id !== staffId && m.staff_id !== effectiveStaffId)
    const updated = [...filtered, newMember]
    localStorage.setItem(`${LOCAL_TEAM_MEMBERS_KEY}_${teamId}`, JSON.stringify(updated))
  } catch {}

  return newMember
}

export async function updateTeamMemberRole(
  teamId: string,
  staffId: string,
  role: 'lead' | 'member'
): Promise<void> {
  const effectiveStaffId = await resolveEffectiveStaffId(staffId)

  try {
    const { data: updated } = await supabase
      .from('team_members')
      .update({ role })
      .eq('team_id', teamId)
      .eq('staff_id', effectiveStaffId)
      .select()

    if (!updated || updated.length === 0) {
      await supabase
        .from('team_members')
        .update({ role })
        .eq('team_id', teamId)
        .eq('staff_id', staffId)
    }
  } catch (err) {
    console.warn('Could not update team role on Supabase, updating locally:', err)
  }

  try {
    const cached: TeamMember[] = JSON.parse(localStorage.getItem(`${LOCAL_TEAM_MEMBERS_KEY}_${teamId}`) || '[]')
    const updated = cached.map(m => (m.staff_id === staffId || m.staff_id === effectiveStaffId) ? { ...m, role } : m)
    localStorage.setItem(`${LOCAL_TEAM_MEMBERS_KEY}_${teamId}`, JSON.stringify(updated))
  } catch {}
}

export async function removeTeamMember(teamId: string, staffId: string): Promise<void> {
  const effectiveStaffId = await resolveEffectiveStaffId(staffId)

  try {
    await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .or(`staff_id.eq.${effectiveStaffId},staff_id.eq.${staffId}`)
  } catch (err) {
    console.warn('Could not delete team member from Supabase, removing locally:', err)
  }

  try {
    const cached: TeamMember[] = JSON.parse(localStorage.getItem(`${LOCAL_TEAM_MEMBERS_KEY}_${teamId}`) || '[]')
    const updated = cached.filter(m => m.staff_id !== staffId && m.staff_id !== effectiveStaffId)
    localStorage.setItem(`${LOCAL_TEAM_MEMBERS_KEY}_${teamId}`, JSON.stringify(updated))
  } catch {}
}


