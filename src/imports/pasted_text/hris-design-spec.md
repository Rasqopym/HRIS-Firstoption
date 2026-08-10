Design and build a comprehensive, production-quality Staff Management System web
application called "Firstoption HRIS". This is an internal enterprise tool for a
Nigerian company. Design for eventual handoff to a developer who will rebuild the
frontend in a Cursor/AI-assisted IDE, host it on Netlify, and connect it to a
Supabase backend (Postgres + Auth + Storage) — so keep components clean, reusable,
and named clearly (they'll become React components later).

CONTEXT
A single company runs payroll, HR records, audits and identity management for up
to 200+ staff. Five roles share one platform with very different permissions:
Super Admin, HR, Accountant, Auditor, and Staff (regular employee).

VISUAL DIRECTION
- Clean, modern enterprise SaaS aesthetic (think Linear, Notion, or Workday) —
  not generic Bootstrap-looking admin templates.
- Light mode primary, with a dark mode variant.
- Primary brand color: a deep navy/blue (#1F4E78 range) with a single accent
  color for primary actions (CTA buttons, active nav states).
- Clear visual hierarchy: sidebar navigation + top bar + content area layout.
- Data-dense screens (tables, staff lists) need generous row height, subtle
  zebra striping or dividers, and sticky headers — this will be used all day
  by HR/Accounting staff, so legibility over decoration.
- Use a card-based layout for dashboards, with clear KPI summary cards at the
  top of each role's dashboard.
- Include empty states, loading states, and error states for key screens (not
  just the happy path).

ROLES & PERMISSIONS (design distinct dashboards/navigation for each)

1. SUPER ADMIN
   - Full system control. Can create, edit, deactivate, and delete accounts for
     HR, Accountant, Auditor, and Staff roles.
   - User management screen: table of all users with role, department, status
     (active/suspended), last login; bulk actions (activate/deactivate); a
     "Create User" modal/flow with role assignment and auto-generated temporary
     password / invite-by-email flow.
   - System settings screen: company profile, branding (logo upload for ID
     cards and documents), department/role management, audit log viewer (who
     did what, when).
   - Global dashboard: headcount, payroll cost trend, active vs suspended
     accounts, recent system activity feed.

2. HR
   - Staff records management: full CRUD on staff profiles (bio-data,
     department, job title, employment date, bank details, documents/contracts
     upload, next of kin, status).
   - Onboarding/offboarding workflows (a stepper/wizard UI for new hire
     onboarding checklist, and an offboarding checklist).
   - Staff ID Card Generator (see dedicated section below).
   - Reports: headcount by department, staff directory, org chart view.

3. ACCOUNTANT
   - Payroll dashboard: monthly payroll run screen — list of staff with gross
     salary, allowances, deductions, net pay, and a "Run Payroll" action per
     period.
   - Payslip generation and viewing (per staff, per month) as a clean printable
     document layout.
   - Financial reports: payroll cost by department, monthly trend chart,
     export-to-Excel/PDF actions (visually represent the export buttons; actual
     export logic happens later in code).

4. AUDITOR
   - Read-only access across HR and Payroll data (visually indicate read-only
     with disabled edit controls / a "View Only" badge in the header).
   - Audit trail screen: searchable/filterable log of every create/update/
     delete action across the system (who, what, when, before/after values).
   - Flag/comment feature: auditor can flag a record or transaction with a note
     for HR/Accountant to review, and see flag status (open/resolved).
   - Compliance reports dashboard: payroll variance month-to-month, missing
     documentation alerts, policy exceptions.

5. STAFF (regular employee, self-service)
   - Personal dashboard: my profile, my payslips (list + view/download), my
     documents.
   - Digital ID card view (view/download their own generated ID card).
   - Simple, restricted navigation — no access to other staff's data.

STAFF ID CARD GENERATOR (design this as its own dedicated screen/flow)
- Accessible to HR and Super Admin only.
- A live-preview card designer: company logo, staff photo (upload/crop),
  full name, staff ID number, department, job title, a QR code (placeholder
  graphic is fine) that would later encode a verification link, issue date,
  expiry date, and a signature/authorization line.
- Standard ID card proportions (CR80 card size, portrait or landscape — design
  both orientations as options).
- Support single-card preview AND a "bulk generate" view showing a grid of
  multiple staff ID cards ready for batch export/printing.
- Include a simple front/back toggle — back of card can show terms, emergency
  contact instructions, and a barcode/QR placeholder.

KEY SCREENS TO DESIGN (in this order)
1. Login screen (single login, role-based redirect after auth — mention this
   is Supabase Auth-backed) + forgot password flow.
2. Super Admin: User Management + Create User modal
3. Super Admin: System Settings (branding, departments/roles)
4. HR: Staff Directory (table + filters) + Staff Profile detail view
5. HR: Add/Edit Staff form (multi-step)
6. HR: Staff ID Card Generator (single + bulk view)
7. Accountant: Payroll Run screen + Payslip view (basic version — a richer,
   attendance-driven version comes in a later prompt)
8. Auditor: Audit Trail screen
9. Staff: Self-service dashboard + My Payslips
10. Shared: Notifications panel, global search, profile/account settings

NAVIGATION
Left sidebar, collapsible, with role-specific menu items only (i.e. the
sidebar content should visually differ per role — design each role's sidebar
variant). Top bar has: global search, notification bell, help icon, and a
user menu (profile, switch theme, logout).

TECHNICAL NOTES FOR LATER HANDOFF (reflect these as constraints, not visuals)
- This will be rebuilt with React + Tailwind CSS in Cursor, deployed to
  Netlify, backed by Supabase (Auth, Postgres, Storage, Row Level Security per
  role). Keep the component structure modular (Button, Table, Modal, Card,
  Sidebar, StatCard, FormField as distinct reusable components) so the design
  translates cleanly to code.
- Design at desktop width (1440px) first, then show a responsive/tablet
  variant for at least the Staff self-service dashboard.

Please start with the Login screen and Super Admin User Management screen,
then continue through the list above, checking in after each major role's
screens are done.