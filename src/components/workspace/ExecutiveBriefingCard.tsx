import React, { useState, useMemo } from 'react'
import {
  IconChart,
  IconCheckCircle,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconCalendar,
  IconSparkles,
} from '../icons/ClassicIcons'

interface Props {
  content: string
  isMe?: boolean
}

export function isExecutiveReport(content: string): boolean {
  if (!content) return false
  return (
    content.includes('[EXECUTIVE BRIEFING]') ||
    content.includes('[PERSONAL PERFORMANCE SUMMARY]') ||
    content.includes('Weekly KPI Scorecard & Digest')
  )
}

interface ParsedCategory {
  name: string
  completed: number
  total: number
  rate: number
  hours: number
}

interface ParsedDigest {
  badgeLabel: string
  title: string
  period: string
  scope: string
  staffName?: string
  metrics: {
    completionRate: number
    completionTasks: string
    onTimeRate: number
    onTimeDetails: string
    hoursLogged: string
    hoursBudgeted: string
    proofs: number
  }
  categories: ParsedCategory[]
  spotlight?: {
    name: string
    department: string
    stats: string
  } | null
  healthStatus: {
    isActionRequired: boolean
    message: string
  }
}

export function parseExecutiveDigest(content: string): ParsedDigest {
  const isPersonal = content.includes('[PERSONAL PERFORMANCE SUMMARY]')
  const badgeLabel = isPersonal ? 'PERSONAL PERFORMANCE SUMMARY' : 'EXECUTIVE PERFORMANCE DIGEST'

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  const titleLine = lines.find(l => l.includes('Weekly KPI Scorecard & Digest')) || lines[0] || 'Weekly KPI Scorecard & Digest'
  const cleanTitle = titleLine.replace(/^\[(?:EXECUTIVE BRIEFING|PERSONAL PERFORMANCE SUMMARY)\]\s*/i, '').trim()

  const periodLine = lines.find(l => l.startsWith('Period:'))?.replace(/^Period:\s*/i, '').trim() || ''
  const scopeLine = lines.find(l => l.startsWith('Scope:'))?.replace(/^Scope:\s*/i, '').trim() || ''
  const staffLine = lines.find(l => l.startsWith('Staff Member:'))?.replace(/^Staff Member:\s*/i, '').trim()

  // Deliverables Metrics
  const completionMatch = content.match(/Deliverable Completion:\s*(\d+)%\s*\(([^)]+)\)/i)
  const onTimeMatch = content.match(/On-Time Execution Rate:\s*(\d+)%\s*\(([^)]+)\)/i)
  const timeMatch = content.match(/Time Utilization:\s*([0-9.]+)\s*hrs logged vs ([0-9.]+)\s*hrs budgeted/i)
  const proofMatch = content.match(/Milestone Deliverable Proofs:\s*(\d+)/i)

  // Categories Breakdown
  const categoryMatches = [...content.matchAll(/•\s*\[([^\]]+)\]:\s*(\d+)\/(\d+)\s*done\s*\((\d+)%\)\s*\|\s*([0-9.]+)h\s*logged/gi)]
  const categories: ParsedCategory[] = categoryMatches.map(m => ({
    name: m[1].trim(),
    completed: parseInt(m[2], 10),
    total: parseInt(m[3], 10),
    rate: parseInt(m[4], 10),
    hours: parseFloat(m[5]),
  }))

  // Spotlight
  let spotlight = null
  const spotlightMatch = content.match(/---\s*Top Contributor Spotlight\s*---\s*\n[•*]?\s*([^\n]+)/i)
  if (spotlightMatch) {
    const rawSpotlight = spotlightMatch[1].trim()
    const nameDeptMatch = rawSpotlight.match(/^([^(]+)\s*\(([^)]+)\):\s*(.+)/)
    if (nameDeptMatch) {
      spotlight = {
        name: nameDeptMatch[1].trim(),
        department: nameDeptMatch[2].trim(),
        stats: nameDeptMatch[3].trim(),
      }
    } else {
      spotlight = {
        name: rawSpotlight.split(':')[0] || 'Team Lead',
        department: 'Operations',
        stats: rawSpotlight.includes(':') ? rawSpotlight.split(':')[1].trim() : rawSpotlight,
      }
    }
  }

  // Health / Action Required
  const isActionRequired = /---\s*Action Required\s*---/i.test(content)
  const healthMatch = content.match(/---\s*(?:Operational Health|Action Required)\s*---\s*\n[•*]?\s*([^\n]+)/i)
  const healthMessage = healthMatch
    ? healthMatch[1].trim()
    : isActionRequired
    ? 'Tasks currently exceed deadline schedule. Supervisors are advised to conduct morning check-ins.'
    : 'All planned deliverables are pacing on schedule.'

  return {
    badgeLabel,
    title: cleanTitle,
    period: periodLine,
    scope: scopeLine,
    staffName: staffLine,
    metrics: {
      completionRate: completionMatch ? parseInt(completionMatch[1], 10) : 0,
      completionTasks: completionMatch ? completionMatch[2] : '0/0 tasks completed',
      onTimeRate: onTimeMatch ? parseInt(onTimeMatch[1], 10) : 100,
      onTimeDetails: onTimeMatch ? onTimeMatch[2] : 'Zero overdue items',
      hoursLogged: timeMatch ? timeMatch[1] : '0',
      hoursBudgeted: timeMatch ? timeMatch[2] : '0',
      proofs: proofMatch ? parseInt(proofMatch[1], 10) : 0,
    },
    categories,
    spotlight,
    healthStatus: {
      isActionRequired,
      message: healthMessage,
    },
  }
}

export default function ExecutiveBriefingCard({ content }: Props) {
  const [copied, setCopied] = useState(false)
  const parsed = useMemo(() => parseExecutiveDigest(content), [content])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const { metrics, categories, spotlight, healthStatus } = parsed

  return (
    <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden text-slate-800 transition-all font-sans my-1 text-left">
      {/* ── CARD HEADER ── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-4 sm:p-5 relative overflow-hidden border-b border-indigo-950">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

        <div className="relative z-10 space-y-2">
          {/* Top badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 font-bold uppercase tracking-wider text-[10px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <IconSparkles className="w-3 h-3 text-amber-300" />
              <span>{parsed.badgeLabel}</span>
            </span>

            {parsed.period && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 font-medium bg-white/10 px-2.5 py-0.5 rounded-lg border border-white/10">
                <IconCalendar className="w-3.5 h-3.5 text-blue-300" />
                <span>{parsed.period}</span>
              </span>
            )}
          </div>

          {/* Title & Scope */}
          <div>
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug">
              {parsed.title}
            </h3>
            {parsed.scope && (
              <p className="text-xs text-blue-200/80 font-medium mt-0.5 flex items-center gap-1">
                <span>Scope:</span>
                <span className="font-semibold text-white">{parsed.scope}</span>
              </p>
            )}
            {parsed.staffName && (
              <p className="text-xs text-blue-200/80 font-medium flex items-center gap-1">
                <span>Staff:</span>
                <span className="font-semibold text-white">{parsed.staffName}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── KEY METRIC TILES GRID ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200/80">
        {/* Metric 1: Completion */}
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Completion Rate
            </span>
            <IconCheckCircle className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {metrics.completionRate}%
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate" title={metrics.completionTasks}>
              {metrics.completionTasks}
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                metrics.completionRate >= 80 ? 'bg-emerald-500' : metrics.completionRate > 0 ? 'bg-blue-600' : 'bg-slate-300'
              }`}
              style={{ width: `${metrics.completionRate}%` }}
            />
          </div>
        </div>

        {/* Metric 2: On-Time Rate */}
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              On-Time Rate
            </span>
            <IconClock className={`w-3.5 h-3.5 ${metrics.onTimeRate >= 90 ? 'text-emerald-600' : 'text-rose-500'}`} />
          </div>
          <div>
            <div className={`text-lg font-black tracking-tight ${metrics.onTimeRate >= 90 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {metrics.onTimeRate}%
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate" title={metrics.onTimeDetails}>
              {metrics.onTimeDetails}
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                metrics.onTimeRate >= 90 ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
              style={{ width: `${metrics.onTimeRate}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Time Logged */}
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Time Logged
            </span>
            <IconClock className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {metrics.hoursLogged}h
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Budget: {metrics.hoursBudgeted}h
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (parseFloat(metrics.hoursLogged) / (parseFloat(metrics.hoursBudgeted) || 1)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Metric 4: Deliverable Proofs */}
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Verified Proofs
            </span>
            <IconCheck className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {metrics.proofs}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Milestone proofs
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-500"
              style={{ width: metrics.proofs > 0 ? '100%' : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* ── CARD SECTIONS BODY ── */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* KPI Category Breakdown */}
        {categories.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <IconChart className="w-3.5 h-3.5 text-blue-600" />
              <span>KPI Category Breakdown ({categories.length})</span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
              {categories.map((cat, idx) => (
                <div key={idx} className="p-2.5 sm:px-3 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between sm:justify-start gap-2">
                      <span className="text-xs font-bold text-slate-800 truncate">{cat.name}</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-md">
                        {cat.hours}h logged
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden max-w-md">
                      <div
                        className={`h-full rounded-full ${
                          cat.rate >= 80 ? 'bg-emerald-500' : cat.rate > 0 ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                        style={{ width: `${cat.rate}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <span className="text-[11px] font-mono text-slate-500">
                      {cat.completed}/{cat.total} done
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      cat.rate === 100
                        ? 'bg-emerald-100 text-emerald-800'
                        : cat.rate > 0
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {cat.rate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Contributor Spotlight */}
        {spotlight && (
          <div className="rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50/60 to-orange-50/50 p-3 sm:p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-amber-900">
              <span className="flex items-center gap-1.5 uppercase tracking-wide text-[10px] font-black text-amber-800">
                <span className="text-amber-500">⭐</span> Top Contributor Spotlight
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white font-black flex items-center justify-center text-xs shadow-xs shrink-0">
                {spotlight.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-slate-900 text-xs truncate">{spotlight.name}</span>
                  <span className="text-[10px] text-amber-800 bg-amber-100/80 font-medium px-1.5 py-0.2 rounded-md">
                    {spotlight.department}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                  {spotlight.stats}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Operational Health / Action Required Callout */}
        <div
          className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
            healthStatus.isActionRequired
              ? 'bg-rose-50/80 border-rose-200 text-rose-900'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
          }`}
        >
          {healthStatus.isActionRequired ? (
            <IconAlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <span className="font-bold block uppercase tracking-wider text-[10px]">
              {healthStatus.isActionRequired ? 'Action Required' : 'Operational Health'}
            </span>
            <p className="text-xs font-medium leading-relaxed mt-0.5">
              {healthStatus.message}
            </p>
          </div>
        </div>
      </div>

      {/* ── CARD FOOTER ── */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-400">
        <span className="text-[10px] font-medium flex items-center gap-1">
          <IconChart className="w-3 h-3 text-slate-400" />
          <span>HRIS KPI & Performance Engine</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-white hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
        >
          {copied ? <IconCheck className="w-3 h-3 text-emerald-600" /> : null}
          <span>{copied ? 'Copied' : 'Copy Text'}</span>
        </button>
      </div>
    </div>
  )
}
