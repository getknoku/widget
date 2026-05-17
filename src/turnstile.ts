/**
 * Cloudflare Turnstile client for the widget.
 *
 * The Turnstile script is loaded per-project: the dashboard hands the
 * widget a site key via `/api/v1/config/{projectId}`, and `useChat` /
 * feedback POSTs call `getTurnstileToken` before every request. Customers
 * who haven't configured Turnstile receive an empty site key and the
 * caller short-circuits — the network request goes out without the
 * `cf-turnstile-response` header and the backend skips verification.
 *
 * The script is asynchronous; without `ensureTurnstileReady` the first
 * request after mount would race the `<script>` element. See
 * features/widget-auth-hardening/plan.md §Widget for the rationale.
 */

const READY_TIMEOUT_MS = 10_000

let readyPromise: Promise<void> | null = null
let activeSiteKey: string | null = null

declare global {
  interface Window {
    turnstile?: {
      ready: (cb: () => void) => void
      execute: (container: string | HTMLElement | undefined, options: { sitekey: string; action?: string }) => Promise<string>
    }
  }
}

/**
 * Drop the cached ready promise. Called when the resolved widget config
 * carries a different site key than the one we previously bootstrapped —
 * happens when `initKnokuWidget` is re-invoked with a different project.
 */
function resetTurnstile(): void {
  readyPromise = null
  activeSiteKey = null
  document.querySelectorAll('script[data-knoku-turnstile]').forEach(el => el.remove())
}

export function ensureTurnstileReady(siteKey: string): Promise<void> {
  if (!siteKey) return Promise.resolve()
  if (activeSiteKey && activeSiteKey !== siteKey) {
    resetTurnstile()
  }
  if (readyPromise) return readyPromise
  activeSiteKey = siteKey

  readyPromise = new Promise<void>((resolve, reject) => {
    if (!document.querySelector('script[data-knoku-turnstile]')) {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      s.async = true
      s.defer = true
      s.setAttribute('data-knoku-turnstile', '1')
      s.onerror = () => reject(new Error('turnstile_script_failed'))
      document.head.appendChild(s)
    }
    const start = Date.now()
    const tick = () => {
      const ts = window.turnstile
      if (ts && typeof ts.ready === 'function') {
        ts.ready(() => resolve())
        return
      }
      if (Date.now() - start > READY_TIMEOUT_MS) {
        reject(new Error('turnstile_ready_timeout'))
        return
      }
      setTimeout(tick, 50)
    }
    tick()
  })

  return readyPromise
}

export async function getTurnstileToken(siteKey: string, action: 'chat' | 'feedback'): Promise<string> {
  if (!siteKey) return ''
  await ensureTurnstileReady(siteKey)
  const ts = window.turnstile
  if (!ts) return ''
  return ts.execute(undefined, { sitekey: siteKey, action })
}
