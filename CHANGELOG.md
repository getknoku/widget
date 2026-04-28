# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/getknoku/widget/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/getknoku/widget/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/getknoku/widget/releases/tag/v0.1.0
