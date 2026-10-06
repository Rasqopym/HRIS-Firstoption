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
export function runRoutineReminders(role: string, customHolidays: any[] = []) {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const dow = now.getDay()
  const todayStr = now.toISOString().split('T')[0]

  // Avoid repetitive notifications on the same day by storing reminder keys
  const getReminded = (key: string) => localStorage.getItem(`hris_remind_${key}_${todayStr}`)
  const setReminded = (key: string) => localStorage.setItem(`hris_remind_${key}_${todayStr}`, 'true')

  // 1. Staff Morning Clock-In Reminder (8:00 AM - 9:30 AM on weekdays)
  if (role === 'staff' && dow !== 0 && dow !== 6) {
    if ((hours === 8 || (hours === 9 && minutes <= 30)) && !getReminded('morning_clockin')) {
      sendLocalNotification({
        title: 'Good Morning! ⏰ Shift Clock-In',
        body: 'Remember to clock in for your workday shift and verify your workplace location.',
        tag: 'morning-clockin',
        url: '/#st-attendance'
      })
      setReminded('morning_clockin')
    }

    // Evening Clock-Out Reminder (4:45 PM - 6:30 PM)
    if (((hours === 16 && minutes >= 45) || hours === 17 || (hours === 18 && minutes <= 30)) && !getReminded('evening_clockout')) {
      sendLocalNotification({
        title: 'Workday Wrap-Up: Clock-Out Reminder',
        body: 'Please make sure to clock out and log any field site visits or overtime before leaving.',
        tag: 'evening-clockout',
        url: '/#st-attendance'
      })
      setReminded('evening_clockout')
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
