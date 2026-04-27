# Knoku Widget

Embeddable Knoku chat widget. The package supports two delivery modes:

- CDN / script tag: `dist/widget.js`
- npm / app integration: `@knoku/widget`

Full documentation: [docs.knoku.com/widget](https://docs.knoku.com/widget).

## CDN usage

```html
<script
  src="https://cdn.knoku.com/widget.js"
  data-project-id="YOUR_PROJECT_ID"
  data-greeting="How can I help?"
  data-launcher-text="Need help?"
  data-launcher-subtitle="Ask AI"
  data-primary-color-light="#6366f1"
  data-primary-color-dark="#818cf8"
  data-suggested-questions="How do I get started?,How does pricing work?"
  data-language="en"
  data-consent-required="true"
  data-consent-title="AI chat consent"
  data-consent-disclaimer="Questions may be processed to generate an answer."
  data-consent-accept-text="Continue"
  data-consent-reject-text="Cancel"
  async
></script>
```

The loader reads widget settings from `data-*` attributes, fetches `/api/v1/config/{projectId}` for server-controlled status and plan policy, and skips mounting when the project/widget is inactive or the current domain is not allowed.

Add a custom site button in addition to the default launcher:

```html
<button id="ask-ai">Ask AI</button>
<script
  src="https://cdn.knoku.com/widget.js"
  data-project-id="YOUR_PROJECT_ID"
  data-open-selector="#ask-ai"
  async
></script>
```

Add `data-launcher-hidden="true"` only if you want to hide the default bottom launcher.

Language defaults to browser detection and can be overridden with `data-language`.

## npm usage

```bash
npm install @knoku/widget
```

```ts
import { initKnokuWidget } from '@knoku/widget'

await initKnokuWidget({
  projectId: 'YOUR_PROJECT_ID',
})
```

Use the npm API for documented per-page overrides such as `greeting` and `language`.

If you already own the host Shadow DOM, use the lower-level mount API:

```ts
import { mountKnokuWidget, createWidgetConfig } from '@knoku/widget'

const host = document.getElementById('widget-host')
if (host) {
  const shadow = host.attachShadow({ mode: 'open' })
  mountKnokuWidget(
    shadow,
    createWidgetConfig({ projectId: 'YOUR_PROJECT_ID' })
  )
}
```

## Programmatic controls

After mount, the widget exposes `window.Knoku`:

```ts
window.Knoku.open()
window.Knoku.close()
window.Knoku.toggle()
window.Knoku.ask('How do I self-host?')
window.Knoku.identify({ id: 'user_123', email: 'user@example.com' })
```

## Build

```bash
npm run build
```

Build outputs:

- `dist/widget.js` - standalone script-tag loader bundle
- `dist/index.js` - ESM package entry
- `dist/*.d.ts` - TypeScript declarations

## Issues & Contributing

Report bugs or request features at [github.com/getknoku/widget/issues](https://github.com/getknoku/widget/issues).

## License

MIT — see [LICENSE](./LICENSE).
