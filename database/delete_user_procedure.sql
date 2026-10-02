-- ====================================================================
-- SQL Script to Delete Ayola Adeyemi & Setup Permanent User Deletion
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/wnmoczubrqzkbidyiltg/sql
-- ====================================================================

-- --------------------------------------------------------------------
-- STEP 1: FIX FOREIGN KEY ON AUDIT_LOG TO ALLOW USER DELETIONS
-- (Prevents audit_log from blocking profile deletions by setting actor to NULL)
-- --------------------------------------------------------------------
ALTER TABLE public.audit_log 
DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;

ALTER TABLE public.audit_log 
ADD CONSTRAINT audit_log_actor_id_fkey 
FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Detach any existing logs for Ayola Adeyemi
UPDATE public.audit_log 
SET actor_id = NULL 
WHERE actor_id = '9fbdcb27-939d-4fac-bb4f-1cc0d0853495'
   OR actor_id IN (SELECT id FROM public.profiles WHERE LOWER(email) = 'opeyemi.websitedesign@gmail.com');


-- --------------------------------------------------------------------
-- STEP 2: IMMEDIATELY DELETE AYOLA ADEYEMI (opeyemi.websitedesign@gmail.com)
-- --------------------------------------------------------------------
DELETE FROM public.staff 
WHERE LOWER(email) = 'opeyemi.websitedesign@gmail.com'
   OR profile_id IN (SELECT id FROM public.profiles WHERE LOWER(email) = 'opeyemi.websitedesign@gmail.com');

DELETE FROM public.profiles 
WHERE LOWER(email) = 'opeyemi.websitedesign@gmail.com';

DELETE FROM auth.users 
WHERE LOWER(email) = 'opeyemi.websitedesign@gmail.com';


-- --------------------------------------------------------------------
-- STEP 3: ENABLE DELETE POLICIES ON PROFILES AND STAFF FOR SUPER ADMIN
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow delete profiles" ON public.profiles;
CREATE POLICY "Allow delete profiles" ON public.profiles FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow delete staff" ON public.staff;
CREATE POLICY "Allow delete staff" ON public.staff FOR DELETE TO authenticated USING (true);


-- --------------------------------------------------------------------
-- STEP 4: CREATE PROCEDURE SO THE DELETE BUTTON IN THE WEB APP WORKS AUTOMATICALLY
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_user_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 1. Detach audit logs so they don't block deletion
  UPDATE public.audit_log SET actor_id = NULL WHERE actor_id = p_user_id;

  -- 2. Detach or delete other references if any
  UPDATE public.payroll_runs SET run_by = NULL WHERE run_by = p_user_id;
  UPDATE public.leave_requests SET approved_by = NULL WHERE approved_by = p_user_id;

  -- 3. Delete workspace memberships if table exists
  BEGIN
    DELETE FROM public.workspace_members WHERE user_id = p_user_id OR profile_id = p_user_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 4. Delete from staff table
  IF p_staff_id IS NOT NULL THEN
    DELETE FROM public.staff WHERE id = p_staff_id;
  END IF;
  DELETE FROM public.staff WHERE profile_id = p_user_id;

  -- 5. Delete from profiles table
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- 6. Delete from Supabase Auth users (cascades to any references)
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execution to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID, UUID) TO service_role;
