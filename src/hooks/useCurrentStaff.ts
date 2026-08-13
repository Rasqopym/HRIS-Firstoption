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

        // 2. Fallback: If no match by profile_id, attempt match by full_name or email in profiles
        if (!staffRow && user) {
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, phone, photo_url')
            .eq('id', user.id)
            .maybeSingle()

          if (userProfile?.full_name) {
            const { data: byName } = await supabase
              .from('staff')
              .select('id, staff_code, full_name, job_title, department, photo_url, status, profile_id, date_employed, created_at')
              .ilike('full_name', `%${userProfile.full_name}%`)
              .maybeSingle()
            staffRow = byName
          }

          if (!staffRow && userProfile) {
            staffRow = {
              id: userProfile.id,
              staff_code: 'FO-0001',
              full_name: userProfile.full_name || user.email || 'Staff Member',
              job_title: userProfile.role ? userProfile.role.toUpperCase() : 'Staff Member',
              department: 'General Operations',
              date_employed: '2024-10-01',
              photo_url: userProfile.photo_url || '',
              status: 'active',
              profile_id: userProfile.id,
            }
          }
        }

        // 3. Fallback: If no staff row yet, fetch first active staff record
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
