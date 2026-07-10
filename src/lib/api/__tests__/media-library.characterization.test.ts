/**
 * Characterization テスト（#250）— メディアライブラリ同期層（media-library.ts）
 *
 * 対象: listMediaAssets / deleteMediaAsset の配線
 *   - 404（メディアリポ未作成）→ 成功・空配列
 *   - 一覧成功 → Contents API 配列を MediaAsset に変換
 *   - 削除成功 → DELETE 送信（sha 同梱）＋ ローカル cache/pending の evict
 *   - 未設定 → not_configured
 *
 * 本番コードは変更しない。fetch は github/__tests__ の fetch-mock、
 * IndexedDB アクセサ（media-storage）は in-memory Map でモックする。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createFetchMock, makeSettings, type FetchMock } from '../github/__tests__/fetch-mock'

const mediaStore = vi.hoisted(() => {
  const pending = new Map<string, any>()
  const cache = new Map<string, any>()
  const fns = {
    deleteCachedMedia: vi.fn(async (url: string) => {
      cache.delete(url)
    }),
    deletePendingMedia: vi.fn(async (filename: string) => {
      pending.delete(filename)
    }),
  }
  return { pending, cache, fns }
})

vi.mock('../../data/media-storage', () => mediaStore.fns)

type LibraryModule = typeof import('../media-library')

async function loadLibrary(): Promise<LibraryModule> {
  return await import('../media-library')
}

let mock: FetchMock

beforeEach(() => {
  vi.resetModules()
  mediaStore.pending.clear()
  mediaStore.cache.clear()
  mediaStore.fns.deleteCachedMedia.mockClear()
  mediaStore.fns.deletePendingMedia.mockClear()
  mock = createFetchMock()
  vi.stubGlobal('fetch', mock.fn)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listMediaAssets', () => {
  it('未設定なら not_configured（fetch しない）', async () => {
    const { listMediaAssets } = await loadLibrary()
    const result = await listMediaAssets(makeSettings({ token: '' }))
    expect(result).toEqual({ ok: false, errorKind: 'not_configured' })
    expect(mock.calls.length).toBe(0)
  })

  it('404（メディアリポ未作成）は成功扱いで空配列', async () => {
    mock.on('GET', '/repo-media/contents/', { status: 404, json: { message: 'Not Found' } })
    const { listMediaAssets } = await loadLibrary()
    const result = await listMediaAssets(makeSettings())
    expect(result).toEqual({ ok: true, assets: [] })
  })

  it('一覧成功で Contents API 配列を MediaAsset に変換する', async () => {
    mock.on('GET', '/repo-media/contents/', {
      status: 200,
      json: [
        { name: '20260101-aa-x.png', path: '20260101-aa-x.png', size: 10, sha: 's1', type: 'file' },
        { name: '.gitkeep', path: '.gitkeep', size: 0, sha: 's2', type: 'file' },
        { name: 'sub', path: 'sub', size: 0, sha: 's3', type: 'dir' },
      ],
    })
    const { listMediaAssets } = await loadLibrary()
    const result = await listMediaAssets(makeSettings())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.assets).toHaveLength(1)
      expect(result.assets[0].name).toBe('20260101-aa-x.png')
      expect(result.assets[0].rawUrl).toBe(
        'https://raw.githubusercontent.com/owner/repo-media/main/20260101-aa-x.png'
      )
    }
  })

  it('404 以外の HTTP エラーは fetch_failed（httpStatus 付き）', async () => {
    mock.on('GET', '/repo-media/contents/', { status: 500, json: {} })
    const { listMediaAssets } = await loadLibrary()
    const result = await listMediaAssets(makeSettings())
    expect(result).toEqual({ ok: false, errorKind: 'fetch_failed', httpStatus: 500 })
  })

  it('401 / 403（認証エラー）も fetch_failed＋httpStatus（res.status をそのまま載せる）', async () => {
    mock.on('GET', '/repo-media/contents/', { status: 401, json: {} })
    mock.on('GET', '/repo-media/contents/', { status: 403, json: {} })
    const { listMediaAssets } = await loadLibrary()
    expect(await listMediaAssets(makeSettings())).toEqual({
      ok: false,
      errorKind: 'fetch_failed',
      httpStatus: 401,
    })
    expect(await listMediaAssets(makeSettings())).toEqual({
      ok: false,
      errorKind: 'fetch_failed',
      httpStatus: 403,
    })
  })

  it('fetch が throw（ネットワーク断）→ fetch_failed（httpStatus なし）＋ console.error', async () => {
    // 例外系は fetch-mock のキューでなく、reject する fetch を直接差し込んで再現する
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
      const { listMediaAssets } = await loadLibrary()
      const result = await listMediaAssets(makeSettings())
      // toEqual の完全一致で httpStatus が付いていないことも同時に固定する
      expect(result).toEqual({ ok: false, errorKind: 'fetch_failed' })
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('200 だが配列でない JSON（想定外応答）は ok・空配列にする（Array.isArray ガード）', async () => {
    mock.on('GET', '/repo-media/contents/', { status: 200, json: { message: 'not an array' } })
    const { listMediaAssets } = await loadLibrary()
    const result = await listMediaAssets(makeSettings())
    expect(result).toEqual({ ok: true, assets: [] })
  })
})

describe('deleteMediaAsset', () => {
  it('DELETE を sha 同梱で送り、成功で cache/pending を evict する', async () => {
    mediaStore.cache.set(
      'https://raw.githubusercontent.com/owner/repo-media/main/20260101-aa-x.png',
      {}
    )
    mediaStore.pending.set('20260101-aa-x.png', {})
    mock.on('DELETE', '/repo-media/contents/20260101-aa-x.png', { status: 200, json: {} })

    const { deleteMediaAsset } = await loadLibrary()
    const result = await deleteMediaAsset(makeSettings(), '20260101-aa-x.png', 'sha-xyz')

    expect(result).toEqual({ ok: true })
    const call = mock.firstCall('DELETE', '/repo-media/contents/')
    expect(call?.body?.sha).toBe('sha-xyz')
    expect(mediaStore.fns.deleteCachedMedia).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/owner/repo-media/main/20260101-aa-x.png'
    )
    expect(mediaStore.fns.deletePendingMedia).toHaveBeenCalledWith('20260101-aa-x.png')
  })

  it('HTTP エラーは fetch_failed（evict しない）', async () => {
    mock.on('DELETE', '/repo-media/contents/', { status: 409, json: {} })
    const { deleteMediaAsset } = await loadLibrary()
    const result = await deleteMediaAsset(makeSettings(), '20260101-aa-x.png', 'sha-xyz')
    expect(result).toEqual({ ok: false, errorKind: 'fetch_failed', httpStatus: 409 })
    expect(mediaStore.fns.deleteCachedMedia).not.toHaveBeenCalled()
  })

  it('未設定なら not_configured（fetch しない）', async () => {
    const { deleteMediaAsset } = await loadLibrary()
    const result = await deleteMediaAsset(
      makeSettings({ token: '' }),
      '20260101-aa-x.png',
      'sha-xyz'
    )
    expect(result).toEqual({ ok: false, errorKind: 'not_configured' })
    expect(mock.calls.length).toBe(0)
  })

  it('DELETE が throw → fetch_failed ＋ console.error（evict しない）', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
      const { deleteMediaAsset } = await loadLibrary()
      const result = await deleteMediaAsset(makeSettings(), '20260101-aa-x.png', 'sha-xyz')
      expect(result).toEqual({ ok: false, errorKind: 'fetch_failed' })
      expect(errorSpy).toHaveBeenCalled()
      expect(mediaStore.fns.deleteCachedMedia).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('削除成功後に evict（cache/pending）が reject しても ok:true（allSettled で握り潰す）', async () => {
    // リモート削除は既に成立しているため、ローカル evict の失敗で結果を失敗にしない
    mediaStore.fns.deleteCachedMedia.mockRejectedValueOnce(new Error('idb read fail'))
    mediaStore.fns.deletePendingMedia.mockRejectedValueOnce(new Error('idb read fail'))
    mock.on('DELETE', '/repo-media/contents/20260101-aa-x.png', { status: 200, json: {} })
    const { deleteMediaAsset } = await loadLibrary()
    const result = await deleteMediaAsset(makeSettings(), '20260101-aa-x.png', 'sha-xyz')
    expect(result).toEqual({ ok: true })
  })

  it('特殊文字を含む path は encodeURIComponent で送り、body に message/committer/sha を積む', async () => {
    const path = 'a b+c.png'
    mock.on('DELETE', '/repo-media/contents/', { status: 200, json: {} })
    const { deleteMediaAsset } = await loadLibrary()
    const result = await deleteMediaAsset(makeSettings(), path, 'sha-777')
    expect(result).toEqual({ ok: true })
    const call = mock.firstCall('DELETE', '/repo-media/contents/')
    // 生パス（空白・+）は URL に出さず、必ず percent-encode したものを宛先にする
    expect(call?.url).toContain(`/contents/${encodeURIComponent(path)}`)
    expect(call?.url).toContain('/contents/a%20b%2Bc.png')
    expect(call?.url).not.toContain('a b+c.png')
    expect(call?.body).toMatchObject({
      message: `Agasteer media delete: ${path}`,
      sha: 'sha-777',
      committer: { name: 'agasteer', email: 'agasteer@users.noreply.github.com' },
    })
  })
})
