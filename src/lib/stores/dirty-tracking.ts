/**
 * 差分検出・Pushスナップショット管理（#300）
 *
 * stores.svelte.ts から分離。core-state.svelte.ts の notes/leaves/archiveNotes/
 * archiveLeaves/dirtyNoteIds/dirtyLeafIds/isStructureDirty を読み書きする一方向の
 * import のみを持ち、他の stores/ サブモジュールへは依存しない（循環 import 回避）。
 */

import type { Note, Leaf } from '../types'
import {
  notes,
  leaves,
  archiveNotes,
  archiveLeaves,
  dirtyNoteIds,
  dirtyLeafIds,
  isStructureDirty,
} from './core-state.svelte'

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
export function updateHomeDirtyIds(currentNotes: Note[], currentLeaves: Leaf[]): void {
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
export function updateArchiveDirtyIds(currentNotes: Note[], currentLeaves: Leaf[]): void {
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

/**
 * リポジトリ切替時にPushスナップショットをクリアする。
 * #300: resetForRepoSwitch（repo-switch-reset.ts）から分離。旧リポのスナップショットで
 * 誤検出しないよう、切替時に必ず呼ぶ。
 */
export function resetPushedSnapshots(): void {
  lastPushedNotes = []
  lastPushedLeaves = []
  lastPushedArchiveNotes = []
  lastPushedArchiveLeaves = []
}
