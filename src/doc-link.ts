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

/** Resolve a docs link against the project's canonical host. */
export function resolveDocLinkHref(href: string, primaryDomain: string): string {
  const normalized = normalizeDocLinkHref(href)
  const base = (primaryDomain || '').replace(/\/+$/, '')
  if (!base) return normalized
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return normalized
  return `${base}${normalized}`
}
