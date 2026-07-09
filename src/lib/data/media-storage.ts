/**
 * メディア同期層の per-repo IndexedDB アクセサ（#242）
 *
 * storage.ts が定義する per-repo DB の mediaPending / mediaCache store を読み書きする。
 * storage.ts は god-file 監視対象のため、store 定義（onupgradeneeded と定数）以外の
 * メディア用アクセサはこのファイルに分離している。
 *
 * 注意: 値に ArrayBuffer を含むため、storage.ts の toPlain()（JSON ラウンドトリップ）は
 * 使えない。ArrayBuffer は structured clone 可能なのでそのまま put する。
 * 保存する値は media.ts が組み立てるプレーンオブジェクトで、$state proxy は通らない。
 */

import { getCurrentDb, MEDIA_PENDING_STORE, MEDIA_CACHE_STORE } from './storage'
import type { MediaCacheMeta } from '../api/media/lru'

/** アップロード待ちのメディア（mediaPending store、key = filename） */
export interface MediaPendingItem {
  /** 確定ファイル名（主キー） */
  filename: string
  /** 確定 raw URL（内容ハッシュから即時確定済み） */
  url: string
  /** ファイル内容 */
  data: ArrayBuffer
  /** バイト数 */
  size: number
  /** MIME タイプ（File.type 由来。空文字のこともある） */
  mimeType: string
  /** enqueue 時刻（リトライ順序用） */
  enqueuedAt: number
}

/** 取得済みメディアのキャッシュ（mediaCache store、key = raw URL） */
export interface MediaCacheEntry {
  /** raw URL（主キー） */
  url: string
  data: ArrayBuffer
  size: number
  /** LRU 用の最終アクセス時刻 */
  lastAccessedAt: number
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putItem(storeName: string, item: unknown): Promise<void> {
  const db = await getCurrentDb()
  const store = db.transaction(storeName, 'readwrite').objectStore(storeName)
  await requestToPromise(store.put(item))
}

async function getItem<T>(storeName: string, key: string): Promise<T | null> {
  const db = await getCurrentDb()
  const store = db.transaction(storeName, 'readonly').objectStore(storeName)
  return ((await requestToPromise(store.get(key))) as T | undefined) ?? null
}

async function deleteItem(storeName: string, key: string): Promise<void> {
  const db = await getCurrentDb()
  const store = db.transaction(storeName, 'readwrite').objectStore(storeName)
  await requestToPromise(store.delete(key))
}

// ============================================
// pending キュー（mediaPending）
// ============================================

export async function putPendingMedia(item: MediaPendingItem): Promise<void> {
  await putItem(MEDIA_PENDING_STORE, item)
}

export async function getPendingMedia(filename: string): Promise<MediaPendingItem | null> {
  return getItem<MediaPendingItem>(MEDIA_PENDING_STORE, filename)
}

/**
 * pending 全件を enqueue の古い順で返す（リトライ用）
 */
export async function getAllPendingMedia(): Promise<MediaPendingItem[]> {
  const db = await getCurrentDb()
  const store = db.transaction(MEDIA_PENDING_STORE, 'readonly').objectStore(MEDIA_PENDING_STORE)
  const items = (await requestToPromise(store.getAll())) as MediaPendingItem[]
  return items.sort((a, b) => a.enqueuedAt - b.enqueuedAt)
}

export async function deletePendingMedia(filename: string): Promise<void> {
  await deleteItem(MEDIA_PENDING_STORE, filename)
}

// ============================================
// メディアキャッシュ（mediaCache）
// ============================================

export async function getCachedMedia(url: string): Promise<MediaCacheEntry | null> {
  return getItem<MediaCacheEntry>(MEDIA_CACHE_STORE, url)
}

export async function putCachedMedia(entry: MediaCacheEntry): Promise<void> {
  await putItem(MEDIA_CACHE_STORE, entry)
}

export async function deleteCachedMedia(url: string): Promise<void> {
  await deleteItem(MEDIA_CACHE_STORE, url)
}

/**
 * キャッシュ全件のメタ情報（url/size/lastAccessedAt）を返す。LRU 追い出し選定用。
 * 初版はカーソルで全 value を舐める素朴な実装（エントリ数は 200MB/エントリ平均数MB
 * 程度＝高々数十件想定）。肥大が問題になったらメタ専用 store への分離を検討する。
 */
export async function getAllCachedMediaMeta(): Promise<MediaCacheMeta[]> {
  const db = await getCurrentDb()
  const store = db.transaction(MEDIA_CACHE_STORE, 'readonly').objectStore(MEDIA_CACHE_STORE)
  return new Promise((resolve, reject) => {
    const metas: MediaCacheMeta[] = []
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(metas)
        return
      }
      const value = cursor.value as MediaCacheEntry
      metas.push({ url: value.url, size: value.size, lastAccessedAt: value.lastAccessedAt })
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}
