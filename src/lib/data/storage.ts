/**
 * LocalStorage操作
 * アプリケーションデータの永続化を担当
 */

import type {
  Settings,
  Note,
  Leaf,
  ThemeType,
  CustomFont,
  CustomBackground,
  Locale,
} from '../types'
import { getLocaleFromNavigator } from 'svelte-i18n'

/**
 * ストレージエラークラス
 * IndexedDBの操作に関するエラーを種類別に分類
 */
export class StorageError extends Error {
  public readonly type: 'db_open' | 'db_blocked' | 'db_upgrade' | 'db_operation' | 'db_closed'

  constructor(
    type: StorageError['type'],
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'StorageError'
    this.type = type
  }

  /**
   * ユーザー向けの分かりやすいメッセージを返す
   */
  getUserMessage(): string {
    switch (this.type) {
      case 'db_open':
        return 'データベースを開けませんでした。ブラウザの再起動をお試しください。'
      case 'db_blocked':
        return 'データベースが他のタブで使用中です。他のタブを閉じてから再度お試しください。'
      case 'db_upgrade':
        return 'データベースの更新に失敗しました。ページを再読み込みしてください。'
      case 'db_operation':
        return 'データの保存/読み込みに失敗しました。'
      case 'db_closed':
        return 'データベース接続が切断されました。ページを再読み込みしてください。'
      default:
        return 'データベースエラーが発生しました。'
    }
  }
}

// 設定のみLocalStorage利用（キー簡素化）
const SETTINGS_KEY = 'agasteer'
const THEME_OPTIONS: ThemeType[] = ['yomi', 'campus', 'greenboard', 'whiteboard', 'dotsD', 'dotsF']
const DB_NAME = 'agasteer/db'
const DB_VERSION = 4
const LEAVES_STORE = 'leaves'
const NOTES_STORE = 'notes'
const FONTS_STORE = 'fonts'
const BACKGROUNDS_STORE = 'backgrounds'
const OFFLINE_STORE = 'offline'

export const defaultSettings: Settings = {
  token: '',
  repoName: '',
  theme: 'yomi',
  toolName: 'Agasteer',
  locale: 'en', // デフォルトは英語
  vimMode: false, // デフォルトはVimモードオフ
  linedMode: false, // デフォルトは罫線モードオフ
}

/**
 * 設定を読み込む
 */
export function loadSettings(): Settings {
  const stored = localStorage.getItem(SETTINGS_KEY)
  if (stored) {
    const storedSettings = JSON.parse(stored) as Partial<Settings>
    const merged = { ...defaultSettings, ...storedSettings }
    const storedTheme = merged.theme as string
    if (storedTheme === 'dots') {
      merged.theme = 'dotsD'
    }
    if (storedTheme === 'dots1') {
      merged.theme = 'dotsD'
    }
    if (storedTheme === 'dots2') {
      merged.theme = 'dotsF'
    }
    if (!THEME_OPTIONS.includes(merged.theme as ThemeType)) {
      merged.theme = defaultSettings.theme
    }
    return merged
  }
  const browserLocale = getLocaleFromNavigator()
  const detectedLocale: Locale = browserLocale?.startsWith('ja') ? 'ja' : 'en'
  return { ...defaultSettings, locale: detectedLocale }
}

/**
 * 設定を保存
 */
export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

// DB接続監視用のコールバック
let onDbClosedCallback: (() => void) | null = null

/**
 * DB接続が予期せず閉じられたときのコールバックを設定
 */
export function setOnDbClosed(callback: (() => void) | null): void {
  onDbClosedCallback = callback
}

/**
 * IndexedDBを開く（note/leaves/fonts/backgrounds用）
 * エラー時は最大3回リトライする
 * マイグレーション処理を明示化し、既存データを保護する
 * タイムアウト付きでハングを防止
 */
async function openAppDB(retryCount = 0): Promise<IDBDatabase> {
  const MAX_RETRIES = 3
  const RETRY_DELAY_MS = 100 // 100ms, 200ms, 300ms
  const TIMEOUT_MS = 5000 // 5秒でタイムアウト

  return new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      fn()
    }

    // タイムアウト処理
    timeoutId = setTimeout(() => {
      settle(() => {
        console.error(`IndexedDB open timed out after ${TIMEOUT_MS}ms (attempt ${retryCount + 1})`)
        if (retryCount < MAX_RETRIES) {
          // リトライ
          setTimeout(
            async () => {
              try {
                const db = await openAppDB(retryCount + 1)
                resolve(db)
              } catch (retryError) {
                reject(retryError)
              }
            },
            RETRY_DELAY_MS * (retryCount + 1)
          )
        } else {
          reject(
            new StorageError(
              'db_open',
              `IndexedDB open timed out after ${MAX_RETRIES + 1} attempts`
            )
          )
        }
      })
    }, TIMEOUT_MS)

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    // ブロック時（他のタブで古いバージョンが開いている場合）
    request.onblocked = () => {
      settle(() => {
        console.warn('IndexedDB is blocked by another tab')
        reject(new StorageError('db_blocked', 'Database is blocked by another tab'))
      })
    }

    // マイグレーション処理（既存データを保護しながらストアを追加）
    request.onupgradeneeded = (event) => {
      const db = request.result
      const oldVersion = event.oldVersion

      console.log(`IndexedDB upgrade: ${oldVersion} -> ${DB_VERSION}`)

      try {
        // バージョン0（新規）または1からのアップグレード
        if (oldVersion < 1) {
          // 初回作成
          if (!db.objectStoreNames.contains(LEAVES_STORE)) {
            db.createObjectStore(LEAVES_STORE, { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains(NOTES_STORE)) {
            db.createObjectStore(NOTES_STORE, { keyPath: 'id' })
          }
        }

        // バージョン2からのアップグレード（fontsストア追加）
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(FONTS_STORE)) {
            db.createObjectStore(FONTS_STORE, { keyPath: 'name' })
          }
        }

        // バージョン3からのアップグレード（backgroundsストア追加）
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(BACKGROUNDS_STORE)) {
            db.createObjectStore(BACKGROUNDS_STORE, { keyPath: 'name' })
          }
        }

        // バージョン4: offline store追加（leaves storeから完全分離）
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
            db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' })
          }
        }
      } catch (upgradeError) {
        console.error('IndexedDB upgrade failed:', upgradeError)
        settle(() => {
          reject(new StorageError('db_upgrade', 'Database upgrade failed', upgradeError))
        })
      }
    }

    request.onsuccess = () => {
      settle(() => {
        const db = request.result

        // DB接続監視: 予期しない切断を検知
        db.onclose = () => {
          console.warn('IndexedDB connection closed unexpectedly')
          if (onDbClosedCallback) {
            onDbClosedCallback()
          }
        }

        // エラー監視
        db.onerror = (event) => {
          console.error('IndexedDB error:', event)
        }

        resolve(db)
      })
    }

    request.onerror = () => {
      settle(async () => {
        const error = request.error
        console.error(
          `IndexedDB open failed (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`,
          error
        )

        if (retryCount < MAX_RETRIES) {
          // リトライ前に少し待機（エクスポネンシャルバックオフ）
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (retryCount + 1)))
          try {
            const db = await openAppDB(retryCount + 1)
            resolve(db)
          } catch (retryError) {
            reject(retryError)
          }
        } else {
          reject(
            new StorageError(
              'db_open',
              `IndexedDB failed to open after ${MAX_RETRIES + 1} attempts`,
              error
            )
          )
        }
      })
    }
  })
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onsuccess = () => resolve((request.result as T[]) || [])
    request.onerror = () => reject(request.error)
  })
}

function replaceAllInStore<T extends { id: string }>(
  db: IDBDatabase,
  storeName: string,
  items: T[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const clearReq = store.clear()

    clearReq.onerror = () => reject(clearReq.error)
    clearReq.onsuccess = () => {
      if (items.length === 0) {
        resolve()
        return
      }

      let remaining = items.length
      items.forEach((item) => {
        const putReq = store.put(item)
        putReq.onerror = () => reject(putReq.error)
        putReq.onsuccess = () => {
          remaining -= 1
          if (remaining === 0) {
            resolve()
          }
        }
      })
    }
  })
}

/**
 * ノートを読み込む（IndexedDB）
 */
export async function loadLeaves(): Promise<Leaf[]> {
  try {
    const db = await openAppDB()
    return await getAllFromStore<Leaf>(db, LEAVES_STORE)
  } catch (error) {
    console.error('Failed to load leaves from IndexedDB:', error)
    return []
  }
}

/**
 * リーフを保存（オフラインリーフは別storeなので影響なし）
 */
export async function saveLeaves(newLeaves: Leaf[]): Promise<void> {
  try {
    const db = await openAppDB()
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, newLeaves)
  } catch (error) {
    console.error('Failed to save leaves to IndexedDB:', error)
  }
}

/**
 * ノートを読み込む
 */
export async function loadNotes(): Promise<Note[]> {
  try {
    const db = await openAppDB()
    const notes = await getAllFromStore<Note>(db, NOTES_STORE)
    // orderが欠けていたら付与
    return notes.map((note, index) => (note.order === undefined ? { ...note, order: index } : note))
  } catch (error) {
    console.error('Failed to load notes from IndexedDB:', error)
    return []
  }
}

/**
 * ノートを保存
 */
export async function saveNotes(notes: Note[]): Promise<void> {
  try {
    const db = await openAppDB()
    await replaceAllInStore<Note>(db, NOTES_STORE, notes)
  } catch (error) {
    console.error('Failed to save notes to IndexedDB:', error)
  }
}

/**
 * 全データを削除（notes/leavesストアをクリア）
 * オフラインリーフは別storeなので影響なし
 */
export async function clearAllData(): Promise<void> {
  try {
    const db = await openAppDB()
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, [])
    await replaceAllInStore<Note>(db, NOTES_STORE, [])
  } catch (error) {
    console.error('Failed to clear data in IndexedDB:', error)
  }
}

/**
 * 汎用: アイテムを保存
 */
async function putItem<T>(storeName: string, item: T): Promise<void> {
  const db = await openAppDB()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  await new Promise<void>((resolve, reject) => {
    const request = store.put(item)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * カスタムフォントを保存
 */
export async function saveCustomFont(font: CustomFont): Promise<void> {
  try {
    await putItem(FONTS_STORE, font)
  } catch (error) {
    console.error('Failed to save custom font to IndexedDB:', error)
    throw error
  }
}

/**
 * 汎用: アイテムを読み込む
 */
async function getItem<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openAppDB()
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  return await new Promise<T | null>((resolve, reject) => {
    const request = store.get(key)
    request.onsuccess = () => resolve((request.result as T) || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * カスタムフォントを読み込む
 */
export async function loadCustomFont(name: string): Promise<CustomFont | null> {
  try {
    return await getItem<CustomFont>(FONTS_STORE, name)
  } catch (error) {
    console.error('Failed to load custom font from IndexedDB:', error)
    return null
  }
}

/**
 * 汎用: アイテムを削除
 */
async function deleteItem(storeName: string, key: string): Promise<void> {
  const db = await openAppDB()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  await new Promise<void>((resolve, reject) => {
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * カスタムフォントを削除
 */
export async function deleteCustomFont(name: string): Promise<void> {
  try {
    await deleteItem(FONTS_STORE, name)
  } catch (error) {
    console.error('Failed to delete custom font from IndexedDB:', error)
    throw error
  }
}

/**
 * カスタム背景画像を保存
 */
export async function saveCustomBackground(background: CustomBackground): Promise<void> {
  try {
    await putItem(BACKGROUNDS_STORE, background)
  } catch (error) {
    console.error('Failed to save custom background to IndexedDB:', error)
    throw error
  }
}

/**
 * カスタム背景画像を読み込む
 */
export async function loadCustomBackground(name: string): Promise<CustomBackground | null> {
  try {
    return await getItem<CustomBackground>(BACKGROUNDS_STORE, name)
  } catch (error) {
    console.error('Failed to load custom background from IndexedDB:', error)
    return null
  }
}

/**
 * カスタム背景画像を削除
 */
export async function deleteCustomBackground(name: string): Promise<void> {
  try {
    await deleteItem(BACKGROUNDS_STORE, name)
  } catch (error) {
    console.error('Failed to delete custom background from IndexedDB:', error)
    throw error
  }
}

/**
 * オフラインリーフを保存（専用storeに保存、Pull/Pushの影響を受けない）
 */
export async function saveOfflineLeaf(leaf: Leaf): Promise<void> {
  try {
    await putItem(OFFLINE_STORE, leaf)
  } catch (error) {
    console.error('Failed to save offline leaf to IndexedDB:', error)
    throw error
  }
}

/**
 * オフラインリーフを読み込む（専用storeから読み込み）
 */
export async function loadOfflineLeaf(id: string): Promise<Leaf | null> {
  try {
    return await getItem<Leaf>(OFFLINE_STORE, id)
  } catch (error) {
    console.error('Failed to load offline leaf from IndexedDB:', error)
    return null
  }
}

/**
 * Pull操作用のバックアップデータ型
 */
export interface IndexedDBBackup {
  notes: Note[]
  leaves: Leaf[]
  timestamp: number
}

/**
 * IndexedDBのデータをバックアップ（Pull操作前に使用）
 * Pull失敗時にデータを復元するため
 */
export async function createBackup(): Promise<IndexedDBBackup> {
  try {
    const db = await openAppDB()
    const [notes, leaves] = await Promise.all([
      getAllFromStore<Note>(db, NOTES_STORE),
      getAllFromStore<Leaf>(db, LEAVES_STORE),
    ])
    return {
      notes: notes.map((note, index) =>
        note.order === undefined ? { ...note, order: index } : note
      ),
      leaves,
      timestamp: Date.now(),
    }
  } catch (error) {
    console.error('Failed to create IndexedDB backup:', error)
    // バックアップ作成失敗時は空のバックアップを返す
    return { notes: [], leaves: [], timestamp: Date.now() }
  }
}

/**
 * バックアップからIndexedDBを復元（Pull失敗時に使用）
 * オフラインリーフは別storeなので影響なし
 */
export async function restoreFromBackup(backup: IndexedDBBackup): Promise<void> {
  if (!backup.notes.length && !backup.leaves.length) {
    console.log('Backup is empty, nothing to restore')
    return
  }

  try {
    console.log(
      `Restoring from backup (${backup.notes.length} notes, ${backup.leaves.length} leaves)`
    )
    const db = await openAppDB()
    await replaceAllInStore<Note>(db, NOTES_STORE, backup.notes)
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, backup.leaves)
  } catch (error) {
    console.error('Failed to restore from IndexedDB backup:', error)
    throw error
  }
}
