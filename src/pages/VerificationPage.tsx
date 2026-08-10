import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface StaffVerification {
  full_name: string
  job_title: string
  department_name: string
  photo_url: string
  status: string
  staff_code: string
  id_card_expires_at: string | null
}

export default function VerificationPage() {
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<StaffVerification | null>(null)
  const [expired, setExpired] = useState(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    const verifyCode = async () => {
      try {
        // Extract verification code from URL path
        const path = window.location.pathname
        const match = path.match(/^\/verify\/(.+)$/)
        const code = match ? decodeURIComponent(match[1]) : null

        if (!code) {
          setInvalid(true)
          setLoading(false)
          return
        }

        // Query staff table with the verification code
        // NOTE: This requires an RLS policy on the staff table to allow anonymous (public) read access
        // to these specific safe fields for verification purposes. The policy should allow:
        // - SELECT on staff table for anon role
        // - Only these columns: full_name, job_title, department_id, photo_url, status, staff_code, id_card_expires_at
        // - Filter: id_verification_code matches the provided code
        const { data, error } = await supabase
          .from('staff')
          .select(`
            full_name,
            job_title,
            department_id,
            departments (name),
            photo_url,
            status,
            staff_code,
            id_card_expires_at
          `)
          .eq('id_verification_code', code)
          .single()

        if (error || !data) {
          setInvalid(true)
          setLoading(false)
          return
        }

        // Check if card is expired
        const expiresAt = data.id_card_expires_at ? new Date(data.id_card_expires_at) : null
        const isExpired = expiresAt ? expiresAt < new Date() : false

        setStaff({
          full_name: data.full_name,
          job_title: data.job_title,
          department_name: (data.departments as any)?.name || 'Unknown',
          photo_url: data.photo_url || '',
          status: data.status,
          staff_code: data.staff_code,
          id_card_expires_at: data.id_card_expires_at,
        })
        setExpired(isExpired)
      } catch (err) {
        console.error('Error verifying code:', err)
        setInvalid(true)
      } finally {
        setLoading(false)
      }
    }

    verifyCode()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">Verifying credential...</p>
        </div>
      </div>
    )
  }

  if (invalid || !staff || staff.status !== 'active') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Invalid Credential</h1>
          <p className="text-slate-500 text-sm">Not a valid Firstoption staff credential</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-display font-bold text-sm">FO</span>
            </div>
            <div>
              <div className="font-display font-semibold text-slate-800 text-sm">Firstoption</div>
              <div className="text-blue-600 text-xs">Staff Verification</div>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className={`mb-4 px-3 py-2 rounded-lg text-center font-medium text-sm ${
          expired 
            ? 'bg-amber-100 text-amber-700' 
            : 'bg-emerald-100 text-emerald-700'
        }`}>
          {expired ? (
            <span className="flex items-center justify-center gap-2">
              <span>⚠</span>
              <span>Card Expired</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>✓</span>
              <span>Valid Firstoption Staff</span>
            </span>
          )}
        </div>

        {/* Staff Photo */}
        <div className="flex justify-center mb-4">
          <img
            src={staff.photo_url || `https://i.pravatar.cc/150?u=${staff.staff_code}`}
            alt={staff.full_name}
            className="w-24 h-24 rounded-full object-cover border-4 border-slate-100"
          />
        </div>

        {/* Staff Details */}
        <div className="space-y-3">
          <div className="text-center">
            <h2 className="font-display font-bold text-slate-800 text-lg">{staff.full_name}</h2>
            <p className="text-slate-500 text-sm">{staff.job_title}</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Department</span>
              <span className="font-medium text-slate-800">{staff.department_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Staff ID</span>
              <span className="font-mono-data font-medium text-slate-800">{staff.staff_code}</span>
            </div>
            {staff.id_card_expires_at && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Card Expires</span>
                <span className={`font-medium ${expired ? 'text-amber-600' : 'text-slate-800'}`}>
                  {new Date(staff.id_card_expires_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            Verified at {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
