/**
 * Public SDK surface for the Knoku widget.
 *
 * Three entry points converge on `initKnokuWidget(options)`:
 *
 * 1. CDN script tag (`loader.ts` reads `data-*` attributes and calls in here).
 * 2. Host preset global (`window.__KNOKU_CONFIG__`, also routed through `loader.ts`).
 * 3. npm import (`import { initKnokuWidget } from '@knoku/widget'`).
 *
 * `initKnokuWidget` fetches `/api/v1/config/{projectId}` to verify the project
 * is active and the host origin is allowed, then attaches a Shadow DOM host
 * and mounts the Preact widget tree. The widget is not mounted when the
 * server reports `active: false` or the request fails.
 */

import { mount, mountWithCleanup } from './widget'
import { bindDeflectorForm, clearDeflectorPendingForm } from './deflector'
import { removeLegacyScrollLockStyle, unlockPageScroll } from './scroll-lock'
import { detectBrowserLanguage, getDictionary } from './i18n'
import type {
  ConsentConfig,
  KnokuWidgetInitOptions,
  KnokuWidgetRuntime,
  SuggestedQuestion,
  SuggestedQuestionConfig,
  WidgetConfig,
} from './types'

// Module-level singletons so re-invoking initKnokuWidget cleanly tears down
// the previous instance — supports theme refresh and config swap flows.
let activeHost: HTMLElement | null = null
let activeDestroy: (() => void) | null = null
let activeSelectorCleanup: (() => void) | null = null
let activeDeflectorCleanup: (() => void) | null = null
let activeDeflectorContinue: (() => void) | null = null

function cleanupActiveWidget() {
  activeSelectorCleanup?.()
  activeSelectorCleanup = null
  activeDeflectorCleanup?.()
  activeDeflectorCleanup = null
  activeDeflectorContinue = null
  activeDestroy?.()
  activeDestroy = null
  if (activeHost?.isConnected) {
    activeHost.remove()
  }
  activeHost = null
  unlockPageScroll()
  removeLegacyScrollLockStyle()
  document.getElementById('knoku-page-push')?.remove()
  if ((window as Window & { Knoku?: KnokuWidgetRuntime }).Knoku) {
    delete (window as Window & { Knoku?: KnokuWidgetRuntime }).Knoku
  }
}

/** Public teardown for host-initiated remounts (SPA route changes, etc.). */
export function destroyKnokuWidget(): void {
  cleanupActiveWidget()
}

/** Default consent copy in English. Used when `data-language` resolves to `en` and no `data-consent-*` overrides are set. */
export const DEFAULT_CONSENT_CONFIG: ConsentConfig = {
  required: false,
  title: getDictionary('en').consentTitle,
  disclaimer: getDictionary('en').consentDisclaimer,
  acceptText: getDictionary('en').consentAcceptText,
  rejectText: getDictionary('en').consentRejectText,
}

/**
 * Built-in defaults applied when a caller-facing option is omitted. All
 * values here are publicly exposed and may be overridden via the script
 * tag, `__KNOKU_CONFIG__`, or `initKnokuWidget()` options.
 */
export const DEFAULT_WIDGET_CONFIG: Omit<WidgetConfig, 'projectId'> = {
  apiUrl: 'https://api.knoku.com',
  theme: 'auto',
  // Knoku brand defaults (from frontend/src/app/globals.css `--primary`):
  // light mode `oklch(0.205 0 0)` → near-black; dark mode `oklch(0.88 0 0)` → near-white.
  // Customers override per-project via `data-primary-color-*`.
  primaryColorLight: '#171717',
  primaryColorDark: '#d4d4d4',
  greeting: '',
  launcherText: 'Ask Docs',
  launcherSubtitle: '',
  launcherAlign: 'bottom-right',
  launcherHidden: false,
  launcherIcon: 'book-open',
  launcherStyle: 'pill',
  launcherIconPosition: 'right',
  launcherShowIcon: true,
  layout: 'modal',
  suggestedQuestions: [],
  brandingRequired: false,
  // Set by the backend config response (project.primary_domain). Empty string
  // means "fall back to window.location.origin" — see WidgetConfig docstring.
  primaryDomain: '',
  // Backend-controlled: only true when the project owner enabled MCP AND the
  // org's plan covers it. Widget reads but never sets.
  mcpEnabled: false,
  mcpUrl: '',
  // Backend-controlled: customer-owned Cloudflare Turnstile site key (public).
  // Empty disables the gate (legacy widget behavior).
  turnstileSiteKey: '',
  // Overridden by detectBrowserLanguage() unless the caller sets `language` explicitly.
  language: 'en',
  consent: DEFAULT_CONSENT_CONFIG,
  componentStyles: {},
  mode: 'chat',
  deflectorEnabled: false,
  formSelector: '',
  subjectSelector: '',
  bodySelector: '',
}

function resolvePrimaryColors(options: {
  primaryColor?: string
  primaryColorLight?: string
  primaryColorDark?: string
}, fallbackLight: string, fallbackDark: string): { light: string; dark: string } {
  const light = options.primaryColorLight || options.primaryColor || fallbackLight
  const dark = options.primaryColorDark || options.primaryColor || fallbackDark
  return { light, dark }
}

function mergeConsent(local?: Partial<ConsentConfig>, fallback?: ConsentConfig): ConsentConfig {
  const base = fallback || DEFAULT_CONSENT_CONFIG
  const pickString = (key: keyof ConsentConfig): string => {
    const localVal = local?.[key]
    if (typeof localVal === 'string' && localVal) return localVal
    return base[key] as string
  }
  const required = typeof local?.required === 'boolean'
    ? local.required
    : base.required
  return {
    required,
    title: pickString('title'),
    disclaimer: pickString('disclaimer'),
    acceptText: pickString('acceptText'),
    rejectText: pickString('rejectText'),
  }
}

function getDefaultConsentConfig(language: string): ConsentConfig {
  const dict = getDictionary(language)
  return {
    required: DEFAULT_CONSENT_CONFIG.required,
    title: dict.consentTitle,
    disclaimer: dict.consentDisclaimer,
    acceptText: dict.consentAcceptText,
    rejectText: dict.consentRejectText,
  }
}

function normalizeSuggestion(s: SuggestedQuestion): SuggestedQuestionConfig | null {
  if (typeof s === 'string') {
    const text = s.trim()
    return text ? { text } : null
  }
  if (s && typeof s === 'object' && typeof s.text === 'string') {
    const text = s.text.trim()
    if (!text) return null
    return s.icon ? { text, icon: s.icon } : { text }
  }
  return null
}

function normalizeSuggestions(input?: SuggestedQuestion[]): SuggestedQuestionConfig[] {
  if (!input) return []
  const out: SuggestedQuestionConfig[] = []
  for (const item of input) {
    const n = normalizeSuggestion(item)
    if (n) out.push(n)
  }
  return out
}

function mergeComponentStyles(local?: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  const assign = (source: unknown) => {
    if (!source || typeof source !== 'object') return
    for (const [component, props] of Object.entries(source as Record<string, unknown>)) {
      if (!props || typeof props !== 'object') continue
      out[component] = out[component] || {}
      for (const [prop, value] of Object.entries(props as Record<string, unknown>)) {
        if (typeof value === 'string') out[component][prop] = value
      }
    }
  }
  assign(local)
  return out
}

/**
 * Resolve a fully-populated `WidgetConfig` from caller-facing options by
 * merging with `DEFAULT_WIDGET_CONFIG`. Does not perform the remote config
 * fetch — see `fetchWidgetConfig` for that.
 */
export function createWidgetConfig(options: KnokuWidgetInitOptions): WidgetConfig {
  const mode = options.mode === 'deflector' ? 'deflector' : 'chat'
  const colors = resolvePrimaryColors(options, DEFAULT_WIDGET_CONFIG.primaryColorLight, DEFAULT_WIDGET_CONFIG.primaryColorDark)
  const language = options.language || detectBrowserLanguage() || 'en'
  const defaultConsent = getDefaultConsentConfig(language)
  const launcherHidden = mode === 'deflector'
    ? true
    : (options.launcherHidden ?? DEFAULT_WIDGET_CONFIG.launcherHidden)
  return {
    projectId: options.projectId,
    apiUrl: options.apiUrl || DEFAULT_WIDGET_CONFIG.apiUrl,
    theme: options.theme || DEFAULT_WIDGET_CONFIG.theme,
    primaryColorLight: colors.light,
    primaryColorDark: colors.dark,
    greeting: options.greeting || (mode === 'deflector'
      ? (getDictionary(language).deflectorGreeting ?? '')
      : DEFAULT_WIDGET_CONFIG.greeting),
    launcherText: options.launcherText || DEFAULT_WIDGET_CONFIG.launcherText,
    launcherSubtitle: options.launcherSubtitle ?? DEFAULT_WIDGET_CONFIG.launcherSubtitle,
    launcherAlign: options.launcherAlign || DEFAULT_WIDGET_CONFIG.launcherAlign,
    launcherHidden,
    launcherIcon: options.launcherIcon || DEFAULT_WIDGET_CONFIG.launcherIcon,
    launcherStyle: options.launcherStyle || DEFAULT_WIDGET_CONFIG.launcherStyle,
    launcherIconPosition: options.launcherIconPosition || DEFAULT_WIDGET_CONFIG.launcherIconPosition,
    launcherShowIcon: options.launcherShowIcon ?? DEFAULT_WIDGET_CONFIG.launcherShowIcon,
    layout: options.layout || DEFAULT_WIDGET_CONFIG.layout,
    suggestedQuestions: normalizeSuggestions(options.suggestedQuestions),
    brandingRequired: DEFAULT_WIDGET_CONFIG.brandingRequired,
    primaryDomain:
      typeof options.primaryDomain === 'string'
        ? options.primaryDomain.trim()
        : DEFAULT_WIDGET_CONFIG.primaryDomain,
    mcpEnabled: DEFAULT_WIDGET_CONFIG.mcpEnabled,
    mcpUrl: DEFAULT_WIDGET_CONFIG.mcpUrl,
    turnstileSiteKey: DEFAULT_WIDGET_CONFIG.turnstileSiteKey,
    language,
    consent: mergeConsent(options.consent, defaultConsent),
    componentStyles: mergeComponentStyles(options.componentStyles),
    preview: options.preview === true,
    previewSurface: options.previewSurface,
    mode,
    deflectorEnabled: DEFAULT_WIDGET_CONFIG.deflectorEnabled,
    formSelector: (options.formSelector || '').trim(),
    subjectSelector: (options.subjectSelector || '').trim(),
    bodySelector: (options.bodySelector || '').trim(),
  }
}

/**
 * Build the local config and verify the project is active by hitting
 * `/api/v1/config/{projectId}`. Returns `null` (so the caller skips
 * mounting) when the project is disabled, the host origin is not
 * allowlisted, or the request fails.
 */
export async function fetchWidgetConfig(options: KnokuWidgetInitOptions): Promise<WidgetConfig | null> {
  const localConfig = createWidgetConfig(options)

  const mergeRemoteConfig = async (config: WidgetConfig): Promise<WidgetConfig> => {
    try {
      const res = await fetch(`${config.apiUrl}/api/v1/config/${config.projectId}`)
      if (!res.ok) return config
      const remoteConfig = await res.json() as {
        primary_domain?: string
        branding_required?: boolean
      }
      const remotePrimaryDomain =
        typeof remoteConfig?.primary_domain === 'string' ? remoteConfig.primary_domain.trim() : ''
      const remoteBrandingRequired = typeof remoteConfig?.branding_required === 'boolean'
        ? remoteConfig.branding_required
        : undefined
      return {
        ...config,
        ...(remotePrimaryDomain ? { primaryDomain: remotePrimaryDomain } : {}),
        ...(remoteBrandingRequired !== undefined
          ? { brandingRequired: remoteBrandingRequired }
          : {}),
      }
    } catch {
      return config
    }
  }

  // Dashboard live preview: mount from local options; still backfill remote flags.
  if (options.preview === true) {
    return mergeRemoteConfig(localConfig)
  }

  try {
    const res = await fetch(`${localConfig.apiUrl}/api/v1/config/${localConfig.projectId}`)
    if (!res.ok) return null

    const remoteConfig = await res.json() as {
      active?: boolean
      branding_required?: boolean
      disabled_reason?: string | null
      primary_domain?: string
      mcp_enabled?: boolean
      mcp_url?: string
      turnstile_site_key?: string
      deflector_enabled?: boolean
    }
    if (remoteConfig && remoteConfig.active === false) {
      if (remoteConfig.disabled_reason) {
        console.warn('Knoku: widget inactive', remoteConfig.disabled_reason)
      }
      return null
    }
    const remoteBrandingRequired = typeof remoteConfig?.branding_required === 'boolean'
      ? remoteConfig.branding_required
      : undefined
    const remotePrimaryDomain = typeof remoteConfig?.primary_domain === 'string'
      ? remoteConfig.primary_domain
      : ''
    const remoteMCPEnabled = remoteConfig?.mcp_enabled === true
    const remoteMCPUrl = typeof remoteConfig?.mcp_url === 'string' ? remoteConfig.mcp_url : ''
    const remoteTurnstileSiteKey = typeof remoteConfig?.turnstile_site_key === 'string'
      ? remoteConfig.turnstile_site_key
      : ''
    const remoteDeflectorEnabled = remoteConfig?.deflector_enabled === true

    if (localConfig.mode === 'deflector' && !remoteDeflectorEnabled) {
      console.warn('Knoku: support form deflector requires a Business plan')
      return null
    }

    return {
      ...localConfig,
      brandingRequired: remoteBrandingRequired ?? DEFAULT_WIDGET_CONFIG.brandingRequired,
      primaryDomain: remotePrimaryDomain,
      mcpEnabled: remoteMCPEnabled && remoteMCPUrl !== '',
      mcpUrl: remoteMCPUrl,
      turnstileSiteKey: remoteTurnstileSiteKey,
      deflectorEnabled: remoteDeflectorEnabled,
    }
  } catch {
    return null
  }
}

/**
 * Initialize the widget end-to-end: tear down any previous instance, fetch
 * remote config, attach a Shadow DOM host on `<body>`, and mount the panel.
 * Resolves to the Shadow root when mounting succeeded, or `null` when the
 * widget should not be shown (project inactive, origin not allowed, etc.).
 */
export async function initKnokuWidget(options: KnokuWidgetInitOptions): Promise<ShadowRoot | null> {
  cleanupActiveWidget()

  const config = await fetchWidgetConfig(options)
  if (!config) return null

  if (config.mode === 'deflector' && !config.formSelector) {
    console.warn('Knoku: data-form-selector is required for data-mode="deflector"')
    return null
  }

  const hostId = options.hostId || 'knoku-widget'
  const host = document.createElement('div')
  host.id = hostId
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const blockKeys = (e: Event) => e.stopPropagation()
  shadow.addEventListener('keydown', blockKeys)
  shadow.addEventListener('keyup', blockKeys)
  shadow.addEventListener('keypress', blockKeys)
  const mounted = mountWithCleanup(shadow, config)
  activeHost = host
  activeDestroy = mounted.destroy
  activeSelectorCleanup = bindOpenSelector(options.openSelector)

  const runtime: KnokuWidgetRuntime = {
    ...mounted.runtime,
    destroy: () => destroyKnokuWidget(),
  }
  ;(window as Window & { Knoku?: KnokuWidgetRuntime }).Knoku = runtime

  if (config.mode === 'deflector' && config.formSelector) {
    const bound = bindDeflectorForm({
      formSelector: config.formSelector,
      subjectSelector: config.subjectSelector || undefined,
      bodySelector: config.bodySelector || undefined,
      onQuestion: (question) => {
        window.dispatchEvent(new CustomEvent('knoku:ask', { detail: { question } }))
      },
    })
    activeDeflectorCleanup = bound.cleanup
    activeDeflectorContinue = bound.continueToSupport
    const onContinue = () => activeDeflectorContinue?.()
    window.addEventListener('knoku:deflector-continue', onContinue)
    const prevCleanup = activeDeflectorCleanup
    activeDeflectorCleanup = () => {
      prevCleanup()
      window.removeEventListener('knoku:deflector-continue', onContinue)
    }
  }

  return shadow
}

/**
 * Lower-level mount API for hosts that already own a Shadow root. Returns
 * the runtime control surface (`open` / `close` / `ask` / `identify`).
 */
export function mountKnokuWidget(container: ShadowRoot, config: WidgetConfig): KnokuWidgetRuntime {
  return mount(container, config)
}

/**
 * Wire up `data-open-selector` so any matching element opens the panel on
 * click. Binds immediately, on `DOMContentLoaded`, and observes the DOM for
 * matches added later (SPA navbars, async-rendered triggers, etc.).
 */
function bindOpenSelector(selector?: string): (() => void) | null {
  if (!selector) return null

  try {
    document.querySelector(selector)
  } catch {
    console.warn(`Knoku: invalid value for data-open-selector "${selector}", ignoring`)
    return null
  }

  const cleanups: Array<() => void> = []
  const bound = new WeakSet<Element>()
  const handler = (event: Event) => {
    event.preventDefault()
    window.dispatchEvent(new CustomEvent('knoku:open'))
  }

  const bindNode = (node: Element) => {
    if (bound.has(node)) return
    bound.add(node)
    node.addEventListener('click', handler)
    cleanups.push(() => node.removeEventListener('click', handler))
  }

  const bind = () => document.querySelectorAll(selector).forEach(bindNode)

  bind()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true })
    cleanups.push(() => document.removeEventListener('DOMContentLoaded', bind))
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof Element)) continue
        if (node.matches(selector)) bindNode(node)
        node.querySelectorAll(selector).forEach(bindNode)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  cleanups.push(() => observer.disconnect())

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  }
}
