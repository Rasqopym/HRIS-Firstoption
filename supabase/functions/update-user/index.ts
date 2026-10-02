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
    const { user_id, email, full_name, role, department, department_id, job_title, phone } = await req.json()
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: corsHeaders })
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

    if (!callerProfile || (callerProfile.role !== 'super_admin' && callerProfile.role !== 'hr')) {
      return new Response(JSON.stringify({ error: 'Only Super Admin or HR can update user details' }), { status: 403, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Update auth.users if email or full_name provided
    if (email) {
      const normalizedEmail = email.trim().toLowerCase()
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: full_name ? { full_name } : undefined
      })
      if (authErr) {
        console.warn('Auth user email update notice:', authErr.message)
      }
    }

    // 2. Update profiles table
    const profileUpdates: Record<string, any> = {}
    if (email) profileUpdates.email = email.trim().toLowerCase()
    if (full_name) profileUpdates.full_name = full_name.trim()
    if (role) profileUpdates.role = role
    if (phone !== undefined) profileUpdates.phone = phone

    if (Object.keys(profileUpdates).length > 0) {
      await supabaseAdmin.from('profiles').update(profileUpdates).eq('id', user_id)
    }

    // 3. Update staff table
    const staffUpdates: Record<string, any> = {}
    if (email) staffUpdates.email = email.trim().toLowerCase()
    if (full_name) staffUpdates.full_name = full_name.trim()
    if (department) staffUpdates.department = department
    if (department_id) staffUpdates.department_id = department_id
    if (job_title) staffUpdates.job_title = job_title
    if (phone !== undefined) staffUpdates.phone = phone

    if (Object.keys(staffUpdates).length > 0) {
      await supabaseAdmin.from('staff').update(staffUpdates).eq('profile_id', user_id)
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
