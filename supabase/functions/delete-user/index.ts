import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  }

  try {
    const { user_id, staff_id } = await req.json()
    if (!user_id && !staff_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id or staff_id' }), { status: 400, headers: corsHeaders })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabaseUserClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: corsHeaders })
    }

    const { data: callerProfile } = await supabaseUserClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only Super Admin can delete users' }), { status: 403, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find all matching staff IDs
    const staffIdsToDelete = new Set<string>()
    if (staff_id) staffIdsToDelete.add(staff_id)
    if (user_id) {
      const { data: matchedByProf } = await supabaseAdmin.from('staff').select('id').eq('profile_id', user_id)
      matchedByProf?.forEach((s: any) => staffIdsToDelete.add(s.id))
    }

    // Cascade delete on foreign keys to prevent constraint errors
    for (const sId of Array.from(staffIdsToDelete)) {
      await supabaseAdmin.from('attendance_records').delete().eq('staff_id', sId)
      await supabaseAdmin.from('daily_standups').delete().eq('staff_id', sId)
      await supabaseAdmin.from('task_activity_logs').delete().eq('staff_id', sId)
      await supabaseAdmin.from('team_members').delete().eq('staff_id', sId)
      await supabaseAdmin.from('workspace_members').delete().eq('staff_id', sId)
      await supabaseAdmin.from('chat_messages').delete().eq('sender_id', sId)
      await supabaseAdmin.from('leave_requests').delete().eq('staff_id', sId)

      // Appraisal tables cleanup
      await supabaseAdmin.from('appraisal_supervisor_responses').delete().eq('reviewer_id', sId)
      await supabaseAdmin.from('appraisal_supervisor_responses').delete().eq('employee_id', sId)
      await supabaseAdmin.from('appraisal_360_responses').delete().eq('reviewer_id', sId)
      await supabaseAdmin.from('appraisal_360_responses').delete().eq('employee_id', sId)
      await supabaseAdmin.from('appraisal_kpi_responses').delete().eq('reviewer_id', sId)
      await supabaseAdmin.from('appraisal_kpi_responses').delete().eq('employee_id', sId)
      await supabaseAdmin.from('appraisal_qualitative_responses').delete().eq('reviewer_id', sId)
      await supabaseAdmin.from('appraisal_qualitative_responses').delete().eq('employee_id', sId)
      await supabaseAdmin.from('appraisal_self_responses').delete().eq('employee_id', sId)
      await supabaseAdmin.from('appraisal_final_summary').delete().eq('employee_id', sId)
      await supabaseAdmin.from('appraisals').delete().eq('staff_id', sId)
      await supabaseAdmin.from('appraisals').update({ evaluator_id: null }).eq('evaluator_id', sId)

      await supabaseAdmin.from('staff_documents').delete().eq('staff_id', sId)
      await supabaseAdmin.from('payslips').delete().eq('staff_id', sId)
      await supabaseAdmin.from('tasks').update({ assignee_id: null }).eq('assignee_id', sId)
      await supabaseAdmin.from('tasks').update({ creator_id: null }).eq('creator_id', sId)
      await supabaseAdmin.from('staff').delete().eq('id', sId)
    }

    if (user_id) {
      await supabaseAdmin.from('staff').delete().eq('profile_id', user_id)
      await supabaseAdmin.from('audit_log').update({ actor_id: null }).eq('actor_id', user_id)
      await supabaseAdmin.from('profiles').delete().eq('id', user_id)
      try {
        await supabaseAdmin.auth.admin.deleteUser(user_id)
      } catch (authErr) {
        console.warn('Auth user delete notice:', authErr)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
