import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface StaffRecord {
  id: string
  staff_code: string
  full_name: string
  job_title: string
  department_id: string
  date_employed: string
  photo_url: string
  status: string
  profile_id: string
  departments?: { name: string }
  profiles?: { email: string; phone: string; photo_url: string }
}

export function useCurrentStaff() {
  const [staff, setStaff] = useState<StaffRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchCurrentStaff = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        const { data: staffData, error: staffError } = await supabase
          .from('staff')
          .select('id, staff_code, full_name, job_title, department_id, date_employed, photo_url, status, profile_id, departments (name), profiles (email, phone, photo_url)')
          .eq('profile_id', user.id)
          .single()

        if (staffError) {
          if (staffError.code === 'PGRST116') {
            // No staff record found for this user
            setError('No staff record found')
          } else {
            throw staffError
          }
        }

        setStaff(staffData as StaffRecord | null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load staff data')
        console.error('Error fetching current staff:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCurrentStaff()
  }, [])

  return { staff, loading, error }
}
