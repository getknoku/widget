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
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { KnokuWidgetRuntime, WidgetConfig } from './types'
import { ChatWindow } from './components/ChatWindow'
import { ConsentScreen } from './components/ConsentScreen'
import { detectHostTheme, watchTheme } from './theme'
import { readConsent, writeConsent } from './cookie'
import { setIdentity } from './identity'
import { getDictionary } from './i18n'
import { ALLOWED_CSS_PROPERTIES, ALLOWED_STATES, type AllowedState } from './component-style-spec'
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

// Tag for the host-side <style> that pushes body content when the panel opens.
const PAGE_PUSH_STYLE_ID = 'knoku-page-push'
// Stored on the Shadow root so a re-mount can tear down its predecessor.
const CONTAINER_CLEANUP_KEY = '__knokuCleanup__'

function Widget({ config }: Props) {
  const t = useMemo(() => getDictionary(config.language), [config.language])
  const [isOpen, setIsOpen] = useState(false)
  const [initialQuestion, setInitialQuestion] = useState('')
  const [hasOpened, setHasOpened] = useState(false)
  const [consentState, setConsentState] = useState<'accepted' | 'rejected' | ''>(
    () => (config.consent.required ? readConsent(config.projectId) : 'accepted'),
  )

  useEffect(() => {
    const handleOpen = () => {
      if (config.consent.required && consentState !== 'accepted') {
        setIsOpen(true); setHasOpened(true); return
      }
      setIsOpen(true); setHasOpened(true)
    }
    const handleClose = () => setIsOpen(false)
    const handleToggle = () => setIsOpen(p => { if (!p) setHasOpened(true); return !p })
    const handleAsk = (e: Event) => {
      const q = (e as CustomEvent).detail?.question
      if (q) {
        // Hold the question regardless of consent state. If consent is required
        // and not yet accepted, the panel opens on the consent screen with the
        // question stashed; once accepted, ChatWindow renders with this
        // initialQuestion and auto-submits. Reject clears it (see rejectConsent).
        setInitialQuestion(q); setIsOpen(true); setHasOpened(true)
      }
    }
    window.addEventListener('knoku:open', handleOpen)
    window.addEventListener('knoku:close', handleClose)
    window.addEventListener('knoku:toggle', handleToggle)
    window.addEventListener('knoku:ask', handleAsk)
    return () => {
      window.removeEventListener('knoku:open', handleOpen)
      window.removeEventListener('knoku:close', handleClose)
      window.removeEventListener('knoku:toggle', handleToggle)
      window.removeEventListener('knoku:ask', handleAsk)
    }
  }, [config.consent.required, config.projectId, consentState])

  const acceptConsent = () => {
    writeConsent(config.projectId, 'accepted')
    setConsentState('accepted')
  }
  const rejectConsent = () => {
    writeConsent(config.projectId, 'rejected')
    setConsentState('rejected')
    setIsOpen(false)
    setInitialQuestion('')
  }
  const needsConsent = config.consent.required && consentState !== 'accepted' && isOpen

  // Inject a host-side <style> tag (outside the Shadow DOM) that adds a
  // right-margin to body when the panel is open, so site content is not
  // covered by the chat panel. Reset on close. Mobile: no margin.
  useEffect(() => {
    const pageStyle = document.getElementById(PAGE_PUSH_STYLE_ID) || (() => {
      const s = document.createElement('style')
      s.id = PAGE_PUSH_STYLE_ID
      document.head.appendChild(s)
      return s
    })()
    pageStyle.textContent = isOpen
      ? 'body { margin-right: 440px !important; transition: margin-right 0.2s ease; } @media (max-width: 640px) { body { margin-right: 0 !important; } }'
      : 'body { transition: margin-right 0.2s ease; }'
  }, [isOpen])

  const handleBarOpen = () => {
    setIsOpen(true)
    setHasOpened(true)
  }

  const handleClose = () => {
    setIsOpen(false)
    setInitialQuestion('')
  }

  return (
    <>
      {/* Floating launcher — visible when the panel is closed and not hidden by config */}
      {!isOpen && !config.launcherHidden && (
        <BottomBar
          label={normalizeLauncherText(config.launcherText || 'Need help?')}
          subtitle={normalizeLauncherSubtitle(config.launcherSubtitle || 'Ask AI')}
          align={config.launcherAlign}
          onOpen={handleBarOpen}
        />
      )}

      {/* Side panel — once opened, kept mounted and toggled via display:none so chat state survives close/reopen */}
      {hasOpened && (
        <div style={{ display: isOpen ? 'block' : 'none' }}>
          {needsConsent ? (
            <div class="knoku-panel">
              <ConsentScreen
                consent={config.consent}
                onAccept={acceptConsent}
                onReject={rejectConsent}
                onClose={handleClose}
              />
            </div>
          ) : (
            <ChatWindow
              config={config}
              t={t}
              initialQuestion={initialQuestion}
              onClose={handleClose}
              onQuestionSent={() => setInitialQuestion('')}
            />
          )}
        </div>
      )}
    </>
  )
}

function BottomBar({
  label,
  subtitle,
  align,
  onOpen,
}: {
  label: string
  subtitle: string
  align: WidgetConfig['launcherAlign']
  onOpen: () => void
}) {
  return (
    <button
      class={`knoku-bar knoku-bar-${align} knoku-bar-trigger`}
      type="button"
      aria-label="Open documentation assistant"
      onClick={() => onOpen()}
    >
      <span class="knoku-bar-inner">
        <span class="knoku-bar-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">
            <path d="M12 2.75l2.45 6.8L21.25 12l-6.8 2.45L12 21.25l-2.45-6.8L2.75 12l6.8-2.45L12 2.75z"/>
          </svg>
        </span>
        <span class="knoku-bar-copy">
          <span class="knoku-bar-input">{label}</span>
          {subtitle && <span class="knoku-bar-subtitle">{subtitle}</span>}
        </span>
        <span class="knoku-bar-send" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M5 12h12"/>
            <path d="M13 6l6 6-6 6"/>
          </svg>
        </span>
      </span>
    </button>
  )
}

function normalizeLauncherText(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'Ask a question...' || trimmed === 'Ask Docs') return 'Need help?'
  return trimmed
}

function normalizeLauncherSubtitle(value: string): string {
  return value.trim()
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
  root.className = 'knoku-root'
  container.appendChild(root)

  let stopWatchingTheme = () => {}

  function applyTheme(dark: boolean) {
    root.classList.toggle('knoku-dark', dark)
    root.style.setProperty('--knoku-primary-accent', dark ? config.primaryColorDark : config.primaryColorLight)
    root.style.setProperty('--primary', dark ? config.primaryColorDark : config.primaryColorLight)
    root.style.setProperty('--focus-ring', dark ? config.primaryColorDark : config.primaryColorLight)
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
  }

  ;(window as Window & { Knoku?: KnokuWidgetRuntime }).Knoku = runtime

  let destroyed = false
  const destroy = () => {
    if (destroyed) return
    destroyed = true

    stopWatchingTheme()
    render(null, root)
    if ((window as Window & { Knoku?: KnokuWidgetRuntime }).Knoku === runtime) {
      delete (window as Window & { Knoku?: KnokuWidgetRuntime }).Knoku
    }

    document.getElementById(PAGE_PUSH_STYLE_ID)?.remove()
    style.remove()
    overrideStyle?.remove()
    root.remove()
    delete cleanupContainer[CONTAINER_CLEANUP_KEY]
  }

  cleanupContainer[CONTAINER_CLEANUP_KEY] = destroy

  return { runtime, destroy }
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
  'bottom-bar': '.knoku-bar-inner',
  'launcher-text': '.knoku-bar-input',
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
      decls.push(`${prop}: ${value};`)
    }
    if (decls.length === 0) continue
    const rootClass = parsed.dark ? '.knoku-root.knoku-dark' : '.knoku-root'
    const stateSuffix = parsed.state ? `:${parsed.state}` : ''
    rules.push(`${rootClass} ${selector}${stateSuffix} { ${decls.join(' ')} }`)
  }
  return rules.join('\n')
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
