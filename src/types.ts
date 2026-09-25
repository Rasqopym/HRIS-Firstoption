export type Role = 'superadmin' | 'hr' | 'accountant' | 'auditor' | 'staff'
export type StaffStatus = 'active' | 'suspended' | 'offboarded'

export type Page =
  | 'sa-dashboard' | 'sa-users' | 'sa-settings' | 'sa-audit'
  | 'sa-salary-defaults' | 'sa-tax-bands' | 'sa-appraisals' | 'sa-workspace' | 'sa-tasks' | 'sa-calendar'
  | 'hr-dashboard' | 'hr-directory' | 'hr-profile' | 'hr-add-staff' | 'hr-id-cards'
  | 'hr-attendance-daily' | 'hr-attendance-summary' | 'hr-holidays' | 'hr-leave-mgmt' | 'hr-leave-config'
  | 'hr-appraisal-cycles' | 'hr-appraisal-form' | 'hr-appraisal-summary' | 'hr-workspace' | 'hr-tasks' | 'hr-calendar' | 'hr-team-monitoring'
  | 'ac-dashboard' | 'ac-payroll' | 'ac-payslip' | 'ac-reports' | 'ac-tax-remittance'
  | 'au-dashboard' | 'au-audit' | 'au-flags' | 'au-compliance'
  | 'st-dashboard' | 'st-payslips' | 'st-payslip' | 'st-profile' | 'st-id-card'
  | 'st-attendance' | 'st-leave' | 'st-appraisal' | 'st-workspace' | 'st-tasks' | 'st-calendar'
  | 'workspace' | 'tasks' | 'calendar' | 'team-monitoring'
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
  isConfirmed?: boolean
  confirmationDate?: string | null
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

export interface SiteVisit {
  id: string
  site_name: string
  arrival_time: string
  departure_time?: string | null
  lat?: number | null
  lng?: number | null
  distance_meters?: number | null
  purpose?: string
  remarks?: string
  status: 'in_progress' | 'completed'
}

export interface DayAttendance {
  date: string           // 'YYYY-MM-DD'
  status: AttendanceStatus
  clockInTime?: string
  clockOutTime?: string
  isLate?: boolean
  lateMinutes?: number
  distanceMeters?: number
  workMode?: 'office' | 'field' | 'remote'
  matchedLocationName?: string
  fieldClientName?: string
  fieldNotes?: string
  siteVisits?: SiteVisit[]
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

// ── Workspaces, Teams, Chat & Tasks ──────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  code: string
  description?: string
  icon?: string
  color?: string
  is_default?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  staff_id: string
  role: 'admin' | 'lead' | 'member' | 'viewer'
  joined_at: string
  staff?: StaffMember
}

export interface Team {
  id: string
  workspace_id: string
  name: string
  description?: string
  icon?: string
  is_private?: boolean
  department_id?: string
  created_by?: string
  created_at?: string
  members_count?: number
  channels_count?: number
}

export interface TeamMember {
  id: string
  team_id: string
  staff_id: string
  role: 'lead' | 'member'
  joined_at: string
  staff?: StaffMember
}

export interface Channel {
  id: string
  team_id: string
  name: string
  topic?: string
  is_private?: boolean
  is_general?: boolean
  created_by?: string
  created_at?: string
}

export interface CompressedImageAttachment {
  url: string
  name: string
  size: number
  width?: number
  height?: number
  thumbUrl?: string
}

export interface ChatMessage {
  id: string
  channel_id: string
  sender_id: string
  content: string
  parent_id?: string | null
  attachments: CompressedImageAttachment[]
  reactions: Record<string, string[]> // emoji -> [staff_ids]
  mentions: string[]
  action_tasks: string[] // task_ids
  is_pinned?: boolean
  created_at: string
  updated_at?: string
  sender?: {
    id: string
    name: string
    photo?: string
    role?: string
    department?: string
  }
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'

export interface TaskChecklistItem {
  id: string
  text: string
  completed: boolean
  completed_by?: string
  completed_at?: string
}

export type RecurrenceInterval = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly'

export interface WorkspaceTask {
  id: string
  workspace_id: string
  team_id?: string | null
  channel_id?: string | null
  message_id?: string | null
  title: string
  description?: string
  assignee_id?: string | null
  creator_id?: string | null
  priority: TaskPriority
  status: TaskStatus
  due_date?: string | null
  due_time?: string | null
  reminder_type?: 'none' | 'on_due_time' | '15_min' | '30_min' | '1_hour' | '1_day' | null
  reminder_at?: string | null
  reminder_sent?: boolean
  is_recurring?: boolean
  recurrence_interval?: RecurrenceInterval
  recurrence_end_date?: string | null
  next_recurrence_date?: string | null
  estimated_hours?: number
  actual_hours?: number
  kpi_category?: string
  checklist: TaskChecklistItem[]
  image_attachments: CompressedImageAttachment[]
  tags: string[]
  comments?: TaskComment[]
  time_logs?: TaskTimeLog[]
  completed_at?: string | null
  created_at: string
  updated_at: string
  assignee?: {
    id: string
    name: string
    photo?: string
    department?: string
  }
  creator?: {
    id: string
    name: string
  }
  team?: {
    id: string
    name: string
  }
}

export interface TaskTimeLog {
  id: string
  task_id: string
  staff_id: string
  staff_name: string
  staff_photo?: string
  started_at: string
  ended_at: string
  duration_minutes: number
  notes?: string
  created_at: string
}

export interface ActiveTaskTimer {
  taskId: string
  taskTitle: string
  staffId: string
  staffName: string
  startTime: number // epoch ms
  isRunning: boolean
  notes?: string
}

export interface TaskComment {
  id: string
  task_id: string
  staff_id: string
  staff_name: string
  staff_photo?: string
  staff_department?: string
  content: string
  is_proof?: boolean
  attachments?: CompressedImageAttachment[]
  created_at: string
}

export interface TaskActivityLog {
  id: string
  task_id: string
  staff_id: string
  action: 'created' | 'status_changed' | 'assigned' | 'commented' | 'checklist_updated' | 'time_logged'
  details: Record<string, any>
  created_at: string
  staff?: {
    id: string
    name: string
  }
}

export interface DailyStandup {
  id: string
  workspace_id: string
  team_id: string
  staff_id: string
  yesterday_work: string
  today_plan: string
  blockers?: string
  standup_date: string
  created_at: string
  staff?: {
    id: string
    name: string
    photo?: string
    department?: string
  }
}
