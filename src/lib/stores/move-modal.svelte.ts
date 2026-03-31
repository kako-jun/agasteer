/**
 * 移動モーダル状態管理ストア
 */

import type { Note, Leaf } from '../types'
import type { Pane } from '../navigation'

export interface MoveModalState {
  isOpen: boolean
  targetNote: Note | null
  targetLeaf: Leaf | null
  targetPane: Pane
}

function createMoveModalStore() {
  let _isOpen = $state(false)
  let _targetNote = $state<Note | null>(null)
  let _targetLeaf = $state<Leaf | null>(null)
  let _targetPane = $state<Pane>('left')

  return {
    get isOpen() {
      return _isOpen
    },
    get targetNote() {
      return _targetNote
    },
    get targetLeaf() {
      return _targetLeaf
    },
    get targetPane() {
      return _targetPane
    },

    /**
     * ノート移動モーダルを開く
     */
    openForNote(note: Note, pane: Pane) {
      _isOpen = true
      _targetNote = note
      _targetLeaf = null
      _targetPane = pane
    },

    /**
     * リーフ移動モーダルを開く
     */
    openForLeaf(leaf: Leaf, pane: Pane) {
      _isOpen = true
      _targetNote = null
      _targetLeaf = leaf
      _targetPane = pane
    },

    /**
     * モーダルを閉じる
     */
    close() {
      _isOpen = false
      _targetNote = null
      _targetLeaf = null
      _targetPane = 'left'
    },

    /**
     * 現在の状態を取得（リアクティブでない）
     */
    getState(): MoveModalState {
      return {
        isOpen: _isOpen,
        targetNote: _targetNote,
        targetLeaf: _targetLeaf,
        targetPane: _targetPane,
      }
    },
  }
}

export const moveModalStore = createMoveModalStore()
