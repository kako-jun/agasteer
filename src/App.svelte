<script lang="ts">
  import './App.css'
  import { waitForSwCheck } from './main'
  import { onMount, tick, setContext } from 'svelte'
  import { get } from 'svelte/store'
  import type { Note, Leaf, Breadcrumb, WorldType, SearchMatch } from './lib/types'
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
    updateSettings,
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
    pullProgressInfo,
    offlineLeafStore,
    archiveNotes,
    archiveLeaves,
    archiveMetadata,
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
    setArchiveBaseline,
    resetForRepoSwitch,
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
    loadSettings,
    loadNotes,
    loadLeaves,
    saveNotes,
    saveLeaves,
    saveOfflineLeaf,
    loadOfflineLeaf,
    shouldShowPwaInstallBanner,
    setPwaInstallDismissedAt,
    setPushInFlightAt,
    getPushInFlightAt,
    type IndexedDBBackup,
  } from './lib/data'
  import { applyTheme } from './lib/ui'
  import { loadAndApplyCustomFont, loadAndApplySystemMonoFont } from './lib/ui'
  import { loadAndApplyCustomBackgrounds } from './lib/ui'
  import { pullArchive, translateGitHubMessage } from './lib/api'
  import type { LeafSkeleton } from './lib/api'
  import { initI18n, _, locale } from './lib/i18n'

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
  import { getBreadcrumbs as buildBreadcrumbs } from './lib/ui'
  import { reorderItems } from './lib/navigation'
  import { normalizeNoteOrders, getItemCount } from './lib/data'
  import { normalizeLeafOrders, getLeafCount } from './lib/data'
  import { computeLeafCharCount } from './lib/utils'
  import {
    handleCopyUrl as handleCopyUrlLib,
    handleCopyMarkdown as handleCopyMarkdownLib,
    handleShareImage as handleShareImageLib,
    handleShareSelectionImage as handleShareSelectionImageLib,
    handleCopyImageToClipboard as handleCopyImageToClipboardLib,
  } from './lib/utils'
  import {
    pushToGitHub as pushToGitHubAction,
    pullFromGitHub as pullFromGitHubAction,
    handleTestConnection as handleTestConnectionAction,
    type GitActionContext,
  } from './lib/actions/git'
  import {
    moveNoteToWorld as moveNoteToWorldAction,
    moveLeafToWorld as moveLeafToWorldAction,
    moveLeafTo as moveLeafToAction,
    moveNoteTo as moveNoteToAction,
    type MoveActionContext,
  } from './lib/actions/move'
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
    type CrudActionContext,
  } from './lib/actions/crud'
  import {
    exportNotesAsZip as exportNotesAsZipAction,
    handleImportFromOtherApps as handleImportFromOtherAppsAction,
    handleAgasteerImport as handleAgasteerImportAction,
    downloadLeafAsMarkdown as downloadLeafAsMarkdownAction,
    downloadLeafAsImage as downloadLeafAsImageAction,
    type IoActionContext,
  } from './lib/actions/io'
  import {
    handlePaneScroll as handlePaneScrollLib,
    type ScrollSyncState,
    type ScrollSyncViews,
  } from './lib/ui'
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
  import type { PaneActions } from './lib/stores'
  import {
    priorityItems,
    createPriorityLeaf,
    isPriorityLeaf,
    PRIORITY_LEAF_ID,
    createOfflineLeaf,
    isOfflineLeaf,
    OFFLINE_LEAF_ID,
  } from './lib/utils'
  import {
    // Constants
    isPWAStandalone,
    PWA_EXIT_GUARD_KEY,
    // World helpers
    getNotesForWorld,
    getLeavesForWorld,
    getWorldForPane,
    getNotesForPane,
    getLeavesForPane,
    getWorldForNote,
    getWorldForLeaf,
    setCurrentNotes,
    setCurrentLeaves,
    setNotesForWorld,
    setLeavesForWorld,
    // Pane state store
    paneStateStore,
  } from './lib/app-state.svelte'

  // ========================================
  // Local state ($state) — Phase 2で app-state.svelte.ts に移動予定
  // ========================================
  let breadcrumbs: Breadcrumb[] = $state([])
  let breadcrumbsRight: Breadcrumb[] = $state([])
  let editingBreadcrumb: string | null = $state(null)

  let isLoadingUI = $state(false) // ガラス効果（Pull中のみ）
  let isFirstPriorityFetched = $state(false) // 第1優先リーフの取得が完了したか
  let isPullCompleted = $state(false) // 全リーフのPullが完了したか
  let showSettings = $state(false)
  let i18nReady = $state(false) // i18n初期化完了フラグ
  let showWelcome = $state(false) // ウェルカムモーダル表示フラグ
  let showInstallBanner = $state(false) // PWAインストールバナー表示フラグ
  let deferredPrompt: Event | null = $state(null) // BeforeInstallPromptEvent
  let isExportingZip = $state(false)
  let isImporting = $state(false)
  let isTesting = $state(false)
  let importOccurredInSettings = false
  let isClosingSettingsPull = false
  let repoChangedInSettings = false // 設定画面でリポが変更された
  let isArchiveLoading = $state(false) // アーカイブをロード中

  // 左右ペイン用の状態
  let isDualPane = $state(false) // 画面幅で切り替え

  // PWA終了ガードにいるかどうかのフラグ
  let atGuardEntry = false

  // キーボードナビゲーション用の状態
  let selectedIndexLeft = $state(0) // 左ペインで選択中のアイテムインデックス
  let selectedIndexRight = $state(0) // 右ペインで選択中のアイテムインデックス

  // スクロール同期用のコンポーネント参照
  let leftEditorView: any = $state(null)
  let leftPreviewView: any = $state(null)
  let rightEditorView: any = $state(null)
  let rightPreviewView: any = $state(null)

  // 未取得リーフのID（ローディング表示用）
  let loadingLeafIds = $state(new Set<string>())

  // スケルトン表示用のリーフメタ情報（Pull中のみ使用）
  let leafSkeletonMap = $state(new Map<string, LeafSkeleton>())

  // URLルーティング
  let isRestoringFromUrl = false

  // Pull/Push中はボタンを無効化（リアクティブに追跡）
  let canPull = $derived(!$isPulling && !$isPushing && !isArchiveLoading)
  let canPush = $derived(!$isPulling && !$isPushing && !isArchiveLoading && isFirstPriorityFetched)

  // dragStoreへのリアクティブアクセス
  let draggedNote = $derived($dragStore.draggedNote)
  let draggedLeaf = $derived($dragStore.draggedLeaf)
  let dragOverNoteId = $derived($dragStore.dragOverNoteId)
  let dragOverLeafId = $derived($dragStore.dragOverLeafId)

  // leafStatsStoreとmoveModalStoreへのリアクティブアクセス
  // 左ペインのワールドとビューに応じて統計を切り替え
  let totalLeafCount = $derived(
    $leftWorld === 'archive' && $leftView === 'home'
      ? $archiveLeafStatsStore.totalLeafCount
      : $leafStatsStore.totalLeafCount
  )
  let totalLeafChars = $derived(
    $leftWorld === 'archive' && $leftView === 'home'
      ? $archiveLeafStatsStore.totalLeafChars
      : $leafStatsStore.totalLeafChars
  )
  let moveModalOpen = $derived($moveModalStore.isOpen)
  let moveTargetLeaf = $derived($moveModalStore.targetLeaf)
  let moveTargetNote = $derived($moveModalStore.targetNote)
  let moveTargetPane = $derived($moveModalStore.targetPane)
  let moveTargetWorld = $derived(_getWorldForPane(moveTargetPane, $leftWorld, $rightWorld))
  let moveTargetNotes = $derived(_getNotesForWorld(moveTargetWorld, $notes, $archiveNotes))

  // リアクティブ宣言（ワールドに応じたデータを使用）
  let leftBreadcrumbNotes = $derived(_getNotesForWorld($leftWorld, $notes, $archiveNotes))
  let leftBreadcrumbLeaves = $derived(_getLeavesForWorld($leftWorld, $leaves, $archiveLeaves))
  let rightBreadcrumbNotes = $derived(_getNotesForWorld($rightWorld, $notes, $archiveNotes))
  let rightBreadcrumbLeaves = $derived(_getLeavesForWorld($rightWorld, $leaves, $archiveLeaves))

  let isGitHubConfigured = $derived($githubConfigured)

  // Priorityリーフをリアクティブに生成（metadataからバッジ情報を復元）
  let priorityBadgeMeta = $derived($metadata.leaves?.[PRIORITY_LEAF_ID])
  let currentPriorityLeaf = $derived(
    createPriorityLeaf($priorityItems, priorityBadgeMeta?.badgeIcon, priorityBadgeMeta?.badgeColor)
  )

  // オフラインリーフをリアクティブに生成（ストアから）
  let currentOfflineLeaf = $derived(
    createOfflineLeaf(
      $offlineLeafStore.content,
      $offlineLeafStore.badgeIcon,
      $offlineLeafStore.badgeColor
    )
  )

  // 現在のワールド（左ペイン基準、後方互換性のため）に応じたノート・リーフ
  let currentNotes = $derived(_getNotesForWorld($leftWorld, $notes, $archiveNotes))
  let currentLeaves = $derived(_getLeavesForWorld($leftWorld, $leaves, $archiveLeaves))

  // Pushボタン無効理由を計算
  let pushDisabledReason = $derived(
    $pullProgressInfo
      ? $_('home.leafFetched', {
          values: { fetched: $pullProgressInfo.fetched, total: $pullProgressInfo.total },
        })
      : ''
  )

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

  $effect(() => {
    breadcrumbs = buildBreadcrumbs(
      $leftView,
      $leftNote,
      $leftLeaf,
      leftBreadcrumbNotes,
      'left',
      goHome,
      selectNote,
      leftBreadcrumbLeaves
    )
  })
  $effect(() => {
    breadcrumbsRight = buildBreadcrumbs(
      $rightView,
      $rightNote,
      $rightLeaf,
      rightBreadcrumbNotes,
      'right',
      goHome,
      selectNote,
      rightBreadcrumbLeaves
    )
  })
  $effect(() => {
    document.title = $settings.toolName
  })

  // ========================================
  // Context API によるペイン間の状態共有
  // ========================================

  // paneState をリアクティブに更新
  $effect(() => {
    paneStateStore.set({
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
  })

  // Context に設定
  setContext('paneState', paneStateStore)

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
          // Archive部分のベースラインのみ更新（Home側に影響しない）
          setArchiveBaseline(result.notes, result.leaves)
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

  // ペインの状態変更をURLに反映
  $effect(() => {
    $leftNote
    $leftLeaf
    $leftView
    $leftWorld
    $rightNote
    $rightLeaf
    $rightView
    $rightWorld
    updateUrlFromState()
  })

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
      const loadedSettings = await loadSettings()
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
            // IndexedDBのデータをベースラインとして記録（dirty誤検出を防止）
            setLastPushedSnapshot(savedNotes, savedLeaves, [], [])
            // ベースラインとローカルが同じなのでダーティをクリア
            clearAllChanges()
            // リーフのisDirtyでは検出できない構造変更があった場合、isStructureDirtyを復元
            if (wasDirty) {
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
            // Push飛行中フラグがある場合、スリープでPushレスポンスが消失した可能性がある
            // （GitHub側ではPushが成功しているが、レスポンスが届かずSHAが未更新）
            const pushInFlight = getPushInFlightAt()
            const PUSH_IN_FLIGHT_EXPIRY_MS = 60 * 60 * 1000 // 1時間
            if (pushInFlight && now - pushInFlight < PUSH_IN_FLIGHT_EXPIRY_MS) {
              console.log('Stale detected with push-in-flight flag: resolving as interrupted push')
              // SHAのみ更新し、スナップショットとダーティは変更しない。
              // push後〜sleep前にユーザーが追加編集した場合、その編集がダーティとして残り、
              // 次回pushで正しく送信される。既にpush済みの内容との差分がなければno-op pushになる。
              lastKnownCommitSha.set(staleResult.remoteCommitSha)
              setPushInFlightAt(undefined)
              isStale.set(false)
            } else {
              // フラグが期限切れの場合はクリアして通常のstale処理
              if (pushInFlight) {
                setPushInFlightAt(undefined)
              }
              isStale.set(true)
            }
          } else if (staleResult.status === 'up_to_date') {
            // PushがGitHubに届かなかった場合もここに来る（SHAが変わっていない）
            // 飛行中フラグがあれば安全にクリア
            if (getPushInFlightAt()) {
              setPushInFlightAt(undefined)
            }
            isStale.set(false)
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
            // Archive部分のベースラインのみ更新（Home側に影響しない）
            setArchiveBaseline(result.notes, result.leaves)
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
    return moveNoteToWorldAction(createMoveContext(), note, targetWorld, pane)
  }

  async function moveLeafToWorld(leaf: Leaf, targetWorld: WorldType, pane: Pane) {
    return moveLeafToWorldAction(createMoveContext(), leaf, targetWorld, pane)
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

    // ワールドも入れ替え
    const tempWorld = $leftWorld
    leftWorld.set($rightWorld)
    rightWorld.set(tempWorld)
  }

  function copyLeftToRight() {
    // 左ペインの状態を右ペインにコピー
    $rightNote = $leftNote
    $rightLeaf = $leftLeaf
    $rightView = $leftView
    selectedIndexRight = selectedIndexLeft
    rightWorld.set($leftWorld)
  }

  function copyRightToLeft() {
    // 右ペインの状態を左ペインにコピー
    $leftNote = $rightNote
    $leftLeaf = $rightLeaf
    $leftView = $rightView
    selectedIndexLeft = selectedIndexRight
    leftWorld.set($rightWorld)
  }

  // キーボードナビゲーション用ヘルパー（ペインのワールドに対応）
  function getCurrentItemsForPane(pane: Pane): (Note | Leaf)[] {
    const view = pane === 'left' ? $leftView : $rightView
    const note = pane === 'left' ? $leftNote : $rightNote
    const paneNotes = getNotesForPane(pane)
    const paneLeaves = getLeavesForPane(pane)

    if (view === 'home') {
      const specialLeaves: Leaf[] = []
      if (getWorldForPane(pane) !== 'archive') {
        if (currentOfflineLeaf) specialLeaves.push(currentOfflineLeaf)
        if (currentPriorityLeaf && isPullCompleted) specialLeaves.push(currentPriorityLeaf)
      }
      const rootNotes = paneNotes.filter((n) => !n.parentId).sort((a, b) => a.order - b.order)
      return [...specialLeaves, ...rootNotes]
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
    return saveEditBreadcrumbAction(createCrudContext(), id, newName, type)
  }

  function cancelEditBreadcrumb() {
    editingBreadcrumb = null
  }

  // ノート管理（crud.tsに委譲）
  function createNote(parentId: string | undefined, pane: Pane, name?: string) {
    createNoteAction(createCrudContext(), parentId, pane, name)
  }

  function deleteNote(pane: Pane) {
    deleteNoteAction(createCrudContext(), pane)
  }

  // ノートバッジ更新
  function updateNoteBadge(noteId: string, badgeIcon: string, badgeColor: string, pane: Pane) {
    updateNoteBadgeAction(createCrudContext(), noteId, badgeIcon, badgeColor, pane)
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

  // リーフ管理（crud.tsに委譲）
  function createLeaf(pane: Pane, title?: string) {
    createLeafAction(createCrudContext(), pane, title)
  }

  function deleteLeaf(leafId: string, pane: Pane) {
    deleteLeafAction(createCrudContext(), leafId, pane)
  }

  async function updateLeafContent(content: string, leafId: string, pane: Pane) {
    return updateLeafContentAction(createCrudContext(), content, leafId, pane)
  }

  function updateLeafBadge(leafId: string, badgeIcon: string, badgeColor: string, pane: Pane) {
    updateLeafBadgeAction(createCrudContext(), leafId, badgeIcon, badgeColor, pane)
  }

  // Priorityリーフのバッジ更新（metadataに直接保存）
  function updatePriorityBadge(badgeIcon: string, badgeColor: string) {
    updatePriorityBadgeAction(badgeIcon, badgeColor)
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
    return moveLeafToAction(createMoveContext(), destNoteId, targetLeaf, pane)
  }

  async function moveNoteTo(destNoteId: string | null, targetNote: Note, pane: Pane) {
    return moveNoteToAction(createMoveContext(), destNoteId, targetNote, pane)
  }

  // ヘルパー関数（notes.ts, leaves.ts, stats.tsからインポート）
  function resetLeafStats() {
    leafStatsStore.reset()
  }

  function rebuildLeafStats(allLeaves: Leaf[], allNotes: Note[]) {
    leafStatsStore.rebuild(allLeaves, allNotes)
  }

  // GitHub同期

  function createGitContext(): GitActionContext {
    return {
      getIsArchiveLoading: () => isArchiveLoading,
      getIsFirstPriorityFetched: () => isFirstPriorityFetched,
      getIsPullCompleted: () => isPullCompleted,
      setIsArchiveLoading: (v) => (isArchiveLoading = v),
      setIsFirstPriorityFetched: (v) => (isFirstPriorityFetched = v),
      setIsPullCompleted: (v) => (isPullCompleted = v),
      setIsLoadingUI: (v) => (isLoadingUI = v),
      setSelectedIndexLeft: (v) => (selectedIndexLeft = v),
      setSelectedIndexRight: (v) => (selectedIndexRight = v),
      setLoadingLeafIds: (v) => (loadingLeafIds = v),
      setLeafSkeletonMap: (v) => (leafSkeletonMap = v),
      setIsRestoringFromUrl: (v) => (isRestoringFromUrl = v),
      getLoadingLeafIds: () => loadingLeafIds,
      restoreStateFromUrl,
      rebuildLeafStats,
      resetLeafStats,
      confirmAsync,
      choiceAsync,
      pushToGitHub,
    }
  }

  function createMoveContext(): MoveActionContext {
    return {
      getIsArchiveLoading: () => isArchiveLoading,
      setIsArchiveLoading: (v) => (isArchiveLoading = v),
      getLeafSkeletonMap: () => leafSkeletonMap,
      setLeafSkeletonMap: (v) => (leafSkeletonMap = v),
      selectNote,
      goHome,
      refreshBreadcrumbs,
      rebuildLeafStats,
      closeMoveModal,
      getWorldForPane,
    }
  }

  function createCrudContext(): CrudActionContext {
    return {
      getIsFirstPriorityFetched: () => isFirstPriorityFetched,
      getLeafSkeletonMap: () => leafSkeletonMap,
      setEditingBreadcrumb: (v) => (editingBreadcrumb = v),
      setLeafSkeletonMap: (v) => (leafSkeletonMap = v),
      selectNote,
      selectLeaf,
      goHome,
      refreshBreadcrumbs,
      rebuildLeafStats,
      getWorldForPane,
      getNotesForWorld,
      getLeavesForWorld,
      setNotesForWorld,
      setLeavesForWorld,
      getLeavesForPane,
      showPrompt,
      showConfirm,
      getDialogPositionForPane,
      updateOfflineContent,
    }
  }

  function createIoContext(): IoActionContext {
    return {
      getIsFirstPriorityFetched: () => isFirstPriorityFetched,
      getIsExportingZip: () => isExportingZip,
      getIsImporting: () => isImporting,
      setIsExportingZip: (v) => (isExportingZip = v),
      setIsImporting: (v) => (isImporting = v),
      setImportOccurredInSettings: (v) => (importOccurredInSettings = v),
      getLeavesForPane,
      getEditorView: (pane: Pane) => (pane === 'left' ? leftEditorView : rightEditorView),
      getPreviewView: (pane: Pane) => (pane === 'left' ? leftPreviewView : rightPreviewView),
    }
  }

  /**
   * GitHubにPush（統合版）
   * すべてのPush処理がこの1つの関数を通る
   */
  async function pushToGitHub() {
    return pushToGitHubAction(createGitContext())
  }

  // Git clone相当のZIPエクスポート
  async function exportNotesAsZip() {
    return exportNotesAsZipAction(createIoContext())
  }

  async function handleImportFromOtherApps() {
    return handleImportFromOtherAppsAction(createIoContext())
  }

  async function handleAgasteerImport(file: File) {
    return handleAgasteerImportAction(createIoContext(), file)
  }

  // Markdownダウンロード（選択範囲があれば選択範囲をダウンロード）
  function downloadLeafAsMarkdown(leafId: string, pane: Pane) {
    downloadLeafAsMarkdownAction(createIoContext(), leafId, pane)
  }

  // プレビューを画像としてダウンロード
  async function downloadLeafAsImage(leafId: string, pane: Pane) {
    return downloadLeafAsImageAction(createIoContext(), leafId, pane)
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
    const repoChanged = payload.repoName !== undefined && payload.repoName !== $settings.repoName
    const next = { ...$settings, ...payload }
    updateSettings(next)
    if (payload.theme) {
      applyTheme(payload.theme, next)
    }
    if (payload.toolName) {
      document.title = payload.toolName
    }
    // リポジトリが変更された場合、全リポ固有状態をリセット
    if (repoChanged) {
      repoChangedInSettings = true
      isPullCompleted = false
      isFirstPriorityFetched = false
      resetForRepoSwitch()
      archiveLeafStatsStore.reset()
    }
  }
  async function handleCloseSettings() {
    // リポ変更またはインポートがあった場合のみPull実行
    if (repoChangedInSettings || importOccurredInSettings) {
      // Pull/Push/アーカイブロード中の場合は完了を待たずにリセット済み状態で閉じる
      // （resetForRepoSwitchで既にデータクリア済み、次回操作時に新リポからPullされる）
      if (!$isPulling && !$isPushing && !isArchiveLoading) {
        isClosingSettingsPull = true
        await pullFromGitHub(false)
        isClosingSettingsPull = false
      }
    }
    repoChangedInSettings = false
    importOccurredInSettings = false
  }

  async function handleTestConnection() {
    return handleTestConnectionAction({
      setIsTesting: (v) => (isTesting = v),
    })
  }

  /**
   * Pull処理の統合関数
   * すべてのPull処理がこの1つの関数を通る
   */
  async function pullFromGitHub(isInitialStartup = false, onCancel?: () => void | Promise<void>) {
    return pullFromGitHubAction(createGitContext(), isInitialStartup, onCancel)
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
