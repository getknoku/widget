/**
 * Public type surface for the Knoku widget.
 *
 * Covers the chat wire format (`SSEEvent`, `SourceRef`, `Message`), the
 * widget configuration shape (`WidgetConfig`, `KnokuWidgetInitOptions`),
 * and the runtime API (`KnokuWidgetRuntime`, `window.Knoku`).
 */

/** Server-Sent Event payload sent by the chat backend. */
export interface SSEEvent {
  type: 'tool_start' | 'tool_result' | 'thinking' | 'text' | 'text_replace' | 'truncate_text' | 'writer_start' | 'sources' | 'error' | 'done'
  text?: string
  tool_name?: string
  tool_args?: string
  sources?: SourceRef[]
  /**
   * Tags `sources` events as the retrieved set, cited subset, or M3+
   * tool-sourced refs. The widget only renders the `cited` payload; the
   * `retrieved` event is opt-in telemetry the dashboard consumes.
   * Absent on legacy backend builds — treat that case as `cited`.
   */
  source_role?: 'retrieved' | 'cited' | 'tool_output'
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
  url_path?: string
}

/** Single visible step in the assistant's tool-use status strip.
 * Deprecated — kept for back-compat; new agent flow uses `timeline`. */
export interface StatusStep {
  icon: 'search' | 'read'
  text: string
  documents?: SelectedDocument[]
}

/** Items in the assistant's chronological timeline. The agent path renders
 * these in insertion order so the user sees narration text and search
 * steps interleaved exactly as they happen. A single `search` item starts
 * with just the query; the count and documents fill in when the tool
 * returns, and the same row updates inline (no second row beneath). */
export type TimelineItem =
  | { kind: 'text'; text: string }
  | { kind: 'search'; query: string; narration?: string; count?: number; documents?: SelectedDocument[] }

/** A user or assistant message rendered inside the chat panel. */
export interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: SourceRef[]
  steps?: StatusStep[]
  timeline?: TimelineItem[]
  isStreaming?: boolean
  regenerateCount?: number
  image?: string
  thinking?: string
  thinkingDuration?: number
  /** True between the writer_start event and the first text chunk of the
   * writer's response — renders an animated dots indicator so the gap
   * between the last search step and the streaming answer doesn't look
   * like a freeze. */
  composing?: boolean
}

/**
 * A suggested question shown in the empty state. Either a plain string or
 * an object with an optional `icon` field.
 *
 * `icon` accepts:
 * - A built-in name from `ICON_NAMES` (e.g. `'rocket'`, `'card'`, `'key'`).
 * - Raw inner SVG content starting with `<` (npm path only — script-tag
 *   `data-suggested-questions` cannot carry SVG safely). Sanitized via
 *   `sanitizeIconSvg`; rejected content falls back to `sparkle`.
 *
 * Unknown built-in names also fall back to `sparkle`.
 */
export interface SuggestedQuestionConfig {
  text: string
  icon?: string
}
export type SuggestedQuestion = string | SuggestedQuestionConfig

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
  launcherIcon: string
  /** `pill` (default): compact chip. `card`: legacy two-line launcher with arrow. */
  launcherStyle: 'pill' | 'card'
  /** Icon placement in the pill launcher, or mark position in the card launcher. */
  launcherIconPosition: 'left' | 'right'
  /** When false, pill launcher renders label only (no mark). Card launcher always shows its mark. */
  launcherShowIcon: boolean
  layout: 'overlay' | 'push' | 'modal'
  suggestedQuestions: SuggestedQuestionConfig[]
  brandingRequired: boolean
  /**
   * Canonical host used to prefix relative `url_path` values when rendering
   * source links. Comes from the project's selected `allowed_domains` entry
   * (set in the dashboard). Empty string means the widget falls back to
   * `window.location.origin` — fine when widget runs on the same host as
   * the docs, wrong when it runs on a sibling host (apex vs subdomain).
   */
  primaryDomain: string
  /**
   * Plan + project setting controlled. When `true`, the widget exposes a
   * "Use MCP" popover so end-users can wire the docs into Claude Desktop /
   * Cursor / VS Code via Model Context Protocol. `mcpUrl` is the absolute
   * endpoint to connect to ({slug}.mcp.knoku.com/mcp).
   */
  mcpEnabled: boolean
  mcpUrl: string
  /**
   * Customer-owned Cloudflare Turnstile site key. Set by the backend when
   * the project's owner has configured Turnstile in the dashboard. Empty
   * string disables the gate — `useChat` / feedback POSTs skip token
   * issuance and the request goes out unauthenticated (legacy widget
   * behavior). See features/widget-auth-hardening/plan.md.
   */
  turnstileSiteKey: string
  language: string
  consent: ConsentConfig
  componentStyles: Record<string, Record<string, string>>
  /** When true, panel fills the host viewport (dashboard live preview iframe). */
  preview?: boolean
  /** Dashboard builder: which surface to show (launcher closed vs panel vs consent). */
  previewSurface?: 'launcher' | 'panel' | 'consent'
  /** `chat` (default) or `deflector` support-form intercept mode. */
  mode: 'chat' | 'deflector'
  /** Business-tier support form deflector from remote config. */
  deflectorEnabled: boolean
  formSelector: string
  subjectSelector: string
  bodySelector: string
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
  /**
   * Icon shown inside the launcher button's mark slot. Accepts a built-in
   * name from `ICON_NAMES` (default `'book-open'`) or raw inner SVG content
   * starting with `<` (npm path only — sanitized via `sanitizeIconSvg`).
   * Unknown names fall back to the default.
   */
  launcherIcon?: string
  /** `pill` (default) or `card` (legacy two-line launcher). */
  launcherStyle?: 'pill' | 'card'
  /** `left` or `right` — icon relative to launcher label. Default `right` for pill. */
  launcherIconPosition?: 'left' | 'right'
  /** Pill launcher only: set `false` to hide the mark (text-only chip). Default `true`. */
  launcherShowIcon?: boolean
  /** `overlay`: side panel. `push`: body margin. `modal` (default): centered dialog. */
  layout?: 'overlay' | 'push' | 'modal'
  openSelector?: string
  suggestedQuestions?: SuggestedQuestion[]
  language?: string
  consent?: Partial<ConsentConfig>
  componentStyles?: Record<string, Record<string, string>>
  hostId?: string
  /** Dashboard preview: project's canonical docs host for source links. */
  primaryDomain?: string
  preview?: boolean
  previewSurface?: 'launcher' | 'panel' | 'consent'
  /**
   * `chat` (default): floating launcher widget. `deflector`: intercepts a
   * support form submit and opens an inline docs search first.
   */
  mode?: 'chat' | 'deflector'
  /** CSS selector for the support form (required when mode=deflector). */
  formSelector?: string
  /** Optional field selectors within the form for subject and body text. */
  subjectSelector?: string
  bodySelector?: string
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
  /** Tear down the widget host, listeners, and page scroll lock. */
  destroy: () => void
}

declare global {
  interface Window {
    Knoku?: KnokuWidgetRuntime
  }
}
