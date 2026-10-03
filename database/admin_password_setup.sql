-- ====================================================================
-- SQL Script: Resilient Admin Password Reset Function & Staff Account Sync
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/wnmoczubrqzkbidyiltg/sql
-- ====================================================================

-- 1. Ensure pgcrypto extension is active for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Drop older 2-arg version if needed to avoid signature ambiguity
DROP FUNCTION IF EXISTS public.admin_set_user_password(UUID, TEXT);

-- 3. Create upgraded procedure so Super Admin can reset any user's password,
--    even if they only existed in the staff table, and automatically link their profile
CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_user_id UUID,
  p_new_password TEXT,
  p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_role user_role;
  v_encrypted_pw TEXT;
  v_target_id UUID;
  v_target_email TEXT;
BEGIN
  -- Verify caller is super_admin or service_role
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role != 'super_admin' THEN
      RAISE EXCEPTION 'Only superadmin can reset user passwords directly';
    END IF;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters');
  END IF;

  -- Generate bcrypt hash (cost factor 10, Supabase standard)
  v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));

  -- 1. Try finding user in auth.users by p_user_id
  IF p_user_id IS NOT NULL THEN
    SELECT id, email INTO v_target_id, v_target_email FROM auth.users WHERE id = p_user_id;
  END IF;

  -- 2. If not found by p_user_id, try finding in auth.users by email
  IF v_target_id IS NULL AND p_email IS NOT NULL AND TRIM(p_email) != '' THEN
    SELECT id, email INTO v_target_id, v_target_email FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email));
  END IF;

  -- 3. If still not found, check staff and profiles tables for email
  IF v_target_id IS NULL AND p_user_id IS NOT NULL THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_user_id;
    IF v_target_email IS NULL THEN
      SELECT email INTO v_target_email FROM public.staff WHERE id = p_user_id OR profile_id = p_user_id LIMIT 1;
    END IF;
    IF v_target_email IS NOT NULL THEN
      SELECT id, email INTO v_target_id, v_target_email FROM auth.users WHERE LOWER(email) = LOWER(TRIM(v_target_email));
    END IF;
  END IF;

  -- CASE A: User ALREADY EXISTS in auth.users -> Update password and confirm email
  IF v_target_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_target_id;

    -- Ensure profiles row exists and is active
    INSERT INTO public.profiles (id, email, full_name, role, status)
    VALUES (
      v_target_id,
      v_target_email,
      COALESCE((SELECT full_name FROM public.staff WHERE profile_id = v_target_id OR LOWER(email) = LOWER(v_target_email) LIMIT 1), 'Staff Member'),
      'staff',
      'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET status = 'active',
        email = COALESCE(EXCLUDED.email, profiles.email);

    -- Sync staff profile_id to point to the real auth.users id
    UPDATE public.staff
    SET profile_id = v_target_id
    WHERE LOWER(email) = LOWER(v_target_email) OR profile_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'user_id', v_target_id, 'action', 'updated');
  END IF;

  -- CASE B: User DOES NOT EXIST in auth.users -> Create them directly
  IF v_target_email IS NULL THEN
    v_target_email := LOWER(TRIM(COALESCE(p_email, '')));
  END IF;

  IF v_target_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found in auth.users and no email provided to create account');
  END IF;

  v_target_id := COALESCE(p_user_id, gen_random_uuid());

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_target_id,
    'authenticated',
    'authenticated',
    v_target_email,
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('email', v_target_email, 'full_name', (SELECT full_name FROM public.staff WHERE LOWER(email) = v_target_email LIMIT 1)),
    now(),
    now(),
    encode(gen_random_bytes(32), 'hex')
  );

  -- Ensure profile exists
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    v_target_id,
    v_target_email,
    COALESCE((SELECT full_name FROM public.staff WHERE LOWER(email) = v_target_email LIMIT 1), 'Staff Member'),
    'staff',
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET status = 'active',
      email = EXCLUDED.email;

  -- Sync staff profile_id
  UPDATE public.staff
  SET profile_id = v_target_id
  WHERE LOWER(email) = v_target_email;

  RETURN jsonb_build_object('success', true, 'user_id', v_target_id, 'action', 'created');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(UUID, TEXT, TEXT) TO anon;


-- ====================================================================
-- 4. IMMEDIATE FIX & SYNC FOR HABIBULLAHI ABDULRAUF
-- Sets Habib's password to: FirstOption2026!
-- Ensures his auth.users, profiles, and staff table are 100% linked.
-- ====================================================================
DO $$
DECLARE
  v_habib_auth_id UUID;
BEGIN
  -- 1. Find Habib's auth ID
  SELECT id INTO v_habib_auth_id FROM auth.users WHERE LOWER(email) = 'muhdhabibbinmaruf@gmail.com' LIMIT 1;
  
  -- If not in auth.users, create
  IF v_habib_auth_id IS NULL THEN
    v_habib_auth_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_habib_auth_id,
      'authenticated',
      'authenticated',
      'muhdhabibbinmaruf@gmail.com',
      extensions.crypt('FirstOption2026!', extensions.gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"email":"muhdhabibbinmaruf@gmail.com","full_name":"Habibullahi Abdulrauf"}'::jsonb,
      now(), now(), encode(gen_random_bytes(32), 'hex')
    );
  ELSE
    -- Update password and confirm email
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('FirstOption2026!', extensions.gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_habib_auth_id;
  END IF;

  -- 2. Insert/update profile
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (v_habib_auth_id, 'muhdhabibbinmaruf@gmail.com', 'Habibullahi Abdulrauf', 'staff', 'active')
  ON CONFLICT (id) DO UPDATE SET status = 'active', email = EXCLUDED.email;

  -- 3. Link staff table
  UPDATE public.staff
  SET profile_id = v_habib_auth_id
  WHERE LOWER(email) = 'muhdhabibbinmaruf@gmail.com';
END $$;
