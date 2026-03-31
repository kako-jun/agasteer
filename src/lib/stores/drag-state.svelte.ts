/**
 * ドラッグ&ドロップ状態管理ストア
 */

import type { Note, Leaf } from '../types'

export interface DragState {
  draggedNote: Note | null
  draggedLeaf: Leaf | null
  dragOverNoteId: string | null
  dragOverLeafId: string | null
}

function createDragStore() {
  let _draggedNote = $state<Note | null>(null)
  let _draggedLeaf = $state<Leaf | null>(null)
  let _dragOverNoteId = $state<string | null>(null)
  let _dragOverLeafId = $state<string | null>(null)

  return {
    get draggedNote() {
      return _draggedNote
    },
    get draggedLeaf() {
      return _draggedLeaf
    },
    get dragOverNoteId() {
      return _dragOverNoteId
    },
    get dragOverLeafId() {
      return _dragOverLeafId
    },

    // ノートのドラッグ開始
    startDragNote(note: Note) {
      _draggedNote = note
      _dragOverNoteId = null
    },

    // ノートのドラッグ終了
    endDragNote() {
      _draggedNote = null
      _dragOverNoteId = null
    },

    // ノートのドラッグオーバー
    setDragOverNote(noteId: string | null) {
      _dragOverNoteId = noteId
    },

    // リーフのドラッグ開始
    startDragLeaf(leaf: Leaf) {
      _draggedLeaf = leaf
      _dragOverLeafId = null
    },

    // リーフのドラッグ終了
    endDragLeaf() {
      _draggedLeaf = null
      _dragOverLeafId = null
    },

    // リーフのドラッグオーバー
    setDragOverLeaf(leafId: string | null) {
      _dragOverLeafId = leafId
    },

    // 全状態をリセット
    reset() {
      _draggedNote = null
      _draggedLeaf = null
      _dragOverNoteId = null
      _dragOverLeafId = null
    },

    // 現在の状態を取得（リアクティブでない）
    getState(): DragState {
      return {
        draggedNote: _draggedNote,
        draggedLeaf: _draggedLeaf,
        dragOverNoteId: _dragOverNoteId,
        dragOverLeafId: _dragOverLeafId,
      }
    },
  }
}

export const dragStore = createDragStore()
