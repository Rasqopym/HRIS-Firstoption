/**
 * Workspace AI Service (Powered by Groq LPU™ & Google Gemini)
 * Enables Squad Chat AI Copilot, Task Breakdown, Subtask Generator,
 * Thread Summarizer, and Executive Standup & Velocity Digest.
 *
 * KEY STORAGE POLICY:
 *   Only SuperAdmin can configure the AI Provider and API key.
 *   Settings are persisted to Supabase `app_settings` so they apply
 *   to every user/device — localStorage is only used as a read-through cache.
 */

import { supabase } from './supabase'

// ── Provider & Key Storage Keys ──────────────────────────────────────────────
export type AiProvider = 'groq' | 'gemini'

const SHARED_AI_PROVIDER_KEY = 'hris_ai_provider'      // 'groq' | 'gemini'
export const DEFAULT_AI_PROVIDER: AiProvider = 'groq'

// Groq Config (Recommended - 100% Free, 800+ tokens/sec, available on all tiers)
const SHARED_GROQ_KEY        = 'hris_groq_api_key'
const SHARED_GROQ_MODEL      = 'hris_groq_model'
export const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant'

// Gemini Config
const SHARED_GEMINI_KEY      = 'hris_gemini_api_key'
const SHARED_GEMINI_MODEL    = 'hris_gemini_model'
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'

export interface AiConfig {
  provider: AiProvider
  apiKey: string
  model: string
  isConfigured: boolean
}

// Backward compatibility interface
export interface GeminiConfig {
  apiKey: string
  model: string
  isConfigured: boolean
}

// ── Active Provider Getters & Setters ─────────────────────────────────────────

export function getAiProvider(): AiProvider {
  try {
    const p = localStorage.getItem(SHARED_AI_PROVIDER_KEY)
    if (p === 'groq' || p === 'gemini') return p
    if (localStorage.getItem(SHARED_GROQ_KEY)) return 'groq'
    if (localStorage.getItem(SHARED_GEMINI_KEY)) return 'gemini'
  } catch (e) {}
  return DEFAULT_AI_PROVIDER
}

export function setAiProvider(provider: AiProvider): void {
  try {
    localStorage.setItem(SHARED_AI_PROVIDER_KEY, provider)
  } catch (e) {}
}

// ── Groq Key & Model Management ──────────────────────────────────────────────

export function getGroqApiKey(): string {
  try {
    const shared = localStorage.getItem(SHARED_GROQ_KEY)
    if (shared && shared.trim().length > 0) return shared.trim()

    const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) return envKey.trim()
  } catch (e) {}
  return ''
}

export function setGroqApiKey(key: string): void {
  try {
    localStorage.setItem(SHARED_GROQ_KEY, key.trim())
  } catch (e) {
    console.error('Failed to save Groq API key', e)
  }
}

export function clearGroqApiKey(): void {
  try {
    localStorage.removeItem(SHARED_GROQ_KEY)
  } catch (e) {}
}

export function getGroqModel(): string {
  try {
    const m = localStorage.getItem(SHARED_GROQ_MODEL)
    if (m && m.trim().length > 0) return m.trim()
  } catch (e) {}
  return DEFAULT_GROQ_MODEL
}

export function setGroqModel(model: string): void {
  try {
    localStorage.setItem(SHARED_GROQ_MODEL, model.trim())
  } catch (e) {}
}

// ── Gemini Key & Model Management ────────────────────────────────────────────

export function getGeminiApiKey(): string {
  try {
    const shared = localStorage.getItem(SHARED_GEMINI_KEY)
    if (shared && shared.trim().length > 0) return shared.trim()

    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) return envKey.trim()
  } catch (e) {}
  return ''
}

export function setGeminiApiKey(key: string): void {
  try {
    localStorage.setItem(SHARED_GEMINI_KEY, key.trim())
  } catch (e) {
    console.error('Failed to save Gemini API key', e)
  }
}

export function clearGeminiApiKey(): void {
  try {
    localStorage.removeItem(SHARED_GEMINI_KEY)
  } catch (e) {}
}

export function getGeminiModel(): string {
  const DEPRECATED_MODELS: Record<string, string> = {
    'gemini-2.5-flash':       'gemini-2.5-pro',
    'gemini-2.0-flash':       'gemini-2.5-pro',
    'gemini-1.5-flash':       'gemini-2.5-pro',
    'gemini-1.5-pro':         'gemini-2.5-pro',
    'gemini-3.8-flash':       'gemini-2.5-pro',
  }
  try {
    const m = localStorage.getItem(SHARED_GEMINI_MODEL)
    if (m && m.trim().length > 0) {
      const trimmed = m.trim()
      if (DEPRECATED_MODELS[trimmed]) {
        const upgraded = DEPRECATED_MODELS[trimmed]
        localStorage.setItem(SHARED_GEMINI_MODEL, upgraded)
        return upgraded
      }
      return trimmed
    }
  } catch (e) {}
  return DEFAULT_GEMINI_MODEL
}

export function setGeminiModel(model: string): void {
  try {
    localStorage.setItem(SHARED_GEMINI_MODEL, model.trim())
  } catch (e) {}
}

// ── Unified State Helpers ────────────────────────────────────────────────────

/** Returns true when the active AI provider is configured */
export function isAiConfigured(): boolean {
  const provider = getAiProvider()
  if (provider === 'groq') {
    return getGroqApiKey().length > 0
  }
  return getGeminiApiKey().length > 0
}

/** Backward compatibility alias */
export function isGeminiConfigured(): boolean {
  return isAiConfigured()
}

/** Get active model identifier */
export function getActiveAiModel(): string {
  const provider = getAiProvider()
  return provider === 'groq' ? getGroqModel() : getGeminiModel()
}

/** Get human-readable active provider label */
export function getActiveAiProviderLabel(): string {
  const provider = getAiProvider()
  return provider === 'groq' ? `Groq (${getGroqModel()})` : 'Google Gemini'
}

// ── Supabase Sync (shared across all users/devices) ──────────────────────────

/**
 * Save AI config to Supabase `app_settings` table.
 * Called by SuperAdmin when they save the settings modal.
 * All other staff load this on workspace mount so they get the same key.
 */
export async function saveAiConfigToSupabase(cfg: {
  provider: AiProvider
  groqKey: string
  groqModel: string
  geminiKey: string
  geminiModel: string
}): Promise<void> {
  const rows = [
    { key: 'ai_provider',    value: cfg.provider    },
    { key: 'ai_groq_key',   value: cfg.groqKey    },
    { key: 'ai_groq_model', value: cfg.groqModel  },
    { key: 'ai_gemini_key', value: cfg.geminiKey  },
    { key: 'ai_gemini_model', value: cfg.geminiModel },
  ]
  for (const row of rows) {
    await supabase
      .from('app_settings')
      .upsert({ key: row.key, value: row.value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }
}

/**
 * Load AI config from Supabase and cache in localStorage.
 * Call this on workspace mount for every role so all staff inherit
 * the SuperAdmin-configured key automatically.
 * Returns true if a valid key was found and applied.
 */
export async function loadAiConfigFromSupabase(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['ai_provider', 'ai_groq_key', 'ai_groq_model', 'ai_gemini_key', 'ai_gemini_model'])

    if (error || !data || data.length === 0) return false

    const map: Record<string, string> = {}
    for (const row of data) map[row.key] = row.value

    if (map['ai_provider'])    setAiProvider(map['ai_provider'] as AiProvider)
    if (map['ai_groq_key'])    setGroqApiKey(map['ai_groq_key'])
    if (map['ai_groq_model'])  setGroqModel(map['ai_groq_model'])
    if (map['ai_gemini_key'])  setGeminiApiKey(map['ai_gemini_key'])
    if (map['ai_gemini_model']) setGeminiModel(map['ai_gemini_model'])

    return isAiConfigured()
  } catch (e) {
    console.warn('[AI] Could not load config from Supabase:', e)
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOW-LEVEL CALL RUNNER (GROQ + GEMINI FALLBACK)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Universal call to the active AI provider
 */
export async function callAiAPI(
  prompt: string,
  options?: {
    systemInstruction?: string
    temperature?: number
    responseMimeType?: string
  }
): Promise<string> {
  const provider = getAiProvider()

  if (provider === 'groq') {
    return await callGroqAPI(prompt, options)
  } else {
    return await callGoogleGeminiAPI(prompt, options)
  }
}

/**
 * Backward compatibility alias for existing code
 */
export const callGeminiAPI = callAiAPI

/**
 * Call Groq OpenAI-Compatible Chat Completion API
 * Runs on ultra-fast Groq LPU™ hardware with automatic model fallback
 */
async function callGroqAPI(
  prompt: string,
  options?: {
    systemInstruction?: string
    temperature?: number
    responseMimeType?: string
  }
): Promise<string> {
  const apiKey = getGroqApiKey()
  if (!apiKey) {
    if (getGeminiApiKey()) {
      return await callGoogleGeminiAPI(prompt, options)
    }
    throw new Error('Groq API Key is not configured. Please set your key in Workspace AI Settings (Super Admin).')
  }

  const primaryModel = getGroqModel()
  // Candidate fallback list: primary model first, then standard 8B instant, then gpt-oss-20b
  const candidateModels = Array.from(new Set([primaryModel, 'llama-3.1-8b-instant', 'openai/gpt-oss-20b']))
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions'

  const messages: any[] = []
  if (options?.systemInstruction) {
    messages.push({ role: 'system', content: options.systemInstruction })
  }
  messages.push({ role: 'user', content: prompt })

  let lastError = ''

  for (const model of candidateModels) {
    const payload: any = {
      model,
      messages,
      temperature: options?.temperature ?? 0.4,
    }

    if (options?.responseMimeType === 'application/json') {
      payload.response_format = { type: 'json_object' }
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData?.error?.message || `Groq API Error (${response.status}: ${response.statusText})`
        lastError = errorMsg
        // If model doesn't exist or account lacks access, silently try next candidate
        if (response.status === 404 || errorMsg.toLowerCase().includes('does not exist') || errorMsg.toLowerCase().includes('access to it')) {
          console.warn(`Groq model ${model} unavailable, trying fallback...`)
          continue
        }
        throw new Error(errorMsg)
      }

      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new Error('Groq API returned an empty response.')
      }
      return content
    } catch (err: any) {
      if (err.message && !err.message.includes('does not exist')) {
        throw err
      }
      lastError = err.message
    }
  }

  // If all Groq models failed, fallback to Gemini if configured
  if (getGeminiApiKey()) {
    console.warn('All Groq models failed, falling back to Gemini:', lastError)
    return await callGoogleGeminiAPI(prompt, options)
  }

  throw new Error(lastError || 'Groq API request failed. Please check your API key and model selection.')
}

/**
 * Call Google Gemini REST API with automatic model cascade
 */
async function callGoogleGeminiAPI(
  prompt: string,
  options?: {
    systemInstruction?: string
    temperature?: number
    responseMimeType?: string
  }
): Promise<string> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please set your API key in Workspace AI Settings.')
  }

  const primaryModel = getGeminiModel()
  const candidateModels = [primaryModel, 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash']
  const uniqueCandidates = Array.from(new Set(candidateModels))

  const payload: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: options?.temperature ?? 0.4 },
  }

  if (options?.systemInstruction) {
    payload.systemInstruction = { role: 'system', parts: [{ text: options.systemInstruction }] }
  }
  if (options?.responseMimeType) {
    payload.generationConfig.responseMimeType = options.responseMimeType
  }

  let lastError = ''

  for (const model of uniqueCandidates) {
    for (const ver of ['v1', 'v1beta']) {
      const endpoint = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          const msg = errData?.error?.message || `HTTP ${response.status}`
          lastError = msg
          if (response.status === 503 || response.status === 429 || response.status === 404 || msg.toLowerCase().includes('high demand')) {
            continue
          }
          throw new Error(msg)
        }

        const data = await response.json()
        const textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (typeof textResult === 'string') {
          return textResult
        }
      } catch (e: any) {
        lastError = e?.message || 'Network error'
      }
    }
  }

  throw new Error(lastError || 'Gemini API is currently overloaded. Consider switching to Groq in AI Settings for instant responses.')
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIVITY TESTERS
// ─────────────────────────────────────────────────────────────────────────────

export async function testGroqApiKey(testKey?: string, testModel?: string): Promise<{ success: boolean; message: string }> {
  const keyToUse = testKey !== undefined ? testKey.trim() : getGroqApiKey()
  if (!keyToUse) {
    return { success: false, message: 'Please enter a valid Groq API Key (starts with gsk_).' }
  }

  const primary = testModel || getGroqModel()
  const candidateModels = Array.from(new Set([primary, 'llama-3.1-8b-instant', 'openai/gpt-oss-20b']))
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions'

  let lastError = ''

  for (const model of candidateModels) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keyToUse}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Respond with "OK"' }],
          max_tokens: 5,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err?.error?.message || `HTTP ${res.status}: ${res.statusText}`
        lastError = msg
        if (msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('access to it')) {
          continue // try next model
        }
        return { success: false, message: msg }
      }

      // Auto-save working model if primary failed
      if (model !== primary) {
        setGroqModel(model)
      }

      return {
        success: true,
        message: `⚡ Connected successfully to Groq! Using ${model} (Ultra-fast, zero queues).`,
      }
    } catch (err: any) {
      lastError = err?.message || 'Network error connecting to Groq API.'
    }
  }

  return { success: false, message: lastError || 'Could not connect to Groq API.' }
}

export async function testGeminiApiKey(testKey?: string, testModel?: string): Promise<{ success: boolean; message: string }> {
  const keyToUse = testKey !== undefined ? testKey.trim() : getGeminiApiKey()
  if (!keyToUse) {
    return { success: false, message: 'Please enter a valid Gemini API Key.' }
  }

  const model = testModel || getGeminiModel()
  for (const ver of ['v1', 'v1beta']) {
    const endpoint = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(keyToUse)}`
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Respond with "OK"' }] }],
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err?.error?.message || `HTTP ${res.status}: ${res.statusText}`
        if (res.status === 404 && ver === 'v1') continue
        return { success: false, message: msg }
      }

      return { success: true, message: `✓ Connected to Google Gemini AI! (${model} via ${ver})` }
    } catch (err: any) {
      if (ver === 'v1beta') {
        return { success: false, message: err?.message || 'Network error connecting to Gemini API.' }
      }
    }
  }

  return { success: false, message: 'Connection to Gemini API failed.' }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SQUAD CHAT COPILOT (@gemini / @groq / @ai)
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatCopilotContext {
  prompt: string
  currentStaffName?: string
  channelName?: string
  teamName?: string
  workspaceName?: string
  recentMessages?: { senderName: string; content: string }[]
  staffList?: { id: string; name: string; department?: string }[]
}

export async function generateChatCopilotResponse(context: ChatCopilotContext): Promise<string> {
  const providerLabel = getActiveAiProviderLabel()
  const systemInstruction = `You are "Workspace AI Copilot" (powered by ${providerLabel}), an elite corporate AI assistant embedded in FirstOption HRIS Workspace.
Your role:
- Provide clear, professional, actionable, and concise assistance for corporate teams, engineering squads, sales, and operations.
- Provide clear, professional, actionable, and beautifully structured assistance for corporate teams, engineering squads, sales, and operations.
- Formatting & Visual Structure:
  • Organize responses into distinct, well-spaced visual sections with clear bold titles or headers (e.g. "### 🎯 Core Capabilities" or "**Key Deliverables**").
  • Use clean bullet points with bold leading topics (e.g. "• **Task Management**: Deconstruct initiatives into actionable milestones").
  • DO NOT output cramped ASCII markdown tables with <br> tags. Instead, use clean card-like sections and structured lists that read naturally in chat bubbles.
  • When proposing tasks or action steps, format them as checkboxes: "[ ] Action item to complete".
  • Highlight important deliverables, dates, tools, and metrics in **bold**.
- Tone: Crisp, executive, encouraging, authoritative, and direct. Skip conversational filler.
Context:
Workspace: "${context.workspaceName || 'Main'}"
Squad: "${context.teamName || 'General Squad'}"
Channel: "#${context.channelName || 'general'}"
User Asking: "${context.currentStaffName || 'Team Member'}"
Available Squad Members: ${context.staffList?.map(s => s.name).join(', ') || 'Team'}`

  const conversationHistory = (context.recentMessages || [])
    .slice(-6)
    .map(m => `${m.senderName}: ${m.content}`)
    .join('\n')

  const fullPrompt = conversationHistory
    ? `Recent Channel Discussion:\n${conversationHistory}\n\nUser Request: ${context.prompt}`
    : context.prompt

  return await callAiAPI(fullPrompt, {
    systemInstruction,
    temperature: 0.5,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SMART TASK BREAKDOWN & SUBTASK GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskBreakdownInput {
  title: string
  description?: string
  squadContext?: string
}

export interface TaskBreakdownResult {
  refinedTitle: string
  refinedDescription: string
  suggestedEstimatedHours: number
  suggestedPriority: 'low' | 'medium' | 'high' | 'urgent'
  suggestedKpiCategory: string
  acceptanceCriteria: string[]
  subtasks: { title: string; estimatedHours?: number }[]
}

export async function generateTaskBreakdown(input: TaskBreakdownInput): Promise<TaskBreakdownResult> {
  const systemInstruction = `You are a Senior Technical Project Manager and Scrum Master.
Your job is to analyze a proposed task and decompose it into high-impact, actionable milestones and acceptance criteria.
Respond ONLY with a valid JSON object matching this schema:
{
  "refinedTitle": "Crisp, action-oriented task title",
  "refinedDescription": "Clear description explaining objective, business value, and expected output.",
  "suggestedEstimatedHours": 4,
  "suggestedPriority": "medium",
  "suggestedKpiCategory": "Execution & Delivery",
  "acceptanceCriteria": [
    "Milestone 1 verified",
    "Milestone 2 signed off"
  ],
  "subtasks": [
    { "title": "Subtask 1 action", "estimatedHours": 1.5 },
    { "title": "Subtask 2 action", "estimatedHours": 2 }
  ]
}`

  const prompt = `Task Title: "${input.title}"
Task Details: "${input.description || 'No description provided'}"
Squad / Context: "${input.squadContext || 'Corporate Workspace'}"

Generate 3-6 actionable subtasks, accurate hour estimates, and acceptance criteria.`

  const raw = await callAiAPI(prompt, {
    systemInstruction,
    temperature: 0.3,
    responseMimeType: 'application/json',
  })

  try {
    const cleaned = raw.replace(/^\s*```json\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    const lines = raw.split('\n').filter(l => l.trim().length > 0)
    return {
      refinedTitle: input.title,
      refinedDescription: input.description || '',
      suggestedEstimatedHours: 4,
      suggestedPriority: 'medium',
      suggestedKpiCategory: 'Sprint Goal',
      acceptanceCriteria: ['Task executed according to specifications'],
      subtasks: lines.slice(0, 4).map(l => ({ title: l.replace(/^[-*0-9.]+\s*/, ''), estimatedHours: 1 })),
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TASK POLISHER
// ─────────────────────────────────────────────────────────────────────────────

export async function polishTaskDetails(input: { title: string; description?: string }): Promise<{
  polishedTitle: string
  polishedDescription: string
  acceptanceCriteria: string[]
}> {
  const systemInstruction = `You are an executive product manager. Polish and professionalize the task title, description, and generate 2-4 crisp acceptance criteria.
Respond ONLY with a JSON object:
{
  "polishedTitle": "Professional Action Title",
  "polishedDescription": "Crisp overview explaining the context, objective, and deliverable.",
  "acceptanceCriteria": ["Item 1", "Item 2"]
}`

  const raw = await callAiAPI(`Task: "${input.title}"\nDescription: "${input.description || ''}"`, {
    systemInstruction,
    temperature: 0.3,
    responseMimeType: 'application/json',
  })

  try {
    const cleaned = raw.replace(/^\s*```json\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return {
      polishedTitle: input.title,
      polishedDescription: input.description || '',
      acceptanceCriteria: ['Task deliverable validated and signed off by squad lead'],
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TASK DISCUSSION THREAD & PROOF SUMMARIZER
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskThreadContext {
  taskTitle: string
  status: string
  priority: string
  assigneeName?: string
  checklist?: { text: string; completed: boolean }[]
  comments?: { authorName: string; text: string; hasAttachment?: boolean; createdAt?: string }[]
  totalHoursLogged?: number
}

export async function summarizeTaskThread(context: TaskThreadContext): Promise<string> {
  const systemInstruction = `You are an executive status reviewer in FirstOption HRIS.
Provide a crisp, executive 3-section summary of the task:
1. **Current Status & Velocity** (Key progress, hours spent, checklist completion)
2. **Discussion & Proof Findings** (Key decisions, attached proofs, review notes)
3. **Actionable Next Steps** (What is needed to achieve completion)
Keep it concise, high-value, and easy to scan.`

  const checklistSummary = (context.checklist || [])
    .map(c => `- [${c.completed ? 'x' : ' '}] ${c.text}`)
    .join('\n')

  const commentsSummary = (context.comments || [])
    .map(c => `[${c.authorName}]: ${c.text} ${c.hasAttachment ? '(Attached Proof Image/File)' : ''}`)
    .join('\n')

  const prompt = `Task: "${context.taskTitle}"
Status: ${context.status.toUpperCase()} | Priority: ${context.priority.toUpperCase()} | Assignee: ${context.assigneeName || 'Unassigned'}
Total Hours Logged: ${context.totalHoursLogged || 0} hrs

Checklist Milestones:
${checklistSummary || '(No checklist defined)'}

Discussion & Proof Activity:
${commentsSummary || '(No comments logged yet)'}`

  return await callAiAPI(prompt, {
    systemInstruction,
    temperature: 0.4,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. EXECUTIVE STANDUP & VELOCITY DIGEST GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export interface StandupDigestContext {
  squadName?: string
  date?: string
  standups: {
    staffName: string
    planToday: string
    blockers?: string
    accomplishedYesterday?: string
  }[]
  tasksSummary: {
    totalTasks: number
    completedTasks: number
    inFlightTasks: number
    overdueTasks: number
  }
}

export async function generateExecutiveStandupDigest(context: StandupDigestContext): Promise<string> {
  const systemInstruction = `You are the Chief Operating Officer's AI Assistant in FirstOption HRIS.
Generate an insightful, executive Daily Standup & Squad Velocity Briefing.
Format with clean Markdown:
- 🚀 **Squad Velocity & Delivery Overview** (High-level completion %, active workload, overdue risks)
- 🎯 **Key Focus & Commitments Today** (Aggregated team focus areas)
- ⚠️ **Critical Blockers & Risk Interventions** (Highlight who is blocked and what action management should take)
- 💡 **AI Recommendations for Today** (1-2 pragmatic actions to ensure full sprint delivery)
Be concise, authoritative, and direct.`

  const standupEntries = (context.standups || []).map(s => `• ${s.staffName}:
  - Plan: ${s.planToday || 'No plan provided'}
  - Blockers: ${s.blockers ? s.blockers : 'None reported'}
  - Done: ${s.accomplishedYesterday || 'N/A'}`).join('\n\n')

  const prompt = `Squad: "${context.squadName || 'Core Squad'}"
Date: ${context.date || new Date().toISOString().split('T')[0]}

Squad Velocity Metrics:
- Total Tasks: ${context.tasksSummary.totalTasks}
- Completed: ${context.tasksSummary.completedTasks} (${Math.round((context.tasksSummary.completedTasks / Math.max(1, context.tasksSummary.totalTasks)) * 100)}%)
- In-Flight Active: ${context.tasksSummary.inFlightTasks}
- Overdue Risk: ${context.tasksSummary.overdueTasks}

Member Standup Submissions (${context.standups.length} submitted):
${standupEntries || 'No individual standups submitted yet today.'}`

  return await callAiAPI(prompt, {
    systemInstruction,
    temperature: 0.4,
  })
}
