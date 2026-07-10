/**
 * プレビューでのメディア表示解決（#244）
 *
 * sanitize 済みプレビュー DOM から本機能のメディア raw URL（parseRawMediaUrl 受理）を
 * 検出し、同期層の resolveMedia（pending → cache → 認証 fetch）で得た実体を
 * Blob URL に変換して `<img>` / `<video>` / `<audio>` / ダウンロードリンクに差し替える。
 *
 * XSS 面の判断: DOMPurify の ALLOWED_URI_REGEXP には blob: を追加しない
 * （追加すると本文由来の任意の blob: URL まで sanitize を通過してしまう）。
 * sanitize は現行ポリシーのまま行い、sanitize 後の DOM に対して
 * parseRawMediaUrl が受理した URL だけをこちらが生成した Blob URL に置き換える。
 *
 * 純粋関数（種別判定・MIME 解決・ファイル名抽出）と副作用（resolveMedia 呼び出し・
 * DOM 差し替え・Blob URL ライフサイクル）を分けている。前者のみ node 環境でテストする。
 */

import type { Settings } from '../types'
import { resolveMedia } from '../api/media'
import { parseRawMediaUrl, getMediaExtension } from '../api/media/naming'
import {
  IMAGE_MEDIA_EXTENSIONS,
  VIDEO_MEDIA_EXTENSIONS,
  AUDIO_MEDIA_EXTENSIONS,
} from '../api/media/validation'

// ============================================
// 純粋層（URL 検出・種別振り分け）
// ============================================

export type PreviewMediaKind = 'image' | 'video' | 'audio' | 'download'

/**
 * URL の表示種別を判定する。本機能のメディア raw URL でなければ null（差し替え対象外）。
 * ホワイトリスト外の拡張子（過去仕様や手書き URL）は download にフォールバックする。
 */
export function classifyPreviewMediaKind(url: string): PreviewMediaKind | null {
  const parsed = parseRawMediaUrl(url)
  if (!parsed) return null
  const ext = getMediaExtension(parsed.path)
  if (IMAGE_MEDIA_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_MEDIA_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_MEDIA_EXTENSIONS.has(ext)) return 'audio'
  return 'download'
}

/** Blob 生成用の MIME。`<video>`/`<audio>` の再生可否判定に効くため拡張子から引く */
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  zip: 'application/zip',
}

/** ファイル名（または URL 末尾のファイル名）から Blob 用 MIME を解決する */
export function previewMediaMimeType(fileName: string): string {
  return MIME_BY_EXTENSION[getMediaExtension(fileName)] ?? 'application/octet-stream'
}

/** raw URL からプレースホルダ表示・download 属性用のファイル名を取り出す */
export function previewMediaFileName(url: string): string {
  return parseRawMediaUrl(url)?.path ?? url
}

// ============================================
// 副作用層（解決・DOM 差し替え・Blob URL 管理）
// ============================================

type Translate = (key: string) => string

interface MediaTarget {
  el: Element
  url: string
  kind: PreviewMediaKind
  /** 画像の alt / リンクの表示テキスト（差し替え後の要素へ引き継ぐ） */
  label: string
}

export interface PreviewMediaResolver {
  /** sanitize 済みコンテナ DOM を走査してメディア参照を解決・差し替える */
  apply(container: HTMLElement, settings: Settings, translate: Translate): void
  /** 保持している Blob URL を全て解放する（コンポーネント破棄時に呼ぶ） */
  revokeAll(): void
}

/**
 * svg のみ、Blob 化する前に中身を DOMPurify で sanitize する（それ以外は素通し）。
 *
 * blob: URL は生成元（アプリ）オリジンを継承するため、`<img src=blob:>` 表示自体は
 * script 不実行で安全でも、画像を「新しいタブで開く」と image/svg+xml の SVG が
 * ドキュメントとして script 実行され、アプリオリジンの localStorage（GitHub PAT）に
 * 届いてしまう。MIME 偽装では `<img>` が SVG を描画しなくなるため、中身から
 * script・イベントハンドラを除去する方式を採る（正当な SVG 図形は表示され続ける）。
 */
async function toSanitizedBlobPart(url: string, data: ArrayBuffer): Promise<BlobPart> {
  if (getMediaExtension(url) !== 'svg') return data
  // PreviewView と同じ流儀の動的 import（markdown-tools チャンク）
  const DOMPurify = (await import('dompurify')).default
  return DOMPurify.sanitize(new TextDecoder().decode(data), {
    USE_PROFILES: { svg: true, svgFilters: true },
  })
}

/**
 * プレビュー 1 インスタンス分のメディア解決器を作る。
 * 同一 URL の複数出現・再レンダリングでは Blob URL を共有し、
 * resolveMedia と Blob 生成を URL につき 1 回に抑える。
 */
export function createPreviewMediaResolver(): PreviewMediaResolver {
  /** raw URL → Blob URL（レンダリングを跨いで共有） */
  const blobUrls = new Map<string, string>()
  /** raw URL → 解決中 Promise（並行解決の重複 fetch 防止） */
  const inFlight = new Map<string, Promise<string | null>>()
  /** revokeAll 後に in-flight 解決が完了しても Blob URL を残さないためのフラグ */
  let disposed = false

  function resolveToBlobUrl(url: string, settings: Settings): Promise<string | null> {
    const known = blobUrls.get(url)
    if (known) return Promise.resolve(known)
    let pending = inFlight.get(url)
    if (!pending) {
      pending = resolveMedia(url, settings)
        .then(async (result) => {
          if (!result.ok) return null
          const blobUrl = URL.createObjectURL(
            new Blob([await toSanitizedBlobPart(url, result.data)], {
              type: previewMediaMimeType(url),
            })
          )
          if (disposed) {
            URL.revokeObjectURL(blobUrl)
            return null
          }
          blobUrls.set(url, blobUrl)
          return blobUrl
        })
        // resolveMedia は結果オブジェクト契約（throw しない）だが、万一 reject しても
        // 解決中プレースホルダが永久固定 + unhandledRejection にならないよう
        // ok:false と同じ失敗（null → リトライ可能プレースホルダ）に落とす
        .catch((error) => {
          console.error('Preview media resolve failed:', error)
          return null
        })
        .finally(() => inFlight.delete(url))
      inFlight.set(url, pending)
    }
    return pending
  }

  /** 解決済み Blob URL を種別に応じた表示要素にする */
  function buildMediaElement(target: MediaTarget, blobUrl: string): HTMLElement {
    switch (target.kind) {
      case 'image': {
        const img = document.createElement('img')
        img.src = blobUrl
        img.alt = target.label
        return img
      }
      case 'video': {
        const video = document.createElement('video')
        video.controls = true
        video.playsInline = true
        video.src = blobUrl
        return video
      }
      case 'audio': {
        const audio = document.createElement('audio')
        audio.controls = true
        audio.src = blobUrl
        return audio
      }
      case 'download': {
        const anchor = document.createElement('a')
        anchor.href = blobUrl
        anchor.download = previewMediaFileName(target.url)
        anchor.textContent = target.label || previewMediaFileName(target.url)
        return anchor
      }
    }
  }

  /**
   * プレースホルダ（解決中 / 取得失敗）を作る。onRetry ありは失敗表示 + リトライボタン。
   * ボタンにはプレースホルダ要素自身を渡す（リトライ時にその場で差し替えるため）。
   */
  function buildPlaceholder(
    url: string,
    translate: Translate,
    onRetry?: (placeholder: HTMLElement) => void
  ): HTMLElement {
    const root = document.createElement('span')
    root.className = 'media-placeholder'
    const name = document.createElement('span')
    name.className = 'media-placeholder-name'
    name.textContent = previewMediaFileName(url)
    name.title = name.textContent
    root.appendChild(name)
    const status = document.createElement('span')
    status.textContent = translate(onRetry ? 'media.preview.unavailable' : 'media.preview.loading')
    root.appendChild(status)
    if (onRetry) {
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'media-placeholder-retry'
      retry.textContent = translate('media.preview.retry')
      retry.addEventListener('click', () => onRetry(root))
      root.appendChild(retry)
    }
    return root
  }

  /**
   * 対象要素 1 件を解決して差し替える。
   * キャッシュ済みなら即時差し替え、未取得なら解決中表示 → 完了で差し替え。
   * 失敗（オフライン・削除済み）はリトライ導線付きプレースホルダにする。
   */
  function mount(anchor: Element, target: MediaTarget, settings: Settings, translate: Translate) {
    const cached = blobUrls.get(target.url)
    if (cached) {
      anchor.replaceWith(buildMediaElement(target, cached))
      return
    }
    const loading = buildPlaceholder(target.url, translate)
    anchor.replaceWith(loading)
    void resolveToBlobUrl(target.url, settings).then((blobUrl) => {
      // 解決中にコンテンツ再レンダリング等で DOM ごと破棄されていたら何もしない
      if (!loading.isConnected) return
      if (blobUrl) {
        loading.replaceWith(buildMediaElement(target, blobUrl))
      } else {
        loading.replaceWith(
          buildPlaceholder(target.url, translate, (placeholder) =>
            mount(placeholder, target, settings, translate)
          )
        )
      }
    })
  }

  function apply(container: HTMLElement, settings: Settings, translate: Translate): void {
    const targets: MediaTarget[] = []
    for (const el of Array.from(container.querySelectorAll('img[src], a[href]'))) {
      const url = el instanceof HTMLImageElement ? el.getAttribute('src') : el.getAttribute('href')
      if (!url) continue
      const kind = classifyPreviewMediaKind(url)
      if (!kind) continue
      const label = (el instanceof HTMLImageElement ? el.alt : el.textContent) ?? ''
      targets.push({ el, url, kind, label })
    }

    // 前回レンダリングだけで使われていた Blob URL を解放する（リーク防止）。
    // in-flight 分は完了時に再登録され得るが、次回 apply か revokeAll で回収される
    const currentUrls = new Set(targets.map((t) => t.url))
    for (const [url, blobUrl] of blobUrls) {
      if (!currentUrls.has(url)) {
        URL.revokeObjectURL(blobUrl)
        blobUrls.delete(url)
      }
    }

    for (const target of targets) {
      mount(target.el, target, settings, translate)
    }
  }

  function revokeAll(): void {
    disposed = true
    for (const blobUrl of blobUrls.values()) {
      URL.revokeObjectURL(blobUrl)
    }
    blobUrls.clear()
  }

  return { apply, revokeAll }
}
