/**
 * Utility helpers for GPS Geofencing, Multi-Branch matching, and Lateness calculations
 */

export interface OfficeLocation {
  id: string
  name: string
  lat: number
  lng: number
  radius_meters: number
  is_active?: boolean
}

/**
 * Calculates distance between two GPS coordinates in meters using the Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3 // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return Math.round(R * c)
}

/**
 * Finds the closest office/site branch to user and checks if user is within its perimeter
 */
export function findNearestLocation(
  userLat: number,
  userLng: number,
  locations: OfficeLocation[]
): { nearest: OfficeLocation | null; distance: number; isWithinRadius: boolean } {
  const activeLocations = (locations || []).filter(l => l.is_active !== false && l.lat && l.lng)
  if (activeLocations.length === 0) {
    return { nearest: null, distance: 0, isWithinRadius: true }
  }

  let minDistance = Infinity
  let nearestLoc: OfficeLocation | null = null

  for (const loc of activeLocations) {
    const dist = calculateDistanceMeters(userLat, userLng, loc.lat, loc.lng)
    if (dist < minDistance) {
      minDistance = dist
      nearestLoc = loc
    }
  }

  if (!nearestLoc) {
    return { nearest: null, distance: 0, isWithinRadius: true }
  }

  return {
    nearest: nearestLoc,
    distance: minDistance,
    isWithinRadius: minDistance <= (nearestLoc.radius_meters || 100),
  }
}

/**
 * Evaluates lateness against work start time + grace period
 * @param clockInDate Date object representing clock in time
 * @param workStartTime string e.g. "08:00" or "08:30"
 * @param gracePeriodMinutes number of minutes allowed before marked late (e.g. 15)
 * @returns { isLate: boolean, lateMinutes: number }
 */
export function evaluateLateness(
  clockInDate: Date,
  workStartTime: string = '08:00',
  gracePeriodMinutes: number = 15
): { isLate: boolean; lateMinutes: number } {
  const [startHourStr, startMinStr] = workStartTime.split(':')
  const startHour = parseInt(startHourStr || '8', 10)
  const startMin = parseInt(startMinStr || '0', 10)

  const officialStart = new Date(clockInDate)
  officialStart.setHours(startHour, startMin, 0, 0)

  const graceThreshold = new Date(officialStart.getTime() + gracePeriodMinutes * 60 * 1000)

  if (clockInDate > graceThreshold) {
    const diffMs = clockInDate.getTime() - officialStart.getTime()
    const lateMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)))
    return { isLate: true, lateMinutes }
  }

  return { isLate: false, lateMinutes: 0 }
}

/**
 * Formats time to 12-hour AM/PM string e.g. "08:42 AM"
 */
export function formatTime12Hour(timeStrOrDate?: string | Date | null): string {
  if (!timeStrOrDate) return '—'
  let date: Date
  if (typeof timeStrOrDate === 'string') {
    if (timeStrOrDate.includes('T')) {
      date = new Date(timeStrOrDate)
    } else if (timeStrOrDate.includes(':')) {
      const parts = timeStrOrDate.split(':')
      date = new Date()
      date.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || '0', 10))
    } else {
      return timeStrOrDate
    }
  } else {
    date = timeStrOrDate
  }

  if (isNaN(date.getTime())) return String(timeStrOrDate)

  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Formats distance in meters or kilometers
 */
export function formatDistance(meters?: number | null): string {
  if (meters === undefined || meters === null) return '—'
  if (meters < 1000) return `${meters}m`
  return `${(meters / 1000).toFixed(2)}km`
}
