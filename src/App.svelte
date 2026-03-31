<script lang="ts">
  import './App.css'
  import { onMount, tick, setContext } from 'svelte'

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
    lastPulledPushCount,
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
    scheduleOfflineSave,
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
  import { saveOfflineLeaf, setPwaInstallDismissedAt } from './lib/data'
  import { applyTheme } from './lib/ui'
  import { pullArchive, translateGitHubMessage } from './lib/api'
  // LeafSkeleton type moved to app-state.svelte.ts
  import { _, locale } from './lib/i18n'

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
  } from './lib/actions/git'
  import {
    moveNoteToWorld as moveNoteToWorldAction,
    moveLeafToWorld as moveLeafToWorldAction,
    moveLeafTo as moveLeafToAction,
    moveNoteTo as moveNoteToAction,
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
  } from './lib/actions/crud'
  import {
    exportNotesAsZip as exportNotesAsZipAction,
    handleImportFromOtherApps as handleImportFromOtherAppsAction,
    handleAgasteerImport as handleAgasteerImportAction,
    downloadLeafAsMarkdown as downloadLeafAsMarkdownAction,
    downloadLeafAsImage as downloadLeafAsImageAction,
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
    // Phase 2: App state & derived state
    appState,
    derivedState,
    // Phase 3: App actions registry
    registerAppActions,
    // Phase 4: initApp
    initApp,
  } from './lib/app-state.svelte'

  // ========================================
  // Non-reactive local variables (not $state)
  // ========================================
  let isClosingSettingsPull = false
  let repoChangedInSettings = false // 設定画面でリポが変更された

  // PWA終了ガードにいるかどうかのフラグ（appState.atGuardEntry に移動済み）

  // Pushボタン無効理由を計算（$_はsvelte-i18nストアで.svelte内でのみ使用可能）
  let pushDisabledReason = $derived(
    derivedState.pullProgressData
      ? $_('home.leafFetched', {
          values: {
            fetched: derivedState.pullProgressData.fetched,
            total: derivedState.pullProgressData.total,
          },
        })
      : ''
  )

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

  function handleLeftScroll(scrollTop: number, scrollHeight: number) {
    handlePaneScroll('left', scrollTop, scrollHeight)
  }

  function handleRightScroll(scrollTop: number, scrollHeight: number) {
    handlePaneScroll('right', scrollTop, scrollHeight)
  }

  $effect(() => {
    appState.breadcrumbs = buildBreadcrumbs(
      leftView.value,
      leftNote.value,
      leftLeaf.value,
      derivedState.leftBreadcrumbNotes,
      'left',
      goHome,
      selectNote,
      derivedState.leftBreadcrumbLeaves
    )
  })
  $effect(() => {
    appState.breadcrumbsRight = buildBreadcrumbs(
      rightView.value,
      rightNote.value,
      rightLeaf.value,
      derivedState.rightBreadcrumbNotes,
      'right',
      goHome,
      selectNote,
      derivedState.rightBreadcrumbLeaves
    )
  })
  $effect(() => {
    document.title = settings.value.toolName
  })

  // ========================================
  // Context API によるペイン間の状態共有
  // ========================================

  // paneState をリアクティブに更新
  $effect(() => {
    paneStateStore.value = {
      isFirstPriorityFetched: appState.isFirstPriorityFetched,
      isPullCompleted: appState.isPullCompleted,
      canPush: derivedState.canPush,
      pushDisabledReason,
      selectedIndexLeft: appState.selectedIndexLeft,
      selectedIndexRight: appState.selectedIndexRight,
      editingBreadcrumb: appState.editingBreadcrumb,
      dragOverNoteId: derivedState.dragOverNoteId,
      dragOverLeafId: derivedState.dragOverLeafId,
      loadingLeafIds: appState.loadingLeafIds,
      leafSkeletonMap: appState.leafSkeletonMap,
      totalLeafCount: derivedState.totalLeafCount,
      totalLeafChars: derivedState.totalLeafChars,
      lastPulledPushCount: lastPulledPushCount.value,
      currentPriorityLeaf: derivedState.currentPriorityLeaf,
      currentOfflineLeaf: derivedState.currentOfflineLeaf,
      breadcrumbs: appState.breadcrumbs,
      breadcrumbsRight: appState.breadcrumbsRight,
      showWelcome: appState.showWelcome,
      isLoadingUI: appState.isLoadingUI,
      leftWorld: leftWorld.value,
      rightWorld: rightWorld.value,
      isArchiveLoading: appState.isArchiveLoading,
    }
  })

  // Context に設定
  setContext('paneState', paneStateStore)

  function updateUrlFromState() {
    // 初期化完了まで、URL更新をスキップ
    if (appState.isRestoringFromUrl || isPulling.value || !appState.isFirstPriorityFetched) {
      return
    }

    const params = new URLSearchParams()

    // 左ペインのノートデータ（ワールドに応じて切り替え）
    const leftNotes = _getNotesForWorld(leftWorld.value, notes.value, archiveNotes.value)
    // 右ペインのノートデータ
    const rightNotes = _getNotesForWorld(rightWorld.value, notes.value, archiveNotes.value)

    // 左ペイン（常に設定、ワールド情報を含む）
    const leftPath = buildPath(
      leftNote.value,
      leftLeaf.value,
      leftNotes,
      leftView.value,
      leftWorld.value
    )
    params.set('left', leftPath)

    // 右ペイン（2ペイン表示時は独立した状態、1ペイン時は左と同じ）
    const rightPath = appState.isDualPane
      ? buildPath(rightNote.value, rightLeaf.value, rightNotes, rightView.value, rightWorld.value)
      : leftPath
    params.set('right', rightPath)

    const newUrl = `?${params.toString()}`
    window.history.pushState({}, '', newUrl)
    appState.atGuardEntry = false
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

    // 左ペインの復元
    if (!leftPath) {
      leftPath = '/'
    }

    // ワールドを判定
    const leftWorldInfo = extractWorldPrefix(leftPath)
    const rightWorldInfo = rightPath ? extractWorldPrefix(rightPath) : { world: 'home' as const }

    // アーカイブが必要だが未ロードの場合、先にPullする
    const needsArchive = leftWorldInfo.world === 'archive' || rightWorldInfo.world === 'archive'
    if (needsArchive && !isArchiveLoaded.value && settings.value.token && settings.value.repoName) {
      appState.isArchiveLoading = true
      archiveLeafStatsStore.reset()
      try {
        const result = await pullArchive(settings.value, {
          onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
        })
        if (result.success) {
          archiveNotes.value = result.notes
          archiveLeaves.value = result.leaves
          archiveMetadata.value = result.metadata
          isArchiveLoaded.value = true
          // Archive部分のベースラインのみ更新（Home側に影響しない）
          setArchiveBaseline(result.notes, result.leaves)
        }
      } catch (e) {
        console.error('Archive pull failed during URL restore:', e)
      } finally {
        appState.isArchiveLoading = false
      }
    }

    // 左ペインのデータ（アーカイブのPull後のデータを使用）
    const leftNotesData = _getNotesForWorld(leftWorldInfo.world, notes.value, archiveNotes.value)
    const leftLeavesData = _getLeavesForWorld(
      leftWorldInfo.world,
      leaves.value,
      archiveLeaves.value
    )

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

    // 右ペインの復元（2ペイン表示時のみ）
    if (rightPath && appState.isDualPane) {
      // 右ペインのデータ（アーカイブのPull後のデータを使用）
      const rightNotesData = _getNotesForWorld(
        rightWorldInfo.world,
        notes.value,
        archiveNotes.value
      )
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
      // 1ペイン表示時は右ペインを左と同じにする
      rightNote.value = leftNote.value
      rightLeaf.value = leftLeaf.value
      rightView.value = leftView.value
      rightWorld.value = leftWorld.value
    }

    if (!alreadyRestoring) {
      appState.isRestoringFromUrl = false
    }
  }

  // ペインの状態変更をURLに反映
  $effect(() => {
    leftNote.value
    leftLeaf.value
    leftView.value
    leftWorld.value
    rightNote.value
    rightLeaf.value
    rightView.value
    rightWorld.value
    updateUrlFromState()
  })

  // 初期化（ロジックは app-state.svelte.ts の initApp() に抽出済み）
  onMount(() => {
    return initApp({
      pullFromGitHub,
      pushToGitHub,
      restoreStateFromUrl,
      handleGlobalKeyDown,
    })
  })

  // ========================================
  // ナビゲーション制御（navigation.ts を使用）
  // ========================================

  // ナビゲーション状態を取得する関数
  function getNavState(): nav.NavigationState {
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

  // 公開ナビゲーション関数（navigation.tsのラッパー）
  function goHome(pane: Pane) {
    const state = getNavState()
    nav.goHome(state, getNavDeps(), pane)
    syncNavState(state)
  }

  function openPriorityView(pane: Pane) {
    // 優先段落を集約した仮想リーフを生成（ホーム直下なのでnoteはnull）
    const items = priorityItems.value
    const priorityLeaf = createPriorityLeaf(items)

    if (pane === 'left') {
      leftNote.value = null
      leftLeaf.value = priorityLeaf
      leftView.value = 'preview' // 読み取り専用なのでプレビューで開く
    } else {
      rightNote.value = null
      rightLeaf.value = priorityLeaf
      rightView.value = 'preview'
    }
  }

  function openOfflineView(pane: Pane) {
    // オフラインリーフを開く（編集可能）
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

  function updateOfflineBadge(icon: string, color: string) {
    offlineLeafStore.value = { ...offlineLeafStore.value, badgeIcon: icon, badgeColor: color }
    // バッジ変更は即座に保存
    const leaf = createOfflineLeaf(offlineLeafStore.value.content, icon, color)
    saveOfflineLeaf(leaf)
  }

  function updateOfflineContent(content: string) {
    const now = Date.now()
    offlineLeafStore.value = { ...offlineLeafStore.value, content, updatedAt: now }
    // 共通の自動保存機構を使用（1秒後に保存）
    scheduleOfflineSave()
  }

  function navigateToLeafFromPriority(leafId: string, pane: Pane) {
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

  async function handleSearchResultClick(result: SearchMatch) {
    // アーカイブからの検索結果の場合、ワールドを切り替える
    const targetNotes = result.world === 'archive' ? archiveNotes.value : notes.value
    const targetLeaves = result.world === 'archive' ? archiveLeaves.value : leaves.value

    // ワールドを適切に設定
    if (result.world === 'archive') {
      leftWorld.value = 'archive'
    } else {
      leftWorld.value = 'home'
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
        if (appState.leftEditorView && appState.leftEditorView.scrollToLine) {
          appState.leftEditorView.scrollToLine(result.line)
        }
      } else {
        const leaf = targetLeaves.find((l) => l.id === result.leafId)
        if (leaf) {
          selectLeaf(leaf, 'left')
          // DOM更新を待ってから行ジャンプ
          await tick()
          if (appState.leftEditorView && appState.leftEditorView.scrollToLine) {
            appState.leftEditorView.scrollToLine(result.line)
          }
        }
      }
    }
  }

  async function handlePriorityLinkClick(leafId: string, line: number, pane: Pane) {
    const leaf = leaves.value.find((l) => l.id === leafId)
    if (leaf) {
      selectLeaf(leaf, pane)
      // エディタのマウント完了を待つ（tick()だけでは不十分）
      await tick()
      await new Promise((resolve) => setTimeout(resolve, 100))
      const editorView = pane === 'left' ? appState.leftEditorView : appState.rightEditorView
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
    const currentPaneWorld = pane === 'left' ? leftWorld.value : rightWorld.value
    if (world === currentPaneWorld) return

    // Pull/Push中またはアーカイブロード中はワールド切り替えを禁止
    if (isPulling.value || isPushing.value || appState.isArchiveLoading) return

    // 先にワールドを切り替え（ペインごとに独立）
    if (pane === 'left') {
      leftWorld.value = world
    } else {
      rightWorld.value = world
    }
    // ホームに戻る
    goHome(pane)
    refreshBreadcrumbs()

    // アーカイブに切り替える場合、未ロード＆ロード中でなければPull（バックグラウンドで実行）
    if (world === 'archive' && !isArchiveLoaded.value && !appState.isArchiveLoading) {
      // トークンが設定されている場合のみPullを試行
      if (settings.value.token && settings.value.repoName) {
        appState.isArchiveLoading = true
        archiveLeafStatsStore.reset()
        try {
          const result = await pullArchive(settings.value, {
            onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
          })
          if (result.success) {
            archiveNotes.value = result.notes
            archiveLeaves.value = result.leaves
            archiveMetadata.value = result.metadata
            isArchiveLoaded.value = true
            // Archive部分のベースラインのみ更新（Home側に影響しない）
            setArchiveBaseline(result.notes, result.leaves)
          } else {
            showPullToast(translateGitHubMessage(result.message, $_, result.rateLimitInfo), 'error')
          }
        } catch (e) {
          console.error('Archive pull failed:', e)
          showPullToast($_('toast.pullFailed'), 'error')
        } finally {
          appState.isArchiveLoading = false
        }
      }
    }
  }

  async function archiveNote(pane: Pane) {
    const note = pane === 'left' ? leftNote.value : rightNote.value
    if (!note) return

    const position = getDialogPositionForPane(pane)
    const confirmed = await confirmAsync($_('modal.archiveNote') || 'Archive this note?', position)
    if (confirmed) {
      await moveNoteToWorld(note, 'archive', pane)
    }
  }

  async function archiveLeaf(pane: Pane) {
    const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
    if (!leaf) return

    const position = getDialogPositionForPane(pane)
    const confirmed = await confirmAsync($_('modal.archiveLeaf') || 'Archive this leaf?', position)
    if (confirmed) {
      await moveLeafToWorld(leaf, 'archive', pane)
    }
  }

  async function restoreNote(pane: Pane) {
    const note = pane === 'left' ? leftNote.value : rightNote.value
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
    const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
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
    return moveNoteToWorldAction(note, targetWorld, pane)
  }

  async function moveLeafToWorld(leaf: Leaf, targetWorld: WorldType, pane: Pane) {
    return moveLeafToWorldAction(leaf, targetWorld, pane)
  }

  function closeLeaf(pane: Pane) {
    const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
    if (!leaf) return

    // ペインのワールドに応じたノートを取得
    const paneNotes = getNotesForPane(pane)
    const parentNote = paneNotes.find((n) => n.id === leaf.noteId)

    if (parentNote) {
      // リーフから親ノートに戻る
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

  function switchPane(pane: Pane) {
    const state = getNavState()
    nav.switchPane(state, getNavDeps(), pane)
    syncNavState(state)
  }

  function togglePreview(pane: Pane) {
    // プライオリティリーフは編集不可（プレビュー専用）
    const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
    if (leaf && isPriorityLeaf(leaf.id)) return

    const state = getNavState()
    nav.togglePreview(state, getNavDeps(), pane)
    syncNavState(state)
    updateUrlFromState()
  }

  // スワイプナビゲーション（ペインのワールドに対応）
  function goToNextSibling(pane: Pane): boolean {
    const view = pane === 'left' ? leftView.value : rightView.value
    const currentNote = pane === 'left' ? leftNote.value : rightNote.value

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
    const view = pane === 'left' ? leftView.value : rightView.value
    const currentNote = pane === 'left' ? leftNote.value : rightNote.value

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
    const tempNote = leftNote.value
    const tempLeaf = leftLeaf.value
    const tempView = leftView.value

    leftNote.value = rightNote.value
    leftLeaf.value = rightLeaf.value
    leftView.value = rightView.value

    rightNote.value = tempNote
    rightLeaf.value = tempLeaf
    rightView.value = tempView

    // 選択インデックスも入れ替え
    const tempIndex = appState.selectedIndexLeft
    appState.selectedIndexLeft = appState.selectedIndexRight
    appState.selectedIndexRight = tempIndex

    // ワールドも入れ替え
    const tempWorld = leftWorld.value
    leftWorld.value = rightWorld.value
    rightWorld.value = tempWorld
  }

  function copyLeftToRight() {
    // 左ペインの状態を右ペインにコピー
    rightNote.value = leftNote.value
    rightLeaf.value = leftLeaf.value
    rightView.value = leftView.value
    appState.selectedIndexRight = appState.selectedIndexLeft
    rightWorld.value = leftWorld.value
  }

  function copyRightToLeft() {
    // 右ペインの状態を左ペインにコピー
    leftNote.value = rightNote.value
    leftLeaf.value = rightLeaf.value
    leftView.value = rightView.value
    appState.selectedIndexLeft = appState.selectedIndexRight
    leftWorld.value = rightWorld.value
  }

  // キーボードナビゲーション用ヘルパー（ペインのワールドに対応）
  function getCurrentItemsForPane(pane: Pane): (Note | Leaf)[] {
    const view = pane === 'left' ? leftView.value : rightView.value
    const note = pane === 'left' ? leftNote.value : rightNote.value
    const paneNotes = getNotesForPane(pane)
    const paneLeaves = getLeavesForPane(pane)

    if (view === 'home') {
      const specialLeaves: Leaf[] = []
      if (getWorldForPane(pane) !== 'archive') {
        if (derivedState.currentOfflineLeaf) specialLeaves.push(derivedState.currentOfflineLeaf)
        if (derivedState.currentPriorityLeaf && appState.isPullCompleted)
          specialLeaves.push(derivedState.currentPriorityLeaf)
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

  function openSelectedItemForPane() {
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

  function goBackToParentForPane() {
    const pane = focusedPane.value
    const view = pane === 'left' ? leftView.value : rightView.value
    const note = pane === 'left' ? leftNote.value : rightNote.value

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
    appState.showSettings = true
  }

  async function closeSettings() {
    appState.showSettings = false
    await handleCloseSettings()
  }

  function closeWelcome() {
    appState.showWelcome = false
  }

  function openSettingsFromWelcome() {
    appState.showWelcome = false
    appState.showSettings = true
  }

  // PWAインストールプロンプト
  async function handleInstall() {
    if (!appState.deferredPrompt) return // プロンプトを表示
    ;(appState.deferredPrompt as any).prompt()
    // ユーザーの選択を待つ
    const { outcome } = await (appState.deferredPrompt as any).userChoice
    if (outcome === 'accepted') {
      console.log('PWA installed')
    }
    // 一度使ったらプロンプトは再利用できない
    appState.deferredPrompt = null
    appState.showInstallBanner = false
  }

  function dismissInstallBanner() {
    appState.showInstallBanner = false
    appState.deferredPrompt = null
    // 却下を記録（7日間のcooldown）
    setPwaInstallDismissedAt(Date.now())
  }

  // パンくずリスト（左右共通）- breadcrumbs.tsに移動

  function startEditingBreadcrumb(crumb: Breadcrumb) {
    if (crumb.type === 'home' || crumb.type === 'settings') return
    appState.editingBreadcrumb = crumb.id
  }

  function refreshBreadcrumbs() {
    // ワールドに応じたデータを使用
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

  async function saveEditBreadcrumb(id: string, newName: string, type: Breadcrumb['type']) {
    return saveEditBreadcrumbAction(id, newName, type)
  }

  function cancelEditBreadcrumb() {
    appState.editingBreadcrumb = null
  }

  // ノート管理（crud.tsに委譲）
  function createNote(parentId: string | undefined, pane: Pane, name?: string) {
    createNoteAction(parentId, pane, name)
  }

  function deleteNote(pane: Pane) {
    deleteNoteAction(pane)
  }

  // ノートバッジ更新
  function updateNoteBadge(noteId: string, badgeIcon: string, badgeColor: string, pane: Pane) {
    updateNoteBadgeAction(noteId, badgeIcon, badgeColor, pane)
  }

  // ドラッグ&ドロップ（ノート）
  function handleDragStartNote(note: Note) {
    dragStore.startDragNote(note)
  }

  function handleDragEndNote() {
    dragStore.endDragNote()
  }

  function handleDragOverNote(e: DragEvent, note: Note) {
    if (!derivedState.draggedNote || derivedState.draggedNote.id === note.id) return
    if (derivedState.draggedNote.parentId !== note.parentId) return
    e.preventDefault()
    dragStore.setDragOverNote(note.id)
  }

  function handleDropNote(targetNote: Note) {
    dragStore.setDragOverNote(null)
    if (!derivedState.draggedNote || derivedState.draggedNote.id === targetNote.id) return
    if (derivedState.draggedNote.parentId !== targetNote.parentId) return

    // ドラッグ元のノートからワールドを判定
    const world = getWorldForNote(derivedState.draggedNote)
    const worldNotes = getNotesForWorld(world)
    const updatedNotes = reorderItems(derivedState.draggedNote, targetNote, worldNotes, (n) =>
      derivedState.draggedNote!.parentId
        ? n.parentId === derivedState.draggedNote!.parentId
        : !n.parentId
    )
    setNotesForWorld(world, updatedNotes)
    dragStore.endDragNote()
  }

  // リーフ管理（crud.tsに委譲）
  function createLeaf(pane: Pane, title?: string) {
    createLeafAction(pane, title)
  }

  function deleteLeaf(leafId: string, pane: Pane) {
    deleteLeafAction(leafId, pane)
  }

  async function updateLeafContent(content: string, leafId: string, pane: Pane) {
    return updateLeafContentAction(content, leafId, pane)
  }

  function updateLeafBadge(leafId: string, badgeIcon: string, badgeColor: string, pane: Pane) {
    updateLeafBadgeAction(leafId, badgeIcon, badgeColor, pane)
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
    if (!derivedState.draggedLeaf || derivedState.draggedLeaf.id === leaf.id) return
    if (derivedState.draggedLeaf.noteId !== leaf.noteId) return
    e.preventDefault()
    dragStore.setDragOverLeaf(leaf.id)
  }

  function handleDropLeaf(targetLeaf: Leaf) {
    dragStore.setDragOverLeaf(null)
    if (!derivedState.draggedLeaf || derivedState.draggedLeaf.id === targetLeaf.id) return
    if (derivedState.draggedLeaf.noteId !== targetLeaf.noteId) return

    // ドラッグ元のリーフからワールドを判定
    const world = getWorldForLeaf(derivedState.draggedLeaf)
    const worldLeaves = getLeavesForWorld(world)
    const updatedLeaves = reorderItems(
      derivedState.draggedLeaf,
      targetLeaf,
      worldLeaves,
      (l) => l.noteId === derivedState.draggedLeaf!.noteId
    )
    setLeavesForWorld(world, updatedLeaves)
    dragStore.endDragLeaf()
  }

  // 移動モーダル
  function openMoveModalForLeaf(pane: Pane) {
    if (!appState.isFirstPriorityFetched) return
    const leaf = pane === 'left' ? leftLeaf.value : rightLeaf.value
    if (!leaf) return
    moveModalStore.openForLeaf(leaf, pane)
  }

  function openMoveModalForNote(pane: Pane) {
    if (!appState.isFirstPriorityFetched) return
    const note = pane === 'left' ? leftNote.value : rightNote.value
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
    return moveLeafToAction(destNoteId, targetLeaf, pane)
  }

  async function moveNoteTo(destNoteId: string | null, targetNote: Note, pane: Pane) {
    return moveNoteToAction(destNoteId, targetNote, pane)
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
    return pushToGitHubAction()
  }

  // Git clone相当のZIPエクスポート
  async function exportNotesAsZip() {
    return exportNotesAsZipAction()
  }

  async function handleImportFromOtherApps() {
    return handleImportFromOtherAppsAction()
  }

  async function handleAgasteerImport(file: File) {
    return handleAgasteerImportAction(file)
  }

  // Markdownダウンロード（選択範囲があれば選択範囲をダウンロード）
  function downloadLeafAsMarkdown(leafId: string, pane: Pane) {
    downloadLeafAsMarkdownAction(leafId, pane)
  }

  // プレビューを画像としてダウンロード
  async function downloadLeafAsImage(leafId: string, pane: Pane) {
    return downloadLeafAsImageAction(leafId, pane)
  }

  // シェア機能（share.tsからインポート）
  function getShareHandlers() {
    return {
      translate: $_,
      getLeaf: (pane: Pane) => (pane === 'left' ? leftLeaf.value : rightLeaf.value),
      getView: (pane: Pane) => (pane === 'left' ? leftView.value : rightView.value),
      getPreviewView: (pane: Pane) =>
        pane === 'left' ? appState.leftPreviewView : appState.rightPreviewView,
      getEditorView: (pane: Pane) =>
        pane === 'left' ? appState.leftEditorView : appState.rightEditorView,
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
    const editorView = pane === 'left' ? appState.leftEditorView : appState.rightEditorView
    if (!editorView || !editorView.getSelectedText) return false
    return editorView.getSelectedText() !== ''
  }

  function getSelectedText(pane: Pane): string {
    const editorView = pane === 'left' ? appState.leftEditorView : appState.rightEditorView
    if (!editorView || !editorView.getSelectedText) return ''
    return editorView.getSelectedText()
  }

  // ========================================
  // paneActions Context 設定
  // ========================================
  // Phase 3: action modules が App.svelte の関数を呼べるように登録
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
  function handleThemeChange(theme: typeof settings.value.theme) {
    const next = { ...settings.value, theme }
    updateSettings(next)
    applyTheme(theme, next)
  }

  function handleSettingsChange(payload: Partial<typeof settings.value>) {
    const repoChanged =
      payload.repoName !== undefined && payload.repoName !== settings.value.repoName
    const next = { ...settings.value, ...payload }
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
      appState.isPullCompleted = false
      appState.isFirstPriorityFetched = false
      resetForRepoSwitch()
      archiveLeafStatsStore.reset()
    }
  }
  async function handleCloseSettings() {
    // リポ変更またはインポートがあった場合のみPull実行
    if (repoChangedInSettings || appState.importOccurredInSettings) {
      // Pull/Push/アーカイブロード中の場合は完了を待たずにリセット済み状態で閉じる
      // （resetForRepoSwitchで既にデータクリア済み、次回操作時に新リポからPullされる）
      if (!isPulling.value && !isPushing.value && !appState.isArchiveLoading) {
        isClosingSettingsPull = true
        await pullFromGitHub(false)
        isClosingSettingsPull = false
      }
    }
    repoChangedInSettings = false
    appState.importOccurredInSettings = false
  }

  async function handleTestConnection() {
    return handleTestConnectionAction()
  }

  /**
   * Pull処理の統合関数
   * すべてのPull処理がこの1つの関数を通る
   */
  async function pullFromGitHub(isInitialStartup = false, onCancel?: () => void | Promise<void>) {
    return pullFromGitHubAction(isInitialStartup, onCancel)
  }

  // HMR用の一時保存キー
  const HMR_OFFLINE_KEY = 'agasteer_hmr_offline'

  // HMR時にオフラインリーフをlocalStorageに一時保存（同期的に完了するため）
  function flushOfflineSaveSync() {
    // 保留中の自動保存をキャンセルして同期的にlocalStorageへ保存
    // IndexedDBは非同期なのでHMRに間に合わないため
    const current = offlineLeafStore.value
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
        offlineLeafStore.value = data
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

{#if !appState.i18nReady}
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
      githubConfigured={derivedState.isGitHubConfigured}
      title={settings.value.toolName}
      onTitleClick={() => {
        leftWorld.value = 'home'
        rightWorld.value = 'home'
        goHome('left')
        goHome('right')
      }}
      onSettingsClick={() => {
        goSettings()
      }}
      onPull={() => pullFromGitHub(false)}
      pullDisabled={!derivedState.canPull}
      isStale={isStale.value}
      pullProgress={pullProgressInfo.value}
      onPullProgressClick={() => {
        if (pullProgressInfo.value) {
          showPullToast(
            $_('home.leafFetched', {
              values: {
                fetched: pullProgressInfo.value.fetched,
                total: pullProgressInfo.value.total,
              },
            })
          )
        }
      }}
      onSearchClick={toggleSearch}
      onHelpClick={openUserGuide}
      isDualPane={appState.isDualPane}
      isOperationsLocked={!appState.isFirstPriorityFetched}
      onSwapPanes={swapPanes}
      onCopyLeftToRight={copyLeftToRight}
      onCopyRightToLeft={copyRightToLeft}
    />
    <!-- 検索ドロップダウン（ヘッダー右上、検索ボタンの下） -->
    <SearchBar onResultClick={handleSearchResultClick} />

    <div class="content-wrapper" class:single-pane={!appState.isDualPane}>
      <div class="pane-divider" class:hidden={!appState.isDualPane}></div>
      <div class="left-column">
        <PaneView
          pane="left"
          bind:editorViewRef={appState.leftEditorView}
          bind:previewViewRef={appState.leftPreviewView}
        />
      </div>

      <div class="right-column" class:hidden={!appState.isDualPane}>
        <PaneView
          pane="right"
          bind:editorViewRef={appState.rightEditorView}
          bind:previewViewRef={appState.rightPreviewView}
        />
      </div>
    </div>

    <MoveModal
      show={derivedState.moveModalOpen}
      notes={derivedState.moveTargetNotes}
      targetNote={derivedState.moveTargetNote}
      targetLeaf={derivedState.moveTargetLeaf}
      pane={derivedState.moveTargetPane}
      currentWorld={derivedState.moveTargetWorld}
      onConfirm={handleMoveConfirm}
      onClose={closeMoveModal}
    />

    <Modal
      show={modalState.value.show}
      message={modalState.value.message}
      type={modalState.value.type}
      position={modalState.value.position}
      onConfirm={modalState.value.callback}
      onCancel={modalState.value.cancelCallback}
      onPromptSubmit={modalState.value.promptCallback}
      onChoiceSelect={modalState.value.choiceCallback}
      choiceOptions={modalState.value.choiceOptions || []}
      placeholder={modalState.value.placeholder || ''}
      onClose={closeModal}
    />

    <SettingsModal
      show={appState.showSettings}
      settings={settings.value}
      isTesting={appState.isTesting}
      exporting={appState.isExportingZip}
      importing={appState.isImporting}
      onThemeChange={handleThemeChange}
      onSettingsChange={handleSettingsChange}
      onTestConnection={handleTestConnection}
      onExportZip={exportNotesAsZip}
      onImport={handleImportFromOtherApps}
      onClose={closeSettings}
    />

    <WelcomeModal
      show={appState.showWelcome}
      onOpenSettings={openSettingsFromWelcome}
      onClose={closeWelcome}
    />

    <Toast
      pullMessage={pullToastState.value.message}
      pullVariant={pullToastState.value.variant}
      pushMessage={pushToastState.value.message}
      pushVariant={pushToastState.value.variant}
    />

    {#if appState.showInstallBanner}
      <InstallBanner onInstall={handleInstall} onDismiss={dismissInstallBanner} />
    {/if}
  </div>
{/if}
