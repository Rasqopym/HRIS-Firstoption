-- ============================================================
-- HRIS-Firstoption — Seed Defaults Script
-- ============================================================
-- HOW TO USE:
-- 1. Run setup.sql FIRST (creates the empty tables)
-- 2. Then paste this entire file into SQL Editor
-- 3. Click Run
-- 4. Your database has starting data ✅
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. NIGERIAN PAYE TAX BANDS
--    Source: FIRS Personal Income Tax Act (as amended)
--    Rates stored as decimals (0.07 = 7%, 0.24 = 24%)
-- ────────────────────────────────────────────────────────────

DELETE FROM public.tax_bands;

INSERT INTO public.tax_bands (band_order, lower_bound, upper_bound, rate) VALUES
  (1,       0,      300000,   0.07),
  (2,  300000,      600000,   0.11),
  (3,  600000,     1100000,   0.15),
  (4, 1100000,     1600000,   0.19),
  (5, 1600000,     3200000,   0.21),
  (6, 3200000,        NULL,   0.24);


-- ────────────────────────────────────────────────────────────
-- 2. LEAVE TYPES
--    Standard types used by most Nigerian companies
-- ────────────────────────────────────────────────────────────

DELETE FROM public.leave_types;

INSERT INTO public.leave_types
  (name, annual_entitlement_days, is_paid, requires_document)
VALUES
  ('Annual Leave',        21,  true,  false),
  ('Sick Leave',          14,  true,  true),
  ('Maternity Leave',     84,  true,  true),
  ('Paternity Leave',      3,  true,  false),
  ('Casual Leave',         5,  true,  false),
  ('Examination Leave',    5,  true,  true),
  ('Compassionate Leave',  3,  true,  false),
  ('Unpaid Leave',        30,  false, false);


-- ────────────────────────────────────────────────────────────
-- 3. SALARY COMPONENTS
-- ────────────────────────────────────────────────────────────

DELETE FROM public.salary_components;

-- ── ALLOWANCES ───────────────────────────────────────────

INSERT INTO public.salary_components
  (name, category, default_rate_type)
VALUES
  ('Basic Salary',         'allowance', 'flat_amount'),
  ('Housing Allowance',    'allowance', 'percentage_of_gross'),
  ('Transport Allowance',  'allowance', 'percentage_of_gross'),
  ('Lunch Allowance',      'allowance', 'per_day'),
  ('Utility Allowance',    'allowance', 'flat_amount'),
  ('Leave Allowance',      'allowance', 'flat_amount'),
  ('Overtime Pay',         'allowance', 'per_hour'),
  ('Site Allowance',       'allowance', 'per_day');


-- ── DEDUCTIONS ───────────────────────────────────────────

INSERT INTO public.salary_components
  (name, category, default_rate_type)
VALUES
  ('Employee Pension (PFA)',     'deduction', 'percentage_of_gross'),
  ('National Housing Fund (NHF)', 'deduction', 'percentage_of_basic'),
  ('PAYE Tax',                   'deduction', 'flat_amount'),
  ('Staff Loan Repayment',       'deduction', 'flat_amount'),
  ('Salary Advance Recovery',    'deduction', 'flat_amount'),
  ('Cooperative Society',        'deduction', 'flat_amount');


-- ────────────────────────────────────────────────────────────
-- 4. SALARY TEMPLATES & TEMPLATE COMPONENTS
-- ────────────────────────────────────────────────────────────

DELETE FROM public.salary_templates;

INSERT INTO public.salary_templates (id, name, job_grade, department)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Standard Staff Structure', 'Grade 1-3', 'General'),
  ('a2222222-2222-2222-2222-222222222222', 'Management Structure', 'Grade 4-6', 'Management'),
  ('a3333333-3333-3333-3333-333333333333', 'Executive Structure', 'Grade 7+', 'Executive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.salary_template_components (template_id, component_id, is_active, is_taxable, rate_type, rate)
SELECT 
  t.id AS template_id,
  sc.id AS component_id,
  true AS is_active,
  true AS is_taxable,
  sc.default_rate_type AS rate_type,
  CASE 
    WHEN sc.name = 'Basic Salary' THEN 50
    WHEN sc.name = 'Housing Allowance' THEN 20
    WHEN sc.name = 'Transport Allowance' THEN 10
    WHEN sc.name LIKE '%Pension%' THEN 8
    ELSE 0
  END AS rate
FROM public.salary_templates t
CROSS JOIN public.salary_components sc
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 5. COMPANY SETTINGS (placeholder)
-- ────────────────────────────────────────────────────────────

INSERT INTO public.company_settings
  (id, name, email, phone, address, primary_color, accent_color)
VALUES
  (1,
   'Your Company Name',
   'hr@yourcompany.com',
   '+234 000 000 0000',
   'Company Address, City, Nigeria',
   '#1e3a5f',
   '#2563eb')
ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- ✅ SEED COMPLETE
-- ────────────────────────────────────────────────────────────
