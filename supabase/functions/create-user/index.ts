import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  }

  try {
    // Step 1: Read what the app sent us (the new user's details)
    const { email, full_name, role, staff_id } = await req.json()

    if (!email || !full_name || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders })
    }

    // Step 2: Check that WHOEVER is calling this function is actually a
    // logged-in Super Admin or HR — otherwise, reject the request immediately.
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

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: 'Failed to verify caller role' }), { status: 401, headers: corsHeaders })
    }

    // Check permissions: only super_admin and hr can create users
    if (callerProfile.role !== 'super_admin' && callerProfile.role !== 'hr') {
      return new Response(JSON.stringify({ error: 'Only Super Admin and HR can create users' }), { status: 403, headers: corsHeaders })
    }

    // If caller is HR, force the role to be 'staff' regardless of what was sent
    const finalRole = callerProfile.role === 'hr' ? 'staff' : role

    // Step 3: The caller IS authorized — now use the powerful
    // secret-key client (only available here, safely, on the server) to
    // actually create the login account.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const tempPassword = crypto.randomUUID().slice(0, 12)

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (createError || !newUser.user) {
      return new Response(JSON.stringify({ error: createError?.message || 'Failed to create user' }), { status: 400, headers: corsHeaders })
    }

    // Step 4: Create their matching profiles row with the correct role
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: newUser.user.id, full_name, role: finalRole, email, status: 'active' })

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: corsHeaders })
    }

    // Step 5: If staff_id was provided, link the staff record to the new profile
    let linkWarning: string | undefined
    if (staff_id) {
      const { error: linkError } = await supabaseAdmin
        .from('staff')
        .update({ profile_id: newUser.user.id })
        .eq('id', staff_id)

      if (linkError) {
        linkWarning = `Failed to link staff record to profile: ${linkError.message}`
      }
    }

    // Step 6: Success! Send back the temporary password so it can be shown once.
    const response: { success: true; temp_password: string; warning?: string } = {
      success: true,
      temp_password: tempPassword,
    }

    if (linkWarning) {
      response.warning = linkWarning
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})