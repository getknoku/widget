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

import { useState } from 'preact/hooks'
import type { Message as MessageType } from '../types'
import type { UIStrings } from '../i18n'

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

  // Strip source citations the agent sometimes embeds in the answer text.
  // The widget already renders sources as discrete chips below, so duplicate
  // inline references are removed to keep the prose clean.
  let cleanContent = message.content
    .replace(/\n*\*{0,2}Sources?:?\*{0,2}[\s\S]*$/i, '')
    .replace(/\*{2,}$/, '')
    .replace(/\[[\w/.:-]+\s*—\s*[^\]]*\]/g, '')
    .replace(/\[[\w/.-]+:\d+\]/g, '')
    .replace(/\([\w/.-]+:\d+[^)]*\)/g, '')
    .replace(/Kaynak(?:lar)?:\s*[-\n\w/.,:— ]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return (
    <div class="knoku-msg-assistant">
      {/* Status steps */}
      {message.steps?.map((step, i) => (
        <StatusStepView key={i} step={step} />
      ))}

      {/* Thinking section */}
      {message.thinking && (
        <ThinkingSection
          t={t}
          text={message.thinking}
          isStreaming={message.isStreaming && !cleanContent}
          duration={message.thinkingDuration}
        />
      )}

      {/* Streaming spinner when no content yet and no thinking */}
      {message.isStreaming && !cleanContent && !message.thinking && (
        <div class="knoku-status-line">
          <div class="knoku-status-spinner" />
          <span>{t.generating}</span>
        </div>
      )}

      {/* Answer */}
      {cleanContent && (
        <div class="knoku-answer" dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanContent, primaryDomain) }} />
      )}

      {/* Source chips */}
      {uniqueSources.length > 0 && (
        <div class="knoku-sources">
          {uniqueSources.map((src, i) => {
            const href = resolveSourceHref(src.url_path, src.path, primaryDomain)
            return (
              <a key={i} class="knoku-source-chip" href={href} target="_blank" rel="noopener">
                {src.title || src.path}
              </a>
            )
          })}
        </div>
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
          sessionId={sessionId}
          messageIndex={messageIndex}
          showRegenerate={!!isLastAssistant && !!canRegenerate}
          onRegenerate={onRegenerate}
        />
      )}
    </div>
  )
}

function StatusStepView({ step }: { step: NonNullable<MessageType['steps']>[number] }) {
  const [expanded, setExpanded] = useState(false)
  const hasDocuments = step.icon === 'search' && !!step.documents?.length

  const content = (
    <>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span>{step.text}</span>
      {hasDocuments && (
        <svg class="knoku-status-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      )}
    </>
  )

  return (
    <div class="knoku-status-block">
      {hasDocuments ? (
        <button class="knoku-status-line knoku-status-button" onClick={() => setExpanded(!expanded)} type="button">
          {content}
        </button>
      ) : (
        <div class="knoku-status-line">{content}</div>
      )}
      {hasDocuments && expanded && (
        <div class="knoku-status-docs">
          {step.documents!.map((doc, i) => (
            <div key={`${doc.path}-${i}`} class="knoku-status-doc">
              <span class="knoku-status-doc-title">{doc.title || doc.path}</span>
              {doc.path && <span class="knoku-status-doc-path">{doc.path}</span>}
            </div>
          ))}
        </div>
      )}
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
      const res = await fetch(`${apiUrl}/api/v1/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const base = sourceLinkBase(primaryDomain)
  const sourceLines = sources.map((src) => {
    const label = src.title || src.path
    const lineSuffix = src.lines ? ` — lines ${src.lines}` : ''
    if (src.url_path) {
      const url = src.url_path.startsWith('http') ? src.url_path : `${base}${src.url_path}`
      return `- [${label}](${url})${lineSuffix}`
    }
    const location = src.path ? `${src.path}${src.lines ? `:${src.lines}` : ''}` : ''
    return location ? `- ${label} (${location})` : `- ${label}`
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
  return window.location.origin
}

/**
 * Resolve the click target for a source-citation chip. Prefers the backend's
 * `url_path`; if absolute, used verbatim; if relative, prefixed with the
 * canonical host. Falls back to the doc path turned into a slug when the
 * backend never resolved a public URL for this doc.
 */
function resolveSourceHref(urlPath: string | undefined, path: string, primaryDomain: string): string {
  const base = sourceLinkBase(primaryDomain)
  if (urlPath) {
    if (/^https?:/i.test(urlPath)) return urlPath
    const rooted = urlPath.startsWith('/') ? urlPath : `/${urlPath}`
    return `${base}${rooted}`
  }
  const slug = `/${path.replace(/\.mdx?$/, '').replace(/\/index$/, '')}`
  return base ? `${base}${slug}` : slug
}

/**
 * Convert the assistant's markdown answer into HTML.
 *
 * Handles fenced code blocks, headings (h1–h4), GFM-style tables, ordered
 * and unordered lists, and paragraphs with inline markdown (`inl`). The
 * grammar is intentionally narrow — only what the docs agent emits — to
 * keep the bundle small.
 */
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
      const resolvedHref = resolveLinkHref(href, primaryDomain)
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

/**
 * Prepend `primaryDomain` to root-relative hrefs (`/foo/bar`). Absolute URLs,
 * fragment links (`#anchor`), query-only links (`?q=`), and parent/sibling
 * paths (`./`, `../`) are left alone — those are not document references.
 */
function resolveLinkHref(href: string, primaryDomain: string): string {
  if (!primaryDomain) return href
  if (!href.startsWith('/')) return href
  if (href.startsWith('//')) return href // protocol-relative, sanitizer rejects anyway
  const base = primaryDomain.replace(/\/+$/, '')
  return `${base}${href}`
}
