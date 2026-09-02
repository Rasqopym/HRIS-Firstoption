import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../hooks/useCurrentStaff'
import type { DayAttendance, AttendanceStatus } from '../../types'
import {
  calculateDistanceMeters,
  findNearestLocation,
  evaluateLateness,
  formatTime12Hour,
  formatDistance,
  type OfficeLocation
} from '../../lib/geofence'

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
    const isPastOrToday = dateObj <= today

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
    } else if (isPastOrToday) {
      days.push({
        date: dateStr,
        status: 'present',
        overtimeHours: 0,
        onSite: false,
        overtimeApproval: 'none',
      })
    } else {
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
  const [days, setDays] = useState<ExtendedDayAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [onSite, setOnSite] = useState(false)
  const [overtimeHours, setOvertimeHours] = useState(0)

  // Work Mode Selection for Clock-In
  const [workMode, setWorkMode] = useState<'office' | 'field'>('office')
  const [fieldClientName, setFieldClientName] = useState('')
  const [fieldNotes, setFieldNotes] = useState('')

  // Real-time clock
  const [currentTime, setCurrentTime] = useState(new Date())

  // Company / Geofence settings
  const [settings, setSettings] = useState({
    work_start_time: '08:00',
    work_end_time: '17:00',
    grace_period_minutes: 15,
    enable_lateness_tracking: true,
    enable_geofencing: false,
    allow_field_work: true,
    require_field_note: true,
    office_locations: [
      { id: 'loc-1', name: 'Main Head Office', lat: 6.5244, lng: 3.3792, radius_meters: 100, is_active: true }
    ] as OfficeLocation[],
  })

  // Live clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle()
        if (data) {
          let locs: OfficeLocation[] = []
          if (Array.isArray(data.office_locations) && data.office_locations.length > 0) {
            locs = data.office_locations
          } else if (data.office_lat && data.office_lng) {
            locs = [{
              id: 'loc-1',
              name: data.office_address_label || 'Main Head Office',
              lat: data.office_lat,
              lng: data.office_lng,
              radius_meters: data.office_radius_meters || 100,
              is_active: true,
            }]
          }

          setSettings({
            work_start_time: data.work_start_time || '08:00',
            work_end_time: data.work_end_time || '17:00',
            grace_period_minutes: data.grace_period_minutes ?? 15,
            enable_lateness_tracking: data.enable_lateness_tracking ?? true,
            enable_geofencing: data.enable_geofencing ?? false,
            allow_field_work: data.allow_field_work ?? true,
            require_field_note: data.require_field_note ?? true,
            office_locations: locs.length > 0 ? locs : [
              { id: 'loc-1', name: 'Main Head Office', lat: 6.5244, lng: 3.3792, radius_meters: 100, is_active: true }
            ],
          })
        }
      } catch (err) {
        console.warn('Failed to load company settings:', err)
      }
    }
    fetchSettings()
  }, [])

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

  // ── Clock In Handler (Multi-Branch Geofencing + Field Work) ─────────
  const handleClockIn = async () => {
    if (!staff) return

    if (workMode === 'field' && settings.require_field_note && !fieldClientName.trim()) {
      setError('Please provide the Client Name or Project Site before clocking in from the field.')
      return
    }

    setActionLoading(true)
    setError('')
    setSuccessMsg('')

    const performClockIn = async (userLat?: number, userLng?: number, matchedLoc?: OfficeLocation | null, distance?: number) => {
      try {
        const now = new Date()
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false })

        // Evaluate Lateness
        let isLate = false
        let lateMinutes = 0
        if (settings.enable_lateness_tracking) {
          const evalRes = evaluateLateness(now, settings.work_start_time, settings.grace_period_minutes)
          isLate = evalRes.isLate
          lateMinutes = evalRes.lateMinutes
        }

        const record = {
          staff_id: staff.id,
          attendance_date: todayStr,
          status: 'present',
          clock_in_time: timeStr,
          is_late: isLate,
          late_minutes: lateMinutes,
          clock_in_lat: userLat || null,
          clock_in_lng: userLng || null,
          clock_in_distance_meters: distance !== undefined ? distance : null,
          matched_location_name: matchedLoc?.name || (workMode === 'field' ? `Field: ${fieldClientName.trim()}` : null),
          work_mode: workMode,
          field_client_name: workMode === 'field' ? fieldClientName.trim() : null,
          field_notes: workMode === 'field' ? fieldNotes.trim() : null,
          overtime_hours: overtimeHours,
          on_site: workMode === 'office' ? true : onSite,
          overtime_approval: overtimeHours > 0 ? 'pending' : 'none',
        }

        // Cache locally for instant multi-tab sync
        try {
          const keys = [
            `hris_self_attendance_${staff.id}`,
            `hris_self_attendance_${staff.staff_code}`,
            `hris_attendance_daily_${staff.id}`,
          ]
          for (const k of keys) {
            const existingCache = JSON.parse(localStorage.getItem(k) || '{}')
            existingCache[todayStr] = record
            localStorage.setItem(k, JSON.stringify(existingCache))
          }
          window.dispatchEvent(new Event('storage'))
        } catch (e) {
          console.warn('LocalStorage save error:', e)
        }

        // Optimistically update UI
        setDays(prev => prev.map(d => d.date === todayStr ? {
          ...d,
          status: 'present',
          clockInTime: timeStr,
          isLate,
          lateMinutes,
          distanceMeters: distance,
          workMode,
          matchedLocationName: matchedLoc?.name || (workMode === 'field' ? `Field: ${fieldClientName.trim()}` : undefined),
          fieldClientName: workMode === 'field' ? fieldClientName.trim() : undefined,
          fieldNotes: workMode === 'field' ? fieldNotes.trim() : undefined,
          overtimeHours,
          onSite: workMode === 'office' ? true : onSite,
          overtimeApproval: overtimeHours > 0 ? 'pending' : 'none',
        } : d))

        // Save to Supabase
        await supabase.from('attendance_records').upsert(record, { onConflict: 'staff_id,attendance_date' })

        let msg = `Clocked In at ${formatTime12Hour(timeStr)}`
        if (workMode === 'field') {
          msg += ` · Field Work (${fieldClientName.trim()})`
        } else if (matchedLoc) {
          msg += ` · ${matchedLoc.name}`
        }
        if (isLate) {
          msg += ` · Late by ${lateMinutes}m`
        } else {
          msg += ` · On Time`
        }
        setSuccessMsg(msg)
      } catch (err) {
        console.error('Error clocking in:', err)
        setError('Failed to record clock-in. Please try again.')
      } finally {
        setActionLoading(false)
      }
    }

    // Check GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userLat = pos.coords.latitude
          const userLng = pos.coords.longitude

          // If Office Work & Geofencing is ON, validate nearest branch
          if (workMode === 'office' && settings.enable_geofencing) {
            const match = findNearestLocation(userLat, userLng, settings.office_locations)

            if (!match.isWithinRadius && match.nearest) {
              setError(`Location Check Failed: You are ${formatDistance(match.distance)} away from ${match.nearest.name} (Allowed radius: ${match.nearest.radius_meters || 100}m). If you are visiting a client or project site, switch to "Field Work" mode.`)
              setActionLoading(false)
              return
            }

            performClockIn(userLat, userLng, match.nearest, match.distance)
          } else {
            // Field Work or Geofencing OFF (still captures GPS coordinates)
            const match = findNearestLocation(userLat, userLng, settings.office_locations)
            performClockIn(userLat, userLng, match.nearest, match.distance)
          }
        },
        (err) => {
          if (workMode === 'office' && settings.enable_geofencing) {
            setError(`Could not retrieve your GPS location: ${err.message}. Please allow location access in your browser to clock in.`)
            setActionLoading(false)
          } else {
            // Allow fallback if GPS permission is denied on remote/field
            performClockIn()
          }
        },
        { enableHighAccuracy: true, timeout: 12000 }
      )
    } else {
      if (workMode === 'office' && settings.enable_geofencing) {
        setError('Geolocation is not supported by your browser.')
        setActionLoading(false)
      } else {
        performClockIn()
      }
    }
  }

  // ── Clock Out Handler ─────────────────────────────────────────────
  const handleClockOut = async () => {
    if (!staff || !todayRecord) return

    setActionLoading(true)
    setError('')
    setSuccessMsg('')

    try {
      const now = new Date()
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false })

      const record = {
        staff_id: staff.id,
        attendance_date: todayStr,
        status: 'present',
        clock_in_time: todayRecord.clockInTime || null,
        clock_out_time: timeStr,
        is_late: todayRecord.isLate || false,
        late_minutes: todayRecord.lateMinutes || 0,
        work_mode: todayRecord.workMode || 'office',
        matched_location_name: todayRecord.matchedLocationName || null,
        field_client_name: todayRecord.fieldClientName || null,
        field_notes: todayRecord.fieldNotes || null,
        overtime_hours: overtimeHours,
        on_site: onSite,
        overtime_approval: overtimeHours > 0 ? 'pending' : 'none',
      }

      try {
        const keys = [
          `hris_self_attendance_${staff.id}`,
          `hris_self_attendance_${staff.staff_code}`,
          `hris_attendance_daily_${staff.id}`,
        ]
        for (const k of keys) {
          const existingCache = JSON.parse(localStorage.getItem(k) || '{}')
          existingCache[todayStr] = { ...existingCache[todayStr], clock_out_time: timeStr }
          localStorage.setItem(k, JSON.stringify(existingCache))
        }
        window.dispatchEvent(new Event('storage'))
      } catch (e) {
        console.warn('LocalStorage save error:', e)
      }

      setDays(prev => prev.map(d => d.date === todayStr ? {
        ...d,
        clockOutTime: timeStr,
      } : d))

      await supabase.from('attendance_records').upsert(record, { onConflict: 'staff_id,attendance_date' })
      setSuccessMsg(`Clocked Out at ${formatTime12Hour(timeStr)} · Completed for today`)
    } catch (err) {
      console.error('Error clocking out:', err)
      setError('Failed to record clock-out.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateToday = async () => {
    if (!staff || !todayRecord) return

    setActionLoading(true)
    setError('')
    try {
      const record = {
        staff_id: staff.id,
        attendance_date: todayStr,
        status: 'present',
        clock_in_time: todayRecord.clockInTime || null,
        clock_out_time: todayRecord.clockOutTime || null,
        is_late: todayRecord.isLate || false,
        late_minutes: todayRecord.lateMinutes || 0,
        work_mode: todayRecord.workMode || 'office',
        matched_location_name: todayRecord.matchedLocationName || null,
        field_client_name: todayRecord.fieldClientName || null,
        field_notes: todayRecord.fieldNotes || null,
        overtime_hours: overtimeHours,
        on_site: onSite,
        overtime_approval: overtimeHours > 0 ? 'pending' : 'none',
      }

      setDays(prev => prev.map(d => d.date === todayStr ? {
        ...d,
        overtimeHours,
        onSite,
        overtimeApproval: overtimeHours > 0 ? 'pending' : 'none',
      } : d))

      await supabase.from('attendance_records').upsert(record, { onConflict: 'staff_id,attendance_date' })
      setSuccessMsg('Attendance details updated successfully')
    } catch (err) {
      console.error('Error updating attendance:', err)
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => {
    if (todayRecord) {
      setOnSite(todayRecord.onSite)
      setOvertimeHours(todayRecord.overtimeHours)
      if (todayRecord.workMode === 'field') setWorkMode('field')
      if (todayRecord.fieldClientName) setFieldClientName(todayRecord.fieldClientName)
      if (todayRecord.fieldNotes) setFieldNotes(todayRecord.fieldNotes)
    }
  }, [todayRecord])

  const fetchAttendance = async () => {
    if (!staff) return

    try {
      setLoading(true)
      setError('')
      const firstDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const lastDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, '0')}`

      let cachedRecords: Record<string, any> = {}
      try {
        const rawCache = localStorage.getItem(`hris_self_attendance_${staff.id}`)
        if (rawCache) cachedRecords = JSON.parse(rawCache)
      } catch (e) {
        console.warn('LocalStorage read error:', e)
      }

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
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (staffError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {staffError}
        </div>
      </div>
    )
  }

  const firstDow = new Date(selectedYear, selectedMonth, 1).getDay()
  const isCurrentMonth = selectedMonth === new Date().getMonth() && selectedYear === new Date().getFullYear()
  const hasClockedInToday = isCurrentMonth && todayRecord && todayRecord.status === 'present' && !!todayRecord.clockInTime
  const hasClockedOutToday = hasClockedInToday && !!todayRecord?.clockOutTime

  // Month stats
  const present = days.filter(d => d.status === 'present').length
  const lateDays = days.filter(d => d.status === 'present' && d.isLate).length
  const onTimeDays = present - lateDays
  const totalLateMinutes = days.filter(d => d.status === 'present' && d.isLate).reduce((acc, d) => acc + (d.lateMinutes || 0), 0)
  const onLeave = days.filter(d => d.status === 'on_leave').length
  const otHours = days.filter(d => d.overtimeApproval === 'approved').reduce((a, d) => a + d.overtimeHours, 0)
  const fieldDays = days.filter(d => d.status === 'present' && d.workMode === 'field').length

  return (
    <div className="p-4 sm:p-6 anim-fade-up space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-slate-800 text-xl sm:text-2xl">My Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">{monthYearLabel} — clock-in, multi-branch geofencing, and field work tracking</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={handlePrevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 bg-white border border-slate-200">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-sm font-semibold text-slate-700 px-2">{monthYearLabel}</span>
          <button onClick={handleNextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 bg-white border border-slate-200">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      {/* ── Real-Time Clock In / Out Hero Widget ── */}
      {isCurrentMonth && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white rounded-2xl shadow-xl p-5 sm:p-7 border border-slate-700/50">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Clock & Schedule info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {today.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 pt-1">
                <span>Shift: <strong className="text-white">{settings.work_start_time}</strong> – <strong className="text-white">{settings.work_end_time}</strong></span>
                <span>•</span>
                <span>Grace: <strong className="text-white">{settings.grace_period_minutes}m</strong></span>
                {settings.enable_geofencing && (
                  <>
                    <span>•</span>
                    <span className="text-blue-300 inline-flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/></svg>
                      {settings.office_locations.filter(l => l.is_active !== false).length} Active Branch{settings.office_locations.length > 1 ? 'es' : ''}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Status & Action Area */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              {/* Today's recorded status card */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10 flex flex-col justify-center min-w-[210px]">
                <span className="text-[11px] font-medium text-slate-300 uppercase tracking-wide">Today's Status</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-base font-bold text-white">
                    {hasClockedInToday ? 'Present' : 'Not Clocked In'}
                  </span>
                  {hasClockedInToday && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${todayRecord?.isLate ? 'bg-amber-400 text-slate-900' : 'bg-emerald-400 text-slate-900'}`}>
                      {todayRecord?.isLate ? `Late (${todayRecord.lateMinutes}m)` : 'On Time'}
                    </span>
                  )}
                </div>
                {hasClockedInToday && (
                  <div className="text-xs text-slate-300 mt-1 space-y-0.5 font-mono">
                    <div>In: <strong>{formatTime12Hour(todayRecord?.clockInTime)}</strong></div>
                    {todayRecord?.workMode === 'field' && todayRecord?.fieldClientName && (
                      <div className="text-[11px] text-amber-300 truncate max-w-[180px] flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span>{todayRecord.fieldClientName}</span>
                      </div>
                    )}
                    {todayRecord?.matchedLocationName && todayRecord?.workMode === 'office' && (
                      <div className="text-[11px] text-blue-300 truncate max-w-[180px] flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/></svg>
                        <span>{todayRecord.matchedLocationName}</span>
                      </div>
                    )}
                    {hasClockedOutToday && <div>Out: <strong>{formatTime12Hour(todayRecord?.clockOutTime)}</strong></div>}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {!hasClockedInToday ? (
                <div className="flex flex-col gap-2">
                  {/* Mode Selector */}
                  {settings.allow_field_work && (
                    <div className="flex rounded-lg bg-slate-800 p-1 border border-slate-700">
                      <button
                        type="button"
                        onClick={() => setWorkMode('office')}
                        className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                          workMode === 'office' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/><line x1="9" y1="6" x2="9.01" y2="6"/><line x1="15" y1="6" x2="15.01" y2="6"/><line x1="9" y1="10" x2="9.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/></svg>
                        <span>Office Branch</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setWorkMode('field')}
                        className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                          workMode === 'field' ? 'bg-amber-500 text-slate-900 shadow-xs' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span>Field / Client</span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleClockIn}
                    disabled={actionLoading}
                    className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-display font-bold text-sm px-6 py-3.5 rounded-xl shadow-lg hover:shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {actionLoading ? 'Verifying Location...' : workMode === 'field' ? 'Clock In on Field' : 'Clock In (Office)'}
                  </button>
                </div>
              ) : !hasClockedOutToday ? (
                <button
                  onClick={handleClockOut}
                  disabled={actionLoading}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-display font-bold text-sm px-6 py-4 rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                  {actionLoading ? 'Clocking Out...' : 'Clock Out'}
                </button>
              ) : (
                <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-5 py-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  Completed for today
                </div>
              )}
            </div>
          </div>

          {/* Field Work Details Input (when Field Work mode is selected before Clock In) */}
          {!hasClockedInToday && workMode === 'field' && (
            <div className="mt-4 pt-4 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-amber-300 uppercase tracking-wide mb-1">
                  Client Name / Project Site *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dangote Sugar HQ or Lekki Project Site"
                  value={fieldClientName}
                  onChange={e => setFieldClientName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1">
                  Visit Purpose / Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sales presentation & proposal review"
                  value={fieldNotes}
                  onChange={e => setFieldNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          {/* Feedback alerts */}
          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span>{successMsg}</span>
            </div>
          )}

          {/* Additional details (Site / Overtime) */}
          {hasClockedInToday && (
            <div className="mt-4 pt-4 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onSite}
                    onChange={e => setOnSite(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-400"
                  />
                  <span>On-Site Work</span>
                </label>
                <div className="flex items-center gap-2">
                  <span>OT Hours:</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={overtimeHours}
                    onChange={e => setOvertimeHours(Number(e.target.value))}
                    className="w-16 px-2 py-1 text-xs rounded bg-slate-700/80 border border-slate-600 text-white font-mono focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleUpdateToday}
                disabled={actionLoading}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
              >
                Save Details
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Monthly Summary Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-emerald-600 font-mono-data">{present}</div>
          <div className="text-xs text-slate-500 mt-0.5">Days Present</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-blue-600 font-mono-data">{onTimeDays}</div>
          <div className="text-xs text-slate-500 mt-0.5">On-Time Arrivals</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-amber-600 font-mono-data">{lateDays}</div>
          <div className="text-xs text-slate-500 mt-0.5">Late Arrivals ({totalLateMinutes}m)</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-amber-500 font-mono-data">{fieldDays}</div>
          <div className="text-xs text-slate-500 mt-0.5">Field / Client Visits</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-purple-600 font-mono-data">{onLeave}</div>
          <div className="text-xs text-slate-500 mt-0.5">Days on Leave</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-violet-600 font-mono-data">{otHours}h</div>
          <div className="text-xs text-slate-500 mt-0.5">OT Hours (Approved)</div>
        </div>
      </div>

      {/* ── Attendance Calendar Grid ── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <span className="font-display font-semibold text-slate-700 text-sm">{monthYearLabel} — Attendance Calendar</span>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> On Time</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Late</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400"></span> Field Work</span>
          </div>
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
              <div key={day.date} className={`p-1.5 sm:p-2 border-r border-b border-slate-50 min-h-[76px] ${isToday ? 'bg-blue-50/60' : ''}`}>
                <div className="flex items-start justify-between">
                  <span className={`text-xs font-semibold ${isToday ? 'text-blue-600' : isWeekend && !shouldShowStatus ? 'text-slate-300' : 'text-slate-600'} ${isToday ? 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs' : ''}`}>
                    {d}
                  </span>
                  {shouldShowStatus && (
                    <span className={`w-2 h-2 rounded-full flex-none ${day.workMode === 'field' ? 'bg-amber-500' : day.isLate ? 'bg-amber-400' : STATUS_DOT[day.status]}`} />
                  )}
                </div>

                {shouldShowStatus && (
                  <div className="mt-1 space-y-0.5">
                    <div className={`text-[10px] px-1 py-0.5 rounded leading-tight text-center font-medium ${
                      day.workMode === 'field'
                        ? 'bg-amber-100 text-amber-900'
                        : day.isLate
                        ? 'bg-amber-100 text-amber-800'
                        : STATUS_BG[day.status]
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
    </div>
  )
}
