/**
 * PaneActions ファクトリ + App.svelte のアクションハンドラ群
 *
 * App.svelte から抽出した、paneActions オブジェクト生成・
 * ドラッグ＆ドロップ・移動モーダル・設定変更・シェア・CRUD ラッパー・
 * HMR/PWAハンドラを集約するモジュール。
 */

import { get } from 'svelte/store'
import type { Note, Leaf, Breadcrumb } from './types'
import type { Pane } from './navigation'
import type { PaneActions } from './stores'
import { _ } from './i18n'
import { locale } from 'svelte-i18n'
import {
  settings,
  updateSettings,
  leftNote,
  rightNote,
  leftLeaf,
  rightLeaf,
  leftView,
  rightView,
  leftWorld,
  rightWorld,
  isPulling,
  isPushing,
  dragStore,
  leafStatsStore,
  archiveLeafStatsStore,
  moveModalStore,
  offlineLeafStore,
  notes,
  archiveNotes,
  leaves,
  archiveLeaves,
  getDialogPositionForPane,
  resetForRepoSwitch,
  isStructureDirty,
} from './stores'
import {
  appState,
  derivedState,
  registerAppActions,
  getNotesForWorld,
  getLeavesForWorld,
  getWorldForNote,
  getWorldForLeaf,
  setNotesForWorld,
  setLeavesForWorld,
} from './app-state.svelte'
import {
  goHome,
  selectNote,
  selectLeaf,
  closeLeaf,
  switchPane,
  togglePreview,
  openPriorityView,
  openOfflineView,
  updateOfflineBadge,
  updateOfflineContent,
  handleSearchResultClick,
  handlePriorityLinkClick,
  handleDisabledPushClick,
  handleWorldChange,
  archiveNote,
  archiveLeaf,
  restoreNote,
  restoreLeaf,
  goToNextSibling,
  goToPrevSibling,
  selectSiblingFromBreadcrumb,
  swapPanes,
  copyLeftToRight,
  copyRightToLeft,
  handleLeftScroll,
  handleRightScroll,
  refreshBreadcrumbs,
  startEditingBreadcrumb,
  cancelEditBreadcrumb,
  restoreStateFromUrl,
  updateUrlFromState,
} from './pane-navigation.svelte'
import { reorderItems } from './navigation'
import {
  pushToGitHub as pushToGitHubAction,
  pullFromGitHub as pullFromGitHubAction,
  handleTestConnection as handleTestConnectionAction,
} from './actions/git'
import {
  saveEditBreadcrumb as saveEditBreadcrumbAction,
  createNote as createNoteAction,
  deleteNote as deleteNoteAction,
  updateNoteBadge as updateNoteBadgeAction,
  createLeaf as createLeafAction,
  deleteLeaf as deleteLeafAction,
  updateLeafContent as updateLeafContentAction,
  updateLeafBadge as updateLeafBadgeAction,
  updatePriorityBadge as updatePriorityBadgeAction,
} from './actions/crud'
import { moveLeafTo as moveLeafToAction, moveNoteTo as moveNoteToAction } from './actions/move'
import {
  exportNotesAsZip as exportNotesAsZipAction,
  handleImportFromOtherApps as handleImportFromOtherAppsAction,
  handleAgasteerImport as handleAgasteerImportAction,
  downloadLeafAsMarkdown as downloadLeafAsMarkdownAction,
  downloadLeafAsImage as downloadLeafAsImageAction,
} from './actions/io'
import {
  handleCopyUrl as handleCopyUrlLib,
  handleCopyMarkdown as handleCopyMarkdownLib,
  handleShareImage as handleShareImageLib,
  handleShareSelectionImage as handleShareSelectionImageLib,
  handleCopyImageToClipboard as handleCopyImageToClipboardLib,
} from './utils'
import { applyTheme, showPrompt, showConfirm } from './ui'
import { saveOfflineLeaf, setPwaInstallDismissedAt } from './data'
import { createOfflineLeaf } from './utils'

// ========================================
// Non-reactive local state
// ========================================
let isClosingSettingsPull = false
let repoChangedInSettings = false
let githubSettingsChangedInSettings = false

// ========================================
// Drag & Drop (Note)
// ========================================

export function handleDragStartNote(note: Note) {
  dragStore.startDragNote(note)
}

export function handleDragEndNote() {
  dragStore.endDragNote()
}

export function handleDragOverNote(e: DragEvent, note: Note) {
  if (!derivedState.draggedNote || derivedState.draggedNote.id === note.id) return
  if (derivedState.draggedNote.parentId !== note.parentId) return
  e.preventDefault()
  dragStore.setDragOverNote(note.id)
}

export function handleDropNote(targetNote: Note) {
  dragStore.setDragOverNote(null)
  if (!derivedState.draggedNote || derivedState.draggedNote.id === targetNote.id) return
  if (derivedState.draggedNote.parentId !== targetNote.parentId) return

  const world = getWorldForNote(derivedState.draggedNote)
  const worldNotes = getNotesForWorld(world)
  const updatedNotes = reorderItems(derivedState.draggedNote, targetNote, worldNotes, (n) =>
    derivedState.draggedNote!.parentId
      ? n.parentId === derivedState.draggedNote!.parentId
      : !n.parentId
  )
  setNotesForWorld(world, updatedNotes)
  isStructureDirty.value = true
  dragStore.endDragNote()
}

// ========================================
// Drag & Drop (Leaf)
// ========================================

export function handleDragStartLeaf(leaf: Leaf) {
  dragStore.startDragLeaf(leaf)
}

export function handleDragEndLeaf() {
  dragStore.endDragLeaf()
}

export function handleDragOverLeaf(e: DragEvent, leaf: Leaf) {
  if (!derivedState.draggedLeaf || derivedState.draggedLeaf.id === leaf.id) return
  if (derivedState.draggedLeaf.noteId !== leaf.noteId) return
  e.preventDefault()
  dragStore.setDragOverLeaf(leaf.id)
}

export function handleDropLeaf(targetLeaf: Leaf) {
  dragStore.setDragOverLeaf(null)
  if (!derivedState.draggedLeaf || derivedState.draggedLeaf.id === targetLeaf.id) return
  if (derivedState.draggedLeaf.noteId !== targetLeaf.noteId) return

  const world = getWorldForLeaf(derivedState.draggedLeaf)
  const worldLeaves = getLeavesForWorld(world)
  const updatedLeaves = reorderItems(
    derivedState.draggedLeaf,
    targetLeaf,
    worldLeaves,
    (l) => l.noteId === derivedState.draggedLeaf!.noteId
  )
  setLeavesForWorld(world, updatedLeaves)
  isStructureDirty.value = true
  dragStore.endDragLeaf()
}

// ========================================
// Move modal
// ========================================

export function openMoveModalForLeaf(pane: Pane) {
  if (!appState.isFirstPriorityFetched) return
  const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
  if (!leaf) return
  moveModalStore.openForLeaf(leaf, pane)
}

export function openMoveModalForNote(pane: Pane) {
  if (!appState.isFirstPriorityFetched) return
  const note = pane === 'left' ? leftNote.value : rightNote.value
  if (!note) return
  moveModalStore.openForNote(note, pane)
}

export function closeMoveModal() {
  moveModalStore.close()
}

export function handleMoveConfirm(destNoteId: string | null) {
  const state = moveModalStore.getState()
  if (state.targetLeaf) {
    moveLeafToAction(destNoteId, state.targetLeaf, state.targetPane)
  } else if (state.targetNote) {
    moveNoteToAction(destNoteId, state.targetNote, state.targetPane)
  }
}

// ========================================
// CRUD wrappers
// ========================================

export function createNote(parentId: string | undefined, pane: Pane, name?: string) {
  createNoteAction(parentId, pane, name)
}

export function deleteNote(pane: Pane) {
  deleteNoteAction(pane)
}

export function updateNoteBadge(noteId: string, badgeIcon: string, badgeColor: string, pane: Pane) {
  updateNoteBadgeAction(noteId, badgeIcon, badgeColor, pane)
}

export function createLeaf(pane: Pane, title?: string) {
  createLeafAction(pane, title)
}

export function deleteLeaf(leafId: string, pane: Pane) {
  deleteLeafAction(leafId, pane)
}

export async function updateLeafContent(content: string, leafId: string, pane: Pane) {
  return updateLeafContentAction(content, leafId, pane)
}

export function updateLeafBadge(leafId: string, badgeIcon: string, badgeColor: string, pane: Pane) {
  updateLeafBadgeAction(leafId, badgeIcon, badgeColor, pane)
}

export function updatePriorityBadge(badgeIcon: string, badgeColor: string) {
  updatePriorityBadgeAction(badgeIcon, badgeColor)
}

export async function saveEditBreadcrumb(id: string, newName: string, type: Breadcrumb['type']) {
  return saveEditBreadcrumbAction(id, newName, type)
}

// ========================================
// GitHub sync wrappers
// ========================================

export async function pushToGitHub() {
  return pushToGitHubAction()
}

export async function pullFromGitHub(
  isInitialStartup = false,
  onCancel?: () => void | Promise<void>
) {
  return pullFromGitHubAction(isInitialStartup, onCancel)
}

export async function exportNotesAsZip() {
  return exportNotesAsZipAction()
}

export async function handleImportFromOtherApps() {
  return handleImportFromOtherAppsAction()
}

export async function handleAgasteerImport(file: File) {
  return handleAgasteerImportAction(file)
}

export function downloadLeafAsMarkdown(leafId: string, pane: Pane) {
  downloadLeafAsMarkdownAction(leafId, pane)
}

export async function downloadLeafAsImage(leafId: string, pane: Pane) {
  return downloadLeafAsImageAction(leafId, pane)
}

export async function handleTestConnection() {
  return handleTestConnectionAction()
}

// ========================================
// Share handlers
// ========================================

function getShareHandlers() {
  return {
    translate: get(_),
    getLeaf: (pane: Pane) => (pane === 'left' ? leftLeaf.value : rightLeaf.value),
    getView: (pane: Pane) => (pane === 'left' ? leftView.value : rightView.value),
    getPreviewView: (pane: Pane) =>
      pane === 'left' ? appState.leftPreviewView : appState.rightPreviewView,
    getEditorView: (pane: Pane) =>
      pane === 'left' ? appState.leftEditorView : appState.rightEditorView,
  }
}

export function handleCopyUrl(pane: Pane) {
  handleCopyUrlLib(pane, get(_))
}

export async function handleCopyMarkdown(pane: Pane) {
  await handleCopyMarkdownLib(pane, getShareHandlers())
}

export async function handleCopyImageToClipboard(pane: Pane) {
  await handleCopyImageToClipboardLib(pane, getShareHandlers())
}

export async function handleShareImage(pane: Pane) {
  await handleShareImageLib(pane, getShareHandlers())
}

export async function handleShareSelectionImage(pane: Pane) {
  await handleShareSelectionImageLib(pane, getShareHandlers())
}

export function getHasSelection(pane: Pane): boolean {
  const editorView = pane === 'left' ? appState.leftEditorView : appState.rightEditorView
  if (!editorView || !editorView.getSelectedText) return false
  return editorView.getSelectedText() !== ''
}

export function getSelectedText(pane: Pane): string {
  const editorView = pane === 'left' ? appState.leftEditorView : appState.rightEditorView
  if (!editorView || !editorView.getSelectedText) return ''
  return editorView.getSelectedText()
}

// ========================================
// Helper wrappers
// ========================================

export function resetLeafStats() {
  leafStatsStore.reset()
}

export function rebuildLeafStats(allLeaves: Leaf[], allNotes: Note[]) {
  leafStatsStore.rebuild(allLeaves, allNotes)
}

// ========================================
// Settings handlers
// ========================================

export function handleThemeChange(theme: typeof settings.value.theme) {
  const next = { ...settings.value, theme }
  updateSettings(next)
  applyTheme(theme, next)
}

export function handleSettingsChange(payload: Partial<typeof settings.value>) {
  const repoChanged = payload.repoName !== undefined && payload.repoName !== settings.value.repoName
  const tokenChanged = payload.token !== undefined && payload.token !== settings.value.token
  const next = { ...settings.value, ...payload }
  updateSettings(next)
  if (payload.theme) {
    applyTheme(payload.theme, next)
  }
  if (payload.toolName) {
    document.title = payload.toolName
  }
  if (repoChanged) {
    repoChangedInSettings = true
    appState.isPullCompleted = false
    appState.isFirstPriorityFetched = false
    resetForRepoSwitch()
    archiveLeafStatsStore.reset()
  }
  if (repoChanged || tokenChanged) {
    githubSettingsChangedInSettings = true
  }
}

export async function handleCloseSettings() {
  if (githubSettingsChangedInSettings || appState.importOccurredInSettings) {
    const hasValidConfig = !!(settings.value.token && settings.value.repoName)
    if (hasValidConfig) {
      if (!isPulling.value && !isPushing.value && !appState.isArchiveLoading) {
        isClosingSettingsPull = true
        await pullFromGitHub(false)
        isClosingSettingsPull = false
      }
    } else {
      // トークンやリポ名が空 → pullせず初回pull前の状態に戻す
      appState.isPullCompleted = false
      appState.isFirstPriorityFetched = false
      resetForRepoSwitch()
      archiveLeafStatsStore.reset()
    }
  }
  repoChangedInSettings = false
  githubSettingsChangedInSettings = false
  appState.importOccurredInSettings = false
}

// ========================================
// PWA install handler
// ========================================

export async function handleInstall() {
  if (!appState.deferredPrompt) return
  ;(appState.deferredPrompt as any).prompt()
  const { outcome } = await (appState.deferredPrompt as any).userChoice
  if (outcome === 'accepted') {
    console.log('PWA installed')
  }
  appState.deferredPrompt = null
  appState.showInstallBanner = false
}

export function dismissInstallBanner() {
  appState.showInstallBanner = false
  appState.deferredPrompt = null
  setPwaInstallDismissedAt(Date.now())
}

// ========================================
// Settings open/close + welcome
// ========================================

export function goSettings() {
  appState.showSettings = true
}

export async function closeSettings() {
  appState.showSettings = false
  await handleCloseSettings()
}

export function closeWelcome() {
  appState.showWelcome = false
}

export function openSettingsFromWelcome() {
  appState.showWelcome = false
  appState.showSettings = true
}

// ========================================
// HMR handler
// ========================================

const HMR_OFFLINE_KEY = 'agasteer_hmr_offline'

function flushOfflineSaveSync() {
  const current = offlineLeafStore.value
  if (current.content || current.badgeIcon || current.badgeColor) {
    localStorage.setItem(HMR_OFFLINE_KEY, JSON.stringify(current))
    console.log('[HMR] Saved offline leaf to localStorage:', current)
  }
}

function restoreFromHmrStorage() {
  const stored = localStorage.getItem(HMR_OFFLINE_KEY)
  if (stored) {
    try {
      const data = JSON.parse(stored)
      console.log('[HMR] Restoring offline leaf from localStorage:', data)
      offlineLeafStore.value = data
      const leaf = createOfflineLeaf(data.content, data.badgeIcon, data.badgeColor)
      leaf.updatedAt = data.updatedAt
      saveOfflineLeaf(leaf)
      localStorage.removeItem(HMR_OFFLINE_KEY)
    } catch (e) {
      console.error('[HMR] Failed to restore offline leaf:', e)
      localStorage.removeItem(HMR_OFFLINE_KEY)
    }
  }
}

export function setupHmr() {
  if (import.meta.hot) {
    restoreFromHmrStorage()

    import.meta.hot.dispose(() => {
      console.log('[HMR] dispose called, saving to localStorage')
      flushOfflineSaveSync()
    })
  }
}

// ========================================
// registerAppActions + createPaneActions
// ========================================

export function setupAppActionsAndContext(pushDisabledReasonGetter: () => string) {
  // Register actions for action modules
  registerAppActions({
    selectNote,
    selectLeaf,
    goHome,
    refreshBreadcrumbs,
    restoreStateFromUrl,
    rebuildLeafStats,
    resetLeafStats,
    closeMoveModal,
    updateOfflineContent,
    pushToGitHub,
    showPrompt,
    showConfirm,
    getDialogPositionForPane,
    getEditorView: (pane: Pane) =>
      pane === 'left' ? appState.leftEditorView : appState.rightEditorView,
    getPreviewView: (pane: Pane) =>
      pane === 'left' ? appState.leftPreviewView : appState.rightPreviewView,
  })

  const paneActions: PaneActions = {
    // ナビゲーション
    selectNote,
    selectLeaf,
    goHome,
    closeLeaf,
    switchPane,
    togglePreview,
    openPriorityView,

    // CRUD操作
    createNote,
    deleteNote,
    createLeaf,
    deleteLeaf,
    updateLeafContent,
    updateNoteBadge,
    updateLeafBadge,
    updatePriorityBadge,
    updateOfflineBadge,
    updateOfflineContent,
    openOfflineView,

    // ドラッグ&ドロップ
    handleDragStartNote,
    handleDragEndNote,
    handleDragOverNote,
    handleDropNote,
    handleDragStartLeaf,
    handleDragEndLeaf,
    handleDragOverLeaf,
    handleDropLeaf,

    // 移動モーダル
    openMoveModalForNote,
    openMoveModalForLeaf,

    // 保存・エクスポート
    handlePushToGitHub: pushToGitHub,
    downloadLeafAsMarkdown,
    downloadLeafAsImage,

    // パンくずリスト
    startEditingBreadcrumb,
    saveEditBreadcrumb,
    cancelEditBreadcrumb,

    // シェア
    handleCopyUrl,
    handleCopyMarkdown,
    handleShareImage,
    handleShareSelectionImage,
    getHasSelection,
    getSelectedText,

    // スクロール
    handleLeftScroll,
    handleRightScroll,

    // スワイプナビゲーション
    goToNextSibling,
    goToPrevSibling,

    // パンくずリストからの兄弟選択
    selectSiblingFromBreadcrumb,

    // Priorityリンククリック
    handlePriorityLinkClick,

    // 無効なPushボタンがクリックされたとき
    handleDisabledPushClick: (reason: string) =>
      handleDisabledPushClick(reason, pushDisabledReasonGetter()),

    // ワールド切り替え・アーカイブ
    handleWorldChange,
    archiveNote,
    archiveLeaf,
    restoreNote,
    restoreLeaf,
  }

  return paneActions
}
