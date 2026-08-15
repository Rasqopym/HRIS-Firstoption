-- ============================================================
-- HRIS-Firstoption — Full Database Setup Script
-- ============================================================
-- HOW TO USE:
-- 1. Open a brand new Supabase project
-- 2. Go to SQL Editor
-- 3. Paste this entire file
-- 4. Click Run
-- 5. Your database is ready ✅
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- STEP 1: ENUM TYPES
-- (Special column types used across multiple tables)
-- ────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'super_admin',
  'hr',
  'accountant',
  'auditor',
  'staff'
);

CREATE TYPE rate_type AS ENUM (
  'flat_amount',
  'percentage_of_gross',
  'percentage_of_basic',
  'per_day',
  'per_hour',
  'manual_monthly'
);

CREATE TYPE component_category AS ENUM (
  'allowance',
  'deduction'
);


-- ────────────────────────────────────────────────────────────
-- STEP 2: SEQUENCE
-- (Auto-generates staff codes like FO-0001, FO-0002, etc.)
-- ────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS staff_code_seq START 1;


-- ────────────────────────────────────────────────────────────
-- STEP 3: TABLES
-- (Created in dependency order — referenced tables first)
-- ────────────────────────────────────────────────────────────

-- 1. Profiles (linked to Supabase Auth users)
CREATE TABLE public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'staff',
  status        TEXT        NOT NULL DEFAULT 'active',
  email         TEXT,
  phone         TEXT,
  photo_url     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);


-- 2. Company Settings (one row per company)
CREATE TABLE public.company_settings (
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
CREATE TABLE public.departments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- 4. Salary Components (global definitions)
CREATE TABLE public.salary_components (
  id                UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT               NOT NULL,
  category          component_category NOT NULL,
  default_rate_type rate_type          NOT NULL,
  created_at        TIMESTAMPTZ        DEFAULT now()
);


-- 5. Salary Templates
CREATE TABLE public.salary_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  job_grade   TEXT,
  department  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- 6. Salary Template Components (links templates to components)
CREATE TABLE public.salary_template_components (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID      NOT NULL REFERENCES public.salary_templates(id) ON DELETE CASCADE,
  component_id UUID      NOT NULL REFERENCES public.salary_components(id) ON DELETE CASCADE,
  is_active    BOOLEAN   NOT NULL DEFAULT false,
  is_taxable   BOOLEAN   NOT NULL DEFAULT false,
  rate_type    rate_type NOT NULL,
  rate         NUMERIC   NOT NULL DEFAULT 0
);


-- 7. Tax Bands (Nigerian PAYE progressive brackets)
CREATE TABLE public.tax_bands (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  band_order  INTEGER     NOT NULL,
  lower_bound NUMERIC     NOT NULL,
  upper_bound NUMERIC,
  rate        NUMERIC     NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- 8. Leave Types
CREATE TABLE public.leave_types (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT    NOT NULL,
  annual_entitlement_days INTEGER DEFAULT 0,
  is_paid                 BOOLEAN DEFAULT true,
  requires_document       BOOLEAN NOT NULL DEFAULT false
);


-- 9. Staff (Employee master records)
CREATE TABLE public.staff (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           UUID        REFERENCES auth.users(id),
  staff_code           TEXT        NOT NULL DEFAULT ('FO-' || lpad(nextval('staff_code_seq')::text, 4, '0')),
  full_name            TEXT        NOT NULL,
  department_id        UUID        REFERENCES public.departments(id),
  date_employed        DATE,
  email                TEXT,
  phone                TEXT,
  photo_url            TEXT,
  gross_salary         NUMERIC,
  address              TEXT,
  state                TEXT,
  next_of_kin          TEXT,
  next_of_kin_phone    TEXT,
  dob                  DATE,
  gender               TEXT,
  bank_name            TEXT,
  account_number       TEXT,
  account_name         TEXT,
  employment_type      TEXT,
  status               TEXT        NOT NULL DEFAULT 'active',
  id_card_issued_at    DATE,
  id_card_expires_at   DATE,
  id_verification_code TEXT        DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  created_at           TIMESTAMPTZ DEFAULT now()
);


-- 10. Staff Salary Components (per-staff component assignments)
CREATE TABLE public.staff_salary_components (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  component_id UUID        NOT NULL REFERENCES public.salary_components(id) ON DELETE CASCADE,
  is_active    BOOLEAN     NOT NULL DEFAULT false,
  is_taxable   BOOLEAN     NOT NULL DEFAULT false,
  rate         NUMERIC     NOT NULL DEFAULT 0,
  rate_type    rate_type   NOT NULL DEFAULT 'flat_amount',
  created_at   TIMESTAMPTZ DEFAULT now()
);


-- 11. Staff Tax Reliefs
CREATE TABLE public.staff_tax_reliefs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id              UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  annual_rent_paid      NUMERIC     DEFAULT 0,
  life_assurance_premium NUMERIC    DEFAULT 0,
  updated_at            TIMESTAMPTZ DEFAULT now()
);


-- 12. Staff Documents
CREATE TABLE public.staff_documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  file_name   TEXT        NOT NULL,
  file_path   TEXT        NOT NULL,
  file_type   TEXT,
  file_size_kb INTEGER,
  status      TEXT        NOT NULL DEFAULT 'active',
  uploaded_by UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- 13. Payroll Periods
CREATE TABLE public.payroll_periods (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label TEXT        NOT NULL,
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'open',
  created_at   TIMESTAMPTZ DEFAULT now()
);


-- 14. Payslips
CREATE TABLE public.payslips (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id         UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  period_id        UUID        NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  gross_earnings   NUMERIC     NOT NULL DEFAULT 0,
  taxable_income   NUMERIC     NOT NULL DEFAULT 0,
  paye_tax         NUMERIC     NOT NULL DEFAULT 0,
  total_deductions NUMERIC     NOT NULL DEFAULT 0,
  net_pay          NUMERIC     NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT now()
);


-- 15. Payslip Line Items (individual earnings/deduction rows)
CREATE TABLE public.payslip_line_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id   UUID        NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  component_id UUID        NOT NULL REFERENCES public.salary_components(id),
  quantity     NUMERIC,
  rate_applied NUMERIC,
  amount       NUMERIC     NOT NULL,
  was_taxable  BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);


-- 16. Attendance Records
CREATE TABLE public.attendance_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  attendance_date   DATE        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'present',
  overtime_hours    NUMERIC     DEFAULT 0,
  on_site           BOOLEAN     DEFAULT false,
  overtime_approval TEXT        NOT NULL DEFAULT 'none',
  created_at        TIMESTAMPTZ DEFAULT now()
);


-- 17. Leave Requests
CREATE TABLE public.leave_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id UUID        NOT NULL REFERENCES public.leave_types(id),
  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL,
  reason        TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending',
  approved_by   UUID        REFERENCES auth.users(id),
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);


-- 18. Audit Log
CREATE TABLE public.audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID,
  actor_name TEXT,
  actor_role TEXT,
  action     TEXT        NOT NULL,
  entity     TEXT        NOT NULL,
  entity_id  TEXT,
  details    TEXT,
  severity   TEXT        NOT NULL DEFAULT 'low',
  flagged    BOOLEAN     NOT NULL DEFAULT false,
  flag_note  TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- 19. Audit Flags
CREATE TABLE public.audit_flags (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_log_id   UUID        NOT NULL REFERENCES public.audit_log(id) ON DELETE CASCADE,
  flagged_by     UUID,
  flagged_by_name TEXT       NOT NULL,
  comment        TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'open',
  resolved_by    UUID,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);


-- 20. Tax Remittances
CREATE TABLE public.tax_remittances (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id     UUID        NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  tax_type      TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending',
  remitted_date TIMESTAMPTZ,
  remitted_by   UUID        REFERENCES auth.users(id),
  amount        NUMERIC     NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- STEP 4: VIEW
-- (Safe public view for QR code verification page)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.staff_verification_public AS
  SELECT
    s.id,
    s.full_name,
    s.staff_code,
    s.photo_url,
    s.status,
    s.date_employed,
    s.id_verification_code,
    d.name        AS department_name,
    cs.name       AS company_name,
    cs.logo_url   AS company_logo_url,
    cs.primary_color,
    cs.accent_color
  FROM public.staff s
  LEFT JOIN public.departments d ON s.department_id = d.id
  CROSS JOIN public.company_settings cs;

-- Allow public (unauthenticated) access to the verification view
GRANT SELECT ON public.staff_verification_public TO anon;


-- ────────────────────────────────────────────────────────────
-- STEP 5: ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- (This locks down your data — no one can access it
--  unless a policy below explicitly allows them)
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_components         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_template_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_bands                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_salary_components   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_tax_reliefs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslip_line_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_flags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_remittances           ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- STEP 6: HELPER FUNCTION
-- (Used by RLS policies to check the logged-in user's role)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ────────────────────────────────────────────────────────────
-- STEP 7: RLS POLICIES
-- (Who is allowed to read/write which tables)
-- ────────────────────────────────────────────────────────────

-- ── PROFILES ──────────────────────────────────────────────

CREATE POLICY "Own profile: read" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Own profile: update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Super admin: manage all profiles" ON public.profiles
  FOR ALL USING (get_my_role() = 'super_admin');

CREATE POLICY "HR, accountant, auditor: read profiles" ON public.profiles
  FOR SELECT USING (get_my_role() IN ('hr', 'accountant', 'auditor'));


-- ── COMPANY SETTINGS ──────────────────────────────────────

CREATE POLICY "Public: read company settings" ON public.company_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Super admin: manage company settings" ON public.company_settings
  FOR ALL USING (get_my_role() = 'super_admin');


-- ── DEPARTMENTS ───────────────────────────────────────────

CREATE POLICY "Authenticated: read departments" ON public.departments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin + HR: manage departments" ON public.departments
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));


-- ── SALARY COMPONENTS ─────────────────────────────────────

CREATE POLICY "Authenticated: read salary components" ON public.salary_components
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin: manage salary components" ON public.salary_components
  FOR ALL USING (get_my_role() = 'super_admin');


-- ── SALARY TEMPLATES ──────────────────────────────────────

CREATE POLICY "Authenticated: read salary templates" ON public.salary_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin: manage salary templates" ON public.salary_templates
  FOR ALL USING (get_my_role() = 'super_admin');


-- ── SALARY TEMPLATE COMPONENTS ────────────────────────────

CREATE POLICY "Authenticated: read template components" ON public.salary_template_components
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin: manage template components" ON public.salary_template_components
  FOR ALL USING (get_my_role() = 'super_admin');


-- ── TAX BANDS ─────────────────────────────────────────────

CREATE POLICY "Authenticated: read tax bands" ON public.tax_bands
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin: manage tax bands" ON public.tax_bands
  FOR ALL USING (get_my_role() = 'super_admin');


-- ── LEAVE TYPES ───────────────────────────────────────────

CREATE POLICY "Authenticated: read leave types" ON public.leave_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR + super admin: manage leave types" ON public.leave_types
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));


-- ── STAFF ─────────────────────────────────────────────────

CREATE POLICY "HR + super admin: manage all staff" ON public.staff
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Accountant + auditor: read all staff" ON public.staff
  FOR SELECT USING (get_my_role() IN ('accountant', 'auditor'));

CREATE POLICY "Staff: read own record" ON public.staff
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Staff: update own record" ON public.staff
  FOR UPDATE USING (profile_id = auth.uid());


-- ── STAFF SALARY COMPONENTS ───────────────────────────────

CREATE POLICY "Super admin + HR: manage staff salary components" ON public.staff_salary_components
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Accountant: read staff salary components" ON public.staff_salary_components
  FOR SELECT USING (get_my_role() IN ('accountant', 'auditor'));


-- ── STAFF TAX RELIEFS ─────────────────────────────────────

CREATE POLICY "HR + super admin: manage tax reliefs" ON public.staff_tax_reliefs
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Accountant + auditor: read tax reliefs" ON public.staff_tax_reliefs
  FOR SELECT USING (get_my_role() IN ('accountant', 'auditor'));


-- ── STAFF DOCUMENTS ───────────────────────────────────────

CREATE POLICY "HR + super admin: manage staff documents" ON public.staff_documents
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Staff: read own documents" ON public.staff_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = staff_documents.staff_id
      AND profile_id = auth.uid()
    )
  );


-- ── PAYROLL PERIODS ───────────────────────────────────────

CREATE POLICY "Accountant + super admin: manage payroll periods" ON public.payroll_periods
  FOR ALL USING (get_my_role() IN ('super_admin', 'accountant'));

CREATE POLICY "HR + auditor: read payroll periods" ON public.payroll_periods
  FOR SELECT USING (get_my_role() IN ('hr', 'auditor'));


-- ── PAYSLIPS ──────────────────────────────────────────────

CREATE POLICY "Accountant + super admin: manage payslips" ON public.payslips
  FOR ALL USING (get_my_role() IN ('super_admin', 'accountant'));

CREATE POLICY "Auditor: read payslips" ON public.payslips
  FOR SELECT USING (get_my_role() = 'auditor');

CREATE POLICY "Staff: read own payslips" ON public.payslips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = payslips.staff_id
      AND profile_id = auth.uid()
    )
  );


-- ── PAYSLIP LINE ITEMS ────────────────────────────────────

CREATE POLICY "Accountant + super admin: manage line items" ON public.payslip_line_items
  FOR ALL USING (get_my_role() IN ('super_admin', 'accountant'));

CREATE POLICY "Auditor: read line items" ON public.payslip_line_items
  FOR SELECT USING (get_my_role() = 'auditor');

CREATE POLICY "Staff: read own payslip line items" ON public.payslip_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payslips ps
      JOIN public.staff s ON ps.staff_id = s.id
      WHERE ps.id = payslip_line_items.payslip_id
      AND s.profile_id = auth.uid()
    )
  );


-- ── ATTENDANCE RECORDS ────────────────────────────────────

CREATE POLICY "HR + super admin: manage attendance" ON public.attendance_records
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Accountant + auditor: read attendance" ON public.attendance_records
  FOR SELECT USING (get_my_role() IN ('accountant', 'auditor'));

CREATE POLICY "Staff: read own attendance" ON public.attendance_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = attendance_records.staff_id
      AND profile_id = auth.uid()
    )
  );


-- ── LEAVE REQUESTS ────────────────────────────────────────

CREATE POLICY "HR + super admin: manage leave requests" ON public.leave_requests
  FOR ALL USING (get_my_role() IN ('super_admin', 'hr'));

CREATE POLICY "Auditor: read leave requests" ON public.leave_requests
  FOR SELECT USING (get_my_role() = 'auditor');

CREATE POLICY "Staff: read own leave requests" ON public.leave_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = leave_requests.staff_id
      AND profile_id = auth.uid()
    )
  );

CREATE POLICY "Staff: insert own leave requests" ON public.leave_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = leave_requests.staff_id
      AND profile_id = auth.uid()
    )
  );


-- ── AUDIT LOG ─────────────────────────────────────────────

CREATE POLICY "Auditor + super admin: read all audit log" ON public.audit_log
  FOR SELECT USING (get_my_role() IN ('super_admin', 'auditor', 'hr'));

CREATE POLICY "System: insert audit log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Staff: read own audit entries" ON public.audit_log
  FOR SELECT USING (actor_id = auth.uid());


-- ── AUDIT FLAGS ───────────────────────────────────────────

CREATE POLICY "Auditor + super admin: manage audit flags" ON public.audit_flags
  FOR ALL USING (get_my_role() IN ('super_admin', 'auditor'));

CREATE POLICY "HR: read audit flags" ON public.audit_flags
  FOR SELECT USING (get_my_role() = 'hr');


-- ── TAX REMITTANCES ───────────────────────────────────────

CREATE POLICY "Accountant + super admin: manage remittances" ON public.tax_remittances
  FOR ALL USING (get_my_role() IN ('super_admin', 'accountant'));

CREATE POLICY "Auditor: read remittances" ON public.tax_remittances
  FOR SELECT USING (get_my_role() = 'auditor');


-- ────────────────────────────────────────────────────────────
-- STEP 8: TRIGGER — Auto-create profile on user signup
-- (When a new user is created in Supabase Auth,
--  this automatically creates their profile row)
-- ────────────────────────────────────────────────────────────

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

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-link staff profile trigger
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
-- STORAGE BUCKETS & POLICIES SETUP
-- Creates all 3 storage buckets required by HRIS:
-- 1. staff-documents (Resume, Certificates, ID Copies, Offer Letters)
-- 2. branding (Company Logo)
-- 3. avatars (Staff Profile Photos)
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('staff-documents', 'staff-documents', true),
  ('branding', 'branding', true),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies for 'staff-documents'
DROP POLICY IF EXISTS "Public Read: staff-documents" ON storage.objects;
CREATE POLICY "Public Read: staff-documents" ON storage.objects FOR SELECT USING (bucket_id = 'staff-documents');

DROP POLICY IF EXISTS "Authenticated Upload: staff-documents" ON storage.objects;
CREATE POLICY "Authenticated Upload: staff-documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'staff-documents');

DROP POLICY IF EXISTS "Authenticated Update: staff-documents" ON storage.objects;
CREATE POLICY "Authenticated Update: staff-documents" ON storage.objects FOR UPDATE USING (bucket_id = 'staff-documents');

DROP POLICY IF EXISTS "Authenticated Delete: staff-documents" ON storage.objects;
CREATE POLICY "Authenticated Delete: staff-documents" ON storage.objects FOR DELETE USING (bucket_id = 'staff-documents');

-- Storage Policies for 'branding'
DROP POLICY IF EXISTS "Public Read: branding" ON storage.objects;
CREATE POLICY "Public Read: branding" ON storage.objects FOR SELECT USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Authenticated Upload: branding" ON storage.objects;
CREATE POLICY "Authenticated Upload: branding" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'branding');

DROP POLICY IF EXISTS "Authenticated Update: branding" ON storage.objects;
CREATE POLICY "Authenticated Update: branding" ON storage.objects FOR UPDATE USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Authenticated Delete: branding" ON storage.objects;
CREATE POLICY "Authenticated Delete: branding" ON storage.objects FOR DELETE USING (bucket_id = 'branding');

-- Storage Policies for 'avatars'
DROP POLICY IF EXISTS "Public Read: avatars" ON storage.objects;
CREATE POLICY "Public Read: avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Upload: avatars" ON storage.objects;
CREATE POLICY "Authenticated Upload: avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Update: avatars" ON storage.objects;
CREATE POLICY "Authenticated Update: avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Delete: avatars" ON storage.objects;
CREATE POLICY "Authenticated Delete: avatars" ON storage.objects FOR DELETE USING (bucket_id = 'avatars');


-- ────────────────────────────────────────────────────────────
-- ✅ SETUP COMPLETE
-- ────────────────────────────────────────────────────────────
