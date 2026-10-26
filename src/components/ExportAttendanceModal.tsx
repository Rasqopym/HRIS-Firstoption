import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { formatTime12Hour } from '../lib/geofence'
import { isPublicHoliday, type PublicHoliday } from '../lib/holidays'

interface ExportAttendanceModalProps {
  isOpen: boolean
  onClose: () => void
  defaultStartDate?: string
  defaultEndDate?: string
}

interface StaffMember {
  id: string
  staff_code: string
  full_name: string
  job_title: string
  department_name?: string
  date_employed?: string
}

export default function ExportAttendanceModal({
  isOpen,
  onClose,
  defaultStartDate,
  defaultEndDate,
}: ExportAttendanceModalProps) {
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const currentYear = new Date().getFullYear()

  // Default range: First day of current month to today
  const defaultMonthStart = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  const [startDate, setStartDate] = useState(defaultStartDate || defaultMonthStart)
  const [endDate, setEndDate] = useState(defaultEndDate || todayStr)
  const [selectedDept, setSelectedDept] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all')
  const [includeWeekends, setIncludeWeekends] = useState(false)
  const [onlyRecordedDays, setOnlyRecordedDays] = useState(false) // If true, only exports days with an actual record, not blank/unmarked days

  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [customHolidays, setCustomHolidays] = useState<PublicHoliday[]>([])
  const [loadingInitial, setLoadingInitial] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string>('')
  const [exportError, setExportError] = useState<string>('')

  useEffect(() => {
    if (defaultStartDate) setStartDate(defaultStartDate)
    if (defaultEndDate) setEndDate(defaultEndDate)
  }, [defaultStartDate, defaultEndDate])

  // Load staff list & departments on open
  useEffect(() => {
    if (!isOpen) return

    const loadMetadata = async () => {
      setLoadingInitial(true)
      try {
        const { data: staffData } = await supabase
          .from('staff')
          .select('id, staff_code, full_name, job_title, date_employed, departments(name)')
          .eq('status', 'active')
          .order('full_name')

        if (staffData) {
          const mapped: StaffMember[] = staffData.map((s: any) => ({
            id: s.id,
            staff_code: s.staff_code || '',
            full_name: s.full_name || 'Staff Member',
            job_title: s.job_title || 'Employee',
            department_name: s.departments?.name || 'General',
            date_employed: s.date_employed,
          }))
          setStaffList(mapped)

          const depts = Array.from(new Set(mapped.map(m => m.department_name).filter(Boolean))) as string[]
          depts.sort()
          setDepartments(depts)
        }

        // Fetch custom holidays
        const { data: holData } = await supabase.from('public_holidays').select('*')
        if (holData) {
          setCustomHolidays(holData.map((h: any) => ({
            date: h.holiday_date,
            name: h.name,
            isRecurring: h.is_recurring ?? false,
          })))
        }
      } catch (err) {
        console.error('Failed to load export metadata:', err)
      } finally {
        setLoadingInitial(false)
      }
    }

    loadMetadata()
  }, [isOpen])



  // Quick Preset Handlers
  const applyPreset = (preset: 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_30' | 'last_90' | 'ytd' | 'full_year') => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()

    if (preset === 'today') {
      setStartDate(todayStr)
      setEndDate(todayStr)
    } else if (preset === 'this_week') {
      const day = now.getDay()
      const diffToMonday = day === 0 ? -6 : 1 - day // Monday as first day
      const monday = new Date(now)
      monday.setDate(now.getDate() + diffToMonday)
      setStartDate(monday.toISOString().split('T')[0])
      setEndDate(todayStr)
    } else if (preset === 'this_month') {
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
    } else if (preset === 'ytd') {
      setStartDate(`${currentYear}-01-01`)
      setEndDate(todayStr)
    } else if (preset === 'full_year') {
      setStartDate(`${currentYear}-01-01`)
      setEndDate(`${currentYear}-12-31`)
    }
  }

  // Calculate day difference
  const dayCount = useMemo(() => {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = end.getTime() - start.getTime()
    return Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1)
  }, [startDate, endDate])

  // Helper to calculate duration in hours & minutes
  const calculateWorkDuration = (clockIn?: string, clockOut?: string) => {
    if (!clockIn || !clockOut) return ''
    try {
      const [inH, inM] = clockIn.split(':').map(Number)
      const [outH, outM] = clockOut.split(':').map(Number)
      let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM)
      if (diffMinutes < 0) diffMinutes += 24 * 60
      const hours = Math.floor(diffMinutes / 60)
      const mins = diffMinutes % 60
      return `${hours}h ${mins}m`
    } catch {
      return ''
    }
  }

  // The Main Export Execution Function
  const handleExecuteExport = async () => {
    if (!startDate || !endDate) {
      setExportError('Please select both a Start Date and an End Date.')
      return
    }
    if (startDate > endDate) {
      setExportError('Start Date cannot be after End Date.')
      return
    }

    setIsExporting(true)
    setExportError('')
    setExportProgress('Connecting to database and querying records...')

    try {
      // 1. Filter staff list according to user selection
      let targetStaff = staffList
      if (selectedDept !== 'all') {
        targetStaff = targetStaff.filter(s => s.department_name === selectedDept)
      }
      if (selectedStaffId !== 'all') {
        targetStaff = targetStaff.filter(s => s.id === selectedStaffId)
      }

      if (targetStaff.length === 0) {
        throw new Error('No staff members match the selected department or staff filter.')
      }

      const staffMap = new Map<string, StaffMember>()
      targetStaff.forEach(s => staffMap.set(s.id, s))

      // 2. Fetch attendance records in chunks using pagination to safely handle > 1000 rows
      setExportProgress(`Fetching attendance entries between ${startDate} and ${endDate}...`)
      let allRecords: any[] = []
      const PAGE_SIZE = 1000
      let from = 0
      let hasMore = true

      while (hasMore) {
        let query = supabase
          .from('attendance_records')
          .select(`
            id,
            staff_id,
            attendance_date,
            status,
            clock_in_time,
            clock_out_time,
            is_late,
            late_minutes,
            work_mode,
            matched_location_name,
            field_client_name,
            field_notes,
            overtime_hours,
            overtime_approval
          `)
          .gte('attendance_date', startDate)
          .lte('attendance_date', endDate)
          .range(from, from + PAGE_SIZE - 1)

        if (selectedStaffId !== 'all') {
          query = query.eq('staff_id', selectedStaffId)
        }

        const { data, error } = await query
        if (error) throw error

        if (data && data.length > 0) {
          allRecords = allRecords.concat(data)
          from += PAGE_SIZE
          if (data.length < PAGE_SIZE) {
            hasMore = false
          } else {
            setExportProgress(`Fetched ${allRecords.length} records so far...`)
          }
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
            const exists = allRecords.some(r => r.staff_id === cRec.staff_id && r.attendance_date === todayStr)
            if (!exists && (!selectedStaffId || selectedStaffId === 'all' || selectedStaffId === cRec.staff_id)) {
              allRecords.push({
                staff_id: cRec.staff_id,
                attendance_date: todayStr,
                status: cRec.status || 'present',
                clock_in_time: cRec.clock_in_time,
                clock_out_time: cRec.clock_out_time,
                is_late: cRec.is_late ?? false,
                late_minutes: cRec.late_minutes ?? 0,
                work_mode: cRec.work_mode || 'office',
                matched_location_name: cRec.matched_location_name,
                field_client_name: cRec.field_client_name,
                field_notes: cRec.field_notes,
                overtime_hours: cRec.overtime_hours ?? 0,
                overtime_approval: cRec.overtime_approval || 'none',
              })
            }
          })
        }
      } catch (e) {}

      // 3. Fetch approved leave requests spanning this date range
      setExportProgress('Cross-referencing approved staff leaves...')
      const { data: leaveData } = await supabase
        .from('leave_requests')
        .select(`
          id,
          staff_id,
          start_date,
          end_date,
          reason,
          status,
          leave_types (name)
        `)
        .eq('status', 'approved')
        .lte('start_date', endDate)
        .gte('end_date', startDate)

      const leaveRecords = leaveData || []

      // 4. Index records by `staffId_date`
      const recordMap = new Map<string, any>()
      allRecords.forEach(r => {
        if (r.staff_id && r.attendance_date) {
          recordMap.set(`${r.staff_id}_${r.attendance_date}`, r)
        }
      })

      // Generate all dates in the range
      setExportProgress('Formatting roster rows and calculating presence...')
      const datesInRange: string[] = []
      const cur = new Date(startDate)
      const end = new Date(endDate)
      while (cur <= end) {
        datesInRange.push(cur.toISOString().split('T')[0])
        cur.setDate(cur.getDate() + 1)
      }

      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

      // 5. Construct rows
      interface ExportRow {
        date: string
        dayOfWeek: string
        staffCode: string
        staffName: string
        department: string
        jobTitle: string
        status: string
        clockIn: string
        clockOut: string
        duration: string
        isLate: string
        lateMinutes: number
        workMode: string
        location: string
        overtimeHours: number
        overtimeApproval: string
        notes: string
      }

      const rows: ExportRow[] = []

      for (const dStr of datesInRange) {
        const dObj = new Date(dStr)
        const dow = dObj.getDay()
        const isWeekend = dow === 0 || dow === 6
        const dayOfWeek = DAY_NAMES[dow]
        const holiday = isPublicHoliday(dStr, customHolidays)
        const isFuture = dStr > todayStr

        // If user wants to skip weekends and it's not a weekend shift
        for (const st of targetStaff) {
          // Check employment date
          if (st.date_employed && dStr < st.date_employed) {
            continue // skip before staff joined
          }

          const existing = recordMap.get(`${st.id}_${dStr}`)

          // Check if on leave
          const onLeaveReq = leaveRecords.find((l: any) =>
            l.staff_id === st.id && dStr >= l.start_date && dStr <= l.end_date
          )

          // Determine final status
          let finalStatus = 'Absent'
          let clockIn = ''
          let clockOut = ''
          let isLateStr = 'No'
          let lateMins = 0
          let workMode = 'office'
          let location = ''
          let otHours = 0
          let otApproval = 'None'
          let notes = ''

          if (existing) {
            if (existing.status === 'present') {
              finalStatus = existing.is_late ? 'Present (Late)' : 'Present (On-Time)'
            } else if (existing.status === 'on_leave') {
              finalStatus = 'On Leave'
            } else if (existing.status === 'public_holiday') {
              finalStatus = 'Public Holiday'
            } else if (existing.status === 'weekend') {
              finalStatus = 'Weekend'
            } else {
              finalStatus = 'Absent'
            }

            clockIn = existing.clock_in_time ? formatTime12Hour(existing.clock_in_time) : ''
            clockOut = existing.clock_out_time ? formatTime12Hour(existing.clock_out_time) : ''
            isLateStr = existing.is_late ? 'Yes' : 'No'
            lateMins = existing.late_minutes || 0
            workMode = existing.work_mode || 'office'
            location = existing.matched_location_name || existing.field_client_name || ''
            otHours = existing.overtime_hours || 0
            otApproval = existing.overtime_approval ? (existing.overtime_approval.charAt(0).toUpperCase() + existing.overtime_approval.slice(1)) : 'None'
            notes = existing.field_notes || ''
          } else if (onLeaveReq) {
            finalStatus = 'On Leave'
            const leaveTypeName = onLeaveReq.leave_types?.name || 'Approved Leave'
            notes = `${leaveTypeName}: ${onLeaveReq.reason || 'Approved leave'}`
          } else if (holiday.isHoliday) {
            finalStatus = 'Public Holiday'
            notes = holiday.name || 'Public Holiday'
          } else if (isWeekend) {
            finalStatus = 'Weekend'
          } else if (isFuture) {
            finalStatus = 'Upcoming'
          } else {
            finalStatus = 'Absent'
          }

          // Filter by weekend setting:
          // If !includeWeekends, we only include weekends if there was an actual presence/work shift recorded!
          if (isWeekend && !includeWeekends && finalStatus === 'Weekend') {
            continue
          }

          // If onlyRecordedDays is true, skip days that are absent or unmarked
          if (onlyRecordedDays && !existing && !onLeaveReq) {
            continue
          }

          // Filter by selectedStatus
          if (selectedStatus === 'present' && !finalStatus.startsWith('Present')) continue
          if (selectedStatus === 'on_time' && finalStatus !== 'Present (On-Time)') continue
          if (selectedStatus === 'late' && finalStatus !== 'Present (Late)') continue
          if (selectedStatus === 'absent' && finalStatus !== 'Absent') continue
          if (selectedStatus === 'on_leave' && finalStatus !== 'On Leave') continue
          if (selectedStatus === 'field' && workMode !== 'field') continue

          const duration = calculateWorkDuration(existing?.clock_in_time, existing?.clock_out_time)

          rows.push({
            date: dStr,
            dayOfWeek,
            staffCode: st.staff_code || '',
            staffName: st.full_name,
            department: st.department_name || '',
            jobTitle: st.jobTitle,
            status: finalStatus,
            clockIn,
            clockOut,
            duration,
            isLate: isLateStr,
            lateMinutes: lateMins,
            workMode: workMode.charAt(0).toUpperCase() + workMode.slice(1),
            location,
            overtimeHours: otHours,
            overtimeApproval: otApproval,
            notes,
          })
        }
      }

      setExportProgress(`Generating CSV with ${rows.length} rows...`)

      // 6. Build CSV string
      const headers = [
        'Date',
        'Day of Week',
        'Staff Code',
        'Staff Name',
        'Department',
        'Job Title',
        'Attendance Status',
        'Clock In Time',
        'Clock Out Time',
        'Work Duration',
        'Late Arrival',
        'Late Minutes',
        'Work Mode',
        'Location / Branch / Client',
        'Overtime Hours',
        'Overtime Approval',
        'Notes & Remarks',
      ]

      const csvRows = rows.map(r => [
        r.date,
        r.dayOfWeek,
        r.staffCode,
        `"${r.staffName.replace(/"/g, '""')}"`,
        `"${r.department.replace(/"/g, '""')}"`,
        `"${r.jobTitle.replace(/"/g, '""')}"`,
        `"${r.status.replace(/"/g, '""')}"`,
        r.clockIn,
        r.clockOut,
        r.duration,
        r.isLate,
        r.lateMinutes,
        r.workMode,
        `"${r.location.replace(/"/g, '""')}"`,
        r.overtimeHours,
        r.overtimeApproval,
        `"${r.notes.replace(/"/g, '""')}"`,
      ])

      // Prefix with UTF-8 BOM (\uFEFF) so Excel respects UTF-8 encoding
      const csvContent = '\uFEFF' + [headers.join(','), ...csvRows.map(e => e.join(','))].join('\r\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const filename = `Staff_Attendance_Export_${startDate}_to_${endDate}.csv`
      link.setAttribute('href', url)
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setExportProgress(`✓ Done! Exported ${rows.length} entries to ${filename}`)
      setTimeout(() => {
        setIsExporting(false)
        onClose()
      }, 1200)
    } catch (err: any) {
      console.error('Export error:', err)
      setExportError(err?.message || 'An error occurred during export. Please try again.')
      setIsExporting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden anim-scale-up">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 text-blue-300 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg">Export Staff Attendance (CSV)</h3>
              <p className="text-xs text-slate-300">Custom date range & comprehensive roster export</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Quick Range Presets */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Quick Date Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'today', label: 'Today' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'last_30', label: 'Last 30 Days' },
                { id: 'last_90', label: 'Last 90 Days' },
                { id: 'ytd', label: 'Year to Date (2026)' },
                { id: 'full_year', label: 'Full Year 2026' },
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id as any)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-transparent transition-all"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                From Date (Start)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                To Date (End)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-1 sm:col-span-2 text-[11.5px] text-slate-500 flex items-center justify-between">
              <span>Selected span: <strong>{dayCount} calendar day{dayCount === 1 ? '' : 's'}</strong></span>
              <span>Default is UTF-8 encoded with Excel BOM</span>
            </div>
          </div>

          {/* Filter Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Department Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Department
              </label>
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Departments ({departments.length})</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Status Filter
              </label>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses (Present, Absent, Leave, etc.)</option>
                <option value="present">Present Only (On-Time & Late)</option>
                <option value="on_time">Present (On-Time Only)</option>
                <option value="late">Present (Late Only)</option>
                <option value="on_leave">On Leave Only</option>
                <option value="absent">Absent Only</option>
                <option value="field">Field Staff / Client Visits Only</option>
              </select>
            </div>

            {/* Staff Filter */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Staff Filter (Optional)
              </label>
              <select
                value={selectedStaffId}
                onChange={e => setSelectedStaffId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Active Staff Members ({staffList.length})</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.staff_code ? `[${s.staff_code}] ` : ''}{s.full_name} — {s.department_name} ({s.job_title})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2.5 pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={includeWeekends}
                onChange={e => setIncludeWeekends(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <span>Include non-working weekend days (Saturdays & Sundays with no shift)</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={onlyRecordedDays}
                onChange={e => setOnlyRecordedDays(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <span>Only export rows with recorded attendance or leave (exclude empty unrecorded days)</span>
            </label>
          </div>

          {/* Error Message */}
          {exportError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{exportError}</span>
            </div>
          )}

          {/* Progress / Status Notice */}
          {exportProgress && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2">
              {isExporting && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin text-blue-600">
                  <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              )}
              <span className="font-medium">{exportProgress}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecuteExport}
            disabled={isExporting || loadingInitial}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                  <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                <span>Exporting CSV...</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Generate & Download CSV</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
