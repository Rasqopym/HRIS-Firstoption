-- ==============================================================================
-- FIRSTOPTION HRIS — CONSOLIDATED EFFECTIVE SETUP & UPGRADE MIGRATION
-- ==============================================================================
-- This script contains all recent schema extensions, feature tables, RLS policies,
-- and indexes. It is safe to run multiple times (idempotent) on Supabase SQL Editor.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. PUBLIC HOLIDAYS & CUSTOM HOLIDAYS SUPPORT
-- ──────────────────────────────────────────────────────────────────────────────

-- Ensure public_holidays table exists
CREATE TABLE IF NOT EXISTS public.public_holidays (
    id VARCHAR(100) PRIMARY KEY DEFAULT ('hol-' || substr(md5(random()::text), 1, 10)),
    name VARCHAR(255) NOT NULL,
    holiday_date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on public_holidays
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read public holidays
DROP POLICY IF EXISTS "Allow authenticated to read public holidays" ON public.public_holidays;
CREATE POLICY "Allow authenticated to read public holidays"
ON public.public_holidays FOR SELECT
TO authenticated
USING (true);

-- Allow HR and Admins to manage public holidays
DROP POLICY IF EXISTS "Allow HR and Admins to insert public holidays" ON public.public_holidays;
CREATE POLICY "Allow HR and Admins to insert public holidays"
ON public.public_holidays FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('super_admin', 'hr')
  )
);

DROP POLICY IF EXISTS "Allow HR and Admins to update public holidays" ON public.public_holidays;
CREATE POLICY "Allow HR and Admins to update public holidays"
ON public.public_holidays FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('super_admin', 'hr')
  )
);

DROP POLICY IF EXISTS "Allow HR and Admins to delete public holidays" ON public.public_holidays;
CREATE POLICY "Allow HR and Admins to delete public holidays"
ON public.public_holidays FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('super_admin', 'hr')
  )
);

-- Seed standard Nigerian statutory public holidays
INSERT INTO public.public_holidays (id, name, holiday_date, is_recurring, description)
VALUES 
  ('hol-new-year', 'New Year''s Day', '2026-01-01', TRUE, 'Statutory national holiday'),
  ('hol-workers-day', 'Workers'' Day', '2026-05-01', TRUE, 'International Workers Day'),
  ('hol-democracy-day', 'Democracy Day', '2026-06-12', TRUE, 'National Democracy Day'),
  ('hol-independence-day', 'Independence Day', '2026-10-01', TRUE, 'National Independence Day'),
  ('hol-christmas', 'Christmas Day', '2026-12-25', TRUE, 'Christmas Day celebration'),
  ('hol-boxing-day', 'Boxing Day', '2026-12-26', TRUE, 'Boxing Day statutory holiday')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  holiday_date = EXCLUDED.holiday_date,
  is_recurring = EXCLUDED.is_recurring;

-- Extend company_settings with custom_holidays JSONB cache
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS custom_holidays JSONB DEFAULT '[]'::jsonb;


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. STAFF CONFIRMATION & PROBATION TRACKING
-- ──────────────────────────────────────────────────────────────────────────────

-- Ensure confirmation status columns exist on staff table
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confirmation_date DATE;

-- Performance indexes for fast confirmation filtering
CREATE INDEX IF NOT EXISTS idx_staff_is_confirmed ON public.staff (is_confirmed);
CREATE INDEX IF NOT EXISTS idx_staff_confirmation_date ON public.staff (confirmation_date);
CREATE INDEX IF NOT EXISTS idx_staff_staff_code ON public.staff (staff_code);

-- Ensure HR and Superadmin roles can update staff confirmation and manual Staff ID
DROP POLICY IF EXISTS "Allow HR and Admins to update staff confirmation" ON public.staff;
CREATE POLICY "Allow HR and Admins to update staff confirmation"
ON public.staff FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('super_admin', 'hr')
  )
);


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. WORK HOURS, GEOFENCING & FIELD WORK SETTINGS
-- ──────────────────────────────────────────────────────────────────────────────

-- Extend company_settings with multi-branch geofencing and work schedule
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS work_start_time VARCHAR(10) DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS work_end_time VARCHAR(10) DEFAULT '17:00',
ADD COLUMN IF NOT EXISTS grace_period_minutes INT DEFAULT 15,
ADD COLUMN IF NOT EXISTS enable_lateness_tracking BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_geofencing BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS allow_field_work BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS office_locations JSONB DEFAULT '[{"id":"loc-1","name":"Main Office","lat":6.5244,"lng":3.3792,"radius_meters":100,"is_active":true}]'::jsonb,
ADD COLUMN IF NOT EXISTS office_lat DOUBLE PRECISION DEFAULT 6.5244,
ADD COLUMN IF NOT EXISTS office_lng DOUBLE PRECISION DEFAULT 3.3792,
ADD COLUMN IF NOT EXISTS office_radius_meters INT DEFAULT 100,
ADD COLUMN IF NOT EXISTS office_address_label VARCHAR(255) DEFAULT 'Main Office';

-- Extend attendance_records table with clock-in/out timestamps, lateness & GPS data
ALTER TABLE public.attendance_records
ADD COLUMN IF NOT EXISTS clock_in_time VARCHAR(30),
ADD COLUMN IF NOT EXISTS clock_out_time VARCHAR(30),
ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS late_minutes INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS clock_in_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS clock_in_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS clock_in_distance_meters INT,
ADD COLUMN IF NOT EXISTS matched_location_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS work_mode VARCHAR(50) DEFAULT 'office',
ADD COLUMN IF NOT EXISTS field_client_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS field_notes TEXT,
ADD COLUMN IF NOT EXISTS site_visits JSONB DEFAULT '[]'::jsonb;

-- Indexes for attendance query performance
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON public.attendance_records (date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_staff_id ON public.attendance_records (staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_is_late ON public.attendance_records (is_late);


-- ──────────────────────────────────────────────────────────────────────────────
-- 4. PERFORMANCE APPRAISAL & GOAL SETTING MODULE
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.appraisal_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appraisals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_self_review',
  self_score NUMERIC(5,2),
  manager_score NUMERIC(5,2),
  final_score NUMERIC(5,2),
  self_comments TEXT,
  manager_comments TEXT,
  goals_data JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.appraisal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view appraisal cycles" ON public.appraisal_cycles;
CREATE POLICY "Authenticated users can view appraisal cycles"
ON public.appraisal_cycles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins and HR can manage appraisal cycles" ON public.appraisal_cycles;
CREATE POLICY "Admins and HR can manage appraisal cycles"
ON public.appraisal_cycles FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('super_admin', 'hr')
  )
);

DROP POLICY IF EXISTS "Staff can view their own appraisals" ON public.appraisals;
CREATE POLICY "Staff can view their own appraisals"
ON public.appraisals FOR SELECT
TO authenticated
USING (
  staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = auth.uid()
  )
  OR evaluator_id IN (
    SELECT id FROM public.staff WHERE profile_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('super_admin', 'hr')
  )
);

DROP POLICY IF EXISTS "Staff can update their own appraisals" ON public.appraisals;
CREATE POLICY "Staff can update their own appraisals"
ON public.appraisals FOR UPDATE
TO authenticated
USING (
  staff_id IN (
    SELECT id FROM public.staff WHERE profile_id = auth.uid()
  )
  OR evaluator_id IN (
    SELECT id FROM public.staff WHERE profile_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('super_admin', 'hr')
  )
);


-- ──────────────────────────────────────────────────────────────────────────────
-- 5. PUSH NOTIFICATION TOKENS & SYSTEM AUDIT LOGS
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_user_endpoint UNIQUE (profile_id)
);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Users can manage their push subscriptions"
ON public.user_push_subscriptions FOR ALL
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

-- ==============================================================================
-- ✅ EFFECTIVE COMPLETE SETUP & MIGRATION APPLIED SUCCESSFULLY!
-- ==============================================================================
