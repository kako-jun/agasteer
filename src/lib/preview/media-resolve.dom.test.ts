// @vitest-environment jsdom
/**
 * プレビューのメディア表示解決・副作用層のテスト（#244）
 *
 * resolveMedia をモック（遅延制御可能な Promise）し、jsdom 上で
 * DOM 差し替え・プレースホルダ遷移・Blob URL ライフサイクル（create/revoke ペア）を検証する。
 * jsdom は URL.createObjectURL / revokeObjectURL 未実装のためスタブで代替する。
 * 純粋層（URL 検出・種別振り分け・MIME・ファイル名）は media-resolve.test.ts（node 環境）が担う。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveMediaMock = vi.hoisted(() => vi.fn())

vi.mock('../api/media', () => ({
  resolveMedia: resolveMediaMock,
}))

const { createPreviewMediaResolver } = await import('./media-resolve')

import type { Settings } from '../types'
// 型のみの import はモックに影響しない（実行時には消える）
import type { MediaFetchResult } from '../api/media'

// jsdom の URL には createObjectURL / revokeObjectURL がないため vi.stubGlobal で代替する。
// URL コンストラクタとしての挙動は実 URL を継承して維持する
const createObjectURLMock = vi.fn<(obj: Blob | MediaSource) => string>()
const revokeObjectURLMock = vi.fn<(url: string) => void>()
vi.stubGlobal(
  'URL',
  class extends URL {
    static createObjectURL = createObjectURLMock
    static revokeObjectURL = revokeObjectURLMock
  }
)

const MEDIA_BASE = 'https://raw.githubusercontent.com/kako-jun/notes-media/main'
const PNG_URL = `${MEDIA_BASE}/20260710-abcd1234-photo.png`
const MP4_URL = `${MEDIA_BASE}/20260710-abcd1234-clip.mp4`
const MP3_URL = `${MEDIA_BASE}/20260710-abcd1234-voice.mp3`
const ZIP_URL = `${MEDIA_BASE}/20260710-abcd1234-bundle.zip`
const ZIP2_URL = `${MEDIA_BASE}/20260710-ffff0000-other.zip`

const settings = { token: 't', repoName: 'kako-jun/notes' } as Settings
const translate = (key: string) => `t:${key}`

function okResult(): MediaFetchResult {
  return { ok: true, data: new ArrayBuffer(8) }
}

function failResult(): MediaFetchResult {
  return { ok: false, errorKind: 'fetch_failed' }
}

/** resolve/reject を外から制御できる Promise（解決中プレースホルダの検証用） */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** {@html} 直後の raw DOM を模して body に載せる（isConnected を実挙動に合わせる） */
function renderContainer(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

/** マイクロタスク連鎖（resolveMedia → then/catch/finally → mount の then）を全て流す */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

let blobUrlCounter = 0

beforeEach(() => {
  resolveMediaMock.mockReset()
  createObjectURLMock.mockReset()
  revokeObjectURLMock.mockReset()
  blobUrlCounter = 0
  createObjectURLMock.mockImplementation(() => `blob:agasteer/${++blobUrlCounter}`)
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('resolveMedia の reject 防御', () => {
  it('resolveMedia が reject しても失敗プレースホルダ（リトライ可）になり unhandledRejection を出さない', async () => {
    // 防御 catch のログは想定内なので抑止する（他テストの console クリーン検証とは分ける）
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rejections: unknown[] = []
    const onUnhandled = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      resolveMediaMock.mockRejectedValue(new Error('boom'))
      const container = renderContainer(`<img src="${PNG_URL}" alt="photo">`)
      const resolver = createPreviewMediaResolver()
      resolver.apply(container, settings, translate)
      await flush()
      const placeholder = container.querySelector('.media-placeholder')
      expect(placeholder?.textContent).toContain('t:media.preview.unavailable')
      expect(placeholder?.querySelector('.media-placeholder-retry')).not.toBeNull()
      expect(rejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
      consoleErrorSpy.mockRestore()
    }
  })
})

describe('apply: 対象検出と差し替え', () => {
  it('S1: メディア raw URL が 1 件もなければ何もしない（resolveMedia 不呼び出し・DOM 無変更）', async () => {
    const container = renderContainer('<p>text</p><h2>見出し</h2>')
    const before = container.innerHTML
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    expect(resolveMediaMock).not.toHaveBeenCalled()
    expect(createObjectURLMock).not.toHaveBeenCalled()
    expect(container.innerHTML).toBe(before)
  })

  it('S2: img×image の解決成功で Blob URL の <img> に差し替わり alt（非ASCII）を引き継ぐ', async () => {
    resolveMediaMock.mockResolvedValue(okResult())
    const container = renderContainer(`<img src="${PNG_URL}" alt="写真テスト">`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    expect(resolveMediaMock).toHaveBeenCalledWith(PNG_URL, settings)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('blob:agasteer/1')
    expect(img?.alt).toBe('写真テスト')
  })

  it('S3: a×zip の解決成功で <a download> になりラベルを引き継ぐ（ラベル空はファイル名フォールバック）', async () => {
    resolveMediaMock.mockResolvedValue(okResult())
    const container = renderContainer(
      `<a href="${ZIP_URL}">添付データ</a><a href="${ZIP2_URL}"></a>`
    )
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    const anchors = container.querySelectorAll('a')
    expect(anchors).toHaveLength(2)
    expect(anchors[0].getAttribute('href')).toBe('blob:agasteer/1')
    expect(anchors[0].download).toBe('20260710-abcd1234-bundle.zip')
    expect(anchors[0].textContent).toBe('添付データ')
    expect(anchors[1].download).toBe('20260710-ffff0000-other.zip')
    expect(anchors[1].textContent).toBe('20260710-ffff0000-other.zip')
  })

  it('S4: a×image（画像 URL への通常リンク）は <img> に差し替わる', async () => {
    resolveMediaMock.mockResolvedValue(okResult())
    const container = renderContainer(`<a href="${PNG_URL}">写真リンク</a>`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    expect(container.querySelector('a')).toBeNull()
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('blob:agasteer/1')
    expect(img?.alt).toBe('写真リンク')
  })

  it('S5: img×video（動画 URL の画像記法）は <video controls playsinline> に差し替わる', async () => {
    resolveMediaMock.mockResolvedValue(okResult())
    const container = renderContainer(`<img src="${MP4_URL}" alt="clip">`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video?.controls).toBe(true)
    expect(video?.playsInline).toBe(true)
    expect(video?.getAttribute('src')).toBe('blob:agasteer/1')
  })

  it('S6: a×audio（音声 URL へのリンク）は <audio controls> に差し替わる', async () => {
    resolveMediaMock.mockResolvedValue(okResult())
    const container = renderContainer(`<a href="${MP3_URL}">voice memo</a>`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
    expect(audio?.controls).toBe(true)
    expect(audio?.getAttribute('src')).toBe('blob:agasteer/1')
  })

  it('S7: 非対象 URL・空 src/href は差し替えない', async () => {
    const container = renderContainer(
      [
        '<a href="https://example.com/photo.png">外部画像リンク</a>',
        '<img src="https://raw.githubusercontent.com/kako-jun/notes/main/photo.png" alt="非mediaリポ">',
        '<img src="" alt="空src">',
        '<a href="">空href</a>',
        '<a href="#priority:leaf1:3">内部リンク</a>',
      ].join('')
    )
    const before = container.innerHTML
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    expect(resolveMediaMock).not.toHaveBeenCalled()
    expect(container.innerHTML).toBe(before)
  })

  it('S8: 同一 URL の重複 3 件（img 2 + a 1）は resolveMedia 1 回・createObjectURL 1 回で全て差し替わる', async () => {
    const d = deferred<MediaFetchResult>()
    resolveMediaMock.mockReturnValue(d.promise)
    const container = renderContainer(
      `<img src="${PNG_URL}" alt="one"><img src="${PNG_URL}" alt="two"><a href="${PNG_URL}">three</a>`
    )
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    d.resolve(okResult())
    await flush()
    expect(resolveMediaMock).toHaveBeenCalledTimes(1)
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(3)
    for (const img of Array.from(imgs)) {
      expect(img.getAttribute('src')).toBe('blob:agasteer/1')
    }
  })
})

describe('apply: プレースホルダ遷移とリトライ', () => {
  it('S9: 取得失敗（ok:false）は unavailable 文言とリトライボタンのプレースホルダになる', async () => {
    resolveMediaMock.mockResolvedValue(failResult())
    const container = renderContainer(`<img src="${PNG_URL}" alt="photo">`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    const placeholder = container.querySelector('.media-placeholder')
    expect(placeholder?.textContent).toContain('t:media.preview.unavailable')
    expect(placeholder?.textContent).toContain('20260710-abcd1234-photo.png')
    const retry = placeholder?.querySelector('button.media-placeholder-retry')
    expect(retry?.textContent).toBe('t:media.preview.retry')
    expect(createObjectURLMock).not.toHaveBeenCalled()
  })

  it('S10: 解決完了前は loading プレースホルダ（リトライボタンなし）を表示する', async () => {
    const d = deferred<MediaFetchResult>()
    resolveMediaMock.mockReturnValue(d.promise)
    const container = renderContainer(`<img src="${PNG_URL}" alt="photo">`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush() // 未解決のまま
    const placeholder = container.querySelector('.media-placeholder')
    expect(placeholder?.textContent).toContain('t:media.preview.loading')
    expect(placeholder?.querySelector('.media-placeholder-retry')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('S11: リトライクリックで再解決し、成功すれば表示される', async () => {
    resolveMediaMock.mockResolvedValueOnce(failResult()).mockResolvedValueOnce(okResult())
    const container = renderContainer(`<img src="${PNG_URL}" alt="photo">`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    container.querySelector<HTMLButtonElement>('.media-placeholder-retry')!.click()
    await flush()
    expect(resolveMediaMock).toHaveBeenCalledTimes(2)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('blob:agasteer/1')
    expect(img?.alt).toBe('photo')
  })

  it('S12: リトライ再失敗でもリトライ可能なプレースホルダに戻る', async () => {
    resolveMediaMock.mockResolvedValue(failResult())
    const container = renderContainer(`<img src="${PNG_URL}" alt="photo">`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    container.querySelector<HTMLButtonElement>('.media-placeholder-retry')!.click()
    await flush()
    expect(resolveMediaMock).toHaveBeenCalledTimes(2)
    const placeholder = container.querySelector('.media-placeholder')
    expect(placeholder?.textContent).toContain('t:media.preview.unavailable')
    expect(placeholder?.querySelector('.media-placeholder-retry')).not.toBeNull()
  })
})

describe('apply / revokeAll: Blob URL ライフサイクル', () => {
  it('S13: 再レンダリングで URL が消えたら Blob URL を revoke して管理から外す', async () => {
    resolveMediaMock.mockResolvedValue(okResult())
    const container = renderContainer(`<img src="${PNG_URL}" alt="photo">`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    // 再レンダリング（{@html} 再評価）で本文からメディアが消えた状態を模す
    container.innerHTML = '<p>no media</p>'
    resolver.apply(container, settings, translate)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:agasteer/1')
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1)
    // map から削除済み: もう一度メディアなしで apply しても再 revoke しない
    resolver.apply(container, settings, translate)
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1)
  })

  it('S14: 再レンダリングで URL が残っていれば Blob を再利用する（revoke・create・resolveMedia の追加なし）', async () => {
    resolveMediaMock.mockResolvedValue(okResult())
    const raw = `<img src="${PNG_URL}" alt="photo">`
    const container = renderContainer(raw)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    container.innerHTML = raw // 同じ本文の再レンダリング
    resolver.apply(container, settings, translate)
    await flush()
    expect(resolveMediaMock).toHaveBeenCalledTimes(1)
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).not.toHaveBeenCalled()
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:agasteer/1')
  })

  it('S15: 解決中に対象 DOM ごと破棄されても（isConnected=false）例外なく完了する', async () => {
    const d = deferred<MediaFetchResult>()
    resolveMediaMock.mockReturnValue(d.promise)
    const container = renderContainer(`<img src="${PNG_URL}" alt="photo">`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    container.remove() // プレビュー再構築などで DOM ごと破棄
    d.resolve(okResult())
    await flush() // 例外・unhandledRejection が出ればここで vitest が検出する
    expect(createObjectURLMock).toHaveBeenCalledTimes(1) // Blob 自体は次回 apply 用に保持される
  })

  it('S16: revokeAll で保持中の Blob URL を全て解放する（create/revoke がペアで一致）', async () => {
    resolveMediaMock.mockResolvedValue(okResult())
    const container = renderContainer(
      `<img src="${PNG_URL}" alt="photo"><a href="${ZIP_URL}">zip</a>`
    )
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    expect(createObjectURLMock).toHaveBeenCalledTimes(2)
    resolver.revokeAll()
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(2)
    const created = createObjectURLMock.mock.results.map((result) => result.value).sort()
    const revoked = revokeObjectURLMock.mock.calls.map((call) => call[0]).sort()
    expect(revoked).toEqual(created)
  })

  it('S17: revokeAll（破棄）後に in-flight が完了した Blob URL は即 revoke され管理に残らない', async () => {
    const d = deferred<MediaFetchResult>()
    resolveMediaMock.mockReturnValue(d.promise)
    const container = renderContainer(`<img src="${PNG_URL}" alt="photo">`)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    resolver.revokeAll() // コンポーネント破棄
    d.resolve(okResult())
    await flush()
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:agasteer/1')
    // map 未登録: 再度 revokeAll しても追加の revoke はない
    resolver.revokeAll()
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1)
  })

  it('S18: 未解決のまま同一 URL で apply を連打しても resolveMedia は 1 回', async () => {
    const d = deferred<MediaFetchResult>()
    resolveMediaMock.mockReturnValue(d.promise)
    const raw = `<img src="${PNG_URL}" alt="photo">`
    const container = renderContainer(raw)
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    container.innerHTML = raw // 解決完了前の再レンダリング
    resolver.apply(container, settings, translate)
    expect(resolveMediaMock).toHaveBeenCalledTimes(1)
    d.resolve(okResult())
    await flush()
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:agasteer/1')
  })
})

describe('characterization: ネストしたメディア記法', () => {
  it('S19: [![img](png)](zip) は zip リンクのみ表示になる（稀ケース・安全側の現挙動ピン留め）', async () => {
    // 外側 a の差し替えで内側 img は detached になり画像は表示されない。
    // 表示は zip ダウンロードリンクに寄る（安全側）現挙動を characterization として固定する
    resolveMediaMock.mockResolvedValue(okResult())
    const container = renderContainer(
      `<p><a href="${ZIP_URL}"><img src="${PNG_URL}" alt="nested"></a></p>`
    )
    const resolver = createPreviewMediaResolver()
    resolver.apply(container, settings, translate)
    await flush()
    const anchor = container.querySelector('a')
    expect(anchor?.download).toBe('20260710-abcd1234-bundle.zip')
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('console クリーン', () => {
  it('C1: golden path（画像解決成功→破棄）で console.error / console.warn が出ない', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    const warnSpy = vi.spyOn(console, 'warn')
    try {
      resolveMediaMock.mockResolvedValue(okResult())
      const container = renderContainer(`<img src="${PNG_URL}" alt="photo">`)
      const resolver = createPreviewMediaResolver()
      resolver.apply(container, settings, translate)
      await flush()
      resolver.revokeAll()
      expect(errorSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})
