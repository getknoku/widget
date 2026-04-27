/**
 * Host-theme detection and live-watching.
 *
 * The widget follows the host page's resolved theme (light/dark) so it
 * blends with the surrounding documentation site. Detection probes three
 * signals in order: `<html class="dark">`, `<html data-theme="dark">`,
 * and the OS-level `prefers-color-scheme` media query.
 */

export type ThemeMode = 'light' | 'dark'

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
