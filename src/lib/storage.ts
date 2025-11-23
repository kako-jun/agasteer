/**
 * LocalStorage操作
 * アプリケーションデータの永続化を担当
 */

import type { Settings, Note, Leaf, ThemeType, CustomFont, CustomBackground } from './types'

// 設定のみLocalStorage利用（キー簡素化）
const SETTINGS_KEY = 'simplest-md-note'
const THEME_OPTIONS: ThemeType[] = ['yomi', 'campus', 'greenboard', 'whiteboard', 'dotsD', 'dotsF']
const DB_NAME = 'simplest-md-note/db'
const LEAVES_STORE = 'leaves'
const NOTES_STORE = 'notes'
const FONTS_STORE = 'fonts'
const BACKGROUNDS_STORE = 'backgrounds'

export const defaultSettings: Settings = {
  token: '',
  username: '',
  email: '',
  repoName: '',
  theme: 'yomi',
  toolName: 'SimplestNote.md',
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
  return { ...defaultSettings }
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
 * リーフを保存
 */
export async function saveLeaves(notes: Leaf[]): Promise<void> {
  try {
    const db = await openAppDB()
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, notes)
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
 * カスタムフォントを保存
 */
export async function saveCustomFont(font: CustomFont): Promise<void> {
  try {
    const db = await openAppDB()
    const tx = db.transaction(FONTS_STORE, 'readwrite')
    const store = tx.objectStore(FONTS_STORE)
    await new Promise<void>((resolve, reject) => {
      const request = store.put(font)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('Failed to save custom font to IndexedDB:', error)
    throw error
  }
}

/**
 * カスタムフォントを読み込む
 */
export async function loadCustomFont(name: string): Promise<CustomFont | null> {
  try {
    const db = await openAppDB()
    const tx = db.transaction(FONTS_STORE, 'readonly')
    const store = tx.objectStore(FONTS_STORE)
    return await new Promise<CustomFont | null>((resolve, reject) => {
      const request = store.get(name)
      request.onsuccess = () => resolve((request.result as CustomFont) || null)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('Failed to load custom font from IndexedDB:', error)
    return null
  }
}

/**
 * カスタムフォントを削除
 */
export async function deleteCustomFont(name: string): Promise<void> {
  try {
    const db = await openAppDB()
    const tx = db.transaction(FONTS_STORE, 'readwrite')
    const store = tx.objectStore(FONTS_STORE)
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
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
    const db = await openAppDB()
    const tx = db.transaction(BACKGROUNDS_STORE, 'readwrite')
    const store = tx.objectStore(BACKGROUNDS_STORE)
    await new Promise<void>((resolve, reject) => {
      const request = store.put(background)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
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
    const db = await openAppDB()
    const tx = db.transaction(BACKGROUNDS_STORE, 'readonly')
    const store = tx.objectStore(BACKGROUNDS_STORE)
    return await new Promise<CustomBackground | null>((resolve, reject) => {
      const request = store.get(name)
      request.onsuccess = () => resolve((request.result as CustomBackground) || null)
      request.onerror = () => reject(request.error)
    })
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
    const db = await openAppDB()
    const tx = db.transaction(BACKGROUNDS_STORE, 'readwrite')
    const store = tx.objectStore(BACKGROUNDS_STORE)
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('Failed to delete custom background from IndexedDB:', error)
    throw error
  }
}
