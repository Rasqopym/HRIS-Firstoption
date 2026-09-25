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
  gross_salary?: number
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
            .select('*, departments(name), profiles(photo_url)')
            .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
            .maybeSingle()

          staffRow = byProfile
        }

        // 2. Try finding staff row by email match
        if (!staffRow && userEmail) {
          const { data: byEmail } = await supabase
            .from('staff')
            .select('*, departments(name), profiles(photo_url)')
            .ilike('email', userEmail.trim())
            .maybeSingle()

          staffRow = byEmail
          if (staffRow && user) {
            // Auto-link staff record to logged in user profile_id
            try {
              await supabase.from('staff').update({ profile_id: user.id }).eq('id', staffRow.id)
            } catch (e) {}
          }
        }

        // 3. Try finding staff row by name match
        if (!staffRow && userFullName && userFullName.trim().length > 2) {
          const { data: byName } = await supabase
            .from('staff')
            .select('*, departments(name), profiles(photo_url)')
            .ilike('full_name', userFullName.trim())
            .maybeSingle()

          staffRow = byName
          if (staffRow && user) {
            try {
              await supabase.from('staff').update({ profile_id: user.id }).eq('id', staffRow.id)
            } catch (e) {}
          }
        }

        // 4. If no staff row exists in DB for this authenticated user, auto-provision or synthesize for THIS user
        if (!staffRow && user) {
          const userRole = userProfile?.role || 'staff'
          const roleTitle = userRole === 'accountant' ? 'Accountant' : userRole === 'hr' ? 'HR Manager' : userRole === 'auditor' ? 'Internal Auditor' : userRole === 'super_admin' ? 'Chief Executive' : 'Staff Member'
          const deptName = userRole === 'accountant' ? 'Accounting & Finance' : userRole === 'hr' ? 'Human Resources' : userRole === 'auditor' ? 'Audit & Compliance' : 'General Operations'
          
          try {
            // Check if department exists
            const { data: dept } = await supabase
              .from('departments')
              .select('id')
              .ilike('name', `%${deptName.split(' ')[0]}%`)
              .limit(1)
              .maybeSingle()

            const newStaffPayload = {
              profile_id: user.id,
              full_name: userFullName || 'Staff Member',
              email: userEmail || user.email || '',
              phone: userPhone || '',
              photo_url: userPhotoUrl || '',
              status: 'active',
              department_id: dept?.id || null,
              gross_salary: userRole === 'accountant' ? 350000 : userRole === 'hr' ? 350000 : userRole === 'super_admin' ? 500000 : 200000,
              date_employed: new Date().toISOString().slice(0, 10),
            }

            const { data: insertedStaff } = await supabase
              .from('staff')
              .insert(newStaffPayload)
              .select('*, departments(name), profiles(photo_url)')
              .maybeSingle()

            if (insertedStaff) {
              staffRow = insertedStaff
            }
          } catch (insertErr) {
            console.warn('Could not auto-insert staff record, using synthesized staff:', insertErr)
          }

          if (!staffRow) {
            const resolvedName = userFullName || (userEmail ? userEmail.split('@')[0].replace(/[._-]/g, ' ') : 'Staff Member')
            staffRow = {
              id: user.id,
              staff_code: 'FO-' + user.id.slice(0, 4).toUpperCase(),
              full_name: resolvedName,
              job_title: roleTitle,
              department: deptName,
              date_employed: new Date().toISOString().slice(0, 10),
              photo_url: userPhotoUrl || '',
              status: 'active',
              profile_id: user.id,
              email: userEmail || '',
              phone: userPhone || '',
              gross_salary: userRole === 'accountant' ? 350000 : 200000,
              departments: { name: deptName },
              profiles: {
                email: userEmail,
                phone: userPhone,
                photo_url: userPhotoUrl
              }
            }
          }
        }

        // 5. Resolve department name
        let deptName = staffRow?.department || 'General Operations'
        if (staffRow?.department_id) {
          const { data: dept } = await supabase
            .from('departments')
            .select('name')
            .eq('id', staffRow.department_id)
            .maybeSingle()
          if (dept?.name) deptName = dept.name
        }

        const actualDateEmployed = staffRow?.date_employed || staffRow?.hire_date || (staffRow?.created_at ? staffRow.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))

        if (staffRow) {
          setStaff({
            ...staffRow,
            full_name: staffRow.full_name || userFullName || 'Staff Member',
            department: deptName,
            date_employed: actualDateEmployed,
            departments: { name: deptName },
            profiles: {
              email: userEmail,
              phone: userPhone,
              photo_url: staffRow.photo_url || userPhotoUrl
            }
          })
        }

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
