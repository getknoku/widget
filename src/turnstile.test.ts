import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTurnstileHeaders, getTurnstileToken } from './turnstile'

type RenderOptions = {
  readonly callback?: (token: string) => void
  readonly 'error-callback'?: (errorCode?: string) => boolean | void
  readonly retry?: 'auto' | 'never'
  readonly 'retry-interval'?: number
}

describe('Turnstile token acquisition', () => {
  let renderOptions: RenderOptions | undefined

  beforeEach(() => {
    renderOptions = undefined

    vi.stubGlobal('document', {
      querySelector: () => ({}),
      createElement: () => ({ style: {} }),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    })
    vi.stubGlobal('window', {
      turnstile: {
        render: (_container: string | HTMLElement, options: RenderOptions) => {
          renderOptions = options
          return 'widget-id'
        },
        remove: vi.fn(),
        reset: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lets the Cloudflare client retry a failed challenge before resolving a token', async () => {
    const tokenPromise = getTurnstileToken('site-key', 'chat')

    await vi.waitFor(() => expect(renderOptions).toBeDefined())
    expect(renderOptions?.retry).toBe('auto')
    expect(renderOptions?.['retry-interval']).toBe(3_000)
    expect(renderOptions?.['error-callback']?.('600010')).toBe(false)

    renderOptions?.callback?.('verified-token')

    await expect(tokenPromise).resolves.toBe('verified-token')
  })

  it('does not allow a protected request to continue when token generation fails', async () => {
    const request = vi.fn()
    vi.stubGlobal('window', {
      turnstile: {
        render: () => {
          throw new Error('turnstile_render_failed')
        },
        remove: vi.fn(),
        reset: vi.fn(),
      },
    })

    const sendProtectedRequest = async (): Promise<void> => {
      const headers = await getTurnstileHeaders('site-key', 'chat')
      request(headers)
    }

    await expect(sendProtectedRequest()).rejects.toThrow('turnstile_render_failed')
    expect(request).not.toHaveBeenCalled()
  })
})
