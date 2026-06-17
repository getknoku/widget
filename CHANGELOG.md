# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.1] - 2026-06-17

### Changed
- Answer text paints directly from SSE `text` events again (removed the `requestAnimationFrame` smoothing buffer added in 0.3.1).

### Fixed
- Search-step row shows a spinner while in-flight and a compact “Found N relevant documents” label when done — no expandable retrieved-doc list under the chip (sources stay in the Sources dropdown).
- Legacy `steps[]` search rows use the same compact layout.

## [0.4.0] - 2026-06-16

### Added
- Support-form deflector mode (`data-mode="deflector"` plus `data-form-selector`, optional subject/body selectors). Intercepts form submit, opens an inline docs search first, then lets the visitor continue to the ticket form or mark the question resolved.
- `layout: 'modal'` — centered dialog with backdrop and scroll lock. Modal is the new default; `overlay` and `push` still work via `data-layout`.
- Image attachments in the composer (PNG/JPEG/WebP, 5 MB cap) sent as base64 on chat requests.
- One-click regenerate on the last assistant answer (once per turn).
- Panel widen toggle on overlay/push layouts; hidden in modal.
- Dashboard live-preview hooks (`preview`, `previewSurface`) for the widget builder iframe.

### Changed
- **Breaking:** default layout is `modal` (was `overlay` in 0.3.x). Embeds that relied on the side rail need `data-layout="overlay"` or `data-layout="push"`.
- Panel CSS rewritten around layout attributes (`data-knoku-layout`, modal example questions, deflector header copy).
- Scroll lock split into `modal` vs `panel` modes so fixed navbars don't jump when a modal opens.

### Fixed
- Deflector form handler is a module singleton — React Strict Mode remounts no longer stack listeners and re-open the modal on "Continue to support".
- Preview iframe could keep the panel visible after switching back to the launcher tab; the panel now unmounts when `previewSurface` is `launcher`.

## [0.3.4] - 2026-05-17

### Fixed
- Token issuance now uses `turnstile.render` on a fixed-position bottom-right `<div>` with `appearance: 'interaction-only'`, and reads the token from the `callback` option. The previous implementation called `turnstile.execute(undefined, { sitekey, action })`, which is not a real Cloudflare API — it returned `undefined`, so the `cf-turnstile-response` header was never attached and every chat request 403&rsquo;d. Each call renders a fresh widget and removes it after a single successful issuance. The container stays in the viewport so the visitor can complete the rare interactive challenge if Cloudflare's risk engine asks for one.

## [0.3.3] - 2026-05-17

### Fixed
- Turnstile script tag no longer sets `async`/`defer`. Cloudflare's `api.js` throws `Remove async/defer from the Turnstile api.js script tag before using turnstile.ready()` and refuses to initialise when these attributes are present, breaking token issuance on every chat request. The widget now polls `window.turnstile.execute` directly instead of calling `turnstile.ready()`, which removes the dependency on the attributes and keeps initialisation reliable on slower connections.

## [0.3.2] - 2026-05-17

### Added
- `WidgetConfig.turnstileSiteKey` read from `/api/v1/config/{projectId}` (`turnstile_site_key` field). When the project owner has configured a customer-owned Cloudflare Turnstile site key on the dashboard, the widget injects the Turnstile script and attaches a `cf-turnstile-response` header to every `/api/v1/chat` and `/api/v1/feedback` request. Empty value preserves the previous unauthenticated behavior.
- `src/turnstile.ts` module: idempotent script injection, ready-promise gate, 10s timeout, per-request token via `getTurnstileToken('chat' | 'feedback')`. Bundle size: +~1 KB gzip.

## [0.3.1] - 2026-05-17

### Added
- Streamed answer text now drains through a `requestAnimationFrame` smoothing buffer instead of painting each SSE chunk verbatim. Fast token streams render as a steady typewriter cadence rather than a single-frame dump.
- `search_documents` tool calls render the model-written narration sentence as a separate bubble before the search-step chip. Backends that emit the optional `narration` argument get a per-search "what we're looking up" line; older backends fall back to the generic "Searching..." label.

### Changed
- `sources` SSE event handler ignores payloads tagged `source_role` other than `cited`. Backends emitting both a retrieved and a cited set per turn no longer cause the source chip list to flicker through the retrieved superset. Untagged `sources` events (older backends) continue to render as before.

## [0.3.0] - 2026-05-13

### Added
- Chronological timeline rendering: narration, search steps, and the answer interleave in event order instead of stacking in fixed sections.
- Collapsed Sources dropdown that expands to a vertical link list (replaces the flat chip strip).
- Animated dots indicator while the assistant composes the final answer.
- Search step shows the query the model picked and updates inline with the result count on the same row.

### Fixed
- Client-side citation-block stripping silently truncated answers when the word "source" appeared inline (e.g. "source files to citation URLs"). Trailing-block cleanup moved server-side; the widget only normalises whitespace.
- Source chip label now uses the document title instead of whichever subsection won path-based deduplication.

## [0.2.3] - 2026-05-12

### Added
- `WidgetConfig.mcpEnabled` + `mcpUrl` read from `/api/v1/config/{projectId}` (`mcp_enabled` / `mcp_url` fields). When `mcpEnabled` is true, the chat header renders a "Use MCP" button with a popover: Cursor install deeplink, VS Code install deeplink, Claude CLI command copy, MCP URL copy.

## [0.2.2] - 2026-05-10

### Fixed
- Consent accept and chat send buttons hard-coded `color: #fff` on top of `var(--knoku-primary-accent)`. In dark mode the accent resolves to a near-white neutral, leaving white text on a near-white background. Switch to `color: var(--bg)` so the text contrast inverts with the theme: dark text in dark mode, white text in light mode.

## [0.2.1] - 2026-05-10

### Added
- `WidgetConfig.primaryDomain` consumed from the `/api/v1/config/{projectId}` response (`primary_domain` field). When set, source citation chips and inline markdown links with root-relative hrefs (`/foo/bar`) are prefixed with this host instead of `window.location.origin`. Lets the same project be embedded on a sibling host (e.g. apex marketing site) without breaking links to docs on a subdomain. Empty value preserves the previous behavior.

## [0.2.0] - 2026-05-10

### Added
- `data-launcher-icon` attribute and `launcherIcon` option. Built-in 25-icon set (`sparkle`, `rocket`, `book-open`, `key`, etc.) plus raw SVG support on the npm path (sanitized via `sanitizeIconSvg`).
- `data-layout` attribute and `layout` option (`overlay` | `push`). `overlay` is the new default; `push` adds a body right-margin to shift site content left.
- `data-suggested-questions` parses optional `|icon-name` per item (`Q1,Q2|rocket,Q3|key`). npm `suggestedQuestions` accepts `string | { text, icon }`.
- Component-style slots `launcher-subtitle`, `launcher-mark`, `launcher-send`.
- `padding-x`, `padding-y`, `margin-x`, `margin-y` shorthand properties in `componentStyles` expand to the corresponding axis pair.
- `data-theme`, `data-consent-title`, `data-consent-disclaimer`, `data-consent-accept-text`, `data-consent-reject-text` attributes (previously npm-only).
- Localized consent strings for `de`, `es`, `fr`, `it`, `pt`, `nl`, `ja`, `ko`, `zh`, `ru`, `cs`. Previously only `en` and `tr` had consent copy.
- `data-open-selector` binds matches added to the DOM later via `MutationObserver` (SPA navbars, async-rendered triggers).

### Changed
- **Breaking:** default `greeting` is empty string (was `'How can I help?'`). Empty greeting skips the greeting block.
- **Breaking:** default brand colors moved from indigo (`#6366f1` / `#818cf8`) to neutral (`#171717` / `#d4d4d4`). All 22 theme custom properties refreshed to a neutral palette.
- **Breaking:** default layout is `overlay`; the panel no longer pushes site content unless `layout: 'push'` is set.
- **Breaking:** minimum message length is 5 characters; submit and the send button are blocked below that.
- Bottom bar redesigned: rectangular card with 10px radius, neutral mark icon, outlined send icon, no translateY hover.
- Suggestion list moved out of the greeting block into its own region below the message list, vertical layout with icons.
- Consent screen accept and reject buttons swapped order (accept first).
- `assistant` UI string is `Ask AI` across all locales (was localized per language).
- Shadow root stops propagation of `keydown`, `keyup`, `keypress` so host page hotkeys don't fire while typing.
- `formatCopyText` builds source markdown links from `url_path` (origin-prefixed when relative); falls back to `path:lines`.

### Fixed
- Orphan `**` markers from incomplete LLM bold no longer leak into rendered messages or thinking output.
- Removed duplicate `.knoku-panel` CSS block at the end of `widget.css`.

## [0.1.1] - 2026-04-28

### Changed
- CSS source moved to `widget.css` and imported via Vite's `?inline` query for build-time minification (~3 KB raw, ~0.4 KB gzip savings).

### Fixed
- `Knoku.ask(question)` now holds the question across the consent screen and auto-submits after acceptance. Previously the question was discarded when consent had not been granted.
- Markdown link sanitizer rejects protocol-relative URLs (`//example.com`) so AI-generated links cannot become unintended external navigations.
- Boolean `data-*` attribute parser warns on invalid values instead of silently falling back to `false`, matching the behavior of other attribute parsers.

## [0.1.0] - 2026-04-28

### Added
- Initial public release.

[Unreleased]: https://github.com/getknoku/widget/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/getknoku/widget/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/getknoku/widget/compare/v0.3.4...v0.4.0
[0.3.4]: https://github.com/getknoku/widget/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/getknoku/widget/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/getknoku/widget/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/getknoku/widget/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/getknoku/widget/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/getknoku/widget/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/getknoku/widget/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/getknoku/widget/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/getknoku/widget/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/getknoku/widget/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/getknoku/widget/releases/tag/v0.1.0
