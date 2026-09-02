export type Role = 'superadmin' | 'hr' | 'accountant' | 'auditor' | 'staff'
export type StaffStatus = 'active' | 'suspended' | 'offboarded'

export type Page =
  | 'sa-dashboard' | 'sa-users' | 'sa-settings' | 'sa-audit'
  | 'sa-salary-defaults' | 'sa-tax-bands'
  | 'hr-dashboard' | 'hr-directory' | 'hr-profile' | 'hr-add-staff' | 'hr-id-cards'
  | 'hr-attendance-daily' | 'hr-attendance-summary' | 'hr-leave-mgmt' | 'hr-leave-config'
  | 'hr-appraisal-cycles' | 'hr-appraisal-form' | 'hr-appraisal-summary'
  | 'ac-dashboard' | 'ac-payroll' | 'ac-payslip' | 'ac-reports' | 'ac-tax-remittance'
  | 'au-dashboard' | 'au-audit' | 'au-flags' | 'au-compliance'
  | 'st-dashboard' | 'st-payslips' | 'st-payslip' | 'st-profile' | 'st-id-card'
  | 'st-attendance' | 'st-leave' | 'st-appraisal'
  | 'profile'

export interface StaffMember {
  id: string
  staffId: string
  staffTableId?: string
  name: string
  email: string
  role: Role
  department: string
  jobTitle: string
  employmentDate: string
  status: StaffStatus
  lastLogin: string
  phone: string
  photo: string
  bankName: string
  accountNumber: string
  grossSalary: number
  address: string
  nextOfKin: string
  nextOfKinPhone: string
  state: string
}

export interface PayrollRecord {
  staffId: string
  name: string
  department: string
  grossSalary: number
  basicSalary: number
  housingAllowance: number
  transportAllowance: number
  medicalAllowance: number
  pension: number
  nhf: number
  paye: number
  netPay: number
  status: 'pending' | 'processed' | 'paid'
}

export interface AuditEntry {
  id: string
  user: string
  role: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'EXPORT' | 'VIEW'
  entity: string
  entityId: string
  timestamp: string
  details: string
  before: string
  after: string
  severity: 'low' | 'medium' | 'high'
  hasFlag?: boolean
}

export interface HRISNotification {
  id: string
  title: string
  message: string
  timestamp: string
  read: boolean
  type: 'info' | 'warning' | 'success' | 'error'
}

// ── Salary Structure ─────────────────────────────────────────────────────────

export type RateType = 'flat' | 'pct_gross' | 'pct_basic' | 'per_hour' | 'per_day' | 'monthly_manual'

export interface SalaryComponent {
  id: string
  name: string
  active: boolean
  taxable: boolean
  rateType: RateType
  rate: number
  category: 'earning' | 'deduction'
  attendanceBased: boolean
  attendanceSource?: 'days_present' | 'overtime_hours' | 'days_on_site' | 'leave_taken'
  description?: string
}

export interface StaffSalaryStructure {
  staffId: string
  components: SalaryComponent[]
  taxReliefs: {
    annualRent: number
    lifeInsurance: number
    nhfContrib: number
    pension: number
  }
  jobGrade: string
  templateName: string
}

export interface SalaryTemplate {
  id: string
  name: string
  jobGrade: string
  department: string
  components: SalaryComponent[]
}

// ── Attendance ────────────────────────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'absent' | 'on_leave' | 'public_holiday' | 'weekend' | 'unmarked'

export interface DayAttendance {
  date: string           // 'YYYY-MM-DD'
  status: AttendanceStatus
  clockInTime?: string
  clockOutTime?: string
  isLate?: boolean
  lateMinutes?: number
  distanceMeters?: number
  overtimeHours: number
  onSite: boolean
  overtimeApproval: 'none' | 'pending' | 'approved' | 'rejected'
}

export interface MonthlyAttendanceSummary {
  staffId: string
  name: string
  department: string
  month: string
  year: number
  daysPresent: number
  daysAbsent: number
  daysOnLeave: number
  daysLate: number
  totalLateMinutes: number
  totalOvertimeHours: number
  daysOnSite: number
  approvedOvertimeHours: number
}

// ── Leave ─────────────────────────────────────────────────────────────────────

export interface LeaveType {
  id: string
  name: string
  entitlementDays: number
  paid: boolean
  requiresDocument: boolean
  attractsLeaveAllowance?: boolean
}

export interface LeaveRequest {
  id: string
  staffId: string
  staffName: string
  staffPhoto: string
  department: string
  type: string
  startDate: string
  endDate: string
  days: number
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  approvedBy?: string
  note?: string
}

export interface LeaveBalance {
  typeId: string
  typeName: string
  entitlement: number
  used: number
  remaining: number
}

// ── Tax ────────────────────────────────────────────────────────────────────────

export interface TaxBand {
  id: string
  label: string
  from: number
  to: number | null   // null = no upper limit
  rate: number        // percentage
}
