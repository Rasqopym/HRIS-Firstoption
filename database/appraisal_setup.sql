-- ============================================================
-- HRIS-Firstoption — Performance Appraisal Module Setup
-- ============================================================
-- HOW TO USE:
-- 1. Open your Supabase project SQL Editor
-- 2. Paste this entire file
-- 3. Click Run
-- 4. Appraisal tables are ready ✅
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- TABLE 1: APPRAISAL CYCLES
-- (Defines appraisal periods - e.g. "Q3 2026", "Annual 2026")
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.appraisal_cycles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'draft',  -- draft | active | closed
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- TABLE 2: APPRAISAL ASSIGNMENTS
-- (Tracks who reviews whom per cycle + completion status)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.appraisal_assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        UUID        NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  employee_id     UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  reviewer_id     UUID        REFERENCES public.staff(id),
  section         TEXT        NOT NULL,  -- '360' | 'kpi' | 'self' | 'supervisor' | 'qualitative'
  status          TEXT        NOT NULL DEFAULT 'not_started',  -- not_started | in_progress | complete
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cycle_id, employee_id, reviewer_id, section)
);


-- ────────────────────────────────────────────────────────────
-- TABLE 3: 360° ASSESSMENT RESPONSES
-- (46 statements, one row per reviewer submission per employee)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.appraisal_360_responses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        UUID        NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  employee_id     UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  reviewer_id     UUID        NOT NULL REFERENCES public.staff(id),
  ratings         JSONB       NOT NULL DEFAULT '{}',   -- { "1": 4, "2": 5, "3": null, ... } (null = N/A)
  comments        JSONB       NOT NULL DEFAULT '{}',   -- { "1": "Good work", "5": "Needs focus", ... }
  category_averages JSONB     DEFAULT '{}',            -- { "work_performance": 4.2, "reliability": 3.8, ... }
  overall_average NUMERIC     DEFAULT 0,
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cycle_id, employee_id, reviewer_id)
);


-- ────────────────────────────────────────────────────────────
-- TABLE 4: ROLE KPI RESPONSES
-- (Department-specific KPIs with weighted ratings)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.appraisal_kpi_responses (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id            UUID        NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  employee_id         UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  reviewer_id         UUID        NOT NULL REFERENCES public.staff(id),
  department_category TEXT        NOT NULL,  -- 'sales' | 'technical' | 'customer_service' | 'marketing' | 'admin'
  ratings             JSONB       NOT NULL DEFAULT '{}',   -- { "kpi_key": rating_value, ... }
  comments            JSONB       NOT NULL DEFAULT '{}',   -- { "kpi_key": "evidence text", ... }
  weighted_average    NUMERIC     DEFAULT 0,
  submitted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cycle_id, employee_id, reviewer_id)
);


-- ────────────────────────────────────────────────────────────
-- TABLE 5: SELF APPRAISAL RESPONSES
-- (10 open-text questions answered by the employee)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.appraisal_self_responses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        UUID        NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  employee_id     UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  responses       JSONB       NOT NULL DEFAULT '{}',   -- { "q1": "answer text", "q2": "...", ... }
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cycle_id, employee_id)
);


-- ────────────────────────────────────────────────────────────
-- TABLE 6: SUPERVISOR ASSESSMENT RESPONSES
-- (10 areas with 1-5 ratings + evidence/comments)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.appraisal_supervisor_responses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        UUID        NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  employee_id     UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  reviewer_id     UUID        NOT NULL REFERENCES public.staff(id),
  ratings         JSONB       NOT NULL DEFAULT '{}',   -- { "area_key": rating_value, ... }
  comments        JSONB       NOT NULL DEFAULT '{}',   -- { "area_key": "evidence text", ... }
  average_score   NUMERIC     DEFAULT 0,
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cycle_id, employee_id, reviewer_id)
);


-- ────────────────────────────────────────────────────────────
-- TABLE 7: QUALITATIVE FEEDBACK RESPONSES
-- (10 open-text questions from supervisor/reviewer)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.appraisal_qualitative_responses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        UUID        NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  employee_id     UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  reviewer_id     UUID        NOT NULL REFERENCES public.staff(id),
  responses       JSONB       NOT NULL DEFAULT '{}',   -- { "q1": "answer text", "q2": "...", ... }
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cycle_id, employee_id, reviewer_id)
);


-- ────────────────────────────────────────────────────────────
-- TABLE 8: FINAL APPRAISAL SUMMARY
-- (Cached computed scores + HR-editable fields)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.appraisal_final_summary (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id                UUID        NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  employee_id             UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- 360° scores
  avg_360                 NUMERIC     DEFAULT 0,
  weighted_360            NUMERIC     DEFAULT 0,    -- avg_360 * 0.30
  -- Role KPI scores
  avg_kpi                 NUMERIC     DEFAULT 0,
  weighted_kpi            NUMERIC     DEFAULT 0,    -- avg_kpi * 0.50
  -- Supervisor scores
  avg_supervisor          NUMERIC     DEFAULT 0,
  weighted_supervisor     NUMERIC     DEFAULT 0,    -- avg_supervisor * 0.20
  -- Final composite
  final_score             NUMERIC     DEFAULT 0,    -- sum of weighted scores / 5 * 100 (percentage)
  classification          TEXT,                      -- Excellent | Very Good | Good | Needs Improvement | Poor
  -- HR-editable fields
  recommended_action      TEXT,
  management_comments     TEXT,
  -- Metadata
  finalized_by            UUID        REFERENCES auth.users(id),
  finalized_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cycle_id, employee_id)
);


-- ────────────────────────────────────────────────────────────
-- ENABLE ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.appraisal_cycles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisal_assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisal_360_responses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisal_kpi_responses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisal_self_responses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisal_supervisor_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisal_qualitative_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisal_final_summary          ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES
-- ────────────────────────────────────────────────────────────

-- ── APPRAISAL CYCLES ──────────────────────────────────────

CREATE POLICY "Authenticated: read appraisal cycles" ON public.appraisal_cycles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR + super admin: manage appraisal cycles" ON public.appraisal_cycles
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));


-- ── APPRAISAL ASSIGNMENTS ─────────────────────────────────

CREATE POLICY "HR + super admin: manage assignments" ON public.appraisal_assignments
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Staff: read own assignments" ON public.appraisal_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_assignments.employee_id
      AND profile_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_assignments.reviewer_id
      AND profile_id = auth.uid()
    )
  );


-- ── 360° RESPONSES ────────────────────────────────────────

CREATE POLICY "HR + super admin: manage 360 responses" ON public.appraisal_360_responses
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Reviewer: insert/update own 360 submission" ON public.appraisal_360_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_360_responses.reviewer_id
      AND profile_id = auth.uid()
    )
  );

CREATE POLICY "Employee: read own 360 responses" ON public.appraisal_360_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_360_responses.employee_id
      AND profile_id = auth.uid()
    )
  );


-- ── KPI RESPONSES ─────────────────────────────────────────

CREATE POLICY "HR + super admin: manage KPI responses" ON public.appraisal_kpi_responses
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Reviewer: manage own KPI submission" ON public.appraisal_kpi_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_kpi_responses.reviewer_id
      AND profile_id = auth.uid()
    )
  );

CREATE POLICY "Employee: read own KPI responses" ON public.appraisal_kpi_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_kpi_responses.employee_id
      AND profile_id = auth.uid()
    )
  );


-- ── SELF APPRAISAL RESPONSES ──────────────────────────────

CREATE POLICY "HR + super admin: manage self responses" ON public.appraisal_self_responses
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Employee: manage own self appraisal" ON public.appraisal_self_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_self_responses.employee_id
      AND profile_id = auth.uid()
    )
  );


-- ── SUPERVISOR RESPONSES ──────────────────────────────────

CREATE POLICY "HR + super admin: manage supervisor responses" ON public.appraisal_supervisor_responses
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Supervisor: manage own submission" ON public.appraisal_supervisor_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_supervisor_responses.reviewer_id
      AND profile_id = auth.uid()
    )
  );

CREATE POLICY "Employee: read own supervisor responses" ON public.appraisal_supervisor_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_supervisor_responses.employee_id
      AND profile_id = auth.uid()
    )
  );


-- ── QUALITATIVE RESPONSES ─────────────────────────────────

CREATE POLICY "HR + super admin: manage qualitative responses" ON public.appraisal_qualitative_responses
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Reviewer: manage own qualitative submission" ON public.appraisal_qualitative_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_qualitative_responses.reviewer_id
      AND profile_id = auth.uid()
    )
  );

CREATE POLICY "Employee: read own qualitative responses" ON public.appraisal_qualitative_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_qualitative_responses.employee_id
      AND profile_id = auth.uid()
    )
  );


-- ── FINAL SUMMARY ─────────────────────────────────────────

CREATE POLICY "HR + super admin: manage final summaries" ON public.appraisal_final_summary
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Employee: read own final summary" ON public.appraisal_final_summary
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = appraisal_final_summary.employee_id
      AND profile_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════
-- DONE ✅  Appraisal module tables and policies are ready.
-- ════════════════════════════════════════════════════════════
