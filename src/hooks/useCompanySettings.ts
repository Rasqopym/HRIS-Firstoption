import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface CompanySettings {
  name: string
  logo_url: string
  subtitle: string
  footer_text: string
  phone: string
  email: string
  address: string
  website: string
  rc_number: string
  primary_color: string
  accent_color: string
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  name: 'Firstoption',
  logo_url: '',
  subtitle: 'HRIS Platform',
  footer_text: '© 2026 Firstoption',
  phone: '+234 800 000 0000',
  email: 'info@firstoption.com',
  address: 'Lagos, Nigeria',
  website: 'www.firstoption.com',
  rc_number: 'RC123456',
  primary_color: '#1e3a5f',
  accent_color: '#2563eb',
}

const STORAGE_KEY = 'hris_company_settings'
const UPDATE_EVENT = 'hris_company_settings_updated'

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) {
        return { ...DEFAULT_COMPANY_SETTINGS, ...JSON.parse(cached) }
      }
    } catch (e) {}
    return DEFAULT_COMPANY_SETTINGS
  })
  const [loading, setLoading] = useState(true)

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      if (!error && data) {
        const merged: CompanySettings = {
          name: data.name || DEFAULT_COMPANY_SETTINGS.name,
          logo_url: data.logo_url || '',
          subtitle: data.subtitle || (data.industry ? (data.industry.toLowerCase().includes('hris') ? data.industry : `${data.industry} HRIS`) : DEFAULT_COMPANY_SETTINGS.subtitle),
          footer_text: data.footer_text ? data.footer_text.replace(/\s*support\s*services/gi, '') : `© ${new Date().getFullYear()} ${data.name || 'Firstoption'}`,
          phone: data.phone || DEFAULT_COMPANY_SETTINGS.phone,
          email: data.email || DEFAULT_COMPANY_SETTINGS.email,
          address: data.address || DEFAULT_COMPANY_SETTINGS.address,
          website: data.website || DEFAULT_COMPANY_SETTINGS.website,
          rc_number: data.rc_number || DEFAULT_COMPANY_SETTINGS.rc_number,
          primary_color: data.primary_color || DEFAULT_COMPANY_SETTINGS.primary_color,
          accent_color: data.accent_color || DEFAULT_COMPANY_SETTINGS.accent_color,
        }

        setSettings(merged)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
        } catch (e) {}
      }
    } catch (err) {
      console.warn('Error fetching company settings:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()

    // Listen for custom event when settings are saved in System Settings page
    const handleUpdate = () => {
      try {
        const cached = localStorage.getItem(STORAGE_KEY)
        if (cached) {
          setSettings({ ...DEFAULT_COMPANY_SETTINGS, ...JSON.parse(cached) })
        }
      } catch (e) {}
    }

    window.addEventListener(UPDATE_EVENT, handleUpdate)
    window.addEventListener('storage', handleUpdate)

    return () => {
      window.removeEventListener(UPDATE_EVENT, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  return { settings, loading, reload: loadSettings }
}

export function notifyCompanySettingsUpdated(updatedSettings: Partial<CompanySettings>) {
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    const existing = cached ? JSON.parse(cached) : DEFAULT_COMPANY_SETTINGS
    const merged = { ...existing, ...updatedSettings }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    window.dispatchEvent(new Event(UPDATE_EVENT))
  } catch (e) {}
}
