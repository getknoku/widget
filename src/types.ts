/**
 * Public type surface for the Knoku widget.
 *
 * Covers the chat wire format (`SSEEvent`, `SourceRef`, `Message`), the
 * widget configuration shape (`WidgetConfig`, `KnokuWidgetInitOptions`),
 * and the runtime API (`KnokuWidgetRuntime`, `window.Knoku`).
 */

/** Server-Sent Event payload sent by the chat backend. */
export interface SSEEvent {
  type: 'tool_start' | 'tool_result' | 'thinking' | 'text' | 'sources' | 'error' | 'done'
  text?: string
  tool_name?: string
  tool_args?: string
  sources?: SourceRef[]
  session_id?: string
}

/** Reference to a documentation chunk cited in an assistant answer. */
export interface SourceRef {
  doc_id: string
  path: string
  url_path?: string
  title: string
  /** Inclusive line range, e.g. `"12-18"`. */
  lines: string
}

/** Document selected for inspection inside an assistant tool step. */
export interface SelectedDocument {
  doc_id: string
  path: string
  title: string
}

/** Single visible step in the assistant's tool-use status strip. */
export interface StatusStep {
  icon: 'search' | 'read'
  text: string
  documents?: SelectedDocument[]
}

/** A user or assistant message rendered inside the chat panel. */
export interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: SourceRef[]
  steps?: StatusStep[]
  isStreaming?: boolean
  regenerateCount?: number
  image?: string
  thinking?: string
  thinkingDuration?: number
}

/** Consent screen copy and required flag. */
export interface ConsentConfig {
  required: boolean
  title: string
  disclaimer: string
  acceptText: string
  rejectText: string
}

/**
 * Resolved widget configuration after merging defaults, host options, and
 * remote server config. All fields are required at this point.
 */
export interface WidgetConfig {
  projectId: string
  apiUrl: string
  theme: 'auto' | 'light' | 'dark'
  primaryColorLight: string
  primaryColorDark: string
  greeting: string
  launcherText: string
  launcherSubtitle: string
  launcherAlign: 'bottom-right' | 'bottom-left'
  launcherHidden: boolean
  suggestedQuestions: string[]
  brandingRequired: boolean
  language: string
  consent: ConsentConfig
  componentStyles: Record<string, Record<string, string>>
}

/**
 * Caller-facing options for `initKnokuWidget()`. All fields except
 * `projectId` are optional and fall back to `DEFAULT_WIDGET_CONFIG`.
 */
export interface KnokuWidgetInitOptions {
  projectId: string
  apiUrl?: string
  theme?: 'auto' | 'light' | 'dark'
  /** Single value applied to both light and dark mode. Prefer the `-light`/`-dark` pair when you want different accents per theme. */
  primaryColor?: string
  primaryColorLight?: string
  primaryColorDark?: string
  greeting?: string
  launcherText?: string
  launcherSubtitle?: string
  launcherAlign?: 'bottom-right' | 'bottom-left'
  launcherHidden?: boolean
  openSelector?: string
  suggestedQuestions?: string[]
  language?: string
  consent?: Partial<ConsentConfig>
  componentStyles?: Record<string, Record<string, string>>
  hostId?: string
}

/**
 * Identity passed via `window.Knoku.identify()` to associate the anonymous
 * `knoku_web_id` cookie with a known user. Sent on subsequent chat requests.
 */
export interface WidgetUserIdentity {
  id?: string
  email?: string
  metadata?: Record<string, unknown>
}

/** Runtime API exposed on `window.Knoku` once the widget has mounted. */
export interface KnokuWidgetRuntime {
  open: () => void
  close: () => void
  toggle: () => void
  ask: (question: string) => void
  identify: (user: WidgetUserIdentity | null) => void
}

declare global {
  interface Window {
    Knoku?: KnokuWidgetRuntime
  }
}
