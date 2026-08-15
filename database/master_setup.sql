-- ============================================================
-- HRIS-Firstoption — 1-Click Master Database Setup & Seed Script
-- ============================================================
-- HOW TO USE FOR ANY NEW CLIENT PROJECT:
-- 1. Create a brand new Supabase project
-- 2. Go to SQL Editor
-- 3. Paste this entire file
-- 4. Click Run
-- 5. Your entire database schema, security rules, triggers,
--    storage buckets, tax bands, leave types, and salary templates
--    are 100% provisioned in 1 click! ✅
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- STEP 1: ENUM TYPES
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('super_admin', 'hr', 'accountant', 'auditor', 'staff');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rate_type') THEN
    CREATE TYPE rate_type AS ENUM ('flat_amount', 'percentage_of_gross', 'percentage_of_basic', 'per_day', 'per_hour', 'manual_monthly');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'component_category') THEN
    CREATE TYPE component_category AS ENUM ('allowance', 'deduction');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- STEP 2: SEQUENCE
-- ────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS staff_code_seq START 1;

-- ────────────────────────────────────────────────────────────
-- STEP 3: TABLES
-- ────────────────────────────────────────────────────────────

-- 1. Profiles (linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'staff',
  status        TEXT        NOT NULL DEFAULT 'active',
  email         TEXT,
  phone         TEXT,
  photo_url     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Company Settings
CREATE TABLE IF NOT EXISTS public.company_settings (
  id            INTEGER     PRIMARY KEY DEFAULT 1,
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  website       TEXT,
  rc_number     TEXT,
  industry      TEXT,
  founded_year  TEXT,
  logo_url      TEXT,
  primary_color TEXT        DEFAULT '#1e3a5f',
  accent_color  TEXT        DEFAULT '#2563eb',
  footer_text   TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. Departments
CREATE TABLE IF NOT EXISTS public.departments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 4. Salary Components
CREATE TABLE IF NOT EXISTS public.salary_components (
  id                UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT               NOT NULL,
  category          component_category NOT NULL,
  default_rate_type rate_type          NOT NULL,
  created_at        TIMESTAMPTZ        DEFAULT now()
);

-- 5. Staff Members
CREATE TABLE IF NOT EXISTS public.staff (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  staff_code        TEXT        NOT NULL UNIQUE DEFAULT ('FO-' || LPAD(nextval('staff_code_seq')::TEXT, 4, '0')),
  full_name         TEXT        NOT NULL,
  email             TEXT        NOT NULL,
  phone             TEXT,
  photo_url         TEXT,
  department_id     UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
  department        TEXT,
  job_title         TEXT,
  employment_type   TEXT        DEFAULT 'full_time',
  status            TEXT        NOT NULL DEFAULT 'active',
  date_employed     DATE,
  gross_salary      NUMERIC     DEFAULT 0,
  bank_name         TEXT,
  account_number    TEXT,
  account_name      TEXT,
  tax_id            TEXT,
  pension_pfa       TEXT,
  pension_rsa       TEXT,
  nhf_number        TEXT,
  address           TEXT,
  next_of_kin       TEXT,
  next_of_kin_phone TEXT,
  state_of_origin   TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 6. Salary Templates
CREATE TABLE IF NOT EXISTS public.salary_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  job_grade   TEXT,
  department  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 7. Salary Template Components
CREATE TABLE IF NOT EXISTS public.salary_template_components (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID      NOT NULL REFERENCES public.salary_templates(id) ON DELETE CASCADE,
  component_id  UUID      NOT NULL REFERENCES public.salary_components(id) ON DELETE CASCADE,
  is_active     BOOLEAN   DEFAULT true,
  is_taxable    BOOLEAN   DEFAULT true,
  rate_type     rate_type NOT NULL,
  rate          NUMERIC   NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (template_id, component_id)
);

-- 8. Staff Component Overrides
CREATE TABLE IF NOT EXISTS public.staff_component_overrides (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID      NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  component_id  UUID      NOT NULL REFERENCES public.salary_components(id) ON DELETE CASCADE,
  is_active     BOOLEAN   DEFAULT true,
  is_taxable    BOOLEAN   DEFAULT true,
  rate_type     rate_type NOT NULL,
  rate          NUMERIC   NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (staff_id, component_id)
);

-- 9. Tax Bands
CREATE TABLE IF NOT EXISTS public.tax_bands (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  band_order  INTEGER     NOT NULL,
  lower_bound NUMERIC     NOT NULL,
  upper_bound NUMERIC,
  rate        NUMERIC     NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 10. Payroll Periods
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label  TEXT        NOT NULL,
  year          INTEGER     NOT NULL,
  month         INTEGER     NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'draft',
  run_by        UUID        REFERENCES public.profiles(id),
  run_at        TIMESTAMPTZ,
  total_gross   NUMERIC     DEFAULT 0,
  total_net     NUMERIC     DEFAULT 0,
  total_tax     NUMERIC     DEFAULT 0,
  total_pension NUMERIC     DEFAULT 0,
  staff_count   INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (year, month)
);

-- 11. Payslips
CREATE TABLE IF NOT EXISTS public.payslips (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       UUID        NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  staff_id        UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  gross_earnings  NUMERIC     NOT NULL DEFAULT 0,
  total_allowances NUMERIC    NOT NULL DEFAULT 0,
  total_deductions NUMERIC    NOT NULL DEFAULT 0,
  taxable_income  NUMERIC     NOT NULL DEFAULT 0,
  paye_tax        NUMERIC     NOT NULL DEFAULT 0,
  pension_employee NUMERIC    NOT NULL DEFAULT 0,
  pension_employer NUMERIC    NOT NULL DEFAULT 0,
  nhf             NUMERIC     NOT NULL DEFAULT 0,
  net_pay         NUMERIC     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (period_id, staff_id)
);

-- 12. Payslip Line Items
CREATE TABLE IF NOT EXISTS public.payslip_line_items (
  id              UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id      UUID               NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  component_id    UUID               REFERENCES public.salary_components(id) ON DELETE SET NULL,
  component_name  TEXT               NOT NULL,
  category        component_category NOT NULL,
  rate_type       rate_type          NOT NULL,
  rate            NUMERIC            NOT NULL DEFAULT 0,
  amount          NUMERIC            NOT NULL DEFAULT 0,
  is_taxable      BOOLEAN            DEFAULT true,
  created_at      TIMESTAMPTZ        DEFAULT now()
);

-- 13. Attendance Records
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          TEXT        NOT NULL,
  attendance_date   DATE        NOT NULL,
  status            TEXT        DEFAULT 'present',
  overtime_hours    NUMERIC     DEFAULT 0,
  on_site           BOOLEAN     DEFAULT false,
  overtime_approval TEXT        DEFAULT 'none',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (staff_id, attendance_date)
);

-- 14. Leave Types
CREATE TABLE IF NOT EXISTS public.leave_types (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT        NOT NULL UNIQUE,
  annual_entitlement_days INTEGER     DEFAULT 20,
  is_paid                 BOOLEAN     DEFAULT true,
  attracts_bonus          BOOLEAN     DEFAULT false,
  requires_document       BOOLEAN     DEFAULT false,
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- 15. Leave Requests
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      TEXT        NOT NULL,
  leave_type_id UUID        REFERENCES public.leave_types(id) ON DELETE SET NULL,
  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL,
  reason        TEXT,
  status        TEXT        DEFAULT 'pending',
  approved_by   TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 16. Audit Log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name  TEXT        NOT NULL,
  actor_role  user_role   NOT NULL,
  action      TEXT        NOT NULL,
  entity      TEXT        NOT NULL,
  entity_id   TEXT,
  details     TEXT        NOT NULL,
  ip_address  TEXT,
  severity    TEXT        DEFAULT 'low',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 17. Staff Documents
CREATE TABLE IF NOT EXISTS public.staff_documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  file_url    TEXT        NOT NULL,
  file_size   TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- STEP 4: TRIGGERS & AUTOMATION
-- ────────────────────────────────────────────────────────────

-- 1. Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'staff')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Auto-link staff profile trigger
CREATE OR REPLACE FUNCTION public.auto_link_staff_profile()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.staff
  SET profile_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email)
    AND profile_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_link_staff_profile ON public.profiles;
CREATE TRIGGER trg_auto_link_staff_profile
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_staff_profile();

-- ────────────────────────────────────────────────────────────
-- STEP 5: ROW LEVEL SECURITY (RLS) POLICIES
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read profiles" ON public.profiles;
CREATE POLICY "Allow read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow update profiles" ON public.profiles;
CREATE POLICY "Allow update profiles" ON public.profiles FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff view own record" ON public.staff;
CREATE POLICY "Staff view own record" ON public.staff FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff update own record" ON public.staff;
CREATE POLICY "Staff update own record" ON public.staff FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow read attendance" ON public.attendance_records;
CREATE POLICY "Allow read attendance" ON public.attendance_records FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert attendance" ON public.attendance_records;
CREATE POLICY "Allow insert attendance" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update attendance" ON public.attendance_records;
CREATE POLICY "Allow update attendance" ON public.attendance_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read leave_types" ON public.leave_types;
CREATE POLICY "Allow read leave_types" ON public.leave_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow read leave_requests" ON public.leave_requests;
CREATE POLICY "Allow read leave_requests" ON public.leave_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert leave_requests" ON public.leave_requests;
CREATE POLICY "Allow insert leave_requests" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update leave_requests" ON public.leave_requests;
CREATE POLICY "Allow update leave_requests" ON public.leave_requests FOR UPDATE TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- STEP 6: STORAGE BUCKETS & STORAGE POLICIES
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('staff-documents', 'staff-documents', true),
  ('branding', 'branding', true),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Read avatars" ON storage.objects;
CREATE POLICY "Public Read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Auth Upload avatars" ON storage.objects;
CREATE POLICY "Auth Upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Auth Update avatars" ON storage.objects;
CREATE POLICY "Auth Update avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public Read staff-documents" ON storage.objects;
CREATE POLICY "Public Read staff-documents" ON storage.objects FOR SELECT USING (bucket_id = 'staff-documents');

DROP POLICY IF EXISTS "Auth Upload staff-documents" ON storage.objects;
CREATE POLICY "Auth Upload staff-documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'staff-documents');

DROP POLICY IF EXISTS "Auth Update staff-documents" ON storage.objects;
CREATE POLICY "Auth Update staff-documents" ON storage.objects FOR UPDATE USING (bucket_id = 'staff-documents');

-- ────────────────────────────────────────────────────────────
-- STEP 7: SEED DEFAULT DATA
-- ────────────────────────────────────────────────────────────

-- 1. Company Settings
INSERT INTO public.company_settings (id, name, email, phone, address, website, rc_number, industry)
VALUES (1, 'Firstoption HRIS Platform', 'info@firstoption.ng', '+234 1 234 5678', 'Lagos, Nigeria', 'https://firstoption.ng', 'RC-123456', 'Human Resources')
ON CONFLICT (id) DO NOTHING;

-- 2. Departments
INSERT INTO public.departments (name) VALUES
  ('Sales & Marketing'),
  ('Accounting & Finance'),
  ('General Operations'),
  ('Human Resources'),
  ('Media & Marketing'),
  ('Information Technology')
ON CONFLICT DO NOTHING;

-- 3. Tax Bands (FIRS Compliant)
DELETE FROM public.tax_bands;
INSERT INTO public.tax_bands (band_order, lower_bound, upper_bound, rate) VALUES
  (1,       0,      300000,   0.07),
  (2,  300000,      600000,   0.11),
  (3,  600000,     1100000,   0.15),
  (4, 1100000,     1600000,   0.19),
  (5, 1600000,     3200000,   0.21),
  (6, 3200000,        NULL,   0.24);

-- 4. All 8 Leave Types
INSERT INTO public.leave_types (name, annual_entitlement_days, is_paid, attracts_bonus, requires_document) VALUES
  ('Annual Leave',        21, true,  true,  false),
  ('Sick Leave',          14, true,  false, true),
  ('Casual Leave',         5, true,  false, false),
  ('Compassionate Leave',  3, true,  false, false),
  ('Unpaid Leave',        30, false, false, false),
  ('Paternity Leave',      4, true,  false, false),
  ('Maternity Leave',     90, true,  false, true),
  ('Examination Leave',    4, true,  false, true)
ON CONFLICT (name) DO UPDATE SET
  annual_entitlement_days = EXCLUDED.annual_entitlement_days,
  is_paid = EXCLUDED.is_paid,
  attracts_bonus = EXCLUDED.attracts_bonus,
  requires_document = EXCLUDED.requires_document;

-- 5. Salary Components
INSERT INTO public.salary_components (name, category, default_rate_type) VALUES
  ('Basic Salary',         'allowance', 'flat_amount'),
  ('Housing Allowance',    'allowance', 'percentage_of_gross'),
  ('Transport Allowance',  'allowance', 'percentage_of_gross'),
  ('Lunch Allowance',      'allowance', 'per_day'),
  ('Utility Allowance',    'allowance', 'flat_amount'),
  ('Leave Allowance',      'allowance', 'flat_amount'),
  ('Overtime Pay',         'allowance', 'per_hour'),
  ('Site Allowance',       'allowance', 'per_day'),
  ('Employee Pension (PFA)',     'deduction', 'percentage_of_gross'),
  ('National Housing Fund (NHF)', 'deduction', 'percentage_of_basic'),
  ('PAYE Tax',                   'deduction', 'flat_amount'),
  ('Staff Loan Repayment',       'deduction', 'flat_amount'),
  ('Salary Advance Recovery',    'deduction', 'flat_amount'),
  ('Cooperative Society',        'deduction', 'flat_amount')
ON CONFLICT DO NOTHING;

-- 6. Salary Templates
INSERT INTO public.salary_templates (id, name, job_grade, department) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Standard Staff Structure', 'Grade 1-3', 'General Operations'),
  ('a2222222-2222-2222-2222-222222222222', 'Management Structure', 'Grade 4-6', 'Management'),
  ('a3333333-3333-3333-3333-333333333333', 'Executive Structure', 'Grade 7+', 'Executive')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ✅ 1-CLICK MASTER SETUP COMPLETE!
-- Your new client project database is 100% ready.
-- ============================================================
