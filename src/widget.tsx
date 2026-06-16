/**
 * Top-level Preact component, mount entry points, and the per-slot style
 * override compiler.
 *
 * The widget's stylesheet lives in `widget.css` and is imported with Vite's
 * `?inline` query so it is minified and inlined as a string at build time.
 * The IIFE bundle therefore still ships a single payload that we inject
 * into the Shadow root — only the source moved out for editor ergonomics
 * and Vite-native CSS minification.
 *
 * Public exports: `mount`, `mountWithCleanup`. Both attach the widget to a
 * given Shadow root and return the runtime control surface.
 */

import { render } from 'preact'
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import type { KnokuWidgetRuntime, WidgetConfig } from './types'
import { ChatWindow } from './components/ChatWindow'
import { ConsentScreen } from './components/ConsentScreen'
import { clearDeflectorPendingForm } from './deflector'
import { contrastingTextOnAccent, detectHostTheme, watchTheme } from './theme'
import { readConsent, writeConsent } from './cookie'
import { setIdentity } from './identity'
import { getDictionary } from './i18n'
import { ALLOWED_CSS_PROPERTIES, ALLOWED_STATES, type AllowedState } from './component-style-spec'
import { resolveIcon } from './icons'
import { lockPageScroll, removeLegacyScrollLockStyle, unlockPageScroll } from './scroll-lock'
// CSS source lives in `widget.css`; Vite's `?inline` import returns the
// minified CSS as a string at build time, so the IIFE bundle still ships
// a single payload that we inject into the Shadow root.
import CSS from './widget.css?inline'

interface Props {
  config: WidgetConfig
}

interface MountedWidget {
  runtime: KnokuWidgetRuntime
  destroy: () => void
}

// Host-side styles injected outside Shadow DOM (cleaned on close / destroy).
const PAGE_PUSH_STYLE_ID = 'knoku-page-push'
// Stored on the Shadow root so a re-mount can tear down its predecessor.
const CONTAINER_CLEANUP_KEY = '__knokuCleanup__'

function Widget({ config }: Props) {
  const t = useMemo(() => getDictionary(config.language), [config.language])
  const isDeflector = config.mode === 'deflector'
  const previewShowsPanel =
    config.preview &&
    (config.previewSurface === 'panel' || config.previewSurface === 'consent')
  const startsOpen = previewShowsPanel
  const [isOpen, setIsOpen] = useState(startsOpen)
  const [queuedQuestion, setQueuedQuestion] = useState('')
  const [hasOpened, setHasOpened] = useState(startsOpen)
  // Tracks whether the panel is at the "open" visual state. Lags `isOpen` by
  // one frame on open so the panel mounts in its closed CSS state first and
  // the transition has a "from" state to animate from. On close it flips
  // immediately so the exit transition runs while the panel stays mounted.
  const [panelVisible, setPanelVisible] = useState(false)
  // Wide-panel toggle (the maximize button in the header). Drives a
  // data-attribute the CSS selects to widen `.knoku-panel`; body-push
  // margin in the effect below tracks the same flag so site content
  // shifts in sync with the panel width.
  const [panelWide, setPanelWide] = useState(false)
  const [consentState, setConsentState] = useState<'accepted' | 'rejected' | ''>(() => {
    if (config.preview && config.previewSurface === 'consent') return ''
    return config.consent.required ? readConsent(config.projectId) : 'accepted'
  })
  const [isDarkTheme, setIsDarkTheme] = useState(() => resolveIsDarkTheme(config.theme))

  useEffect(() => {
    if (config.theme === 'dark') {
      setIsDarkTheme(true)
      return
    }
    if (config.theme === 'light') {
      setIsDarkTheme(false)
      return
    }
    setIsDarkTheme(detectHostTheme() === 'dark')
    return watchTheme((mode) => setIsDarkTheme(mode === 'dark'))
  }, [config.theme])

  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => setPanelVisible(true))
      return () => cancelAnimationFrame(id)
    }
    setPanelVisible(false)
  }, [isOpen])

  // Mobile keyboards shrink the visual viewport — sync height/top so the
  // composer stays visible (100vh alone leaves the input below the fold on iOS).
  useEffect(() => {
    if (!isOpen) {
      document.documentElement.style.removeProperty('--knoku-vv-height')
      document.documentElement.style.removeProperty('--knoku-vv-top')
      return
    }
    const vv = window.visualViewport
    if (!vv) return

    const apply = () => {
      document.documentElement.style.setProperty('--knoku-vv-height', `${Math.round(vv.height)}px`)
      document.documentElement.style.setProperty('--knoku-vv-top', `${Math.round(vv.offsetTop)}px`)
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      document.documentElement.style.removeProperty('--knoku-vv-height')
      document.documentElement.style.removeProperty('--knoku-vv-top')
    }
  }, [isOpen])

  // Dashboard preview tabs drive open surface (launcher = floating bar only).
  useEffect(() => {
    if (!config.preview) return
    if (config.previewSurface === 'launcher') {
      setIsOpen(false)
      setHasOpened(false)
      setPanelVisible(false)
      return
    }
    setHasOpened(true)
    setIsOpen(true)
  }, [config.preview, config.previewSurface])

  const handleOpen = () => {
    if (config.consent.required && consentState !== 'accepted') {
      setIsOpen(true)
      setHasOpened(true)
      return
    }
    setIsOpen(true)
    setHasOpened(true)
  }

  const closePanel = () => {
    setIsOpen(false)
    setHasOpened(false)
    setPanelVisible(false)
    setQueuedQuestion('')
    document.getElementById(PAGE_PUSH_STYLE_ID)?.remove()
    unlockPageScroll()
    removeLegacyScrollLockStyle()
  }

  const handleClose = () => {
    if (isDeflector) return
    setIsOpen(false)
    setQueuedQuestion('')
    if (config.preview) {
      // Unmount panel so preview CSS cannot keep it visible when closed.
      if (config.previewSurface === 'launcher') {
        setHasOpened(false)
      }
      if (typeof window !== 'undefined') {
        window.parent.postMessage({ type: 'knoku-preview-surface', surface: 'launcher' }, '*')
      }
    }
  }

  const handleQuestionSent = useCallback(() => {
    setQueuedQuestion('')
  }, [])

  useEffect(() => {
    const onOpen = () => handleOpen()
    const onClose = () => handleClose()
    const onToggle = () => setIsOpen((p) => { if (!p) setHasOpened(true); return !p })
    const handleAsk = (e: Event) => {
      const q = (e as CustomEvent).detail?.question
      if (!q) return
      setQueuedQuestion(q)
      setIsOpen(true)
      setHasOpened(true)
    }
    window.addEventListener('knoku:open', onOpen)
    window.addEventListener('knoku:close', onClose)
    window.addEventListener('knoku:toggle', onToggle)
    window.addEventListener('knoku:ask', handleAsk)
    return () => {
      window.removeEventListener('knoku:open', onOpen)
      window.removeEventListener('knoku:close', onClose)
      window.removeEventListener('knoku:toggle', onToggle)
      window.removeEventListener('knoku:ask', handleAsk)
    }
  }, [config.consent.required, config.projectId])

  const acceptConsent = () => {
    writeConsent(config.projectId, 'accepted')
    setConsentState('accepted')
  }
  const rejectConsent = () => {
    writeConsent(config.projectId, 'rejected')
    setConsentState('rejected')
    setQueuedQuestion('')
    if (isDeflector) {
      // Declined AI on a support form — submit the ticket without deflecting again.
      window.dispatchEvent(new CustomEvent('knoku:deflector-continue'))
      closePanel()
      return
    }
    closePanel()
  }
  const needsConsent =
    config.consent.required &&
    consentState !== 'accepted' &&
    isOpen &&
    (!config.preview || config.previewSurface === 'consent')

  // `layout: 'push'` shifts page content; `modal` locks body scroll while open.
  useEffect(() => {
    if (config.layout === 'push' && isOpen) {
      const pageStyle = document.getElementById(PAGE_PUSH_STYLE_ID) || (() => {
        const s = document.createElement('style')
        s.id = PAGE_PUSH_STYLE_ID
        document.head.appendChild(s)
        return s
      })()
      const w = panelWide ? 560 : 380
      pageStyle.textContent = `body { margin-right: ${w}px !important; transition: margin-right 280ms cubic-bezier(0.2, 0.8, 0.2, 1); } @media (max-width: 640px) { body { margin-right: 0 !important; } }`
    } else {
      document.getElementById(PAGE_PUSH_STYLE_ID)?.remove()
    }

    if (isOpen) {
      lockPageScroll(config.layout === 'modal' ? 'modal' : 'panel')
    } else {
      unlockPageScroll()
    }

    return () => {
      document.getElementById(PAGE_PUSH_STYLE_ID)?.remove()
      unlockPageScroll()
      removeLegacyScrollLockStyle()
    }
  }, [isOpen, config.layout, panelWide])

  // Modal: Escape closes; backdrop click is handled on the backdrop element.
  useEffect(() => {
    if (config.layout !== 'modal' || !isOpen || isDeflector) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [config.layout, isOpen])

  const handleBarOpen = () => {
    setIsOpen(true)
    setHasOpened(true)
  }

  const handleDeflectorResolved = () => {
    clearDeflectorPendingForm()
    window.dispatchEvent(new CustomEvent('knoku:deflector-resolved'))
    closePanel()
  }

  const handleDeflectorContinue = () => {
    window.dispatchEvent(new CustomEvent('knoku:deflector-continue'))
    queueMicrotask(() => {
      handleDeflectorResolved()
    })
  }

  return (
    <>
      {/* Floating launcher — bottom corner when panel is closed */}
      {!isOpen && !config.launcherHidden && !isDeflector && (
        <Launcher
          config={config}
          isDarkTheme={isDarkTheme}
          onOpen={handleBarOpen}
        />
      )}

      {/* Panel shell — overlay/push use a right rail; modal centers with backdrop.
          Stays mounted after first open so chat state survives close/reopen. */}
      {hasOpened && (
        <div
          class="knoku-shell"
          data-knoku-layout={config.layout}
          data-knoku-panel-open={panelVisible ? 'true' : 'false'}
          data-knoku-panel-wide={panelWide ? 'true' : 'false'}
          data-knoku-preview={config.preview ? 'true' : undefined}
          data-knoku-deflector={isDeflector ? 'true' : undefined}
        >
          {config.layout === 'modal' && (
            <button
              type="button"
              class="knoku-backdrop"
              aria-label={t.close}
              tabIndex={panelVisible ? 0 : -1}
              onClick={isDeflector ? undefined : handleClose}
              disabled={isDeflector}
            />
          )}
          {needsConsent ? (
            <div class="knoku-panel knoku-panel-consent">
              <ConsentScreen
                consent={config.consent}
                primaryColorLight={config.primaryColorLight}
                primaryColorDark={config.primaryColorDark}
                isDarkTheme={isDarkTheme}
                onAccept={acceptConsent}
                onReject={rejectConsent}
                onClose={isDeflector ? rejectConsent : handleClose}
              />
            </div>
          ) : (
            <ChatWindow
              config={config}
              t={t}
              initialQuestion={queuedQuestion}
              onClose={handleClose}
              onQuestionSent={handleQuestionSent}
              panelWide={panelWide}
              onToggleWide={config.layout === 'modal' ? undefined : () => setPanelWide(p => !p)}
              isDeflector={isDeflector}
              onDeflectorResolved={handleDeflectorResolved}
              onDeflectorContinue={handleDeflectorContinue}
            />
          )}
        </div>
      )}
    </>
  )
}

function Launcher({
  config,
  isDarkTheme,
  onOpen,
}: {
  config: WidgetConfig
  isDarkTheme: boolean
  onOpen: () => void
}) {
  if (config.launcherStyle === 'card') {
    return (
      <CardLauncher
        config={config}
        isDarkTheme={isDarkTheme}
        onOpen={onOpen}
      />
    )
  }
  return (
    <PillLauncher
      config={config}
      isDarkTheme={isDarkTheme}
      onOpen={onOpen}
    />
  )
}

function PillLauncher({
  config,
  isDarkTheme,
  onOpen,
}: {
  config: WidgetConfig
  isDarkTheme: boolean
  onOpen: () => void
}) {
  const accent = isDarkTheme ? config.primaryColorDark : config.primaryColorLight
  const onAccent = contrastingTextOnAccent(accent)
  const iconFirst = config.launcherIconPosition === 'left'
  const label = config.launcherText || 'Ask Docs'
  const showIcon = config.launcherShowIcon !== false
  const iconSvg = showIcon ? (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      dangerouslySetInnerHTML={{ __html: resolveIcon(config.launcherIcon || 'book-open') }}
    />
  ) : null
  return (
    <button
      class={`knoku-bar knoku-bar-pill knoku-bar-${config.launcherAlign} knoku-bar-trigger`}
      type="button"
      data-knoku-launcher-style="pill"
      data-knoku-launcher-icon-position={config.launcherIconPosition}
      aria-label={label}
      onClick={() => onOpen()}
    >
      <span
        class="knoku-bar-pill-inner"
        style={{ backgroundColor: accent, color: onAccent, borderColor: accent }}>
        {showIcon && iconFirst ? <span class="knoku-bar-pill-icon" aria-hidden="true">{iconSvg}</span> : null}
        <span class="knoku-bar-pill-label">{label}</span>
        {showIcon && !iconFirst ? <span class="knoku-bar-pill-icon" aria-hidden="true">{iconSvg}</span> : null}
      </span>
    </button>
  )
}

function CardLauncher({
  config,
  isDarkTheme,
  onOpen,
}: {
  config: WidgetConfig
  isDarkTheme: boolean
  onOpen: () => void
}) {
  const useLegacyCopy =
    config.launcherText === 'Ask Docs' &&
    (config.launcherSubtitle === '' || config.launcherSubtitle === 'Ask AI')
  const title = useLegacyCopy ? 'Need help?' : config.launcherText
  const subtitle = config.launcherSubtitle || (useLegacyCopy ? 'Ask AI' : '')
  const iconFirst = config.launcherIconPosition === 'left'
  const mark = (
    <span class="knoku-bar-mark" aria-hidden="true">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        dangerouslySetInnerHTML={{ __html: resolveIcon(config.launcherIcon || 'book-open') }}
      />
    </span>
  )
  const copy = (
    <span class="knoku-bar-copy">
      <span class="knoku-bar-input">{title}</span>
      {subtitle ? <span class="knoku-bar-subtitle">{subtitle}</span> : null}
    </span>
  )
  const send = (
    <span class="knoku-bar-send" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h12"/>
        <path d="M13 6l6 6-6 6"/>
      </svg>
    </span>
  )
  return (
    <button
      class={`knoku-bar knoku-bar-card knoku-bar-${config.launcherAlign} knoku-bar-trigger`}
      type="button"
      data-knoku-launcher-style="card"
      data-knoku-launcher-icon-position={config.launcherIconPosition}
      aria-label={`${title}${subtitle ? ` — ${subtitle}` : ''}`}
      onClick={() => onOpen()}
    >
      <span class="knoku-bar-inner">
        {iconFirst ? mark : null}
        {copy}
        {!iconFirst ? mark : null}
        {send}
      </span>
    </button>
  )
}

function resolveIsDarkTheme(theme: WidgetConfig['theme']): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return detectHostTheme() === 'dark'
}

/**
 * Mount the widget into a Shadow root and return both the runtime API and a
 * `destroy()` for teardown. Re-invoking on the same root tears down the
 * previous instance first (supports config / theme refresh flows).
 */
export function mountWithCleanup(container: ShadowRoot, config: WidgetConfig): MountedWidget {
  const cleanupContainer = container as ShadowRoot & { [CONTAINER_CLEANUP_KEY]?: () => void }
  cleanupContainer[CONTAINER_CLEANUP_KEY]?.()

  const style = document.createElement('style')
  style.textContent = CSS
  container.appendChild(style)

  // Per-slot style overrides cascade after the base sheet, so they win.
  const overrideCSS = buildComponentStyleCSS(config.componentStyles)
  let overrideStyle: HTMLStyleElement | null = null
  if (overrideCSS) {
    overrideStyle = document.createElement('style')
    overrideStyle.textContent = overrideCSS
    container.appendChild(overrideStyle)
  }

  const root = document.createElement('div')
  const rootClasses = ['knoku-root']
  if (config.preview) rootClasses.push('knoku-preview-mode')
  root.className = rootClasses.join(' ')
  container.appendChild(root)

  let stopWatchingTheme = () => {}

  function applyTheme(dark: boolean) {
    root.classList.toggle('knoku-dark', dark)
    const accent = dark ? config.primaryColorDark : config.primaryColorLight
    root.style.setProperty('--knoku-primary-accent', accent)
    root.style.setProperty('--knoku-on-accent', contrastingTextOnAccent(accent))
    root.style.setProperty('--primary', accent)
    root.style.setProperty('--focus-ring', accent)
  }

  if (config.theme === 'dark') {
    applyTheme(true)
  } else if (config.theme === 'light') {
    applyTheme(false)
  } else {
    // `auto` — match the host's current theme and follow live changes.
    applyTheme(detectHostTheme() === 'dark')
    stopWatchingTheme = watchTheme((mode) => applyTheme(mode === 'dark'))
  }

  render(<Widget config={config} />, root)

  const runtime: KnokuWidgetRuntime = {
    open: () => window.dispatchEvent(new CustomEvent('knoku:open')),
    close: () => window.dispatchEvent(new CustomEvent('knoku:close')),
    toggle: () => window.dispatchEvent(new CustomEvent('knoku:toggle')),
    ask: (q: string) => window.dispatchEvent(new CustomEvent('knoku:ask', { detail: { question: q } })),
    identify: (user) => setIdentity(user),
    destroy: () => { /* assigned below after teardown is defined */ },
  }

  let destroyed = false
  const teardown = () => {
    if (destroyed) return
    destroyed = true

    stopWatchingTheme()
    render(null, root)
    if ((window as Window & { Knoku?: KnokuWidgetRuntime }).Knoku === runtime) {
      delete (window as Window & { Knoku?: KnokuWidgetRuntime }).Knoku
    }

    document.getElementById(PAGE_PUSH_STYLE_ID)?.remove()
    unlockPageScroll()
    removeLegacyScrollLockStyle()
    style.remove()
    overrideStyle?.remove()
    root.remove()
    delete cleanupContainer[CONTAINER_CLEANUP_KEY]
  }

  runtime.destroy = () => teardown()

  ;(window as Window & { Knoku?: KnokuWidgetRuntime }).Knoku = runtime

  cleanupContainer[CONTAINER_CLEANUP_KEY] = teardown

  return { runtime, destroy: teardown }
}

/**
 * Convenience wrapper around `mountWithCleanup` that exposes only the
 * runtime API. Kept stable for npm consumers who don't need the
 * `destroy()` handle.
 */
export function mount(container: ShadowRoot, config: WidgetConfig): KnokuWidgetRuntime {
  return mountWithCleanup(container, config).runtime
}

/**
 * Map public slot names (used in `data-{slot}-{property}` attributes and the
 * `componentStyles` config) to the in-shadow CSS selectors they target.
 * Keys must be kebab-case to match the attribute grammar.
 */
const COMPONENT_SELECTOR_MAP: Record<string, string> = {
  'panel': '.knoku-panel',
  'panel-header': '.knoku-header',
  'panel-body': '.knoku-messages',
  'panel-footer': '.knoku-input-area',
  'launcher': '.knoku-bar',
  'backdrop': '.knoku-backdrop',
  'bottom-bar': '.knoku-bar-inner',
  'launcher-text': '.knoku-bar-input',
  'launcher-subtitle': '.knoku-bar-subtitle',
  'launcher-mark': '.knoku-bar-mark',
  'launcher-pill': '.knoku-bar-pill-inner',
  'launcher-pill-label': '.knoku-bar-pill-label',
  'launcher-send': '.knoku-bar-send',
  'submit-button': '.knoku-send-btn',
  'user-bubble': '.knoku-msg-user-bubble',
  'assistant-answer': '.knoku-answer',
  'suggestion-chip': '.knoku-suggestion-chip',
  'source-chip': '.knoku-source-chip',
  'disclaimer': '.knoku-disclaimer',
  'greeting': '.knoku-greeting',
  'consent-screen': '.knoku-consent-card',
  'consent-accept-button': '.knoku-consent-accept',
  'consent-reject-button': '.knoku-consent-reject',
  // Feedback thumbs target the `.active` (selected) state because the
  // unselected state stays in a generic placeholder color. Overriding
  // `feedback-up`/`feedback-down` brands the selected color only, which is
  // what hosts actually want when picking a brand accent.
  'feedback-up': '.knoku-action-btn-up.active',
  'feedback-down': '.knoku-action-btn-down.active',
}

/**
 * Compile a component → property override map into a CSS rule string.
 *
 * Keys may be `slot`, `slot:state`, `slot:dark`, or `slot:state:dark` (state
 * is `hover`, `focus`, or `active`). Only entries with a known slot, a
 * property in `ALLOWED_CSS_PROPERTIES`, and a CSS-safe value pass through;
 * everything else is dropped silently to keep host-supplied input
 * tolerant.
 */
function buildComponentStyleCSS(overrides: Record<string, Record<string, string>>): string {
  const rules: string[] = []
  for (const [key, props] of Object.entries(overrides || {})) {
    const parsed = parseStyleKey(key)
    if (!parsed) continue
    const selector = COMPONENT_SELECTOR_MAP[parsed.slot]
    if (!selector) continue
    const decls: string[] = []
    for (const [prop, value] of Object.entries(props || {})) {
      if (!ALLOWED_CSS_PROPERTIES.has(prop)) continue
      if (typeof value !== 'string') continue
      if (!isSafeCSSValue(value)) continue
      decls.push(...expandComponentStyleDeclarations(prop, value))
    }
    if (decls.length === 0) continue
    const rootClass = parsed.dark ? '.knoku-root.knoku-dark' : '.knoku-root'
    const stateSuffix = parsed.state ? `:${parsed.state}` : ''
    rules.push(`${rootClass} ${selector}${stateSuffix} { ${decls.join(' ')} }`)
  }
  return rules.join('\n')
}

function expandComponentStyleDeclarations(prop: string, value: string): string[] {
  switch (prop) {
    case 'padding-x':
      return [`padding-left: ${value};`, `padding-right: ${value};`]
    case 'padding-y':
      return [`padding-top: ${value};`, `padding-bottom: ${value};`]
    case 'margin-x':
      return [`margin-left: ${value};`, `margin-right: ${value};`]
    case 'margin-y':
      return [`margin-top: ${value};`, `margin-bottom: ${value};`]
    default:
      return [`${prop}: ${value};`]
  }
}

function parseStyleKey(key: string): { slot: string; state?: AllowedState; dark: boolean } | null {
  const parts = key.split(':')
  const slot = parts[0]
  if (!slot) return null
  let state: AllowedState | undefined
  let dark = false
  for (const mod of parts.slice(1)) {
    if (mod === 'dark') {
      dark = true
    } else if (ALLOWED_STATES.includes(mod as AllowedState)) {
      if (state) return null // duplicate state modifier
      state = mod as AllowedState
    } else {
      return null // unknown modifier
    }
  }
  return { slot, state, dark }
}

function isSafeCSSValue(value: string): boolean {
  // Reject anything that could break out of a declaration or contain script.
  if (value.length > 500) return false
  if (/[<>;{}]/.test(value)) return false
  if (/\burl\s*\(/i.test(value)) {
    // Allow url() only with http(s) to avoid javascript: / data: exfil.
    const match = value.match(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/i)
    if (!match) return false
    if (!/^https?:\/\//i.test(match[1])) return false
  }
  return true
}
