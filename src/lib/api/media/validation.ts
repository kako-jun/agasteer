/**
 * メディア形式・サイズ検証（純粋層）
 *
 * 添付を受け付ける形式ホワイトリストとサイズ上限をこの層で強制する。
 * 表示メッセージ（i18n）は後続 Issue の UI が担うため、ここではエラー種別のみ返す。(#242)
 */

import { getMediaExtension } from './naming'

/**
 * 添付を許可する画像の拡張子（Markdown 画像記法 `![]()` で挿入する形式）。
 * jpeg は jpg と同一形式の標準的な別拡張子のため含める。(#243)
 */
export const IMAGE_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
])

/** 添付を許可する動画の拡張子（プレビューで `<video>` に振り分ける形式）。(#244) */
export const VIDEO_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set(['mp4', 'webm'])

/** 添付を許可する音声の拡張子（プレビューで `<audio>` に振り分ける形式）。(#244) */
export const AUDIO_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set(['mp3', 'm4a', 'ogg', 'wav'])

/**
 * 添付を許可する拡張子（形式ホワイトリスト）。
 * 画像・動画・音声の各集合が常にホワイトリストの部分集合になるよう合成で定義する。
 */
export const ALLOWED_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
  ...IMAGE_MEDIA_EXTENSIONS,
  ...VIDEO_MEDIA_EXTENSIONS,
  ...AUDIO_MEDIA_EXTENSIONS,
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
