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

/**
 * 背景アップロードの直列性を観測するための手動解決 fetch。
 * リポ存在確認 GET（`/contents/` を含まない URL）は即 ok（観測対象外・以後メモ化される）。
 * contents（存在チェック GET / PUT）は解決を保留し、呼び出し順とタイミングを外部から制御する。
 */
function makeSerialFetch() {
  const calls: { url: string; method: string }[] = []
  const pending = new Map<string, (res: Response) => void>()
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ url, method })
    if (!url.includes('/contents/')) {
      return Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 200 }))
    }
    return new Promise<Response>((resolve) => {
      pending.set(url, resolve)
    })
  })
  return {
    fn,
    /** これまでに fetch された contents のパス（クエリ・ドメインを除いたファイル名） */
    contentsPaths(): string[] {
      return calls
        .filter((c) => c.url.includes('/contents/'))
        .map((c) => c.url.split('?')[0].split('/').pop() as string)
    },
    /** path を含む保留中の contents fetch を status で解決する */
    resolveContents(path: string, status: number): void {
      for (const [url, resolve] of pending) {
        if (url.includes(path)) {
          pending.delete(url)
          resolve(new Response('{}', { status }))
          return
        }
      }
      throw new Error(`makeSerialFetch: no pending contents fetch for ${path}`)
    },
  }
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

    // URL は enqueue 完了時点で即確定して返る（実アップロード完了は待たない）
    // sha256('hello') = 2cf24dba... → hash8 = 2cf24dba
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(res.url).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/owner\/repo-media\/main\/\d{8}-2cf24dba-hello\.png$/
    )
    // 背景アップロードの完了を待つ
    expect(await res.uploadDone).toBe(true)

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

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(res.url).toMatch(/\/owner\/repo-media\/main\/\d{8}-2cf24dba-hello\.png$/)
    // オフラインは即時試行せずキュー保留＝uploadDone は false に即解決
    expect(await res.uploadDone).toBe(false)
    expect(mock.calls).toHaveLength(0)
    expect(mediaStore.pending.size).toBe(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('存在チェックが 200 なら同名=同内容として PUT をスキップし dequeue+cache する', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } }).on('GET', CONTENTS, { status: 200, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)
    expect(mock.callsMatching('PUT', CONTENTS)).toHaveLength(0)
    expect(mediaStore.pending.size).toBe(0)
    expect(mediaStore.cache.size).toBe(1)
    mock.assertDrained()
  })

  it('存在チェック GET は object メディアタイプを送る（1MB超の既存ファイルでも 403 でなく 200 になり dedup が成立する #252）', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } }).on('GET', CONTENTS, { status: 200, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('big.png', 'big'), makeSettings())
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    await res.uploadDone

    // 既定の JSON 表現は 1MB 超の既存ファイルに 403（too_large）を返し、
    // dedup 不能 → 永遠に pending 残留になる。object なら 1〜100MB でも 200
    const existsGet = mock.firstCall('GET', CONTENTS)
    expect(existsGet!.headers.Accept).toBe('application/vnd.github.object+json')
  })

  it('PUT 422（並行作成 race）は成功扱いで dequeue+cache する', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, { status: 422, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)
    expect(mediaStore.pending.size).toBe(0)
    expect(mediaStore.cache.size).toBe(1)
    mock.assertDrained()
  })

  it('PUT 500 は uploadDone:false で pending に残り cache には載らない', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, { status: 500, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(res.url).toEqual(expect.any(String))
    expect(await res.uploadDone).toBe(false)
    expect(mediaStore.pending.size).toBe(1)
    expect(mediaStore.cache.size).toBe(0)
  })

  it('存在チェックが 403 なら uploadDone:false で pending に残る', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } }).on('GET', CONTENTS, { status: 403, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(false)
    expect(mock.callsMatching('PUT', CONTENTS)).toHaveLength(0)
    expect(mediaStore.pending.size).toBe(1)
  })

  it('ensureMediaRepo 失敗（リポ GET 500）なら contents 系 fetch に進まず pending に残る', async () => {
    mock.on('GET', REPO_GET, { status: 500, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(false)
    expect(mock.callsMatching('GET', CONTENTS)).toHaveLength(0)
    expect(mock.callsMatching('PUT', CONTENTS)).toHaveLength(0)
    expect(mediaStore.pending.size).toBe(1)
  })

  it('通信自体が throw しても uploadDone:false + console.warn で pending に残る（error は出さない）', async () => {
    // リポ確認だけ成功させ、存在チェックの fetch を throw させる（キュー空 = throw）
    mock.on('GET', REPO_GET, { json: { id: 1 } })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('hello.png', 'hello'), makeSettings())

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(false)
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
    // 背景アップロードはグローバル直列チェーンで流れるため、1件目→2件目の順で解決する
    expect(await first.uploadDone).toBe(true)
    expect(await second.uploadDone).toBe(true)
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

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)
    expect(mediaStore.fns.putCachedMedia).toHaveBeenCalledTimes(1)
    expect(mediaStore.cache.size).toBe(1)
  })

  it('20MB+1 のアップロード成功は uploadDone:true だが cache には載らない', async () => {
    mock.on('GET', REPO_GET, { json: { id: 1 } }).on('GET', CONTENTS, { status: 200, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(
      makeFile('over.png', new Uint8Array(MEDIA_CACHE_MAX_ENTRY_BYTES + 1)),
      makeSettings()
    )

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)
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

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(res.url).toEqual(expect.any(String))
    expect(await res.uploadDone).toBe(false)
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
describe('履歴を残さないコミット方式（#250 collapseMediaHistory 配線）', () => {
  const GIT_COMMITS = '/repos/owner/repo-media/git/commits'
  const REF_GET = '/repos/owner/repo-media/git/ref/heads/'
  const REF_PATCH = '/repos/owner/repo-media/git/refs/heads/'
  /** PUT 応答に commit 情報を含める（実 API と同形） */
  const PUT_WITH_COMMIT = {
    status: 201,
    json: { content: {}, commit: { sha: 'c-put', tree: { sha: 't-put' } } },
  }

  it('PUT 成功後、同じ tree の親なしコミットを作り ref を force 更新してリポを1コミットに保つ', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1, default_branch: 'main' } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, PUT_WITH_COMMIT)
      .on('POST', GIT_COMMITS, { status: 201, json: { sha: 'c-orphan' } })
      .on('GET', REF_GET, { json: { object: { sha: 'c-put' } } })
      .on('PATCH', REF_PATCH, { json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('a.png', 'data'), makeSettings())
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)

    // 親なしコミット（parents: []・PUT と同じ tree）
    const commitCall = mock.firstCall('POST', GIT_COMMITS)
    expect(commitCall!.body).toEqual({
      message: 'Agasteer media snapshot',
      tree: 't-put',
      parents: [],
    })
    // ref は default branch へ force 更新
    const patchCall = mock.firstCall('PATCH', REF_PATCH)
    expect(patchCall!.url).toContain('/git/refs/heads/main')
    expect(patchCall!.body).toEqual({ sha: 'c-orphan', force: true })
    expect(mediaStore.pending.size).toBe(0)
    mock.assertDrained()
  })

  it('HEAD が別コミット（並行変更）なら force 更新をスキップし、自ファイルの存在を確認してから dequeue する', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1, default_branch: 'main' } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, PUT_WITH_COMMIT)
      .on('POST', GIT_COMMITS, { status: 201, json: { sha: 'c-orphan' } })
      .on('GET', REF_GET, { json: { object: { sha: 'c-someone-else' } } })
      // 並行変更検知後の存在再確認 → 200（自ファイルは生きている）→ dequeue してよい
      .on('GET', CONTENTS, { status: 200, json: {} })
    // PATCH はキューしない = 呼ばれたら fetch-mock が throw して検出される
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('a.png', 'data'), makeSettings())
    if (!res.ok) throw new Error('unreachable')
    // collapse スキップでもアップロード自体は成功（best-effort）
    expect(await res.uploadDone).toBe(true)
    expect(mediaStore.pending.size).toBe(0)
    mock.assertDrained()
  })

  it('並行変更検知 + 自ファイルが HEAD から消えていた（clobber）ら dequeue せず pending に残す', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1, default_branch: 'main' } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, PUT_WITH_COMMIT)
      .on('POST', GIT_COMMITS, { status: 201, json: { sha: 'c-orphan' } })
      .on('GET', REF_GET, { json: { object: { sha: 'c-someone-else' } } })
      // 存在再確認 → 404 = 他デバイスの force 差し替えに巻き込まれて消えた
      .on('GET', CONTENTS, { status: 404, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('a.png', 'data'), makeSettings())
    if (!res.ok) throw new Error('unreachable')
    // pending に残る＝リトライが dedup 経由で再アップロードして自己修復する
    expect(await res.uploadDone).toBe(false)
    expect(mediaStore.pending.size).toBe(1)
    mock.assertDrained()
  })

  it('バッチ最適化: 自分の後ろに pending が残っている間は履歴畳みを後続に委ねる', async () => {
    // 後続アイテムを pending に仕込む（バッチ添付の途中を再現）
    seedPending('20990101-ffffffff-later.png', 9_999_999_999_999)
    mock
      .on('GET', REPO_GET, { json: { id: 1, default_branch: 'main' } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, PUT_WITH_COMMIT)
    // git 系はキューしない = 呼ばれたら fetch-mock が throw して検出される
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('a.png', 'data'), makeSettings())
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)
    expect(mock.callsMatching('POST', GIT_COMMITS)).toHaveLength(0)
    // 自分は dequeue され、後続だけが残る
    expect(mediaStore.pending.size).toBe(1)
    mock.assertDrained()
  })

  it('親なしコミット作成が失敗しても ref には触れず、アップロード成功は覆らない', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1, default_branch: 'main' } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, PUT_WITH_COMMIT)
      .on('POST', GIT_COMMITS, { status: 500, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('a.png', 'data'), makeSettings())
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)
    mock.assertDrained()
  })

  it('PUT 応答に commit 情報が無ければ履歴畳みは行わない（422 race 等の防御）', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, { status: 200, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('a.png', 'data'), makeSettings())
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)
    // git 系エンドポイントには一切触れない
    expect(mock.callsMatching('POST', GIT_COMMITS)).toHaveLength(0)
    mock.assertDrained()
  })

  it('default branch は ensureMediaRepo の応答から捕捉される（main 以外にも追従）', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1, default_branch: 'trunk' } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, PUT_WITH_COMMIT)
      .on('POST', GIT_COMMITS, { status: 201, json: { sha: 'c-orphan' } })
      .on('GET', '/git/ref/heads/trunk', { json: { object: { sha: 'c-put' } } })
      .on('PATCH', '/git/refs/heads/trunk', { json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('a.png', 'data'), makeSettings())
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)
    expect(mock.firstCall('GET', '/git/ref/heads/trunk')).toBeDefined()
    mock.assertDrained()
  })
})

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

  // #264: 下の call!.url の完全一致アサーションは、raw URL のブランチセグメント
  // （常に main）が ref クエリパラメータとしてこの fetch に付かないこと（=
  // fetchMedia は常に default branch を対象にする構造的契約）も併せて固定化する。
  // URL に `?ref=main` 等が付けば厳密一致が崩れて検知できる。
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

  // #264 の構造的契約（parsed.branch を ref に付けない = 常に default branch を
  // 取りに行く）を守るテスト。resolveMedia の「解決順3」テストは pending/cache
  // 層を経由する間接テストなので、こちらは fetchMedia を直接呼ぶ最小構成にして
  // 重複を避ける。
  it('リクエスト URL は ref・クエリパラメータを一切付けず default branch を対象にする（#264 構造的契約）', async () => {
    mock.on('GET', `/repos/owner/repo-media/contents/${RAW_PATH}`, { text: 'REMOTE' })
    const media = await loadMedia()

    const res = await media.fetchMedia(RAW_URL, makeSettings())

    expect(res.ok).toBe(true)
    const call = mock.firstCall('GET', `/repos/owner/repo-media/contents/${RAW_PATH}`)
    expect(call!.url).toBe(`https://api.github.com/repos/owner/repo-media/contents/${RAW_PATH}`)
    mock.assertDrained()
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

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(true)
    expect(mediaStore.fns.deletePendingMedia).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      'Media cache write failed (ignored):',
      expect.anything()
    )
    expect(console.error).not.toHaveBeenCalled()
  })
})

// ============================================
// 背景アップロードの直列性・状態遷移結合（#247）
// ============================================
describe('背景アップロードの直列性・結合（#247）', () => {
  it('T1 直列性: 2件同時 enqueue で contents fetch が f1→f2 に直列化される（f1 完了まで f2 は fetch されない）', async () => {
    const serial = makeSerialFetch()
    vi.stubGlobal('fetch', serial.fn)
    const media = await loadMedia()

    // 異なる内容 → 別 filename・別 contents URL。await で enqueue+チェーン連結を f1→f2 順に確定
    const r1 = await media.uploadMedia(makeFile('f1.png', 'one'), makeSettings())
    const r2 = await media.uploadMedia(makeFile('f2.png', 'two'), makeSettings())
    if (!r1.ok || !r2.ok) throw new Error('unreachable')
    const f1Path = r1.url.split('/').pop() as string
    const f2Path = r2.url.split('/').pop() as string
    await flushAsync()

    // f1 の存在チェックだけが飛び、f2 の contents fetch はまだ呼ばれない
    expect(serial.contentsPaths()).toEqual([f1Path])

    // f1 を解決すると初めて f2 の contents fetch が発火する
    serial.resolveContents(f1Path, 200)
    expect(await r1.uploadDone).toBe(true)
    await flushAsync()
    expect(serial.contentsPaths()).toEqual([f1Path, f2Path])

    // 後始末: f2 も解決して uploadDone を回収する（浮きプロミス防止）
    serial.resolveContents(f2Path, 200)
    expect(await r2.uploadDone).toBe(true)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('T2 直列性: チェーン内の失敗（f1 PUT500）が後続 f2 を止めない（末尾 then の飲み込み）', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} }) // f1 存在チェック
      .on('PUT', CONTENTS, { status: 500, json: {} }) // f1 PUT 失敗
      .on('GET', CONTENTS, { status: 200, json: {} }) // f2 存在チェック（dedup 成功）
    const media = await loadMedia()

    const r1 = await media.uploadMedia(makeFile('f1.png', 'one'), makeSettings())
    const r2 = await media.uploadMedia(makeFile('f2.png', 'two'), makeSettings())
    if (!r1.ok || !r2.ok) throw new Error('unreachable')

    // f1 は失敗（false・pending 残）、f2 は成功（true・dequeue+cache）。失敗が後続を止めない
    expect(await r1.uploadDone).toBe(false)
    expect(await r2.uploadDone).toBe(true)
    const f1Path = r1.url.split('/').pop() as string
    expect([...mediaStore.pending.keys()]).toEqual([f1Path])
    expect(mediaStore.cache.has(r2.url)).toBe(true)
    expect(mediaStore.cache.has(r1.url)).toBe(false)
    mock.assertDrained()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('T3 表A8: 背景 PUT 409（並行コミット衝突）は false でキュー保留・cache 非載せ（直列化の存在理由）', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, { status: 409, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('c.png', 'conflict'), makeSettings())
    if (!res.ok) throw new Error('unreachable')

    expect(await res.uploadDone).toBe(false)
    expect(mediaStore.pending.size).toBe(1)
    expect(mediaStore.cache.size).toBe(0)
    mock.assertDrained()
  })

  it('T4 offline: offline enqueue はチェーンを塞がない（in-flight の f1 完了を待たず f2 が即 false 解決）', async () => {
    const serial = makeSerialFetch()
    vi.stubGlobal('fetch', serial.fn)
    const media = await loadMedia()

    // f1 は online で in-flight（存在チェックを保留）
    const r1 = await media.uploadMedia(makeFile('f1.png', 'one'), makeSettings())
    if (!r1.ok) throw new Error('unreachable')
    const f1Path = r1.url.split('/').pop() as string
    await flushAsync()
    expect(serial.contentsPaths()).toEqual([f1Path]) // f1 は fetch 中

    // f2 は offline → 即 false 解決・fetch せず・チェーンにも乗らない
    vi.stubGlobal('navigator', { onLine: false })
    const r2 = await media.uploadMedia(makeFile('f2.png', 'two'), makeSettings())
    if (!r2.ok) throw new Error('unreachable')
    const f2Path = r2.url.split('/').pop() as string
    expect(await r2.uploadDone).toBe(false) // f1 未解決のまま解決する（塞がれない）
    expect(serial.contentsPaths()).toEqual([f1Path]) // f2 の contents fetch は無い

    // 後から f1 を解決しても f2 に影響なし。offline の f2 は pending に残る
    serial.resolveContents(f1Path, 200)
    expect(await r1.uploadDone).toBe(true)
    await flushAsync()
    expect(mediaStore.pending.has(f2Path)).toBe(true)
    expect(mediaStore.pending.has(f1Path)).toBe(false)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('T5 結合: 背景 PUT500 で pending 残（URL 一致）→ retryPendingUploads で同一 item を回収し孤児化しない', async () => {
    mock
      .on('GET', REPO_GET, { json: { id: 1 } })
      .on('GET', CONTENTS, { status: 404, json: {} })
      .on('PUT', CONTENTS, { status: 500, json: {} })
    const media = await loadMedia()

    const res = await media.uploadMedia(makeFile('r.png', 'retry'), makeSettings())
    if (!res.ok) throw new Error('unreachable')
    expect(await res.uploadDone).toBe(false)
    expect(mediaStore.pending.size).toBe(1)
    // pending item の URL は enqueue 時に挿入した URL と一致（挿入済み URL が孤児化しない前提）
    const item = [...mediaStore.pending.values()][0]
    expect(item.url).toBe(res.url)

    // online 復帰相当の retry で同一 item を回収（repo GET はメモ化済みなので飛ばない）
    mock.on('GET', CONTENTS, { status: 200, json: {} })
    const retryRes = await media.retryPendingUploads(makeSettings())

    expect(retryRes).toEqual({ attempted: 1, uploaded: 1 })
    expect(mediaStore.pending.size).toBe(0)
    mock.assertDrained()
    expect(console.error).not.toHaveBeenCalled()
  })
})
