/**
 * メディア背景アップロードの fetch タイムアウト（#252）のテスト
 *
 * #247 のグローバル直列化（uploadChain）は、チェーン内の fetch が永久 pending に
 * なると以後の背景アップロードが全て止まる（head-of-line blocking）。
 * チェーン経路（ensureMediaRepo の GET/POST・存在チェック GET・アップロード PUT）の
 * タイムアウトで、ストールが「false（pending 残置）→ チェーン前進」に落ちることを固定する。
 *
 * media.ts はモジュールレベル状態（uploadChain / ensuredMediaRepos）を持つため、
 * characterization テストと同じく vi.resetModules() + 動的 import で毎テスト素にする。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { makeSettings } from '../github/__tests__/fetch-mock'

// ============================================
// media-storage の in-memory モック（media.characterization.test.ts と同型）
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

/**
 * ルーティング可能な signal 対応 fetch スタブ。
 * ルートが 'hang' を返したら永久 pending にし、init.signal の abort で
 * AbortError reject する（実ブラウザの fetch + AbortController と同じ形）。
 */
function makeAbortableFetch(route: (url: string, method: string) => Response | 'hang') {
  const calls: { url: string; method: string }[] = []
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ url, method })
    const result = route(url, method)
    if (result === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    }
    return Promise.resolve(result)
  })
  return { fn, calls }
}

const ok = (json: unknown = {}) => new Response(JSON.stringify(json), { status: 200 })
const notFound = () => new Response('{}', { status: 404 })

/** uploadMedia の結果を enqueue 成功側に型ナローイングする（4テストで共通） */
function assertEnqueued(
  result: Awaited<ReturnType<MediaModule['uploadMedia']>>
): asserts result is Extract<Awaited<ReturnType<MediaModule['uploadMedia']>>, { ok: true }> {
  if (!('uploadDone' in result)) throw new Error('enqueue に失敗した')
}

/** fake timers 環境でマイクロタスクを流しきる */
async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
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

describe('calcMediaPutTimeoutMs', () => {
  it('下限は MEDIA_PUT_TIMEOUT_BASE_MS（0 byte）', async () => {
    const media = await loadMedia()
    expect(media.calcMediaPutTimeoutMs(0)).toBe(media.MEDIA_PUT_TIMEOUT_BASE_MS)
  })

  it('ペイロードに比例して 50KiB/s 換算の転送時間が加算される', async () => {
    const media = await loadMedia()
    // 10MB / 50KiB/s = 204.8 秒 → 下限 60 秒 + 204,800ms（実装の写経でなく具体値で固定する）
    expect(media.calcMediaPutTimeoutMs(10 * 1024 * 1024)).toBe(60_000 + 204_800)
  })
})

describe('uploadPendingItem のタイムアウト（uploadMedia 経由）', () => {
  it('PUT が永久 pending でもタイムアウトで false に落ち、pending に残る（データ喪失なし）', async () => {
    const media = await loadMedia()
    const fetchStub = makeAbortableFetch((url, method) => {
      if (method === 'PUT') return 'hang'
      if (url.includes('/contents/')) return notFound() // 存在チェック → 新規
      return ok({ id: 1 }) // リポ存在確認
    })
    vi.stubGlobal('fetch', fetchStub.fn)

    const result = await media.uploadMedia(makeFile('x.png', 'data-a'), makeSettings())
    assertEnqueued(result)

    // PUT のタイムアウト（base + サイズ比例）まで進めると abort → false 解決
    await vi.advanceTimersByTimeAsync(media.calcMediaPutTimeoutMs(1024))
    await expect(result.uploadDone).resolves.toBe(false)
    // pending に残る＝online 復帰 / 次回起動の initMediaOnlineRetry で回収可能
    expect(mediaStore.pending.size).toBe(1)
    expect(mediaStore.fns.deletePendingMedia).not.toHaveBeenCalled()
  })

  it('PUT ストール後もチェーンが前進し、後続の背景アップロードが実行される（HOL blocking 解消の核）', async () => {
    const media = await loadMedia()
    let contentsGetCount = 0
    const fetchStub = makeAbortableFetch((url, method) => {
      if (method === 'PUT') return 'hang' // 1件目の PUT がストール
      if (url.includes('/contents/')) {
        contentsGetCount++
        // 1件目の存在チェック → 404（PUT に進んでストール）、2件目 → 200（dedup スキップで成功）
        return contentsGetCount === 1 ? notFound() : ok()
      }
      return ok({ id: 1 })
    })
    vi.stubGlobal('fetch', fetchStub.fn)

    const first = await media.uploadMedia(makeFile('a.png', 'data-a'), makeSettings())
    const second = await media.uploadMedia(makeFile('b.png', 'data-b'), makeSettings())
    assertEnqueued(first)
    assertEnqueued(second)

    // タイムアウト前: 2件目はチェーンで待機中（contents GET は 1 件目の分だけ）
    await flushMicrotasks()
    expect(contentsGetCount).toBe(1)

    // 1件目の PUT タイムアウト経過 → false 解決 → チェーン前進 → 2件目が実行される
    await vi.advanceTimersByTimeAsync(media.calcMediaPutTimeoutMs(1024))
    await expect(first.uploadDone).resolves.toBe(false)
    await flushMicrotasks()
    await expect(second.uploadDone).resolves.toBe(true)
    expect(contentsGetCount).toBe(2)
    // 1件目は pending に残り、2件目は dequeue 済み
    expect(mediaStore.pending.size).toBe(1)
  })

  it('存在チェック GET のストールは MEDIA_API_TIMEOUT_MS で false に落ちる', async () => {
    const media = await loadMedia()
    const fetchStub = makeAbortableFetch((url) => {
      if (url.includes('/contents/')) return 'hang'
      return ok({ id: 1 })
    })
    vi.stubGlobal('fetch', fetchStub.fn)

    const result = await media.uploadMedia(makeFile('x.png', 'data'), makeSettings())
    assertEnqueued(result)

    await vi.advanceTimersByTimeAsync(media.MEDIA_API_TIMEOUT_MS)
    await expect(result.uploadDone).resolves.toBe(false)
    expect(mediaStore.pending.size).toBe(1)
  })

  it('成功する高速アップロードはタイムアウトの影響を受けない（タイマーが残らない）', async () => {
    const media = await loadMedia()
    const fetchStub = makeAbortableFetch((url, method) => {
      if (method === 'PUT') return ok()
      if (url.includes('/contents/')) return notFound()
      return ok({ id: 1 })
    })
    vi.stubGlobal('fetch', fetchStub.fn)

    const result = await media.uploadMedia(makeFile('x.png', 'data'), makeSettings())
    assertEnqueued(result)
    await flushMicrotasks()
    await expect(result.uploadDone).resolves.toBe(true)
    // clearTimeout 済み＝fake timers に未消化タイマーが残っていない
    expect(vi.getTimerCount()).toBe(0)
    // タイムアウト時刻を過ぎても何も起きない（abort の遅発なし）
    const warnCallsBefore = (console.warn as any).mock.calls.length
    await vi.advanceTimersByTimeAsync(media.calcMediaPutTimeoutMs(1024) * 2)
    expect((console.warn as any).mock.calls.length).toBe(warnCallsBefore)
  })
})

describe('ensureMediaRepo のタイムアウト', () => {
  it('リポ存在確認 GET のストールは repo_unavailable に落ちる', async () => {
    const media = await loadMedia()
    const fetchStub = makeAbortableFetch(() => 'hang')
    vi.stubGlobal('fetch', fetchStub.fn)

    const resultPromise = media.ensureMediaRepo(makeSettings())
    await vi.advanceTimersByTimeAsync(media.MEDIA_API_TIMEOUT_MS)
    await expect(resultPromise).resolves.toEqual({ ok: false, errorKind: 'repo_unavailable' })
  })

  it('リポ作成 POST のストールも repo_unavailable に落ちる（404 → POST hang）', async () => {
    const media = await loadMedia()
    const fetchStub = makeAbortableFetch((url, method) => {
      if (method === 'POST') return 'hang'
      return notFound() // リポ GET → 404 で作成に進む
    })
    vi.stubGlobal('fetch', fetchStub.fn)

    const resultPromise = media.ensureMediaRepo(makeSettings())
    await vi.advanceTimersByTimeAsync(media.MEDIA_API_TIMEOUT_MS)
    await expect(resultPromise).resolves.toEqual({ ok: false, errorKind: 'repo_unavailable' })
  })

  it('タイムアウト失敗はメモ化されず、次回は再度確認が走る', async () => {
    const media = await loadMedia()
    let getCount = 0
    const fetchStub = makeAbortableFetch(() => {
      getCount++
      return getCount === 1 ? 'hang' : ok({ id: 1 })
    })
    vi.stubGlobal('fetch', fetchStub.fn)

    const first = media.ensureMediaRepo(makeSettings())
    await vi.advanceTimersByTimeAsync(media.MEDIA_API_TIMEOUT_MS)
    await expect(first).resolves.toEqual({ ok: false, errorKind: 'repo_unavailable' })

    await expect(media.ensureMediaRepo(makeSettings())).resolves.toEqual({ ok: true })
    expect(getCount).toBe(2)
  })
})

describe('非チェーン系 fetch のタイムアウト（#262: 一覧・削除・プレビュー取得）', () => {
  it('listMediaAssets のストールは MEDIA_API_TIMEOUT_MS で fetch_failed に落ちる', async () => {
    const media = await loadMedia()
    const library = await import('../media-library')
    const fetchStub = makeAbortableFetch(() => 'hang')
    vi.stubGlobal('fetch', fetchStub.fn)

    const resultPromise = library.listMediaAssets(makeSettings())
    await vi.advanceTimersByTimeAsync(media.MEDIA_API_TIMEOUT_MS)
    await expect(resultPromise).resolves.toEqual({ ok: false, errorKind: 'fetch_failed' })
  })

  it('deleteMediaAsset のストールは MEDIA_API_TIMEOUT_MS で fetch_failed に落ち evict しない', async () => {
    const media = await loadMedia()
    const library = await import('../media-library')
    const fetchStub = makeAbortableFetch(() => 'hang')
    vi.stubGlobal('fetch', fetchStub.fn)

    const resultPromise = library.deleteMediaAsset(makeSettings(), 'a.png', 'sha-1')
    await vi.advanceTimersByTimeAsync(media.MEDIA_API_TIMEOUT_MS)
    await expect(resultPromise).resolves.toEqual({ ok: false, errorKind: 'fetch_failed' })
    expect(mediaStore.fns.deleteCachedMedia).not.toHaveBeenCalled()
    expect(mediaStore.fns.deletePendingMedia).not.toHaveBeenCalled()
  })

  it('fetchMedia のストールは MEDIA_API_TIMEOUT_MS で fetch_failed に落ちる（プレビューの再試行 UI が受ける）', async () => {
    const media = await loadMedia()
    const fetchStub = makeAbortableFetch(() => 'hang')
    vi.stubGlobal('fetch', fetchStub.fn)

    const resultPromise = media.fetchMedia(
      'https://raw.githubusercontent.com/owner/repo-media/main/a.png',
      makeSettings()
    )
    await vi.advanceTimersByTimeAsync(media.MEDIA_API_TIMEOUT_MS)
    await expect(resultPromise).resolves.toEqual({ ok: false, errorKind: 'fetch_failed' })
  })
})

describe('retryPendingUploads のタイムアウト（自己回復経路）', () => {
  it('1件目がストールしても中断せず、タイムアウト後に 2 件目を試行する', async () => {
    const media = await loadMedia()
    // enqueuedAt 順: old.png（存在チェック hang）→ new.png（200 で dedup 成功）
    mediaStore.pending.set('old.png', {
      filename: 'old.png',
      url: 'https://raw.githubusercontent.com/owner/repo-media/main/old.png',
      data: new Uint8Array(3).buffer,
      size: 3,
      mimeType: 'image/png',
      enqueuedAt: 1,
    })
    mediaStore.pending.set('new.png', {
      filename: 'new.png',
      url: 'https://raw.githubusercontent.com/owner/repo-media/main/new.png',
      data: new Uint8Array(3).buffer,
      size: 3,
      mimeType: 'image/png',
      enqueuedAt: 2,
    })
    const fetchStub = makeAbortableFetch((url) => {
      if (url.includes('old.png')) return 'hang'
      if (url.includes('new.png')) return ok()
      return ok({ id: 1 })
    })
    vi.stubGlobal('fetch', fetchStub.fn)

    const resultPromise = media.retryPendingUploads(makeSettings())
    await vi.advanceTimersByTimeAsync(media.MEDIA_API_TIMEOUT_MS)
    await flushMicrotasks()
    const result = await resultPromise
    expect(result).toEqual({ attempted: 2, uploaded: 1 })
    expect(mediaStore.pending.has('old.png')).toBe(true)
    expect(mediaStore.pending.has('new.png')).toBe(false)
  })
})
