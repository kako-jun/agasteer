/**
 * バグレポート用診断ログ（#317）: 永続化層
 *
 * 共有 IndexedDB（agasteer/shared）の diagLog store を読み書きする。store 定義は
 * storage.ts 側（media-storage.ts と同じ分離）。
 * 書き込み失敗は握りつぶして console.warn のみ: 診断ログのせいで同期処理を
 * 絶対に妨げないため、呼び出し側は await しなくてよい。
 */
import { getSharedDb, DIAG_LOG_STORE } from '../data/storage'
import { trimEntries } from './format'
import type { DiagEntry } from './schema'

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 全件を時刻昇順で読む。失敗時は空配列 */
export async function readDiagEntries(): Promise<DiagEntry[]> {
  try {
    const db = await getSharedDb()
    const store = db.transaction(DIAG_LOG_STORE, 'readonly').objectStore(DIAG_LOG_STORE)
    const all = (await requestToPromise(store.getAll())) as DiagEntry[]
    return all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  } catch (e) {
    console.warn('diagnostics: read failed', e)
    return []
  }
}

/** 1件追加し、上限を超えた古い分を同じトランザクション内で削除する。失敗しても投げない */
export async function appendDiagEntry(entry: DiagEntry): Promise<void> {
  try {
    const db = await getSharedDb()
    const tx = db.transaction(DIAG_LOG_STORE, 'readwrite')
    const store = tx.objectStore(DIAG_LOG_STORE)
    // complete / abort を待つ。リスナーは最初の await より前に張る（取りこぼし防止）。
    // abort 時は reject せず、下の catch で console.warn のみ
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('diagLog transaction aborted'))
    })
    done.catch(() => {}) // 先に reject しても unhandled rejection にしない
    await requestToPromise(store.add(entry))
    // 毎回の全件読みは意図的: 上限（300 件・200K 文字）の判定を厳密に保つため。
    // 1 件は許可リストで小さく、最大 300 件、同期処理の裏で完結するので負荷は許容範囲
    const all = (await requestToPromise(store.getAll())) as DiagEntry[]
    all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    const kept = new Set(trimEntries(all).map((e) => e.id))
    for (const e of all) {
      if (e.id !== undefined && !kept.has(e.id)) store.delete(e.id)
    }
    await done
  } catch (e) {
    console.warn('diagnostics: write failed', e)
  }
}

/** 全消去。失敗時は false */
export async function clearDiagEntries(): Promise<boolean> {
  try {
    const db = await getSharedDb()
    const store = db.transaction(DIAG_LOG_STORE, 'readwrite').objectStore(DIAG_LOG_STORE)
    await requestToPromise(store.clear())
    return true
  } catch (e) {
    console.warn('diagnostics: clear failed', e)
    return false
  }
}
