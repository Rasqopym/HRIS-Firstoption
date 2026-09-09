import { useState, useEffect, useRef, useCallback } from 'react'
import type { Role, Page } from './types'
import { supabase } from './lib/supabase'
import { dbRoleToApp } from './lib/roleMap'

import Login from './pages/Login'
import Layout from './components/Layout'
import Profile from './pages/Profile'

// Super Admin pages
import SADashboard from './pages/superadmin/Dashboard'
import UserManagement from './pages/superadmin/UserManagement'
import SystemSettings from './pages/superadmin/SystemSettings'
import SalaryDefaults from './pages/superadmin/SalaryDefaults'
import TaxBands from './pages/superadmin/TaxBands'
import AppraisalBuilder from './pages/superadmin/AppraisalBuilder'

// HR pages
import HRDashboard from './pages/hr/HRDashboard'
import StaffDirectory from './pages/hr/StaffDirectory'
import StaffProfile from './pages/hr/StaffProfile'
import AddEditStaff from './pages/hr/AddEditStaff'
import IDCardGenerator from './pages/hr/IDCardGenerator'
import AttendanceDaily from './pages/hr/AttendanceDaily'
import AttendanceSummary from './pages/hr/AttendanceSummary'
import LeaveManagement from './pages/hr/LeaveManagement'
import PublicHolidays from './pages/hr/PublicHolidays'

// Accountant pages
import ACDashboard from './pages/accountant/ACDashboard'
import PayrollRunV2 from './pages/accountant/PayrollRunV2'
import PayslipV2 from './pages/accountant/PayslipV2'
import TaxRemittance from './pages/accountant/TaxRemittance'
import FinancialReports from './pages/accountant/FinancialReports'

// Auditor pages
import AUDashboard from './pages/auditor/AUDashboard'
import AuditTrail from './pages/auditor/AuditTrail'
import FlagsComments from './pages/auditor/FlagsComments'
import ComplianceReports from './pages/auditor/ComplianceReports'

// Staff pages
import SelfServiceDashboard from './pages/staff/SelfServiceDashboard'
import MyPayslips from './pages/staff/MyPayslips'
import AttendanceSelf from './pages/staff/AttendanceSelf'
import LeaveRequest from './pages/staff/LeaveRequest'
import MyAppraisal from './pages/staff/MyAppraisal'

// Performance Appraisal pages
import AppraisalCycles from './pages/hr/appraisal/AppraisalCycles'
import AppraisalForm from './pages/hr/appraisal/AppraisalForm'
import AppraisalSummary from './pages/hr/appraisal/AppraisalSummary'

function defaultPage(role: Role): Page {
  switch (role) {
    case 'superadmin': return 'sa-dashboard'
    case 'hr': return 'hr-dashboard'
    case 'accountant': return 'ac-dashboard'
    case 'auditor': return 'au-dashboard'
    case 'staff': return 'st-dashboard'
  }
}

function getSavedPage(r: Role): Page {
  try {
    const hash = window.location.hash.replace('#', '') as Page
    if (hash) return hash
    const saved = localStorage.getItem(`hris_active_page_${r}`) as Page
    if (saved) return saved
  } catch (e) {}
  return defaultPage(r)
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [role, setRole] = useState<Role>('superadmin')
  const [page, setPage] = useState<Page>(() => {
    try {
      const hash = window.location.hash.replace('#', '') as Page
      if (hash) return hash
    } catch (e) {}
    return 'sa-dashboard'
  })

  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(() => {
    try { return localStorage.getItem('hris_selected_staff_id') } catch (e) { return null }
  })
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(() => {
    try { return localStorage.getItem('hris_selected_payslip_id') } catch (e) { return null }
  })
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null)

  const handleSelectStaff = (id: string | null) => {
    setSelectedStaffId(id)
    try {
      if (id) localStorage.setItem('hris_selected_staff_id', id)
      else localStorage.removeItem('hris_selected_staff_id')
    } catch (e) {}
  }

  const handleSelectPayslip = (id: string | null) => {
    setSelectedPayslipId(id)
    try {
      if (id) localStorage.setItem('hris_selected_payslip_id', id)
      else localStorage.removeItem('hris_selected_payslip_id')
    } catch (e) {}
  }

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single()

          if (profile) {
            const appRole = dbRoleToApp(profile.role)
            setRole(appRole)
            const targetPage = getSavedPage(appRole)
            setPage(targetPage)
            try { window.location.hash = targetPage } catch (e) {}
            setIsLoggedIn(true)
          }
        }
      } catch (err) {
        console.error('Error restoring session:', err)
      } finally {
        setCheckingSession(false)
      }
    }

    restoreSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false)
        setRole('superadmin')
        setPage('sa-dashboard')
        try { window.location.hash = '' } catch (e) {}
      }
    })

    const handleHashChange = () => {
      try {
        const hash = window.location.hash.replace('#', '') as Page
        if (hash) setPage(hash)
      } catch (e) {}
    }
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      authListener.subscription.unsubscribe()
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  const handleLogin = (r: Role) => {
    setRole(r)
    const targetPage = getSavedPage(r)
    setPage(targetPage)
    try {
      window.location.hash = targetPage
      localStorage.setItem(`hris_active_page_${r}`, targetPage)
    } catch (e) {}
    setIsLoggedIn(true)
  }

  const handleRoleChange = (r: Role) => {
    setRole(r)
    const targetPage = getSavedPage(r)
    setPage(targetPage)
    try {
      window.location.hash = targetPage
      localStorage.setItem(`hris_active_page_${r}`, targetPage)
    } catch (e) {}
    handleSelectStaff(null)
    handleSelectPayslip(null)
  }

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setRole('superadmin')
    setPage('sa-dashboard')
    try { window.location.hash = '' } catch (e) {}
    handleSelectStaff(null)
    handleSelectPayslip(null)
  }, [])

  const navigate = (p: Page) => {
    setPage(p)
    try {
      window.location.hash = p
      localStorage.setItem(`hris_active_page_${role}`, p)
    } catch (e) {}
  }

  // Resolve current staff ID when logged in as staff
  useEffect(() => {
    const resolveStaffId = async () => {
      if (role !== 'staff' || !isLoggedIn) {
        setCurrentStaffId(null)
        return
      }

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        let staffData: any = null

        // 1. Match by profile_id or id
        const { data: byProfile } = await supabase
          .from('staff')
          .select('id')
          .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
          .maybeSingle()

        staffData = byProfile

        // 2. Match by email
        if (!staffData && user.email) {
          const { data: byEmail } = await supabase
            .from('staff')
            .select('id')
            .ilike('email', `%${user.email}%`)
            .maybeSingle()
          staffData = byEmail
        }

        // 3. Fallback to first active staff row
        if (!staffData) {
          const { data: anyStaff } = await supabase
            .from('staff')
            .select('id')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
          staffData = anyStaff
        }

        setCurrentStaffId(staffData?.id || null)
      } catch (err) {
        console.error('Error resolving staff ID:', err)
        setCurrentStaffId(null)
      }
    }

    resolveStaffId()
  }, [role, isLoggedIn])

  // Idle session timeout (60 minutes of inactivity)
  const IDLE_TIMEOUT_MS = 60 * 60 * 1000 // 60 minutes
  const DEBOUNCE_MS = 5000 // Only reset timer if 5+ seconds have passed since last reset
  const lastActivityRef = useRef<number>(Date.now())
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Only run idle timer when logged in
    if (!isLoggedIn) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }

    const resetTimer = () => {
      const now = Date.now()
      // Debounce: only reset if more than DEBOUNCE_MS has passed since last reset
      if (now - lastActivityRef.current >= DEBOUNCE_MS) {
        lastActivityRef.current = now
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => {
          console.log('Session timeout: logging out due to inactivity')
          handleLogout()
        }, IDLE_TIMEOUT_MS)
      }
    }

    // Track user activity events
    const events = ['mousemove', 'keydown', 'click', 'scroll']
    const handleActivity = () => resetTimer()

    events.forEach(event => {
      window.addEventListener(event, handleActivity)
    })

    // Initial timer start
    resetTimer()

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, handleLogout])

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />
  }

  const renderPage = () => {
    switch (page) {
      // Super Admin
      case 'sa-dashboard': return <SADashboard key={page} onNavigate={navigate} />
      case 'sa-users': return <UserManagement key={page} />
      case 'sa-settings': return <SystemSettings key={page} />
      case 'sa-audit': return <AuditTrail key={page} />
      case 'sa-salary-defaults': return <SalaryDefaults key={page} />
      case 'sa-tax-bands': return <TaxBands key={page} />
      case 'sa-appraisals': return <AppraisalBuilder key={page} onNavigate={navigate} />

      // HR
      case 'hr-dashboard': return <HRDashboard key={page} onNavigate={navigate} onSelectStaff={setSelectedStaffId} />
      case 'hr-directory': return <StaffDirectory key={page} onNavigate={navigate} onSelectStaff={setSelectedStaffId} />
      case 'hr-profile': return <StaffProfile key={page} staffId={selectedStaffId} onNavigate={navigate} onSelectStaff={setSelectedStaffId} />
      case 'hr-add-staff': return <AddEditStaff key={page} staffId={selectedStaffId} onNavigate={navigate} />
      case 'hr-id-cards': return <IDCardGenerator key={page} />
      case 'hr-attendance-daily': return <AttendanceDaily key={page} />
      case 'hr-attendance-summary': return <AttendanceSummary key={page} />
      case 'hr-holidays': return <PublicHolidays key={page} />
      case 'hr-leave-mgmt': return <LeaveManagement key={page} />
      case 'hr-leave-config': return <LeaveManagement key={page} />

      // Accountant
      case 'ac-dashboard': return <ACDashboard key={page} onNavigate={navigate} />
      case 'ac-payroll': return <PayrollRunV2 key={page} onSelectPayslip={setSelectedPayslipId} onNavigate={navigate} />
      case 'ac-payslip': return <PayslipV2 key={page} payslipId={selectedPayslipId || undefined} onNavigate={navigate} />
      case 'ac-reports': return <FinancialReports key={page} />
      case 'ac-tax-remittance': return <TaxRemittance key={page} />

      // Auditor
      case 'au-dashboard': return <AUDashboard key={page} onNavigate={navigate} />
      case 'au-audit': return <AuditTrail key={page} />
      case 'au-flags': return <FlagsComments key={page} />
      case 'au-compliance': return <ComplianceReports key={page} />

      // Staff
      case 'st-dashboard': return <SelfServiceDashboard key={page} onNavigate={navigate} />
      case 'st-payslips': return <MyPayslips key={page} onNavigate={navigate} onSelectPayslip={setSelectedPayslipId} />
      case 'st-payslip': return <PayslipV2 key={page} payslipId={selectedPayslipId || undefined} onNavigate={navigate} />
      case 'st-profile': return <StaffProfile key={page} staffId={currentStaffId || ''} onNavigate={navigate} onSelectStaff={setSelectedStaffId} />
      case 'st-id-card': return <IDCardGenerator key={page} />
      case 'st-attendance': return <AttendanceSelf key={page} />
      case 'st-leave': return <LeaveRequest key={page} />
      case 'st-appraisal': return <MyAppraisal key={page} onNavigate={navigate} />

      // Performance Appraisal
      case 'hr-appraisal-cycles': return <AppraisalCycles key={page} onNavigate={navigate} />
      case 'hr-appraisal-form': return <AppraisalForm key={page} onNavigate={navigate} />
      case 'hr-appraisal-summary': return <AppraisalSummary key={page} onNavigate={navigate} />

      // Profile (shared across all roles)
      case 'profile': return <Profile key={page} />

      default: return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
            </div>
            <h3 className="font-display font-semibold text-slate-600 text-xl">Coming soon</h3>
            <p className="text-slate-400 text-sm mt-1">This section is under development</p>
          </div>
        </div>
      )
    }
  }

  return (
    <Layout
      role={role}
      page={page}
      onNavigate={navigate}
      onRoleChange={handleRoleChange}
      onLogout={handleLogout}
      onSelectStaff={handleSelectStaff}
      onSelectPayslip={handleSelectPayslip}
    >
      {renderPage()}
    </Layout>
  )
}
