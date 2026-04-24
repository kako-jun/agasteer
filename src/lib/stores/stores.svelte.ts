/**
 * Svelteストア
 * アプリケーション全体の状態管理
 */

import type { Settings, Note, Leaf, Metadata, View, WorldType } from '../types'
import type { Pane } from '../navigation'
// 循環参照回避: data/index.tsではなく、直接storageからインポート
import {
  defaultSettings,
  saveSettings,
  setPersistedDirtyFlag,
  getPersistedDirtyFlag as getPersistedDirtyFlagFromStorage,
  getPersistedCommitSha,
  getPersistedLastPulledPushCount,
  getPersistedMetadata,
  setPersistedCommitSha,
  setPersistedLastPulledPushCount,
  setPersistedMetadata,
  clearArchiveData,
  setCurrentRepo,
  closeCurrentRepoDb,
  loadLeaves,
  loadNotes,
} from '../data/storage'
import {
  scheduleLeavesSave,
  scheduleNotesSave,
  scheduleArchiveLeavesSave,
  scheduleArchiveNotesSave,
  flushPendingSaves,
} from './auto-save.svelte'

// ============================================
// 基本ストア（Home用）
// ============================================
let _settings = $state<Settings>(defaultSettings)
export const settings = {
  get value() {
    return _settings
  },
  // proxy 同一性を保つため置換ではなくフィールドごとにミューテートする（#121）
  set value(v: Settings) {
    Object.assign(_settings, v)
  },
}

let _notes = $state<Note[]>([])
export const notes = {
  get value() {
    return _notes
  },
  set value(v: Note[]) {
    _notes = v
  },
}

let _leaves = $state<Leaf[]>([])
export const leaves = {
  get value() {
    return _leaves
  },
  set value(v: Leaf[]) {
    _leaves = v
  },
}

let _metadata = $state<Metadata>(
  getPersistedMetadata() ?? { version: 1, notes: {}, leaves: {}, pushCount: 0 }
)
export const metadata = {
  get value() {
    return _metadata
  },
  set value(v: Metadata) {
    _metadata = v
  },
}

// ============================================
// アーカイブ用ストア
// ============================================
let _archiveNotes = $state<Note[]>([])
export const archiveNotes = {
  get value() {
    return _archiveNotes
  },
  set value(v: Note[]) {
    _archiveNotes = v
  },
}

let _archiveLeaves = $state<Leaf[]>([])
export const archiveLeaves = {
  get value() {
    return _archiveLeaves
  },
  set value(v: Leaf[]) {
    _archiveLeaves = v
  },
}

let _archiveMetadata = $state<Metadata>({
  version: 1,
  notes: {},
  leaves: {},
  pushCount: 0,
})
export const archiveMetadata = {
  get value() {
    return _archiveMetadata
  },
  set value(v: Metadata) {
    _archiveMetadata = v
  },
}

/** アーカイブがGitHubからロード済みかどうか */
let _isArchiveLoaded = $state<boolean>(false)
export const isArchiveLoaded = {
  get value() {
    return _isArchiveLoaded
  },
  set value(v: boolean) {
    _isArchiveLoaded = v
  },
}

// ============================================
// 現在のワールド（ペインごとに管理）
// ============================================
let _leftWorld = $state<WorldType>('home')
export const leftWorld = {
  get value() {
    return _leftWorld
  },
  set value(v: WorldType) {
    _leftWorld = v
  },
}

let _rightWorld = $state<WorldType>('home')
export const rightWorld = {
  get value() {
    return _rightWorld
  },
  set value(v: WorldType) {
    _rightWorld = v
  },
}

// ============================================
// ダーティフラグ管理（リーフごと + 全体）
// ============================================

// ノート構造変更フラグ（作成/削除/名前変更など、リーフ以外の変更）
let _isStructureDirty = $state<boolean>(false)
export const isStructureDirty = {
  get value() {
    return _isStructureDirty
  },
  set value(v: boolean) {
    _isStructureDirty = v
  },
}

// 構造変更があったノートのID（差分検出で自動更新）
let _dirtyNoteIds = $state<Set<string>>(new Set())
export const dirtyNoteIds = {
  get value() {
    return _dirtyNoteIds
  },
  set value(v: Set<string>) {
    _dirtyNoteIds = v
  },
}

// 構造変更があったリーフのID（新規作成、タイトル変更、順序変更、移動）
let _dirtyLeafIds = $state<Set<string>>(new Set())
export const dirtyLeafIds = {
  get value() {
    return _dirtyLeafIds
  },
  set value(v: Set<string>) {
    _dirtyLeafIds = v
  },
}

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

  // ノートの変更: name, parentId, badge の変更
  for (const note of currentNotes) {
    const lastNote = lastNoteMap.get(note.id)
    if (lastNote) {
      if (
        note.name !== lastNote.name ||
        note.badgeIcon !== lastNote.badgeIcon ||
        note.badgeColor !== lastNote.badgeColor
      ) {
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

  // リーフの変更: noteId, title, content, badge の変更
  for (const leaf of currentLeaves) {
    const lastLeaf = lastLeafMap.get(leaf.id)
    if (lastLeaf) {
      if (leaf.title !== lastLeaf.title) {
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
      // バッジ変更: リーフ自体がdirty
      if (leaf.badgeIcon !== lastLeaf.badgeIcon || leaf.badgeColor !== lastLeaf.badgeColor) {
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
  const archiveNotesList = archiveNotes.value
  const archiveLeavesList = archiveLeaves.value
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
  dirtyNoteIds.value = combinedNotes
  dirtyLeafIds.value = combinedLeaves
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
  const homeNotesList = notes.value
  const homeLeavesList = leaves.value
  const homeDirty = detectDirtyIds(homeNotesList, lastPushedNotes, homeLeavesList, lastPushedLeaves)
  // 統合
  const combinedNotes = new Set<string>()
  const combinedLeaves = new Set<string>()
  homeDirty.noteIds.forEach((id) => combinedNotes.add(id))
  archiveDirty.noteIds.forEach((id) => combinedNotes.add(id))
  homeDirty.leafIds.forEach((id) => combinedLeaves.add(id))
  archiveDirty.leafIds.forEach((id) => combinedLeaves.add(id))
  dirtyNoteIds.value = combinedNotes
  dirtyLeafIds.value = combinedLeaves
}

// 全体のダーティ判定（リーフ変更 or ノート構造変更 or 手動フラグ）
// スナップショット比較で検出されるため、元に戻せばダーティが消える
// isStructureDirtyはPWA復元やアーカイブ移動など、スナップショット比較で検出できない場合のフォールバック
export const isDirty = {
  get value() {
    return dirtyLeafIds.value.size > 0 || dirtyNoteIds.value.size > 0 || isStructureDirty.value
  },
}

// リポジトリ切替中は in-memory への一時的な代入が localStorage に
// 書き戻されないようにするためのガード。rehydrateForRepo が true/false
// をセットする。読み取り時はリアクティブ依存を作らないよう素の変数を使う。
let isRehydrating = false

export function setRehydrating(v: boolean): void {
  isRehydrating = v
}

// LocalStorage永続化のための副作用初期化
export function initStoreEffects(): () => void {
  return $effect.root(() => {
    // isDirty → LocalStorage永続化
    $effect(() => {
      const value = isDirty.value
      if (isRehydrating) return
      setPersistedDirtyFlag(value)
    })
    // lastKnownCommitSha → LocalStorage永続化
    $effect(() => {
      const value = lastKnownCommitSha.value
      if (isRehydrating) return
      setPersistedCommitSha(value)
    })
    // metadata → LocalStorage永続化
    $effect(() => {
      const value = metadata.value
      if (isRehydrating) return
      setPersistedMetadata(value)
    })
    // lastPulledPushCount → LocalStorage永続化
    $effect(() => {
      const value = lastPulledPushCount.value
      if (isRehydrating) return
      setPersistedLastPulledPushCount(value)
    })
  })
}

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
 * Push/Pull成功時に呼び出し、現在の状態をスナップショットとして保存
 * 次回以降の差分検出のベースラインとなる
 *
 * 注意: この関数はベースラインの設定のみを行い、ダーティフラグのクリアは行わない。
 * 呼び出し元で clearAllChanges() または refreshDirtyState() を適切に呼ぶこと。
 * - Push成功時: clearAllChanges()（全変更をクリア）
 * - Pull成功時: refreshDirtyState()（Pull中の編集を再検出）
 * - Pull cancel時: clearAllChanges()（IndexedDBと同期済み）
 * - Archive load時: 呼び出し不要（Home側のダーティに影響しない）
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
}

/**
 * Archive部分のベースラインのみを更新する。
 * Archive pull完了時に使用。Home側のベースラインに影響を与えない。
 */
export function setArchiveBaseline(archiveNotesData: Note[], archiveLeavesData: Leaf[]): void {
  lastPushedArchiveNotes = JSON.parse(JSON.stringify(archiveNotesData))
  lastPushedArchiveLeaves = JSON.parse(JSON.stringify(archiveLeavesData))
}

/**
 * Pull中に到着したノートをベースラインに追加（ノートダーティの誤検出防止）
 * Pull完了前でも、到着済みノートが「新規追加」と誤判定されることを防ぐ。
 * Pull完了時の setLastPushedSnapshot で全上書きされるため、一時的なベースライン。
 */
export function addNotesToBaseline(notesData: Note[]): void {
  const copies: Note[] = JSON.parse(JSON.stringify(notesData))
  for (const copy of copies) {
    const idx = lastPushedNotes.findIndex((n) => n.id === copy.id)
    if (idx >= 0) {
      lastPushedNotes[idx] = copy
    } else {
      lastPushedNotes.push(copy)
    }
  }
}

/**
 * Pull中に到着したリーフをベースラインに追加（行ダーティの誤検出防止）
 * Pull完了前でも、到着済みリーフの編集で全行がダーティになることを防ぐ。
 * Pull完了時の setLastPushedSnapshot で全上書きされるため、一時的なベースライン。
 * 同一IDのリーフが既に存在する場合は上書きする（重複防止）。
 */
export function addLeafToBaseline(leaf: Leaf): void {
  const copy = JSON.parse(JSON.stringify(leaf))
  const idx = lastPushedLeaves.findIndex((l) => l.id === leaf.id)
  if (idx >= 0) {
    lastPushedLeaves[idx] = copy
  } else {
    lastPushedLeaves.push(copy)
  }
}

/**
 * 現在の状態とベースラインを比較し、ダーティフラグを再設定する。
 * Pull完了後に呼び出すことで、Pull中にユーザーが編集した変更を正しく検出する。
 */
export function refreshDirtyState(): void {
  const currentNotes = notes.value
  const currentLeaves = leaves.value
  const archiveNotesList = archiveNotes.value
  const archiveLeavesList = archiveLeaves.value

  const homeDirty = detectDirtyIds(currentNotes, lastPushedNotes, currentLeaves, lastPushedLeaves)
  const archiveDirty = detectDirtyIds(
    archiveNotesList,
    lastPushedArchiveNotes,
    archiveLeavesList,
    lastPushedArchiveLeaves
  )

  const combinedNotes = new Set<string>()
  const combinedLeaves = new Set<string>()
  homeDirty.noteIds.forEach((id) => combinedNotes.add(id))
  archiveDirty.noteIds.forEach((id) => combinedNotes.add(id))
  homeDirty.leafIds.forEach((id) => combinedLeaves.add(id))
  archiveDirty.leafIds.forEach((id) => combinedLeaves.add(id))

  dirtyNoteIds.value = combinedNotes
  dirtyLeafIds.value = combinedLeaves
  // Pull中の編集がなければ isStructureDirty もクリア
  if (combinedNotes.size === 0 && combinedLeaves.size === 0) {
    isStructureDirty.value = false
  }
}

// 全変更をクリア
export function clearAllChanges(): void {
  isStructureDirty.value = false
  dirtyNoteIds.value = new Set()
  dirtyLeafIds.value = new Set()
}

// Pull成功時のリモートpushCountを保持（stale編集検出用）
let _lastPulledPushCount = $state<number>(getPersistedLastPulledPushCount() ?? 0)
export const lastPulledPushCount = {
  get value() {
    return _lastPulledPushCount
  },
  set value(v: number) {
    _lastPulledPushCount = v
  },
}

// 最後に同期した時点のリモートHEAD commit SHA（stale検出用）
// localStorageから復元し、変更時に永続化する（initStoreEffectsで$effectとして設定）
let _lastKnownCommitSha = $state<string | null>(getPersistedCommitSha())
export const lastKnownCommitSha = {
  get value() {
    return _lastKnownCommitSha
  },
  set value(v: string | null) {
    _lastKnownCommitSha = v
  },
}

// stale状態（リモートに新しい変更がある）- Pullボタンに赤丸表示用
let _isStale = $state<boolean>(false)
export const isStale = {
  get value() {
    return _isStale
  },
  set value(v: boolean) {
    _isStale = v
  },
}

// 最後にPush成功した時刻
let _lastPushTime = $state<number>(0)
export const lastPushTime = {
  get value() {
    return _lastPushTime
  },
  set value(v: number) {
    _lastPushTime = v
  },
}

// 最後にstaleチェックした時刻（定期チェック延長用）
let _lastStaleCheckTime = $state<number>(0)
export const lastStaleCheckTime = {
  get value() {
    return _lastStaleCheckTime
  },
  set value(v: number) {
    _lastStaleCheckTime = v
  },
}

// 自動Push進捗を初期化（循環参照回避のため遅延初期化）
import { initAutoPushProgress } from './auto-save.svelte'
initAutoPushProgress(isDirty)

// ペイン状態ストア
let _leftNote = $state<Note | null>(null)
export const leftNote = {
  get value() {
    return _leftNote
  },
  set value(v: Note | null) {
    _leftNote = v
  },
}

let _rightNote = $state<Note | null>(null)
export const rightNote = {
  get value() {
    return _rightNote
  },
  set value(v: Note | null) {
    _rightNote = v
  },
}

let _leftLeaf = $state<Leaf | null>(null)
export const leftLeaf = {
  get value() {
    return _leftLeaf
  },
  set value(v: Leaf | null) {
    _leftLeaf = v
  },
}

let _rightLeaf = $state<Leaf | null>(null)
export const rightLeaf = {
  get value() {
    return _rightLeaf
  },
  set value(v: Leaf | null) {
    _rightLeaf = v
  },
}

let _leftView = $state<View>('home')
export const leftView = {
  get value() {
    return _leftView
  },
  set value(v: View) {
    _leftView = v
  },
}

let _rightView = $state<View>('home')
export const rightView = {
  get value() {
    return _rightView
  },
  set value(v: View) {
    _rightView = v
  },
}

// 同期状態ストア
let _isPulling = $state<boolean>(false)
export const isPulling = {
  get value() {
    return _isPulling
  },
  set value(v: boolean) {
    _isPulling = v
  },
}

let _isPushing = $state<boolean>(false)
export const isPushing = {
  get value() {
    return _isPushing
  },
  set value(v: boolean) {
    _isPushing = v
  },
}

// フォーカス状態
let _focusedPane = $state<Pane>('left')
export const focusedPane = {
  get value() {
    return _focusedPane
  },
  set value(v: Pane) {
    _focusedPane = v
  },
}

// オフラインリーフ状態ストア
let _offlineLeafStore = $state<{
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
export const offlineLeafStore = {
  get value() {
    return _offlineLeafStore
  },
  set value(v: { content: string; badgeIcon: string; badgeColor: string; updatedAt: number }) {
    _offlineLeafStore = v
  },
}

// 派生ストア
export const rootNotes = {
  get value() {
    return notes.value.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
  },
}

export const githubConfigured = {
  get value() {
    return !!(settings.value.token && settings.value.repoName)
  },
}

// ストアの更新と永続化をまとめたヘルパー関数
export function updateSettings(newSettings: Settings): void {
  Object.assign(_settings, newSettings)
  saveSettings(_settings)
}

export function updateNotes(newNotes: Note[]): void {
  notes.value = newNotes
  // 無操作1秒後にIndexedDBへ保存をスケジュール
  scheduleNotesSave()
  // 差分検出でdirtyNoteIdsを更新（ルートノートの変更も検出される）
  updateHomeDirtyIds(newNotes, leaves.value)
}

export function updateLeaves(newLeaves: Leaf[]): void {
  leaves.value = newLeaves
  // 無操作1秒後にIndexedDBへ保存をスケジュール
  scheduleLeavesSave()
  // 差分検出でdirtyNoteIds/dirtyLeafIdsを更新（コンテンツ変更も含む）
  // リーフは必ずnoteIdを持つので、追加/削除/変更はdetectDirtyIdsで検出される
  updateHomeDirtyIds(notes.value, newLeaves)
}

// ============================================
// アーカイブ用ヘルパー関数
// ============================================

export function updateArchiveNotes(newNotes: Note[]): void {
  archiveNotes.value = newNotes
  // 無操作1秒後にIndexedDBへ保存をスケジュール
  scheduleArchiveNotesSave()
  // 差分検出でdirtyNoteIdsを更新（ルートノートの変更も検出される）
  updateArchiveDirtyIds(newNotes, archiveLeaves.value)
}

export function updateArchiveLeaves(newLeaves: Leaf[]): void {
  archiveLeaves.value = newLeaves
  // 無操作1秒後にIndexedDBへ保存をスケジュール
  scheduleArchiveLeavesSave()
  // 差分検出でdirtyNoteIds/dirtyLeafIdsを更新
  updateArchiveDirtyIds(archiveNotes.value, newLeaves)
}

/**
 * アーカイブをリセット（Pull前に呼び出し）
 */
export function resetArchive(): void {
  archiveNotes.value = []
  archiveLeaves.value = []
  archiveMetadata.value = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
  isArchiveLoaded.value = false
  clearArchiveData().catch((err) => console.error('Failed to clear archive data:', err))
}

/**
 * リポジトリ切替時の全状態リセット
 * アーカイブ、Git参照、ダーティスナップショット、stale検出をすべてクリアする
 */
export function resetForRepoSwitch(): void {
  // アーカイブデータをクリア
  resetArchive()

  // Pushスナップショットをクリア（旧リポのスナップショットで誤検出しないように）
  lastPushedNotes = []
  lastPushedLeaves = []
  lastPushedArchiveNotes = []
  lastPushedArchiveLeaves = []

  // ダーティフラグをクリア
  clearAllChanges()

  // Git参照をクリア（旧リポのSHAで誤判定しないように）
  // lastKnownCommitSha は per-repo slot から rehydrateForRepo で復元するため、
  // ここでは触らない（null で上書きすると新リポ slot に null が書き込まれて
  // 復元できなくなる — stores.svelte.ts の $effect が検知してしまう）。
  // lastPulledPushCount も同様に per-repo slot から復元するため触らない。
  isStale.value = false
  lastPushTime.value = 0
  lastStaleCheckTime.value = 0

  // ワールドをホームに戻す（旧リポのアーカイブ表示を防止）
  leftWorld.value = 'home'
  rightWorld.value = 'home'

  // 旧リポのノート/リーフを開いたまま残さない
  // pullFromGitHub 側でも pane クリアしているが、以下の経路ではそこに到達しない:
  // 1. 設定確定〜pullFromGitHub 開始までの非同期ギャップ
  // 2. 同期中 repo 切替による予約pull 待機中（#134）
  // 3. token/repoName 未設定で pull が走らない無効経路
  // view も 'home' に戻すことで、null leaf を edit しようとする reactive effect を防止
  leftNote.value = null
  rightNote.value = null
  leftLeaf.value = null
  rightLeaf.value = null
  leftView.value = 'home'
  rightView.value = 'home'
}

/**
 * 指定リポの IndexedDB に切り替え、キャッシュ済みのノート/リーフを
 * Svelte ストアへロードする（#131）。
 *
 * - 切り替え前に保留中の保存を flush する
 * - 新リポの per-repo DB を open し、ノート/リーフ/アーカイブをロード
 * - ロード結果を「最後にPushしたスナップショット」として扱い、ダーティ判定の基準にする
 * - 新リポの lastKnownCommitSha を localStorage から復元する
 *
 * 初回（キャッシュなし）の場合はストアが空のままになり、
 * 既存の Pull ロジックが commitSha=null を見て初回 Pull を実行する。
 */
export async function rehydrateForRepo(repoKey: string): Promise<void> {
  // rehydrate 実行中は、ストアへの一時的な代入（null リセット等）が
  // localStorage の新リポ slot に書き戻されないようガードする。
  setRehydrating(true)
  try {
    // 旧リポの保留保存を先に flush（データ損失防止）
    try {
      await flushPendingSaves()
    } catch (error) {
      console.error('Failed to flush pending saves before repo switch:', error)
    }

    // 旧リポのインメモリをクリア（視覚的な残留を防ぐ）
    notes.value = []
    leaves.value = []
    archiveNotes.value = []
    archiveLeaves.value = []

    // 新リポの DB に切り替え
    try {
      await setCurrentRepo(repoKey)
    } catch (error) {
      console.error('Failed to open per-repo DB:', error)
      // 失敗時は何もしない（Pull が走れば復旧する）
      closeCurrentRepoDb()
      return
    }

    // 新リポのキャッシュをロード（アーカイブは isArchiveLoaded=false のまま、
    // アーカイブ画面を開いたときに別途ロードされる既存フローを維持）
    try {
      const [loadedNotes, loadedLeaves] = await Promise.all([loadNotes(), loadLeaves()])
      notes.value = loadedNotes
      leaves.value = loadedLeaves
      // 読み込んだ内容をダーティ判定のベースラインに設定（Pull 成功前と同じ扱い）
      setLastPushedSnapshot(loadedNotes, loadedLeaves, [], [])
      clearAllChanges()
    } catch (error) {
      console.error('Failed to load cached data for new repo:', error)
    }

    // lastKnownCommitSha を新リポの localStorage スロットから復元
    // （この代入は $effect を発火させるが、isRehydrating ガードで
    // setPersistedCommitSha への書き込みはスキップされる）
    lastKnownCommitSha.value = getPersistedCommitSha()
    metadata.value = getPersistedMetadata() ?? { version: 1, notes: {}, leaves: {}, pushCount: 0 }
    isStale.value = false
    lastPushTime.value = 0
    lastStaleCheckTime.value = 0
    lastPulledPushCount.value = getPersistedLastPulledPushCount() ?? 0
  } finally {
    // ガードを解除。以降の変更は通常通り per-repo slot に永続化される。
    setRehydrating(false)
  }
}
