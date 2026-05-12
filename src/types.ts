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
  layout: 'overlay' | 'push'
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
  /**
   * Icon shown inside the launcher button's mark slot. Accepts a built-in
   * name from `ICON_NAMES` (default `'book-open'`) or raw inner SVG content
   * starting with `<` (npm path only — sanitized via `sanitizeIconSvg`).
   * Unknown names fall back to the default.
   */
  launcherIcon?: string
  /** `overlay` (default): panel açıldığında sayfa içeriği itilmez, panel üstüne biner. `push`: body'ye sağ kenardan margin verilir, sanki panel sayfaya gömülmüş gibi durur. */
  layout?: 'overlay' | 'push'
  openSelector?: string
  suggestedQuestions?: SuggestedQuestion[]
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
