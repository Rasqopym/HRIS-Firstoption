-- ====================================================================
-- SQL Script to Delete Ayola Adeyemi & Setup Permanent User Deletion
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/wnmoczubrqzkbidyiltg/sql
-- ====================================================================

-- --------------------------------------------------------------------
-- STEP 1: IMMEDIATELY DELETE AYOLA ADEYEMI (opeyemi.websitedesign@gmail.com)
-- --------------------------------------------------------------------
DELETE FROM public.staff 
WHERE LOWER(email) = 'opeyemi.websitedesign@gmail.com'
   OR profile_id IN (SELECT id FROM public.profiles WHERE LOWER(email) = 'opeyemi.websitedesign@gmail.com');

DELETE FROM public.profiles 
WHERE LOWER(email) = 'opeyemi.websitedesign@gmail.com';

DELETE FROM auth.users 
WHERE LOWER(email) = 'opeyemi.websitedesign@gmail.com';


-- --------------------------------------------------------------------
-- STEP 2: ENABLE DELETE POLICIES ON PROFILES AND STAFF FOR SUPER ADMIN
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow delete profiles" ON public.profiles;
CREATE POLICY "Allow delete profiles" ON public.profiles FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow delete staff" ON public.staff;
CREATE POLICY "Allow delete staff" ON public.staff FOR DELETE TO authenticated USING (true);


-- --------------------------------------------------------------------
-- STEP 3: CREATE RPC FUNCTION TO PERMANENTLY DELETE ANY USER FROM THE WEB APP
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
DECLARE
  v_caller_role user_role;
BEGIN
  -- Verify caller is super_admin
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role != 'super_admin' THEN
      RAISE EXCEPTION 'Only superadmin can permanently delete accounts';
    END IF;
  END IF;

  -- 1. Delete from staff table
  IF p_staff_id IS NOT NULL THEN
    DELETE FROM public.staff WHERE id = p_staff_id;
  END IF;
  DELETE FROM public.staff WHERE profile_id = p_user_id;

  -- 2. Delete from profiles table
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- 3. Delete from Supabase Auth users (cascades to any references)
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execution to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID, UUID) TO service_role;
