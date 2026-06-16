/**
 * Allowlist for the per-slot, per-property style override surface.
 *
 * Both the `data-*` attribute parser (`loader.ts`) and the CSS builder
 * (`widget.tsx`) read from these lists, so adding a new slot, property or
 * pseudo-state in one place keeps both consumers in sync.
 */

/** Component slots that accept style overrides. */
export const SLOT_NAMES = [
  'panel',
  'panel-header',
  'panel-body',
  'panel-footer',
  'launcher',
  'launcher-pill',
  'launcher-pill-label',
  'backdrop',
  'bottom-bar',
  'launcher-text',
  'launcher-subtitle',
  'launcher-mark',
  'launcher-send',
  'submit-button',
  'user-bubble',
  'assistant-answer',
  'suggestion-chip',
  'source-chip',
  'disclaimer',
  'greeting',
  'consent-screen',
  'consent-accept-button',
  'consent-reject-button',
  'feedback-up',
  'feedback-down',
] as const

export type SlotName = typeof SLOT_NAMES[number]

/** Pseudo-states that may be appended to a slot, e.g. `panel:hover`. */
export const ALLOWED_STATES = ['hover', 'focus', 'active'] as const
export type AllowedState = typeof ALLOWED_STATES[number]

/** CSS properties that may be set on a slot. Properties not in this set are dropped silently. */
export const ALLOWED_CSS_PROPERTIES: ReadonlySet<string> = new Set([
  'background-color',
  'border', 'border-bottom', 'border-color', 'border-radius',
  'color',
  'font-family', 'font-size', 'font-weight',
  'opacity',
  'height', 'width', 'max-height', 'max-width', 'min-height', 'min-width',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'padding-x', 'padding-y',
  'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'margin-x', 'margin-y',
  'flex-direction', 'justify-content',
  'top', 'left', 'right', 'bottom',
  'box-shadow', 'text-shadow',
  'z-index',
])

/**
 * Slot names sorted longest-first.
 *
 * Used for longest-prefix attribute matching so that `data-panel-header-color`
 * resolves to the `panel-header` slot rather than the shorter `panel` slot.
 */
export const SLOT_NAMES_BY_LENGTH: readonly string[] = [...SLOT_NAMES].sort(
  (a, b) => b.length - a.length,
)
