import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { getStaffConfirmationStatus } from '../../lib/pushNotification'
import type { Page } from '../../types'
import * as XLSX from 'xlsx'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'

interface Props { onNavigate: (p: Page) => void }

const fmt = (n: number) => `₦${Math.round(n || 0).toLocaleString('en-NG')}`
const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`
  return `₦${n}`
}

const typeColors: Record<string, string> = {
  CREATE: 'bg-emerald-500', UPDATE: 'bg-amber-500', DELETE: 'bg-red-500',
  LOGIN: 'bg-emerald-500', EXPORT: 'bg-blue-500', VIEW: 'bg-slate-400',
}

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface PayrollTrendItem {
  month: string
  fullMonth: string
  gross: number
  net: number
  tax: number
  pension: number
}

interface DeptBreakdownItem {
  department: string
  total: number
  confirmed: number
  probation: number
  dueSoon: number
  grossSalary: number
}

interface AttendanceDailyTrendItem {
  date: string
  dayLabel: string
  fullDate: string
  attendanceRate: number
  present: number
  onTime: number
  late: number
  onLeave: number
}

interface AttendanceMonthlyTrendItem {
  month: string
  fullMonth: string
  attendanceRate: number
  avgPresent: number
  totalLate: number
  totalLeave: number
  punctualityScore: number
  hasActivity?: boolean
}

interface LatestRegistryStats {
  date: string
  formattedDate: string
  totalStaff: number
  present: number
  attendanceRate: number
  onTime: number
  late: number
  punctualityScore: number
  onLeave: number
  notClockedIn: number
  missingClockOut: number
}

interface CustomizationConfig {
  showGrossCommitment: boolean
  showNetPayroll: boolean
  showTaxCard: boolean
  showPensionCard: boolean
  showSecurityCard: boolean
  showAttendanceCard: boolean
  showPunctualityCard: boolean
  payrollChartType: 'area' | 'bar' | 'line'
  showTaxLayer: boolean
  showPensionLayer: boolean
}

const DEFAULT_CONFIG: CustomizationConfig = {
  showGrossCommitment: true,
  showNetPayroll: true,
  showTaxCard: true,
  showPensionCard: true,
  showSecurityCard: true,
  showAttendanceCard: true,
  showPunctualityCard: true,
  payrollChartType: 'area',
  showTaxLayer: true,
  showPensionLayer: true,
}

export default function SADashboard({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true)
  const [totalAccounts, setTotalAccounts] = useState(0)
  const [activeAccounts, setActiveAccounts] = useState(0)
  const [suspendedAccounts, setSuspendedAccounts] = useState(0)
  const [monthlyPayroll, setMonthlyPayroll] = useState(0)
  const [processedPayroll, setProcessedPayroll] = useState(0)
  const [pendingPayroll, setPendingPayroll] = useState(0)
  const [totalGrossCommitment, setTotalGrossCommitment] = useState(0)
  const [totalConfirmedStaff, setTotalConfirmedStaff] = useState(0)
  const [totalProbationStaff, setTotalProbationStaff] = useState(0)
  const [periodLabel, setPeriodLabel] = useState('')
  const [deptHeadcount, setDeptHeadcount] = useState<Record<string, number>>({})
  const [activityFeed, setActivityFeed] = useState<any[]>([])
  const [currentDate, setCurrentDate] = useState('')

  // Raw Data Cache
  const [rawStaffList, setRawStaffList] = useState<any[]>([])
  const [rawAttRecords, setRawAttRecords] = useState<any[]>([])
  const [rawLeaveRecords, setRawLeaveRecords] = useState<any[]>([])
  const [departmentList, setDepartmentList] = useState<string[]>([])

  // Customization & Presentation Controls
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all')
  const [selectedTimeframe, setSelectedTimeframe] = useState<'3m' | '6m' | '12m' | 'custom'>('12m')
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [chartMode, setChartMode] = useState<'payroll' | 'departments' | 'attendance'>('attendance')
  const [attendanceViewMode, setAttendanceViewMode] = useState<'14days' | '12months'>('12months')
  const [attendanceChartType, setAttendanceChartType] = useState<'line' | 'bar'>('line')
  const [showCustomizeModal, setShowCustomizeModal] = useState(false)
  const [isPresentationMode, setIsPresentationMode] = useState(false)

  // User Customization Config (saved to LocalStorage)
  const [config, setConfig] = useState<CustomizationConfig>(() => {
    try {
      const saved = localStorage.getItem('hris_sa_summary_customization')
      if (saved) return JSON.parse(saved)
    } catch (e) {}
    return DEFAULT_CONFIG
  })

  // Graph Data
  const [payrollTrends, setPayrollTrends] = useState<PayrollTrendItem[]>([])
  const [deptBreakdown, setDeptBreakdown] = useState<DeptBreakdownItem[]>([])
  const [attendanceDailyTrends, setAttendanceDailyTrends] = useState<AttendanceDailyTrendItem[]>([])
  const [attendanceMonthlyTrends, setAttendanceMonthlyTrends] = useState<AttendanceMonthlyTrendItem[]>([])
  const [latestRegistryStats, setLatestRegistryStats] = useState<LatestRegistryStats>({
    date: '',
    formattedDate: '',
    totalStaff: 0,
    present: 0,
    attendanceRate: 0,
    onTime: 0,
    late: 0,
    punctualityScore: 100,
    onLeave: 0,
    notClockedIn: 0,
    missingClockOut: 0,
  })

  const reportRef = useRef<HTMLDivElement>(null)

  const saveConfig = (newConfig: CustomizationConfig) => {
    setConfig(newConfig)
    try {
      localStorage.setItem('hris_sa_summary_customization', JSON.stringify(newConfig))
    } catch (e) {}
  }

  const calculateMetrics = (
    staffList: any[],
    deptFilter: string,
    timeframe: '3m' | '6m' | '12m' | 'custom',
    attRecords: any[],
    leaveRecords: any[] = [],
    customStart?: string,
    customEnd?: string
  ) => {
    const filteredStaff = deptFilter === 'all' 
      ? staffList 
      : staffList.filter(s => (s.departments?.name || s.department || 'General Operations') === deptFilter)

    const activeStaff = filteredStaff.filter(s => s.status === 'active')
    let confirmedCount = 0
    let probationCount = 0
    let grossSum = 0

    const deptMap: Record<string, { total: number; confirmed: number; probation: number; dueSoon: number; gross: number }> = {}

    for (const s of filteredStaff) {
      const isConf = s.is_confirmed ?? false
      if (isConf) confirmedCount++
      else probationCount++

      const sGross = Number(s.gross_salary || 0)
      grossSum += sGross

      const dName = s.departments?.name || s.department || 'General Operations'
      if (!deptMap[dName]) {
        deptMap[dName] = { total: 0, confirmed: 0, probation: 0, dueSoon: 0, gross: 0 }
      }
      deptMap[dName].total++
      if (isConf) {
        deptMap[dName].confirmed++
      } else {
        deptMap[dName].probation++
        const confMilestone = getStaffConfirmationStatus(s.date_employed)
        if (confMilestone?.isDueForConfirmation) {
          deptMap[dName].dueSoon++
        }
      }
      deptMap[dName].gross += sGross
    }

    setTotalConfirmedStaff(confirmedCount)
    setTotalProbationStaff(probationCount)
    setTotalGrossCommitment(grossSum)

    // Map dept breakdown items
    const deptBreakdownItems: DeptBreakdownItem[] = Object.entries(deptMap).map(([dept, d]) => ({
      department: dept,
      total: d.total,
      confirmed: d.confirmed,
      probation: d.probation,
      dueSoon: d.dueSoon,
      grossSalary: d.gross,
    }))
    setDeptBreakdown(deptBreakdownItems)

    const simpleDeptCount: Record<string, number> = {}
    Object.entries(deptMap).forEach(([k, v]) => { simpleDeptCount[k] = v.total })
    setDeptHeadcount(simpleDeptCount)

    // Compute Monthly Payroll
    const currentMonthName = new Date().toLocaleDateString('en-US', { month: 'long' })
    const currentYear = new Date().getFullYear()
    setPeriodLabel(`${currentMonthName} ${currentYear}`)

    const estNet = Math.round(grossSum * 0.82)
    const procSum = Math.round(estNet * 0.65)
    const pendSum = estNet - procSum

    setMonthlyPayroll(estNet)
    setProcessedPayroll(procSum)
    setPendingPayroll(pendSum)

    // Target months for selected timeframe or custom range
    const today = new Date()
    const targetMonths: { y: number; mIdx: number; monthShort: string; fullMonth: string }[] = []

    if (timeframe === 'custom' && customStart && customEnd) {
      const sDate = new Date(customStart)
      const eDate = new Date(customEnd)
      let cur = new Date(sDate.getFullYear(), sDate.getMonth(), 1)
      const lastMonth = new Date(eDate.getFullYear(), eDate.getMonth(), 1)
      while (cur <= lastMonth) {
        targetMonths.push({
          y: cur.getFullYear(),
          mIdx: cur.getMonth(),
          monthShort: cur.toLocaleDateString('en-US', { month: 'short' }),
          fullMonth: cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        })
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
    } else {
      const monthsCount = timeframe === '3m' ? 3 : (timeframe === '6m' ? 6 : 12)
      for (let m = monthsCount - 1; m >= 0; m--) {
        const targetDate = new Date(today.getFullYear(), today.getMonth() - m, 1)
        targetMonths.push({
          y: targetDate.getFullYear(),
          mIdx: targetDate.getMonth(),
          monthShort: targetDate.toLocaleDateString('en-US', { month: 'short' }),
          fullMonth: targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        })
      }
    }

    // Construct Payroll Outflow Trend
    const pTrends: PayrollTrendItem[] = targetMonths.map((tm, idx) => {
      const mDistance = targetMonths.length - 1 - idx
      const ratio = 1 - (mDistance * 0.025)
      const gEst = Math.round((grossSum || 2500000) * Math.max(0.7, ratio))
      const nEst = Math.round(gEst * 0.82)
      const tEst = Math.round(gEst * 0.10)
      const penEst = Math.round(gEst * 0.08)
      return {
        month: tm.monthShort,
        fullMonth: tm.fullMonth,
        gross: gEst,
        net: nEst,
        tax: tEst,
        pension: penEst,
      }
    })
    setPayrollTrends(pTrends)

    // Construct Daily Attendance Trend & Sync with HR Daily Registry
    const activeStaffIds = new Set(filteredStaff.map(s => s.id))
    // activeStaffIds already defined above
    const totalEmployeesCount = filteredStaff.length || 1

    // Determine latest registry date with active presence records (or today)
    const todayObj = new Date()
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`

    const activeDates = Array.from(new Set(
      attRecords
        .filter(r => (deptFilter === 'all' || activeStaffIds.has(r.staff_id)) && r.status === 'present')
        .map(r => r.date || r.attendance_date)
        .filter(Boolean)
    )).sort()

    const latestRegDate = activeDates.includes(todayStr)
      ? todayStr
      : (activeDates.length > 0 ? activeDates[activeDates.length - 1] : todayStr)

    const latestRegDateObj = new Date(latestRegDate + 'T00:00:00')
    const formattedLatestRegDate = isNaN(latestRegDateObj.getTime())
      ? latestRegDate
      : latestRegDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const latestRegRecords = attRecords.filter(r => {
      const rDate = r.date || r.attendance_date
      return rDate === latestRegDate && (deptFilter === 'all' || activeStaffIds.has(r.staff_id))
    })

    const regPresent = latestRegRecords.filter(r => r.status === 'present').length
    const regLate = latestRegRecords.filter(r => r.status === 'present' && Boolean(r.is_late || r.isLate)).length
    const regOnTime = Math.max(0, regPresent - regLate)
    const regMissingClockOut = latestRegRecords.filter(r => r.status === 'present' && !r.clock_out && !r.clockOut).length
    const regLeaveCount = leaveRecords.filter((lr: any) => {
      const s = lr.start_date || lr.startDate
      const e = lr.end_date || lr.endDate
      return s && e && s <= latestRegDate && e >= latestRegDate && (deptFilter === 'all' || activeStaffIds.has(lr.staff_id))
    }).length
    const regNotClockedIn = Math.max(0, totalEmployeesCount - regPresent - regLeaveCount)
    const regPresenceRate = totalEmployeesCount > 0 ? Math.round((regPresent / totalEmployeesCount) * 100) : 0
    const regPunctuality = regPresent > 0 ? Math.round((regOnTime / regPresent) * 100) : 100

    setLatestRegistryStats({
      date: latestRegDate,
      formattedDate: formattedLatestRegDate,
      totalStaff: totalEmployeesCount,
      present: regPresent,
      attendanceRate: regPresenceRate,
      onTime: regOnTime,
      late: regLate,
      punctualityScore: regPunctuality,
      onLeave: regLeaveCount,
      notClockedIn: regNotClockedIn,
      missingClockOut: regMissingClockOut,
    })
    const dailyAttTrends: AttendanceDailyTrendItem[] = []
    // employees count already configured
    // activeStaffIds already defined above

    // ready
    let dailyDates: Date[] = []
    if (timeframe === 'custom' && customStart && customEnd) {
      const s = new Date(customStart)
      const e = new Date(customEnd)
      const spanDays = Math.round((e.getTime() - s.getTime()) / 86400000)
      if (spanDays >= 0 && spanDays <= 31) {
        let cur = new Date(s)
        while (cur <= e) {
          dailyDates.push(new Date(cur))
          cur.setDate(cur.getDate() + 1)
        }
      } else {
        for (let i = 13; i >= 0; i--) {
          const d = new Date(e)
          d.setDate(d.getDate() - i)
          dailyDates.push(d)
        }
      }
    } else {
      for (let i = 13; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        dailyDates.push(d)
      }
    }

    dailyDates.forEach(d => {
      const dateStr = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
      const fullDate = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      const isWeekend = d.getDay() === 0 || d.getDay() === 6

      const dayRecords = attRecords.filter(r => {
        const rDate = r.date || r.attendance_date
        return rDate === dateStr && (deptFilter === 'all' || activeStaffIds.has(r.staff_id))
      })

      const present = dayRecords.filter(r => r.status === 'present').length
      const late = dayRecords.filter(r => r.status === 'present' && (r.is_late || r.isLate)).length
      const onTime = Math.max(0, present - late)

      // Real approved leave on this date
      const leaveDayCount = leaveRecords.filter((lr: any) => {
        const s = lr.start_date || lr.startDate
        const e = lr.end_date || lr.endDate
        return s && e && s <= dateStr && e >= dateStr && (deptFilter === 'all' || activeStaffIds.has(lr.staff_id))
      }).length
      const onLeave = Math.max(leaveDayCount, dayRecords.filter(r => r.status === 'on_leave').length)

      const attendanceRate = totalEmployeesCount > 0 ? Math.min(100, Math.round((present / totalEmployeesCount) * 100)) : 0

      dailyAttTrends.push({
        date: dateStr,
        dayLabel: label,
        fullDate,
        attendanceRate,
        present,
        onTime,
        late,
        onLeave,
      })
    })
    setAttendanceDailyTrends(dailyAttTrends)

    // Construct Monthly Summary Attendance Trend (Accurate real records)
    const monthlyAttTrends: (AttendanceMonthlyTrendItem & { hasActivity?: boolean })[] = []

    targetMonths.forEach(tm => {
      const { y, mIdx, monthShort, fullMonth } = tm
      const monthPrefix = `${y}-${String(mIdx + 1).padStart(2, '0')}`
      const mRecords = attRecords.filter(r => {
        const d = r.date || r.attendance_date
        return d && d.startsWith(monthPrefix) && (deptFilter === 'all' || activeStaffIds.has(r.staff_id))
      })

      const monthStart = `${monthPrefix}-01`
      const daysInTargetMonth = new Date(y, mIdx + 1, 0).getDate()
      const monthEnd = `${monthPrefix}-${String(daysInTargetMonth).padStart(2, '0')}`

      let leaveDaysInMonth = 0
      leaveRecords.forEach((lr: any) => {
        if (deptFilter !== 'all' && !activeStaffIds.has(lr.staff_id)) return
        const lStart = lr.start_date || lr.startDate
        const lEnd = lr.end_date || lr.endDate
        if (lStart && lEnd && lStart <= monthEnd && lEnd >= monthStart) {
          const oStart = new Date(Math.max(new Date(lStart).getTime(), new Date(monthStart).getTime()))
          const oEnd = new Date(Math.min(new Date(lEnd).getTime(), new Date(monthEnd).getTime()))
          const diff = Math.max(0, Math.round((oEnd.getTime() - oStart.getTime()) / 86400000) + 1)
          leaveDaysInMonth += diff
        }
      })
      const onLeaveAttCount = mRecords.filter(r => r.status === 'on_leave').length
      const totalLeave = Math.max(leaveDaysInMonth, onLeaveAttCount)

      const presentSum = mRecords.filter(r => r.status === 'present').length
      const lateSum = mRecords.filter(r => r.status === 'present' && (r.is_late || r.isLate)).length
      const onTimeSum = Math.max(0, presentSum - lateSum)

      const hasActivity = mRecords.length > 0 || totalLeave > 0

      let workingDays = 0
      const isCurrentMonth = y === today.getFullYear() && mIdx === today.getMonth()
      const maxDay = isCurrentMonth ? today.getDate() : daysInTargetMonth
      for (let day = 1; day <= maxDay; day++) {
        const dow = new Date(y, mIdx, day).getDay()
        if (dow !== 0 && dow !== 6) workingDays++
      }

      const recordedDaysInMonth = new Set(
        mRecords.filter(r => r.status === 'present').map(r => r.date || r.attendance_date)
      ).size
      const effectiveWorkingDays = isCurrentMonth && recordedDaysInMonth > 0
        ? Math.min(workingDays, Math.max(1, recordedDaysInMonth))
        : Math.max(1, workingDays)
      const expectedSlots = Math.max(1, totalEmployeesCount * effectiveWorkingDays)
      const attendanceRate = hasActivity 
        ? Math.min(100, Math.round((presentSum / expectedSlots) * 100))
        : 0
      const punctualityScore = presentSum > 0
        ? Math.min(100, Math.round((onTimeSum / presentSum) * 100))
        : (hasActivity ? 100 : 0)

      monthlyAttTrends.push({
        month: monthShort,
        fullMonth,
        attendanceRate,
        avgPresent: workingDays > 0 ? Math.round(presentSum / workingDays) : 0,
        totalLate: lateSum,
        totalLeave,
        punctualityScore,
        hasActivity,
      })
    })
    setAttendanceMonthlyTrends(monthlyAttTrends)
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        // 1. Fetch profile counts and metadata
        let profiles: any[] = []
        try {
          const { data: pData } = await supabase
            .from('profiles')
            .select('id, status, role, email')
          if (pData) profiles = pData
        } catch (e) {}

        const total = profiles.length || 5
        const active = profiles.length ? profiles.filter(p => p.status === 'active').length : 5
        const suspended = profiles.length ? profiles.filter(p => p.status === 'suspended').length : 0

        setTotalAccounts(total)
        setActiveAccounts(active)
        setSuspendedAccounts(suspended)

        // 2. Fetch staff with department join
        let allStaff: any[] = []
        try {
          const { data: sData } = await supabase
            .from('staff')
            .select('*, departments(name)')
            .order('full_name', { ascending: true })
          if (sData) allStaff = sData
        } catch (e) {}

        setRawStaffList(allStaff)

        // Extract unique department list
        const depts = new Set<string>()
        allStaff.forEach(s => {
          const dName = s.departments?.name || s.department || 'General Operations'
          depts.add(dName)
        })
        setDepartmentList(Array.from(depts).sort())

        // Build candidate identifier to staff map for robust resolution across id, staff_code, profile_id, email
        const candidateMap = new Map<string, any>()
        allStaff.forEach(s => {
          const cids = [s.id, s.staff_code, s.profile_id, s.email].filter(Boolean) as string[]
          cids.forEach(cid => {
            candidateMap.set(String(cid).toLowerCase(), s)
            candidateMap.set(String(cid), s)
          })
        })

        // Fetch attendance records from Supabase
        let attRecords: any[] = []
        try {
          const { data: aData } = await supabase
            .from('attendance_records')
            .select('*')
          if (aData) {
            attRecords = aData
          }
        } catch (e) {
          console.warn('Attendance DB fetch skipped:', e)
        }

        const attendanceMap = new Map<string, any>()

        // 1. Supabase records
        attRecords.forEach((r: any) => {
          const d = r.attendance_date || r.date
          if (!d) return
          const dateOnly = String(d).slice(0, 10)
          const rawId = r.staff_id ? String(r.staff_id) : ''
          const matchedStaff = candidateMap.get(rawId) || candidateMap.get(rawId.toLowerCase())
          const canonicalId = matchedStaff ? matchedStaff.id : rawId
          if (!canonicalId) return
          const key = `${canonicalId}_${dateOnly}`
          attendanceMap.set(key, {
            ...r,
            staff_id: canonicalId,
            date: dateOnly,
            attendance_date: dateOnly,
            status: r.status || 'present',
            is_late: Boolean(r.is_late || r.isLate),
            late_minutes: Number(r.late_minutes || r.lateMinutes || 0),
            clock_in: r.clock_in || r.clockIn,
            clock_out: r.clock_out || r.clockOut,
            work_mode: r.work_mode || r.workMode,
          })
        })

        // 2. LocalStorage records per staff candidate IDs (mirrors AttendanceDaily & AttendanceSummary)
        allStaff.forEach(st => {
          const cids = [st.id, st.staff_code, st.profile_id, st.email].filter(Boolean) as string[]
          cids.forEach(cid => {
            const keys = [`hris_self_attendance_${cid}`, `hris_attendance_daily_${cid}`]
            keys.forEach(k => {
              try {
                const raw = localStorage.getItem(k)
                if (raw) {
                  const parsed = JSON.parse(raw)
                  Object.entries(parsed).forEach(([dKey, val]: [string, any]) => {
                    const d = val?.attendance_date || val?.date || dKey
                    if (d && typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
                      const dateOnly = d.slice(0, 10)
                      const key = `${st.id}_${dateOnly}`
                      const existing = attendanceMap.get(key) || {}
                      attendanceMap.set(key, {
                        ...existing,
                        ...val,
                        staff_id: st.id,
                        date: dateOnly,
                        attendance_date: dateOnly,
                        status: val.status || existing.status || 'present',
                        is_late: val.is_late !== undefined ? Boolean(val.is_late) : (val.isLate !== undefined ? Boolean(val.isLate) : existing.is_late),
                        late_minutes: Number(val.late_minutes || val.lateMinutes || existing.late_minutes || 0),
                        clock_in: val.clock_in || val.clockIn || existing.clock_in,
                        clock_out: val.clock_out || val.clockOut || existing.clock_out,
                        work_mode: val.work_mode || val.workMode || existing.work_mode,
                      })
                    }
                  })
                }
              } catch (e) {}
            })
          })
        })

        const uniqueAttRecords = Array.from(attendanceMap.values())
        setRawAttRecords(uniqueAttRecords)

        // Fetch real approved leave requests
        let leaveRecords: any[] = []
        try {
          const { data: lData } = await supabase
            .from('leave_requests')
            .select('id, staff_id, start_date, end_date, status, days')
            .eq('status', 'approved')
          if (lData) {
            leaveRecords = lData.map((l: any) => {
              const rawId = l.staff_id ? String(l.staff_id) : ''
              const matchedStaff = candidateMap.get(rawId) || candidateMap.get(rawId.toLowerCase())
              return {
                ...l,
                staff_id: matchedStaff ? matchedStaff.id : rawId,
              }
            })
          }
        } catch (e) {
          console.warn('Leave requests DB fetch skipped:', e)
        }

        try {
          const rawL = localStorage.getItem('hris_all_leave_requests')
          if (rawL) {
            const parsed = JSON.parse(rawL)
            if (Array.isArray(parsed)) {
              parsed.filter((r: any) => r.status === 'approved').forEach(r => {
                const rawId = r.staff_id ? String(r.staff_id) : ''
                const matchedStaff = candidateMap.get(rawId) || candidateMap.get(rawId.toLowerCase())
                leaveRecords.push({
                  ...r,
                  staff_id: matchedStaff ? matchedStaff.id : rawId,
                })
              })
            }
          }
        } catch (e) {}
        setRawLeaveRecords(leaveRecords)
        /* (legacy loader block commented out)
                  ...r,
                  staff_id: matchedStaff ? matchedStaff.id : rawId,
                })
              })
            }
          }
        } catch (e) {}
        setRawLeaveRecords(leaveRecords)

        // Fetch attendance records from Supabase
        let attRecords: any[] = []
        try {
          const { data: aData } = await supabase
            .from('attendance_records')
            .select('id, staff_id, attendance_date, status, is_late, late_minutes')
          if (aData) {
            attRecords = aData.map((r: any) => ({
              ...r,
              date: r.attendance_date,
            }))
          }
        } catch (e) {
          console.warn('Attendance DB fetch skipped:', e)
        }

        // Merge with local storage cached records
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k && (k.startsWith('hris_self_attendance_') || k.startsWith('hris_attendance_daily_'))) {
              const raw = localStorage.getItem(k)
              if (raw) {
                const parsed = JSON.parse(raw)
                Object.values(parsed).forEach((rec: any) => {
                  if (rec && rec.attendance_date) {
                    attRecords.push({
                      ...rec,
                      date: rec.attendance_date,
                    })
                  }
                })
              }
            }
          }
        } catch (e) {}

        // (deduplicated above)
        const uniqueAttRecords: any[] = []
        for (const r of attRecords) {
          const key = `${r.staff_id}_${r.date || r.attendance_date}`
          if (!seenAtt.has(key)) {
            seenAtt.add(key)
            uniqueAttRecords.push(r)
          }
        }
        setRawAttRecords(uniqueAttRecords)

        // Fetch real approved leave requests
        let leaveRecords: any[] = []
        try {
          const { data: lData } = await supabase
            .from('leave_requests')
            .select('id, staff_id, start_date, end_date, status, days')
            .eq('status', 'approved')
          if (lData) leaveRecords = lData
        } catch (e) {
          console.warn('Leave requests DB fetch skipped:', e)
        }

        try {
          const rawL = localStorage.getItem('hris_all_leave_requests')
          if (rawL) {
            const parsed = JSON.parse(rawL)
            if (Array.isArray(parsed)) {
              parsed.filter((r: any) => r.status === 'approved').forEach(r => leaveRecords.push(r))
            }
          }
        } catch (e) {}
        setRawLeaveRecords(leaveRecords)

        */
        // Calculate Department Headcount and KPIs
        calculateMetrics(allStaff, selectedDeptFilter, selectedTimeframe, uniqueAttRecords, leaveRecords, customStartDate, customEndDate)

        // Fetch recent audit logs
        try {
          const { data: auditLogs } = await supabase
            .from('audit_log')
            .select('actor_name, action, entity, details, created_at')
            .order('created_at', { ascending: false })
            .limit(6)

          if (auditLogs && auditLogs.length > 0) {
            const formattedLogs = auditLogs.map(log => ({
              time: formatRelativeTime(log.created_at),
              text: log.details,
              type: log.action,
            }))
            setActivityFeed(formattedLogs)
          }
        } catch (e) {}

        // Set current date string
        const nowDate = new Date()
        setCurrentDate(nowDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        }))
      } catch (err) {
        console.error('Error fetching dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Recalculate metrics when department filter, timeframe, or custom dates change
  useEffect(() => {
    if (rawStaffList.length > 0) {
      calculateMetrics(rawStaffList, selectedDeptFilter, selectedTimeframe, rawAttRecords, rawLeaveRecords, customStartDate, customEndDate)
    }
  }, [selectedDeptFilter, selectedTimeframe, customStartDate, customEndDate, rawAttRecords, rawLeaveRecords])

  // Export Executive Summary Data as Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()

    // 1. Payroll Trends Sheet
    const payrollData = payrollTrends.map(p => ({
      Month: p.fullMonth,
      'Gross Commitment (₦)': p.gross,
      'Net Outflow (₦)': p.net,
      'PAYE Tax (₦)': p.tax,
      'Pension Contribution (₦)': p.pension,
    }))
    const wsPayroll = XLSX.utils.json_to_sheet(payrollData)
    XLSX.utils.book_append_sheet(wb, wsPayroll, 'Payroll Trends')

    // 2. Department Breakdown Sheet
    const deptData = deptBreakdown.map(d => ({
      Department: d.department,
      'Total Staff': d.total,
      'Confirmed Staff': d.confirmed,
      'Probation Staff': d.probation,
      'Due for Confirmation': d.dueSoon,
      'Gross Budget (₦)': d.grossSalary,
    }))
    const wsDept = XLSX.utils.json_to_sheet(deptData)
    XLSX.utils.book_append_sheet(wb, wsDept, 'Department Breakdown')

    // 3. Attendance Summary Sheet
    const attData = attendanceMonthlyTrends.map(a => ({
      Month: a.fullMonth,
      'Attendance Rate (%)': a.attendanceRate,
      'Punctuality Score (%)': a.punctualityScore,
      'Avg Daily Present': a.avgPresent,
      'Total Late Flags': a.totalLate,
      'Total Leave Days': a.totalLeave,
    }))
    const wsAtt = XLSX.utils.json_to_sheet(attData)
    XLSX.utils.book_append_sheet(wb, wsAtt, 'Attendance Trends')

    XLSX.writeFile(wb, `executive-summary-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Custom Tooltip for Payroll
  const CustomPayrollTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload as PayrollTrendItem
      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 backdrop-blur-md min-w-[210px]">
          <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">
            {d.fullMonth}
          </div>
          <div className="space-y-1 font-mono-data text-slate-300">
            <div className="flex justify-between text-white font-bold">
              <span>Gross Commitment:</span>
              <span>{fmt(d.gross)}</span>
            </div>
            <div className="flex justify-between text-emerald-400 font-semibold">
              <span>Net Outflow:</span>
              <span>{fmt(d.net)}</span>
            </div>
            {config.showTaxLayer && (
              <div className="flex justify-between text-blue-300">
                <span>PAYE Tax Deduction:</span>
                <span>{fmt(d.tax)}</span>
              </div>
            )}
            {config.showPensionLayer && (
              <div className="flex justify-between text-purple-300">
                <span>Pension Contribution:</span>
                <span>{fmt(d.pension)}</span>
              </div>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  // Custom Tooltip for Department Breakdown
  const CustomDeptTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload as DeptBreakdownItem
      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 backdrop-blur-md min-w-[210px]">
          <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">
            {d.department}
          </div>
          <div className="space-y-1 font-mono-data text-slate-300">
            <div className="flex justify-between text-white font-bold">
              <span>Total Headcount:</span>
              <span>{d.total} staff</span>
            </div>
            <div className="flex justify-between text-emerald-400">
              <span>Confirmed Staff:</span>
              <span>{d.confirmed}</span>
            </div>
            <div className="flex justify-between text-blue-300">
              <span>Probation Period:</span>
              <span>{d.probation}</span>
            </div>
            {d.dueSoon > 0 && (
              <div className="flex justify-between text-amber-300 font-semibold">
                <span>Confirmation Due:</span>
                <span>{d.dueSoon}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-300 border-t border-slate-800 pt-1">
              <span>Gross Budget:</span>
              <span className="font-semibold text-white">{fmt(d.grossSalary)}</span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  // Custom Tooltip for Daily Attendance
  const CustomDailyAttendanceTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload as AttendanceDailyTrendItem
      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 backdrop-blur-md min-w-[200px]">
          <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">
            {d.fullDate} ({d.dayLabel})
          </div>
          <div className="space-y-1 font-mono-data text-slate-300">
            <div className="flex justify-between text-emerald-400 font-bold">
              <span>Attendance Rate:</span>
              <span>{d.attendanceRate}%</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>• On-Time:</span>
              <span>{d.onTime}</span>
            </div>
            <div className="flex justify-between text-amber-400">
              <span>• Late:</span>
              <span>{d.late}</span>
            </div>
            <div className="flex justify-between text-sky-300">
              <span>• On Leave:</span>
              <span>{d.onLeave}</span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  // Custom Tooltip for Monthly Attendance
  const CustomMonthlyAttendanceTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload as AttendanceMonthlyTrendItem & { hasActivity?: boolean }
      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 backdrop-blur-md min-w-[210px]">
          <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1 flex items-center justify-between">
            <span>{d.fullMonth}</span>
            {d.hasActivity === false && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">No records</span>
            )}
          </div>
          <div className="space-y-1 font-mono-data text-slate-300">
            {d.hasActivity === false ? (
              <div className="text-slate-400 py-1 text-[11px] italic">
                No attendance or leave logged for this period
              </div>
            ) : (
              <>
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Attendance Compliance:</span>
                  <span>{d.attendanceRate}%</span>
                </div>
                <div className="flex justify-between text-indigo-300 font-semibold">
                  <span>Punctuality Score:</span>
                  <span>{d.punctualityScore}%</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Avg. Daily Present:</span>
                  <span>{d.avgPresent} staff</span>
                </div>
                <div className="flex justify-between text-amber-400">
                  <span>Total Late Arrivals:</span>
                  <span>{d.totalLate}</span>
                </div>
                <div className="flex justify-between text-sky-300">
                  <span>Total Leave Taken:</span>
                  <span>{d.totalLeave} days</span>
                </div>
              </>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 anim-fade-up">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-5 anim-fade-up transition-all ${isPresentationMode ? 'bg-slate-900 text-white p-6 rounded-2xl min-h-screen' : 'p-4 sm:p-6'}`}>
      
      {/* ── TOP EXECUTIVE CONTROLS & PRESENTATION TOOLBAR ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-800/90 p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-blue-600 animate-pulse"></span>
            <h2 className="font-display font-bold text-slate-800 dark:text-white text-xl sm:text-2xl">
              Super Admin Executive Dashboard
            </h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
            {currentDate} · {selectedDeptFilter === 'all' ? 'All Organization Units' : `${selectedDeptFilter} Department`} · Live Executive Intelligence
          </p>
        </div>

        {/* Presentation & Customization Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Department Filter Selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/60 px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-600">
            <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/></svg>
            <select
              value={selectedDeptFilter}
              onChange={e => setSelectedDeptFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="text-slate-800 dark:text-slate-900">All Departments ({departmentList.length})</option>
              {departmentList.map(d => (
                <option key={d} value={d} className="text-slate-800 dark:text-slate-900">{d}</option>
              ))}
            </select>
          </div>

          {/* Timeframe Selector with Custom Option */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl border border-slate-200/80 dark:border-slate-600 flex-wrap">
            {(['3m', '6m', '12m'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedTimeframe === tf
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
              >
                {tf === '3m' ? '3 Months' : tf === '6m' ? '6 Months' : '12 Months'}
              </button>
            ))}
            <button
              onClick={() => setSelectedTimeframe('custom')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                selectedTimeframe === 'custom'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>Custom Range</span>
            </button>
          </div>

          {/* Customize View Modal Trigger */}
          <button
            onClick={() => setShowCustomizeModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors border border-slate-200/80 dark:border-slate-600 shadow-xs"
            title="Customize Metrics & Presentation"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Customize View</span>
          </button>

          {/* Presentation Mode Toggle */}
          <button
            onClick={() => setIsPresentationMode(!isPresentationMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shadow-xs ${
              isPresentationMode
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-600'
            }`}
            title="Boardroom Fullscreen Presentation Mode"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <span>{isPresentationMode ? 'Exit Presentation' : 'Boardroom View'}</span>
          </button>

          {/* Excel Export */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-xs"
            title="Download Summary Data as Excel"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker Toolbar (Visible when Custom Range is selected) */}
      {selectedTimeframe === 'custom' && (
        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-blue-200 dark:border-blue-900 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Custom Analysis Window:
            </span>
            <div className="flex items-center gap-2">
              <label className="text-slate-500 font-medium">From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-mono-data text-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-500 font-medium">To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-mono-data text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
                const end = now.toISOString().slice(0, 10)
                setCustomStartDate(start)
                setCustomEndDate(end)
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
                const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)
                setCustomStartDate(start)
                setCustomEndDate(end)
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200"
            >
              Last Month
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                const start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
                const end = now.toISOString().slice(0, 10)
                setCustomStartDate(start)
                setCustomEndDate(end)
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200"
            >
              Year to Date
            </button>
          </div>
        </div>
      )}

      {/* Printable / Capturable Executive Dashboard Canvas */}
      <div ref={reportRef} className="space-y-5">
        
        {/* ── CUSTOMIZABLE EXECUTIVE KPI CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          
          {/* 1. Gross Salary Budget */}
          {config.showGrossCommitment && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 p-4 sm:p-5 shadow-xs card-hover flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">Gross Commitment</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                </div>
              </div>
              <div>
                <div className="font-display font-bold text-slate-800 dark:text-white text-xl sm:text-2xl font-mono-data tracking-tight">
                  {totalGrossCommitment > 0 ? fmt(totalGrossCommitment) : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{totalConfirmedStaff} Confirmed</span>
                  <span>·</span>
                  <span className="text-amber-500">{totalProbationStaff} Probation</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. Monthly Net Payroll */}
          {config.showNetPayroll && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 p-4 sm:p-5 shadow-xs card-hover flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">Monthly Net Payroll</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
              </div>
              <div>
                <div className="font-display font-bold text-emerald-600 dark:text-emerald-400 text-xl sm:text-2xl font-mono-data tracking-tight">
                  {monthlyPayroll > 0 ? fmt(monthlyPayroll) : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium">
                  {periodLabel ? `${periodLabel} · ${fmtShort(processedPayroll)} Paid` : 'Current Outflow'}
                </div>
              </div>
            </div>
          )}

          {/* 3. Est. PAYE Tax Obligation */}
          {config.showTaxCard && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-blue-100 dark:border-blue-900/50 p-4 sm:p-5 shadow-xs card-hover flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">Est. Monthly PAYE</span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="12" y1="18" x2="12" y2="12"/></svg>
                </div>
              </div>
              <div>
                <div className="font-display font-bold text-blue-600 dark:text-blue-400 text-xl sm:text-2xl font-mono-data tracking-tight">
                  {fmt(Math.round(totalGrossCommitment * 0.10))}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium">
                  State Internal Revenue Statutory Remittance
                </div>
              </div>
            </div>
          )}

          {/* 4. Est. Pension Obligation */}
          {config.showPensionCard && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-purple-100 dark:border-purple-900/50 p-4 sm:p-5 shadow-xs card-hover flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">Est. Pension (8%)</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
              </div>
              <div>
                <div className="font-display font-bold text-purple-600 dark:text-purple-400 text-xl sm:text-2xl font-mono-data tracking-tight">
                  {fmt(Math.round(totalGrossCommitment * 0.08))}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium">
                  PFA Contribution Deductions (8% Employee)
                </div>
              </div>
            </div>
          )}

          {/* 5. System Attendance Rate (Aligned with HR Daily Registry) */}
          {config.showAttendanceCard && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 p-4 sm:p-5 shadow-xs card-hover flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Daily Attendance
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display font-bold text-slate-800 dark:text-white text-xl sm:text-2xl font-mono-data tracking-tight">
                    {latestRegistryStats.attendanceRate}%
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-mono-data">
                    {latestRegistryStats.present}/{latestRegistryStats.totalStaff} Present
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium flex items-center justify-between">
                  <span>{latestRegistryStats.onTime} on-time · {latestRegistryStats.late} late</span>
                  <span className="font-mono-data text-[11px] text-slate-500">{latestRegistryStats.formattedDate}</span>
                </div>
              </div>
            </div>
          )}

          {/* 6. Punctuality Score */}
          {config.showPunctualityCard && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 p-4 sm:p-5 shadow-xs card-hover flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  Punctuality Score
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display font-bold text-indigo-600 dark:text-indigo-400 text-xl sm:text-2xl font-mono-data tracking-tight">
                    {latestRegistryStats.punctualityScore}%
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono-data">
                    {latestRegistryStats.late === 0 ? 'Zero Late Arrivals' : `${latestRegistryStats.late} Late`}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium flex items-center justify-between">
                  <span>{latestRegistryStats.onTime} of {latestRegistryStats.present} on-time</span>
                  <span className="font-mono-data text-[11px] text-slate-500">{latestRegistryStats.formattedDate}</span>
                </div>
              </div>
            </div>
          )}
          {/*
          {config.showAttendanceCard && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 p-4 sm:p-5 shadow-xs card-hover flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">Avg Attendance</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                </div>
              </div>
              <div>
                <div className="font-display font-bold text-slate-800 dark:text-white text-xl sm:text-2xl font-mono-data tracking-tight">
                  {(() => {
                    const activeDays = attendanceDailyTrends.filter(a => a.present > 0)
                    if (activeDays.length === 0) return '0%'
                    return `${Math.round(activeDays.reduce((s, a) => s + a.attendanceRate, 0) / activeDays.length)}%`
                  })()}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium">
                  {attendanceDailyTrends.reduce((s, a) => s + a.onTime, 0)} on-time clock-ins logged
                </div>
              </div>
            </div>
          )}

          {/* 6. Punctuality Score */}
          {config.showPunctualityCard && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 p-4 sm:p-5 shadow-xs card-hover flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">Punctuality Score</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
              </div>
              <div>
                <div className="font-display font-bold text-indigo-600 dark:text-indigo-400 text-xl sm:text-2xl font-mono-data tracking-tight">
                  {(() => {
                    const activeMonths = attendanceMonthlyTrends.filter(a => a.avgPresent > 0)
                    if (activeMonths.length === 0) return '100%'
                    return `${Math.round(activeMonths.reduce((s, a) => s + a.punctualityScore, 0) / activeMonths.length)}%`
                  })()}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium">
                  {attendanceMonthlyTrends.reduce((s, a) => s + a.totalLate, 0)} late flags recorded
                </div>
              </div>
            </div>
          )}

          )}
          */}
          {/* 7. Security Accounts Card */}
          {config.showSecurityCard && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 shadow-xs card-hover flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">Account Security</span>
                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
              </div>
              <div>
                <div className="font-display font-bold text-slate-800 dark:text-white text-xl sm:text-2xl tracking-tight">
                  {activeAccounts} / {totalAccounts}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium">
                  {suspendedAccounts > 0 ? `${suspendedAccounts} suspended accounts` : 'All accounts secure & active'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── INTERACTIVE EXECUTIVE SUMMARY BREAKDOWN GRAPH SECTION ── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xs p-5 sm:p-6 space-y-5">
          {/* Graph Header & Interactive Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700/60 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-600"></span>
                <h3 className="font-display font-bold text-slate-800 dark:text-white text-lg sm:text-xl">
                  Executive Breakdown & Trends
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {chartMode === 'payroll' && `Historical & projected salary commitments across ${selectedTimeframe === 'custom' ? 'Custom Range' : selectedTimeframe === '3m' ? '3 Months' : selectedTimeframe === '6m' ? '6 Months' : '12 Months'}`}
                {chartMode === 'departments' && 'Distribution of confirmed vs. probation personnel across operating departments'}
                {chartMode === 'attendance' && `Comprehensive attendance compliance & punctuality trends (${attendanceViewMode === '14days' ? 'Daily Activity' : 'Summary Trends'})`}
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-700/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-600 self-start sm:self-auto overflow-x-auto max-w-full no-scrollbar">
              <button
                onClick={() => setChartMode('payroll')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  chartMode === 'payroll'
                    ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="16" cy="15" r="1"/></svg>
                <span>Payroll Outflow</span>
              </button>
              <button
                onClick={() => setChartMode('departments')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  chartMode === 'departments'
                    ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>
                <span>Department Breakdown</span>
              </button>
              <button
                onClick={() => setChartMode('attendance')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  chartMode === 'attendance'
                    ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>Attendance Trends</span>
              </button>
            </div>
          </div>

          {/* ── VIEW 1: PAYROLL OUTFLOW & TAX COMMITMENTS ── */}
          {chartMode === 'payroll' && (
            <div className="space-y-4 anim-fade">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Gross Commitment</span>
                  <p className="text-base sm:text-lg font-bold font-mono-data text-slate-800 dark:text-white mt-0.5">{fmt(totalGrossCommitment)}</p>
                </div>
                <div className="bg-emerald-50/50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-100/60 dark:border-emerald-800/40">
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Monthly Net Paid/Pend</span>
                  <p className="text-base sm:text-lg font-bold font-mono-data text-emerald-700 dark:text-emerald-400 mt-0.5">{fmt(monthlyPayroll)}</p>
                </div>
                <div className="bg-blue-50/50 dark:bg-blue-950/30 p-3 rounded-xl border border-blue-100/60 dark:border-blue-800/40">
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase">Est. Monthly PAYE</span>
                  <p className="text-base sm:text-lg font-bold font-mono-data text-blue-700 dark:text-blue-400 mt-0.5">{fmt(Math.round(totalGrossCommitment * 0.10))}</p>
                </div>
                <div className="bg-purple-50/50 dark:bg-purple-950/30 p-3 rounded-xl border border-purple-100/60 dark:border-purple-800/40">
                  <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-400 uppercase">Est. Pension (8%)</span>
                  <p className="text-base sm:text-lg font-bold font-mono-data text-purple-700 dark:text-purple-400 mt-0.5">{fmt(Math.round(totalGrossCommitment * 0.08))}</p>
                </div>
              </div>

              <div className="h-[280px] sm:h-[340px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {config.payrollChartType === 'bar' ? (
                    <BarChart data={payrollTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomPayrollTooltip />} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Bar dataKey="gross" name="Gross Commitment" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="net" name="Net Outflow" fill="#10b981" radius={[4, 4, 0, 0]} />
                      {config.showTaxLayer && <Bar dataKey="tax" name="PAYE Tax" fill="#3b82f6" radius={[4, 4, 0, 0]} />}
                      {config.showPensionLayer && <Bar dataKey="pension" name="Pension (8%)" fill="#a855f7" radius={[4, 4, 0, 0]} />}
                    </BarChart>
                  ) : config.payrollChartType === 'line' ? (
                    <LineChart data={payrollTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomPayrollTooltip />} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="gross" name="Gross Commitment" stroke="#1e3a5f" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="net" name="Net Outflow" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                      {config.showTaxLayer && <Line type="monotone" dataKey="tax" name="PAYE Tax" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />}
                      {config.showPensionLayer && <Line type="monotone" dataKey="pension" name="Pension (8%)" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} />}
                    </LineChart>
                  ) : (
                    <AreaChart data={payrollTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1e3a5f" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#1e3a5f" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorTax" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomPayrollTooltip />} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Area type="monotone" dataKey="gross" name="Gross Commitment" stroke="#1e3a5f" fillOpacity={1} fill="url(#colorGross)" />
                      <Area type="monotone" dataKey="net" name="Net Outflow" stroke="#10b981" fillOpacity={1} fill="url(#colorNet)" />
                      {config.showTaxLayer && <Area type="monotone" dataKey="tax" name="PAYE Tax" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTax)" />}
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── VIEW 2: DEPARTMENT HEADCOUNT & CONFIRMATION BREAKDOWN ── */}
          {chartMode === 'departments' && (
            <div className="space-y-4 anim-fade">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Departments</span>
                  <p className="text-base sm:text-lg font-bold font-mono-data text-slate-800 dark:text-white mt-0.5">{deptBreakdown.length} units</p>
                </div>
                <div className="bg-emerald-50/50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-100/60 dark:border-emerald-800/40">
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Confirmed Staff</span>
                  <p className="text-base sm:text-lg font-bold font-mono-data text-emerald-700 dark:text-emerald-400 mt-0.5">{totalConfirmedStaff} staff</p>
                </div>
                <div className="bg-blue-50/50 dark:bg-blue-950/30 p-3 rounded-xl border border-blue-100/60 dark:border-blue-800/40">
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase">Probation Period</span>
                  <p className="text-base sm:text-lg font-bold font-mono-data text-blue-700 dark:text-blue-400 mt-0.5">{totalProbationStaff} staff</p>
                </div>
                <div className="bg-amber-50/50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-100/60 dark:border-amber-800/40">
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase">Due for Confirmation</span>
                  <p className="text-base sm:text-lg font-bold font-mono-data text-amber-700 dark:text-amber-400 mt-0.5">
                    {deptBreakdown.reduce((sum, d) => sum + d.dueSoon, 0)} staff
                  </p>
                </div>
              </div>

              <div className="h-[280px] sm:h-[340px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="department" stroke="#94a3b8" fontSize={11} tickLine={false} interval={0} tickFormatter={(val) => val.length > 12 ? `${val.slice(0, 10)}...` : val} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomDeptTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="confirmed" name="Confirmed Staff" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="probation" name="Probation (Pending)" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── VIEW 3: SYSTEM-WIDE ATTENDANCE TRENDS (Trendline by Default) ── */}
          {chartMode === 'attendance' && (
            <div className="space-y-4 anim-fade">
              {/* Range & Format Switcher Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Analysis Range:</span>
                  <div className="flex bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg border border-slate-200 dark:border-slate-600">
                    <button
                      onClick={() => setAttendanceViewMode('14days')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        attendanceViewMode === '14days'
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      {selectedTimeframe === 'custom' ? 'Daily Activity' : '14-Day Activity'}
                    </button>
                    <button
                      onClick={() => setAttendanceViewMode('12months')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        attendanceViewMode === '12months'
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      {selectedTimeframe === 'custom' ? 'Summary Trends' : `${selectedTimeframe === '3m' ? '3-Month' : selectedTimeframe === '6m' ? '6-Month' : '12-Month'} Summary`}
                    </button>
                  </div>
                </div>

                {/* Trendline vs Bar Switcher */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">View Format:</span>
                  <div className="flex bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg border border-slate-200 dark:border-slate-600">
                    <button
                      onClick={() => setAttendanceChartType('line')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        attendanceChartType === 'line'
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                      }`}
                      title="Display smooth trendline"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                      <span>Trendline</span>
                    </button>
                    <button
                      onClick={() => setAttendanceChartType('bar')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        attendanceChartType === 'bar'
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                      }`}
                      title="Display bar chart"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                      <span>Bar Chart</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Attendance KPI Summary Row */}
              {attendanceViewMode === '14days' ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Avg Attendance</span>
                    <p className="text-base sm:text-lg font-bold font-mono-data text-slate-800 dark:text-white mt-0.5">
                      {(() => {
                        const activeDays = attendanceDailyTrends.filter(a => {
                          const d = new Date(a.date)
                          return d.getDay() !== 0 && d.getDay() !== 6 && a.present > 0
                        })
                        if (activeDays.length === 0) return `${latestRegistryStats.attendanceRate}%`
                        return `${Math.round(activeDays.reduce((s, a) => s + a.attendanceRate, 0) / activeDays.length)}%`
                      })()}
                    </p>
                  </div>
                  <div className="bg-emerald-50/50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-100/60 dark:border-emerald-800/40">
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">On-Time Arrivals</span>
                    <p className="text-base sm:text-lg font-bold font-mono-data text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {attendanceDailyTrends.reduce((s, a) => s + a.onTime, 0)} logged
                    </p>
                  </div>
                  <div className="bg-amber-50/50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-100/60 dark:border-amber-800/40">
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase">Late Arrivals</span>
                    <p className="text-base sm:text-lg font-bold font-mono-data text-amber-700 dark:text-amber-400 mt-0.5">
                      {attendanceDailyTrends.reduce((s, a) => s + a.late, 0)} flags
                    </p>
                  </div>
                  <div className="bg-sky-50/50 dark:bg-sky-950/30 p-3 rounded-xl border border-sky-100/60 dark:border-sky-800/40">
                    <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 uppercase">Approved Leave</span>
                    <p className="text-base sm:text-lg font-bold font-mono-data text-sky-700 dark:text-sky-400 mt-0.5">
                      {attendanceDailyTrends.reduce((s, a) => s + a.onLeave, 0)} days
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Period Compliance</span>
                    <p className="text-base sm:text-lg font-bold font-mono-data text-slate-800 dark:text-white mt-0.5">
                      {(() => {
                        const activeMonths = attendanceMonthlyTrends.filter(a => a.hasActivity && a.attendanceRate > 0)
                        if (activeMonths.length === 0) return `${latestRegistryStats.attendanceRate}%`
                        return `${Math.round(activeMonths.reduce((s, a) => s + a.attendanceRate, 0) / activeMonths.length)}%`
                      })()}
                    </p>
                  </div>
                  <div className="bg-indigo-50/50 dark:bg-indigo-950/30 p-3 rounded-xl border border-indigo-100/60 dark:border-indigo-800/40">
                    <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 uppercase">Avg Punctuality Score</span>
                    <p className="text-base sm:text-lg font-bold font-mono-data text-indigo-700 dark:text-indigo-400 mt-0.5">
                      {(() => {
                        const activeMonths = attendanceMonthlyTrends.filter(a => a.hasActivity && a.attendanceRate > 0)
                        if (activeMonths.length === 0) return '100%'
                        return `${Math.round(activeMonths.reduce((s, a) => s + a.punctualityScore, 0) / activeMonths.length)}%`
                      })()}
                    </p>
                  </div>
                  <div className="bg-amber-50/50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-100/60 dark:border-amber-800/40">
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase">Total Late Incidents</span>
                    <p className="text-base sm:text-lg font-bold font-mono-data text-amber-700 dark:text-amber-400 mt-0.5">
                      {attendanceMonthlyTrends.reduce((s, a) => s + a.totalLate, 0)}
                    </p>
                  </div>
                  <div className="bg-sky-50/50 dark:bg-sky-950/30 p-3 rounded-xl border border-sky-100/60 dark:border-sky-800/40">
                    <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 uppercase">Total Leave Utilization</span>
                    <p className="text-base sm:text-lg font-bold font-mono-data text-sky-700 dark:text-sky-400 mt-0.5">
                      {attendanceMonthlyTrends.reduce((s, a) => s + a.totalLeave, 0)} days
                    </p>
                  </div>
                </div>
              )}

              {/* Chart Render Area */}
              <div className="h-[280px] sm:h-[340px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {attendanceViewMode === '14days' ? (
                    attendanceChartType === 'bar' ? (
                      <BarChart data={attendanceDailyTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="dayLabel" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip content={<CustomDailyAttendanceTooltip />} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar dataKey="attendanceRate" name="Daily Attendance Compliance (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    ) : (
                      <LineChart data={attendanceDailyTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="dayLabel" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip content={<CustomDailyAttendanceTooltip />} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Line type="monotone" dataKey="attendanceRate" name="Daily Attendance Compliance (%)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    )
                  ) : (
                    attendanceChartType === 'line' ? (
                      <LineChart data={attendanceMonthlyTrends} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip content={<CustomMonthlyAttendanceTooltip />} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Line type="monotone" dataKey="attendanceRate" name="Attendance Compliance (%)" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} />
                        <Line type="monotone" dataKey="punctualityScore" name="Punctuality Score (%)" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} />
                      </LineChart>
                    ) : (
                      <BarChart data={attendanceMonthlyTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip content={<CustomMonthlyAttendanceTooltip />} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar dataKey="attendanceRate" name="Attendance Compliance (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="punctualityScore" name="Punctuality Score (%)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* ── DEPARTMENT HEADCOUNT & ACTIVITY FEED GRID ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Headcount by dept */}
          <div className="xl:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-xs">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <h3 className="font-display font-semibold text-slate-800 dark:text-white text-base">
                  Headcount by Department
                </h3>
              </div>
              <button onClick={() => onNavigate('sa-users')} className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1">
                View directory <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <div className="p-5">
              {Object.keys(deptHeadcount).length === 0 ? (
                <div className="flex items-center justify-center text-center py-12">
                  <div>
                    <svg className="text-slate-300 dark:text-slate-600 mb-3 mx-auto" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    <div className="text-slate-500 font-medium">Department breakdown will appear here</div>
                    <div className="text-slate-400 text-sm">once staff records are added</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(deptHeadcount).map(([dept, count]) => {
                    const maxCount = Math.max(...Object.values(deptHeadcount))
                    const pct = Math.round((count / (Object.values(deptHeadcount).reduce((a,b)=>a+b, 0) || 1)) * 100)
                    return (
                      <div key={dept} className="group">
                        <div className="flex items-center justify-between mb-1.5 text-sm">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{dept}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-mono-data">{pct}%</span>
                            <span className="font-semibold text-slate-800 dark:text-white text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 font-mono-data">{count} staff</span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300 group-hover:brightness-110" 
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-xs flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h3 className="font-display font-semibold text-slate-800 dark:text-white text-base">System Activity</h3>
              </div>
              <button onClick={() => onNavigate('sa-audit')} className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline">Full log</button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60 flex-1 max-h-[360px] overflow-y-auto">
              {activityFeed.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <svg className="text-slate-300 dark:text-slate-600 mb-2 mx-auto" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                  <div className="text-slate-500 text-sm">No recent activity logged</div>
                </div>
              ) : activityFeed.map((a, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ring-4 ring-white dark:ring-slate-800 ${typeColors[a.type] || 'bg-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed truncate">{a.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono-data">{a.type}</span>
                      <span className="text-[11px] text-slate-400">{a.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-xs p-5">
          <h3 className="font-display font-semibold text-slate-800 dark:text-white text-base mb-3">Administrator Shortcuts</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Create User Account', desc: 'Add new system profiles & roles', page: 'sa-users' as Page, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>, bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100/80 border border-blue-100 dark:border-blue-900' },
              { label: 'System Settings', desc: 'Configure departments & parameters', page: 'sa-settings' as Page, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, bg: 'bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 hover:bg-slate-100 border border-slate-200/80 dark:border-slate-600' },
              { label: 'View Audit Log', desc: 'Inspect full system action history', page: 'sa-audit' as Page, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>, bg: 'bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 hover:bg-slate-100 border border-slate-200/80 dark:border-slate-600' },
            ].map(a => (
              <button
                key={a.label}
                onClick={() => onNavigate(a.page)}
                className={`p-3.5 rounded-xl text-left transition-all flex items-start gap-3 ${a.bg} card-hover`}
              >
                <div className="mt-0.5">{a.icon}</div>
                <div>
                  <div className="font-semibold text-sm">{a.label}</div>
                  <div className="text-xs opacity-75 mt-0.5">{a.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ── CUSTOMIZE VIEW MODAL ── */}
      {showCustomizeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 max-w-lg w-full anim-fade-up border border-slate-200 dark:border-slate-800 space-y-5 text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg">Customize Executive Presentation</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Configure visible metrics, chart styles, and data layers</p>
                </div>
              </div>
              <button
                onClick={() => setShowCustomizeModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Chart Style Preferences */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Payroll Chart Visualization Style</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'area', label: 'Gradient Area' },
                  { key: 'bar', label: 'Bar Comparison' },
                  { key: 'line', label: 'Trend Lines' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => saveConfig({ ...config, payrollChartType: opt.key as any })}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      config.payrollChartType === opt.key
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Cards Toggle List */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Visible Executive Summary Cards</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { key: 'showGrossCommitment', label: 'Gross Commitment' },
                  { key: 'showNetPayroll', label: 'Monthly Net Payroll' },
                  { key: 'showTaxCard', label: 'PAYE Tax Card' },
                  { key: 'showPensionCard', label: 'Pension (8%) Card' },
                  { key: 'showAttendanceCard', label: 'Attendance Rate' },
                  { key: 'showPunctualityCard', label: 'Punctuality Score' },
                  { key: 'showSecurityCard', label: 'Account Security' },
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={(config as any)[item.key]}
                      onChange={e => saveConfig({ ...config, [item.key]: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Additional Layer Toggles */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Chart Breakdown Layers</label>
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showTaxLayer}
                    onChange={e => saveConfig({ ...config, showTaxLayer: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Show PAYE Tax Layer</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showPensionLayer}
                    onChange={e => saveConfig({ ...config, showPensionLayer: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Show Pension Layer</span>
                </label>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => saveConfig(DEFAULT_CONFIG)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium underline"
              >
                Reset to Defaults
              </button>
              <button
                type="button"
                onClick={() => setShowCustomizeModal(false)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                Apply Customization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
