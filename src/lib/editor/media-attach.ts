/**
 * エディタへのメディア添付（貼り付け・D&D・ファイル選択の共通ロジック）(#243)
 *
 * 検証・アップロード・pending キューは同期層（`api/media.ts` の uploadMedia）に
 * 委譲し、ここでは「File の取り出し → 画像最適化 → アップロード → 記法挿入 →
 * 通知」の編成だけを持つ。Svelte 側（MarkdownEditor / EditorFooter）は
 * insert / notify のコールバックを渡す薄い配線に徹する。
 *
 * ファイル取り出し・記法組み立て・DOM ハンドラ生成は DOM 実体に依存しない
 * 形にしてあり、node 環境の vitest でテストできる。
 */

import type { Settings } from '../types'
import { uploadMedia, type MediaErrorKind } from '../api/media'
import { ALLOWED_MEDIA_EXTENSIONS } from '../api/media/validation'
import { getMediaExtension } from '../api/media/naming'
import { optimizeImageFile } from '../utils/image-optimize'

// ============================================
// ファイル取り出し（貼り付け・D&D 共通）
// ============================================

/**
 * ClipboardEvent.clipboardData / DragEvent.dataTransfer から File を取り出す。
 * files が空でも items 側に kind='file' が入るブラウザがあるため両方を見る。
 * ファイルが 1 つもなければ空配列（＝通常のテキスト貼り付け/ドロップとして
 * CodeMirror 既定処理に委ねる合図）。
 */
export function extractDataTransferFiles(
  data: Pick<DataTransfer, 'files' | 'items'> | null
): File[] {
  if (!data) return []
  if (data.files && data.files.length > 0) {
    return Array.from(data.files)
  }
  const files: File[] = []
  if (data.items) {
    for (const item of Array.from(data.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
  }
  return files
}

// ============================================
// 挿入記法（純粋）
// ============================================

/** Markdown 画像記法（`![]()`）で挿入する拡張子。それ以外はリンク記法（`[]()`） */
const IMAGE_MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
])

/** ファイル名が画像（`![]()` で挿入する形式）かを判定する */
export function isImageFileName(fileName: string): boolean {
  return IMAGE_MARKDOWN_EXTENSIONS.has(getMediaExtension(fileName))
}

/**
 * リンクラベル用にファイル名をサニタイズする。
 * `[` `]` は記法を壊すため除去し、改行は空白に潰す。
 */
export function sanitizeMediaLabel(fileName: string): string {
  const label = fileName
    .replace(/[[\]]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
  return label || 'file'
}

/**
 * 挿入する Markdown を組み立てる。
 * 画像は `![name](rawURL)`、動画/音声/zip は `[name](rawURL)`。
 */
export function buildMediaMarkdown(fileName: string, url: string): string {
  const link = `[${sanitizeMediaLabel(fileName)}](${url})`
  return isImageFileName(fileName) ? `!${link}` : link
}

/** ファイル選択 `<input type="file">` の accept 属性値（形式ホワイトリスト由来） */
export const MEDIA_FILE_ACCEPT = Array.from(ALLOWED_MEDIA_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',')

// ============================================
// CodeMirror domEventHandlers（paste / drop）
// ============================================

/** drop 位置の解決に必要な最小の view 形（テスト用に構造的型で受ける） */
export interface DropPosView {
  posAtCoords(coords: { x: number; y: number }): number | null
}

/**
 * EditorView.domEventHandlers に渡す paste / drop ハンドラを作る。
 * ファイルが含まれない場合は false を返し、CodeMirror の既定処理
 * （テキスト貼り付け・テキストドロップ）に委ねる。
 *
 * @param onFiles ファイル受け取り時のコールバック。dropPos は drop 位置
 *                （paste・位置解決不能時は null ＝カーソル位置に挿入）
 */
export function createMediaDomHandlers(onFiles: (files: File[], dropPos: number | null) => void): {
  paste: (event: ClipboardEvent) => boolean
  drop: (event: DragEvent, view: DropPosView) => boolean
} {
  return {
    paste: (event: ClipboardEvent) => {
      const files = extractDataTransferFiles(event.clipboardData)
      if (files.length === 0) return false
      event.preventDefault()
      onFiles(files, null)
      return true
    },
    drop: (event: DragEvent, view: DropPosView) => {
      const files = extractDataTransferFiles(event.dataTransfer)
      if (files.length === 0) return false
      event.preventDefault()
      onFiles(files, view.posAtCoords({ x: event.clientX, y: event.clientY }))
      return true
    },
  }
}

// ============================================
// 添付の編成（最適化 → アップロード → 挿入 → 通知）
// ============================================

/** 添付フローの進行通知。UI 側で i18n メッセージ＋トーストに変換する */
export type MediaAttachNotice =
  | { kind: 'uploading'; name: string }
  | { kind: 'uploaded'; name: string }
  /** オフラインのため pending キューに保留（online 復帰で自動リトライ） */
  | { kind: 'queuedOffline'; name: string }
  /** オンラインだが即時アップロードに失敗（キューに残り自動リトライ） */
  | { kind: 'queuedRetry'; name: string }
  /** URL が確定できず挿入も行われない失敗（形式外・100MB超・未設定など） */
  | { kind: 'error'; errorKind: MediaErrorKind; name: string }

export interface MediaAttachDeps {
  settings: Settings
  /** 添付画像の自動最適化（設定 mediaOptimizeImages） */
  optimizeImages: boolean
  /** 確定した Markdown 記法をエディタに挿入する */
  insert: (text: string) => void
  notify: (notice: MediaAttachNotice) => void
}

/**
 * ファイル群を順に添付する。1 ファイルごとに:
 * 1. 最適化 ON かつ対象画像なら縮小 + WebP 化（ハッシュ・URL は最適化後の内容で確定）
 * 2. uploadMedia（検証 → URL 即時確定 → enqueue → オンラインなら即時アップロード）
 * 3. 成功なら記法を挿入（オフラインでも URL は確定済みなので挿入は完了する）
 * 4. 進行・結果を notify（失敗ファイルはスキップして次へ進む）
 */
export async function attachMediaFiles(files: File[], deps: MediaAttachDeps): Promise<void> {
  for (let index = 0; index < files.length; index++) {
    const original = files[index]
    deps.notify({ kind: 'uploading', name: original.name })
    const file = deps.optimizeImages ? await optimizeImageFile(original) : original
    const result = await uploadMedia(file, deps.settings)
    // strict モードでない tsconfig では !result.ok の真偽値 narrowing が
    // 効かないため、判別に in 演算子を使う
    if ('errorKind' in result) {
      deps.notify({ kind: 'error', errorKind: result.errorKind, name: original.name })
      continue
    }
    const markdown = buildMediaMarkdown(file.name, result.url)
    deps.insert(index < files.length - 1 ? `${markdown}\n` : markdown)
    if (result.uploaded) {
      deps.notify({ kind: 'uploaded', name: file.name })
    } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
      deps.notify({ kind: 'queuedOffline', name: file.name })
    } else {
      deps.notify({ kind: 'queuedRetry', name: file.name })
    }
  }
}
