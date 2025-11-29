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

// 設定のみLocalStorage利用（キー簡素化）
const SETTINGS_KEY = 'agasteer'
const THEME_OPTIONS: ThemeType[] = ['yomi', 'campus', 'greenboard', 'whiteboard', 'dotsD', 'dotsF']
const DB_NAME = 'agasteer/db'
const LEAVES_STORE = 'leaves'
const NOTES_STORE = 'notes'
const FONTS_STORE = 'fonts'
const BACKGROUNDS_STORE = 'backgrounds'

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

/**
 * IndexedDBを開く（note/leaves/fonts/backgrounds用）
 */
async function openAppDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(LEAVES_STORE)) {
        db.createObjectStore(LEAVES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(FONTS_STORE)) {
        db.createObjectStore(FONTS_STORE, { keyPath: 'name' })
      }
      if (!db.objectStoreNames.contains(BACKGROUNDS_STORE)) {
        db.createObjectStore(BACKGROUNDS_STORE, { keyPath: 'name' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
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
 * リーフを保存（オフラインリーフは保護）
 */
export async function saveLeaves(newLeaves: Leaf[]): Promise<void> {
  try {
    const db = await openAppDB()
    // オフラインリーフを保護: 先に取得
    const offlineLeaf = await getItem<Leaf>(LEAVES_STORE, '__offline__')
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, newLeaves)
    // オフラインリーフを復元（新しいリーフに含まれていなければ）
    if (offlineLeaf && !newLeaves.some((l) => l.id === '__offline__')) {
      await putItem(LEAVES_STORE, offlineLeaf)
    }
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
 * オフラインリーフは保持する
 */
export async function clearAllData(): Promise<void> {
  try {
    const db = await openAppDB()
    // オフラインリーフを保護: 先に取得してから全削除、再保存
    const offlineLeaf = await getItem<Leaf>(LEAVES_STORE, '__offline__')
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, [])
    await replaceAllInStore<Note>(db, NOTES_STORE, [])
    // オフラインリーフを復元
    if (offlineLeaf) {
      await putItem(LEAVES_STORE, offlineLeaf)
    }
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
 * オフラインリーフを保存（単一アイテム保存、デバウンス用）
 */
export async function saveOfflineLeaf(leaf: Leaf): Promise<void> {
  try {
    await putItem(LEAVES_STORE, leaf)
  } catch (error) {
    console.error('Failed to save offline leaf to IndexedDB:', error)
    throw error
  }
}

/**
 * オフラインリーフを読み込む
 */
export async function loadOfflineLeaf(id: string): Promise<Leaf | null> {
  try {
    return await getItem<Leaf>(LEAVES_STORE, id)
  } catch (error) {
    console.error('Failed to load offline leaf from IndexedDB:', error)
    return null
  }
}
