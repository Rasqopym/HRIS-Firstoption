import type { RateType } from '../types'

const RATE_TYPE_MAP: Record<string, RateType> = {
  'flat_amount': 'flat',
  'percentage_of_gross': 'pct_gross',
  'percentage_of_basic': 'pct_basic',
  'per_hour': 'per_hour',
  'per_day': 'per_day',
  'manual_monthly': 'monthly_manual',
}

const REVERSE_RATE_TYPE_MAP: Record<RateType, string> = {
  'flat': 'flat_amount',
  'pct_gross': 'percentage_of_gross',
  'pct_basic': 'percentage_of_basic',
  'per_hour': 'per_hour',
  'per_day': 'per_day',
  'monthly_manual': 'manual_monthly',
}

export function dbRateTypeToApp(dbType: string): RateType {
  const appType = RATE_TYPE_MAP[dbType]
  if (!appType) {
    throw new Error(`Unrecognized database rate type: ${dbType}`)
  }
  return appType
}

export function appRateTypeToDb(appType: RateType): string {
  return REVERSE_RATE_TYPE_MAP[appType]
}
