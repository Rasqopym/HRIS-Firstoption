import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import { calculateWorkingDaysInMonth, isPublicHoliday, type PublicHoliday } from '../../lib/holidays'

interface StaffMember {
  id: string
  staff_code: string
  full_name: string
  department_name?: string
}

interface AttendanceSummary {
  staffId: string
  name: string
  department: string
  daysPresent: number
  weekendShifts: number
  onTimeDays: number
  lateDays: number
  totalLateMinutes: number
  daysAbsent: number
  daysOnLeave: number
  totalOvertimeHours: number
  approvedOvertimeHours: number
  daysOnSite: number
}

const exportToExcel = (summaries: AttendanceSummary[], month: number, year: number) => {
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const monthName = monthNames[month]
  
  // Build worksheet data
  const worksheetData = [
    [
      'Staff Name',
      'Staff Code',
      'Department',
      'Total Days Present',
      'Weekend Shifts',
      'On-Time Days',
      'Late Days',
      'Total Late (Minutes)',
      'Days Absent',
      'Days on Leave',
      'Approved OT (Hours)',
      'Site Days'
    ],
    ...summaries.map(s => [
      s.name,
      s.staffId,
      s.department,
      s.daysPresent,
      s.weekendShifts,
      s.onTimeDays,
      s.lateDays,
      s.totalLateMinutes,
      s.daysAbsent,
      s.daysOnLeave,
      s.approvedOvertimeHours,
      s.daysOnSite,
    ])
  ]
  
  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Summary')
  
  const filename = `attendance-summary-${monthName}-${year}.xlsx`
  XLSX.writeFile(workbook, filename)
}

export default function AttendanceSummary() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([])
  const [customHolidays, setCustomHolidays] = useState<PublicHoliday[]>([])
  const [loading, setLoading] = useState(true)

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const monthYearLabel = `${monthNames[selectedMonth]} ${selectedYear}`

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11)
      setSelectedYear(selectedYear - 1)
    } else {
      setSelectedMonth(selectedMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0)
      setSelectedYear(selectedYear + 1)
    } else {
      setSelectedMonth(selectedMonth + 1)
    }
  }

  const getWorkingDaysInfo = () => {
    return calculateWorkingDaysInMonth(selectedYear, selectedMonth, customHolidays)
  }

  useEffect(() => {
    const fetchSummaries = async () => {
      setLoading(true)
      
      let fetchedHolidays: PublicHoliday[] = []
      try {
        const { data: settingsData } = await supabase
          .from('company_settings')
          .select('custom_holidays')
          .eq('id', 1)
          .maybeSingle()

        if (settingsData && Array.isArray(settingsData.custom_holidays)) {
          fetchedHolidays = settingsData.custom_holidays
          setCustomHolidays(settingsData.custom_holidays)
        } else {
          const cached = localStorage.getItem('hris_custom_holidays')
          if (cached) {
            fetchedHolidays = JSON.parse(cached)
            setCustomHolidays(fetchedHolidays)
          }
        }
      } catch (e) {}

      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, staff_code, full_name, profile_id, email, departments(name)')
        .eq('status', 'active')
        .order('full_name')
      
      if (staffError || !staffData) {
        console.error('Failed to fetch staff:', staffError)
        setLoading(false)
        return
      }

      const staffWithDept = staffData.map(s => ({
        id: s.id,
        staff_code: s.staff_code,
        full_name: s.full_name,
        profile_id: s.profile_id,
        email: s.email,
        department_name: (s.departments as any)?.name || (s.departments as any)?.[0]?.name || (s as any)?.department || 'Accounting & Finance'
      }))

      const firstDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const lastDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, '0')}`
      
      let attendanceData: any[] = []
      try {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('*')
          .gte('attendance_date', firstDay)
          .lte('attendance_date', lastDay)

        if (data && !error) {
          attendanceData = data
        }
      } catch (e) {
        console.warn('Supabase fetch attendance summary skipped:', e)
      }

      const attendanceByStaff: Record<string, any[]> = {}

      staffWithDept.forEach(staff => {
        const staffRecordsMap: Record<string, any> = {}
        const candidateIds = [staff.id, staff.staff_code, staff.profile_id, staff.email].filter(Boolean)

        try {
          candidateIds.forEach(cid => {
            const rawCache1 = localStorage.getItem(`hris_self_attendance_${cid}`)
            const rawCache2 = localStorage.getItem(`hris_attendance_daily_${cid}`)
            if (rawCache1) Object.assign(staffRecordsMap, JSON.parse(rawCache1))
            if (rawCache2) Object.assign(staffRecordsMap, JSON.parse(rawCache2))
          })
        } catch (e) {}

        attendanceData.filter(r => candidateIds.includes(r.staff_id)).forEach(r => {
          staffRecordsMap[r.attendance_date] = r
        })

        attendanceByStaff[staff.id] = Object.values(staffRecordsMap)
      })

      const today = new Date()
      const isCurrentMonth = selectedMonth === today.getMonth() && selectedYear === today.getFullYear()
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate()
      const lastEvaluatedDay = isCurrentMonth ? today.getDate() : daysInMonth
      
      let pastWorkingDays = 0
      for (let d = 1; d <= lastEvaluatedDay; d++) {
        const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const dow = new Date(selectedYear, selectedMonth, d).getDay()
        if (dow !== 0 && dow !== 6) {
          const isHoliday = isPublicHoliday(dateStr, fetchedHolidays)
          if (!isHoliday) {
            if (!isCurrentMonth || d < today.getDate()) {
              pastWorkingDays++
            }
          }
        }
      }

      const computedSummaries: AttendanceSummary[] = staffWithDept.map(staff => {
        const records = attendanceByStaff[staff.id] || []
        
        const daysPresent = records.filter(r => r.status === 'present').length
        const weekdayPresent = records.filter(r => {
          if (r.status !== 'present') return false
          const dow = new Date(r.attendance_date).getDay()
          return dow !== 0 && dow !== 6
        }).length

        const weekendShifts = records.filter(r => {
          if (r.status !== 'present') return false
          const dow = new Date(r.attendance_date).getDay()
          return dow === 0 || dow === 6
        }).length

        const lateDays = records.filter(r => r.status === 'present' && (r.is_late || r.isLate)).length
        const onTimeDays = Math.max(0, daysPresent - lateDays)
        const totalLateMinutes = records
          .filter(r => r.status === 'present' && (r.is_late || r.isLate))
          .reduce((sum, r) => sum + (r.late_minutes || r.lateMinutes || 0), 0)

        const explicitAbsent = records.filter(r => r.status === 'absent').length
        const daysOnLeave = records.filter(r => r.status === 'on_leave').length
        // Missed weekday working days (excluding approved leave) - weekends are never counted as absent
        const unrecordedAbsent = Math.max(0, pastWorkingDays - weekdayPresent - daysOnLeave)
        const daysAbsent = Math.max(explicitAbsent, unrecordedAbsent)
        
        const totalOvertimeHours = records.reduce((sum, r) => sum + (r.overtime_hours || r.overtimeHours || 0), 0)
        const approvedOvertimeHours = records
          .filter(r => r.overtime_approval === 'approved')
          .reduce((sum, r) => sum + (r.overtime_hours || r.overtimeHours || 0), 0)
        const daysOnSite = records.filter(r => r.on_site === true || r.onSite === true).length

        return {
          staffId: staff.staff_code,
          name: staff.full_name,
          department: staff.department_name,
          daysPresent,
          weekendShifts,
          onTimeDays,
          lateDays,
          totalLateMinutes,
          daysAbsent,
          daysOnLeave,
          totalOvertimeHours,
          approvedOvertimeHours,
          daysOnSite,
        }
      })

      setSummaries(computedSummaries)
      setLoading(false)
    }

    fetchSummaries()
  }, [selectedMonth, selectedYear])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  const { totalWorkingDays, holidayCountOnWeekdays } = getWorkingDaysInfo()
  const avgDaysPresent = summaries.length > 0 
    ? (summaries.reduce((a, s) => a + s.daysPresent, 0) / summaries.length).toFixed(1)
    : '0'
  const totalLateCount = summaries.reduce((a, s) => a + s.lateDays, 0)
  const totalOTHours = summaries.reduce((a, s) => a + s.approvedOvertimeHours, 0).toFixed(1)
  const totalWeekendShifts = summaries.reduce((a, s) => a + s.weekendShifts, 0)

  return (
    <div className="p-4 sm:p-6 anim-fade-up space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-slate-800 text-xl sm:text-2xl">Monthly Attendance Summary</h1>
          <p className="text-sm text-slate-500 mt-0.5">{monthYearLabel} — monthly presence, weekend shifts, lateness records, and overtime summary</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-2xs">
            <button onClick={handlePrevMonth} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-xs sm:text-sm font-semibold text-slate-700 px-2 min-w-[120px] text-center">{monthYearLabel}</span>
            <button onClick={handleNextMonth} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <button 
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-2xs"
            onClick={() => exportToExcel(summaries, selectedMonth, selectedYear)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Aggregate cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-slate-800 font-mono-data">{totalWorkingDays}</div>
          <div className="text-xs text-slate-500 mt-0.5">Standard Working Days</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {holidayCountOnWeekdays > 0 ? `${holidayCountOnWeekdays} public holiday${holidayCountOnWeekdays > 1 ? 's' : ''} deducted` : 'Monday to Friday baseline'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-emerald-600 font-mono-data">{avgDaysPresent}</div>
          <div className="text-xs text-slate-500 mt-0.5">Avg Days Present</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Includes weekend shifts</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-indigo-600 font-mono-data">{totalWeekendShifts}</div>
          <div className="text-xs text-slate-500 mt-0.5">Weekend Shifts Worked</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Saturday rota & Sunday OT</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-amber-600 font-mono-data">{totalLateCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">Late Arrivals</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Weekdays only</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-violet-600 font-mono-data">{totalOTHours}h</div>
          <div className="text-xs text-slate-500 mt-0.5">Approved OT Hours</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Billable for payroll</div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Employee</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Code</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">Department</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Present</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Weekend Shifts</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">On Time</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Late (Mins)</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Absent</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Leave</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">OT (Hrs)</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Site Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {summaries.map(s => (
                <tr key={s.staffId} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.staffId}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{s.department}</td>
                  <td className="px-3 py-3 text-center font-semibold text-emerald-600">{s.daysPresent}</td>
                  <td className="px-3 py-3 text-center font-semibold text-indigo-600">
                    {s.weekendShifts > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
                        +{s.weekendShifts}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center font-medium text-blue-600">{s.onTimeDays}</td>
                  <td className="px-3 py-3 text-center">
                    {s.lateDays > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold">
                        {s.lateDays} ({s.totalLateMinutes}m)
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center font-medium text-red-500">{s.daysAbsent > 0 ? s.daysAbsent : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-3 text-center font-medium text-purple-600">{s.daysOnLeave > 0 ? s.daysOnLeave : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-3 text-center font-mono text-xs text-violet-600 font-semibold">{s.approvedOvertimeHours > 0 ? `${s.approvedOvertimeHours}h` : '—'}</td>
                  <td className="px-3 py-3 text-center text-xs text-slate-600">{s.daysOnSite > 0 ? s.daysOnSite : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
