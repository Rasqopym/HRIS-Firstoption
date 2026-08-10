import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

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
    ['Staff Name', 'Staff ID', 'Department', 'Days Present', 'Days Absent', 'Days on Leave', 'Total OT Hours', 'Approved OT Hours', 'Site Days'],
    ...summaries.map(s => [
      s.name,
      s.staffId,
      s.department,
      s.daysPresent,
      s.daysAbsent,
      s.daysOnLeave,
      s.totalOvertimeHours,
      s.approvedOvertimeHours,
      s.daysOnSite,
    ])
  ]
  
  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
  
  // Create workbook and add worksheet
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Summary')
  
  // Generate filename and download
  const filename = `attendance-summary-${monthName}-${year}.xlsx`
  XLSX.writeFile(workbook, filename)
}

export default function AttendanceSummary() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([])
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

  // Compute total working days (weekdays) in selected month
  const getTotalWorkingDays = () => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate()
    let workingDays = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(selectedYear, selectedMonth, d).getDay()
      if (dow !== 0 && dow !== 6) { // Not Sunday (0) or Saturday (6)
        workingDays++
      }
    }
    return workingDays
  }

  // Fetch and compute summaries on mount and month/year change
  useEffect(() => {
    const fetchSummaries = async () => {
      setLoading(true)
      
      // Fetch active staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, staff_code, full_name, departments(name)')
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
        department_name: s.departments?.name || 'Unknown'
      }))

      // Fetch all attendance records for the selected month
      const firstDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const lastDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, '0')}`
      
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance_records')
        .select('*')
        .gte('attendance_date', firstDay)
        .lte('attendance_date', lastDay)
      
      if (attendanceError) {
        console.error('Failed to fetch attendance:', attendanceError)
      }

      // Group attendance by staff_id
      const attendanceByStaff: Record<string, any[]> = {}
      if (attendanceData && !attendanceError) {
        attendanceData.forEach(record => {
          if (!attendanceByStaff[record.staff_id]) {
            attendanceByStaff[record.staff_id] = []
          }
          attendanceByStaff[record.staff_id].push(record)
        })
      }

      // Compute summaries for each staff member
      const computedSummaries: AttendanceSummary[] = staffWithDept.map(staff => {
        const records = attendanceByStaff[staff.id] || []
        
        const daysPresent = records.filter(r => r.status === 'present').length
        const daysAbsent = records.filter(r => r.status === 'absent').length
        const daysOnLeave = records.filter(r => r.status === 'on_leave').length
        const totalOvertimeHours = records.reduce((sum, r) => sum + (r.overtime_hours || 0), 0)
        const approvedOvertimeHours = records
          .filter(r => r.overtime_approval === 'approved')
          .reduce((sum, r) => sum + (r.overtime_hours || 0), 0)
        const daysOnSite = records.filter(r => r.on_site === true).length

        return {
          staffId: staff.staff_code,
          name: staff.full_name,
          department: staff.department_name,
          daysPresent,
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
      <div className="p-6 flex items-center justify-center">
        <div className="text-slate-500">Loading attendance summary...</div>
      </div>
    )
  }

  const totalWorkingDays = getTotalWorkingDays()
  const avgDaysPresent = summaries.length > 0 
    ? (summaries.reduce((a, s) => a + s.daysPresent, 0) / summaries.length).toFixed(1)
    : '0'
  const totalOTHours = summaries.reduce((a, s) => a + s.approvedOvertimeHours, 0).toFixed(1)
  const staffOnLeave = summaries.filter(s => s.daysOnLeave > 0).length
  const siteDeployed = summaries.filter(s => s.daysOnSite > 0).length

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">Monthly Attendance Summary</h2>
          <p className="text-sm text-slate-500">{monthYearLabel} — used by Accountant when running payroll</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrevMonth} className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">
            ‹
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center py-2">{monthYearLabel}</span>
          <button onClick={handleNextMonth} className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">
            ›
          </button>
          <button 
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => exportToExcel(summaries, selectedMonth, selectedYear)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
        </div>
      </div>

      {/* Aggregate cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-5">
        {[
          { l: 'Total Working Days', v: totalWorkingDays, sub: monthYearLabel, color: 'text-slate-800' },
          { l: 'Avg Days Present', v: avgDaysPresent, sub: 'Per staff', color: 'text-emerald-600' },
          { l: 'Total OT Hours', v: totalOTHours, sub: 'Approved only', color: 'text-violet-600' },
          { l: 'Staff on Leave', v: staffOnLeave, sub: 'Had leave this month', color: 'text-amber-600' },
          { l: 'Site-Deployed', v: siteDeployed, sub: 'Had site days', color: 'text-blue-600' },
        ].map(c => (
          <div key={c.l} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className={`font-display font-bold text-2xl ${c.color} font-mono-data`}>{c.v}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.l}</div>
            <div className="text-xs text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {summaries.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="text-slate-400 text-sm">No staff or attendance records found for {monthYearLabel}</div>
        </div>
      ) : (
        /* Summary table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50/60">Staff</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Department</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-emerald-600 uppercase tracking-wide">Present</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-red-500 uppercase tracking-wide">Absent</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-amber-600 uppercase tracking-wide">On Leave</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-violet-600 uppercase tracking-wide">OT Hours</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-violet-500 uppercase tracking-wide">OT Approved</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-blue-600 uppercase tracking-wide">Site Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {summaries.map(s => (
                  <tr key={s.staffId} className="table-row-hover">
                    <td className="py-3.5 px-4 sticky left-0 bg-white">
                      <div className="font-medium text-slate-800">{s.name}</div>
                      <div className="font-mono-data text-xs text-slate-400">{s.staffId}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{s.department}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-display font-bold text-sm flex items-center justify-center">
                        {s.daysPresent}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`font-mono-data font-bold ${s.daysAbsent > 0 ? 'text-red-600' : 'text-slate-300'}`}>{s.daysAbsent}</span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`font-mono-data font-bold ${s.daysOnLeave > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{s.daysOnLeave}</span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`font-mono-data font-bold ${s.totalOvertimeHours > 0 ? 'text-violet-600' : 'text-slate-300'}`}>
                        {s.totalOvertimeHours > 0 ? `${s.totalOvertimeHours}h` : '—'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`font-mono-data font-bold ${s.approvedOvertimeHours > 0 ? 'text-violet-700' : 'text-slate-300'}`}>
                        {s.approvedOvertimeHours > 0 ? `${s.approvedOvertimeHours}h` : '—'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {s.daysOnSite > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono-data text-xs font-bold">{s.daysOnSite}d</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
            {summaries.length} staff · {monthYearLabel} · OT hours shown are approved only — pending OT excluded from payroll until approved
          </div>
        </div>
      )}
    </div>
  )
}
