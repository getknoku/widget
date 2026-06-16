/**
 * Human-readable labels for document titles/paths in search steps and sources.
 * Crawled docs often carry Mintlify-style heading noise in titles.
 */

export interface DocumentDisplayInput {
  title?: string
  path?: string
  url_path?: string
}

const MD_LINK_RE = /\[([^\]]*)\]\([^)]*\)/g
const MD_PERMALINK_RE = /\s*\[permalink[^\]]*\]\([^)]*\)/gi
const MD_ESCAPE_RE = /\\([\\`*_{}[\]()#+.!-])/g
const INTERNAL_PATH_RE = /^(crawl|ingest|github|notion|slack|discord)\//

/** Strip markdown link/escape noise from a heading or doc title. */
export function cleanDocumentTitle(raw: string): string {
  if (!raw) return ''
  let title = raw.trim()
  title = title.replace(MD_PERMALINK_RE, '')
  title = title.replace(MD_LINK_RE, (_, label: string) => {
    const trimmed = label.trim()
    if (/^permalink/i.test(trimmed)) return ''
    return trimmed
  })
  title = title.replace(MD_ESCAPE_RE, '$1')
  title = title.replace(/^#+\s*/, '')
  title = title.replace(/[*_`]/g, '')
  return title.replace(/\s+/g, ' ').trim()
}

function isInternalDocPath(path: string): boolean {
  return INTERNAL_PATH_RE.test(path)
}

/** Subtitle under a doc title — prefer public url_path over internal crawl paths. */
export function documentDisplaySubtitle(
  urlPath: string | undefined,
  path: string | undefined,
): string | null {
  const url = urlPath?.trim()
  if (url) {
    if (/^https?:\/\//i.test(url)) {
      try {
        const parsed = new URL(url)
        return parsed.pathname + parsed.hash
      } catch {
        return url
      }
    }
    return url.startsWith('/') ? url : `/${url}`
  }
  const p = path?.trim()
  if (p && !isInternalDocPath(p)) {
    return p.replace(/\.mdx?$/, '')
  }
  return null
}

export function formatDocumentDisplay(
  doc: DocumentDisplayInput,
): { title: string; subtitle: string | null } {
  const cleaned = cleanDocumentTitle(doc.title || '')
  const title = cleaned || cleanDocumentTitle(doc.path || '') || 'Document'
  return {
    title,
    subtitle: documentDisplaySubtitle(doc.url_path, doc.path),
  }
}
