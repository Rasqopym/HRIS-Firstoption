import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../hooks/useCurrentStaff'
import type { DayAttendance, AttendanceStatus } from '../../types'

const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: 'Present', absent: 'Absent', on_leave: 'On Leave',
  public_holiday: 'Public Holiday', weekend: 'Weekend', unmarked: '',
}
const STATUS_BG: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  on_leave: 'bg-amber-100 text-amber-700',
  public_holiday: 'bg-blue-100 text-blue-600',
  weekend: 'bg-slate-100 text-slate-400',
  unmarked: '',
}
const STATUS_DOT: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-400', absent: 'bg-red-400', on_leave: 'bg-amber-400',
  public_holiday: 'bg-blue-400', weekend: 'bg-slate-200', unmarked: '',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function buildMonth(year: number, month: number, existingRecords: Record<string, any>): DayAttendance[] {
  const days: DayAttendance[] = []
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

    if (existingRecords[dateStr]) {
      days.push({
        date: dateStr,
        status: existingRecords[dateStr].status,
        overtimeHours: existingRecords[dateStr].overtime_hours || 0,
        onSite: existingRecords[dateStr].on_site || false,
        overtimeApproval: existingRecords[dateStr].overtime_approval || 'none',
      })
    } else {
      // Days with no record: leave as blank/unmarked (including weekends)
      days.push({
        date: dateStr,
        status: 'unmarked',
        overtimeHours: 0,
        onSite: false,
        overtimeApproval: 'none',
      })
    }
  }
  return days
}

export default function AttendanceSelf() {
  const { staff, loading: staffLoading, error: staffError } = useCurrentStaff()
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [days, setDays] = useState<DayAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [markingPresent, setMarkingPresent] = useState(false)
  const [error, setError] = useState('')
  const [onSite, setOnSite] = useState(false)
  const [overtimeHours, setOvertimeHours] = useState(0)

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const todayRecord = days.find(d => d.date === todayStr)

  const monthYearLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`

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

  const handleMarkPresent = async () => {
    if (!staff) return

    setMarkingPresent(true)
    setError('')
    try {
      const record = {
        staff_id: staff.id,
        attendance_date: todayStr,
        status: 'present',
        overtime_hours: overtimeHours,
        on_site: onSite,
        overtime_approval: overtimeHours > 0 ? 'pending' : 'none',
      }

      // Update local storage cache
      try {
        const cacheKey = `hris_self_attendance_${staff.id}`
        const existingCache = JSON.parse(localStorage.getItem(cacheKey) || '{}')
        existingCache[todayStr] = record
        localStorage.setItem(cacheKey, JSON.stringify(existingCache))
      } catch (e) {
        console.warn('LocalStorage error:', e)
      }

      // Optimistically update local state
      setDays(prev => prev.map(d => d.date === todayStr ? {
        ...d,
        status: 'present',
        overtimeHours,
        onSite,
        overtimeApproval: overtimeHours > 0 ? 'pending' : 'none'
      } : d))

      // Try saving to Supabase safely
      try {
        await supabase
          .from('attendance_records')
          .upsert(record, { onConflict: 'staff_id,attendance_date' })
      } catch (e) {
        console.warn('Supabase attendance upsert skipped:', e)
      }
    } catch (err) {
      console.error('Error marking present:', err)
    } finally {
      setMarkingPresent(false)
    }
  }

  const handleUpdateToday = async () => {
    if (!staff || !todayRecord) return

    setMarkingPresent(true)
    setError('')
    try {
      const record = {
        staff_id: staff.id,
        attendance_date: todayStr,
        status: 'present',
        overtime_hours: overtimeHours,
        on_site: onSite,
        overtime_approval: overtimeHours > 0 ? 'pending' : 'none',
      }

      // Update local storage cache
      try {
        const cacheKey = `hris_self_attendance_${staff.id}`
        const existingCache = JSON.parse(localStorage.getItem(cacheKey) || '{}')
        existingCache[todayStr] = record
        localStorage.setItem(cacheKey, JSON.stringify(existingCache))
      } catch (e) {
        console.warn('LocalStorage error:', e)
      }

      // Optimistically update local state
      setDays(prev => prev.map(d => d.date === todayStr ? {
        ...d,
        overtimeHours,
        onSite,
        overtimeApproval: overtimeHours > 0 ? 'pending' : 'none'
      } : d))

      // Try saving to Supabase safely
      try {
        await supabase
          .from('attendance_records')
          .update({
            overtime_hours: overtimeHours,
            on_site: onSite,
            overtime_approval: overtimeHours > 0 ? 'pending' : 'none',
          })
          .eq('staff_id', staff.id)
          .eq('attendance_date', todayStr)
      } catch (e) {
        console.warn('Supabase attendance update skipped:', e)
      }
    } catch (err) {
      console.error('Error updating attendance:', err)
    } finally {
      setMarkingPresent(false)
    }
  }

  // Initialize form with today's current values when record exists
  useEffect(() => {
    if (todayRecord) {
      setOnSite(todayRecord.onSite)
      setOvertimeHours(todayRecord.overtimeHours)
    } else {
      setOnSite(false)
      setOvertimeHours(0)
    }
  }, [todayRecord])

  const fetchAttendance = async () => {
    if (!staff) return

    try {
      setLoading(true)
      setError('')
      const firstDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const lastDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, '0')}`

      // Read local storage cache first
      let cachedRecords: Record<string, any> = {}
      try {
        const rawCache = localStorage.getItem(`hris_self_attendance_${staff.id}`)
        if (rawCache) {
          cachedRecords = JSON.parse(rawCache)
        }
      } catch (e) {
        console.warn('LocalStorage read error:', e)
      }

      // Fetch from Supabase safely
      let dbRecords: Record<string, any> = {}
      try {
        const { data: attendanceData } = await supabase
          .from('attendance_records')
          .select('*')
          .eq('staff_id', staff.id)
          .gte('attendance_date', firstDay)
          .lte('attendance_date', lastDay)

        if (attendanceData) {
          attendanceData.forEach(r => {
            dbRecords[r.attendance_date] = r
          })
        }
      } catch (e) {
        console.warn('Supabase fetch attendance skipped:', e)
      }

      const mergedRecords = { ...cachedRecords, ...dbRecords }
      const builtDays = buildMonth(selectedYear, selectedMonth, mergedRecords)
      setDays(builtDays)
    } catch (err) {
      console.error('Error fetching attendance:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAttendance()
  }, [staff, selectedMonth, selectedYear])

  if (staffLoading || loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (staffError || error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {staffError || error}
        </div>
      </div>
    )
  }

  const firstDow = new Date(selectedYear, selectedMonth, 1).getDay()
  const isCurrentMonth = selectedMonth === new Date().getMonth() && selectedYear === new Date().getFullYear()
  const canMarkPresent = isCurrentMonth && (!todayRecord || todayRecord.status === 'unmarked' || todayRecord.status === 'weekend')
  const canUpdateToday = isCurrentMonth && todayRecord && (todayRecord.status === 'present' || todayRecord.status === 'absent' || todayRecord.status === 'on_leave')

  // Compute stats from the days array (only real records + weekends + unmarked)
  const present = days.filter(d => d.status === 'present').length
  const absent = days.filter(d => d.status === 'absent').length
  const onLeave = days.filter(d => d.status === 'on_leave').length
  const sitedays = days.filter(d => d.onSite).length
  const otHours = days.filter(d => d.overtimeApproval === 'approved').reduce((a, d) => a + d.overtimeHours, 0)

  return (
    <div className="p-6 anim-fade-up">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-slate-800 text-xl">My Attendance</h2>
            <p className="text-sm text-slate-500">{monthYearLabel} — your personal attendance record</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button onClick={handleNextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mark Present widget */}
      {isCurrentMonth && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-5">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-slate-500 text-sm">Today · {today.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div className="font-display font-bold text-slate-800 text-2xl mt-1">
                {todayRecord?.status === 'present' ? 'Marked Present' : todayRecord?.status === 'absent' ? 'Marked Absent' : todayRecord?.status === 'on_leave' ? 'On Leave' : 'Not yet marked'}
              </div>
              {(canMarkPresent || canUpdateToday) && (
                <div className="mt-4 flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onSite}
                      onChange={e => setOnSite(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-600">On Site</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600">OT Hours:</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={overtimeHours}
                      onChange={e => setOvertimeHours(Number(e.target.value))}
                      className="w-20 px-2 py-1 text-sm rounded border border-slate-200 focus:outline-none focus:border-blue-400 font-mono-data"
                    />
                  </div>
                </div>
              )}
            </div>
            {canMarkPresent && (
              <button
                onClick={handleMarkPresent}
                disabled={markingPresent}
                className="w-24 h-24 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-sm shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 ml-4"
              >
                {markingPresent ? '...' : 'Mark Present'}
              </button>
            )}
            {canUpdateToday && (
              <button
                onClick={handleUpdateToday}
                disabled={markingPresent}
                className="w-24 h-24 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-display font-bold text-sm shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 ml-4"
              >
                {markingPresent ? '...' : 'Update'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Month summary */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
        {[
          { l: 'Days Present', v: present, color: 'text-emerald-600' },
          { l: 'Days Absent', v: absent, color: 'text-red-500' },
          { l: 'Days on Leave', v: onLeave, color: 'text-amber-600' },
          { l: 'OT Hours (approved)', v: `${otHours}h`, color: 'text-violet-600' },
          { l: 'Site Days', v: sitedays, color: 'text-blue-600' },
        ].map(c => (
          <div key={c.l} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className={`font-display font-bold text-2xl ${c.color} font-mono-data`}>{c.v}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.l}</div>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
          <span className="font-display font-semibold text-slate-700 text-sm">{monthYearLabel} — Attendance Calendar</span>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase bg-slate-50/60">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDow }, (_, i) => (
            <div key={`e-${i}`} className="aspect-square border-r border-b border-slate-50 bg-slate-50/20" />
          ))}
          {days.map(day => {
            const d = Number(day.date.split('-')[2])
            const dow = new Date(day.date).getDay()
            const isWeekend = dow === 0 || dow === 6
            const isToday = day.date === todayStr
            const shouldShowStatus = day.status !== 'unmarked' && day.status !== 'weekend'
            return (
              <div key={day.date} className={`p-1.5 border-r border-b border-slate-50 min-h-[60px] ${isToday ? 'bg-blue-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <span className={`text-xs font-semibold ${isToday ? 'text-blue-600' : isWeekend && !shouldShowStatus ? 'text-slate-300' : 'text-slate-600'} ${isToday ? 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs' : ''}`}>
                    {d}
                  </span>
                  {shouldShowStatus && <span className={`w-2 h-2 rounded-full flex-none ${STATUS_DOT[day.status]}`} />}
                </div>
                {shouldShowStatus && (
                  <div className={`mt-1 text-xs px-1 rounded leading-tight text-center ${STATUS_BG[day.status]}`} style={{ fontSize: 9 }}>
                    {STATUS_TEXT[day.status]}
                  </div>
                )}
                <div className="flex gap-0.5 mt-0.5 flex-wrap">
                  {day.overtimeHours > 0 && <span className="text-violet-500 font-mono-data" style={{ fontSize: 9 }}>+{day.overtimeHours}h</span>}
                  {day.onSite && <span className="text-blue-500" style={{ fontSize: 9 }}>Site</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
