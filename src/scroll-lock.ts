/** Attribute storing the page scroll offset while the widget panel is open. */
export const SCROLL_LOCK_Y_ATTR = 'data-knoku-scroll-lock-y'

/** html[data-knoku-scroll-lock] — set while the widget freezes background scroll. */
export const SCROLL_LOCK_ROOT_ATTR = 'data-knoku-scroll-lock'

const SCROLL_LOCK_STYLE_ID = 'knoku-scroll-lock-style'

export type ScrollLockMode = 'modal' | 'panel'

function scrollbarWidth(): number {
  if (typeof window === 'undefined') return 0
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth)
}

function applyScrollbarPadding(width: number) {
  if (width <= 0) return
  document.body.style.paddingRight = `${width}px`
  document.documentElement.style.setProperty('--knoku-scrollbar-width', `${width}px`)

  let style = document.getElementById(SCROLL_LOCK_STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = SCROLL_LOCK_STYLE_ID
    document.head.appendChild(style)
  }
  // Fixed site chrome (e.g. marketing nav) must get the same gutter as body.
  style.textContent = `
html[${SCROLL_LOCK_ROOT_ATTR}] header[role="banner"],
html[${SCROLL_LOCK_ROOT_ATTR}] [data-knoku-fixed-header] {
  padding-right: ${width}px !important;
}
`
}

function clearScrollbarPadding() {
  document.body.style.paddingRight = ''
  document.documentElement.style.removeProperty('--knoku-scrollbar-width')
  document.getElementById(SCROLL_LOCK_STYLE_ID)?.remove()
}

/**
 * Freeze background scroll without breaking `position: fixed` site headers.
 *
 * - `modal`: overflow lock only — preserves layout for fixed navbars.
 * - `panel`: body position fixed — stronger lock for full-height overlay/push sheets (iOS).
 */
export function lockPageScroll(mode: ScrollLockMode = 'panel'): void {
  if (typeof document === 'undefined') return
  if (document.body.hasAttribute(SCROLL_LOCK_Y_ATTR)) return

  const scrollY = window.scrollY
  const gutter = scrollbarWidth()

  document.body.setAttribute(SCROLL_LOCK_Y_ATTR, String(scrollY))
  document.documentElement.setAttribute(SCROLL_LOCK_ROOT_ATTR, mode)
  applyScrollbarPadding(gutter)

  if (mode === 'modal') {
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return
  }

  document.body.style.position = 'fixed'
  document.body.style.top = `-${scrollY}px`
  document.body.style.left = '0'
  document.body.style.right = '0'
  document.body.style.width = '100%'
}

/** Restore scroll position after the widget panel closes. */
export function unlockPageScroll(): void {
  if (typeof document === 'undefined') return

  const raw = document.body.getAttribute(SCROLL_LOCK_Y_ATTR)
  if (raw == null) return

  const mode = document.documentElement.getAttribute(SCROLL_LOCK_ROOT_ATTR) as ScrollLockMode | null
  const scrollY = Number.parseInt(raw, 10) || 0

  document.body.removeAttribute(SCROLL_LOCK_Y_ATTR)
  document.documentElement.removeAttribute(SCROLL_LOCK_ROOT_ATTR)
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.left = ''
  document.body.style.right = ''
  document.body.style.width = ''
  clearScrollbarPadding()

  if (mode === 'panel') {
    window.scrollTo(0, scrollY)
  }
}

/** Remove legacy overflow-only lock styles from older widget builds. */
export function removeLegacyScrollLockStyle(): void {
  document.getElementById('knoku-modal-lock')?.remove()
}
