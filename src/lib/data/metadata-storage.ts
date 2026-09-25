/**
 * metadata 永続化層（#295）
 *
 * `notes`/`leaves` の件数に比例して肥大化する home metadata（GitHub の
 * `metadata.json` と同形の `Metadata`）だけを、リポごとのキーで専用の
 * IndexedDB `agasteer/metadata`（object store: `byRepo`）に保存する。
 * storage.ts が定義する per-repo DB（`agasteer/db/<sanitized>`）とは別系統。
 *
 * storage.ts が god-file 化していたため（#295 S4）、metadata DB の開閉・読み書き
 * （openMetadataDb/readMetadata/writeMetadata/flushPersistedMetadata）と、旧
 * localStorage `byRepo[].metadata` からの一回限りの移行
 * （migrateMetadataFromLocalStorage）をこのファイルに分離している。
 *
 * 循環 import 回避: このファイルは storage.ts の loadStorageData/saveStorageData/
 * currentRepoKey/getPerRepoState/StorageError を静的 import するが、storage.ts
 * 側はこのファイルを静的 import しない。storage.ts の loadSettings() は
 * migrateMetadataFromLocalStorage を動的 import 経由で1箇所だけ呼ぶ。
 */

import type { Metadata } from '../types'
import {
  StorageError,
  loadStorageData,
  saveStorageData,
  currentRepoKey,
  getPerRepoState,
} from './storage'

const METADATA_DB_NAME = 'agasteer/metadata'
const METADATA_STORE = 'byRepo'
let metadataDbPromise: Promise<IDBDatabase> | null = null
const metadataWrites = new Map<string, Promise<void>>()

function openMetadataDb(): Promise<IDBDatabase> {
  if (metadataDbPromise) return metadataDbPromise
  metadataDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    // onblocked で reject した後も、他タブの接続が閉じられれば同じ request が
    // 遅れて onsuccess することがある。その場合に db を握って resolve し直すと
    // 誰も close しないハンドルがリークするため、blocked フラグで検知して
    // 即座に close するだけにする（#295 nit）。
    let blocked = false
    const request = indexedDB.open(METADATA_DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(METADATA_STORE)
    }
    request.onsuccess = () => {
      const db = request.result
      if (blocked) {
        db.close()
        return
      }
      db.onversionchange = () => {
        db.close()
        metadataDbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new StorageError('db_blocked', 'Metadata database is blocked'))
    }
  }).catch((error) => {
    metadataDbPromise = null
    throw error
  })
  return metadataDbPromise
}

async function readMetadata(repoKey: string): Promise<Metadata | null> {
  const db = await openMetadataDb()
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(METADATA_STORE, 'readonly')
      .objectStore(METADATA_STORE)
      .get(repoKey)
    request.onsuccess = () => resolve((request.result as Metadata | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
}

function writeMetadata(repoKey: string, metadata: Metadata): Promise<void> {
  // リポ切替や連続更新で古い書き込みが新しい内容を上書きしないよう直列化する。
  const previous = metadataWrites.get(repoKey) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      const db = await openMetadataDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE, 'readwrite')
        // Svelte 5 の $state Proxy は structured clone できないため、
        // IndexedDB に put する前に JSON ラウンドトリップでプレーンオブジェクト化する。
        tx.objectStore(METADATA_STORE).put(JSON.parse(JSON.stringify(metadata)), repoKey)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('Metadata transaction aborted'))
      })
    })
  metadataWrites.set(repoKey, next)
  void next
    .finally(() => {
      if (metadataWrites.get(repoKey) === next) metadataWrites.delete(repoKey)
    })
    .catch(() => {})
  return next
}

export async function flushPersistedMetadata(): Promise<void> {
  await Promise.all(metadataWrites.values())
}

export async function migrateMetadataFromLocalStorage(): Promise<void> {
  const data = loadStorageData()
  const legacy = Object.entries(data.byRepo).filter(([, state]) => state.metadata)
  if (!legacy.length) {
    if (data.storageVersion !== 2) {
      data.storageVersion = 2
      saveStorageData(data)
    }
    return
  }
  for (const [repoKey, state] of legacy) {
    // 途中で失敗した場合は旧データをすべて保持し、次回再試行する。
    // IndexedDB を正とする: 既に値があれば（新しいかどうかは比較せず）
    // localStorage 側の値では上書きしない。
    if (!(await readMetadata(repoKey))) {
      await writeMetadata(repoKey, state.metadata!)
      const copied = await readMetadata(repoKey)
      if (JSON.stringify(copied) !== JSON.stringify(state.metadata)) {
        throw new StorageError(
          'db_operation',
          `Metadata migration verification failed for ${repoKey}`
        )
      }
    }
  }
  // 非同期処理中の他の localStorage 更新を消さないよう、保存直前に読み直す。
  const latest = loadStorageData()
  for (const [repoKey] of legacy) {
    if (latest.byRepo[repoKey]) delete latest.byRepo[repoKey].metadata
  }
  latest.storageVersion = 2
  saveStorageData(latest)
}

/**
 * home metadata を取得（現在リポ。起動時の復元用）
 */
export async function getPersistedMetadata(): Promise<Metadata | null> {
  const key = currentRepoKey()
  if (!key) return null
  try {
    // #295 S1: 直前の書き込みが reject 済み（例: 前回の DB 障害）だと、素の
    // await はその reject をそのままここへ伝播させ、catch 節で legacy
    // フォールバック（移行後は基本 undefined）に落ちてしまい、IndexedDB に
    // 既にある直近の正常値を読み損なう。書き込みの成否はここでは関心事では
    // ないため、reject を握りつぶしてから readMetadata で最新値を読む。
    await metadataWrites.get(key)?.catch(() => {})
    return (await readMetadata(key)) ?? getPerRepoState(key).metadata ?? null
  } catch (error) {
    console.error('Failed to read persisted metadata:', error)
    return getPerRepoState(key).metadata ?? null
  }
}

/**
 * home metadata を保存（現在リポ）
 */
export function setPersistedMetadata(metadata: Metadata): Promise<void> {
  const key = currentRepoKey()
  if (!key) return Promise.resolve()
  return writeMetadata(key, metadata)
}
