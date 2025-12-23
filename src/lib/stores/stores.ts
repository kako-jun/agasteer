/**
 * Svelteストア
 * アプリケーション全体の状態管理
 */

import { writable, derived } from 'svelte/store'
import type { Settings, Note, Leaf, Metadata, View, WorldType } from '../types'
import type { Pane } from '../navigation'
// 循環参照回避: data/index.tsではなく、直接storageからインポート
import {
  defaultSettings,
  saveSettings,
  setPersistedDirtyFlag,
  getPersistedDirtyFlag as getPersistedDirtyFlagFromStorage,
} from '../data/storage'
import { scheduleLeavesSave, scheduleNotesSave } from './auto-save'

// ============================================
// 基本ストア（Home用）
// ============================================
export const settings = writable<Settings>(defaultSettings)
export const notes = writable<Note[]>([])
export const leaves = writable<Leaf[]>([])
export const metadata = writable<Metadata>({ version: 1, notes: {}, leaves: {}, pushCount: 0 })

// ============================================
// アーカイブ用ストア
// ============================================
export const archiveNotes = writable<Note[]>([])
export const archiveLeaves = writable<Leaf[]>([])
export const archiveMetadata = writable<Metadata>({
  version: 1,
  notes: {},
  leaves: {},
  pushCount: 0,
})
/** アーカイブがGitHubからロード済みかどうか */
export const isArchiveLoaded = writable<boolean>(false)

// ============================================
// 現在のワールド
// ============================================
export const currentWorld = writable<WorldType>('home')

// ============================================
// ダーティフラグ管理（リーフごと + 全体）
// ============================================

// リーフごとのisDirtyから全体のダーティ状態を派生
export const hasAnyDirty = derived(leaves, ($leaves) => $leaves.some((l) => l.isDirty))

// LocalStorage永続化（hasAnyDirtyの変更を監視）
// 注意: このsubscribeはモジュール読み込み時に実行される
hasAnyDirty.subscribe((value) => {
  setPersistedDirtyFlag(value)
})

// 後方互換性のためのエイリアス（読み取り専用）
export const isDirty = hasAnyDirty

// 起動時のLocalStorageチェック用（PWA強制終了対策）
// storage.tsからre-export
export const getPersistedDirtyFlag = getPersistedDirtyFlagFromStorage

// 特定のリーフをダーティに設定
export function setLeafDirty(leafId: string, dirty: boolean = true): void {
  leaves.update(($leaves) => $leaves.map((l) => (l.id === leafId ? { ...l, isDirty: dirty } : l)))
}

// 全リーフのダーティをクリア
export function clearAllDirty(): void {
  leaves.update(($leaves) => $leaves.map((l) => ({ ...l, isDirty: false })))
}

// 特定ノート配下のリーフがダーティかどうか
export function isNoteDirty(noteId: string, $leaves: Leaf[]): boolean {
  return $leaves.some((l) => l.noteId === noteId && l.isDirty)
}

// ノート構造変更フラグ（作成/削除/名前変更など、リーフ以外の変更）
export const isStructureDirty = writable<boolean>(false)

// 全体のダーティ判定（リーフ変更 or 構造変更）
export const hasAnyChanges = derived(
  [hasAnyDirty, isStructureDirty],
  ([$hasAnyDirty, $isStructureDirty]) => $hasAnyDirty || $isStructureDirty
)

// 構造変更フラグもLocalStorageに永続化
isStructureDirty.subscribe((value) => {
  // hasAnyDirtyと合わせて管理（どちらかがtrueならLocalStorageに保存）
  // hasAnyDirtyのsubscribeで既に管理しているので、ここでは構造変更時のみ追加
  if (value) {
    setPersistedDirtyFlag(true)
  }
})

// 全変更をクリア
export function clearAllChanges(): void {
  clearAllDirty()
  isStructureDirty.set(false)
}

// Pull成功時のリモートpushCountを保持（stale編集検出用）
export const lastPulledPushCount = writable<number>(0)

// stale状態（リモートに新しい変更がある）- Pullボタンに赤丸表示用
export const isStale = writable<boolean>(false)

// 最後にPush成功した時刻
export const lastPushTime = writable<number>(0)

// 自動Push進捗を初期化（循環参照回避のため遅延初期化）
import { initAutoPushProgress } from './auto-save'
initAutoPushProgress(hasAnyChanges)

// ペイン状態ストア
export const leftNote = writable<Note | null>(null)
export const rightNote = writable<Note | null>(null)
export const leftLeaf = writable<Leaf | null>(null)
export const rightLeaf = writable<Leaf | null>(null)
export const leftView = writable<View>('home')
export const rightView = writable<View>('home')

// 同期状態ストア
export const isPulling = writable<boolean>(false)
export const isPushing = writable<boolean>(false)

// フォーカス状態
export const focusedPane = writable<Pane>('left')

// オフラインリーフ状態ストア
export const offlineLeafStore = writable<{
  content: string
  badgeIcon: string
  badgeColor: string
  updatedAt: number
}>({
  content: '',
  badgeIcon: '',
  badgeColor: '',
  updatedAt: Date.now(),
})

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
  // 無操作1秒後にIndexedDBへ保存をスケジュール
  scheduleNotesSave()
  // ノート構造の変更があったらダーティフラグを立てる
  isStructureDirty.set(true)
}

export function updateLeaves(newLeaves: Leaf[]): void {
  leaves.set(newLeaves)
  // 無操作1秒後にIndexedDBへ保存をスケジュール
  scheduleLeavesSave()
  // 注: リーフのisDirtyは各リーフに設定されているのでここでは何もしない
  // リーフの追加/削除は構造変更としてマーク
  isStructureDirty.set(true)
}

// ============================================
// アーカイブ用ヘルパー関数
// ============================================

export function updateArchiveNotes(newNotes: Note[]): void {
  archiveNotes.set(newNotes)
  // TODO: アーカイブ用のIndexedDB永続化を実装
  isStructureDirty.set(true)
}

export function updateArchiveLeaves(newLeaves: Leaf[]): void {
  archiveLeaves.set(newLeaves)
  // TODO: アーカイブ用のIndexedDB永続化を実装
  isStructureDirty.set(true)
}

/**
 * アーカイブをリセット（Pull前に呼び出し）
 */
export function resetArchive(): void {
  archiveNotes.set([])
  archiveLeaves.set([])
  archiveMetadata.set({ version: 1, notes: {}, leaves: {}, pushCount: 0 })
  isArchiveLoaded.set(false)
}
