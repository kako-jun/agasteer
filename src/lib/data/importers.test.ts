import { describe, expect, it } from 'vitest'

import JSZip from 'jszip'

import {
  convertCosenseNotation,
  parseCosenseFile,
  parseGoogleKeepFile,
  parseSimpleNoteFile,
  processImportFile,
  applyImportedAttachments,
  type ImportParseResult,
} from './importers'

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

  it('skips a page whose lines array is empty (no leaf produced)', async () => {
    const exp = {
      ...baseExport,
      pages: [
        { title: 'Empty', created: 1, updated: 2, id: 'e', views: 0, image: null, lines: [] },
        baseExport.pages[1],
      ],
    }
    const file = makeFile(exp)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.leaves).toHaveLength(1)
    expect(result.leaves[0].title).toBe('Page Two')
    expect(result.skipped).toBeGreaterThanOrEqual(1)
  })

  it('skips a page whose texts are all whitespace/empty', async () => {
    const exp = {
      ...baseExport,
      pages: [
        {
          title: 'BlankOnly',
          created: 1,
          updated: 2,
          id: 'b',
          views: 0,
          image: null,
          lines: [
            { text: 'BlankOnly', created: 1, updated: 1, userId: 'u1' },
            { text: '   ', created: 1, updated: 1, userId: 'u1' },
            { text: '', created: 1, updated: 1, userId: 'u1' },
          ],
        },
        baseExport.pages[1],
      ],
    }
    const file = makeFile(exp)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.leaves.find((l) => l.title === 'BlankOnly')).toBeUndefined()
    expect(result.skipped).toBeGreaterThanOrEqual(1)
  })

  it('leaves updatedAt undefined when page.updated is missing', async () => {
    const exp = {
      ...baseExport,
      pages: [
        {
          title: 'NoUpdated',
          created: 1,
          id: 'n',
          lines: [
            { text: 'NoUpdated', created: 1, updated: 1, userId: 'u1' },
            { text: 'content', created: 1, updated: 1, userId: 'u1' },
          ],
        },
      ],
    }
    const file = makeFile(exp)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.leaves).toHaveLength(1)
    expect(result.leaves[0].updatedAt).toBeUndefined()
  })

  it('uses fallback title when page.title is missing', async () => {
    const exp = {
      ...baseExport,
      pages: [
        {
          created: 1,
          updated: 2,
          id: 'x',
          lines: [{ text: 'body', created: 1, updated: 1, userId: 'u1' }],
        },
      ],
    }
    const file = makeFile(exp)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.leaves).toHaveLength(1)
    expect(typeof result.leaves[0].title).toBe('string')
    expect(result.leaves[0].title.length).toBeGreaterThan(0)
  })

  it('trims trailing punctuation from URL in bracket notation', async () => {
    const flags = { hasExternalImage: false }
    expect(convertCosenseNotation('see [https://ex.com, label]', flags)).toBe(
      'see [label](https://ex.com)'
    )
    expect(convertCosenseNotation('see [label https://ex.com.]', flags)).toBe(
      'see [label](https://ex.com)'
    )
  })

  it('strips first line even with trailing whitespace differences from title', async () => {
    const exp = {
      ...baseExport,
      pages: [
        {
          title: 'Spaced',
          created: 1,
          updated: 2,
          id: 's',
          lines: [
            { text: 'Spaced   ', created: 1, updated: 1, userId: 'u1' },
            { text: 'body line', created: 1, updated: 1, userId: 'u1' },
          ],
        },
      ],
    }
    const file = makeFile(exp)
    const result = (await parseCosenseFile(file)) as ImportParseResult
    expect(result.leaves[0].content.startsWith('body line')).toBe(true)
  })
})

describe('format auto-detection (parseCosenseFile / parseGoogleKeepFile / parseSimpleNoteFile)', () => {
  it('Cosense JSON is detected only by parseCosenseFile', async () => {
    const cosense = {
      name: 'p',
      exported: 1,
      pages: [
        {
          title: 'T',
          created: 1,
          updated: 2,
          id: 'a',
          lines: [{ text: 'body', created: 1, updated: 1, userId: 'u' }],
        },
      ],
    }
    const file = new File([JSON.stringify(cosense)], 'cosense.json', { type: 'application/json' })
    const cs = await parseCosenseFile(file)
    const gk = await parseGoogleKeepFile(file)
    const sn = await parseSimpleNoteFile(file)
    expect(cs).not.toBeNull()
    expect(gk).toBeNull()
    // SimpleNote parser requires activeNotes array; Cosense JSON lacks it -> null
    expect(sn).toBeNull()
  })

  it('SimpleNote JSON is detected as SimpleNote, not Cosense', async () => {
    const sn = {
      activeNotes: [{ id: 'a', content: 'hello', lastModified: '2024-01-01T00:00:00Z' }],
    }
    const file = new File([JSON.stringify(sn)], 'sn.json', { type: 'application/json' })
    const csRes = await parseCosenseFile(file)
    const snRes = await parseSimpleNoteFile(file)
    expect(csRes).toBeNull()
    expect(snRes).not.toBeNull()
    expect(snRes?.source).toBe('simplenote')
  })

  it('Google Keep single JSON is detected as Keep, not Cosense', async () => {
    const keep = {
      color: 'DEFAULT',
      isTrashed: false,
      isArchived: false,
      isPinned: false,
      title: 'Keep Note',
      textContent: 'hello',
      userEditedTimestampUsec: 1653870913735000,
    }
    const file = new File([JSON.stringify(keep)], 'keep.json', { type: 'application/json' })
    const csRes = await parseCosenseFile(file)
    const gkRes = await parseGoogleKeepFile(file)
    expect(csRes).toBeNull()
    expect(gkRes).not.toBeNull()
    expect(gkRes?.source).toBe('google-keep')
  })
})

// ============================================
// #249: インポート添付の取り込み（Keep zip → 解決 → アップロード → 記法追記）
// ============================================

/** i18n 素通し（キーと values をそのまま埋め込んで assert 可能にする） */
function passthroughTranslate(key: string, options?: { values?: Record<string, any> }): string {
  return options?.values ? `${key} ${JSON.stringify(options.values)}` : key
}

async function makeKeepZip(
  notes: Array<Record<string, unknown>>,
  binaries: Record<string, Uint8Array> = {}
): Promise<File> {
  const zip = new JSZip()
  notes.forEach((note, i) => {
    zip.file(`Takeout/Keep/note-${i}.json`, JSON.stringify(note))
  })
  for (const [path, data] of Object.entries(binaries)) {
    zip.file(path, data)
  }
  const buffer = await zip.generateAsync({ type: 'arraybuffer' })
  return new File([buffer], 'takeout.zip', { type: 'application/zip' })
}

const KEEP_NOTE_WITH_ATTACHMENT = {
  color: 'DEFAULT',
  isTrashed: false,
  isArchived: false,
  isPinned: false,
  title: 'Photo note',
  textContent: 'see photo',
  attachments: [{ filePath: 'photo.png', mimetype: 'image/png' }],
  userEditedTimestampUsec: 1653870913735000,
}

describe('Google Keep zip の添付解決（#249）', () => {
  it('attachments[].filePath を zip 内のファイルに解決して leaf.attachments に載せる', async () => {
    const file = await makeKeepZip([KEEP_NOTE_WITH_ATTACHMENT], {
      'Takeout/Keep/photo.png': new Uint8Array([1, 2, 3]),
    })
    const result = await parseGoogleKeepFile(file)
    expect(result).not.toBeNull()
    expect(result!.leaves).toHaveLength(1)
    const attachments = result!.leaves[0].attachments
    expect(attachments).toHaveLength(1)
    expect(attachments![0].name).toBe('photo.png')
    expect(attachments![0].mimeType).toBe('image/png')
    expect(new Uint8Array(attachments![0].data)).toEqual(new Uint8Array([1, 2, 3]))
    // 解決できたので unsupported にはならない
    expect(result!.unsupported).not.toContain('attachments/images')
  })

  it('本文が空で添付だけのノート（画像メモ）もスキップせず取り込む', async () => {
    const imageOnly = { ...KEEP_NOTE_WITH_ATTACHMENT, title: 'Image only', textContent: '' }
    const file = await makeKeepZip([imageOnly], {
      'Takeout/Keep/photo.png': new Uint8Array([9]),
    })
    const result = await parseGoogleKeepFile(file)
    expect(result!.leaves).toHaveLength(1)
    expect(result!.skipped).toBe(0)
    expect(result!.leaves[0].attachments).toHaveLength(1)
  })

  it('zip 内に実体が無い添付は unsupported 扱い（leaf は本文だけで取り込む）', async () => {
    const file = await makeKeepZip([KEEP_NOTE_WITH_ATTACHMENT])
    const result = await parseGoogleKeepFile(file)
    expect(result!.leaves).toHaveLength(1)
    expect(result!.leaves[0].attachments).toBeUndefined()
    expect(result!.unsupported).toContain('attachments/images')
  })

  it('単体 JSON（zip でない）は解決手段が無いので従来どおり unsupported', async () => {
    const file = new File([JSON.stringify(KEEP_NOTE_WITH_ATTACHMENT)], 'keep.json', {
      type: 'application/json',
    })
    const result = await parseGoogleKeepFile(file)
    expect(result!.leaves).toHaveLength(1)
    expect(result!.leaves[0].attachments).toBeUndefined()
    expect(result!.unsupported).toContain('attachments/images')
  })
})

describe('processImportFile と applyImportedAttachments（#249: 確定後アップロード）', () => {
  const baseOptions = {
    existingNotesCount: 0,
    existingLeavesMaxOrder: -1,
    translate: passthroughTranslate,
  }

  async function importWithAttachment() {
    const file = await makeKeepZip([KEEP_NOTE_WITH_ATTACHMENT], {
      'Takeout/Keep/photo.png': new Uint8Array([1, 2, 3]),
    })
    const result = await processImportFile(file, baseOptions)
    if (!result.success) throw new Error('unreachable')
    return result.result
  }

  it('processImportFile はアップロードせず、添付を importedLeaves に保持する（cancel/skip で孤児を作らない）', async () => {
    const result = await importWithAttachment()
    // 本文は未加工・添付は後段（applyImportedAttachments）待ち
    expect(result.importedLeaves[0].content).toBe('see photo')
    expect(result.importedLeaves[0].attachments).toHaveLength(1)
  })

  it('applyImportedAttachments 成功: 本文末尾に記法追記・レポートに件数・添付は取り除かれる', async () => {
    const result = await importWithAttachment()
    const uploaded: string[] = []
    await applyImportedAttachments(result, passthroughTranslate, async (f) => {
      uploaded.push(f.name)
      return {
        ok: true,
        url: `https://raw.githubusercontent.com/o/r-media/main/${f.name}`,
        name: f.name,
      }
    })
    expect(uploaded).toEqual(['photo.png'])
    const leaf = result.importedLeaves[0]
    expect(leaf.content).toBe(
      'see photo\n\n![photo.png](https://raw.githubusercontent.com/o/r-media/main/photo.png)'
    )
    expect(leaf.attachments).toBeUndefined()
    expect(result.reportLeaf.content).toContain(
      'settings.importExport.importReportMediaUploaded {"count":1}'
    )
  })

  it('画像最適化でファイル名が変わる場合、記法はアップロード後の名前（.webp）を使う', async () => {
    const result = await importWithAttachment()
    await applyImportedAttachments(result, passthroughTranslate, async () => ({
      ok: true,
      url: 'https://raw.githubusercontent.com/o/r-media/main/20260711-abcd1234-photo.webp',
      name: '20260711-abcd1234-photo.webp',
    }))
    expect(result.importedLeaves[0].content).toContain('![20260711-abcd1234-photo.webp](')
  })

  it('アップロード失敗（形式外等）は記法を追記せず、レポートにスキップ行が載る', async () => {
    const result = await importWithAttachment()
    await applyImportedAttachments(result, passthroughTranslate, async () => ({
      ok: false,
      errorKind: 'format_not_allowed',
    }))
    expect(result.importedLeaves[0].content).toBe('see photo')
    expect(result.importedLeaves[0].attachments).toBeUndefined()
    expect(result.reportLeaf.content).toContain(
      'settings.importExport.importReportMediaSkippedLine {"entry":"photo.png (format_not_allowed)"}'
    )
  })

  it('uploader 未指定（メディア未設定）: unsupported としてレポートに追記され、添付は取り除かれる', async () => {
    const result = await importWithAttachment()
    await applyImportedAttachments(result, passthroughTranslate)
    expect(result.importedLeaves[0].content).toBe('see photo')
    expect(result.importedLeaves[0].attachments).toBeUndefined()
    expect(result.reportLeaf.content).toContain(
      'settings.importExport.importReportUnsupportedGeneric {"items":"attachments/images"}'
    )
  })

  it('添付が無ければ applyImportedAttachments は何もしない（レポート不変）', async () => {
    const file = new File(
      [JSON.stringify({ ...KEEP_NOTE_WITH_ATTACHMENT, attachments: undefined })],
      'keep.json',
      { type: 'application/json' }
    )
    const result = await processImportFile(file, baseOptions)
    if (!result.success) throw new Error('unreachable')
    const before = result.result.reportLeaf.content
    await applyImportedAttachments(result.result, passthroughTranslate, async () => {
      throw new Error('should not be called')
    })
    expect(result.result.reportLeaf.content).toBe(before)
  })

  it('画像以外（zip 添付）はリンク記法 [name](url) で追記される', async () => {
    const note = {
      ...KEEP_NOTE_WITH_ATTACHMENT,
      attachments: [{ filePath: 'bundle.zip', mimetype: 'application/zip' }],
    }
    const file = await makeKeepZip([note], { 'Takeout/Keep/bundle.zip': new Uint8Array([1]) })
    const parsed = await processImportFile(file, baseOptions)
    if (!parsed.success) throw new Error('unreachable')
    await applyImportedAttachments(parsed.result, passthroughTranslate, async (f) => ({
      ok: true,
      url: `https://example.com/${f.name}`,
      name: f.name,
    }))
    expect(parsed.result.importedLeaves[0].content).toContain(
      '[bundle.zip](https://example.com/bundle.zip)'
    )
    expect(parsed.result.importedLeaves[0].content).not.toContain('![bundle.zip]')
  })
})

describe('添付解決の同階層優先（#249: ベース名衝突対策）', () => {
  it('別フォルダに同名ファイルがあっても JSON と同じ階層の実体を選ぶ', async () => {
    const zip = new JSZip()
    zip.file('Takeout/Keep/note-0.json', JSON.stringify(KEEP_NOTE_WITH_ATTACHMENT))
    // 別フォルダの同名ファイル（zip の列挙順で先に来ても選ばれないこと）
    zip.file('Takeout/Drive/photo.png', new Uint8Array([9, 9, 9]))
    zip.file('Takeout/Keep/photo.png', new Uint8Array([1, 2, 3]))
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buffer], 'takeout.zip', { type: 'application/zip' })

    const result = await parseGoogleKeepFile(file)
    const attachment = result!.leaves[0].attachments![0]
    expect(new Uint8Array(attachment.data)).toEqual(new Uint8Array([1, 2, 3]))
  })
})
