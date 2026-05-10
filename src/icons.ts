/**
 * Built-in icon set for suggested questions. Each entry is the inner SVG
 * content (paths/circles/lines) of a 24x24 viewBox icon. Rendered inside
 * `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">`
 * by ChatWindow. Unknown names fall back to `sparkle`.
 *
 * Icon style follows lucide-react conventions (1.8 stroke, round joins).
 *
 * Custom SVG (npm path only): callers may pass a string that begins with `<`
 * as the `icon` field of a suggested question. Content is sanitized via
 * `sanitizeIconSvg` and injected as inner SVG; rejected content falls back
 * to `sparkle`.
 */

export const ICON_NAMES = [
  'sparkle', 'rocket', 'book', 'book-open', 'code', 'terminal', 'package', 'plug',
  'key', 'shield', 'settings', 'users', 'building',
  'card', 'tag', 'wallet',
  'cloud', 'database', 'globe',
  'zap', 'bell', 'chart', 'search', 'mail', 'help',
] as const

export type IconName = typeof ICON_NAMES[number]

export const ICONS: Record<string, string> = {
  sparkle: '<path d="M12 2.75l2.45 6.8L21.25 12l-6.8 2.45L12 21.25l-2.45-6.8L2.75 12l6.8-2.45L12 2.75z"/>',

  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',

  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',

  'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',

  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',

  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',

  package: '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>',

  plug: '<path d="M12 22v-5"/><path d="M9 7V2"/><path d="M15 7V2"/><path d="M6 13V8h12v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z"/>',

  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',

  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',

  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',

  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',

  building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',

  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',

  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',

  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',

  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>',

  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',

  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a14.5 14.5 0 0 1 0 20 14.5 14.5 0 0 1 0-20"/>',

  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',

  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',

  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',

  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',

  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',

  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
}

/**
 * Sanitize caller-supplied SVG content for use as a suggestion icon.
 *
 * Allowlist-light approach: reject the input outright if it contains any
 * known dangerous primitive (script, event handlers, external references,
 * data/javascript URIs, animations, foreignObject, etc.) or exceeds 4 KB.
 * Returns `null` on rejection so the caller can fall back to a built-in.
 *
 * The widget runs inside Shadow DOM but the panel host is the customer's
 * page — a malicious icon string could exfiltrate or run script in their
 * top frame, so the bar is "no executable surface", not just "looks clean".
 */
export function sanitizeIconSvg(input: string): string | null {
  if (typeof input !== 'string') return null
  if (input.length > 4096) return null
  const blocked: RegExp[] = [
    /<\s*script/i,
    /<\s*\/?\s*style/i,
    /<\s*foreignObject/i,
    /<\s*iframe/i,
    /<\s*image[\s>]/i,
    /<\s*animate/i,
    /<\s*set[\s>]/i,
    /\son\w+\s*=/i,
    /xlink:href/i,
    /\bhref\s*=/i,
    /javascript\s*:/i,
    /data\s*:/i,
    /url\s*\(/i,
    /<\s*\?/,
    /<\s*!\s*ENTITY/i,
    /<\s*!\s*DOCTYPE/i,
  ]
  for (const re of blocked) {
    if (re.test(input)) return null
  }
  return input
}

/**
 * Resolve a suggestion `icon` field to renderable inner-SVG content.
 *
 * - Empty/missing → `sparkle` default.
 * - Starts with `<` → treated as raw SVG; passed through `sanitizeIconSvg`,
 *   falls back to `sparkle` on rejection.
 * - Otherwise → looked up in the `ICONS` table; falls back to `sparkle`
 *   when the name is unknown.
 */
export function resolveIcon(icon?: string): string {
  if (!icon) return ICONS.sparkle
  const trimmed = icon.trim()
  if (!trimmed) return ICONS.sparkle
  if (trimmed.startsWith('<')) {
    return sanitizeIconSvg(trimmed) || ICONS.sparkle
  }
  return ICONS[trimmed] || ICONS.sparkle
}
