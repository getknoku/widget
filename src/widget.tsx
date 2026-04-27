/**
 * Top-level Preact component, mount entry points, and the inline CSS payload.
 *
 * Kept in a single file on purpose: the IIFE bundle ships the component, the
 * `mount`/`mountWithCleanup` entry points, the per-slot style override
 * compiler, and the entire CSS template literal in one chunk. Splitting them
 * would require either a separate `.css` import (incompatible with our
 * Shadow DOM injection) or a runtime fetch.
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

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

/* ===== Theme Variables ===== */
.knoku-root {
  --bg: #ffffff;
  --bg-secondary: #f9fafb;
  --bg-tertiary: #f3f4f6;
  --bg-hover: #f3f4f6;
  --bg-accent: #eef2ff;
  --bg-accent-hover: #e0e7ff;
  --text: #1a1a1a;
  --text-secondary: #4b5563;
  --text-muted: #6b7280;
  --text-placeholder: #9ca3af;
  --border: #e5e7eb;
  --border-light: #f3f4f6;
  --border-input: #d1d5db;
  --focus-ring: #a5b4fc;
  --primary: #6366f1;
  --code-bg: #1e1e2e;
  --code-text: #cdd6f4;
  --inline-code-bg: #f3f4f6;
  --table-header-bg: #f9fafb;
  --success: #10b981;
  --error: #ef4444;
  --shadow: rgba(0,0,0,0.04);

  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px; line-height: 1.6; color: var(--text);
  transition: color 0.15s;
}

.knoku-root.knoku-dark {
  --bg: #1a1a2e;
  --bg-secondary: #16162a;
  --bg-tertiary: #252540;
  --bg-hover: #2a2a45;
  --bg-accent: #1e1b4b;
  --bg-accent-hover: #2e2860;
  --text: #e2e8f0;
  --text-secondary: #a0aec0;
  --text-muted: #718096;
  --text-placeholder: #4a5568;
  --border: #2d2d4a;
  --border-light: #252540;
  --border-input: #3d3d5c;
  --focus-ring: #818cf8;
  --primary: #818cf8;
  --code-bg: #0d0d1a;
  --code-text: #cdd6f4;
  --inline-code-bg: #252540;
  --table-header-bg: #1e1e35;
  --success: #34d399;
  --error: #f87171;
  --shadow: rgba(0,0,0,0.3);
}

/* ===== Bottom Bar ===== */
.knoku-bar {
  position: fixed; bottom: 22px;
  width: auto;
  max-width: min(310px, calc(100vw - 32px));
  z-index: 99998;
}
.knoku-bar-bottom-right { right: 22px; }
.knoku-bar-bottom-left { left: 22px; }
.knoku-bar-trigger {
  border: none; background: transparent; padding: 0;
  font: inherit; text-align: left; cursor: pointer;
}
.knoku-bar-inner {
  display: flex; align-items: center;
  min-width: 210px; max-width: 310px; height: 58px;
  border: 1px solid color-mix(in srgb, var(--knoku-primary-accent) 24%, var(--border-input));
  border-radius: 999px;
  padding: 0 8px 0 10px;
  background: color-mix(in srgb, var(--bg) 97%, transparent);
  box-shadow: 0 16px 42px rgba(15, 23, 42, 0.14), 0 2px 8px var(--shadow);
  backdrop-filter: blur(14px);
  transition: border-color 0.15s, background 0.15s, transform 0.15s, box-shadow 0.15s;
  width: 100%;
}
.knoku-bar-trigger:hover .knoku-bar-inner,
.knoku-bar-trigger:focus-visible .knoku-bar-inner {
  border-color: color-mix(in srgb, var(--knoku-primary-accent) 52%, var(--border-input));
  transform: translateY(-2px);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.18), 0 3px 10px var(--shadow);
}
.knoku-bar-mark {
  width: 36px; height: 36px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: var(--knoku-primary-accent);
  background: color-mix(in srgb, var(--knoku-primary-accent) 11%, transparent);
}
.knoku-bar-copy {
  min-width: 0; flex: 1; display: flex; flex-direction: column;
  justify-content: center; gap: 1px; padding: 0 12px 0 10px;
}
.knoku-bar-input {
  border: none; outline: none;
  font-size: 14px; font-weight: 700; letter-spacing: 0; font-family: inherit;
  background: transparent; padding: 0;
  color: var(--text); line-height: 1.2;
  user-select: none;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.knoku-bar-subtitle {
  color: var(--text-muted); font-size: 11px; font-weight: 500; line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.knoku-bar-send {
  width: 40px; height: 40px; border-radius: 999px; border: none;
  background: var(--knoku-primary-accent);
  color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; pointer-events: none;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--knoku-primary-accent) 26%, transparent);
}
.knoku-bar-send:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 640px) {
  .knoku-bar {
    right: 12px; left: auto; bottom: 12px;
    max-width: calc(100vw - 24px);
  }
  .knoku-bar-bottom-left { left: 12px; right: auto; }
  .knoku-bar-inner { min-width: 190px; height: 54px; }
  .knoku-bar-mark { width: 32px; height: 32px; }
  .knoku-bar-send { width: 36px; height: 36px; }
}

/* ===== Side Panel ===== */
.knoku-panel {
  position: fixed; top: 0; right: 0; width: 440px; height: 100vh;
  background: var(--bg); border-left: 1px solid var(--border);
  display: flex; flex-direction: column; z-index: 99999;
  animation: knoku-slide-in 0.2s ease-out;
  transition: background 0.15s;
}
@keyframes knoku-slide-in {
  from { transform: translateX(100%); } to { transform: translateX(0); }
}
@media (max-width: 640px) { .knoku-panel { width: 100%; } }

/* ===== Header ===== */
.knoku-header {
  padding: 14px 14px; display: flex; align-items: center;
  justify-content: space-between; flex-shrink: 0;
}
.knoku-header-left {
  display: flex; align-items: center; gap: 9px;
  font-weight: 650; font-size: 15px; letter-spacing: 0;
}
.knoku-header-left svg { color: var(--primary); }
.knoku-header-actions { display: flex; gap: 2px; }
.knoku-header-btn {
  width: 32px; height: 32px; border: none; background: none;
  border-radius: 6px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
  color: var(--text-placeholder); transition: all 0.1s;
}
.knoku-header-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }

/* ===== Messages ===== */
.knoku-messages {
  flex: 1; overflow-y: auto; padding: 20px 16px;
  display: flex; flex-direction: column; gap: 16px;
}
.knoku-greeting {
  text-align: center; color: var(--text-placeholder); padding: 72px 20px 20px; font-size: 16px;
}
.knoku-suggestions {
  display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 16px;
}
.knoku-suggestion-chip {
  background: var(--bg-tertiary); border: 1px solid var(--border); color: var(--text);
  padding: 8px 14px; border-radius: 20px; font-size: 13px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.knoku-suggestion-chip:hover {
  background: var(--bg-secondary); border-color: var(--text-muted);
}
.knoku-disclaimer {
  max-width: 320px; margin: 18px auto 0;
  font-size: 13px; line-height: 1.45; color: var(--text-muted); opacity: 0.9;
}
.knoku-msg-user { display: flex; justify-content: flex-end; }
.knoku-msg-user-bubble {
  background: var(--bg-tertiary); color: var(--text); padding: 10px 16px;
  border-radius: 18px 18px 4px 18px; max-width: 85%;
  font-size: 14px; word-break: break-word;
}
.knoku-msg-assistant { display: flex; flex-direction: column; gap: 4px; }

/* Status lines */
.knoku-status-block { display: flex; flex-direction: column; gap: 4px; }
.knoku-status-line {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--text-muted); padding: 2px 0;
}
.knoku-status-button {
  background: none; border: none; cursor: pointer; font-family: inherit;
  text-align: left; width: fit-content;
}
.knoku-status-button:hover { color: var(--text-secondary); }
.knoku-status-chevron { transition: transform 0.15s; }
.knoku-status-docs {
  display: flex; flex-direction: column; gap: 4px;
  margin: 0 0 2px 22px; padding: 8px 10px;
  border-radius: 8px; background: var(--bg-secondary);
}
.knoku-status-doc {
  display: flex; flex-direction: column; gap: 1px;
  min-width: 0; font-size: 12px; line-height: 1.35;
}
.knoku-status-doc-title {
  color: var(--text-secondary); font-weight: 500;
  overflow-wrap: anywhere;
}
.knoku-status-doc-path {
  color: var(--text-placeholder); font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 11px; overflow-wrap: anywhere;
}
.knoku-status-spinner {
  width: 14px; height: 14px; border: 2px solid var(--border);
  border-top-color: var(--primary); border-radius: 50%;
  animation: knoku-spin 0.6s linear infinite; flex-shrink: 0;
}
@keyframes knoku-spin { to { transform: rotate(360deg); } }

/* Answer content */
.knoku-answer { font-size: 14px; line-height: 1.7; }
.knoku-answer h2 { font-size: 16px; font-weight: 600; margin: 14px 0 6px; }
.knoku-answer h3 { font-size: 15px; font-weight: 600; margin: 12px 0 4px; }
.knoku-answer h4 { font-size: 14px; font-weight: 600; margin: 10px 0 4px; }
.knoku-answer p { margin: 4px 0; }
.knoku-answer ul, .knoku-answer ol { padding-left: 20px; margin: 4px 0; }
.knoku-answer li { margin: 2px 0; }
.knoku-answer a { color: var(--primary); }
.knoku-answer pre {
  background: var(--code-bg); color: var(--code-text); padding: 12px 16px;
  border-radius: 8px; overflow-x: auto; font-size: 13px; margin: 6px 0;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}
.knoku-answer code {
  background: var(--inline-code-bg); padding: 1px 5px; border-radius: 4px; font-size: 13px;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}
.knoku-answer pre code { background: none; padding: 0; }
.knoku-answer table {
  width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 13px;
}
.knoku-answer th, .knoku-answer td {
  border: 1px solid var(--border); padding: 5px 8px; text-align: left;
}
.knoku-answer th { background: var(--table-header-bg); font-weight: 600; }

/* User image */
.knoku-user-img {
  max-width: 200px; max-height: 120px; border-radius: 8px;
  display: block; margin-bottom: 6px;
}

/* Thinking — live */
.knoku-thinking-live {
  background: var(--bg-secondary); border-radius: 8px; padding: 10px 12px;
  font-size: 13px; color: var(--text-muted); max-height: 150px; overflow-y: auto;
}
.knoku-thinking-header {
  display: flex; align-items: center; gap: 8px;
  font-weight: 500; margin-bottom: 6px; color: var(--text-secondary);
}
.knoku-thinking-text {
  white-space: pre-wrap; line-height: 1.5;
}

/* Thinking — collapsed */
.knoku-thinking-collapsed { margin: 2px 0; }
.knoku-thinking-toggle {
  display: flex; align-items: center; gap: 6px;
  background: none; border: none; cursor: pointer;
  font-size: 13px; color: var(--text-placeholder); font-family: inherit;
  padding: 4px 0; transition: color 0.1s;
}
.knoku-thinking-toggle:hover { color: var(--text-muted); }
.knoku-thinking-content {
  background: var(--bg-secondary); border-radius: 8px; padding: 10px 12px;
  font-size: 12px; color: var(--text-muted); margin-top: 4px;
  white-space: pre-wrap; line-height: 1.5;
  max-height: 200px; overflow-y: auto;
}

/* Sources chips */
.knoku-sources {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
}
.knoku-source-chip {
  font-size: 12px; color: var(--primary); background: var(--bg-accent);
  padding: 4px 12px; border-radius: 12px; text-decoration: none;
  cursor: pointer; transition: background 0.1s;
}
.knoku-source-chip:hover { background: var(--bg-accent-hover); }

/* Action buttons */
.knoku-actions {
  display: flex; gap: 4px; margin-top: 8px;
}
.knoku-action-btn {
  width: 28px; height: 28px; border: none; background: none;
  border-radius: 6px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
  color: var(--text-placeholder); transition: all 0.1s;
}
.knoku-action-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.knoku-action-btn-up.active { color: #16a34a; }
.knoku-action-btn-down.active { color: #dc2626; }
.knoku-copied {
  font-size: 11px; color: var(--success); padding: 2px 6px;
  animation: knoku-fade 1.5s forwards;
}
@keyframes knoku-fade { 0% { opacity: 1; } 100% { opacity: 0; } }

/* ===== Panel Input ===== */
.knoku-input-area {
  padding: 12px 14px 10px; border-top: 1px solid var(--border-light); flex-shrink: 0;
}
.knoku-input-box {
  display: flex; flex-direction: column;
  min-height: 74px;
  border: 1.5px solid var(--border-input); border-radius: 16px;
  padding: 10px 12px 8px; background: var(--bg);
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.knoku-input-box.knoku-drag-over { border-color: var(--knoku-primary-accent); background: var(--bg-accent); }
.knoku-textarea {
  width: 100%; border: none; outline: none; font-size: 14px;
  font-family: inherit; background: transparent; resize: none;
  min-height: 28px; max-height: 120px; line-height: 1.45;
  color: var(--text);
  flex: 1;
}
.knoku-textarea::placeholder { color: var(--text-placeholder); }
.knoku-input-actions {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 6px;
}
.knoku-attach-btn {
  width: 30px; height: 30px; border: none; background: transparent;
  border-radius: 8px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
  color: var(--text-muted); transition: background 0.1s, color 0.1s;
}
.knoku-attach-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.knoku-send-btn {
  width: 32px; height: 32px; border-radius: 10px; border: none;
  color: #fff; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
  flex-shrink: 0; transition: opacity 0.1s; margin-left: auto;
}
.knoku-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.knoku-img-preview {
  position: relative; margin: 0 0 10px; display: inline-block; width: fit-content;
}
.knoku-img-preview img {
  max-height: 84px; max-width: 160px; border-radius: 10px; border: 1px solid var(--border);
}
.knoku-img-remove {
  position: absolute; top: -6px; right: -6px;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--error); color: #fff; border: none;
  font-size: 11px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
}
.knoku-branding {
  display: flex; align-items: center; gap: 5px;
  padding: 8px 2px 0;
  color: var(--text-placeholder); font-size: 11px; line-height: 1.3;
  flex-shrink: 0;
}
.knoku-branding a {
  color: var(--text-muted); text-decoration: none; font-weight: 600;
}
.knoku-branding a:hover { color: var(--text-secondary); text-decoration: underline; }

/* ===== Consent screen ===== */
.knoku-consent {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg);
  padding: 20px;
  z-index: 1;
}
.knoku-consent-close {
  position: absolute; top: 14px; right: 14px;
  width: 34px; height: 34px; border: none; background: transparent;
  border-radius: 8px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
  color: var(--text-placeholder); transition: background 0.1s, color 0.1s;
}
.knoku-consent-close:hover {
  background: var(--bg-hover); color: var(--text-secondary);
}
.knoku-consent-card {
  max-width: 380px; text-align: center;
}
.knoku-consent-title {
  font-size: 16px; font-weight: 600; margin-bottom: 10px; color: var(--text);
}
.knoku-consent-disclaimer {
  font-size: 13px; line-height: 1.6; color: var(--text-secondary);
  margin-bottom: 18px;
}
.knoku-consent-disclaimer a { color: var(--primary); }
.knoku-consent-actions {
  display: flex; flex-direction: column; gap: 8px;
}
.knoku-consent-accept,
.knoku-consent-reject {
  padding: 10px 16px; border-radius: 10px;
  font-size: 14px; font-weight: 500; cursor: pointer;
  border: 1px solid transparent; font-family: inherit;
}
.knoku-consent-accept {
  color: #fff; background: var(--knoku-primary-accent);
}
.knoku-consent-reject {
  background: transparent; color: var(--text-secondary);
  border-color: var(--border);
}
.knoku-consent-reject:hover { background: var(--bg-hover); }

/* ===== Side Panel ===== */
.knoku-panel {
  position: fixed; top: 0; right: 0; width: 440px; height: 100vh;
  background: var(--bg); border-left: 1px solid var(--border);
  display: flex; flex-direction: column; z-index: 99999;
  animation: knoku-slide-in 0.2s ease-out;
  transition: background 0.15s;
}
@keyframes knoku-slide-in {
  from { transform: translateX(100%); } to { transform: translateX(0); }
}
@media (max-width: 640px) { .knoku-panel { width: 100%; } }
`
