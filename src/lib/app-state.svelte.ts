/**
 * アプリケーション状態の集約モジュール（Phase 1 + Phase 2 + Phase 4）
 *
 * Phase 1: ワールドヘルパー関数、paneStateStore、定数を移動。
 * Phase 2: App.svelte の $state/$derived を appState/derivedState に移動。
 * Phase 4: onMount ロジックを initApp() に抽出。
 */

import type { Note, Leaf, Breadcrumb, WorldType, StaleCheckResult } from './types'
import type { Pane } from './navigation'
import type { LeafSkeleton } from './api'
import type { ModalPosition } from './ui'
import type { EditorPaneRef } from './editor/editor-pane-ref'
import { get } from 'svelte/store'
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
  settings,
  isDirty,
  isStructureDirty,
  clearAllChanges,
  getPersistedDirtyFlag,
  lastKnownCommitSha,
  isStale,
  initActivityDetection,
  initStoreEffects,
  setupBeforeUnloadSave,
  flushPendingSaves,
  shouldAutoPush,
  resetAutoPushTimer,
  startStaleChecker,
  stopStaleChecker,
  executeStaleCheck,
  applyStaleResult,
  shouldAutoPull,
  setLastPushedSnapshot,
  isArchiveLoaded,
  archiveMetadata,
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
import {
  priorityItems,
  createPriorityLeaf,
  createOfflineLeaf,
  PRIORITY_LEAF_ID,
  OFFLINE_LEAF_ID,
} from './utils'
import {
  loadSettings,
  loadNotes,
  loadLeaves,
  loadOfflineLeaf,
  getPersistedLastPulledPushCount,
  getPersistedMetadata,
  shouldShowPwaInstallBanner,
  setCurrentRepo,
  syncRepoNameCache,
  getPushInFlightAt,
} from './data'
import { shouldUseStartupCache, type PersistedStartupCache } from './startup-cache'
import {
  applyTheme,
  loadAndApplyCustomFont,
  loadAndApplySystemMonoFont,
  loadAndApplyCustomBackgrounds,
  showPushToast,
  showPullToast,
  alertAsync,
} from './ui'
import { showConflictDialog } from './actions/conflict-dialog'
import { PUSH_HANG_THRESHOLD_MS } from './sync/constants'
import { initI18n, _ } from './i18n'
import { waitForSwCheck } from '../main'
import { pullArchive, translateGitHubMessage } from './api'
import { setArchiveBaseline } from './stores'

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
let _leftEditorView = $state<EditorPaneRef | null>(null)
let _leftPreviewView = $state<any>(null)
let _rightEditorView = $state<EditorPaneRef | null>(null)
let _rightPreviewView = $state<any>(null)
let _loadingLeafIds = $state(new Set<string>())
let _leafSkeletonMap = $state(new Map<string, LeafSkeleton>())
let _isRestoringFromUrl = $state(false)
let _importOccurredInSettings = $state(false)
let _atGuardEntry = $state(false)
let _pendingRepoSync = $state(false)
let _repoChangePending = $state(false)
// 他同期（pull/push/archive load）実行中に設定された新リポ名。同期完了後に
// rehydrateForRepo を走らせてから pull を開始するため、ここで待機させる。
let _pendingRehydrateRepo = $state<string | null>(null)
// #204/#205: visibility 復帰時に「Push 中ハング」を検出して isPushing を強制解除した場合に立つフラグ。
// 直後の stale check で showConflictDialog('push-hang') を表示するために使う（1 度だけ消費）。
let _pushHangRecovered = $state(false)

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
  get leftEditorView(): EditorPaneRef | null {
    return _leftEditorView
  },
  set leftEditorView(v: EditorPaneRef | null) {
    _leftEditorView = v
  },
  get leftPreviewView() {
    return _leftPreviewView
  },
  set leftPreviewView(v: any) {
    _leftPreviewView = v
  },
  get rightEditorView(): EditorPaneRef | null {
    return _rightEditorView
  },
  set rightEditorView(v: EditorPaneRef | null) {
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
  get isRestoringFromUrl() {
    return _isRestoringFromUrl
  },
  set isRestoringFromUrl(v: boolean) {
    _isRestoringFromUrl = v
  },
  get importOccurredInSettings() {
    return _importOccurredInSettings
  },
  set importOccurredInSettings(v: boolean) {
    _importOccurredInSettings = v
  },
  get atGuardEntry() {
    return _atGuardEntry
  },
  set atGuardEntry(v: boolean) {
    _atGuardEntry = v
  },
  get pendingRepoSync() {
    return _pendingRepoSync
  },
  set pendingRepoSync(v: boolean) {
    _pendingRepoSync = v
  },
  /**
   * リポジトリ設定変更直後〜新repoのpullが開始されるまでの「予約中」フラグ。
   * pendingRepoSync（他同期完了を待つキュー）とは別概念で、
   * どちらも立っていたらユーザーには同じ青丸バッジで見せる（App.svelte）。
   */
  get repoChangePending() {
    return _repoChangePending
  },
  set repoChangePending(v: boolean) {
    _repoChangePending = v
  },
  get pendingRehydrateRepo() {
    return _pendingRehydrateRepo
  },
  set pendingRehydrateRepo(v: string | null) {
    _pendingRehydrateRepo = v
  },
  get pushHangRecovered() {
    return _pushHangRecovered
  },
  set pushHangRecovered(v: boolean) {
    _pushHangRecovered = v
  },
}

// ========================================
// App Actions Registry — Phase 3
// ========================================
// App.svelte の関数を action modules から利用するための登録パターン。
// App.svelte が registerAppActions() で登録し、action modules が appActions 経由で呼ぶ。
// 循環依存を避けるため、actions → app-state は OK だが app-state → actions は NG。

export interface AppActionsRegistry {
  selectNote: (note: Note, pane: Pane) => void
  selectLeaf: (leaf: Leaf, pane: Pane) => void
  goHome: (pane: Pane) => void
  refreshBreadcrumbs: () => void
  restoreStateFromUrl: (alreadyRestoring?: boolean) => Promise<void> | void
  rebuildLeafStats: (leaves: Leaf[], notes: Note[]) => void
  resetLeafStats: () => void
  closeMoveModal: () => void
  updateOfflineContent: (content: string) => void
  pushToGitHub: () => Promise<void>
  pullFromGitHub: (
    isInitialStartup?: boolean,
    onCancel?: () => void | Promise<void>,
    precomputedStale?: StaleCheckResult
  ) => Promise<void>
  showPrompt: (
    message: string,
    onConfirm: (value: string) => void,
    defaultValue: string,
    position?: ModalPosition
  ) => void
  showConfirm: (message: string, onConfirm: () => void, position?: ModalPosition) => void
  getDialogPositionForPane: (pane: Pane) => ModalPosition
  getEditorView: (pane: Pane) => any
  getPreviewView: (pane: Pane) => any
}

let _appActions: AppActionsRegistry | null = null

export function registerAppActions(actions: AppActionsRegistry): void {
  _appActions = actions
}

export const appActions: AppActionsRegistry = new Proxy({} as AppActionsRegistry, {
  get(_target, prop: string) {
    if (!_appActions) {
      throw new Error(`appActions not registered yet (accessing '${prop}')`)
    }
    return (_appActions as any)[prop]
  },
})

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

// ========================================
// initApp() — Phase 4
// ========================================
// App.svelte の onMount ロジックを抽出。
// App.svelte 側で定義されている関数は deps 経由で受け取る。

export interface InitAppDeps {
  pullFromGitHub: (
    isInitial: boolean,
    onCancel?: () => void | Promise<void>,
    precomputedStale?: StaleCheckResult
  ) => Promise<void>
  pushToGitHub: () => Promise<void>
  restoreStateFromUrl: (alreadyRestoring?: boolean) => Promise<void>
  handleGlobalKeyDown: (e: KeyboardEvent) => void
}

/**
 * アプリ初期化処理。App.svelte の onMount から呼ばれる。
 * cleanup 関数を返す。
 */
export function initApp(deps: InitAppDeps): () => void {
  // 訪問者カウントをインクリメント（非表示、1日1回制限あり）
  // 設定ページでも表示されるが、nostalgicの重複防止機構で1回のみカウント
  fetch('https://api.nostalgic.llll-ll.com/visit?action=increment&id=agasteer-c347357a').catch(
    () => {}
  )

  // ストア副作用の初期化（isDirty → LocalStorage永続化など）
  // #158: 起動時の skip 判定前に有効化すると、旧バージョン由来で未保存だった
  // metadata / pushCount のデフォルト値を書き戻してしまうため、初期復元後まで遅延する。
  let cleanupStoreEffects = () => {}

  // ユーザーアクティビティ検知を初期化（自動保存のデバウンス用）
  const cleanupActivityDetection = initActivityDetection()
  const cleanupBeforeUnloadSave = setupBeforeUnloadSave()

  // PWAインストールプロンプト（A2HS）
  const handleBeforeInstallPrompt = (e: Event) => {
    // スタンドアロンモード（既にインストール済み）なら表示しない
    if (isPWAStandalone) return
    // 7日間のcooldown期間内であれば表示しない
    if (!shouldShowPwaInstallBanner()) return
    // デフォルトのミニインフォバーを抑制
    e.preventDefault()
    // プロンプトを保存して後で使用
    appState.deferredPrompt = e
    // バナーを表示
    appState.showInstallBanner = true
  }
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

  // PWAがインストールされた時
  const handleAppInstalled = () => {
    appState.showInstallBanner = false
    appState.deferredPrompt = null
  }
  window.addEventListener('appinstalled', handleAppInstalled)

  // PWA終了ガードにダミーエントリを追加（ローカルヘルパー）
  function pushExitGuard() {
    if (isPWAStandalone) {
      history.pushState({ [PWA_EXIT_GUARD_KEY]: true }, '', location.href)
      appState.atGuardEntry = true
    }
  }

  // 非同期初期化処理を即座に実行
  ;(async () => {
    const loadedSettings = await loadSettings()
    Object.assign(settings.value, loadedSettings)
    // Object.assign は saveStorageData を経由しないため、cachedRepoName を明示同期する
    syncRepoNameCache(loadedSettings.repoName)

    // #131: 設定済みのリポがあれば per-repo DB を先にオープン（以降の loadNotes/loadLeaves 等が使う）
    // 遅延オープンにするとホーム画面の初期表示でノート/リーフ一覧を出す前に
    // setCurrentRepo 完了を待つことになり、UI 表示がブロックされる。設定画面を
    // 開く前にキャッシュから一覧を描画したいので eager open を維持する。
    if (loadedSettings.repoName) {
      try {
        await setCurrentRepo(loadedSettings.repoName)
      } catch (error) {
        console.error('Failed to open per-repo DB on startup:', error)
      }
    }

    // i18n初期化（翻訳読み込み完了を待機）
    await initI18n(loadedSettings.locale)
    appState.i18nReady = true

    applyTheme(loadedSettings.theme, loadedSettings)
    document.title = loadedSettings.toolName

    // オフラインリーフを読み込み（GitHub設定に関係なく常に利用可能）
    const savedOfflineLeaf = await loadOfflineLeaf(OFFLINE_LEAF_ID)
    if (savedOfflineLeaf) {
      offlineLeafStore.value = {
        content: savedOfflineLeaf.content,
        badgeIcon: savedOfflineLeaf.badgeIcon ?? '',
        badgeColor: savedOfflineLeaf.badgeColor ?? '',
        updatedAt: savedOfflineLeaf.updatedAt,
      }
    }

    // システム等幅Webフォントを読み込む（エディタ + codeブロック用）
    // カスタムフォントより先に読み込む（カスタムフォントが優先される）
    loadAndApplySystemMonoFont().catch((error) => {
      console.error('Failed to load system mono font:', error)
    })

    // カスタムフォントがあれば適用（アプリ全体に適用、システム等幅フォントより優先）
    if (loadedSettings.hasCustomFont) {
      loadAndApplyCustomFont().catch((error) => {
        console.error('Failed to load custom font:', error)
      })
    }

    // カスタム背景画像があれば適用（左右別々）
    if (loadedSettings.hasCustomBackgroundLeft || loadedSettings.hasCustomBackgroundRight) {
      const leftOpacity = loadedSettings.backgroundOpacityLeft ?? 0.1
      const rightOpacity = loadedSettings.backgroundOpacityRight ?? 0.1
      loadAndApplyCustomBackgrounds(leftOpacity, rightOpacity).catch((error) => {
        console.error('Failed to load custom backgrounds:', error)
      })
    }

    // 初回起動時のデータ復元。
    //
    // #158: リモート HEAD の SHA が lastKnownCommitSha と一致するなら
    // full pull を省略して IndexedDB から復元する（= アプリのバージョンが
    // 変わっただけでリロードされた場合に、GitHub への全リーフ再取得を
    // 避ける）。SHA が異なるか、まだ一度も同期していない（SHA=null）
    // 場合、またはチェックに失敗した場合は従来通り full pull。
    //
    // Pull 成功時は IndexedDB 全削除→全作成される（GitHub が唯一の真実）。
    // キャンセル時は IndexedDB から読み込んで操作可能にする。

    // PWA更新チェック完了を待つ（更新があればリロードされる）
    await waitForSwCheck

    // GitHub設定チェック
    const isConfigured = loadedSettings.token && loadedSettings.repoName
    if (isConfigured) {
      // #158: IndexedDB / localStorage に保持したキャッシュをロードする。
      // notes / leaves は IndexedDB、metadata / pushCount / dirty は per-repo
      // localStorage slot から復元する。
      const loadPersistedStartupCache = async (): Promise<PersistedStartupCache> => {
        // 保留中の変更を先に IndexedDB へ保存
        await flushPendingSaves()
        return {
          wasDirty: getPersistedDirtyFlag(),
          notes: await loadNotes(),
          leaves: await loadLeaves(),
          metadata: getPersistedMetadata(),
          lastPulledPushCount: getPersistedLastPulledPushCount(),
        }
      }

      // ロード済みキャッシュを state に反映する。
      // adoptAsBaseline=true: clean cache とみなし snapshot/dirty を更新
      // adoptAsBaseline=false: dirty cache をそのまま開く（最低限 global dirty を維持）
      const applyPersistedStartupCache = async (
        cache: PersistedStartupCache,
        initialStartup: boolean,
        adoptAsBaseline: boolean
      ): Promise<number> => {
        notes.value = cache.notes
        leaves.value = cache.leaves
        // #168: pull スキップ経路でホーム右下のリーフ数・文字数が 0 のままに
        // ならないよう、pull 完了経路と同じ集計をここで通す。
        leafStatsStore.rebuild(cache.leaves, cache.notes)
        if (cache.metadata) {
          metadata.value = cache.metadata
        }
        if (cache.lastPulledPushCount !== null) {
          lastPulledPushCount.value = cache.lastPulledPushCount
        }
        if (adoptAsBaseline) {
          setLastPushedSnapshot(cache.notes, cache.leaves, [], [])
          clearAllChanges()
        } else if (cache.wasDirty) {
          // 起動時 confirm をキャンセルした dirty cache は、差分の詳細までは
          // 再構築できないため少なくとも全体 dirty を維持する。
          isStructureDirty.value = true
        }
        appState.isFirstPriorityFetched = true
        if (initialStartup) {
          appState.isRestoringFromUrl = true
          try {
            await deps.restoreStateFromUrl(true)
          } finally {
            // restoreStateFromUrl が例外を投げてもフラグが残らないようにする
            appState.isRestoringFromUrl = false
          }
        } else {
          await deps.restoreStateFromUrl(false)
        }
        return cache.notes.length + cache.leaves.length
      }

      // #158: 起動時の stale 先行チェック
      // lastKnownCommitSha が null（初回）の場合は手元に何もないので必ず full pull。
      // 非 null かつ remote HEAD と一致したときだけスキップする。
      const staleResult =
        lastKnownCommitSha.value !== null
          ? await executeStaleCheck(settings.value, lastKnownCommitSha.value)
          : null
      const persistedCache = await loadPersistedStartupCache()
      const canSkipFullPull = shouldUseStartupCache({
        lastKnownCommitSha: lastKnownCommitSha.value,
        staleResult,
        cache: persistedCache,
      })

      if (canSkipFullPull) {
        try {
          const restoredCount = await applyPersistedStartupCache(persistedCache, true, true)
          if (restoredCount === 0) {
            // localStorage に SHA が残っているのに IndexedDB が空。
            // 2 つの可能性がある:
            //   (a) 本当に空リポ（リーフ 0 件で push 済みの状態）
            //   (b) ブラウザが IndexedDB だけ evict した / devtools で手動削除した
            //       等の不整合ケース
            // SHA だけで両者を区別できないため、安全側に倒して full pull する。
            // (a) の場合はリモートも 0 件なので軽量（tree API 1 回 + 空応答）。
            // ノートが 1 つでも入っていれば次回起動からは skip パスに戻る。
            const shaPrefix = lastKnownCommitSha.value?.slice(0, 7) ?? '<null>'
            console.warn(
              `IndexedDB empty despite lastKnownCommitSha=${shaPrefix}; falling back to full pull ` +
                '(either truly empty repo, or local DB was evicted)'
            )
            await deps.pullFromGitHub(true)
          } else {
            // pull をスキップしたので以降の stale チェックで「リモート変更なし」が
            // 正しく判定されるよう isPullCompleted を立てる
            appState.isPullCompleted = true
          }
        } catch (error) {
          console.error('Failed to restore from IndexedDB, falling back to full pull:', error)
          await deps.pullFromGitHub(true)
        }
      } else {
        // 初回 Pull 実行（pullFromGitHub 内で dirty チェックを行う）
        // stale チェックは既に実行済みなら pullFromGitHub に渡して再取得を省略（#158）
        // キャンセル時は IndexedDB から読み込んで操作可能にする
        await deps.pullFromGitHub(
          true,
          async () => {
            try {
              await applyPersistedStartupCache(persistedCache, false, !persistedCache.wasDirty)
            } catch (error) {
              console.error('Failed to load from IndexedDB:', error)
              // 失敗した場合は Pull を実行
              await deps.pullFromGitHub(true)
            }
          },
          staleResult ?? undefined
        )
      }
    } else {
      // 未設定の場合はウェルカムモーダルを表示
      appState.showWelcome = true
      // GitHub設定が未完了の間は操作をロックしたまま
    }

    // 初期復元が終わってから per-repo 永続化の副作用を有効化する。
    cleanupStoreEffects = initStoreEffects()

    // Stale定期チェッカーを開始（5分ごと、前回Pullから5分経過後にチェック）
    startStaleChecker()
  })()

  // アスペクト比を監視して isDualPane を更新（横 > 縦で2ペイン表示）
  const updateDualPane = () => {
    appState.isDualPane = window.innerWidth > window.innerHeight
  }
  updateDualPane()

  window.addEventListener('resize', updateDualPane)

  // PWAスタンドアロンモードの場合、初期終了ガードを追加
  pushExitGuard()

  // ブラウザの戻る/進むボタンに対応（PWA終了ガード含む）
  const handlePopState = (e: PopStateEvent) => {
    const wasAtGuard = appState.atGuardEntry
    appState.atGuardEntry = false

    // PWA終了ガード検出（2パターン）
    // ケース1: 後方のエントリからガードエントリに到達（e.stateにガードキーあり）
    // ケース2: ガードエントリにいて、その前に戻った（e.stateにはないがフラグで検出）
    if (isPWAStandalone && (e.state?.[PWA_EXIT_GUARD_KEY] || wasAtGuard)) {
      // ガードを再追加（アプリ終了を防ぐ）
      pushExitGuard()

      // pushState直後のUI更新はAndroid Chrome PWAで描画されないため、
      // 次フレームに遅延させる
      requestAnimationFrame(() => {
        const t = get(_)
        if (isDirty.value) {
          showPushToast(t('leaf.unsaved'), 'error')
        } else {
          showPushToast(t('pwa.exitWarning'), '')
        }
      })
      return
    }

    // 通常のpopstate処理
    deps.restoreStateFromUrl()
  }
  window.addEventListener('popstate', handlePopState)

  // ページ離脱時の確認（未保存の変更がある場合）
  // ブラウザ標準のダイアログを使用
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty.value) {
      e.preventDefault()
      e.returnValue = '' // Chrome requires returnValue to be set
    }
  }
  window.addEventListener('beforeunload', handleBeforeUnload)

  // グローバルキーボードナビゲーション
  const handleKeyDown = (e: KeyboardEvent) => {
    deps.handleGlobalKeyDown(e)
  }
  window.addEventListener('keydown', handleKeyDown)

  // PWAバックグラウンド復帰時の処理
  // 長時間バックグラウンドにいた場合は、Service Workerの状態やIndexedDBが不安定になる可能性があるためリロード
  let lastVisibleTime = Date.now()
  const BACKGROUND_THRESHOLD_MS = 5 * 60 * 1000 // 5分

  /**
   * #205: Push ハング復旧後にリモートが進んでいた場合、共通 3 択ダイアログで判断を仰ぐ。
   * stale-push と同じ並び（pull primary / push secondary / cancel）。
   * cancel/null は何もしない（applyStaleResult で立てた赤バッジに任せる）。
   */
  const promptPushHangRecovery = async (staleResult: StaleCheckResult) => {
    const choice = await showConflictDialog({
      kind: 'push-hang',
      staleResult,
      localPushCount: metadata.value.pushCount,
      settings: settings.value,
    })
    if (choice === 'pull') {
      await deps.pullFromGitHub(false)
    } else if (choice === 'push') {
      await deps.pushToGitHub()
    }
  }

  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now()
      const elapsed = now - lastVisibleTime

      // #204: Push 中にスリープ → 復帰、で isPushing が true のまま固まっているケースを救う。
      // Phase A の Promise.race タイムアウトでもなお isPushing が true のままになるパス
      // （バックグラウンドで JS タイマー停止 → 復帰時に reject も発火する前 など）の保険。
      const inFlight = getPushInFlightAt()
      if (isPushing.value && inFlight && now - inFlight > PUSH_HANG_THRESHOLD_MS) {
        console.warn(
          `Push hang detected on visibility resume (inFlight age: ${now - inFlight}ms); clearing isPushing`
        )
        isPushing.value = false
        // pushInFlightAt は意図的に残す: 直後の stale check で
        //   - Push が成功していた場合 → applyStaleResult が SHA だけ更新して救済
        //   - Push が成功していなかった場合 → push-hang ダイアログでユーザー判断
        appState.pushHangRecovered = true
      }

      // #205: Push ハング復旧フラグは visibility 復帰時に必ず 1 回で消費する。
      // 例外（alertAsync reject、stale check throw 等）が起きても残留しないよう
      // try/finally で確実にクリアする。フラグはこのブロック先頭で取り出して
      // ローカル変数化し、後段の判定はそちらで行う（race を避ける）。
      const consumePushHangFlag = appState.pushHangRecovered
      // stale check を走らせ、outcome === 'stale-dirty' のときのみ push-hang 判断ダイアログを出す。
      // applyStaleResult の救済ブランチ（'rescued'）が走った場合はユーザー判断不要なので
      // ダイアログを抑制する（救済との二重発火を回避: #204 must）。
      const runStaleCheckAndMaybePromptHang = async (logContext: string) => {
        const staleResult = await executeStaleCheck(settings.value, lastKnownCommitSha.value)
        const outcome = applyStaleResult(staleResult, logContext)
        if (consumePushHangFlag && outcome === 'stale-dirty') {
          await promptPushHangRecovery(staleResult)
        }
      }

      try {
        if (elapsed > BACKGROUND_THRESHOLD_MS) {
          console.log(`PWA was in background for ${Math.round(elapsed / 1000)}s`)
          // モーダルを表示し、閉じたら状態確認を実行
          const t = get(_)
          await alertAsync(t('modal.longBackground'), 'center')
          await runStaleCheckAndMaybePromptHang('Long-background resume')
        } else if (consumePushHangFlag) {
          // BACKGROUND_THRESHOLD_MS 未満でも hang は検出済み。軽量な stale check だけ走らせる。
          await runStaleCheckAndMaybePromptHang('Push hang resume')
        }
      } finally {
        if (consumePushHangFlag) appState.pushHangRecovered = false
      }
      lastVisibleTime = now

      // PWA復帰時のレイアウト修復（フッターが画面外に出る問題の対策）
      requestAnimationFrame(() => {
        // resizeイベントをトリガーしてレイアウトを再計算
        window.dispatchEvent(new Event('resize'))

        // フッターが画面内にあることを確認し、なければスクロールをリセット
        const footers = document.querySelectorAll('.footer-fixed')
        footers.forEach((footer) => {
          const rect = footer.getBoundingClientRect()
          if (rect.top > window.innerHeight || rect.bottom < 0) {
            // フッターが画面外にある場合、親コンテナのスクロールをリセット
            const parent = footer.closest('.left-column, .right-column')
            if (parent) {
              const mainPane = parent.querySelector('.main-pane')
              if (mainPane) {
                ;(mainPane as HTMLElement).scrollTop = 0
              }
            }
          }
        })
      })
    } else {
      lastVisibleTime = Date.now()
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // オンライン復帰時の自動Pull リトライ
  // 初回Pull失敗（オフライン起動）後、ネットワーク復帰で自動的にPullを再試行する
  const handleOnline = () => {
    if (!appState.isFirstPriorityFetched && !isPulling.value) {
      console.log('Online detected: retrying initial pull')
      deps.pullFromGitHub(true)
    }
  }
  window.addEventListener('online', handleOnline)

  // 自動Push機能（$effect.rootで購読）
  const cleanupAutoPush = $effect.root(() => {
    $effect(() => {
      const should = shouldAutoPush.value
      if (!should) return

      // フラグをリセット（連続実行防止）
      shouldAutoPush.value = false

      // バックグラウンドでは実行しない
      if (document.visibilityState !== 'visible') return

      // GitHub設定がなければスキップ
      if (!githubConfigured.value) return

      // Push/Pull中またはアーカイブロード中はスキップ
      if (isPulling.value || isPushing.value || appState.isArchiveLoading) return

      // 初回Pullが完了していなければスキップ
      if (!appState.isFirstPriorityFetched) return

      console.log('Auto-push triggered')
      ;(async () => {
        // Staleチェックを実行（共通関数で時刻も更新）
        const staleResult = await executeStaleCheck(settings.value, lastKnownCommitSha.value)

        switch (staleResult.status) {
          case 'stale':
            // リモートに新しい変更あり → 確認ダイアログを表示
            isStale.value = true
            console.log(
              `Auto-push stale: remote(${staleResult.remoteCommitSha}) !== local(${staleResult.localCommitSha})`
            )
            // ユーザーに確認（手動Pushと同じモーダル / 同じ診断情報）
            // #200: 共通ヘルパー経由にすることで、auto-push でも SHA / pushCount を表示する。
            {
              const choice = await showConflictDialog({
                kind: 'stale-push',
                staleResult,
                localPushCount: metadata.value.pushCount,
                settings: settings.value,
              })

              if (choice === 'pull') {
                // Pull first: Pull→Push
                resetAutoPushTimer()
                await deps.pullFromGitHub(false)
                await deps.pushToGitHub()
                return
              } else if (choice === 'cancel' || choice === null) {
                // キャンセル → タイマーリセットして終了
                resetAutoPushTimer()
                return
              }
            }
            // choice === 'push' → 強制Pushを続行（breakしてswitch抜ける）
            break

          case 'check_failed':
            // チェック失敗（ネットワークエラー等）→ 静かにスキップ
            console.warn('Stale check failed, skipping auto-push:', staleResult.reason)
            // タイマーをリセット（リトライループ防止、次の42秒後に再試行）
            resetAutoPushTimer()
            return

          case 'up_to_date':
            // 最新状態 → 自動Push実行
            break
        }

        await deps.pushToGitHub()
      })()
    })
    return () => {}
  })

  // 自動Pull機能（$effect.rootで購読）
  // stale-checker.tsでstale検出かつローカルがクリーンなときにtrueになる
  const cleanupAutoPull = $effect.root(() => {
    $effect(() => {
      const should = shouldAutoPull.value
      if (!should) return

      // フラグをリセット（連続実行防止）
      shouldAutoPull.value = false

      // バックグラウンドでは実行しない
      if (document.visibilityState !== 'visible') return

      // GitHub設定がなければスキップ
      if (!githubConfigured.value) return

      // Push/Pull中またはアーカイブロード中はスキップ
      if (isPulling.value || isPushing.value || appState.isArchiveLoading) return

      // 初回Pullが完了していなければスキップ
      if (!appState.isFirstPriorityFetched) return

      console.log('Auto-pull triggered (stale detected, local is clean)')

      // Pull実行（ダーティチェックなし、すでにstale-checkerで確認済み）
      deps.pullFromGitHub(false)
    })
    return () => {}
  })

  return () => {
    window.removeEventListener('popstate', handlePopState)
    window.removeEventListener('resize', updateDualPane)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('online', handleOnline)
    cleanupAutoPush()
    cleanupAutoPull()
    cleanupStoreEffects()
    cleanupActivityDetection()
    cleanupBeforeUnloadSave()
    stopStaleChecker()
  }
}
