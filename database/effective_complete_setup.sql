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
-- 4. PERFORMANCE APPRAISAL, TEMPLATES & GOAL SETTING MODULE
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.appraisal_templates (
  id VARCHAR(100) PRIMARY KEY,
  name TEXT NOT NULL,
  code VARCHAR(50) NOT NULL,
  description TEXT,
  framework_type VARCHAR(50) DEFAULT 'annual_360',
  target_roles JSONB DEFAULT '["all"]'::jsonb,
  target_departments JSONB DEFAULT '["all"]'::jsonb,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sections JSONB DEFAULT '[]'::jsonb,
  cross_references JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.appraisal_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated to view appraisal templates" ON public.appraisal_templates;
CREATE POLICY "Allow authenticated to view appraisal templates"
ON public.appraisal_templates FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow Admins and HR to manage appraisal templates" ON public.appraisal_templates;
CREATE POLICY "Allow Admins and HR to manage appraisal templates"
ON public.appraisal_templates FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('super_admin', 'hr')
  )
);

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

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. WORKSPACES, TEAMS, CHAT, TASKS, STANDUPS & STORAGE SETUP
-- ──────────────────────────────────────────────────────────────────────────────

-- Workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('ws-' || substr(md5(random()::text), 1, 12)),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Building',
  color TEXT DEFAULT '#2563eb',
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workspace members table
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('wm-' || substr(md5(random()::text), 1, 12)),
  workspace_id VARCHAR(100) NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'lead', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, staff_id)
);

-- Teams table
CREATE TABLE IF NOT EXISTS public.teams (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('team-' || substr(md5(random()::text), 1, 12)),
  workspace_id VARCHAR(100) NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Users',
  is_private BOOLEAN DEFAULT false,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Team members table
CREATE TABLE IF NOT EXISTS public.team_members (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('tm-' || substr(md5(random()::text), 1, 12)),
  team_id VARCHAR(100) NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, staff_id)
);

-- Channels table
CREATE TABLE IF NOT EXISTS public.channels (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('ch-' || substr(md5(random()::text), 1, 12)),
  team_id VARCHAR(100) NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topic TEXT,
  is_private BOOLEAN DEFAULT false,
  is_general BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('msg-' || substr(md5(random()::text), 1, 12)),
  channel_id VARCHAR(100) NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id VARCHAR(100) REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  attachments JSONB DEFAULT '[]'::jsonb,
  reactions JSONB DEFAULT '{}'::jsonb,
  mentions JSONB DEFAULT '[]'::jsonb,
  action_tasks JSONB DEFAULT '[]'::jsonb,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('task-' || substr(md5(random()::text), 1, 12)),
  workspace_id VARCHAR(100) NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id VARCHAR(100) REFERENCES public.teams(id) ON DELETE SET NULL,
  channel_id VARCHAR(100) REFERENCES public.channels(id) ON DELETE SET NULL,
  message_id VARCHAR(100) REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  creator_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  due_date DATE,
  due_time VARCHAR(10),
  reminder_type VARCHAR(50) DEFAULT 'none',
  reminder_at TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT false,
  estimated_hours NUMERIC(6, 2) DEFAULT 0,
  actual_hours NUMERIC(6, 2) DEFAULT 0,
  kpi_category TEXT,
  checklist JSONB DEFAULT '[]'::jsonb,
  image_attachments JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist if table was previously created
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_time VARCHAR(10);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reminder_type VARCHAR(50) DEFAULT 'none';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- Task activity logs table
CREATE TABLE IF NOT EXISTS public.task_activity_logs (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('log-' || substr(md5(random()::text), 1, 12)),
  task_id VARCHAR(100) NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily standups table
CREATE TABLE IF NOT EXISTS public.daily_standups (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('std-' || substr(md5(random()::text), 1, 12)),
  workspace_id VARCHAR(100) NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id VARCHAR(100) NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  yesterday_work TEXT NOT NULL,
  today_plan TEXT NOT NULL,
  blockers TEXT,
  standup_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, staff_id, standup_date)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON public.tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON public.tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_daily_standups_team_date ON public.daily_standups(team_id, standup_date);

-- RLS Enablement
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_standups ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Allow all authenticated workspaces" ON public.workspaces;
  CREATE POLICY "Allow all authenticated workspaces" ON public.workspaces FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow all authenticated workspace_members" ON public.workspace_members;
  CREATE POLICY "Allow all authenticated workspace_members" ON public.workspace_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow all authenticated teams" ON public.teams;
  CREATE POLICY "Allow all authenticated teams" ON public.teams FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow all authenticated team_members" ON public.team_members;
  CREATE POLICY "Allow all authenticated team_members" ON public.team_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow all authenticated channels" ON public.channels;
  CREATE POLICY "Allow all authenticated channels" ON public.channels FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow all authenticated chat_messages" ON public.chat_messages;
  CREATE POLICY "Allow all authenticated chat_messages" ON public.chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow all authenticated tasks" ON public.tasks;
  CREATE POLICY "Allow all authenticated tasks" ON public.tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow all authenticated task_activity_logs" ON public.task_activity_logs;
  CREATE POLICY "Allow all authenticated task_activity_logs" ON public.task_activity_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow all authenticated daily_standups" ON public.daily_standups;
  CREATE POLICY "Allow all authenticated daily_standups" ON public.daily_standups FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $$;

-- Storage Bucket setup
INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-attachments', 'workspace-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow authenticated users to upload workspace attachments" ON storage.objects;
  CREATE POLICY "Allow authenticated users to upload workspace attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'workspace-attachments');

  DROP POLICY IF EXISTS "Allow public to view workspace attachments" ON storage.objects;
  CREATE POLICY "Allow public to view workspace attachments"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'workspace-attachments');

  DROP POLICY IF EXISTS "Allow authenticated users to delete workspace attachments" ON storage.objects;
  CREATE POLICY "Allow authenticated users to delete workspace attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'workspace-attachments');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Seed Default Workspaces & Squads
INSERT INTO public.workspaces (id, name, code, description, icon, color, is_default)
VALUES 
  ('ws-main', 'FirstOption Headquarters', 'FOHQ', 'Main corporate workspace for cross-functional company collaboration and operations', 'Building', '#2563eb', true),
  ('ws-sales', 'Sales & Growth Operations', 'SALES', 'Lead generation, client pipeline, onboarding, and revenue acceleration hub', 'Briefcase', '#059669', false),
  ('ws-tech', 'Technology & Product Engineering', 'TECH', 'Software development, IT infrastructure, sprint backlogs, and technical SOPs', 'Tasks', '#7c3aed', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, workspace_id, name, description, icon, is_private)
VALUES 
  ('team-general', 'ws-main', 'Company Wide Hub', 'General announcements, townhalls, and company-wide collaborative discussions', 'Megaphone', false),
  ('team-sales', 'ws-sales', 'Enterprise Sales Squad', 'Outbound sales, pitch decks, customer meetings, and contract negotiations', 'Target', false),
  ('team-ops', 'ws-main', 'People & Business Operations', 'HR policy, payroll reviews, procurement, and facility management', 'Briefcase', false),
  ('team-eng', 'ws-tech', 'Core Platform Engineering', 'Fullstack app development, database optimization, and cloud architecture', 'Tasks', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.channels (id, team_id, name, topic, is_general)
VALUES 
  ('ch-announcements', 'team-general', 'announcements', 'Official company-wide updates', true),
  ('ch-watercooler', 'team-general', 'general-chat', 'Casual team banter and daily check-ins', false),
  ('ch-sales-pipeline', 'team-sales', 'sales-pipeline', 'Live leads and opportunity tracking', true),
  ('ch-sales-deals', 'team-sales', 'closed-deals', 'Celebrate closed revenue wins and contract executions', false),
  ('ch-ops-tasks', 'team-ops', 'operations-tasks', 'Operational execution and compliance tasks', true),
  ('ch-eng-sprint', 'team-eng', 'sprint-board', 'Sprint tasks, code reviews, and deployments', true)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- ✅ EFFECTIVE COMPLETE SETUP & MIGRATION APPLIED SUCCESSFULLY!
-- ==============================================================================
