/**
 * メディアキャッシュの LRU 選定（純粋層）
 *
 * キャッシュ上限と「どのエントリを追い出すか」の決定のみ。IndexedDB には触れない。(#242)
 */

/** キャッシュ全体の上限（初版 200MB） */
export const MEDIA_CACHE_MAX_TOTAL_BYTES = 200 * 1024 * 1024

/** 1 件あたりの上限（これを超えるファイルはキャッシュせずオンデマンド取得） */
export const MEDIA_CACHE_MAX_ENTRY_BYTES = 20 * 1024 * 1024

/** キャッシュエントリのメタ情報（LRU 選定に必要な分だけ） */
export interface MediaCacheMeta {
  url: string
  size: number
  lastAccessedAt: number
}

/**
 * このサイズのファイルをキャッシュしてよいか（1 件上限の判定）
 */
export function shouldCacheMediaSize(size: number): boolean {
  return size <= MEDIA_CACHE_MAX_ENTRY_BYTES
}

/**
 * incomingSize を追加しても合計が上限内に収まるよう、
 * 最終アクセスが古い順に追い出す URL のリストを返す。
 * すでに収まる場合は空配列。
 */
export function selectCacheEvictions(
  entries: MediaCacheMeta[],
  incomingSize: number,
  maxTotalBytes: number = MEDIA_CACHE_MAX_TOTAL_BYTES
): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.size, 0)
  if (total + incomingSize <= maxTotalBytes) {
    return []
  }
  const oldestFirst = [...entries].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
  const evictions: string[] = []
  for (const entry of oldestFirst) {
    if (total + incomingSize <= maxTotalBytes) break
    evictions.push(entry.url)
    total -= entry.size
  }
  return evictions
}
