import { describe, expect, it } from 'vitest'
import { cleanDocumentTitle, documentDisplaySubtitle } from './doc-display'

describe('cleanDocumentTitle', () => {
  it('strips Mintlify permalink links and escapes', () => {
    expect(
      cleanDocumentTitle(
        '4\\. Install the Widget [Permalink for this section](https://docs.knoku.com/overview/get-started#4-install-the-widget)',
      ),
    ).toBe('4. Install the Widget')
  })

  it('prefers url_path over internal crawl paths', () => {
    expect(documentDisplaySubtitle('/widget#get-started', 'crawl/d397ab34316817f1.md')).toBe(
      '/widget#get-started',
    )
    expect(documentDisplaySubtitle(undefined, 'crawl/abc.md')).toBeNull()
  })
})
