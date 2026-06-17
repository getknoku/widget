/**
 * Single message renderer.
 *
 * Handles three render modes:
 *
 * 1. **User message** — bubble with optional attached image.
 * 2. **Assistant message** — tool-step strip, optional thinking section,
 *    streamed answer with markdown rendering, source chips, and the action
 *    bar (thumbs/copy/regenerate).
 * 3. **Streaming placeholder** — spinner shown while waiting for the first
 *    text token.
 *
 * Includes a small inline markdown renderer (`renderMarkdown` /
 * `renderThinking`) tuned to the subset the agent actually emits, plus a
 * URL sanitizer for AI-authored links.
 */

import { useState, useMemo } from 'preact/hooks'
import type { Message as MessageType, SourceRef, TimelineItem } from '../types'
import type { UIStrings } from '../i18n'
import { getTurnstileToken } from '../turnstile'
import { resolveDocLinkHref } from '../doc-link'
import { cleanDocumentTitle } from '../doc-display'

interface Props {
  message: MessageType
  t: UIStrings
  apiUrl: string
  projectId: string
  /**
   * Canonical host for resolving relative `url_path` values from the
   * backend. Empty string falls back to `window.location.origin` — only
   * correct when widget is mounted on the same host as the docs.
   */
  primaryDomain: string
  /**
   * Cloudflare Turnstile site key when the project's owner configured it.
   * Empty string disables the gate; feedback POSTs go out unauthenticated.
   */
  turnstileSiteKey: string
  sessionId: string | null
  messageIndex: number
  isLastAssistant?: boolean
  onRegenerate?: () => void
  canRegenerate?: boolean
}

export function Message({
  message,
  t,
  apiUrl,
  projectId,
  primaryDomain,
  turnstileSiteKey,
  sessionId,
  messageIndex,
  isLastAssistant,
  onRegenerate,
  canRegenerate,
}: Props) {
  if (message.role === 'user') {
    return (
      <div class="knoku-msg-user">
        <div class="knoku-msg-user-bubble">
          {message.image && (
            <img src={message.image} alt="attached" class="knoku-user-img" />
          )}
          {message.content}
        </div>
      </div>
    )
  }

  const uniqueSources = message.sources
    ? [...new Map(message.sources.map(s => [s.path, s])).values()]
    : []

  // Trailing citation-block stripping happens on the backend
  // (stripTrailingCitationBlock + text_replace SSE event), so the widget
  // only normalises whitespace here. The previous client-side regex
  // matched the literal word "Source" anywhere — including inline phrases
  // like "source files to citation URLs" — and silently truncated the
  // visible answer at the first match.
  const cleanText = (raw: string) =>
    raw.replace(/\n{3,}/g, '\n\n').trim()

  // Final user-visible answer text — last text item in the timeline if the
  // agent path is active, otherwise the legacy `content` field. Drives copy,
  // regenerate, and source-chip enablement.
  const timeline = message.timeline || []
  const hasTimeline = timeline.length > 0
  const lastTextItem = [...timeline].reverse().find(it => it.kind === 'text') as
    | (Extract<TimelineItem, { kind: 'text' }>)
    | undefined
  const cleanContent = cleanText(lastTextItem?.text ?? message.content ?? '')

  return (
    <div class={`knoku-msg-assistant${message.isStreaming ? ' knoku-msg-streaming' : ''}`}>
      {/* Chronological timeline: narration text and search steps interleave
          in the order the agent emitted them. Replaces the older steps[] +
          thinking + content stack which rendered out of order. */}
      {hasTimeline && timeline.map((item, i) => {
        if (item.kind === 'text') {
          const cleaned = cleanText(item.text)
          if (!cleaned) return null
          return (
            <MarkdownText
              key={i}
              text={cleaned}
              primaryDomain={primaryDomain}
            />
          )
        }
        if (item.kind === 'search') {
          return (
            <SearchRow
              key={i}
              count={item.count}
              searchingLabel={t.searching}
              foundLabel={item.count !== undefined ? t.foundDocs(item.count) : ''}
            />
          )
        }
        return null
      })}

      {/* Legacy steps render — only shown if the message still uses the old
          shape (no timeline). Kept for backward compat with previously
          stored sessions or any code path that bypasses the agent loop. */}
      {!hasTimeline && message.steps?.map((step, i) => (
        <StatusStepView key={i} step={step} />
      ))}

      {/* Legacy thinking section. */}
      {!hasTimeline && message.thinking && (
        <ThinkingSection
          t={t}
          text={message.thinking}
          isStreaming={message.isStreaming && !cleanContent}
          duration={message.thinkingDuration}
        />
      )}

      {/* Spinner while the assistant has produced nothing yet — neither
          timeline items nor legacy content. */}
      {message.isStreaming && !cleanContent && !hasTimeline && !message.steps?.length && !message.thinking && (
        <div class="knoku-status-line">
          <div class="knoku-status-spinner" />
          <span>{t.generating}</span>
        </div>
      )}

      {/* Composing indicator — runs between the driver's last tool_result
          and the writer's first text chunk, so the user sees activity in
          the second-or-two it takes the writer model to start streaming. */}
      {message.composing && (
        <div class="knoku-composing">
          <span></span><span></span><span></span>
        </div>
      )}

      {/* Legacy answer fallback. */}
      {!hasTimeline && cleanContent && (
        <MarkdownText text={cleanContent} primaryDomain={primaryDomain} />
      )}

      {/* Sources — only after the answer finishes streaming so the block
          doesn't appear mid-render and jitter the scroll position. */}
      {uniqueSources.length > 0 && !message.isStreaming && (
        <SourcesDropdown sources={uniqueSources} primaryDomain={primaryDomain} />
      )}

      {/* Actions */}
      {!message.isStreaming && cleanContent && (
        <ActionButtons
          t={t}
          content={cleanContent}
          sources={uniqueSources}
          apiUrl={apiUrl}
          projectId={projectId}
          primaryDomain={primaryDomain}
          turnstileSiteKey={turnstileSiteKey}
          sessionId={sessionId}
          messageIndex={messageIndex}
          showRegenerate={!!isLastAssistant && !!canRegenerate}
          onRegenerate={onRegenerate}
        />
      )}
    </div>
  )
}

function SourcesDropdown({ sources, primaryDomain }: {
  sources: SourceRef[]
  primaryDomain: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div class="knoku-sources-dropdown">
      <button
        type="button"
        class="knoku-sources-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>Sources ({sources.length})</span>
        <svg class="knoku-sources-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div class="knoku-sources-list">
          {sources.map((src, i) => {
            const href = resolveSourceHref(src.url, src.url_path, src.path, primaryDomain)
            const label = cleanDocumentTitle(src.title) || 'Source'
            // No outbound URL (e.g. uploaded files) → plain text, never a link
            // to the embed host and never the raw storage path.
            if (!href) {
              return <span key={i} class="knoku-source-link knoku-source-link-static">{label}</span>
            }
            return (
              <a key={i} class="knoku-source-link" href={href} target="_blank" rel="noopener">
                {label}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SearchRow({
  count,
  searchingLabel,
  foundLabel,
}: {
  count?: number
  searchingLabel: string
  foundLabel: string
}) {
  const isDone = count !== undefined

  return (
    <div class="knoku-status-block">
      <div class="knoku-status-line">
        {!isDone ? <div class="knoku-status-spinner" /> : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        )}
        <span class="knoku-status-text">
          {isDone && foundLabel ? foundLabel : searchingLabel}
        </span>
      </div>
    </div>
  )
}

function StatusStepView({ step }: { step: NonNullable<MessageType['steps']>[number] }) {
  return (
    <div class="knoku-status-block">
      <div class="knoku-status-line">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>{step.text}</span>
      </div>
    </div>
  )
}

function ThinkingSection({ t, text, isStreaming, duration }: { t: UIStrings; text: string; isStreaming?: boolean; duration?: number }) {
  const [expanded, setExpanded] = useState(false)

  // Live render while the model is still emitting thinking tokens; collapse to a
  // toggle once the run finishes so the answer stays the focus of the panel.
  if (isStreaming) {
    return (
      <div class="knoku-thinking-live">
        <div class="knoku-thinking-header">
          <div class="knoku-status-spinner" />
          <span>{t.thinking}</span>
        </div>
        <div class="knoku-thinking-text" dangerouslySetInnerHTML={{ __html: renderThinking(text) }} />
      </div>
    )
  }

  const summary = duration ? t.thoughtFor(duration) : t.thoughtDone

  return (
    <div class="knoku-thinking-collapsed">
      <button class="knoku-thinking-toggle" onClick={() => setExpanded(!expanded)}>
        <span>{summary}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
      {expanded && (
        <div class="knoku-thinking-content" dangerouslySetInnerHTML={{ __html: renderThinking(text) }} />
      )}
    </div>
  )
}

function ActionButtons({
  t,
  content,
  sources,
  apiUrl,
  projectId,
  primaryDomain,
  turnstileSiteKey,
  sessionId,
  messageIndex,
  showRegenerate,
  onRegenerate,
}: {
  t: UIStrings
  content: string
  sources: NonNullable<MessageType['sources']>
  apiUrl: string
  projectId: string
  primaryDomain: string
  turnstileSiteKey: string
  sessionId: string | null
  messageIndex: number
  showRegenerate?: boolean
  onRegenerate?: () => void
}) {
  const [liked, setLiked] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(formatCopyText(content, sources, primaryDomain))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleFeedback = async (nextLiked: boolean) => {
    if (!sessionId) return

    const previousLiked = liked
    const nextState = liked === nextLiked ? null : nextLiked
    setLiked(nextState)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (turnstileSiteKey) {
        try {
          const token = await getTurnstileToken(turnstileSiteKey, 'feedback')
          if (token) headers['cf-turnstile-response'] = token
        } catch {
          // Token fetch failed; the request goes out anyway, backend will
          // 403 and the catch below rolls the UI back.
        }
      }
      const res = await fetch(`${apiUrl}/api/v1/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          project_id: projectId,
          session_id: sessionId,
          message_idx: messageIndex,
          feedback: nextState === true ? 'like' : nextState === false ? 'dislike' : 'none',
        }),
      })
      if (!res.ok) throw new Error(`feedback failed: ${res.status}`)
    } catch {
      setLiked(previousLiked)
    }
  }

  return (
    <div class="knoku-actions">
      <button class={`knoku-action-btn knoku-action-btn-up ${liked === true ? 'active' : ''}`}
        onClick={() => handleFeedback(true)} title={t.helpful}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={liked === true ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
        </svg>
      </button>
      <button class={`knoku-action-btn knoku-action-btn-down ${liked === false ? 'active' : ''}`}
        onClick={() => handleFeedback(false)} title={t.notHelpful}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={liked === false ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
        </svg>
      </button>
      <button class="knoku-action-btn" onClick={handleCopy} title={t.copy}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
      {showRegenerate && (
        <button class="knoku-action-btn" onClick={onRegenerate} title={t.regenerate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      )}
      {copied && <span class="knoku-copied">{t.copied}</span>}
    </div>
  )
}

function formatCopyText(content: string, sources: NonNullable<MessageType['sources']>, primaryDomain: string): string {
  if (!sources.length) return content

  const sourceLines = sources.map((src) => {
    const label = cleanDocumentTitle(src.title) || 'Source'
    const href = resolveSourceHref(src.url, src.url_path, src.path, primaryDomain)
    // Never emit the raw storage path (crawl/<hash>.md, uploads/<hash>.md).
    return href ? `- [${label}](${href})` : `- ${label}`
  })

  return `${content}\n\nSources:\n${sourceLines.join('\n')}`
}

/**
 * Pick the canonical host that relative source paths should resolve to:
 * the project's `primary_domain` if set in the dashboard, otherwise the
 * current page's origin (legacy fallback for single-host installs).
 * Trailing slash trimmed so callers can safely concatenate `${base}${path}`.
 */
function sourceLinkBase(primaryDomain: string): string {
  const fromConfig = (primaryDomain || '').replace(/\/+$/, '')
  if (fromConfig) return fromConfig
  if (typeof window === 'undefined') return ''
  const origin = window.location.origin
  // srcdoc preview iframes expose the opaque origin as the string "null".
  if (!origin || origin === 'null') return ''
  return origin
}

/**
 * Resolve the click target for a source-citation chip. Prefers the backend's
 * `url_path`; if absolute, used verbatim; if relative, prefixed with the
 * canonical host. Falls back to the doc path turned into a slug when the
 * backend never resolved a public URL for this doc.
 */
function resolveSourceHref(
  absoluteURL: string | undefined,
  urlPath: string | undefined,
  _path: string,
  _primaryDomain: string,
): string {
  const direct = (absoluteURL || '').trim()
  if (/^https?:/i.test(direct)) return direct
  const fromPath = (urlPath || '').trim()
  if (/^https?:/i.test(fromPath)) return fromPath
  return ''
}

/**
 * Convert the assistant's markdown answer into HTML.
 *
 * Handles fenced code blocks, headings (h1–h4), GFM-style tables, ordered
 * and unordered lists, and paragraphs with inline markdown (`inl`). The
 * grammar is intentionally narrow — only what the docs agent emits — to
 * keep the bundle small.
 */
// Tiny wrapper that memoizes the markdown parse — re-parses only when the
// text or primaryDomain actually changes. For inactive messages this is a
// pure no-op (props are stable); for the active streaming message the
// parse re-runs in step with the smoothing tick, which is unavoidable but
// localised to this single text block rather than the entire chat list.
function MarkdownText({ text, primaryDomain }: { text: string; primaryDomain: string }) {
  const html = useMemo(() => renderMarkdown(text, primaryDomain), [text, primaryDomain])
  return <div class="knoku-answer" dangerouslySetInnerHTML={{ __html: html }} />
}

function renderMarkdown(text: string, primaryDomain: string): string {
  if (!text) return ''
  const inlBound = (s: string) => inl(s, primaryDomain)
  const lines = text.split('\n')
  const html: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed || /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { i++; continue }

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim()
      const codeBuf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeBuf.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // skip the closing ``` fence
      html.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`)
      continue
    }

    if (/^#{1,4}\s+/.test(trimmed)) {
      const lvl = Math.min((trimmed.match(/^(#+)/)?.[1].length || 1) + 1, 4)
      html.push(`<h${lvl}>${inlBound(trimmed.replace(/^#+\s*/, ''))}</h${lvl}>`)
      i++
      continue
    }

    // GFM table: pipe-row followed by a separator row containing dashes.
    if (trimmed.includes('|') && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1].trim()) && lines[i + 1].includes('-')) {
      const headerLine = lines[i]
      i += 2
      const bodyLines: string[] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        bodyLines.push(lines[i])
        i++
      }
      const parseRow = (r: string): string[] => {
        const p = r.split('|')
        if (p.length > 0 && p[0].trim() === '') p.shift()
        if (p.length > 0 && p[p.length - 1].trim() === '') p.pop()
        return p.map(c => c.trim())
      }
      const hdrs = parseRow(headerLine)
      const cols = hdrs.length
      let tbl = '<table><thead><tr>' + hdrs.map(c => `<th>${inlBound(c) || '&nbsp;'}</th>`).join('') + '</tr></thead><tbody>'
      for (const row of bodyLines) {
        const cells = parseRow(row)
        while (cells.length < cols) cells.push('')
        tbl += '<tr>' + cells.slice(0, cols).map(c => `<td>${inlBound(c) || '&nbsp;'}</td>`).join('') + '</tr>'
      }
      html.push(tbl + '</tbody></table>')
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      html.push('<ul>' + items.map(item => `<li>${inlBound(item)}</li>`).join('') + '</ul>')
      continue
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i++
      }
      html.push('<ol>' + items.map(item => `<li>${inlBound(item)}</li>`).join('') + '</ol>')
      continue
    }

    // Paragraph: gather consecutive non-block lines until a blank line or a new block construct.
    const pLines: string[] = [trimmed]
    i++
    while (i < lines.length) {
      const next = lines[i].trim()
      if (!next) break
      if (next.startsWith('```') || /^#{1,4}\s+/.test(next) || /^[-*]\s+/.test(next) || /^\d+[.)]\s+/.test(next)) break
      if (next.includes('|') && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1]?.trim() || '') && lines[i + 1]?.includes('-')) break
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(next)) { i++; break }
      pLines.push(next)
      i++
    }
    html.push(`<p>${pLines.map(l => inlBound(l)).join('<br/>')}</p>`)
  }

  return html.join('')
}

/**
 * Lightweight markdown renderer used for the thinking section. Code blocks
 * and inline `code`/`**bold**` only — full block grammar is overkill for the
 * compact reasoning trace.
 */
function renderThinking(text: string): string {
  let result = esc(text)
    .replace(/```\w*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/```\w*([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  result = result
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*\*/g, '')
    .replace(/\n/g, '<br/>')
    .replace(/<br\/><pre>/g, '<pre>')
    .replace(/<\/pre><br\/>/g, '</pre>')
  return result
}

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function escAttr(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Allowlist a URL emitted by the assistant for use as an `<a href>` value.
 * Returns the escaped href when it matches a safe shape, or `null` to fall
 * back to plain text. Protocol-relative URLs (`//example.com`) are rejected
 * up front because the browser would expand them to the host's protocol
 * and turn an AI-generated link into an unintended external navigation.
 */
function sanitizeHref(raw: string): string | null {
  const href = raw.trim()
  if (!href) return null

  if (href.startsWith('//')) return null

  if (
    href.startsWith('/') ||
    href.startsWith('./') ||
    href.startsWith('../') ||
    href.startsWith('#') ||
    href.startsWith('?')
  ) {
    return escAttr(href)
  }

  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    return escAttr(href)
  }

  return null
}

function inl(s: string, primaryDomain: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => {
      // Relative paths from the LLM (`/cli/push`) must resolve against the
      // docs host, not whatever site the widget is mounted on. Prefix with
      // the project's primary_domain when one is set; otherwise let the
      // browser fall back to the current page's origin (legacy behavior).
      const resolvedHref = resolveDocLinkHref(href, primaryDomain)
      const safeHref = sanitizeHref(resolvedHref)
      if (!safeHref) return label
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Strip orphan ** markers left behind when the LLM produces an unmatched
    // bold marker (e.g. "1. **Analytics → Data" with no closing **). Without
    // this the literal asterisks leak into the rendered output.
    .replace(/\*\*/g, '')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}
