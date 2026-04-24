/**
 * ペインナビゲーション関連のロジック
 *
 * App.svelte から抽出した、ペイン間のナビゲーション・ワールド切り替え・
 * アーカイブ/リストア操作を集約するモジュール。
 */

import { tick } from 'svelte'
import { get } from 'svelte/store'
import {
  type Note,
  type Leaf,
  type Breadcrumb,
  type WorldType,
  type SearchMatch,
  buildBlobShaCache,
} from './types'
import type { Pane } from './navigation'
import type { EditorPaneRef } from './editor/editor-pane-ref'
import { waitForMatchingEditor } from './editor/wait-for-editor'
import { runPendingRepoSyncIfIdle as runPendingRepoSyncIfIdleShared } from './sync/repo-sync-queue'
import * as nav from './navigation'
import { resolvePath, buildPath, extractWorldPrefix } from './navigation'
import { _ } from './i18n'
import { locale } from 'svelte-i18n'
import {
  notes,
  leaves,
  rootNotes,
  leftNote,
  rightNote,
  leftLeaf,
  rightLeaf,
  leftView,
  rightView,
  focusedPane,
  leftWorld,
  rightWorld,
  isPulling,
  isPushing,
  settings,
  offlineLeafStore,
  archiveNotes,
  archiveLeaves,
  archiveMetadata,
  isArchiveLoaded,
  archiveLeafStatsStore,
  isDirty,
  getDialogPositionForPane,
  getNotesForWorld as _getNotesForWorld,
  getLeavesForWorld as _getLeavesForWorld,
  setArchiveBaseline,
  scheduleOfflineSave,
} from './stores'
import {
  appActions,
  appState,
  derivedState,
  getNotesForPane,
  getLeavesForPane,
} from './app-state.svelte'
import {
  priorityItems,
  createPriorityLeaf,
  isPriorityLeaf,
  createOfflineLeaf,
  isOfflineLeaf,
} from './utils'
import {
  saveOfflineLeaf,
  saveArchiveNotes,
  saveArchiveLeaves,
  loadArchiveNotes,
  loadArchiveLeaves,
} from './data'
import { pullArchive, translateGitHubMessage } from './api'
import {
  showPushToast,
  showPullToast,
  confirmAsync,
  getBreadcrumbs as buildBreadcrumbs,
  handlePaneScroll as handlePaneScrollLib,
  type ScrollSyncState,
  type ScrollSyncViews,
} from './ui'
import {
  moveNoteToWorld as moveNoteToWorldAction,
  moveLeafToWorld as moveLeafToWorldAction,
} from './actions/move'

// ========================================
// Navigation State helpers
// ========================================

export function getNavState(): nav.NavigationState {
  return {
    leftView: leftView.value,
    leftNote: leftNote.value,
    leftLeaf: leftLeaf.value,
    rightView: rightView.value,
    rightNote: rightNote.value,
    rightLeaf: rightLeaf.value,
    isDualPane: appState.isDualPane,
    focusedPane: focusedPane.value,
    selectedIndexLeft: appState.selectedIndexLeft,
    selectedIndexRight: appState.selectedIndexRight,
    showSettings: appState.showSettings,
    isFirstPriorityFetched: appState.isFirstPriorityFetched,
    leftEditorView: appState.leftEditorView,
    rightEditorView: appState.rightEditorView,
  }
}

export function getNavDeps(): nav.NavigationDependencies {
  return {
    notes,
    leaves,
    rootNotes,
  }
}

export function syncNavState(state: nav.NavigationState) {
  leftView.value = state.leftView
  leftNote.value = state.leftNote
  leftLeaf.value = state.leftLeaf
  rightView.value = state.rightView
  rightNote.value = state.rightNote
  rightLeaf.value = state.rightLeaf
  focusedPane.value = state.focusedPane
  appState.selectedIndexLeft = state.selectedIndexLeft
  appState.selectedIndexRight = state.selectedIndexRight
}

async function runPendingRepoSyncIfIdle(): Promise<void> {
  const hasValidConfig = !!(settings.value.token && settings.value.repoName)
  await runPendingRepoSyncIfIdleShared(
    {
      isPulling: isPulling.value,
      isPushing: isPushing.value,
      isArchiveLoading: appState.isArchiveLoading,
    },
    hasValidConfig,
    appState.pendingRepoSync,
    () => {
      appState.pendingRepoSync = false
    },
    async () => {
      await appActions.pullFromGitHub(false)
    }
  )
}

// ========================================
// Navigation functions
// ========================================

export function goHome(pane: Pane) {
  const state = getNavState()
  nav.goHome(state, getNavDeps(), pane)
  syncNavState(state)
}

export function openPriorityView(pane: Pane) {
  const items = priorityItems.value
  const priorityLeaf = createPriorityLeaf(items)

  if (pane === 'left') {
    leftNote.value = null
    leftLeaf.value = priorityLeaf
    leftView.value = 'preview'
  } else {
    rightNote.value = null
    rightLeaf.value = priorityLeaf
    rightView.value = 'preview'
  }
}

export function openOfflineView(pane: Pane) {
  if (pane === 'left') {
    leftNote.value = null
    leftLeaf.value = derivedState.currentOfflineLeaf
    leftView.value = 'edit'
  } else {
    rightNote.value = null
    rightLeaf.value = derivedState.currentOfflineLeaf
    rightView.value = 'edit'
  }
}

export function updateOfflineBadge(icon: string, color: string) {
  offlineLeafStore.value = { ...offlineLeafStore.value, badgeIcon: icon, badgeColor: color }
  const leaf = createOfflineLeaf(offlineLeafStore.value.content, icon, color)
  saveOfflineLeaf(leaf)
}

export function updateOfflineContent(content: string) {
  const now = Date.now()
  offlineLeafStore.value = { ...offlineLeafStore.value, content, updatedAt: now }
  scheduleOfflineSave()
}

export function navigateToLeafFromPriority(leafId: string, pane: Pane) {
  const leaf = leaves.value.find((l) => l.id === leafId)
  if (!leaf) return

  const note = notes.value.find((n) => n.id === leaf.noteId)
  if (!note) return

  if (pane === 'left') {
    leftNote.value = note
    leftLeaf.value = leaf
    leftView.value = 'edit'
  } else {
    rightNote.value = note
    rightLeaf.value = leaf
    rightView.value = 'edit'
  }
}

export function selectNote(note: Note, pane: Pane) {
  const state = getNavState()
  nav.selectNote(state, getNavDeps(), note, pane)
  syncNavState(state)
}

export function selectLeaf(leaf: Leaf, pane: Pane) {
  const paneNotes = getNotesForPane(pane)
  const note = paneNotes.find((n) => n.id === leaf.noteId)
  if (note) {
    if (pane === 'left') {
      leftNote.value = note
      leftLeaf.value = leaf
      leftView.value = 'edit'
    } else {
      rightNote.value = note
      rightLeaf.value = leaf
      rightView.value = 'edit'
    }
  }
}

async function waitForEditorLeaf(
  pane: Pane,
  expectedLeafId: string,
  maxAttempts = 12
): Promise<EditorPaneRef | null> {
  return waitForMatchingEditor(
    () => (pane === 'left' ? appState.leftEditorView : appState.rightEditorView),
    async () => {
      await tick()
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    },
    expectedLeafId,
    maxAttempts
  )
}

async function scrollLeafLineWhenReady(
  pane: Pane,
  expectedLeafId: string,
  line: number
): Promise<void> {
  const editorView = await waitForEditorLeaf(pane, expectedLeafId)
  if (editorView?.scrollToLine) {
    editorView.scrollToLine(line)
  }
}

export async function handleSearchResultClick(result: SearchMatch, pane: Pane = 'left') {
  const targetNotes = result.world === 'archive' ? archiveNotes.value : notes.value
  const targetLeaves = result.world === 'archive' ? archiveLeaves.value : leaves.value

  if (pane === 'left') {
    leftWorld.value = result.world === 'archive' ? 'archive' : 'home'
  } else {
    rightWorld.value = result.world === 'archive' ? 'archive' : 'home'
  }

  if (result.matchType === 'note') {
    const note = targetNotes.find((n) => n.id === result.noteId)
    if (note) {
      selectNote(note, pane)
    }
  } else {
    if (isOfflineLeaf(result.leafId)) {
      openOfflineView(pane)
      await scrollLeafLineWhenReady(pane, result.leafId, result.line)
    } else {
      const leaf = targetLeaves.find((l) => l.id === result.leafId)
      if (leaf) {
        selectLeaf(leaf, pane)
        await scrollLeafLineWhenReady(pane, leaf.id, result.line)
      }
    }
  }
}

export async function handlePriorityLinkClick(leafId: string, line: number, pane: Pane) {
  const leaf = leaves.value.find((l) => l.id === leafId)
  if (leaf) {
    selectLeaf(leaf, pane)
    await scrollLeafLineWhenReady(pane, leaf.id, line)
  }
}

export function handleDisabledPushClick(reason: string, pushDisabledReason: string) {
  const message = reason || pushDisabledReason
  if (message) {
    showPushToast(message)
  }
}

// ========================================
// Archive cache helper
// ========================================

/**
 * IndexedDBからアーカイブキャッシュを読み込み、ストアにセットする。
 * @returns キャッシュが存在したかどうか
 */
async function loadArchiveCacheFromDB(): Promise<{ hasCachedData: boolean }> {
  const [cachedNotes, cachedLeaves] = await Promise.all([loadArchiveNotes(), loadArchiveLeaves()])
  const hasCachedData = cachedNotes.length > 0 || cachedLeaves.length > 0
  if (hasCachedData) {
    archiveNotes.value = cachedNotes
    archiveLeaves.value = cachedLeaves
    isArchiveLoaded.value = true
    setArchiveBaseline(cachedNotes, cachedLeaves)
    // キャッシュからstatsを再構築（pullArchive完了前でも統計を表示可能にする）
    archiveLeafStatsStore.rebuild(cachedLeaves, cachedNotes)
  }
  return { hasCachedData }
}

// ========================================
// World switching / Archive / Restore
// ========================================

export async function handleWorldChange(world: WorldType, pane: Pane = 'left') {
  const currentPaneWorld = pane === 'left' ? leftWorld.value : rightWorld.value
  if (world === currentPaneWorld) return

  if (isPulling.value || isPushing.value || appState.isArchiveLoading) return

  if (pane === 'left') {
    leftWorld.value = world
  } else {
    rightWorld.value = world
  }
  goHome(pane)
  refreshBreadcrumbs()

  if (world === 'archive' && !isArchiveLoaded.value && !appState.isArchiveLoading) {
    if (settings.value.token && settings.value.repoName) {
      // まずIndexedDBキャッシュから読み出し
      const { hasCachedData } = await loadArchiveCacheFromDB()

      // キャッシュの有無にかかわらずpullArchiveで最新化
      appState.isArchiveLoading = true
      if (!hasCachedData) {
        archiveLeafStatsStore.reset()
      }
      // blob SHAキャッシュ用: dirtyでなければキャッシュ済みリーフからSHA→Leafのマップを構築
      const cachedLeafMap = isDirty.value
        ? new Map<string, Leaf>()
        : buildBlobShaCache(archiveLeaves.value)
      try {
        const result = await pullArchive(settings.value, {
          onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
          cachedLeaves: cachedLeafMap.size > 0 ? cachedLeafMap : undefined,
        })
        if (result.success) {
          archiveNotes.value = result.notes
          archiveLeaves.value = result.leaves
          archiveMetadata.value = result.metadata
          isArchiveLoaded.value = true
          setArchiveBaseline(result.notes, result.leaves)
          saveArchiveNotes(result.notes).catch((err) =>
            console.error('Failed to persist archive notes:', err)
          )
          saveArchiveLeaves(result.leaves).catch((err) =>
            console.error('Failed to persist archive leaves:', err)
          )
        } else {
          const t = get(_)
          // キャッシュがなければエラー表示
          if (!hasCachedData) {
            showPullToast(
              translateGitHubMessage(
                result.message,
                t,
                result.rateLimitInfo,
                undefined,
                result.errorCode,
                result.httpStatus
              ),
              'error'
            )
          }
        }
      } catch (e) {
        console.error('Archive pull failed:', e)
        if (!hasCachedData) {
          const t = get(_)
          showPullToast(t('toast.pullFailed'), 'error')
        }
      } finally {
        appState.isArchiveLoading = false
        await runPendingRepoSyncIfIdle()
      }
    }
  }
}

export async function archiveNote(pane: Pane) {
  const note = pane === 'left' ? leftNote.value : rightNote.value
  if (!note) return

  const t = get(_)
  const position = getDialogPositionForPane(pane)
  const confirmed = await confirmAsync(t('modal.archiveNote') || 'Archive this note?', position)
  if (confirmed) {
    await moveNoteToWorld(note, 'archive', pane)
  }
}

export async function archiveLeaf(pane: Pane) {
  const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
  if (!leaf) return

  const t = get(_)
  const position = getDialogPositionForPane(pane)
  const confirmed = await confirmAsync(t('modal.archiveLeaf') || 'Archive this leaf?', position)
  if (confirmed) {
    await moveLeafToWorld(leaf, 'archive', pane)
  }
}

export async function restoreNote(pane: Pane) {
  const note = pane === 'left' ? leftNote.value : rightNote.value
  if (!note) return

  const t = get(_)
  const position = getDialogPositionForPane(pane)
  const confirmed = await confirmAsync(
    t('modal.restoreNote') || 'Restore this note to Home?',
    position
  )
  if (confirmed) {
    await moveNoteToWorld(note, 'home', pane)
  }
}

export async function restoreLeaf(pane: Pane) {
  const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
  if (!leaf) return

  const t = get(_)
  const position = getDialogPositionForPane(pane)
  const confirmed = await confirmAsync(
    t('modal.restoreLeaf') || 'Restore this leaf to Home?',
    position
  )
  if (confirmed) {
    await moveLeafToWorld(leaf, 'home', pane)
  }
}

export async function moveNoteToWorld(note: Note, targetWorld: WorldType, pane: Pane) {
  return moveNoteToWorldAction(note, targetWorld, pane)
}

export async function moveLeafToWorld(leaf: Leaf, targetWorld: WorldType, pane: Pane) {
  return moveLeafToWorldAction(leaf, targetWorld, pane)
}

export function closeLeaf(pane: Pane) {
  const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
  if (!leaf) return

  const paneNotes = getNotesForPane(pane)
  const parentNote = paneNotes.find((n) => n.id === leaf.noteId)

  if (parentNote) {
    if (pane === 'left') {
      leftNote.value = parentNote
      leftLeaf.value = leaf
      leftView.value = 'note'
    } else {
      rightNote.value = parentNote
      rightLeaf.value = leaf
      rightView.value = 'note'
    }
  }
}

export function switchPane(pane: Pane) {
  const state = getNavState()
  nav.switchPane(state, getNavDeps(), pane)
  syncNavState(state)
}

export function togglePreview(pane: Pane) {
  const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
  if (leaf && isPriorityLeaf(leaf.id)) return

  const state = getNavState()
  nav.togglePreview(state, getNavDeps(), pane)
  syncNavState(state)
  updateUrlFromState()
}

// ========================================
// Sibling navigation
// ========================================

export function goToNextSibling(pane: Pane): boolean {
  const view = pane === 'left' ? leftView.value : rightView.value
  const currentNote = pane === 'left' ? leftNote.value : rightNote.value

  if (view !== 'note' || !currentNote) return false

  const paneNotes = getNotesForPane(pane)
  const siblings = paneNotes
    .filter((n) => n.parentId === currentNote.parentId)
    .sort((a, b) => a.order - b.order)

  const currentIndex = siblings.findIndex((n) => n.id === currentNote.id)
  if (currentIndex === -1 || currentIndex >= siblings.length - 1) return false

  const nextNote = siblings[currentIndex + 1]
  selectNote(nextNote, pane)
  return true
}

export function goToPrevSibling(pane: Pane): boolean {
  const view = pane === 'left' ? leftView.value : rightView.value
  const currentNote = pane === 'left' ? leftNote.value : rightNote.value

  if (view !== 'note' || !currentNote) return false

  const paneNotes = getNotesForPane(pane)
  const siblings = paneNotes
    .filter((n) => n.parentId === currentNote.parentId)
    .sort((a, b) => a.order - b.order)

  const currentIndex = siblings.findIndex((n) => n.id === currentNote.id)
  if (currentIndex <= 0) return false

  const prevNote = siblings[currentIndex - 1]
  selectNote(prevNote, pane)
  return true
}

export function selectSiblingFromBreadcrumb(id: string, type: 'note' | 'leaf', pane: Pane) {
  const paneNotes = getNotesForPane(pane)
  const paneLeaves = getLeavesForPane(pane)

  if (type === 'note') {
    const note = paneNotes.find((n) => n.id === id)
    if (note) {
      selectNote(note, pane)
    }
  } else if (type === 'leaf') {
    const leaf = paneLeaves.find((l) => l.id === id)
    if (leaf) {
      selectLeaf(leaf, pane)
    }
  }
}

// ========================================
// Pane swap/copy
// ========================================

export function swapPanes() {
  const tempNote = leftNote.value
  const tempLeaf = leftLeaf.value
  const tempView = leftView.value

  leftNote.value = rightNote.value
  leftLeaf.value = rightLeaf.value
  leftView.value = rightView.value

  rightNote.value = tempNote
  rightLeaf.value = tempLeaf
  rightView.value = tempView

  const tempIndex = appState.selectedIndexLeft
  appState.selectedIndexLeft = appState.selectedIndexRight
  appState.selectedIndexRight = tempIndex

  const tempWorld = leftWorld.value
  leftWorld.value = rightWorld.value
  rightWorld.value = tempWorld
}

export function copyLeftToRight() {
  rightNote.value = leftNote.value
  rightLeaf.value = leftLeaf.value
  rightView.value = leftView.value
  appState.selectedIndexRight = appState.selectedIndexLeft
  rightWorld.value = leftWorld.value
}

export function copyRightToLeft() {
  leftNote.value = rightNote.value
  leftLeaf.value = rightLeaf.value
  leftView.value = rightView.value
  appState.selectedIndexLeft = appState.selectedIndexRight
  leftWorld.value = rightWorld.value
}

// ========================================
// Scroll sync
// ========================================

function getScrollSyncState(): ScrollSyncState {
  return {
    isDualPane: appState.isDualPane,
    leftLeaf: leftLeaf.value,
    rightLeaf: rightLeaf.value,
    leftView: leftView.value,
    rightView: rightView.value,
  }
}

function getScrollSyncViews(): ScrollSyncViews {
  return {
    leftEditorView: appState.leftEditorView,
    leftPreviewView: appState.leftPreviewView,
    rightEditorView: appState.rightEditorView,
    rightPreviewView: appState.rightPreviewView,
  }
}

function handlePaneScroll(pane: Pane, scrollTop: number, scrollHeight: number) {
  handlePaneScrollLib(pane, scrollTop, scrollHeight, getScrollSyncState(), getScrollSyncViews())
}

export function handleLeftScroll(scrollTop: number, scrollHeight: number) {
  handlePaneScroll('left', scrollTop, scrollHeight)
}

export function handleRightScroll(scrollTop: number, scrollHeight: number) {
  handlePaneScroll('right', scrollTop, scrollHeight)
}

// ========================================
// Breadcrumbs
// ========================================

export function refreshBreadcrumbs() {
  const leftNotes = _getNotesForWorld(leftWorld.value, notes.value, archiveNotes.value)
  const leftLeaves = _getLeavesForWorld(leftWorld.value, leaves.value, archiveLeaves.value)
  const rightNotes = _getNotesForWorld(rightWorld.value, notes.value, archiveNotes.value)
  const rightLeaves = _getLeavesForWorld(rightWorld.value, leaves.value, archiveLeaves.value)

  appState.breadcrumbs = buildBreadcrumbs(
    leftView.value,
    leftNote.value,
    leftLeaf.value,
    leftNotes,
    'left',
    goHome,
    selectNote,
    leftLeaves
  )
  appState.breadcrumbsRight = buildBreadcrumbs(
    rightView.value,
    rightNote.value,
    rightLeaf.value,
    rightNotes,
    'right',
    goHome,
    selectNote,
    rightLeaves
  )
}

export function startEditingBreadcrumb(crumb: Breadcrumb) {
  if (crumb.type === 'home' || crumb.type === 'settings') return
  appState.editingBreadcrumb = crumb.id
}

export function cancelEditBreadcrumb() {
  appState.editingBreadcrumb = null
}

// ========================================
// URL state management
// ========================================

export function updateUrlFromState() {
  if (appState.isRestoringFromUrl || isPulling.value || !appState.isFirstPriorityFetched) {
    return
  }

  const params = new URLSearchParams()

  const leftNotes = _getNotesForWorld(leftWorld.value, notes.value, archiveNotes.value)
  const rightNotes = _getNotesForWorld(rightWorld.value, notes.value, archiveNotes.value)

  const leftPath = buildPath(
    leftNote.value,
    leftLeaf.value,
    leftNotes,
    leftView.value,
    leftWorld.value
  )
  params.set('left', leftPath)

  const rightPath = appState.isDualPane
    ? buildPath(rightNote.value, rightLeaf.value, rightNotes, rightView.value, rightWorld.value)
    : leftPath
  params.set('right', rightPath)

  const newUrl = `?${params.toString()}`
  window.history.pushState({}, '', newUrl)
  appState.atGuardEntry = false
}

export async function restoreStateFromUrl(alreadyRestoring = false) {
  const params = new URLSearchParams(window.location.search)
  let leftPath = params.get('left')
  let rightPath = params.get('right')

  // 互換性: 旧形式（?note=uuid&leaf=uuid）もサポート
  if (!leftPath && !rightPath) {
    const noteId = params.get('note')
    const leafId = params.get('leaf')

    if (leafId) {
      const leaf = leaves.value.find((n) => n.id === leafId)
      if (leaf) {
        const note = notes.value.find((f) => f.id === leaf.noteId)
        if (note) {
          leftNote.value = note
          leftLeaf.value = leaf
          leftView.value = 'edit'
          leftWorld.value = 'home'
        }
      }
    } else if (noteId) {
      const note = notes.value.find((f) => f.id === noteId)
      if (note) {
        leftNote.value = note
        leftLeaf.value = null
        leftView.value = 'note'
        leftWorld.value = 'home'
      }
    } else {
      leftNote.value = null
      leftLeaf.value = null
      leftView.value = 'home'
      leftWorld.value = 'home'
    }
    return
  }

  if (!alreadyRestoring) {
    appState.isRestoringFromUrl = true
  }

  if (!leftPath) {
    leftPath = '/'
  }

  const leftWorldInfo = extractWorldPrefix(leftPath)
  const rightWorldInfo = rightPath ? extractWorldPrefix(rightPath) : { world: 'home' as const }

  const needsArchive = leftWorldInfo.world === 'archive' || rightWorldInfo.world === 'archive'
  if (needsArchive && !isArchiveLoaded.value && settings.value.token && settings.value.repoName) {
    // まずIndexedDBキャッシュから読み出し
    const { hasCachedData } = await loadArchiveCacheFromDB()

    appState.isArchiveLoading = true
    if (!hasCachedData) {
      archiveLeafStatsStore.reset()
    }
    // blob SHAキャッシュ用: dirtyでなければキャッシュ済みリーフからSHA→Leafのマップを構築
    const cachedLeafMap = isDirty.value
      ? new Map<string, Leaf>()
      : buildBlobShaCache(archiveLeaves.value)
    try {
      const result = await pullArchive(settings.value, {
        onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
        cachedLeaves: cachedLeafMap.size > 0 ? cachedLeafMap : undefined,
      })
      if (result.success) {
        archiveNotes.value = result.notes
        archiveLeaves.value = result.leaves
        archiveMetadata.value = result.metadata
        isArchiveLoaded.value = true
        setArchiveBaseline(result.notes, result.leaves)
        saveArchiveNotes(result.notes).catch((err) =>
          console.error('Failed to persist archive notes:', err)
        )
        saveArchiveLeaves(result.leaves).catch((err) =>
          console.error('Failed to persist archive leaves:', err)
        )
      } else {
        // キャッシュがなければエラー表示
        if (!hasCachedData) {
          const t = get(_)
          showPullToast(
            translateGitHubMessage(
              result.message,
              t,
              result.rateLimitInfo,
              undefined,
              result.errorCode,
              result.httpStatus
            ),
            'error'
          )
        }
      }
    } catch (e) {
      console.error('Archive pull failed during URL restore:', e)
      if (!hasCachedData) {
        const t = get(_)
        showPullToast(t('toast.pullFailed'), 'error')
      }
    } finally {
      appState.isArchiveLoading = false
      await runPendingRepoSyncIfIdle()
    }
  }

  const leftNotesData = _getNotesForWorld(leftWorldInfo.world, notes.value, archiveNotes.value)
  const leftLeavesData = _getLeavesForWorld(leftWorldInfo.world, leaves.value, archiveLeaves.value)

  const leftResolution = resolvePath(leftPath, leftNotesData, leftLeavesData)
  leftWorld.value = leftResolution.world

  if (leftResolution.type === 'home') {
    leftNote.value = null
    leftLeaf.value = null
    leftView.value = 'home'
  } else if (leftResolution.type === 'note') {
    leftNote.value = leftResolution.note
    leftLeaf.value = null
    leftView.value = 'note'
  } else if (leftResolution.type === 'leaf') {
    leftNote.value = leftResolution.note
    leftLeaf.value = leftResolution.leaf
    leftView.value = leftResolution.isPreview ? 'preview' : 'edit'
  }

  if (rightPath && appState.isDualPane) {
    const rightNotesData = _getNotesForWorld(rightWorldInfo.world, notes.value, archiveNotes.value)
    const rightLeavesData = _getLeavesForWorld(
      rightWorldInfo.world,
      leaves.value,
      archiveLeaves.value
    )

    const rightResolution = resolvePath(rightPath, rightNotesData, rightLeavesData)
    rightWorld.value = rightResolution.world

    if (rightResolution.type === 'home') {
      rightNote.value = null
      rightLeaf.value = null
      rightView.value = 'home'
    } else if (rightResolution.type === 'note') {
      rightNote.value = rightResolution.note
      rightLeaf.value = null
      rightView.value = 'note'
    } else if (rightResolution.type === 'leaf') {
      rightNote.value = rightResolution.note
      rightLeaf.value = rightResolution.leaf
      rightView.value = rightResolution.isPreview ? 'preview' : 'edit'
    }
  } else {
    rightNote.value = leftNote.value
    rightLeaf.value = leftLeaf.value
    rightView.value = leftView.value
    rightWorld.value = leftWorld.value
  }

  if (!alreadyRestoring) {
    appState.isRestoringFromUrl = false
  }
}

// ========================================
// User guide
// ========================================

const USER_GUIDE_BASE = 'https://github.com/kako-jun/agasteer/blob/main/docs/user-guide'

export function openUserGuide() {
  const lang = get(locale)?.startsWith('ja') ? 'ja' : 'en'
  const url = `${USER_GUIDE_BASE}/${lang}/index.md`
  window.open(url, '_blank', 'noopener,noreferrer')
}
