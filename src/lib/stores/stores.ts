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
import { archiveLeafStatsStore } from './leaf-stats'

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
// 現在のワールド（ペインごとに管理）
// ============================================
export const leftWorld = writable<WorldType>('home')
export const rightWorld = writable<WorldType>('home')

// ============================================
// ダーティフラグ管理（リーフごと + 全体）
// ============================================

// ノート構造変更フラグ（作成/削除/名前変更など、リーフ以外の変更）
export const isStructureDirty = writable<boolean>(false)

// 構造変更があったノートのID（差分検出で自動更新）
export const dirtyNoteIds = writable<Set<string>>(new Set())

// 構造変更があったリーフのID（新規作成、タイトル変更、順序変更、移動）
export const dirtyLeafIds = writable<Set<string>>(new Set())

// ============================================
// 最後にPushした状態のスナップショット（差分検出用）
// ============================================
let lastPushedNotes: Note[] = []
let lastPushedLeaves: Leaf[] = []
let lastPushedArchiveNotes: Note[] = []
let lastPushedArchiveLeaves: Leaf[] = []

interface DirtyDetectionResult {
  noteIds: Set<string>
  leafIds: Set<string>
}

/**
 * 現在の状態と最後にPushした状態を比較し、変更があったノートID・リーフIDを検出
 */
function detectDirtyIds(
  currentNotes: Note[],
  lastNotes: Note[],
  currentLeaves: Leaf[],
  lastLeaves: Leaf[]
): DirtyDetectionResult {
  const dirtyNoteIds = new Set<string>()
  const dirtyLeafIds = new Set<string>()

  const currentNoteMap = new Map(currentNotes.map((n) => [n.id, n]))
  const lastNoteMap = new Map(lastNotes.map((n) => [n.id, n]))
  const currentLeafMap = new Map(currentLeaves.map((l) => [l.id, l]))
  const lastLeafMap = new Map(lastLeaves.map((l) => [l.id, l]))

  // ノートの追加: 親ノートがdirty、ルートノートの場合はそのノート自体がdirty
  for (const note of currentNotes) {
    if (!lastNoteMap.has(note.id)) {
      if (note.parentId) {
        dirtyNoteIds.add(note.parentId)
      } else {
        // ルートノートの追加: ノート自体をdirtyとしてマーク
        dirtyNoteIds.add(note.id)
      }
    }
  }

  // ノートの削除: 親ノートがdirty、ルートノートの場合は検出のため削除されたノートIDを追加
  for (const note of lastNotes) {
    if (!currentNoteMap.has(note.id)) {
      if (note.parentId) {
        dirtyNoteIds.add(note.parentId)
      } else {
        // ルートノートの削除: 削除されたノートIDをdirtyとしてマーク（存在しないが変更検出用）
        dirtyNoteIds.add(note.id)
      }
    }
  }

  // ノートの変更: name, parentId, orderの変更
  for (const note of currentNotes) {
    const lastNote = lastNoteMap.get(note.id)
    if (lastNote) {
      if (note.name !== lastNote.name || note.order !== lastNote.order) {
        // 属性変更: そのノート自体（と親）がdirty
        if (note.parentId) {
          dirtyNoteIds.add(note.parentId)
        } else {
          // ルートノートの属性変更: ノート自体をdirtyとしてマーク
          dirtyNoteIds.add(note.id)
        }
      }
      if (note.parentId !== lastNote.parentId) {
        // 移動: 元の親と新しい親がdirty
        if (lastNote.parentId) dirtyNoteIds.add(lastNote.parentId)
        if (note.parentId) dirtyNoteIds.add(note.parentId)
        // ルートに移動またはルートから移動の場合、ノート自体をdirtyとしてマーク
        if (!lastNote.parentId || !note.parentId) {
          dirtyNoteIds.add(note.id)
        }
      }
    }
  }

  // リーフの追加: 親ノートがdirty、リーフ自体もdirty
  for (const leaf of currentLeaves) {
    if (!lastLeafMap.has(leaf.id)) {
      dirtyNoteIds.add(leaf.noteId)
      dirtyLeafIds.add(leaf.id)
    }
  }

  // リーフの削除: 親ノートがdirty（リーフは存在しないのでdirtyLeafIdsには追加しない）
  for (const leaf of lastLeaves) {
    if (!currentLeafMap.has(leaf.id)) {
      dirtyNoteIds.add(leaf.noteId)
    }
  }

  // リーフの変更: noteId, title, order, contentの変更
  for (const leaf of currentLeaves) {
    const lastLeaf = lastLeafMap.get(leaf.id)
    if (lastLeaf) {
      if (leaf.title !== lastLeaf.title || leaf.order !== lastLeaf.order) {
        // 属性変更: 親ノートがdirty、リーフ自体もdirty
        dirtyNoteIds.add(leaf.noteId)
        dirtyLeafIds.add(leaf.id)
      }
      if (leaf.noteId !== lastLeaf.noteId) {
        // 移動: 元の親ノートと新しい親ノートがdirty、リーフ自体もdirty
        dirtyNoteIds.add(lastLeaf.noteId)
        dirtyNoteIds.add(leaf.noteId)
        dirtyLeafIds.add(leaf.id)
      }
      // コンテンツ変更: リーフ自体がdirty（スナップショット比較）
      if (leaf.content !== lastLeaf.content) {
        dirtyLeafIds.add(leaf.id)
      }
    }
  }

  return { noteIds: dirtyNoteIds, leafIds: dirtyLeafIds }
}

/**
 * Home用の差分検出を実行してdirtyNoteIds/dirtyLeafIdsを更新
 */
function updateHomeDirtyIds(currentNotes: Note[], currentLeaves: Leaf[]): void {
  const homeDirty = detectDirtyIds(currentNotes, lastPushedNotes, currentLeaves, lastPushedLeaves)
  // Archiveの現在の状態を取得して統合
  const archiveNotesList = get(archiveNotes)
  const archiveLeavesList = get(archiveLeaves)
  const archiveDirty = detectDirtyIds(
    archiveNotesList,
    lastPushedArchiveNotes,
    archiveLeavesList,
    lastPushedArchiveLeaves
  )
  // 統合
  const combinedNotes = new Set<string>()
  const combinedLeaves = new Set<string>()
  homeDirty.noteIds.forEach((id) => combinedNotes.add(id))
  archiveDirty.noteIds.forEach((id) => combinedNotes.add(id))
  homeDirty.leafIds.forEach((id) => combinedLeaves.add(id))
  archiveDirty.leafIds.forEach((id) => combinedLeaves.add(id))
  dirtyNoteIds.set(combinedNotes)
  dirtyLeafIds.set(combinedLeaves)
}

/**
 * Archive用の差分検出を実行してdirtyNoteIds/dirtyLeafIdsを更新
 */
function updateArchiveDirtyIds(currentNotes: Note[], currentLeaves: Leaf[]): void {
  const archiveDirty = detectDirtyIds(
    currentNotes,
    lastPushedArchiveNotes,
    currentLeaves,
    lastPushedArchiveLeaves
  )
  // Homeの現在の状態を取得して統合
  const homeNotesList = get(notes)
  const homeLeavesList = get(leaves)
  const homeDirty = detectDirtyIds(homeNotesList, lastPushedNotes, homeLeavesList, lastPushedLeaves)
  // 統合
  const combinedNotes = new Set<string>()
  const combinedLeaves = new Set<string>()
  homeDirty.noteIds.forEach((id) => combinedNotes.add(id))
  archiveDirty.noteIds.forEach((id) => combinedNotes.add(id))
  homeDirty.leafIds.forEach((id) => combinedLeaves.add(id))
  archiveDirty.leafIds.forEach((id) => combinedLeaves.add(id))
  dirtyNoteIds.set(combinedNotes)
  dirtyLeafIds.set(combinedLeaves)
}

// 全体のダーティ判定（リーフ変更 or ノート構造変更 or 手動フラグ）
// スナップショット比較で検出されるため、元に戻せばダーティが消える
// isStructureDirtyはPWA復元やアーカイブ移動など、スナップショット比較で検出できない場合のフォールバック
export const isDirty = derived(
  [dirtyLeafIds, dirtyNoteIds, isStructureDirty],
  ([$dirtyLeafIds, $dirtyNoteIds, $isStructureDirty]) =>
    $dirtyLeafIds.size > 0 || $dirtyNoteIds.size > 0 || $isStructureDirty
)

// LocalStorage永続化
// 注意: このsubscribeはモジュール読み込み時に実行される
isDirty.subscribe((value) => {
  setPersistedDirtyFlag(value)
})

// 起動時のLocalStorageチェック用（PWA強制終了対策）
// storage.tsからre-export
export const getPersistedDirtyFlag = getPersistedDirtyFlagFromStorage

// 特定ノート配下のリーフがダーティかどうか（構造変更も含む）
export function isNoteDirty(
  noteId: string,
  $leaves: Leaf[],
  $dirtyNoteIds: Set<string>,
  $dirtyLeafIds: Set<string>
): boolean {
  // 配下のリーフがコンテンツ変更でダーティ、またはノート自体が構造変更でダーティ
  return (
    $leaves.some((l) => l.noteId === noteId && $dirtyLeafIds.has(l.id)) || $dirtyNoteIds.has(noteId)
  )
}

/**
 * 最後にPushした時点のリーフコンテンツを取得（行単位ダーティマーカー用）
 * @param leafId リーフID
 * @returns 基準コンテンツ（見つからなければnull = 新規リーフ）
 */
export function getLastPushedContent(leafId: string): string | null {
  // Homeのリーフを検索
  const homeLeaf = lastPushedLeaves.find((l) => l.id === leafId)
  if (homeLeaf) return homeLeaf.content

  // Archiveのリーフを検索
  const archiveLeaf = lastPushedArchiveLeaves.find((l) => l.id === leafId)
  if (archiveLeaf) return archiveLeaf.content

  return null
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
  dirtyLeafIds.set(new Set())
}

// 全変更をクリア
export function clearAllChanges(): void {
  isStructureDirty.set(false)
  dirtyNoteIds.set(new Set())
  dirtyLeafIds.set(new Set())
}

// Pull成功時のリモートpushCountを保持（stale編集検出用）
export const lastPulledPushCount = writable<number>(0)

// 最後に同期した時点のリモートHEAD commit SHA（stale検出用）
export const lastKnownCommitSha = writable<string | null>(null)

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
  // 差分検出でdirtyNoteIdsを更新（ルートノートの変更も検出される）
  updateHomeDirtyIds(newNotes, get(leaves))
}

export function updateLeaves(newLeaves: Leaf[]): void {
  leaves.set(newLeaves)
  // 無操作1秒後にIndexedDBへ保存をスケジュール
  scheduleLeavesSave()
  // 差分検出でdirtyNoteIds/dirtyLeafIdsを更新（コンテンツ変更も含む）
  // リーフは必ずnoteIdを持つので、追加/削除/変更はdetectDirtyIdsで検出される
  updateHomeDirtyIds(get(notes), newLeaves)
}

// ============================================
// アーカイブ用ヘルパー関数
// ============================================

export function updateArchiveNotes(newNotes: Note[]): void {
  archiveNotes.set(newNotes)
  // TODO: アーカイブ用のIndexedDB永続化を実装
  // 差分検出でdirtyNoteIdsを更新（ルートノートの変更も検出される）
  updateArchiveDirtyIds(newNotes, get(archiveLeaves))
}

export function updateArchiveLeaves(newLeaves: Leaf[]): void {
  archiveLeaves.set(newLeaves)
  // TODO: アーカイブ用のIndexedDB永続化を実装
  // 差分検出でdirtyNoteIds/dirtyLeafIdsを更新
  updateArchiveDirtyIds(get(archiveNotes), newLeaves)
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

/**
 * リポジトリ切替時の全状態リセット
 * アーカイブ、Git参照、ダーティスナップショット、stale検出をすべてクリアする
 */
export function resetForRepoSwitch(): void {
  // アーカイブデータをクリア
  resetArchive()
  archiveLeafStatsStore.reset()

  // Pushスナップショットをクリア（旧リポのスナップショットで誤検出しないように）
  lastPushedNotes = []
  lastPushedLeaves = []
  lastPushedArchiveNotes = []
  lastPushedArchiveLeaves = []

  // ダーティフラグをクリア
  clearAllChanges()

  // Git参照をクリア（旧リポのSHAで誤判定しないように）
  lastKnownCommitSha.set(null)
  lastPulledPushCount.set(0)
  isStale.set(false)
  lastPushTime.set(0)
  lastStaleCheckTime.set(0)

  // ワールドをホームに戻す（旧リポのアーカイブ表示を防止）
  leftWorld.set('home')
  rightWorld.set('home')
}
