/**
 * LocalStorage操作
 * アプリケーションデータの永続化を担当
 */

import type { Settings, Folder, Note, ThemeType } from './types'

// 設定のみLocalStorage利用（キー簡素化）
const SETTINGS_KEY = 'simplest-md-note'
const THEME_OPTIONS: ThemeType[] = ['yomi', 'campus', 'greenboard', 'whiteboard', 'dotsD', 'dotsF']
const DB_NAME = 'simplest-md-note/db'
const NOTES_STORE = 'notes'
const FOLDERS_STORE = 'folders'

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
 * IndexedDBを開く（notes/folders用）
 */
async function openAppDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' })
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
export async function loadNotes(): Promise<Note[]> {
  try {
    const db = await openAppDB()
    return await getAllFromStore<Note>(db, NOTES_STORE)
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
 * フォルダを読み込む
 */
export async function loadFolders(): Promise<Folder[]> {
  try {
    const db = await openAppDB()
    const folders = await getAllFromStore<Folder>(db, FOLDERS_STORE)
    // orderが欠けていたら付与
    return folders.map((folder, index) =>
      folder.order === undefined ? { ...folder, order: index } : folder
    )
  } catch (error) {
    console.error('Failed to load folders from IndexedDB:', error)
    return []
  }
}

/**
 * フォルダを保存
 */
export async function saveFolders(folders: Folder[]): Promise<void> {
  try {
    const db = await openAppDB()
    await replaceAllInStore<Folder>(db, FOLDERS_STORE, folders)
  } catch (error) {
    console.error('Failed to save folders to IndexedDB:', error)
  }
}

/**
 * 全データを削除（notes/foldersストアをクリア）
 */
export async function clearAllData(): Promise<void> {
  try {
    const db = await openAppDB()
    await replaceAllInStore<Note>(db, NOTES_STORE, [])
    await replaceAllInStore<Folder>(db, FOLDERS_STORE, [])
  } catch (error) {
    console.error('Failed to clear data in IndexedDB:', error)
  }
}
