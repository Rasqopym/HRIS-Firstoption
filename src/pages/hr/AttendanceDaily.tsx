import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAction } from '../../lib/auditLog'
import type { DayAttendance, AttendanceStatus } from '../../types'
import { formatTime12Hour, formatDistance } from '../../lib/geofence'

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-500',
  absent: 'bg-red-500',
  on_leave: 'bg-amber-400',
  public_holiday: 'bg-blue-400',
  weekend: 'bg-slate-200',
  unmarked: 'bg-slate-300',
}
const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: 'Present', absent: 'Absent', on_leave: 'On Leave',
  public_holiday: 'Public Holiday', weekend: 'Weekend', unmarked: 'Unmarked',
}
const STATUS_CELL: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  absent: 'bg-red-50 border-red-200 text-red-700',
  on_leave: 'bg-amber-50 border-amber-200 text-amber-700',
  public_holiday: 'bg-blue-50 border-blue-200 text-blue-600',
  weekend: 'bg-slate-100 border-slate-200 text-slate-400',
  unmarked: 'bg-slate-50 border-slate-200 text-slate-400',
}

interface ExtendedDayAttendance extends DayAttendance {
  workMode?: 'office' | 'field' | 'remote'
  matchedLocationName?: string
  fieldClientName?: string
  fieldNotes?: string
}

function buildMonth(year: number, month: number, existingRecords: Record<string, any>): ExtendedDayAttendance[] {
  const days: ExtendedDayAttendance[] = []
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = new Date(dateStr).getDay()
    const isWeekend = dow === 0 || dow === 6
    const dateObj = new Date(dateStr)
    dateObj.setHours(0, 0, 0, 0)
    const isFuture = dateObj > today
    
    if (existingRecords[dateStr]) {
      const rec = existingRecords[dateStr]
      days.push({
        date: dateStr,
        status: rec.status,
        clockInTime: rec.clock_in_time || rec.clockInTime,
        clockOutTime: rec.clock_out_time || rec.clockOutTime,
        isLate: rec.is_late ?? rec.isLate ?? false,
        lateMinutes: rec.late_minutes ?? rec.lateMinutes ?? 0,
        distanceMeters: rec.clock_in_distance_meters ?? rec.distanceMeters,
        workMode: rec.work_mode || rec.workMode || 'office',
        matchedLocationName: rec.matched_location_name || rec.matchedLocationName,
        fieldClientName: rec.field_client_name || rec.fieldClientName,
        fieldNotes: rec.field_notes || rec.fieldNotes,
        overtimeHours: rec.overtime_hours || rec.overtimeHours || 0,
        onSite: rec.on_site ?? rec.onSite ?? false,
        overtimeApproval: rec.overtime_approval || rec.overtimeApproval || 'none',
      })
    } else if (isWeekend) {
      days.push({
        date: dateStr,
        status: 'weekend',
        overtimeHours: 0,
        onSite: false,
        overtimeApproval: 'none',
      })
    } else if (isFuture) {
      days.push({
        date: dateStr,
        status: 'unmarked',
        overtimeHours: 0,
        onSite: false,
        overtimeApproval: 'none',
      })
    } else {
      days.push({
        date: dateStr,
        status: 'present',
        overtimeHours: 0,
        onSite: false,
        overtimeApproval: 'none',
      })
    }
  }
  return days
}

interface StaffMember {
  id: string
  staff_code: string
  full_name: string
  job_title: string
  photo_url: string
  department_name?: string
}

export default function AttendanceDaily() {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [days, setDays] = useState<ExtendedDayAttendance[]>([])
  const [editDay, setEditDay] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const selectedStaff = staffList.find(s => s.id === selectedStaffId) || staffList[0]

  const updateDay = async (date: string, patch: Partial<ExtendedDayAttendance>) => {
    setDays(prev => prev.map(d => d.date === date ? { ...d, ...patch } : d))
    
    const currentDay = days.find(d => d.date === date)
    const record = {
      staff_id: selectedStaffId,
      attendance_date: date,
      status: patch.status || currentDay?.status || 'present',
      clock_in_time: patch.clockInTime !== undefined ? patch.clockInTime : currentDay?.clockInTime || null,
      clock_out_time: patch.clockOutTime !== undefined ? patch.clockOutTime : currentDay?.clockOutTime || null,
      is_late: patch.isLate !== undefined ? patch.isLate : currentDay?.isLate || false,
      late_minutes: patch.lateMinutes !== undefined ? patch.lateMinutes : currentDay?.lateMinutes || 0,
      work_mode: patch.workMode !== undefined ? patch.workMode : currentDay?.workMode || 'office',
      matched_location_name: patch.matchedLocationName !== undefined ? patch.matchedLocationName : currentDay?.matchedLocationName || null,
      field_client_name: patch.fieldClientName !== undefined ? patch.fieldClientName : currentDay?.fieldClientName || null,
      field_notes: patch.fieldNotes !== undefined ? patch.fieldNotes : currentDay?.fieldNotes || null,
      overtime_hours: patch.overtimeHours ?? currentDay?.overtimeHours ?? 0,
      on_site: patch.onSite ?? currentDay?.onSite ?? false,
      overtime_approval: patch.overtimeApproval ?? currentDay?.overtimeApproval ?? 'none',
    }

    try {
      const cacheKey = `hris_self_attendance_${selectedStaffId}`
      const existingCache = JSON.parse(localStorage.getItem(cacheKey) || '{}')
      existingCache[date] = record
      localStorage.setItem(cacheKey, JSON.stringify(existingCache))
      localStorage.setItem(`hris_attendance_daily_${selectedStaffId}`, JSON.stringify(existingCache))
    } catch (e) {
      console.warn('LocalStorage save error:', e)
    }

    try {
      await supabase
        .from('attendance_records')
        .upsert(record, { onConflict: 'staff_id,attendance_date' })
    } catch (e) {
      console.warn('Supabase attendance upsert skipped:', e)
    }
  }

  const presentDays = days.filter(d => d.status === 'present').length
  const lateDays = days.filter(d => d.status === 'present' && d.isLate).length
  const onTimeDays = presentDays - lateDays
  const fieldVisits = days.filter(d => d.status === 'present' && d.workMode === 'field').length
  const totalLateMinutes = days.filter(d => d.status === 'present' && d.isLate).reduce((acc, d) => acc + (d.lateMinutes || 0), 0)

  const summary = {
    present: presentDays,
    onTime: onTimeDays,
    late: lateDays,
    fieldVisits,
    lateMinutes: totalLateMinutes,
    absent: days.filter(d => d.status === 'absent').length,
    onLeave: days.filter(d => d.status === 'on_leave').length,
    overtimeHrs: days.reduce((a, d) => a + d.overtimeHours, 0),
    pendingOT: days.filter(d => d.overtimeApproval === 'pending').length,
    sitedays: days.filter(d => d.onSite).length,
  }

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const firstDow = new Date(selectedYear, selectedMonth, 1).getDay()

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

  const handleSave = async () => {
    setSaved(true)
    if (selectedStaff) {
      await logAction({
        action: 'UPDATE',
        entity: 'Attendance',
        entityId: selectedStaffId,
        details: `Updated attendance for ${selectedStaff.full_name} — ${monthYearLabel}`
      })
    }
    setTimeout(() => setSaved(false), 2000)
  }

  useEffect(() => {
    const fetchStaff = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('staff')
        .select('id, staff_code, full_name, job_title, photo_url, departments(name)')
        .eq('status', 'active')
        .order('full_name')
      
      if (error) {
        console.error('Failed to fetch staff:', error)
      } else if (data) {
        const staffWithDept = data.map(s => ({
          id: s.id,
          staff_code: s.staff_code,
          full_name: s.full_name,
          job_title: s.job_title,
          photo_url: s.photo_url,
          department_name: (s.departments as any)?.name || (s.departments as any)?.[0]?.name || (s as any)?.department || 'Accounting & Finance'
        }))
        setStaffList(staffWithDept)
        if (staffWithDept.length > 0) {
          setSelectedStaffId(staffWithDept[0].id)
        }
      }
      setLoading(false)
    }
    fetchStaff()
  }, [])

  useEffect(() => {
    const fetchAttendance = async () => {
      if (!selectedStaffId) return
      setLoading(true)
      
      const firstDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const lastDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, '0')}`
      
      let cachedRecords: Record<string, any> = {}
      try {
        const staffCode = selectedStaff?.staff_code || ''
        const keysToTry = [
          `hris_self_attendance_${selectedStaffId}`,
          `hris_self_attendance_${staffCode}`,
          `hris_attendance_daily_${selectedStaffId}`,
          `hris_attendance_daily_${staffCode}`,
        ]
        for (const k of keysToTry) {
          const raw = localStorage.getItem(k)
          if (raw) {
            try {
              cachedRecords = { ...cachedRecords, ...JSON.parse(raw) }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn('LocalStorage read error:', e)
      }

      let dbRecords: Record<string, any> = {}
      try {
        const staffCode = selectedStaff?.staff_code || ''
        let query = supabase
          .from('attendance_records')
          .select('*')
          .gte('attendance_date', firstDay)
          .lte('attendance_date', lastDay)

        if (staffCode && staffCode !== selectedStaffId) {
          query = query.or(`staff_id.eq.${selectedStaffId},staff_id.eq.${staffCode}`)
        } else {
          query = query.eq('staff_id', selectedStaffId)
        }

        const { data, error } = await query

        if (data && !error) {
          data.forEach(record => {
            dbRecords[record.attendance_date] = record
          })
        }
      } catch (e) {
        console.warn('Supabase fetch attendance skipped:', e)
      }

      const mergedRecords = { ...cachedRecords, ...dbRecords }
      const monthDays = buildMonth(selectedYear, selectedMonth, mergedRecords)
      setDays(monthDays)
      setLoading(false)
    }
    fetchAttendance()
  }, [selectedStaffId, selectedMonth, selectedYear, selectedStaff])

  const editingDay = editDay ? days.find(d => d.date === editDay) : null

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 anim-fade-up space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-slate-800 text-xl sm:text-2xl">Daily Attendance</h1>
          <p className="text-sm text-slate-500">{monthYearLabel} — clock-in times, multi-branch geofencing, and field work verification</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button onClick={handlePrevMonth} className="px-2.5 py-1 rounded hover:bg-slate-100 text-slate-600 font-bold">‹</button>
            <span className="text-xs font-semibold text-slate-700 px-2">{monthYearLabel}</span>
            <button onClick={handleNextMonth} className="px-2.5 py-1 rounded hover:bg-slate-100 text-slate-600 font-bold">›</button>
          </div>
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
              saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {saved ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Saved</span>
              </>
            ) : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Staff Selector */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Select Employee</label>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap">
          {staffList.map(s => {
            const isSelected = s.id === selectedStaffId
            return (
              <button
                key={s.id}
                onClick={() => setSelectedStaffId(s.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 flex-shrink-0 sm:flex-shrink ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-100'
                }`}
              >
                <span>{s.full_name}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {s.staff_code}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-emerald-600">{summary.present}</div>
          <div className="text-xs text-slate-500 mt-0.5">Days Present</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-blue-600">{summary.onTime}</div>
          <div className="text-xs text-slate-500 mt-0.5">On-Time Arrivals</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-amber-600">{summary.late}</div>
          <div className="text-xs text-slate-500 mt-0.5">Late Arrivals ({summary.lateMinutes}m)</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-amber-500">{summary.fieldVisits}</div>
          <div className="text-xs text-slate-500 mt-0.5">Field / Site Visits</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-purple-600">{summary.onLeave}</div>
          <div className="text-xs text-slate-500 mt-0.5">Days on Leave</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-violet-600">{summary.overtimeHrs}h</div>
          <div className="text-xs text-slate-500 mt-0.5">Overtime Hours</div>
        </div>
      </div>

      {/* Attendance Calendar Grid */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <span className="font-display font-semibold text-slate-700 text-sm">
            {selectedStaff?.full_name} ({selectedStaff?.staff_code}) — {monthYearLabel}
          </span>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> On Time</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Late</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Field Work</span>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase bg-slate-50/60">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDow }, (_, i) => (
            <div key={`empty-${i}`} className="aspect-square border-r border-b border-slate-50 bg-slate-50/20" />
          ))}
          {days.map(day => {
            const d = Number(day.date.split('-')[2])
            const dow = new Date(day.date).getDay()
            const isWeekend = dow === 0 || dow === 6
            const isUnmarked = day.status === 'unmarked'

            return (
              <div
                key={day.date}
                onClick={() => setEditDay(day.date)}
                className={`p-2 border-r border-b border-slate-50 min-h-[78px] cursor-pointer hover:bg-slate-50/80 transition-colors ${
                  isWeekend ? 'bg-slate-50/30' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className={`text-xs font-semibold ${isWeekend ? 'text-slate-400' : 'text-slate-700'}`}>{d}</span>
                  {!isWeekend && !isUnmarked && (
                    <span className={`w-2 h-2 rounded-full ${day.workMode === 'field' ? 'bg-amber-500' : day.isLate ? 'bg-amber-400' : STATUS_COLORS[day.status]}`} />
                  )}
                </div>

                {!isWeekend && !isUnmarked && (
                  <div className="mt-1 space-y-0.5">
                    <div className={`text-[10px] px-1 py-0.5 rounded leading-tight text-center font-medium ${
                      day.workMode === 'field'
                        ? 'bg-amber-100 text-amber-900'
                        : day.isLate
                        ? 'bg-amber-100 text-amber-800'
                        : STATUS_CELL[day.status]
                    }`}>
                      {day.workMode === 'field' ? 'Field Visit' : day.isLate ? `Late (${day.lateMinutes}m)` : STATUS_TEXT[day.status]}
                    </div>
                    {day.clockInTime && (
                      <div className="text-[9px] text-slate-500 text-center font-mono">
                        {formatTime12Hour(day.clockInTime)}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-1 mt-1 flex-wrap justify-center">
                  {day.overtimeHours > 0 && <span className="text-violet-600 font-mono text-[9px] font-semibold">+{day.overtimeHours}h</span>}
                  {day.workMode === 'field' && <span className="text-amber-600 text-[9px] font-semibold">Field</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Edit Day Modal with Location / Field Work Inspector */}
      {editingDay && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditDay(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Edit Attendance Record</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingDay.date} · {selectedStaff?.full_name}</p>
              </div>
              <button onClick={() => setEditDay(null)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Status</label>
                  <select
                    value={editingDay.status}
                    onChange={e => updateDay(editingDay.date, { status: e.target.value as AttendanceStatus })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="on_leave">On Leave</option>
                    <option value="public_holiday">Public Holiday</option>
                    <option value="weekend">Weekend</option>
                    <option value="unmarked">Unmarked</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Work Mode</label>
                  <select
                    value={editingDay.workMode || 'office'}
                    onChange={e => updateDay(editingDay.date, { workMode: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="office">Office Branch</option>
                    <option value="field">Field / Client Visit</option>
                    <option value="remote">Remote Work</option>
                  </select>
                </div>
              </div>

              {editingDay.workMode === 'field' && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-900 uppercase">Client / Site Visited</label>
                    <input
                      type="text"
                      value={editingDay.fieldClientName || ''}
                      onChange={e => updateDay(editingDay.date, { fieldClientName: e.target.value })}
                      placeholder="e.g. Dangote Sugar HQ"
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-amber-300 bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-900 uppercase">Visit Remarks / Notes</label>
                    <input
                      type="text"
                      value={editingDay.fieldNotes || ''}
                      onChange={e => updateDay(editingDay.date, { fieldNotes: e.target.value })}
                      placeholder="e.g. Delivered proposal & contract review"
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-amber-300 bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {editingDay.matchedLocationName && editingDay.workMode === 'office' && (
                <div className="text-xs text-blue-700 bg-blue-50 p-2.5 rounded-lg border border-blue-100 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/></svg>
                  <span>Clocked in at <strong>{editingDay.matchedLocationName}</strong></span>
                  {editingDay.distanceMeters !== undefined && <span>({formatDistance(editingDay.distanceMeters)})</span>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Clock In Time</label>
                  <input
                    type="time"
                    value={editingDay.clockInTime || ''}
                    onChange={e => updateDay(editingDay.date, { clockInTime: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Clock Out Time</label>
                  <input
                    type="time"
                    value={editingDay.clockOutTime || ''}
                    onChange={e => updateDay(editingDay.date, { clockOutTime: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={editingDay.isLate || false}
                    onChange={e => updateDay(editingDay.date, { isLate: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  />
                  <span className="text-xs font-semibold text-slate-700">Mark as Late</span>
                </label>

                {editingDay.isLate && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Minutes Late</label>
                    <input
                      type="number"
                      min="0"
                      value={editingDay.lateMinutes || 0}
                      onChange={e => updateDay(editingDay.date, { lateMinutes: parseInt(e.target.value, 10) || 0 })}
                      className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 focus:outline-none focus:border-blue-400 font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingDay.onSite || false}
                    onChange={e => updateDay(editingDay.date, { onSite: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">On-Site Work</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">OT Hours:</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={editingDay.overtimeHours || 0}
                    onChange={e => updateDay(editingDay.date, { overtimeHours: parseFloat(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 text-xs rounded border border-slate-200 font-mono text-center"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditDay(null)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
