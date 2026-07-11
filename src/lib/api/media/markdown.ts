/**
 * メディア挿入記法の組み立て（純粋層）
 *
 * 画像は `![name](rawURL)`、動画/音声/zip は `[name](rawURL)`（プレビュー側が
 * 拡張子で <video>/<audio>/ダウンロードリンクに解決する）。
 *
 * 元はエディタ添付（editor/media-attach.ts #243）にあったが、インポート連携
 * （#249）も同じ記法を書き込むため、data 層からも参照できる純粋層に移した
 * （editor/media-attach.ts は互換のため再公開している）。
 */

import { getMediaExtension } from './naming'
import { IMAGE_MEDIA_EXTENSIONS } from './validation'

/**
 * ファイル名が画像（`![]()` で挿入する形式）かを判定する。
 * 画像拡張子の集合は validation.ts のホワイトリスト側を単一ソースにする。
 */
export function isImageFileName(fileName: string): boolean {
  return IMAGE_MEDIA_EXTENSIONS.has(getMediaExtension(fileName))
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
