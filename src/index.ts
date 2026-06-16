/**
 * Public ESM entry for `@knoku/widget`.
 *
 * Re-exports the mount API and the typed widget surface. Consumers using the
 * CDN script tag (`dist/widget.js`) do not import from here — that bundle is
 * driven by `loader.ts` and self-initializes from `data-*` attributes.
 */
export {
  DEFAULT_WIDGET_CONFIG,
  createWidgetConfig,
  destroyKnokuWidget,
  fetchWidgetConfig,
  initKnokuWidget,
  mountKnokuWidget,
} from './sdk'
export { mount } from './widget'
export type {
  KnokuWidgetInitOptions,
  KnokuWidgetRuntime,
  Message,
  SSEEvent,
  SourceRef,
  StatusStep,
  WidgetConfig,
} from './types'
