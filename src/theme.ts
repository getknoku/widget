/**
 * Host-theme detection and live-watching.
 *
 * The widget follows the host page's resolved theme (light/dark) so it
 * blends with the surrounding documentation site. Detection probes three
 * signals in order: `<html class="dark">`, `<html data-theme="dark">`,
 * and the OS-level `prefers-color-scheme` media query.
 */

export type ThemeMode = 'light' | 'dark'

/** Relative luminance (0–1) for #RRGGBB hex. */
function hexLuminance(hex: string): number {
  const h = hex.replace(/^#/, '')
  if (h.length !== 6 && h.length !== 3) return 0.2
  const expand = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(expand.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** Text color that contrasts with a primary/accent background. */
export function contrastingTextOnAccent(hex: string): string {
  return hexLuminance(hex) > 0.55 ? '#0a0a0a' : '#ffffff'
}

const CONSENT_ACCEPT_FALLBACK = { bg: '#171717', fg: '#ffffff', border: '#171717' }

/** Filled accept button colors — never returns a near-white fill (invisible on consent bg). */
export function consentAcceptButtonColors(
  primaryColorLight: string,
  primaryColorDark: string,
  isDark: boolean,
): { bg: string; fg: string; border: string } {
  const accent = (isDark ? primaryColorDark : primaryColorLight).trim() || CONSENT_ACCEPT_FALLBACK.bg
  if (hexLuminance(accent) > 0.55) return CONSENT_ACCEPT_FALLBACK
  return {
    bg: accent,
    fg: contrastingTextOnAccent(accent),
    border: accent,
  }
}

/** Resolve the host page's current theme. */
export function detectHostTheme(): ThemeMode {
  // VitePress, Nextra, Mintlify, Tailwind class-based dark mode.
  if (document.documentElement.classList.contains('dark')) return 'dark'
  // Docusaurus.
  if (document.documentElement.getAttribute('data-theme') === 'dark') return 'dark'
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

/**
 * Subscribe to host theme changes. Fires `callback` whenever the resolved
 * theme flips. Returns an unsubscribe function.
 */
export function watchTheme(callback: (mode: ThemeMode) => void): () => void {
  let current = detectHostTheme()

  function check() {
    const next = detectHostTheme()
    if (next !== current) {
      current = next
      callback(next)
    }
  }

  const observer = new MutationObserver(check)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  })

  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', check)

  return () => {
    observer.disconnect()
    mq.removeEventListener('change', check)
  }
}
