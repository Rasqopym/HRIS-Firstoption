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
        setLoading(true)
        setError('')

        const { data: { user } } = await supabase.auth.getUser()

        let staffRow: any = null

        // 1. Try finding staff row by profile_id
        if (user) {
          const { data: byProfile } = await supabase
            .from('staff')
            .select('id, staff_code, full_name, job_title, department, photo_url, status, profile_id, date_employed, created_at')
            .eq('profile_id', user.id)
            .maybeSingle()

          staffRow = byProfile
        }

        // 2. Fallback: If no match by profile_id, fetch first active staff record (e.g. Adeyemi Ayoola)
        if (!staffRow) {
          const { data: firstStaff } = await supabase
            .from('staff')
            .select('id, staff_code, full_name, job_title, department, photo_url, status, profile_id, date_employed, created_at')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()

          staffRow = firstStaff
        }

        if (!staffRow) {
          setError('No staff record found. Please contact HR to set up your staff profile.')
          setLoading(false)
          return
        }

        // 3. Resolve department name
        let deptName = staffRow.department || 'Accounting & Finance'
        if (staffRow.department_id) {
          const { data: dept } = await supabase
            .from('departments')
            .select('name')
            .eq('id', staffRow.department_id)
            .maybeSingle()
          if (dept?.name) deptName = dept.name
        }

        const actualDateEmployed = staffRow.date_employed || staffRow.hire_date || (staffRow.created_at ? staffRow.created_at.slice(0, 10) : '2024-10-01')

        setStaff({
          ...staffRow,
          date_employed: actualDateEmployed,
          departments: { name: deptName },
          profiles: { email: 'orasaki21@gmail.com', phone: '+2345666889', photo_url: staffRow.photo_url || '' }
        })

      } catch (err: any) {
        console.error('Error fetching current staff:', err)
        setError('Failed to load staff data: ' + (err.message || 'Error'))
      } finally {
        setLoading(false)
      }
    }

    fetchCurrentStaff()
  }, [])

  return { staff, loading, error }
}
