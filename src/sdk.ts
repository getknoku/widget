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
import { detectBrowserLanguage, getDictionary } from './i18n'
import type {
  ConsentConfig,
  KnokuWidgetInitOptions,
  KnokuWidgetRuntime,
  WidgetConfig,
} from './types'

// Module-level singletons so re-invoking initKnokuWidget cleanly tears down
// the previous instance — supports theme refresh and config swap flows.
let activeHost: HTMLElement | null = null
let activeDestroy: (() => void) | null = null
let activeSelectorCleanup: (() => void) | null = null

function cleanupActiveWidget() {
  activeSelectorCleanup?.()
  activeSelectorCleanup = null
  activeDestroy?.()
  activeDestroy = null
  if (activeHost?.isConnected) {
    activeHost.remove()
  }
  activeHost = null
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
  primaryColorLight: '#6366f1',
  primaryColorDark: '#818cf8',
  greeting: 'How can I help?',
  launcherText: 'Need help?',
  launcherSubtitle: 'Ask AI',
  launcherAlign: 'bottom-right',
  launcherHidden: false,
  suggestedQuestions: [],
  brandingRequired: false,
  // Overridden by detectBrowserLanguage() unless the caller sets `language` explicitly.
  language: 'en',
  consent: DEFAULT_CONSENT_CONFIG,
  componentStyles: {},
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
  const colors = resolvePrimaryColors(options, DEFAULT_WIDGET_CONFIG.primaryColorLight, DEFAULT_WIDGET_CONFIG.primaryColorDark)
  const language = options.language || detectBrowserLanguage() || 'en'
  const defaultConsent = getDefaultConsentConfig(language)
  return {
    projectId: options.projectId,
    apiUrl: options.apiUrl || DEFAULT_WIDGET_CONFIG.apiUrl,
    theme: options.theme || DEFAULT_WIDGET_CONFIG.theme,
    primaryColorLight: colors.light,
    primaryColorDark: colors.dark,
    greeting: options.greeting || DEFAULT_WIDGET_CONFIG.greeting,
    launcherText: options.launcherText || DEFAULT_WIDGET_CONFIG.launcherText,
    launcherSubtitle: options.launcherSubtitle || DEFAULT_WIDGET_CONFIG.launcherSubtitle,
    launcherAlign: options.launcherAlign || DEFAULT_WIDGET_CONFIG.launcherAlign,
    launcherHidden: options.launcherHidden ?? DEFAULT_WIDGET_CONFIG.launcherHidden,
    suggestedQuestions: options.suggestedQuestions || DEFAULT_WIDGET_CONFIG.suggestedQuestions,
    brandingRequired: DEFAULT_WIDGET_CONFIG.brandingRequired,
    language,
    consent: mergeConsent(options.consent, defaultConsent),
    componentStyles: mergeComponentStyles(options.componentStyles),
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

  try {
    const res = await fetch(`${localConfig.apiUrl}/api/v1/config/${localConfig.projectId}`)
    if (!res.ok) return null

    const remoteConfig = await res.json() as {
      active?: boolean
      branding_required?: boolean
      disabled_reason?: string | null
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

    return {
      ...localConfig,
      brandingRequired: remoteBrandingRequired ?? DEFAULT_WIDGET_CONFIG.brandingRequired,
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

  const hostId = options.hostId || 'knoku-widget'
  const host = document.createElement('div')
  host.id = hostId
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const mounted = mountWithCleanup(shadow, config)
  activeHost = host
  activeDestroy = mounted.destroy
  activeSelectorCleanup = bindOpenSelector(options.openSelector)

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
 * click. Binds immediately for elements already in the DOM and once more on
 * `DOMContentLoaded` to catch elements declared after the widget script.
 */
function bindOpenSelector(selector?: string): (() => void) | null {
  if (!selector) return null

  const cleanups: Array<() => void> = []
  const bound = new WeakSet<Element>()
  const handler = (event: Event) => {
    event.preventDefault()
    window.dispatchEvent(new CustomEvent('knoku:open'))
  }

  const bind = () => {
    let nodes: NodeListOf<Element>
    try {
      nodes = document.querySelectorAll(selector)
    } catch {
      console.warn(`Knoku: invalid value for data-open-selector "${selector}", ignoring`)
      return
    }

    nodes.forEach((node) => {
      if (bound.has(node)) return
      bound.add(node)
      node.addEventListener('click', handler)
      cleanups.push(() => node.removeEventListener('click', handler))
    })
  }

  bind()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true })
    cleanups.push(() => document.removeEventListener('DOMContentLoaded', bind))
  }

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  }
}
