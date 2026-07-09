/**
 * メディア形式・サイズ検証（純粋層）
 *
 * 添付を受け付ける形式ホワイトリストとサイズ上限をこの層で強制する。
 * 表示メッセージ（i18n）は後続 Issue の UI が担うため、ここではエラー種別のみ返す。(#242)
 */

import { getMediaExtension } from './naming'

/**
 * 添付を許可する拡張子（形式ホワイトリスト）
 * jpeg は jpg と同一形式の標準的な別拡張子のため含める。
 */
export const ALLOWED_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'mp4',
  'webm',
  'mp3',
  'm4a',
  'ogg',
  'wav',
  'zip',
])

/** アップロード上限（GitHub Contents API の上限に合わせて 100MB） */
export const MAX_MEDIA_SIZE_BYTES = 100 * 1024 * 1024

export type MediaValidationError = 'format_not_allowed' | 'size_exceeded'

/**
 * ファイル名とサイズを検証する。問題なければ null。
 */
export function validateMedia(fileName: string, size: number): MediaValidationError | null {
  if (!ALLOWED_MEDIA_EXTENSIONS.has(getMediaExtension(fileName))) {
    return 'format_not_allowed'
  }
  if (size > MAX_MEDIA_SIZE_BYTES) {
    return 'size_exceeded'
  }
  return null
}
