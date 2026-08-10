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

// HR pages
import HRDashboard from './pages/hr/HRDashboard'
import StaffDirectory from './pages/hr/StaffDirectory'
import StaffProfile from './pages/hr/StaffProfile'
import AddEditStaff from './pages/hr/AddEditStaff'
import IDCardGenerator from './pages/hr/IDCardGenerator'
import AttendanceDaily from './pages/hr/AttendanceDaily'
import AttendanceSummary from './pages/hr/AttendanceSummary'
import LeaveManagement from './pages/hr/LeaveManagement'

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

function defaultPage(role: Role): Page {
  switch (role) {
    case 'superadmin': return 'sa-dashboard'
    case 'hr': return 'hr-dashboard'
    case 'accountant': return 'ac-dashboard'
    case 'auditor': return 'au-dashboard'
    case 'staff': return 'st-dashboard'
  }
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [role, setRole] = useState<Role>('superadmin')
  const [page, setPage] = useState<Page>('sa-dashboard')
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null)
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null)

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
            setPage(defaultPage(appRole))
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
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleLogin = (r: Role) => {
    setRole(r)
    setPage(defaultPage(r))
    setIsLoggedIn(true)
  }

  const handleRoleChange = (r: Role) => {
    setRole(r)
    setPage(defaultPage(r))
    setSelectedStaffId(null)
    setSelectedPayslipId(null)
  }

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setRole('superadmin')
    setPage('sa-dashboard')
    setSelectedStaffId(null)
    setSelectedPayslipId(null)
  }, [])

  const navigate = (p: Page) => setPage(p)

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

        const { data: staffData } = await supabase
          .from('staff')
          .select('id')
          .eq('profile_id', user.id)
          .single()

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

      // HR
      case 'hr-dashboard': return <HRDashboard key={page} onNavigate={navigate} onSelectStaff={setSelectedStaffId} />
      case 'hr-directory': return <StaffDirectory key={page} onNavigate={navigate} onSelectStaff={setSelectedStaffId} />
      case 'hr-profile': return <StaffProfile key={page} staffId={selectedStaffId} onNavigate={navigate} onSelectStaff={setSelectedStaffId} />
      case 'hr-add-staff': return <AddEditStaff key={page} staffId={selectedStaffId} onNavigate={navigate} />
      case 'hr-id-cards': return <IDCardGenerator key={page} />
      case 'hr-attendance-daily': return <AttendanceDaily key={page} />
      case 'hr-attendance-summary': return <AttendanceSummary key={page} />
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
      onSelectStaff={setSelectedStaffId}
      onSelectPayslip={setSelectedPayslipId}
    >
      {renderPage()}
    </Layout>
  )
}
