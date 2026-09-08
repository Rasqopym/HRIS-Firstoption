import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAction } from '../../lib/auditLog'
import { getDefaultPublicHolidays, type PublicHoliday } from '../../lib/holidays'

export default function PublicHolidays() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [customHolidays, setCustomHolidays] = useState<PublicHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const [newHoliday, setNewHoliday] = useState({
    name: '',
    holiday_date: '',
    is_recurring: true,
    description: '',
  })

  // Load custom holidays from company_settings & localStorage
  const fetchHolidays = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      // 1. Check local cache first
      try {
        const cached = localStorage.getItem('hris_custom_holidays')
        if (cached) {
          setCustomHolidays(JSON.parse(cached))
        }
      } catch (e) {}

      // 2. Fetch from Supabase
      const { data, error } = await supabase
        .from('company_settings')
        .select('custom_holidays')
        .eq('id', 1)
        .maybeSingle()

      if (!error && data && Array.isArray(data.custom_holidays)) {
        setCustomHolidays(data.custom_holidays)
        localStorage.setItem('hris_custom_holidays', JSON.stringify(data.custom_holidays))
      }
    } catch (err) {
      console.warn('Failed to load holidays from Supabase:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHolidays()
  }, [])

  const handleAddHoliday = async () => {
    if (!newHoliday.name.trim() || !newHoliday.holiday_date) {
      setErrorMsg('Please provide both a holiday name and date.')
      return
    }

    setSaving(true)
    setErrorMsg('')
    try {
      const item: PublicHoliday = {
        id: `hol-custom-${Date.now()}`,
        name: newHoliday.name.trim(),
        holiday_date: newHoliday.holiday_date,
        is_recurring: newHoliday.is_recurring,
        description: newHoliday.description.trim() || 'Custom declared public holiday',
      }

      const updated = [...customHolidays, item]
      setCustomHolidays(updated)
      localStorage.setItem('hris_custom_holidays', JSON.stringify(updated))
      window.dispatchEvent(new Event('storage'))

      // Persist to Supabase
      try {
        await supabase
          .from('company_settings')
          .update({ custom_holidays: updated })
          .eq('id', 1)

        await logAction({
          action: 'CREATE',
          entity: 'Public Holiday',
          entityId: item.id,
          details: `Declared public holiday: "${item.name}" on ${item.holiday_date} (${item.is_recurring ? 'Annual' : 'Single event'})`
        })
      } catch (e) {
        console.warn('Supabase holiday update warning:', e)
      }

      setNewHoliday({ name: '', holiday_date: '', is_recurring: true, description: '' })
      setShowAddModal(false)
      setSuccessMsg(`Declared "${item.name}" successfully.`)
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      console.error('Error adding holiday:', err)
      setErrorMsg('Failed to add public holiday. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteHoliday = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove the declared holiday "${name}"?`)) {
      return
    }

    try {
      const updated = customHolidays.filter(h => h.id !== id)
      setCustomHolidays(updated)
      localStorage.setItem('hris_custom_holidays', JSON.stringify(updated))
      window.dispatchEvent(new Event('storage'))

      try {
        await supabase
          .from('company_settings')
          .update({ custom_holidays: updated })
          .eq('id', 1)

        await logAction({
          action: 'DELETE',
          entity: 'Public Holiday',
          entityId: id,
          details: `Removed declared public holiday: "${name}"`
        })
      } catch (e) {
        console.warn('Supabase holiday delete warning:', e)
      }

      setSuccessMsg(`Removed "${name}" successfully.`)
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      console.error('Error removing holiday:', err)
      setErrorMsg('Failed to remove holiday.')
    }
  }

  const statutoryHolidays = getDefaultPublicHolidays(selectedYear)

  return (
    <div className="p-4 sm:p-6 anim-fade-up space-y-6 max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-slate-800 text-xl sm:text-2xl flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Public Holidays & Observances
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage statutory and government-declared public holidays. These days are automatically deducted from monthly working days and marked as paid non-working days.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Year selector */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-2xs">
            <button
              onClick={() => setSelectedYear(y => y - 1)}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
              title="Previous Year"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-xs sm:text-sm font-semibold text-slate-700 px-2.5 font-mono-data">{selectedYear}</span>
            <button
              onClick={() => setSelectedYear(y => y + 1)}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
              title="Next Year"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-2xs"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Declare Holiday
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 anim-fade-up">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 anim-fade-up">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {errorMsg}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider block">Statutory Holidays ({selectedYear})</span>
          <div className="font-display font-bold text-3xl text-slate-800 font-mono-data mt-1">{statutoryHolidays.length}</div>
          <span className="text-xs text-slate-500 mt-1 block">National gazetted holidays automatically observed</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">Custom Declared Holidays</span>
          <div className="font-display font-bold text-3xl text-emerald-600 font-mono-data mt-1">{customHolidays.length}</div>
          <span className="text-xs text-slate-500 mt-1 block">Company and ad-hoc government observances</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider block">Attendance Rule</span>
          <div className="text-sm font-semibold text-slate-800 mt-2 flex items-center gap-1.5">
            <svg className="text-emerald-500 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            Paid Off · Zero Absence Penalty
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Staff working receive Holiday Duty shift status</span>
        </div>
      </div>

      {/* Custom Declared Holidays Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold text-slate-800 text-base">Company Declared & Ad-Hoc Holidays</h3>
            <p className="text-xs text-slate-400 mt-0.5">Government-declared public holidays and company work-free days</p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            {customHolidays.length} Declared
          </span>
        </div>

        {customHolidays.length === 0 ? (
          <div className="p-10 text-center bg-slate-50/40">
            <svg className="mx-auto text-slate-300 mb-3" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <p className="text-sm text-slate-600 font-medium">No custom public holidays declared yet</p>
            <p className="text-xs text-slate-400 mt-1">Add national holidays (e.g. Eid-el-Fitr, Good Friday) or specific work-free days here.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              + Declare New Holiday
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Holiday Name</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Recurrence</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Description / Gazette Note</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customHolidays.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{h.name}</td>
                    <td className="py-3.5 px-4 text-slate-600 font-mono-data text-xs font-medium">{h.holiday_date}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${h.is_recurring ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {h.is_recurring ? 'Annual Recurring' : 'Single Event'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">{h.description || '—'}</td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDeleteHoliday(h.id, h.name)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium px-2.5 py-1 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Statutory Public Holidays Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold text-slate-800 text-base">National Statutory Public Holidays ({selectedYear})</h3>
            <p className="text-xs text-slate-400 mt-0.5">Statutory national holidays recognized under Nigerian labor guidelines</p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
            Automatic Calendar
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Holiday Name</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Standard Date</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Official Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statutoryHolidays.map(h => (
                <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-slate-800">{h.name}</td>
                  <td className="py-3.5 px-4 text-slate-600 font-mono-data text-xs font-medium">{h.holiday_date}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700">
                      Active & Paid Off
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 text-xs">{h.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Declare Holiday Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 anim-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display font-semibold text-slate-800 text-base flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Declare Public Holiday
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Holiday Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Eid-el-Fitr, Good Friday, Easter Monday"
                  value={newHoliday.name}
                  onChange={e => setNewHoliday(h => ({ ...h, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Holiday Date *</label>
                <input
                  type="date"
                  value={newHoliday.holiday_date}
                  onChange={e => setNewHoliday(h => ({ ...h, holiday_date: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-mono-data"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="modal-is-recurring-holiday"
                  checked={newHoliday.is_recurring}
                  onChange={e => setNewHoliday(h => ({ ...h, is_recurring: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="modal-is-recurring-holiday" className="text-xs text-slate-700 cursor-pointer">
                  Repeats annually on this date
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description / Notes</label>
                <textarea
                  placeholder="e.g. Declared by Federal Government for public holiday celebration..."
                  value={newHoliday.description}
                  onChange={e => setNewHoliday(h => ({ ...h, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddHoliday}
                disabled={saving || !newHoliday.name.trim() || !newHoliday.holiday_date}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors shadow-2xs"
              >
                {saving ? 'Saving...' : 'Save & Declare'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
