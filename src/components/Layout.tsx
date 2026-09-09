import { useState, useEffect } from 'react'
import type { Role, Page, HRISNotification } from '../types'
import { supabase } from '../lib/supabase'
import { getInitials, getAvatarColor } from '../lib/avatarUtils'
import { useCompanySettings } from '../hooks/useCompanySettings'
import { requestNotificationPermission, sendLocalNotification, runRoutineReminders, getStaffConfirmationStatus } from '../lib/pushNotification'

interface LayoutProps {
  role: Role
  page: Page
  onNavigate: (p: Page) => void
  onRoleChange: (r: Role) => void
  onLogout: () => void
  onSelectStaff?: (id: string | null) => void
  onSelectPayslip?: (id: string) => void
  children: React.ReactNode
}

interface NavItem {
  label: string
  page: Page
  icon: React.ReactNode
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  )
}
function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/>
    </svg>
  )
}
function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )
}
function IconUserPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/>
      <line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  )
}
function IconIdCard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <circle cx="8" cy="12" r="2"/>
      <path d="M14 9h4M14 12h4M14 15h4"/>
    </svg>
  )
}
function IconDollar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  )
}
function IconFileText() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}
function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}
function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}
function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}
function IconFlag() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  )
}
function IconBarChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IconUmbrella() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/>
    </svg>
  )
}
function IconSliders() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
      <line x1="17" y1="16" x2="23" y2="16"/>
    </svg>
  )
}
function IconPercent() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19"/>
      <circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
    </svg>
  )
}
function IconClipboardCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <path d="M9 14l2 2 4-4"/>
    </svg>
  )
}
function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function navForRole(role: Role): { section?: string; items: NavItem[]; collapsible?: boolean; icon?: React.ReactNode }[] {
  switch (role) {
    case 'superadmin':
      return [
        { items: [{ label: 'Dashboard', page: 'sa-dashboard', icon: <IconGrid /> }] },
        {
          section: 'Management', items: [
            { label: 'User Management', page: 'sa-users', icon: <IconUsers /> },
            { label: 'Appraisal & Assessments', page: 'sa-appraisals', icon: <IconClipboardCheck /> },
            { label: 'System Settings', page: 'sa-settings', icon: <IconSettings /> },
          ],
        },
        {
          section: 'Payroll Config', items: [
            { label: 'Salary Defaults', page: 'sa-salary-defaults', icon: <IconSliders /> },
            { label: 'Tax Bands (PAYE)', page: 'sa-tax-bands', icon: <IconPercent /> },
          ],
        },
        {
          section: 'Oversight', items: [
            { label: 'Audit Log', page: 'sa-audit', icon: <IconList /> },
          ],
        },
        { section: 'OTHER ROLES', items: [] },
        {
          section: 'Human Resource', collapsible: true, icon: <IconUsers />, items: [
            { label: 'Staff Directory', page: 'hr-directory', icon: <IconUsers /> },
            { label: 'Add Staff', page: 'hr-add-staff', icon: <IconUserPlus /> },
            { label: 'ID Card Generator', page: 'hr-id-cards', icon: <IconIdCard /> },
            { label: 'Daily Attendance', page: 'hr-attendance-daily', icon: <IconCalendar /> },
            { label: 'Monthly Summary', page: 'hr-attendance-summary', icon: <IconBarChart /> },
            { label: 'Public Holidays', page: 'hr-holidays', icon: <IconCalendar /> },
            { label: 'Leave Management', page: 'hr-leave-mgmt', icon: <IconUmbrella /> },
            { label: 'Appraisal Cycles', page: 'hr-appraisal-cycles', icon: <IconCalendar /> },
            { label: 'Appraisal Form', page: 'hr-appraisal-form', icon: <IconClipboardCheck /> },
            { label: 'Appraisal Summary', page: 'hr-appraisal-summary', icon: <IconBarChart /> },
          ],
        },
        {
          section: 'Finance', collapsible: true, icon: <IconDollar />, items: [
            { label: 'Payroll Run', page: 'ac-payroll', icon: <IconDollar /> },
            { label: 'Payslips', page: 'ac-payslip', icon: <IconFileText /> },
            { label: 'Tax Remittance', page: 'ac-tax-remittance', icon: <IconPercent /> },
            { label: 'Financial Reports', page: 'ac-reports', icon: <IconBarChart /> },
          ],
        },
        {
          section: 'Auditing', collapsible: true, icon: <IconShield />, items: [
            { label: 'Audit Trail', page: 'au-audit', icon: <IconList /> },
            { label: 'Flags & Comments', page: 'au-flags', icon: <IconFlag /> },
            { label: 'Compliance Reports', page: 'au-compliance', icon: <IconShield /> },
          ],
        },
      ]
    case 'hr':
      return [
        { items: [{ label: 'Dashboard', page: 'hr-dashboard', icon: <IconGrid /> }] },
        {
          section: 'Staff', items: [
            { label: 'Staff Directory', page: 'hr-directory', icon: <IconUsers /> },
            { label: 'Add Staff', page: 'hr-add-staff', icon: <IconUserPlus /> },
            { label: 'ID Card Generator', page: 'hr-id-cards', icon: <IconIdCard /> },
          ],
        },
        {
          section: 'Attendance & Holidays', items: [
            { label: 'Daily Attendance', page: 'hr-attendance-daily', icon: <IconCalendar /> },
            { label: 'Monthly Summary', page: 'hr-attendance-summary', icon: <IconBarChart /> },
            { label: 'Public Holidays', page: 'hr-holidays', icon: <IconCalendar /> },
          ],
        },
        {
          section: 'Leave', items: [
            { label: 'Leave Management', page: 'hr-leave-mgmt', icon: <IconUmbrella /> },
          ],
        },
        {
          section: 'Performance', items: [
            { label: 'Appraisal Cycles', page: 'hr-appraisal-cycles', icon: <IconCalendar /> },
            { label: 'Appraisal Form', page: 'hr-appraisal-form', icon: <IconClipboardCheck /> },
            { label: 'Final Summary', page: 'hr-appraisal-summary', icon: <IconBarChart /> },
          ],
        },
      ]
    case 'accountant':
      return [
        { items: [{ label: 'Dashboard', page: 'ac-dashboard', icon: <IconGrid /> }] },
        {
          section: 'Payroll', items: [
            { label: 'Payroll Run', page: 'ac-payroll', icon: <IconDollar /> },
            { label: 'Payslips', page: 'ac-payslip', icon: <IconFileText /> },
            { label: 'Tax Remittance', page: 'ac-tax-remittance', icon: <IconPercent /> },
            { label: 'Reports', page: 'ac-reports', icon: <IconBarChart /> },
          ],
        },
      ]
    case 'auditor':
      return [
        { items: [{ label: 'Dashboard', page: 'au-dashboard', icon: <IconGrid /> }] },
        {
          section: 'Audit', items: [
            { label: 'Audit Trail', page: 'au-audit', icon: <IconList /> },
            { label: 'Flags & Comments', page: 'au-flags', icon: <IconFlag /> },
            { label: 'Compliance Reports', page: 'au-compliance', icon: <IconShield /> },
          ],
        },
      ]
    case 'staff':
      return [
        { items: [{ label: 'My Dashboard', page: 'st-dashboard', icon: <IconGrid /> }] },
        {
          section: 'My Records', items: [
            { label: 'My Profile', page: 'st-profile', icon: <IconUser /> },
            { label: 'My Payslips', page: 'st-payslips', icon: <IconFileText /> },
            { label: 'My ID Card', page: 'st-id-card', icon: <IconIdCard /> },
          ],
        },
        {
          section: 'Time & Leave', items: [
            { label: 'My Attendance', page: 'st-attendance', icon: <IconCalendar /> },
            { label: 'My Leave', page: 'st-leave', icon: <IconUmbrella /> },
          ],
        },
        {
          section: 'Performance', items: [
            { label: 'My Appraisal', page: 'st-appraisal', icon: <IconClipboardCheck /> },
          ],
        },
      ]
  }
}

const roleLabels: Record<Role, string> = {
  superadmin: 'Super Admin',
  hr: 'HR Manager',
  accountant: 'Accountant',
  auditor: 'Auditor',
  staff: 'Staff',
}

const roleBadgeColors: Record<Role, string> = {
  superadmin: 'bg-purple-100 text-purple-700',
  hr: 'bg-blue-100 text-blue-700',
  accountant: 'bg-emerald-100 text-emerald-700',
  auditor: 'bg-amber-100 text-amber-700',
  staff: 'bg-slate-100 text-slate-600',
}

export default function Layout({ role, page, onNavigate, onRoleChange, onLogout, onSelectStaff, onSelectPayslip, children }: LayoutProps) {
  const { settings: companySettings } = useCompanySettings()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<{ id: string; icon: React.ReactNode; primary: string; secondary: string; category: string; onClick: () => void }[]>([])
  const [notifs, setNotifs] = useState<HRISNotification[]>([])
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; photo: string } | null>(null)
  
  // PWA Installation & Device Standalone Detection
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if running in standalone mode (installed PWA)
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
    setIsStandalone(checkStandalone)

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Only show banner if not already dismissed in this session
      const dismissed = sessionStorage.getItem('pwa_install_dismissed')
      if (!dismissed) {
        setShowInstallBanner(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const handleInstallApp = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowInstallBanner(false)
      setDeferredPrompt(null)
    }
  }

  const navSections = navForRole(role)
  const unreadCount = notifs.filter(n => !n.read).length

  useEffect(() => {
    const activeSection = navSections.find(s => s.items.some(i => i.page === page))
    if (activeSection?.section && activeSection.collapsible) {
      setOpenSections(prev => ({ ...prev, [activeSection.section!]: true }))
    }
  }, [page])

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email, photo_url')
          .eq('id', user.id)
          .single()

        if (profile) {
          setCurrentUser({
            name: profile.full_name || 'User',
            email: profile.email || user.email || '',
            photo: profile.photo_url || null,
          })
        }
      } catch (err) {
        console.error('Error fetching current user:', err)
      }
    }

    fetchCurrentUser()
  }, [page])

  useEffect(() => {
    const fetchNotifications = async () => {
      const items: HRISNotification[] = []
      try {
        if (role === 'hr' || role === 'superadmin') {
          const { data: leaves } = await supabase
            .from('leave_requests')
            .select('id, start_date, end_date, created_at, staff(full_name), leave_types(name)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(10)
          ;(leaves || []).forEach((l: any) => {
            items.push({
              id: `leave-${l.id}`,
              title: 'Leave request pending',
              message: `${l.staff?.full_name || 'A staff member'} requested ${l.leave_types?.name || 'leave'} (${l.start_date} to ${l.end_date})`,
              timestamp: new Date(l.created_at).toLocaleDateString(),
              type: 'warning',
              read: false,
            })
          })

          const { data: overtimePending } = await supabase
            .from('attendance_records')
            .select('id, attendance_date, overtime_hours, on_site, created_at, staff(full_name)')
            .eq('overtime_approval', 'pending')
            .order('created_at', { ascending: false })
            .limit(10)
          ;(overtimePending || []).forEach((a: any) => {
            items.push({
              id: `ot-${a.id}`,
              title: 'Overtime awaiting approval',
              message: `${a.staff?.full_name || 'A staff member'} logged ${a.overtime_hours || 0}h OT on ${a.attendance_date}${a.on_site ? ' (on-site)' : ''}`,
              timestamp: new Date(a.created_at).toLocaleDateString(),
              type: 'warning',
              read: false,
            })
          })

          // Check Staff 3-Month Confirmation Milestone
          const { data: staffDirectory } = await supabase
            .from('staff')
            .select('id, full_name, staff_code, date_employed, job_title')
            .eq('status', 'active')

          const dueConfirmations: Array<{ id: string; name: string; staffCode: string; daysRemaining: number }> = []
          ;(staffDirectory || []).forEach((st: any) => {
            const conf = getStaffConfirmationStatus(st.date_employed)
            if (conf && conf.isDueForConfirmation) {
              dueConfirmations.push({
                id: st.id,
                name: st.full_name,
                staffCode: st.staff_code,
                daysRemaining: conf.daysRemaining
              })

              items.push({
                id: `conf-${st.id}`,
                title: conf.isOverdue ? 'Staff Confirmation Overdue' : 'Staff Confirmation Due (3 Months)',
                message: `${st.full_name} (${st.staff_code}) is ${conf.isOverdue ? `overdue by ${Math.abs(conf.daysRemaining)} days` : `due for confirmation in ${conf.daysRemaining} days`} (Target: ${conf.confirmationDueDate}).`,
                timestamp: conf.confirmationDueDate,
                type: conf.isOverdue ? 'error' : 'warning',
                read: false,
              })
            }
          })
          localStorage.setItem('hris_staff_confirmations_due', JSON.stringify(dueConfirmations))
        }

        if (role === 'accountant' || role === 'superadmin') {
          const { data: remittances } = await supabase
            .from('tax_remittances')
            .select('id, tax_type, created_at, payroll_periods(period_label)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(10)
          ;(remittances || []).forEach((r: any) => {
            items.push({
              id: `remit-${r.id}`,
              title: 'Remittance pending',
              message: `${(r.tax_type || 'Tax').toUpperCase()} for ${r.payroll_periods?.period_label || 'a period'} not yet remitted`,
              timestamp: new Date(r.created_at).toLocaleDateString(),
              type: 'warning',
              read: false,
            })
          })
        }

        if (role === 'auditor' || role === 'superadmin') {
          const { data: flags } = await supabase
            .from('audit_flags')
            .select('id, comment, created_at, audit_log(action, entity, actor_name)')
            .eq('status', 'open')
            .order('created_at', { ascending: false })
            .limit(10)
          ;(flags || []).forEach((f: any) => {
            items.push({
              id: `flag-${f.id}`,
              title: 'Open flag needs review',
              message: f.comment || `Flagged entry: ${f.audit_log?.action || ''} on ${f.audit_log?.entity || ''}`,
              timestamp: new Date(f.created_at).toLocaleDateString(),
              type: 'error',
              read: false,
            })
          })
        }

        if (role === 'staff') {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: staffRow } = await supabase
              .from('staff')
              .select('id')
              .eq('profile_id', user.id)
              .maybeSingle()
            if (staffRow) {
              // Fetch date_employed
              const { data: stDetail } = await supabase
                .from('staff')
                .select('id, full_name, date_employed')
                .eq('id', staffRow.id)
                .maybeSingle()

              if (stDetail?.date_employed) {
                const conf = getStaffConfirmationStatus(stDetail.date_employed)
                if (conf && conf.isDueForConfirmation) {
                  localStorage.setItem('hris_self_confirmation_due', 'true')
                  items.push({
                    id: `self-conf-${stDetail.id}`,
                    title: conf.isOverdue ? 'Employment Confirmation Review Overdue' : 'Employment Confirmation Milestone (3 Months)',
                    message: conf.isOverdue
                      ? `Your 3-month probation period ended on ${conf.confirmationDueDate}. Please reach out to HR for your official confirmation letter.`
                      : `You have reached your 3-month employment confirmation milestone (${conf.daysRemaining} days remaining, Target: ${conf.confirmationDueDate}).`,
                    timestamp: conf.confirmationDueDate,
                    type: 'info',
                    read: false,
                  })
                } else {
                  localStorage.setItem('hris_self_confirmation_due', 'false')
                }
              }

              const { data: myLeaves } = await supabase
                .from('leave_requests')
                .select('id, start_date, end_date, created_at, leave_types(name)')
                .eq('staff_id', staffRow.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(10)
              ;(myLeaves || []).forEach((l: any) => {
                items.push({
                  id: `myleave-${l.id}`,
                  title: 'Your leave request is pending',
                  message: `${l.leave_types?.name || 'Leave'} request (${l.start_date} to ${l.end_date}) awaiting approval`,
                  timestamp: new Date(l.created_at).toLocaleDateString(),
                  type: 'info',
                  read: false,
                })
              })
            }
          }
        }

        setNotifs(items)
        localStorage.setItem('hris_pending_actions_count', String(items.filter(i => !i.read).length))

        // Trigger routine push reminders
        try {
          runRoutineReminders(role)
        } catch (e) {}
      } catch (err) {
        console.error('Error fetching notifications:', err)
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000) // Periodic 1-minute check for reminders
    return () => clearInterval(interval)
  }, [role, page])

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    const q = searchQuery.trim()
    const timeout = setTimeout(async () => {
      setSearching(true)
      const results: typeof searchResults = []
      try {
        if (role === 'hr' || role === 'superadmin') {
          const { data: staffMatches } = await supabase
            .from('staff')
            .select('id, full_name, staff_code, job_title')
            .or(`full_name.ilike.%${q}%,staff_code.ilike.%${q}%`)
            .limit(5)
          ;(staffMatches || []).forEach((s: any) => {
            results.push({
              id: `staff-${s.id}`,
              icon: <IconUsers />,
              primary: s.full_name,
              secondary: `${s.staff_code}${s.job_title ? ' · ' + s.job_title : ''}`,
              category: 'Staff',
              onClick: () => {
                onSelectStaff?.(s.id)
                onNavigate('hr-profile')
                setShowSearch(false)
                setSearchQuery('')
              },
            })
          })
        }

        if (role === 'accountant' || role === 'superadmin') {
          const { data: staffForPayslips } = await supabase
            .from('staff')
            .select('id, full_name')
            .ilike('full_name', `%${q}%`)
            .limit(5)
          const staffIds = (staffForPayslips || []).map((s: any) => s.id)
          if (staffIds.length > 0) {
            const { data: payslipMatches } = await supabase
              .from('payslips')
              .select('id, net_pay, staff_id, staff(full_name), payroll_periods(period_label)')
              .in('staff_id', staffIds)
              .order('created_at', { ascending: false })
              .limit(5)
            ;(payslipMatches || []).forEach((p: any) => {
              results.push({
                id: `payslip-${p.id}`,
                icon: <IconFileText />,
                primary: `${p.staff?.full_name || 'Payslip'} — ${p.payroll_periods?.period_label || ''}`,
                secondary: `Net pay: ₦${(p.net_pay || 0).toLocaleString()}`,
                category: 'Payslips',
                onClick: () => {
                  onSelectPayslip?.(p.id)
                  onNavigate('ac-payslip')
                  setShowSearch(false)
                  setSearchQuery('')
                },
              })
            })
          }
        }

        if (role === 'staff') {
          const { data: myPayslips } = await supabase
            .from('payslips')
            .select('id, net_pay, payroll_periods(period_label)')
            .order('created_at', { ascending: false })
            .limit(20)
          ;(myPayslips || [])
            .filter((p: any) => (p.payroll_periods?.period_label || '').toLowerCase().includes(q.toLowerCase()))
            .slice(0, 5)
            .forEach((p: any) => {
              results.push({
                id: `mypayslip-${p.id}`,
                icon: <IconFileText />,
                primary: p.payroll_periods?.period_label || 'Payslip',
                secondary: `Net pay: ₦${(p.net_pay || 0).toLocaleString()}`,
                category: 'My Payslips',
                onClick: () => {
                  onSelectPayslip?.(p.id)
                  onNavigate('st-payslip')
                  setShowSearch(false)
                  setSearchQuery('')
                },
              })
            })
        }

        if (role === 'auditor' || role === 'superadmin') {
          const { data: auditMatches } = await supabase
            .from('audit_log')
            .select('id, action, entity, actor_name, details, created_at')
            .or(`actor_name.ilike.%${q}%,details.ilike.%${q}%,entity.ilike.%${q}%`)
            .order('created_at', { ascending: false })
            .limit(5)
          ;(auditMatches || []).forEach((a: any) => {
            results.push({
              id: `audit-${a.id}`,
              icon: <IconList />,
              primary: `${a.action} — ${a.entity}`,
              secondary: a.details || a.actor_name || '',
              category: 'Audit Log',
              onClick: () => {
                onNavigate(role === 'superadmin' ? 'sa-audit' : 'au-audit')
                setShowSearch(false)
                setSearchQuery('')
              },
            })
          })
        }

        setSearchResults(results)
      } catch (err) {
        console.error('Error searching:', err)
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchQuery, role])

  const pageTitles: Partial<Record<Page, string>> = {
    'sa-dashboard': 'Dashboard', 'sa-users': 'User Management',
    'sa-settings': 'System Settings', 'sa-audit': 'Audit Log',
    'sa-salary-defaults': 'Salary Defaults', 'sa-tax-bands': 'PAYE Tax Bands',
    'hr-dashboard': 'Dashboard', 'hr-directory': 'Staff Directory',
    'hr-add-staff': 'Add New Staff', 'hr-id-cards': 'ID Card Generator',
    'hr-profile': 'Staff Profile',
    'hr-attendance-daily': 'Daily Attendance', 'hr-attendance-summary': 'Monthly Attendance Summary',
    'hr-leave-mgmt': 'Leave Management', 'hr-leave-config': 'Leave Configuration',
    'ac-dashboard': 'Dashboard', 'ac-payroll': 'Payroll Run',
    'ac-payslip': 'Payslips', 'ac-reports': 'Financial Reports',
    'ac-tax-remittance': 'Tax Remittance Report',
    'au-dashboard': 'Dashboard', 'au-audit': 'Audit Trail',
    'au-flags': 'Flags & Comments', 'au-compliance': 'Compliance Reports',
    'st-dashboard': 'My Dashboard', 'st-payslips': 'My Payslips',
    'st-profile': 'My Profile', 'st-id-card': 'My ID Card',
    'st-attendance': 'My Attendance', 'st-leave': 'My Leave',
    'st-appraisal': 'My Appraisal',
    'hr-appraisal-cycles': 'Appraisal Cycles', 'hr-appraisal-form': 'Appraisal Form',
    'hr-appraisal-summary': 'Appraisal Summary',
    'profile': 'My Profile',
  }

  const markAllRead = () => setNotifs(n => n.map(x => ({ ...x, read: true })))

  return (
    <div className="flex h-screen bg-slate-50/80 overflow-hidden">
      {/* Mobile sidebar backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          flex flex-col flex-none transition-all duration-300
          fixed md:relative z-50 md:z-auto h-full
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          width: undefined, // Handled by responsive classes / inline style fallback
          background: 'linear-gradient(180deg, #0f2744 0%, #1e3a5f 100%)',
          minHeight: '100vh',
        }}
      >
        <div
          className={`
            flex flex-col h-full transition-all duration-300
            w-[260px] ${collapsed ? 'md:w-[60px]' : 'md:w-[240px]'}
          `}
        >
          {/* Logo / Header */}
          <div
            className={`flex items-center border-b border-white/10 py-4 ${
              collapsed ? 'md:px-2 md:justify-center px-4 gap-3' : 'px-4 gap-3'
            }`}
            style={{ minHeight: 60 }}
          >
            <button
              onClick={() => {
                // On desktop, toggle collapse when clicking logo area if collapsed
                if (collapsed) setCollapsed(false)
              }}
              className={`flex items-center gap-3 text-left focus:outline-none ${collapsed ? 'md:cursor-pointer' : ''}`}
              title={collapsed ? 'Click to expand sidebar' : undefined}
            >
              <div className="flex-none w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm overflow-hidden">
                {companySettings.logo_url ? (
                  <img src={companySettings.logo_url} alt={companySettings.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-display font-bold text-xs uppercase">
                    {companySettings.name ? companySettings.name.slice(0, 2) : 'FO'}
                  </span>
                )}
              </div>
              {/* Show text if not collapsed on desktop, or ALWAYS on mobile */}
              <div className={`${collapsed ? 'md:hidden' : 'block'} min-w-0`}>
                <div className="font-display font-semibold text-white text-sm leading-tight truncate">
                  {companySettings.name || 'Firstoption'}
                </div>
                <div className="text-blue-300 text-xs truncate">
                  {companySettings.subtitle || 'HRIS Platform'}
                </div>
              </div>
            </button>

            {/* Desktop collapse toggle */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={`hidden md:flex text-white/50 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/10 ${
                collapsed ? 'ml-0 mt-1' : 'ml-auto'
              }`}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                {collapsed ? <polyline points="9 18 15 12 9 6"/> : <polyline points="15 18 9 12 15 6"/>}
              </svg>
            </button>

            {/* Mobile close drawer button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden ml-auto text-white/50 hover:text-white p-1.5 rounded-md hover:bg-white/10"
              title="Close menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {navSections.map((section, si) => {
            const isOpen = section.collapsible ? !!openSections[section.section || ''] : true
            return (
              <div key={si} className="mb-2">
                {section.section && (
                  section.collapsible ? (
                    <button
                      onClick={() => setOpenSections(prev => ({ ...prev, [section.section!]: !prev[section.section!] }))}
                      className={`w-full flex items-center justify-between px-4 pt-3 pb-1 text-xs font-medium tracking-widest uppercase text-blue-300/60 hover:text-blue-200/80 transition-colors ${
                        collapsed ? 'hidden md:hidden' : ''
                      } md:flex`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex-none">{section.icon}</span>
                        <span className={`${collapsed ? 'md:hidden' : 'inline'}`}>{section.section}</span>
                      </span>
                      <span className={`transition-transform duration-150 ${isOpen ? 'rotate-90' : ''} ${collapsed ? 'md:hidden' : 'inline'}`}>
                        <IconChevronRight />
                      </span>
                    </button>
                  ) : (
                    <div className={`px-4 pt-3 pb-1 text-xs font-medium tracking-widest uppercase ${
                      section.section === 'OTHER ROLES' ? 'text-white/30 border-t border-white/10 mt-2' : 'text-blue-300/60'
                    } ${collapsed ? 'hidden md:block' : 'block'}`}>
                      <span className={`${collapsed ? 'md:hidden' : 'inline'}`}>{section.section}</span>
                    </div>
                  )
                )}
                {isOpen && section.items.map(item => {
                  const active = page === item.page
                  return (
                    <button
                      key={item.page}
                      onClick={() => {
                        if (item.page === 'hr-add-staff') {
                          onSelectStaff?.(null)
                        }
                        onNavigate(item.page)
                        setMobileOpen(false) // always close drawer on mobile after navigation
                      }}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 mx-1 text-sm font-medium transition-all duration-150 rounded-lg ${
                        active
                          ? 'bg-blue-500/25 text-white'
                          : 'text-blue-100/70 hover:bg-white/8 hover:text-white'
                      }`}
                      style={active ? { borderLeft: '3px solid #60a5fa', paddingLeft: '9px' } : { borderLeft: '3px solid transparent', paddingLeft: '9px' }}
                    >
                      <span className={`flex-none ${active ? 'text-blue-300' : 'text-blue-300/50'}`}>
                        {item.icon}
                      </span>
                      <span className={`${active ? 'font-semibold' : ''} ${collapsed ? 'md:hidden' : 'inline'}`}>
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* User info at bottom */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2">
            {currentUser?.photo ? (
              <img src={currentUser.photo} alt={currentUser.name} className="w-8 h-8 rounded-full flex-none object-cover" />
            ) : (
              <div 
                className="w-8 h-8 rounded-full flex-none flex items-center justify-center text-white text-xs font-medium"
                style={{ backgroundColor: getAvatarColor(currentUser?.name || 'User') }}
              >
                {getInitials(currentUser?.name || 'User')}
              </div>
            )}
            <div className={`flex-1 min-w-0 ${collapsed ? 'md:hidden' : 'block'}`}>
              <div className="text-white text-xs font-medium truncate">{currentUser?.name || 'User'}</div>
              <div className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 ${roleBadgeColors[role]}`}>
                {roleLabels[role]}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex-none flex items-center gap-2 md:gap-3 bg-white border-b border-slate-200/80 px-3 md:px-6 shadow-sm" style={{ height: 60 }}>
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden flex-none p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {/* Breadcrumb/title */}
          <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
            <span className="font-medium text-slate-800 truncate">{pageTitles[page] || 'Page'}</span>
          </div>

          {/* Search */}
          <div className="flex-1 mx-2 md:mx-4 md:max-w-sm relative">
            {showSearch ? (
              <div className="relative anim-fade z-50">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <IconSearch />
                </span>
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                {searchQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-100 max-h-80 overflow-y-auto">
                    {searching ? (
                      <div className="px-4 py-4 text-sm text-slate-400 text-center">Searching...</div>
                    ) : searchResults.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-slate-400 text-center">No results found</div>
                    ) : (
                      Object.entries(
                        searchResults.reduce((acc: Record<string, typeof searchResults>, r) => {
                          acc[r.category] = acc[r.category] || []
                          acc[r.category].push(r)
                          return acc
                        }, {})
                      ).map(([category, items]) => (
                        <div key={category}>
                          <div className="px-4 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{category}</div>
                          {items.map(item => (
                            <button
                              key={item.id}
                              onClick={item.onClick}
                              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 transition-colors"
                            >
                              <span className="flex-none text-slate-400">{item.icon}</span>
                              <div className="min-w-0">
                                <div className="text-sm text-slate-800 truncate">{item.primary}</div>
                                <div className="text-xs text-slate-500 truncate">{item.secondary}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm transition-colors"
              >
                <IconSearch />
                <span className="hidden sm:inline text-slate-400">Quick search...</span>
                <span className="hidden md:inline ml-2 text-xs border border-slate-200 rounded px-1 py-0.5 text-slate-300">⌘K</span>
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Auditor read-only badge */}
            {role === 'auditor' && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                View Only
              </span>
            )}

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false) }}
                className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <IconBell />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-mono-data">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false) }}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {currentUser?.photo ? (
                  <img src={currentUser.photo} alt={currentUser.name} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div 
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium"
                    style={{ backgroundColor: getAvatarColor(currentUser?.name || 'User') }}
                  >
                    {getInitials(currentUser?.name || 'User')}
                  </div>
                )}
                <div className="text-left hidden sm:block">
                  <div className="text-sm font-medium text-slate-800 leading-tight">{currentUser?.name?.split(' ')[0] || 'User'}</div>
                  <div className="text-xs text-slate-500 leading-tight">{roleLabels[role]}</div>
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <div className="text-sm font-medium text-slate-800">{currentUser?.name || 'User'}</div>
                    <div className="text-xs text-slate-500">{currentUser?.email || ''}</div>
                  </div>
                  <div className="border-t border-slate-100 py-1">
                    <button
                      onClick={() => { onNavigate('profile'); setShowUserMenu(false) }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      My Profile
                    </button>
                    <button
                      onClick={onLogout}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto relative bg-slate-50/60 pb-16 md:pb-0">
          {children}

          {/* Click outside to close menus */}
          {(showUserMenu || showNotifications || showSearch) && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => { setShowUserMenu(false); setShowNotifications(false); setShowSearch(false); setSearchQuery('') }}
            />
          )}
        </main>

        {/* ── Mobile Bottom Navigation Bar (PWA Touch Bar) ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 py-1.5 flex items-center justify-around shadow-lg">
          {role === 'staff' ? (
            <>
              <button
                onClick={() => onNavigate('st-dashboard')}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
                  page === 'st-dashboard' ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconGrid />
                <span className="text-[10px]">Home</span>
              </button>
              <button
                onClick={() => onNavigate('st-attendance')}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
                  page === 'st-attendance' ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconCalendar />
                <span className="text-[10px]">Clock In</span>
              </button>
              <button
                onClick={() => onNavigate('st-leave')}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
                  page === 'st-leave' ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconUmbrella />
                <span className="text-[10px]">Leave</span>
              </button>
              <button
                onClick={() => onNavigate('st-payslips')}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
                  page === 'st-payslips' || page === 'st-payslip' ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconFileText />
                <span className="text-[10px]">Payslips</span>
              </button>
              <button
                onClick={() => setMobileOpen(true)}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-500 hover:text-slate-800"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
                <span className="text-[10px]">Menu</span>
              </button>
            </>
          ) : role === 'hr' ? (
            <>
              <button
                onClick={() => onNavigate('hr-dashboard')}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
                  page === 'hr-dashboard' ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconGrid />
                <span className="text-[10px]">Overview</span>
              </button>
              <button
                onClick={() => onNavigate('hr-directory')}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
                  page === 'hr-directory' ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconUsers />
                <span className="text-[10px]">Staff</span>
              </button>
              <button
                onClick={() => onNavigate('hr-attendance-daily')}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
                  page === 'hr-attendance-daily' ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconCalendar />
                <span className="text-[10px]">Attendance</span>
              </button>
              <button
                onClick={() => onNavigate('hr-leave-mgmt')}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
                  page === 'hr-leave-mgmt' ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconUmbrella />
                <span className="text-[10px]">Leave</span>
              </button>
              <button
                onClick={() => setMobileOpen(true)}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-500 hover:text-slate-800"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
                <span className="text-[10px]">More</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onNavigate(role === 'superadmin' ? 'sa-dashboard' : role === 'accountant' ? 'ac-dashboard' : 'au-dashboard')}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-blue-600 font-semibold"
              >
                <IconGrid />
                <span className="text-[10px]">Dashboard</span>
              </button>
              <button
                onClick={() => setShowSearch(true)}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-500"
              >
                <IconSearch />
                <span className="text-[10px]">Search</span>
              </button>
              <button
                onClick={() => setMobileOpen(true)}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-500"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
                <span className="text-[10px]">All Pages</span>
              </button>
            </>
          )}
        </nav>
      </div>

      {/* ── PWA Install App Toast Banner ── */}
      {showInstallBanner && !isStandalone && (
        <aside
          aria-label="Install Application"
          className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-4 shadow-2xl border border-white/10 flex items-center gap-3.5 anim-fade-up"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex-none flex items-center justify-center text-white font-bold text-sm shadow-md">
            FO
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-xs text-white leading-tight">Install Firstoption App</h4>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
              Install to your home screen for fast offline access and instant shift clock-in.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 flex-none">
            <button
              onClick={handleInstallApp}
              className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              Install
            </button>
            <button
              onClick={() => {
                setShowInstallBanner(false)
                sessionStorage.setItem('pwa_install_dismissed', 'true')
              }}
              className="text-[10px] text-slate-400 hover:text-white transition-colors text-center"
            >
              Dismiss
            </button>
          </div>
        </aside>
      )}

      {/* Notifications panel */}
      {showNotifications && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowNotifications(false)} />
          <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col anim-slide-right">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-display font-semibold text-slate-800">Notifications & Alerts</h2>
                <p className="text-xs text-slate-500">{unreadCount} unread</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">Mark all read</button>
                <button onClick={() => setShowNotifications(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Push Notification Opt-in Prompt */}
            {'Notification' in window && Notification.permission !== 'granted' && (
              <div className="p-3.5 mx-4 mt-3 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-none">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-blue-950">Enable Push Notifications</div>
                    <div className="text-[11px] text-blue-700 truncate">Get shift reminders & task alerts</div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const res = await requestNotificationPermission()
                    if (res === 'granted') {
                      sendLocalNotification({
                        title: 'Notifications Enabled',
                        body: 'You will now receive timely reminders for clock-in, approvals, and important company tasks.',
                      })
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex-none shadow-xs transition-colors"
                >
                  Enable
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))}
                  className={`px-5 py-4 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 w-2 h-2 rounded-full flex-none ${
                      n.type === 'success' ? 'bg-emerald-500' :
                      n.type === 'warning' ? 'bg-amber-500' :
                      n.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                    } ${n.read ? 'opacity-30' : ''}`} />
                    <div>
                      <div className={`text-sm font-medium ${n.read ? 'text-slate-500' : 'text-slate-800'}`}>{n.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</div>
                      <div className="text-xs text-slate-400 mt-1">{n.timestamp}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
