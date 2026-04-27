/**
 * In-memory user identity store.
 *
 * Host sites call `window.Knoku.identify(user)` to associate the anonymous
 * `knoku_web_id` cookie with a known user. The value lives in this module
 * for the lifetime of the page and is never persisted — the host is
 * expected to call `identify()` again on every page load with whatever auth
 * state it has. Default state is anonymous (`null`).
 */

import type { WidgetUserIdentity } from './types'

let current: WidgetUserIdentity | null = null

/**
 * Replace the current identity. Pass `null` to clear back to anonymous.
 * Non-string `id`/`email` and non-plain-object `metadata` values are
 * dropped silently rather than thrown — host code may pass partially-typed
 * data from auth providers.
 */
export function setIdentity(u: WidgetUserIdentity | null) {
  if (u == null) {
    current = null
    return
  }
  current = {
    id: typeof u.id === 'string' ? u.id : undefined,
    email: typeof u.email === 'string' ? u.email : undefined,
    metadata:
      u.metadata && typeof u.metadata === 'object' && !Array.isArray(u.metadata)
        ? u.metadata
        : undefined,
  }
}

/** Return the current identity, or `null` when anonymous. */
export function getIdentity(): WidgetUserIdentity | null {
  return current
}
