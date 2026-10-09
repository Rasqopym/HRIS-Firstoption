import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../hooks/useCurrentStaff'
import type { DayAttendance, AttendanceStatus, SiteVisit } from '../../types'
import {
  calculateDistanceMeters,
  findNearestLocation,
  evaluateLateness,
  formatTime12Hour,
  formatDistance,
  type OfficeLocation,
} from '../../lib/geofence'
import { checkAndAutoClockOut, submitDepartureAdjustment } from '../../lib/attendanceAutoClockout'

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
        siteVisits: Array.isArray(rec.site_visits) ? rec.site_visits : Array.isArray(rec.siteVisits) ? rec.siteVisits : [],
        overtimeHours: rec.overtime_hours || rec.overtimeHours || 0,
        onSite: rec.on_site ?? rec.onSite ?? false,
        overtimeApproval: rec.overtime_approval || rec.overtimeApproval || 'none',
        autoClockedOut: Boolean(rec.auto_clocked_out ?? rec.autoClockedOut),
        adjustmentRequested: Boolean(rec.adjustment_requested ?? rec.adjustmentRequested),
        adjustmentStatus: rec.adjustment_status || rec.adjustmentStatus || 'none',
        adjustmentReason: rec.adjustment_reason || rec.adjustmentReason,
        adjustmentRequestedDeparture: rec.adjustment_requested_departure || rec.adjustmentRequestedDeparture,
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
      } else if (isPastOrToday) {
        const isToday = dateObj.getTime() === today.getTime()
        days.push({
          date: dateStr,
          status: isToday ? 'unmarked' : 'absent',
          overtimeHours: 0,
          onSite: false,
          overtimeApproval: 'none',
          siteVisits: [],
        })
      } else {
        days.push({
          date: dateStr,
          status: 'unmarked',
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

  // Multi-Site Visit Modal State
  const [showSiteModal, setShowSiteModal] = useState(false)
  const [siteVisitName, setSiteVisitName] = useState('')
  const [siteVisitPurpose, setSiteVisitPurpose] = useState('')
  const [siteActionLoading, setSiteActionLoading] = useState(false)

  // Departure Adjustment Modal State (For forgotten clock-outs / auto-closed shifts)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustDay, setAdjustDay] = useState<ExtendedDayAttendance | null>(null)
  const [adjustDepartureTime, setAdjustDepartureTime] = useState('17:00')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustLoading, setAdjustLoading] = useState(false)

  // Real-time clock
  const [currentTime, setCurrentTime] = useState(new Date())

  // Public Holidays State
  const [customHolidays, setCustomHolidays] = useState<PublicHoliday[]>([])

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

          if (Array.isArray(data.custom_holidays)) {
            setCustomHolidays(data.custom_holidays)
          } else {
            try {
              const cached = localStorage.getItem('hris_custom_holidays')
              if (cached) setCustomHolidays(JSON.parse(cached))
            } catch (e) {}
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

  // ── Clock In Handler (Shift Level) ──────────────────────────────────
  const handleClockIn = async () => {
    if (!staff) return

    if (workMode === 'field' && settings.require_field_note && !fieldClientName.trim()) {
      setError('Please provide the initial Client Name or Project Site before clocking in from the field.')
      return
    }

    setActionLoading(true)
    setError('')
    setSuccessMsg('')

    const performClockIn = async (userLat?: number, userLng?: number, matchedLoc?: OfficeLocation | null, distance?: number) => {
      try {
        const now = new Date()
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false })

        const isWeekendDay = now.getDay() === 0 || now.getDay() === 6
        // Evaluate Lateness (only on standard work weekdays, not weekend rota shifts)
        let isLate = false
        let lateMinutes = 0
        if (settings.enable_lateness_tracking && !isWeekendDay) {
          const evalRes = evaluateLateness(now, settings.work_start_time, settings.grace_period_minutes)
          isLate = evalRes.isLate
          lateMinutes = evalRes.lateMinutes
        }

        // Initial Site Visit item if started on field or office
        const initialVisits: SiteVisit[] = []
        if (workMode === 'field' && fieldClientName.trim()) {
          initialVisits.push({
            id: `visit-${Date.now()}`,
            site_name: fieldClientName.trim(),
            arrival_time: timeStr,
            departure_time: null,
            lat: userLat || null,
            lng: userLng || null,
            purpose: fieldNotes.trim() || (isWeekendDay ? 'Weekend shift on field' : 'Field visit check-in'),
            status: 'in_progress',
          })
        } else if (matchedLoc) {
          initialVisits.push({
            id: `visit-${Date.now()}`,
            site_name: matchedLoc.name,
            arrival_time: timeStr,
            departure_time: null,
            lat: userLat || null,
            lng: userLng || null,
            purpose: isWeekendDay ? (now.getDay() === 6 ? 'Saturday shift arrival' : 'Sunday emergency arrival') : 'Office shift arrival',
            status: 'in_progress',
          })
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
          site_visits: initialVisits,
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
          siteVisits: initialVisits,
          overtimeHours,
          onSite: workMode === 'office' ? true : onSite,
          overtimeApproval: overtimeHours > 0 ? 'pending' : 'none',
        } : d))

        // Save to Supabase
        await supabase.from('attendance_records').upsert(record, { onConflict: 'staff_id,attendance_date' })

        let msg = `Clocked In at ${formatTime12Hour(timeStr)}`
        if (isWeekendDay) {
          msg += ` · ${now.getDay() === 6 ? 'Saturday Shift' : 'Sunday Emergency'}`
        }
        if (workMode === 'field') {
          msg += ` · Field Work (${fieldClientName.trim()})`
        } else if (matchedLoc) {
          msg += ` · ${matchedLoc.name}`
        }
        if (isLate) {
          msg += ` · Late by ${lateMinutes}m`
        } else if (!isWeekendDay) {
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

    // Enforce GPS Location Check
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userLat = pos.coords.latitude
          const userLng = pos.coords.longitude

          if (workMode === 'office' && settings.enable_geofencing) {
            const match = findNearestLocation(userLat, userLng, settings.office_locations)

            if (!match.isWithinRadius && match.nearest) {
              setError(`Location Check Failed: You are ${formatDistance(match.distance)} away from ${match.nearest.name} (Allowed radius: ${match.nearest.radius_meters || 100}m). If you are visiting a client or project site, switch to "Field Work" mode.`)
              setActionLoading(false)
              return
            }

            performClockIn(userLat, userLng, match.nearest, match.distance)
          } else {
            const match = findNearestLocation(userLat, userLng, settings.office_locations)
            performClockIn(userLat, userLng, match.nearest, match.distance)
          }
        },
        (err) => {
          let errorDetail = 'Please turn on Location / GPS on your device and allow browser location permissions to clock in.'
          if (err.code === 1) {
            errorDetail = 'Location permission was denied. Please allow location access in your browser settings to clock in.'
          } else if (err.code === 2) {
            errorDetail = 'Device location is turned off or unavailable. Please turn on GPS on your device and try again.'
          } else if (err.code === 3) {
            errorDetail = 'Location request timed out. Please ensure GPS is active and try again.'
          }
          setError(`Location Required: ${errorDetail}`)
          setActionLoading(false)
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      )
    } else {
      setError('Geolocation is not supported by your device/browser. Please use a supported device.')
      setActionLoading(false)
    }
  }

  // ── Multi-Site Visit: Check In to a New Site ────────────────────────
  const handleStartSiteVisit = async () => {
    if (!staff || !todayRecord || !siteVisitName.trim()) return

    setSiteActionLoading(true)
    setError('')

    const performAddSite = async (userLat?: number, userLng?: number) => {
      try {
        const now = new Date()
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false })

        // Auto-complete any active previous visit
        const currentVisits: SiteVisit[] = (todayRecord.siteVisits || []).map(v => {
          if (v.status === 'in_progress') {
            return {
              ...v,
              departure_time: timeStr,
              status: 'completed' as const,
            }
          }
          return v
        })

        const newVisit: SiteVisit = {
          id: `visit-${Date.now()}`,
          site_name: siteVisitName.trim(),
          arrival_time: timeStr,
          departure_time: null,
          lat: userLat || null,
          lng: userLng || null,
          purpose: siteVisitPurpose.trim() || 'Site inspection / client meeting',
          status: 'in_progress',
        }

        const updatedVisits = [...currentVisits, newVisit]

        const record = {
          staff_id: staff.id,
          attendance_date: todayStr,
          status: 'present',
          clock_in_time: todayRecord.clockInTime || null,
          clock_out_time: todayRecord.clockOutTime || null,
          is_late: todayRecord.isLate || false,
          late_minutes: todayRecord.lateMinutes || 0,
          work_mode: todayRecord.workMode || 'field',
          matched_location_name: todayRecord.matchedLocationName || null,
          field_client_name: siteVisitName.trim(),
          field_notes: siteVisitPurpose.trim() || todayRecord.fieldNotes || null,
          site_visits: updatedVisits,
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
            existingCache[todayStr] = record
            localStorage.setItem(k, JSON.stringify(existingCache))
          }
          window.dispatchEvent(new Event('storage'))
        } catch (e) {}

        setDays(prev => prev.map(d => d.date === todayStr ? {
          ...d,
          siteVisits: updatedVisits,
          fieldClientName: siteVisitName.trim(),
          fieldNotes: siteVisitPurpose.trim(),
        } : d))

        await supabase.from('attendance_records').upsert(record, { onConflict: 'staff_id,attendance_date' })

        setShowSiteModal(false)
        setSiteVisitName('')
        setSiteVisitPurpose('')
        setSuccessMsg(`Checked in at ${siteVisitName.trim()} (${formatTime12Hour(timeStr)})`)
      } catch (err) {
        console.error('Error adding site visit:', err)
        setError('Failed to record site check-in.')
      } finally {
        setSiteActionLoading(false)
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => performAddSite(pos.coords.latitude, pos.coords.longitude),
        (err) => {
          let errorDetail = 'Please turn on Location / GPS on your device and allow browser location permissions to check in to this site.'
          if (err.code === 1) {
            errorDetail = 'Location permission was denied. Please allow location access in your browser settings.'
          } else if (err.code === 2) {
            errorDetail = 'Device location is turned off or unavailable. Please turn on GPS on your device and try again.'
          } else if (err.code === 3) {
            errorDetail = 'Location request timed out. Please ensure GPS is active and try again.'
          }
          setError(`Site Check-In Failed: ${errorDetail}`)
          setSiteActionLoading(false)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    } else {
      setError('Geolocation is not supported by your device/browser.')
      setSiteActionLoading(false)
    }
  }

  // ── Multi-Site Visit: Complete / Check Out of Site ──────────────────
  const handleCompleteSiteVisit = async (visitId: string) => {
    if (!staff || !todayRecord) return

    setSiteActionLoading(true)
    setError('')

    try {
      const now = new Date()
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false })

      const updatedVisits: SiteVisit[] = (todayRecord.siteVisits || []).map(v => {
        if (v.id === visitId) {
          return {
            ...v,
            departure_time: timeStr,
            status: 'completed' as const,
          }
        }
        return v
      })

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
        site_visits: updatedVisits,
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
          existingCache[todayStr] = record
          localStorage.setItem(k, JSON.stringify(existingCache))
        }
        window.dispatchEvent(new Event('storage'))
      } catch (e) {}

      setDays(prev => prev.map(d => d.date === todayStr ? {
        ...d,
        siteVisits: updatedVisits,
      } : d))

      await supabase.from('attendance_records').upsert(record, { onConflict: 'staff_id,attendance_date' })
      setSuccessMsg(`Completed visit at ${formatTime12Hour(timeStr)}`)
    } catch (err) {
      console.error('Error completing site visit:', err)
      setError('Failed to record site checkout.')
    } finally {
      setSiteActionLoading(false)
    }
  }

  // ── Clock Out Handler (Shift Level) ─────────────────────────────────
  const handleClockOut = async () => {
    if (!staff || !todayRecord) return

    setActionLoading(true)
    setError('')
    setSuccessMsg('')

    try {
      const now = new Date()
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false })

      // Auto-complete any active site visits on day checkout
      const finalizedVisits: SiteVisit[] = (todayRecord.siteVisits || []).map(v => {
        if (v.status === 'in_progress') {
          return {
            ...v,
            departure_time: timeStr,
            status: 'completed' as const,
          }
        }
        return v
      })

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
        site_visits: finalizedVisits,
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
          existingCache[todayStr] = record
          localStorage.setItem(k, JSON.stringify(existingCache))
        }
        window.dispatchEvent(new Event('storage'))
      } catch (e) {
        console.warn('LocalStorage save error:', e)
      }

      setDays(prev => prev.map(d => d.date === todayStr ? {
        ...d,
        clockOutTime: timeStr,
        siteVisits: finalizedVisits,
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
        site_visits: todayRecord.siteVisits || [],
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

      // Check and close any past forgotten shifts automatically
      try {
        await checkAndAutoClockOut(staff.id, settings.work_end_time)
      } catch {}

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
      const builtDays = buildMonth(selectedYear, selectedMonth, mergedRecords, customHolidays)
      setDays(builtDays)
    } catch (err) {
      console.error('Error fetching attendance:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAttendance()
  }, [staff, selectedMonth, selectedYear, customHolidays])

  const handleOpenAdjustmentModal = (day: ExtendedDayAttendance) => {
    setAdjustDay(day)
    setAdjustDepartureTime(day.clockOutTime ? day.clockOutTime.slice(0, 5) : (settings.work_end_time || '17:00'))
    setAdjustReason(day.adjustmentReason || '')
    setShowAdjustModal(true)
  }

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff || !adjustDay) return

    setAdjustLoading(true)
    setError('')
    try {
      const ok = await submitDepartureAdjustment(
        staff.id,
        staff.full_name,
        adjustDay.date,
        adjustDepartureTime,
        adjustReason.trim() || 'Adjusted departure time'
      )
      if (ok) {
        setSuccessMsg(`✓ Departure time for ${adjustDay.date} updated to ${formatTime12Hour(adjustDepartureTime)}`)
        setShowAdjustModal(false)
        await fetchAttendance()
      } else {
        setError('Failed to submit departure adjustment.')
      }
    } catch {
      setError('An error occurred while saving adjustment.')
    } finally {
      setAdjustLoading(false)
    }
  }

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

  // Detect any past unclosed shifts or auto-clockout days
  const unclosedOrAutoDays = days.filter(d => 
    (d.status === 'present' && !d.clockOutTime && d.date < todayStr) || 
    d.autoClockedOut
  )
  const recentUnclosedDay = unclosedOrAutoDays[unclosedOrAutoDays.length - 1]

  // Today's site visits
  const todayVisits = todayRecord?.siteVisits || []
  const activeVisit = todayVisits.find(v => v.status === 'in_progress')

  // Month stats
  const present = days.filter(d => d.status === 'present').length
  const lateDays = days.filter(d => d.status === 'present' && d.isLate).length
  const onTimeDays = present - lateDays
  const totalLateMinutes = days.filter(d => d.status === 'present' && d.isLate).reduce((acc, d) => acc + (d.lateMinutes || 0), 0)
  const onLeave = days.filter(d => d.status === 'on_leave').length
  const otHours = days.filter(d => d.overtimeApproval === 'approved').reduce((a, d) => a + d.overtimeHours, 0)
  const fieldDays = days.filter(d => d.status === 'present' && (d.workMode === 'field' || (d.siteVisits && d.siteVisits.length > 0))).length

  return (
    <div className="p-4 sm:p-6 anim-fade-up space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-slate-800 text-xl sm:text-2xl">My Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">{monthYearLabel} — clock-in, multi-site journeys, and GPS verification</p>
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

      {/* ── Auto Clock-Out / Forgotten Clock-Out Notice Card ── */}
      {recentUnclosedDay && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <div className="font-bold text-amber-950 text-sm flex items-center gap-2">
                <span>Forgotten Clock-Out on {new Date(recentUnclosedDay.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                  {recentUnclosedDay.autoClockedOut ? 'Auto Closed (5:00 PM)' : 'Pending Departure'}
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                {recentUnclosedDay.autoClockedOut 
                  ? `Your shift was automatically closed at standard official close (${recentUnclosedDay.clockOutTime ? formatTime12Hour(recentUnclosedDay.clockOutTime) : '5:00 PM'}). If you left earlier or stayed late, you can adjust your departure.`
                  : `You did not clock out on this day before leaving. Would you like to record your actual departure time?`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleOpenAdjustmentModal(recentUnclosedDay)}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-2xs transition-colors flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span>Adjust Departure Time</span>
          </button>
        </div>
      )}

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
                {isPublicHoliday(todayStr, customHolidays) ? (
                  <span className="text-cyan-300 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span>Public Holiday: {isPublicHoliday(todayStr, customHolidays)?.name} (Paid Off Day)</span>
                  </span>
                ) : today.getDay() === 6 || today.getDay() === 0 ? (
                  <span className="text-amber-300 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>{today.getDay() === 6 ? 'Saturday Shift Rota' : 'Sunday Emergency / On-Call'} (Standard Day Off if not on rota)</span>
                  </span>
                ) : (
                  <>
                    <span>Shift: <strong className="text-white">{settings.work_start_time}</strong> – <strong className="text-white">{settings.work_end_time}</strong></span>
                    <span>•</span>
                    <span>Grace: <strong className="text-white">{settings.grace_period_minutes}m</strong></span>
                  </>
                )}
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
                <span className="text-[11px] font-medium text-slate-300 uppercase tracking-wide">Today's Shift</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-base font-bold text-white">
                    {hasClockedInToday ? 'Present' : isPublicHoliday(todayStr, customHolidays) ? 'Public Holiday' : 'Not Clocked In'}
                  </span>
                  {hasClockedInToday && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${todayRecord?.isLate ? 'bg-amber-400 text-slate-900' : 'bg-emerald-400 text-slate-900'}`}>
                      {todayRecord?.isLate ? `Late (${todayRecord.lateMinutes}m)` : isPublicHoliday(todayStr, customHolidays) ? 'Holiday Duty' : 'On Time'}
                    </span>
                  )}
                  {!hasClockedInToday && isPublicHoliday(todayStr, customHolidays) && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-400 text-slate-900">
                      Paid Off
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
                  {actionLoading ? 'Clocking Out...' : 'Clock Out (End Day)'}
                </button>
              ) : (
                <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-5 py-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  Completed for today
                </div>
              )}
            </div>
          </div>

          {/* Initial Field Input (before clock in) */}
          {!hasClockedInToday && workMode === 'field' && (
            <div className="mt-4 pt-4 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-amber-300 uppercase tracking-wide mb-1">
                  First Client / Project Site *
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

          {/* ── Multi-Site Journey / Check-Ins (Visible while Clocked In) ── */}
          {hasClockedInToday && (
            <div className="mt-5 pt-5 border-t border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>Today's Site Journey ({todayVisits.length} Location{todayVisits.length !== 1 ? 's' : ''})</span>
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-0.5">Check in as you arrive at different clients or project sites throughout the day</p>
                </div>

                {!hasClockedOutToday && (
                  <button
                    type="button"
                    onClick={() => setShowSiteModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold shadow-xs transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>+ Check In to Next Site</span>
                  </button>
                )}
              </div>

              {/* Site timeline list */}
              <div className="space-y-2 pt-1">
                {todayVisits.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 text-center">
                    No individual site check-ins logged yet today. Click <strong>+ Check In to Next Site</strong> when you arrive at a client or project site.
                  </div>
                ) : (
                  todayVisits.map((visit, idx) => {
                    const isActive = visit.status === 'in_progress'
                    const duration = calculateVisitDuration(visit.arrival_time, visit.departure_time)

                    return (
                      <div
                        key={visit.id || idx}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isActive
                            ? 'bg-amber-500/15 border-amber-500/40 text-white shadow-xs'
                            : 'bg-white/5 border-white/10 text-slate-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5 ${
                            isActive ? 'bg-amber-400 text-slate-950 animate-pulse' : 'bg-white/10 text-slate-300'
                          }`}>
                            {idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm font-semibold text-white">{visit.site_name}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isActive ? 'bg-amber-400 text-slate-950' : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                              }`}>
                                {isActive ? 'Active Now' : 'Completed'}
                              </span>
                              <span className="text-[11px] text-slate-300 font-mono">
                                ({duration})
                              </span>
                            </div>
                            <div className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span>Arrived: <strong>{formatTime12Hour(visit.arrival_time)}</strong></span>
                              {visit.departure_time && <span>Departed: <strong>{formatTime12Hour(visit.departure_time)}</strong></span>}
                              {visit.lat && visit.lng && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  GPS: {visit.lat.toFixed(4)}, {visit.lng.toFixed(4)}
                                </span>
                              )}
                            </div>
                            {visit.purpose && (
                              <p className="text-xs text-amber-200/90 mt-1 italic">
                                "{visit.purpose}"
                              </p>
                            )}
                          </div>
                        </div>

                        {isActive && !hasClockedOutToday && (
                          <button
                            type="button"
                            onClick={() => handleCompleteSiteVisit(visit.id)}
                            disabled={siteActionLoading}
                            className="self-end sm:self-center px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 border border-white/20"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            <span>Check Out of Site</span>
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* Overtime & site flag */}
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
                  <span>On-Site Deployment Allowance</span>
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

      {/* ── Add Site Visit Modal ── */}
      {showSiteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSiteModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 text-slate-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Check In to Next Site</h3>
                <p className="text-xs text-slate-500 mt-0.5">Logs your GPS arrival time and purpose at this location</p>
              </div>
              <button onClick={() => setShowSiteModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3">
              {/* Presets from Office/Project sites */}
              {settings.office_locations.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                    Quick Pick (Registered Branch / Project Site)
                  </label>
                  <select
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-blue-400"
                    onChange={e => {
                      if (e.target.value) setSiteVisitName(e.target.value)
                    }}
                    defaultValue=""
                  >
                    <option value="">— Or type custom client name below —</option>
                    {settings.office_locations.map(loc => (
                      <option key={loc.id} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                  Site / Client Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dangote Sugar HQ, Epe Project Site, or Zenith Bank HQ"
                  value={siteVisitName}
                  onChange={e => setSiteVisitName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                  Visit Purpose / Objective
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Structural inspection, client demo, or site audit..."
                  value={siteVisitPurpose}
                  onChange={e => setSiteVisitPurpose(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/></svg>
                <span>Your device's GPS coordinates will be captured with this check-in.</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSiteModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartSiteVisit}
                disabled={!siteVisitName.trim() || siteActionLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {siteActionLoading ? 'Capturing GPS...' : 'Confirm Site Check-In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Departure Adjustment Modal (Forgot to Clock Out) ── */}
      {showAdjustModal && adjustDay && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 anim-fade-in" onClick={() => setShowAdjustModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 text-slate-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">Adjust Departure Time</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record your exact departure for {new Date(adjustDay.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
              </div>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={handleSubmitAdjustment} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Shift Date:</span>
                  <span className="font-semibold text-slate-800">{adjustDay.date}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Clock In Time:</span>
                  <span className="font-semibold text-slate-800">{adjustDay.clockInTime ? formatTime12Hour(adjustDay.clockInTime) : '—'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Current Recorded Departure:</span>
                  <span className="font-semibold text-amber-700">{adjustDay.clockOutTime ? formatTime12Hour(adjustDay.clockOutTime) : 'Not Clocked Out'}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                  Actual Departure Time (24h) *
                </label>
                <input
                  type="time"
                  required
                  value={adjustDepartureTime}
                  onChange={e => setAdjustDepartureTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                  Reason for Adjustment / Note *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Forgot to clock out before leaving, stayed late finishing reports..."
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-xs"
                >
                  {adjustLoading ? 'Saving...' : 'Save & Update Departure'}
                </button>
              </div>
            </form>
          </div>
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
          <div className="text-xs text-slate-500 mt-0.5">Site / Field Days</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-purple-600 font-mono-data">{onLeave}</div>
          <div className="text-xs text-slate-500 mt-0.5">Days on Leave</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="font-display font-bold text-2xl text-indigo-600 font-mono-data">{days.filter(d => d.status === 'present' && (new Date(d.date).getDay() === 0 || new Date(d.date).getDay() === 6)).length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Weekend Shifts</div>
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
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400"></span> Weekend Shift</span>
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
            const visitsCount = day.siteVisits?.length || 0

            return (
              <div key={day.date} className={`p-1.5 sm:p-2 border-r border-b border-slate-50 min-h-[76px] ${isToday ? 'bg-blue-50/60' : ''}`}>
                <div className="flex items-start justify-between">
                  <span className={`text-xs font-semibold ${isToday ? 'text-blue-600' : isWeekend && !shouldShowStatus ? 'text-slate-300' : 'text-slate-600'} ${isToday ? 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs' : ''}`}>
                    {d}
                  </span>
                  {shouldShowStatus && (
                    <span className={`w-2 h-2 rounded-full flex-none ${isWeekend ? 'bg-purple-500' : day.workMode === 'field' || visitsCount > 0 ? 'bg-amber-500' : day.isLate ? 'bg-amber-400' : STATUS_DOT[day.status]}`} />
                  )}
                </div>

                {shouldShowStatus && (
                  <div className="mt-1 space-y-0.5">
                    <div className={`text-[10px] px-1 py-0.5 rounded leading-tight text-center font-medium ${
                      isWeekend
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : visitsCount > 0
                        ? 'bg-amber-100 text-amber-900'
                        : day.isLate
                        ? 'bg-amber-100 text-amber-800'
                        : STATUS_BG[day.status]
                    }`}>
                      {isWeekend ? (dow === 6 ? 'Saturday Shift' : 'Sunday Shift') : visitsCount > 1 ? `${visitsCount} Sites` : visitsCount === 1 ? '1 Site' : day.isLate ? `Late (${day.lateMinutes}m)` : STATUS_TEXT[day.status]}
                    </div>
                    {day.clockInTime && (
                      <div className="text-[9px] text-slate-500 text-center font-mono">
                        {formatTime12Hour(day.clockInTime)}
                        {day.clockOutTime && ` – ${formatTime12Hour(day.clockOutTime)}`}
                      </div>
                    )}
                    {day.autoClockedOut && (
                      <button
                        type="button"
                        onClick={() => handleOpenAdjustmentModal(day)}
                        className="text-[9px] w-full text-amber-800 bg-amber-100/90 hover:bg-amber-200 rounded px-1 py-0.2 border border-amber-300 text-center font-bold transition-colors cursor-pointer"
                        title="Auto-closed at 5:00 PM. Click to adjust departure time."
                      >
                        ⚡ Auto 5PM ✎
                      </button>
                    )}
                  </div>
                )}

                <div className="flex gap-1 mt-1 flex-wrap justify-center">
                  {day.overtimeHours > 0 && <span className="text-violet-600 font-mono text-[9px] font-semibold">+{day.overtimeHours}h</span>}
                  {visitsCount > 0 && <span className="text-amber-600 text-[9px] font-semibold">{visitsCount} stops</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
