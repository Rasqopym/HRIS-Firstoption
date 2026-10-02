-- ====================================================================
-- SQL Script: Admin Password Reset Function & Fix for Mathew's Login
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/wnmoczubrqzkbidyiltg/sql
-- ====================================================================

-- 1. Ensure pgcrypto extension is active for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the procedure so Super Admin can reset user passwords directly
CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_role user_role;
  v_encrypted_pw TEXT;
BEGIN
  -- Verify caller is super_admin or service_role
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role != 'super_admin' THEN
      RAISE EXCEPTION 'Only superadmin can reset user passwords directly';
    END IF;
  END IF;

  -- Generate bcrypt hash (cost factor 10, Supabase standard)
  v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));

  -- Update user password in auth.users
  UPDATE auth.users
  SET encrypted_password = v_encrypted_pw,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(UUID, TEXT) TO service_role;


-- ====================================================================
-- 3. QUICK FIX: SET MATHEW'S PASSWORD & SYNC HIS EMAIL RIGHT NOW
-- Sets password to: Pass#123456
-- (Mathew can immediately sign in with apostlejmighty2017@gmail.com and Pass#123456)
-- ====================================================================
UPDATE auth.users 
SET email = 'apostlejmighty2017@gmail.com',
    raw_user_meta_data = raw_user_meta_data || '{"email":"apostlejmighty2017@gmail.com"}'::jsonb,
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    encrypted_password = extensions.crypt('Pass#123456', extensions.gen_salt('bf', 10)),
    updated_at = now()
WHERE LOWER(email) LIKE '%apostlej%';

UPDATE public.profiles 
SET email = 'apostlejmighty2017@gmail.com' 
WHERE LOWER(email) LIKE '%apostlej%';

UPDATE public.staff 
SET email = 'apostlejmighty2017@gmail.com' 
WHERE LOWER(email) LIKE '%apostlej%';
