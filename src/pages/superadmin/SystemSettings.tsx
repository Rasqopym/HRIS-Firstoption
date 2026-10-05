import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyCompanySettingsUpdated } from '../../hooks/useCompanySettings'
import type { OfficeLocation } from '../../lib/geofence'
import { getDefaultPublicHolidays, type PublicHoliday } from '../../lib/holidays'

type Tab = 'company' | 'departments' | 'attendance' | 'holidays' | 'roles' | 'branding'

interface Department {
  id: string
  name: string
}

export default function SystemSettings() {
  const [tab, setTab] = useState<Tab>('company')
  const [depts, setDepts] = useState<Department[]>([])
  const [loadingDepts, setLoadingDepts] = useState(true)
  const [newDept, setNewDept] = useState('')
  const [saved, setSaved] = useState(false)
  const [deptError, setDeptError] = useState('')
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [editingDeptName, setEditingDeptName] = useState('')

  // Company & Attendance settings state
  const [companySettings, setCompanySettings] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    rc_number: '',
    industry: '',
    founded_year: '',
    primary_color: '#1e3a5f',
    accent_color: '#2563eb',
    footer_text: '',
    logo_url: '',
    // Attendance & Work hours
    work_start_time: '08:00',
    work_end_time: '17:00',
    grace_period_minutes: 15,
    enable_lateness_tracking: true,
    // Office Location & Geofencing
    enable_geofencing: false,
    allow_field_work: true,
    require_field_note: true,
    office_locations: [
      { id: 'loc-1', name: 'Main Head Office', lat: 6.5244, lng: 3.3792, radius_meters: 100, is_active: true }
    ] as OfficeLocation[],
  })
  const [loadingCompany, setLoadingCompany] = useState(true)
  const [companyError, setCompanyError] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // New branch modal / form state
  const [showAddBranch, setShowAddBranch] = useState(false)
  const [newBranch, setNewBranch] = useState<OfficeLocation>({
    id: '',
    name: '',
    lat: 6.5244,
    lng: 3.3792,
    radius_meters: 100,
    is_active: true,
  })
  const [detectingNewBranch, setDetectingNewBranch] = useState(false)
  const [detectFeedback, setDetectFeedback] = useState('')
  const [savingLocation, setSavingLocation] = useState(false)

  // Public Holidays State
  const [customHolidays, setCustomHolidays] = useState<PublicHoliday[]>([])
  const [showAddHoliday, setShowAddHoliday] = useState(false)
  const [newHoliday, setNewHoliday] = useState({
    name: '',
    holiday_date: '',
    is_recurring: true,
    description: '',
  })

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const { data, error } = await supabase
          .from('departments')
          .select('id, name')
          .order('name')

        if (error) throw error

        setDepts(data || [])
      } catch (err) {
        console.error('Error fetching departments:', err)
        setDeptError('Failed to load departments')
      } finally {
        setLoadingDepts(false)
      }
    }

    const fetchCompanySettings = async () => {
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('*')
          .eq('id', 1)
          .single()

        if (error) throw error

        if (data) {
          // Parse or default locations
          let locs: OfficeLocation[] = []
          if (Array.isArray(data.office_locations) && data.office_locations.length > 0) {
            locs = data.office_locations
            try {
              localStorage.setItem('hris_office_locations', JSON.stringify(locs))
            } catch (e) {}
          } else {
            try {
              const cached = localStorage.getItem('hris_office_locations')
              if (cached) {
                const parsed = JSON.parse(cached)
                if (Array.isArray(parsed) && parsed.length > 0) locs = parsed
              }
            } catch (e) {}
          }

          if (locs.length === 0) {
            if (data.office_lat && data.office_lng) {
              locs = [{
                id: 'loc-1',
                name: data.office_address_label || 'Main Head Office',
                lat: data.office_lat,
                lng: data.office_lng,
                radius_meters: data.office_radius_meters || 100,
                is_active: true,
              }]
            } else {
              locs = [{ id: 'loc-1', name: 'Main Head Office', lat: 6.5244, lng: 3.3792, radius_meters: 100, is_active: true }]
            }
          }

          // Load custom holidays
          if (Array.isArray(data.custom_holidays)) {
            setCustomHolidays(data.custom_holidays)
            localStorage.setItem('hris_custom_holidays', JSON.stringify(data.custom_holidays))
          } else {
            try {
              const cached = localStorage.getItem('hris_custom_holidays')
              if (cached) setCustomHolidays(JSON.parse(cached))
            } catch (e) {}
          }

          setCompanySettings({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            address: data.address || '',
            website: data.website || '',
            rc_number: data.rc_number || '',
            industry: data.industry || '',
            founded_year: data.founded_year || '',
            primary_color: data.primary_color || '#1e3a5f',
            accent_color: data.accent_color || '#2563eb',
            footer_text: data.footer_text || '',
            logo_url: data.logo_url || '',
            work_start_time: data.work_start_time || '08:00',
            work_end_time: data.work_end_time || '17:00',
            grace_period_minutes: data.grace_period_minutes ?? 15,
            enable_lateness_tracking: data.enable_lateness_tracking ?? true,
            enable_geofencing: data.enable_geofencing ?? false,
            allow_field_work: data.allow_field_work ?? true,
            require_field_note: data.require_field_note ?? true,
            office_locations: locs,
          })
        }
      } catch (err) {
        console.error('Error fetching company settings:', err)
        setCompanyError('Failed to load company settings')
      } finally {
        setLoadingCompany(false)
      }
    }

    fetchDepartments()
    fetchCompanySettings()
  }, [])

  const handleSave = async () => {
    setCompanyError('')
    setSaved(false)

    const cleanSubtitle = companySettings.industry
      ? (companySettings.industry.toLowerCase().includes('hris') ? companySettings.industry : `${companySettings.industry} HRIS`)
      : 'HRIS Platform'

    // First location as default single fallback
    const primaryLoc = companySettings.office_locations[0] || {
      lat: 6.5244,
      lng: 3.3792,
      radius_meters: 100,
      name: 'Main Head Office',
    }

    notifyCompanySettingsUpdated({
      ...companySettings,
      subtitle: cleanSubtitle,
    })

    // Persist custom holidays locally
    localStorage.setItem('hris_custom_holidays', JSON.stringify(customHolidays))

    try {
      const { error } = await supabase
        .from('company_settings')
        .update({
          name: companySettings.name,
          email: companySettings.email,
          phone: companySettings.phone,
          address: companySettings.address,
          website: companySettings.website,
          rc_number: companySettings.rc_number,
          industry: companySettings.industry,
          founded_year: companySettings.founded_year,
          primary_color: companySettings.primary_color,
          accent_color: companySettings.accent_color,
          footer_text: companySettings.footer_text,
          logo_url: companySettings.logo_url,
          work_start_time: companySettings.work_start_time,
          work_end_time: companySettings.work_end_time,
          grace_period_minutes: companySettings.grace_period_minutes,
          enable_lateness_tracking: companySettings.enable_lateness_tracking,
          enable_geofencing: companySettings.enable_geofencing,
          allow_field_work: companySettings.allow_field_work,
          require_field_note: companySettings.require_field_note,
          office_locations: companySettings.office_locations,
          office_lat: primaryLoc.lat,
          office_lng: primaryLoc.lng,
          office_radius_meters: primaryLoc.radius_meters,
          office_address_label: primaryLoc.name,
          custom_holidays: customHolidays,
        })
        .eq('id', 1)

      if (error) {
        console.warn('Database save warning (saved locally):', error.message)
        setCompanyError(`Database save warning: ${error.message}`)
      } else {
        try {
          localStorage.setItem('hris_office_locations', JSON.stringify(companySettings.office_locations))
        } catch (e) {}
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch (err: any) {
      console.warn('Save settings handled locally:', err)
      setCompanyError(`Save error: ${err?.message || String(err)}`)
    }
  }

  const handleDetectGPSForNewBranch = () => {
    if (!navigator.geolocation) {
      setDetectFeedback('Geolocation is not supported by your browser')
      return
    }

    setDetectingNewBranch(true)
    setDetectFeedback('')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6))
        const lng = parseFloat(pos.coords.longitude.toFixed(6))
        setNewBranch(b => ({
          ...b,
          lat,
          lng,
        }))
        setDetectingNewBranch(false)
        setDetectFeedback(`Captured: ${lat}, ${lng} (±${Math.round(pos.coords.accuracy)}m)`)
      },
      (err) => {
        setDetectingNewBranch(false)
        setDetectFeedback(`GPS Error: ${err.message}`)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleAddLocation = async () => {
    if (!newBranch.name.trim()) return
    setSavingLocation(true)

    const locItem: OfficeLocation = {
      id: `loc-${Date.now()}`,
      name: newBranch.name.trim(),
      lat: Number(newBranch.lat) || 6.5244,
      lng: Number(newBranch.lng) || 3.3792,
      radius_meters: Number(newBranch.radius_meters) || 100,
      is_active: true,
    }

    const updatedLocations = [...companySettings.office_locations, locItem]

    setCompanySettings(c => ({
      ...c,
      office_locations: updatedLocations,
    }))

    try {
      localStorage.setItem('hris_office_locations', JSON.stringify(updatedLocations))
    } catch (e) {}

    setShowAddBranch(false)
    setNewBranch({ id: '', name: '', lat: 6.5244, lng: 3.3792, radius_meters: 100, is_active: true })
    setDetectFeedback('')

    try {
      const primaryLoc = updatedLocations[0] || locItem
      const { error } = await supabase
        .from('company_settings')
        .update({
          office_locations: updatedLocations,
          office_lat: primaryLoc.lat,
          office_lng: primaryLoc.lng,
          office_radius_meters: primaryLoc.radius_meters,
          office_address_label: primaryLoc.name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)

      if (error) {
        console.warn('Could not persist new branch to Supabase:', error.message)
      } else {
        notifyCompanySettingsUpdated({
          ...companySettings,
          office_locations: updatedLocations,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch (err) {
      console.warn('Branch persistence exception:', err)
    } finally {
      setSavingLocation(false)
    }
  }

  const handleRemoveLocation = async (id: string) => {
    if (companySettings.office_locations.length <= 1) {
      alert('You must have at least one office/site location.')
      return
    }
    const updatedLocations = companySettings.office_locations.filter(l => l.id !== id)
    setCompanySettings(c => ({
      ...c,
      office_locations: updatedLocations,
    }))

    try {
      localStorage.setItem('hris_office_locations', JSON.stringify(updatedLocations))
    } catch (e) {}

    try {
      const primaryLoc = updatedLocations[0] || {
        lat: 6.5244,
        lng: 3.3792,
        radius_meters: 100,
        name: 'Main Head Office',
      }
      const { error } = await supabase
        .from('company_settings')
        .update({
          office_locations: updatedLocations,
          office_lat: primaryLoc.lat,
          office_lng: primaryLoc.lng,
          office_radius_meters: primaryLoc.radius_meters,
          office_address_label: primaryLoc.name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)

      if (!error) {
        notifyCompanySettingsUpdated({
          ...companySettings,
          office_locations: updatedLocations,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch (err) {
      console.warn('Branch removal exception:', err)
    }
  }

  const handleToggleLocationActive = async (id: string) => {
    const updatedLocations = companySettings.office_locations.map(l => l.id === id ? { ...l, is_active: !l.is_active } : l)
    setCompanySettings(c => ({
      ...c,
      office_locations: updatedLocations,
    }))

    try {
      localStorage.setItem('hris_office_locations', JSON.stringify(updatedLocations))
    } catch (e) {}

    try {
      const { error } = await supabase
        .from('company_settings')
        .update({
          office_locations: updatedLocations,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)

      if (!error) {
        notifyCompanySettingsUpdated({
          ...companySettings,
          office_locations: updatedLocations,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch (err) {
      console.warn('Branch toggle exception:', err)
    }
  }

  const handleAddHoliday = async () => {
    if (!newHoliday.name.trim() || !newHoliday.holiday_date) return
    const item: PublicHoliday = {
      id: `hol-custom-${Date.now()}`,
      name: newHoliday.name.trim(),
      holiday_date: newHoliday.holiday_date,
      is_recurring: newHoliday.is_recurring,
      description: newHoliday.description.trim() || 'Custom declared holiday',
    }
    const updated = [...customHolidays, item]
    setCustomHolidays(updated)
    localStorage.setItem('hris_custom_holidays', JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
    
    try {
      await supabase
        .from('company_settings')
        .update({ custom_holidays: updated })
        .eq('id', 1)
    } catch (e) {}

    setNewHoliday({ name: '', holiday_date: '', is_recurring: true, description: '' })
    setShowAddHoliday(false)
  }

  const handleDeleteHoliday = async (id: string) => {
    const updated = customHolidays.filter(h => h.id !== id)
    setCustomHolidays(updated)
    localStorage.setItem('hris_custom_holidays', JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))

    try {
      await supabase
        .from('company_settings')
        .update({ custom_holidays: updated })
        .eq('id', 1)
    } catch (e) {}
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    setCompanyError('')

    const reader = new FileReader()
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string
      if (dataUrl) {
        setCompanySettings(prev => ({ ...prev, logo_url: dataUrl }))
        notifyCompanySettingsUpdated({ logo_url: dataUrl })
      }
      setUploadingLogo(false)
    }
    reader.readAsDataURL(file)

    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `logo.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(filePath, file, { upsert: true })

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('branding')
          .getPublicUrl(filePath)
        if (publicUrl) {
          setCompanySettings(prev => ({ ...prev, logo_url: publicUrl }))
          notifyCompanySettingsUpdated({ logo_url: publicUrl })
        }
      }
    } catch (err) {
      console.warn('Supabase storage upload skipped:', err)
    }
  }

  const addDept = async () => {
    const trimmedName = newDept.trim()
    if (!trimmedName) return

    if (depts.some(d => d.name.toLowerCase() === trimmedName.toLowerCase())) {
      setDeptError('Department already exists')
      return
    }

    setDeptError('')
    try {
      const { data, error } = await supabase
        .from('departments')
        .insert({ name: trimmedName })
        .select()
        .single()

      if (error) throw error

      setDepts(d => [...d, data])
      setNewDept('')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to add department'
      setDeptError(errorMsg)
      console.error('Error adding department:', err)
    }
  }

  const deleteDept = async (id: string) => {
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id)

      if (error) throw error

      setDepts(d => d.filter(dept => dept.id !== id))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete department'
      setDeptError(errorMsg)
      console.error('Error deleting department:', err)
    }
  }

  const startEditing = (dept: Department) => {
    setEditingDeptId(dept.id)
    setEditingDeptName(dept.name)
    setDeptError('')
  }

  const cancelEditing = () => {
    setEditingDeptId(null)
    setEditingDeptName('')
  }

  const saveRename = async () => {
    if (!editingDeptId) return

    const trimmedName = editingDeptName.trim()
    if (!trimmedName) {
      setDeptError('Department name cannot be empty')
      return
    }

    const originalDept = depts.find(d => d.id === editingDeptId)
    if (!originalDept) return

    if (trimmedName.toLowerCase() === originalDept.name.toLowerCase()) {
      cancelEditing()
      return
    }

    if (depts.some(d => d.id !== editingDeptId && d.name.toLowerCase() === trimmedName.toLowerCase())) {
      setDeptError('Department name already exists')
      return
    }

    setDeptError('')
    try {
      const { error } = await supabase
        .from('departments')
        .update({ name: trimmedName })
        .eq('id', editingDeptId)

      if (error) throw error

      setDepts(d => d.map(dept => 
        dept.id === editingDeptId ? { ...dept, name: trimmedName } : dept
      ))
      cancelEditing()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to rename department'
      setDeptError(errorMsg)
      console.error('Error renaming department:', err)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'company', label: 'Company Profile' },
    { id: 'attendance', label: 'Attendance & Geofencing' },
    { id: 'holidays', label: 'Public Holidays' },
    { id: 'departments', label: 'Departments' },
    { id: 'roles', label: 'Roles & Permissions' },
    { id: 'branding', label: 'Branding' },
  ]

  return (
    <div className="p-4 sm:p-6 anim-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">System Settings</h2>
          <p className="text-sm text-slate-500">Manage company profile, multi-branch attendance rules, and field work policy</p>
        </div>
        <button
          onClick={handleSave}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all self-start sm:self-auto ${saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
        >
          {saved ? <span className="flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>Saved</span> : 'Save Changes'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-6 max-w-full overflow-x-auto no-scrollbar flex-nowrap sm:flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap ${tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Company Profile */}
      {tab === 'company' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl">
          <h3 className="font-display font-semibold text-slate-800 mb-5">Company Information</h3>
          
          {companyError && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {companyError}
            </div>
          )}

          {loadingCompany ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'name', label: 'Company Name', col2: true },
                { key: 'email', label: 'HR Contact Email' },
                { key: 'phone', label: 'Phone Number' },
                { key: 'rc_number', label: 'RC Number (CAC)' },
                { key: 'industry', label: 'Industry' },
                { key: 'founded_year', label: 'Year Founded' },
                { key: 'website', label: 'Website' },
                { key: 'address', label: 'Registered Address', col2: true },
              ].map(f => (
                <div key={f.key} className={f.col2 ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{f.label}</label>
                  {f.key === 'address' ? (
                    <textarea
                      value={companySettings[f.key as keyof typeof companySettings] as string}
                      onChange={e => setCompanySettings(c => ({ ...c, [f.key]: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                    />
                  ) : (
                    <input
                      value={companySettings[f.key as keyof typeof companySettings] as string}
                      onChange={e => setCompanySettings(c => ({ ...c, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Attendance, Multi-Branch & Field Work Settings ── */}
      {tab === 'attendance' && (
        <div className="space-y-6 max-w-3xl">
          {/* Work Hours & Lateness Policy */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div>
              <h3 className="font-display font-semibold text-slate-800 text-base">Work Hours & Lateness Policy</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure official shift hours and automatic late arrival tagging</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Official Start Time</label>
                <input
                  type="time"
                  value={companySettings.work_start_time}
                  onChange={e => setCompanySettings(c => ({ ...c, work_start_time: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Official End Time</label>
                <input
                  type="time"
                  value={companySettings.work_end_time}
                  onChange={e => setCompanySettings(c => ({ ...c, work_end_time: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Grace Period (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={companySettings.grace_period_minutes}
                  onChange={e => setCompanySettings(c => ({ ...c, grace_period_minutes: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={companySettings.enable_lateness_tracking}
                  onChange={e => setCompanySettings(c => ({ ...c, enable_lateness_tracking: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800">Enable Automatic Lateness Tagging</span>
                  <p className="text-xs text-slate-500">Records exact minutes late on attendance records and calculates monthly tardiness summaries</p>
                </div>
              </label>
            </div>
          </div>

          {/* Field Work & Client Visits Policy */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div>
              <h3 className="font-display font-semibold text-slate-800 text-base">Field Work, Sales & Client Visits</h3>
              <p className="text-xs text-slate-500 mt-0.5">Allow staff visiting clients or working on project sites to clock in off-site</p>
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-slate-50 border border-slate-100">
                <input
                  type="checkbox"
                  checked={companySettings.allow_field_work}
                  onChange={e => setCompanySettings(c => ({ ...c, allow_field_work: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-800">Allow "Field Work / Client Visit" Clock-in</span>
                  <p className="text-xs text-slate-500">
                    Staff heading directly to client offices or project sites can select "Field Work" mode to clock in with GPS coordinates and client notes without getting blocked by the office geofence.
                  </p>
                </div>
              </label>

              {companySettings.allow_field_work && (
                <label className="flex items-center gap-3 cursor-pointer pl-2">
                  <input
                    type="checkbox"
                    checked={companySettings.require_field_note}
                    onChange={e => setCompanySettings(c => ({ ...c, require_field_note: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Require Client / Site Name & Visit Purpose when clocking in from the field
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Multi-Branch Office Locations & Project Sites */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold text-slate-800 text-base">Office Branches & Project Sites ({companySettings.office_locations.length})</h3>
                <p className="text-xs text-slate-500 mt-0.5">Staff will be validated against the closest active branch or site perimeter</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddBranch(true)
                  setDetectFeedback('')
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Branch / Site
              </button>
            </div>

            {/* Geofence master toggle */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={companySettings.enable_geofencing}
                  onChange={e => setCompanySettings(c => ({ ...c, enable_geofencing: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-semibold text-blue-900">Enforce GPS Geofencing for Office Clock-in</span>
                  <p className="text-xs text-blue-700 mt-0.5">
                    When active, employees choosing "Office Work" must be within the designated radius of at least one active branch/site.
                  </p>
                </div>
              </label>
            </div>

            {/* List of Branches */}
            <div className="space-y-2.5 pt-1">
              {companySettings.office_locations.map((loc, idx) => (
                <div key={loc.id || idx} className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{loc.name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${loc.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {loc.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        Lat: {loc.lat}, Lng: {loc.lng} · <strong className="text-slate-700">Radius: {loc.radius_meters || 100}m</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleToggleLocationActive(loc.id)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        loc.is_active !== false ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {loc.is_active !== false ? 'Deactivate' : 'Activate'}
                    </button>
                    {companySettings.office_locations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLocation(loc.id)}
                        className="text-slate-300 hover:text-red-500 p-1 transition-colors"
                        title="Delete branch"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save Button for Attendance & Geofencing Settings */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h4 className="text-xs font-bold text-slate-800">Save Attendance & Geofencing Rules</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Applies work hours, lateness grace threshold, off-site field permissions, and geofence enforcement.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-xs self-start sm:self-auto flex items-center gap-1.5 ${
                saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {saved ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Settings Saved</span>
                </>
              ) : (
                <span>Save Attendance & Geofencing Settings</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Add New Branch / Site Modal ── */}
      {showAddBranch && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAddBranch(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Add Office Branch or Project Site</h3>
                <p className="text-xs text-slate-500 mt-0.5">Register GPS coordinates and boundary perimeter for clock-in</p>
              </div>
              <button onClick={() => setShowAddBranch(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Branch / Site Name</label>
                <input
                  type="text"
                  placeholder="e.g. Abuja Regional Office or Epe Project Site"
                  value={newBranch.name}
                  onChange={e => setNewBranch({ ...newBranch, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={newBranch.lat}
                    onChange={e => setNewBranch({ ...newBranch, lat: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={newBranch.lng}
                    onChange={e => setNewBranch({ ...newBranch, lng: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Allowed Radius (Meters)</label>
                <input
                  type="number"
                  min="20"
                  max="5000"
                  value={newBranch.radius_meters}
                  onChange={e => setNewBranch({ ...newBranch, radius_meters: parseInt(e.target.value, 10) || 100 })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Recommended: 100m for office buildings, 200m–500m for large construction/project sites.</span>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleDetectGPSForNewBranch}
                  disabled={detectingNewBranch}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                  {detectingNewBranch ? 'Capturing GPS...' : 'Capture Current Location Coordinates'}
                </button>
                {detectFeedback && (
                  <p className="text-xs text-blue-600 mt-1.5 font-medium">{detectFeedback}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddBranch(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddLocation}
                disabled={!newBranch.name.trim() || savingLocation}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingLocation ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Branch...</span>
                  </>
                ) : (
                  <span>Save Branch / Site</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Departments */}
      {tab === 'departments' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-xl">
          <h3 className="font-display font-semibold text-slate-800 mb-5">Departments ({depts.length})</h3>
          
          {deptError && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {deptError}
            </div>
          )}

          {loadingDepts ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-5">
                {depts.map(d => (
                  <div key={d.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-100 hover:border-slate-200 group">
                    {editingDeptId === d.id ? (
                      <input
                        autoFocus
                        value={editingDeptName}
                        onChange={e => setEditingDeptName(e.target.value)}
                        onBlur={saveRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveRename()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelEditing()
                          }
                        }}
                        className="flex-1 px-2 py-1 text-sm rounded border border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    ) : (
                      <span 
                        onClick={() => startEditing(d)}
                        className="text-sm text-slate-700 cursor-pointer hover:text-blue-600 transition-colors"
                      >
                        {d.name}
                      </span>
                    )}
                    <button
                      onClick={() => deleteDept(d.id)}
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ml-2"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newDept}
                  onChange={e => setNewDept(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDept()}
                  placeholder="Add new department..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  onClick={addDept}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Add
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Public Holidays */}
      {tab === 'holidays' && (
        <div className="space-y-6 max-w-4xl">
          {/* Header & Quick Action */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display font-semibold text-slate-800 text-lg flex items-center gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Public Holidays & Observances
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Public holidays are recognized as paid non-working days. They automatically deduct from monthly required working days and prevent false absence penalties.
                </p>
              </div>
              <button
                onClick={() => setShowAddHoliday(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 self-start sm:self-auto transition-colors shadow-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Declare Holiday
              </button>
            </div>

            {/* Metric Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider block">Statutory Holidays</span>
                <span className="text-2xl font-bold font-mono-data text-blue-900 mt-1 block">{getDefaultPublicHolidays(new Date().getFullYear()).length}</span>
                <span className="text-xs text-blue-600 mt-0.5 block">National gazetted holidays</span>
              </div>
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
                <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">Declared Company Holidays</span>
                <span className="text-2xl font-bold font-mono-data text-emerald-900 mt-1 block">{customHolidays.length}</span>
                <span className="text-xs text-emerald-600 mt-0.5 block">Ad-hoc & company observances</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">Attendance Rule</span>
                <span className="text-sm font-medium text-slate-800 mt-2 block flex items-center gap-1.5">
                  <svg className="text-emerald-600 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  0% Absence Penalty
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">Paid off / Working day deducted</span>
              </div>
            </div>
          </div>

          {/* Custom Declared Holidays */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h4 className="font-semibold text-slate-800 text-sm mb-4 flex items-center justify-between">
              <span>Company Declared & Ad-Hoc Public Holidays</span>
              <span className="text-xs text-slate-400 font-normal">{customHolidays.length} active</span>
            </h4>

            {customHolidays.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <svg className="mx-auto text-slate-300 mb-2" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <p className="text-sm text-slate-600 font-medium">No custom public holidays declared yet</p>
                <p className="text-xs text-slate-400 mt-1">Add government-declared public holidays or company work-free days here.</p>
                <button
                  onClick={() => setShowAddHoliday(true)}
                  className="mt-3 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-white transition-colors"
                >
                  + Add Custom Holiday
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left">
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Holiday Name</th>
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                      <th className="py-2.5 px-3 text-right text-xs font-semibold text-slate-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {customHolidays.map(h => (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-medium text-slate-800">{h.name}</td>
                        <td className="py-3 px-3 text-slate-600 font-mono-data text-xs">{h.holiday_date}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${h.is_recurring ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {h.is_recurring ? 'Annual Recurring' : 'Single Event'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-xs">{h.description || '—'}</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleDeleteHoliday(h.id)}
                            className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
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

          {/* Statutory Default Holidays */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h4 className="font-semibold text-slate-800 text-sm mb-4 flex items-center justify-between">
              <span>National Statutory Public Holidays (Automatic)</span>
              <span className="text-xs text-slate-400 font-normal">Built-in calendar</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Holiday Name</th>
                    <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Standard Date</th>
                    <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase">Official Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {getDefaultPublicHolidays(new Date().getFullYear()).map(h => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-medium text-slate-800">{h.name}</td>
                      <td className="py-3 px-3 text-slate-600 font-mono-data text-xs">{h.holiday_date}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                          Active & Paid Off
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-xs">{h.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Declare Holiday Modal */}
          {showAddHoliday && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 anim-fade-up">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-semibold text-slate-800 text-base">Declare Public Holiday</h3>
                  <button
                    onClick={() => setShowAddHoliday(false)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Holiday Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Eid-el-Fitr, Good Friday, Inauguration Day"
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
                      id="is-recurring-holiday"
                      checked={newHoliday.is_recurring}
                      onChange={e => setNewHoliday(h => ({ ...h, is_recurring: e.target.checked }))}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="is-recurring-holiday" className="text-xs text-slate-700 cursor-pointer">
                      Repeats annually on this date
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Description / Notes</label>
                    <textarea
                      placeholder="e.g. Federal Government declared public holiday for celebration..."
                      value={newHoliday.description}
                      onChange={e => setNewHoliday(h => ({ ...h, description: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setShowAddHoliday(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddHoliday}
                    disabled={!newHoliday.name.trim() || !newHoliday.holiday_date}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                  >
                    Save Holiday
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roles */}
      {tab === 'roles' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl">
          <h3 className="font-display font-semibold text-slate-800 mb-5">Role Permissions Matrix</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Permission</th>
                  {['Super Admin', 'HR', 'Accountant', 'Auditor', 'Staff'].map(r => (
                    <th key={r} className="py-2 px-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  { perm: 'View Staff Records', sa: true, hr: true, ac: false, au: true, st: false },
                  { perm: 'Edit Staff Records', sa: true, hr: true, ac: false, au: false, st: false },
                  { perm: 'Create/Delete Users', sa: true, hr: false, ac: false, au: false, st: false },
                  { perm: 'Run Payroll', sa: true, hr: false, ac: true, au: false, st: false },
                  { perm: 'View Payroll', sa: true, hr: true, ac: true, au: true, st: false },
                  { perm: 'Generate ID Cards', sa: true, hr: true, ac: false, au: false, st: false },
                  { perm: 'View Own Payslips', sa: true, hr: true, ac: true, au: true, st: true },
                  { perm: 'View Audit Log', sa: true, hr: false, ac: false, au: true, st: false },
                  { perm: 'Flag Records', sa: true, hr: true, ac: true, au: true, st: false },
                  { perm: 'System Settings', sa: true, hr: false, ac: false, au: false, st: false },
                ].map(row => (
                  <tr key={row.perm} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-700">{row.perm}</td>
                    {[row.sa, row.hr, row.ac, row.au, row.st].map((v, i) => (
                      <td key={i} className="py-2.5 px-3 text-center">
                        {v
                          ? <svg className="text-emerald-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                          : <span className="text-slate-200">—</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Branding */}
      {tab === 'branding' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-xl">
          <h3 className="font-display font-semibold text-slate-800 mb-5">Branding Assets</h3>
          
          {companyError && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {companyError}
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-3">Company Logo (for ID cards & documents)</label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center bg-slate-50 overflow-hidden">
                  {companySettings.logo_url ? (
                    <img 
                      src={companySettings.logo_url} 
                      alt="Company Logo" 
                      className="w-full h-full object-cover"
                    />
                  ) : uploadingLogo ? (
                    <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  ) : (
                    <>
                      <svg className="text-slate-300 mb-1" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <span className="text-xs text-slate-400">No logo</span>
                    </>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="logo-upload"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    disabled={uploadingLogo}
                  />
                  <label
                    htmlFor="logo-upload"
                    className="inline-block px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  </label>
                  <p className="text-xs text-slate-400 mt-1.5">PNG or SVG, max 2MB, min 200×200px</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Primary Brand Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={companySettings.primary_color}
                  onChange={e => setCompanySettings(c => ({ ...c, primary_color: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" 
                />
                <input 
                  value={companySettings.primary_color}
                  onChange={e => setCompanySettings(c => ({ ...c, primary_color: e.target.value }))}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono-data focus:outline-none focus:border-blue-400" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Accent Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={companySettings.accent_color}
                  onChange={e => setCompanySettings(c => ({ ...c, accent_color: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" 
                />
                <input 
                  value={companySettings.accent_color}
                  onChange={e => setCompanySettings(c => ({ ...c, accent_color: e.target.value }))}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono-data focus:outline-none focus:border-blue-400" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Document Footer Text</label>
              <input
                value={companySettings.footer_text}
                onChange={e => setCompanySettings(c => ({ ...c, footer_text: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
