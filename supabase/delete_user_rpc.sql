-- ==============================================================================
-- FirstOption HRIS: Secure User Purge RPC Function
-- Run this in your Supabase Project -> SQL Editor to allow permanent auth user deletion.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.delete_system_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- 1. Security Check: Verify that the caller is a Super Admin
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Only Super Admin can delete users.');
  END IF;

  -- 2. Null out foreign key relationships in public tables to prevent constraint errors
  UPDATE public.departments SET head_of_department_id = NULL WHERE head_of_department_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  UPDATE public.staff SET manager_id = NULL WHERE manager_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  UPDATE public.teams SET team_lead_id = NULL WHERE team_lead_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  UPDATE public.tasks SET assignee_id = NULL WHERE assignee_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  UPDATE public.tasks SET creator_id = NULL WHERE creator_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  UPDATE public.appraisals SET evaluator_id = NULL WHERE evaluator_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  UPDATE public.audit_log SET actor_id = NULL WHERE actor_id = p_user_id;

  -- 3. Cascade delete from staff-dependent records
  DELETE FROM public.attendance_records WHERE staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  DELETE FROM public.daily_standups WHERE staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  DELETE FROM public.task_activity_logs WHERE staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  DELETE FROM public.team_members WHERE staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  DELETE FROM public.workspace_members WHERE staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  DELETE FROM public.chat_messages WHERE sender_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  DELETE FROM public.leave_requests WHERE staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  DELETE FROM public.staff_documents WHERE staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );
  DELETE FROM public.payslips WHERE staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = p_user_id
  );

  -- 4. Delete staff record
  DELETE FROM public.staff WHERE profile_id = p_user_id;

  -- 5. Delete profile record
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- 6. Permanently delete from Supabase Auth (auth.users) so they can never sign in again
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execution permission to authenticated users (role check inside function ensures only super admins can run it)
GRANT EXECUTE ON FUNCTION public.delete_system_user(UUID) TO authenticated;
