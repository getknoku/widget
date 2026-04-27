/**
 * First-party cookie helpers for the widget.
 *
 * Two cookies are written, both first-party on the host's own domain:
 *
 * - `knoku_web_id` — anonymous, per-browser id sent with chat requests so the
 *   backend can correlate sessions to a returning visitor.
 * - `knoku_consent` — per-project consent decision (accepted/rejected),
 *   namespaced with the project id so different projects on the same host
 *   do not share a single decision.
 *
 * No identifying information is stored. No cross-site tracking.
 */

const COOKIE_NAME = 'knoku_web_id'
// Safari's ITP caps document.cookie max-age at 400 days; 399 leaves a margin.
const COOKIE_MAX_AGE_SECONDS = 399 * 24 * 60 * 60

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(name + '='))
  if (!match) return ''
  return decodeURIComponent(match.slice(name.length + 1))
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`
}

function randomID(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Return a stable per-browser identifier, creating the cookie on first call.
 * Returns an empty string when `document` is unavailable (e.g. during SSR).
 */
export function getOrCreateWebID(): string {
  if (typeof document === 'undefined') return ''
  const existing = readCookie(COOKIE_NAME)
  if (existing) return existing
  const fresh = randomID()
  writeCookie(COOKIE_NAME, fresh, COOKIE_MAX_AGE_SECONDS)
  return fresh
}

const CONSENT_COOKIE = 'knoku_consent'
const CONSENT_MAX_AGE = 365 * 24 * 60 * 60

/**
 * Read the consent decision for `projectId`. Returns `''` when no decision
 * has been recorded for this project, even if a different project on the
 * same host has its own decision stored.
 */
export function readConsent(projectId: string): 'accepted' | 'rejected' | '' {
  const raw = readCookie(CONSENT_COOKIE)
  if (!raw) return ''
  const [storedId, state] = raw.split(':')
  if (storedId !== projectId) return ''
  return state === 'accepted' || state === 'rejected' ? state : ''
}

/** Persist the consent decision for `projectId`. */
export function writeConsent(projectId: string, state: 'accepted' | 'rejected') {
  writeCookie(CONSENT_COOKIE, `${projectId}:${state}`, CONSENT_MAX_AGE)
}
