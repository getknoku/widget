/**
 * IIFE entry point used by `dist/widget.js` (the CDN script tag bundle).
 *
 * Reads supported `data-*` attributes off the `<script>` element, optionally
 * merges the host's `window.__KNOKU_CONFIG__` preset, then calls
 * `initKnokuWidget()`. Invalid attribute values produce a console warning
 * and fall back to the default — they never throw.
 */

import { initKnokuWidget } from './sdk'
import { detectBrowserLanguage, isSupportedLanguage } from './i18n'
import { parseSuggestedQuestionsCsv } from './suggested-questions-format'
import type { ConsentConfig, KnokuWidgetInitOptions, SuggestedQuestion } from './types'
import { ALLOWED_CSS_PROPERTIES, ALLOWED_STATES, SLOT_NAMES_BY_LENGTH } from './component-style-spec'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function parseScriptAttributes(script: HTMLScriptElement): Partial<KnokuWidgetInitOptions> {
  const projectId = readString(script, 'project-id')

  const options: Partial<KnokuWidgetInitOptions> = {}
  const theme = readEnum(script, 'theme', ['auto', 'light', 'dark'] as const)
  const primaryColor = readHex(script, 'primary-color')
  const primaryColorLight = readHex(script, 'primary-color-light')
  const primaryColorDark = readHex(script, 'primary-color-dark')
  const greeting = readString(script, 'greeting')
  const launcherText = readString(script, 'launcher-text')
  const launcherSubtitle = readString(script, 'launcher-subtitle')
  const launcherAlign = readEnum(script, 'launcher-align', ['bottom-right', 'bottom-left'] as const)
  const launcherHidden = readBoolean(script, 'launcher-hidden')
  const launcherIcon = readString(script, 'launcher-icon')
  const launcherStyle = readEnum(script, 'launcher-style', ['pill', 'card'] as const)
  const launcherIconPosition = readEnum(script, 'launcher-icon-position', ['left', 'right'] as const)
  const launcherShowIcon = readBoolean(script, 'launcher-show-icon')
  const layout = readEnum(script, 'layout', ['overlay', 'push', 'modal'] as const)
  const openSelector = readString(script, 'open-selector')
  const suggestedQuestions = readSuggestedQuestions(script)
  const language = readLanguage(script)
  const consentRequired = readBoolean(script, 'consent-required')
  const consentTitle = readString(script, 'consent-title')
  const consentDisclaimer = readString(script, 'consent-disclaimer')
  const consentAcceptText = readString(script, 'consent-accept-text')
  const consentRejectText = readString(script, 'consent-reject-text')
  const mode = readEnum(script, 'mode', ['chat', 'deflector'] as const)
  const formSelector = readString(script, 'form-selector')
  const subjectSelector = readString(script, 'subject-selector')
  const bodySelector = readString(script, 'body-selector')

  if (projectId) options.projectId = projectId
  if (theme) options.theme = theme
  if (primaryColor) options.primaryColor = primaryColor
  if (primaryColorLight) options.primaryColorLight = primaryColorLight
  if (primaryColorDark) options.primaryColorDark = primaryColorDark
  if (greeting) options.greeting = greeting
  if (launcherText) options.launcherText = launcherText
  if (launcherSubtitle) options.launcherSubtitle = launcherSubtitle
  if (launcherAlign) options.launcherAlign = launcherAlign
  if (typeof launcherHidden === 'boolean') options.launcherHidden = launcherHidden
  if (launcherIcon) options.launcherIcon = launcherIcon
  if (launcherStyle) options.launcherStyle = launcherStyle
  if (launcherIconPosition) options.launcherIconPosition = launcherIconPosition
  if (typeof launcherShowIcon === 'boolean') options.launcherShowIcon = launcherShowIcon
  if (layout) options.layout = layout
  if (openSelector) options.openSelector = openSelector
  if (suggestedQuestions) options.suggestedQuestions = suggestedQuestions
  if (language) options.language = language
  const consent: Partial<ConsentConfig> = {}
  if (typeof consentRequired === 'boolean') consent.required = consentRequired
  if (consentTitle) consent.title = consentTitle
  if (consentDisclaimer) consent.disclaimer = consentDisclaimer
  if (consentAcceptText) consent.acceptText = consentAcceptText
  if (consentRejectText) consent.rejectText = consentRejectText
  if (Object.keys(consent).length > 0) options.consent = consent
  if (mode) options.mode = mode
  if (formSelector) options.formSelector = formSelector
  if (subjectSelector) options.subjectSelector = subjectSelector
  if (bodySelector) options.bodySelector = bodySelector

  const componentStyles = parseComponentStyleAttributes(script)
  if (Object.keys(componentStyles).length > 0) options.componentStyles = componentStyles

  return options
}

/**
 * Parse per-component style attributes off the script tag.
 *
 * Recognized attribute shapes:
 *
 * ```
 * data-{slot}-{property}
 * data-{slot}-{state}-{property}
 * data-{slot}-{property}-dark
 * data-{slot}-{state}-{property}-dark
 * ```
 *
 * `slot` must be in `SLOT_NAMES`, `state` in `ALLOWED_STATES`, `property` in
 * `ALLOWED_CSS_PROPERTIES`. Output keys are `slot`, `slot:state`,
 * `slot:dark`, or `slot:state:dark`. Attributes that don't match the grammar
 * are ignored silently — there is no warning because attribute names that
 * aren't widget-related (analytics scripts, integrity hashes, etc.) commonly
 * appear on the same `<script>` tag.
 */
function parseComponentStyleAttributes(script: HTMLScriptElement): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  for (const attr of Array.from(script.attributes)) {
    if (!attr.name.startsWith('data-')) continue
    const value = attr.value?.trim()
    if (!value) continue
    const parsed = parseComponentStyleName(attr.name.slice(5))
    if (!parsed) continue
    const modifiers: string[] = []
    if (parsed.state) modifiers.push(parsed.state)
    if (parsed.dark) modifiers.push('dark')
    const key = modifiers.length === 0 ? parsed.slot : `${parsed.slot}:${modifiers.join(':')}`
    if (!result[key]) result[key] = {}
    result[key][parsed.property] = value
  }
  return result
}

function parseComponentStyleName(name: string): { slot: string; state?: string; property: string; dark: boolean } | null {
  let dark = false
  let n = name
  if (n.endsWith('-dark')) {
    dark = true
    n = n.slice(0, -5)
  }
  const slot = SLOT_NAMES_BY_LENGTH.find((s) => n === s || n.startsWith(s + '-'))
  if (!slot || n === slot) return null
  let rest = n.slice(slot.length + 1)
  let state: string | undefined
  for (const s of ALLOWED_STATES) {
    if (rest === s) return null
    if (rest.startsWith(s + '-')) {
      state = s
      rest = rest.slice(s.length + 1)
      break
    }
  }
  if (!ALLOWED_CSS_PROPERTIES.has(rest)) return null
  return { slot, state, property: rest, dark }
}

function readPresetConfig(): Partial<KnokuWidgetInitOptions> {
  const value = (window as any).__KNOKU_CONFIG__
  if (!value || typeof value !== 'object') return {}
  return value as Partial<KnokuWidgetInitOptions>
}

function mergeOptions(
  attributes: Partial<KnokuWidgetInitOptions>,
  preset: Partial<KnokuWidgetInitOptions>,
): Partial<KnokuWidgetInitOptions> {
  return {
    ...attributes,
    ...preset,
    consent: {
      ...(attributes.consent || {}),
      ...(preset.consent || {}),
    },
    componentStyles: {
      ...(attributes.componentStyles || {}),
      ...(preset.componentStyles || {}),
    },
  }
}

function readString(script: HTMLScriptElement, name: string): string | undefined {
  const value = script.getAttribute(`data-${name}`)?.trim()
  return value || undefined
}

function readHex(script: HTMLScriptElement, name: string): string | undefined {
  const value = readString(script, name)
  if (!value) return undefined
  if (!HEX_COLOR_RE.test(value)) {
    warnInvalid(name)
    return undefined
  }
  return value
}

function readBoolean(script: HTMLScriptElement, name: string): boolean | undefined {
  if (!script.hasAttribute(`data-${name}`)) return undefined
  const value = script.getAttribute(`data-${name}`)
  if (value === 'true') return true
  if (value === 'false') return false
  warnInvalid(name)
  return undefined
}

function readCSV(script: HTMLScriptElement, name: string): string[] | undefined {
  const value = readString(script, name)
  if (!value) return undefined
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

/**
 * Parse `data-suggested-questions` with optional `|icon` per item.
 * Format: `Question 1,Question 2|icon-name,Question 3|icon-name`. Items
 * without `|` get the default icon (sparkle). Empty entries are dropped.
 * Commas and pipes inside question text are escaped as `\,` and `\|`.
 */
function readSuggestedQuestions(script: HTMLScriptElement): SuggestedQuestion[] | undefined {
  const value = readString(script, 'suggested-questions')
  if (!value) return undefined
  const items: SuggestedQuestion[] = parseSuggestedQuestionsCsv(value).map((q) =>
    q.icon ? { text: q.text, icon: q.icon } : q.text,
  )
  return items.length > 0 ? items : undefined
}

function readEnum<T extends readonly string[]>(script: HTMLScriptElement, name: string, values: T): T[number] | undefined {
  const value = readString(script, name)
  if (!value) return undefined
  if (!values.includes(value)) {
    warnInvalid(name)
    return undefined
  }
  return value
}

function readLanguage(script: HTMLScriptElement): string | undefined {
  const value = readString(script, 'language')
  if (!value) return detectBrowserLanguage() || undefined
  if (!isSupportedLanguage(value)) {
    warnInvalid('language')
    return undefined
  }
  return value
}

function warnInvalid(name: string) {
  console.warn(`Knoku: invalid value for data-${name}, using default`)
}

// Top-level execution must come after all helper declarations: with hoisting,
// `const` regex literals would be undefined when the parsers run.
const script = document.currentScript as HTMLScriptElement | null
const fallbackScript = script || document.querySelector('script[data-project-id]') as HTMLScriptElement | null
const attributeOptions = fallbackScript ? parseScriptAttributes(fallbackScript) : {}
const presetConfig = readPresetConfig()
const options = mergeOptions(attributeOptions, presetConfig)

if (!options.projectId) {
  console.error('Knoku: data-project-id is required')
} else {
  void initKnokuWidget(options as KnokuWidgetInitOptions)
}
