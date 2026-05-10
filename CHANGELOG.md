# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/getknoku/widget/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/getknoku/widget/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/getknoku/widget/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/getknoku/widget/releases/tag/v0.1.0
