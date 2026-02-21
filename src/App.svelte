<script lang="ts">
  import './App.css'
  import { waitForSwCheck } from './main'
  import { onMount, tick, setContext } from 'svelte'
  import { writable, get } from 'svelte/store'
  import type { Note, Leaf, Breadcrumb, View, Metadata, WorldType, SearchMatch } from './lib/types'
  import * as nav from './lib/navigation'
  import type { Pane } from './lib/navigation'

  import {
    settings,
    notes,
    leaves,
    rootNotes,
    githubConfigured,
    metadata,
    isDirty,
    isStructureDirty,
    clearAllChanges,
    getPersistedDirtyFlag,
    lastPulledPushCount,
    lastKnownCommitSha,
    isStale,
    lastPushTime,
    updateSettings,
    updateNotes,
    updateLeaves,
    leftNote,
    rightNote,
    leftLeaf,
    rightLeaf,
    leftView,
    rightView,
    isPulling,
    isPushing,
    focusedPane,
    leafStatsStore,
    archiveLeafStatsStore,
    dragStore,
    moveModalStore,
    pullProgressStore,
    pullProgressInfo,
    offlineLeafStore,
    archiveNotes,
    archiveLeaves,
    archiveMetadata,
    updateArchiveNotes,
    updateArchiveLeaves,
    isArchiveLoaded,
    leftWorld,
    rightWorld,
    initActivityDetection,
    setupBeforeUnloadSave,
    scheduleOfflineSave,
    flushPendingSaves,
    shouldAutoPush,
    resetAutoPushTimer,
    startStaleChecker,
    stopStaleChecker,
    executeStaleCheck,
    shouldAutoPull,
    setLastPushedSnapshot,
    // ワールドヘルパー（純粋関数）
    getNotesForWorld as _getNotesForWorld,
    getLeavesForWorld as _getLeavesForWorld,
    getWorldForPane as _getWorldForPane,
    getNotesForPane as _getNotesForPane,
    getLeavesForPane as _getLeavesForPane,
    getWorldForNote as _getWorldForNote,
    getWorldForLeaf as _getWorldForLeaf,
    getDialogPositionForPane,
  } from './lib/stores'
  import {
    clearAllData,
    loadSettings,
    loadNotes,
    loadLeaves,
    saveNotes,
    saveLeaves,
    saveOfflineLeaf,
    loadOfflineLeaf,
    createBackup,
    restoreFromBackup,
    shouldShowPwaInstallBanner,
    setPwaInstallDismissedAt,
    type IndexedDBBackup,
  } from './lib/data'
  import { applyTheme } from './lib/ui'
  import { loadAndApplyCustomFont, loadAndApplySystemMonoFont } from './lib/ui'
  import { loadAndApplyCustomBackgrounds } from './lib/ui'
  import {
    executePush,
    executePull,
    pullArchive,
    testGitHubConnection,
    translateGitHubMessage,
    canSync,
    fetchRemotePushCount,
  } from './lib/api'
  import type {
    PullOptions,
    PullPriority,
    LeafSkeleton,
    RateLimitInfo,
    StaleCheckResult,
  } from './lib/api'
  import { initI18n, _, locale } from './lib/i18n'
  import { processImportFile, isAgasteerZip, parseAgasteerZip } from './lib/data'
  import {
    pushToastState,
    pullToastState,
    modalState,
    showPushToast,
    showPullToast,
    showConfirm,
    alertAsync,
    confirmAsync,
    promptAsync,
    choiceAsync,
    showPrompt,
    closeModal,
  } from './lib/ui'
  import { resolvePath, buildPath, extractWorldPrefix } from './lib/navigation'
  import { buildNotesZip, downloadLeafAsMarkdown as downloadLeafAsMarkdownLib } from './lib/utils'
  import { getBreadcrumbs as buildBreadcrumbs, extractH1Title, updateH1Title } from './lib/ui'
  import { reorderItems } from './lib/navigation'
  import {
    createNote as createNoteLib,
    deleteNote as deleteNoteLib,
    updateNoteName as updateNoteNameLib,
    updateNoteBadge as updateNoteBadgeLib,
    normalizeNoteOrders,
    moveNoteTo as moveNoteToLib,
    getItemCount,
  } from './lib/data'
  import {
    createLeaf as createLeafLib,
    deleteLeaf as deleteLeafLib,
    updateLeafContent as updateLeafContentLib,
    updateLeafBadge as updateLeafBadgeLib,
    normalizeLeafOrders,
    moveLeafTo as moveLeafToLib,
    getLeafCount,
  } from './lib/data'
  import { computeLeafCharCount } from './lib/utils'
  import {
    handleCopyUrl as handleCopyUrlLib,
    handleCopyMarkdown as handleCopyMarkdownLib,
    handleShareImage as handleShareImageLib,
    handleShareSelectionImage as handleShareSelectionImageLib,
    handleCopyImageToClipboard as handleCopyImageToClipboardLib,
  } from './lib/utils'
  import {
    handlePaneScroll as handlePaneScrollLib,
    type ScrollSyncState,
    type ScrollSyncViews,
  } from './lib/ui'
  import { generateUniqueName, normalizeBadgeValue } from './lib/utils'
  import Header from './components/layout/Header.svelte'
  import Modal from './components/layout/Modal.svelte'
  import Toast from './components/layout/Toast.svelte'
  import MoveModal from './components/layout/MoveModal.svelte'
  import SearchBar from './components/layout/SearchBar.svelte'
  import SettingsModal from './components/layout/SettingsModal.svelte'
  import WelcomeModal from './components/layout/WelcomeModal.svelte'
  import InstallBanner from './components/layout/InstallBanner.svelte'
  import { toggleSearch } from './lib/utils'
  import PaneView from './components/layout/PaneView.svelte'
  import type { PaneActions, PaneState } from './lib/stores'
  import {
    priorityItems,
    createPriorityLeaf,
    isPriorityLeaf,
    isLeafSaveable,
    isNoteSaveable,
    PRIORITY_LEAF_ID,
    createOfflineLeaf,
    isOfflineLeaf,
    OFFLINE_LEAF_ID,
  } from './lib/utils'

  // ローカル状態
  let breadcrumbs: Breadcrumb[] = []
  let breadcrumbsRight: Breadcrumb[] = []
  let editingBreadcrumb: string | null = null

  // dragStoreへのリアクティブアクセス
  $: draggedNote = $dragStore.draggedNote
  $: draggedLeaf = $dragStore.draggedLeaf
  $: dragOverNoteId = $dragStore.dragOverNoteId
  $: dragOverLeafId = $dragStore.dragOverLeafId

  let isLoadingUI = false // ガラス効果（Pull中のみ）
  let isFirstPriorityFetched = false // 第1優先リーフの取得が完了したか
  let isPullCompleted = false // 全リーフのPullが完了したか
  let showSettings = false
  let i18nReady = false // i18n初期化完了フラグ
  let showWelcome = false // ウェルカムモーダル表示フラグ
  let showInstallBanner = false // PWAインストールバナー表示フラグ
  let deferredPrompt: Event | null = null // BeforeInstallPromptEvent
  let isExportingZip = false
  let isImporting = false
  let isTesting = false
  let importOccurredInSettings = false
  let isClosingSettingsPull = false
  let isArchiveLoading = false // アーカイブをロード中

  // leafStatsStoreとmoveModalStoreへのリアクティブアクセス
  // 左ペインのワールドとビューに応じて統計を切り替え
  $: totalLeafCount =
    $leftWorld === 'archive' && $leftView === 'home'
      ? $archiveLeafStatsStore.totalLeafCount
      : $leafStatsStore.totalLeafCount
  $: totalLeafChars =
    $leftWorld === 'archive' && $leftView === 'home'
      ? $archiveLeafStatsStore.totalLeafChars
      : $leafStatsStore.totalLeafChars
  $: moveModalOpen = $moveModalStore.isOpen
  $: moveTargetLeaf = $moveModalStore.targetLeaf
  $: moveTargetNote = $moveModalStore.targetNote
  $: moveTargetPane = $moveModalStore.targetPane
  $: moveTargetWorld = _getWorldForPane(moveTargetPane, $leftWorld, $rightWorld)
  $: moveTargetNotes = _getNotesForWorld(moveTargetWorld, $notes, $archiveNotes)

  // 左右ペイン用の状態
  let isDualPane = false // 画面幅で切り替え

  // PWAスタンドアロンモード検出（Android戻るスワイプ対策）
  const isPWAStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true)

  // PWA終了ガード用のセンチネルキー
  const PWA_EXIT_GUARD_KEY = 'pwa-exit-guard'

  // PWA終了ガードにいるかどうかのフラグ
  // popstateのe.stateは遷移先のstateであるため、ガードが履歴の最後にある場合
  // 戻るスワイプでe.stateにガードキーが含まれない。このフラグで補完する。
  let atGuardEntry = false

  // PWA終了ガード用のダミーエントリを追加
  function pushExitGuard() {
    if (isPWAStandalone) {
      history.pushState({ [PWA_EXIT_GUARD_KEY]: true }, '', location.href)
      atGuardEntry = true
    }
  }

  // ユーザーガイドを開く
  const USER_GUIDE_BASE = 'https://github.com/kako-jun/agasteer/blob/main/docs/user-guide'
  function openUserGuide() {
    const lang = $locale?.startsWith('ja') ? 'ja' : 'en'
    const url = `${USER_GUIDE_BASE}/${lang}/index.md`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // キーボードナビゲーション用の状態
  let selectedIndexLeft = 0 // 左ペインで選択中のアイテムインデックス
  let selectedIndexRight = 0 // 右ペインで選択中のアイテムインデックス

  // スクロール同期用のコンポーネント参照
  let leftEditorView: any = null
  let leftPreviewView: any = null
  let rightEditorView: any = null
  let rightPreviewView: any = null

  // スクロール同期関数（scroll-sync.tsに移行）
  function getScrollSyncState(): ScrollSyncState {
    return {
      isDualPane,
      leftLeaf: $leftLeaf,
      rightLeaf: $rightLeaf,
      leftView: $leftView,
      rightView: $rightView,
    }
  }

  function getScrollSyncViews(): ScrollSyncViews {
    return { leftEditorView, leftPreviewView, rightEditorView, rightPreviewView }
  }

  function handlePaneScroll(pane: Pane, scrollTop: number, scrollHeight: number) {
    handlePaneScrollLib(pane, scrollTop, scrollHeight, getScrollSyncState(), getScrollSyncViews())
  }

  function handleLeftScroll(scrollTop: number, scrollHeight: number) {
    handlePaneScroll('left', scrollTop, scrollHeight)
  }

  function handleRightScroll(scrollTop: number, scrollHeight: number) {
    handlePaneScroll('right', scrollTop, scrollHeight)
  }

  // リアクティブ宣言（ワールドに応じたデータを使用）
  $: leftBreadcrumbNotes = _getNotesForWorld($leftWorld, $notes, $archiveNotes)
  $: leftBreadcrumbLeaves = _getLeavesForWorld($leftWorld, $leaves, $archiveLeaves)
  $: rightBreadcrumbNotes = _getNotesForWorld($rightWorld, $notes, $archiveNotes)
  $: rightBreadcrumbLeaves = _getLeavesForWorld($rightWorld, $leaves, $archiveLeaves)

  $: breadcrumbs = buildBreadcrumbs(
    $leftView,
    $leftNote,
    $leftLeaf,
    leftBreadcrumbNotes,
    'left',
    goHome,
    selectNote,
    leftBreadcrumbLeaves
  )
  $: breadcrumbsRight = buildBreadcrumbs(
    $rightView,
    $rightNote,
    $rightLeaf,
    rightBreadcrumbNotes,
    'right',
    goHome,
    selectNote,
    rightBreadcrumbLeaves
  )
  $: isGitHubConfigured = $githubConfigured
  $: document.title = $settings.toolName

  // Priorityリーフをリアクティブに生成（metadataからバッジ情報を復元）
  $: priorityBadgeMeta = $metadata.leaves?.[PRIORITY_LEAF_ID]
  $: currentPriorityLeaf = createPriorityLeaf(
    $priorityItems,
    priorityBadgeMeta?.badgeIcon,
    priorityBadgeMeta?.badgeColor
  )

  // オフラインリーフをリアクティブに生成（ストアから）
  $: currentOfflineLeaf = createOfflineLeaf(
    $offlineLeafStore.content,
    $offlineLeafStore.badgeIcon,
    $offlineLeafStore.badgeColor
  )

  // Pull/Push中はボタンを無効化（リアクティブに追跡）
  $: canPull = !$isPulling && !$isPushing && !isArchiveLoading
  $: canPush = !$isPulling && !$isPushing && !isArchiveLoading && isFirstPriorityFetched

  // ペインごとのワールドに応じたノート・リーフを取得するヘルパー
  // （純粋関数のラッパー：ストアから値を取得して渡す）
  function getNotesForWorld(world: WorldType): Note[] {
    return _getNotesForWorld(world, get(notes), get(archiveNotes))
  }

  function getLeavesForWorld(world: WorldType): Leaf[] {
    return _getLeavesForWorld(world, get(leaves), get(archiveLeaves))
  }

  function getWorldForPane(pane: Pane): WorldType {
    return _getWorldForPane(pane, get(leftWorld), get(rightWorld))
  }

  function getNotesForPane(pane: Pane): Note[] {
    return _getNotesForPane(pane, get(leftWorld), get(rightWorld), get(notes), get(archiveNotes))
  }

  function getLeavesForPane(pane: Pane): Leaf[] {
    return _getLeavesForPane(pane, get(leftWorld), get(rightWorld), get(leaves), get(archiveLeaves))
  }

  // ノート・リーフがどのワールドに属するかを判定
  function getWorldForNote(note: Note): WorldType {
    return _getWorldForNote(note, get(notes), get(archiveNotes))
  }

  function getWorldForLeaf(leaf: Leaf): WorldType {
    return _getWorldForLeaf(leaf, get(leaves), get(archiveLeaves))
  }

  // 現在のワールド（左ペイン基準、後方互換性のため）に応じたノート・リーフ
  $: currentNotes = _getNotesForWorld($leftWorld, $notes, $archiveNotes)
  $: currentLeaves = _getLeavesForWorld($leftWorld, $leaves, $archiveLeaves)

  // 現在のワールドに応じたノート・リーフ更新ヘルパー
  function setCurrentNotes(newNotes: Note[]): void {
    setNotesForWorld(get(leftWorld), newNotes)
  }

  function setCurrentLeaves(newLeaves: Leaf[]): void {
    setLeavesForWorld(get(leftWorld), newLeaves)
  }

  // ペインのワールドに応じたノート・リーフ更新ヘルパー
  function setNotesForWorld(world: WorldType, newNotes: Note[]): void {
    if (world === 'archive') {
      updateArchiveNotes(newNotes)
    } else {
      updateNotes(newNotes)
    }
  }

  function setLeavesForWorld(world: WorldType, newLeaves: Leaf[]): void {
    if (world === 'archive') {
      updateArchiveLeaves(newLeaves)
    } else {
      updateLeaves(newLeaves)
    }
  }

  // ========================================
  // Context API によるペイン間の状態共有
  // ========================================

  // paneState ストア（リアクティブな状態を子コンポーネントに渡す）
  const paneStateStore = writable<PaneState>({
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

  // Pushボタン無効理由を計算
  $: pushDisabledReason = $pullProgressInfo
    ? $_('home.leafFetched', {
        values: { fetched: $pullProgressInfo.fetched, total: $pullProgressInfo.total },
      })
    : ''

  // paneState をリアクティブに更新
  $: paneStateStore.set({
    isFirstPriorityFetched,
    isPullCompleted,
    canPush,
    pushDisabledReason,
    selectedIndexLeft,
    selectedIndexRight,
    editingBreadcrumb,
    dragOverNoteId,
    dragOverLeafId,
    loadingLeafIds,
    leafSkeletonMap,
    totalLeafCount,
    totalLeafChars,
    lastPulledPushCount: $lastPulledPushCount,
    currentPriorityLeaf,
    currentOfflineLeaf,
    breadcrumbs,
    breadcrumbsRight,
    showWelcome,
    isLoadingUI,
    leftWorld: $leftWorld,
    rightWorld: $rightWorld,
    isArchiveLoading,
  })

  // Context に設定
  setContext('paneState', paneStateStore)

  // URLルーティング
  let isRestoringFromUrl = false

  function updateUrlFromState() {
    // 初期化完了まで、URL更新をスキップ
    if (isRestoringFromUrl || $isPulling || !isFirstPriorityFetched) {
      return
    }

    const params = new URLSearchParams()

    // 左ペインのノートデータ（ワールドに応じて切り替え）
    const leftNotes = _getNotesForWorld($leftWorld, $notes, $archiveNotes)
    // 右ペインのノートデータ
    const rightNotes = _getNotesForWorld($rightWorld, $notes, $archiveNotes)

    // 左ペイン（常に設定、ワールド情報を含む）
    const leftPath = buildPath($leftNote, $leftLeaf, leftNotes, $leftView, $leftWorld)
    params.set('left', leftPath)

    // 右ペイン（2ペイン表示時は独立した状態、1ペイン時は左と同じ）
    const rightPath = isDualPane
      ? buildPath($rightNote, $rightLeaf, rightNotes, $rightView, $rightWorld)
      : leftPath
    params.set('right', rightPath)

    const newUrl = `?${params.toString()}`
    window.history.pushState({}, '', newUrl)
    atGuardEntry = false
  }

  async function restoreStateFromUrl(alreadyRestoring = false) {
    const params = new URLSearchParams(window.location.search)
    let leftPath = params.get('left')
    let rightPath = params.get('right')

    // 互換性: 旧形式（?note=uuid&leaf=uuid）もサポート
    if (!leftPath && !rightPath) {
      const noteId = params.get('note')
      const leafId = params.get('leaf')

      if (leafId) {
        const leaf = $leaves.find((n) => n.id === leafId)
        if (leaf) {
          const note = $notes.find((f) => f.id === leaf.noteId)
          if (note) {
            $leftNote = note
            $leftLeaf = leaf
            $leftView = 'edit'
            leftWorld.set('home')
          }
        }
      } else if (noteId) {
        const note = $notes.find((f) => f.id === noteId)
        if (note) {
          $leftNote = note
          $leftLeaf = null
          $leftView = 'note'
          leftWorld.set('home')
        }
      } else {
        $leftNote = null
        $leftLeaf = null
        $leftView = 'home'
        leftWorld.set('home')
      }
      return
    }

    if (!alreadyRestoring) {
      isRestoringFromUrl = true
    }

    // 左ペインの復元
    if (!leftPath) {
      leftPath = '/'
    }

    // ワールドを判定
    const leftWorldInfo = extractWorldPrefix(leftPath)
    const rightWorldInfo = rightPath ? extractWorldPrefix(rightPath) : { world: 'home' as const }

    // アーカイブが必要だが未ロードの場合、先にPullする
    const needsArchive = leftWorldInfo.world === 'archive' || rightWorldInfo.world === 'archive'
    if (needsArchive && !$isArchiveLoaded && $settings.token && $settings.repoName) {
      isArchiveLoading = true
      archiveLeafStatsStore.reset()
      try {
        const result = await pullArchive($settings, {
          onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
        })
        if (result.success) {
          archiveNotes.set(result.notes)
          archiveLeaves.set(result.leaves)
          archiveMetadata.set(result.metadata)
          isArchiveLoaded.set(true)
          setLastPushedSnapshot(get(notes), get(leaves), result.notes, result.leaves)
        }
      } catch (e) {
        console.error('Archive pull failed during URL restore:', e)
      } finally {
        isArchiveLoading = false
      }
    }

    // 左ペインのデータ（アーカイブのPull後のデータを使用）
    const leftNotesData = _getNotesForWorld(leftWorldInfo.world, $notes, $archiveNotes)
    const leftLeavesData = _getLeavesForWorld(leftWorldInfo.world, $leaves, $archiveLeaves)

    const leftResolution = resolvePath(leftPath, leftNotesData, leftLeavesData)
    leftWorld.set(leftResolution.world)

    if (leftResolution.type === 'home') {
      $leftNote = null
      $leftLeaf = null
      $leftView = 'home'
    } else if (leftResolution.type === 'note') {
      $leftNote = leftResolution.note
      $leftLeaf = null
      $leftView = 'note'
    } else if (leftResolution.type === 'leaf') {
      $leftNote = leftResolution.note
      $leftLeaf = leftResolution.leaf
      $leftView = leftResolution.isPreview ? 'preview' : 'edit'
    }

    // 右ペインの復元（2ペイン表示時のみ）
    if (rightPath && isDualPane) {
      // 右ペインのデータ（アーカイブのPull後のデータを使用）
      const rightNotesData = _getNotesForWorld(rightWorldInfo.world, $notes, $archiveNotes)
      const rightLeavesData = _getLeavesForWorld(rightWorldInfo.world, $leaves, $archiveLeaves)

      const rightResolution = resolvePath(rightPath, rightNotesData, rightLeavesData)
      rightWorld.set(rightResolution.world)

      if (rightResolution.type === 'home') {
        $rightNote = null
        $rightLeaf = null
        $rightView = 'home'
      } else if (rightResolution.type === 'note') {
        $rightNote = rightResolution.note
        $rightLeaf = null
        $rightView = 'note'
      } else if (rightResolution.type === 'leaf') {
        $rightNote = rightResolution.note
        $rightLeaf = rightResolution.leaf
        $rightView = rightResolution.isPreview ? 'preview' : 'edit'
      }
    } else {
      // 1ペイン表示時は右ペインを左と同じにする
      $rightNote = $leftNote
      $rightLeaf = $leftLeaf
      $rightView = $leftView
      rightWorld.set($leftWorld)
    }

    if (!alreadyRestoring) {
      isRestoringFromUrl = false
    }
  }

  // 未取得リーフのID（ローディング表示用）
  let loadingLeafIds = new Set<string>()

  // スケルトン表示用のリーフメタ情報（Pull中のみ使用）
  let leafSkeletonMap = new Map<string, LeafSkeleton>()

  // ペインの状態変更をURLに反映
  $: ($leftNote,
    $leftLeaf,
    $leftView,
    $leftWorld,
    $rightNote,
    $rightLeaf,
    $rightView,
    $rightWorld,
    updateUrlFromState())

  // 初期化
  onMount(() => {
    // 訪問者カウントをインクリメント（非表示、1日1回制限あり）
    // 設定ページでも表示されるが、nostalgicの重複防止機構で1回のみカウント
    fetch('https://api.nostalgic.llll-ll.com/visit?action=increment&id=agasteer-c347357a').catch(
      () => {}
    )

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
      deferredPrompt = e
      // バナーを表示
      showInstallBanner = true
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // PWAがインストールされた時
    const handleAppInstalled = () => {
      showInstallBanner = false
      deferredPrompt = null
    }
    window.addEventListener('appinstalled', handleAppInstalled)

    // 非同期初期化処理を即座に実行
    ;(async () => {
      const loadedSettings = loadSettings()
      settings.set(loadedSettings)

      // i18n初期化（翻訳読み込み完了を待機）
      await initI18n(loadedSettings.locale)
      i18nReady = true

      applyTheme(loadedSettings.theme, loadedSettings)
      document.title = loadedSettings.toolName

      // オフラインリーフを読み込み（GitHub設定に関係なく常に利用可能）
      const savedOfflineLeaf = await loadOfflineLeaf(OFFLINE_LEAF_ID)
      if (savedOfflineLeaf) {
        offlineLeafStore.set({
          content: savedOfflineLeaf.content,
          badgeIcon: savedOfflineLeaf.badgeIcon || '',
          badgeColor: savedOfflineLeaf.badgeColor || '',
          updatedAt: savedOfflineLeaf.updatedAt,
        })
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
        await pullFromGitHub(true, async () => {
          try {
            // 保留中の変更を先にIndexedDBへ保存
            await flushPendingSaves()
            // localStorage に保存されているダーティフラグを保存（後で復元するため）
            const wasDirty = getPersistedDirtyFlag()
            const savedNotes = await loadNotes()
            const savedLeaves = await loadLeaves()
            notes.set(savedNotes)
            leaves.set(savedLeaves)
            // リーフのisDirtyでは検出できない構造変更があった場合、isStructureDirtyを復元
            if (wasDirty && !get(isDirty)) {
              isStructureDirty.set(true)
            }
            isFirstPriorityFetched = true
            restoreStateFromUrl(false)
          } catch (error) {
            console.error('Failed to load from IndexedDB:', error)
            // 失敗した場合はPullを実行
            await pullFromGitHub(true)
          }
        })
      } else {
        // 未設定の場合はウェルカムモーダルを表示
        showWelcome = true
        // GitHub設定が未完了の間は操作をロックしたまま
      }

      // Stale定期チェッカーを開始（5分ごと、前回Pullから5分経過後にチェック）
      startStaleChecker()
    })()

    // アスペクト比を監視して isDualPane を更新（横 > 縦で2ペイン表示）
    const updateDualPane = () => {
      isDualPane = window.innerWidth > window.innerHeight
    }
    updateDualPane()

    window.addEventListener('resize', updateDualPane)

    // PWAスタンドアロンモードの場合、初期終了ガードを追加
    pushExitGuard()

    // ブラウザの戻る/進むボタンに対応（PWA終了ガード含む）
    const handlePopState = (e: PopStateEvent) => {
      const wasAtGuard = atGuardEntry
      atGuardEntry = false

      // PWA終了ガード検出（2パターン）
      // ケース1: 後方のエントリからガードエントリに到達（e.stateにガードキーあり）
      // ケース2: ガードエントリにいて、その前に戻った（e.stateにはないがフラグで検出）
      if (isPWAStandalone && (e.state?.[PWA_EXIT_GUARD_KEY] || wasAtGuard)) {
        // ガードを再追加（アプリ終了を防ぐ）
        pushExitGuard()

        // 未保存の変更がある場合はトーストで警告
        if (get(isDirty)) {
          showPushToast($_('leaf.unsaved'), 'error')
        }
        return
      }

      // 通常のpopstate処理
      restoreStateFromUrl()
    }
    window.addEventListener('popstate', handlePopState)

    // ページ離脱時の確認（未保存の変更がある場合）
    // ブラウザ標準のダイアログを使用
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (get(isDirty)) {
        e.preventDefault()
        e.returnValue = '' // Chrome requires returnValue to be set
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // グローバルキーボードナビゲーション
    const handleKeyDown = (e: KeyboardEvent) => {
      handleGlobalKeyDown(e)
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
          await alertAsync($_('modal.longBackground'), 'center')
          // staleチェックを実行
          const staleResult = await executeStaleCheck($settings, get(lastKnownCommitSha))
          if (staleResult.status === 'stale') {
            isStale.set(true)
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
                  mainPane.scrollTop = 0
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

    // 自動Push機能（shouldAutoPushストアを購読して実行）
    const unsubscribeAutoPush = shouldAutoPush.subscribe(async (should) => {
      if (!should) return

      // フラグをリセット（連続実行防止）
      shouldAutoPush.set(false)

      // バックグラウンドでは実行しない
      if (document.visibilityState !== 'visible') return

      // GitHub設定がなければスキップ
      if (!$githubConfigured) return

      // Push/Pull中またはアーカイブロード中はスキップ
      if ($isPulling || $isPushing || isArchiveLoading) return

      // 初回Pullが完了していなければスキップ
      if (!isFirstPriorityFetched) return

      console.log('Auto-push triggered')

      // Staleチェックを実行（共通関数で時刻も更新）
      const staleResult = await executeStaleCheck($settings, get(lastKnownCommitSha))

      switch (staleResult.status) {
        case 'stale':
          // リモートに新しい変更あり → 確認ダイアログを表示
          isStale.set(true)
          console.log(
            `Auto-push stale: remote(${staleResult.remoteCommitSha}) !== local(${staleResult.localCommitSha})`
          )
          // ユーザーに確認（手動Pushと同じモーダル）
          const confirmed = await confirmAsync($_('modal.staleEdit'))
          if (!confirmed) {
            // キャンセル → タイマーリセットして終了
            resetAutoPushTimer()
            return
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

      await pushToGitHub()
    })

    // 自動Pull機能（shouldAutoPullストアを購読して実行）
    // stale-checker.tsでstale検出かつローカルがクリーンなときにtrueになる
    const unsubscribeAutoPull = shouldAutoPull.subscribe(async (should) => {
      if (!should) return

      // フラグをリセット（連続実行防止）
      shouldAutoPull.set(false)

      // バックグラウンドでは実行しない
      if (document.visibilityState !== 'visible') return

      // GitHub設定がなければスキップ
      if (!$githubConfigured) return

      // Push/Pull中またはアーカイブロード中はスキップ
      if ($isPulling || $isPushing || isArchiveLoading) return

      // 初回Pullが完了していなければスキップ
      if (!isFirstPriorityFetched) return

      console.log('Auto-pull triggered (stale detected, local is clean)')

      // Pull実行（ダーティチェックなし、すでにstale-checkerで確認済み）
      await pullFromGitHub(false)
    })

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('resize', updateDualPane)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      unsubscribeAutoPush()
      unsubscribeAutoPull()
      cleanupActivityDetection()
      cleanupBeforeUnloadSave()
      stopStaleChecker()
    }
  })

  // ========================================
  // ナビゲーション制御（navigation.ts を使用）
  // ========================================

  // ナビゲーション状態を取得する関数
  function getNavState(): nav.NavigationState {
    return {
      leftView: $leftView,
      leftNote: $leftNote,
      leftLeaf: $leftLeaf,
      rightView: $rightView,
      rightNote: $rightNote,
      rightLeaf: $rightLeaf,
      isDualPane,
      focusedPane: $focusedPane,
      selectedIndexLeft,
      selectedIndexRight,
      showSettings,
      isFirstPriorityFetched,
      leftEditorView,
      rightEditorView,
    }
  }

  // ナビゲーション依存関係を取得する関数
  function getNavDeps(): nav.NavigationDependencies {
    return {
      notes,
      leaves,
      rootNotes,
    }
  }

  // ナビゲーション関数実行後に状態を同期
  function syncNavState(state: nav.NavigationState) {
    $leftView = state.leftView
    $leftNote = state.leftNote
    $leftLeaf = state.leftLeaf
    $rightView = state.rightView
    $rightNote = state.rightNote
    $rightLeaf = state.rightLeaf
    $focusedPane = state.focusedPane
    selectedIndexLeft = state.selectedIndexLeft
    selectedIndexRight = state.selectedIndexRight
  }

  // 公開ナビゲーション関数（navigation.tsのラッパー）
  function goHome(pane: Pane) {
    const state = getNavState()
    nav.goHome(state, getNavDeps(), pane)
    syncNavState(state)
  }

  function openPriorityView(pane: Pane) {
    // 優先段落を集約した仮想リーフを生成（ホーム直下なのでnoteはnull）
    const items = get(priorityItems)
    const priorityLeaf = createPriorityLeaf(items)

    if (pane === 'left') {
      $leftNote = null
      $leftLeaf = priorityLeaf
      $leftView = 'preview' // 読み取り専用なのでプレビューで開く
    } else {
      $rightNote = null
      $rightLeaf = priorityLeaf
      $rightView = 'preview'
    }
  }

  function openOfflineView(pane: Pane) {
    // オフラインリーフを開く（編集可能）
    if (pane === 'left') {
      $leftNote = null
      $leftLeaf = currentOfflineLeaf
      $leftView = 'edit'
    } else {
      $rightNote = null
      $rightLeaf = currentOfflineLeaf
      $rightView = 'edit'
    }
  }

  function updateOfflineBadge(icon: string, color: string) {
    offlineLeafStore.update((s) => ({ ...s, badgeIcon: icon, badgeColor: color }))
    // バッジ変更は即座に保存
    const leaf = createOfflineLeaf($offlineLeafStore.content, icon, color)
    saveOfflineLeaf(leaf)
  }

  function updateOfflineContent(content: string) {
    const now = Date.now()
    offlineLeafStore.update((s) => ({ ...s, content, updatedAt: now }))
    // 共通の自動保存機構を使用（1秒後に保存）
    scheduleOfflineSave()
  }

  function navigateToLeafFromPriority(leafId: string, pane: Pane) {
    const leaf = $leaves.find((l) => l.id === leafId)
    if (!leaf) return

    const note = $notes.find((n) => n.id === leaf.noteId)
    if (!note) return

    if (pane === 'left') {
      $leftNote = note
      $leftLeaf = leaf
      $leftView = 'edit'
    } else {
      $rightNote = note
      $rightLeaf = leaf
      $rightView = 'edit'
    }
  }

  function selectNote(note: Note, pane: Pane) {
    const state = getNavState()
    nav.selectNote(state, getNavDeps(), note, pane)
    syncNavState(state)
  }

  function selectLeaf(leaf: Leaf, pane: Pane) {
    // ペインのワールドに応じたノートからリーフの親ノートを検索
    const paneNotes = getNotesForPane(pane)
    const note = paneNotes.find((n) => n.id === leaf.noteId)
    if (note) {
      if (pane === 'left') {
        $leftNote = note
        $leftLeaf = leaf
        $leftView = 'edit'
      } else {
        $rightNote = note
        $rightLeaf = leaf
        $rightView = 'edit'
      }
    }
  }

  async function handleSearchResultClick(result: SearchMatch) {
    // アーカイブからの検索結果の場合、ワールドを切り替える
    const targetNotes = result.world === 'archive' ? $archiveNotes : $notes
    const targetLeaves = result.world === 'archive' ? $archiveLeaves : $leaves

    // ワールドを適切に設定
    if (result.world === 'archive') {
      $leftWorld = 'archive'
    } else {
      $leftWorld = 'home'
    }

    if (result.matchType === 'note') {
      // ノートマッチ: ノートビューを開く
      const note = targetNotes.find((n) => n.id === result.noteId)
      if (note) {
        selectNote(note, 'left')
      }
    } else {
      // リーフタイトル/本文マッチ: リーフを開いて該当行にジャンプ
      // オフラインリーフは特別処理（targetLeavesに含まれないため）
      if (isOfflineLeaf(result.leafId)) {
        openOfflineView('left')
        // DOM更新を待ってから行ジャンプ
        await tick()
        if (leftEditorView && leftEditorView.scrollToLine) {
          leftEditorView.scrollToLine(result.line)
        }
      } else {
        const leaf = targetLeaves.find((l) => l.id === result.leafId)
        if (leaf) {
          selectLeaf(leaf, 'left')
          // DOM更新を待ってから行ジャンプ
          await tick()
          if (leftEditorView && leftEditorView.scrollToLine) {
            leftEditorView.scrollToLine(result.line)
          }
        }
      }
    }
  }

  async function handlePriorityLinkClick(leafId: string, line: number, pane: Pane) {
    const leaf = $leaves.find((l) => l.id === leafId)
    if (leaf) {
      selectLeaf(leaf, pane)
      // エディタのマウント完了を待つ（tick()だけでは不十分）
      await tick()
      await new Promise((resolve) => setTimeout(resolve, 100))
      const editorView = pane === 'left' ? leftEditorView : rightEditorView
      if (editorView && editorView.scrollToLine) {
        editorView.scrollToLine(line)
      }
    }
  }

  function handleDisabledPushClick(reason: string) {
    // reasonが空でもpushDisabledReasonを使う
    const message = reason || pushDisabledReason
    if (message) {
      showPushToast(message)
    }
  }

  // ========================================
  // ワールド切り替え・アーカイブ/リストア
  // ========================================

  async function handleWorldChange(world: WorldType, pane: Pane = 'left') {
    const currentPaneWorld = pane === 'left' ? $leftWorld : $rightWorld
    if (world === currentPaneWorld) return

    // Pull/Push中またはアーカイブロード中はワールド切り替えを禁止
    if ($isPulling || $isPushing || isArchiveLoading) return

    // 先にワールドを切り替え（ペインごとに独立）
    if (pane === 'left') {
      leftWorld.set(world)
    } else {
      rightWorld.set(world)
    }
    // ホームに戻る
    goHome(pane)
    refreshBreadcrumbs()

    // アーカイブに切り替える場合、未ロード＆ロード中でなければPull（バックグラウンドで実行）
    if (world === 'archive' && !$isArchiveLoaded && !isArchiveLoading) {
      // トークンが設定されている場合のみPullを試行
      if ($settings.token && $settings.repoName) {
        isArchiveLoading = true
        archiveLeafStatsStore.reset()
        try {
          const result = await pullArchive($settings, {
            onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
          })
          if (result.success) {
            archiveNotes.set(result.notes)
            archiveLeaves.set(result.leaves)
            archiveMetadata.set(result.metadata)
            isArchiveLoaded.set(true)
            // アーカイブPull完了時にスナップショットを更新
            setLastPushedSnapshot(get(notes), get(leaves), result.notes, result.leaves)
          } else {
            showPullToast(translateGitHubMessage(result.message, $_, result.rateLimitInfo), 'error')
          }
        } catch (e) {
          console.error('Archive pull failed:', e)
          showPullToast($_('toast.pullFailed'), 'error')
        } finally {
          isArchiveLoading = false
        }
      }
    }
  }

  async function archiveNote(pane: Pane) {
    const note = pane === 'left' ? $leftNote : $rightNote
    if (!note) return

    const position = getDialogPositionForPane(pane)
    const confirmed = await confirmAsync($_('modal.archiveNote') || 'Archive this note?', position)
    if (confirmed) {
      await moveNoteToWorld(note, 'archive', pane)
    }
  }

  async function archiveLeaf(pane: Pane) {
    const leaf = pane === 'left' ? $leftLeaf : $rightLeaf
    if (!leaf) return

    const position = getDialogPositionForPane(pane)
    const confirmed = await confirmAsync($_('modal.archiveLeaf') || 'Archive this leaf?', position)
    if (confirmed) {
      await moveLeafToWorld(leaf, 'archive', pane)
    }
  }

  async function restoreNote(pane: Pane) {
    const note = pane === 'left' ? $leftNote : $rightNote
    if (!note) return

    const position = getDialogPositionForPane(pane)
    const confirmed = await confirmAsync(
      $_('modal.restoreNote') || 'Restore this note to Home?',
      position
    )
    if (confirmed) {
      await moveNoteToWorld(note, 'home', pane)
    }
  }

  async function restoreLeaf(pane: Pane) {
    const leaf = pane === 'left' ? $leftLeaf : $rightLeaf
    if (!leaf) return

    const position = getDialogPositionForPane(pane)
    const confirmed = await confirmAsync(
      $_('modal.restoreLeaf') || 'Restore this leaf to Home?',
      position
    )
    if (confirmed) {
      await moveLeafToWorld(leaf, 'home', pane)
    }
  }

  async function moveNoteToWorld(note: Note, targetWorld: WorldType, pane: Pane) {
    // Pull/Push中またはアーカイブロード中は移動を禁止
    if ($isPulling || $isPushing || isArchiveLoading) return

    // アーカイブへの移動時、アーカイブがロードされていない場合は先にPull
    // Pull後のデータを保持（$archiveNotesはリアクティブ更新が遅れる可能性があるため）
    let freshArchiveNotes: Note[] | null = null
    let freshArchiveLeaves: Leaf[] | null = null

    if (targetWorld === 'archive' && !$isArchiveLoaded) {
      if ($settings.token && $settings.repoName) {
        isArchiveLoading = true
        archiveLeafStatsStore.reset()
        try {
          const result = await pullArchive($settings, {
            onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
          })
          if (result.success) {
            archiveNotes.set(result.notes)
            archiveLeaves.set(result.leaves)
            archiveMetadata.set(result.metadata)
            isArchiveLoaded.set(true)
            // Pull直後のデータを保持（リアクティブ更新を待たずに使用）
            freshArchiveNotes = result.notes
            freshArchiveLeaves = result.leaves
            // アーカイブPull完了時にスナップショットを更新
            setLastPushedSnapshot(get(notes), get(leaves), result.notes, result.leaves)
          } else {
            // Pull失敗時はアーカイブ操作を中止（データ損失防止）
            showPullToast(translateGitHubMessage(result.message, $_, result.rateLimitInfo), 'error')
            return
          }
        } catch (e) {
          console.error('Archive pull failed before move:', e)
          // エラー時はアーカイブ操作を中止
          showPullToast($_('toast.pullFailed'), 'error')
          return
        } finally {
          isArchiveLoading = false
        }
      } else {
        // GitHub設定がない場合は到達しないはず（ガラス効果でブロックされる）
        return
      }
    }

    const sourceWorld = pane === 'left' ? $leftWorld : $rightWorld
    const sourceNotes = sourceWorld === 'home' ? $notes : (freshArchiveNotes ?? $archiveNotes)
    const sourceLeaves = sourceWorld === 'home' ? $leaves : (freshArchiveLeaves ?? $archiveLeaves)

    // ノートを見つける
    const noteToMove = sourceNotes.find((n) => n.id === note.id)
    if (!noteToMove) return

    // ソースノートの親のパス（祖先ノートのリスト）を構築
    const getParentPath = (n: Note): Note[] => {
      const path: Note[] = []
      let current: Note | undefined = n.parentId
        ? sourceNotes.find((sn) => sn.id === n.parentId)
        : undefined
      while (current) {
        path.unshift(current)
        current = current.parentId
          ? sourceNotes.find((sn) => sn.id === current!.parentId)
          : undefined
      }
      return path
    }
    const parentPath = getParentPath(noteToMove)

    // ターゲット側で同じ親構造を見つけるか作成する
    // freshArchiveNotesがある場合はそれを使用（Pull直後のデータ）
    let currentTargetNotes =
      targetWorld === 'home' ? [...$notes] : [...(freshArchiveNotes ?? $archiveNotes)]
    let targetParentId: string | undefined

    for (const pathNote of parentPath) {
      const existing = currentTargetNotes.find(
        (n) => n.name === pathNote.name && n.parentId === targetParentId
      )
      if (existing) {
        targetParentId = existing.id
      } else {
        // 新しい親ノートを作成
        const siblingsAtLevel = currentTargetNotes.filter((n) => n.parentId === targetParentId)
        const maxOrder = Math.max(0, ...siblingsAtLevel.map((n) => n.order))
        const newNote: Note = {
          id: crypto.randomUUID(),
          name: pathNote.name,
          parentId: targetParentId,
          order: maxOrder + 1,
        }
        currentTargetNotes = [...currentTargetNotes, newNote]
        targetParentId = newNote.id
      }
    }

    // 同じ階層で同じ名前のノートがあるかチェック
    const siblingsInTarget = currentTargetNotes.filter((n) => n.parentId === targetParentId)
    const existingNote = siblingsInTarget.find((n) => n.name === noteToMove.name)
    const hasDuplicate = !!existingNote

    let mergeIntoExisting = false
    if (hasDuplicate) {
      // 重複がある場合は確認ダイアログを表示
      const choice = await choiceAsync($_('modal.duplicateChoiceMessage'), [
        { label: $_('common.cancel'), value: 'cancel', variant: 'cancel' },
        { label: $_('modal.duplicateChoiceSkip'), value: 'skip', variant: 'secondary' },
        { label: $_('modal.duplicateChoiceAdd'), value: 'add', variant: 'primary' },
      ])

      if (choice === 'cancel' || choice === null) {
        return
      }
      if (choice === 'skip') {
        return
      }
      // choice === 'add': 既存ノートにマージ
      mergeIntoExisting = true
    }

    // ノートとその子ノート、リーフを収集
    const childNotes = sourceNotes.filter((n) => n.parentId === note.id)
    const notesToMove = [noteToMove, ...childNotes]
    const noteIds = new Set(notesToMove.map((n) => n.id))
    const leavesToMove = sourceLeaves.filter((l) => noteIds.has(l.noteId))

    // ソースから削除
    const newSourceNotes = sourceNotes.filter((n) => !noteIds.has(n.id))
    const newSourceLeaves = sourceLeaves.filter((l) => !noteIds.has(l.noteId))

    // ターゲットに追加
    const targetLeaves = targetWorld === 'home' ? $leaves : (freshArchiveLeaves ?? $archiveLeaves)
    let newTargetNotes: Note[]
    let newTargetLeaves: Leaf[]

    if (mergeIntoExisting && existingNote) {
      // 既存ノートにマージする場合
      // メインノートのリーフは既存ノートに追加（重複はリネーム）
      const existingLeafTitles = targetLeaves
        .filter((l) => l.noteId === existingNote.id)
        .map((l) => l.title)
      const mainNoteLeaves = leavesToMove.filter((l) => l.noteId === noteToMove.id)
      const childNoteLeaves = leavesToMove.filter((l) => l.noteId !== noteToMove.id)

      const updatedExistingLeafTitles = [...existingLeafTitles]
      const mergedMainLeaves = mainNoteLeaves.map((l) => {
        if (updatedExistingLeafTitles.includes(l.title)) {
          const newTitle = generateUniqueName(l.title, updatedExistingLeafTitles)
          updatedExistingLeafTitles.push(newTitle)
          return { ...l, noteId: existingNote.id, title: newTitle }
        }
        updatedExistingLeafTitles.push(l.title)
        return { ...l, noteId: existingNote.id }
      })

      // 子ノートは既存ノートの子として追加（重複はリネーム）
      const existingChildNoteNames = currentTargetNotes
        .filter((n) => n.parentId === existingNote.id)
        .map((n) => n.name)
      const updatedChildNoteNames = [...existingChildNoteNames]
      const reparentedChildNotes = childNotes.map((n) => {
        if (updatedChildNoteNames.includes(n.name)) {
          const newName = generateUniqueName(n.name, updatedChildNoteNames)
          updatedChildNoteNames.push(newName)
          return { ...n, parentId: existingNote.id, name: newName }
        }
        updatedChildNoteNames.push(n.name)
        return { ...n, parentId: existingNote.id }
      })

      // 子ノートのリーフはそのまま（noteIdは変わらない）
      newTargetNotes = [...currentTargetNotes, ...reparentedChildNotes]
      newTargetLeaves = [...targetLeaves, ...mergedMainLeaves, ...childNoteLeaves]
    } else {
      // 通常の移動（重複なし）
      const targetSiblings = currentTargetNotes.filter((n) => n.parentId === targetParentId)
      const maxOrder = Math.max(0, ...targetSiblings.map((n) => n.order))
      const movedNote: Note = { ...noteToMove, parentId: targetParentId, order: maxOrder + 1 }
      // 子ノートはparentIdを維持（移動するノートのIDは変わらないので）
      const movedChildNotes = childNotes.map((n) => ({ ...n }))
      newTargetNotes = [...currentTargetNotes, movedNote, ...movedChildNotes]
      newTargetLeaves = [...targetLeaves, ...leavesToMove]
    }

    // ストアを更新
    if (sourceWorld === 'home') {
      updateNotes(newSourceNotes)
      updateLeaves(newSourceLeaves)
    } else {
      updateArchiveNotes(newSourceNotes)
      updateArchiveLeaves(newSourceLeaves)
    }

    if (targetWorld === 'home') {
      updateNotes(newTargetNotes)
      updateLeaves(newTargetLeaves)
    } else {
      updateArchiveNotes(newTargetNotes)
      updateArchiveLeaves(newTargetLeaves)
    }

    // IndexedDBとdirtyフラグを更新
    await saveNotes(sourceWorld === 'home' ? newSourceNotes : $notes)
    await saveLeaves(sourceWorld === 'home' ? newSourceLeaves : $leaves)
    isStructureDirty.set(true)

    // スケルトンマップから移動したリーフを削除（Homeからアーカイブ時のみ）
    if (sourceWorld === 'home') {
      const leafIdsToRemove = leavesToMove.map((l) => l.id)
      let hasChanges = false
      for (const id of leafIdsToRemove) {
        if (leafSkeletonMap.has(id)) {
          leafSkeletonMap.delete(id)
          hasChanges = true
        }
      }
      if (hasChanges) {
        leafSkeletonMap = new Map(leafSkeletonMap) // リアクティブ更新をトリガー
      }
    }

    // 移動したノートを開いていた両ペインを親ノートに遷移（削除と同じ挙動）
    const checkPane = (paneToCheck: Pane) => {
      const currentNote = paneToCheck === 'left' ? $leftNote : $rightNote
      const currentLeaf = paneToCheck === 'left' ? $leftLeaf : $rightLeaf
      if (
        currentNote?.id === note.id ||
        noteIds.has(currentNote?.id ?? '') ||
        (currentLeaf && noteIds.has(currentLeaf.noteId))
      ) {
        const parentNote = note.parentId ? newSourceNotes.find((n) => n.id === note.parentId) : null
        if (parentNote) {
          selectNote(parentNote, paneToCheck)
        } else {
          goHome(paneToCheck)
        }
      }
    }
    checkPane('left')
    checkPane('right')
    refreshBreadcrumbs()
    rebuildLeafStats($leaves, $notes)

    // トースト表示
    const toastKey = targetWorld === 'archive' ? 'toast.archived' : 'toast.restored'
    showPushToast($_(toastKey), 'success')
  }

  async function moveLeafToWorld(leaf: Leaf, targetWorld: WorldType, pane: Pane) {
    // Pull/Push中またはアーカイブロード中は移動を禁止
    if ($isPulling || $isPushing || isArchiveLoading) return

    // アーカイブへの移動時、アーカイブがロードされていない場合は先にPull
    // Pull後のデータを保持（$archiveNotesはリアクティブ更新が遅れる可能性があるため）
    let freshArchiveNotes: Note[] | null = null
    let freshArchiveLeaves: Leaf[] | null = null

    if (targetWorld === 'archive' && !$isArchiveLoaded) {
      if ($settings.token && $settings.repoName) {
        isArchiveLoading = true
        archiveLeafStatsStore.reset()
        try {
          const result = await pullArchive($settings, {
            onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
          })
          if (result.success) {
            archiveNotes.set(result.notes)
            archiveLeaves.set(result.leaves)
            archiveMetadata.set(result.metadata)
            isArchiveLoaded.set(true)
            // Pull直後のデータを保持（リアクティブ更新を待たずに使用）
            freshArchiveNotes = result.notes
            freshArchiveLeaves = result.leaves
            // アーカイブPull完了時にスナップショットを更新
            setLastPushedSnapshot(get(notes), get(leaves), result.notes, result.leaves)
          } else {
            // Pull失敗時はアーカイブ操作を中止（データ損失防止）
            showPullToast(translateGitHubMessage(result.message, $_, result.rateLimitInfo), 'error')
            return
          }
        } catch (e) {
          console.error('Archive pull failed before move:', e)
          // エラー時はアーカイブ操作を中止
          showPullToast($_('toast.pullFailed'), 'error')
          return
        } finally {
          isArchiveLoading = false
        }
      } else {
        // GitHub設定がない場合は到達しないはず（ガラス効果でブロックされる）
        return
      }
    }

    const sourceWorld = pane === 'left' ? $leftWorld : $rightWorld
    const sourceNotes = sourceWorld === 'home' ? $notes : (freshArchiveNotes ?? $archiveNotes)
    const sourceLeaves = sourceWorld === 'home' ? $leaves : (freshArchiveLeaves ?? $archiveLeaves)
    const targetNotes = targetWorld === 'home' ? $notes : (freshArchiveNotes ?? $archiveNotes)
    const targetLeaves = targetWorld === 'home' ? $leaves : (freshArchiveLeaves ?? $archiveLeaves)

    // リーフの親ノートを見つける
    const sourceNote = sourceNotes.find((n) => n.id === leaf.noteId)
    if (!sourceNote) return

    // ソースノートのパス（祖先ノートのリスト）を構築
    const getNotePath = (note: Note): Note[] => {
      const path: Note[] = []
      let current: Note | undefined = note
      while (current) {
        path.unshift(current)
        current = current.parentId ? sourceNotes.find((n) => n.id === current!.parentId) : undefined
      }
      return path
    }
    const sourceNotePath = getNotePath(sourceNote)

    // ターゲット側で同じパス構造を見つけるか作成する
    // freshArchiveNotesがある場合はそれを使用（Pull直後のデータ）
    let currentTargetNotes =
      targetWorld === 'home' ? [...$notes] : [...(freshArchiveNotes ?? $archiveNotes)]
    let targetNote: Note | undefined
    let parentId: string | undefined

    for (const pathNote of sourceNotePath) {
      // 同じ階層で同じ名前のノートを探す
      const existing = currentTargetNotes.find(
        (n) => n.name === pathNote.name && n.parentId === parentId
      )
      if (existing) {
        targetNote = existing
        parentId = existing.id
      } else {
        // 新しいノートを作成
        const siblingsAtLevel = currentTargetNotes.filter((n) => n.parentId === parentId)
        const maxOrder = Math.max(0, ...siblingsAtLevel.map((n) => n.order))
        const newNote: Note = {
          id: crypto.randomUUID(),
          name: pathNote.name,
          parentId,
          order: maxOrder + 1,
        }
        currentTargetNotes = [...currentTargetNotes, newNote]
        targetNote = newNote
        parentId = newNote.id

        // ストアを更新
        if (targetWorld === 'home') {
          updateNotes(currentTargetNotes)
        } else {
          updateArchiveNotes(currentTargetNotes)
        }
      }
    }

    if (!targetNote) return

    // 同じ名前のリーフがあるかチェック
    const targetLeavesInNote = targetLeaves.filter((l) => l.noteId === targetNote!.id)
    const existingTitles = targetLeavesInNote.map((l) => l.title)
    const hasDuplicate = existingTitles.includes(leaf.title)

    let finalTitle = leaf.title
    if (hasDuplicate) {
      // 重複がある場合は確認ダイアログを表示
      const choice = await choiceAsync($_('modal.duplicateChoiceMessage'), [
        { label: $_('common.cancel'), value: 'cancel', variant: 'cancel' },
        { label: $_('modal.duplicateChoiceSkip'), value: 'skip', variant: 'secondary' },
        { label: $_('modal.duplicateChoiceAdd'), value: 'add', variant: 'primary' },
      ])

      if (choice === 'cancel' || choice === null) {
        return
      }
      if (choice === 'skip') {
        return
      }
      // choice === 'add': リネームして追加
      finalTitle = generateUniqueName(leaf.title, existingTitles)
    }

    // ソースから削除
    const newSourceLeaves = sourceLeaves.filter((l) => l.id !== leaf.id)

    // ターゲットに追加
    const maxOrder = Math.max(0, ...targetLeavesInNote.map((l) => l.order))
    const movedLeaf: Leaf = {
      ...leaf,
      title: finalTitle,
      noteId: targetNote.id,
      order: maxOrder + 1,
    }
    const newTargetLeaves = [...targetLeaves.filter((l) => l.id !== leaf.id), movedLeaf]

    // ストアを更新
    if (sourceWorld === 'home') {
      updateLeaves(newSourceLeaves)
    } else {
      updateArchiveLeaves(newSourceLeaves)
    }

    if (targetWorld === 'home') {
      updateLeaves(newTargetLeaves)
    } else {
      updateArchiveLeaves(newTargetLeaves)
    }

    // IndexedDBに保存
    await saveLeaves(sourceWorld === 'home' ? newSourceLeaves : $leaves)

    // スケルトンマップから移動したリーフを削除（Homeからアーカイブ時のみ）
    if (sourceWorld === 'home' && leafSkeletonMap.has(leaf.id)) {
      leafSkeletonMap.delete(leaf.id)
      leafSkeletonMap = new Map(leafSkeletonMap) // リアクティブ更新をトリガー
    }

    // 移動したリーフを開いていた両ペインを親ノートに遷移（削除と同じ挙動）
    const checkPane = (paneToCheck: Pane) => {
      const currentLeaf = paneToCheck === 'left' ? $leftLeaf : $rightLeaf
      if (currentLeaf?.id === leaf.id) {
        selectNote(sourceNote, paneToCheck)
      }
    }
    checkPane('left')
    checkPane('right')
    refreshBreadcrumbs()
    rebuildLeafStats($leaves, $notes)

    // トースト表示
    const toastKey = targetWorld === 'archive' ? 'toast.archived' : 'toast.restored'
    showPushToast($_(toastKey), 'success')
  }

  function closeLeaf(pane: Pane) {
    const leaf = pane === 'left' ? $leftLeaf : $rightLeaf
    if (!leaf) return

    // ペインのワールドに応じたノートを取得
    const paneNotes = getNotesForPane(pane)
    const parentNote = paneNotes.find((n) => n.id === leaf.noteId)

    if (parentNote) {
      // リーフから親ノートに戻る
      if (pane === 'left') {
        $leftNote = parentNote
        $leftLeaf = leaf
        $leftView = 'note'
      } else {
        $rightNote = parentNote
        $rightLeaf = leaf
        $rightView = 'note'
      }
    }
  }

  function switchPane(pane: Pane) {
    const state = getNavState()
    nav.switchPane(state, getNavDeps(), pane)
    syncNavState(state)
  }

  function togglePreview(pane: Pane) {
    // プライオリティリーフは編集不可（プレビュー専用）
    const leaf = pane === 'left' ? $leftLeaf : $rightLeaf
    if (leaf && isPriorityLeaf(leaf.id)) return

    const state = getNavState()
    nav.togglePreview(state, getNavDeps(), pane)
    syncNavState(state)
    updateUrlFromState()
  }

  // スワイプナビゲーション（ペインのワールドに対応）
  function goToNextSibling(pane: Pane): boolean {
    const view = pane === 'left' ? $leftView : $rightView
    const currentNote = pane === 'left' ? $leftNote : $rightNote

    // ノートビューでのみ有効
    if (view !== 'note' || !currentNote) return false

    // ペインのワールドに応じたノートを取得
    const paneNotes = getNotesForPane(pane)

    // 同じ親を持つノート（兄弟ノート）を取得
    const siblings = paneNotes
      .filter((n) => n.parentId === currentNote.parentId)
      .sort((a, b) => a.order - b.order)

    const currentIndex = siblings.findIndex((n) => n.id === currentNote.id)
    if (currentIndex === -1 || currentIndex >= siblings.length - 1) return false

    // 次のノートに移動
    const nextNote = siblings[currentIndex + 1]
    selectNote(nextNote, pane)
    return true
  }

  function goToPrevSibling(pane: Pane): boolean {
    const view = pane === 'left' ? $leftView : $rightView
    const currentNote = pane === 'left' ? $leftNote : $rightNote

    // ノートビューでのみ有効
    if (view !== 'note' || !currentNote) return false

    // ペインのワールドに応じたノートを取得
    const paneNotes = getNotesForPane(pane)

    // 同じ親を持つノート（兄弟ノート）を取得
    const siblings = paneNotes
      .filter((n) => n.parentId === currentNote.parentId)
      .sort((a, b) => a.order - b.order)

    const currentIndex = siblings.findIndex((n) => n.id === currentNote.id)
    if (currentIndex <= 0) return false

    // 前のノートに移動
    const prevNote = siblings[currentIndex - 1]
    selectNote(prevNote, pane)
    return true
  }

  // パンくずリストからの兄弟選択
  function selectSiblingFromBreadcrumb(id: string, type: 'note' | 'leaf', pane: Pane) {
    // ペインのワールドに応じたノート・リーフを取得
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

  function swapPanes() {
    // 左右ペインの状態を入れ替える
    const tempNote = $leftNote
    const tempLeaf = $leftLeaf
    const tempView = $leftView

    $leftNote = $rightNote
    $leftLeaf = $rightLeaf
    $leftView = $rightView

    $rightNote = tempNote
    $rightLeaf = tempLeaf
    $rightView = tempView

    // 選択インデックスも入れ替え
    const tempIndex = selectedIndexLeft
    selectedIndexLeft = selectedIndexRight
    selectedIndexRight = tempIndex
  }

  function copyLeftToRight() {
    // 左ペインの状態を右ペインにコピー
    $rightNote = $leftNote
    $rightLeaf = $leftLeaf
    $rightView = $leftView
    selectedIndexRight = selectedIndexLeft
  }

  function copyRightToLeft() {
    // 右ペインの状態を左ペインにコピー
    $leftNote = $rightNote
    $leftLeaf = $rightLeaf
    $leftView = $rightView
    selectedIndexLeft = selectedIndexRight
  }

  // キーボードナビゲーション用ヘルパー（ペインのワールドに対応）
  function getCurrentItemsForPane(pane: Pane): (Note | Leaf)[] {
    const view = pane === 'left' ? $leftView : $rightView
    const note = pane === 'left' ? $leftNote : $rightNote
    const paneNotes = getNotesForPane(pane)
    const paneLeaves = getLeavesForPane(pane)

    if (view === 'home') {
      // ルートノートを返す
      return paneNotes.filter((n) => !n.parentId).sort((a, b) => a.order - b.order)
    } else if (view === 'note' && note) {
      // サブノートとリーフを結合
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

  function navigateGridForPane(direction: 'up' | 'down' | 'left' | 'right') {
    const pane = $focusedPane
    const items = getCurrentItemsForPane(pane)
    const currentIndex = pane === 'left' ? selectedIndexLeft : selectedIndexRight

    if (items.length === 0) return

    const gridColumns = nav.calculateGridColumns()
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
      selectedIndexLeft = newIndex
    } else {
      selectedIndexRight = newIndex
    }
  }

  function openSelectedItemForPane() {
    const pane = $focusedPane
    const items = getCurrentItemsForPane(pane)
    const index = pane === 'left' ? selectedIndexLeft : selectedIndexRight

    if (index < 0 || index >= items.length) return

    const item = items[index]
    if ('noteId' in item) {
      selectLeaf(item as Leaf, pane)
    } else {
      selectNote(item as Note, pane)
    }
  }

  function goBackToParentForPane() {
    const pane = $focusedPane
    const view = pane === 'left' ? $leftView : $rightView
    const note = pane === 'left' ? $leftNote : $rightNote

    if (view === 'note' && note) {
      const paneNotes = getNotesForPane(pane)
      const parentNote = paneNotes.find((n) => n.id === note.parentId)

      if (parentNote) {
        // 親ノートに移動
        selectNote(parentNote, pane)

        // 元のノートを選択状態にする
        const items = getCurrentItemsForPane(pane)
        const targetIndex = items.findIndex((item) => 'name' in item && item.id === note.id)
        if (targetIndex !== -1) {
          if (pane === 'left') {
            selectedIndexLeft = targetIndex
          } else {
            selectedIndexRight = targetIndex
          }
        }
      } else {
        goHome(pane)
      }
    }
  }

  // キーボードナビゲーション
  function handleGlobalKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      pushToGitHub()
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

  function goSettings() {
    showSettings = true
  }

  async function closeSettings() {
    showSettings = false
    await handleCloseSettings()
  }

  function closeWelcome() {
    showWelcome = false
  }

  function openSettingsFromWelcome() {
    showWelcome = false
    showSettings = true
  }

  // PWAインストールプロンプト
  async function handleInstall() {
    if (!deferredPrompt) return // プロンプトを表示
    ;(deferredPrompt as any).prompt()
    // ユーザーの選択を待つ
    const { outcome } = await (deferredPrompt as any).userChoice
    if (outcome === 'accepted') {
      console.log('PWA installed')
    }
    // 一度使ったらプロンプトは再利用できない
    deferredPrompt = null
    showInstallBanner = false
  }

  function dismissInstallBanner() {
    showInstallBanner = false
    deferredPrompt = null
    // 却下を記録（7日間のcooldown）
    setPwaInstallDismissedAt(Date.now())
  }

  // パンくずリスト（左右共通）- breadcrumbs.tsに移動

  function startEditingBreadcrumb(crumb: Breadcrumb) {
    if (crumb.type === 'home' || crumb.type === 'settings') return
    editingBreadcrumb = crumb.id
  }

  function refreshBreadcrumbs() {
    // ワールドに応じたデータを使用
    const leftNotes = _getNotesForWorld($leftWorld, $notes, $archiveNotes)
    const leftLeaves = _getLeavesForWorld($leftWorld, $leaves, $archiveLeaves)
    const rightNotes = _getNotesForWorld($rightWorld, $notes, $archiveNotes)
    const rightLeaves = _getLeavesForWorld($rightWorld, $leaves, $archiveLeaves)

    breadcrumbs = buildBreadcrumbs(
      $leftView,
      $leftNote,
      $leftLeaf,
      leftNotes,
      'left',
      goHome,
      selectNote,
      leftLeaves
    )
    breadcrumbsRight = buildBreadcrumbs(
      $rightView,
      $rightNote,
      $rightLeaf,
      rightNotes,
      'right',
      goHome,
      selectNote,
      rightLeaves
    )
  }

  async function saveEditBreadcrumb(id: string, newName: string, type: Breadcrumb['type']) {
    const trimmed = newName.trim()
    if (!trimmed) return

    // 右ペインのパンくずリストかどうかを判定
    const isRight = id.endsWith('-right')
    const actualId = isRight ? id.replace('-right', '') : id
    // ペインのワールドに応じたノート・リーフを取得
    const pane: Pane = isRight ? 'right' : 'left'
    const world = getWorldForPane(pane)
    const paneNotes = getNotesForWorld(world)
    const paneLeaves = getLeavesForWorld(world)

    if (type === 'note') {
      const targetNote = paneNotes.find((f) => f.id === actualId)
      const siblingWithSameName = paneNotes.find(
        (n) =>
          n.id !== actualId &&
          (n.parentId || null) === (targetNote?.parentId || null) &&
          n.name.trim() === trimmed
      )
      if (siblingWithSameName) {
        await alertAsync($_('modal.duplicateNoteSameLevel'))
        return
      }
      if (targetNote && targetNote.name === trimmed) {
        refreshBreadcrumbs()
        editingBreadcrumb = null
        return
      }

      // ノート名を更新
      const updatedNotes = paneNotes.map((n) => (n.id === actualId ? { ...n, name: trimmed } : n))
      setNotesForWorld(world, updatedNotes)

      const updatedNote = updatedNotes.find((f) => f.id === actualId)
      if (updatedNote) {
        if ($leftNote?.id === actualId) {
          $leftNote = updatedNote
        }
        if (isRight && $rightNote?.id === actualId) {
          $rightNote = updatedNote
        }
      }
      if (!paneNotes.some((f) => f.id === $leftNote?.id)) {
        $leftNote = null
      }
      if (isRight && !paneNotes.some((f) => f.id === $rightNote?.id)) {
        $rightNote = null
      }
    } else if (type === 'leaf') {
      const targetLeaf = paneLeaves.find((n) => n.id === actualId)
      const siblingLeafWithSameName = paneLeaves.find(
        (l) => l.id !== actualId && l.noteId === targetLeaf?.noteId && l.title.trim() === trimmed
      )
      if (siblingLeafWithSameName) {
        await alertAsync($_('modal.duplicateLeafSameNote'))
        return
      }

      if (targetLeaf && targetLeaf.title === trimmed) {
        refreshBreadcrumbs()
        editingBreadcrumb = null
        return
      }

      // リーフのコンテンツの1行目が # 見出しの場合、見出しテキストも更新
      let updatedContent = targetLeaf?.content || ''
      if (targetLeaf && extractH1Title(targetLeaf.content)) {
        updatedContent = updateH1Title(targetLeaf.content, trimmed)
      }

      const updatedLeaves = paneLeaves.map((n) =>
        n.id === actualId
          ? { ...n, title: trimmed, content: updatedContent, updatedAt: Date.now() }
          : n
      )
      setLeavesForWorld(world, updatedLeaves)

      if (targetLeaf) {
        leafStatsStore.updateLeafContent(actualId, updatedContent, targetLeaf.content)
      }

      const updatedLeaf = updatedLeaves.find((n) => n.id === actualId)
      if (updatedLeaf) {
        if ($leftLeaf?.id === actualId) {
          $leftLeaf = updatedLeaf
        }
        if (isRight && $rightLeaf?.id === actualId) {
          $rightLeaf = updatedLeaf
        }
      }
      if (!paneLeaves.some((n) => n.id === $leftLeaf?.id)) {
        $leftLeaf = null
      }
      if (isRight && !paneLeaves.some((n) => n.id === $rightLeaf?.id)) {
        $rightLeaf = null
      }
    }

    refreshBreadcrumbs()
    editingBreadcrumb = null
  }

  function cancelEditBreadcrumb() {
    editingBreadcrumb = null
  }

  // ノート管理（notes.tsに委譲）
  function createNote(parentId: string | undefined, pane: Pane, name?: string) {
    if (!name) {
      // 名前が指定されていない場合はモーダルで入力を求める
      const position = getDialogPositionForPane(pane)
      showPrompt(
        $_('footer.newNote'),
        (inputName) => {
          const newNote = createNoteLib({
            parentId,
            pane,
            isOperationsLocked: !isFirstPriorityFetched,
            translate: $_,
            name: inputName,
          })
          if (newNote) {
            showPushToast($_('toast.noteCreated'), 'success')
          }
        },
        '',
        position
      )
    } else {
      const newNote = createNoteLib({
        parentId,
        pane,
        isOperationsLocked: !isFirstPriorityFetched,
        translate: $_,
        name,
      })
      if (newNote) {
        showPushToast($_('toast.noteCreated'), 'success')
      }
    }
  }

  function deleteNote(pane: Pane) {
    const targetNote = pane === 'left' ? $leftNote : $rightNote
    if (!targetNote) return

    const paneWorld = getWorldForPane(pane)
    // アーカイブ内の場合は専用処理
    if (paneWorld === 'archive') {
      const allNotes = $archiveNotes
      const allLeaves = $archiveLeaves

      const position = getDialogPositionForPane(pane)
      const confirmMessage = targetNote.parentId
        ? $_('modal.deleteSubNote')
        : $_('modal.deleteRootNote')

      showConfirm(
        confirmMessage,
        () => {
          // 子孫ノートを収集
          const descendantIds = new Set<string>()
          const collectDescendants = (id: string) => {
            descendantIds.add(id)
            allNotes.filter((n) => n.parentId === id).forEach((n) => collectDescendants(n.id))
          }
          collectDescendants(targetNote.id)

          const remainingNotes = allNotes.filter((n) => !descendantIds.has(n.id))
          const remainingLeaves = allLeaves.filter((l) => !descendantIds.has(l.noteId))

          updateArchiveNotes(remainingNotes)
          updateArchiveLeaves(remainingLeaves)

          // ナビゲーション処理
          const parentNote = targetNote.parentId
            ? remainingNotes.find((n) => n.id === targetNote.parentId)
            : null

          const checkPane = (paneToCheck: Pane) => {
            const currentNote = paneToCheck === 'left' ? $leftNote : $rightNote
            const currentLeaf = paneToCheck === 'left' ? $leftLeaf : $rightLeaf
            if (
              currentNote?.id === targetNote.id ||
              descendantIds.has(currentNote?.id ?? '') ||
              (currentLeaf && descendantIds.has(currentLeaf.noteId))
            ) {
              if (parentNote) selectNote(parentNote, paneToCheck)
              else goHome(paneToCheck)
            }
          }
          checkPane('left')
          checkPane('right')

          showPushToast($_('toast.deleted'), 'success')
        },
        position
      )
      return
    }

    // Home内の場合は既存処理
    deleteNoteLib({
      targetNote,
      pane,
      isOperationsLocked: !isFirstPriorityFetched,
      translate: $_,
      onNavigate: (p, parentNote) => {
        // 両ペインのナビゲーション処理
        const checkPane = (paneToCheck: Pane) => {
          const currentNote = paneToCheck === 'left' ? $leftNote : $rightNote
          const currentLeaf = paneToCheck === 'left' ? $leftLeaf : $rightLeaf
          if (
            currentNote?.id === targetNote.id ||
            (currentLeaf && currentLeaf.noteId === targetNote.id)
          ) {
            if (parentNote) {
              selectNote(parentNote, paneToCheck)
            } else {
              goHome(paneToCheck)
            }
          }
        }
        checkPane('left')
        checkPane('right')
      },
      rebuildLeafStats,
    })
  }

  // ノートバッジ更新
  function updateNoteBadge(noteId: string, badgeIcon: string, badgeColor: string, pane: Pane) {
    const paneWorld = getWorldForPane(pane)
    // アーカイブ内の場合は専用処理
    if (paneWorld === 'archive') {
      const allNotes = $archiveNotes
      const current = allNotes.find((n) => n.id === noteId)
      if (!current) return

      const nextIcon = normalizeBadgeValue(badgeIcon)
      const nextColor = normalizeBadgeValue(badgeColor)

      if (
        normalizeBadgeValue(current.badgeIcon) === nextIcon &&
        normalizeBadgeValue(current.badgeColor) === nextColor
      ) {
        return
      }

      const updated = allNotes.map((n) =>
        n.id === noteId ? { ...n, badgeIcon: nextIcon, badgeColor: nextColor } : n
      )
      updateArchiveNotes(updated)
      return
    }

    // Home内の場合は既存処理
    updateNoteBadgeLib(noteId, badgeIcon, badgeColor)
  }

  // ドラッグ&ドロップ（ノート）
  function handleDragStartNote(note: Note) {
    dragStore.startDragNote(note)
  }

  function handleDragEndNote() {
    dragStore.endDragNote()
  }

  function handleDragOverNote(e: DragEvent, note: Note) {
    if (!draggedNote || draggedNote.id === note.id) return
    if (draggedNote.parentId !== note.parentId) return
    e.preventDefault()
    dragStore.setDragOverNote(note.id)
  }

  function handleDropNote(targetNote: Note) {
    dragStore.setDragOverNote(null)
    if (!draggedNote || draggedNote.id === targetNote.id) return
    if (draggedNote.parentId !== targetNote.parentId) return

    // ドラッグ元のノートからワールドを判定
    const world = getWorldForNote(draggedNote)
    const worldNotes = getNotesForWorld(world)
    const updatedNotes = reorderItems(draggedNote, targetNote, worldNotes, (n) =>
      draggedNote!.parentId ? n.parentId === draggedNote!.parentId : !n.parentId
    )
    setNotesForWorld(world, updatedNotes)
    dragStore.endDragNote()
  }

  // リーフ管理（leaves.tsに委譲）
  function createLeaf(pane: Pane, title?: string) {
    const targetNote = pane === 'left' ? $leftNote : $rightNote
    if (!targetNote) return

    if (!title) {
      // タイトルが指定されていない場合はモーダルで入力を求める
      const position = getDialogPositionForPane(pane)
      showPrompt(
        $_('footer.newLeaf'),
        (inputTitle) => {
          const newLeaf = createLeafLib({
            targetNote,
            pane,
            isOperationsLocked: !isFirstPriorityFetched,
            translate: $_,
            title: inputTitle,
          })
          if (newLeaf) {
            leafStatsStore.addLeaf(newLeaf.id, newLeaf.content)
            selectLeaf(newLeaf, pane)
            showPushToast($_('toast.leafCreated'), 'success')
          }
        },
        '',
        position
      )
    } else {
      const newLeaf = createLeafLib({
        targetNote,
        pane,
        isOperationsLocked: !isFirstPriorityFetched,
        translate: $_,
        title,
      })
      if (newLeaf) {
        leafStatsStore.addLeaf(newLeaf.id, newLeaf.content)
        selectLeaf(newLeaf, pane)
        showPushToast($_('toast.leafCreated'), 'success')
      }
    }
  }

  function deleteLeaf(leafId: string, pane: Pane) {
    const otherLeaf = pane === 'left' ? $rightLeaf : $leftLeaf

    const paneWorld = getWorldForPane(pane)
    // アーカイブ内の場合は専用処理
    if (paneWorld === 'archive') {
      const allLeaves = $archiveLeaves
      const allNotes = $archiveNotes
      const targetLeaf = allLeaves.find((l) => l.id === leafId)
      if (!targetLeaf) return

      const position = getDialogPositionForPane(pane)
      showConfirm(
        $_('modal.deleteLeaf'),
        () => {
          updateArchiveLeaves(allLeaves.filter((l) => l.id !== leafId))

          const note = allNotes.find((n) => n.id === targetLeaf.noteId)
          if (note) selectNote(note, pane)
          else goHome(pane)

          if (otherLeaf?.id === leafId) {
            const otherPane = pane === 'left' ? 'right' : 'left'
            if (note) selectNote(note, otherPane)
            else goHome(otherPane)
          }

          showPushToast($_('toast.deleted'), 'success')
        },
        position
      )
      return
    }

    // Home内の場合は既存処理
    deleteLeafLib({
      leafId,
      pane,
      isOperationsLocked: !isFirstPriorityFetched,
      translate: $_,
      onNavigate: (p, note) => {
        if (note) selectNote(note, p)
        else goHome(p)
      },
      otherPaneLeafId: otherLeaf?.id,
      onUpdateStats: (id, content) => {
        leafStatsStore.removeLeaf(id, content)
      },
    })
    // スケルトンマップからも削除（削除したリーフがスケルトンとして再表示されるのを防ぐ）
    if (leafSkeletonMap.has(leafId)) {
      leafSkeletonMap.delete(leafId)
      leafSkeletonMap = new Map(leafSkeletonMap) // リアクティブ更新をトリガー
    }
  }

  async function updateLeafContent(content: string, leafId: string, pane: Pane) {
    // オフラインリーフは専用の自動保存処理
    if (isOfflineLeaf(leafId)) {
      updateOfflineContent(content)
      // 左右ペインのリーフはcurrentOfflineLeafから自動更新されるので不要
      return
    }

    const paneWorld = getWorldForPane(pane)
    // アーカイブ内の場合は専用処理
    if (paneWorld === 'archive') {
      const allLeaves = $archiveLeaves
      const targetLeaf = allLeaves.find((l) => l.id === leafId)
      if (!targetLeaf) return

      // コンテンツの1行目が # 見出しの場合、リーフのタイトルも自動更新
      const h1Title = extractH1Title(content)
      let newTitle = h1Title || targetLeaf.title
      let titleChanged = false

      if (h1Title) {
        const trimmed = h1Title.trim()
        const hasDuplicate = allLeaves.some(
          (l) => l.id !== leafId && l.noteId === targetLeaf.noteId && l.title.trim() === trimmed
        )
        if (hasDuplicate) {
          await alertAsync($_('modal.duplicateLeafHeading'))
          newTitle = targetLeaf.title
        } else {
          titleChanged = true
        }
      }

      const updatedLeaf: Leaf = {
        ...targetLeaf,
        title: newTitle,
        content,
        updatedAt: Date.now(),
      }
      updateArchiveLeaves(allLeaves.map((l) => (l.id === leafId ? updatedLeaf : l)))

      if ($leftLeaf?.id === leafId) $leftLeaf = updatedLeaf
      if ($rightLeaf?.id === leafId) $rightLeaf = updatedLeaf
      if (titleChanged) refreshBreadcrumbs()
      return
    }

    // Home内の場合は既存処理
    const result = updateLeafContentLib({
      content,
      leafId,
      isOperationsLocked: !isFirstPriorityFetched,
      translate: $_,
      onStatsUpdate: (id, prevContent, newContent) => {
        leafStatsStore.updateLeafContent(id, newContent, prevContent)
      },
    })
    if (result.updatedLeaf) {
      if ($leftLeaf?.id === leafId) $leftLeaf = result.updatedLeaf
      if ($rightLeaf?.id === leafId) $rightLeaf = result.updatedLeaf
      if (result.titleChanged) refreshBreadcrumbs()
    }
  }

  function updateLeafBadge(leafId: string, badgeIcon: string, badgeColor: string, pane: Pane) {
    const paneWorld = getWorldForPane(pane)
    // アーカイブ内の場合は専用処理
    if (paneWorld === 'archive') {
      const allLeaves = $archiveLeaves
      const targetLeaf = allLeaves.find((l) => l.id === leafId)
      if (!targetLeaf) return

      const updatedLeaf: Leaf = {
        ...targetLeaf,
        badgeIcon: normalizeBadgeValue(badgeIcon),
        badgeColor: normalizeBadgeValue(badgeColor),
        updatedAt: Date.now(),
      }
      updateArchiveLeaves(allLeaves.map((l) => (l.id === leafId ? updatedLeaf : l)))

      if ($leftLeaf?.id === leafId) $leftLeaf = updatedLeaf
      if ($rightLeaf?.id === leafId) $rightLeaf = updatedLeaf
      return
    }

    // Home内の場合は既存処理
    const updated = updateLeafBadgeLib(leafId, badgeIcon, badgeColor)
    if (updated) {
      if ($leftLeaf?.id === leafId) $leftLeaf = updated
      if ($rightLeaf?.id === leafId) $rightLeaf = updated
    }
  }

  // Priorityリーフのバッジ更新（metadataに直接保存）
  function updatePriorityBadge(badgeIcon: string, badgeColor: string) {
    metadata.update((m) => {
      const newLeaves = { ...m.leaves }
      if (badgeIcon || badgeColor) {
        newLeaves[PRIORITY_LEAF_ID] = {
          id: PRIORITY_LEAF_ID,
          updatedAt: Date.now(),
          order: 0,
          badgeIcon: badgeIcon || undefined,
          badgeColor: badgeColor || undefined,
        }
      } else {
        // バッジをクリアした場合はエントリを削除
        delete newLeaves[PRIORITY_LEAF_ID]
      }
      return { ...m, leaves: newLeaves }
    })
    // 構造変更フラグを立てて保存が必要な状態にする
    isStructureDirty.set(true)
  }

  // ドラッグ&ドロップ（リーフ）
  function handleDragStartLeaf(leaf: Leaf) {
    dragStore.startDragLeaf(leaf)
  }

  function handleDragEndLeaf() {
    dragStore.endDragLeaf()
  }

  function handleDragOverLeaf(e: DragEvent, leaf: Leaf) {
    if (!draggedLeaf || draggedLeaf.id === leaf.id) return
    if (draggedLeaf.noteId !== leaf.noteId) return
    e.preventDefault()
    dragStore.setDragOverLeaf(leaf.id)
  }

  function handleDropLeaf(targetLeaf: Leaf) {
    dragStore.setDragOverLeaf(null)
    if (!draggedLeaf || draggedLeaf.id === targetLeaf.id) return
    if (draggedLeaf.noteId !== targetLeaf.noteId) return

    // ドラッグ元のリーフからワールドを判定
    const world = getWorldForLeaf(draggedLeaf)
    const worldLeaves = getLeavesForWorld(world)
    const updatedLeaves = reorderItems(
      draggedLeaf,
      targetLeaf,
      worldLeaves,
      (l) => l.noteId === draggedLeaf!.noteId
    )
    setLeavesForWorld(world, updatedLeaves)
    dragStore.endDragLeaf()
  }

  // 移動モーダル
  function openMoveModalForLeaf(pane: Pane) {
    if (!isFirstPriorityFetched) return
    const leaf = pane === 'left' ? $leftLeaf : $rightLeaf
    if (!leaf) return
    moveModalStore.openForLeaf(leaf, pane)
  }

  function openMoveModalForNote(pane: Pane) {
    if (!isFirstPriorityFetched) return
    const note = pane === 'left' ? $leftNote : $rightNote
    if (!note) return
    moveModalStore.openForNote(note, pane)
  }

  function closeMoveModal() {
    moveModalStore.close()
  }

  function handleMoveConfirm(destNoteId: string | null) {
    const state = moveModalStore.getState()
    if (state.targetLeaf) {
      moveLeafTo(destNoteId, state.targetLeaf, state.targetPane)
    } else if (state.targetNote) {
      moveNoteTo(destNoteId, state.targetNote, state.targetPane)
    }
  }

  async function moveLeafTo(destNoteId: string | null, targetLeaf: Leaf, pane: Pane) {
    const paneWorld = getWorldForPane(pane)
    // アーカイブ内の場合は専用処理
    if (paneWorld === 'archive') {
      if (!destNoteId || targetLeaf.noteId === destNoteId) {
        closeMoveModal()
        return
      }

      const allLeaves = $archiveLeaves
      const allNotes = $archiveNotes
      const destinationNote = allNotes.find((n) => n.id === destNoteId)
      if (!destinationNote) {
        closeMoveModal()
        return
      }

      const hasDuplicate = allLeaves.some(
        (l) => l.noteId === destNoteId && l.title.trim() === targetLeaf.title.trim()
      )
      if (hasDuplicate) {
        await alertAsync($_('modal.duplicateLeafDestination'))
        closeMoveModal()
        return
      }

      const remaining = allLeaves.filter((l) => l.id !== targetLeaf.id)
      const movedLeaf: Leaf = {
        ...targetLeaf,
        noteId: destNoteId,
        order: remaining.filter((l) => l.noteId === destNoteId).length,
        updatedAt: Date.now(),
      }
      updateArchiveLeaves([...remaining, movedLeaf])

      if ($leftLeaf?.id === targetLeaf.id) {
        $leftLeaf = movedLeaf
        $leftNote = destinationNote
      }
      if ($rightLeaf?.id === targetLeaf.id) {
        $rightLeaf = movedLeaf
        $rightNote = destinationNote
      }
      showPushToast($_('toast.moved'), 'success')
      closeMoveModal()
      return
    }

    // Home内の場合は既存処理
    const result = moveLeafToLib(targetLeaf, destNoteId, $_)
    if (result.success && result.movedLeaf && result.destNote) {
      if ($leftLeaf?.id === targetLeaf.id) {
        $leftLeaf = result.movedLeaf
        $leftNote = result.destNote
      }
      if ($rightLeaf?.id === targetLeaf.id) {
        $rightLeaf = result.movedLeaf
        $rightNote = result.destNote
      }
      // スケルトンマップから移動したリーフを削除（noteIdが古いままになるため）
      if (leafSkeletonMap.has(targetLeaf.id)) {
        leafSkeletonMap.delete(targetLeaf.id)
        leafSkeletonMap = new Map(leafSkeletonMap) // リアクティブ更新をトリガー
      }
      showPushToast($_('toast.moved'), 'success')
    }
    closeMoveModal()
  }

  async function moveNoteTo(destNoteId: string | null, targetNote: Note, pane: Pane) {
    const paneWorld = getWorldForPane(pane)
    // アーカイブ内の場合は専用処理
    if (paneWorld === 'archive') {
      const currentParent = targetNote.parentId || null
      const nextParent = destNoteId

      if (currentParent === nextParent) {
        closeMoveModal()
        return
      }

      const allNotes = $archiveNotes

      // 移動先がサブノートの場合は不可
      if (nextParent) {
        const dest = allNotes.find((n) => n.id === nextParent)
        if (!dest || dest.parentId) {
          closeMoveModal()
          return
        }
      }

      // 重複チェック
      const hasDuplicate = allNotes.some(
        (n) =>
          (n.parentId || null) === nextParent &&
          n.id !== targetNote.id &&
          n.name.trim() === targetNote.name.trim()
      )
      if (hasDuplicate) {
        await alertAsync($_('modal.duplicateNoteDestination'))
        closeMoveModal()
        return
      }

      const updated = allNotes.map((n) =>
        n.id === targetNote.id ? { ...n, parentId: nextParent || undefined } : n
      )
      updateArchiveNotes(updated)

      const updatedNote = updated.find((n) => n.id === targetNote.id)
      if (updatedNote) {
        if ($leftNote?.id === targetNote.id) $leftNote = updatedNote
        if ($rightNote?.id === targetNote.id) $rightNote = updatedNote
        showPushToast($_('toast.moved'), 'success')
      }
      closeMoveModal()
      return
    }

    // Home内の場合は既存処理
    const result = moveNoteToLib(targetNote, destNoteId, $_)
    if (result.success && result.updatedNote) {
      if ($leftNote?.id === targetNote.id) $leftNote = result.updatedNote
      if ($rightNote?.id === targetNote.id) $rightNote = result.updatedNote
      showPushToast($_('toast.moved'), 'success')
    }
    closeMoveModal()
  }

  // ヘルパー関数（notes.ts, leaves.ts, stats.tsからインポート）
  function resetLeafStats() {
    leafStatsStore.reset()
  }

  function rebuildLeafStats(allLeaves: Leaf[], allNotes: Note[]) {
    leafStatsStore.rebuild(allLeaves, allNotes)
  }

  // GitHub同期
  /**
   * GitHubにPush（統合版）
   * すべてのPush処理がこの1つの関数を通る
   */
  async function pushToGitHub() {
    // 交通整理: Push不可なら何もしない（アーカイブロード中も禁止）
    if (!canSync($isPulling, $isPushing).canPush || isArchiveLoading) return

    // 即座にロック取得（この後の非同期処理中にPullが開始されるのを防止）
    $isPushing = true
    try {
      // 保留中の自動保存を即座に実行してからPush
      await flushPendingSaves()

      // Stale編集かどうかチェック（共通関数で時刻も更新）
      const staleResult = await executeStaleCheck($settings, get(lastKnownCommitSha))

      if (staleResult.status === 'stale') {
        // リモートに新しい変更あり → 確認ダイアログを表示
        console.log(
          `Push blocked: remote(${staleResult.remoteCommitSha}) !== local(${staleResult.localCommitSha})`
        )
        const confirmed = await confirmAsync($_('modal.staleEdit'))
        if (!confirmed) return
      }
      // check_failedやup_to_dateの場合はそのまま続行

      // Push開始を通知
      showPushToast($_('loading.pushing'))

      // ホーム直下のリーフ・仮想ノートを除外してからPush
      const saveableNotes = $notes.filter((n) => isNoteSaveable(n))
      const saveableLeaves = $leaves.filter((l) => isLeafSaveable(l, saveableNotes))
      const result = await executePush({
        leaves: saveableLeaves,
        notes: saveableNotes,
        settings: $settings,
        isOperationsLocked: !isFirstPriorityFetched,
        localMetadata: $metadata,
        // アーカイブがロード済みの場合のみアーカイブデータを渡す
        archiveLeaves: $isArchiveLoaded ? $archiveLeaves : undefined,
        archiveNotes: $isArchiveLoaded ? $archiveNotes : undefined,
        archiveMetadata: $isArchiveLoaded ? $archiveMetadata : undefined,
        isArchiveLoaded: $isArchiveLoaded,
      })

      // 結果を通知（GitHub APIのメッセージキーを翻訳、変更件数を含める）
      const translatedMessage = translateGitHubMessage(
        result.message,
        $_,
        result.rateLimitInfo,
        result.changedLeafCount
      )
      showPushToast(translatedMessage, result.variant)

      // Push成功時にダーティフラグをクリアし、pushCountを更新
      if (result.variant === 'success') {
        // 現在の状態をスナップショットとして保存（次回以降の差分検出のベースライン）
        setLastPushedSnapshot(get(notes), get(leaves), get(archiveNotes), get(archiveLeaves))
        clearAllChanges()
        lastPushTime.set(Date.now()) // 自動Push用に最終Push時刻を記録
        // Push成功後のcommit SHAをストアに保存（stale検出用）
        if (result.commitSha) {
          lastKnownCommitSha.set(result.commitSha)
        }
        // Push成功後にリモートから最新のpushCountを取得して更新（統計表示用）
        if (result.message === 'github.pushOk') {
          const remoteResult = await fetchRemotePushCount($settings)
          if (remoteResult.status === 'success') {
            lastPulledPushCount.set(remoteResult.pushCount)
          }
        }
      }
    } finally {
      $isPushing = false
    }
  }

  // Git clone相当のZIPエクスポート
  async function exportNotesAsZip() {
    if (!isFirstPriorityFetched) {
      showPushToast($_('settings.importExport.needInitialPull'), 'error')
      return
    }
    if (isExportingZip) return

    isExportingZip = true
    try {
      const allNotes = get(notes)
      const allLeaves = get(leaves)
      const currentMetadata = get(metadata) as Metadata

      const result = await buildNotesZip(allNotes, allLeaves, currentMetadata, {
        gitPolicyLine: $_('settings.importExport.gitPolicy'),
        infoFooterLine: $_('settings.importExport.infoFileFooter'),
      })

      if (!result.success || !result.blob) {
        if (result.reason === 'empty') {
          showPushToast($_('settings.importExport.nothingToExport'), 'error')
        } else {
          console.error('ZIP export failed:', result.error)
          showPushToast($_('settings.importExport.exportFailed'), 'error')
        }
        return
      }

      const url = URL.createObjectURL(result.blob)
      const safeName =
        ($settings.toolName || 'notes')
          .replace(/[^a-z0-9_-]/gi, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase() || 'notes'
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeName}-export.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showPushToast($_('settings.importExport.exportSuccess'), 'success')
    } catch (error) {
      console.error('ZIP export failed:', error)
      showPushToast($_('settings.importExport.exportFailed'), 'error')
    } finally {
      isExportingZip = false
    }
  }

  async function handleImportFromOtherApps() {
    if (isImporting) return
    if (!isFirstPriorityFetched) {
      showPushToast($_('settings.importExport.needInitialPullImport'), 'error')
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.zip,.txt'
    input.multiple = false

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      isImporting = true
      try {
        showPushToast($_('settings.importExport.importStarting'), 'success')

        // まずAgasteer形式かどうかをチェック
        if (file.name.toLowerCase().endsWith('.zip') && (await isAgasteerZip(file))) {
          await handleAgasteerImport(file)
          return
        }

        // SimpleNote形式などの他のインポート
        const allNotes = get(notes)
        const allLeaves = get(leaves)

        // まずファイルをパースして重複チェック
        const result = await processImportFile(file, {
          existingNotesCount: allNotes.length ? Math.max(...allNotes.map((n) => n.order)) + 1 : 0,
          existingLeavesMaxOrder: allLeaves.length
            ? Math.max(...allLeaves.map((l) => l.order))
            : -1,
          translate: $_,
        })

        if (!result.success) {
          showPushToast($_('settings.importExport.unsupportedFile'), 'error')
          return
        }

        const { newNote, reportLeaf, importedLeaves, errors } = result.result

        // 同名のノートが存在するかチェック
        const existingNote = allNotes.find((n) => n.name === newNote.name)
        if (existingNote) {
          // 重複がある場合は確認ダイアログを表示
          const choice = await choiceAsync($_('modal.duplicateChoiceMessage'), [
            { label: $_('common.cancel'), value: 'cancel', variant: 'cancel' },
            { label: $_('modal.duplicateChoiceSkip'), value: 'skip', variant: 'secondary' },
            { label: $_('modal.duplicateChoiceAdd'), value: 'add', variant: 'primary' },
          ])

          if (choice === 'cancel' || choice === null) {
            return
          }
          if (choice === 'skip') {
            showPushToast($_('settings.importExport.importSkipped'), 'success')
            return
          }

          // choice === 'add': 既存ノートにリーフを追加
          const existingLeafTitles = allLeaves
            .filter((l) => l.noteId === existingNote.id)
            .map((l) => l.title)

          // レポートリーフと各インポートリーフのnoteIdを既存ノートに変更、重複はリネーム
          const mergedReportLeaf = {
            ...reportLeaf,
            noteId: existingNote.id,
            title: existingLeafTitles.includes(reportLeaf.title)
              ? generateUniqueName(reportLeaf.title, existingLeafTitles)
              : reportLeaf.title,
          }

          const updatedExistingTitles = [...existingLeafTitles, mergedReportLeaf.title]
          const mergedLeaves = importedLeaves.map((l) => {
            if (updatedExistingTitles.includes(l.title)) {
              const newTitle = generateUniqueName(l.title, updatedExistingTitles)
              updatedExistingTitles.push(newTitle)
              return { ...l, noteId: existingNote.id, title: newTitle }
            }
            updatedExistingTitles.push(l.title)
            return { ...l, noteId: existingNote.id }
          })

          // 既存ノートにリーフを追加（ノート自体は作成しない）
          updateLeaves([...allLeaves, mergedReportLeaf, ...mergedLeaves])
        } else {
          // 重複なし：新規ノートを作成
          updateNotes([...allNotes, newNote])
          updateLeaves([...allLeaves, reportLeaf, ...importedLeaves])
        }

        if (errors?.length) console.warn('Import skipped items:', errors)
        importOccurredInSettings = true
        showPushToast($_('settings.importExport.importDone'), 'success')
      } catch (error) {
        console.error('Import failed:', error)
        showPushToast($_('settings.importExport.importFailed'), 'error')
      } finally {
        isImporting = false
      }
    }

    input.click()
  }

  /**
   * Agasteer形式のzipをインポート（既存データを完全に置き換え）
   */
  async function handleAgasteerImport(file: File) {
    try {
      const result = await parseAgasteerZip(file)
      if (!result) {
        showPushToast($_('settings.importExport.unsupportedFile'), 'error')
        return
      }

      // 既存データを完全に置き換え
      updateNotes(result.notes)
      updateLeaves(result.leaves)
      metadata.set(result.metadata)

      // アーカイブデータがあればストアに設定
      if (result.archiveNotes.length > 0 || result.archiveLeaves.length > 0) {
        updateArchiveNotes(result.archiveNotes)
        updateArchiveLeaves(result.archiveLeaves)
        if (result.archiveMetadata) {
          archiveMetadata.set(result.archiveMetadata)
        }
        isArchiveLoaded.set(true)
      }

      importOccurredInSettings = true
      showPushToast($_('settings.importExport.importDone'), 'success')
    } catch (error) {
      console.error('Agasteer import failed:', error)
      showPushToast($_('settings.importExport.importFailed'), 'error')
    } finally {
      isImporting = false
    }
  }

  // Markdownダウンロード（選択範囲があれば選択範囲をダウンロード）
  function downloadLeafAsMarkdown(leafId: string, pane: Pane) {
    if (!isFirstPriorityFetched) {
      showPushToast($_('toast.needInitialPullDownload'), 'error')
      return
    }

    // ペインのワールドに応じたリーフを取得
    const paneLeaves = getLeavesForPane(pane)

    // 選択テキストがあればそれをダウンロード
    const editorView = pane === 'left' ? leftEditorView : rightEditorView
    if (editorView && editorView.getSelectedText) {
      const selectedText = editorView.getSelectedText()
      if (selectedText) {
        const targetLeaf = paneLeaves.find((l) => l.id === leafId)
        if (!targetLeaf) return
        const blob = new Blob([selectedText], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${targetLeaf.title}-selection.md`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }
    }

    // 選択なしの場合は全文ダウンロード
    const targetLeaf = paneLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return
    const blob = new Blob([targetLeaf.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${targetLeaf.title}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // プレビューを画像としてダウンロード
  async function downloadLeafAsImage(leafId: string, pane: Pane) {
    if (!isFirstPriorityFetched) {
      showPushToast($_('toast.needInitialPullDownload'), 'error')
      return
    }

    // ペインのワールドに応じたリーフを取得
    const paneLeaves = getLeavesForPane(pane)
    const targetLeaf = paneLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return

    try {
      const previewView = pane === 'left' ? leftPreviewView : rightPreviewView
      if (previewView && previewView.captureAsImage) {
        await previewView.captureAsImage(targetLeaf.title)
        showPushToast($_('toast.imageDownloaded'), 'success')
      }
    } catch (error) {
      console.error('Failed to download image:', error)
      showPushToast($_('toast.imageDownloadFailed'), 'error')
    }
  }

  // シェア機能（share.tsからインポート）
  function getShareHandlers() {
    return {
      translate: $_,
      getLeaf: (pane: Pane) => (pane === 'left' ? $leftLeaf : $rightLeaf),
      getView: (pane: Pane) => (pane === 'left' ? $leftView : $rightView),
      getPreviewView: (pane: Pane) => (pane === 'left' ? leftPreviewView : rightPreviewView),
      getEditorView: (pane: Pane) => (pane === 'left' ? leftEditorView : rightEditorView),
    }
  }

  function handleCopyUrl(pane: Pane) {
    handleCopyUrlLib(pane, $_)
  }

  async function handleCopyMarkdown(pane: Pane) {
    await handleCopyMarkdownLib(pane, getShareHandlers())
  }

  async function handleCopyImageToClipboard(pane: Pane) {
    await handleCopyImageToClipboardLib(pane, getShareHandlers())
  }

  async function handleShareImage(pane: Pane) {
    await handleShareImageLib(pane, getShareHandlers())
  }

  async function handleShareSelectionImage(pane: Pane) {
    await handleShareSelectionImageLib(pane, getShareHandlers())
  }

  function getHasSelection(pane: Pane): boolean {
    const editorView = pane === 'left' ? leftEditorView : rightEditorView
    if (!editorView || !editorView.getSelectedText) return false
    return editorView.getSelectedText() !== ''
  }

  function getSelectedText(pane: Pane): string {
    const editorView = pane === 'left' ? leftEditorView : rightEditorView
    if (!editorView || !editorView.getSelectedText) return ''
    return editorView.getSelectedText()
  }

  // ========================================
  // paneActions Context 設定
  // ========================================
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
    handleDisabledPushClick,

    // ワールド切り替え・アーカイブ
    handleWorldChange,
    archiveNote,
    archiveLeaf,
    restoreNote,
    restoreLeaf,
  }

  setContext('paneActions', paneActions)

  // 設定
  function handleThemeChange(theme: typeof $settings.theme) {
    const next = { ...$settings, theme }
    updateSettings(next)
    applyTheme(theme, next)
  }

  function handleSettingsChange(payload: Partial<typeof $settings>) {
    const next = { ...$settings, ...payload }
    updateSettings(next)
    if (payload.theme) {
      applyTheme(payload.theme, next)
    }
    if (payload.toolName) {
      document.title = payload.toolName
    }
  }
  async function handleCloseSettings() {
    isClosingSettingsPull = true
    await pullFromGitHub(false)
    importOccurredInSettings = false
    isClosingSettingsPull = false
  }

  async function handleTestConnection() {
    isTesting = true
    try {
      const result = await testGitHubConnection($settings)
      const message = translateGitHubMessage(result.message, $_, result.rateLimitInfo)
      showPullToast(message, result.success ? 'success' : 'error')
    } catch (e) {
      showPullToast($_('github.networkError'), 'error')
    } finally {
      isTesting = false
    }
  }

  /**
   * Pull処理の統合関数
   * - 交通整理（canSync）
   * - ダーティチェック（confirmAsync）
   * - Staleチェック（executeStaleCheck）
   * - Pull実行（executePull）
   * を1つの関数で実行し、自動的に排他制御を行う
   */
  async function pullFromGitHub(isInitialStartup = false, onCancel?: () => void | Promise<void>) {
    // 交通整理: Pull/Push中またはアーカイブロード中は不可
    if (!canSync($isPulling, $isPushing).canPull || isArchiveLoading) return

    // 即座にロック取得（この後の非同期処理中にPushが開始されるのを防止）
    $isPulling = true
    try {
      // 未保存の変更がある場合は確認（PWA強制終了後の再起動も考慮）
      if (get(isDirty) || getPersistedDirtyFlag()) {
        const message = isInitialStartup
          ? $_('modal.unsavedChangesOnStartup')
          : $_('modal.unsavedChanges')
        const confirmed = await confirmAsync(message)
        if (!confirmed) {
          // キャンセル時: onCancelを呼んでからreturn
          await onCancel?.()
          return
        }
      }

      // Staleチェック: リモートに変更があるか確認（共通関数で時刻も更新）
      const staleResult = await executeStaleCheck($settings, get(lastKnownCommitSha))

      switch (staleResult.status) {
        case 'up_to_date':
          // リモートに変更なし
          // ただし初回Pull（isPullCompleted=false）の場合はPullを続行してUI状態を正常化
          // 例: 空のリポジトリを新規に設定した場合
          if (isPullCompleted) {
            showPullToast($_('github.noRemoteChanges'), 'success')
            return
          }
          // 初回は続行
          break

        case 'stale':
          // リモートに変更あり → Pull実行
          console.log(
            `Pull needed: remote(${staleResult.remoteCommitSha}) !== local(${staleResult.localCommitSha})`
          )
          break

        case 'check_failed':
          // チェック失敗 → Pull実行（サーバー側でエラー表示される）
          console.warn('Stale check failed, proceeding with pull:', staleResult.reason)
          break
      }

      // Pull開始準備
      isLoadingUI = true
      isFirstPriorityFetched = false
      isPullCompleted = false

      // Pull開始を通知
      showPullToast($_('toast.pullStart'))

      // Pull失敗時のデータ保護: 既存データをバックアップ
      const backup = await createBackup()
      const hasBackupData = backup.notes.length > 0 || backup.leaves.length > 0
      if (hasBackupData) {
        console.log(
          `Created backup before Pull (${backup.notes.length} notes, ${backup.leaves.length} leaves)`
        )
      }

      // 重要: GitHubが唯一の真実の情報源（Single Source of Truth）
      // IndexedDBは単なるキャッシュであり、Pull成功時に全削除→全作成される
      // オフラインリーフは専用storeに保存されているため影響なし
      await clearAllData()
      notes.set([])
      leaves.set([])
      loadingLeafIds = new Set()
      resetLeafStats()
      $leftNote = null
      $leftLeaf = null
      $rightNote = null
      $rightLeaf = null

      const options: PullOptions = {
        // ノート構造確定時: ノートを表示可能に、スケルトン情報を設定、優先情報を計算して返す
        onStructure: (notesFromGitHub, metadataFromGitHub, leafSkeletons) => {
          // ノートを先に反映（ナビゲーション可能に）
          notes.set(notesFromGitHub)
          metadata.set(metadataFromGitHub)

          // スケルトン情報を保存（NoteViewでスケルトン表示に使用）
          leafSkeletonMap = new Map(leafSkeletons.map((s) => [s.id, s]))

          // 全リーフIDをローディング中として登録
          loadingLeafIds = new Set(leafSkeletons.map((s) => s.id))

          // Pull進捗: 総リーフ数をセット
          pullProgressStore.start(leafSkeletons.length)

          // URLから優先情報を計算して返す
          return nav.getPriorityFromUrl(notesFromGitHub)
        },

        // 各リーフ取得完了時: leavesストアに追加、統計を更新
        onLeaf: (leaf) => {
          leaves.update((current) => [...current, leaf])
          leafStatsStore.addLeaf(leaf.id, leaf.content)
          loadingLeafIds.delete(leaf.id)
          loadingLeafIds = loadingLeafIds // リアクティブ更新
          // Pull進捗: カウントアップ
          pullProgressStore.increment()
        },

        // 第1優先リーフ取得完了時: 作成・削除許可、ガラス効果解除、URL復元
        onPriorityComplete: () => {
          isFirstPriorityFetched = true
          isLoadingUI = false // ガラス効果を解除（残りのリーフはバックグラウンドで取得継続）

          // 初回Pull時のURL復元
          if (isInitialStartup) {
            isRestoringFromUrl = true
            restoreStateFromUrl(true)
            isRestoringFromUrl = false
          } else {
            restoreStateFromUrl(false)
          }
        },
      }

      const result = await executePull($settings, options)

      if (result.success) {
        // 全リーフ取得完了
        isPullCompleted = true

        // leavesストアはonLeafで逐次更新済みなので、最終的なソートのみ
        // ただし、Pull中にユーザーが編集したリーフのcontentは保持する
        const currentLeaves = get(leaves)
        const currentLeafMap = new Map(currentLeaves.map((l) => [l.id, l]))
        const sortedLeaves = result.leaves
          .sort((a, b) => a.order - b.order)
          .map((leaf) => {
            const currentLeaf = currentLeafMap.get(leaf.id)
            // ユーザーがPull中に編集した場合、編集内容を保持
            // （リモートのコンテンツと現在のコンテンツが異なる場合）
            if (currentLeaf && currentLeaf.content !== leaf.content) {
              return { ...leaf, content: currentLeaf.content }
            }
            return leaf
          })
        leaves.set(sortedLeaves)
        rebuildLeafStats(sortedLeaves, result.notes)

        // stale編集検出用にcommit SHAを記録
        if (result.commitSha) {
          lastKnownCommitSha.set(result.commitSha)
        }
        // 統計表示用にpushCountを記録
        lastPulledPushCount.set(result.metadata.pushCount)

        // Pull完了時の状態をスナップショットとして保存（差分検出のベースライン）
        // アーカイブはまだPull完了していない可能性があるので、その時点の状態を使用
        setLastPushedSnapshot(result.notes, sortedLeaves, get(archiveNotes), get(archiveLeaves))

        // IndexedDBに保存
        saveNotes(result.notes).catch((err) => console.error('Failed to persist notes:', err))
        saveLeaves(sortedLeaves).catch((err) => console.error('Failed to persist leaves:', err))

        // Pull成功時はGitHubと同期したのでダーティフラグをクリア
        // ただし、Pull中にユーザーが編集した場合はクリアしない
        await tick()
        if (!get(isDirty)) {
          clearAllChanges()
        }
        isStale.set(false) // Pullしたのでstale状態を解除
      } else {
        // Pull失敗時の処理
        if (result.message === 'github.pullIncomplete') {
          // リーフ取得が不完全な場合は、UIをロック状態に戻す
          // これにより、不完全なデータでのPushによるデータ消失を防ぐ
          console.error('Pull incomplete: some leaves failed to fetch. UI remains locked.')
          isFirstPriorityFetched = false
          isPullCompleted = false
          // ストアをクリアして不完全なデータでのPushを防ぐ
          notes.set([])
          leaves.set([])
          // バックアップからの復元はしない（不完全な状態でのPushを防ぐため）
        } else if (hasBackupData) {
          // その他のPull失敗（ネットワークエラー等）: バックアップからデータを復元
          console.log('Pull failed, restoring from backup...')
          try {
            await restoreFromBackup(backup)
            // ストアにもバックアップデータを復元
            notes.set(backup.notes)
            leaves.set(backup.leaves)
            rebuildLeafStats(backup.leaves, backup.notes)
            // URLから状態を復元
            restoreStateFromUrl(false)
            isFirstPriorityFetched = true // 操作可能にする
          } catch (restoreError) {
            console.error('Failed to restore from backup:', restoreError)
          }
        }
        // 初回Pull失敗時は静かに処理（設定未完了は正常な状態）
        // 2回目以降のPull失敗はトーストで通知される
      }

      // 結果を通知（GitHub APIのメッセージキーを翻訳）
      const translatedMessage = translateGitHubMessage(result.message, $_, result.rateLimitInfo)
      showPullToast(translatedMessage, result.variant)
      isLoadingUI = false
      pullProgressStore.reset() // Pull進捗リセット
    } finally {
      $isPulling = false
    }
  }

  // HMR用の一時保存キー
  const HMR_OFFLINE_KEY = 'agasteer_hmr_offline'

  // HMR時にオフラインリーフをlocalStorageに一時保存（同期的に完了するため）
  function flushOfflineSaveSync() {
    // 保留中の自動保存をキャンセルして同期的にlocalStorageへ保存
    // IndexedDBは非同期なのでHMRに間に合わないため
    const current = get(offlineLeafStore)
    if (current.content || current.badgeIcon || current.badgeColor) {
      localStorage.setItem(HMR_OFFLINE_KEY, JSON.stringify(current))
      console.log('[HMR] Saved offline leaf to localStorage:', current)
    }
  }

  // HMR後にlocalStorageからオフラインリーフを復元
  function restoreFromHmrStorage() {
    const stored = localStorage.getItem(HMR_OFFLINE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        console.log('[HMR] Restoring offline leaf from localStorage:', data)
        offlineLeafStore.set(data)
        // IndexedDBにも保存
        const leaf = createOfflineLeaf(data.content, data.badgeIcon, data.badgeColor)
        leaf.updatedAt = data.updatedAt
        saveOfflineLeaf(leaf)
        // 復元完了後に一時データを削除
        localStorage.removeItem(HMR_OFFLINE_KEY)
      } catch (e) {
        console.error('[HMR] Failed to restore offline leaf:', e)
        localStorage.removeItem(HMR_OFFLINE_KEY)
      }
    }
  }

  // HMRハンドラー（開発時のみ）
  if (import.meta.hot) {
    // モジュール読み込み時にlocalStorageから復元を試みる
    restoreFromHmrStorage()

    import.meta.hot.dispose(() => {
      console.log('[HMR] dispose called, saving to localStorage')
      // HMR前にオフラインリーフをlocalStorageに同期保存
      flushOfflineSaveSync()
    })
  }
</script>

{#if !i18nReady}
  <!-- i18n読み込み中 -->
  <div class="i18n-loading">
    <div class="loading-spinner">
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    </div>
  </div>
{:else}
  <!-- メインアプリケーション -->
  <div class="app-container">
    <Header
      githubConfigured={isGitHubConfigured}
      title={$settings.toolName}
      onTitleClick={() => {
        leftWorld.set('home')
        rightWorld.set('home')
        goHome('left')
        goHome('right')
      }}
      onSettingsClick={() => {
        goSettings()
      }}
      onPull={() => pullFromGitHub(false)}
      pullDisabled={!canPull}
      isStale={$isStale}
      pullProgress={$pullProgressInfo}
      onPullProgressClick={() => {
        if ($pullProgressInfo) {
          showPullToast(
            $_('home.leafFetched', {
              values: { fetched: $pullProgressInfo.fetched, total: $pullProgressInfo.total },
            })
          )
        }
      }}
      onSearchClick={toggleSearch}
      onHelpClick={openUserGuide}
      {isDualPane}
      isOperationsLocked={!isFirstPriorityFetched}
      onSwapPanes={swapPanes}
      onCopyLeftToRight={copyLeftToRight}
      onCopyRightToLeft={copyRightToLeft}
    />
    <!-- 検索ドロップダウン（ヘッダー右上、検索ボタンの下） -->
    <SearchBar onResultClick={handleSearchResultClick} />

    <div class="content-wrapper" class:single-pane={!isDualPane}>
      <div class="pane-divider" class:hidden={!isDualPane}></div>
      <div class="left-column">
        <PaneView
          pane="left"
          bind:editorViewRef={leftEditorView}
          bind:previewViewRef={leftPreviewView}
        />
      </div>

      <div class="right-column" class:hidden={!isDualPane}>
        <PaneView
          pane="right"
          bind:editorViewRef={rightEditorView}
          bind:previewViewRef={rightPreviewView}
        />
      </div>
    </div>

    <MoveModal
      show={moveModalOpen}
      notes={moveTargetNotes}
      targetNote={moveTargetNote}
      targetLeaf={moveTargetLeaf}
      pane={moveTargetPane}
      currentWorld={moveTargetWorld}
      onConfirm={handleMoveConfirm}
      onClose={closeMoveModal}
    />

    <Modal
      show={$modalState.show}
      message={$modalState.message}
      type={$modalState.type}
      position={$modalState.position}
      onConfirm={$modalState.callback}
      onCancel={$modalState.cancelCallback}
      onPromptSubmit={$modalState.promptCallback}
      onChoiceSelect={$modalState.choiceCallback}
      choiceOptions={$modalState.choiceOptions || []}
      placeholder={$modalState.placeholder || ''}
      onClose={closeModal}
    />

    <SettingsModal
      show={showSettings}
      settings={$settings}
      {isTesting}
      exporting={isExportingZip}
      importing={isImporting}
      onThemeChange={handleThemeChange}
      onSettingsChange={handleSettingsChange}
      onTestConnection={handleTestConnection}
      onExportZip={exportNotesAsZip}
      onImport={handleImportFromOtherApps}
      onClose={closeSettings}
    />

    <WelcomeModal
      show={showWelcome}
      onOpenSettings={openSettingsFromWelcome}
      onClose={closeWelcome}
    />

    <Toast
      pullMessage={$pullToastState.message}
      pullVariant={$pullToastState.variant}
      pushMessage={$pushToastState.message}
      pushVariant={$pushToastState.variant}
    />

    {#if showInstallBanner}
      <InstallBanner onInstall={handleInstall} onDismiss={dismissInstallBanner} />
    {/if}
  </div>
{/if}
