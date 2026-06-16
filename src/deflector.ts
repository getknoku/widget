/**
 * Support-form deflector: intercept submit, ask docs first, then resolve or
 * continue to the original ticket form.
 *
 * Module singleton — only one document listener at a time so React Strict Mode
 * / script remounts cannot stack handlers (which re-opened the modal on
 * "Continue to support").
 */

export interface DeflectorBindOptions {
  formSelector: string
  subjectSelector?: string
  bodySelector?: string
  onQuestion: (question: string) => void
}

let activeCleanup: (() => void) | null = null
let activeContinueToSupport: (() => void) | null = null
let pendingForm: HTMLFormElement | null = null
let bypassNextSubmit = false
/** Forms the user chose to send without deflecting again this page view. */
const bypassedForms = new WeakSet<HTMLFormElement>()

function fieldValue(root: ParentNode, selector: string | undefined): string {
  if (!selector) return ''
  try {
    const el = root.querySelector(selector)
    if (!el) return ''
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value.trim()
    }
    if (el instanceof HTMLSelectElement) {
      return el.value.trim()
    }
    return (el.textContent || '').trim()
  } catch {
    return ''
  }
}

function buildQuestion(form: HTMLFormElement, subjectSelector?: string, bodySelector?: string): string {
  const subject = fieldValue(form, subjectSelector)
  const body = fieldValue(form, bodySelector)
  if (subject && body) return `${subject}\n\n${body}`
  if (body) return body
  if (subject) return subject
  return ''
}

function unbindDeflectorForm() {
  activeCleanup?.()
  activeCleanup = null
  activeContinueToSupport = null
  pendingForm = null
  bypassNextSubmit = false
}

/**
 * Bind a support form so submit opens the deflector instead of posting
 * immediately. Returns cleanup and a `continueToSupport` helper that
 * submits the pending form without re-intercepting.
 */
export function bindDeflectorForm(options: DeflectorBindOptions): {
  cleanup: () => void
  continueToSupport: () => void
} {
  unbindDeflectorForm()

  const { formSelector, subjectSelector, bodySelector, onQuestion } = options

  const handler = (event: Event) => {
    if (bypassNextSubmit) {
      bypassNextSubmit = false
      return
    }
    const target = event.target
    if (!(target instanceof HTMLFormElement)) return
    if (!target.matches(formSelector)) return
    if (bypassedForms.has(target)) return

    const question = buildQuestion(target, subjectSelector, bodySelector)
    if (question.length < 5) return

    event.preventDefault()
    event.stopPropagation()
    pendingForm = target
    onQuestion(question)
  }

  document.addEventListener('submit', handler, true)

  const continueToSupport = () => {
    const form = pendingForm
    pendingForm = null
    if (!form) return
    bypassedForms.add(form)
    bypassNextSubmit = true
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit()
    } else {
      form.submit()
    }
  }

  activeCleanup = () => document.removeEventListener('submit', handler, true)
  activeContinueToSupport = continueToSupport

  return {
    cleanup: unbindDeflectorForm,
    continueToSupport,
  }
}

/** Drop any pending intercept without submitting (e.g. user dismissed the panel). */
export function clearDeflectorPendingForm() {
  pendingForm = null
}
