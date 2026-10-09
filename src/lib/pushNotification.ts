export interface PushReminderOptions {
  title: string
  body: string
  tag?: string
  icon?: string
  badge?: string
  url?: string
  data?: any
}

// Request push notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser environment.')
    return 'denied'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  try {
    const permission = await Notification.requestPermission()
    return permission
  } catch (e) {
    console.warn('Error requesting notification permission:', e)
    return Notification.permission
  }
}

// Send local/native push notification (via Service Worker if active or native fallback)
export async function sendLocalNotification(options: PushReminderOptions) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false
  }

  const notificationOptions: NotificationOptions = {
    body: options.body,
    icon: options.icon || '/pwa-192x192.svg',
    badge: options.badge || '/favicon.svg',
    tag: options.tag || `remind-${Date.now()}`,
    data: {
      url: options.url || '/',
      ...options.data
    }
  }

  try {
    // Try to trigger through active Service Worker registration
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(options.title, notificationOptions)
        return true
      }
    }

    // Direct Notification fallback
    new Notification(options.title, notificationOptions)
    return true
  } catch (e) {
    console.warn('Notification trigger error:', e)
    return false
  }
}

export interface ConfirmationInfo {
  isDueForConfirmation: boolean
  confirmationDueDate: string
  daysRemaining: number
  isOverdue: boolean
}

// Calculate if staff is within 3-month probation / due for confirmation
export function getStaffConfirmationStatus(dateEmployedStr?: string): ConfirmationInfo | null {
  if (!dateEmployedStr) return null

  try {
    const empDate = new Date(dateEmployedStr)
    if (isNaN(empDate.getTime())) return null

    // Confirmation target is exactly 3 months from employment date
    const confirmationDate = new Date(empDate)
    confirmationDate.setMonth(confirmationDate.getMonth() + 3)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    confirmationDate.setHours(0, 0, 0, 0)

    const diffTime = confirmationDate.getTime() - today.getTime()
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    const isDueForConfirmation = daysRemaining <= 30 && daysRemaining >= -30
    const isOverdue = daysRemaining < 0

    return {
      isDueForConfirmation,
      confirmationDueDate: confirmationDate.toISOString().split('T')[0],
      daysRemaining,
      isOverdue
    }
  } catch (e) {
    return null
  }
}

// Routine reminders check (clock-in, clock-out, pending tasks, and staff 3-month confirmation)
export function runRoutineReminders(role: string, customHolidays: any[] = [], currentStaffId?: string | null) {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const dow = now.getDay()
  const todayStr = now.toISOString().split('T')[0]

  // Avoid repetitive notifications on the same day by storing reminder keys
  const getReminded = (key: string) => localStorage.getItem(`hris_remind_${key}_${todayStr}`)
  const setReminded = (key: string) => localStorage.setItem(`hris_remind_${key}_${todayStr}`, 'true')

  // Check live attendance status from localStorage for the current staff member
  let isClockedInToday = false
  let isClockedOutToday = false
  if (currentStaffId) {
    const keys = [
      `hris_self_attendance_${currentStaffId}`,
      `hris_attendance_daily_${currentStaffId}`
    ]
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed[todayStr]) {
            const rec = parsed[todayStr]
            if (rec.clock_in_time || rec.clockInTime) isClockedInToday = true
            if (rec.clock_out_time || rec.clockOutTime) isClockedOutToday = true
          }
        }
      } catch {}
    }
  }

  // 1. Staff Morning Clock-In Reminder (8:00 AM - 9:30 AM on weekdays)
  // Only remind if they haven't already clocked in today
  if (dow !== 0 && dow !== 6) {
    if (!isClockedInToday && (hours === 8 || (hours === 9 && minutes <= 30)) && !getReminded('morning_clockin')) {
      sendLocalNotification({
        title: 'Good Morning! ⏰ Shift Clock-In',
        body: 'Remember to clock in for your workday shift and verify your workplace location.',
        tag: 'morning-clockin',
        url: '/#st-attendance'
      })
      setReminded('morning_clockin')
    }

    // 2. Evening Clock-Out Reminders (Only for staff who clocked in but haven't clocked out)
    if (isClockedInToday && !isClockedOutToday) {
      // A. Shift End Alert (4:55 PM - 5:25 PM)
      if (((hours === 16 && minutes >= 55) || (hours === 17 && minutes <= 25)) && !getReminded('closing_clockout')) {
        sendLocalNotification({
          title: 'Workday Closing: Clock-Out Reminder ⏰',
          body: 'Ready to head out? Remember to clock out on your dashboard before leaving the office.',
          tag: 'closing-clockout',
          url: '/#st-attendance'
        })
        setReminded('closing_clockout')
      }

      // B. Second Nudge if still clocked in after hours (6:00 PM - 6:45 PM)
      if ((hours === 18 && minutes >= 0 && minutes <= 45) && !getReminded('evening_still_in')) {
        sendLocalNotification({
          title: 'Still Clocked In? 🕒',
          body: 'You are currently still clocked in for today. If you have finished work, please remember to clock out!',
          tag: 'evening-still-in',
          url: '/#st-attendance'
        })
        setReminded('evening_still_in')
      }

      // C. Late Evening Final Notice before auto-clockout cutoff (8:00 PM - 8:45 PM)
      if ((hours === 20 && minutes >= 0 && minutes <= 45) && !getReminded('night_pending_clockout')) {
        sendLocalNotification({
          title: 'Unclosed Shift Notice ⚠️',
          body: 'You have not clocked out today. Open shifts will be automatically closed at official close (5:00 PM).',
          tag: 'night-pending-clockout',
          url: '/#st-attendance'
        })
        setReminded('night_pending_clockout')
      }
    }
  }

  // 2. HR & Admin Approvals Reminder (Pending leaves & overtime)
  if ((role === 'hr' || role === 'superadmin') && hours >= 9 && hours <= 17) {
    if (!getReminded('hr_pending_approvals')) {
      const cachedDaily = localStorage.getItem('hris_pending_actions_count')
      const count = cachedDaily ? parseInt(cachedDaily) : 0
      if (count > 0) {
        sendLocalNotification({
          title: 'Pending Staff Actions Awaiting Review',
          body: `You have ${count} pending staff leave request(s) or overtime logs requiring your attention.`,
          tag: 'hr-approvals',
          url: '/#hr-leave-mgmt'
        })
        setReminded('hr_pending_approvals')
      }
    }
  }

  // 3. Staff 3-Month Confirmation Reminders (HR, Superadmin & Staff)
  const cachedConfirmationList = localStorage.getItem('hris_staff_confirmations_due')
  if (cachedConfirmationList && !getReminded('confirmation_due')) {
    try {
      const dueList: Array<{ name: string; staffCode: string; daysRemaining: number }> = JSON.parse(cachedConfirmationList)
      if (dueList.length > 0) {
        if (role === 'hr' || role === 'superadmin') {
          const names = dueList.slice(0, 2).map(s => s.name).join(', ')
          sendLocalNotification({
            title: 'Staff Confirmation Due (3-Month Milestone)',
            body: `${dueList.length} employee(s) (${names}${dueList.length > 2 ? '...' : ''}) are due for employment confirmation. Review performance and confirm.`,
            tag: 'staff-confirmation-hr',
            url: '/#hr-directory'
          })
          setReminded('confirmation_due')
        } else if (role === 'staff') {
          const myDue = localStorage.getItem('hris_self_confirmation_due')
          if (myDue === 'true' && !getReminded('self_confirmation_due')) {
            sendLocalNotification({
              title: 'Employment Confirmation Milestone (3 Months)',
              body: 'You are reaching your 3-month probation confirmation milestone with Firstoption! Check your profile for status updates.',
              tag: 'staff-confirmation-self',
              url: '/#st-profile'
            })
            setReminded('self_confirmation_due')
          }
        }
      }
    } catch (e) {}
  }
}
