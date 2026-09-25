/**
 * ペインナビゲーション関連のロジック
 *
 * App.svelte から抽出した、ペイン間のナビゲーション・ワールド切り替え・
 * アーカイブ/リストア操作を集約するモジュール。
 */

import { tick } from 'svelte'
import { get } from 'svelte/store'
import { type Note, type Leaf, type Breadcrumb, type WorldType, type SearchMatch } from './types'
import type { Pane } from './navigation'
import type { EditorPaneRef } from './editor/editor-pane-ref'
import { waitForMatchingEditor } from './editor/wait-for-editor'
import * as nav from './navigation'
import { buildPath, extractWorldPrefix } from './navigation'
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
  leftInitialLine,
  rightInitialLine,
  focusedPane,
  leftWorld,
  rightWorld,
  isPulling,
  isPushing,
  isPushingBackground,
  settings,
  offlineLeafStore,
  archiveNotes,
  archiveLeaves,
  isArchiveLoaded,
  getDialogPositionForPane,
  getNotesForWorld as _getNotesForWorld,
  getLeavesForWorld as _getLeavesForWorld,
  scheduleOfflineSave,
  waitForRehydrate,
} from './stores'
import {
  appState,
  derivedState,
  getNotesForPane,
  getLeavesForPane,
  getWorldForPane,
} from './app-state.svelte'
import {
  priorityItems,
  createPriorityLeaf,
  isPriorityLeaf,
  createOfflineLeaf,
  isOfflineLeaf,
} from './utils'
import { saveOfflineLeaf } from './data'
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
// #301: アーカイブロード（IndexedDBキャッシュ読み出し + pullArchive）は
// archive-load.svelte.ts へ抽出済み。handleWorldChange / restoreStateFromUrl
// いずれもロード本体を performArchiveLoad() 経由で呼ぶ（#307 で二重実装を統合）。
import { performArchiveLoad } from './archive-load.svelte'
// #314 N3: restoreStateFromUrl の待ち合わせロジック（世代管理・同期アイドル待ち・
// アーカイブ待機・pane スナップショット比較）を分離したモジュール。
import * as urlRestore from './pane-navigation-url-restore.svelte'

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

/**
 * メディアライブラリ画面（View='media'）へ遷移する（#250）。
 *
 * ワールド（Home/Archive）とは独立した View なので world は変えない。
 * handleWorldChange に media を混ぜず、明示的な別ナビゲーション関数として分ける
 * （media は world ではないため world ヘルパの exhaustive switch にも入れない）。
 * 戻りは breadcrumbs の Home アイコン（goHome）で行う。
 */
export function navigateToMediaLibrary(pane: Pane = 'left') {
  if (pane === 'left') {
    leftNote.value = null
    leftLeaf.value = null
    leftView.value = 'media'
  } else {
    rightNote.value = null
    rightLeaf.value = null
    rightView.value = 'media'
  }
  refreshBreadcrumbs()
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
        const currentLeafId = pane === 'left' ? leftLeaf.value?.id : rightLeaf.value?.id
        if (currentLeafId === leaf.id) {
          // 同一リーフが既に開いている場合: {#key} は変わらず再マウントされないため、
          // 既存エディタに直接スクロール命令を送る（旧方式）。
          await scrollLeafLineWhenReady(pane, leaf.id, result.line)
        } else {
          // 別リーフに切り替わる場合: {#key} が変わり EditorView が再マウントされるため、
          // initialLine をセットしておけば onMount 完了直後に自動スクロールする。
          // ポーリング不要でネットワーク速度・デバイス性能に依存しない。
          if (pane === 'left') {
            leftInitialLine.value = result.line
          } else {
            rightInitialLine.value = result.line
          }
          selectLeaf(leaf, pane)
        }
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
// World switching / Archive / Restore
// ========================================

export async function handleWorldChange(world: WorldType, pane: Pane = 'left') {
  const currentPaneWorld = pane === 'left' ? leftWorld.value : rightWorld.value
  if (world === currentPaneWorld) return

  // #206: 背景 Push 中もワールド切替は禁止（archive 関連の編集と整合性を保つため）
  if (isPulling.value || isPushing.value || isPushingBackground.value || appState.isArchiveLoading)
    return

  if (pane === 'left') {
    leftWorld.value = world
  } else {
    rightWorld.value = world
  }
  goHome(pane)
  refreshBreadcrumbs()

  if (world === 'archive' && !isArchiveLoaded.value && !appState.isArchiveLoading) {
    if (settings.value.token && settings.value.repoName) {
      // #297 should5: rehydrateForRepo（リポ切替の直列化キュー含む）が実行中なら
      // 先に完了を待つ。待たずに進むと、IndexedDB の切替（setCurrentRepo）が
      // 途中の状態で loadArchiveCacheFromDB/pullArchive が走り、旧/新どちらの
      // DB を読むか取り違える窓ができる。
      await waitForRehydrate()

      // #297 must1/N-a: 待機中に、そのペインが archive 表示でなくなった、または
      // 設定が無効化された場合はここで打ち切る（再開の意味がない）。
      if (
        getWorldForPane(pane) !== 'archive' ||
        !(settings.value.token && settings.value.repoName)
      ) {
        return
      }

      // 別ペインのアーカイブロードが先に完了した、または進行中の場合もここで打ち切る
      // （AL 自体はアーカイブをロードするので、その完了を待てば足りる）。この場合は
      // ワールド表示を戻さない: 進行中/完了済みのロードがこのペインの画面も正しく
      // 埋めるため、home へ戻す必要がない（下の Pull/Push ケースとの違い）。
      if (appState.isArchiveLoading || isArchiveLoaded.value) {
        return
      }

      // #297 4巡目: Pull/Push はアーカイブをロードしないため、ここで打ち切ると
      // ワールド表示だけ archive のまま未ロード（画面が空）で残ってしまう。
      // かつては自動再開（pendingArchiveLoad）で救っていたが、保留中の rehydrate を
      // 無視して旧リポの IndexedDB に新リポのアーカイブを保存する／例外が Pull/Push に
      // 伝播する／配線が未テスト、といった新たなバグを生んだため撤去した。
      // 代わりにワールド表示を切替前（= home）へ戻し、冒頭の busy 判定がこの
      // ワールド切替自体を拒否したときと同じ結果にする（「archive 表示なのに
      // 未ロード」の残留状態を作らない）。直接 store を更新するだけにし、
      // handleWorldChange を再帰呼び出ししない（再帰すると busy チェックで
      // 即 return し、戻し処理自体が発火しない）。
      if (isPulling.value || isPushing.value || isPushingBackground.value) {
        if (pane === 'left') {
          leftWorld.value = currentPaneWorld
        } else {
          rightWorld.value = currentPaneWorld
        }
        // #297 Q1: 待機中にこのペインが archive の外へ出る操作（メディア画面遷移等）を
        // していた場合、goHome で上書きしない。view がまだ home（= 直前の初回 goHome
        // から動いていない）のときだけ goHome する。
        const currentPaneView = pane === 'left' ? leftView.value : rightView.value
        if (currentPaneView === 'home') {
          goHome(pane)
        }
        refreshBreadcrumbs()
        // #297 N3: Pull/Push が理由でワールド表示を戻したことを一言案内する
        // （黙って archive → home に戻すと、開けなかったことがユーザーに伝わらない）
        showPullToast(get(_)('toast.archiveOpenBlocked'))
        return
      }

      await performArchiveLoad()
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

/**
 * 旧形式（?note=uuid&leaf=uuid、または無指定）の URL を解決する（互換性維持）。
 * #314 N3: restoreStateFromUrl を80行以内に保つため、現行の left/right 形式とは
 * 独立したこの分岐を別関数に切り出した。アーカイブ待機は関与しない。
 */
function resolveLegacyUrlParams(params: URLSearchParams) {
  const noteId = params.get('note')
  const leafId = params.get('leaf')

  if (leafId) {
    const leaf = leaves.value.find((n) => n.id === leafId)
    const note = leaf ? notes.value.find((f) => f.id === leaf.noteId) : undefined
    if (leaf && note) {
      leftNote.value = note
      leftLeaf.value = leaf
      leftView.value = 'edit'
      leftWorld.value = 'home'
    }
    return
  }
  if (noteId) {
    const note = notes.value.find((f) => f.id === noteId)
    if (note) {
      leftNote.value = note
      leftLeaf.value = null
      leftView.value = 'note'
      leftWorld.value = 'home'
    }
    return
  }
  leftNote.value = null
  leftLeaf.value = null
  leftView.value = 'home'
  leftWorld.value = 'home'
}

/**
 * URL の left/right パスから pane 状態を復元する（#314）。
 *
 * 待ち合わせ（rehydrate待ち・Pull/Push/背景Push/アーカイブロードのアイドル待ち・
 * アーカイブロード本体・世代管理・pane スナップショット比較）は
 * pane-navigation-url-restore.svelte.ts に集約されている（N3: この関数自体は
 * 80行以内に保つ）。archive を必要としない（または既にロード済みの）pane は
 * 待たずに即解決し、archive 待ちが要る pane だけ待機後に解決する（M4a: home pane が
 * Pull 全体を待つ退行を防ぐ）。
 *
 * #314 M-1: 本体は try/finally で包む。旧形式 URL の早期 return も、
 * waitUntilArchiveReady が IndexedDB reject 等で例外を投げる経路も、必ず finally を
 * 通る。finally では「今も最新の世代である呼び出し」だけが
 * appState.isRestoringFromUrl を false に戻す（古い世代の呼び出しが finally に
 * 来ても、既に後続の呼び出しが管理しているフラグを誤って倒さない）。
 */
export async function restoreStateFromUrl() {
  const gen = urlRestore.beginRestoreGeneration()
  appState.isRestoringFromUrl = true
  try {
    const params = new URLSearchParams(window.location.search)
    let leftPath = params.get('left')
    const rightPath = params.get('right')

    // 互換性: 旧形式（?note=uuid&leaf=uuid）もサポート
    if (!leftPath && !rightPath) {
      resolveLegacyUrlParams(params)
      return
    }

    if (!leftPath) leftPath = '/'

    const leftWorldInfo = extractWorldPrefix(leftPath)
    // 単ペイン表示中は right パスを無視する（#314: 使われない pane のために
    // アーカイブロードを待つ必要はない。最終的に「follow left」で上書きされる）。
    const rp: string | null = rightPath && appState.isDualPane ? rightPath : null
    const rightWorldInfo = rp ? extractWorldPrefix(rp) : { world: 'home' as const }

    const hasArchiveConfig = !!(settings.value.token && settings.value.repoName)
    const leftNeedsWait =
      leftWorldInfo.world === 'archive' && !isArchiveLoaded.value && hasArchiveConfig
    const rightNeedsWait =
      !!rp && rightWorldInfo.world === 'archive' && !isArchiveLoaded.value && hasArchiveConfig

    const leftSnapshot = urlRestore.snapshotPane('left')
    const rightSnapshot = urlRestore.snapshotPane('right')
    if (!leftNeedsWait) urlRestore.resolvePaneFromPath('left', leftPath, leftWorldInfo.world)
    if (rp && !rightNeedsWait) urlRestore.resolvePaneFromPath('right', rp, rightWorldInfo.world)

    if (leftNeedsWait || rightNeedsWait) {
      await urlRestore.waitUntilArchiveReady(gen, 'during URL restore')
      if (!urlRestore.isCurrentRestoreGeneration(gen)) return

      if (leftNeedsWait && urlRestore.shouldApplyResolvedPane(gen, 'left', leftSnapshot)) {
        urlRestore.resolvePaneFromPath('left', leftPath, leftWorldInfo.world)
      }
      if (rp && rightNeedsWait && urlRestore.shouldApplyResolvedPane(gen, 'right', rightSnapshot)) {
        urlRestore.resolvePaneFromPath('right', rp, rightWorldInfo.world)
      }
    }

    if (!rp) {
      rightNote.value = leftNote.value
      rightLeaf.value = leftLeaf.value
      rightView.value = leftView.value
      rightWorld.value = leftWorld.value
    }
  } finally {
    if (urlRestore.isCurrentRestoreGeneration(gen)) {
      appState.isRestoringFromUrl = false
    }
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
