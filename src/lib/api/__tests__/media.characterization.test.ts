/**
 * Characterization テスト（#242）— メディア同期層（media.ts）
 *
 * 対象: uploadMedia / ensureMediaRepo / retryPendingUploads /
 *       initMediaOnlineRetry / fetchMedia / resolveMedia / cacheMedia 配線
 *
 * 本番コードは変更しない。fetch は github/__tests__ の fetch-mock で、
 * IndexedDB アクセサ（media-storage）は in-memory Map でモックする。
 *
 * media.ts はモジュールレベル状態（ensuredMediaRepos / retryInFlight）を持つため、
 * テストごとに vi.resetModules() + 動的 import で素の状態から始める。
 * また Node には navigator が無い（uploadMedia が常時オフライン扱いになる）ため、
 * navigator.onLine を明示的にスタブする。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { createFetchMock, makeSettings, type FetchMock } from '../github/__tests__/fetch-mock'
import { MAX_MEDIA_SIZE_BYTES } from '../media/validation'
import { MEDIA_CACHE_MAX_ENTRY_BYTES } from '../media/lru'

// ============================================
// media-storage の in-memory モック
// ============================================

const mediaStore = vi.hoisted(() => {
  const pending = new Map<string, any>()
  const cache = new Map<string, any>()
  const fns = {
    putPendingMedia: vi.fn(async (item: any) => {
      pending.set(item.filename, item)
    }),
    getPendingMedia: vi.fn(async (filename: string) => pending.get(filename) ?? null),
    getAllPendingMedia: vi.fn(async () =>
      [...pending.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt)
    ),
    deletePendingMedia: vi.fn(async (filename: string) => {
      pending.delete(filename)
    }),
    getCachedMedia: vi.fn(async (url: string) => cache.get(url) ?? null),
    putCachedMedia: vi.fn(async (entry: any) => {
      cache.set(entry.url, entry)
    }),
    deleteCachedMedia: vi.fn(async (url: string) => {
      cache.delete(url)
    }),
    getAllCachedMediaMeta: vi.fn(async () =>
      [...cache.values()].map(({ url, size, lastAccessedAt }: any) => ({
        url,
        size,
        lastAccessedAt,
      }))
    ),
  }
  return { pending, cache, fns }
})

vi.mock('../../data/media-storage', () => mediaStore.fns)

// ============================================
// ヘルパー
// ============================================

type MediaModule = typeof import('../media')

/** モジュールレベル状態を毎テスト素にするため、動的 import で読み込む */
async function loadMedia(): Promise<MediaModule> {
  return await import('../media')
}

function makeFile(name: string, content: string | Uint8Array, type = 'image/png'): File {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  return new File([bytes as BlobPart], name, { type })
}

/** pending キューに直接アイテムを仕込む（enqueue 済み状態の再現） */
function seedPending(filename: string, enqueuedAt: number, size = 3) {
  const item = {
    filename,
    url: `https://raw.githubusercontent.com/owner/repo-media/main/${filename}`,
    data: new Uint8Array(size).buffer as ArrayBuffer,
    size,
    mimeType: 'image/png',
    enqueuedAt,
  }
  mediaStore.pending.set(filename, item)
  return item
}

/** キャッシュに直接エントリを仕込む */
function seedCache(url: string, content: string, lastAccessedAt = 1) {
  const data = new TextEncoder().encode(content).buffer as ArrayBuffer
  const entry = { url, data, size: data.byteLength, lastAccessedAt }
  mediaStore.cache.set(url, entry)
  return entry
}

function decodeData(data: ArrayBuffer): string {
  return new TextDecoder().decode(data)
}

/** fire-and-forget な非同期処理（online ハンドラ・touch put）を流しきる */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

// メディアリポ存在確認 GET（contents GET と部分一致で衝突しないよう末尾一致で書く）
const REPO_GET = /\/repos\/owner\/repo-media$/
// Contents API（存在チェック GET / アップロード PUT 共通）
const CONTENTS = '/repos/owner/repo-media/contents/'

const RAW_URL = 'https://raw.githubusercontent.com/owner/repo-media/main/20260709-abcd1234-x.png'
const RAW_PATH = '20260709-abcd1234-x.png'

let mock: FetchMock

beforeEach(() => {
  vi.resetModules()
  mediaStore.pending.clear()
  mediaStore.cache.clear()
  for (const fn of Object.values(mediaStore.fns)) {
    fn.mockReset()
  }
  mock = createFetchMock()
  vi.stubGlobal('fetch', mock.fn)
  // Node の navigator は undefined → 素のままだと常時オフライン扱いになるため明示スタブ
  vi.stubGlobal('navigator', { onLine: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ============================================
// uploadMedia
// ============================================
describe('uploadMedia', () => {
  it('オンライン・リポ既存・新規ファイルなら 存在チェック404→PUT で即時アップロードされる', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, { status: 201, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    // sha256('hello') = 2cf24dba... → hash8 = 2cf24dba
    expect(res).toEqual({
      ok: true,
      uploaded: true,
      url: expect.stringMatching(
        /^https:\/\/raw\.githubusercontent\.com\/owner\/repo-media\/main\/\d{8}-2cf24dba-hello\.png$/
      ),
    })
    if (!res.ok) throw new Error('unreachable')

    // PUT body: base64 content + committer
    const put = mock.firstCall('PUT', CONTENTS)
    expect(put!.headers.Authorization).toBe('Bearer test-token')
    expect(put!.body.content).toBe('aGVsbG8=') // base64('hello')
    expect(put!.body.committer).toEqual({
      name: 'agasteer',
      email: 'agasteer@users.noreply.github.com',
    })

    // pending は dequeue され、cache に載る
    expect(mediaStore.fns.putPendingMedia).toHaveBeenCalledTimes(1)
    expect(mediaStore.fns.deletePendingMedia).toHaveBeenCalledTimes(1)
    expect(mediaStore.pending.size).toBe(0)
    expect(mediaStore.cache.has(res.url)).toBe(true)

    mock.assertDrained()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('token 未設定なら not_configured を返し fetch も pending 書き込みもしない', async () => {
    const media = await loadMedia()
    const res = await media.uploadMedia(makeFile('a.png', 'x'), makeSettings({ token: '' }))
    expect(res).toEqual({ ok: false, errorKind: 'not_configured' })
    expect(mock.calls).toHaveLength(0)
    expect(mediaStore.fns.putPendingMedia).not.toHaveBeenCalled()
  })

  it('repoName にスラッシュが無ければ not_configured を返す', async () => {
    const media = await loadMedia()
    const res = await media.uploadMedia(makeFile('a.png', 'x'), makeSettings({ repoName: 'notes' }))
    expect(res).toEqual({ ok: false, errorKind: 'not_configured' })
    expect(mock.calls).toHaveLength(0)
    expect(mediaStore.fns.putPendingMedia).not.toHaveBeenCalled()
  })

  it('owner か repo が空の repoName（"/repo"・"owner/"）は not_configured を返す（#245 nit-2）', async () => {
    const media = await loadMedia()
    for (const repoName of ['/repo', 'owner/']) {
      const res = await media.uploadMedia(makeFile('a.png', 'x'), makeSettings({ repoName }))
      expect(res).toEqual({ ok: false, errorKind: 'not_configured' })
    }
    expect(mock.calls).toHaveLength(0)
    expect(mediaStore.fns.putPendingMedia).not.toHaveBeenCalled()
  })

  it('ホワイトリスト外の形式（.exe）は format_not_allowed で fetch/IDB に触れない', async () => {
    const media = await loadMedia()
    const res = await media.uploadMedia(makeFile('virus.exe', 'x'), makeSettings())
    expect(res).toEqual({ ok: false, errorKind: 'format_not_allowed' })
    expect(mock.calls).toHaveLength(0)
    expect(mediaStore.fns.putPendingMedia).not.toHaveBeenCalled()
  })

  it('100MB を 1 byte でも超えると size_exceeded を返す（サイズ検証の配線）', async () => {
    const media = await loadMedia()
    // 実データ 100MB は確保せず、size プロパティだけ超過させたスタブで境界配線を見る
    const oversized = {
      name: 'big.zip',
      size: MAX_MEDIA_SIZE_BYTES + 1,
      type: 'application/zip',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as File
    const res = await media.uploadMedia(oversized, makeSettings())
    expect(res).toEqual({ ok: false, errorKind: 'size_exceeded' })
    expect(mock.calls).toHaveLength(0)
    expect(mediaStore.fns.putPendingMedia).not.toHaveBeenCalled()
  })

  it('オフラインでも URL は確定して返り、pending に残る（fetch 0回）', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res).toEqual({
      ok: true,
      uploaded: false,
      url: expect.stringMatching(/\/owner\/repo-media\/main\/\d{8}-2cf24dba-hello\.png$/),
    })
    expect(mock.calls).toHaveLength(0)
    expect(mediaStore.pending.size).toBe(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('存在チェックが 200 なら同名=同内容として PUT をスキップし dequeue+cache する', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } }).on('GET', CONTENTS, { status: 200, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res.ok && res.uploaded).toBe(true)
    expect(mock.callsMatching('PUT', CONTENTS)).toHaveLength(0)
    expect(mediaStore.pending.size).toBe(0)
    expect(mediaStore.cache.size).toBe(1)
    mock.assertDrained()
  })

  it('PUT 422（並行作成 race）は成功扱いで dequeue+cache する', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, { status: 422, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res.ok && res.uploaded).toBe(true)
    expect(mediaStore.pending.size).toBe(0)
    expect(mediaStore.cache.size).toBe(1)
    mock.assertDrained()
  })

  it('PUT 500 は uploaded:false で pending に残り cache には載らない', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, { status: 500, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res).toEqual({ ok: true, uploaded: false, url: expect.any(String) })
    expect(mediaStore.pending.size).toBe(1)
    expect(mediaStore.cache.size).toBe(0)
  })

  it('存在チェックが 403 なら uploaded:false で pending に残る', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } }).on('GET', CONTENTS, { status: 403, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res).toEqual({ ok: true, uploaded: false, url: expect.any(String) })
    expect(mock.callsMatching('PUT', CONTENTS)).toHaveLength(0)
    expect(mediaStore.pending.size).toBe(1)
  })

  it('ensureMediaRepo 失敗（リポ GET 500）なら contents 系 fetch に進まず pending に残る', async () => {
    mock.on('GET', REPO_GET, { status: 500, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res).toEqual({ ok: true, uploaded: false, url: expect.any(String) })
    expect(mock.callsMatching('GET', CONTENTS)).toHaveLength(0)
    expect(mock.callsMatching('PUT', CONTENTS)).toHaveLength(0)
    expect(mediaStore.pending.size).toBe(1)
  })

  it('通信自体が throw しても uploaded:false + console.warn で pending に残る（error は出さない）', async () => {
    // リポ確認だけ成功させ、存在チェックの fetch を throw させる（キュー空 = throw）
    mock.on('GET', REPO_GET, { json: { id: 1 } })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res).toEqual({ ok: true, uploaded: false, url: expect.any(String) })
    expect(mediaStore.pending.size).toBe(1)
    expect(console.warn).toHaveBeenCalledWith(
      'Media upload failed (kept in pending queue):',
      expect.anything()
    )
    expect(console.error).not.toHaveBeenCalled()
  })

  it('同一内容を同日2回アップロードすると同一 filename/URL になり 2回目は PUT しない', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, { status: 201, json: {} })
      .on('GET', CONTENTS, { status: 200, json: {} }) // 2回目の存在チェックはヒット
    const media = await loadMedia()

    const first = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())
    const second = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) throw new Error('unreachable')
    expect(second.url).toBe(first.url)
    expect(second.uploaded).toBe(true)
    expect(mock.callsMatching('PUT', CONTENTS)).toHaveLength(1)
    // pending put は同一 filename の上書き（2回 put されても常に1件）
    const putFilenames = mediaStore.fns.putPendingMedia.mock.calls.map((c) => c[0].filename)
    expect(putFilenames).toHaveLength(2)
    expect(putFilenames[0]).toBe(putFilenames[1])
    expect(mediaStore.pending.size).toBe(0)
    mock.assertDrained()
  })

  it('20MB ちょうどのアップロード成功は cache に載る', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } }).on('GET', CONTENTS, { status: 200, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(
      makeFile('exact.png', new Uint8Array(MEDIA_CACHE_MAX_ENTRY_BYTES)),
      makeSettings()
    )

    expect(res.ok && res.uploaded).toBe(true)
    expect(mediaStore.fns.putCachedMedia).toHaveBeenCalledTimes(1)
    expect(mediaStore.cache.size).toBe(1)
  })

  it('20MB+1 のアップロード成功は uploaded:true だが cache には載らない', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } }).on('GET', CONTENTS, { status: 200, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(
      makeFile('over.png', new Uint8Array(MEDIA_CACHE_MAX_ENTRY_BYTES + 1)),
      makeSettings()
    )

    expect(res.ok && res.uploaded).toBe(true)
    expect(mediaStore.fns.putCachedMedia).not.toHaveBeenCalled()
    expect(mediaStore.cache.size).toBe(0)
  })

  it('File.type が空文字でも mimeType 空のまま pending に保存されエラーにならない', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const media = await loadMedia()

    const file = new File([new Uint8Array([1, 2, 3])], 'noext-type.png') // type 未指定 → ''
    const res = await media.uploadMedia(file, makeSettings())

    expect(res.ok).toBe(true)
    expect(mediaStore.fns.putPendingMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: '' })
    )
    expect(console.error).not.toHaveBeenCalled()
  })

  it('putPendingMedia が reject したら ok:false storage_failed を返し throw しない（#245 should-5）', async () => {
    mediaStore.fns.putPendingMedia.mockRejectedValueOnce(new Error('quota exceeded'))
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res).toEqual({ ok: false, errorKind: 'storage_failed' })
    expect(mock.calls).toHaveLength(0) // アップロード試行に進まない
    expect(console.error).toHaveBeenCalledWith('Media enqueue failed:', expect.anything())
  })

  it('file.arrayBuffer() が reject したら ok:false storage_failed を返す（#245 should-5）', async () => {
    const media = await loadMedia()
    const broken = {
      name: 'broken.png',
      size: 3,
      type: 'image/png',
      arrayBuffer: async () => {
        throw new Error('read error')
      },
    } as unknown as File

    const res = await media.uploadMedia(broken, makeSettings())

    expect(res).toEqual({ ok: false, errorKind: 'storage_failed' })
    expect(mediaStore.fns.putPendingMedia).not.toHaveBeenCalled()
    expect(mock.calls).toHaveLength(0)
  })

  it('0 byte のファイルは検証を通り enqueue まで進む', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('empty.png', ''), makeSettings())

    expect(res).toEqual({ ok: true, uploaded: false, url: expect.any(String) })
    expect(mediaStore.fns.putPendingMedia).toHaveBeenCalledWith(
      expect.objectContaining({ size: 0 })
    )
    expect(mediaStore.pending.size).toBe(1)
    expect(console.error).not.toHaveBeenCalled()
  })
})

// ============================================
// ensureMediaRepo
// ============================================
describe('ensureMediaRepo', () => {
  it('リポ GET 404 なら POST /user/repos で private + auto_init の短縮名リポを作る', async () => {
    mock
      .on('GET', REPO_GET, { status: 404, json: {} })
      .on('POST', '/user/repos', { status: 201, json: {} })
    const media = await loadMedia()

    const res = await media.ensureMediaRepo(makeSettings())

    expect(res).toEqual({ ok: true })
    const post = mock.firstCall('POST', '/user/repos')
    expect(post!.body).toMatchObject({
      name: 'repo-media', // owner を含まない短縮名
      private: true,
      auto_init: true,
    })
    mock.assertDrained()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('POST 422（並行タブとの作成 race）は成功扱いにする', async () => {
    mock
      .on('GET', REPO_GET, { status: 404, json: {} })
      .on('POST', '/user/repos', { status: 422, json: {} })
    const media = await loadMedia()
    expect(await media.ensureMediaRepo(makeSettings())).toEqual({ ok: true })
  })

  it('POST 403 は repo_unavailable + httpStatus 403 を返す', async () => {
    mock
      .on('GET', REPO_GET, { status: 404, json: {} })
      .on('POST', '/user/repos', { status: 403, json: {} })
    const media = await loadMedia()
    expect(await media.ensureMediaRepo(makeSettings())).toEqual({
      ok: false,
      errorKind: 'repo_unavailable',
      httpStatus: 403,
    })
  })

  it('リポ GET 401 は repo_unavailable + httpStatus 401 を返す', async () => {
    mock.on('GET', REPO_GET, { status: 401, json: {} })
    const media = await loadMedia()
    expect(await media.ensureMediaRepo(makeSettings())).toEqual({
      ok: false,
      errorKind: 'repo_unavailable',
      httpStatus: 401,
    })
  })

  it('成功後の 2 回目はセッション内メモ化により fetch しない', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } })
    const media = await loadMedia()

    expect(await media.ensureMediaRepo(makeSettings())).toEqual({ ok: true })
    expect(await media.ensureMediaRepo(makeSettings())).toEqual({ ok: true })
    expect(mock.calls).toHaveLength(1)
  })

  it('失敗はメモ化されず、次回は再度 GET が飛ぶ', async () => {
    mock.on('GET', REPO_GET, { status: 500, json: {} }).on('GET', REPO_GET, { json: { id: 1 } })
    const media = await loadMedia()

    expect((await media.ensureMediaRepo(makeSettings())).ok).toBe(false)
    expect(await media.ensureMediaRepo(makeSettings())).toEqual({ ok: true })
    expect(mock.calls).toHaveLength(2)
  })

  it('通信 throw は repo_unavailable（httpStatus なし）+ console.error 1回', async () => {
    // キュー空 → fetch throw
    const media = await loadMedia()

    const res = await media.ensureMediaRepo(makeSettings())

    expect(res).toEqual({ ok: false, errorKind: 'repo_unavailable' })
    expect(res).not.toHaveProperty('httpStatus')
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('ensureMediaRepo failed:', expect.anything())
  })
})

// ============================================
// retryPendingUploads / initMediaOnlineRetry
// ============================================
describe('retryPendingUploads', () => {
  it('pending 2件を enqueuedAt の古い順に送信して全件 dequeue する', async () => {
    seedPending('newer.png', 200)
    seedPending('older.png', 100)
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', `${CONTENTS}older.png`, { status: 200, json: {} })
      .on('GET', `${CONTENTS}newer.png`, { status: 200, json: {} })
    const media = await loadMedia()

    const res = await media.retryPendingUploads(makeSettings())

    expect(res).toEqual({ attempted: 2, uploaded: 2 })
    const contentsCalls = mock.callsMatching('GET', CONTENTS)
    expect(contentsCalls[0].url).toContain('older.png')
    expect(contentsCalls[1].url).toContain('newer.png')
    expect(mediaStore.pending.size).toBe(0)
    mock.assertDrained()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('1件目が失敗しても中断せず 2件目を試行し、失敗分だけ pending に残す', async () => {
    seedPending('first.png', 100)
    seedPending('second.png', 200)
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', `${CONTENTS}first.png`, { status: 500, json: {} })
      .on('GET', `${CONTENTS}second.png`, { status: 200, json: {} })
    const media = await loadMedia()

    const res = await media.retryPendingUploads(makeSettings())

    expect(res).toEqual({ attempted: 2, uploaded: 1 })
    expect([...mediaStore.pending.keys()]).toEqual(['first.png'])
    mock.assertDrained()
  })

  it('未解決の実行中に呼ばれた 2 回目は即 {0,0} を返し重複実行しない', async () => {
    let resolveItems!: (items: unknown[]) => void
    mediaStore.fns.getAllPendingMedia.mockImplementationOnce(
      () =>
        new Promise<any>((resolve) => {
          resolveItems = resolve
        })
    )
    const media = await loadMedia()

    const first = media.retryPendingUploads(makeSettings())
    const second = await media.retryPendingUploads(makeSettings())

    expect(second).toEqual({ attempted: 0, uploaded: 0 })
    expect(mediaStore.fns.getAllPendingMedia).toHaveBeenCalledTimes(1)
    resolveItems([])
    await expect(first).resolves.toEqual({ attempted: 0, uploaded: 0 })
    expect(mock.calls).toHaveLength(0)
  })

  it('完走後の再呼び出しでは再びリトライが走る（in-flight ガード解除）', async () => {
    const media = await loadMedia()
    expect(await media.retryPendingUploads(makeSettings())).toEqual({ attempted: 0, uploaded: 0 })

    seedPending('later.png', 100)
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', `${CONTENTS}later.png`, { status: 200, json: {} })

    expect(await media.retryPendingUploads(makeSettings())).toEqual({ attempted: 1, uploaded: 1 })
    expect(mediaStore.fns.getAllPendingMedia).toHaveBeenCalledTimes(2)
  })

  it('リポ切替後の pending は ensure 含め settings ではなく item.url のリポへ向く（#245 should-2）', async () => {
    // item.url は owner/repo-media を指す。settings は owner/other に切替済み
    seedPending('old.png', 100)
    mock
      .on('GET', REPO_GET, { json: { id: 1 } }) // 存在確認も item.url 由来の owner/repo-media へ
      .on('GET', `${CONTENTS}old.png`, { status: 404, json: {} })
      .on('PUT', `${CONTENTS}old.png`, { status: 201, json: {} })
    const media = await loadMedia()

    const res = await media.retryPendingUploads(makeSettings({ repoName: 'owner/other' }))

    expect(res).toEqual({ attempted: 1, uploaded: 1 })
    // 新リポ（owner/other-media）へのアクセスは存在確認・contents とも一切ない
    expect(mock.calls.filter((c) => c.url.includes('other-media'))).toHaveLength(0)
    mock.assertDrained()
  })

  it('未設定なら {0,0} を返し IndexedDB に触れない', async () => {
    const media = await loadMedia()
    const res = await media.retryPendingUploads(makeSettings({ token: '' }))
    expect(res).toEqual({ attempted: 0, uploaded: 0 })
    expect(mediaStore.fns.getAllPendingMedia).not.toHaveBeenCalled()
  })

  it('getAllPendingMedia が throw しても {0,0} + warn で、以後の呼び出しは正常に動く', async () => {
    mediaStore.fns.getAllPendingMedia.mockRejectedValueOnce(new Error('idb boom'))
    const media = await loadMedia()

    expect(await media.retryPendingUploads(makeSettings())).toEqual({ attempted: 0, uploaded: 0 })
    expect(console.warn).toHaveBeenCalledWith('retryPendingUploads failed:', expect.anything())

    // デッドロックしない: 2 回目は再び getAllPendingMedia まで到達する
    expect(await media.retryPendingUploads(makeSettings())).toEqual({ attempted: 0, uploaded: 0 })
    expect(mediaStore.fns.getAllPendingMedia).toHaveBeenCalledTimes(2)
  })
})

describe('initMediaOnlineRetry', () => {
  /** window.addEventListener/removeEventListener をスタブし、online 発火関数を返す */
  function stubWindowOnline(): () => void {
    const listeners = new Map<string, Set<() => void>>()
    const windowStub = {
      addEventListener: (type: string, fn: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(fn)
      },
      removeEventListener: (type: string, fn: () => void) => {
        listeners.get(type)?.delete(fn)
      },
    }
    vi.stubGlobal('window', windowStub)
    return () => {
      for (const fn of listeners.get('online') ?? []) fn()
    }
  }

  it('online イベントで発火時点の最新 settings を読んでリトライし、解除後は発火しない', async () => {
    const dispatchOnline = stubWindowOnline()
    const media = await loadMedia()

    const settingsRef = { current: makeSettings({ token: '' }) } // 最初は未設定
    const getSettings = vi.fn(() => settingsRef.current)
    const dispose = media.initMediaOnlineRetry(getSettings)
    await flushAsync()
    // 登録時の初回キック（未設定なので IDB には触れない）
    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(mediaStore.fns.getAllPendingMedia).not.toHaveBeenCalled()

    // 発火1回目: 未設定なのでリトライは IDB に触れない
    dispatchOnline()
    await flushAsync()
    expect(getSettings).toHaveBeenCalledTimes(2)
    expect(mediaStore.fns.getAllPendingMedia).not.toHaveBeenCalled()

    // settings を差し替えてから発火 → 最新の設定でリトライが走る
    settingsRef.current = makeSettings()
    dispatchOnline()
    await flushAsync()
    expect(mediaStore.fns.getAllPendingMedia).toHaveBeenCalledTimes(1)

    // 解除後は発火しない
    dispose()
    dispatchOnline()
    await flushAsync()
    expect(getSettings).toHaveBeenCalledTimes(3)
    expect(mediaStore.fns.getAllPendingMedia).toHaveBeenCalledTimes(1)
  })

  it('登録時に一度リトライが走り、前セッションの積み残しが回収される（#245 should-3）', async () => {
    stubWindowOnline()
    seedPending('leftover.png', 100)
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', `${CONTENTS}leftover.png`, { status: 200, json: {} })
    const media = await loadMedia()

    const dispose = media.initMediaOnlineRetry(() => makeSettings())
    await flushAsync()

    // online イベントなしでアップロード試行され、キューが空になる
    expect(mediaStore.fns.getAllPendingMedia).toHaveBeenCalledTimes(1)
    expect(mediaStore.pending.size).toBe(0)
    mock.assertDrained()
    dispose()
  })
})

// ============================================
// resolveMedia / fetchMedia
// ============================================
describe('resolveMedia', () => {
  it('解決順1: pending ヒットなら cache 参照も fetch もしない', async () => {
    const item = seedPending(RAW_PATH, 100)
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(res.data).toBe(item.data)
    expect(mediaStore.fns.getCachedMedia).not.toHaveBeenCalled()
    expect(mock.calls).toHaveLength(0)
  })

  it('解決順2: cache ヒットなら fetch せず lastAccessedAt を現在時刻に更新する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(123456789)
    seedCache(RAW_URL, 'CACHED', 1)
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(decodeData(res.data)).toBe('CACHED')
    expect(mock.calls).toHaveLength(0)
    expect(mediaStore.fns.putCachedMedia).toHaveBeenCalledWith(
      expect.objectContaining({ url: RAW_URL, lastAccessedAt: 123456789 })
    )
  })

  it('LRU touch の put が reject しても返却は成功し warn 1回で済む（unhandled rejection なし）', async () => {
    seedCache(RAW_URL, 'CACHED')
    mediaStore.fns.putCachedMedia.mockRejectedValueOnce(new Error('quota'))
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())
    await flushAsync()

    expect(res.ok).toBe(true)
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      'Media cache touch failed (ignored):',
      expect.anything()
    )
    expect(console.error).not.toHaveBeenCalled()
  })

  it('解決順3: 両ミスなら Contents API を raw Accept + 認証付きで fetch し cache に書く', async () => {
    mock.on('GET', `/repos/owner/repo-media/contents/${RAW_PATH}`, { text: 'REMOTE' })
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(decodeData(res.data)).toBe('REMOTE')
    const call = mock.firstCall('GET', `/repos/owner/repo-media/contents/${RAW_PATH}`)
    expect(call!.url).toBe(`https://api.github.com/repos/owner/repo-media/contents/${RAW_PATH}`)
    expect(call!.headers.Accept).toBe('application/vnd.github.raw')
    expect(call!.headers.Authorization).toBe('Bearer test-token')
    expect(mediaStore.cache.has(RAW_URL)).toBe(true)
    mock.assertDrained()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('pending の参照が throw しても warn して cache へフォールバックする', async () => {
    mediaStore.fns.getPendingMedia.mockRejectedValueOnce(new Error('idb boom'))
    seedCache(RAW_URL, 'CACHED')
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(decodeData(res.data)).toBe('CACHED')
    expect(console.warn).toHaveBeenCalledWith(
      'Media pending lookup failed (falling back to cache/fetch):',
      expect.anything()
    )
  })

  it('cache の参照が throw しても warn して fetch へフォールバックする', async () => {
    mediaStore.fns.getCachedMedia.mockRejectedValueOnce(new Error('idb boom'))
    mock.on('GET', CONTENTS, { text: 'REMOTE' })
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(decodeData(res.data)).toBe('REMOTE')
    expect(console.warn).toHaveBeenCalledWith(
      'Media cache lookup failed (falling back to fetch):',
      expect.anything()
    )
  })

  it('raw URL 以外は invalid_url で IDB にも fetch にも触れない', async () => {
    const media = await loadMedia()
    const res = await media.resolveMedia('https://example.com/a.png', makeSettings())
    expect(res).toEqual({ ok: false, errorKind: 'invalid_url' })
    expect(mediaStore.fns.getPendingMedia).not.toHaveBeenCalled()
    expect(mediaStore.fns.getCachedMedia).not.toHaveBeenCalled()
    expect(mock.calls).toHaveLength(0)
  })

  it('fetch が 401/403/404 なら fetch_failed + httpStatus を透過し cache に書かない', async () => {
    const media = await loadMedia()
    for (const status of [401, 403, 404]) {
      mock.on('GET', CONTENTS, { status, json: {} })
      const res = await media.resolveMedia(RAW_URL, makeSettings())
      expect(res).toEqual({ ok: false, errorKind: 'fetch_failed', httpStatus: status })
    }
    expect(mediaStore.fns.putCachedMedia).not.toHaveBeenCalled()
    mock.assertDrained()
  })

  it('未設定 settings でも pending/cache ヒットなら返せる（オフラインキャッシュ閲覧の担保）', async () => {
    const pendingUrl = 'https://raw.githubusercontent.com/owner/repo-media/main/p.png'
    const cachedUrl = 'https://raw.githubusercontent.com/owner/repo-media/main/c.png'
    seedPending('p.png', 100)
    seedCache(cachedUrl, 'CACHED')
    const media = await loadMedia()
    const unconfigured = makeSettings({ token: '' })

    expect((await media.resolveMedia(pendingUrl, unconfigured)).ok).toBe(true)
    expect((await media.resolveMedia(cachedUrl, unconfigured)).ok).toBe(true)
    expect(mock.calls).toHaveLength(0)
  })

  it('fetch 成功が 20MB ちょうどなら cache に書く', async () => {
    mock.on('GET', CONTENTS, { text: 'a'.repeat(MEDIA_CACHE_MAX_ENTRY_BYTES) })
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    expect(mediaStore.fns.putCachedMedia).toHaveBeenCalledTimes(1)
  })

  it('fetch 成功が 20MB+1 なら返すが cache には書かない', async () => {
    mock.on('GET', CONTENTS, { text: 'a'.repeat(MEDIA_CACHE_MAX_ENTRY_BYTES + 1) })
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(res.data.byteLength).toBe(MEDIA_CACHE_MAX_ENTRY_BYTES + 1)
    expect(mediaStore.fns.putCachedMedia).not.toHaveBeenCalled()
  })
})

describe('fetchMedia', () => {
  it('fetch が throw したら fetch_failed（httpStatus なし）+ console.error', async () => {
    // キュー空 → fetch throw
    const media = await loadMedia()
    const res = await media.fetchMedia(RAW_URL, makeSettings())
    expect(res).toEqual({ ok: false, errorKind: 'fetch_failed' })
    expect(res).not.toHaveProperty('httpStatus')
    expect(console.error).toHaveBeenCalledWith('fetchMedia failed:', expect.anything())
  })
})

// ============================================
// cacheMedia 統合（LRU 配線）
// ============================================
describe('cacheMedia（LRU 配線）', () => {
  it('総量超過時は lastAccessedAt の古い順に deleteCachedMedia してから put する', async () => {
    // 既存メタ合計 210,000,000 bytes（上限 209,715,200 超え）。
    // incoming 1MB → 古い順に u-old, u-mid を追い出すと収まる
    mediaStore.fns.getAllCachedMediaMeta.mockResolvedValueOnce([
      { url: 'u-mid', size: 1_000_000, lastAccessedAt: 2 },
      { url: 'u-old', size: 1_000_000, lastAccessedAt: 1 },
      { url: 'u-big', size: 208_000_000, lastAccessedAt: 3 },
    ])
    mock.on('GET', CONTENTS, { text: 'a'.repeat(1_048_576) })
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    expect(mediaStore.fns.deleteCachedMedia.mock.calls.map((c) => c[0])).toEqual(['u-old', 'u-mid'])
    // 追い出しが put より先に行われる
    const lastDeleteOrder = Math.max(...mediaStore.fns.deleteCachedMedia.mock.invocationCallOrder)
    const putOrder = mediaStore.fns.putCachedMedia.mock.invocationCallOrder[0]
    expect(lastDeleteOrder).toBeLessThan(putOrder)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('同一 URL の再キャッシュでは自分のサイズを二重計上せず eviction しない', async () => {
    // 既存エントリは自分自身（200MB 弱）。自己除外により総量 0 とみなされ追い出しなし
    mediaStore.fns.getAllCachedMediaMeta.mockResolvedValueOnce([
      { url: RAW_URL, size: 209_000_000, lastAccessedAt: 1 },
    ])
    mock.on('GET', CONTENTS, { text: 'a'.repeat(1_048_576) })
    const media = await loadMedia()

    const res = await media.resolveMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    expect(mediaStore.fns.deleteCachedMedia).not.toHaveBeenCalled()
    expect(mediaStore.fns.putCachedMedia).toHaveBeenCalledTimes(1)
  })

  it('cache put が throw してもアップロード成功は維持され warn のみ出る', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } }).on('GET', CONTENTS, { status: 200, json: {} })
    mediaStore.fns.putCachedMedia.mockRejectedValueOnce(new Error('quota'))
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res.ok && res.uploaded).toBe(true)
    expect(mediaStore.fns.deletePendingMedia).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      'Media cache write failed (ignored):',
      expect.anything()
    )
    expect(console.error).not.toHaveBeenCalled()
  })
})
