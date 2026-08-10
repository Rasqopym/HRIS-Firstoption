import { supabase } from './supabase'
import { dbRoleToApp } from './roleMap'

export async function logAction(params: {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'EXPORT' | 'VIEW',
  entity: string,
  entityId?: string,
  details: string,
  severity?: 'low' | 'medium' | 'high',
}): Promise<void> {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.warn('Audit log: Could not get current user', userError)
      return
    }

    // Look up profile for name and role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.warn('Audit log: Could not fetch user profile', profileError)
      return
    }

    // Insert audit log entry
    const { error: insertError } = await supabase
      .from('audit_log')
      .insert({
        actor_id: user.id,
        actor_name: profile.full_name,
        actor_role: dbRoleToApp(profile.role),
        action: params.action,
        entity: params.entity,
        entity_id: params.entityId,
        details: params.details,
        severity: params.severity ?? 'low',
      })

    if (insertError) {
      console.warn('Audit log: Failed to insert log entry', insertError)
    }
  } catch (err) {
    // Never throw - logging should never break the calling feature
    console.warn('Audit log: Unexpected error', err)
  }
}
