# Knoku Widget — Architecture & Contribution Guide

Embeddable chat widget (`@knoku/widget`). Runs on **customer sites**, not Knoku-owned pages — every assumption common to a host application (Next.js, proxy, cookies, state libs) is wrong here. All commands run from the repo root.

This guide covers stack constraints, the Shadow DOM contract, the embed API surface, and contribution playbooks.

## Stack (do not substitute)

- **Preact 10.29** — `preact` + `preact/hooks`. **No `preact/compat`**. React ecosystem libraries do not work here; do not install `react-*` and try to alias.
- **Vite 8** + `@preact/preset-vite` — one `vite.config.ts`, two targets driven by `KNOKU_BUILD_TARGET` env var (see Build targets).
- **TypeScript 6** — types emitted by `tsc -p tsconfig.build.json` (separate step, not Vite).
- **Zero runtime deps besides `preact`** — no signals, no fetch wrapper, no state library. Pure hooks + native `fetch` + manual SSE parsing.
- **Shadow DOM** for style isolation; CSS is a single template literal in `src/widget.tsx`, not a `.css` file.
- **No test framework today** — open an issue before adding one so we can align on choice and scope.

Do **not** add any of:

- `preact/compat`, `react`, `react-dom`, `@preact/signals`, `zustand`, any state lib
- `@tanstack/react-query`, `swr` — there is no cacheable read path; `useChat` streams
- `styled-components`, `emotion`, CSS-in-JS runtime — bundle must stay tiny
- A CSS file + `import './style.css'` — keep CSS inline in `widget.tsx` so Shadow DOM injection stays atomic
- Anything that ships React runtime
- A framework for embedding (LitElement, Stencil) — the mount API is intentionally ~30 lines

Before adding any dependency, open an issue first. Each new byte ships to every customer site.

## Commands

```
npm run dev              # Vite dev server (see caveat below)
npm run build            # runs build:loader + build:sdk + build:types — all three must succeed
npm run build:loader     # IIFE dist/widget.js
npm run build:sdk        # ESM dist/index.js (preact externalized)
npm run build:types      # tsc -> dist/*.d.ts
npm run preview          # preview built output
```

**Never run only one `build:*` sub-step before releasing.** If you skip `build:types`, npm consumers get stale `.d.ts`; if you skip `build:sdk`, `@knoku/widget` imports break; if you skip `build:loader`, the CDN script is stale.

No `index.html` at widget root today — `npm run dev` is useful for type-checking and Vite plumbing, but real integration testing requires a host page that loads `dist/widget.js`.

## Directory layout

```
src/
  loader.ts                   IIFE entry. Reads supported data-* attributes,
                              calls initKnokuWidget.
  index.ts                    ESM package entry. Re-exports sdk.
  sdk.ts                      initKnokuWidget, mountKnokuWidget, fetchWidgetConfig,
                              createWidgetConfig, DEFAULT_WIDGET_CONFIG, cleanup, injectNavbarTrigger
  widget.tsx                  <Widget/> Preact component + mountWithCleanup + mount +
                              the full CSS template literal (scroll to bottom, ~line 215+)
  types.ts                    WidgetConfig, KnokuWidgetRuntime, KnokuWidgetInitOptions,
                              Message, SSEEvent, SourceRef, StatusStep
  theme.ts                    detectHostTheme, watchTheme (prefers-color-scheme + host classes)
  hooks/useChat.ts            SSE streaming, session id (ref + state), AbortController
  components/ChatWindow.tsx   side panel UI (messages, input, image upload)
  components/Message.tsx      single-message renderer + feedback thumbs
vite.config.ts                target branching on KNOKU_BUILD_TARGET
tsconfig.json                 dev tsconfig
tsconfig.build.json           emits .d.ts to dist/
```

- Don't split `widget.tsx` — keeping the component + mount + CSS in one file keeps the bundle map legible.
- Don't create a `styles/` directory or a separate `.css` file. CSS lives inline.
- Don't add a `public/` directory. The widget is pure JS; there are no static assets.

## Embed contract

Three entry paths into `sdk.ts:initKnokuWidget`.

**Path A — `<script>` tag** (CDN, most customers). Loader reads these supported attributes:

| Attribute | Required | Maps to option |
|---|---|---|
| `data-project-id` | **yes** — loader logs error and bails if missing | `projectId` |
| `data-primary-color` | no | `primaryColor` shorthand for both light/dark |
| `data-primary-color-light` | no | `primaryColorLight` |
| `data-primary-color-dark` | no | `primaryColorDark` |
| `data-greeting` | no | `greeting` |
| `data-launcher-text` | no | `launcherText` |
| `data-launcher-subtitle` | no | `launcherSubtitle` |
| `data-launcher-align` | no | `launcherAlign` |
| `data-launcher-hidden` | no | `launcherHidden` |
| `data-open-selector` | no | `openSelector` |
| `data-suggested-questions` | no | `suggestedQuestions` CSV |
| `data-language` | no | `language` |
| `data-consent-required` | no | `consent.required` |

Customer-facing config lives in the host page, not the Knoku dashboard. Use `__KNOKU_CONFIG__` or npm options for values that do not fit cleanly in attributes, such as `componentStyles`, long consent copy, or suggested questions containing commas.

**Path B — preset global**. Before `widget.js` loads, the host page can set `window.__KNOKU_CONFIG__ = { projectId, ... }` with any `KnokuWidgetInitOptions` field. Loader picks it up and calls `initKnokuWidget(presetConfig)` directly, bypassing the `<script>` attribute read. Useful for per-host overrides or when a docs framework injects config dynamically at build time.

**Path C — npm**. `import { initKnokuWidget } from '@knoku/widget'` + call programmatically. Same option shape as path B, typed as `KnokuWidgetInitOptions` in `src/types.ts`. `brandingRequired` is intentionally absent from `KnokuWidgetInitOptions` — it is plan-controlled and may not be set client-side.

All three paths converge on `initKnokuWidget(options)` → `fetchWidgetConfig` (remote merge) → `mountWithCleanup(shadow, config)`.

## Shadow DOM contract

This is the most-often-broken rule. Read before editing `sdk.ts` or `widget.tsx`.

1. `sdk.ts:initKnokuWidget` creates `<div id="knoku-widget">`, appends to `document.body`, calls `host.attachShadow({ mode: 'open' })`, hands the shadow root to `mountWithCleanup`.
2. `widget.tsx:mountWithCleanup` appends `<style>` (with `textContent = CSS`) and `<div class="knoku-root">` **into the shadow root**, then `preact.render(<Widget/>, root)`.
3. Mode is **`'open'`** intentionally — host pages can inspect for debugging. Don't change to `'closed'` without a reason.
4. `mountWithCleanup` stores `__knokuCleanup__` on the shadow root; re-invocation destroys the previous instance safely. Re-mounting is a supported flow (theme change, config refresh).

One **intentional** DOM mutation outside the shadow — **do not remove when "fixing" Shadow DOM purity**:

- `<style id="knoku-page-push">` injected into `document.head` pushes `body { margin-right: 440px }` when the panel opens so the chat doesn't overlap site content. It's cleaned up on `destroy()`.

The widget does **not** inject buttons (or anything else) into the host navbar or header. Host sites own trigger placement — they call `window.Knoku.open() / toggle()` from their own button, dispatch the `knoku:*` CustomEvents, or use `data-open-selector` so the loader binds a click listener to their own element.

Everything else — text, icons, inputs, animations — must live inside Shadow DOM.

## Backend integration

The widget talks to backend **directly** via `config.apiUrl`. It does **not** use the Knoku dashboard's `/api/backend` proxy (that proxy lives in Next.js and isn't available from customer sites).

Endpoints:

- `GET ${apiUrl}/api/v1/config/{projectId}` — server-controlled widget status. Response: `{ active, branding_required, disabled_reason }`. Customer-facing config does not come from the dashboard or backend. `active: false` → `fetchWidgetConfig` returns `null` and the widget does not mount. Gating lives on the backend: if `projects.status` is `draft` or `paused`, the server returns `active: false` regardless of `WidgetConfig`. `branding_required` is computed at runtime from the org's plan policy, not stored.
- `POST ${apiUrl}/api/v1/chat` — SSE. Body shape:
  ```json
  { "project_id": "proj_...", "question": "...", "session_id": null | "sess_...", "image": "data:image/png;base64,..." }
  ```
  `image` is **optional**; when present it's a base64 **data URL** (not a Blob, not FormData — the whole request stays JSON). Host validates 5 MB max, `image/png|jpeg|jpg|webp` before encoding (see `ChatWindow.tsx`).
- `POST ${apiUrl}/api/v1/feedback` — thumbs up/down on a message.

### SSE wire format

Backend emits simplified SSE: only `data:` lines, no `event:` or `id:` lines, terminated with `\n\n`. Each `data:` payload is a single JSON object matching `SSEEvent` in `src/types.ts`.

```
data: {"type":"tool_start","tool_name":"search_documents","tool_args":"..."}

data: {"type":"tool_result","tool_name":"search_documents","text":"..."}

data: {"type":"thinking","text":"..."}

data: {"type":"text","text":"Hello "}

data: {"type":"text","text":"world"}

data: {"type":"sources","sources":[{"doc_id":"...","path":"...","title":"...","lines":"12-18"}]}

data: {"type":"done","session_id":"sess_..."}
```

All event types (from `SSEEvent` union): `tool_start`, `tool_result`, `thinking`, `text`, `sources`, `error`, `done`. The `done` event always carries the authoritative `session_id` — persist it into the `useChat` ref for the next turn.

Widget parser: `response.body.getReader()` + `TextDecoder` + `buffer.split('\n')` + strip `data: ` prefix + `JSON.parse`. Blank lines produce empty strings that are filtered out. Don't switch to EventSource — the chat is a **POST-body** streaming response, which EventSource can't issue. If you need retry or caching, build it minimally inside `useChat`; don't introduce a fetch wrapper library.

## Security model — no API key, ever

The widget ships inside customer HTML; anything it knows is public. Consequences that are enforced as rules:

- **Never** send an `Authorization` header, API key, or bearer token from the widget. Do not read `process.env.*_SECRET` anywhere in `src/`.
- `project_id` is public. It appears in `<script data-project-id>` that any visitor can view-source.
- Abuse / origin protection lives on the **backend** via per-project `AllowedDomains` (exact host match, port-aware when configured, `Origin` → `Referer` fallback).
- Per-project rate limiting + message-count metering are also backend concerns; do not duplicate in the widget.

If a feature needs authentication (logged-in user identification, personalization), the design is to pass a short-lived, backend-issued token via script attribute — open an issue to discuss before implementing; none exists today.

## Config merge priority

`sdk.ts:fetchWidgetConfig` merges local config with server status — **do not reintroduce dashboard config**:

1. **Local** (`data-*`, preset global, or `initKnokuWidget` options) plus defaults (`DEFAULT_WIDGET_CONFIG`)
2. **Remote** (`active`, `branding_required`, `disabled_reason`) only

The remote config fetch is required before mounting so backend domain gating can block unauthorized origins and enforce plan branding.

## Runtime API (host-site contract)

Once mounted, the widget exposes a stable surface host pages depend on — changing these is a breaking change:

- `window.Knoku.open() / close() / toggle()` — side panel visibility
- `window.Knoku.ask(question: string)` — opens panel + submits question
- `window.dispatchEvent(new CustomEvent('knoku:open' | 'knoku:close' | 'knoku:toggle' | 'knoku:ask', { detail: { question? } }))` — same effects, event form
- `window.addEventListener('knoku:response', (e) => ...)` — fired on answer complete with `detail: { answer, sources }`

Host integrations (docs frameworks, custom triggers) bind to these. Don't rename, don't namespace, don't replace with Preact Context. The events layer is the public API.

## Build targets

One `vite.config.ts`, branched on `process.env.KNOKU_BUILD_TARGET` (line: `const target = process.env.KNOKU_BUILD_TARGET || 'loader'`):

| Target | Entry | Output | Format | Preact | How invoked |
|---|---|---|---|---|---|
| `loader` | `src/loader.ts` | `dist/widget.js` | IIFE | bundled in (`inlineDynamicImports`) | `npm run build:loader` (sets env) **or** plain `vite build` with env unset — both produce the same output because of the `|| 'loader'` fallback |
| `sdk` | `src/index.ts` | `dist/index.js` | ESM | externalized (`preact`, `preact/hooks`, `preact/jsx-runtime`) | `npm run build:sdk` only — no implicit default, env must be set |

If you're ever unsure which target a `dist/widget.js` came from, check the bundle header or rebuild explicitly with the named script. Don't rely on "default" — prefer the explicit sub-command.

Approximate gzip sizes: `widget.js` **~25 KB**, `index.js` **~19 KB**. No CI budget enforces this — keep an eye on it when adding features. Adding one mid-size dep can easily double gzip.

`cssCodeSplit: false` — guarantees a single CSS payload inside the IIFE. Don't enable splitting.

## State management

Pure Preact hooks. Hot rules:

- `useChat` is the only stateful hook; extend it, don't fork.
- **Ref + state dual pattern.** When a value must be read inside an async closure (SSE reader loop, AbortController callback, `setTimeout`) **and** also drive the render, keep a `useRef` mirror alongside the `useState`. Write both on update; read from `ref.current` inside the closure so a stale `useState` snapshot captured at `useCallback` definition doesn't reappear. Today this applies to `sessionId` (read inside the stream loop on every turn). `messages` uses the functional `setMessages(prev => ...)` form instead — either pattern is fine, but don't mix them within one piece of state.
- Session is **in-memory only** — page reload starts a new conversation. Cross-reload persistence is a feature we haven't built; don't silently add `localStorage` for it.
- No Context providers. Pass config via props all the way down — the component tree is shallow.

## Theming

Three independent knobs — don't collapse them:

- **`config.theme`** = `'auto' | 'light' | 'dark'`. Dashboard has no theme selector. Default `auto` uses `theme.ts:detectHostTheme` (host `<html class="dark">`, `data-theme`, `prefers-color-scheme`) and `watchTheme` to follow host changes live. `light` / `dark` are programmatic-only overrides.
- **Default token set** lives in the `widget.tsx` CSS template literal. There is no named palette system.
- **`config.primaryColorLight` + `config.primaryColorDark`** = two CSS colors. `applyTheme(dark)` in `widget.tsx:mountWithCleanup` writes the active one to `--knoku-primary-accent`, `--primary`, and `--focus-ring` on the widget root whenever the resolved theme changes.

Don't hardcode colors in component files. For theme-dependent color, use CSS vars via `var(--name)`. For the accent, use `var(--knoku-primary-accent)`.

## Playbooks

**Add a new widget config option**
1. Add field to `WidgetConfig` (and `KnokuWidgetInitOptions` if caller-settable) in `src/types.ts`.
2. Add default to `DEFAULT_WIDGET_CONFIG` in `sdk.ts`.
3. Add to `createWidgetConfig` merge logic (caller > default) in `sdk.ts`.
4. If it is customer-facing and approved for script usage, add parser support in `loader.ts`.
5. Consume inside `<Widget>` / `ChatWindow` via the existing `config` prop chain.

**Add a new chat SSE event type**
1. Extend `SSEEvent` union in `src/types.ts`.
2. Add a `case` branch inside the SSE parse loop in `hooks/useChat.ts`.
3. Backend must emit a matching event — coordinate via issue before merging widget-side changes that depend on a new event.

**Expose a new runtime API method**
1. Add method to `KnokuWidgetRuntime` type in `types.ts`.
2. Wire it up inside `mountWithCleanup` runtime object and as a `window.Knoku.*` binding.
3. Add a `CustomEvent` name (`knoku:<action>`) and listener in the `<Widget>` effect in `widget.tsx`.
4. Document it in README under "Programmatic controls".

**Ship a release** (maintainers only)
1. `npm run build` — all three sub-steps (`loader` + `sdk` + `types`) must succeed; don't publish partial output. (`prepublishOnly` enforces this on `npm publish`.)
2. Check gzip sizes: `gzip -c dist/widget.js | wc -c` and same for `dist/index.js`. Flag in the PR if the delta is >10% vs. the previous release.
3. Bump `version` in `package.json` (semver — this is a public package consumed by customer sites).
4. Publish to npm: `npm publish` (scope access is set in `publishConfig`).
5. CDN upload — `dist/widget.js` ships to the CDN origin. The exact host and purge command are maintainer infrastructure and not part of this repo.

## Do / Don't

- **Don't** install any `react-*` library. There's no `preact/compat` alias.
- **Don't** add an API key, session token, or `Authorization` header to widget requests. Security is origin-based, enforced server-side.
- **Don't** remove the `knoku-page-push` `<style>` — it's the one intentional host-DOM mutation.
- **Don't** mutate host DOM (inject buttons, wrap search inputs, etc.). Host sites own trigger placement and call `window.Knoku.*`.
- **Don't** send images as Blob / FormData — chat body stays JSON, `image` is a base64 data URL string (5 MB cap).
- **Don't** reintroduce named palettes; the default token set lives in `widget.tsx` and accent colors flow through CSS vars.
- **Don't** switch to EventSource for chat streaming. POST-body streaming requires fetch + reader.
- **Don't** route widget requests through Knoku's Next.js `/api/backend` proxy — customer sites can't reach it.
- **Don't** add persistence (localStorage, cookies) silently. Session-in-memory is the current contract.
- **Don't** change Shadow DOM mode from `'open'` to `'closed'`.
- **Don't** split CSS out of `widget.tsx` into a separate file — single template literal is required for the IIFE bundle.
- **Don't** skip a `build:*` sub-step before publish. All three must run.
- **Do** extend `useChat` instead of forking.
- **Do** respect config merge priority: local + defaults, with remote used only for server-controlled status/branding.
- **Do** keep the `window.Knoku` + `knoku:*` CustomEvent surface stable — it's the public host-site API.
- **Do** check gzip bundle delta after adding dependencies or features; the widget is paid for by every customer pageload.
