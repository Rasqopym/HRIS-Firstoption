import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { logAction } from '../../lib/auditLog'
import type { LeaveRequest, LeaveType } from '../../types'

type Tab = 'requests' | 'balances' | 'calendar' | 'config'
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

const statusColors: Record<LeaveRequest['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

interface StaffMember {
  id: string
  staff_code: string
  full_name: string
  photo_url: string
  job_title: string
  department_name: string
  gross_salary: number
  date_employed?: string
  salary_template?: string
  job_grade?: string
}

export default function LeaveManagement() {
  const [tab, setTab] = useState<Tab>('requests')
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [noteModal, setNoteModal] = useState<{ id: string; action: 'approved' | 'rejected' } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [types, setTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)

  // Leave Type Config Modals
  const [addTypeModal, setAddTypeModal] = useState(false)
  const [newType, setNewType] = useState({ name: '', entitlementDays: 21, paid: true, requiresDocument: false })
  const [deleteTypeModal, setDeleteTypeModal] = useState<{ id: string; name: string } | null>(null)
  const [deleteStrategy, setDeleteStrategy] = useState<'cascade' | 'reassign'>('cascade')
  const [reassignTargetId, setReassignTargetId] = useState<string>('')
  const [isDeletingType, setIsDeletingType] = useState(false)
  const [deleteTypeError, setDeleteTypeError] = useState('')

  // ── Historical Leave Onboarding State ──
  const [recordPastLeaveModalOpen, setRecordPastLeaveModalOpen] = useState(false)
  const [pastStaffId, setPastStaffId] = useState<string>('')
  const [pastLeaveTypeId, setPastLeaveTypeId] = useState<string>('')
  const [pastStartDate, setPastStartDate] = useState<string>('')
  const [pastEndDate, setPastEndDate] = useState<string>('')
  const [pastReason, setPastReason] = useState<string>('Pre-system historical leave taken in 2026 prior to HRIS launch')
  const [pastBackfillAttendance, setPastBackfillAttendance] = useState<boolean>(true)
  const [isSavingPastLeave, setIsSavingPastLeave] = useState<boolean>(false)
  const [pastLeaveError, setPastLeaveError] = useState<string>('')
  const [pastLeaveSuccessToast, setPastLeaveSuccessToast] = useState<string>('')

  // Filter State for Staff Balances Tab
  const [balancesSearch, setBalancesSearch] = useState<string>('')
  const [balancesDeptFilter, setBalancesDeptFilter] = useState<string>('all')
  const [balancesCadreFilter, setBalancesCadreFilter] = useState<'all' | 'senior' | 'junior'>('all')

  const currentYear = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]
  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const currentMonth = new Date().getMonth()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const currentMonthLabel = `${monthNames[currentMonth]} ${currentYear}`
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

  const seniorLeaveType = types.find(t => t.name.toLowerCase().includes('senior') && t.name.toLowerCase().includes('annual'))
  const juniorLeaveType = types.find(t => t.name.toLowerCase().includes('junior') && t.name.toLowerCase().includes('annual'))
  const seniorEntitlement = seniorLeaveType ? seniorLeaveType.entitlementDays : 21
  const juniorEntitlement = juniorLeaveType ? juniorLeaveType.entitlementDays : 12

  // Cadre Helper
  const isSeniorStaff = (st: StaffMember) => {
    const salaryTemplate = typeof window !== 'undefined'
      ? localStorage.getItem(`hris_staff_salary_template_${st.id}`) ||
        localStorage.getItem(`hris_staff_salary_template_${st.staff_code}`) ||
        st.salary_template || ''
      : st.salary_template || ''

    const jobGrade = st.job_grade || (typeof window !== 'undefined'
      ? localStorage.getItem(`hris_staff_job_grade_${st.id}`) || ''
      : '')

    return Boolean(
      /(senior|executive|management|lead|director)/i.test(salaryTemplate) ||
      /(grade\s*(7|8|9|10|11|12|[7-9]\d*)|senior|executive)/i.test(jobGrade) ||
      Number(st.gross_salary || 0) >= 200000 ||
      /(director|manager|lead|senior|head|executive|principal|chief|supervisor|partner|officer)/i.test(st.job_title || '')
    )
  }

  // Count Weekdays (Mon-Fri) between two date strings
  const countWorkingDays = (startStr: string, endStr: string) => {
    if (!startStr || !endStr || startStr > endStr) return 0
    let count = 0
    const cur = new Date(startStr)
    const end = new Date(endStr)
    while (cur <= end) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6) {
        count++
      }
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }

  const handleDecide = async (id: string, status: 'approved' | 'rejected') => {
    const request = requests.find(r => r.id === id)
    if (!request) return

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error('Failed to get current user:', userError)
      return
    }

    const { error } = await supabase
      .from('leave_requests')
      .update({
        status,
        approved_by: user.id,
        note: noteText || null,
      })
      .eq('id', id)

    if (error) {
      console.error('Failed to update leave request:', error)
      alert('Failed to update leave request. Please try again.')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const approverName = profile?.full_name || 'Unknown'

    setRequests(prev => prev.map(r => r.id === id ? { ...r, status, approvedBy: approverName, note: noteText || undefined } : r))
    setNoteModal(null)
    setNoteText('')

    await logAction({
      action: 'UPDATE',
      entity: 'LeaveRequest',
      entityId: id,
      details: `${status === 'approved' ? 'Approved' : 'Rejected'} ${request.type} request for ${request.staffName} (${request.days} days)`,
      severity: 'medium'
    })
  }

  // Initial Data Fetch
  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Fetch Staff Roster
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, staff_code, full_name, photo_url, job_title, gross_salary, date_employed, departments(name)')
        .eq('status', 'active')
        .order('full_name')

      let mappedStaff: StaffMember[] = []
      if (staffData) {
        mappedStaff = staffData.map((s: any) => ({
          id: s.id,
          staff_code: s.staff_code || '',
          full_name: s.full_name || 'Staff Member',
          photo_url: s.photo_url || '',
          job_title: s.job_title || 'Employee',
          department_name: s.departments?.name || 'General',
          gross_salary: Number(s.gross_salary || 0),
          date_employed: s.date_employed,
        }))
        setStaffList(mappedStaff)
      }

      // 2. Fetch leave_requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('leave_requests')
        .select(`
          id,
          staff_id,
          leave_type_id,
          start_date,
          end_date,
          reason,
          status,
          created_at,
          approved_by,
          note,
          staff!inner (
            full_name,
            photo_url,
            departments (name)
          ),
          leave_types (name)
        `)
        .order('created_at', { ascending: false })

      if (requestsError) {
        console.error('Failed to fetch leave requests:', requestsError)
      } else if (requestsData) {
        const mappedRequests: LeaveRequest[] = await Promise.all(requestsData.map(async (r: any) => {
          const startDate = r.start_date
          const endDate = r.end_date
          const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1

          let approvedBy = undefined
          if (r.approved_by) {
            const { data: approverProfile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', r.approved_by)
              .single()
            approvedBy = approverProfile?.full_name
          }

          return {
            id: r.id,
            staffId: r.staff_id,
            staffName: r.staff?.full_name || 'Staff Member',
            staffPhoto: r.staff?.photo_url || '',
            department: r.staff?.departments?.name || r.staff?.department || 'General',
            type: r.leave_types?.name || 'Annual Leave',
            startDate,
            endDate,
            days,
            reason: r.reason || '',
            status: r.status,
            submittedAt: r.created_at,
            approvedBy,
            note: r.note,
            leaveTypeId: r.leave_type_id,
          }
        }))

        // Merge LocalStorage cached leave requests
        let cachedReqs: LeaveRequest[] = []
        try {
          const keysToTry = ['hris_all_leave_requests', 'hris_self_leave_requests_FO-0002']
          for (const k of keysToTry) {
            const raw = localStorage.getItem(k)
            if (raw) {
              try {
                cachedReqs = [...cachedReqs, ...JSON.parse(raw)]
              } catch (e) {}
            }
          }
        } catch (e) {}

        const seenIds = new Set<string>()
        const merged: LeaveRequest[] = []
        for (const r of [...cachedReqs, ...mappedRequests]) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id)
            merged.push(r)
          }
        }
        setRequests(merged)
      }

      // 3. Fetch leave_types
      const { data: typesData, error: typesError } = await supabase
        .from('leave_types')
        .select('id, name, annual_entitlement_days, is_paid, requires_document')

      if (typesError) {
        console.error('Failed to fetch leave types:', typesError)
      } else if (typesData) {
        let cachedTypesConfig: Record<string, boolean> = {}
        try {
          const rawCache = localStorage.getItem('hris_leave_types_config')
          if (rawCache) {
            const parsed = JSON.parse(rawCache)
            parsed.forEach((lt: any) => {
              cachedTypesConfig[lt.name.toLowerCase()] = lt.attractsLeaveAllowance
            })
          }
        } catch (e) {}

        let mappedTypes: LeaveType[] = typesData.map((t: any) => {
          const nameLower = t.name.toLowerCase()
          const attracts = cachedTypesConfig[nameLower] !== undefined
            ? cachedTypesConfig[nameLower]
            : (nameLower.includes('annual') && !nameLower.includes('unpaid'))
          return {
            id: t.id,
            name: t.name,
            entitlementDays: t.annual_entitlement_days,
            paid: t.is_paid,
            requiresDocument: t.requires_document,
            attractsLeaveAllowance: attracts,
          }
        })

        const hasSeniorAnnual = mappedTypes.some(t => t.name.toLowerCase().includes('senior') && t.name.toLowerCase().includes('annual'))
        const hasJuniorAnnual = mappedTypes.some(t => t.name.toLowerCase().includes('junior') && t.name.toLowerCase().includes('annual'))
        const hasGenericAnnual = mappedTypes.some(t => t.name.toLowerCase() === 'annual leave')

        if (!hasSeniorAnnual && hasGenericAnnual) {
          mappedTypes = mappedTypes.map(t => {
            if (t.name.toLowerCase() === 'annual leave') {
              return { ...t, name: 'Annual Leave (Senior Staff)', entitlementDays: 21, attractsLeaveAllowance: true }
            }
            return t
          })
          mappedTypes.push({
            id: 'type-annual-junior',
            name: 'Annual Leave (Junior Staff)',
            entitlementDays: 12,
            paid: true,
            requiresDocument: false,
            attractsLeaveAllowance: true,
          })
        } else if (!hasSeniorAnnual && !hasJuniorAnnual && !hasGenericAnnual) {
          mappedTypes.unshift(
            { id: 'type-annual-senior', name: 'Annual Leave (Senior Staff)', entitlementDays: 21, paid: true, requiresDocument: false, attractsLeaveAllowance: true },
            { id: 'type-annual-junior', name: 'Annual Leave (Junior Staff)', entitlementDays: 12, paid: true, requiresDocument: false, attractsLeaveAllowance: true }
          )
        }

        const hasAwol = mappedTypes.some(t => t.name.toLowerCase().includes('awol') || t.name.toLowerCase().includes('absence without'))
        if (!hasAwol) {
          mappedTypes.push({
            id: 'type-awol-unpaid',
            name: 'AWOL (Absence Without Official Leave)',
            entitlementDays: 0,
            paid: false,
            requiresDocument: false,
            attractsLeaveAllowance: false,
          })
        }

        setTypes(mappedTypes)
      }
    } catch (e) {
      console.error('Error fetching leave management data:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // ── Compute Per-Staff Balances for 2026 ──
  interface StaffBalanceSummary {
    staff: StaffMember
    isSenior: boolean
    annualEntitlement: number
    annualUsed: number
    otherUsed: number
    remainingAnnual: number
    totalTaken: number
    recentApprovedRequests: LeaveRequest[]
  }

  const staffBalances: StaffBalanceSummary[] = useMemo(() => {
    return staffList.map(st => {
      const isSenior = isSeniorStaff(st)
      const annualEntitlement = isSenior ? seniorEntitlement : juniorEntitlement

      // Approved leaves in 2026 for this staff
      const staffApprovedLeaves = requests.filter(r => {
        if (r.status !== 'approved') return false
        if (r.staffId !== st.id) return false
        // Check if falls in 2026
        return (
          r.startDate.startsWith(String(currentYear)) ||
          r.endDate.startsWith(String(currentYear))
        )
      })

      let annualUsed = 0
      let otherUsed = 0

      staffApprovedLeaves.forEach(r => {
        const typeLower = (r.type || '').toLowerCase()
        const isAnnual = typeLower.includes('annual')
        if (isAnnual) {
          annualUsed += (r.days || 0)
        } else {
          otherUsed += (r.days || 0)
        }
      })

      const remainingAnnual = Math.max(0, annualEntitlement - annualUsed)

      return {
        staff: st,
        isSenior,
        annualEntitlement,
        annualUsed,
        otherUsed,
        remainingAnnual,
        totalTaken: annualUsed + otherUsed,
        recentApprovedRequests: staffApprovedLeaves,
      }
    })
  }, [staffList, requests, seniorEntitlement, juniorEntitlement, currentYear])

  // Filtered staff balances for Balances Tab
  const filteredBalances = useMemo(() => {
    return staffBalances.filter(item => {
      // Cadre filter
      if (balancesCadreFilter === 'senior' && !item.isSenior) return false
      if (balancesCadreFilter === 'junior' && item.isSenior) return false

      // Department filter
      if (balancesDeptFilter !== 'all' && item.staff.department_name !== balancesDeptFilter) return false

      // Search filter
      if (balancesSearch.trim()) {
        const q = balancesSearch.toLowerCase().trim()
        const matchName = item.staff.full_name.toLowerCase().includes(q)
        const matchCode = (item.staff.staff_code || '').toLowerCase().includes(q)
        const matchDept = (item.staff.department_name || '').toLowerCase().includes(q)
        const matchTitle = (item.staff.job_title || '').toLowerCase().includes(q)
        if (!matchName && !matchCode && !matchDept && !matchTitle) return false
      }

      return true
    })
  }, [staffBalances, balancesCadreFilter, balancesDeptFilter, balancesSearch])

  // Historical Leaves list (Approved requests in 2026 with "Historical" or onboarding marker)
  const historicalRequests = useMemo(() => {
    return requests.filter(r => {
      if (r.status !== 'approved') return false
      const isHistoricalNote = (r.note || '').toLowerCase().includes('historical') ||
        (r.reason || '').toLowerCase().includes('historical') ||
        (r.reason || '').toLowerCase().includes('pre-system') ||
        (r.note || '').toLowerCase().includes('pre-system')
      return isHistoricalNote || r.startDate.startsWith(String(currentYear))
    })
  }, [requests, currentYear])

  // Unique departments for filter
  const departments = useMemo(() => {
    const set = new Set<string>()
    staffList.forEach(s => {
      if (s.department_name) set.add(s.department_name)
    })
    return Array.from(set).sort()
  }, [staffList])

  // Open modal with pre-selected staff member
  const openRecordPastLeaveModal = (staffId?: string) => {
    setPastStaffId(staffId || (staffList.length > 0 ? staffList[0].id : ''))
    // Default to Annual Leave for the staff cadre
    const defaultType = types.find(t => t.name.toLowerCase().includes('annual')) || types[0]
    setPastLeaveTypeId(defaultType?.id || '')
    // Default start/end dates earlier in 2026
    setPastStartDate(`${currentYear}-02-02`)
    setPastEndDate(`${currentYear}-02-06`)
    setPastReason('Pre-system historical leave taken in 2026 prior to HRIS launch')
    setPastBackfillAttendance(true)
    setPastLeaveError('')
    setRecordPastLeaveModalOpen(true)
  }

  // ── Handler: Save Past / Historical Leave Entry ──
  const handleSavePastLeave = async () => {
    if (!pastStaffId) {
      setPastLeaveError('Please select a staff member.')
      return
    }
    if (!pastLeaveTypeId) {
      setPastLeaveError('Please select a leave category.')
      return
    }
    if (!pastStartDate || !pastEndDate) {
      setPastLeaveError('Please provide both Start Date and End Date.')
      return
    }
    if (pastStartDate > pastEndDate) {
      setPastLeaveError('Start Date cannot be after End Date.')
      return
    }

    const targetStaff = staffList.find(s => s.id === pastStaffId)
    const targetType = types.find(t => t.id === pastLeaveTypeId)
    if (!targetStaff || !targetType) {
      setPastLeaveError('Invalid staff member or leave type selected.')
      return
    }

    setIsSavingPastLeave(true)
    setPastLeaveError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const approverId = user?.id || null

      const daysCount = Math.ceil((new Date(pastEndDate).getTime() - new Date(pastStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      const workingDaysCount = countWorkingDays(pastStartDate, pastEndDate)

      // 1. Insert into leave_requests
      const newLeaveRecord = {
        staff_id: targetStaff.id,
        leave_type_id: targetType.id,
        start_date: pastStartDate,
        end_date: pastEndDate,
        reason: pastReason.trim() || 'Pre-system historical leave taken in 2026 prior to HRIS launch',
        status: 'approved',
        approved_by: approverId,
        note: 'Historical leave onboarding record',
        created_at: new Date(pastStartDate).toISOString(),
      }

      let insertedId = `hist-leave-${Date.now()}`
      try {
        const { data: inserted, error: insertError } = await supabase
          .from('leave_requests')
          .insert(newLeaveRecord)
          .select('id')
          .single()

        if (insertError) {
          console.warn('Supabase leave_requests insert error:', insertError)
        } else if (inserted) {
          insertedId = inserted.id
        }
      } catch (e) {
        console.warn('Supabase leave_requests insert skipped:', e)
      }

      // 2. If backfill attendance is checked, mark weekdays as 'on_leave' in attendance_records
      if (pastBackfillAttendance) {
        const weekdays: string[] = []
        const cur = new Date(pastStartDate)
        const end = new Date(pastEndDate)
        while (cur <= end) {
          const dow = cur.getDay()
          if (dow !== 0 && dow !== 6) {
            weekdays.push(cur.toISOString().split('T')[0])
          }
          cur.setDate(cur.getDate() + 1)
        }

        const attendanceUpserts = weekdays.map(dStr => ({
          staff_id: targetStaff.id,
          attendance_date: dStr,
          status: 'on_leave',
          field_notes: `On Leave: ${targetType.name} (Historical Record)`,
        }))

        if (attendanceUpserts.length > 0) {
          try {
            await supabase
              .from('attendance_records')
              .upsert(attendanceUpserts, { onConflict: 'staff_id,attendance_date' })
          } catch (e) {
            console.warn('Attendance backfill upsert skipped:', e)
          }

          // Cache update for local storage
          try {
            const candidateIds = [targetStaff.id, targetStaff.staff_code].filter(Boolean)
            candidateIds.forEach(cid => {
              const cacheKey = `hris_attendance_daily_${cid}`
              const existing = JSON.parse(localStorage.getItem(cacheKey) || '{}')
              attendanceUpserts.forEach(rec => {
                existing[rec.attendance_date] = rec
              })
              localStorage.setItem(cacheKey, JSON.stringify(existing))
            })
          } catch (e) {}
        }
      }

      // 3. Update local state
      const createdRequest: LeaveRequest = {
        id: insertedId,
        staffId: targetStaff.id,
        staffName: targetStaff.full_name,
        staffPhoto: targetStaff.photo_url,
        department: targetStaff.department_name,
        type: targetType.name,
        startDate: pastStartDate,
        endDate: pastEndDate,
        days: daysCount,
        reason: pastReason,
        status: 'approved',
        submittedAt: new Date(pastStartDate).toISOString(),
        approvedBy: 'HR Manager',
        note: 'Historical leave onboarding record',
        leaveTypeId: targetType.id,
      }

      setRequests(prev => [createdRequest, ...prev])

      // 4. Update LocalStorage cache and dispatch event
      try {
        const cacheRaw = localStorage.getItem('hris_all_leave_requests')
        const currentCached = cacheRaw ? JSON.parse(cacheRaw) : []
        localStorage.setItem('hris_all_leave_requests', JSON.stringify([createdRequest, ...currentCached]))
        window.dispatchEvent(new Event('storage'))
      } catch (e) {}

      // 5. Audit Log
      await logAction({
        action: 'CREATE',
        entity: 'LeaveRequest',
        entityId: insertedId,
        details: `Recorded historical past leave for ${targetStaff.full_name} (${daysCount} days, ${targetType.name}, ${pastStartDate} to ${pastEndDate})`,
        severity: 'medium',
      })

      setRecordPastLeaveModalOpen(false)
      setPastLeaveSuccessToast(`✓ Successfully logged ${daysCount} days (${workingDaysCount} working days) past leave for ${targetStaff.full_name}!`)
      setTimeout(() => setPastLeaveSuccessToast(''), 5000)
    } catch (err: any) {
      console.error('Error saving past leave:', err)
      setPastLeaveError(err?.message || 'Failed to save historical leave record.')
    } finally {
      setIsSavingPastLeave(false)
    }
  }

  // ── Handler: Delete Historical Leave Entry ──
  const handleDeleteHistoricalLeave = async (requestId: string) => {
    const req = requests.find(r => r.id === requestId)
    if (!req) return

    const confirmMsg = `Are you sure you want to delete this historical leave entry for ${req.staffName} (${req.days} days, ${req.startDate} to ${req.endDate})? This will immediately restore their leave balance.`
    if (!window.confirm(confirmMsg)) return

    try {
      // 1. Delete from leave_requests
      await supabase.from('leave_requests').delete().eq('id', requestId)

      // 2. Update local state
      setRequests(prev => prev.filter(r => r.id !== requestId))

      // 3. Update localStorage
      try {
        const cacheRaw = localStorage.getItem('hris_all_leave_requests')
        if (cacheRaw) {
          const parsed = JSON.parse(cacheRaw)
          localStorage.setItem('hris_all_leave_requests', JSON.stringify(parsed.filter((r: any) => r.id !== requestId)))
        }
        window.dispatchEvent(new Event('storage'))
      } catch (e) {}

      await logAction({
        action: 'DELETE',
        entity: 'LeaveRequest',
        entityId: requestId,
        details: `Deleted historical leave record for ${req.staffName} (${req.days} days)`,
        severity: 'medium',
      })
    } catch (e) {
      console.error('Failed to delete historical leave:', e)
    }
  }

  const filtered = requests.filter(r => statusFilter === 'all' || r.status === statusFilter)
  const onLeaveToday = requests.filter(r => r.status === 'approved' && r.startDate <= today && r.endDate >= today)

  // Approved leave for current month
  const approvedLeaveThisMonth = requests.filter(r => {
    if (r.status !== 'approved') return false
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(daysInCurrentMonth).padStart(2, '0')}`
    return r.startDate <= monthEnd && r.endDate >= monthStart
  })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'requests', label: `Leave Requests (${requests.filter(r => r.status === 'pending').length} pending)` },
    { id: 'balances', label: 'Staff Balances & Past Leave' },
    { id: 'calendar', label: 'Who\'s on Leave' },
    { id: 'config', label: 'Leave Type Config' },
  ]

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-slate-500 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin text-blue-600">
            <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          <span>Loading leave management...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 anim-fade-up space-y-5">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-slate-800 text-xl sm:text-2xl">Leave Management</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {requests.filter(r => r.status === 'pending').length} pending approval{requests.filter(r => r.status === 'pending').length === 1 ? '' : 's'} · {staffList.length} active staff leave accounts
          </p>
        </div>

        {/* Global Action: Record Past Leave Button */}
        <button
          onClick={() => openRecordPastLeaveModal()}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-2xs transition-colors self-start sm:self-auto"
          title="Onboard leave taken by staff earlier this year"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>Record Past / Historical Leave</span>
        </button>
      </div>

      {/* Success Notification Banner */}
      {pastLeaveSuccessToast && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-800 flex items-center justify-between shadow-2xs anim-fade-up">
          <div className="flex items-center gap-2.5 font-medium">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 flex-shrink-0">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>{pastLeaveSuccessToast}</span>
          </div>
          <button onClick={() => setPastLeaveSuccessToast('')} className="text-emerald-600 hover:text-emerald-800 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: LEAVE REQUESTS (PENDING, APPROVED, REJECTED)
          ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all border ${
                  statusFilter === s
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                }`}
              >
                {s}
                {s !== 'all' && <span className="ml-1 opacity-80">({requests.filter(r => r.status === s).length})</span>}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs py-12 text-center">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    </svg>
                  </div>
                </div>
                <div className="font-semibold text-slate-700 text-sm">No {statusFilter !== 'all' ? statusFilter : ''} requests found</div>
                <p className="text-xs text-slate-400 mt-1">Staff leave applications submitted through the self-service portal will appear here.</p>
              </div>
            ) : (
              filtered.map(r => (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 hover:border-slate-300 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {r.staffPhoto ? (
                        <img src={r.staffPhoto} alt={r.staffName} className="w-10 h-10 rounded-xl object-cover border border-slate-200 flex-none" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-none text-xs">
                          {r.staffName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-slate-800 text-sm sm:text-base">{r.staffName}</div>
                        <div className="text-xs text-slate-500">{r.department}</div>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${statusColors[r.status]}`}>
                      {r.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 uppercase">Leave Category</div>
                      <div className="text-xs sm:text-sm font-bold text-slate-700 mt-0.5">{r.type}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 uppercase">Duration</div>
                      <div className="text-xs sm:text-sm font-bold text-slate-700 mt-0.5">{r.days} {r.days === 1 ? 'day' : 'days'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 uppercase">From Date</div>
                      <div className="text-xs sm:text-sm font-bold font-mono text-slate-700 mt-0.5">{r.startDate}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 uppercase">To Date</div>
                      <div className="text-xs sm:text-sm font-bold font-mono text-slate-700 mt-0.5">{r.endDate}</div>
                    </div>
                  </div>

                  <div className="mt-3 p-3 bg-white rounded-xl border border-slate-100 text-xs text-slate-600">
                    <span className="font-bold text-slate-700">Reason: </span>{r.reason}
                  </div>

                  {r.status === 'approved' && (
                    <div className="mt-2.5 text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>Approved {r.approvedBy ? `by ${r.approvedBy}` : ''} {r.note ? `— Note: ${r.note}` : ''}</span>
                    </div>
                  )}

                  {r.status === 'rejected' && r.note && (
                    <div className="mt-2.5 text-xs text-red-600 flex items-center gap-1.5 font-medium">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      <span>Rejected: {r.note}</span>
                    </div>
                  )}

                  {r.status === 'pending' && (
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => setNoteModal({ id: r.id, action: 'approved' })}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition-colors shadow-2xs"
                      >
                        Approve Leave
                      </button>
                      <button
                        onClick={() => setNoteModal({ id: r.id, action: 'rejected' })}
                        className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs sm:text-sm font-bold transition-colors"
                      >
                        Reject
                      </button>
                      <span className="text-[11px] text-slate-400 ml-auto">Submitted {r.submittedAt ? r.submittedAt.slice(0, 10) : ''}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: STAFF LEAVE BALANCES & HISTORICAL LEAVE ONBOARDING
          ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'balances' && (
        <div className="space-y-6">
          {/* Onboarding Callout Banner */}
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-5 shadow-sm border border-blue-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                    2026 HRIS Onboarding & Pre-launch Leave Records
                  </span>
                </div>
                <h3 className="font-display font-bold text-base sm:text-lg">Update Past Leave Taken in 2026</h3>
                <p className="text-xs text-blue-100 max-w-2xl leading-relaxed">
                  Record past leave days taken by staff earlier this year prior to deploying the app. Any past leave logged here automatically debits the staff member's annual leave entitlement, marks past attendance records as "On Leave", and ensures staff self-service shows exact remaining days.
                </p>
              </div>
              <button
                onClick={() => openRecordPastLeaveModal()}
                className="px-4 py-2.5 rounded-xl bg-white text-blue-900 hover:bg-blue-50 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-md flex-shrink-0"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>+ Record Past Leave</span>
              </button>
            </div>
          </div>

          {/* Aggregate KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Active Staff</div>
              <div className="text-2xl font-bold font-mono text-slate-800 mt-1">{staffBalances.length}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Staff on 2026 leave roster</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Annual Leave Taken</div>
              <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
                {staffBalances.reduce((acc, s) => acc + s.annualUsed, 0)} days
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Approved in {currentYear}</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Other Leaves Taken</div>
              <div className="text-2xl font-bold font-mono text-purple-600 mt-1">
                {staffBalances.reduce((acc, s) => acc + s.otherUsed, 0)} days
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Casual, sick, maternity, etc.</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Exhausted Balances</div>
              <div className="text-2xl font-bold font-mono text-rose-600 mt-1">
                {staffBalances.filter(s => s.remainingAnnual === 0).length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">0 annual days remaining</div>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <input
                  type="text"
                  value={balancesSearch}
                  onChange={e => setBalancesSearch(e.target.value)}
                  placeholder="Search staff by name, code, or role..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-2.5 text-slate-400">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Cadre Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setBalancesCadreFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${balancesCadreFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'}`}
                >
                  All Cadres
                </button>
                <button
                  onClick={() => setBalancesCadreFilter('senior')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${balancesCadreFilter === 'senior' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500'}`}
                >
                  Senior ({seniorEntitlement}d)
                </button>
                <button
                  onClick={() => setBalancesCadreFilter('junior')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${balancesCadreFilter === 'junior' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-500'}`}
                >
                  Junior ({juniorEntitlement}d)
                </button>
              </div>

              {/* Department Dropdown */}
              <select
                value={balancesDeptFilter}
                onChange={e => setBalancesDeptFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Departments ({departments.length})</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Staff Leave Balances Table ── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-800 text-sm sm:text-base">
                Staff Leave Balances for Year {currentYear}
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                Showing {filteredBalances.length} staff member{filteredBalances.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Employee</th>
                    <th className="text-left px-3 py-3">Cadre & Policy</th>
                    <th className="text-center px-3 py-3">Entitlement</th>
                    <th className="text-center px-3 py-3">Annual Taken</th>
                    <th className="text-center px-3 py-3">Other Leaves</th>
                    <th className="text-left px-4 py-3 min-w-[160px]">Remaining Balance</th>
                    <th className="text-right px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBalances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        No staff members match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredBalances.map(item => {
                      const percentRemaining = Math.round((item.remainingAnnual / item.annualEntitlement) * 100)
                      return (
                        <tr key={item.staff.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Staff Info */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              {item.staff.photo_url ? (
                                <img src={item.staff.photo_url} alt={item.staff.full_name} className="w-9 h-9 rounded-xl object-cover border border-slate-200 flex-none" />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center flex-none text-xs border border-slate-200">
                                  {item.staff.full_name.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-slate-800">{item.staff.full_name}</div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                  <span className="font-mono text-slate-400">{item.staff.staff_code || 'ID-N/A'}</span>
                                  <span>·</span>
                                  <span>{item.staff.department_name}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Cadre Badge */}
                          <td className="px-3 py-3.5">
                            {item.isSenior ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Senior Cadre
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                Junior Cadre
                              </span>
                            )}
                            <div className="text-[10px] text-slate-400 mt-0.5">{item.staff.job_title}</div>
                          </td>

                          {/* Entitlement Days */}
                          <td className="px-3 py-3.5 text-center font-mono font-bold text-slate-700">
                            {item.annualEntitlement}d
                          </td>

                          {/* Annual Leave Taken */}
                          <td className="px-3 py-3.5 text-center">
                            {item.annualUsed > 0 ? (
                              <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">
                                {item.annualUsed}d
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono">0d</span>
                            )}
                          </td>

                          {/* Other Leaves Taken */}
                          <td className="px-3 py-3.5 text-center">
                            {item.otherUsed > 0 ? (
                              <span className="font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">
                                {item.otherUsed}d
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono">—</span>
                            )}
                          </td>

                          {/* Remaining Balance Bar & Tag */}
                          <td className="px-4 py-3.5">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className={`font-bold font-mono ${
                                  item.remainingAnnual >= 10
                                    ? 'text-emerald-700'
                                    : item.remainingAnnual > 0
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                                }`}>
                                  {item.remainingAnnual} days remaining
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {item.annualUsed}/{item.annualEntitlement}d used
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    item.remainingAnnual >= 10
                                      ? 'bg-emerald-500'
                                      : item.remainingAnnual > 0
                                      ? 'bg-amber-400'
                                      : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${Math.min(100, (item.remainingAnnual / item.annualEntitlement) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Action Button */}
                          <td className="px-4 py-3.5 text-right">
                            <button
                              onClick={() => openRecordPastLeaveModal(item.staff.id)}
                              className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-2xs"
                              title="Record past leave days taken earlier this year"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                              <span>Log Past Leave</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Sub-Section: Logged Historical & Approved 2026 Leaves ── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-slate-800 text-sm sm:text-base">
                  Approved & Historical Leave Records (Year {currentYear})
                </h3>
                <p className="text-xs text-slate-500">
                  Manage or remove erroneously recorded onboarding leave entries
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {historicalRequests.length} total entries
              </span>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">Staff Member</th>
                    <th className="text-left px-3 py-2.5">Leave Type</th>
                    <th className="text-left px-3 py-2.5">Date Span</th>
                    <th className="text-center px-3 py-2.5">Duration</th>
                    <th className="text-left px-4 py-2.5">Reason / Onboarding Note</th>
                    <th className="text-right px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historicalRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-slate-400">
                        No approved or historical leave entries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    historicalRequests.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {r.staffName}
                          <span className="block text-[10px] text-slate-400 font-normal">{r.department}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-semibold text-slate-700">{r.type}</span>
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-600">
                          {r.startDate} <span className="text-slate-400">→</span> {r.endDate}
                        </td>
                        <td className="px-3 py-3 text-center font-bold font-mono text-slate-800">
                          {r.days}d
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={r.reason || r.note || ''}>
                          {r.reason || r.note || 'Historical leave onboarding'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteHistoricalLeave(r.id)}
                            className="p-1 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                            title="Delete this historical entry (restores staff balance)"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 3: WHO'S ON LEAVE (CALENDAR & TODAY'S OVERVIEW)
          ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'calendar' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5">
            <h3 className="font-display font-bold text-slate-800 text-base mb-3">
              Currently on Leave (Today: {todayFormatted})
            </h3>
            {onLeaveToday.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">No staff on leave today</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {onLeaveToday.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80">
                    {r.staffPhoto ? (
                      <img src={r.staffPhoto} alt={r.staffName} className="w-10 h-10 rounded-xl object-cover border border-amber-200 flex-none" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-900 font-bold flex items-center justify-center flex-none text-xs">
                        {r.staffName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-slate-800 truncate">{r.staffName}</div>
                      <div className="text-[11px] text-amber-900 font-medium">{r.type} · Until {r.endDate}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5">
            <h3 className="font-display font-bold text-slate-800 text-base mb-4">{currentMonthLabel} — Approved Leave Overview</h3>
            <div className="space-y-2.5">
              {approvedLeaveThisMonth.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">No approved leaves scheduled for this month.</div>
              ) : (
                approvedLeaveThisMonth.map(r => {
                  const startDate = new Date(r.startDate)
                  const endDate = new Date(r.endDate)
                  const monthStart = new Date(currentYear, currentMonth, 1)
                  const monthEnd = new Date(currentYear, currentMonth, daysInCurrentMonth)

                  const visibleStart = startDate < monthStart ? monthStart : startDate
                  const visibleEnd = endDate > monthEnd ? monthEnd : endDate

                  const startDay = visibleStart.getDate()
                  const endDay = visibleEnd.getDate()
                  const marginLeft = ((startDay - 1) / daysInCurrentMonth) * 100
                  const width = ((endDay - startDay + 1) / daysInCurrentMonth) * 100

                  return (
                    <div key={r.id} className="flex items-center gap-3">
                      {r.staffPhoto ? (
                        <img src={r.staffPhoto} alt={r.staffName} className="w-7 h-7 rounded-lg object-cover flex-none" />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px] flex-none">
                          {r.staffName.slice(0, 2)}
                        </div>
                      )}
                      <div className="text-xs font-semibold text-slate-700 w-36 truncate">{r.staffName}</div>
                      <div className="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden">
                        <div
                          className="h-6 rounded-full bg-amber-300 flex items-center px-2"
                          style={{
                            marginLeft: `${marginLeft}%`,
                            width: `${Math.max(4, width)}%`,
                          }}
                        >
                          <span className="text-[11px] text-amber-950 font-bold whitespace-nowrap">{r.type.split(' ')[0]}</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono w-20 text-right">{r.startDate.slice(5)}–{r.endDate.slice(5)}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 4: LEAVE TYPE CONFIGURATION
          ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'config' && (
        <div className="space-y-4 max-w-4xl">
          {/* Policy Overview Callout */}
          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/80 text-xs text-slate-700 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-blue-900 text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span>Annual Leave Cadres, Bonus Rules & AWOL Disciplinary Handling</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-2.5 rounded-lg bg-white border border-blue-100 shadow-2xs">
                <strong className="block text-slate-800 font-semibold mb-1 text-xs">Cadre Entitlements:</strong>
                <span className="text-slate-600 leading-relaxed text-[11.5px]">
                  <strong>Senior Staff:</strong> {seniorEntitlement} days annual leave entitlement.<br />
                  <strong>Junior Staff:</strong> {juniorEntitlement} days annual leave entitlement.
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-blue-100 shadow-2xs">
                <strong className="block text-slate-800 font-semibold mb-1 text-xs">Annual Leave Bonus:</strong>
                <span className="text-slate-600 leading-relaxed text-[11.5px]">
                  Bonus is <strong>100% of 1 Month Basic Salary</strong>. Strictly payable to <strong>confirmed</strong> staff with at least <strong>1 full year of continuous service</strong> upon approved annual leave.
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-blue-100 shadow-2xs">
                <strong className="block text-slate-800 font-semibold mb-1 text-xs">AWOL (Disciplinary):</strong>
                <span className="text-slate-600 leading-relaxed text-[11.5px]">
                  <strong>Hidden from staff self-service</strong>. Exclusively recorded by HR/Management. Processed in payroll as unpaid deductions.
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h3 className="font-display font-semibold text-slate-700">Leave Types Configuration</h3>
              <button onClick={() => setAddTypeModal(true)} className="text-xs text-blue-600 hover:underline">Add Type</button>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-50">
                <tr>
                  {['Leave Type', 'Entitlement (days/yr)', 'Paid', 'Attracts Bonus', 'Requires Document', ''].map(h => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {types.map(t => {
                  const nameLower = t.name.toLowerCase()
                  const isAwol = nameLower.includes('awol') || nameLower.includes('absence without')
                  const isSenior = nameLower.includes('senior') && nameLower.includes('annual')
                  const isJunior = nameLower.includes('junior') && nameLower.includes('annual')

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 group transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-800">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{t.name}</span>
                          {isAwol && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                              Administrative / HR Only
                            </span>
                          )}
                          {isSenior && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                              Senior Cadre ({t.entitlementDays}d)
                            </span>
                          )}
                          {isJunior && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                              Junior Cadre ({t.entitlementDays}d)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={t.entitlementDays}
                          onChange={async (e) => {
                            const newValue = Number(e.target.value)
                            const { error } = await supabase
                              .from('leave_types')
                              .update({ annual_entitlement_days: newValue })
                              .eq('id', t.id)
                            if (error) {
                              console.error('Failed to update entitlement days:', error)
                              alert('Failed to update entitlement days')
                              return
                            }
                            setTypes(prev => prev.map(x => x.id === t.id ? { ...x, entitlementDays: newValue } : x))
                            await logAction({
                              action: 'UPDATE',
                              entity: 'LeaveType',
                              details: `Updated ${t.name} entitlement days to ${newValue}`
                            })
                          }}
                          className="w-20 px-2 py-1 text-sm border border-slate-200 rounded font-mono focus:outline-none focus:border-blue-400"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={async () => {
                            const newValue = !t.paid
                            const { error } = await supabase
                              .from('leave_types')
                              .update({ is_paid: newValue })
                              .eq('id', t.id)
                            if (error) {
                              console.error('Failed to update paid status:', error)
                              alert('Failed to update paid status')
                              return
                            }
                            setTypes(prev => prev.map(x => x.id === t.id ? { ...x, paid: newValue } : x))
                            await logAction({
                              action: 'UPDATE',
                              entity: 'LeaveType',
                              details: `Updated ${t.name} paid status to ${newValue ? 'Paid' : 'Unpaid'}`
                            })
                          }}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${t.paid ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {t.paid ? 'Paid' : 'Unpaid'}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={async () => {
                            const newValue = !t.attractsLeaveAllowance
                            const updated = types.map(x => x.id === t.id ? { ...x, attractsLeaveAllowance: newValue } : x)
                            setTypes(updated)
                            try {
                              localStorage.setItem('hris_leave_types_config', JSON.stringify(updated))
                            } catch (e) {}
                            await logAction({
                              action: 'UPDATE',
                              entity: 'LeaveType',
                              details: `Updated ${t.name} attracts leave allowance bonus to ${newValue ? 'Yes' : 'No'}`
                            })
                          }}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors inline-flex items-center gap-1 ${t.attractsLeaveAllowance ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {t.attractsLeaveAllowance ? 'Bonus Pay' : 'No Bonus'}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={async () => {
                            const newValue = !t.requiresDocument
                            const { error } = await supabase
                              .from('leave_types')
                              .update({ requires_document: newValue })
                              .eq('id', t.id)
                            if (error) {
                              console.error('Failed to update requires document:', error)
                              alert('Failed to update requires document')
                              return
                            }
                            setTypes(prev => prev.map(x => x.id === t.id ? { ...x, requiresDocument: newValue } : x))
                            await logAction({
                              action: 'UPDATE',
                              entity: 'LeaveType',
                              details: `Updated ${t.name} requires document to ${newValue ? 'Required' : 'Optional'}`
                            })
                          }}
                          className={`text-xs cursor-pointer hover:underline inline-flex items-center gap-1 ${t.requiresDocument ? 'text-slate-600 font-medium' : 'text-slate-400'}`}
                        >
                          {t.requiresDocument ? 'Required' : 'Optional'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setDeleteTypeModal({ id: t.id, name: t.name })
                            setDeleteStrategy('cascade')
                            setDeleteTypeError('')
                            const other = types.find(x => x.id !== t.id)
                            setReassignTargetId(other ? other.id : '')
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-red-500 transition-all cursor-pointer"
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: RECORD PAST / HISTORICAL LEAVE (HR ONBOARDING)
          ═══════════════════════════════════════════════════════════════════ */}
      {recordPastLeaveModalOpen && (() => {
        const selectedStaffObj = staffList.find(s => s.id === pastStaffId)
        const isSenior = selectedStaffObj ? isSeniorStaff(selectedStaffObj) : false
        const entitlement = isSenior ? seniorEntitlement : juniorEntitlement
        const calendarDays = pastStartDate && pastEndDate ? Math.max(0, Math.ceil((new Date(pastEndDate).getTime() - new Date(pastStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1) : 0
        const workingDays = countWorkingDays(pastStartDate, pastEndDate)

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden anim-scale-up">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 text-blue-300 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base sm:text-lg">Record Past / Historical Leave</h3>
                    <p className="text-xs text-slate-300">Onboard leave days taken earlier in {currentYear}</p>
                  </div>
                </div>
                <button
                  onClick={() => setRecordPastLeaveModalOpen(false)}
                  disabled={isSavingPastLeave}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* Modal Form */}
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Staff Member Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Select Staff Member *
                  </label>
                  <select
                    value={pastStaffId}
                    onChange={e => setPastStaffId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="">-- Choose Staff Member --</option>
                    {staffList.map(s => {
                      const sen = isSeniorStaff(s)
                      return (
                        <option key={s.id} value={s.id}>
                          {s.staff_code ? `[${s.staff_code}] ` : ''}{s.full_name} — {s.department_name} ({sen ? `Senior · ${seniorEntitlement}d` : `Junior · ${juniorEntitlement}d`})
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* Staff Details Callout */}
                {selectedStaffObj && (
                  <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-blue-950">{selectedStaffObj.full_name}</span>
                      <span className="text-blue-700 block text-[11px]">{selectedStaffObj.job_title} · {selectedStaffObj.department_name}</span>
                    </div>
                    <span className="px-2 py-1 rounded-lg bg-blue-200 text-blue-900 font-bold font-mono text-[11px]">
                      {isSenior ? `Senior Cadre (${seniorEntitlement}d)` : `Junior Cadre (${juniorEntitlement}d)`}
                    </span>
                  </div>
                )}

                {/* Leave Category Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Leave Category *
                  </label>
                  <select
                    value={pastLeaveTypeId}
                    onChange={e => setPastLeaveTypeId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="">-- Choose Leave Category --</option>
                    {types.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.entitlementDays} days/yr {t.paid ? '· Paid' : '· Unpaid'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Span Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={pastStartDate}
                      onChange={e => setPastStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      End Date *
                    </label>
                    <input
                      type="date"
                      value={pastEndDate}
                      onChange={e => setPastEndDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-2 flex items-center justify-between text-xs text-slate-600 pt-1">
                    <span>
                      Duration: <strong>{workingDays} working day{workingDays === 1 ? '' : 's'}</strong> ({calendarDays} calendar days)
                    </span>
                    <span className="text-[11px] text-blue-700 font-semibold">
                      Debits from {currentYear} balance
                    </span>
                  </div>
                </div>

                {/* Reason & Documentation Note */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Reason & Onboarding Remark
                  </label>
                  <textarea
                    rows={2}
                    value={pastReason}
                    onChange={e => setPastReason(e.target.value)}
                    placeholder="e.g., Pre-system historical leave taken in 2026 prior to HRIS launch"
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Options Toggles */}
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={pastBackfillAttendance}
                      onChange={e => setPastBackfillAttendance(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <span>
                      <strong>Backfill attendance records</strong>: Automatically mark weekdays in this period as "On Leave" in attendance rosters.
                    </span>
                  </label>
                </div>

                {/* Error Banner */}
                {pastLeaveError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
                    <span>{pastLeaveError}</span>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setRecordPastLeaveModalOpen(false)}
                  disabled={isSavingPastLeave}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePastLeave}
                  disabled={isSavingPastLeave}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSavingPastLeave ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      <span>Saving Past Leave...</span>
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>Save & Apply Past Leave</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: APPROVE / REJECT NOTE MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 anim-fade-up border border-slate-200">
            <h3 className="font-display font-bold text-slate-800 text-base mb-2 capitalize">{noteModal.action} Leave Request</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note (optional)</label>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
                placeholder={noteModal.action === 'rejected' ? 'Reason for rejection...' : 'Any notes for the staff member...'}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-400 resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setNoteModal(null); setNoteText('') }} className="flex-1 py-2 rounded-xl border text-xs sm:text-sm text-slate-600 hover:bg-slate-50 font-semibold">Cancel</button>
              <button
                onClick={() => handleDecide(noteModal.id, noteModal.action)}
                className={`flex-1 py-2 rounded-xl text-white text-xs sm:text-sm font-bold capitalize transition-colors ${noteModal.action === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                Confirm {noteModal.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: ADD LEAVE TYPE
          ═══════════════════════════════════════════════════════════════════ */}
      {addTypeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 anim-fade-up border border-slate-200">
            <h3 className="font-display font-bold text-slate-800 text-base mb-3">Add Leave Type</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name</label>
                <input
                  type="text"
                  value={newType.name}
                  onChange={e => setNewType({ ...newType, name: e.target.value })}
                  placeholder="e.g., Study Leave"
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Entitlement Days (per year)</label>
                <input
                  type="number"
                  value={newType.entitlementDays}
                  onChange={e => setNewType({ ...newType, entitlementDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-400 font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="paid"
                  checked={newType.paid}
                  onChange={e => setNewType({ ...newType, paid: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="paid" className="text-xs font-semibold text-slate-700">Paid Leave</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requiresDoc"
                  checked={newType.requiresDocument}
                  onChange={e => setNewType({ ...newType, requiresDocument: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="requiresDoc" className="text-xs font-semibold text-slate-700">Requires Document</label>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setAddTypeModal(false); setNewType({ name: '', entitlementDays: 21, paid: true, requiresDocument: false }) }} className="flex-1 py-2 rounded-xl border text-xs sm:text-sm text-slate-600 hover:bg-slate-50 font-semibold">Cancel</button>
              <button
                onClick={async () => {
                  if (!newType.name.trim()) {
                    alert('Please enter a name')
                    return
                  }
                  const { data, error } = await supabase
                    .from('leave_types')
                    .insert({
                      name: newType.name.trim(),
                      annual_entitlement_days: newType.entitlementDays,
                      is_paid: newType.paid,
                      requires_document: newType.requiresDocument,
                    })
                    .select()
                    .single()
                  if (error) {
                    console.error('Failed to add leave type:', error)
                    alert('Failed to add leave type')
                    return
                  }
                  const addedType: LeaveType = {
                    id: data.id,
                    name: data.name,
                    entitlementDays: data.annual_entitlement_days,
                    paid: data.is_paid,
                    requiresDocument: data.requires_document,
                  }
                  setTypes(prev => [...prev, addedType])
                  setAddTypeModal(false)
                  setNewType({ name: '', entitlementDays: 21, paid: true, requiresDocument: false })
                  await logAction({
                    action: 'CREATE',
                    entity: 'LeaveType',
                    details: `Created leave type: ${addedType.name}`
                  })
                }}
                className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-2xs transition-colors"
              >
                Add Type
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: DELETE LEAVE TYPE
          ═══════════════════════════════════════════════════════════════════ */}
      {deleteTypeModal && (() => {
        const attachedRequests = requests.filter(r =>
          r.leaveTypeId === deleteTypeModal.id ||
          r.type?.trim().toLowerCase() === deleteTypeModal.name?.trim().toLowerCase()
        )
        const otherTypes = types.filter(t => t.id !== deleteTypeModal.id)

        const handleConfirmDelete = async () => {
          setIsDeletingType(true)
          setDeleteTypeError('')

          try {
            const targetId = deleteTypeModal.id
            const targetName = deleteTypeModal.name

            if (attachedRequests.length > 0) {
              if (deleteStrategy === 'reassign' && reassignTargetId) {
                const destType = types.find(t => t.id === reassignTargetId)
                await supabase
                  .from('leave_requests')
                  .update({ leave_type_id: reassignTargetId })
                  .eq('leave_type_id', targetId)

                const attachedIds = attachedRequests.map(r => r.id).filter(Boolean)
                if (attachedIds.length > 0) {
                  await supabase
                    .from('leave_requests')
                    .update({ leave_type_id: reassignTargetId })
                    .in('id', attachedIds)
                }

                setRequests(prev => prev.map(r =>
                  (r.leaveTypeId === targetId || r.type?.trim().toLowerCase() === targetName.trim().toLowerCase())
                    ? { ...r, type: destType?.name || r.type, leaveTypeId: reassignTargetId }
                    : r
                ))
              } else {
                const attachedIds = attachedRequests.map(r => r.id).filter(Boolean)
                if (attachedIds.length > 0) {
                  await supabase
                    .from('leave_requests')
                    .delete()
                    .in('id', attachedIds)
                }
                setRequests(prev => prev.filter(r =>
                  r.leaveTypeId !== targetId && r.type?.trim().toLowerCase() !== targetName.trim().toLowerCase()
                ))
              }
            }

            const { error } = await supabase
              .from('leave_types')
              .delete()
              .eq('id', targetId)

            if (error) throw error

            setTypes(prev => prev.filter(t => t.id !== targetId))
            setDeleteTypeModal(null)

            await logAction({
              action: 'DELETE',
              entity: 'LeaveType',
              details: `Deleted leave type ${targetName} (strategy: ${deleteStrategy})`
            })
          } catch (err: any) {
            console.error('Delete leave type error:', err)
            setDeleteTypeError(err.message || 'Failed to delete leave type')
          } finally {
            setIsDeletingType(false)
          }
        }

        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 anim-fade-up border border-slate-100">
              <div className="flex items-start gap-3.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center flex-none">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-slate-800 text-lg">Delete Leave Type</h3>
                  <p className="text-xs text-slate-500">
                    Are you sure you want to delete <strong>"{deleteTypeModal.name}"</strong>?
                  </p>
                </div>
              </div>

              {deleteTypeError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  {deleteTypeError}
                </div>
              )}

              {attachedRequests.length > 0 ? (
                <div className="mb-5 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-amber-900 mb-1.5">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span>{attachedRequests.length} Existing Request{attachedRequests.length === 1 ? '' : 's'} Attached</span>
                  </div>
                  <p className="text-amber-800 text-[11.5px] leading-relaxed mb-3">
                    This leave type has existing staff requests attached to it. Choose how to handle them:
                  </p>

                  <div className="space-y-2.5">
                    <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${deleteStrategy === 'cascade' ? 'bg-white border-red-300 ring-1 ring-red-200' : 'bg-amber-100/40 border-amber-200/80 hover:bg-white'}`}>
                      <input
                        type="radio"
                        name="deleteStrategy"
                        value="cascade"
                        checked={deleteStrategy === 'cascade'}
                        onChange={() => setDeleteStrategy('cascade')}
                        className="mt-0.5 text-red-600 focus:ring-red-500"
                      />
                      <div className="text-slate-800 text-xs">
                        <span className="font-semibold text-red-700 block">Delete Type & Attached Requests</span>
                        <span className="text-slate-500 text-[11px]">Permanently erase "{deleteTypeModal.name}" and remove all {attachedRequests.length} request record(s).</span>
                      </div>
                    </label>

                    {otherTypes.length > 0 && (
                      <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${deleteStrategy === 'reassign' ? 'bg-white border-blue-300 ring-1 ring-blue-200' : 'bg-amber-100/40 border-amber-200/80 hover:bg-white'}`}>
                        <input
                          type="radio"
                          name="deleteStrategy"
                          value="reassign"
                          checked={deleteStrategy === 'reassign'}
                          onChange={() => setDeleteStrategy('reassign')}
                          className="mt-0.5 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1 text-slate-800 text-xs">
                          <span className="font-semibold text-blue-700 block">Reassign Requests & Delete Type</span>
                          <span className="text-slate-500 text-[11px] block mb-2">Move the {attachedRequests.length} request(s) to another leave category:</span>
                          {deleteStrategy === 'reassign' && (
                            <select
                              value={reassignTargetId}
                              onChange={e => setReassignTargetId(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                            >
                              {otherTypes.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                  This action is permanent and cannot be undone. Are you sure you want to proceed?
                </p>
              )}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTypeModal(null)
                    setDeleteTypeError('')
                  }}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                  disabled={isDeletingType}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeletingType}
                  className="flex-1 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 active:scale-98 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isDeletingType ? (
                    <>
                      <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                      <span>Deleting...</span>
                    </>
                  ) : attachedRequests.length > 0 ? (
                    deleteStrategy === 'reassign' ? 'Reassign & Delete' : 'Delete & Clear Requests'
                  ) : (
                    'Delete Type'
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
