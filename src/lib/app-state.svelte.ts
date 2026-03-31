/**
 * アプリケーション状態の集約モジュール（Phase 1）
 *
 * App.svelte からワールドヘルパー関数、paneStateStore、定数を移動。
 */

import type { Note, Leaf, WorldType } from './types'
import type { Pane } from './navigation'
import {
  notes,
  leaves,
  archiveNotes,
  archiveLeaves,
  leftWorld,
  rightWorld,
  updateNotes,
  updateLeaves,
  updateArchiveNotes,
  updateArchiveLeaves,
  // ワールドヘルパー（純粋関数）
  getNotesForWorld as _getNotesForWorld,
  getLeavesForWorld as _getLeavesForWorld,
  getWorldForPane as _getWorldForPane,
  getNotesForPane as _getNotesForPane,
  getLeavesForPane as _getLeavesForPane,
  getWorldForNote as _getWorldForNote,
  getWorldForLeaf as _getWorldForLeaf,
} from './stores'
import type { PaneState } from './stores'

// ========================================
// Constants
// ========================================

// PWAスタンドアロンモード検出（Android戻るスワイプ対策）
export const isPWAStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true)

// PWA終了ガード用のセンチネルキー
export const PWA_EXIT_GUARD_KEY = 'pwa-exit-guard'

// ========================================
// World Helpers
// ========================================

export function getNotesForWorld(world: WorldType): Note[] {
  return _getNotesForWorld(world, notes.value, archiveNotes.value)
}

export function getLeavesForWorld(world: WorldType): Leaf[] {
  return _getLeavesForWorld(world, leaves.value, archiveLeaves.value)
}

export function getWorldForPane(pane: Pane): WorldType {
  return _getWorldForPane(pane, leftWorld.value, rightWorld.value)
}

export function getNotesForPane(pane: Pane): Note[] {
  return _getNotesForPane(pane, leftWorld.value, rightWorld.value, notes.value, archiveNotes.value)
}

export function getLeavesForPane(pane: Pane): Leaf[] {
  return _getLeavesForPane(
    pane,
    leftWorld.value,
    rightWorld.value,
    leaves.value,
    archiveLeaves.value
  )
}

export function getWorldForNote(note: Note): WorldType {
  return _getWorldForNote(note, notes.value, archiveNotes.value)
}

export function getWorldForLeaf(leaf: Leaf): WorldType {
  return _getWorldForLeaf(leaf, leaves.value, archiveLeaves.value)
}

export function setCurrentNotes(newNotes: Note[]): void {
  setNotesForWorld(leftWorld.value, newNotes)
}

export function setCurrentLeaves(newLeaves: Leaf[]): void {
  setLeavesForWorld(leftWorld.value, newLeaves)
}

export function setNotesForWorld(world: WorldType, newNotes: Note[]): void {
  if (world === 'archive') {
    updateArchiveNotes(newNotes)
  } else {
    updateNotes(newNotes)
  }
}

export function setLeavesForWorld(world: WorldType, newLeaves: Leaf[]): void {
  if (world === 'archive') {
    updateArchiveLeaves(newLeaves)
  } else {
    updateLeaves(newLeaves)
  }
}

// ========================================
// Pane State Store
// ========================================

let _paneState = $state<PaneState>({
  isFirstPriorityFetched: false,
  isPullCompleted: false,
  canPush: false,
  pushDisabledReason: '',
  selectedIndexLeft: 0,
  selectedIndexRight: 0,
  editingBreadcrumb: null,
  dragOverNoteId: null,
  dragOverLeafId: null,
  loadingLeafIds: new Set(),
  leafSkeletonMap: new Map(),
  totalLeafCount: 0,
  totalLeafChars: 0,
  lastPulledPushCount: 0,
  currentPriorityLeaf: null,
  currentOfflineLeaf: null,
  breadcrumbs: [],
  breadcrumbsRight: [],
  showWelcome: false,
  isLoadingUI: false,
  leftWorld: 'home',
  rightWorld: 'home',
  isArchiveLoading: false,
})

export const paneStateStore = {
  get value() {
    return _paneState
  },
  set value(v: PaneState) {
    _paneState = v
  },
}
