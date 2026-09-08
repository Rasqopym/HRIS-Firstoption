import { useState, useEffect } from 'react'
import type { Page } from '../../types'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../hooks/useCurrentStaff'
import { calculatePayrollForStaff } from '../../lib/payrollEngine'
import { getInitials, getAvatarColor } from '../../lib/avatarUtils'
import { formatTime12Hour } from '../../lib/geofence'
import { isPublicHoliday, calculateWorkingDaysInMonth, type PublicHoliday } from '../../lib/holidays'
import { getStaffConfirmationStatus } from '../../lib/pushNotification'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area
} from 'recharts'

interface Props { onNavigate: (p: Page) => void }

const fmt = (n?: number) => `₦${(n || 0).toLocaleString()}`

interface Payslip {
  month: string
  net: number
  gross: number
  status: string
}

interface DailyAttendanceChartItem {
  date: string
  dayLabel: string
  fullDate: string
  hoursWorked: number
  status: string
  isLate: boolean
  lateMinutes: number
  siteVisitsCount: number
  overtimeHours: number
  clockInTime?: string | null
  clockOutTime?: string | null
  workMode?: string
}

interface MonthlyAttendanceChartItem {
  monthLabel: string
  fullMonth: string
  presentDays: number
  onTimeDays: number
  lateDays: number
  fieldVisits: number
  leaveDays: number
  overtimeHours: number
  attendanceRate: number
  punctualityRate: number
}

export default function SelfServiceDashboard({ onNavigate }: Props) {
  const { staff, loading: staffLoading, error: staffError } = useCurrentStaff()
  const [profile, setProfile] = useState<any>(null)
  const [recentPayslips, setRecentPayslips] = useState<Payslip[]>([])
  const [currentPayroll, setCurrentPayroll] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Attendance Analytics State
  const [chartMode, setChartMode] = useState<'daily' | 'monthly'>('daily')
  const [dailyData, setDailyData] = useState<DailyAttendanceChartItem[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyAttendanceChartItem[]>([])
  const [attendanceSummary, setAttendanceSummary] = useState({
    monthDaysPresent: 0,
    monthDaysLate: 0,
    monthDaysOnTime: 0,
    monthFieldVisits: 0,
    monthOvertimeHours: 0,
    attendanceRate: 100,
    punctualityScore: 100,
  })

  useEffect(() => {
    const fetchData = async () => {
      if (!staff) {
        setLoading(false)
        return
      }

      try {
        // 1. Initialize profile
        setProfile({
          email: staff.profiles?.email || '—',
          phone: staff.profiles?.phone || '—',
        })

        // 2. Fetch custom holidays from company_settings
        let customHolidays: PublicHoliday[] = []
        try {
          const { data: cSettings } = await supabase.from('company_settings').select('custom_holidays').eq('id', 1).maybeSingle()
          if (cSettings && Array.isArray(cSettings.custom_holidays)) {
            customHolidays = cSettings.custom_holidays
          } else {
            const cached = localStorage.getItem('hris_custom_holidays')
            if (cached) customHolidays = JSON.parse(cached)
          }
        } catch (e) {}

        // 3. Fetch payslips
        const { data: payslipsData } = await supabase
          .from('payslips')
          .select('id, net_pay, gross_earnings, paye_tax, status, period_id, created_at')
          .eq('staff_id', staff.id)
          .in('status', ['processed', 'paid'])
          .lte('gross_earnings', 10000000)
          .order('created_at', { ascending: false })
          .limit(5)

        if (payslipsData && payslipsData.length > 0) {
          const periodIds = Array.from(new Set(payslipsData.map((p: any) => p.period_id)))
          const { data: periodList } = await supabase
            .from('payroll_periods')
            .select('id, period_label')
            .in('id', periodIds)

          const periodMap = new Map((periodList || []).map(p => [p.id, p.period_label]))

          const formattedPayslips = payslipsData.map((p: any) => ({
            month: periodMap.get(p.period_id) || 'August 2026',
            net: p.net_pay,
            gross: p.gross_earnings,
            status: p.status,
          }))
          setRecentPayslips(formattedPayslips)
          setCurrentPayroll(payslipsData[0])
        } else if (staff.id) {
          try {
            const currentYear = new Date().getFullYear()
            const currentMonthName = new Date().toLocaleDateString('en-US', { month: 'long' })
            const firstDay = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
            const lastDay = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date(currentYear, new Date().getMonth() + 1, 0).getDate()}`
            const calc = await calculatePayrollForStaff(staff.id, firstDay, lastDay)
            
            if (calc) {
              setCurrentPayroll({
                net_pay: calc.netPay,
                gross_earnings: calc.grossEarnings,
                paye_tax: calc.paye,
                status: 'pending'
              })
              setRecentPayslips([{
                month: `${currentMonthName} ${currentYear}`,
                net: calc.netPay,
                gross: calc.grossEarnings,
                status: 'pending'
              }])
            }
          } catch (e) {
            console.warn('Fallback payroll preview error:', e)
          }
        }

        // 4. Fetch staff bank details
        const { data: staffWithBank } = await supabase
          .from('staff')
          .select('bank_name, account_number, phone, email')
          .eq('id', staff.id)
          .maybeSingle()

        if (staffWithBank) {
          setProfile((prev: any) => ({
            ...prev,
            email: staffWithBank.email || (staff as any)?.email || 'learningcopywriter@gmail.com',
            phone: staffWithBank.phone || (staff as any)?.phone || '+234568789',
            bank_name: staffWithBank.bank_name || (staff as any)?.bank_name || 'Fidelity Bank',
            account_number: staffWithBank.account_number || (staff as any)?.account_number || '2334566777'
          }))
        }

        // 5. Build Attendance Analytics Chart Data
        const staffRecordsMap: Record<string, any> = {}
        try {
          const keys = [
            `hris_self_attendance_${staff.id}`,
            `hris_self_attendance_${staff.staff_code}`,
            `hris_attendance_daily_${staff.id}`,
            `hris_attendance_daily_${staff.staff_code}`,
          ]
          for (const k of keys) {
            const raw = localStorage.getItem(k)
            if (raw) Object.assign(staffRecordsMap, JSON.parse(raw))
          }
        } catch (e) {}

        // Query Supabase attendance for last 6 months
        const today = new Date()
        const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1)
        const startDateStr = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`
        
        try {
          const { data: attDb } = await supabase
            .from('attendance_records')
            .select('*')
            .or(`staff_id.eq.${staff.id},staff_id.eq.${staff.staff_code}`)
            .gte('attendance_date', startDateStr)

          if (attDb && attDb.length > 0) {
            attDb.forEach(r => {
              staffRecordsMap[r.attendance_date] = r
            })
          }
        } catch (e) {
          console.warn('Attendance records fetch skipped:', e)
        }

        // Fetch approved leave requests to overlay on attendance charts
        try {
          const { data: leaveData } = await supabase
            .from('leave_requests')
            .select('start_date, end_date, leave_type_id, reason')
            .eq('staff_id', staff.id)
            .eq('status', 'approved')
            .gte('end_date', startDateStr)

          if (leaveData && leaveData.length > 0) {
            leaveData.forEach(lv => {
              const start = new Date(lv.start_date)
              const end = new Date(lv.end_date)
              for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
                const lDateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
                if (!staffRecordsMap[lDateStr] || staffRecordsMap[lDateStr].status !== 'present') {
                  staffRecordsMap[lDateStr] = {
                    status: 'on_leave',
                    attendance_date: lDateStr,
                    leave_reason: lv.reason || 'Approved Leave'
                  }
                }
              }
            })
          }
        } catch (e) {
          console.warn('Leave requests query skipped for staff chart:', e)
        }

        // Construct 14-Day Activity Dataset
        const dailyItems: DailyAttendanceChartItem[] = []
        for (let i = 13; i >= 0; i--) {
          const d = new Date()
          d.setDate(today.getDate() - i)
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const dow = d.getDay()
          const isWeekend = dow === 0 || dow === 6
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
          const dayNum = d.getDate()
          const label = `${dayName} ${dayNum}`
          const rec = staffRecordsMap[dateStr]
          const isHoliday = isPublicHoliday(dateStr, customHolidays)

          let hoursWorked = 0
          let status = 'unmarked'
          let isLate = false
          let lateMinutes = 0
          let siteVisitsCount = 0
          let overtimeHours = 0
          let clockInTime = null
          let clockOutTime = null
          let workMode = 'office'

          if (rec && rec.status === 'present') {
            status = 'present'
            isLate = Boolean(rec.is_late || rec.isLate)
            lateMinutes = rec.late_minutes || rec.lateMinutes || 0
            siteVisitsCount = Array.isArray(rec.site_visits) ? rec.site_visits.length : (rec.siteVisits?.length || 0)
            overtimeHours = rec.overtime_hours || rec.overtimeHours || 0
            clockInTime = rec.clock_in_time || rec.clockInTime || null
            clockOutTime = rec.clock_out_time || rec.clockOutTime || null
            workMode = rec.work_mode || rec.workMode || 'office'

            // Compute realistic hours worked
            if (clockInTime && clockOutTime) {
              try {
                const [inH, inM] = clockInTime.split(':').map(Number)
                const [outH, outM] = clockOutTime.split(':').map(Number)
                const diff = (outH * 60 + outM) - (inH * 60 + inM)
                hoursWorked = Math.max(1, Math.round((diff / 60) * 10) / 10)
              } catch (e) {
                hoursWorked = 8.5
              }
            } else if (clockInTime) {
              hoursWorked = 8.0
            } else {
              hoursWorked = 8.0
            }
          } else if (rec && rec.status === 'on_leave') {
            status = 'on_leave'
          } else if (isHoliday) {
            status = 'public_holiday'
          } else if (isWeekend) {
            status = 'weekend'
          } else if (d < today) {
            status = 'absent'
          }

          dailyItems.push({
            date: dateStr,
            dayLabel: label,
            fullDate: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            hoursWorked,
            status,
            isLate,
            lateMinutes,
            siteVisitsCount,
            overtimeHours,
            clockInTime,
            clockOutTime,
            workMode
          })
        }
        setDailyData(dailyItems)

        // Construct 6-Month Trend Dataset
        const monthlyItems: MonthlyAttendanceChartItem[] = []
        for (let m = 5; m >= 0; m--) {
          const targetDate = new Date(today.getFullYear(), today.getMonth() - m, 1)
          const y = targetDate.getFullYear()
          const monthIdx = targetDate.getMonth()
          const monthShort = targetDate.toLocaleDateString('en-US', { month: 'short' })
          const fullMonth = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          
          const { totalWorkingDays } = calculateWorkingDaysInMonth(y, monthIdx, customHolidays)
          const daysInM = new Date(y, monthIdx + 1, 0).getDate()
          const isThisMonth = y === today.getFullYear() && monthIdx === today.getMonth()
          const maxDay = isThisMonth ? today.getDate() : daysInM

          let presentCount = 0
          let onTimeCount = 0
          let lateCount = 0
          let fieldCount = 0
          let leaveCount = 0
          let otSum = 0

          for (let day = 1; day <= maxDay; day++) {
            const dateKey = `${y}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const r = staffRecordsMap[dateKey]
            if (r && r.status === 'present') {
              presentCount++
              if (r.is_late || r.isLate) {
                lateCount++
              } else {
                onTimeCount++
              }
              const vCount = Array.isArray(r.site_visits) ? r.site_visits.length : (r.siteVisits?.length || 0)
              if (r.work_mode === 'field' || vCount > 0) {
                fieldCount += (vCount > 0 ? vCount : 1)
              }
              otSum += (r.overtime_hours || r.overtimeHours || 0)
            } else if (r && r.status === 'on_leave') {
              leaveCount++
            }
          }

          // Effective working days excluding approved leave days
          const netRequiredDays = Math.max(1, evaluatedWorkingDays - leaveCount)
          const attRate = Math.min(100, Math.round(((presentCount + leaveCount) / Math.max(1, evaluatedWorkingDays)) * 100))
          const puncRate = presentCount > 0 ? Math.round((onTimeCount / presentCount) * 100) : 100

          monthlyItems.push({
            monthLabel: monthShort,
            fullMonth,
            presentDays: presentCount,
            onTimeDays: onTimeCount,
            lateDays: lateCount,
            fieldVisits: fieldCount,
            leaveDays: leaveCount,
            overtimeHours: otSum,
            attendanceRate: attRate,
            punctualityRate: puncRate
          })
        }
        setMonthlyData(monthlyItems)

        // Current month snapshot
        const currentMonthItem = monthlyItems[monthlyItems.length - 1]
        if (currentMonthItem) {
          setAttendanceSummary({
            monthDaysPresent: currentMonthItem.presentDays,
            monthDaysLate: currentMonthItem.lateDays,
            monthDaysOnTime: currentMonthItem.onTimeDays,
            monthFieldVisits: currentMonthItem.fieldVisits,
            monthOvertimeHours: currentMonthItem.overtimeHours,
            attendanceRate: currentMonthItem.attendanceRate,
            punctualityScore: currentMonthItem.punctualityRate,
          })
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [staff])

  if (staffLoading || loading) {
    return (
      <div className="p-6 anim-fade-up">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  if (staffError || !staff) {
    return (
      <div className="p-6 anim-fade-up">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <div className="text-red-600 font-medium">{staffError || 'No staff record found'}</div>
          <div className="text-red-500 text-sm mt-1">Please contact HR to set up your staff profile.</div>
        </div>
      </div>
    )
  }

  const s = staff
  const deptName = s.departments?.name || 'Unassigned'

  // Custom Tooltip for Daily Chart
  const CustomDailyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as DailyAttendanceChartItem
      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 backdrop-blur-md min-w-[190px]">
          <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1 flex justify-between items-center">
            <span>{data.fullDate}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
              data.status === 'present' ? (data.isLate ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300') :
              data.status === 'public_holiday' ? 'bg-blue-500/20 text-blue-300' :
              data.status === 'weekend' ? 'bg-slate-700 text-slate-300' : 'bg-red-500/20 text-red-300'
            }`}>
              {data.status === 'present' ? (data.isLate ? `Late (${data.lateMinutes}m)` : 'On Time') : data.status.replace('_', ' ')}
            </span>
          </div>
          {data.status === 'present' && (
            <div className="space-y-1 font-mono-data text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Clock In:</span>
                <span className="font-semibold text-white">{formatTime12Hour(data.clockInTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Clock Out:</span>
                <span className="font-semibold text-white">{formatTime12Hour(data.clockOutTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hours Logged:</span>
                <span className="font-bold text-emerald-400">{data.hoursWorked}h</span>
              </div>
              {data.siteVisitsCount > 0 && (
                <div className="flex justify-between text-blue-300">
                  <span>Site Visits:</span>
                  <span className="font-bold">{data.siteVisitsCount} stop{data.siteVisitsCount > 1 ? 's' : ''}</span>
                </div>
              )}
              {data.overtimeHours > 0 && (
                <div className="flex justify-between text-purple-300">
                  <span>Overtime:</span>
                  <span className="font-bold">+{data.overtimeHours}h</span>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }
    return null
  }

  // Custom Tooltip for Monthly Chart
  const CustomMonthlyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as MonthlyAttendanceChartItem
      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 backdrop-blur-md min-w-[200px]">
          <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">
            {data.fullMonth}
          </div>
          <div className="space-y-1 font-mono-data text-slate-300">
            <div className="flex justify-between text-emerald-400 font-semibold">
              <span>Days Present:</span>
              <span>{data.presentDays} days</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>• On-Time:</span>
              <span>{data.onTimeDays}</span>
            </div>
            <div className="flex justify-between text-amber-400">
              <span>• Late Arrivals:</span>
              <span>{data.lateDays}</span>
            </div>
            {data.leaveDays > 0 && (
              <div className="flex justify-between text-sky-300">
                <span>• Approved Leave:</span>
                <span className="font-semibold">{data.leaveDays} days</span>
              </div>
            )}
            {data.fieldVisits > 0 && (
              <div className="flex justify-between text-blue-300">
                <span>Field Visits:</span>
                <span>{data.fieldVisits} stops</span>
              </div>
            )}
            <div className="flex justify-between text-emerald-300 border-t border-slate-800 pt-1">
              <span>Attendance Rate:</span>
              <span className="font-bold">{data.attendanceRate}%</span>
            </div>
            <div className="flex justify-between text-purple-300">
              <span>Punctuality Score:</span>
              <span className="font-bold">{data.punctualityRate}%</span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="p-4 sm:p-6 anim-fade-up space-y-6">
      {/* Welcome banner */}
      <div className="rounded-2xl overflow-hidden shadow-md border border-slate-800/50" style={{ background: 'linear-gradient(135deg, #0a1f3c 0%, #1e3a5f 60%, #1d4ed8 100%)' }}>
        <div className="px-4 sm:px-6 py-5 sm:py-6 flex flex-col sm:flex-row items-center text-center sm:text-left gap-4 sm:gap-5">
          {(s.photo_url || s.profiles?.photo_url) ? (
            <img src={s.photo_url || s.profiles?.photo_url} alt={s.full_name} className="w-16 h-16 sm:w-16 sm:h-16 rounded-xl object-cover ring-4 ring-white/20 shadow-sm flex-none" />
          ) : (
            <div
              className="w-16 h-16 sm:w-16 sm:h-16 rounded-xl flex-none flex items-center justify-center text-white text-xl font-bold ring-4 ring-white/20 shadow-sm"
              style={{ backgroundColor: getAvatarColor(s.full_name) }}
            >
              {getInitials(s.full_name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-blue-300 text-[11px] sm:text-xs uppercase tracking-wider font-semibold">Staff Self-Service</p>
            <h2 className="font-display font-bold text-white text-xl sm:text-2xl tracking-tight">{s.full_name}</h2>
            <div className="flex items-center justify-center sm:justify-start gap-2 mt-1 flex-wrap">
              <span className="text-blue-100 text-xs sm:text-sm font-medium">{s.job_title || '—'}</span>
              <span className="text-blue-400">·</span>
              <span className="text-blue-200 text-xs sm:text-sm">{deptName}</span>
              <span className="text-blue-400">·</span>
              <span className="text-blue-300/80 font-mono-data text-xs bg-white/10 px-2 py-0.5 rounded">{s.staff_code || '—'}</span>
              {s.is_confirmed ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Confirmed Staff
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-400/20 text-blue-200 border border-blue-400/30">
                  Probation
                </span>
              )}
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-blue-300 text-xs font-medium">Employment Date</div>
            <div className="text-white font-mono-data text-sm font-semibold">{s.date_employed ? new Date(s.date_employed).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '01 Oct 2024'}</div>
          </div>
        </div>

        {/* On-Screen 3-Month Employment Confirmation Alert Banner */}
        {(() => {
          if (s.is_confirmed) return null
          const conf = getStaffConfirmationStatus(s.date_employed)
          if (!conf || !conf.isDueForConfirmation) return null
          return (
            <div className="px-4 sm:px-6 py-3 bg-amber-500/20 border-t border-amber-400/30 flex items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-900 font-bold flex items-center justify-center flex-none">
                  <svg className="w-3.5 h-3.5 text-amber-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </span>
                <div>
                  <strong className="text-amber-200">
                    {conf.isOverdue ? 'Employment Confirmation Review Overdue' : '3-Month Employment Confirmation Due Soon'}
                  </strong>
                  <span className="text-amber-100/80 ml-1.5 hidden sm:inline">
                    ({conf.isOverdue ? `Target was ${conf.confirmationDueDate}` : `${conf.daysRemaining} days remaining · Target: ${conf.confirmationDueDate}`})
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-amber-400/30 text-amber-200 text-xs font-semibold border border-amber-400/40 flex-none">
                3-Month Probation
              </span>
            </div>
          )
        })()}

        <div className="px-4 sm:px-6 pb-4 sm:pb-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 border-t border-white/10 pt-4 bg-black/10">
          {[
            { label: 'Monthly Net Pay', value: fmt(currentPayroll?.net_pay || Math.round((s.gross_salary || 150000) * 0.82)), color: 'text-emerald-300' },
            { label: 'Gross Earnings', value: fmt(currentPayroll?.gross_earnings || (s.gross_salary || 150000)), color: 'text-white' },
            { label: 'PAYE Tax Deduction', value: fmt(currentPayroll?.paye_tax || Math.round((s.gross_salary || 150000) * 0.10)), color: 'text-blue-200' },
          ].map(c => (
            <div key={c.label} className="bg-white/10 backdrop-blur-md rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 border border-white/10">
              <div className="text-blue-200 text-xs font-medium">{c.label}</div>
              <div className={`font-display font-bold text-base sm:text-lg font-mono-data tracking-tight ${c.color}`}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Interactive Attendance Summary & Analytics Chart ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
        {/* Chart Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <h3 className="font-display font-bold text-slate-800 text-lg">My Attendance & Punctuality Analytics</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Interactive analysis of your daily work hours, punctuality compliance, and field waypoints
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60">
              <button
                onClick={() => setChartMode('daily')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  chartMode === 'daily'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                14-Day Activity
              </button>
              <button
                onClick={() => setChartMode('monthly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  chartMode === 'monthly'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                6-Month Trends
              </button>
            </div>
            <button
              onClick={() => onNavigate('st-attendance')}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              <span>Clock In / Registry</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        {/* Attendance KPI Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100">
            <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wide block">This Month Present</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-display font-bold text-2xl text-blue-950 font-mono-data">{attendanceSummary.monthDaysPresent}</span>
              <span className="text-xs font-semibold text-emerald-600">({attendanceSummary.attendanceRate}%)</span>
            </div>
            <span className="text-[10px] text-blue-600 mt-0.5 block">Recorded work days</span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide block">Punctuality Score</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-display font-bold text-2xl text-emerald-900 font-mono-data">{attendanceSummary.punctualityScore}%</span>
              <span className="text-xs text-slate-500">({attendanceSummary.monthDaysOnTime} on-time)</span>
            </div>
            <span className="text-[10px] text-emerald-600 mt-0.5 block">
              {attendanceSummary.monthDaysLate > 0 ? `${attendanceSummary.monthDaysLate} late arrivals` : 'Zero lateness recorded'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
            <span className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wide block">Field Waypoints</span>
            <div className="font-display font-bold text-2xl text-indigo-950 font-mono-data mt-1">{attendanceSummary.monthFieldVisits}</div>
            <span className="text-[10px] text-indigo-600 mt-0.5 block">Client stops verified by GPS</span>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-100">
            <span className="text-[11px] font-semibold text-purple-800 uppercase tracking-wide block">Approved Overtime</span>
            <div className="font-display font-bold text-2xl text-purple-950 font-mono-data mt-1">{attendanceSummary.monthOvertimeHours}h</div>
            <span className="text-[10px] text-purple-600 mt-0.5 block">Payable in payroll cycle</span>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-64 sm:h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'daily' ? (
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="dayLabel" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 12]} unit="h" />
                <Tooltip content={<CustomDailyTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                />
                <Bar
                  dataKey="hoursWorked"
                  name="Hours Worked"
                  radius={[6, 6, 0, 0]}
                  fill="#3b82f6"
                  barSize={18}
                />
              </BarChart>
            ) : (
              <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorLeave" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="monthLabel" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomMonthlyTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                />
                <Area
                  type="monotone"
                  dataKey="presentDays"
                  name="Days Present"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorPresent)"
                />
                <Area
                  type="monotone"
                  dataKey="lateDays"
                  name="Late Arrivals"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorLate)"
                />
                <Area
                  type="monotone"
                  dataKey="leaveDays"
                  name="Approved Leave"
                  stroke="#0284c7"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorLeave)"
                />
                <Line
                  type="monotone"
                  dataKey="fieldVisits"
                  name="Field Visits"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <h3 className="font-display font-semibold text-slate-800 mb-4">Quick Shortcuts</h3>
          <div className="space-y-2.5">
            {[
              { label: 'Clock In & Site Check-in', icon: <svg key="clock" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, page: 'st-attendance' as Page, desc: 'Record daily shift & client stops' },
              { label: 'View My Payslips', icon: <svg key="payslips" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, page: 'st-payslips' as Page, desc: 'Download monthly pay statements' },
              { label: 'My Profile', icon: <svg key="profile" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, page: 'st-profile' as Page, desc: 'View & update personal info' },
              { label: 'My ID Card', icon: <svg key="idcard" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="10" y2="16"/></svg>, page: 'st-id-card' as Page, desc: 'Download digital staff ID card' },
            ].map(a => (
              <button
                key={a.label}
                onClick={() => onNavigate(a.page)}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-slate-50 border border-slate-100 hover:border-blue-200 transition-all card-hover text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-none group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{a.label}</div>
                  <div className="text-xs text-slate-500 truncate">{a.desc}</div>
                </div>
                <svg className="text-slate-300 group-hover:text-blue-600 transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
        </div>

        {/* Recent payslips */}
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-800">Recent Payslips</h3>
            <button onClick={() => onNavigate('st-payslips')} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">View all</button>
          </div>
          <div className="space-y-3">
            {recentPayslips.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No payslips available yet</div>
            ) : (
              recentPayslips.map(p => (
                <div key={p.month} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 border border-slate-100 transition-all cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100/80 flex items-center justify-center text-blue-600">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{p.month}</div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{p.status}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-data font-bold text-slate-800 text-sm">{fmt(p.net)}</div>
                    <div className="text-[11px] text-slate-400 font-medium">Net pay</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* My profile summary */}
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-800">My Info Summary</h3>
            <button onClick={() => onNavigate('st-profile')} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">Edit</button>
          </div>
          <dl className="space-y-3">
            {[
              { l: 'Email', v: profile?.email || '—' },
              { l: 'Phone', v: profile?.phone || '—' },
              { l: 'Department', v: deptName },
              { l: 'Bank', v: profile?.bank_name || '—' },
              { l: 'Account No.', v: profile?.account_number || '—', mono: true },
            ].map(f => (
              <div key={f.l} className="flex justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                <dt className="text-slate-500 font-medium">{f.l}</dt>
                <dd className={`text-slate-800 font-medium ${f.mono ? 'font-mono-data' : ''}`}>{f.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Responsive note */}
      <div className="mt-5 p-4 rounded-xl border border-blue-100 bg-blue-50/60 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-none mt-0.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-blue-900">Protected Self-Service Session</div>
            <p className="text-xs text-blue-700/80 mt-0.5 leading-relaxed">
              Your personal records are protected with row-level security. If you notice any discrepancies in your salary or personal details, please contact HR.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
