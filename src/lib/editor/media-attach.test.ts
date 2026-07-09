/**
 * エディタ添付ロジックのテスト（#243）
 *
 * - ファイル取り出し・記法組み立て・paste/drop ハンドラは DOM 実体に依存しない
 *   構造的な形で受けるため、フェイクオブジェクトで node 環境のまま検証する
 * - attachMediaFiles は uploadMedia / optimizeImageFile をモックし、
 *   挿入・通知の編成（成功/失敗/オフライン分岐・複数ファイルの改行区切り）を検証する
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const uploadMediaMock = vi.hoisted(() => vi.fn())
const optimizeImageFileMock = vi.hoisted(() => vi.fn())

vi.mock('../api/media', () => ({
  uploadMedia: uploadMediaMock,
}))
vi.mock('../utils/image-optimize', () => ({
  optimizeImageFile: optimizeImageFileMock,
}))

const {
  extractDataTransferFiles,
  isImageFileName,
  sanitizeMediaLabel,
  buildMediaMarkdown,
  createMediaDomHandlers,
  attachMediaFiles,
  MEDIA_FILE_ACCEPT,
} = await import('./media-attach')

import type { Settings } from '../types'
// 型のみの import はモックに影響しない（実行時には消える）
import type { MediaErrorKind } from '../api/media'
import ja from '../i18n/locales/ja.json'
import en from '../i18n/locales/en.json'

const settings = { token: 't', repoName: 'owner/repo' } as Settings

function makeFile(name: string, content = 'data'): File {
  return new File([content], name, { type: 'application/octet-stream' })
}

beforeEach(() => {
  uploadMediaMock.mockReset()
  optimizeImageFileMock.mockReset()
  optimizeImageFileMock.mockImplementation(async (file: File) => file)
})

describe('extractDataTransferFiles', () => {
  it('files からファイルを取り出す', () => {
    const a = makeFile('a.png')
    const data = { files: [a], items: [] } as unknown as DataTransfer
    expect(extractDataTransferFiles(data)).toEqual([a])
  })

  it('files が空なら items の kind=file から取り出す', () => {
    const a = makeFile('a.png')
    const data = {
      files: [],
      items: [
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => a },
      ],
    } as unknown as DataTransfer
    expect(extractDataTransferFiles(data)).toEqual([a])
  })

  it('テキストのみ・null は空配列', () => {
    expect(extractDataTransferFiles(null)).toEqual([])
    const textOnly = {
      files: [],
      items: [{ kind: 'string', getAsFile: () => null }],
    } as unknown as DataTransfer
    expect(extractDataTransferFiles(textOnly)).toEqual([])
  })

  it('items の kind=file でも getAsFile() が null ならスキップする', () => {
    const a = makeFile('a.png')
    const data = {
      files: [],
      items: [
        { kind: 'file', getAsFile: () => null },
        { kind: 'file', getAsFile: () => a },
      ],
    } as unknown as DataTransfer
    expect(extractDataTransferFiles(data)).toEqual([a])
  })
})

describe('挿入記法（buildMediaMarkdown）', () => {
  it('画像は ![name](url)', () => {
    expect(buildMediaMarkdown('shot.png', 'https://example.com/shot.png')).toBe(
      '![shot.png](https://example.com/shot.png)'
    )
    expect(isImageFileName('anim.gif')).toBe(true)
    expect(isImageFileName('vector.svg')).toBe(true)
  })

  it('動画/音声/zip は [name](url)', () => {
    expect(buildMediaMarkdown('movie.mp4', 'https://example.com/movie.mp4')).toBe(
      '[movie.mp4](https://example.com/movie.mp4)'
    )
    expect(isImageFileName('archive.zip')).toBe(false)
  })

  it('ラベルの [ ] と改行をサニタイズする', () => {
    expect(sanitizeMediaLabel('a[1]b\nc.png')).toBe('a1b c.png')
    expect(sanitizeMediaLabel('[]')).toBe('file')
  })

  it('空文字・空白のみのファイル名は fallback ラベル file になる', () => {
    expect(sanitizeMediaLabel('')).toBe('file')
    expect(sanitizeMediaLabel('   ')).toBe('file')
  })

  it('日本語ファイル名はラベルにそのまま残る', () => {
    expect(sanitizeMediaLabel('スクリーンショット 2026-07-09.png')).toBe(
      'スクリーンショット 2026-07-09.png'
    )
    expect(buildMediaMarkdown('写真.png', 'https://example.com/x.png')).toBe(
      '![写真.png](https://example.com/x.png)'
    )
  })
})

describe('MEDIA_FILE_ACCEPT', () => {
  it('形式ホワイトリスト由来の拡張子リストになる', () => {
    expect(MEDIA_FILE_ACCEPT).toContain('.png')
    expect(MEDIA_FILE_ACCEPT).toContain('.zip')
    expect(MEDIA_FILE_ACCEPT).not.toContain('.exe')
  })
})

describe('createMediaDomHandlers', () => {
  const view = { posAtCoords: vi.fn().mockReturnValue(42) }

  it('paste: ファイルがあれば preventDefault して onFiles(files, null)', () => {
    const onFiles = vi.fn()
    const handlers = createMediaDomHandlers(onFiles)
    const file = makeFile('a.png')
    const preventDefault = vi.fn()
    const event = {
      clipboardData: { files: [file], items: [] },
      preventDefault,
    } as unknown as ClipboardEvent
    expect(handlers.paste(event)).toBe(true)
    expect(preventDefault).toHaveBeenCalled()
    expect(onFiles).toHaveBeenCalledWith([file], null)
  })

  it('paste: ファイルとテキストが混在する場合はファイルを優先しテキストは破棄する', () => {
    const onFiles = vi.fn()
    const handlers = createMediaDomHandlers(onFiles)
    const file = makeFile('a.png')
    const event = {
      clipboardData: {
        files: [file],
        items: [{ kind: 'string', getAsFile: () => null }],
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent
    expect(handlers.paste(event)).toBe(true)
    expect(onFiles).toHaveBeenCalledWith([file], null)
  })

  it('paste: テキストのみなら false（CodeMirror 既定処理に委ねる）', () => {
    const onFiles = vi.fn()
    const handlers = createMediaDomHandlers(onFiles)
    const event = {
      clipboardData: { files: [], items: [{ kind: 'string', getAsFile: () => null }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent
    expect(handlers.paste(event)).toBe(false)
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('drop: ファイルがあれば drop 位置を解決して onFiles(files, pos)', () => {
    const onFiles = vi.fn()
    const handlers = createMediaDomHandlers(onFiles)
    const file = makeFile('a.mp4')
    const event = {
      dataTransfer: { files: [file], items: [] },
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
    } as unknown as DragEvent
    expect(handlers.drop(event, view)).toBe(true)
    expect(view.posAtCoords).toHaveBeenCalledWith({ x: 10, y: 20 })
    expect(onFiles).toHaveBeenCalledWith([file], 42)
  })

  it('drop: posAtCoords が位置を解決できない場合は onFiles(files, null)', () => {
    const onFiles = vi.fn()
    const handlers = createMediaDomHandlers(onFiles)
    const nullView = { posAtCoords: vi.fn().mockReturnValue(null) }
    const file = makeFile('a.png')
    const event = {
      dataTransfer: { files: [file], items: [] },
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
    } as unknown as DragEvent
    expect(handlers.drop(event, nullView)).toBe(true)
    expect(onFiles).toHaveBeenCalledWith([file], null)
  })

  it('drop: ファイルなしなら false', () => {
    const onFiles = vi.fn()
    const handlers = createMediaDomHandlers(onFiles)
    const event = {
      dataTransfer: { files: [], items: [] },
      preventDefault: vi.fn(),
    } as unknown as DragEvent
    expect(handlers.drop(event, view)).toBe(false)
    expect(onFiles).not.toHaveBeenCalled()
  })
})

describe('attachMediaFiles', () => {
  it('成功時: 最適化 → uploadMedia → 記法挿入 → uploaded 通知', async () => {
    const optimized = makeFile('shot.webp')
    optimizeImageFileMock.mockResolvedValue(optimized)
    uploadMediaMock.mockResolvedValue({
      ok: true,
      url: 'https://example.com/x.webp',
      uploaded: true,
    })
    const insert = vi.fn()
    const notices: unknown[] = []
    await attachMediaFiles([makeFile('shot.png')], {
      settings,
      optimizeImages: true,
      insert,
      notify: (n) => notices.push(n),
    })
    expect(optimizeImageFileMock).toHaveBeenCalledOnce()
    expect(uploadMediaMock).toHaveBeenCalledWith(optimized, settings)
    expect(insert).toHaveBeenCalledWith('![shot.webp](https://example.com/x.webp)')
    expect(notices).toEqual([
      { kind: 'uploading', name: 'shot.png' },
      { kind: 'uploaded', name: 'shot.webp' },
    ])
  })

  it('最適化 OFF なら optimizeImageFile を通さない', async () => {
    uploadMediaMock.mockResolvedValue({
      ok: true,
      url: 'https://example.com/x.png',
      uploaded: true,
    })
    await attachMediaFiles([makeFile('shot.png')], {
      settings,
      optimizeImages: false,
      insert: vi.fn(),
      notify: vi.fn(),
    })
    expect(optimizeImageFileMock).not.toHaveBeenCalled()
  })

  it('空配列なら insert / notify / uploadMedia を一切呼ばない', async () => {
    const insert = vi.fn()
    const notify = vi.fn()
    await attachMediaFiles([], { settings, optimizeImages: true, insert, notify })
    expect(uploadMediaMock).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('最適化でリネームされた後にアップロード失敗 → error 通知の name は原本名', async () => {
    optimizeImageFileMock.mockResolvedValue(makeFile('shot.webp'))
    uploadMediaMock.mockResolvedValue({ ok: false, errorKind: 'repo_unavailable' })
    const notices: any[] = []
    await attachMediaFiles([makeFile('shot.png')], {
      settings,
      optimizeImages: true,
      insert: vi.fn(),
      notify: (n) => notices.push(n),
    })
    expect(notices).toEqual([
      { kind: 'uploading', name: 'shot.png' },
      { kind: 'error', errorKind: 'repo_unavailable', name: 'shot.png' },
    ])
  })

  it('検証エラー: 挿入せず error 通知して次のファイルに進む', async () => {
    uploadMediaMock
      .mockResolvedValueOnce({ ok: false, errorKind: 'size_exceeded' })
      .mockResolvedValueOnce({ ok: true, url: 'https://example.com/b.zip', uploaded: true })
    const insert = vi.fn()
    const notices: any[] = []
    await attachMediaFiles([makeFile('big.zip'), makeFile('b.zip')], {
      settings,
      optimizeImages: true,
      insert,
      notify: (n) => notices.push(n),
    })
    expect(insert).toHaveBeenCalledTimes(1)
    expect(notices).toContainEqual({ kind: 'error', errorKind: 'size_exceeded', name: 'big.zip' })
  })

  it('複数ファイルは成功分だけを改行区切りでまとめて 1 回挿入する', async () => {
    uploadMediaMock
      .mockResolvedValueOnce({ ok: true, url: 'https://example.com/a.png', uploaded: true })
      .mockResolvedValueOnce({ ok: true, url: 'https://example.com/b.png', uploaded: true })
    const inserted: string[] = []
    await attachMediaFiles([makeFile('a.png'), makeFile('b.png')], {
      settings,
      optimizeImages: false,
      insert: (text) => inserted.push(text),
      notify: vi.fn(),
    })
    expect(inserted).toEqual([
      '![a.png](https://example.com/a.png)\n![b.png](https://example.com/b.png)',
    ])
  })

  it('末尾ファイルが失敗しても挿入テキストにぶら下がり改行が残らない', async () => {
    uploadMediaMock
      .mockResolvedValueOnce({ ok: true, url: 'https://example.com/a.png', uploaded: true })
      .mockResolvedValueOnce({ ok: false, errorKind: 'size_exceeded' })
    const inserted: string[] = []
    await attachMediaFiles([makeFile('a.png'), makeFile('big.zip')], {
      settings,
      optimizeImages: false,
      insert: (text) => inserted.push(text),
      notify: vi.fn(),
    })
    expect(inserted).toEqual(['![a.png](https://example.com/a.png)'])
  })

  it('中間ファイルが失敗しても成功分（1・3番目）が 1 つの改行で繋がる', async () => {
    uploadMediaMock
      .mockResolvedValueOnce({ ok: true, url: 'https://example.com/a.png', uploaded: true })
      .mockResolvedValueOnce({ ok: false, errorKind: 'format_not_allowed' })
      .mockResolvedValueOnce({ ok: true, url: 'https://example.com/c.png', uploaded: true })
    const inserted: string[] = []
    await attachMediaFiles([makeFile('a.png'), makeFile('b.exe'), makeFile('c.png')], {
      settings,
      optimizeImages: false,
      insert: (text) => inserted.push(text),
      notify: vi.fn(),
    })
    expect(inserted).toEqual([
      '![a.png](https://example.com/a.png)\n![c.png](https://example.com/c.png)',
    ])
  })

  it('3ファイル（成功/失敗/成功）で通知が uploading→結果 の順に全ファイル分並ぶ', async () => {
    uploadMediaMock
      .mockResolvedValueOnce({ ok: true, url: 'https://example.com/a.png', uploaded: true })
      .mockResolvedValueOnce({ ok: false, errorKind: 'size_exceeded' })
      .mockResolvedValueOnce({ ok: true, url: 'https://example.com/c.png', uploaded: true })
    const notices: any[] = []
    await attachMediaFiles([makeFile('a.png'), makeFile('b.zip'), makeFile('c.png')], {
      settings,
      optimizeImages: false,
      insert: vi.fn(),
      notify: (n) => notices.push(n),
    })
    expect(notices).toEqual([
      { kind: 'uploading', name: 'a.png' },
      { kind: 'uploaded', name: 'a.png' },
      { kind: 'uploading', name: 'b.zip' },
      { kind: 'error', errorKind: 'size_exceeded', name: 'b.zip' },
      { kind: 'uploading', name: 'c.png' },
      { kind: 'uploaded', name: 'c.png' },
    ])
  })

  it('未アップロード（uploaded: false）: navigator 未定義なら queuedRetry 通知（オフライン扱いにしない）', async () => {
    // Node 21+ はグローバル navigator を持つ（onLine は undefined）ため、
    // 「navigator 未定義」の分岐は明示的に undefined へスタブして再現する
    vi.stubGlobal('navigator', undefined)
    try {
      uploadMediaMock.mockResolvedValue({
        ok: true,
        url: 'https://example.com/a.png',
        uploaded: false,
      })
      const notices: any[] = []
      await attachMediaFiles([makeFile('a.png')], {
        settings,
        optimizeImages: false,
        insert: vi.fn(),
        notify: (n) => notices.push(n),
      })
      expect(notices[1]).toEqual({ kind: 'queuedRetry', name: 'a.png' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('未アップロード（uploaded: false）: オンラインなら queuedRetry 通知', async () => {
    // node 環境には navigator がない（= オフライン分岐に入らない）ためスタブする
    vi.stubGlobal('navigator', { onLine: true })
    try {
      uploadMediaMock.mockResolvedValue({
        ok: true,
        url: 'https://example.com/a.png',
        uploaded: false,
      })
      const notices: any[] = []
      await attachMediaFiles([makeFile('a.png')], {
        settings,
        optimizeImages: false,
        insert: vi.fn(),
        notify: (n) => notices.push(n),
      })
      expect(notices[1]).toEqual({ kind: 'queuedRetry', name: 'a.png' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('未アップロード（uploaded: false）: オフラインなら queuedOffline 通知（挿入は完了する）', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    try {
      uploadMediaMock.mockResolvedValue({
        ok: true,
        url: 'https://example.com/a.png',
        uploaded: false,
      })
      const insert = vi.fn()
      const notices: any[] = []
      await attachMediaFiles([makeFile('a.png')], {
        settings,
        optimizeImages: false,
        insert,
        notify: (n) => notices.push(n),
      })
      expect(insert).toHaveBeenCalledWith('![a.png](https://example.com/a.png)')
      expect(notices[1]).toEqual({ kind: 'queuedOffline', name: 'a.png' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('i18n キー整合（media / footer / settings）', () => {
  // MediaErrorKind（src/lib/api/media.ts）の全値。型は実行時に消えるため
  // ここで列挙し、satisfies + Exclude で型との網羅一致を compile 時に縛る
  const ALL_MEDIA_ERROR_KINDS = [
    'not_configured',
    'format_not_allowed',
    'size_exceeded',
    'repo_unavailable',
    'invalid_url',
    'fetch_failed',
    'storage_failed',
  ] as const satisfies readonly MediaErrorKind[]
  // MediaErrorKind に値が増えると true が代入不能になり型エラーで検出される
  const _exhaustive: Exclude<MediaErrorKind, (typeof ALL_MEDIA_ERROR_KINDS)[number]> extends never
    ? true
    : never = true
  void _exhaustive

  const requiredKeys = [
    ...ALL_MEDIA_ERROR_KINDS.map((kind) => `media.errors.${kind}`),
    'media.uploading',
    'media.uploaded',
    'media.queuedOffline',
    'media.queuedRetry',
    'footer.attach',
    'settings.editor.mediaOptimize',
  ]

  function getByPath(obj: unknown, path: string): unknown {
    return path
      .split('.')
      .reduce<unknown>((cur, key) => (cur as Record<string, unknown> | undefined)?.[key], obj)
  }

  it.each([
    ['ja', ja],
    ['en', en],
  ])('%s: MediaErrorKind 全値と通知・添付ボタン・設定トグルのキーが存在する', (name, locale) => {
    for (const key of requiredKeys) {
      expect(getByPath(locale, key), `${name}.json missing key: ${key}`).toBeTypeOf('string')
    }
  })
})
