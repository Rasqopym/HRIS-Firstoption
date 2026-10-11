import { supabase } from './supabase'
import { logAction } from './auditLog'

export interface DeleteStaffResult {
  success: boolean
  deletedStaffCount: number
  deletedProfile: boolean
  error?: string
}

/**
 * Permanently and cleanly deletes a staff member and/or system user,
 * resolving all foreign key constraints across attendance, tasks, chat,
 * appraisals, standups, workspace/team memberships, and leave requests.
 */
export async function deleteStaffCompletely({
  staffId,
  profileId,
  email,
  actorName = 'Super Admin',
}: {
  staffId?: string | null
  profileId?: string | null
  email?: string | null
  actorName?: string
}): Promise<DeleteStaffResult> {
  const cleanEmail = email && email !== '—' ? email.trim().toLowerCase() : null
  const matchedStaffIds = new Set<string>()
  if (staffId) matchedStaffIds.add(staffId)

  let targetProfileId = profileId || null

  // 1. Discover all matching staff records in public.staff
  try {
    if (staffId) {
      const { data } = await supabase.from('staff').select('id, profile_id, email, full_name').eq('id', staffId)
      data?.forEach(s => {
        matchedStaffIds.add(s.id)
        if (s.profile_id && !targetProfileId) targetProfileId = s.profile_id
      })
    }
    if (targetProfileId) {
      const { data } = await supabase.from('staff').select('id, profile_id, email, full_name').eq('profile_id', targetProfileId)
      data?.forEach(s => {
        matchedStaffIds.add(s.id)
      })
    }
    if (cleanEmail) {
      const { data } = await supabase.from('staff').select('id, profile_id, email, full_name').ilike('email', cleanEmail)
      data?.forEach(s => {
        matchedStaffIds.add(s.id)
        if (s.profile_id && !targetProfileId) targetProfileId = s.profile_id
      })
    }
  } catch (err) {
    console.warn('Error querying matching staff IDs:', err)
  }

  // Also check profiles table by email if targetProfileId is missing
  if (!targetProfileId && cleanEmail) {
    try {
      const { data: pData } = await supabase.from('profiles').select('id').ilike('email', cleanEmail).maybeSingle()
      if (pData?.id) targetProfileId = pData.id
    } catch {}
  }

  const sIds = Array.from(matchedStaffIds).filter(Boolean)

  // 2. Cascade cleanup on foreign key dependencies for each staff ID
  for (const sId of sIds) {
    try {
      await supabase.from('attendance_records').delete().eq('staff_id', sId)
      await supabase.from('daily_standups').delete().eq('staff_id', sId)
      await supabase.from('task_activity_logs').delete().eq('staff_id', sId)
      await supabase.from('team_members').delete().eq('staff_id', sId)
      await supabase.from('workspace_members').delete().eq('staff_id', sId)
      await supabase.from('chat_messages').delete().eq('sender_id', sId)
      await supabase.from('leave_requests').delete().eq('staff_id', sId)
      await supabase.from('appraisals').delete().eq('staff_id', sId)
      await supabase.from('appraisals').update({ evaluator_id: null }).eq('evaluator_id', sId)
      await supabase.from('staff_documents').delete().eq('staff_id', sId)
      await supabase.from('payslips').delete().eq('staff_id', sId)
      await supabase.from('tasks').update({ assignee_id: null }).eq('assignee_id', sId)
      await supabase.from('tasks').update({ creator_id: null }).eq('creator_id', sId)
    } catch (depErr) {
      console.warn(`Dependency cleanup warning for staff ${sId}:`, depErr)
    }
  }

  // 3. Delete records from public.staff
  let deletedStaffCount = 0
  for (const sId of sIds) {
    const { error: delErr } = await supabase.from('staff').delete().eq('id', sId)
    if (!delErr) deletedStaffCount++
  }
  if (targetProfileId) {
    await supabase.from('staff').delete().eq('profile_id', targetProfileId)
  }
  if (cleanEmail) {
    await supabase.from('staff').delete().ilike('email', cleanEmail)
  }

  // 4. Cascade cleanup for Profile / Auth User
  let deletedProfile = false
  if (targetProfileId) {
    try {
      await supabase.from('audit_log').update({ actor_id: null }).eq('actor_id', targetProfileId)
    } catch {}

    // Invoke backend Edge Function or RPC to delete Auth User + Profile
    try {
      await supabase.functions.invoke('delete-user', {
        body: { user_id: targetProfileId, staff_id: staffId || sIds[0] || null }
      })
    } catch {}

    const { error: pDelErr } = await supabase.from('profiles').delete().eq('id', targetProfileId)
    if (!pDelErr) deletedProfile = true
  }

  // 5. Clean up any LocalStorage caches
  try {
    for (const sId of sIds) {
      localStorage.removeItem(`hris_self_attendance_${sId}`)
      localStorage.removeItem(`hris_attendance_daily_${sId}`)
    }
  } catch {}

  // 6. Log audit action
  try {
    await logAction({
      action: 'DELETE',
      entity: 'Staff',
      entityId: staffId || targetProfileId || 'multiple',
      details: `Permanently deleted staff & user account (${cleanEmail || sIds.join(', ') || targetProfileId}) by ${actorName}`,
      severity: 'critical' as any,
    })
  } catch {}

  return {
    success: true,
    deletedStaffCount,
    deletedProfile,
  }
}
