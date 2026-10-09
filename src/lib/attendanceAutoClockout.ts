import { supabase } from './supabase'
import { logAction } from './auditLog'
import type { DayAttendance } from '../types'

export interface AutoClockOutResult {
  staffId: string
  date: string
  clockInTime: string
  clockOutTime: string
  autoClockedOut: boolean
}

/**
 * Checks for past or late-night unclosed attendance sessions and automatically sets
 * departure to official close of work (5:00 PM) to prevent skewed work hours.
 */
export async function checkAndAutoClockOut(
  staffId?: string | null,
  workEndTime: string = '17:00'
): Promise<AutoClockOutResult[]> {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const currentHour = now.getHours()
  const results: AutoClockOutResult[] = []

  try {
    // 1. Fetch unclosed records from Supabase
    let query = supabase
      .from('attendance_records')
      .select('*')
      .not('clock_in_time', 'is', null)
      .is('clock_out_time', null)

    if (staffId) {
      query = query.eq('staff_id', staffId)
    }

    const { data, error } = await query
    if (error || !data || data.length === 0) {
      return []
    }

    // 2. Identify records eligible for auto clock-out:
    // - Any previous day (attendance_date < todayStr)
    // - Today's record if it's 9:00 PM (21:00) or later
    const eligibleRecords = data.filter((r: any) => {
      if (r.attendance_date < todayStr) return true
      if (r.attendance_date === todayStr && currentHour >= 21) return true
      return false
    })

    const standardCloseTime = workEndTime.includes(':') ? (workEndTime.length === 5 ? `${workEndTime}:00` : workEndTime) : '17:00:00'

    for (const rec of eligibleRecords) {
      const existingNotes = rec.field_notes || ''
      const autoNote = existingNotes ? `${existingNotes} · [Auto Clock-Out (5:00 PM)]` : '[System Auto Clock-Out at 5:00 PM]'

      const updatedRecord = {
        ...rec,
        clock_out_time: standardCloseTime,
        auto_clocked_out: true,
        field_notes: autoNote,
      }

      // Upsert to Supabase
      await supabase
        .from('attendance_records')
        .upsert(updatedRecord, { onConflict: 'staff_id,attendance_date' })

      // Update LocalStorage cache for all candidate keys
      const candidateKeys = [
        `hris_self_attendance_${rec.staff_id}`,
        `hris_attendance_daily_${rec.staff_id}`
      ]
      candidateKeys.forEach(k => {
        try {
          const raw = localStorage.getItem(k)
          if (raw) {
            const parsed = JSON.parse(raw)
            parsed[rec.attendance_date] = {
              ...(parsed[rec.attendance_date] || {}),
              clock_out_time: standardCloseTime,
              clockOutTime: standardCloseTime,
              auto_clocked_out: true,
              autoClockedOut: true,
              field_notes: autoNote,
              fieldNotes: autoNote,
            }
            localStorage.setItem(k, JSON.stringify(parsed))
          }
        } catch {}
      })

      results.push({
        staffId: rec.staff_id,
        date: rec.attendance_date,
        clockInTime: rec.clock_in_time,
        clockOutTime: standardCloseTime,
        autoClockedOut: true,
      })
    }

    if (results.length > 0) {
      window.dispatchEvent(new Event('storage'))
      try {
        await logAction({
          action: 'UPDATE',
          entity: 'Attendance',
          entityId: staffId || 'system',
          details: `System auto-closed ${results.length} unclosed attendance session(s) at official close (${workEndTime}).`
        })
      } catch {}
    }
  } catch (err) {
    console.warn('Auto clock-out error:', err)
  }

  return results
}

/**
 * HR / Superadmin manual batch action to clock out all staff who haven't clocked out
 * for a specific target date (e.g., today or yesterday).
 */
export async function batchClockOutPendingStaff(
  targetDate: string,
  staffIdsToClose: string[],
  workEndTime: string = '17:00',
  actorName: string = 'HR Manager'
): Promise<number> {
  if (staffIdsToClose.length === 0) return 0
  const standardCloseTime = workEndTime.includes(':') ? (workEndTime.length === 5 ? `${workEndTime}:00` : workEndTime) : '17:00:00'
  let count = 0

  for (const sId of staffIdsToClose) {
    try {
      // 1. Fetch current record
      const { data: currentRec } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('staff_id', sId)
        .eq('attendance_date', targetDate)
        .maybeSingle()

      const existingNotes = currentRec?.field_notes || ''
      const autoNote = existingNotes ? `${existingNotes} · [Auto Clock-Out (5:00 PM)]` : `[Auto Clock-Out at ${workEndTime} by ${actorName}]`

      const updatedRecord = {
        staff_id: sId,
        attendance_date: targetDate,
        status: 'present',
        clock_in_time: currentRec?.clock_in_time || '08:00:00',
        clock_out_time: standardCloseTime,
        auto_clocked_out: true,
        field_notes: autoNote,
        is_late: currentRec?.is_late || false,
        late_minutes: currentRec?.late_minutes || 0,
        work_mode: currentRec?.work_mode || 'office',
      }

      await supabase
        .from('attendance_records')
        .upsert(updatedRecord, { onConflict: 'staff_id,attendance_date' })

      // Update LocalStorage cache
      const candidateKeys = [
        `hris_self_attendance_${sId}`,
        `hris_attendance_daily_${sId}`
      ]
      candidateKeys.forEach(k => {
        try {
          const raw = localStorage.getItem(k)
          if (raw) {
            const parsed = JSON.parse(raw)
            parsed[targetDate] = {
              ...(parsed[targetDate] || {}),
              clock_out_time: standardCloseTime,
              clockOutTime: standardCloseTime,
              auto_clocked_out: true,
              autoClockedOut: true,
              field_notes: autoNote,
              fieldNotes: autoNote,
            }
            localStorage.setItem(k, JSON.stringify(parsed))
          }
        } catch {}
      })

      count++
    } catch (e) {
      console.warn(`Failed to batch clock out staff ${sId}:`, e)
    }
  }

  if (count > 0) {
    window.dispatchEvent(new Event('storage'))
    try {
      await logAction({
        action: 'UPDATE',
        entity: 'Attendance',
        entityId: 'batch',
        details: `${actorName} auto-closed departure time (${standardCloseTime}) for ${count} staff member(s) on ${targetDate}.`
      })
    } catch {}
  }

  return count
}

/**
 * Submit an adjustment request when an employee forgot to clock out and was auto-clocked out,
 * or left at a different time.
 */
export async function submitDepartureAdjustment(
  staffId: string,
  staffName: string,
  attendanceDate: string,
  adjustedTime: string,
  reason: string
): Promise<boolean> {
  try {
    // 1. Fetch current record
    const { data: currentRec } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('staff_id', staffId)
      .eq('attendance_date', attendanceDate)
      .maybeSingle()

    const formattedTime = adjustedTime.length === 5 ? `${adjustedTime}:00` : adjustedTime
    const adjustmentNote = `[Departure Adjusted to ${adjustedTime}: "${reason}"]`
    const existingNotes = currentRec?.field_notes || ''
    const updatedNotes = existingNotes ? `${existingNotes} · ${adjustmentNote}` : adjustmentNote

    const updated = {
      staff_id: staffId,
      attendance_date: attendanceDate,
      status: 'present',
      clock_in_time: currentRec?.clock_in_time || '08:00:00',
      clock_out_time: formattedTime,
      auto_clocked_out: false,
      field_notes: updatedNotes,
      adjustment_requested: true,
      adjustment_status: 'approved', // Instant auto-apply with transparent audit trail
      adjustment_reason: reason,
      adjustment_requested_departure: formattedTime,
    }

    await supabase
      .from('attendance_records')
      .upsert(updated, { onConflict: 'staff_id,attendance_date' })

    // Update LocalStorage
    const candidateKeys = [
      `hris_self_attendance_${staffId}`,
      `hris_attendance_daily_${staffId}`
    ]
    candidateKeys.forEach(k => {
      try {
        const raw = localStorage.getItem(k)
        if (raw) {
          const parsed = JSON.parse(raw)
          parsed[attendanceDate] = {
            ...(parsed[attendanceDate] || {}),
            clock_out_time: formattedTime,
            clockOutTime: formattedTime,
            auto_clocked_out: false,
            autoClockedOut: false,
            field_notes: updatedNotes,
            fieldNotes: updatedNotes,
            adjustment_requested: true,
            adjustment_reason: reason,
          }
          localStorage.setItem(k, JSON.stringify(parsed))
        }
      } catch {}
    })

    window.dispatchEvent(new Event('storage'))

    await logAction({
      action: 'UPDATE',
      entity: 'Attendance',
      entityId: staffId,
      details: `${staffName} adjusted departure time to ${adjustedTime} for ${attendanceDate} (Reason: ${reason})`
    })

    return true
  } catch (err) {
    console.error('Adjustment submission failed:', err)
    return false
  }
}
