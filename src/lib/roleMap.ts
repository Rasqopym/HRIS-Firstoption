import type { Role } from '../types'

const ROLE_MAP: Record<string, Role> = {
  'super_admin': 'superadmin',
  'hr': 'hr',
  'accountant': 'accountant',
  'auditor': 'auditor',
  'staff': 'staff',
}

const REVERSE_ROLE_MAP: Record<Role, string> = {
  'superadmin': 'super_admin',
  'hr': 'hr',
  'accountant': 'accountant',
  'auditor': 'auditor',
  'staff': 'staff',
}

export function dbRoleToApp(dbRole: string): Role {
  if (!dbRole) return 'staff'
  const normalized = String(dbRole).toLowerCase().trim()
  if (normalized === 'superadmin' || normalized === 'super_admin') return 'superadmin'
  if (normalized === 'hr') return 'hr'
  if (normalized === 'accountant') return 'accountant'
  if (normalized === 'auditor') return 'auditor'
  if (normalized === 'staff') return 'staff'
  return ROLE_MAP[dbRole] || 'staff'
}

export function appRoleToDb(appRole: Role): string {
  return REVERSE_ROLE_MAP[appRole]
}
