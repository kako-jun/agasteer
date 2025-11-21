/**
 * Svelteストア
 * アプリケーション全体の状態管理
 */

import { writable, derived } from 'svelte/store'
import type { Settings, Folder, Note, View } from './types'
import { defaultSettings, saveSettings, saveFolders, saveNotes } from './storage'

// 基本ストア
export const settings = writable<Settings>(defaultSettings)
export const folders = writable<Folder[]>([])
export const notes = writable<Note[]>([])
export const currentView = writable<View>('home')
export const currentFolder = writable<Folder | null>(null)
export const currentNote = writable<Note | null>(null)

// 派生ストア
export const rootFolders = derived(folders, ($folders) =>
  $folders.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
)

export const subfolders = derived([folders, currentFolder], ([$folders, $currentFolder]) =>
  $currentFolder
    ? $folders.filter((f) => f.parentId === $currentFolder.id).sort((a, b) => a.order - b.order)
    : []
)

export const currentFolderNotes = derived([notes, currentFolder], ([$notes, $currentFolder]) =>
  $currentFolder
    ? $notes.filter((n) => n.folderId === $currentFolder.id).sort((a, b) => a.order - b.order)
    : []
)

export const githubConfigured = derived(
  settings,
  ($settings) => !!($settings.token && $settings.repoName)
)

// ストアの更新と永続化をまとめたヘルパー関数
export function updateSettings(newSettings: Settings): void {
  settings.set(newSettings)
  saveSettings(newSettings)
}

export function updateFolders(newFolders: Folder[]): void {
  folders.set(newFolders)
  saveFolders(newFolders).catch((err) => console.error('Failed to persist folders:', err))
}

export function updateNotes(newNotes: Note[]): void {
  notes.set(newNotes)
  // 非同期で永続化（失敗してもUIをブロックしない）
  saveNotes(newNotes).catch((err) => console.error('Failed to persist notes:', err))
}
