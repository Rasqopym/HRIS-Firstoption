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
--    These are ANNUAL taxable income bands
--    Your payroll engine annualises monthly income,
--    applies these bands, then divides by 12
-- ────────────────────────────────────────────────────────────

-- Clear any existing bands first (safe to re-run)
DELETE FROM public.tax_bands;

INSERT INTO public.tax_bands (band_order, lower_bound, upper_bound, rate) VALUES
  (1,       0,      300000,   7),
  (2,  300000,      600000,  11),
  (3,  600000,     1100000,  15),
  (4, 1100000,     1600000,  19),
  (5, 1600000,     3200000,  21),
  (6, 3200000,        NULL,  24);

-- What this means in plain English:
-- First ₦300,000 of annual taxable income  → 7% tax
-- Next  ₦300,000 (up to ₦600,000)          → 11% tax
-- Next  ₦500,000 (up to ₦1,100,000)        → 15% tax
-- Next  ₦500,000 (up to ₦1,600,000)        → 19% tax
-- Next  ₦1,600,000 (up to ₦3,200,000)      → 21% tax
-- Everything above ₦3,200,000              → 24% tax
--
-- Super Admin can update these via the Tax Bands page
-- if FIRS announces new rates — no code change needed.


-- ────────────────────────────────────────────────────────────
-- 2. LEAVE TYPES
--    Standard types used by most Nigerian companies
--    HR can add more types via the Leave Management page
-- ────────────────────────────────────────────────────────────

-- Clear existing (safe to re-run)
DELETE FROM public.leave_types;

INSERT INTO public.leave_types
  (name, annual_entitlement_days, is_paid, requires_document)
VALUES
  -- Nigerian Labour Act minimum is 6 working days.
  -- 21 days is the common private sector standard.
  ('Annual Leave',        21,  true,  false),

  -- Medical certificate required
  ('Sick Leave',          14,  true,  true),

  -- 12 weeks (84 days) — Nigerian Labour Act Section 54
  ('Maternity Leave',     84,  true,  true),

  -- Not legally required but increasingly offered
  ('Paternity Leave',      3,  true,  false),

  -- Short notice, personal reasons (e.g. moving house, family visit)
  ('Casual Leave',         5,  true,  false),

  -- For staff sitting ICAN, CIPM, ICAN, ACCA etc.
  ('Examination Leave',    5,  true,  true),

  -- Bereavement or urgent family emergency
  ('Compassionate Leave',  3,  true,  false),

  -- Extended absence without salary (e.g. personal sabbatical)
  ('Unpaid Leave',        30,  false, false);


-- ────────────────────────────────────────────────────────────
-- 3. SALARY COMPONENTS
--    These are the building blocks of every payslip.
--    Super Admin assigns them to individual staff
--    via the Salary Structure page.
-- ────────────────────────────────────────────────────────────

-- Clear existing (safe to re-run)
DELETE FROM public.salary_components;

-- ── ALLOWANCES (add to take-home pay) ─────────────────────

INSERT INTO public.salary_components
  (name, category, default_rate_type)
VALUES

  -- The fixed base pay. Usually 40-60% of total gross.
  -- Set as a flat naira amount per staff.
  ('Basic Salary',         'allowance', 'flat_amount'),

  -- Typically 10-20% of gross salary.
  -- Some companies use flat amount instead.
  ('Housing Allowance',    'allowance', 'percentage_of_gross'),

  -- Typically 5-10% of gross salary.
  ('Transport Allowance',  'allowance', 'percentage_of_gross'),

  -- Fixed monthly amount for meals/feeding.
  ('Meal Allowance',       'allowance', 'flat_amount'),

  -- Contribution toward electricity, water, internet.
  ('Utility Allowance',    'allowance', 'flat_amount'),

  -- Usually paid once a year when staff goes on annual leave.
  -- Often 10% of annual basic salary.
  ('Leave Allowance',      'allowance', 'flat_amount'),

  -- Calculated as: hourly rate × approved overtime hours.
  -- Overtime hours are entered in Attendance module.
  ('Overtime Pay',         'allowance', 'per_hour'),

  -- For companies with field/construction staff.
  -- Rate × number of days physically on site.
  -- Disabled for most office-based companies.
  ('Site Allowance',       'allowance', 'per_day');


-- ── DEDUCTIONS (reduce take-home pay) ─────────────────────

INSERT INTO public.salary_components
  (name, category, default_rate_type)
VALUES

  -- MANDATORY: Contributory Pension Scheme.
  -- Employee contributes 8% of (Basic + Housing + Transport).
  -- Use percentage_of_gross as an approximation,
  -- or set as flat amount per staff for exact control.
  ('Employee Pension (PFA)',     'deduction', 'percentage_of_gross'),

  -- National Housing Fund.
  -- 2.5% of basic salary.
  -- Mandatory for public sector, common in private sector.
  ('National Housing Fund (NHF)', 'deduction', 'percentage_of_basic'),

  -- PAYE Tax — DO NOT set a rate here.
  -- The payroll engine calculates this automatically
  -- using the PAYE tax bands above.
  -- This row exists so it appears on the payslip breakdown.
  ('PAYE Tax',                   'deduction', 'flat_amount'),

  -- Monthly repayment for approved staff loans.
  -- Set the flat naira amount per staff when a loan exists.
  ('Staff Loan Repayment',       'deduction', 'flat_amount'),

  -- Recovery of salary advance paid outside normal cycle.
  ('Salary Advance Recovery',    'deduction', 'flat_amount'),

  -- Monthly contribution to staff cooperative society.
  ('Cooperative Society',        'deduction', 'flat_amount');


-- ────────────────────────────────────────────────────────────
-- 4. COMPANY SETTINGS (placeholder)
--    Super Admin fills in the real details via
--    System Settings page after first login.
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
-- The ON CONFLICT means: if a row already exists, skip it.
-- So this is safe to run even if company settings exist.


-- ────────────────────────────────────────────────────────────
-- ✅ SEED COMPLETE
--
-- What's now in your database:
--   ✓ 6 PAYE tax bands (FIRS 2024/2025 rates)
--   ✓ 8 leave types (Annual, Sick, Maternity, etc.)
--   ✓ 8 salary allowances (Basic, Housing, Transport, etc.)
--   ✓ 6 salary deductions (Pension, NHF, PAYE, etc.)
--   ✓ 1 placeholder company settings row
--
-- Next steps:
--   1. Log in as Super Admin
--   2. Go to System Settings → fill in company name + logo
--   3. Go to Salary Defaults → review and activate components
--   4. Go to Tax Bands → confirm bands are correct
--   5. Create your departments
--   6. Start adding staff ✅
-- ────────────────────────────────────────────────────────────
