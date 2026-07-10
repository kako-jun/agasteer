// @vitest-environment jsdom
/**
 * メディアライブラリ・コントローラの状態機械 / Blob ライフサイクルのテスト（#250）
 *
 * `MediaLibraryView.svelte` から抽出した `createMediaLibraryController` を、
 * 依存（listMediaAssets / deleteMediaAsset / resolveMedia / confirm / toast）を
 * フェイクで注入して検証する。#244 の media-resolve.dom.test.ts と同型で、
 * jsdom に無い URL.createObjectURL / revokeObjectURL は採番＋カウント付きの
 * stub で代替し、deferred で解決タイミング（race・リーク・連打）を制御する。
 *
 * 純粋層（一覧変換・formatMediaSize・種別判定）は library.test.ts /
 * media-resolve.test.ts が node 環境で担う。ここは副作用と状態遷移だけを見る。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMediaLibraryController } from './library-controller.svelte'
import type { MediaLibraryControllerDeps } from './library-controller.svelte'
import type { Settings } from '../types'
import type { MediaAsset } from '../api/media-library'

// jsdom の URL には createObjectURL / revokeObjectURL がないため stub で代替する
// （URL コンストラクタとしての実挙動は継承）。#244 と同型。
const createObjectURLMock = vi.fn<(obj: Blob | MediaSource) => string>()
const revokeObjectURLMock = vi.fn<(url: string) => void>()
vi.stubGlobal(
  'URL',
  class extends URL {
    static createObjectURL = createObjectURLMock
    static revokeObjectURL = revokeObjectURLMock
  }
)

const MEDIA_BASE = 'https://raw.githubusercontent.com/owner/repo-media/main'
const settings = { token: 't', repoName: 'owner/repo' } as Settings

/** ファイル名から MediaAsset を作る（rawUrl は本機能の raw URL 構造にする＝種別判定が通る） */
function makeAsset(name: string, overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    name,
    path: name,
    size: 1000,
    sha: `sha-${name}`,
    rawUrl: `${MEDIA_BASE}/${name}`,
    ...overrides,
  }
}

const PNG = '20260101-abcd1234-photo.png'
const PNG2 = '20260102-bbbb2222-other.png'
const MP4 = '20260101-abcd1234-clip.mp4'
const MP3 = '20260101-abcd1234-voice.mp3'
const ZIP = '20260101-abcd1234-bundle.zip'

function okFetch() {
  return { ok: true as const, data: new ArrayBuffer(8) }
}

/** resolve/reject を外から制御できる Promise（in-flight 状態の検証用） */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** マイクロタスク連鎖を流しきる */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

let blobUrlCounter = 0

const listMediaAssetsMock = vi.fn()
const deleteMediaAssetMock = vi.fn()
const resolveMediaMock = vi.fn()
const confirmMock = vi.fn()
const toastMock = vi.fn()

function makeController(overrides: Partial<MediaLibraryControllerDeps> = {}) {
  const deps: MediaLibraryControllerDeps = {
    listMediaAssets: listMediaAssetsMock,
    deleteMediaAsset: deleteMediaAssetMock,
    resolveMedia: resolveMediaMock,
    confirm: confirmMock,
    toast: toastMock,
    getSettings: () => settings,
    // 文言化はキー（＋values）をそのまま返すだけの素通しにして、呼び出し内容を assert する
    translate: (key, values) => (values ? `${key} ${JSON.stringify(values)}` : key),
    ...overrides,
  }
  return createMediaLibraryController(deps)
}

beforeEach(() => {
  listMediaAssetsMock.mockReset()
  deleteMediaAssetMock.mockReset()
  resolveMediaMock.mockReset()
  confirmMock.mockReset()
  toastMock.mockReset()
  createObjectURLMock.mockReset()
  revokeObjectURLMock.mockReset()
  blobUrlCounter = 0
  createObjectURLMock.mockImplementation(() => `blob:agasteer/${++blobUrlCounter}`)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('load: 状態遷移', () => {
  it('T12a: loading → loaded（取得したアセットを保持する）', async () => {
    listMediaAssetsMock.mockResolvedValue({
      ok: true,
      assets: [makeAsset(PNG), makeAsset(PNG2)],
    })
    const c = makeController()
    expect(c.loadState).toBe('loading') // 初期状態
    await c.load()
    expect(c.loadState).toBe('loaded')
    expect(c.assets.map((a) => a.path)).toEqual([PNG, PNG2])
  })

  it('truncated: 一覧が切り詰められたフラグを透過し、非 truncated の再読込で消える（#258）', async () => {
    listMediaAssetsMock.mockResolvedValueOnce({
      ok: true,
      assets: [makeAsset(PNG)],
      truncated: true,
    })
    const c = makeController()
    await c.load()
    expect(c.truncated).toBe(true)

    // 再読込で truncated が解消したら通知も消える（古いフラグが残らない）
    listMediaAssetsMock.mockResolvedValueOnce({
      ok: true,
      assets: [makeAsset(PNG)],
      truncated: false,
    })
    await c.load()
    expect(c.truncated).toBe(false)
  })

  it('T12b: loading → 空（0 件でも loaded・View 側で empty 表示）', async () => {
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [] })
    const c = makeController()
    await c.load()
    expect(c.loadState).toBe('loaded')
    expect(c.assets.length).toBe(0)
  })

  it('T12c: loading → error（errorKind を保持）', async () => {
    listMediaAssetsMock.mockResolvedValue({ ok: false, errorKind: 'fetch_failed' })
    const c = makeController()
    await c.load()
    expect(c.loadState).toBe('error')
    expect(c.errorKind).toBe('fetch_failed')
  })
})

describe('errorMessageKey の派生', () => {
  it('T13a: not_configured はライブラリ画面専用の文言キー', async () => {
    listMediaAssetsMock.mockResolvedValue({ ok: false, errorKind: 'not_configured' })
    const c = makeController()
    await c.load()
    expect(c.errorMessageKey).toBe('media.library.notConfigured')
  })

  it('T13b: not_configured 以外は loadFailed キー', async () => {
    listMediaAssetsMock.mockResolvedValue({ ok: false, errorKind: 'fetch_failed' })
    const c = makeController()
    await c.load()
    expect(c.errorMessageKey).toBe('media.library.loadFailed')
  })
})

describe('retry', () => {
  it('T14: loading → error → retry → loaded', async () => {
    listMediaAssetsMock
      .mockResolvedValueOnce({ ok: false, errorKind: 'fetch_failed' })
      .mockResolvedValueOnce({ ok: true, assets: [makeAsset(PNG)] })
    const c = makeController()
    await c.load()
    expect(c.loadState).toBe('error')
    await c.retry()
    expect(c.loadState).toBe('loaded')
    expect(c.assets.map((a) => a.path)).toEqual([PNG])
  })
})

describe('handleDelete', () => {
  it('T15: confirm=true & ok → assets から除去・該当 Blob URL revoke・成功 toast', async () => {
    const img = makeAsset(PNG)
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [img] })
    resolveMediaMock.mockResolvedValue(okFetch())
    confirmMock.mockResolvedValue(true)
    deleteMediaAssetMock.mockResolvedValue({ ok: true })
    const c = makeController()
    await c.load()
    await c.resolveThumb(img) // Blob URL を作っておく（削除時 revoke の対象）
    expect(c.thumbUrls[img.rawUrl]).toBe('blob:agasteer/1')

    await c.handleDelete(img)

    expect(deleteMediaAssetMock).toHaveBeenCalledWith(settings, img.path, img.sha)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:agasteer/1')
    expect(c.thumbUrls[img.rawUrl]).toBeUndefined()
    expect(c.assets.length).toBe(0)
    expect(c.deletingPath).toBeNull()
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining('media.library.deleted'),
      'success'
    )
  })

  it('T16: confirm=false → deleteMediaAsset を呼ばず状態不変', async () => {
    const img = makeAsset(PNG)
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [img] })
    confirmMock.mockResolvedValue(false)
    const c = makeController()
    await c.load()

    await c.handleDelete(img)

    expect(deleteMediaAssetMock).not.toHaveBeenCalled()
    expect(c.assets.map((a) => a.path)).toEqual([PNG])
    expect(c.deletingPath).toBeNull()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('T17: ok=false → 失敗 toast・asset は残存', async () => {
    const img = makeAsset(PNG)
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [img] })
    confirmMock.mockResolvedValue(true)
    deleteMediaAssetMock.mockResolvedValue({ ok: false, errorKind: 'fetch_failed' })
    const c = makeController()
    await c.load()

    await c.handleDelete(img)

    expect(c.assets.map((a) => a.path)).toEqual([PNG]) // 残る
    expect(c.deletingPath).toBeNull()
    expect(toastMock).toHaveBeenCalledWith('media.library.deleteFailed', 'error')
  })

  it('T18: 連打ガード — deletingPath 一致中の再 handleDelete は no-op（confirm 再呼び出しなし）', async () => {
    const img = makeAsset(PNG)
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [img] })
    confirmMock.mockResolvedValue(true)
    const d = deferred<{ ok: true }>()
    deleteMediaAssetMock.mockReturnValue(d.promise) // 削除を in-flight のまま止める
    const c = makeController()
    await c.load()

    const p1 = c.handleDelete(img)
    await flush() // confirm 解決 → deletingPath セット → deleteMediaAsset 呼び出し（未解決）
    expect(c.deletingPath).toBe(img.path)

    const p2 = c.handleDelete(img) // 一致中なので即 return
    await flush()
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(deleteMediaAssetMock).toHaveBeenCalledTimes(1)

    d.resolve({ ok: true })
    await Promise.all([p1, p2])
    expect(c.deletingPath).toBeNull()
  })
})

describe('resolveThumb: 対象判定と重複防止', () => {
  it('T19: 画像のみ解決対象（動画/音声/zip は resolveMedia を呼ばない）', async () => {
    resolveMediaMock.mockResolvedValue(okFetch())
    const c = makeController()
    await c.resolveThumb(makeAsset(PNG)) // image → 解決
    await c.resolveThumb(makeAsset(MP4)) // video → 非対象
    await c.resolveThumb(makeAsset(MP3)) // audio → 非対象
    await c.resolveThumb(makeAsset(ZIP)) // download → 非対象
    expect(resolveMediaMock).toHaveBeenCalledTimes(1)
    expect(resolveMediaMock).toHaveBeenCalledWith(`${MEDIA_BASE}/${PNG}`, settings)
  })

  it('T20: 同一 rawUrl 連打で resolveMedia は 1 回・Blob URL を共有する', async () => {
    const img = makeAsset(PNG)
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [img] })
    const d = deferred<ReturnType<typeof okFetch>>()
    resolveMediaMock.mockReturnValue(d.promise)
    const c = makeController()
    await c.load() // assets に載せる（解決完了時の孤児ガードを通すため）

    const p1 = c.resolveThumb(img)
    const p2 = c.resolveThumb(img) // resolving 中 → 即 return
    expect(resolveMediaMock).toHaveBeenCalledTimes(1)

    d.resolve(okFetch())
    await Promise.all([p1, p2])
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    const shared = c.thumbUrls[img.rawUrl]
    expect(shared).toBe('blob:agasteer/1')

    await c.resolveThumb(img) // 既に thumbUrls にある → 再解決しない
    expect(resolveMediaMock).toHaveBeenCalledTimes(1)
    expect(c.thumbUrls[img.rawUrl]).toBe(shared)
  })
})

describe('resolveThumb: 失敗・削除孤児の防御', () => {
  it('T25: resolveMedia が reject → 握って resolving を解放・thumb 未設定（unhandledRejection なし）', async () => {
    const img = makeAsset(PNG)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [img] })
    resolveMediaMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(okFetch())
    const c = makeController()
    await c.load()

    // 1 回目: reject を握る（resolveThumb 自体は throw しない＝await が正常完了する）
    await c.resolveThumb(img)
    expect(createObjectURLMock).not.toHaveBeenCalled()
    expect(c.thumbUrls[img.rawUrl]).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)

    // 2 回目: resolving が解放済みなので再解決でき、今度は Blob を載せる
    await c.resolveThumb(img)
    expect(resolveMediaMock).toHaveBeenCalledTimes(2)
    expect(c.thumbUrls[img.rawUrl]).toBe('blob:agasteer/1')
  })

  it('T26: 解決中に該当 asset を削除 → 解決完了で生成 Blob を即 revoke・thumbUrls 未登録', async () => {
    const img = makeAsset(PNG)
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [img] })
    confirmMock.mockResolvedValue(true)
    deleteMediaAssetMock.mockResolvedValue({ ok: true })
    const d = deferred<ReturnType<typeof okFetch>>()
    resolveMediaMock.mockReturnValue(d.promise)
    const c = makeController()
    await c.load()

    const p = c.resolveThumb(img) // サムネ解決を in-flight にする
    await c.handleDelete(img) // 解決中にそのアセットを削除（assets から除去）
    expect(c.assets.length).toBe(0)

    d.resolve(okFetch()) // 削除後に解決が完了する
    await p
    await flush()

    // 生成した Blob は孤児化させず即 revoke され、thumbUrls には載らない
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:agasteer/1')
    expect(c.thumbUrls[img.rawUrl]).toBeUndefined()
  })
})

describe('Blob URL のライフサイクル・リーク防止', () => {
  it('T21: 解決中に dispose すると Blob を作らず thumbUrls に載せない（破棄後の書き込みなし）', async () => {
    const img = makeAsset(PNG)
    const d = deferred<ReturnType<typeof okFetch>>()
    resolveMediaMock.mockReturnValue(d.promise)
    const c = makeController()

    const p = c.resolveThumb(img)
    c.dispose() // 解決待ちの間に破棄
    d.resolve(okFetch())
    await p
    await flush()

    // disposed ガードで createObjectURL に到達しない＝リークも状態書き込みもない
    expect(createObjectURLMock).not.toHaveBeenCalled()
    expect(Object.keys(c.thumbUrls)).toEqual([])
  })

  it('T22: dispose で保持中の Blob URL を全て revoke する（create/revoke ペア一致）', async () => {
    const a = makeAsset(PNG)
    const b = makeAsset(PNG2)
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [a, b] })
    resolveMediaMock.mockResolvedValue(okFetch())
    const c = makeController()
    await c.load()
    await c.resolveThumb(a)
    await c.resolveThumb(b)
    expect(createObjectURLMock).toHaveBeenCalledTimes(2)

    c.dispose()

    expect(revokeObjectURLMock).toHaveBeenCalledTimes(2)
    const created = createObjectURLMock.mock.results.map((r) => r.value).sort()
    const revoked = revokeObjectURLMock.mock.calls.map((call) => call[0]).sort()
    expect(revoked).toEqual(created)
    expect(Object.keys(c.thumbUrls)).toEqual([])
  })

  it('T23a: dispose 後の load は結果を反映しない（loaded/error に遷移しない）', async () => {
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [makeAsset(PNG)] })
    const c = makeController()
    c.dispose()
    await c.load()
    // await 前の 'loading' 書き込みは元コード通り起きるが、await 後の反映はガードで止まる
    expect(c.loadState).toBe('loading')
    expect(c.assets.length).toBe(0)
  })

  it('T23b: dispose 後の handleDelete は削除に進まない（deleteMediaAsset・toast なし）', async () => {
    const img = makeAsset(PNG)
    confirmMock.mockResolvedValue(true)
    const c = makeController()
    c.dispose()
    await c.handleDelete(img)
    expect(deleteMediaAssetMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    expect(c.deletingPath).toBeNull()
  })
})

describe('console クリーン', () => {
  it('T24: golden path（取得→サムネ解決→破棄）で console.error / warn が出ない', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    const warnSpy = vi.spyOn(console, 'warn')
    const img = makeAsset(PNG)
    listMediaAssetsMock.mockResolvedValue({ ok: true, assets: [img] })
    resolveMediaMock.mockResolvedValue(okFetch())
    const c = makeController()
    await c.load()
    await c.resolveThumb(img)
    c.dispose()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
