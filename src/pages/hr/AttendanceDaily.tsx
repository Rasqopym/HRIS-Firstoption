import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAction } from '../../lib/auditLog'
import type { DayAttendance, AttendanceStatus } from '../../types'

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-500',
  absent: 'bg-red-500',
  on_leave: 'bg-amber-400',
  public_holiday: 'bg-blue-400',
  weekend: 'bg-slate-200',
}
const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: 'Present', absent: 'Absent', on_leave: 'On Leave',
  public_holiday: 'Public Holiday', weekend: 'Weekend',
}
const STATUS_CELL: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  absent: 'bg-red-50 border-red-200 text-red-700',
  on_leave: 'bg-amber-50 border-amber-200 text-amber-700',
  public_holiday: 'bg-blue-50 border-blue-200 text-blue-600',
  weekend: 'bg-slate-100 border-slate-200 text-slate-400',
}

function buildMonth(year: number, month: number, existingRecords: Record<string, any>): DayAttendance[] {
  const days: DayAttendance[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = new Date(dateStr).getDay()
    const isWeekend = dow === 0 || dow === 6
    const dateObj = new Date(dateStr)
    dateObj.setHours(0, 0, 0, 0)
    const isFuture = dateObj > today
    
    // Use existing record if available
    if (existingRecords[dateStr]) {
      days.push({
        date: dateStr,
        status: existingRecords[dateStr].status,
        overtimeHours: existingRecords[dateStr].overtime_hours || 0,
        onSite: existingRecords[dateStr].on_site || false,
        overtimeApproval: existingRecords[dateStr].overtime_approval || 'none',
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
        status: 'present',
        overtimeHours: 0,
        onSite: false,
        overtimeApproval: 'none',
      })
    } else {
      // Default to present for past days with no record
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
  const [days, setDays] = useState<DayAttendance[]>([])
  const [editDay, setEditDay] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const selectedStaff = staffList.find(s => s.id === selectedStaffId) || staffList[0]

  const updateDay = async (date: string, patch: Partial<DayAttendance>) => {
    // Update local state immediately
    setDays(prev => prev.map(d => d.date === date ? { ...d, ...patch } : d))
    
    // Upsert to database
    const { error } = await supabase
      .from('attendance_records')
      .upsert({
        staff_id: selectedStaffId,
        attendance_date: date,
        status: patch.status || days.find(d => d.date === date)?.status || 'present',
        overtime_hours: patch.overtimeHours ?? days.find(d => d.date === date)?.overtimeHours ?? 0,
        on_site: patch.onSite ?? days.find(d => d.date === date)?.onSite ?? false,
        overtime_approval: patch.overtimeApproval ?? days.find(d => d.date === date)?.overtimeApproval ?? 'none',
      }, {
        onConflict: 'staff_id,attendance_date'
      })
    
    if (error) {
      console.error('Failed to update attendance:', error)
    }
  }

  const summary = {
    present: days.filter(d => d.status === 'present').length,
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

  // Fetch staff list on mount
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
          department_name: s.departments?.name || 'Unknown'
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

  // Fetch attendance when staff or month changes
  useEffect(() => {
    const fetchAttendance = async () => {
      if (!selectedStaffId) return
      setLoading(true)
      
      const firstDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const lastDay = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, '0')}`
      
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('staff_id', selectedStaffId)
        .gte('attendance_date', firstDay)
        .lte('attendance_date', lastDay)
      
      const existingRecords: Record<string, any> = {}
      if (data && !error) {
        data.forEach(record => {
          existingRecords[record.attendance_date] = record
        })
      }
      
      const monthDays = buildMonth(selectedYear, selectedMonth, existingRecords)
      setDays(monthDays)
      setLoading(false)
    }
    fetchAttendance()
  }, [selectedStaffId, selectedMonth, selectedYear])

  const editingDay = editDay ? days.find(d => d.date === editDay) : null

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-slate-500">Loading attendance data...</div>
      </div>
    )
  }

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">Daily Attendance</h2>
          <p className="text-sm text-slate-500">{monthYearLabel} — mark attendance, overtime & site deployment</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handlePrevMonth} className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">
            ‹
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center">{monthYearLabel}</span>
          <button onClick={handleNextMonth} className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">
            ›
          </button>
          <select
            value={selectedStaffId}
            onChange={e => { setSelectedStaffId(e.target.value); setEditDay(null) }}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
          >
            {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.staff_code})</option>)}
          </select>
          <button onClick={handleSave} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
            {saved ? '✓ Saved' : 'Save Attendance'}
          </button>
        </div>
      </div>

      {/* Staff header */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-5 flex items-center gap-4">
        {selectedStaff && (
          <>
            <img src={selectedStaff.photo_url || ''} alt={selectedStaff.full_name} className="w-12 h-12 rounded-full object-cover" />
            <div className="flex-1">
              <div className="font-display font-semibold text-slate-800">{selectedStaff.full_name}</div>
              <div className="text-xs text-slate-500">{selectedStaff.job_title} · {selectedStaff.department_name}</div>
            </div>
          </>
        )}
        {/* Summary pills */}
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { l: 'Present', v: summary.present, color: 'bg-emerald-100 text-emerald-700' },
            { l: 'Absent', v: summary.absent, color: 'bg-red-100 text-red-700' },
            { l: 'On Leave', v: summary.onLeave, color: 'bg-amber-100 text-amber-700' },
            { l: 'OT Hours', v: `${summary.overtimeHrs}h`, color: 'bg-violet-100 text-violet-700' },
            { l: 'Site Days', v: summary.sitedays, color: 'bg-blue-100 text-blue-700' },
          ].map(p => (
            <div key={p.l} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${p.color}`}>
              <span className="font-mono-data font-bold text-sm">{p.v}</span>
              <span className="ml-1 opacity-70">{p.l}</span>
            </div>
          ))}
          {summary.pendingOT > 0 && (
            <div className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-100 text-orange-700">
              <span className="font-mono-data font-bold text-sm">{summary.pendingOT}</span>
              <span className="ml-1 opacity-70">OT Pending</span>
            </div>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-5">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50/60">
              {d}
            </div>
          ))}
        </div>
        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {/* Leading empty cells */}
          {Array.from({ length: firstDow }, (_, i) => (
            <div key={`empty-${i}`} className="aspect-square border-r border-b border-slate-50 bg-slate-50/30" />
          ))}
          {days.map(day => {
            const d = Number(day.date.split('-')[2])
            const isWeekend = day.status === 'weekend'
            const isEditing = editDay === day.date
            const dateObj = new Date(day.date)
            dateObj.setHours(0, 0, 0, 0)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const isFuture = dateObj > today
            return (
              <div
                key={day.date}
                onClick={() => !isWeekend && !isFuture && setEditDay(isEditing ? null : day.date)}
                className={`relative p-2 border-r border-b border-slate-50 transition-colors min-h-[72px] ${isWeekend ? 'bg-slate-50/60 cursor-default' : isFuture ? 'bg-slate-100/40 cursor-default opacity-60' : 'hover:bg-blue-50/40 cursor-pointer'} ${isEditing ? 'ring-2 ring-inset ring-blue-400' : ''}`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className={`text-xs font-semibold ${isWeekend || isFuture ? 'text-slate-300' : 'text-slate-600'}`}>{d}</span>
                  {!isWeekend && !isFuture && (
                    <span className={`w-2 h-2 rounded-full flex-none ${STATUS_COLORS[day.status]}`} />
                  )}
                </div>
                {!isWeekend && !isFuture && (
                  <>
                    <div className={`text-xs px-1 py-0.5 rounded text-center leading-tight ${STATUS_CELL[day.status]}`}>
                      {STATUS_TEXT[day.status].replace(' ', '\n')}
                    </div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {day.overtimeHours > 0 && (
                        <span className={`text-xs px-1 rounded ${day.overtimeApproval === 'approved' ? 'bg-violet-100 text-violet-600' : day.overtimeApproval === 'pending' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                          +{day.overtimeHours}h OT
                        </span>
                      )}
                      {day.onSite && (
                        <span className="text-xs px-1 rounded bg-blue-100 text-blue-600">Site</span>
                      )}
                    </div>
                  </>
                )}
                {isFuture && (
                  <div className="text-xs text-slate-400 text-center mt-1">Future</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Day editor panel */}
      {editDay && editingDay && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 anim-fade">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-800">
              Edit: {new Date(editDay).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => setEditDay(null)} className="text-slate-400 hover:text-slate-600 p-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Status */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-2">Attendance Status</label>
              <div className="flex gap-2 flex-wrap">
                {(['present', 'absent', 'on_leave', 'public_holiday'] as AttendanceStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => updateDay(editDay, { status: s })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${editingDay.status === s ? STATUS_CELL[s] + ' border-current' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    {STATUS_TEXT[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Overtime */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Overtime Hours</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} step={0.5} value={editingDay.overtimeHours}
                  onChange={e => updateDay(editDay, { overtimeHours: Number(e.target.value), overtimeApproval: Number(e.target.value) > 0 ? 'pending' : 'none' })}
                  className="w-24 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 font-mono-data"
                />
                <span className="text-xs text-slate-400">hrs</span>
              </div>
              {editingDay.overtimeHours > 0 && (
                <div className="mt-2 flex gap-1">
                  {(['pending', 'approved', 'rejected'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => updateDay(editDay, { overtimeApproval: s })}
                      className={`text-xs px-2 py-0.5 rounded capitalize border transition-all ${editingDay.overtimeApproval === s ? (s === 'approved' ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : s === 'rejected' ? 'bg-red-100 border-red-300 text-red-700' : 'bg-orange-100 border-orange-300 text-orange-700') : 'border-slate-200 text-slate-400'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* On Site */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Project Site Deployment</label>
              <button
                onClick={() => updateDay(editDay, { onSite: !editingDay.onSite })}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${editingDay.onSite ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500'}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${editingDay.onSite ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                  {editingDay.onSite && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                On Site Today
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">Legend:</span>
        {(Object.entries(STATUS_COLORS) as [AttendanceStatus, string][]).map(([s, color]) => (
          <div key={s} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-full ${color}`} />
            <span className="text-xs text-slate-500">{STATUS_TEXT[s]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1"><span className="text-xs px-1 rounded bg-violet-100 text-violet-600">+Nh OT</span><span className="text-xs text-slate-500">Overtime</span></div>
        <div className="flex items-center gap-1"><span className="text-xs px-1 rounded bg-blue-100 text-blue-600">Site</span><span className="text-xs text-slate-500">On-site deployment</span></div>
      </div>
    </div>
  )
}
