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
    hasAnyChanges,
    hasAnyDirty,
    isStructureDirty,
    setLeafDirty,
    clearAllChanges,
    getPersistedDirtyFlag,
    isNoteDirty,
    lastPulledPushCount,
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
    dragStore,
    moveModalStore,
    pullProgressStore,
    pullProgressInfo,
    offlineLeafStore,
    archiveNotes,
    archiveLeaves,
    archiveMetadata,
    isArchiveLoaded,
    currentWorld,
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
    type IndexedDBBackup,
  } from './lib/data'
  import { applyTheme } from './lib/ui'
  import { loadAndApplyCustomFont, loadAndApplySystemMonoFont } from './lib/ui'
  import { loadAndApplyCustomBackgrounds } from './lib/ui'
  import {
    executePush,
    executePull,
    pullArchive,
    checkIfStaleEdit,
    testGitHubConnection,
    translateGitHubMessage,
    canSync,
  } from './lib/api'
  import type { PullOptions, PullPriority, LeafSkeleton, RateLimitInfo } from './lib/api'
  import { initI18n, _ } from './lib/i18n'
  import { processImportFile, isAgasteerZip, parseAgasteerZip } from './lib/data'
  import {
    pushToastState,
    pullToastState,
    modalState,
    showPushToast,
    showPullToast,
    showConfirm,
    showAlert,
    showPrompt,
    closeModal,
  } from './lib/ui'
  import { resolvePath, buildPath } from './lib/navigation'
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
  let isExportingZip = false
  let isImporting = false
  let isTesting = false
  let importOccurredInSettings = false
  let isClosingSettingsPull = false
  let isArchiveLoading = false // アーカイブをロード中

  // オフラインリーフの状態（ストアから取得、HMRでもリセットされない）
  let offlineSaveTimeoutId: ReturnType<typeof setTimeout> | null = null

  // leafStatsStoreとmoveModalStoreへのリアクティブアクセス
  $: totalLeafCount = $leafStatsStore.totalLeafCount
  $: totalLeafChars = $leafStatsStore.totalLeafChars
  $: moveModalOpen = $moveModalStore.isOpen
  $: moveTargetLeaf = $moveModalStore.targetLeaf
  $: moveTargetNote = $moveModalStore.targetNote
  $: moveTargetPane = $moveModalStore.targetPane

  // 左右ペイン用の状態
  let isDualPane = false // 画面幅で切り替え

  // PWAスタンドアロンモード検出（Android戻るスワイプ対策）
  const isPWAStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true)

  // PWA終了ガード用のセンチネルキー
  const PWA_EXIT_GUARD_KEY = 'pwa-exit-guard'

  // PWA終了ガード用のダミーエントリを追加
  function pushExitGuard() {
    if (isPWAStandalone) {
      history.pushState({ [PWA_EXIT_GUARD_KEY]: true }, '', location.href)
    }
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

  // リアクティブ宣言
  $: breadcrumbs = buildBreadcrumbs(
    $leftView,
    $leftNote,
    $leftLeaf,
    $notes,
    'left',
    goHome,
    selectNote,
    $leaves
  )
  $: breadcrumbsRight = buildBreadcrumbs(
    $rightView,
    $rightNote,
    $rightLeaf,
    $notes,
    'right',
    goHome,
    selectNote,
    $leaves
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
  $: canPull = !$isPulling && !$isPushing
  $: canPush = !$isPulling && !$isPushing && isFirstPriorityFetched

  // ========================================
  // Context API によるペイン間の状態共有
  // ========================================

  // paneState ストア（リアクティブな状態を子コンポーネントに渡す）
  const paneStateStore = writable<PaneState>({
    isFirstPriorityFetched: false,
    isPullCompleted: false,
    canPush: false,
    saveDisabledReason: '',
    selectedIndexLeft: 0,
    selectedIndexRight: 0,
    editingBreadcrumb: null,
    dragOverNoteId: null,
    dragOverLeafId: null,
    loadingLeafIds: new Set(),
    leafSkeletonMap: new Map(),
    totalLeafCount: 0,
    totalLeafChars: 0,
    currentPriorityLeaf: null,
    currentOfflineLeaf: null,
    breadcrumbs: [],
    breadcrumbsRight: [],
    showWelcome: false,
    isLoadingUI: false,
    currentWorld: 'home',
    isArchiveLoading: false,
  })

  // Saveボタン無効理由を計算
  $: saveDisabledReason = $pullProgressInfo
    ? $_('home.leafFetched', {
        values: { fetched: $pullProgressInfo.fetched, total: $pullProgressInfo.total },
      })
    : ''

  // paneState をリアクティブに更新
  $: paneStateStore.set({
    isFirstPriorityFetched,
    isPullCompleted,
    canPush,
    saveDisabledReason,
    selectedIndexLeft,
    selectedIndexRight,
    editingBreadcrumb,
    dragOverNoteId,
    dragOverLeafId,
    loadingLeafIds,
    leafSkeletonMap,
    totalLeafCount,
    totalLeafChars,
    currentPriorityLeaf,
    currentOfflineLeaf,
    breadcrumbs,
    breadcrumbsRight,
    showWelcome,
    isLoadingUI,
    currentWorld: $currentWorld,
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

    // 左ペイン（常に設定）
    const leftPath = buildPath($leftNote, $leftLeaf, $notes, $leftView)
    params.set('left', leftPath)

    // 右ペイン（2ペイン表示時は独立した状態、1ペイン時は左と同じ）
    const rightPath = isDualPane ? buildPath($rightNote, $rightLeaf, $notes, $rightView) : leftPath
    params.set('right', rightPath)

    const newUrl = `?${params.toString()}`
    window.history.pushState({}, '', newUrl)
  }

  function restoreStateFromUrl(alreadyRestoring = false) {
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
          }
        }
      } else if (noteId) {
        const note = $notes.find((f) => f.id === noteId)
        if (note) {
          $leftNote = note
          $leftLeaf = null
          $leftView = 'note'
        }
      } else {
        $leftNote = null
        $leftLeaf = null
        $leftView = 'home'
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

    const leftResolution = resolvePath(leftPath, $notes, $leaves)

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
      const rightResolution = resolvePath(rightPath, $notes, $leaves)

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
  $: ($leftNote, $leftLeaf, $leftView, $rightNote, $rightLeaf, $rightView, updateUrlFromState())

  // 初期化
  onMount(() => {
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
        // 初回Pull実行（handlePull内でdirtyチェック、staleチェックを行う）
        // キャンセル時はIndexedDBから読み込んで操作可能にする
        await handlePull(true, async () => {
          try {
            const savedNotes = await loadNotes()
            const savedLeaves = await loadLeaves()
            notes.set(savedNotes)
            leaves.set(savedLeaves)
            isFirstPriorityFetched = true
            restoreStateFromUrl(false)
          } catch (error) {
            console.error('Failed to load from IndexedDB:', error)
            // 失敗した場合はPullを実行
            await handlePull(true)
          }
        })
      } else {
        // 未設定の場合はウェルカムモーダルを表示
        showWelcome = true
        // GitHub設定が未完了の間は操作をロックしたまま
      }
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
      // PWA終了ガードに到達した場合
      if (isPWAStandalone && e.state?.[PWA_EXIT_GUARD_KEY]) {
        // まずガードを再追加（アプリ終了を防ぐ）
        pushExitGuard()

        // 未保存の変更がある場合は確認ダイアログを表示
        if (get(hasAnyChanges)) {
          showConfirm($_('modal.exitApp'), () => {
            // ユーザーが終了を選択：ガードを削除してもう一度戻る
            history.go(-2) // ガード + 1つ前のエントリを削除
          })
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
      if (get(hasAnyChanges)) {
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        const elapsed = now - lastVisibleTime
        if (elapsed > BACKGROUND_THRESHOLD_MS) {
          console.log(`PWA was in background for ${Math.round(elapsed / 1000)}s, reloading...`)
          // 未保存の変更がある場合は確認
          if (get(hasAnyChanges)) {
            // 確認ダイアログを表示せずに、ユーザーに通知だけする
            showPushToast(
              $_('toast.longBackgroundWarning') ||
                'アプリが長時間バックグラウンドにあったため、再読み込みが必要です',
              'error'
            )
          } else {
            // 未保存の変更がなければ自動リロード
            window.location.reload()
          }
        }
        lastVisibleTime = now
      } else {
        lastVisibleTime = Date.now()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 自動Push機能（前回Pushから5分経過 + ダーティありの場合）
    const AUTO_PUSH_INTERVAL_MS = 5 * 60 * 1000 // 5分
    const AUTO_PUSH_CHECK_INTERVAL_MS = 30 * 1000 // 30秒ごとにチェック

    const autoPushIntervalId = setInterval(async () => {
      // バックグラウンドでは実行しない
      if (document.visibilityState !== 'visible') return

      // GitHub設定がなければスキップ
      if (!$githubConfigured) return

      // Push/Pull中はスキップ
      if ($isPulling || $isPushing) return

      // ダーティがなければスキップ
      if (!get(hasAnyChanges)) return

      // 前回Pushから5分経過していなければスキップ
      const now = Date.now()
      const lastPush = get(lastPushTime)
      if (lastPush > 0 && now - lastPush < AUTO_PUSH_INTERVAL_MS) return

      // 初回Pullが完了していなければスキップ
      if (!isFirstPriorityFetched) return

      console.log('Auto-push triggered')

      // staleチェックを実行
      try {
        const stale = await checkIfStaleEdit($settings, get(lastPulledPushCount))
        if (stale) {
          // staleの場合はPullボタンに赤丸を表示してPushしない
          isStale.set(true)
          showPushToast($_('toast.staleAutoSave'), 'error')
          return
        }
      } catch (e) {
        // チェック失敗時はPushを続行
        console.warn('Stale check failed, continuing with auto-push:', e)
      }

      // 自動Push実行
      await handleSaveToGitHub()
    }, AUTO_PUSH_CHECK_INTERVAL_MS)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('resize', updateDualPane)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(autoPushIntervalId)
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
    // デバウンス保存: 既存のタイマーをクリアして新しいタイマーを設定
    if (offlineSaveTimeoutId) {
      clearTimeout(offlineSaveTimeoutId)
    }
    offlineSaveTimeoutId = setTimeout(() => {
      const current = $offlineLeafStore
      const leaf = createOfflineLeaf(current.content, current.badgeIcon, current.badgeColor)
      leaf.updatedAt = current.updatedAt
      saveOfflineLeaf(leaf)
      offlineSaveTimeoutId = null
    }, 500) // 500msのデバウンス
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
    const state = getNavState()
    nav.selectLeaf(state, getNavDeps(), leaf, pane)
    syncNavState(state)
  }

  async function handleSearchResultClick(result: SearchMatch) {
    if (result.matchType === 'note') {
      // ノートマッチ: ノートビューを開く
      const note = $notes.find((n) => n.id === result.noteId)
      if (note) {
        selectNote(note, 'left')
      }
    } else {
      // リーフタイトル/本文マッチ: リーフを開いて該当行にジャンプ
      const leaf = $leaves.find((l) => l.id === result.leafId)
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

  function handleDisabledSaveClick(reason: string) {
    // reasonが空でもsaveDisabledReasonを使う
    const message = reason || saveDisabledReason
    if (message) {
      showPushToast(message)
    }
  }

  // ========================================
  // ワールド切り替え・アーカイブ/リストア
  // ========================================

  async function handleWorldChange(world: WorldType) {
    if (world === $currentWorld) return

    // アーカイブに切り替える場合、未ロードならPull
    if (world === 'archive' && !$isArchiveLoaded) {
      // トークンが設定されている場合のみPullを試行
      if ($settings.token && $settings.repoName) {
        isArchiveLoading = true
        try {
          const result = await pullArchive($settings)
          if (result.success) {
            archiveNotes.set(result.notes)
            archiveLeaves.set(result.leaves)
            archiveMetadata.set(result.metadata)
            isArchiveLoaded.set(true)
          } else {
            // Pull失敗してもアーカイブに切り替えは許可（空のアーカイブを表示）
            showPullToast(translateGitHubMessage(result.message, $_, result.rateLimitInfo), 'error')
          }
        } catch (e) {
          console.error('Archive pull failed:', e)
          showPullToast($_('toast.pullFailed'), 'error')
        } finally {
          isArchiveLoading = false
        }
      }
      // トークンがなくてもアーカイブに切り替えは許可（空のアーカイブを表示）
    }

    // ワールドを切り替え
    currentWorld.set(world)
    // ホームに戻る
    goHome('left')
    refreshBreadcrumbs()
  }

  function archiveNote(pane: Pane) {
    const note = pane === 'left' ? $leftNote : $rightNote
    if (!note) return

    // 確認ダイアログ（左下に表示）
    showConfirm(
      $_('modal.archiveNote') || 'Archive this note?',
      async () => {
        await moveNoteToWorld(note, 'archive')
      },
      'bottom-left'
    )
  }

  function archiveLeaf(pane: Pane) {
    const leaf = pane === 'left' ? $leftLeaf : $rightLeaf
    if (!leaf) return

    showConfirm(
      $_('modal.archiveLeaf') || 'Archive this leaf?',
      async () => {
        await moveLeafToWorld(leaf, 'archive')
      },
      'bottom-left'
    )
  }

  function restoreNote(pane: Pane) {
    const note = pane === 'left' ? $leftNote : $rightNote
    if (!note) return

    showConfirm(
      $_('modal.restoreNote') || 'Restore this note to Home?',
      async () => {
        await moveNoteToWorld(note, 'home')
      },
      'bottom-left'
    )
  }

  function restoreLeaf(pane: Pane) {
    const leaf = pane === 'left' ? $leftLeaf : $rightLeaf
    if (!leaf) return

    showConfirm(
      $_('modal.restoreLeaf') || 'Restore this leaf to Home?',
      async () => {
        await moveLeafToWorld(leaf, 'home')
      },
      'bottom-left'
    )
  }

  async function moveNoteToWorld(note: Note, targetWorld: WorldType) {
    // アーカイブへの移動時、アーカイブがロードされていない場合は先にPull
    if (targetWorld === 'archive' && !$isArchiveLoaded) {
      if ($settings.token && $settings.repoName) {
        isArchiveLoading = true
        try {
          const result = await pullArchive($settings)
          if (result.success) {
            archiveNotes.set(result.notes)
            archiveLeaves.set(result.leaves)
            archiveMetadata.set(result.metadata)
            isArchiveLoaded.set(true)
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

    const sourceWorld = $currentWorld
    const sourceNotes = sourceWorld === 'home' ? $notes : $archiveNotes
    const sourceLeaves = sourceWorld === 'home' ? $leaves : $archiveLeaves

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
    let currentTargetNotes = targetWorld === 'home' ? [...$notes] : [...$archiveNotes]
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
    if (siblingsInTarget.some((n) => n.name === noteToMove.name)) {
      await showAlert($_('modal.duplicateNoteDestination'))
      return
    }

    // ノートとその子ノート、リーフを収集
    const childNotes = sourceNotes.filter((n) => n.parentId === note.id)
    const notesToMove = [noteToMove, ...childNotes]
    const noteIds = new Set(notesToMove.map((n) => n.id))
    const leavesToMove = sourceLeaves.filter((l) => noteIds.has(l.noteId))

    // ソースから削除
    const newSourceNotes = sourceNotes.filter((n) => !noteIds.has(n.id))
    const newSourceLeaves = sourceLeaves.filter((l) => !noteIds.has(l.noteId))

    // ターゲットに追加（階層を保持してparentIdを更新）
    const targetSiblings = currentTargetNotes.filter((n) => n.parentId === targetParentId)
    const maxOrder = Math.max(0, ...targetSiblings.map((n) => n.order))
    const movedNote: Note = { ...noteToMove, parentId: targetParentId, order: maxOrder + 1 }
    // 子ノートはparentIdを維持（移動するノートのIDは変わらないので）
    const movedChildNotes = childNotes.map((n) => ({ ...n }))
    const newTargetNotes = [...currentTargetNotes, movedNote, ...movedChildNotes]
    const targetLeaves = targetWorld === 'home' ? $leaves : $archiveLeaves
    const newTargetLeaves = [...targetLeaves, ...leavesToMove]

    // ストアを更新
    if (sourceWorld === 'home') {
      updateNotes(newSourceNotes)
      updateLeaves(newSourceLeaves)
    } else {
      archiveNotes.set(newSourceNotes)
      archiveLeaves.set(newSourceLeaves)
    }

    if (targetWorld === 'home') {
      updateNotes(newTargetNotes)
      updateLeaves(newTargetLeaves)
    } else {
      archiveNotes.set(newTargetNotes)
      archiveLeaves.set(newTargetLeaves)
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

    // 移動したノートを開いていた両ペインをホームに遷移
    const checkPane = (paneToCheck: Pane) => {
      const currentNote = paneToCheck === 'left' ? $leftNote : $rightNote
      const currentLeaf = paneToCheck === 'left' ? $leftLeaf : $rightLeaf
      if (
        currentNote?.id === note.id ||
        noteIds.has(currentNote?.id ?? '') ||
        (currentLeaf && noteIds.has(currentLeaf.noteId))
      ) {
        goHome(paneToCheck)
      }
    }
    checkPane('left')
    checkPane('right')
    refreshBreadcrumbs()
    rebuildLeafStats($leaves, $notes)
  }

  async function moveLeafToWorld(leaf: Leaf, targetWorld: WorldType) {
    // アーカイブへの移動時、アーカイブがロードされていない場合は先にPull
    if (targetWorld === 'archive' && !$isArchiveLoaded) {
      if ($settings.token && $settings.repoName) {
        isArchiveLoading = true
        try {
          const result = await pullArchive($settings)
          if (result.success) {
            archiveNotes.set(result.notes)
            archiveLeaves.set(result.leaves)
            archiveMetadata.set(result.metadata)
            isArchiveLoaded.set(true)
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

    const sourceWorld = $currentWorld
    const sourceNotes = sourceWorld === 'home' ? $notes : $archiveNotes
    const sourceLeaves = sourceWorld === 'home' ? $leaves : $archiveLeaves
    const targetNotes = targetWorld === 'home' ? $notes : $archiveNotes
    const targetLeaves = targetWorld === 'home' ? $leaves : $archiveLeaves

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
    let currentTargetNotes = targetWorld === 'home' ? [...$notes] : [...$archiveNotes]
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
          archiveNotes.set(currentTargetNotes)
        }
      }
    }

    if (!targetNote) return

    // 同じ名前のリーフがあるかチェック
    const targetLeavesInNote = targetLeaves.filter((l) => l.noteId === targetNote!.id)
    if (targetLeavesInNote.some((l) => l.title === leaf.title)) {
      await showAlert($_('modal.duplicateLeafDestination'))
      return
    }

    // ソースから削除
    const newSourceLeaves = sourceLeaves.filter((l) => l.id !== leaf.id)

    // ターゲットに追加
    const maxOrder = Math.max(0, ...targetLeavesInNote.map((l) => l.order))
    const movedLeaf: Leaf = { ...leaf, noteId: targetNote.id, order: maxOrder + 1 }
    const newTargetLeaves = [...targetLeaves.filter((l) => l.id !== leaf.id), movedLeaf]

    // ストアを更新
    if (sourceWorld === 'home') {
      updateLeaves(newSourceLeaves)
    } else {
      archiveLeaves.set(newSourceLeaves)
    }

    if (targetWorld === 'home') {
      updateLeaves(newTargetLeaves)
    } else {
      archiveLeaves.set(newTargetLeaves)
    }

    // IndexedDBとdirtyフラグを更新
    await saveLeaves(sourceWorld === 'home' ? newSourceLeaves : $leaves)
    isStructureDirty.set(true)

    // スケルトンマップから移動したリーフを削除（Homeからアーカイブ時のみ）
    if (sourceWorld === 'home' && leafSkeletonMap.has(leaf.id)) {
      leafSkeletonMap.delete(leaf.id)
      leafSkeletonMap = new Map(leafSkeletonMap) // リアクティブ更新をトリガー
    }

    // 移動したリーフを開いていた両ペインをホームに遷移
    const checkPane = (paneToCheck: Pane) => {
      const currentLeaf = paneToCheck === 'left' ? $leftLeaf : $rightLeaf
      if (currentLeaf?.id === leaf.id) {
        goHome(paneToCheck)
      }
    }
    checkPane('left')
    checkPane('right')
    refreshBreadcrumbs()
    rebuildLeafStats($leaves, $notes)
  }

  function closeLeaf(pane: Pane) {
    const state = getNavState()
    nav.closeLeaf(state, getNavDeps(), pane)
    syncNavState(state)
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

  // スワイプナビゲーション
  function goToNextSibling(pane: Pane): boolean {
    const state = getNavState()
    const result = nav.goToNextSibling(state, getNavDeps(), pane)
    if (result) {
      syncNavState(state)
    }
    return result
  }

  function goToPrevSibling(pane: Pane): boolean {
    const state = getNavState()
    const result = nav.goToPrevSibling(state, getNavDeps(), pane)
    if (result) {
      syncNavState(state)
    }
    return result
  }

  // パンくずリストからの兄弟選択
  function selectSiblingFromBreadcrumb(id: string, type: 'note' | 'leaf', pane: Pane) {
    if (type === 'note') {
      const note = $notes.find((n) => n.id === id)
      if (note) {
        selectNote(note, pane)
      }
    } else if (type === 'leaf') {
      const leaf = $leaves.find((l) => l.id === id)
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

  // キーボードナビゲーション
  function handleGlobalKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      handleSaveToGitHub()
      return
    }
    const state = getNavState()
    nav.handleGlobalKeyDown(state, getNavDeps(), e, {
      onSwitchPane: (pane) => switchPane(pane),
      onNavigateGrid: (direction) => {
        nav.navigateGrid(state, getNavDeps(), direction)
        syncNavState(state)
      },
      onOpenSelectedItem: () => nav.openSelectedItem(state, getNavDeps(), selectLeaf, selectNote),
      onGoBackToParent: () => {
        nav.goBackToParent(state, getNavDeps())
        syncNavState(state)
      },
    })
  }

  async function goSettings() {
    // 仕様: 設定ボタンを押したときに全リーフをGitHubにPush
    await handleSaveToGitHub()
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

  // パンくずリスト（左右共通）- breadcrumbs.tsに移動

  function startEditingBreadcrumb(crumb: Breadcrumb) {
    if (crumb.type === 'home' || crumb.type === 'settings') return
    editingBreadcrumb = crumb.id
  }

  function refreshBreadcrumbs() {
    breadcrumbs = buildBreadcrumbs(
      $leftView,
      $leftNote,
      $leftLeaf,
      $notes,
      'left',
      goHome,
      selectNote,
      $leaves
    )
    breadcrumbsRight = buildBreadcrumbs(
      $rightView,
      $rightNote,
      $rightLeaf,
      $notes,
      'right',
      goHome,
      selectNote,
      $leaves
    )
  }

  function saveEditBreadcrumb(id: string, newName: string, type: Breadcrumb['type']) {
    const trimmed = newName.trim()
    if (!trimmed) return

    // 右ペインのパンくずリストかどうかを判定
    const isRight = id.endsWith('-right')
    const actualId = isRight ? id.replace('-right', '') : id

    if (type === 'note') {
      const currentNote = $notes.find((f) => f.id === actualId)
      const siblingWithSameName = $notes.find(
        (n) =>
          n.id !== actualId &&
          (n.parentId || null) === (currentNote?.parentId || null) &&
          n.name.trim() === trimmed
      )
      if (siblingWithSameName) {
        showAlert($_('modal.duplicateNoteSameLevel'))
        return
      }
      if (currentNote && currentNote.name === trimmed) {
        refreshBreadcrumbs()
        editingBreadcrumb = null
        return
      }
      updateNoteNameLib(actualId, trimmed)
      const updatedNote = $notes.find((f) => f.id === actualId)
      if (updatedNote) {
        if ($leftNote?.id === actualId) {
          $leftNote = updatedNote
        }
        if (isRight && $rightNote?.id === actualId) {
          $rightNote = updatedNote
        }
      }
      if (!$notes.some((f) => f.id === $leftNote?.id)) {
        $leftNote = null
      }
      if (isRight && !$notes.some((f) => f.id === $rightNote?.id)) {
        $rightNote = null
      }
    } else if (type === 'leaf') {
      const allLeaves = $leaves
      const targetLeaf = allLeaves.find((n) => n.id === actualId)
      const siblingLeafWithSameName = allLeaves.find(
        (l) => l.id !== actualId && l.noteId === targetLeaf?.noteId && l.title.trim() === trimmed
      )
      if (siblingLeafWithSameName) {
        showAlert($_('modal.duplicateLeafSameNote'))
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

      const updatedLeaves = allLeaves.map((n) =>
        n.id === actualId
          ? { ...n, title: trimmed, content: updatedContent, updatedAt: Date.now() }
          : n
      )
      updateLeaves(updatedLeaves)

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
      if (!$leaves.some((n) => n.id === $leftLeaf?.id)) {
        $leftLeaf = null
      }
      if (isRight && !$leaves.some((n) => n.id === $rightLeaf?.id)) {
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
      const position = pane === 'left' ? 'bottom-left' : 'bottom-right'
      showPrompt(
        $_('footer.newNote'),
        (inputName) => {
          createNoteLib({
            parentId,
            pane,
            isOperationsLocked: !isFirstPriorityFetched,
            translate: $_,
            name: inputName,
          })
        },
        '',
        position
      )
    } else {
      createNoteLib({
        parentId,
        pane,
        isOperationsLocked: !isFirstPriorityFetched,
        translate: $_,
        name,
      })
    }
  }

  function deleteNote(pane: Pane) {
    const targetNote = pane === 'left' ? $leftNote : $rightNote
    if (!targetNote) return

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

  // ノートバッジ更新（notes.tsに委譲）
  const updateNoteBadge = updateNoteBadgeLib

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

    const updatedNotes = reorderItems(draggedNote, targetNote, $notes, (n) =>
      draggedNote!.parentId ? n.parentId === draggedNote!.parentId : !n.parentId
    )

    updateNotes(updatedNotes)
    dragStore.endDragNote()
  }

  // リーフ管理（leaves.tsに委譲）
  function createLeaf(pane: Pane, title?: string) {
    const targetNote = pane === 'left' ? $leftNote : $rightNote
    if (!targetNote) return

    if (!title) {
      // タイトルが指定されていない場合はモーダルで入力を求める
      const position = pane === 'left' ? 'bottom-left' : 'bottom-right'
      showPrompt(
        $_('footer.newLeaf'),
        (inputTitle) => {
          const newLeaf = createLeafLib({
            targetNote,
            pane,
            isOperationsLocked: !isFirstPriorityFetched,
            title: inputTitle,
          })
          if (newLeaf) {
            leafStatsStore.addLeaf(newLeaf.id, newLeaf.content)
            selectLeaf(newLeaf, pane)
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
        title,
      })
      if (newLeaf) {
        leafStatsStore.addLeaf(newLeaf.id, newLeaf.content)
        selectLeaf(newLeaf, pane)
      }
    }
  }

  function deleteLeaf(leafId: string, pane: Pane) {
    const otherLeaf = pane === 'left' ? $rightLeaf : $leftLeaf
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

  function updateLeafContent(content: string, leafId: string) {
    // オフラインリーフは専用の自動保存処理
    if (isOfflineLeaf(leafId)) {
      updateOfflineContent(content)
      // 左右ペインのリーフはcurrentOfflineLeafから自動更新されるので不要
      return
    }

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

  function updateLeafBadge(leafId: string, badgeIcon: string, badgeColor: string) {
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

    const updatedLeaves = reorderItems(
      draggedLeaf,
      targetLeaf,
      $leaves,
      (l) => l.noteId === draggedLeaf!.noteId
    )

    updateLeaves(updatedLeaves)
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
      moveLeafTo(destNoteId, state.targetLeaf)
    } else if (state.targetNote) {
      moveNoteTo(destNoteId, state.targetNote)
    }
  }

  function moveLeafTo(destNoteId: string | null, targetLeaf: Leaf) {
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
      showPushToast('移動しました', 'success')
    }
    closeMoveModal()
  }

  function moveNoteTo(destNoteId: string | null, targetNote: Note) {
    const result = moveNoteToLib(targetNote, destNoteId, $_)
    if (result.success && result.updatedNote) {
      if ($leftNote?.id === targetNote.id) $leftNote = result.updatedNote
      if ($rightNote?.id === targetNote.id) $rightNote = result.updatedNote
      showPushToast('移動しました', 'success')
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
  async function handleSaveToGitHub() {
    // 交通整理: Push不可なら何もしない
    if (!canSync($isPulling, $isPushing).canPush) return

    $isPushing = true
    try {
      // stale編集かどうかチェック
      const isStale = await checkIfStaleEdit($settings, get(lastPulledPushCount))
      if (isStale) {
        // staleの場合は確認ダイアログを表示
        $isPushing = false
        showConfirm($_('modal.staleEdit'), () => executePushInternal())
        return
      }

      // staleでなければそのままPush
      await executePushInternal()
    } catch (e) {
      console.error('Push check failed:', e)
      // チェック失敗時もPushを続行
      await executePushInternal()
    } finally {
      $isPushing = false
    }
  }

  async function executePushInternal() {
    $isPushing = true
    try {
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
        clearAllChanges()
        lastPushTime.set(Date.now()) // 自動Push用に最終Push時刻を記録
        // 実際にPushが行われた場合のみpushCountを+1（noChangesでスキップ時は更新しない）
        // changedLeafCount > 0 または metadataOnlyChanged の場合にPushが実際に行われた
        const actuallyPushed =
          (result.changedLeafCount && result.changedLeafCount > 0) || result.metadataOnlyChanged
        if (actuallyPushed) {
          lastPulledPushCount.update((n) => n + 1)
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

        const result = await processImportFile(file, {
          existingNoteNames: allNotes.map((n) => n.name),
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
        updateNotes([...allNotes, newNote])
        updateLeaves([...allLeaves, reportLeaf, ...importedLeaves])

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
        archiveNotes.set(result.archiveNotes)
        archiveLeaves.set(result.archiveLeaves)
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

    // 選択テキストがあればそれをダウンロード
    const editorView = pane === 'left' ? leftEditorView : rightEditorView
    if (editorView && editorView.getSelectedText) {
      const selectedText = editorView.getSelectedText()
      if (selectedText) {
        const targetLeaf = $leaves.find((l) => l.id === leafId)
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
    downloadLeafAsMarkdownLib(leafId, !isFirstPriorityFetched, $_)
  }

  // プレビューを画像としてダウンロード
  async function downloadLeafAsImage(leafId: string, pane: Pane) {
    if (!isFirstPriorityFetched) {
      showPushToast('初回Pullが完了するまでダウンロードできません', 'error')
      return
    }

    const allLeaves = $leaves
    const targetLeaf = allLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return

    try {
      const previewView = pane === 'left' ? leftPreviewView : rightPreviewView
      if (previewView && previewView.captureAsImage) {
        await previewView.captureAsImage(targetLeaf.title)
        showPushToast($_('toast.imageDownloaded'), 'success')
      }
    } catch (error) {
      console.error('画像ダウンロードに失敗しました:', error)
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
    handleSaveToGitHub,
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

    // 無効なSaveボタンがクリックされたとき
    handleDisabledSaveClick,

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
    await handlePull(false)
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

  async function handlePull(isInitialStartup = false, onCancel?: () => void) {
    // 交通整理: Pull/Push中は不可
    if (!canSync($isPulling, $isPushing).canPull) return

    // 未保存の変更がある場合は確認（PWA強制終了後の再起動も考慮）
    if (get(hasAnyChanges) || getPersistedDirtyFlag()) {
      const message = isInitialStartup
        ? $_('modal.unsavedChangesOnStartup')
        : $_('modal.unsavedChanges')
      showConfirm(message, () => executePullInternal(isInitialStartup), onCancel)
      return
    }

    // staleチェック（比較対象は常にある：初期値0 vs リモート）
    // 空リポジトリ(metadata.jsonなし)の場合は-1が返り、stale=trueになる
    const isStale = await checkIfStaleEdit($settings, get(lastPulledPushCount))
    if (!isStale) {
      showPullToast($_('github.noRemoteChanges'), 'success')
      return
    }

    await executePullInternal(isInitialStartup)
  }

  async function executePullInternal(isInitial: boolean) {
    isLoadingUI = true
    isFirstPriorityFetched = false
    isPullCompleted = false
    $isPulling = true // Pull処理中はURL更新をスキップ

    // Pull開始を通知
    showPullToast('Pullします')

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
        if (isInitial) {
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
      // ただし、Pull中にユーザーが編集したリーフのisDirtyとcontentは保持する
      const currentLeaves = get(leaves)
      const dirtyLeafMap = new Map(currentLeaves.filter((l) => l.isDirty).map((l) => [l.id, l]))
      const sortedLeaves = result.leaves
        .sort((a, b) => a.order - b.order)
        .map((leaf) => {
          const dirtyLeaf = dirtyLeafMap.get(leaf.id)
          if (dirtyLeaf) {
            // ユーザーが編集したリーフは、編集内容とダーティ状態を保持
            return { ...leaf, content: dirtyLeaf.content, isDirty: true }
          }
          return leaf
        })
      leaves.set(sortedLeaves)
      rebuildLeafStats(sortedLeaves, result.notes)

      // stale編集検出用にpushCountを記録
      lastPulledPushCount.set(result.metadata.pushCount)

      // IndexedDBに保存（isDirtyをセットしないように直接保存）
      saveNotes(result.notes).catch((err) => console.error('Failed to persist notes:', err))
      saveLeaves(sortedLeaves).catch((err) => console.error('Failed to persist leaves:', err))

      // Pull成功時はGitHubと同期したのでダーティフラグをクリア
      // ただし、Pull中にユーザーが編集した場合はクリアしない
      await tick()
      if (!get(hasAnyChanges)) {
        clearAllChanges()
      }
      isStale.set(false) // Pullしたのでstale状態を解除
    } else {
      // Pull失敗時: バックアップからデータを復元
      if (hasBackupData) {
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
    $isPulling = false // Pull処理完了
    pullProgressStore.reset() // Pull進捗リセット
  }

  // HMR用の一時保存キー
  const HMR_OFFLINE_KEY = 'agasteer_hmr_offline'

  // HMR時にオフラインリーフをlocalStorageに一時保存（同期的に完了するため）
  function flushOfflineSaveSync() {
    if (offlineSaveTimeoutId) {
      clearTimeout(offlineSaveTimeoutId)
      offlineSaveTimeoutId = null
    }
    const current = get(offlineLeafStore)
    if (current.content || current.badgeIcon || current.badgeColor) {
      // localStorageに同期的に保存（IndexedDBは非同期なのでHMRに間に合わない）
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
        goHome('left')
        goHome('right')
      }}
      onSettingsClick={() => {
        goSettings()
      }}
      onPull={() => handlePull(false)}
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
      {isDualPane}
      onSwapPanes={swapPanes}
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
      notes={$currentWorld === 'archive' ? $archiveNotes : $notes}
      targetNote={moveTargetNote}
      targetLeaf={moveTargetLeaf}
      pane={moveTargetPane}
      currentWorld={$currentWorld}
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
  </div>
{/if}
