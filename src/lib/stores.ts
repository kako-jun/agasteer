/**
 * Svelteストア
 * アプリケーション全体の状態管理
 */

import { writable, derived } from 'svelte/store'
import type { Settings, Note, Leaf, Metadata } from './types'
import { defaultSettings, saveSettings, saveNotes, saveLeaves } from './storage'

// 基本ストア
export const settings = writable<Settings>(defaultSettings)
export const notes = writable<Note[]>([])
export const leaves = writable<Leaf[]>([])
export const metadata = writable<Metadata>({ version: 1, notes: {}, leaves: {}, pushCount: 0 })
export const isDirty = writable<boolean>(false)
// Pull成功時のリモートpushCountを保持（stale編集検出用）
export const lastPulledPushCount = writable<number>(0)

// 派生ストア
export const rootNotes = derived(notes, ($notes) =>
  $notes.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
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

export function updateNotes(newNotes: Note[]): void {
  notes.set(newNotes)
  saveNotes(newNotes).catch((err) => console.error('Failed to persist notes:', err))
  // ノートの変更があったらダーティフラグを立てる
  isDirty.set(true)
}

export function updateLeaves(newLeaves: Leaf[]): void {
  leaves.set(newLeaves)
  // 非同期で永続化（失敗してもUIをブロックしない）
  saveLeaves(newLeaves).catch((err) => console.error('Failed to persist leaves:', err))
  // リーフの変更があったらダーティフラグを立てる
  isDirty.set(true)
}
