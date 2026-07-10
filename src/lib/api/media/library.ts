/**
 * メディアライブラリ（一覧・削除）の純粋層（#250）
 *
 * GitHub Contents API のディレクトリ一覧アイテムを表示用の MediaAsset に変換し、
 * 表示対象（対応形式のファイルのみ）にフィルタする純粋関数群。
 * fetch・settings・IO には触れない（naming/validation の純粋層と同じ扱い）。
 *
 * 副作用を伴う一覧取得・削除（HTTP・IndexedDB evict）は sibling の
 * `api/media-library.ts`（副作用層）に置く。
 */

import { getMediaExtension, buildRawMediaUrl } from './naming'
import { ALLOWED_MEDIA_EXTENSIONS } from './validation'

/**
 * メディアライブラリ画面が扱う 1 アセット（表示・削除に必要な最小情報）。
 * MediaPendingItem / MediaCacheEntry と同様、メディアサブシステム固有の
 * データ構造なのでこの層に置く（types.ts のドメインモデル Note/Leaf とは別カテゴリ）。
 */
export interface MediaAsset {
  /** ファイル名（メディアはリポルート直下なので path の末尾と一致） */
  name: string
  /** リポルートからのパス（Contents API DELETE の宛先。ルート直下なので name と同じ） */
  path: string
  /** バイト数 */
  size: number
  /** blob SHA（Contents API DELETE に必須） */
  sha: string
  /** GitHub の download_url（private リポでは未認証で開けないため表示解決には使わない） */
  downloadUrl?: string
  /** 認証付き取得・種別判定に使う raw URL（buildRawMediaUrl で再構成） */
  rawUrl: string
}

/**
 * GitHub Contents API のディレクトリ一覧アイテム（本機能が使う部分集合）。
 * ディレクトリ一覧は配列で返り、各要素が file/dir 等の type を持つ。
 */
export interface GitHubContentsItem {
  name: string
  path: string
  size: number
  sha: string
  type: string
  download_url?: string | null
}

/**
 * 一覧アイテム 1 件を MediaAsset に変換する。表示対象でなければ null。
 *
 * 除外する対象:
 * - ディレクトリ等（type !== 'file'）
 * - 対応形式ホワイトリスト外（`.gitkeep` は拡張子が無く弾かれる。過去仕様の
 *   手書きファイルや想定外拡張子も同様に一覧から除く）
 */
export function contentsItemToMediaAsset(
  item: GitHubContentsItem,
  mediaRepoFullName: string
): MediaAsset | null {
  if (item.type !== 'file') return null
  if (!ALLOWED_MEDIA_EXTENSIONS.has(getMediaExtension(item.name))) return null
  return {
    name: item.name,
    path: item.path,
    size: item.size,
    sha: item.sha,
    downloadUrl: item.download_url ?? undefined,
    rawUrl: buildRawMediaUrl(mediaRepoFullName, item.name),
  }
}

/**
 * 一覧アイテム配列を MediaAsset 配列に変換する（ディレクトリ・非対応形式は除外）。
 * ファイル名先頭が YYYYMMDD のため、名前の降順 ≒ 添付日時の新しい順で並べる。
 */
export function mapContentsToMediaAssets(
  items: GitHubContentsItem[],
  mediaRepoFullName: string
): MediaAsset[] {
  return items
    .map((item) => contentsItemToMediaAsset(item, mediaRepoFullName))
    .filter((asset): asset is MediaAsset => asset !== null)
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0))
}

/**
 * バイト数を人間可読な単位（B/KB/MB）にする（表示専用の純粋関数）。
 * 10 未満は小数第 1 位まで、10 以上は整数に丸める（セル幅に収める）。
 */
export function formatMediaSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}
