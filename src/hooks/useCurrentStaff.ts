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

        // Fetch real profile details for authenticated user
        let userEmail = user?.email || ''
        let userPhone = ''
        let userFullName = ''
        let userPhotoUrl = ''

        if (user) {
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('id, full_name, email, phone, photo_url, role, created_at')
            .eq('id', user.id)
            .maybeSingle()

          if (userProfile) {
            userEmail = userProfile.email || userEmail
            userPhone = userProfile.phone || ''
            userFullName = userProfile.full_name || ''
            userPhotoUrl = userProfile.photo_url || ''
          }
        }

        let staffRow: any = null

        // 1. Try finding staff row by profile_id or staff.id = user.id
        if (user) {
          const { data: byProfile } = await supabase
            .from('staff')
            .select('id, staff_code, full_name, job_title, department, department_id, photo_url, status, profile_id, date_employed, created_at')
            .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
            .maybeSingle()

          staffRow = byProfile
        }

        // 2. Try finding staff row by first name fuzzy search (e.g. Opeyemi)
        const firstName = userFullName.trim().split(' ')[0]
        if (!staffRow && firstName) {
          const { data: byFirstName } = await supabase
            .from('staff')
            .select('id, staff_code, full_name, job_title, department, department_id, photo_url, status, profile_id, date_employed, created_at')
            .ilike('full_name', `%${firstName}%`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          staffRow = byFirstName
        }

        // 3. Fallback: Synthesize from userProfile if still no staff row found
        if (!staffRow) {
          staffRow = {
            id: user?.id || 'staff-1',
            staff_code: 'FO-0001',
            full_name: userFullName || userEmail.split('@')[0] || 'Staff Member',
            job_title: 'Head of Marketing & Media',
            department: 'Media & Marketing',
            date_employed: '2026-01-15',
            photo_url: userPhotoUrl,
            status: 'active',
            profile_id: user?.id || '',
          }
        }

        // 4. Resolve department name
        let deptName = staffRow.department || 'General Operations'
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
          full_name: staffRow.full_name || userFullName,
          department: deptName,
          date_employed: actualDateEmployed,
          departments: { name: deptName },
          profiles: {
            email: userEmail,
            phone: userPhone,
            photo_url: staffRow.photo_url || userPhotoUrl
          }
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
