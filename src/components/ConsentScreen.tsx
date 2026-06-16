/**
 * Pre-chat consent screen rendered when `data-consent-required="true"` and
 * the visitor has no recorded decision yet. Rendered inside the Shadow DOM
 * so host-page CSS cannot style around the opt-in.
 */

import type { ConsentConfig } from '../types'
import { consentAcceptButtonColors } from '../theme'

interface Props {
  consent: ConsentConfig
  primaryColorLight: string
  primaryColorDark: string
  isDarkTheme: boolean
  onAccept: () => void
  onReject: () => void
  onClose: () => void
}

export function ConsentScreen({
  consent,
  primaryColorLight,
  primaryColorDark,
  isDarkTheme,
  onAccept,
  onReject,
  onClose,
}: Props) {
  const acceptColors = consentAcceptButtonColors(
    primaryColorLight,
    primaryColorDark,
    isDarkTheme,
  )
  return (
    <>
      <button
        type="button"
        class="knoku-panel-close"
        onClick={onClose}
        aria-label="Close"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div class="knoku-consent">
        <div class="knoku-consent-card">
        <h2 class="knoku-consent-title">{consent.title}</h2>
        <div
          class="knoku-consent-disclaimer"
          dangerouslySetInnerHTML={{ __html: renderConsentMarkdown(consent.disclaimer) }}
        />
        <div class="knoku-consent-actions">
          <button
            type="button"
            class="knoku-consent-accept"
            style={{
              backgroundColor: acceptColors.bg,
              color: acceptColors.fg,
              borderColor: acceptColors.border,
            }}
            onClick={onAccept}
          >
            {consent.acceptText}
          </button>
          <button type="button" class="knoku-consent-reject" onClick={onReject}>
            {consent.rejectText}
          </button>
        </div>
      </div>
      </div>
    </>
  )
}

/**
 * Minimal markdown for the consent disclaimer: bold, italic, links, line
 * breaks. Operator-authored copy in practice, but we still escape input
 * before applying the markdown rules and allowlist link schemes.
 */
function renderConsentMarkdown(src: string): string {
  const escaped = escapeHtml(src)
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => {
      const clean = sanitizeHref(href)
      if (!clean) return label
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${label}</a>`
    })
    .replace(/\n/g, '<br/>')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeHref(href: string): string {
  const trimmed = href.trim()
  if (!trimmed) return ''
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return escapeHtml(trimmed)
  }
  return ''
}
