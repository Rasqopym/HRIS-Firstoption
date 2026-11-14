import React, { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { formatTime12Hour } from '../lib/geofence'
import { isPublicHoliday, type PublicHoliday } from '../lib/holidays'
import * as XLSX from 'xlsx'

interface StaffReportCardModalProps {
  isOpen: boolean
  onClose: () => void
  initialStaffId?: string | null
  initialStartDate?: string
  initialEndDate?: string
}

interface StaffMember {
  id: string
  staff_code: string
  full_name: string
  job_title: string
  department_name?: string
  date_employed?: string
  photo_url?: string
  email?: string
  phone?: string
}

interface DailyAttendanceDetail {
  date: string
  dayOfWeek: string
  status: string
  clockInTime?: string
  clockOutTime?: string
  duration: string
  hoursWorked: number
  isLate: boolean
  lateMinutes: number
  workMode: string
  location: string
  overtimeHours: number
  overtimeApproval: string
  notes: string
}

export default function StaffReportCardModal({
  isOpen,
  onClose,
  initialStaffId,
  initialStartDate,
  initialEndDate,
}: StaffReportCardModalProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const currentYear = new Date().getFullYear()

  // Default date range: First day of current month to today
  const defaultMonthStart = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string>(initialStaffId || '')
  const [startDate, setStartDate] = useState(initialStartDate || defaultMonthStart)
  const [endDate, setEndDate] = useState(initialEndDate || todayStr)
  const [includeWeekends, setIncludeWeekends] = useState(false)
  const [customHolidays, setCustomHolidays] = useState<PublicHoliday[]>([])

  const [loading, setLoading] = useState(false)
  const [reportReady, setReportReady] = useState(false)
  const [dailyRecords, setDailyRecords] = useState<DailyAttendanceDetail[]>([])

  // Load staff list & statutory holidays on open
  useEffect(() => {
    if (!isOpen) return

    const loadMetadata = async () => {
      try {
        const { data: staffData } = await supabase
          .from('staff')
          .select('id, staff_code, full_name, job_title, date_employed, photo_url, email, phone, departments(name)')
          .eq('status', 'active')
          .order('full_name')

        if (staffData && staffData.length > 0) {
          const mapped: StaffMember[] = staffData.map((s: any) => ({
            id: s.id,
            staff_code: s.staff_code || '',
            full_name: s.full_name || 'Staff Member',
            job_title: s.job_title || 'Employee',
            department_name: s.departments?.name || 'General',
            date_employed: s.date_employed,
            photo_url: s.photo_url,
            email: s.email,
            phone: s.phone,
          }))
          setStaffList(mapped)

          // If no staff selected or initial staff is not in list, select the first staff
          if (!selectedStaffId) {
            setSelectedStaffId(initialStaffId || mapped[0].id)
          }
        }

        const { data: holData } = await supabase.from('public_holidays').select('*')
        if (holData) {
          setCustomHolidays(holData.map((h: any) => ({
            id: h.id || `hol-${h.holiday_date || h.date}`,
            holiday_date: h.holiday_date || h.date,
            date: h.holiday_date || h.date,
            name: h.name,
            is_recurring: h.is_recurring ?? h.isRecurring ?? false,
            isRecurring: h.is_recurring ?? h.isRecurring ?? false,
          })))
        }
      } catch (err) {
        console.error('Failed to load report card metadata:', err)
      }
    }

    loadMetadata()
  }, [isOpen])

  // Sync props when initialStaffId or dates change
  useEffect(() => {
    if (initialStaffId) setSelectedStaffId(initialStaffId)
  }, [initialStaffId])

  useEffect(() => {
    if (initialStartDate) setStartDate(initialStartDate)
    if (initialEndDate) setEndDate(initialEndDate)
  }, [initialStartDate, initialEndDate])

  // Selected Staff Member object
  const currentStaff = useMemo(() => {
    return staffList.find(s => s.id === selectedStaffId) || null
  }, [staffList, selectedStaffId])

  // Quick Preset Handlers
  const applyPreset = (preset: 'this_month' | 'last_month' | 'last_30' | 'last_90' | 'q1' | 'q2' | 'q3' | 'q4' | 'ytd' | 'full_year') => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()

    if (preset === 'this_month') {
      setStartDate(`${y}-${String(m + 1).padStart(2, '0')}-01`)
      setEndDate(todayStr)
    } else if (preset === 'last_month') {
      const prevM = m === 0 ? 11 : m - 1
      const prevY = m === 0 ? y - 1 : y
      const lastDay = new Date(prevY, prevM + 1, 0).getDate()
      setStartDate(`${prevY}-${String(prevM + 1).padStart(2, '0')}-01`)
      setEndDate(`${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`)
    } else if (preset === 'last_30') {
      const d = new Date()
      d.setDate(d.getDate() - 30)
      setStartDate(d.toISOString().split('T')[0])
      setEndDate(todayStr)
    } else if (preset === 'last_90') {
      const d = new Date()
      d.setDate(d.getDate() - 90)
      setStartDate(d.toISOString().split('T')[0])
      setEndDate(todayStr)
    } else if (preset === 'q1') {
      setStartDate(`${y}-01-01`)
      setEndDate(`${y}-03-31`)
    } else if (preset === 'q2') {
      setStartDate(`${y}-04-01`)
      setEndDate(`${y}-06-30`)
    } else if (preset === 'q3') {
      setStartDate(`${y}-07-01`)
      setEndDate(`${y}-09-30`)
    } else if (preset === 'q4') {
      setStartDate(`${y}-10-01`)
      setEndDate(`${y}-12-31`)
    } else if (preset === 'ytd') {
      setStartDate(`${currentYear}-01-01`)
      setEndDate(todayStr)
    } else if (preset === 'full_year') {
      setStartDate(`${currentYear}-01-01`)
      setEndDate(`${currentYear}-12-31`)
    }
  }

  // Generate Report Card Data
  const generateReport = async () => {
    if (!selectedStaffId || !startDate || !endDate) return
    if (startDate > endDate) {
      alert('Start Date cannot be after End Date')
      return
    }

    setLoading(true)
    try {
      // 1. Fetch attendance records for this staff
      let allRecords: any[] = []
      let from = 0
      const PAGE_SIZE = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('*')
          .eq('staff_id', selectedStaffId)
          .gte('attendance_date', startDate)
          .lte('attendance_date', endDate)
          .range(from, from + PAGE_SIZE - 1)

        if (error) throw error
        if (data && data.length > 0) {
          allRecords = allRecords.concat(data)
          from += PAGE_SIZE
          if (data.length < PAGE_SIZE) hasMore = false
        } else {
          hasMore = false
        }
      }

      // Check LocalStorage cache for recent today records
      try {
        const todayCacheRaw = localStorage.getItem(`hris_attendance_daily_${todayStr}`)
        if (todayCacheRaw && startDate <= todayStr && endDate >= todayStr) {
          const cached = JSON.parse(todayCacheRaw)
          Object.values(cached).forEach((cRec: any) => {
            if (cRec.staff_id === selectedStaffId && !allRecords.some(r => r.attendance_date === todayStr)) {
              allRecords.push(cRec)
            }
          })
        }
      } catch (e) {}

      // 2. Fetch approved leaves for this staff in this period
      const { data: leaveData } = await supabase
        .from('leave_requests')
        .select(`
          id,
          start_date,
          end_date,
          reason,
          status,
          leave_types (name)
        `)
        .eq('staff_id', selectedStaffId)
        .eq('status', 'approved')
        .lte('start_date', endDate)
        .gte('end_date', startDate)

      const leaveRecords = leaveData || []

      // 3. Map records by date
      const recordMap = new Map<string, any>()
      allRecords.forEach(r => {
        if (r.attendance_date) recordMap.set(r.attendance_date, r)
      })

      // 4. Construct Day-by-Day Roster
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const daysList: DailyAttendanceDetail[] = []
      const cur = new Date(startDate)
      const end = new Date(endDate)

      while (cur <= end) {
        const dStr = cur.toISOString().split('T')[0]
        const dow = cur.getDay()
        const isWeekend = dow === 0 || dow === 6
        const dayOfWeek = DAY_NAMES[dow]
        const holiday = isPublicHoliday(dStr, customHolidays)
        const isFuture = dStr > todayStr

        // Check if joined after this date
        const isPreEmployment = Boolean(currentStaff?.date_employed && dStr < currentStaff.date_employed.slice(0, 10))

        const existing = recordMap.get(dStr)
        const onLeaveReq = leaveRecords.find((l: any) => dStr >= l.start_date && dStr <= l.end_date)

        let status = 'Absent'
        let clockIn = ''
        let clockOut = ''
        let isLate = false
        let lateMins = 0
        let workMode = 'Office'
        let location = ''
        let otHours = 0
        let otApproval = 'None'
        let notes = ''
        let hoursWorked = 0
        let duration = ''

        if (isPreEmployment) {
          status = 'Pre-Employment'
          notes = 'Not yet employed'
        } else if (existing) {
          if (existing.status === 'present') {
            isLate = Boolean(existing.is_late)
            lateMins = existing.late_minutes || 0
            status = isLate ? 'Present (Late)' : 'Present (On-Time)'
            clockIn = existing.clock_in_time ? formatTime12Hour(existing.clock_in_time) : ''
            clockOut = existing.clock_out_time ? formatTime12Hour(existing.clock_out_time) : ''

            if (existing.clock_in_time && existing.clock_out_time) {
              const [inH, inM] = existing.clock_in_time.split(':').map(Number)
              const [outH, outM] = existing.clock_out_time.split(':').map(Number)
              let diff = (outH * 60 + outM) - (inH * 60 + inM)
              if (diff < 0) diff += 1440
              hoursWorked = Math.round((diff / 60) * 10) / 10
              const h = Math.floor(diff / 60)
              const m = diff % 60
              duration = `${h}h ${m}m`
            } else if (existing.clock_in_time) {
              duration = 'In Progress'
              hoursWorked = 8
            }
          } else if (existing.status === 'on_leave') {
            status = 'On Leave'
            notes = existing.field_notes || 'Approved Leave'
          } else if (existing.status === 'public_holiday') {
            status = 'Public Holiday'
            notes = holiday ? holiday.name : 'Statutory Holiday'
          } else if (existing.status === 'weekend') {
            status = 'Weekend'
          } else {
            status = 'Absent'
          }

          workMode = (existing.work_mode || 'office').charAt(0).toUpperCase() + (existing.work_mode || 'office').slice(1)
          location = existing.matched_location_name || existing.field_client_name || ''
          otHours = existing.overtime_hours || 0
          otApproval = existing.overtime_approval ? (existing.overtime_approval.charAt(0).toUpperCase() + existing.overtime_approval.slice(1)) : 'None'
          if (!notes) notes = existing.field_notes || ''
        } else if (onLeaveReq) {
          status = 'On Leave'
          const lName = onLeaveReq.leave_types?.name || 'Approved Leave'
          notes = `${lName}: ${onLeaveReq.reason || 'Approved leave'}`
        } else if (holiday) {
          status = 'Public Holiday'
          notes = holiday.name || 'Public Holiday'
        } else if (isWeekend) {
          status = 'Weekend'
        } else if (isFuture) {
          status = 'Upcoming'
        } else {
          status = 'Absent'
        }

        // If user chose not to include weekends and it's a weekend with no presence
        const shouldSkipWeekend = !includeWeekends && isWeekend && status === 'Weekend'
        if (!shouldSkipWeekend && !isPreEmployment) {
          daysList.push({
            date: dStr,
            dayOfWeek,
            status,
            clockInTime: clockIn,
            clockOutTime: clockOut,
            duration,
            hoursWorked,
            isLate,
            lateMinutes: lateMins,
            workMode,
            location,
            overtimeHours: otHours,
            overtimeApproval: otApproval,
            notes,
          })
        }

        cur.setDate(cur.getDate() + 1)
      }

      setDailyRecords(daysList)
      setReportReady(true)
    } catch (err: any) {
      console.error('Report card generation error:', err)
      alert(err?.message || 'Error generating report card')
    } finally {
      setLoading(false)
    }
  }

  // Automatically generate report when staff or dates change
  useEffect(() => {
    if (isOpen && selectedStaffId) {
      generateReport()
    }
  }, [isOpen, selectedStaffId, startDate, endDate, includeWeekends])

  // Calculated Report Card Analytics
  const analytics = useMemo(() => {
    let workingDays = 0
    let presentDays = 0
    let onTimeDays = 0
    let lateDays = 0
    let totalLateMinutes = 0
    let absentDays = 0
    let leaveDays = 0
    let weekendShifts = 0
    let fieldVisits = 0
    let approvedOT = 0
    let totalWorkHours = 0

    dailyRecords.forEach(r => {
      const isWeekend = r.dayOfWeek === 'Saturday' || r.dayOfWeek === 'Sunday'
      const isHoliday = r.status === 'Public Holiday'
      const isWorkDay = !isWeekend && !isHoliday

      if (isWorkDay) workingDays++

      if (r.status.startsWith('Present')) {
        presentDays++
        if (r.isLate) {
          lateDays++
          totalLateMinutes += (r.lateMinutes || 0)
        } else {
          onTimeDays++
        }
        if (isWeekend) weekendShifts++
        if (r.workMode.toLowerCase() === 'field') fieldVisits++
        if (r.overtimeApproval === 'Approved') approvedOT += r.overtimeHours
        totalWorkHours += r.hoursWorked
      } else if (r.status === 'On Leave') {
        leaveDays++
      } else if (r.status === 'Absent') {
        if (isWorkDay) absentDays++
      }
    })

    const workingDaysCount = Math.max(1, workingDays)
    const presenceRate = Math.min(100, Math.round((presentDays / workingDaysCount) * 100))
    const complianceRate = Math.min(100, Math.round(((presentDays + leaveDays) / workingDaysCount) * 100))
    const punctualityScore = presentDays > 0 ? Math.min(100, Math.round((onTimeDays / presentDays) * 100)) : 100
    const avgLateMins = lateDays > 0 ? Math.round(totalLateMinutes / lateDays) : 0

    let rating = 'Critical (Disciplinary Review)'
    let ratingBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300'
    let ratingColor = '#e11d48'

    if (complianceRate >= 95 && punctualityScore >= 90) {
      rating = 'Excellent (Exemplary Performance)'
      ratingBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300'
      ratingColor = '#059669'
    } else if (complianceRate >= 85 && punctualityScore >= 80) {
      rating = 'Good (Standard Performance)'
      ratingBadgeClass = 'bg-blue-100 text-blue-800 border-blue-300'
      ratingColor = '#2563eb'
    } else if (complianceRate >= 75) {
      rating = 'Satisfactory'
      ratingBadgeClass = 'bg-amber-100 text-amber-800 border-amber-300'
      ratingColor = '#d97706'
    } else if (complianceRate < 75 || punctualityScore < 70) {
      rating = 'Needs Improvement / Attention'
      ratingBadgeClass = 'bg-orange-100 text-orange-800 border-orange-300'
      ratingColor = '#ea580c'
    }

    return {
      workingDays,
      presentDays,
      onTimeDays,
      lateDays,
      totalLateMinutes,
      avgLateMins,
      absentDays,
      leaveDays,
      weekendShifts,
      fieldVisits,
      approvedOT,
      totalWorkHours: Math.round(totalWorkHours * 10) / 10,
      presenceRate,
      complianceRate,
      punctualityScore,
      rating,
      ratingBadgeClass,
      ratingColor,
    }
  }, [dailyRecords])

  // Download Individual Staff Report as Excel (.xlsx)
  const handleExportExcel = () => {
    if (!currentStaff) return

    const wb = XLSX.utils.book_new()

    // 1. Overview Sheet
    const overviewData = [
      ['FIRSTOPTION HRIS - EMPLOYEE ATTENDANCE & PERFORMANCE REPORT CARD'],
      ['Report Generated:', new Date().toLocaleString()],
      ['Evaluation Period:', `${startDate} to ${endDate}`],
      [],
      ['EMPLOYEE INFORMATION', ''],
      ['Staff Code', currentStaff.staff_code],
      ['Full Name', currentStaff.full_name],
      ['Department', currentStaff.department_name],
      ['Job Title', currentStaff.job_title],
      ['Date Employed', currentStaff.date_employed || 'N/A'],
      [],
      ['PERFORMANCE SCORECARD', 'VALUE', 'BENCHMARK / COMMENTS'],
      ['Overall Performance Rating', analytics.rating, 'Based on presence and punctuality'],
      ['Attendance Compliance Rate', `${analytics.complianceRate}%`, 'Includes approved leaves'],
      ['Pure Presence Rate', `${analytics.presenceRate}%`, 'Actual working shifts worked'],
      ['Punctuality Score', `${analytics.punctualityScore}%`, 'Arrivals on or before 8:30 AM'],
      ['Scheduled Working Days', analytics.workingDays, 'Excluding statutory holidays'],
      ['Days Present', analytics.presentDays, ''],
      ['On-Time Days', analytics.onTimeDays, ''],
      ['Late Arrivals', analytics.lateDays, ''],
      ['Total Late Minutes', `${analytics.totalLateMinutes} mins`, `Avg ${analytics.avgLateMins} mins per late arrival`],
      ['Unexcused Absent Days', analytics.absentDays, ''],
      ['Approved Leave Days', analytics.leaveDays, ''],
      ['Weekend Shifts Worked', analytics.weekendShifts, 'Saturday/Sunday shifts'],
      ['Field / Client Waypoints', analytics.fieldVisits, ''],
      ['Approved Overtime Hours', `${analytics.approvedOT} hrs`, ''],
      ['Estimated Total Work Hours', `${analytics.totalWorkHours} hrs`, ''],
    ]

    const wsOverview = XLSX.utils.aoa_to_sheet(overviewData)
    XLSX.utils.book_append_sheet(wb, wsOverview, 'Performance Scorecard')

    // 2. Daily Log Sheet
    const dailyHeaders = [
      'Date',
      'Day of Week',
      'Attendance Status',
      'Clock In Time',
      'Clock Out Time',
      'Work Duration',
      'Work Hours',
      'Late Arrival',
      'Late Minutes',
      'Work Mode',
      'Location / Branch / Client',
      'Overtime Hours',
      'Overtime Approval',
      'Notes & Remarks',
    ]

    const dailyRows = dailyRecords.map(r => [
      r.date,
      r.dayOfWeek,
      r.status,
      r.clockInTime || '',
      r.clockOutTime || '',
      r.duration || '',
      r.hoursWorked || 0,
      r.isLate ? 'Yes' : 'No',
      r.lateMinutes || 0,
      r.workMode,
      r.location || '',
      r.overtimeHours || 0,
      r.overtimeApproval,
      r.notes || '',
    ])

    const wsDaily = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyRows])
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Attendance Log')

    const cleanName = currentStaff.full_name.replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `Report_Card_${currentStaff.staff_code}_${cleanName}_${startDate}_to_${endDate}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // Download Individual Staff Report as CSV (.csv)
  const handleExportCSV = () => {
    if (!currentStaff) return

    const lines: string[] = []
    lines.push('FIRSTOPTION HRIS - EMPLOYEE ATTENDANCE REPORT CARD')
    lines.push(`"Staff Code:","${currentStaff.staff_code}"`)
    lines.push(`"Employee Name:","${currentStaff.full_name}"`)
    lines.push(`"Department:","${currentStaff.department_name}"`)
    lines.push(`"Job Title:","${currentStaff.job_title}"`)
    lines.push(`"Evaluation Timeframe:","${startDate} to ${endDate}"`)
    lines.push(`"Overall Rating:","${analytics.rating}"`)
    lines.push(`"Attendance Compliance:","${analytics.complianceRate}%"`)
    lines.push(`"Punctuality Score:","${analytics.punctualityScore}%"`)
    lines.push(`"Scheduled Working Days:","${analytics.workingDays}"`)
    lines.push(`"Days Present:","${analytics.presentDays}"`)
    lines.push(`"On-Time Days:","${analytics.onTimeDays}"`)
    lines.push(`"Late Arrivals:","${analytics.lateDays} (${analytics.totalLateMinutes} mins total)"`)
    lines.push(`"Unexcused Absences:","${analytics.absentDays}"`)
    lines.push(`"Approved Leaves:","${analytics.leaveDays}"`)
    lines.push(`"Approved Overtime:","${analytics.approvedOT} hrs"`)
    lines.push(`"Estimated Work Hours:","${analytics.totalWorkHours} hrs"`)
    lines.push('')
    lines.push('========================================================================================================================')
    lines.push('DAILY ATTENDANCE LOG')
    lines.push('========================================================================================================================')

    const headers = [
      'Date',
      'Day of Week',
      'Status',
      'Clock In',
      'Clock Out',
      'Duration',
      'Hours',
      'Is Late',
      'Late Minutes',
      'Work Mode',
      'Location / Site',
      'OT Hours',
      'OT Approval',
      'Notes & Remarks',
    ]
    lines.push(headers.join(','))

    dailyRecords.forEach(r => {
      lines.push([
        r.date,
        r.dayOfWeek,
        `"${r.status.replace(/"/g, '""')}"`,
        r.clockInTime || '',
        r.clockOutTime || '',
        `"${r.duration}"`,
        r.hoursWorked,
        r.isLate ? 'Yes' : 'No',
        r.lateMinutes || 0,
        r.workMode,
        `"${(r.location || '').replace(/"/g, '""')}"`,
        r.overtimeHours,
        r.overtimeApproval,
        `"${(r.notes || '').replace(/"/g, '""')}"`,
      ].join(','))
    })

    const csvContent = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const cleanName = currentStaff.full_name.replace(/[^a-zA-Z0-9]/g, '_')
    link.setAttribute('href', url)
    link.setAttribute('download', `Report_Card_${currentStaff.staff_code}_${cleanName}_${startDate}_to_${endDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Print Report Card Function
  const handlePrint = () => {
    window.print()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden anim-scale-up my-auto flex flex-col max-h-[95vh]">
        {/* Modal Top Header (Dark Executive) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 text-blue-300 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg">Staff Performance Report Card</h3>
              <p className="text-xs text-slate-300">Detailed attendance analysis & audit scorecard per employee</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body & Settings Bar */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Controls Bar: Staff Selection & Timeframe Setting */}
          <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Staff Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select Staff Member *
                </label>
                <select
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.staff_code ? `[${s.staff_code}] ` : ''}{s.full_name} ({s.department_name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  From Date (Start)
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  To Date (End)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Quick Presets & Options */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Time Presets:</span>
                {[
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_month', label: 'Last Month' },
                  { id: 'last_30', label: 'Last 30 Days' },
                  { id: 'last_90', label: 'Last 90 Days' },
                  { id: 'q1', label: 'Q1' },
                  { id: 'q2', label: 'Q2' },
                  { id: 'q3', label: 'Q3' },
                  { id: 'q4', label: 'Q4' },
                  { id: 'ytd', label: 'Year to Date' },
                  { id: 'full_year', label: 'Full Year 2026' },
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id as any)}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all shadow-2xs"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={includeWeekends}
                  onChange={e => setIncludeWeekends(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span>Include weekend days</span>
              </label>
            </div>
          </div>

          {/* Printable Report Card Sheet */}
          {loading ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto" />
              <div className="text-xs font-semibold">Generating report card calculations...</div>
            </div>
          ) : currentStaff && (
            <div ref={printRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 print:border-none print:shadow-none print:p-0">
              {/* Employee Bio & Organization Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                <div className="flex items-center gap-4">
                  {currentStaff.photo_url ? (
                    <img
                      src={currentStaff.photo_url}
                      alt={currentStaff.full_name}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-200 shadow-xs flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-700 text-xl font-bold flex items-center justify-center border-2 border-blue-200 flex-shrink-0">
                      {currentStaff.full_name.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display font-bold text-slate-900 text-xl sm:text-2xl">
                        {currentStaff.full_name}
                      </h2>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {currentStaff.staff_code || 'ID-N/A'}
                      </span>
                    </div>

                    <div className="text-xs sm:text-sm text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-blue-700">{currentStaff.job_title}</span>
                      <span>•</span>
                      <span>{currentStaff.department_name}</span>
                      {currentStaff.date_employed && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">Employed: {currentStaff.date_employed.slice(0, 10)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rating Badge */}
                <div className="text-left sm:text-right">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Evaluation Rating</div>
                  <div className={`mt-1 inline-flex items-center px-3 py-1 rounded-xl text-xs sm:text-sm font-bold border ${analytics.ratingBadgeClass}`}>
                    {analytics.rating}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Timeframe: {startDate} → {endDate}
                  </div>
                </div>
              </div>

              {/* Performance Scorecard KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Attendance Compliance */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
                    Attendance Compliance
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-950 mt-1">
                    {analytics.complianceRate}%
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-0.5">
                    {analytics.presentDays} present + {analytics.leaveDays} leave / {analytics.workingDays}d
                  </div>
                </div>

                {/* Punctuality Score */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                  <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">
                    Punctuality Score
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold font-mono text-blue-950 mt-1">
                    {analytics.punctualityScore}%
                  </div>
                  <div className="text-[10px] text-blue-700 mt-0.5">
                    {analytics.onTimeDays} punctual out of {analytics.presentDays} shifts
                  </div>
                </div>

                {/* Lateness Toll */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
                  <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">
                    Late Arrivals
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold font-mono text-amber-950 mt-1">
                    {analytics.lateDays}
                  </div>
                  <div className="text-[10px] text-amber-800 mt-0.5">
                    {analytics.totalLateMinutes} total mins (avg {analytics.avgLateMins}m)
                  </div>
                </div>

                {/* Total Work Hours */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200">
                  <div className="text-[11px] font-bold text-purple-800 uppercase tracking-wide">
                    Total Hours Worked
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold font-mono text-purple-950 mt-1">
                    {analytics.totalWorkHours}h
                  </div>
                  <div className="text-[10px] text-purple-700 mt-0.5">
                    {analytics.approvedOT > 0 ? `+${analytics.approvedOT}h approved OT` : 'No OT recorded'}
                  </div>
                </div>
              </div>

              {/* Metric Breakdown Matrix */}
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Summary Breakdown ({dailyRecords.length} Days Evaluated)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-6 text-xs">
                  <div>
                    <span className="text-slate-400 block">Scheduled Working Days:</span>
                    <span className="font-bold text-slate-800 text-sm">{analytics.workingDays} days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Total Days Present:</span>
                    <span className="font-bold text-emerald-700 text-sm">{analytics.presentDays} days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">On-Time Arrivals:</span>
                    <span className="font-bold text-blue-700 text-sm">{analytics.onTimeDays} days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Late Arrivals:</span>
                    <span className="font-bold text-amber-700 text-sm">{analytics.lateDays} ({analytics.totalLateMinutes}m)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Unexcused Absences:</span>
                    <span className="font-bold text-rose-700 text-sm">{analytics.absentDays} days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Approved Leave Taken:</span>
                    <span className="font-bold text-purple-700 text-sm">{analytics.leaveDays} days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Weekend Shifts Worked:</span>
                    <span className="font-bold text-indigo-700 text-sm">{analytics.weekendShifts} shifts</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Field / Client Visits:</span>
                    <span className="font-bold text-teal-700 text-sm">{analytics.fieldVisits} stops</span>
                  </div>
                </div>
              </div>

              {/* Detailed Daily Attendance Records Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Detailed Day-by-Day Roster ({dailyRecords.length} Rows)
                  </h4>
                  <span className="text-[11px] text-slate-400">Chronological Audit Log</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-[11px] text-slate-600 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Day</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Clock In</th>
                        <th className="px-3 py-2.5">Clock Out</th>
                        <th className="px-3 py-2.5">Duration</th>
                        <th className="px-3 py-2.5">Late (Mins)</th>
                        <th className="px-3 py-2.5">Mode / Location</th>
                        <th className="px-3 py-2.5">Remarks / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyRecords.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center py-6 text-slate-400">
                            No attendance records found for this period.
                          </td>
                        </tr>
                      ) : (
                        dailyRecords.map(r => (
                          <tr key={r.date} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3 py-2 font-mono font-medium text-slate-800">{r.date}</td>
                            <td className="px-3 py-2 text-slate-500">{r.dayOfWeek.slice(0, 3)}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.status.startsWith('Present (On-Time)')
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : r.status.startsWith('Present (Late)')
                                    ? 'bg-amber-100 text-amber-800'
                                    : r.status === 'On Leave'
                                    ? 'bg-blue-100 text-blue-800'
                                    : r.status === 'Public Holiday'
                                    ? 'bg-teal-100 text-teal-800'
                                    : r.status === 'Weekend'
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono">{r.clockInTime || '—'}</td>
                            <td className="px-3 py-2 font-mono">{r.clockOutTime || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{r.duration || '—'}</td>
                            <td className="px-3 py-2 font-mono text-amber-700">
                              {r.lateMinutes > 0 ? `${r.lateMinutes}m` : '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate" title={r.location || r.workMode}>
                              {r.location ? `${r.workMode} (${r.location})` : r.workMode}
                            </td>
                            <td className="px-3 py-2 text-slate-500 max-w-[160px] truncate" title={r.notes}>
                              {r.notes || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sign-Off Footer (For printed PDF copies) */}
              <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-8 text-xs text-slate-500">
                <div>
                  <div className="font-bold text-slate-700">HR Manager / Supervisor Verification:</div>
                  <div className="border-b border-slate-300 h-10 mt-2" />
                  <div className="text-[10px] text-slate-400 mt-1">Signature & Date</div>
                </div>
                <div>
                  <div className="font-bold text-slate-700">Staff Member Acknowledgment:</div>
                  <div className="border-b border-slate-300 h-10 mt-2" />
                  <div className="text-[10px] text-slate-400 mt-1">Signature & Date</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors order-2 sm:order-1"
          >
            Close
          </button>

          <div className="flex items-center gap-2 order-1 sm:order-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !reportReady}
              className="px-3.5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print / Save PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={loading || !reportReady}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={loading || !reportReady}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              <span>Download Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
