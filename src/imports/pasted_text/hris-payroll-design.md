Now extend Firstoption HRIS with three connected areas: a per-staff configurable
salary structure engine, attendance & leave management, and a tax/remittance
module. These three feed each other — attendance drives how much of each
allowance a staff earns that month, and the salary structure config determines
which components exist, whether each is taxable, and what rate applies, per
staff. Design these as clearly connected in the UI (e.g. show a small "based on
attendance" tag next to computed line items on a payslip).

A. SALARY STRUCTURE CONFIGURATION (Super Admin only — new screen)
Design a per-staff "Salary Structure" tab/screen (reachable from each Staff
Profile) with a table/list of every pay component:
  Duty Allowance, Overtime Allowance, Site Allowance, Performance Allowance,
  Commission, Lunch Allowance, Leave Allowance, Basic Salary, Housing
  Allowance, Transport Allowance.
Overtime Allowance and Site Allowance are separate components with separate
attendance sources — do not merge them:
  - Overtime Allowance = rate × Overtime Hours logged that month (hours
    worked beyond normal shift, any location).
  - Site Allowance = rate × number of days that month the staff worked on a
    project site (a day-based count, not hours) — this applies to staff
    deployed to site, independent of whether they also worked overtime that
    day.
For EACH component, per staff, Super Admin needs three independent controls
in the same row:
  1. Active toggle — is this component part of this staff's package at all
     (on/off switch).
  2. Taxable toggle — should this component be included in this staff's PAYE
     taxable income (on/off switch, independent of #1).
  3. Rate/Amount field — a flexible input that can represent either a flat
     naira amount, a percentage of gross/basic, or a unit rate (e.g. "₦/hour"
     for overtime, "₦/day" for lunch) — show a small dropdown next to the
     amount field to pick which type of rate this is.
Also include the deduction components in the same style of table, each with
just an Active toggle and a Rate field (deductions are not "taxable" the same
way, so skip that toggle for these):
  Pension (Employee 8%), NHF, Cooperative Savings, Staff Loan Repayment,
  Salary Advance Recovery.
Add a "Copy from template" action so Super Admin can apply a default
structure to a new staff member and then adjust only what's different, rather
than configuring every field from scratch for all 50+ staff.
Also design a separate, simpler "Salary Structure Defaults" screen (company-
wide templates by job grade/department) that a Super Admin sets up once, which
"Copy from template" pulls from.

B. ATTENDANCE MANAGEMENT (new module — HR + Staff self-service)
- Daily attendance screen for HR: a calendar/grid view per staff per month,
  marking each day Present / Absent / On Leave / Public Holiday, plus a
  numeric "Overtime hours" field on days overtime was worked, and a separate
  "On Site" checkbox/toggle per day for staff deployed to a project site that
  day (independent of the overtime field — a day can be On Site, overtime, or
  both).
- Staff self-service: a simple clock-in/clock-out style widget (or a daily
  status view if this is manual-entry only), and a personal attendance
  calendar showing their own month so far.
- Monthly Attendance Summary screen: one row per staff, columns for Days
  Present, Days Absent, Days on Leave, Total Overtime Hours, and Days on Site
  — this is the screen Accountant pulls from when running payroll.
- Attendance approval: if overtime hours are staff-submitted, show a pending/
  approved/rejected status and an HR approval action.

C. LEAVE MANAGEMENT (HR approval workflow + Staff self-service)
- Leave types configuration (Super Admin/HR): Annual, Sick, Maternity/
  Paternity, Unpaid, Compassionate — each with an annual entitlement (days)
  and whether it's paid or unpaid.
- Staff: "Request Leave" form (type, date range, reason, attached document
  e.g. medical note) and a personal leave balance view (days used / remaining
  per type).
- HR: Leave requests queue (pending/approved/rejected), calendar view of
  who's on leave company-wide, and the ability to override/adjust a staff
  member's leave balance manually.
- Leave Allowance should visibly connect here: on a staff's Salary Structure
  screen, if "Leave Allowance" is active, note in the UI that it accrues
  based on approved leave taken/entitlement (design a small info tooltip
  explaining this rather than making it a flat monthly amount).

D. PAYROLL RUN — REDESIGN AS ATTENDANCE-DRIVEN (update the Accountant screen
   from Phase 1)
Redesign the "Run Payroll" screen so each staff row expands to show HOW each
line item was computed that month, not just the final number:
  - Basic/Housing/Transport: from Salary Structure config (fixed %, shown as
    "fixed" tag).
  - Lunch Allowance: rate × Days Present that month (shown as "₦X/day × N
    days" breakdown, pulled from Attendance Summary).
  - Overtime Allowance: rate × Overtime Hours that month (shown as "₦X/hour
    × N hours" breakdown).
  - Site Allowance: rate × Days on Site that month (shown as "₦X/day × N
    days" breakdown, separate line item from Overtime — a staff member can
    have one, both, or neither in a given month).
  - Performance Allowance / Commission / Duty Allowance: shown as a manual
    value-entry field for that month if the component's rate type is "flat
    amount, entered monthly" rather than attendance-based — make clear in the
    UI which components are auto-computed vs. need monthly manual input.
  - Leave Allowance: computed from approved leave taken this period.
This means net pay legitimately varies staff-to-staff and month-to-month —
design the payslip and payroll run table to make each staff's total look
clearly itemized and traceable back to attendance/config, not a flat number
that looks arbitrary.

E. TAX ENGINE & REMITTANCE (Super Admin config + Accountant reporting)
- Tax Bands Configuration screen (Super Admin): an editable table of PAYE
  bands (income range + rate %), since Nigeria's tax bands can change by
  legislation — do NOT hard-code specific numbers into the design; show the
  screen as a generic editable band table (e.g. rows like "₦0 - ₦800,000:
  0%", "next band: 15%", etc. as illustrative placeholder content) so it's
  obviously configurable rather than fixed.
- Per-staff tax inputs: a small section on the Salary Structure screen for
  reliefs that vary by individual — e.g. annual rent paid (for rent relief)
  — with a note that these feed into that staff's PAYE calculation.
- Payslip should show a clear "Taxable Income" line (sum of components marked
  taxable, minus reliefs) and the resulting PAYE for that month, so it's
  auditable why a given staff paid what they paid.
- Total Tax Remittance report (Accountant + Super Admin): a monthly summary
  screen — total PAYE collected across all staff for the selected month/
  period, with a department/breakdown table and a clear "Amount to Remit"
  summary card, plus an export action (for filing with the tax authority).

Please build Section A (Salary Structure Configuration) first, then B and C
(Attendance & Leave) together since they're closely related, then update the
Payroll Run screen (D), and finish with the Tax Engine screens (E). Check in
after each section.