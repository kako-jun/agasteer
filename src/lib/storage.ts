/**
 * LocalStorage操作
 * アプリケーションデータの永続化を担当
 */

import type { Settings, Folder, Note } from './types'

const SETTINGS_KEY = 'simplest-md-note/settings'
const NOTES_KEY = 'simplest-md-note/notes'
const FOLDERS_KEY = 'simplest-md-note/folders'

export const defaultSettings: Settings = {
  token: '',
  username: '',
  email: '',
  repoName: '',
  theme: 'light',
  customBgPrimary: '#ffffff',
  customAccentColor: '#0f766e',
}

/**
 * 設定を読み込む
 */
export function loadSettings(): Settings {
  const stored = localStorage.getItem(SETTINGS_KEY)
  if (stored) {
    return { ...defaultSettings, ...JSON.parse(stored) }
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
 * フォルダを読み込む（後方互換性処理を含む）
 */
export function loadFolders(): Folder[] {
  const stored = localStorage.getItem(FOLDERS_KEY)
  if (!stored) return []

  const parsedFolders = JSON.parse(stored) as Folder[]

  // 既存フォルダにorderがない場合は追加
  let needsUpdate = false
  const updatedFolders = parsedFolders.map((folder, index) => {
    if (folder.order === undefined) {
      needsUpdate = true
      return { ...folder, order: index }
    }
    return folder
  })

  if (needsUpdate) {
    saveFolders(updatedFolders)
  }

  return updatedFolders
}

/**
 * フォルダを保存
 */
export function saveFolders(folders: Folder[]): void {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
}

/**
 * ノートを読み込む（後方互換性処理を含む）
 */
export function loadNotes(): Note[] {
  const stored = localStorage.getItem(NOTES_KEY)
  if (!stored) return []

  const parsedNotes = JSON.parse(stored) as Note[]

  // 既存ノートにorderがない場合は追加
  let needsUpdate = false
  const updatedNotes = parsedNotes.map((note, index) => {
    if (note.order === undefined) {
      needsUpdate = true
      return { ...note, order: index }
    }
    return note
  })

  if (needsUpdate) {
    saveNotes(updatedNotes)
  }

  return updatedNotes
}

/**
 * ノートを保存
 */
export function saveNotes(notes: Note[]): void {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
}
