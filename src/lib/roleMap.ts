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
  const appRole = ROLE_MAP[dbRole]
  if (!appRole) {
    throw new Error(`Unrecognized database role: ${dbRole}`)
  }
  return appRole
}

export function appRoleToDb(appRole: Role): string {
  return REVERSE_ROLE_MAP[appRole]
}
