import React from 'react'

interface Props {
  content: string
  isMe?: boolean
  isAi?: boolean
}

/**
 * Clean, lightweight rich text & markdown renderer for workspace chat bubbles.
 * Supports:
 * - Markdown tables (rendered as beautiful responsive HTML tables)
 * - Headers (##, ###, #)
 * - Bold (**text**), Italic (*text*)
 * - Inline code (`code`)
 * - Bullet lists (- , * , • )
 * - Checklists ([ ], [x])
 * - @mentions
 * - Strips or properly handles HTML <br> tags
 */
export default function RichChatMessage({ content, isMe = false, isAi = false }: Props) {
  if (!content) return null

  // Helper to render inline formatting: bold, italic, code, mentions, br
  const renderInline = (text: string) => {
    // First, handle <br> tags by splitting into lines
    const normalized = text.replace(/<br\s*\/?>/gi, '\n')
    
    // Split by inline tokens: code, bold, italic, mentions
    const tokens = normalized.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|@[a-zA-Z0-9_.-]+(?:\s+[a-zA-Z0-9_.-]+)?)/g)

    return tokens.map((token, idx) => {
      if (!token) return null

      // Inline code `code`
      if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
        return (
          <code
            key={idx}
            className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${
              isMe ? 'bg-white/20 text-white' : 'bg-slate-100 text-purple-700 border border-slate-200'
            }`}
          >
            {token.slice(1, -1)}
          </code>
        )
      }

      // Bold **bold**
      if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
        return (
          <strong key={idx} className={isMe ? 'font-black text-white' : 'font-bold text-slate-900'}>
            {token.slice(2, -2)}
          </strong>
        )
      }

      // Italic *italic*
      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        return (
          <em key={idx} className="italic">
            {token.slice(1, -1)}
          </em>
        )
      }

      // Mentions @name
      if (token.startsWith('@')) {
        const raw = token.slice(1).trim().toLowerCase()
        const isAiMention = raw === 'ai' || raw === 'gemini' || raw === 'copilot' || raw === 'groq'
        return (
          <span
            key={idx}
            className={`inline-flex items-center font-bold px-1.5 py-0.2 mx-0.5 rounded-md text-xs shadow-2xs ${
              isMe
                ? 'bg-white/25 text-white border border-white/35 backdrop-blur-xs'
                : isAiMention
                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                : 'bg-blue-100 text-blue-900 border border-blue-200'
            }`}
          >
            {token}
          </span>
        )
      }

      // Plain text with line breaks
      if (token.includes('\n')) {
        const lines = token.split('\n')
        return (
          <React.Fragment key={idx}>
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {line}
                {lIdx < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </React.Fragment>
        )
      }

      return token
    })
  }

  // Parse lines into blocks: tables, headers, lists, paragraphs
  const rawLines = content.split('\n')
  const blocks: { type: 'table' | 'header' | 'checklist' | 'list' | 'p'; lines: string[] }[] = []
  let currentBlock: { type: 'table' | 'header' | 'checklist' | 'list' | 'p'; lines: string[] } | null = null

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim()

    // Table line: e.g. | col | col |
    if (line.startsWith('|') && line.endsWith('|')) {
      if (currentBlock && currentBlock.type === 'table') {
        currentBlock.lines.push(line)
      } else {
        if (currentBlock) blocks.push(currentBlock)
        currentBlock = { type: 'table', lines: [line] }
      }
      continue
    }

    // Header line
    if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
      if (currentBlock) blocks.push(currentBlock)
      currentBlock = { type: 'header', lines: [line] }
      continue
    }

    // Checklist line
    if (/^[-*•]?\s*\[([ xX])\]/.test(line)) {
      if (currentBlock && currentBlock.type === 'checklist') {
        currentBlock.lines.push(line)
      } else {
        if (currentBlock) blocks.push(currentBlock)
        currentBlock = { type: 'checklist', lines: [line] }
      }
      continue
    }

    // Bullet list line
    if (/^[-*•]\s+/.test(line)) {
      if (currentBlock && currentBlock.type === 'list') {
        currentBlock.lines.push(line)
      } else {
        if (currentBlock) blocks.push(currentBlock)
        currentBlock = { type: 'list', lines: [line] }
      }
      continue
    }

    // Normal paragraph
    if (currentBlock && currentBlock.type === 'p') {
      currentBlock.lines.push(line)
    } else {
      if (currentBlock) blocks.push(currentBlock)
      currentBlock = { type: 'p', lines: [line] }
    }
  }

  if (currentBlock) blocks.push(currentBlock)

  return (
    <div className="space-y-2 text-sm leading-relaxed overflow-hidden">
      {blocks.map((block, bIdx) => {
        // ── TABLE BLOCK ──────────────────────────────────────────────────────
        if (block.type === 'table') {
          const rows = block.lines
            .map(line =>
              line
                .slice(1, -1)
                .split('|')
                .map(cell => cell.trim())
            )
            .filter(row => !row.every(cell => /^[-:]+$/.test(cell))) // Filter out separator |---|---|

          if (rows.length === 0) return null

          const headerRow = rows[0]
          const dataRows = rows.slice(1)

          return (
            <div key={bIdx} className="my-2.5 overflow-x-auto rounded-xl border border-slate-200/80 shadow-2xs bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {headerRow.map((col, cIdx) => (
                      <th key={cIdx} className="px-3 py-2 font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                        {renderInline(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dataRows.map((row, rIdx) => (
                    <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 text-slate-800 align-top leading-relaxed">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        // ── HEADER BLOCK ─────────────────────────────────────────────────────
        if (block.type === 'header') {
          return (
            <div key={bIdx} className="pt-1.5 pb-0.5">
              {block.lines.map((line, lIdx) => {
                const text = line.replace(/^#{1,3}\s+/, '')
                return (
                  <h4
                    key={lIdx}
                    className={`font-bold text-sm tracking-tight flex items-center gap-1.5 ${
                      isMe ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {renderInline(text)}
                  </h4>
                )
              })}
            </div>
          )
        }

        // ── CHECKLIST BLOCK ──────────────────────────────────────────────────
        if (block.type === 'checklist') {
          return (
            <ul key={bIdx} className="space-y-1 my-1.5">
              {block.lines.map((line, lIdx) => {
                const isChecked = /^[-*•]?\s*\[[xX]\]/.test(line)
                const text = line.replace(/^[-*•]?\s*\[[ xX]\]\s*/, '')
                return (
                  <li key={lIdx} className="flex items-start gap-2 text-xs">
                    <span
                      className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 mt-0.5 border text-[10px] ${
                        isChecked
                          ? 'bg-emerald-500 border-emerald-600 text-white font-bold'
                          : 'bg-white border-slate-300 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className={isChecked ? 'line-through text-slate-400' : 'text-slate-800'}>
                      {renderInline(text)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )
        }

        // ── BULLET LIST BLOCK ────────────────────────────────────────────────
        if (block.type === 'list') {
          return (
            <ul key={bIdx} className="space-y-1 my-1">
              {block.lines.map((line, lIdx) => {
                const text = line.replace(/^[-*•]\s+/, '')
                return (
                  <li key={lIdx} className="flex items-start gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${isMe ? 'bg-white/80' : 'bg-purple-600'}`} />
                    <span className="flex-1">{renderInline(text)}</span>
                  </li>
                )
              })}
            </ul>
          )
        }

        // ── NORMAL PARAGRAPH ─────────────────────────────────────────────────
        return (
          <p key={bIdx} className="whitespace-pre-wrap leading-relaxed">
            {block.lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {renderInline(line)}
                {lIdx < block.lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
