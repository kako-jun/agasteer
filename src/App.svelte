<script lang="ts">
  import './App.css'
  import { onMount, tick } from 'svelte'
  import { get } from 'svelte/store'
  import type { Note, Leaf, Breadcrumb, View, Metadata } from './lib/types'
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
    lastPulledPushCount,
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
  } from './lib/stores'
  import { clearAllData, loadSettings, saveNotes, saveLeaves } from './lib/storage'
  import { applyTheme } from './lib/theme'
  import { loadAndApplyCustomFont } from './lib/font'
  import { loadAndApplyCustomBackgrounds } from './lib/background'
  import { executePush, executePull, checkIfStaleEdit } from './lib/sync'
  import type { PullOptions, PullPriority, LeafSkeleton, RateLimitInfo } from './lib/sync'
  import { initI18n, _ } from './lib/i18n'
  import { processImportFile } from './lib/importers'
  import {
    pushToastState,
    pullToastState,
    modalState,
    showPushToast,
    showPullToast,
    showConfirm,
    showAlert,
    closeModal,
  } from './lib/ui'
  import { resolvePath, buildPath } from './lib/routing'
  import { buildNotesZip, downloadLeafAsMarkdown as downloadLeafAsMarkdownLib } from './lib/export'
  import {
    getBreadcrumbs as buildBreadcrumbs,
    extractH1Title,
    updateH1Title,
  } from './lib/breadcrumbs'
  import {
    handleDragStart as dragStart,
    handleDragEnd as dragEnd,
    handleDragOver as dragOver,
    reorderItems,
  } from './lib/drag-drop'
  import {
    createNote as createNoteLib,
    deleteNote as deleteNoteLib,
    updateNoteName as updateNoteNameLib,
    updateNoteBadge as updateNoteBadgeLib,
    normalizeNoteOrders,
    moveNoteTo as moveNoteToLib,
    getItemCount,
    getNoteItems,
  } from './lib/notes'
  import {
    createLeaf as createLeafLib,
    deleteLeaf as deleteLeafLib,
    updateLeafContent as updateLeafContentLib,
    updateLeafBadge as updateLeafBadgeLib,
    normalizeLeafOrders,
    moveLeafTo as moveLeafToLib,
    getLeafCount,
  } from './lib/leaves'
  import {
    computeLeafCharCount,
    rebuildLeafStats as rebuildLeafStatsLib,
    addLeafToStats,
    removeLeafFromStats,
    updateLeafStats as updateLeafStatsLib,
    type LeafStats,
  } from './lib/stats'
  import {
    handleCopyUrl as handleCopyUrlLib,
    handleCopyMarkdown as handleCopyMarkdownLib,
    handleShareImage as handleShareImageLib,
    handleCopyImageToClipboard as handleCopyImageToClipboardLib,
  } from './lib/share'
  import {
    handlePaneScroll as handlePaneScrollLib,
    type ScrollSyncState,
    type ScrollSyncViews,
  } from './lib/scroll-sync'
  import { generateUniqueName, normalizeBadgeValue } from './lib/utils'
  import Header from './components/layout/Header.svelte'
  import Breadcrumbs from './components/layout/Breadcrumbs.svelte'
  import Footer from './components/layout/Footer.svelte'
  import Loading from './components/layout/Loading.svelte'
  import Modal from './components/layout/Modal.svelte'
  import Toast from './components/layout/Toast.svelte'
  import MoveModal from './components/layout/MoveModal.svelte'
  import SearchBar from './components/layout/SearchBar.svelte'
  import { toggleSearch } from './lib/search'
  import HomeFooter from './components/layout/footer/HomeFooter.svelte'
  import NoteFooter from './components/layout/footer/NoteFooter.svelte'
  import EditorFooter from './components/layout/footer/EditorFooter.svelte'
  import PreviewFooter from './components/layout/footer/PreviewFooter.svelte'
  import HomeView from './components/views/HomeView.svelte'
  import NoteView from './components/views/NoteView.svelte'
  import EditorView from './components/views/EditorView.svelte'
  import PreviewView from './components/views/PreviewView.svelte'
  import SettingsView from './components/views/SettingsView.svelte'
  import SettingsIcon from './components/icons/SettingsIcon.svelte'
  import {
    priorityItems,
    createPriorityLeaf,
    isPriorityLeaf,
    isLeafSaveable,
    isNoteSaveable,
  } from './lib/priority'

  // ローカル状態
  let breadcrumbs: Breadcrumb[] = []
  let breadcrumbsRight: Breadcrumb[] = []
  let editingBreadcrumb: string | null = null
  let draggedNote: Note | null = null
  let draggedLeaf: Leaf | null = null
  let dragOverNoteId: string | null = null // ドラッグオーバー中のノートID
  let dragOverLeafId: string | null = null // ドラッグオーバー中のリーフID
  let isLoadingUI = false // ガラス効果・操作不可（優先リーフ完了で解除）
  let isOperationsLocked = true
  let showSettings = false
  let i18nReady = false // i18n初期化完了フラグ
  let showWelcome = false // ウェルカムモーダル表示フラグ
  let isExportingZip = false
  let isImporting = false
  let importOccurredInSettings = false
  let isClosingSettingsPull = false
  let totalLeafCount = 0 // ホーム統計用: リーフ総数
  let totalLeafChars = 0 // ホーム統計用: リーフ総文字数（空白除く）
  const leafCharCounts = new Map<string, number>() // リーフごとの文字数キャッシュ
  let settingsPointerFromContent = false // 設定モーダル内でドラッグ開始したかを判定
  let moveModalOpen = false
  let moveTargetLeaf: Leaf | null = null
  let moveTargetNote: Note | null = null
  let moveTargetPane: Pane = 'left'

  // 左右ペイン用の状態
  let isDualPane = false // 画面幅で切り替え

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
    selectNote
  )
  $: breadcrumbsRight = buildBreadcrumbs(
    $rightView,
    $rightNote,
    $rightLeaf,
    $notes,
    'right',
    goHome,
    selectNote
  )
  $: isGitHubConfigured = $githubConfigured
  $: document.title = $settings.toolName

  // Priorityリーフをリアクティブに生成
  $: currentPriorityLeaf = createPriorityLeaf($priorityItems)

  // Pull/Push中はボタンを無効化（リアクティブに追跡）
  $: canPull = !$isPulling && !$isPushing
  $: canPush = !$isPulling && !$isPushing

  // URLルーティング
  let isRestoringFromUrl = false

  function updateUrlFromState() {
    // 初期化完了まで、URL更新をスキップ
    if (isRestoringFromUrl || isPulling || isOperationsLocked) {
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

  /**
   * URLから優先情報を取得（Pull時の優先度ソート用）
   * リーフパスとノートIDを返す
   */
  function getPriorityFromUrl(allNotes: Note[]): PullPriority {
    const params = new URLSearchParams(window.location.search)
    const leftPath = params.get('left')
    const rightPath = params.get('right')

    const leafPaths: string[] = []
    const noteIds: string[] = []

    const processPath = (path: string | null) => {
      if (!path || path === '/') return

      // :previewサフィックスを除去
      const cleanPath = path.endsWith(':preview') ? path.slice(0, -8) : path

      // パスを分割（">" で区切る）
      const segments = cleanPath.split('>').map((s) => decodeURIComponent(s))
      if (segments.length === 0) return

      // ルートノートを探す
      const rootNote = allNotes.find((n) => !n.parentId && n.name === segments[0])
      if (!rootNote) return

      if (segments.length === 1) {
        // ルートノートのみ → そのノート配下を優先
        noteIds.push(rootNote.id)
        return
      }

      // サブノートを探す
      const subNote = allNotes.find((n) => n.parentId === rootNote.id && n.name === segments[1])

      if (subNote && segments.length === 2) {
        // サブノートのみ → そのノート配下を優先
        noteIds.push(subNote.id)
        return
      }

      if (!subNote && segments.length === 2) {
        // ルートノート配下のリーフ
        const leafPath = `${segments[0]}/${segments[1]}.md`
        leafPaths.push(leafPath)
        noteIds.push(rootNote.id)
        return
      }

      if (subNote && segments.length === 3) {
        // サブノート配下のリーフ
        const leafPath = `${segments[0]}/${segments[1]}/${segments[2]}.md`
        leafPaths.push(leafPath)
        noteIds.push(subNote.id)
        return
      }
    }

    processPath(leftPath)
    processPath(rightPath)

    // 重複を除去
    return {
      leafPaths: [...new Set(leafPaths)],
      noteIds: [...new Set(noteIds)],
    }
  }

  // 未取得リーフのID（ローディング表示用）
  let loadingLeafIds = new Set<string>()

  // スケルトン表示用のリーフメタ情報（Pull中のみ使用）
  let leafSkeletonMap = new Map<string, LeafSkeleton>()

  // 左ペインの状態変更をURLに反映
  $: if (leftNote || leftLeaf || (!leftNote && !leftLeaf) || leftView) {
    updateUrlFromState()
  }

  // 右ペインの状態変更をURLに反映
  $: if (rightNote || rightLeaf || (!rightNote && !rightLeaf) || rightView) {
    updateUrlFromState()
  }

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

      // カスタムフォントがあれば適用
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

      // GitHub設定チェック
      const isConfigured = loadedSettings.token && loadedSettings.repoName
      if (isConfigured) {
        // 設定済みの場合は通常通り初回Pullを実行
        await handlePull(true)
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

    // ブラウザの戻る/進むボタンに対応
    const handlePopState = () => {
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

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('resize', updateDualPane)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('keydown', handleKeyDown)
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
      isOperationsLocked,
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

  async function handleSearchResultClick(leafId: string, line: number) {
    const leaf = $leaves.find((l) => l.id === leafId)
    if (leaf) {
      selectLeaf(leaf, 'left')
      // DOM更新を待ってから行ジャンプ
      await tick()
      if (leftEditorView && leftEditorView.scrollToLine) {
        leftEditorView.scrollToLine(line)
      }
    }
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
    const state = getNavState()
    nav.togglePreview(state, getNavDeps(), pane)
    syncNavState(state)
    updateUrlFromState()
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

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      closeSettings()
    }
  }

  function handleSettingsOverlayClick() {
    // モーダル内でドラッグ開始→外でmouseupされた場合は閉じない
    if (settingsPointerFromContent) {
      settingsPointerFromContent = false
      return
    }
    closeSettings()
  }

  function handleSettingsContentPointerDown() {
    settingsPointerFromContent = true
  }

  function handleSettingsContentPointerUp() {
    settingsPointerFromContent = false
  }

  function handleContentClick(e: MouseEvent) {
    e.stopPropagation()
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
      selectNote
    )
    breadcrumbsRight = buildBreadcrumbs(
      $rightView,
      $rightNote,
      $rightLeaf,
      $notes,
      'right',
      goHome,
      selectNote
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
        const prevChars = leafCharCounts.get(actualId) ?? computeLeafCharCount(targetLeaf.content)
        const nextChars = computeLeafCharCount(updatedContent)
        leafCharCounts.set(actualId, nextChars)
        totalLeafChars += nextChars - prevChars
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
  function createNote(parentId: string | undefined, pane: Pane) {
    createNoteLib({ parentId, pane, isOperationsLocked, translate: $_ })
  }

  function deleteNote(pane: Pane) {
    const targetNote = pane === 'left' ? $leftNote : $rightNote
    if (!targetNote) return

    deleteNoteLib({
      targetNote,
      pane,
      isOperationsLocked,
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
    dragStart(
      note,
      (n) => (draggedNote = n),
      (id) => (dragOverNoteId = id)
    )
  }

  function handleDragEndNote() {
    dragEnd(
      (n) => (draggedNote = n),
      (id) => (dragOverNoteId = id)
    )
  }

  function handleDragOverNote(e: DragEvent, note: Note) {
    dragOver(
      e,
      note,
      draggedNote,
      (dragged, target) => dragged.parentId === target.parentId,
      (id) => (dragOverNoteId = id)
    )
  }

  function handleDropNote(targetNote: Note) {
    dragOverNoteId = null
    if (!draggedNote || draggedNote.id === targetNote.id) return
    if (draggedNote.parentId !== targetNote.parentId) return

    const updatedNotes = reorderItems(draggedNote, targetNote, $notes, (n) =>
      draggedNote.parentId ? n.parentId === draggedNote.parentId : !n.parentId
    )

    updateNotes(updatedNotes)
    draggedNote = null
  }

  // リーフ管理（leaves.tsに委譲）
  function createLeaf(pane: Pane) {
    const targetNote = pane === 'left' ? $leftNote : $rightNote
    if (!targetNote) return
    const newLeaf = createLeafLib({ targetNote, pane, isOperationsLocked })
    if (newLeaf) {
      const chars = computeLeafCharCount(newLeaf.content)
      leafCharCounts.set(newLeaf.id, chars)
      totalLeafCount += 1
      totalLeafChars += chars
      selectLeaf(newLeaf, pane)
    }
  }

  function deleteLeaf(leafId: string, pane: Pane) {
    const otherLeaf = pane === 'left' ? $rightLeaf : $leftLeaf
    deleteLeafLib({
      leafId,
      pane,
      isOperationsLocked,
      translate: $_,
      onNavigate: (p, note) => {
        if (note) selectNote(note, p)
        else goHome(p)
      },
      otherPaneLeafId: otherLeaf?.id,
      onUpdateStats: (id, content) => {
        const chars = leafCharCounts.get(id) ?? computeLeafCharCount(content)
        leafCharCounts.delete(id)
        totalLeafCount = Math.max(0, totalLeafCount - 1)
        totalLeafChars = Math.max(0, totalLeafChars - chars)
      },
    })
  }

  function updateLeafContent(content: string, leafId: string) {
    const result = updateLeafContentLib({
      content,
      leafId,
      isOperationsLocked,
      translate: $_,
      onStatsUpdate: (id, prevContent, newContent) => {
        const prevChars = leafCharCounts.get(id) ?? computeLeafCharCount(prevContent)
        const nextChars = computeLeafCharCount(newContent)
        leafCharCounts.set(id, nextChars)
        totalLeafChars += nextChars - prevChars
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

  // ドラッグ&ドロップ（リーフ）
  function handleDragStartLeaf(leaf: Leaf) {
    dragStart(
      leaf,
      (l) => (draggedLeaf = l),
      (id) => (dragOverLeafId = id)
    )
  }

  function handleDragEndLeaf() {
    dragEnd(
      (l) => (draggedLeaf = l),
      (id) => (dragOverLeafId = id)
    )
  }

  function handleDragOverLeaf(e: DragEvent, leaf: Leaf) {
    dragOver(
      e,
      leaf,
      draggedLeaf,
      (dragged, target) => dragged.noteId === target.noteId,
      (id) => (dragOverLeafId = id)
    )
  }

  function handleDropLeaf(targetLeaf: Leaf) {
    dragOverLeafId = null
    if (!draggedLeaf || draggedLeaf.id === targetLeaf.id) return
    if (draggedLeaf.noteId !== targetLeaf.noteId) return

    const updatedLeaves = reorderItems(
      draggedLeaf,
      targetLeaf,
      $leaves,
      (l) => l.noteId === draggedLeaf.noteId
    )

    updateLeaves(updatedLeaves)
    draggedLeaf = null
  }

  // 移動モーダル
  function openMoveModalForLeaf(pane: Pane) {
    if (isOperationsLocked) return
    const leaf = pane === 'left' ? $leftLeaf : $rightLeaf
    if (!leaf) return
    moveTargetLeaf = leaf
    moveTargetNote = null
    moveTargetPane = pane
    moveModalOpen = true
  }

  function openMoveModalForNote(pane: Pane) {
    if (isOperationsLocked) return
    const note = pane === 'left' ? $leftNote : $rightNote
    if (!note) return
    moveTargetNote = note
    moveTargetLeaf = null
    moveTargetPane = pane
    moveModalOpen = true
  }

  function closeMoveModal() {
    moveModalOpen = false
    moveTargetLeaf = null
    moveTargetNote = null
  }

  function handleMoveConfirm(destNoteId: string | null) {
    if (moveTargetLeaf) {
      moveLeafTo(destNoteId)
    } else if (moveTargetNote) {
      moveNoteTo(destNoteId)
    }
  }

  function moveLeafTo(destNoteId: string | null) {
    if (!moveTargetLeaf) return
    const result = moveLeafToLib(moveTargetLeaf, destNoteId, $_)
    if (result.success && result.movedLeaf && result.destNote) {
      if ($leftLeaf?.id === moveTargetLeaf.id) {
        $leftLeaf = result.movedLeaf
        $leftNote = result.destNote
      }
      if ($rightLeaf?.id === moveTargetLeaf.id) {
        $rightLeaf = result.movedLeaf
        $rightNote = result.destNote
      }
      showPushToast('移動しました', 'success')
    }
    closeMoveModal()
  }

  function moveNoteTo(destNoteId: string | null) {
    if (!moveTargetNote) return
    const result = moveNoteToLib(moveTargetNote, destNoteId, $_)
    if (result.success && result.updatedNote) {
      if ($leftNote?.id === moveTargetNote.id) $leftNote = result.updatedNote
      if ($rightNote?.id === moveTargetNote.id) $rightNote = result.updatedNote
      showPushToast('移動しました', 'success')
    }
    closeMoveModal()
  }

  // ヘルパー関数（notes.ts, leaves.ts, stats.tsからインポート）
  function resetLeafStats() {
    leafCharCounts.clear()
    totalLeafCount = 0
    totalLeafChars = 0
  }

  function rebuildLeafStats(allLeaves: Leaf[], allNotes: Note[]) {
    const stats = rebuildLeafStatsLib(allLeaves, allNotes)
    leafCharCounts.clear()
    stats.leafCharCounts.forEach((value, key) => leafCharCounts.set(key, value))
    totalLeafCount = stats.totalLeafCount
    totalLeafChars = stats.totalLeafChars
  }

  // GitHub同期
  // 交通整理: Pull/Pushが実行可能かどうか
  function canSync(): { canPull: boolean; canPush: boolean } {
    // Pull中またはPush中は両方とも不可
    if ($isPulling || $isPushing) {
      return { canPull: false, canPush: false }
    }
    return { canPull: true, canPush: true }
  }

  /**
   * GitHub APIのメッセージキーを翻訳してトースト用テキストに変換
   * rateLimitInfoがある場合は残り時間を含める
   */
  function translateGitHubMessage(messageKey: string, rateLimitInfo?: RateLimitInfo): string {
    // i18nキーでなければそのまま返す（後方互換性のため）
    if (!messageKey.startsWith('github.') && !messageKey.startsWith('toast.')) {
      return messageKey
    }

    // レート制限メッセージの場合、残り時間を含める
    if (messageKey === 'github.rateLimited' && rateLimitInfo?.remainingSeconds !== undefined) {
      const minutes = Math.floor(rateLimitInfo.remainingSeconds / 60)
      const seconds = rateLimitInfo.remainingSeconds % 60
      return $_('github.rateLimited', { values: { minutes, seconds } })
    } else if (messageKey === 'github.rateLimited') {
      return $_('github.rateLimitedNoTime')
    }

    // 通常のi18n翻訳
    return $_(messageKey)
  }

  async function handleSaveToGitHub() {
    // 交通整理: Push不可なら何もしない
    if (!canSync().canPush) return

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
      const result = await executePush(saveableLeaves, saveableNotes, $settings, isOperationsLocked)

      // 結果を通知（GitHub APIのメッセージキーを翻訳）
      const translatedMessage = translateGitHubMessage(result.message, result.rateLimitInfo)
      showPushToast(translatedMessage, result.variant)

      // Push成功時にダーティフラグをクリアし、pushCountを更新
      if (result.variant === 'success') {
        isDirty.set(false)
        // Push成功後はリモートと同期したのでpushCountを+1
        lastPulledPushCount.update((n) => n + 1)
      }
    } finally {
      $isPushing = false
    }
  }

  // Git clone相当のZIPエクスポート
  async function exportNotesAsZip() {
    if (isOperationsLocked) {
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
    if (isOperationsLocked) {
      showPushToast($_('settings.importExport.needInitialPullImport'), 'error')
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.zip'
    input.multiple = false

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      isImporting = true
      try {
        showPushToast($_('settings.importExport.importStarting'), 'success')
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

  // Markdownダウンロード
  function downloadLeafAsMarkdown(leafId: string) {
    downloadLeafAsMarkdownLib(leafId, isOperationsLocked, $_)
  }

  // プレビューを画像としてダウンロード
  async function downloadLeafAsImage(leafId: string, pane: Pane) {
    if (isOperationsLocked) {
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

  async function handlePull(isInitial = false) {
    // 交通整理: Pull不可なら何もしない（初回Pullは例外）
    if (!isInitial && !canSync().canPull) return

    // 初回Pull以外で未保存の変更がある場合は確認
    if (!isInitial && get(isDirty)) {
      let message = $_('modal.unsavedChanges')
      if (isClosingSettingsPull && importOccurredInSettings) {
        message += `\n\n${$_('settings.importExport.importCloseHint')}`
        importOccurredInSettings = false
      }
      showConfirm(message, () => executePullInternal(isInitial))
      return
    }

    await executePullInternal(isInitial)
  }

  async function executePullInternal(isInitial: boolean) {
    isLoadingUI = true
    isOperationsLocked = true
    $isPulling = true // Pull処理中はURL更新をスキップ

    // Pull開始を通知
    showPullToast('Pullします')

    // 重要: GitHubが唯一の真実の情報源（Single Source of Truth）
    // IndexedDBは単なるキャッシュであり、Pull成功時に全削除→全作成される
    // 前回終了時のIndexedDBデータは使用しない
    await clearAllData() // IndexedDB全削除
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

        // URLから優先情報を計算して返す
        return getPriorityFromUrl(notesFromGitHub)
      },

      // 各リーフ取得完了時: leavesストアに追加
      onLeaf: (leaf) => {
        leaves.update((current) => [...current, leaf])
        loadingLeafIds.delete(leaf.id)
        loadingLeafIds = loadingLeafIds // リアクティブ更新
      },

      // 第1優先リーフ取得完了時: UIロック解除、ガラス効果解除、URL復元
      onPriorityComplete: () => {
        isOperationsLocked = false
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
      // 全リーフ取得完了後の処理
      // leavesストアはonLeafで逐次更新済みなので、最終的なソートのみ
      const sortedLeaves = result.leaves.sort((a, b) => a.order - b.order)
      leaves.set(sortedLeaves)
      rebuildLeafStats(sortedLeaves, result.notes)

      // stale編集検出用にpushCountを記録
      lastPulledPushCount.set(result.metadata.pushCount)

      // IndexedDBに保存（isDirtyをセットしないように直接保存）
      saveNotes(result.notes).catch((err) => console.error('Failed to persist notes:', err))
      saveLeaves(sortedLeaves).catch((err) => console.error('Failed to persist leaves:', err))

      // Pull成功時はGitHubと同期したのでダーティフラグをクリア
      // tick()で待機し、リアクティブ更新が完全に完了してからクリアする
      await tick()
      isDirty.set(false)
    } else {
      // 初回Pull失敗時は静かに処理（設定未完了は正常な状態）
      // 2回目以降のPull失敗はトーストで通知される
    }

    // 結果を通知（GitHub APIのメッセージキーを翻訳）
    const translatedMessage = translateGitHubMessage(result.message, result.rateLimitInfo)
    showPullToast(translatedMessage, result.variant)
    isLoadingUI = false
    $isPulling = false // Pull処理完了
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
      onSearchClick={toggleSearch}
    />
    <!-- 検索ドロップダウン（ヘッダー右上、検索ボタンの下） -->
    <SearchBar onResultClick={handleSearchResultClick} />

    <div class="content-wrapper" class:single-pane={!isDualPane}>
      <div class="pane-divider" class:hidden={!isDualPane}></div>
      <div class="left-column">
        <Breadcrumbs
          {breadcrumbs}
          editingId={editingBreadcrumb}
          onStartEdit={startEditingBreadcrumb}
          onSaveEdit={saveEditBreadcrumb}
          onCancelEdit={cancelEditBreadcrumb}
          onCopyUrl={() => handleCopyUrl('left')}
          onCopyMarkdown={() => handleCopyMarkdown('left')}
          onShareImage={() => handleShareImage('left')}
          isPreview={$leftView === 'preview'}
        />

        <main class="main-pane">
          {#if $leftView === 'home'}
            <HomeView
              notes={$rootNotes}
              disabled={isOperationsLocked}
              selectedIndex={selectedIndexLeft}
              isActive={$focusedPane === 'left'}
              vimMode={$settings.vimMode ?? false}
              onSelectNote={(note) => selectNote(note, 'left')}
              onCreateNote={() => createNote(undefined, 'left')}
              onDragStart={handleDragStartNote}
              onDragEnd={handleDragEndNote}
              onDragOver={handleDragOverNote}
              onDrop={handleDropNote}
              onSave={handleSaveToGitHub}
              {dragOverNoteId}
              {getNoteItems}
              leafCount={totalLeafCount}
              leafCharCount={totalLeafChars}
              pushCount={$metadata.pushCount}
              onUpdateNoteBadge={updateNoteBadge}
              priorityLeaf={currentPriorityLeaf}
              onSelectPriority={() => openPriorityView('left')}
              onUpdatePriorityBadge={(icon, color) => {}}
            />
          {:else if $leftView === 'note' && $leftNote}
            <NoteView
              currentNote={$leftNote}
              subNotes={$notes
                .filter((n) => n.parentId === $leftNote.id)
                .sort((a, b) => a.order - b.order)}
              leaves={$leaves
                .filter((l) => l.noteId === $leftNote.id)
                .sort((a, b) => a.order - b.order)}
              disabled={isOperationsLocked}
              selectedIndex={selectedIndexLeft}
              isActive={$focusedPane === 'left'}
              vimMode={$settings.vimMode ?? false}
              onSelectNote={(note) => selectNote(note, 'left')}
              onSelectLeaf={(leaf) => selectLeaf(leaf, 'left')}
              onCreateNote={() => createNote($leftNote.id, 'left')}
              onCreateLeaf={() => createLeaf('left')}
              onDeleteNote={() => deleteNote('left')}
              onDragStartNote={handleDragStartNote}
              onDragStartLeaf={handleDragStartLeaf}
              onDragEndNote={handleDragEndNote}
              onDragEndLeaf={handleDragEndLeaf}
              onDragOverNote={handleDragOverNote}
              onDragOverLeaf={handleDragOverLeaf}
              onDropNote={handleDropNote}
              onDropLeaf={handleDropLeaf}
              onSave={handleSaveToGitHub}
              {dragOverNoteId}
              {dragOverLeafId}
              {getNoteItems}
              onUpdateNoteBadge={updateNoteBadge}
              onUpdateLeafBadge={updateLeafBadge}
              {loadingLeafIds}
              {leafSkeletonMap}
            />
          {:else if $leftView === 'edit' && $leftLeaf}
            <EditorView
              bind:this={leftEditorView}
              leaf={$leftLeaf}
              theme={$settings.theme}
              vimMode={$settings.vimMode ?? false}
              linedMode={$settings.linedMode ?? false}
              pane="left"
              disabled={isOperationsLocked}
              onContentChange={updateLeafContent}
              onSave={handleSaveToGitHub}
              onClose={() => closeLeaf('left')}
              onSwitchPane={() => switchPane('left')}
              onDownload={downloadLeafAsMarkdown}
              onDelete={(leafId) => deleteLeaf(leafId, 'left')}
              onScroll={handleLeftScroll}
            />
          {:else if $leftView === 'preview' && $leftLeaf}
            <PreviewView bind:this={leftPreviewView} leaf={$leftLeaf} onScroll={handleLeftScroll} />
          {/if}
        </main>

        {#if $leftView === 'home'}
          <HomeFooter
            onCreateNote={() => createNote(undefined, 'left')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            saveDisabled={!canPush}
          />
        {:else if $leftView === 'note' && $leftNote}
          <NoteFooter
            onDeleteNote={() => deleteNote('left')}
            onMove={() => openMoveModalForNote('left')}
            onCreateSubNote={() => createNote($leftNote.id, 'left')}
            onCreateLeaf={() => createLeaf('left')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            canHaveSubNote={!$leftNote.parentId}
            saveDisabled={!canPush}
          />
        {:else if $leftView === 'edit' && $leftLeaf}
          <EditorFooter
            onDelete={() => deleteLeaf($leftLeaf.id, 'left')}
            onMove={() => openMoveModalForLeaf('left')}
            onDownload={() => downloadLeafAsMarkdown($leftLeaf.id)}
            onTogglePreview={() => togglePreview('left')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            saveDisabled={!canPush}
          />
        {:else if $leftView === 'preview' && $leftLeaf}
          <PreviewFooter
            onMove={() => openMoveModalForLeaf('left')}
            onDownload={() => downloadLeafAsImage($leftLeaf.id, 'left')}
            onToggleEdit={() => togglePreview('left')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            saveDisabled={!canPush}
          />
        {/if}

        {#if isOperationsLocked && !showWelcome && !isLoadingUI}
          <div class="config-required-overlay"></div>
        {/if}
        {#if isLoadingUI || $isPushing}
          <Loading />
        {/if}
      </div>

      <div class="right-column" class:hidden={!isDualPane}>
        <Breadcrumbs
          breadcrumbs={breadcrumbsRight}
          editingId={editingBreadcrumb}
          onStartEdit={startEditingBreadcrumb}
          onSaveEdit={saveEditBreadcrumb}
          onCancelEdit={cancelEditBreadcrumb}
          onCopyUrl={() => handleCopyUrl('right')}
          onCopyMarkdown={() => handleCopyMarkdown('right')}
          onShareImage={() => handleShareImage('right')}
          isPreview={$rightView === 'preview'}
        />

        <main class="main-pane">
          {#if $rightView === 'home'}
            <HomeView
              notes={$rootNotes}
              disabled={isOperationsLocked}
              selectedIndex={selectedIndexRight}
              isActive={$focusedPane === 'right'}
              vimMode={$settings.vimMode ?? false}
              onSelectNote={(note) => selectNote(note, 'right')}
              onCreateNote={() => createNote(undefined, 'right')}
              onDragStart={handleDragStartNote}
              onDragEnd={handleDragEndNote}
              onDragOver={handleDragOverNote}
              onDrop={handleDropNote}
              onSave={handleSaveToGitHub}
              {dragOverNoteId}
              {getNoteItems}
              leafCount={totalLeafCount}
              leafCharCount={totalLeafChars}
              pushCount={$metadata.pushCount}
              onUpdateNoteBadge={updateNoteBadge}
              priorityLeaf={currentPriorityLeaf}
              onSelectPriority={() => openPriorityView('right')}
              onUpdatePriorityBadge={(icon, color) => {}}
            />
          {:else if $rightView === 'note' && $rightNote}
            <NoteView
              currentNote={$rightNote}
              subNotes={$notes
                .filter((n) => n.parentId === $rightNote.id)
                .sort((a, b) => a.order - b.order)}
              leaves={$leaves
                .filter((l) => l.noteId === $rightNote.id)
                .sort((a, b) => a.order - b.order)}
              disabled={isOperationsLocked}
              selectedIndex={selectedIndexRight}
              isActive={$focusedPane === 'right'}
              vimMode={$settings.vimMode ?? false}
              onSelectNote={(note) => selectNote(note, 'right')}
              onSelectLeaf={(leaf) => selectLeaf(leaf, 'right')}
              onCreateNote={() => createNote($rightNote.id, 'right')}
              onCreateLeaf={() => createLeaf('right')}
              onDeleteNote={() => deleteNote('right')}
              onDragStartNote={handleDragStartNote}
              onDragStartLeaf={handleDragStartLeaf}
              onDragEndNote={handleDragEndNote}
              onDragEndLeaf={handleDragEndLeaf}
              onDragOverNote={handleDragOverNote}
              onDragOverLeaf={handleDragOverLeaf}
              onDropNote={handleDropNote}
              onDropLeaf={handleDropLeaf}
              onSave={handleSaveToGitHub}
              {dragOverNoteId}
              {dragOverLeafId}
              {getNoteItems}
              onUpdateNoteBadge={updateNoteBadge}
              onUpdateLeafBadge={updateLeafBadge}
              {loadingLeafIds}
              {leafSkeletonMap}
            />
          {:else if $rightView === 'edit' && $rightLeaf}
            <EditorView
              bind:this={rightEditorView}
              leaf={$rightLeaf}
              theme={$settings.theme}
              vimMode={$settings.vimMode ?? false}
              linedMode={$settings.linedMode ?? false}
              pane="right"
              disabled={isOperationsLocked}
              onContentChange={updateLeafContent}
              onSave={handleSaveToGitHub}
              onClose={() => closeLeaf('right')}
              onSwitchPane={() => switchPane('right')}
              onDownload={downloadLeafAsMarkdown}
              onDelete={(leafId) => deleteLeaf(leafId, 'right')}
              onScroll={handleRightScroll}
            />
          {:else if $rightView === 'preview' && $rightLeaf}
            <PreviewView
              bind:this={rightPreviewView}
              leaf={$rightLeaf}
              onScroll={handleRightScroll}
            />
          {/if}
        </main>

        {#if $rightView === 'home'}
          <HomeFooter
            onCreateNote={() => createNote(undefined, 'right')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            saveDisabled={!canPush}
          />
        {:else if $rightView === 'note' && $rightNote}
          <NoteFooter
            onDeleteNote={() => deleteNote('right')}
            onMove={() => openMoveModalForNote('right')}
            onCreateSubNote={() => createNote($rightNote.id, 'right')}
            onCreateLeaf={() => createLeaf('right')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            canHaveSubNote={!$rightNote.parentId}
            saveDisabled={!canPush}
          />
        {:else if $rightView === 'edit' && $rightLeaf}
          <EditorFooter
            onDelete={() => deleteLeaf($rightLeaf.id, 'right')}
            onMove={() => openMoveModalForLeaf('right')}
            onDownload={() => downloadLeafAsMarkdown($rightLeaf.id)}
            onTogglePreview={() => togglePreview('right')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            saveDisabled={!canPush}
          />
        {:else if $rightView === 'preview' && $rightLeaf}
          <PreviewFooter
            onMove={() => openMoveModalForLeaf('right')}
            onDownload={() => downloadLeafAsImage($rightLeaf.id, 'right')}
            onToggleEdit={() => togglePreview('right')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            saveDisabled={!canPush}
          />
        {/if}

        {#if isOperationsLocked && !showWelcome && !isLoadingUI}
          <div class="config-required-overlay"></div>
        {/if}
        {#if isLoadingUI || $isPushing}
          <Loading />
        {/if}
      </div>
    </div>

    <MoveModal
      show={moveModalOpen}
      notes={$notes}
      targetNote={moveTargetNote}
      targetLeaf={moveTargetLeaf}
      onConfirm={handleMoveConfirm}
      onClose={closeMoveModal}
    />

    <Modal
      show={$modalState.show}
      message={$modalState.message}
      type={$modalState.type}
      onConfirm={$modalState.callback}
      onClose={closeModal}
    />

    {#if showSettings}
      <div
        class="settings-modal-overlay"
        role="button"
        tabindex="0"
        on:click={handleSettingsOverlayClick}
        on:keydown={handleOverlayKeydown}
        aria-label="設定を閉じる"
      >
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <div
          class="settings-modal-content"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          on:pointerdown={handleSettingsContentPointerDown}
          on:pointerup={handleSettingsContentPointerUp}
          on:click={handleContentClick}
        >
          <button class="settings-close-button" on:click={closeSettings} aria-label="閉じる">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <SettingsView
            settings={$settings}
            onThemeChange={handleThemeChange}
            onSettingsChange={handleSettingsChange}
            {isLoadingUI}
            onPull={handlePull}
            onExportZip={exportNotesAsZip}
            onImport={handleImportFromOtherApps}
            exporting={isExportingZip}
            importing={isImporting}
          />
        </div>
      </div>
    {/if}

    {#if showWelcome}
      <div class="welcome-modal-overlay">
        <div class="welcome-modal-content">
          <h2 class="welcome-title">
            {$_('welcome.title')}
          </h2>
          <p class="welcome-message">
            {$_('welcome.message1')}
          </p>
          <p class="welcome-message">
            {$_('welcome.message2')}
          </p>
          <div class="welcome-buttons">
            <button class="welcome-button primary" on:click={openSettingsFromWelcome}>
              <span class="button-icon">
                <SettingsIcon />
              </span>
              {$_('welcome.openSettings')}
            </button>
            <button class="welcome-button secondary" on:click={closeWelcome}>
              {$_('welcome.later')}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <Toast
      pullMessage={$pullToastState.message}
      pullVariant={$pullToastState.variant}
      pushMessage={$pushToastState.message}
      pushVariant={$pushToastState.variant}
    />
  </div>
{/if}
