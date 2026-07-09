/**
 * 添付画像の自動最適化（最大辺 2048px 縮小 + WebP 再エンコード）(#243)
 *
 * uploadMedia に渡す「前」に適用する。ハッシュ・ファイル名・raw URL は
 * 最適化後の内容で確定するため、この層より後で内容を変えてはならない。
 *
 * 対象は再エンコードで劣化・欠損が出ない静止画ラスタ（png/jpg/jpeg/webp）のみ。
 * gif（アニメーション消失）・svg（ベクター）・動画/音声/zip は無変換で返す。
 * デコード・エンコードに失敗した場合も原本をそのまま返す（添付自体は止めない）。
 *
 * 寸法計算・対象判定は純粋関数として分離し、canvas に依存せずテストできる。
 */

import { getMediaExtension } from '../api/media/naming'

/** 最適化後の最大辺（px）。これ以下の画像は縮小しない */
export const MEDIA_OPTIMIZE_MAX_DIMENSION = 2048

/** WebP 再エンコードの品質 */
export const MEDIA_OPTIMIZE_WEBP_QUALITY = 0.85

/** 再エンコード対象の拡張子（静止画ラスタのみ。gif/svg は無変換） */
const OPTIMIZABLE_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'webp'])

/** エンコード結果の MIME → 拡張子（ブラウザが WebP 非対応で png/jpeg に落ちた場合も整合させる） */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/**
 * ファイル名から最適化対象（再エンコードする静止画ラスタ）かを判定する（純粋）。
 */
export function shouldOptimizeImage(fileName: string): boolean {
  return OPTIMIZABLE_IMAGE_EXTENSIONS.has(getMediaExtension(fileName))
}

/**
 * 最大辺 maxDimension に収まる縮小後サイズを計算する（純粋）。
 * アスペクト比を保ち、丸めで 0 にならないよう最小 1px を保証する。
 * 既に収まっている場合は元サイズをそのまま返す（拡大はしない）。
 */
export function computeOptimizedSize(
  width: number,
  height: number,
  maxDimension: number = MEDIA_OPTIMIZE_MAX_DIMENSION
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxDimension) {
    return { width, height }
  }
  const scale = maxDimension / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * 拡張子を差し替える（純粋）。拡張子がない場合は末尾に付ける。
 */
export function replaceFileExtension(fileName: string, ext: string): string {
  const base = fileName.replace(/\.[^.]*$/, '')
  return `${base}.${ext}`
}

/**
 * File を画像デコードする。EXIF 回転を適用するオプションが未対応の
 * ブラウザでは素の createImageBitmap にフォールバックする。
 */
async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return await createImageBitmap(file)
  }
}

/**
 * bitmap を指定サイズで WebP にエンコードする。
 * OffscreenCanvas 優先、なければ DOM canvas（toBlob）を使う。
 */
async function encodeBitmap(
  bitmap: ImageBitmap,
  width: number,
  height: number
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await canvas.convertToBlob({ type: 'image/webp', quality: MEDIA_OPTIMIZE_WEBP_QUALITY })
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, width, height)
  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', MEDIA_OPTIMIZE_WEBP_QUALITY)
  )
}

/**
 * 画像ファイルを最適化して新しい File を返す。
 *
 * - 対象外（gif/svg/非画像）・デコード/エンコード失敗・未知の出力 MIME は原本を返す
 * - 縮小が発生せず、再エンコードでサイズが増える（または同じ）場合も原本を返す
 * - 成功時はファイル名の拡張子を実際の出力形式（通常 .webp）に差し替える
 */
export async function optimizeImageFile(file: File): Promise<File> {
  if (!shouldOptimizeImage(file.name)) return file
  if (typeof createImageBitmap === 'undefined') return file
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await decodeImage(file)
    const { width, height } = computeOptimizedSize(bitmap.width, bitmap.height)
    const scaled = width !== bitmap.width || height !== bitmap.height
    const blob = await encodeBitmap(bitmap, width, height)
    if (!blob) return file
    const ext = MIME_TO_EXTENSION[blob.type]
    if (!ext) return file
    // 縮小が発生した場合は WebP が原本よりバイト数で肥大しても最適化版を採用する（2048px 上限はバイト数でなく表示ポリシー）
    if (!scaled && blob.size >= file.size) return file
    return new File([blob], replaceFileExtension(file.name, ext), { type: blob.type })
  } catch (error) {
    console.warn('Image optimization failed (using original file):', error)
    return file
  } finally {
    bitmap?.close()
  }
}
