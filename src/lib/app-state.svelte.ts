/**
 * アプリケーション状態の集約モジュール（Phase 1 + Phase 2）
 *
 * Phase 1: ワールドヘルパー関数、paneStateStore、定数を移動。
 * Phase 2: App.svelte の $state/$derived を appState/derivedState に移動。
 */

import type { Note, Leaf, Breadcrumb, WorldType } from './types'
import type { Pane } from './navigation'
import type { LeafSkeleton } from './api'
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
  isPulling,
  isPushing,
  leftView,
  rightView,
  githubConfigured,
  metadata,
  dragStore,
  leafStatsStore,
  archiveLeafStatsStore,
  moveModalStore,
  pullProgressInfo,
  offlineLeafStore,
  lastPulledPushCount,
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
import { priorityItems, createPriorityLeaf, createOfflineLeaf, PRIORITY_LEAF_ID } from './utils'

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
// App State ($state) — Phase 2
// ========================================

let _breadcrumbs = $state<Breadcrumb[]>([])
let _breadcrumbsRight = $state<Breadcrumb[]>([])
let _editingBreadcrumb = $state<string | null>(null)
let _isLoadingUI = $state(false)
let _isFirstPriorityFetched = $state(false)
let _isPullCompleted = $state(false)
let _showSettings = $state(false)
let _i18nReady = $state(false)
let _showWelcome = $state(false)
let _showInstallBanner = $state(false)
let _deferredPrompt = $state<Event | null>(null)
let _isExportingZip = $state(false)
let _isImporting = $state(false)
let _isTesting = $state(false)
let _isArchiveLoading = $state(false)
let _isDualPane = $state(false)
let _selectedIndexLeft = $state(0)
let _selectedIndexRight = $state(0)
let _leftEditorView = $state<any>(null)
let _leftPreviewView = $state<any>(null)
let _rightEditorView = $state<any>(null)
let _rightPreviewView = $state<any>(null)
let _loadingLeafIds = $state(new Set<string>())
let _leafSkeletonMap = $state(new Map<string, LeafSkeleton>())

export const appState = {
  get breadcrumbs() {
    return _breadcrumbs
  },
  set breadcrumbs(v: Breadcrumb[]) {
    _breadcrumbs = v
  },
  get breadcrumbsRight() {
    return _breadcrumbsRight
  },
  set breadcrumbsRight(v: Breadcrumb[]) {
    _breadcrumbsRight = v
  },
  get editingBreadcrumb() {
    return _editingBreadcrumb
  },
  set editingBreadcrumb(v: string | null) {
    _editingBreadcrumb = v
  },
  get isLoadingUI() {
    return _isLoadingUI
  },
  set isLoadingUI(v: boolean) {
    _isLoadingUI = v
  },
  get isFirstPriorityFetched() {
    return _isFirstPriorityFetched
  },
  set isFirstPriorityFetched(v: boolean) {
    _isFirstPriorityFetched = v
  },
  get isPullCompleted() {
    return _isPullCompleted
  },
  set isPullCompleted(v: boolean) {
    _isPullCompleted = v
  },
  get showSettings() {
    return _showSettings
  },
  set showSettings(v: boolean) {
    _showSettings = v
  },
  get i18nReady() {
    return _i18nReady
  },
  set i18nReady(v: boolean) {
    _i18nReady = v
  },
  get showWelcome() {
    return _showWelcome
  },
  set showWelcome(v: boolean) {
    _showWelcome = v
  },
  get showInstallBanner() {
    return _showInstallBanner
  },
  set showInstallBanner(v: boolean) {
    _showInstallBanner = v
  },
  get deferredPrompt() {
    return _deferredPrompt
  },
  set deferredPrompt(v: Event | null) {
    _deferredPrompt = v
  },
  get isExportingZip() {
    return _isExportingZip
  },
  set isExportingZip(v: boolean) {
    _isExportingZip = v
  },
  get isImporting() {
    return _isImporting
  },
  set isImporting(v: boolean) {
    _isImporting = v
  },
  get isTesting() {
    return _isTesting
  },
  set isTesting(v: boolean) {
    _isTesting = v
  },
  get isArchiveLoading() {
    return _isArchiveLoading
  },
  set isArchiveLoading(v: boolean) {
    _isArchiveLoading = v
  },
  get isDualPane() {
    return _isDualPane
  },
  set isDualPane(v: boolean) {
    _isDualPane = v
  },
  get selectedIndexLeft() {
    return _selectedIndexLeft
  },
  set selectedIndexLeft(v: number) {
    _selectedIndexLeft = v
  },
  get selectedIndexRight() {
    return _selectedIndexRight
  },
  set selectedIndexRight(v: number) {
    _selectedIndexRight = v
  },
  get leftEditorView() {
    return _leftEditorView
  },
  set leftEditorView(v: any) {
    _leftEditorView = v
  },
  get leftPreviewView() {
    return _leftPreviewView
  },
  set leftPreviewView(v: any) {
    _leftPreviewView = v
  },
  get rightEditorView() {
    return _rightEditorView
  },
  set rightEditorView(v: any) {
    _rightEditorView = v
  },
  get rightPreviewView() {
    return _rightPreviewView
  },
  set rightPreviewView(v: any) {
    _rightPreviewView = v
  },
  get loadingLeafIds() {
    return _loadingLeafIds
  },
  set loadingLeafIds(v: Set<string>) {
    _loadingLeafIds = v
  },
  get leafSkeletonMap() {
    return _leafSkeletonMap
  },
  set leafSkeletonMap(v: Map<string, LeafSkeleton>) {
    _leafSkeletonMap = v
  },
}

// ========================================
// Derived State ($derived) — Phase 2
// ========================================

// Pull/Push中はボタンを無効化（リアクティブに追跡）
let _canPull = $derived(!isPulling.value && !isPushing.value && !_isArchiveLoading)
let _canPush = $derived(
  !isPulling.value && !isPushing.value && !_isArchiveLoading && _isFirstPriorityFetched
)

// dragStoreへのリアクティブアクセス
let _draggedNote = $derived(dragStore.draggedNote)
let _draggedLeaf = $derived(dragStore.draggedLeaf)
let _dragOverNoteId = $derived(dragStore.dragOverNoteId)
let _dragOverLeafId = $derived(dragStore.dragOverLeafId)

// leafStatsStoreとmoveModalStoreへのリアクティブアクセス
// 左ペインのワールドとビューに応じて統計を切り替え
let _totalLeafCount = $derived(
  leftWorld.value === 'archive' && leftView.value === 'home'
    ? archiveLeafStatsStore.totalLeafCount
    : leafStatsStore.totalLeafCount
)
let _totalLeafChars = $derived(
  leftWorld.value === 'archive' && leftView.value === 'home'
    ? archiveLeafStatsStore.totalLeafChars
    : leafStatsStore.totalLeafChars
)
let _moveModalOpen = $derived(moveModalStore.isOpen)
let _moveTargetLeaf = $derived(moveModalStore.targetLeaf)
let _moveTargetNote = $derived(moveModalStore.targetNote)
let _moveTargetPane = $derived(moveModalStore.targetPane)
let _moveTargetWorld = $derived(
  _getWorldForPane(_moveTargetPane, leftWorld.value, rightWorld.value)
)
let _moveTargetNotes = $derived(
  _getNotesForWorld(_moveTargetWorld, notes.value, archiveNotes.value)
)

// リアクティブ宣言（ワールドに応じたデータを使用）
let _leftBreadcrumbNotes = $derived(
  _getNotesForWorld(leftWorld.value, notes.value, archiveNotes.value)
)
let _leftBreadcrumbLeaves = $derived(
  _getLeavesForWorld(leftWorld.value, leaves.value, archiveLeaves.value)
)
let _rightBreadcrumbNotes = $derived(
  _getNotesForWorld(rightWorld.value, notes.value, archiveNotes.value)
)
let _rightBreadcrumbLeaves = $derived(
  _getLeavesForWorld(rightWorld.value, leaves.value, archiveLeaves.value)
)

let _isGitHubConfigured = $derived(githubConfigured.value)

// Priorityリーフをリアクティブに生成（metadataからバッジ情報を復元）
let _priorityBadgeMeta = $derived(metadata.value.leaves?.[PRIORITY_LEAF_ID])
let _currentPriorityLeaf = $derived(
  createPriorityLeaf(
    priorityItems.value,
    _priorityBadgeMeta?.badgeIcon,
    _priorityBadgeMeta?.badgeColor
  )
)

// オフラインリーフをリアクティブに生成（ストアから）
let _currentOfflineLeaf = $derived(
  createOfflineLeaf(
    offlineLeafStore.value.content,
    offlineLeafStore.value.badgeIcon,
    offlineLeafStore.value.badgeColor
  )
)

// 現在のワールド（左ペイン基準、後方互換性のため）に応じたノート・リーフ
let _currentNotes = $derived(_getNotesForWorld(leftWorld.value, notes.value, archiveNotes.value))
let _currentLeaves = $derived(
  _getLeavesForWorld(leftWorld.value, leaves.value, archiveLeaves.value)
)

// Pull中の進捗情報（i18nは含まない、フォーマットはApp.svelte側で行う）
let _pullProgressData = $derived(pullProgressInfo.value)

export const derivedState = {
  get canPull() {
    return _canPull
  },
  get canPush() {
    return _canPush
  },
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
  get totalLeafCount() {
    return _totalLeafCount
  },
  get totalLeafChars() {
    return _totalLeafChars
  },
  get moveModalOpen() {
    return _moveModalOpen
  },
  get moveTargetLeaf() {
    return _moveTargetLeaf
  },
  get moveTargetNote() {
    return _moveTargetNote
  },
  get moveTargetPane() {
    return _moveTargetPane
  },
  get moveTargetWorld() {
    return _moveTargetWorld
  },
  get moveTargetNotes() {
    return _moveTargetNotes
  },
  get leftBreadcrumbNotes() {
    return _leftBreadcrumbNotes
  },
  get leftBreadcrumbLeaves() {
    return _leftBreadcrumbLeaves
  },
  get rightBreadcrumbNotes() {
    return _rightBreadcrumbNotes
  },
  get rightBreadcrumbLeaves() {
    return _rightBreadcrumbLeaves
  },
  get isGitHubConfigured() {
    return _isGitHubConfigured
  },
  get priorityBadgeMeta() {
    return _priorityBadgeMeta
  },
  get currentPriorityLeaf() {
    return _currentPriorityLeaf
  },
  get currentOfflineLeaf() {
    return _currentOfflineLeaf
  },
  get currentNotes() {
    return _currentNotes
  },
  get currentLeaves() {
    return _currentLeaves
  },
  get pullProgressData() {
    return _pullProgressData
  },
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
