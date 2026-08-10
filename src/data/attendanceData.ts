import type { DayAttendance, MonthlyAttendanceSummary, LeaveType, LeaveRequest, LeaveBalance } from '../types'
import { staff } from './mock'

// Generate July 2024 calendar days
// July 1, 2024 = Monday
function buildJuly2024(
  overrides: Partial<Record<string, Partial<DayAttendance>>>
): DayAttendance[] {
  const days: DayAttendance[] = []
  const publicHolidays = new Set(['2024-07-01']) // Democracy Day observed

  for (let d = 1; d <= 31; d++) {
    const dateStr = `2024-07-${String(d).padStart(2, '0')}`
    const dayOfWeek = new Date(dateStr).getDay() // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isHoliday = publicHolidays.has(dateStr)
    const base: DayAttendance = {
      date: dateStr,
      status: isWeekend ? 'weekend' : isHoliday ? 'public_holiday' : 'present',
      overtimeHours: 0,
      onSite: false,
      overtimeApproval: 'none',
    }
    const override = overrides[dateStr] || {}
    days.push({ ...base, ...override })
  }
  return days
}

// FO-002 (Adeyemi) — HR Manager, some absences
export const attendance_FO002 = buildJuly2024({
  '2024-07-08': { status: 'absent' },
  '2024-07-15': { status: 'on_leave' },
  '2024-07-16': { status: 'on_leave' },
  '2024-07-23': { overtimeHours: 3, overtimeApproval: 'approved' },
  '2024-07-24': { overtimeHours: 2.5, overtimeApproval: 'approved' },
})

// FO-005 (Fatima) — IT Developer, some site days + overtime
export const attendance_FO005 = buildJuly2024({
  '2024-07-02': { onSite: true },
  '2024-07-03': { onSite: true },
  '2024-07-04': { onSite: true, overtimeHours: 4, overtimeApproval: 'approved' },
  '2024-07-09': { onSite: true },
  '2024-07-10': { onSite: true, overtimeHours: 2, overtimeApproval: 'approved' },
  '2024-07-22': { overtimeHours: 3, overtimeApproval: 'pending' },
  '2024-07-25': { status: 'absent' },
})

// FO-003 (Taiwo) — Accountant, mostly clean
export const attendance_FO003 = buildJuly2024({
  '2024-07-11': { status: 'absent' },
  '2024-07-29': { overtimeHours: 2, overtimeApproval: 'pending' },
})

function summarise(
  staffId: string, name: string, dept: string,
  days: DayAttendance[]
): MonthlyAttendanceSummary {
  const workdays = days.filter(d => d.status !== 'weekend')
  return {
    staffId, name, department: dept, month: 'July', year: 2024,
    daysPresent: days.filter(d => d.status === 'present').length,
    daysAbsent: days.filter(d => d.status === 'absent').length,
    daysOnLeave: days.filter(d => d.status === 'on_leave').length,
    totalOvertimeHours: days.reduce((a, d) => a + d.overtimeHours, 0),
    approvedOvertimeHours: days.filter(d => d.overtimeApproval === 'approved').reduce((a, d) => a + d.overtimeHours, 0),
    daysOnSite: days.filter(d => d.onSite).length,
  }
  void workdays
}

export const attendanceByStaff: Record<string, DayAttendance[]> = {
  'FO-002': attendance_FO002,
  'FO-005': attendance_FO005,
  'FO-003': attendance_FO003,
}

export const monthlyAttendanceSummaries: MonthlyAttendanceSummary[] = staff
  .filter(s => s.status === 'active')
  .map(s => {
    const days = attendanceByStaff[s.staffId] || buildJuly2024({})
    return summarise(s.staffId, s.name, s.department, days)
  })

// ── Leave Types ────────────────────────────────────────────────────────────────

export const leaveTypes: LeaveType[] = [
  { id: 'annual', name: 'Annual Leave', entitlementDays: 21, paid: true, requiresDocument: false },
  { id: 'sick', name: 'Sick Leave', entitlementDays: 14, paid: true, requiresDocument: true },
  { id: 'maternity', name: 'Maternity Leave', entitlementDays: 84, paid: true, requiresDocument: true },
  { id: 'paternity', name: 'Paternity Leave', entitlementDays: 7, paid: true, requiresDocument: false },
  { id: 'unpaid', name: 'Unpaid Leave', entitlementDays: 30, paid: false, requiresDocument: false },
  { id: 'compassionate', name: 'Compassionate Leave', entitlementDays: 5, paid: true, requiresDocument: true },
]

export const leaveRequests: LeaveRequest[] = [
  {
    id: 'LR001', staffId: 'FO-002', staffName: 'Adeyemi Oluwaseun', department: 'Human Resources',
    staffPhoto: 'https://i.pravatar.cc/150?img=47', type: 'Annual Leave',
    startDate: '2024-07-15', endDate: '2024-07-16', days: 2, reason: 'Family holiday to Abuja.',
    status: 'approved', submittedAt: '2024-07-10 14:30', approvedBy: 'Chidi Okonkwo',
  },
  {
    id: 'LR002', staffId: 'FO-007', staffName: 'Amina Yusuf', department: 'Marketing',
    staffPhoto: 'https://i.pravatar.cc/150?img=41', type: 'Sick Leave',
    startDate: '2024-07-29', endDate: '2024-07-31', days: 3, reason: 'Doctor-certified illness. Medical note attached.',
    status: 'pending', submittedAt: '2024-07-28 09:15',
  },
  {
    id: 'LR003', staffId: 'FO-009', staffName: 'Chidinma Eze', department: 'Operations',
    staffPhoto: 'https://i.pravatar.cc/150?img=45', type: 'Annual Leave',
    startDate: '2024-08-05', endDate: '2024-08-09', days: 5, reason: 'Annual vacation.',
    status: 'pending', submittedAt: '2024-07-25 11:00',
  },
  {
    id: 'LR004', staffId: 'FO-010', staffName: 'Segun Afolabi', department: 'Information Technology',
    staffPhoto: 'https://i.pravatar.cc/150?img=53', type: 'Compassionate Leave',
    startDate: '2024-07-18', endDate: '2024-07-19', days: 2, reason: 'Bereavement — family loss.',
    status: 'approved', submittedAt: '2024-07-17 08:00', approvedBy: 'Adeyemi Oluwaseun',
  },
  {
    id: 'LR005', staffId: 'FO-012', staffName: 'Musa Abdullahi', department: 'Sales',
    staffPhoto: 'https://i.pravatar.cc/150?img=57', type: 'Annual Leave',
    startDate: '2024-07-22', endDate: '2024-07-26', days: 5, reason: 'Planned annual leave.',
    status: 'rejected', submittedAt: '2024-07-15 16:45', approvedBy: 'Adeyemi Oluwaseun',
    note: 'Cannot approve during Q3 sales push period. Please reschedule to August.',
  },
]

export const staffLeaveBalances: LeaveBalance[] = [
  { typeId: 'annual', typeName: 'Annual Leave', entitlement: 21, used: 5, remaining: 16 },
  { typeId: 'sick', typeName: 'Sick Leave', entitlement: 14, used: 0, remaining: 14 },
  { typeId: 'compassionate', typeName: 'Compassionate Leave', entitlement: 5, used: 0, remaining: 5 },
  { typeId: 'unpaid', typeName: 'Unpaid Leave', entitlement: 30, used: 0, remaining: 30 },
]
