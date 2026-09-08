/**
 * Statutory and custom Public Holidays helper for Firstoption HRIS
 */

export interface PublicHoliday {
  id: string
  name: string
  holiday_date: string // 'YYYY-MM-DD'
  is_recurring?: boolean
  description?: string
}

/**
 * Default statutory Nigerian public holidays (with dynamic calculations for current and surrounding years)
 */
export function getDefaultPublicHolidays(year: number): PublicHoliday[] {
  return [
    {
      id: `hol-new-year-${year}`,
      name: "New Year's Day",
      holiday_date: `${year}-01-01`,
      is_recurring: true,
      description: 'Statutory national holiday',
    },
    {
      id: `hol-workers-day-${year}`,
      name: "Workers' Day",
      holiday_date: `${year}-05-01`,
      is_recurring: true,
      description: 'International Workers Day',
    },
    {
      id: `hol-democracy-day-${year}`,
      name: 'Democracy Day',
      holiday_date: `${year}-06-12`,
      is_recurring: true,
      description: 'National Democracy Day',
    },
    {
      id: `hol-independence-day-${year}`,
      name: 'Independence Day',
      holiday_date: `${year}-10-01`,
      is_recurring: true,
      description: 'National Independence Day',
    },
    {
      id: `hol-christmas-${year}`,
      name: 'Christmas Day',
      holiday_date: `${year}-12-25`,
      is_recurring: true,
      description: 'Christmas Day celebration',
    },
    {
      id: `hol-boxing-day-${year}`,
      name: 'Boxing Day',
      holiday_date: `${year}-12-26`,
      is_recurring: true,
      description: 'Boxing Day statutory holiday',
    },
  ]
}

/**
 * Checks if a specific date ('YYYY-MM-DD') is a public holiday
 */
export function isPublicHoliday(
  dateStr: string,
  holidays: PublicHoliday[] = []
): PublicHoliday | null {
  if (!dateStr) return null
  const [yStr, mStr, dStr] = dateStr.split('-')
  const year = parseInt(yStr, 10)
  const allHolidays = [...getDefaultPublicHolidays(year), ...holidays]

  for (const h of allHolidays) {
    if (h.holiday_date === dateStr) {
      return h
    }
    // Match recurring month and day
    if (h.is_recurring && h.holiday_date) {
      const parts = h.holiday_date.split('-')
      if (parts[1] === mStr && parts[2] === dStr) {
        return h
      }
    }
  }
  return null
}

/**
 * Calculates standard working days in a month (excluding weekends and weekday public holidays)
 */
export function calculateWorkingDaysInMonth(
  year: number,
  month: number,
  holidays: PublicHoliday[] = []
): { totalWorkingDays: number; holidayCountOnWeekdays: number } {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let workingDays = 0
  let holidayCount = 0

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = new Date(year, month, d).getDay()
    const isWeekend = dow === 0 || dow === 6

    if (!isWeekend) {
      const holiday = isPublicHoliday(dateStr, holidays)
      if (holiday) {
        holidayCount++
      } else {
        workingDays++
      }
    }
  }

  return { totalWorkingDays: workingDays, holidayCountOnWeekdays: holidayCount }
}
