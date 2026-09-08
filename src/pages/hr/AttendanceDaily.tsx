import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAction } from '../../lib/auditLog'
import type { DayAttendance, AttendanceStatus, SiteVisit } from '../../types'
import { formatTime12Hour, formatDistance, calculateVisitDuration } from '../../lib/geofence'
import { isPublicHoliday, type PublicHoliday } from '../../lib/holidays'

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
  siteVisits?: SiteVisit[]
}

function buildMonth(year: number, month: number, existingRecords: Record<string, any>, customHolidays: PublicHoliday[] = []): ExtendedDayAttendance[] {
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
        siteVisits: Array.isArray(rec.site_visits) ? rec.site_visits : Array.isArray(rec.siteVisits) ? rec.siteVisits : [],
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
        siteVisits: [],
      })
    } else {
      const holiday = isPublicHoliday(dateStr, customHolidays)
      if (holiday) {
        days.push({
          date: dateStr,
          status: 'public_holiday',
          fieldNotes: holiday.name,
          overtimeHours: 0,
          onSite: false,
          overtimeApproval: 'none',
          siteVisits: [],
        })
      } else if (isFuture) {
        days.push({
          date: dateStr,
          status: 'unmarked',
          overtimeHours: 0,
          onSite: false,
          overtimeApproval: 'none',
          siteVisits: [],
        })
      } else if (dateObj.getTime() === today.getTime()) {
        days.push({
          date: dateStr,
          status: 'unmarked',
          overtimeHours: 0,
          onSite: false,
          overtimeApproval: 'none',
          siteVisits: [],
        })
      } else {
        days.push({
          date: dateStr,
          status: 'absent',
          overtimeHours: 0,
          onSite: false,
          overtimeApproval: 'none',
          siteVisits: [],
        })
      }
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
  const [customHolidays, setCustomHolidays] = useState<PublicHoliday[]>([])
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editDay, setEditDay] = useState<string | null>(null)

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const selectedStaff = staffList.find(s => s.id === selectedStaffId)

  const updateDay = (date: string, updates: Partial<ExtendedDayAttendance>) => {
    // Only current day is editable by HR
    if (date !== todayStr) {
      return
    }

    const updated = days.map(d => d.date === date ? { ...d, ...updates } : d)
    setDays(updated)
    const dayRecord = updated.find(d => d.date === date)
    if (dayRecord) {
      saveRecord(dayRecord)
    }
  }

  const saveRecord = async (dayRecord: ExtendedDayAttendance) => {
    if (!selectedStaffId) return

    const record = {
      staff_id: selectedStaffId,
      attendance_date: dayRecord.date,
      status: dayRecord.status,
      clock_in_time: dayRecord.clockInTime || null,
      clock_out_time: dayRecord.clockOutTime || null,
      is_late: dayRecord.isLate || false,
      late_minutes: dayRecord.lateMinutes || 0,
      work_mode: dayRecord.workMode || 'office',
      matched_location_name: dayRecord.matchedLocationName || null,
      field_client_name: dayRecord.fieldClientName || null,
      field_notes: dayRecord.fieldNotes || null,
      site_visits: dayRecord.siteVisits || [],
      overtime_hours: dayRecord.overtimeHours || 0,
      on_site: dayRecord.onSite || false,
      overtime_approval: dayRecord.overtimeApproval || 'none',
    }

    try {
      const staffCode = selectedStaff?.staff_code || ''
      const keys = [
        `hris_attendance_daily_${selectedStaffId}`,
        `hris_self_attendance_${selectedStaffId}`,
        staffCode ? `hris_self_attendance_${staffCode}` : null,
        staffCode ? `hris_attendance_daily_${staffCode}` : null,
      ].filter(Boolean) as string[]

      for (const k of keys) {
        const existingCache = JSON.parse(localStorage.getItem(k) || '{}')
        existingCache[dayRecord.date] = record
        localStorage.setItem(k, JSON.stringify(existingCache))
      }
      window.dispatchEvent(new Event('storage'))
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
  const weekendShifts = days.filter(d => d.status === 'present' && (new Date(d.date).getDay() === 0 || new Date(d.date).getDay() === 6)).length
  const lateDays = days.filter(d => d.status === 'present' && d.isLate).length
  const onTimeDays = presentDays - lateDays
  const fieldVisits = days.filter(d => d.status === 'present' && (d.workMode === 'field' || (d.siteVisits && d.siteVisits.length > 0))).length
  const totalLateMinutes = days.filter(d => d.status === 'present' && d.isLate).reduce((acc, d) => acc + (d.lateMinutes || 0), 0)

  const summary = {
    present: presentDays,
    weekendShifts,
    onTime: onTimeDays,
    late: lateDays,
    fieldVisits,
    lateMinutes: totalLateMinutes,
    absent: days.filter(d => d.status === 'absent').length,
    onLeave: days.filter(d => d.status === 'on_leave').length,
    publicHolidays: days.filter(d => d.status === 'public_holiday').length,
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
    const fetchStaffAndSettings = async () => {
      setLoading(true)
      try {
        const { data: settingsData } = await supabase
          .from('company_settings')
          .select('custom_holidays')
          .eq('id', 1)
          .maybeSingle()

        if (settingsData && Array.isArray(settingsData.custom_holidays)) {
          setCustomHolidays(settingsData.custom_holidays)
        } else {
          try {
            const cached = localStorage.getItem('hris_custom_holidays')
            if (cached) setCustomHolidays(JSON.parse(cached))
          } catch (e) {}
        }
      } catch (e) {}

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
    fetchStaffAndSettings()
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
      const monthDays = buildMonth(selectedYear, selectedMonth, mergedRecords, customHolidays)
      setDays(monthDays)
      setLoading(false)
    }

    fetchAttendance()
  }, [selectedStaffId, selectedMonth, selectedYear, customHolidays])

  const editingDay = days.find(d => d.date === editDay)
  const isEditingToday = editingDay?.date === todayStr

  return (
    <div className="p-4 sm:p-6 anim-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-lg sm:text-xl">Daily Attendance Registry</h2>
          <p className="text-xs sm:text-sm text-slate-500">Track and adjust daily staff clock-in times, multi-site visits, and lateness records</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
              title="Previous Month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-xs sm:text-sm font-semibold text-slate-700 px-2 min-w-[120px] text-center">
              {monthYearLabel}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
              title="Next Month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
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

      {/* Staff Selector Pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
        {staffList.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedStaffId(s.id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
              selectedStaffId === s.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s.photo_url ? (
              <img src={s.photo_url} alt={s.full_name} className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                selectedStaffId === s.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {s.full_name.charAt(0)}
              </div>
            )}
            <span>{s.full_name}</span>
          </button>
        ))}
      </div>

      {/* Monthly Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Present Days</div>
          <div className="text-xl font-bold text-slate-800 mt-1 font-mono-data">{summary.present}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">On-Time</div>
          <div className="text-xl font-bold text-emerald-600 mt-1 font-mono-data">{summary.onTime}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Late Arrivals</div>
          <div className="text-xl font-bold text-amber-600 mt-1 font-mono-data">{summary.late} ({summary.lateMinutes}m)</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Site / Field Stops</div>
          <div className="text-xl font-bold text-amber-500 mt-1 font-mono-data">{summary.fieldVisits}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Weekend Shifts</div>
          <div className="text-xl font-bold text-indigo-600 mt-1 font-mono-data">{summary.weekendShifts}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Leave Days</div>
          <div className="text-xl font-bold text-blue-600 mt-1 font-mono-data">{summary.onLeave}</div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center text-xs font-bold text-slate-600 py-2.5">
          {DAY_NAMES.map(d => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[96px] bg-slate-50/30 border-b border-r border-slate-100" />
            ))}

            {days.map(day => {
              const dNum = parseInt(day.date.split('-')[2], 10)
              const dow = new Date(day.date).getDay()
              const isWeekend = dow === 0 || dow === 6
              const isToday = day.date === todayStr
              const visitsCount = day.siteVisits?.length || 0

              return (
                <div
                  key={day.date}
                  onClick={() => setEditDay(day.date)}
                  className={`min-h-[96px] p-2 border-b border-r border-slate-100 relative group cursor-pointer hover:bg-blue-50/40 transition-colors ${
                    isToday ? 'bg-blue-50/40 ring-1 ring-inset ring-blue-400' : isWeekend ? 'bg-slate-50/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${isToday ? 'text-blue-600 font-extrabold' : isWeekend ? 'text-slate-400' : 'text-slate-700'}`}>
                      {dNum} {isToday && <span className="text-[9px] font-semibold text-blue-600 ml-0.5">(Today)</span>}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${isWeekend && day.status === 'present' ? 'bg-purple-500' : day.workMode === 'field' || visitsCount > 0 ? 'bg-amber-500' : day.isLate ? 'bg-amber-400' : STATUS_COLORS[day.status]}`} />
                  </div>

                  <div className="mt-1.5 space-y-1">
                    {day.status !== 'unmarked' && (
                      <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-tight ${
                        isWeekend && day.status === 'present'
                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                          : STATUS_CELL[day.status]
                      }`}>
                        {isWeekend && day.status === 'present'
                          ? (dow === 6 ? 'Saturday Shift' : 'Sunday Shift')
                          : visitsCount > 1
                          ? `${visitsCount} Sites`
                          : visitsCount === 1
                          ? '1 Site'
                          : day.isLate
                          ? `Late (${day.lateMinutes}m)`
                          : STATUS_TEXT[day.status]}
                      </div>
                    )}

                    {day.clockInTime && (
                      <div className="text-[10px] text-slate-600 font-mono flex items-center justify-between">
                        <span>{formatTime12Hour(day.clockInTime)}</span>
                        {day.clockOutTime && <span>{formatTime12Hour(day.clockOutTime)}</span>}
                      </div>
                    )}

                    {visitsCount > 0 && (
                      <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-1 py-0.5 font-medium truncate">
                        {day.siteVisits?.[0]?.site_name}
                      </div>
                    )}

                    {day.overtimeHours > 0 && (
                      <div className="text-[10px] text-violet-700 font-bold">
                        +{day.overtimeHours}h OT
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Day Details & Site Journey Inspection Modal ── */}
      {editingDay && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditDay(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-slate-800 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-800">
                    Attendance Record — {editingDay.date}
                  </h3>
                  {isEditingToday ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      Today (Editable)
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Read Only (Locked)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{selectedStaff?.full_name} ({selectedStaff?.department_name})</p>
              </div>
              <button onClick={() => setEditDay(null)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Lock Info Banner when not today */}
            {!isEditingToday && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-slate-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>HR adjustments are restricted to the <strong>current day only</strong>. Past and future records are locked for audit integrity.</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Status</label>
                  <select
                    value={editingDay.status}
                    disabled={!isEditingToday}
                    onChange={e => updateDay(editingDay.date, { status: e.target.value as AttendanceStatus })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
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
                    disabled={!isEditingToday}
                    onChange={e => updateDay(editingDay.date, { workMode: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    <option value="office">Office Branch</option>
                    <option value="field">Field / Multi-Site Visits</option>
                    <option value="remote">Remote Work</option>
                  </select>
                </div>
              </div>

              {/* ── Multi-Site Journey Stops List ── */}
              {editingDay.siteVisits && editingDay.siteVisits.length > 0 && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span>Audited Site Journey ({editingDay.siteVisits.length} Stops)</span>
                    </span>
                  </div>

                  <div className="space-y-2">
                    {editingDay.siteVisits.map((visit, vIdx) => {
                      const dur = calculateVisitDuration(visit.arrival_time, visit.departure_time)
                      return (
                        <div key={visit.id || vIdx} className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">{vIdx + 1}</span>
                              {visit.site_name}
                            </span>
                            <span className="text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {dur}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px] pl-6.5">
                            <span>In: {formatTime12Hour(visit.arrival_time)}</span>
                            {visit.departure_time && <span>Out: {formatTime12Hour(visit.departure_time)}</span>}
                            {visit.lat && visit.lng && (
                              <a
                                href={`https://www.google.com/maps?q=${visit.lat},${visit.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                              >
                                <span>GPS Map</span>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                              </a>
                            )}
                          </div>
                          {visit.purpose && (
                            <p className="text-slate-600 italic pl-6.5">"{visit.purpose}"</p>
                          )}
                        </div>
                      )
                    })}
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
                    disabled={!isEditingToday}
                    value={editingDay.clockInTime || ''}
                    onChange={e => updateDay(editingDay.date, { clockInTime: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Clock Out Time</label>
                  <input
                    type="time"
                    disabled={!isEditingToday}
                    value={editingDay.clockOutTime || ''}
                    onChange={e => updateDay(editingDay.date, { clockOutTime: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center gap-2 pt-2 ${isEditingToday ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <input
                    type="checkbox"
                    disabled={!isEditingToday}
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
                      disabled={!isEditingToday}
                      value={editingDay.lateMinutes || 0}
                      onChange={e => updateDay(editingDay.date, { lateMinutes: parseInt(e.target.value, 10) || 0 })}
                      className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 focus:outline-none focus:border-blue-400 font-mono disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <label className={`flex items-center gap-2 ${isEditingToday ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <input
                    type="checkbox"
                    disabled={!isEditingToday}
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
                    disabled={!isEditingToday}
                    value={editingDay.overtimeHours || 0}
                    onChange={e => updateDay(editingDay.date, { overtimeHours: parseFloat(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 text-xs rounded border border-slate-200 font-mono text-center disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditDay(null)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
