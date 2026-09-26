import React, { useState, useEffect } from 'react'
import {
  AiProvider,
  getAiProvider,
  setAiProvider,
  getGroqApiKey,
  setGroqApiKey,
  clearGroqApiKey,
  getGroqModel,
  setGroqModel,
  getGeminiApiKey,
  setGeminiApiKey,
  clearGeminiApiKey,
  getGeminiModel,
  setGeminiModel,
  testGroqApiKey,
  testGeminiApiKey,
  isAiConfigured,
  getActiveAiProviderLabel,
  getActiveAiModel,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GEMINI_MODEL,
  saveAiConfigToSupabase,
  clearAiConfigFromSupabase,
} from '../../lib/geminiService'
import {
  IconSparkles,
  IconKey,
  IconCheck,
  IconAlertCircle,
  IconShieldCheck,
  IconZap,
} from '../icons/ClassicIcons'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
  isSuperAdmin?: boolean
}

export default function GeminiSettingsModal({ isOpen, onClose, onSaved, isSuperAdmin = false }: Props) {
  // Provider Selection: 'groq' | 'gemini'
  const [provider, setLocalProvider] = useState<AiProvider>('groq')

  // Groq State
  const [groqKey, setGroqKey] = useState('')
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [groqModel, setLocalGroqModel] = useState(DEFAULT_GROQ_MODEL)

  // Gemini State
  const [geminiKey, setGeminiKey] = useState('')
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [geminiModel, setLocalGeminiModel] = useState(DEFAULT_GEMINI_MODEL)

  // Feedback & Testing
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [confirmedRevoke, setConfirmedRevoke] = useState(false)
  const [adminOverride, setAdminOverride] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setLocalProvider(getAiProvider())
      setGroqKey(getGroqApiKey())
      setLocalGroqModel(getGroqModel())
      setGeminiKey(getGeminiApiKey())
      setLocalGeminiModel(getGeminiModel())
      setTestResult(null)
      setSavedSuccess(false)
      setConfirmedRevoke(false)
      setAdminOverride(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const configured = isAiConfigured()
  const activeLabel = getActiveAiProviderLabel()
  const activeModel = getActiveAiModel()

  // Masked keys
  const activeKey = provider === 'groq' ? groqKey : geminiKey
  const hasCurrentKey = activeKey.trim().length > 0
  const maskedKey = hasCurrentKey ? `${activeKey.slice(0, 8)}${'•'.repeat(18)}` : ''

  // Test Connectivity
  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      if (provider === 'groq') {
        const res = await testGroqApiKey(groqKey, groqModel)
        setTestResult(res)
      } else {
        const res = await testGeminiApiKey(geminiKey, geminiModel)
        setTestResult(res)
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Connection test failed.' })
    } finally {
      setTesting(false)
    }
  }

  // Save Config
  const handleSave = async () => {
    setAiProvider(provider)
    if (provider === 'groq') {
      setGroqApiKey(groqKey)
      setGroqModel(groqModel)
    } else {
      setGeminiApiKey(geminiKey)
      setGeminiModel(geminiModel)
    }

    // Persist to Supabase so all staff on any device inherit the key
    await saveAiConfigToSupabase({
      provider,
      groqKey,
      groqModel,
      geminiKey,
      geminiModel,
    })

    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      if (onSaved) onSaved()
      onClose()
    }, 650)
  }

  // Revoke Key
  const handleRevoke = async () => {
    if (provider === 'groq') {
      clearGroqApiKey()
      setGroqKey('')
    } else {
      clearGeminiApiKey()
      setGeminiKey('')
    }
    await clearAiConfigFromSupabase()
    setTestResult(null)
    setConfirmedRevoke(false)
    if (onSaved) onSaved()
  }

  // ─── READ-ONLY VIEW (All Non-SuperAdmin Roles) ───────────────────────────────
  if (!isSuperAdmin && !adminOverride) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 text-amber-300">
                <IconZap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold">Workspace AI Status</h3>
                <p className="text-xs text-purple-100">Supercharged AI Copilot for your workspace</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* Status Card */}
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${configured ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className={`w-3 h-3 rounded-full shrink-0 ${configured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
              <div>
                <p className={`text-sm font-bold ${configured ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {configured ? 'Workspace AI is Active & Ready' : 'AI is Not Yet Configured'}
                </p>
                <p className={`text-xs mt-0.5 ${configured ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {configured
                    ? `Engine: ${activeLabel} (${activeModel}) · Active org-wide`
                    : 'Your Workspace AI has not been set up yet. Tap below to configure your free API key.'}
                </p>
              </div>
            </div>

            {/* Quick Configure Action if not configured */}
            {!configured && (
              <button
                type="button"
                onClick={() => setAdminOverride(true)}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <IconKey className="w-4 h-4 text-amber-300" />
                <span>Configure AI Key (Admin Setup)</span>
              </button>
            )}

            {/* What AI Powers */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2.5">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">What AI Powers for You</p>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {[
                  ['⚡', '@gemini / @ai Squad Chat Copilot — Instant answers in team channels'],
                  ['📋', 'Auto-Generate Task Subtasks & Estimated Hours'],
                  ['🪄', 'Polish Task Descriptions & Acceptance Criteria'],
                  ['📝', 'AI Task Discussion & Proof Thread Summarizer'],
                  ['📊', 'Executive Standup & Velocity Digest Synthesis'],
                ].map(([icon, text]) => (
                  <li key={text as string} className="flex items-start gap-2">
                    <span className="shrink-0">{icon}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Notice */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <IconShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Org-wide key syncs across all devices & users.</span>
              </div>
              {!adminOverride && (
                <button
                  type="button"
                  onClick={() => setAdminOverride(true)}
                  className="text-purple-600 hover:text-purple-800 font-semibold cursor-pointer underline ml-2 shrink-0"
                >
                  Setup Key
                </button>
              )}
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-black text-white rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── SUPERADMIN FULL CONFIGURATION VIEW ──────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 backdrop-blur-md text-amber-300">
              <IconZap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                Workspace AI Engine Setup
                <span className="text-[10px] bg-red-500 text-white font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Super Admin
                </span>
              </h3>
              <p className="text-xs text-purple-100">
                Choose an AI provider and set the org-wide key for all staff
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Status Badge */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className={`w-3 h-3 rounded-full ${configured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-xs font-semibold text-slate-800">
                {configured
                  ? `AI is Active (${activeLabel}) — All staff ready`
                  : 'AI Key Required — Features currently inactive'}
              </span>
            </div>
            <span className="text-[11px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
              Active: {provider.toUpperCase()}
            </span>
          </div>

          {/* Provider Selector Tabs */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Select AI Engine Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Groq Card */}
              <button
                type="button"
                onClick={() => {
                  setLocalProvider('groq')
                  setTestResult(null)
                }}
                className={`p-3.5 rounded-xl border text-left transition-all relative ${
                  provider === 'groq'
                    ? 'border-orange-500 bg-orange-50/50 ring-2 ring-orange-500/20 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-orange-500 text-white flex items-center justify-center">
                      <IconZap className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-bold text-xs text-slate-900">Groq LPU™</span>
                  </div>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded-full border border-emerald-200">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                  <strong>100% Free</strong>, 500+ tokens/sec, <strong>zero high demand queues</strong>. Powered by Meta Llama 3.3.
                </p>
              </button>

              {/* Gemini Card */}
              <button
                type="button"
                onClick={() => {
                  setLocalProvider('gemini')
                  setTestResult(null)
                }}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  provider === 'gemini'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center">
                      <IconSparkles className="w-3.5 h-3.5 text-amber-300" />
                    </div>
                    <span className="font-bold text-xs text-slate-900">Google Gemini</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Google AI Studio models. (Subject to free tier high-demand load shedding during peak hours).
                </p>
              </button>
            </div>
          </div>

          {/* Masked Active Key Display */}
          {hasCurrentKey && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <IconKey className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-mono text-emerald-800 font-semibold">{maskedKey}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                  {provider.toUpperCase()} Key Active
                </span>
                {!confirmedRevoke ? (
                  <button
                    type="button"
                    onClick={() => setConfirmedRevoke(true)}
                    className="text-[11px] font-bold text-red-600 hover:text-red-800 px-2 py-0.5 rounded-lg transition-colors"
                  >
                    Revoke
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-red-600 font-semibold">Confirm?</span>
                    <button
                      type="button"
                      onClick={handleRevoke}
                      className="text-[11px] font-bold text-red-700 bg-red-100 hover:bg-red-200 px-2 py-0.5 rounded-lg"
                    >
                      Yes, Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmedRevoke(false)}
                      className="text-[11px] font-bold text-slate-600 hover:bg-slate-100 px-2 py-0.5 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GROQ FORM */}
          {provider === 'groq' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <IconKey className="w-3.5 h-3.5 text-orange-500" />
                    Groq API Key (gsk_...)
                  </span>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-600 hover:text-orange-700 font-bold text-[11px] flex items-center gap-1"
                  >
                    Get Free Groq Key ↗
                  </a>
                </label>
                <div className="relative">
                  <input
                    type={showGroqKey ? 'text' : 'password'}
                    placeholder="gsk_..."
                    value={groqKey}
                    onChange={e => setGroqKey(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroqKey(!showGroqKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 px-2 py-1 rounded-md"
                  >
                    {showGroqKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Free instant sign-up at <strong>console.groq.com/keys</strong>. No credit card required.
                </p>
              </div>

              {/* Groq Model Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Groq Open Model
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLocalGroqModel('llama-3.1-8b-instant')
                      setTestResult(null)
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      groqModel === 'llama-3.1-8b-instant'
                        ? 'border-orange-500 bg-orange-50/60 ring-2 ring-orange-500/20 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                      <span>Llama 3.1 8B</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                      <strong>Universal Free Access</strong> · 800+ tokens/sec. Instant answers, task generation, and thread summaries.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLocalGroqModel('llama-3.3-70b-versatile')
                      setTestResult(null)
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      groqModel === 'llama-3.3-70b-versatile'
                        ? 'border-orange-500 bg-orange-50/60 ring-2 ring-orange-500/20 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                      <span>Llama 3.3 70B</span>
                      <span className="text-[9px] bg-orange-100 text-orange-800 font-bold px-1.5 py-0.5 rounded">
                        Tier 1+
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                      Flagship 70B reasoning model. (Requires verified or tiered Groq account).
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* GEMINI FORM */}
          {provider === 'gemini' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <IconKey className="w-3.5 h-3.5 text-purple-600" />
                    Google Gemini API Key
                  </span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-600 hover:text-purple-700 font-bold text-[11px] flex items-center gap-1"
                  >
                    Get Free Gemini Key ↗
                  </a>
                </label>
                <div className="relative">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    placeholder="AIzaSy..."
                    value={geminiKey}
                    onChange={e => setGeminiKey(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 px-2 py-1 rounded-md"
                  >
                    {showGeminiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Gemini Model Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Gemini Model Version
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalGeminiModel('gemini-2.5-pro')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      geminiModel === 'gemini-2.5-pro'
                        ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                      <span>Gemini 2.5 Pro</span>
                      <span className="text-[9px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded">
                        Reasoning
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                      Complex task breakdown and deep contextual reasoning.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLocalGeminiModel('gemini-1.5-flash')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      geminiModel === 'gemini-1.5-flash'
                        ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                      <span>Gemini 1.5 Flash</span>
                      <span className="text-[9px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded">
                        Fast
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                      Lightweight, low-latency squad chat responses.
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Test Connection Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !activeKey.trim()}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border border-slate-200"
            >
              {testing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <span>Testing Connectivity with {provider === 'groq' ? 'Groq' : 'Gemini'}...</span>
                </>
              ) : (
                <>
                  {provider === 'groq' ? (
                    <IconZap className="w-4 h-4 text-orange-500" />
                  ) : (
                    <IconSparkles className="w-4 h-4 text-purple-600" />
                  )}
                  <span>Test {provider === 'groq' ? 'Groq LPU™' : 'Google Gemini'} API Connectivity</span>
                </>
              )}
            </button>

            {testResult && (
              <div
                className={`mt-2.5 p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {testResult.success ? (
                  <IconCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <IconAlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!activeKey.trim()}
            className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center gap-1.5 ${
              provider === 'groq'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
            } disabled:opacity-40`}
          >
            {savedSuccess ? (
              <>
                <IconCheck className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                {provider === 'groq' ? (
                  <IconZap className="w-3.5 h-3.5" />
                ) : (
                  <IconSparkles className="w-3.5 h-3.5" />
                )}
                <span>Save & Activate for All Staff</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
