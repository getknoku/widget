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
 * Tokens are issued via `turnstile.render` on an off-screen `<div>` with
 * `size: 'invisible'`; the SDK delivers the token through the `callback`
 * option, which we wrap in a Promise. One render per token — Cloudflare
 * invalidates the widget after a single successful issuance, and renting
 * a fresh element each time keeps state-cleanup trivial. See
 * features/widget-auth-hardening/plan.md §Widget for the rationale.
 */

const READY_TIMEOUT_MS = 10_000
const TOKEN_TIMEOUT_MS = 15_000

let scriptReadyPromise: Promise<void> | null = null
let activeSiteKey: string | null = null

interface TurnstileRenderOptions {
  readonly sitekey: string
  readonly action?: string
  // Per Cloudflare docs: 'normal' | 'flexible' | 'compact'. There is no
  // 'invisible' size; for hidden-by-default UX use `appearance` instead.
  readonly size?: 'normal' | 'compact' | 'flexible'
  // 'interaction-only' is the closest thing to invisible: Cloudflare's risk
  // engine renders nothing unless the visitor needs to complete an
  // interactive challenge. Pairs with any widget Mode (Managed / Non-
  // interactive / Invisible) on the dashboard side.
  readonly appearance?: 'always' | 'execute' | 'interaction-only'
  readonly callback?: (token: string) => void
  readonly 'error-callback'?: (errorCode?: string) => boolean | void
  readonly 'expired-callback'?: () => void
  readonly retry?: 'auto' | 'never'
  readonly 'retry-interval'?: number
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string | undefined
      remove: (widgetId: string) => void
      reset: (widgetId?: string) => void
    }
  }
}

/**
 * Drop cached script-ready state. Called when the resolved widget config
 * carries a different site key than the one we previously bootstrapped —
 * happens when `initKnokuWidget` is re-invoked with a different project.
 */
function resetTurnstile(): void {
  scriptReadyPromise = null
  activeSiteKey = null
  document.querySelectorAll('script[data-knoku-turnstile]').forEach(el => el.remove())
}

export function ensureTurnstileReady(siteKey: string): Promise<void> {
  if (!siteKey) return Promise.resolve()
  if (activeSiteKey && activeSiteKey !== siteKey) {
    resetTurnstile()
  }
  if (scriptReadyPromise) return scriptReadyPromise
  activeSiteKey = siteKey

  scriptReadyPromise = new Promise<void>((resolve, reject) => {
    if (!document.querySelector('script[data-knoku-turnstile]')) {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      // Cloudflare rejects async/defer on the api.js tag. Dynamic scripts
      // execute asynchronously by default, so omitting both is correct.
      s.setAttribute('data-knoku-turnstile', '1')
      s.onerror = () => reject(new Error('turnstile_script_failed'))
      document.head.appendChild(s)
    }
    const start = Date.now()
    const tick = () => {
      const ts = window.turnstile
      if (ts && typeof ts.render === 'function') {
        resolve()
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

  return scriptReadyPromise
}

export async function getTurnstileToken(siteKey: string, action: 'chat' | 'feedback'): Promise<string> {
  if (!siteKey) return ''
  await ensureTurnstileReady(siteKey)
  const ts = window.turnstile
  if (!ts) throw new Error('turnstile_unavailable')

  return new Promise<string>((resolve, reject) => {
    // Place the container in the viewport (bottom-right, max z-index) rather
    // than off-screen: `appearance: 'interaction-only'` keeps it invisible in
    // the common path, but if Cloudflare's risk engine asks for an
    // interactive challenge the user must be able to see + click it.
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.bottom = '16px'
    container.style.right = '16px'
    container.style.zIndex = '2147483647'
    document.body.appendChild(container)

    let widgetId: string | undefined
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      try {
        if (widgetId) ts.remove(widgetId)
      } catch {
        /* widget already gone */
      }
      try {
        document.body.removeChild(container)
      } catch {
        /* container already detached */
      }
      fn()
    }
    const timeout = setTimeout(() => finish(() => reject(new Error('turnstile_token_timeout'))), TOKEN_TIMEOUT_MS)

    try {
      widgetId = ts.render(container, {
        sitekey: siteKey,
        action,
        appearance: 'interaction-only',
        retry: 'auto',
        'retry-interval': 3_000,
        callback: (token) => finish(() => resolve(token)),
        'error-callback': () => false,
        'expired-callback': () => finish(() => reject(new Error('turnstile_expired'))),
      })
    } catch (err) {
      finish(() => reject(err instanceof Error ? err : new Error('turnstile_render_failed')))
    }
  })
}

export async function getTurnstileHeaders(
  siteKey: string | undefined,
  action: 'chat' | 'feedback',
): Promise<Readonly<Record<string, string>>> {
  if (!siteKey) return {}

  const token = await getTurnstileToken(siteKey, action)
  if (!token) throw new Error('turnstile_token_missing')

  return { 'cf-turnstile-response': token }
}
