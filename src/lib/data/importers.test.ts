import { describe, expect, it } from 'vitest'

import { convertCosenseNotation, parseCosenseFile, type ImportParseResult } from './importers'

function makeFile(obj: unknown, name = 'cosense.json'): File {
  const text = JSON.stringify(obj)
  return new File([text], name, { type: 'application/json' })
}

describe('convertCosenseNotation', () => {
  it('converts [URL label] and [label URL] to Markdown links', () => {
    const flags = { hasExternalImage: false }
    expect(convertCosenseNotation('see [https://example.com Example]', flags)).toBe(
      'see [Example](https://example.com)'
    )
    expect(convertCosenseNotation('see [Example https://example.com]', flags)).toBe(
      'see [Example](https://example.com)'
    )
    expect(flags.hasExternalImage).toBe(false)
  })

  it('converts [image-url] to Markdown image and sets flag', () => {
    const flags = { hasExternalImage: false }
    const out = convertCosenseNotation('[https://example.com/pic.png]', flags)
    expect(out).toBe('![](https://example.com/pic.png)')
    expect(flags.hasExternalImage).toBe(true)
  })

  it('wraps bare non-image URLs with <>', () => {
    const flags = { hasExternalImage: false }
    expect(convertCosenseNotation('[https://example.com]', flags)).toBe('<https://example.com>')
    expect(flags.hasExternalImage).toBe(false)
  })

  it('keeps internal [page] links as-is', () => {
    const flags = { hasExternalImage: false }
    expect(convertCosenseNotation('refer [Some Page]', flags)).toBe('refer [Some Page]')
  })

  it('preserves leading indent and handles multiple brackets per line', () => {
    const flags = { hasExternalImage: false }
    const input = '\t [A https://a.com] and [B https://b.com]'
    expect(convertCosenseNotation(input, flags)).toBe(
      '\t [A](https://a.com) and [B](https://b.com)'
    )
  })

  it('leaves hashtags untouched', () => {
    const flags = { hasExternalImage: false }
    expect(convertCosenseNotation('hello #tag world', flags)).toBe('hello #tag world')
  })
})

describe('parseCosenseFile', () => {
  const baseExport = {
    name: 'testproj',
    displayName: 'Test Project',
    exported: 1775484706,
    users: [{ id: 'u1', name: 'user', displayName: 'U', email: 'u@example.com' }],
    pages: [
      {
        title: 'Page One',
        created: 1709627701,
        updated: 1718201140,
        id: 'p1',
        views: 10,
        image: 'https://example.com/thumb.png',
        lines: [
          { text: 'Page One', created: 1709627701, updated: 1709627701, userId: 'u1' },
          {
            text: 'see [https://example.com Example]',
            created: 1709627701,
            updated: 1709627701,
            userId: 'u1',
          },
          {
            text: '[https://example.com/pic.png]',
            created: 1709627701,
            updated: 1709627701,
            userId: 'u1',
          },
          { text: 'refer [Another Page]', created: 1709627701, updated: 1709627701, userId: 'u1' },
          { text: '#tag', created: 1709627701, updated: 1709627701, userId: 'u1' },
        ],
      },
      {
        title: 'Page Two',
        created: 1709627800,
        updated: 1718202000,
        id: 'p2',
        views: 3,
        lines: [
          { text: 'different first line', created: 1709627800, updated: 1709627800, userId: 'u1' },
          { text: 'hello', created: 1709627800, updated: 1709627800, userId: 'u1' },
        ],
      },
    ],
  }

  it('parses a minimal Cosense export into leaves', async () => {
    const file = makeFile(baseExport)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result).not.toBeNull()
    expect(result.source).toBe('cosense')
    expect(result.leaves).toHaveLength(2)
  })

  it('strips the duplicated first line that matches the page title', async () => {
    const file = makeFile(baseExport)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    const page1 = result.leaves[0]
    // First line 'Page One' must have been removed
    expect(page1.content.startsWith('Page One\n')).toBe(false)
    expect(page1.content.split('\n')[0]).toBe('see [Example](https://example.com)')

    const page2 = result.leaves[1]
    // Non-matching first line should stay
    expect(page2.content.startsWith('different first line')).toBe(true)
  })

  it('converts image URL bracket to Markdown image syntax', async () => {
    const file = makeFile(baseExport)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.leaves[0].content).toContain('![](https://example.com/pic.png)')
  })

  it('converts [URL label] to Markdown link', async () => {
    const file = makeFile(baseExport)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.leaves[0].content).toContain('[Example](https://example.com)')
  })

  it('keeps internal [page name] links untouched', async () => {
    const file = makeFile(baseExport)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.leaves[0].content).toContain('refer [Another Page]')
  })

  it('reports unsupported items including external images when present', async () => {
    const file = makeFile(baseExport)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.unsupported).toContain('user attribution and line timestamps')
    expect(result.unsupported).toContain('hashtags kept as plain text (no internal link target)')
    expect(result.unsupported).toContain('internal [page name] links kept as bracketed text')
    expect(result.unsupported).toContain('page thumbnails (page.image)')
    expect(result.unsupported).toContain('page views count')
    expect(result.unsupported).toContain(
      'external images (URLs preserved; host availability not guaranteed)'
    )
  })

  it('sets updatedAt to page.updated * 1000', async () => {
    const file = makeFile(baseExport)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.leaves[0].updatedAt).toBe(1718201140 * 1000)
    expect(result.leaves[1].updatedAt).toBe(1718202000 * 1000)
  })

  it('returns null for non-Cosense JSON (SimpleNote shape)', async () => {
    const file = makeFile(
      {
        activeNotes: [{ id: 'a', content: 'hello', lastModified: '2024-01-01T00:00:00Z' }],
      },
      'simplenote.json'
    )
    const result = await parseCosenseFile(file)
    expect(result).toBeNull()
  })

  it('returns null when .json extension is missing', async () => {
    const f = new File([JSON.stringify(baseExport)], 'cosense.txt')
    const result = await parseCosenseFile(f)
    expect(result).toBeNull()
  })
})
