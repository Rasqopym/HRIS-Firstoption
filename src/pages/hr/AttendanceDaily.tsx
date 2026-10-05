import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { logAction } from '../../lib/auditLog'
import type { DayAttendance, AttendanceStatus, SiteVisit } from '../../types'
import { formatTime12Hour, formatDistance, calculateVisitDuration } from '../../lib/geofence'
import { isPublicHoliday, type PublicHoliday } from '../../lib/holidays'
import { getInitials, getAvatarColor } from '../../lib/avatarUtils'

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-500',
  absent: 'bg-red-500',
  on_leave: 'bg-amber-400',
  public_holiday: 'bg-blue-400',
  weekend: 'bg-slate-200',
  unmarked: 'bg-slate-300',
}

const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  on_leave: 'On Leave',
  public_holiday: 'Public Holiday',
  weekend: 'Weekend',
  unmarked: 'Unmarked',
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

interface StaffMember {
  id: string
  staff_code: string
  full_name: string
  job_title: string
  photo_url: string
  profile_id?: string
  email?: string
  department_name?: string
}

type ViewMode = 'today' | 'calendar'
type StatusFilterType = 'all' | 'present' | 'on_time' | 'late' | 'field' | 'absent' | 'on_leave'

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

export default function AttendanceDaily() {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [days, setDays] = useState<ExtendedDayAttendance[]>([])
  const [customHolidays, setCustomHolidays] = useState<PublicHoliday[]>([])
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // ── Today's Roster State ──
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [viewMode, setViewMode] = useState<ViewMode>('today')
  const [targetDate, setTargetDate] = useState<string>(todayStr)
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all')
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [todayRecords, setTodayRecords] = useState<Record<string, any>>({})
  const [todayLeaves, setTodayLeaves] = useState<Record<string, any>>({})
  const [rosterLoading, setRosterLoading] = useState(false)

  // ── Inspection / Adjustment Modal State ──
  const [inspectModalOpen, setInspectModalOpen] = useState(false)
  const [inspectStaff, setInspectStaff] = useState<StaffMember | null>(null)
  const [inspectDate, setInspectDate] = useState<string>(todayStr)
  const [editingRecord, setEditingRecord] = useState<ExtendedDayAttendance | null>(null)

  const selectedStaff = staffList.find(s => s.id === selectedStaffId)

  // Check if session storage requested a specific filter on load
  useEffect(() => {
    const filterParam = sessionStorage.getItem('hris_attendance_filter')
    if (filterParam) {
      if (['all', 'present', 'on_time', 'late', 'field', 'absent', 'on_leave'].includes(filterParam)) {
        setStatusFilter(filterParam as StatusFilterType)
      }
      sessionStorage.removeItem('hris_attendance_filter')
    }
  }, [])

  // ── Save Record to LocalStorage & Supabase ──
  const saveRecordForStaff = async (staffMember: StaffMember, dayRecord: ExtendedDayAttendance) => {
    const record = {
      staff_id: staffMember.id,
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

    const candidateIds = [staffMember.id, staffMember.staff_code, staffMember.profile_id, staffMember.email].filter(Boolean) as string[]

    try {
      for (const cid of candidateIds) {
        const keys = [
          `hris_attendance_daily_${cid}`,
          `hris_self_attendance_${cid}`,
        ]
        for (const k of keys) {
          const existingCache = JSON.parse(localStorage.getItem(k) || '{}')
          existingCache[dayRecord.date] = record
          localStorage.setItem(k, JSON.stringify(existingCache))
        }
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

    // Update in-memory today records for all candidate IDs
    const updates: Record<string, any> = {}
    candidateIds.forEach(cid => {
      updates[cid] = record
    })
    setTodayRecords(prev => ({ ...prev, ...updates }))

    // If this staff member is currently active in the calendar view, update their days
    if (selectedStaffId === staffMember.id) {
      setDays(prev => prev.map(d => d.date === dayRecord.date ? { ...d, ...dayRecord } : d))
    }
  }

  // Update in calendar
  const updateDay = (date: string, updates: Partial<ExtendedDayAttendance>) => {
    if (date !== todayStr || !selectedStaff) return

    const updated = days.map(d => d.date === date ? { ...d, ...updates } : d)
    setDays(updated)
    const dayRecord = updated.find(d => d.date === date)
    if (dayRecord) {
      saveRecordForStaff(selectedStaff, dayRecord)
    }
  }

  // ── Load Company Settings & Staff Directory ──
  useEffect(() => {
    const fetchStaffAndSettings = async () => {
      setLoading(true)
      let customHols: PublicHoliday[] = []
      try {
        const { data: settingsData } = await supabase
          .from('company_settings')
          .select('custom_holidays')
          .eq('id', 1)
          .maybeSingle()

        if (settingsData && Array.isArray(settingsData.custom_holidays)) {
          customHols = settingsData.custom_holidays
          setCustomHolidays(customHols)
        } else {
          try {
            const cached = localStorage.getItem('hris_custom_holidays')
            if (cached) {
              customHols = JSON.parse(cached)
              setCustomHolidays(customHols)
            }
          } catch (e) {}
        }
      } catch (e) {}

      const { data, error } = await supabase
        .from('staff')
        .select('id, staff_code, full_name, job_title, photo_url, profile_id, email, departments(name)')
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
          profile_id: s.profile_id,
          email: s.email,
          department_name: (s.departments as any)?.name || (s.departments as any)?.[0]?.name || (s as any)?.department || 'Accounting & Finance'
        }))
        setStaffList(staffWithDept)
        if (staffWithDept.length > 0) {
          setSelectedStaffId(staffWithDept[0].id)
        }
        // Fetch today's records for active staff
        fetchTodayData(todayStr, staffWithDept)
      }
      setLoading(false)
    }
    fetchStaffAndSettings()
  }, [])

  // ── Fetch Roster Records for Target Date ──
  const fetchTodayData = async (dateStr: string, staffMembers: StaffMember[] = staffList) => {
    setRosterLoading(true)
    try {
      // 1. Fetch DB records for dateStr
      const { data: dbRecords } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('attendance_date', dateStr)

      const recMap: Record<string, any> = {}
      if (dbRecords) {
        dbRecords.forEach((r: any) => {
          if (r.staff_id) recMap[r.staff_id] = r
        })
      }

      // 2. Map and normalize across all staff candidate identifiers (id, staff_code, profile_id, email)
      staffMembers.forEach(st => {
        const candidateIds = [st.id, st.staff_code, st.profile_id, st.email].filter(Boolean) as string[]

        // Check if DB record exists for ANY candidate ID
        let foundRecord: any = null
        for (const cid of candidateIds) {
          if (recMap[cid]) {
            foundRecord = recMap[cid]
            break
          }
        }

        // Also check LocalStorage across all candidate IDs
        for (const cid of candidateIds) {
          const keys = [`hris_self_attendance_${cid}`, `hris_attendance_daily_${cid}`]
          for (const k of keys) {
            const raw = localStorage.getItem(k)
            if (raw) {
              try {
                const parsed = JSON.parse(raw)
                if (parsed[dateStr]) {
                  foundRecord = { ...(foundRecord || {}), ...parsed[dateStr] }
                }
              } catch (e) {}
            }
          }
        }

        // If found, associate across all candidate IDs for consistent lookup
        if (foundRecord) {
          candidateIds.forEach(cid => {
            recMap[cid] = foundRecord
          })
        }
      })

      // 3. Fetch approved leaves for dateStr
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('staff_id, start_date, end_date, reason, status')
        .eq('status', 'approved')
        .lte('start_date', dateStr)
        .gte('end_date', dateStr)

      const leaveMap: Record<string, any> = {}
      if (leaves) {
        leaves.forEach((l: any) => {
          if (l.staff_id) leaveMap[l.staff_id] = l
        })
      }

      // Normalize leave map across candidate IDs as well
      staffMembers.forEach(st => {
        const candidateIds = [st.id, st.staff_code, st.profile_id].filter(Boolean) as string[]
        let foundLeave: any = null
        for (const cid of candidateIds) {
          if (leaveMap[cid]) {
            foundLeave = leaveMap[cid]
            break
          }
        }
        if (foundLeave) {
          candidateIds.forEach(cid => {
            leaveMap[cid] = foundLeave
          })
        }
      })

      setTodayRecords(recMap)
      setTodayLeaves(leaveMap)
    } catch (e) {
      console.warn('Attendance roster fetch error:', e)
    } finally {
      setRosterLoading(false)
    }
  }

  // Reload when targetDate changes
  useEffect(() => {
    if (staffList.length > 0) {
      fetchTodayData(targetDate, staffList)
    }
  }, [targetDate])

  // ── Load Monthly Calendar Records for Selected Staff ──
  useEffect(() => {
    const fetchAttendance = async () => {
      if (!selectedStaffId) return
      setLoading(true)
      
      const firstDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const lastDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, '0')}`
      
      const staffCode = selectedStaff?.staff_code || ''
      const profileId = selectedStaff?.profile_id || ''
      const email = selectedStaff?.email || ''
      const candidateIds = [selectedStaffId, staffCode, profileId, email].filter(Boolean) as string[]

      // 1. Read LocalStorage across all candidate IDs
      let cachedRecords: Record<string, any> = {}
      try {
        for (const cid of candidateIds) {
          const keysToTry = [
            `hris_self_attendance_${cid}`,
            `hris_attendance_daily_${cid}`,
          ]
          for (const k of keysToTry) {
            const raw = localStorage.getItem(k)
            if (raw) {
              try {
                cachedRecords = { ...cachedRecords, ...JSON.parse(raw) }
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.warn('LocalStorage read error:', e)
      }

      // 2. Fetch from Supabase across all candidate IDs
      let dbRecords: Record<string, any> = {}
      try {
        const orFilter = candidateIds.map(id => `staff_id.eq.${id}`).join(',')
        let query = supabase
          .from('attendance_records')
          .select('*')
          .gte('attendance_date', firstDay)
          .lte('attendance_date', lastDay)
          .or(orFilter)

        const { data, error } = await query

        if (data && !error) {
          data.forEach(record => {
            dbRecords[record.attendance_date] = record
          })
        }
      } catch (e) {
        console.warn('Supabase fetch attendance skipped:', e)
      }

      // 3. Directly merge any in-memory today records for this staff member
      for (const cid of candidateIds) {
        if (todayRecords[cid]) {
          const tRec = todayRecords[cid]
          const dStr = tRec.attendance_date || todayStr
          if (dStr.startsWith(`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`)) {
            dbRecords[dStr] = { ...(dbRecords[dStr] || {}), ...tRec }
          }
        }
      }

      const mergedRecords = { ...cachedRecords, ...dbRecords }
      const monthDays = buildMonth(selectedYear, selectedMonth, mergedRecords, customHolidays)
      setDays(monthDays)
      setLoading(false)
    }

    fetchAttendance()
  }, [selectedStaffId, selectedMonth, selectedYear, customHolidays, todayRecords])

  // ── Monthly Calendar Summary Metrics ──
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

  const handleSaveCalendar = async () => {
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

  // ── Today's Roster Calculations ──
  const rosterItems = useMemo(() => {
    const dow = new Date(targetDate).getDay()
    const isWeekend = dow === 0 || dow === 6
    const holiday = isPublicHoliday(targetDate, customHolidays)

    return staffList.map(st => {
      const rec = todayRecords[st.id] ||
        (st.staff_code ? todayRecords[st.staff_code] : null) ||
        (st.profile_id ? todayRecords[st.profile_id] : null) ||
        (st.email ? todayRecords[st.email] : null)

      const leave = todayLeaves[st.id] ||
        (st.staff_code ? todayLeaves[st.staff_code] : null) ||
        (st.profile_id ? todayLeaves[st.profile_id] : null)

      let computedStatus: AttendanceStatus = 'unmarked'
      let clockInTime = rec?.clock_in_time || rec?.clockInTime
      let clockOutTime = rec?.clock_out_time || rec?.clockOutTime
      let isLate = Boolean(rec?.is_late ?? rec?.isLate)
      let lateMinutes = rec?.late_minutes ?? rec?.lateMinutes ?? 0
      let workMode = rec?.work_mode || rec?.workMode || 'office'
      let matchedLocationName = rec?.matched_location_name || rec?.matchedLocationName
      let fieldClientName = rec?.field_client_name || rec?.fieldClientName
      let fieldNotes = rec?.field_notes || rec?.fieldNotes
      let siteVisits: SiteVisit[] = Array.isArray(rec?.site_visits) ? rec.site_visits : Array.isArray(rec?.siteVisits) ? rec.siteVisits : []
      let onSite = Boolean(rec?.on_site ?? rec?.onSite)
      let overtimeHours = rec?.overtime_hours || rec?.overtimeHours || 0
      let leaveReason = leave?.reason

      if (rec && rec.status) {
        computedStatus = rec.status
      } else if (leave) {
        computedStatus = 'on_leave'
      } else if (holiday) {
        computedStatus = 'public_holiday'
        leaveReason = holiday.name
      } else if (isWeekend) {
        computedStatus = 'weekend'
      } else {
        computedStatus = 'unmarked' // Not clocked in yet
      }

      return {
        staff: st,
        record: rec,
        computedStatus,
        clockInTime,
        clockOutTime,
        isLate,
        lateMinutes,
        workMode,
        matchedLocationName,
        fieldClientName,
        fieldNotes,
        siteVisits,
        onSite,
        overtimeHours,
        leaveReason,
      }
    })
  }, [staffList, todayRecords, todayLeaves, targetDate, customHolidays])

  // Roster Statistics
  const rosterStats = useMemo(() => {
    const total = rosterItems.length
    let present = 0
    let onTime = 0
    let late = 0
    let lateMinutesTotal = 0
    let field = 0
    let absent = 0
    let onLeave = 0

    rosterItems.forEach(item => {
      if (item.computedStatus === 'present') {
        present++
        if (item.isLate) {
          late++
          lateMinutesTotal += (item.lateMinutes || 0)
        } else {
          onTime++
        }
        if (item.workMode === 'field' || item.siteVisits.length > 0) {
          field++
        }
      } else if (item.computedStatus === 'on_leave') {
        onLeave++
      } else if (item.computedStatus === 'absent' || item.computedStatus === 'unmarked') {
        absent++
      }
    })

    const presenceRate = total > 0 ? Math.round((present / total) * 100) : 0

    return {
      total,
      present,
      onTime,
      late,
      lateMinutesTotal,
      field,
      absent,
      onLeave,
      presenceRate,
    }
  }, [rosterItems])

  // Unique Department List
  const departmentList = useMemo(() => {
    const set = new Set<string>()
    staffList.forEach(s => {
      if (s.department_name) set.add(s.department_name)
    })
    return Array.from(set).sort()
  }, [staffList])

  // Filtered Roster
  const filteredRoster = useMemo(() => {
    return rosterItems.filter(item => {
      // 1. Status Filter
      if (statusFilter === 'present') {
        if (item.computedStatus !== 'present') return false
      } else if (statusFilter === 'on_time') {
        if (item.computedStatus !== 'present' || item.isLate) return false
      } else if (statusFilter === 'late') {
        if (item.computedStatus !== 'present' || !item.isLate) return false
      } else if (statusFilter === 'field') {
        const isField = item.workMode === 'field' || item.siteVisits.length > 0
        if (item.computedStatus !== 'present' || !isField) return false
      } else if (statusFilter === 'absent') {
        if (item.computedStatus !== 'absent' && item.computedStatus !== 'unmarked') return false
      } else if (statusFilter === 'on_leave') {
        if (item.computedStatus !== 'on_leave') return false
      }

      // 2. Department Filter
      if (deptFilter !== 'all' && item.staff.department_name !== deptFilter) {
        return false
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = item.staff.full_name.toLowerCase().includes(q)
        const matchCode = (item.staff.staff_code || '').toLowerCase().includes(q)
        const matchDept = (item.staff.department_name || '').toLowerCase().includes(q)
        const matchTitle = (item.staff.job_title || '').toLowerCase().includes(q)
        if (!matchName && !matchCode && !matchDept && !matchTitle) return false
      }

      return true
    })
  }, [rosterItems, statusFilter, deptFilter, searchQuery])

  // Target Date Controls
  const isTargetToday = targetDate === todayStr
  const handlePrevDay = () => {
    const d = new Date(targetDate)
    d.setDate(d.getDate() - 1)
    setTargetDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  const handleNextDay = () => {
    const d = new Date(targetDate)
    d.setDate(d.getDate() + 1)
    setTargetDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  // Export CSV of Filtered Roster
  const handleExportCSV = () => {
    const headers = [
      'Staff Code',
      'Staff Name',
      'Department',
      'Job Title',
      'Date',
      'Status',
      'Clock In',
      'Clock Out',
      'Is Late',
      'Late Minutes',
      'Work Mode',
      'Location / Branch',
      'Site Visits Count',
      'OT Hours',
    ]

    const rows = filteredRoster.map(item => [
      item.staff.staff_code || '',
      `"${item.staff.full_name.replace(/"/g, '""')}"`,
      `"${(item.staff.department_name || '').replace(/"/g, '""')}"`,
      `"${(item.staff.job_title || '').replace(/"/g, '""')}"`,
      targetDate,
      item.computedStatus === 'present'
        ? (item.isLate ? `Present (Late ${item.lateMinutes}m)` : 'Present (On-Time)')
        : STATUS_TEXT[item.computedStatus] || item.computedStatus,
      item.clockInTime ? formatTime12Hour(item.clockInTime) : '',
      item.clockOutTime ? formatTime12Hour(item.clockOutTime) : '',
      item.isLate ? 'Yes' : 'No',
      item.lateMinutes || 0,
      item.workMode || 'office',
      `"${(item.matchedLocationName || item.fieldClientName || '').replace(/"/g, '""')}"`,
      item.siteVisits?.length || 0,
      item.overtimeHours || 0,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Staff_Presence_Roster_${targetDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Open Modal to Inspect / Edit Record
  const openInspectRosterModal = (item: (typeof rosterItems)[0]) => {
    setInspectStaff(item.staff)
    setInspectDate(targetDate)
    setEditingRecord({
      date: targetDate,
      status: item.computedStatus,
      clockInTime: item.clockInTime,
      clockOutTime: item.clockOutTime,
      isLate: item.isLate,
      lateMinutes: item.lateMinutes,
      distanceMeters: item.record?.clock_in_distance_meters,
      workMode: item.workMode,
      matchedLocationName: item.matchedLocationName,
      fieldClientName: item.fieldClientName,
      fieldNotes: item.fieldNotes,
      siteVisits: item.siteVisits || [],
      overtimeHours: item.overtimeHours || 0,
      onSite: item.onSite || false,
      overtimeApproval: item.record?.overtime_approval || 'none',
    })
    setInspectModalOpen(true)
  }

  const openCalendarModal = (day: ExtendedDayAttendance) => {
    if (!selectedStaff) return
    setInspectStaff(selectedStaff)
    setInspectDate(day.date)
    setEditingRecord({ ...day })
    setInspectModalOpen(true)
  }

  const updateCurrentModalRecord = (updates: Partial<ExtendedDayAttendance>) => {
    if (inspectDate !== todayStr || !inspectStaff || !editingRecord) return
    const updated = { ...editingRecord, ...updates }
    setEditingRecord(updated)
    saveRecordForStaff(inspectStaff, updated)
  }

  const isEditingCurrentDay = inspectDate === todayStr

  return (
    <div className="p-4 sm:p-6 anim-fade-up space-y-6">
      {/* ── Top Header & Dual-View Tabs ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display font-bold text-slate-800 text-xl sm:text-2xl">Daily Attendance Registry</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">
              {staffList.length} Active Staff
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time workforce presence, GPS branch clock-ins, lateness tracking, and individual attendance history
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200 self-start lg:self-auto">
          <button
            onClick={() => setViewMode('today')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'today'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Today's Staff Presence</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
              {rosterStats.present}
            </span>
          </button>

          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'calendar'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>Monthly Staff Calendar</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          VIEW 1: TODAY'S LIVE STAFF PRESENCE (AGGREGATE ROSTER & FILTER)
          ═══════════════════════════════════════════════════════════════════ */}
      {viewMode === 'today' && (
        <div className="space-y-5 anim-fade-up">
          {/* Date Selector & Action Bar */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-2xs">
                <button
                  onClick={handlePrevDay}
                  className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
                  title="Previous Day"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div className="px-3 py-1 text-xs sm:text-sm font-bold text-slate-800 min-w-[150px] text-center font-mono">
                  {new Date(targetDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <button
                  onClick={handleNextDay}
                  className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
                  title="Next Day"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>

              {!isTargetToday ? (
                <button
                  onClick={() => setTargetDate(todayStr)}
                  className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition-colors flex items-center gap-1"
                >
                  <span>Jump to Today</span>
                </button>
              ) : (
                <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Today
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <button
                onClick={() => fetchTodayData(targetDate)}
                disabled={rosterLoading}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Reload live clock-ins"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={rosterLoading ? 'animate-spin' : ''}>
                  <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                <span>Refresh</span>
              </button>

              <button
                onClick={handleExportCSV}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Export CSV ({filteredRoster.length})</span>
              </button>
            </div>
          </div>

          {/* ── Real-Time KPI Metric Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {/* Total Staff */}
            <div
              onClick={() => setStatusFilter('all')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/20'
                  : 'bg-white text-slate-800 border-slate-200/80 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${statusFilter === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total Staff
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono-data mt-1">{rosterStats.total}</div>
              <div className={`text-[10px] mt-0.5 ${statusFilter === 'all' ? 'text-slate-400' : 'text-slate-400'}`}>
                100% active roster
              </div>
            </div>

            {/* Present Today (Highlighted!) */}
            <div
              onClick={() => setStatusFilter('present')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'present'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30'
                  : 'bg-emerald-50/80 text-emerald-900 border-emerald-200 hover:bg-emerald-100/70 shadow-2xs'
              }`}
            >
              <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${statusFilter === 'present' ? 'text-emerald-100' : 'text-emerald-700'}`}>
                <span>Present Today</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono-data mt-1">{rosterStats.present}</div>
              <div className={`text-[10px] font-medium mt-0.5 ${statusFilter === 'present' ? 'text-emerald-100' : 'text-emerald-600'}`}>
                {rosterStats.presenceRate}% of staff
              </div>
            </div>

            {/* On-Time */}
            <div
              onClick={() => setStatusFilter('on_time')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'on_time'
                  ? 'bg-teal-700 text-white border-teal-700 shadow-md ring-2 ring-teal-600/30'
                  : 'bg-white text-slate-800 border-slate-200/80 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${statusFilter === 'on_time' ? 'text-teal-200' : 'text-slate-500'}`}>
                On-Time
              </div>
              <div className={`text-xl sm:text-2xl font-bold font-mono-data mt-1 ${statusFilter === 'on_time' ? 'text-white' : 'text-emerald-600'}`}>
                {rosterStats.onTime}
              </div>
              <div className={`text-[10px] mt-0.5 ${statusFilter === 'on_time' ? 'text-teal-200' : 'text-slate-400'}`}>
                Punctual arrivals
              </div>
            </div>

            {/* Late Arrivals */}
            <div
              onClick={() => setStatusFilter('late')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'late'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-400/30'
                  : 'bg-white text-slate-800 border-slate-200/80 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${statusFilter === 'late' ? 'text-amber-100' : 'text-slate-500'}`}>
                Late Arrivals
              </div>
              <div className={`text-xl sm:text-2xl font-bold font-mono-data mt-1 ${statusFilter === 'late' ? 'text-white' : 'text-amber-600'}`}>
                {rosterStats.late}
              </div>
              <div className={`text-[10px] mt-0.5 ${statusFilter === 'late' ? 'text-amber-100' : 'text-slate-400'}`}>
                +{rosterStats.lateMinutesTotal}m total late
              </div>
            </div>

            {/* Field & Site Visits */}
            <div
              onClick={() => setStatusFilter('field')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'field'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/30'
                  : 'bg-white text-slate-800 border-slate-200/80 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${statusFilter === 'field' ? 'text-indigo-200' : 'text-slate-500'}`}>
                Field / Sites
              </div>
              <div className={`text-xl sm:text-2xl font-bold font-mono-data mt-1 ${statusFilter === 'field' ? 'text-white' : 'text-indigo-600'}`}>
                {rosterStats.field}
              </div>
              <div className={`text-[10px] mt-0.5 ${statusFilter === 'field' ? 'text-indigo-200' : 'text-slate-400'}`}>
                Waypoints active
              </div>
            </div>

            {/* Not Clocked In / Absent */}
            <div
              onClick={() => setStatusFilter('absent')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'absent'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30'
                  : 'bg-white text-slate-800 border-slate-200/80 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${statusFilter === 'absent' ? 'text-rose-100' : 'text-slate-500'}`}>
                Not Clocked In
              </div>
              <div className={`text-xl sm:text-2xl font-bold font-mono-data mt-1 ${statusFilter === 'absent' ? 'text-white' : 'text-rose-600'}`}>
                {rosterStats.absent}
              </div>
              <div className={`text-[10px] mt-0.5 ${statusFilter === 'absent' ? 'text-rose-100' : 'text-slate-400'}`}>
                Pending clock-in
              </div>
            </div>

            {/* On Leave */}
            <div
              onClick={() => setStatusFilter('on_leave')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'on_leave'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30'
                  : 'bg-white text-slate-800 border-slate-200/80 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${statusFilter === 'on_leave' ? 'text-blue-100' : 'text-slate-500'}`}>
                On Leave
              </div>
              <div className={`text-xl sm:text-2xl font-bold font-mono-data mt-1 ${statusFilter === 'on_leave' ? 'text-white' : 'text-blue-600'}`}>
                {rosterStats.onLeave}
              </div>
              <div className={`text-[10px] mt-0.5 ${statusFilter === 'on_leave' ? 'text-blue-100' : 'text-slate-400'}`}>
                Approved leaves
              </div>
            </div>
          </div>

          {/* ── Filter Bar: Status Tabs, Department Dropdown & Search ── */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Filter Tabs / Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    statusFilter === 'all'
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All Staff ({rosterStats.total})
                </button>

                <button
                  onClick={() => setStatusFilter('present')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                    statusFilter === 'present'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Present Today ({rosterStats.present})</span>
                </button>

                <button
                  onClick={() => setStatusFilter('on_time')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    statusFilter === 'on_time'
                      ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  On-Time ({rosterStats.onTime})
                </button>

                <button
                  onClick={() => setStatusFilter('late')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    statusFilter === 'late'
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100/70'
                  }`}
                >
                  Late ({rosterStats.late})
                </button>

                <button
                  onClick={() => setStatusFilter('field')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    statusFilter === 'field'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Field Work ({rosterStats.field})
                </button>

                <button
                  onClick={() => setStatusFilter('absent')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    statusFilter === 'absent'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Not Clocked In ({rosterStats.absent})
                </button>

                <button
                  onClick={() => setStatusFilter('on_leave')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    statusFilter === 'on_leave'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  On Leave ({rosterStats.onLeave})
                </button>
              </div>

              {/* Department Selector */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Dept:</span>
                <select
                  value={deptFilter}
                  onChange={e => setDeptFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:border-blue-400 bg-slate-50 text-slate-700 min-w-[150px]"
                >
                  <option value="all">All Departments ({rosterStats.total})</option>
                  {departmentList.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Search Input Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search staff by full name, staff ID, department, or job title..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-2.5 sm:top-3 text-slate-400">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 sm:top-3 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* ── Filtered Staff Presence Table ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {rosterLoading ? (
              <div className="p-16 flex flex-col items-center justify-center gap-3">
                <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
                <span className="text-xs text-slate-500 font-medium">Loading real-time attendance records...</span>
              </div>
            ) : filteredRoster.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700">No staff members match this filter</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {statusFilter === 'present'
                      ? 'No staff members have clocked in or marked present for this date.'
                      : 'Try resetting the search query or status filter.'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setStatusFilter('all')
                    setDeptFilter('all')
                    setSearchQuery('')
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Staff Member</th>
                      <th className="py-3 px-4">Department & Role</th>
                      <th className="py-3 px-4">Presence Status</th>
                      <th className="py-3 px-4">Clock In</th>
                      <th className="py-3 px-4">Clock Out</th>
                      <th className="py-3 px-4">Branch / Work Mode</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRoster.map(item => {
                      const isPresent = item.computedStatus === 'present'
                      const isLate = isPresent && item.isLate

                      return (
                        <tr key={item.staff.id} className="hover:bg-slate-50/80 transition-colors group">
                          {/* Staff Info */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              {item.staff.photo_url ? (
                                <img
                                  src={item.staff.photo_url}
                                  alt={item.staff.full_name}
                                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                                />
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-2xs"
                                  style={{ backgroundColor: getAvatarColor(item.staff.full_name) }}
                                >
                                  {getInitials(item.staff.full_name)}
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                                  {item.staff.full_name}
                                </div>
                                <div className="text-[11px] font-mono text-slate-400">
                                  {item.staff.staff_code || 'ID: ' + item.staff.id.slice(0, 8)}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Dept & Role */}
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-700">{item.staff.department_name}</div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[150px]">{item.staff.job_title}</div>
                          </td>

                          {/* Presence Status */}
                          <td className="py-3 px-4">
                            {isPresent ? (
                              <div className="flex flex-col gap-0.5 items-start">
                                {isLate ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <span>Late ({item.lateMinutes}m)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                    <span>Present (On-Time)</span>
                                  </span>
                                )}

                                {item.siteVisits && item.siteVisits.length > 0 && (
                                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                    {item.siteVisits.length} Site Stop{item.siteVisits.length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            ) : item.computedStatus === 'on_leave' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                <span>On Leave {item.leaveReason ? `(${item.leaveReason})` : ''}</span>
                              </span>
                            ) : item.computedStatus === 'absent' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                                <span>Absent</span>
                              </span>
                            ) : item.computedStatus === 'public_holiday' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <span>Holiday ({item.leaveReason || 'Public'})</span>
                              </span>
                            ) : item.computedStatus === 'weekend' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                <span>Weekend</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                <span>Not Clocked In</span>
                              </span>
                            )}
                          </td>

                          {/* Clock In */}
                          <td className="py-3 px-4 font-mono">
                            {item.clockInTime ? (
                              <div className="font-semibold text-slate-800 flex items-center gap-1">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                                <span>{formatTime12Hour(item.clockInTime)}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Clock Out */}
                          <td className="py-3 px-4 font-mono">
                            {item.clockOutTime ? (
                              <div className="font-semibold text-slate-800 flex items-center gap-1">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                                <span>{formatTime12Hour(item.clockOutTime)}</span>
                              </div>
                            ) : isPresent ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Active Shift
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Branch / Work Mode */}
                          <td className="py-3 px-4">
                            {item.workMode === 'field' || item.siteVisits.length > 0 ? (
                              <div className="flex items-center gap-1.5 text-indigo-700">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                                <span className="font-semibold truncate max-w-[140px]">
                                  {item.fieldClientName || item.siteVisits[0]?.site_name || 'Field / Multi-Site'}
                                </span>
                              </div>
                            ) : item.matchedLocationName ? (
                              <div className="flex items-center gap-1 text-slate-700">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600 flex-shrink-0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                <span className="font-medium truncate max-w-[140px]">{item.matchedLocationName}</span>
                              </div>
                            ) : item.workMode === 'remote' ? (
                              <span className="text-slate-600 font-medium">Remote Work</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openInspectRosterModal(item)}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs transition-colors flex items-center gap-1"
                                title="Inspect or adjust today's record"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                <span>Adjust</span>
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedStaffId(item.staff.id)
                                  setViewMode('calendar')
                                }}
                                className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                                title="View Monthly Calendar"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          VIEW 2: MONTHLY STAFF CALENDAR (INDIVIDUAL EMPLOYEE DEEP DIVE)
          ═══════════════════════════════════════════════════════════════════ */}
      {viewMode === 'calendar' && (
        <div className="space-y-4 anim-fade-up">
          {/* Calendar Controls & Month Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
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
                onClick={handleSaveCalendar}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
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
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {staffList.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStaffId(s.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
                  selectedStaffId === s.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
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

          {/* Monthly Metrics for Selected Staff */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
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
              <div className="text-xl font-bold text-indigo-600 mt-1 font-mono-data">{summary.fieldVisits}</div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Weekend Shifts</div>
              <div className="text-xl font-bold text-purple-600 mt-1 font-mono-data">{summary.weekendShifts}</div>
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
                <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
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
                  const isCurrentDay = day.date === todayStr
                  const visitsCount = day.siteVisits?.length || 0

                  return (
                    <div
                      key={day.date}
                      onClick={() => openCalendarModal(day)}
                      className={`min-h-[96px] p-2 border-b border-r border-slate-100 relative group cursor-pointer hover:bg-blue-50/40 transition-colors ${
                        isCurrentDay ? 'bg-blue-50/40 ring-1 ring-inset ring-blue-400' : isWeekend ? 'bg-slate-50/40' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${isCurrentDay ? 'text-blue-600 font-extrabold' : isWeekend ? 'text-slate-400' : 'text-slate-700'}`}>
                          {dNum} {isCurrentDay && <span className="text-[9px] font-semibold text-blue-600 ml-0.5">(Today)</span>}
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
        </div>
      )}

      {/* ── Day Details & Site Journey Inspection Modal ── */}
      {inspectModalOpen && editingRecord && inspectStaff && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setInspectModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-slate-800 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-800">
                    Attendance Record — {editingRecord.date}
                  </h3>
                  {isEditingCurrentDay ? (
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
                <p className="text-xs text-slate-500 mt-0.5">{inspectStaff.full_name} ({inspectStaff.department_name})</p>
              </div>
              <button onClick={() => setInspectModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Lock Info Banner when not today */}
            {!isEditingCurrentDay && (
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
                    value={editingRecord.status}
                    disabled={!isEditingCurrentDay}
                    onChange={e => updateCurrentModalRecord({ status: e.target.value as AttendanceStatus })}
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
                    value={editingRecord.workMode || 'office'}
                    disabled={!isEditingCurrentDay}
                    onChange={e => updateCurrentModalRecord({ workMode: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    <option value="office">Office Branch</option>
                    <option value="field">Field / Multi-Site Visits</option>
                    <option value="remote">Remote Work</option>
                  </select>
                </div>
              </div>

              {/* Multi-Site Journey Stops */}
              {editingRecord.siteVisits && editingRecord.siteVisits.length > 0 && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span>Audited Site Journey ({editingRecord.siteVisits.length} Stops)</span>
                    </span>
                  </div>

                  <div className="space-y-2">
                    {editingRecord.siteVisits.map((visit, vIdx) => {
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

              {editingRecord.matchedLocationName && editingRecord.workMode === 'office' && (
                <div className="text-xs text-blue-700 bg-blue-50 p-2.5 rounded-lg border border-blue-100 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/></svg>
                  <span>Clocked in at <strong>{editingRecord.matchedLocationName}</strong></span>
                  {editingRecord.distanceMeters !== undefined && <span>({formatDistance(editingRecord.distanceMeters)})</span>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Clock In Time</label>
                  <input
                    type="time"
                    disabled={!isEditingCurrentDay}
                    value={editingRecord.clockInTime || ''}
                    onChange={e => updateCurrentModalRecord({ clockInTime: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Clock Out Time</label>
                  <input
                    type="time"
                    disabled={!isEditingCurrentDay}
                    value={editingRecord.clockOutTime || ''}
                    onChange={e => updateCurrentModalRecord({ clockOutTime: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center gap-2 pt-2 ${isEditingCurrentDay ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <input
                    type="checkbox"
                    disabled={!isEditingCurrentDay}
                    checked={editingRecord.isLate || false}
                    onChange={e => updateCurrentModalRecord({ isLate: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  />
                  <span className="text-xs font-semibold text-slate-700">Mark as Late</span>
                </label>

                {editingRecord.isLate && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Minutes Late</label>
                    <input
                      type="number"
                      min="0"
                      disabled={!isEditingCurrentDay}
                      value={editingRecord.lateMinutes || 0}
                      onChange={e => updateCurrentModalRecord({ lateMinutes: parseInt(e.target.value, 10) || 0 })}
                      className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 focus:outline-none focus:border-blue-400 font-mono disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <label className={`flex items-center gap-2 ${isEditingCurrentDay ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <input
                    type="checkbox"
                    disabled={!isEditingCurrentDay}
                    checked={editingRecord.onSite || false}
                    onChange={e => updateCurrentModalRecord({ onSite: e.target.checked })}
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
                    disabled={!isEditingCurrentDay}
                    value={editingRecord.overtimeHours || 0}
                    onChange={e => updateCurrentModalRecord({ overtimeHours: parseFloat(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 text-xs rounded border border-slate-200 font-mono text-center disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setInspectModalOpen(false)}
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
