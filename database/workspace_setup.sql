-- ==============================================================================
-- HRIS FIRSTOPTION: WORKSPACES, TEAMS, CHAT, TASKS, STANDUPS & STORAGE SETUP
-- ==============================================================================
-- Run this in Supabase SQL Editor to enable Workspaces, Team Chat,
-- Compressed Image Storage, Kanban Tasks, and Standup Monitoring.
-- ==============================================================================

-- 1. WORKSPACES TABLE
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

-- 2. WORKSPACE MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('wm-' || substr(md5(random()::text), 1, 12)),
  workspace_id VARCHAR(100) NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'lead', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, staff_id)
);

-- 3. TEAMS / SQUADS TABLE
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

-- 4. TEAM MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.team_members (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('tm-' || substr(md5(random()::text), 1, 12)),
  team_id VARCHAR(100) NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, staff_id)
);

-- 5. CHANNELS TABLE
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

-- 6. CHAT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('msg-' || substr(md5(random()::text), 1, 12)),
  channel_id VARCHAR(100) NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id VARCHAR(100) REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of compressed image metadata: { url, name, size, width, height }
  reactions JSONB DEFAULT '{}'::jsonb,   -- Key-value of emoji/tag: [staff_ids]
  mentions JSONB DEFAULT '[]'::jsonb,    -- Array of mentioned staff_ids
  action_tasks JSONB DEFAULT '[]'::jsonb,-- Array of spawned task_ids
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. TASKS TABLE
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

-- 8. TASK ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS public.task_activity_logs (
  id VARCHAR(100) PRIMARY KEY DEFAULT ('log-' || substr(md5(random()::text), 1, 12)),
  task_id VARCHAR(100) NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. DAILY STANDUPS TABLE
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

-- 10. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON public.tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON public.tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_daily_standups_team_date ON public.daily_standups(team_id, standup_date);

-- 11. ROW LEVEL SECURITY (RLS) POLICIES
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

-- 12. STORAGE BUCKET CONFIGURATION (FOR COMPRESSED IMAGES)
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

-- 13. SEED DEFAULT WORKSPACES & TEAMS
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
