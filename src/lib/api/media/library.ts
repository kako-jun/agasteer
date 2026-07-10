/**
 * メディアライブラリ（一覧・削除）の純粋層（#250）
 *
 * GitHub Git Trees API のツリーエントリを表示用の MediaAsset に変換し、
 * 表示対象（ルート直下・対応形式のファイルのみ）にフィルタする純粋関数群。
 * fetch・settings・IO には触れない（naming/validation の純粋層と同じ扱い）。
 *
 * #258: 一覧の取得元を Contents API（ディレクトリあたり 1000 件で silent cap）
 * から Git Trees API（全件返る・上限は truncated フラグで検知可能）に切り替えた。
 *
 * 副作用を伴う一覧取得・削除（HTTP・IndexedDB evict）は sibling の
 * `api/media-library.ts`（副作用層）に置く。
 */

import {
  getMediaExtension,
  buildRawMediaUrl,
  parseRawMediaUrl,
  RAW_MEDIA_URL_SCAN_PATTERN,
} from './naming'
import { ALLOWED_MEDIA_EXTENSIONS } from './validation'

/**
 * メディアライブラリ画面が扱う 1 アセット（表示・削除に必要な最小情報）。
 * MediaPendingItem / MediaCacheEntry と同様、メディアサブシステム固有の
 * データ構造なのでこの層に置く（types.ts のドメインモデル Note/Leaf とは別カテゴリ）。
 */
export interface MediaAsset {
  /** ファイル名（メディアはリポルート直下なので path と一致） */
  name: string
  /** リポルートからのパス（Contents API DELETE の宛先。ルート直下なので name と同じ） */
  path: string
  /** バイト数 */
  size: number
  /** blob SHA（Contents API DELETE に必須。Trees API のエントリからも取れる） */
  sha: string
  /** 認証付き取得・種別判定に使う raw URL（buildRawMediaUrl で再構成） */
  rawUrl: string
}

/**
 * GitHub Git Trees API のツリーエントリ（本機能が使う部分集合）。
 * `GET /git/trees/{ref}?recursive=1` の `tree` 配列要素。blob は size を持つ。
 */
export interface GitTreeItem {
  path: string
  type: string
  sha: string
  size?: number
}

/**
 * ツリーエントリ 1 件を MediaAsset に変換する。表示対象でなければ null。
 *
 * 除外する対象:
 * - blob 以外（type !== 'blob'。tree=ディレクトリ・commit=submodule 等）
 * - ルート直下でないパス（recursive=1 はネストした blob も返すが、メディアは
 *   フラット配置が前提で、raw URL の「1 セグメント」構造的不変条件（#242）を
 *   満たさないパスは扱わない）
 * - 対応形式ホワイトリスト外（`.gitkeep` は拡張子が無く弾かれる。想定外拡張子も同様）
 */
export function treeItemToMediaAsset(
  item: GitTreeItem,
  mediaRepoFullName: string
): MediaAsset | null {
  if (item.type !== 'blob') return null
  if (item.path.includes('/')) return null
  if (!ALLOWED_MEDIA_EXTENSIONS.has(getMediaExtension(item.path))) return null
  return {
    name: item.path,
    path: item.path,
    size: item.size ?? 0,
    sha: item.sha,
    rawUrl: buildRawMediaUrl(mediaRepoFullName, item.path),
  }
}

/**
 * ツリーエントリ配列を MediaAsset 配列に変換する（非 blob・ネスト・非対応形式は除外）。
 * ファイル名先頭が YYYYMMDD のため、名前の降順 ≒ 添付日時の新しい順で並べる。
 */
export function mapTreeToMediaAssets(
  items: GitTreeItem[],
  mediaRepoFullName: string
): MediaAsset[] {
  return items
    .map((item) => treeItemToMediaAsset(item, mediaRepoFullName))
    .filter((asset): asset is MediaAsset => asset !== null)
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0))
}

/**
 * リーフ本文（Markdown）群から、参照されている raw メディア URL の集合を作る（#250 孤児検出）。
 *
 * 抽出は naming.ts の RAW_MEDIA_URL_SCAN_PATTERN（parse と同じ安全文字クラスから
 * 組み立てた非アンカー版）で行い、散文中の素の URL 直後に句読点や日本語が続いても
 * URL 部分だけを正しく切り出す。ASCII の文末ピリオド等（`.` `-` `_`）は文字クラス内で
 * 巻き込まれ得るが、確定ファイル名は必ず拡張子の英数字で終わるため、末尾の
 * `[._-]` を落としてから parseRawMediaUrl で構造検証する（正しい URL は不変・
 * 巻き込みだけが除去される）。誤って「参照なし」に倒れると未参照バッジが
 * 参照中メディアの削除を誘発するため、取りこぼさない方向に設計している。
 *
 * 集合に **無い** アセット＝未参照（孤児）候補。判定の正しさは渡す contents の
 * 網羅性に依存する: Home + Archive の全リーフ本文を渡すこと
 * （Archive 未ロード時は判定自体を保留するのが呼び出し側の契約）。
 */
export function collectMediaReferenceUrls(contents: readonly string[]): Set<string> {
  const refs = new Set<string>()
  for (const content of contents) {
    for (const matched of content.match(RAW_MEDIA_URL_SCAN_PATTERN) ?? []) {
      const candidate = matched.replace(/[._-]+$/, '')
      if (parseRawMediaUrl(candidate)) {
        refs.add(candidate)
      }
    }
  }
  return refs
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
