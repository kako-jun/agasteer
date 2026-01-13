/**
 * ワールド（Home/Archive）関連のヘルパー関数
 * ストアに依存しない純粋関数として定義
 */

import type { Note, Leaf, WorldType } from '../types'
import type { Pane } from '../navigation'

/**
 * ワールドに応じたノート配列を取得
 */
export function getNotesForWorld(
  world: WorldType,
  homeNotes: Note[],
  archiveNotes: Note[]
): Note[] {
  return world === 'archive' ? archiveNotes : homeNotes
}

/**
 * ワールドに応じたリーフ配列を取得
 */
export function getLeavesForWorld(
  world: WorldType,
  homeLeaves: Leaf[],
  archiveLeaves: Leaf[]
): Leaf[] {
  return world === 'archive' ? archiveLeaves : homeLeaves
}

/**
 * ペインに応じたワールドを取得
 */
export function getWorldForPane(
  pane: Pane,
  leftWorld: WorldType,
  rightWorld: WorldType
): WorldType {
  return pane === 'left' ? leftWorld : rightWorld
}

/**
 * ペインに応じたノート配列を取得
 */
export function getNotesForPane(
  pane: Pane,
  leftWorld: WorldType,
  rightWorld: WorldType,
  homeNotes: Note[],
  archiveNotes: Note[]
): Note[] {
  const world = getWorldForPane(pane, leftWorld, rightWorld)
  return getNotesForWorld(world, homeNotes, archiveNotes)
}

/**
 * ペインに応じたリーフ配列を取得
 */
export function getLeavesForPane(
  pane: Pane,
  leftWorld: WorldType,
  rightWorld: WorldType,
  homeLeaves: Leaf[],
  archiveLeaves: Leaf[]
): Leaf[] {
  const world = getWorldForPane(pane, leftWorld, rightWorld)
  return getLeavesForWorld(world, homeLeaves, archiveLeaves)
}

/**
 * ノートが属するワールドを判定
 */
export function getWorldForNote(note: Note, homeNotes: Note[], archiveNotes: Note[]): WorldType {
  if (homeNotes.some((n) => n.id === note.id)) return 'home'
  if (archiveNotes.some((n) => n.id === note.id)) return 'archive'
  return 'home' // フォールバック
}

/**
 * リーフが属するワールドを判定
 */
export function getWorldForLeaf(leaf: Leaf, homeLeaves: Leaf[], archiveLeaves: Leaf[]): WorldType {
  if (homeLeaves.some((l) => l.id === leaf.id)) return 'home'
  if (archiveLeaves.some((l) => l.id === leaf.id)) return 'archive'
  return 'home' // フォールバック
}

/**
 * ダイアログの表示位置をペインに応じて決定
 */
export function getDialogPositionForPane(pane: Pane): 'bottom-left' | 'bottom-right' {
  return pane === 'left' ? 'bottom-left' : 'bottom-right'
}
