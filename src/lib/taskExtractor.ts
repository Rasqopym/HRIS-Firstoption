import type { TaskPriority, RecurrenceInterval } from '../types'

export interface ExtractedTaskDraft {
  isActionable: boolean
  title: string
  description?: string
  assigneeName?: string | null
  assigneeId?: string | null
  dueDate?: string | null // YYYY-MM-DD
  dueTime?: string | null // HH:MM
  reminderType?: 'none' | 'on_due_time' | '15_min' | '30_min' | '1_hour' | '1_day'
  isRecurring?: boolean
  recurrenceInterval?: RecurrenceInterval
  priority: TaskPriority
  kpiCategory?: string
  confidenceScore: number // 0 to 1
}

const RECURRENCE_PATTERNS: Record<RecurrenceInterval, RegExp> = {
  daily: /\b(daily|every day|everyday|each day|on a daily basis)\b/i,
  weekdays: /\b(every weekday|weekdays|mon-fri|monday to friday|every working day)\b/i,
  weekly: /\b(weekly|every week|each week|on a weekly basis|every (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
  biweekly: /\b(bi-weekly|biweekly|every two weeks|every 2 weeks|every other week|fortnightly)\b/i,
  monthly: /\b(monthly|every month|each month|on a monthly basis|once a month)\b/i,
  quarterly: /\b(quarterly|every quarter|every 3 months|each quarter|on a quarterly basis)\b/i,
  none: /(?!.*)/,
}

const ACTION_VERBS = [
  'post', 'publish', 'share', 'design', 'call', 'email', 'reach out', 'follow up', 'follow-up',
  'coordinate', 'organise', 'organize', 'print', 'setup', 'set up', 'build', 'remind',
  'create', 'make', 'send', 'submit', 'review', 'prepare', 'update', 'fix', 'deploy',
  'check', 'audit', 'contact', 'draft', 'schedule', 'complete', 'investigate',
  'verify', 'generate', 'deliver', 'present', 'write', 'upload', 'test', 'resolve'
]

const URGENCY_PATTERNS = {
  urgent: /\b(urgent|asap|immediately|critical|emergency|top priority|blocker)\b/i,
  high: /\b(high priority|important|needed today|by today|eod)\b/i,
  low: /\b(low priority|when you have time|no rush|whenever|minor)\b/i,
}

const KPI_KEYWORDS: Record<string, RegExp> = {
  'Sales & Customer Acquisition': /\b(sales|lead|leads|pipeline|client|customer|pitch|closing|prospect|post|instagram|facebook|ads?|marketing|campaign|social media)\b/i,
  'Logistics, Warehouse & Inventory': /\b(warehouse|inventory|stock|goods|shipment|dispatch|storekeeper|storage|waybill|procurement|supply chain|materials|carton|item counts|stocktaking|replenish)\b/i,
  'Technical & IT Procedures': /\b(bug|code|server|api|database|deploy|fix|frontend|backend|infrastructure|security|pr|repo)\b/i,
  'HR & People Operations': /\b(onboarding|appraisal|attendance|recruitment|interview|policy|payroll|leave|staff)\b/i,
  'Finance & Accounting': /\b(invoice|payment|reconciliation|tax|audit|budget|remittance|salary|receipt)\b/i,
  'Operations, Admin & Compliance': /\b(compliance|sop|report|documentation|filing|legal|vendor|meeting|schedule|admin|administrative|errand|routine|general|facility|maintenance)\b/i,
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parses a chat message text and extracts actionable tasks, assignees, deadlines, and priorities.
 */
export function extractTaskFromMessage(
  text: string,
  staffList: { id: string; name: string; staffCode?: string }[] = []
): ExtractedTaskDraft {
  if (!text || text.trim().length < 4) {
    return { isActionable: false, title: '', priority: 'medium', confidenceScore: 0 }
  }

  const clean = text.trim()
  let confidenceScore = 0

  // 1. Detect Actionable Verbs / Phrases
  let hasActionDirective = false
  const lower = clean.toLowerCase()
  for (const verb of ACTION_VERBS) {
    const regex = new RegExp(`\\b(?:please|pls|kindly|need to|have to|should|must|can you|could you)?\\s*${verb}\\b`, 'i')
    if (regex.test(lower)) {
      hasActionDirective = true
      confidenceScore += 0.4
      break
    }
  }

  // 2. Detect Priority
  let priority: TaskPriority = 'medium'
  if (URGENCY_PATTERNS.urgent.test(clean)) {
    priority = 'urgent'
    confidenceScore += 0.2
  } else if (URGENCY_PATTERNS.high.test(clean)) {
    priority = 'high'
    confidenceScore += 0.15
  } else if (URGENCY_PATTERNS.low.test(clean)) {
    priority = 'low'
  }

  // 3. Detect Assignee from @mentions or known staff names
  let assigneeName: string | null = null
  let assigneeId: string | null = null
  let matchedMentionToken = ''

  // Sort staff by longest name first to prevent partial substring collisions
  const sortedStaff = [...staffList].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0))
  for (const s of sortedStaff) {
    if (!s.name) continue
    const escapedName = escapeRegex(s.name)
    const fullNameRegex = new RegExp(`@${escapedName}(?:[\\s,.:;!?-]|$)`, 'i')
    const firstName = s.name.split(' ')[0]
    const firstNameRegex = firstName.length >= 3 ? new RegExp(`@${escapeRegex(firstName)}(?:[\\s,.:;!?-]|$)`, 'i') : null
    const codeRegex = s.staffCode ? new RegExp(`@${escapeRegex(s.staffCode)}(?:[\\s,.:;!?-]|$)`, 'i') : null

    if (fullNameRegex.test(clean) || clean.toLowerCase().includes(`@${s.name.toLowerCase()}`)) {
      assigneeName = s.name
      assigneeId = s.id
      matchedMentionToken = `@${s.name}`
      confidenceScore += 0.35
      break
    } else if (codeRegex && (codeRegex.test(clean) || clean.toLowerCase().includes(`@${s.staffCode?.toLowerCase()}`))) {
      assigneeName = s.name
      assigneeId = s.id
      matchedMentionToken = `@${s.staffCode}`
      confidenceScore += 0.35
      break
    } else if (firstNameRegex && firstNameRegex.test(clean)) {
      assigneeName = s.name
      assigneeId = s.id
      matchedMentionToken = `@${firstName}`
      confidenceScore += 0.3
      break
    }
  }

  // Generic mention regex fallback (e.g. @Jane Doe)
  if (!assigneeName) {
    const mentionMatch = clean.match(/@([a-zA-Z0-9_.-]+(?:\s+[a-zA-Z0-9_.-]+)?)/i)
    if (mentionMatch) {
      const raw = mentionMatch[1].trim()
      const query = raw.toLowerCase()
      const matched = sortedStaff.find(
        s => s.name.toLowerCase().includes(query) || (s.staffCode && s.staffCode.toLowerCase() === query)
      )
      if (matched) {
        assigneeName = matched.name
        assigneeId = matched.id
        matchedMentionToken = mentionMatch[0]
        confidenceScore += 0.3
      } else {
        assigneeName = raw
        matchedMentionToken = mentionMatch[0]
        confidenceScore += 0.2
      }
    }
  }

  // 4. Detect Due Date / Deadlines
  const dueDate = parseNaturalLanguageDate(clean)
  if (dueDate) {
    confidenceScore += 0.25
  }

  // 4b. Detect Due Time & Reminders
  const dueTime = parseNaturalLanguageTime(clean)
  let reminderType: ExtractedTaskDraft['reminderType'] = undefined
  if (dueTime || dueDate) {
    reminderType = '30_min' // sensible default reminder
    if (dueTime) confidenceScore += 0.15
  }

  // 5. Detect KPI Category
  let kpiCategory = 'Operations, Admin & Compliance'
  for (const [cat, regex] of Object.entries(KPI_KEYWORDS)) {
    if (regex.test(clean)) {
      kpiCategory = cat
      break
    }
  }

  // 5b. Detect Recurrence (Re-occurent / Repeat Interval)
  let isRecurring = false
  let recurrenceInterval: RecurrenceInterval = 'none'

  if (RECURRENCE_PATTERNS.daily.test(clean)) {
    isRecurring = true
    recurrenceInterval = 'daily'
    confidenceScore += 0.2
  } else if (RECURRENCE_PATTERNS.weekdays.test(clean)) {
    isRecurring = true
    recurrenceInterval = 'weekdays'
    confidenceScore += 0.2
  } else if (RECURRENCE_PATTERNS.weekly.test(clean)) {
    isRecurring = true
    recurrenceInterval = 'weekly'
    confidenceScore += 0.2
  } else if (RECURRENCE_PATTERNS.biweekly.test(clean)) {
    isRecurring = true
    recurrenceInterval = 'biweekly'
    confidenceScore += 0.2
  } else if (RECURRENCE_PATTERNS.monthly.test(clean)) {
    isRecurring = true
    recurrenceInterval = 'monthly'
    confidenceScore += 0.2
  } else if (RECURRENCE_PATTERNS.quarterly.test(clean)) {
    isRecurring = true
    recurrenceInterval = 'quarterly'
    confidenceScore += 0.2
  }

  // 6. Clean Title - Extract ONLY the pure action statement
  let workingTitle = clean

  // Remove matched mention token wherever it appears
  if (matchedMentionToken) {
    workingTitle = workingTitle.replace(new RegExp(escapeRegex(matchedMentionToken), 'gi'), '')
  }
  // Remove assignee name if it had @ or was at the start
  if (assigneeName) {
    workingTitle = workingTitle.replace(new RegExp(`@?${escapeRegex(assigneeName)}`, 'gi'), '')
  }
  for (const s of sortedStaff) {
    if (s.name && workingTitle.toLowerCase().includes(`@${s.name.toLowerCase()}`)) {
      workingTitle = workingTitle.replace(new RegExp(`@${escapeRegex(s.name)}`, 'gi'), '')
    }
    if (s.staffCode && workingTitle.toLowerCase().includes(`@${s.staffCode.toLowerCase()}`)) {
      workingTitle = workingTitle.replace(new RegExp(`@${escapeRegex(s.staffCode)}`, 'gi'), '')
    }
  }

  // Strip recurrence phrases from title
  workingTitle = workingTitle
    .replace(/\b(?:on\s+a\s+)?(?:daily|weekly|bi-weekly|biweekly|monthly|quarterly)\s+(?:basis|schedule)?\b/gi, '')
    .replace(/\b(?:every|each)\s+(?:day|weekday|week|month|quarter|monday|tuesday|wednesday|thursday|friday|saturday|sunday|other\s+week|two\s+weeks|2\s+weeks)\b/gi, '')
    .trim()

  // Strip any remaining leading @mentions
  workingTitle = workingTitle.replace(/^@[\w\s.-]+?(?=\b(?:please|pls|kindly|can|could|would|should|to|i\s+need|we\s+need|post|publish|share|design|call|email|reach|follow|coordinate|organise|organize|print|setup|set\s+up|build|remind|create|make|send|submit|review|prepare|update|fix|deploy|check|audit|contact|draft|schedule|complete|investigate|verify|generate|deliver|present|write|upload|test|resolve)\b|[,:\-–—|;]|\s+[A-Z]|$)/i, '')

  // Strip leading punctuation
  workingTitle = workingTitle.replace(/^[\s,:\-–—|;]+/, '')

  // Strip leading polite requests / directives
  workingTitle = workingTitle
    .replace(/^(?:please|pls|kindly|can you|could you|would you|should|i need you to|we need you to|we need to|make sure to|remember to|don't forget to|kindly help to|help to)\s+/i, '')
    .replace(/^(?:to\s+)/i, '')
    .replace(/^[\s,:\-–—|;]+/, '')
    .trim()

  // Strip any residual staff name fragments at the beginning
  for (const s of sortedStaff) {
    if (s.name) {
      const parts = s.name.split(' ')
      for (const p of parts) {
        if (p.length >= 3) {
          workingTitle = workingTitle.replace(new RegExp(`^${escapeRegex(p)}\\s+`, 'i'), '')
        }
      }
      workingTitle = workingTitle.replace(new RegExp(`^${escapeRegex(s.name)}\\s+`, 'i'), '')
    }
  }

  // Strip leading polite words / punctuation again after name cleanup
  workingTitle = workingTitle
    .replace(/^[\s,:\-–—|;]+/, '')
    .replace(/^(?:please|pls|kindly|can you|could you|would you|should|i need you to|we need you to|we need to|make sure to|remember to|don't forget to|kindly help to|help to)\s+/i, '')
    .replace(/^(?:to\s+)/i, '')
    .replace(/^[\s,:\-–—|;]+/, '')
    .trim()

  // Strip trailing time & date expressions from title so only the action statement remains
  workingTitle = workingTitle
    .replace(/\b(?:by|at|before|on|for|due)?\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}:\d{2})\s*(?:today|toady|tday|tonight|tomorrow|tomorow|tmrw|this\s+\w+|next\s+\w+|[a-zA-Z]+day)?\.?$/i, '')
    .replace(/\b(?:by|at|before|on)?\s*(?:today|toady|tday|tonight|tomorrow|tomorow|tmrw|this\s+evening|this\s+afternoon|this\s+morning|eod|cob)\.?$/i, '')
    .replace(/[.,:;!\s]+$/, '')
    .trim()

  // Capitalize first letter
  if (workingTitle.length > 0) {
    workingTitle = workingTitle.charAt(0).toUpperCase() + workingTitle.slice(1)
  }

  // Limit title length to reasonable summary
  if (workingTitle.length > 90) {
    const firstSentence = workingTitle.split(/[.!?\n]/)[0]
    workingTitle = firstSentence.length > 90 ? `${firstSentence.substring(0, 87)}...` : firstSentence
  }

  const isActionable = hasActionDirective || confidenceScore >= 0.35 || !!dueDate || !!dueTime || isRecurring

  return {
    isActionable,
    title: workingTitle || clean,
    description: `Extracted from team discussion: "${clean}"`,
    assigneeName,
    assigneeId,
    dueDate: dueDate || (isActionable ? formatDate(new Date()) : null),
    dueTime: dueTime || (dueDate ? '17:00' : null),
    reminderType: reminderType || '30_min',
    isRecurring,
    recurrenceInterval,
    priority,
    kpiCategory,
    confidenceScore: Math.min(1, confidenceScore),
  }
}

/**
 * Parses natural language times like "by 4pm", "at 10:30am", "before 2:00 PM", "12pm", "14:30"
 */
function parseNaturalLanguageTime(text: string): string | null {
  // 12-hour format with am/pm: "4pm", "4:30pm", "10:15 am", "12 pm", "8:00am"
  const ampmMatch = text.match(/\b(?:by|at|before|around)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10)
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0
    const period = ampmMatch[3].toLowerCase()

    if (period === 'pm' && hours < 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }
  }

  // 24-hour format: "at 14:30", "by 18:00"
  const hr24Match = text.match(/\b(?:by|at|before)?\s*([01]?\d|2[0-3]):([0-5]\d)\b/i)
  if (hr24Match) {
    const hours = parseInt(hr24Match[1], 10)
    const minutes = parseInt(hr24Match[2], 10)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  // Keywords: "eod" -> 17:00, "noon" -> 12:00, "cob" -> 17:00
  if (/\b(eod|cob|end of day|close of business)\b/i.test(text)) {
    return '17:00'
  }
  if (/\b(noon|midday)\b/i.test(text)) {
    return '12:00'
  }

  return null
}

/**
 * Parses natural language dates like "today", "toady", "tomorrow", "by Friday", "next week", "in 3 days"
 */
function parseNaturalLanguageDate(text: string): string | null {
  const lower = text.toLowerCase()
  const today = new Date()

  // "today", "toady", "tday", "tonight", "this morning", "this afternoon", "this evening"
  if (/\b(today|toady|tday|tonight|this morning|this afternoon|this evening|by today|by eod|before close of day)\b/i.test(lower)) {
    return formatDate(today)
  }

  // "tomorrow", "tomorow", "tmrw", "by tomorrow"
  if (/\b(tomorrow|tomorow|tmrw|by tomorrow)\b/i.test(lower)) {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return formatDate(d)
  }

  // "in X days"
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/i)
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10)
    const d = new Date(today)
    d.setDate(d.getDate() + days)
    return formatDate(d)
  }

  // Weekdays: "by Friday", "on Monday", etc.
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (let i = 0; i < weekdays.length; i++) {
    const regex = new RegExp(`\\b(by|on|before|this|next)?\\s*${weekdays[i]}\\b`, 'i')
    if (regex.test(lower)) {
      const targetDay = i
      const currentDay = today.getDay()
      let diff = targetDay - currentDay
      if (diff <= 0) diff += 7 // next occurrence
      if (lower.includes('next ' + weekdays[i])) diff += 7
      const d = new Date(today)
      d.setDate(d.getDate() + diff)
      return formatDate(d)
    }
  }

  // Explicit ISO or standard date like 2026-10-15 or 15/10/2026
  const isoMatch = text.match(/\b(202\d-\d{2}-\d{2})\b/)
  if (isoMatch) return isoMatch[1]

  // If a time is specified without explicit date, default to TODAY
  const hasTime = parseNaturalLanguageTime(text)
  if (hasTime) {
    return formatDate(today)
  }

  return null
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
