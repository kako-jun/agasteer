/**
 * キーボードナビゲーション関連のロジック
 *
 * App.svelte から抽出した、キーボードによるグリッドナビゲーション・
 * アイテム選択・親ディレクトリへの移動操作を集約するモジュール。
 */

import type { Note, Leaf } from './types'
import type { Pane } from './navigation'
import * as nav from './navigation'
import { leftView, rightView, leftNote, rightNote, focusedPane } from './stores'
import {
  appState,
  derivedState,
  getNotesForPane,
  getLeavesForPane,
  getWorldForPane,
} from './app-state.svelte'
import { isOfflineLeaf, isPriorityLeaf } from './utils'
import {
  goHome,
  selectNote,
  selectLeaf,
  openOfflineView,
  openPriorityView,
  switchPane,
  getNavState,
  getNavDeps,
} from './pane-navigation.svelte'
import { pushToGitHub as pushToGitHubAction } from './actions/git'

// ========================================
// Grid navigation helpers
// ========================================

export function getCurrentItemsForPane(pane: Pane): (Note | Leaf)[] {
  const view = pane === 'left' ? leftView.value : rightView.value
  const note = pane === 'left' ? leftNote.value : rightNote.value
  const paneNotes = getNotesForPane(pane)
  const paneLeaves = getLeavesForPane(pane)

  if (view === 'home') {
    const specialLeaves: Leaf[] = []
    if (getWorldForPane(pane) !== 'archive') {
      if (derivedState.currentOfflineLeaf) specialLeaves.push(derivedState.currentOfflineLeaf)
      if (derivedState.currentPriorityLeaf) specialLeaves.push(derivedState.currentPriorityLeaf)
    }
    const rootNotes = paneNotes.filter((n) => !n.parentId).sort((a, b) => a.order - b.order)
    return [...specialLeaves, ...rootNotes]
  } else if (view === 'note' && note) {
    const subNotes = paneNotes
      .filter((n) => n.parentId === note.id)
      .sort((a, b) => a.order - b.order)
    const noteLeaves = paneLeaves
      .filter((l) => l.noteId === note.id)
      .sort((a, b) => a.order - b.order)
    return [...subNotes, ...noteLeaves]
  }
  return []
}

export function navigateGridForPane(direction: 'up' | 'down' | 'left' | 'right') {
  const pane = focusedPane.value
  const items = getCurrentItemsForPane(pane)
  const currentIndex = pane === 'left' ? appState.selectedIndexLeft : appState.selectedIndexRight

  if (items.length === 0) return

  const gridColumns = nav.calculateGridColumns(pane)
  let newIndex = currentIndex

  switch (direction) {
    case 'up':
      newIndex = Math.max(0, currentIndex - gridColumns)
      break
    case 'down':
      newIndex = Math.min(items.length - 1, currentIndex + gridColumns)
      break
    case 'left':
      if (currentIndex % gridColumns !== 0) {
        newIndex = Math.max(0, currentIndex - 1)
      }
      break
    case 'right':
      if ((currentIndex + 1) % gridColumns !== 0 && currentIndex < items.length - 1) {
        newIndex = Math.min(items.length - 1, currentIndex + 1)
      }
      break
  }

  if (pane === 'left') {
    appState.selectedIndexLeft = newIndex
  } else {
    appState.selectedIndexRight = newIndex
  }
}

export function openSelectedItemForPane() {
  const pane = focusedPane.value
  const items = getCurrentItemsForPane(pane)
  const index = pane === 'left' ? appState.selectedIndexLeft : appState.selectedIndexRight

  if (index < 0 || index >= items.length) return

  const item = items[index]
  if ('noteId' in item) {
    const leaf = item as Leaf
    if (isOfflineLeaf(leaf.id)) {
      openOfflineView(pane)
    } else if (isPriorityLeaf(leaf.id)) {
      openPriorityView(pane)
    } else {
      selectLeaf(leaf, pane)
    }
  } else {
    selectNote(item as Note, pane)
  }
}

export function goBackToParentForPane() {
  const pane = focusedPane.value
  const view = pane === 'left' ? leftView.value : rightView.value
  const note = pane === 'left' ? leftNote.value : rightNote.value

  if (view === 'note' && note) {
    const paneNotes = getNotesForPane(pane)
    const parentNote = paneNotes.find((n) => n.id === note.parentId)

    if (parentNote) {
      selectNote(parentNote, pane)

      const items = getCurrentItemsForPane(pane)
      const targetIndex = items.findIndex((item) => 'name' in item && item.id === note.id)
      if (targetIndex !== -1) {
        if (pane === 'left') {
          appState.selectedIndexLeft = targetIndex
        } else {
          appState.selectedIndexRight = targetIndex
        }
      }
    } else {
      goHome(pane)
    }
  }
}

export function handleGlobalKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    pushToGitHubAction()
    return
  }
  const state = getNavState()
  nav.handleGlobalKeyDown(state, getNavDeps(), e, {
    onSwitchPane: (pane) => switchPane(pane),
    onNavigateGrid: (direction) => navigateGridForPane(direction),
    onOpenSelectedItem: () => openSelectedItemForPane(),
    onGoBackToParent: () => goBackToParentForPane(),
  })
}
