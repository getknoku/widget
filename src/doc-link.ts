/**
 * Normalize agent-emitted markdown link targets before prefixing primary_domain.
 * The model sometimes wraps url_path in angle brackets: `[push](</cli/push>)`.
 */
export function normalizeDocLinkHref(href: string): string {
  let h = href.trim()
  if (!h) return h

  if (h.startsWith('<') && h.endsWith('>') && h.length > 2) {
    h = h.slice(1, -1).trim()
  }

  if (
    /^https?:/i.test(h) ||
    h.startsWith('mailto:') ||
    h.startsWith('tel:') ||
    h.startsWith('//') ||
    h.startsWith('#') ||
    h.startsWith('?') ||
    h.startsWith('./') ||
    h.startsWith('../')
  ) {
    return h
  }

  if (h.startsWith('/')) return h
  return `/${h.replace(/^\/+/, '')}`
}

/**
 * Resolve an agent-emitted link for use as an href. Absolute links (and
 * mailto/tel/anchors) pass through. Host-rooted relative paths (`/docs/...`)
 * are dropped: there is no docs-host config anymore, so the backend emits
 * absolute citation URLs and a leftover relative path would otherwise resolve
 * against the embed host (wrong site). An empty return renders as plain text.
 */
export function resolveDocLinkHref(href: string, _primaryDomain?: string): string {
  const normalized = normalizeDocLinkHref(href).trim()
  if (
    /^https?:/i.test(normalized) ||
    normalized.startsWith('mailto:') ||
    normalized.startsWith('tel:') ||
    normalized.startsWith('#') ||
    normalized.startsWith('?')
  ) {
    return normalized
  }
  return ''
}
