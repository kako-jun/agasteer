/**
 * メディア同期層の IndexedDB タイムアウト（#261）のテスト
 *
 * #252 はチェーン経路の fetch を有限化したが、IndexedDB 操作（enqueue・dequeue・
 * キャッシュ書き込み・リトライの getAll）が無期限のままだと、IDB のハング
 * （Safari プライベートモード・storage pressure・別タブの versionchange ブロック等）で
 * 同型の head-of-line blocking / retryInFlight の恒久ウェッジが再発する。
 * 各経路が MEDIA_IDB_TIMEOUT_MS で「失敗に落ちて前進する」ことを固定する。
 *
 * media.ts はモジュールレベル状態（uploadChain / ensuredMediaRepos / retryInFlight）を
 * 持つため、vi.resetModules() + 動的 import で毎テスト素にする。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { makeSettings } from '../github/__tests__/fetch-mock'

// ============================================
// media-storage の in-memory モック（media-timeout.test.ts と同型）
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

type MediaModule = typeof import('../media')

async function loadMedia(): Promise<MediaModule> {
  return await import('../media')
}

function makeFile(name: string, content: string): File {
  return new File([new TextEncoder().encode(content) as BlobPart], name, { type: 'image/png' })
}

/** settle しない Promise（IDB ハングの再現） */
function hangForever(): Promise<never> {
  return new Promise<never>(() => {})
}

/** ルーティング可能な fetch スタブ（このファイルの経路は hang 不要なので即応答のみ） */
function makeRoutedFetch(route: (url: string, method: string) => Response) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    return Promise.resolve(route(url, method))
  })
}

const ok = (json: unknown = {}) => new Response(JSON.stringify(json), { status: 200 })
const notFound = () => new Response('{}', { status: 404 })

/** 「存在チェック 404 → PUT 成功（commit なし＝履歴畳みスキップ）」の標準ルート */
function routeUploadHappyPath(url: string, method: string): Response {
  if (method === 'PUT') return ok({})
  if (url.includes('/contents/')) return notFound()
  return ok({ id: 1, default_branch: 'main' }) // リポ存在確認
}

/** uploadMedia の結果を enqueue 成功側に型ナローイングする */
function assertEnqueued(
  result: Awaited<ReturnType<MediaModule['uploadMedia']>>
): asserts result is Extract<Awaited<ReturnType<MediaModule['uploadMedia']>>, { ok: true }> {
  if (!('uploadDone' in result)) throw new Error('enqueue に失敗した')
}

/** fake timers 環境でマイクロタスクを流しきる */
async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

/**
 * ハング対象のモックが呼ばれる（＝raceWithTimeout のタイマーが同期的に登録される）
 * まで待つ。到達までの経路に fake timers 外の実 async（file.arrayBuffer /
 * crypto.subtle.digest / Response.json）が挟まるため、マイクロタスクのフラッシュ
 * だけでは足りず、遅い CI 環境ではタイマー未登録のまま advance して発火し損ねる
 * （実際に CI で flake した）。vi.waitFor は fake timers 下でも実時間でポーリングする
 */
async function waitForHangReached(fn: ReturnType<typeof vi.fn>): Promise<void> {
  await vi.waitFor(() => expect(fn).toHaveBeenCalled())
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  mediaStore.pending.clear()
  mediaStore.cache.clear()
  for (const fn of Object.values(mediaStore.fns)) {
    fn.mockReset()
  }
  vi.stubGlobal('navigator', { onLine: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('raceWithTimeout（純粋層）', () => {
  it('期限内に解決すればそのまま値を返し、タイマーは残らない', async () => {
    const media = await loadMedia()
    await expect(media.raceWithTimeout(Promise.resolve('value'), 1000, 'op')).resolves.toBe('value')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('期限内の reject はそのまま透過する', async () => {
    const media = await loadMedia()
    await expect(
      media.raceWithTimeout(Promise.reject(new Error('boom')), 1000, 'op')
    ).rejects.toThrow('boom')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settle しない Promise はラベル入りエラーで reject する', async () => {
    const media = await loadMedia()
    const raced = media.raceWithTimeout(hangForever(), 1000, 'putPendingMedia')
    const assertion = expect(raced).rejects.toThrow('putPendingMedia timed out after 1000ms')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })
})

describe('uploadMedia の enqueue（putPendingMedia）ハング', () => {
  it('タイムアウトで storage_failed に落ち、添付フローが無限待ちにならない', async () => {
    const media = await loadMedia()
    mediaStore.fns.putPendingMedia.mockImplementationOnce(hangForever)
    vi.stubGlobal('fetch', makeRoutedFetch(routeUploadHappyPath))

    const resultPromise = media.uploadMedia(makeFile('x.png', 'data-a'), makeSettings())
    await waitForHangReached(mediaStore.fns.putPendingMedia)
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)

    await expect(resultPromise).resolves.toEqual({ ok: false, errorKind: 'storage_failed' })
  })
})

describe('uploadPendingItem のチェーン経路の IDB ハング', () => {
  it('dequeue（deletePendingMedia）のハングは false（pending 残置）に落ち、チェーンは前進する', async () => {
    const media = await loadMedia()
    mediaStore.fns.deletePendingMedia.mockImplementationOnce(hangForever)
    vi.stubGlobal('fetch', makeRoutedFetch(routeUploadHappyPath))

    const first = await media.uploadMedia(makeFile('x.png', 'data-a'), makeSettings())
    assertEnqueued(first)
    await waitForHangReached(mediaStore.fns.deletePendingMedia)
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)
    // アップロード自体は成立しているが dequeue できなかったので false（リトライで dedup 回収）
    await expect(first.uploadDone).resolves.toBe(false)

    // チェーンがウェッジしていない: 2 件目は通常どおり完了する
    const second = await media.uploadMedia(makeFile('y.png', 'data-b'), makeSettings())
    assertEnqueued(second)
    await flushMicrotasks()
    await expect(second.uploadDone).resolves.toBe(true)
    // 1 件目は pending に残る（データ喪失なし）、2 件目は dequeue 済み
    expect(mediaStore.pending.size).toBe(1)
  })

  it('履歴畳み前の getAllPendingMedia ハングも false（pending 残置）に落ちる', async () => {
    const media = await loadMedia()
    mediaStore.fns.getAllPendingMedia.mockImplementationOnce(hangForever)
    // PUT が commit を返すと履歴畳みのバッチ判定（getAllPendingMedia）に入る
    vi.stubGlobal(
      'fetch',
      makeRoutedFetch((url, method) => {
        if (method === 'PUT') return ok({ commit: { sha: 'c1', tree: { sha: 't1' } } })
        if (url.includes('/contents/')) return notFound()
        return ok({ id: 1, default_branch: 'main' })
      })
    )

    const result = await media.uploadMedia(makeFile('x.png', 'data-a'), makeSettings())
    assertEnqueued(result)
    await waitForHangReached(mediaStore.fns.getAllPendingMedia)
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)

    await expect(result.uploadDone).resolves.toBe(false)
    expect(mediaStore.pending.size).toBe(1)
  })

  it('キャッシュ書き込み（putCachedMedia）のハングは best-effort なので true を覆さない', async () => {
    const media = await loadMedia()
    mediaStore.fns.putCachedMedia.mockImplementationOnce(hangForever)
    vi.stubGlobal('fetch', makeRoutedFetch(routeUploadHappyPath))

    const result = await media.uploadMedia(makeFile('x.png', 'data-a'), makeSettings())
    assertEnqueued(result)
    await waitForHangReached(mediaStore.fns.putCachedMedia)
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)

    await expect(result.uploadDone).resolves.toBe(true)
    expect(mediaStore.pending.size).toBe(0)
  })

  it('キャッシュメタ読み（getAllCachedMediaMeta）のハングも best-effort なので true を覆さない', async () => {
    const media = await loadMedia()
    mediaStore.fns.getAllCachedMediaMeta.mockImplementationOnce(hangForever)
    vi.stubGlobal('fetch', makeRoutedFetch(routeUploadHappyPath))

    const result = await media.uploadMedia(makeFile('x.png', 'data-a'), makeSettings())
    assertEnqueued(result)
    await waitForHangReached(mediaStore.fns.getAllCachedMediaMeta)
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)

    await expect(result.uploadDone).resolves.toBe(true)
    expect(mediaStore.pending.size).toBe(0)
  })

  it('LRU 追い出し（deleteCachedMedia）のハングも best-effort なので true を覆さない', async () => {
    const media = await loadMedia()
    // 総量上限（200MB）を超える既存エントリを積み、追い出しを発生させる
    mediaStore.cache.set('https://raw.githubusercontent.com/o/r-media/main/old.png', {
      url: 'https://raw.githubusercontent.com/o/r-media/main/old.png',
      size: 250 * 1024 * 1024,
      lastAccessedAt: 1,
      data: new ArrayBuffer(0),
    })
    mediaStore.fns.deleteCachedMedia.mockImplementationOnce(hangForever)
    vi.stubGlobal('fetch', makeRoutedFetch(routeUploadHappyPath))

    const result = await media.uploadMedia(makeFile('x.png', 'data-a'), makeSettings())
    assertEnqueued(result)
    await waitForHangReached(mediaStore.fns.deleteCachedMedia)
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)

    await expect(result.uploadDone).resolves.toBe(true)
    expect(mediaStore.pending.size).toBe(0)
  })
})

describe('retryPendingUploads の getAllPendingMedia ハング', () => {
  it('タイムアウトで {0,0} に落ち、retryInFlight が解除されて次回リトライは実行できる', async () => {
    const media = await loadMedia()
    // オフライン enqueue で pending に 1 件積む（チェーンには乗らない）
    vi.stubGlobal('navigator', { onLine: false })
    vi.stubGlobal(
      'fetch',
      makeRoutedFetch((url) => {
        // リトライ時の存在チェックを 200 にして dedup 経路で完了させる
        if (url.includes('/contents/')) return ok({})
        return ok({ id: 1, default_branch: 'main' })
      })
    )
    const enqueued = await media.uploadMedia(makeFile('x.png', 'data-a'), makeSettings())
    assertEnqueued(enqueued)
    await expect(enqueued.uploadDone).resolves.toBe(false)
    vi.stubGlobal('navigator', { onLine: true })

    // 1 回目: getAll がハング → タイムアウトで {0,0}（従来はここで retryInFlight が立ちっぱなしになった）
    mediaStore.fns.getAllPendingMedia.mockImplementationOnce(hangForever)
    const firstRetry = media.retryPendingUploads(makeSettings())
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)
    await expect(firstRetry).resolves.toEqual({ attempted: 0, uploaded: 0 })

    // 2 回目: ガードに弾かれず実行され、pending がドレインされる
    const secondRetry = media.retryPendingUploads(makeSettings())
    await flushMicrotasks()
    await expect(secondRetry).resolves.toEqual({ attempted: 1, uploaded: 1 })
    expect(mediaStore.pending.size).toBe(0)
  })
})

describe('resolveMedia のローカルルックアップのハング', () => {
  it('pending / cache のルックアップがハングしても認証 fetch にフォールバックして解決する', async () => {
    const media = await loadMedia()
    mediaStore.fns.getPendingMedia.mockImplementationOnce(hangForever)
    mediaStore.fns.getCachedMedia.mockImplementationOnce(hangForever)
    vi.stubGlobal(
      'fetch',
      makeRoutedFetch(() => new Response(new TextEncoder().encode('media-bytes'), { status: 200 }))
    )

    const url =
      'https://raw.githubusercontent.com/test-owner/test-repo-media/main/20260101-abcd1234-x.png'
    const resultPromise = media.resolveMedia(url, makeSettings())
    // pending ルックアップ → cache ルックアップの 2 段のタイムアウトを順に踏む
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)

    const result = await resultPromise
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(new TextDecoder().decode(result.data)).toBe('media-bytes')
    }
  })

  it('pending ルックアップだけがハングした場合はキャッシュヒットで解決する（tier2 が生きる）', async () => {
    const media = await loadMedia()
    const url =
      'https://raw.githubusercontent.com/test-owner/test-repo-media/main/20260101-abcd1234-x.png'
    mediaStore.fns.getPendingMedia.mockImplementationOnce(hangForever)
    mediaStore.cache.set(url, {
      url,
      data: new TextEncoder().encode('cached-bytes').buffer,
      size: 12,
      lastAccessedAt: 1,
    })
    // fetch に到達したら失敗にする（キャッシュヒットで返ることの証明）
    vi.stubGlobal(
      'fetch',
      makeRoutedFetch(() => new Response('{}', { status: 500 }))
    )

    const resultPromise = media.resolveMedia(url, makeSettings())
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)

    const result = await resultPromise
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(new TextDecoder().decode(result.data)).toBe('cached-bytes')
    }
  })
})

describe('deleteMediaAsset の evict ハング（media-library.ts）', () => {
  it('削除成功後の evict がハングしても ok:true が settle する（削除 UI がぶら下がらない）', async () => {
    const media = await loadMedia()
    const mediaLibrary = await import('../media-library')
    mediaStore.fns.deleteCachedMedia.mockImplementationOnce(hangForever)
    vi.stubGlobal(
      'fetch',
      makeRoutedFetch((url, method) => {
        if (method === 'DELETE') return ok({}) // commit なし＝履歴畳みスキップ
        return ok({ id: 1 })
      })
    )

    const resultPromise = mediaLibrary.deleteMediaAsset(
      makeSettings(),
      '20260101-abcd1234-x.png',
      'sha-1'
    )
    await waitForHangReached(mediaStore.fns.deleteCachedMedia)
    await vi.advanceTimersByTimeAsync(media.MEDIA_IDB_TIMEOUT_MS)

    await expect(resultPromise).resolves.toEqual({ ok: true })
  })
})
