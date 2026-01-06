/**
 * Svelteストア
 * アプリケーション全体の状態管理
 */

import { writable, derived, get } from 'svelte/store'
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

// リーフごとのisDirtyから派生
const hasAnyLeafDirty = derived(leaves, ($leaves) => $leaves.some((l) => l.isDirty))

// ノート構造変更フラグ（作成/削除/名前変更など、リーフ以外の変更）
export const isStructureDirty = writable<boolean>(false)

// 構造変更があったノートのID（差分検出で自動更新）
export const dirtyNoteIds = writable<Set<string>>(new Set())

// ============================================
// 最後にPushした状態のスナップショット（差分検出用）
// ============================================
let lastPushedNotes: Note[] = []
let lastPushedLeaves: Leaf[] = []
let lastPushedArchiveNotes: Note[] = []
let lastPushedArchiveLeaves: Leaf[] = []

/**
 * 現在の状態と最後にPushした状態を比較し、変更があったノートIDを検出
 */
function detectDirtyNoteIds(
  currentNotes: Note[],
  lastNotes: Note[],
  currentLeaves: Leaf[],
  lastLeaves: Leaf[]
): Set<string> {
  const dirtyIds = new Set<string>()

  const currentNoteMap = new Map(currentNotes.map((n) => [n.id, n]))
  const lastNoteMap = new Map(lastNotes.map((n) => [n.id, n]))
  const currentLeafMap = new Map(currentLeaves.map((l) => [l.id, l]))
  const lastLeafMap = new Map(lastLeaves.map((l) => [l.id, l]))

  // ノートの追加: 親ノートがdirty（ルートノートの場合はホームがdirtyだが、ノートIDはない）
  for (const note of currentNotes) {
    if (!lastNoteMap.has(note.id)) {
      if (note.parentId) dirtyIds.add(note.parentId)
    }
  }

  // ノートの削除: 親ノートがdirty
  for (const note of lastNotes) {
    if (!currentNoteMap.has(note.id)) {
      if (note.parentId) dirtyIds.add(note.parentId)
    }
  }

  // ノートの変更: name, parentId, orderの変更
  for (const note of currentNotes) {
    const lastNote = lastNoteMap.get(note.id)
    if (lastNote) {
      if (note.name !== lastNote.name || note.order !== lastNote.order) {
        // 属性変更: そのノート自体（と親）がdirty
        if (note.parentId) dirtyIds.add(note.parentId)
      }
      if (note.parentId !== lastNote.parentId) {
        // 移動: 元の親と新しい親がdirty
        if (lastNote.parentId) dirtyIds.add(lastNote.parentId)
        if (note.parentId) dirtyIds.add(note.parentId)
      }
    }
  }

  // リーフの追加: 親ノートがdirty
  for (const leaf of currentLeaves) {
    if (!lastLeafMap.has(leaf.id)) {
      dirtyIds.add(leaf.noteId)
    }
  }

  // リーフの削除: 親ノートがdirty
  for (const leaf of lastLeaves) {
    if (!currentLeafMap.has(leaf.id)) {
      dirtyIds.add(leaf.noteId)
    }
  }

  // リーフの変更: noteId, title, orderの変更（contentはleaf.isDirtyで管理）
  for (const leaf of currentLeaves) {
    const lastLeaf = lastLeafMap.get(leaf.id)
    if (lastLeaf) {
      if (leaf.title !== lastLeaf.title || leaf.order !== lastLeaf.order) {
        // 属性変更: 親ノートがdirty
        dirtyIds.add(leaf.noteId)
      }
      if (leaf.noteId !== lastLeaf.noteId) {
        // 移動: 元の親ノートと新しい親ノートがdirty
        dirtyIds.add(lastLeaf.noteId)
        dirtyIds.add(leaf.noteId)
      }
    }
  }

  return dirtyIds
}

/**
 * Home用の差分検出を実行してdirtyNoteIdsを更新
 */
function updateHomeDirtyNoteIds(currentNotes: Note[], currentLeaves: Leaf[]): void {
  const homeDirty = detectDirtyNoteIds(
    currentNotes,
    lastPushedNotes,
    currentLeaves,
    lastPushedLeaves
  )
  // Archiveの現在の状態を取得して統合
  const archiveNotesList = get(archiveNotes)
  const archiveLeavesList = get(archiveLeaves)
  const archiveDirty = detectDirtyNoteIds(
    archiveNotesList,
    lastPushedArchiveNotes,
    archiveLeavesList,
    lastPushedArchiveLeaves
  )
  // 統合
  const combined = new Set<string>()
  homeDirty.forEach((id) => combined.add(id))
  archiveDirty.forEach((id) => combined.add(id))
  dirtyNoteIds.set(combined)
}

/**
 * Archive用の差分検出を実行してdirtyNoteIdsを更新
 */
function updateArchiveDirtyNoteIds(currentNotes: Note[], currentLeaves: Leaf[]): void {
  const archiveDirty = detectDirtyNoteIds(
    currentNotes,
    lastPushedArchiveNotes,
    currentLeaves,
    lastPushedArchiveLeaves
  )
  // Homeの現在の状態を取得して統合
  const homeNotesList = get(notes)
  const homeLeavesList = get(leaves)
  const homeDirty = detectDirtyNoteIds(
    homeNotesList,
    lastPushedNotes,
    homeLeavesList,
    lastPushedLeaves
  )
  // 統合
  const combined = new Set<string>()
  homeDirty.forEach((id) => combined.add(id))
  archiveDirty.forEach((id) => combined.add(id))
  dirtyNoteIds.set(combined)
}

// 全体のダーティ判定（リーフ変更 or 構造変更）
export const isDirty = derived(
  [hasAnyLeafDirty, isStructureDirty],
  ([$hasAnyLeafDirty, $isStructureDirty]) => $hasAnyLeafDirty || $isStructureDirty
)

// LocalStorage永続化
// 注意: このsubscribeはモジュール読み込み時に実行される
isDirty.subscribe((value) => {
  setPersistedDirtyFlag(value)
})

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

// 特定ノート配下のリーフがダーティかどうか（構造変更も含む）
export function isNoteDirty(noteId: string, $leaves: Leaf[], $dirtyNoteIds: Set<string>): boolean {
  return $leaves.some((l) => l.noteId === noteId && l.isDirty) || $dirtyNoteIds.has(noteId)
}

/**
 * Push成功時に呼び出し、現在の状態をスナップショットとして保存
 * 次回以降の差分検出のベースラインとなる
 */
export function setLastPushedSnapshot(
  homeNotes: Note[],
  homeLeaves: Leaf[],
  archiveNotesData?: Note[],
  archiveLeavesData?: Leaf[]
): void {
  // ディープコピーして保存（参照を切る）
  lastPushedNotes = JSON.parse(JSON.stringify(homeNotes))
  lastPushedLeaves = JSON.parse(JSON.stringify(homeLeaves))
  if (archiveNotesData) {
    lastPushedArchiveNotes = JSON.parse(JSON.stringify(archiveNotesData))
  }
  if (archiveLeavesData) {
    lastPushedArchiveLeaves = JSON.parse(JSON.stringify(archiveLeavesData))
  }
  // スナップショット更新後はdirtyをクリア
  dirtyNoteIds.set(new Set())
}

// 全変更をクリア
export function clearAllChanges(): void {
  clearAllDirty()
  isStructureDirty.set(false)
  dirtyNoteIds.set(new Set())
}

// Pull成功時のリモートpushCountを保持（stale編集検出用）
export const lastPulledPushCount = writable<number>(0)

// stale状態（リモートに新しい変更がある）- Pullボタンに赤丸表示用
export const isStale = writable<boolean>(false)

// 最後にPush成功した時刻
export const lastPushTime = writable<number>(0)

// 最後にstaleチェックした時刻（定期チェック延長用）
export const lastStaleCheckTime = writable<number>(0)

// 自動Push進捗を初期化（循環参照回避のため遅延初期化）
import { initAutoPushProgress } from './auto-save'
initAutoPushProgress(isDirty)

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
  // 差分検出でdirtyNoteIdsを更新
  updateHomeDirtyNoteIds(newNotes, get(leaves))
}

export function updateLeaves(newLeaves: Leaf[]): void {
  leaves.set(newLeaves)
  // 無操作1秒後にIndexedDBへ保存をスケジュール
  scheduleLeavesSave()
  // 注: リーフのisDirtyは各リーフに設定されているのでここでは何もしない
  // リーフの追加/削除は構造変更としてマーク
  isStructureDirty.set(true)
  // 差分検出でdirtyNoteIdsを更新
  updateHomeDirtyNoteIds(get(notes), newLeaves)
}

// ============================================
// アーカイブ用ヘルパー関数
// ============================================

export function updateArchiveNotes(newNotes: Note[]): void {
  archiveNotes.set(newNotes)
  // TODO: アーカイブ用のIndexedDB永続化を実装
  isStructureDirty.set(true)
  // 差分検出でdirtyNoteIdsを更新
  updateArchiveDirtyNoteIds(newNotes, get(archiveLeaves))
}

export function updateArchiveLeaves(newLeaves: Leaf[]): void {
  archiveLeaves.set(newLeaves)
  // TODO: アーカイブ用のIndexedDB永続化を実装
  isStructureDirty.set(true)
  // 差分検出でdirtyNoteIdsを更新
  updateArchiveDirtyNoteIds(get(archiveNotes), newLeaves)
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
