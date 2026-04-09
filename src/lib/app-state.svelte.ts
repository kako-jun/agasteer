/**
 * アプリケーション状態の集約モジュール（Phase 1 + Phase 2 + Phase 4）
 *
 * Phase 1: ワールドヘルパー関数、paneStateStore、定数を移動。
 * Phase 2: App.svelte の $state/$derived を appState/derivedState に移動。
 * Phase 4: onMount ロジックを initApp() に抽出。
 */

import type { Note, Leaf, Breadcrumb, WorldType } from './types'
import type { Pane } from './navigation'
import type { LeafSkeleton } from './api'
import type { ModalPosition } from './ui'
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
  shouldShowPwaInstallBanner,
  setPushInFlightAt,
  getPushInFlightAt,
} from './data'
import {
  applyTheme,
  loadAndApplyCustomFont,
  loadAndApplySystemMonoFont,
  loadAndApplyCustomBackgrounds,
  showPushToast,
  showPullToast,
  alertAsync,
  confirmAsync,
} from './ui'
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
let _leftEditorView = $state<any>(null)
let _leftPreviewView = $state<any>(null)
let _rightEditorView = $state<any>(null)
let _rightPreviewView = $state<any>(null)
let _loadingLeafIds = $state(new Set<string>())
let _leafSkeletonMap = $state(new Map<string, LeafSkeleton>())
let _isRestoringFromUrl = $state(false)
let _importOccurredInSettings = $state(false)
let _atGuardEntry = $state(false)

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
  pullFromGitHub: (isInitial: boolean, onCancel?: () => void | Promise<void>) => Promise<void>
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
  const cleanupStoreEffects = initStoreEffects()

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
    settings.value = loadedSettings

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

    // 初回Pull（GitHubから最新データを取得）
    // 重要: IndexedDBからは読み込まない
    // Pull成功時にIndexedDBは全削除→全作成される
    // Pull成功後、URLから状態を復元（handlePull内で実行）

    // PWA更新チェック完了を待つ（更新があればリロードされる）
    await waitForSwCheck

    // GitHub設定チェック
    const isConfigured = loadedSettings.token && loadedSettings.repoName
    if (isConfigured) {
      // 初回Pull実行（pullFromGitHub内でdirtyチェック、staleチェックを行う）
      // キャンセル時はIndexedDBから読み込んで操作可能にする
      await deps.pullFromGitHub(true, async () => {
        try {
          // 保留中の変更を先にIndexedDBへ保存
          await flushPendingSaves()
          // localStorage に保存されているダーティフラグを保存（後で復元するため）
          const wasDirty = getPersistedDirtyFlag()
          const savedNotes = await loadNotes()
          const savedLeaves = await loadLeaves()
          notes.value = savedNotes
          leaves.value = savedLeaves
          // IndexedDBのデータをベースラインとして記録（dirty誤検出を防止）
          setLastPushedSnapshot(savedNotes, savedLeaves, [], [])
          // ベースラインとローカルが同じなのでダーティをクリア
          clearAllChanges()
          // リーフのisDirtyでは検出できない構造変更があった場合、isStructureDirtyを復元
          if (wasDirty) {
            isStructureDirty.value = true
          }
          appState.isFirstPriorityFetched = true
          deps.restoreStateFromUrl(false)
        } catch (error) {
          console.error('Failed to load from IndexedDB:', error)
          // 失敗した場合はPullを実行
          await deps.pullFromGitHub(true)
        }
      })
    } else {
      // 未設定の場合はウェルカムモーダルを表示
      appState.showWelcome = true
      // GitHub設定が未完了の間は操作をロックしたまま
    }

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

  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now()
      const elapsed = now - lastVisibleTime
      if (elapsed > BACKGROUND_THRESHOLD_MS) {
        console.log(`PWA was in background for ${Math.round(elapsed / 1000)}s`)
        // モーダルを表示し、閉じたら状態確認を実行
        const t = get(_)
        await alertAsync(t('modal.longBackground'), 'center')
        // staleチェックを実行
        const staleResult = await executeStaleCheck(settings.value, lastKnownCommitSha.value)
        if (staleResult.status === 'stale') {
          // Push飛行中フラグがある場合、スリープでPushレスポンスが消失した可能性がある
          // （GitHub側ではPushが成功しているが、レスポンスが届かずSHAが未更新）
          const pushInFlight = getPushInFlightAt()
          const PUSH_IN_FLIGHT_EXPIRY_MS = 60 * 60 * 1000 // 1時間
          if (pushInFlight && now - pushInFlight < PUSH_IN_FLIGHT_EXPIRY_MS) {
            console.log('Stale detected with push-in-flight flag: resolving as interrupted push')
            // SHAのみ更新し、スナップショットとダーティは変更しない。
            // push後〜sleep前にユーザーが追加編集した場合、その編集がダーティとして残り、
            // 次回pushで正しく送信される。既にpush済みの内容との差分がなければno-op pushになる。
            lastKnownCommitSha.value = staleResult.remoteCommitSha
            setPushInFlightAt(undefined)
            isStale.value = false
          } else {
            // フラグが期限切れの場合はクリアして通常のstale処理
            if (pushInFlight) {
              setPushInFlightAt(undefined)
            }
            isStale.value = true
          }
        } else if (staleResult.status === 'up_to_date') {
          // PushがGitHubに届かなかった場合もここに来る（SHAが変わっていない）
          // 飛行中フラグがあれば安全にクリア
          if (getPushInFlightAt()) {
            setPushInFlightAt(undefined)
          }
          isStale.value = false
        }
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
            // ユーザーに確認（手動Pushと同じモーダル）
            {
              const t = get(_)
              const confirmed = await confirmAsync(t('modal.staleEdit'))
              if (!confirmed) {
                // キャンセル → タイマーリセットして終了
                resetAutoPushTimer()
                return
              }
            }
            // OK → 強制Pushを続行（breakしてswitch抜ける）
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
    cleanupAutoPush()
    cleanupAutoPull()
    cleanupStoreEffects()
    cleanupActivityDetection()
    cleanupBeforeUnloadSave()
    stopStaleChecker()
  }
}
