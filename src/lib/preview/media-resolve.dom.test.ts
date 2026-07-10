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
const createObjectURLMock = vi.fn<(blob: Blob) => string>()
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
