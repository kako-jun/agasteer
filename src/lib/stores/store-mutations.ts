/**
 * ストア更新ヘルパー（#300）
 *
 * stores.svelte.ts から分離。ノート/リーフ/アーカイブの更新と、左右ペインに
 * 表示中のリーフ/ノートへの in-place field mutation をまとめる。
 * core-state.svelte.ts / dirty-tracking.ts / auto-save.svelte.ts への一方向
 * import のみを持つ（循環 import 回避）。
 *
 * 注意: applyLeafFieldUpdate 等はオブジェクト全体の再代入ではなく、公開 getter
 * （leftLeaf.value 等）で得た $state プロキシの参照に対して Object.assign する。
 * getter は元の $state プロキシをそのまま返すため、モジュールをまたいでも
 * 元の実装（プライベート変数への直接 Object.assign）と同一の in-place mutation になる
 * （#187 の field-level signal 最適化を維持）。
 */

import type { Settings, Note, Leaf } from '../types'
import { saveSettings } from '../data/storage'
import {
  settings,
  notes,
  leaves,
  archiveNotes,
  archiveLeaves,
  leftNote,
  rightNote,
  leftLeaf,
  rightLeaf,
  isDirty,
} from './core-state.svelte'
import { updateHomeDirtyIds, updateArchiveDirtyIds } from './dirty-tracking'
import {
  scheduleLeavesSave,
  scheduleNotesSave,
  scheduleArchiveLeavesSave,
  scheduleArchiveNotesSave,
  initAutoPushProgress,
} from './auto-save.svelte'

// 自動Push進捗を初期化（循環参照回避のため遅延初期化）
initAutoPushProgress(isDirty)

// ストアの更新と永続化をまとめたヘルパー関数
export function updateSettings(newSettings: Settings): void {
  settings.value = newSettings
  saveSettings(settings.value)
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
 * 左右ペインに表示中の同 id のリーフに対し、指定フィールドだけを mutate する。
 * #187: object 全体を再代入すると $state の outer source が bump し、不変な id を読む
 * reactive 読者（MarkdownEditor の reinit \$effect 等）まで再実行される。field mutation で
 * field-level signal だけ bump させ、id 等の不変フィールドの読者は再実行されないようにする。
 *
 * leaves.value 配列側は mutateLeavesItem / mutateArchiveLeavesItem で同様に in-place mutation
 * させると、leftLeaf と leaves[i] が同一プロキシのままになり、識別子が完全に保持される。
 */
export function applyLeafFieldUpdate(leafId: string, partial: Partial<Leaf>): void {
  const left = leftLeaf.value
  if (left?.id === leafId) Object.assign(left, partial)
  const right = rightLeaf.value
  if (right?.id === leafId) Object.assign(right, partial)
}

/**
 * Home の leaves 配列に対し、対象 id のリーフを in-place mutation で更新する。
 * #187 Phase 2: updateLeaves(newArray) は outer array source を bump させ、leaves を
 * 反復する全ての reactive reader を再評価させる（1000 リーフ × 1 文字編集 = 大量再評価）。
 * 在地 mutation なら $state proxy の field-level signal だけが bump し、波及が必要最小限になる。
 *
 * scheduleLeavesSave / updateHomeDirtyIds の bookkeeping は updateLeaves と同じく実施する。
 * detectDirtyIds は値比較ベース、lastPushedLeaves は JSON deep-copy snapshot なので
 * in-place mutation でも正しく差分検出される。
 *
 * 戻り値: 対象が見つかれば true、見つからなければ false。
 */
export function mutateLeavesItem(leafId: string, partial: Partial<Leaf>): boolean {
  const target = leaves.value.find((l) => l.id === leafId)
  if (!target) return false
  Object.assign(target, partial)
  scheduleLeavesSave()
  updateHomeDirtyIds(notes.value, leaves.value)
  return true
}

/**
 * Archive の leaves 配列に対し、対象 id のリーフを in-place mutation で更新する。
 * 詳細は mutateLeavesItem のコメント参照。
 */
export function mutateArchiveLeavesItem(leafId: string, partial: Partial<Leaf>): boolean {
  const target = archiveLeaves.value.find((l) => l.id === leafId)
  if (!target) return false
  Object.assign(target, partial)
  scheduleArchiveLeavesSave()
  updateArchiveDirtyIds(archiveNotes.value, archiveLeaves.value)
  return true
}

/**
 * 左右ペインに表示中の同 id のノートに対し、指定フィールドだけを mutate する。
 * 詳細は applyLeafFieldUpdate のコメント参照。
 */
export function applyNoteFieldUpdate(noteId: string, partial: Partial<Note>): void {
  const left = leftNote.value
  if (left?.id === noteId) Object.assign(left, partial)
  const right = rightNote.value
  if (right?.id === noteId) Object.assign(right, partial)
}
