-- ====================================================================
-- SQL Procedure & Queries for Super Admin to Update Staff Emails
-- Execute in Supabase SQL Editor: https://supabase.com/dashboard/project/wnmoczubrqzkbidyiltg/sql
-- ====================================================================

-- 1. Helper function allowing Super Admin to update user email across auth.users, profiles, and staff
CREATE OR REPLACE FUNCTION public.admin_update_user_email(
  p_user_id UUID,
  p_new_email TEXT,
  p_full_name TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role user_role;
  v_normalized_email TEXT;
BEGIN
  -- Verify caller is super_admin or service_role
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role != 'super_admin' THEN
      RAISE EXCEPTION 'Only superadmin can update staff credentials';
    END IF;
  END IF;

  v_normalized_email := LOWER(TRIM(p_new_email));

  -- 1. Update auth.users (Login email)
  UPDATE auth.users
  SET email = v_normalized_email,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_user_meta_data = CASE 
        WHEN p_full_name IS NOT NULL THEN raw_user_meta_data || jsonb_build_object('full_name', p_full_name, 'email', v_normalized_email)
        ELSE raw_user_meta_data || jsonb_build_object('email', v_normalized_email)
      END
  WHERE id = p_user_id;

  -- 2. Update profiles table
  UPDATE public.profiles
  SET email = v_normalized_email,
      full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
      phone = COALESCE(p_phone, phone)
  WHERE id = p_user_id;

  -- 3. Update staff table
  UPDATE public.staff
  SET email = v_normalized_email,
      full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
      department = COALESCE(NULLIF(p_department, ''), department),
      job_title = COALESCE(NULLIF(p_job_title, ''), job_title),
      phone = COALESCE(p_phone, phone)
  WHERE profile_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'email', v_normalized_email);
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_update_user_email(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_email(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;


-- ====================================================================
-- QUICK MANUAL QUERIES (If you want to update them directly via SQL right now):
-- ====================================================================

/*
-- Example for Habibullahi Abdulrauf:
-- Replace 'new_habib_email@firstoption.ng' with their target email address:

UPDATE auth.users 
SET email = 'new_habib_email@firstoption.ng', 
    raw_user_meta_data = raw_user_meta_data || '{"email":"new_habib_email@firstoption.ng"}'::jsonb
WHERE email = 'muhdhabibbinmaruf@gmail.com';

UPDATE public.profiles 
SET email = 'new_habib_email@firstoption.ng' 
WHERE email = 'muhdhabibbinmaruf@gmail.com';

UPDATE public.staff 
SET email = 'new_habib_email@firstoption.ng' 
WHERE email = 'muhdhabibbinmaruf@gmail.com';


-- Example for Mathew Akinkunmi Ayeremi:
-- Replace 'new_mathew_email@firstoption.ng' with their target email address:

UPDATE auth.users 
SET email = 'new_mathew_email@firstoption.ng', 
    raw_user_meta_data = raw_user_meta_data || '{"email":"new_mathew_email@firstoption.ng"}'::jsonb
WHERE email = 'apostlejmighy2017@gmail.com';

UPDATE public.profiles 
SET email = 'new_mathew_email@firstoption.ng' 
WHERE email = 'apostlejmighy2017@gmail.com';

UPDATE public.staff 
SET email = 'new_mathew_email@firstoption.ng' 
WHERE email = 'apostlejmighy2017@gmail.com';
*/
