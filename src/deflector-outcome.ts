import type { WidgetConfig } from './types'
import { getTurnstileToken } from './turnstile'

/** Records which deflector button the visitor clicked (fire-and-forget). */
export function reportDeflectorOutcome(
  config: WidgetConfig,
  sessionId: string | null,
  outcome: 'resolved' | 'continued',
): void {
  if (!sessionId) return
  void (async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.turnstileSiteKey) {
      try {
        const token = await getTurnstileToken(config.turnstileSiteKey, 'feedback')
        if (token) headers['cf-turnstile-response'] = token
      } catch {
        return
      }
    }
    await fetch(`${config.apiUrl}/api/v1/deflector/outcome`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        project_id: config.projectId,
        session_id: sessionId,
        outcome,
      }),
    })
  })()
}
