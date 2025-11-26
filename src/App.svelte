<script lang="ts">
  import { onMount } from 'svelte'
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
    updateSettings,
    updateNotes,
    updateLeaves,
  } from './lib/stores'
  import { clearAllData, loadSettings } from './lib/storage'
  import { applyTheme } from './lib/theme'
  import { loadAndApplyCustomFont } from './lib/font'
  import { loadAndApplyCustomBackgrounds } from './lib/background'
  import { executePush, executePull } from './lib/sync'
  import { initI18n, _ } from './lib/i18n'
  import { parseSimpleNoteFile } from './lib/importers'
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
  import { buildNotesZip } from './lib/export'
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
  import Header from './components/layout/Header.svelte'
  import Breadcrumbs from './components/layout/Breadcrumbs.svelte'
  import Footer from './components/layout/Footer.svelte'
  import Loading from './components/layout/Loading.svelte'
  import Modal from './components/layout/Modal.svelte'
  import Toast from './components/layout/Toast.svelte'
  import MoveModal from './components/layout/MoveModal.svelte'
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

  // ローカル状態
  let breadcrumbs: Breadcrumb[] = []
  let breadcrumbsRight: Breadcrumb[] = []
  let editingBreadcrumb: string | null = null
  let draggedNote: Note | null = null
  let draggedLeaf: Leaf | null = null
  let dragOverNoteId: string | null = null // ドラッグオーバー中のノートID
  let dragOverLeafId: string | null = null // ドラッグオーバー中のリーフID
  let pullRunning = false
  let isOperationsLocked = true
  let showSettings = false
  let isPulling = false // Pull処理中はURL更新をスキップ
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

  // 左右ペイン用の状態（対等なローカル変数）
  let isDualPane = false // 画面幅で切り替え
  let leftNote: Note | null = null
  let leftLeaf: Leaf | null = null
  let leftView: View = 'home'
  let rightNote: Note | null = null
  let rightLeaf: Leaf | null = null
  let rightView: View = 'home'

  // キーボードナビゲーション用の状態
  let selectedIndexLeft = 0 // 左ペインで選択中のアイテムインデックス
  let selectedIndexRight = 0 // 右ペインで選択中のアイテムインデックス
  let focusedPane: Pane = 'left' // フォーカス中のペイン

  // スクロール同期用のコンポーネント参照
  let leftEditorView: any = null
  let leftPreviewView: any = null
  let rightEditorView: any = null
  let rightPreviewView: any = null

  // スクロール同期関数（統一版）
  function handlePaneScroll(pane: Pane, scrollTop: number, scrollHeight: number) {
    // 同じリーフで、edit/previewが逆の場合のみ同期
    if (!isDualPane || !leftLeaf || !rightLeaf || leftLeaf.id !== rightLeaf.id) return

    const ownView = pane === 'left' ? leftView : rightView
    const otherView = pane === 'left' ? rightView : leftView
    const shouldSync =
      (ownView === 'edit' && otherView === 'preview') ||
      (ownView === 'preview' && otherView === 'edit')

    if (shouldSync) {
      const targetEditor = pane === 'left' ? rightEditorView : leftEditorView
      const targetPreview = pane === 'left' ? rightPreviewView : leftPreviewView
      const target = otherView === 'edit' ? targetEditor : targetPreview
      if (target && target.scrollTo) {
        target.scrollTo(scrollTop)
      }
    }
  }

  // 後方互換性のためのラッパー関数
  function handleLeftScroll(scrollTop: number, scrollHeight: number) {
    handlePaneScroll('left', scrollTop, scrollHeight)
  }

  function handleRightScroll(scrollTop: number, scrollHeight: number) {
    handlePaneScroll('right', scrollTop, scrollHeight)
  }

  // リアクティブ宣言
  $: breadcrumbs = buildBreadcrumbs(
    leftView,
    leftNote,
    leftLeaf,
    $notes,
    'left',
    goHome,
    selectNote
  )
  $: breadcrumbsRight = buildBreadcrumbs(
    rightView,
    rightNote,
    rightLeaf,
    $notes,
    'right',
    goHome,
    selectNote
  )
  $: isGitHubConfigured = $githubConfigured
  $: document.title = $settings.toolName

  // URLルーティング
  let isRestoringFromUrl = false

  function updateUrlFromState() {
    // 初期化完了まで、URL更新をスキップ
    if (isRestoringFromUrl || isPulling || isOperationsLocked) {
      return
    }

    const params = new URLSearchParams()

    // 左ペイン（常に設定）
    const leftPath = buildPath(leftNote, leftLeaf, $notes, leftView)
    params.set('left', leftPath)

    // 右ペイン（2ペイン表示時は独立した状態、1ペイン時は左と同じ）
    const rightPath = isDualPane ? buildPath(rightNote, rightLeaf, $notes, rightView) : leftPath
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
            leftNote = note
            leftLeaf = leaf
            leftView = 'edit'
          }
        }
      } else if (noteId) {
        const note = $notes.find((f) => f.id === noteId)
        if (note) {
          leftNote = note
          leftLeaf = null
          leftView = 'note'
        }
      } else {
        leftNote = null
        leftLeaf = null
        leftView = 'home'
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
      leftNote = null
      leftLeaf = null
      leftView = 'home'
    } else if (leftResolution.type === 'note') {
      leftNote = leftResolution.note
      leftLeaf = null
      leftView = 'note'
    } else if (leftResolution.type === 'leaf') {
      leftNote = leftResolution.note
      leftLeaf = leftResolution.leaf
      leftView = leftResolution.isPreview ? 'preview' : 'edit'
    }

    // 右ペインの復元（2ペイン表示時のみ）
    if (rightPath && isDualPane) {
      const rightResolution = resolvePath(rightPath, $notes, $leaves)

      if (rightResolution.type === 'home') {
        rightNote = null
        rightLeaf = null
        rightView = 'home'
      } else if (rightResolution.type === 'note') {
        rightNote = rightResolution.note
        rightLeaf = null
        rightView = 'note'
      } else if (rightResolution.type === 'leaf') {
        rightNote = rightResolution.note
        rightLeaf = rightResolution.leaf
        rightView = rightResolution.isPreview ? 'preview' : 'edit'
      }
    } else {
      // 1ペイン表示時は右ペインを左と同じにする
      rightNote = leftNote
      rightLeaf = leftLeaf
      rightView = leftView
    }

    if (!alreadyRestoring) {
      isRestoringFromUrl = false
    }
  }

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
      leftView,
      leftNote,
      leftLeaf,
      rightView,
      rightNote,
      rightLeaf,
      isDualPane,
      focusedPane,
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
    leftView = state.leftView
    leftNote = state.leftNote
    leftLeaf = state.leftLeaf
    rightView = state.rightView
    rightNote = state.rightNote
    rightLeaf = state.rightLeaf
    focusedPane = state.focusedPane
    selectedIndexLeft = state.selectedIndexLeft
    selectedIndexRight = state.selectedIndexRight
  }

  // 公開ナビゲーション関数（navigation.tsのラッパー）
  function goHome(pane: Pane) {
    const state = getNavState()
    nav.goHome(state, getNavDeps(), pane)
    syncNavState(state)
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
    breadcrumbs = buildBreadcrumbs(leftView, leftNote, leftLeaf, $notes, 'left', goHome, selectNote)
    breadcrumbsRight = buildBreadcrumbs(
      rightView,
      rightNote,
      rightLeaf,
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
      updateNoteName(actualId, trimmed)
      const updatedNote = $notes.find((f) => f.id === actualId)
      if (updatedNote) {
        if (leftNote?.id === actualId) {
          leftNote = updatedNote
        }
        if (isRight && rightNote?.id === actualId) {
          rightNote = updatedNote
        }
      }
      if (!$notes.some((f) => f.id === leftNote?.id)) {
        leftNote = null
      }
      if (isRight && !$notes.some((f) => f.id === rightNote?.id)) {
        rightNote = null
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
        if (leftLeaf?.id === actualId) {
          leftLeaf = updatedLeaf
        }
        if (isRight && rightLeaf?.id === actualId) {
          rightLeaf = updatedLeaf
        }
      }
      if (!$leaves.some((n) => n.id === leftLeaf?.id)) {
        leftLeaf = null
      }
      if (isRight && !$leaves.some((n) => n.id === rightLeaf?.id)) {
        rightLeaf = null
      }
    }

    refreshBreadcrumbs()
    editingBreadcrumb = null
  }

  function cancelEditBreadcrumb() {
    editingBreadcrumb = null
  }

  // 名前重複チェック用ヘルパー
  function generateUniqueName(baseName: string, existingNames: string[]): string {
    let counter = 1
    let name = `${baseName}${counter}`
    while (existingNames.includes(name)) {
      counter++
      name = `${baseName}${counter}`
    }
    return name
  }

  // ノート管理（束）
  function createNote(parentId: string | undefined, pane: Pane) {
    if (isOperationsLocked) return
    const allNotes = $notes

    // 階層制限チェック: サブノートの下にはサブノートを作成できない
    if (parentId) {
      const parentNote = allNotes.find((n) => n.id === parentId)
      if (parentNote && parentNote.parentId) {
        showAlert('サブノートの下にはサブノートを作成できません。')
        return
      }
    }

    const targetNotes = parentId
      ? allNotes.filter((f) => f.parentId === parentId)
      : allNotes.filter((f) => !f.parentId)

    const existingNames = targetNotes.map((n) => n.name)
    const uniqueName = generateUniqueName('ノート', existingNames)

    const newNote: Note = {
      id: crypto.randomUUID(),
      name: uniqueName,
      parentId: parentId || undefined,
      order: targetNotes.length,
    }

    updateNotes([...allNotes, newNote])
  }

  function deleteNote(pane: Pane) {
    if (isOperationsLocked) {
      showAlert('初回Pullが完了するまで操作できません。設定からPullしてください。')
      return
    }
    const targetNote = pane === 'left' ? leftNote : rightNote
    if (!targetNote) return

    const allNotes = $notes
    const allLeaves = $leaves
    const hasSubNotes = allNotes.some((f) => f.parentId === targetNote.id)
    const hasLeaves = allLeaves.some((n) => n.noteId === targetNote.id)

    const deleteNoteAndDescendants = () => {
      const targetId = targetNote.id

      const descendantIds = new Set<string>()
      const collectDescendants = (id: string) => {
        descendantIds.add(id)
        allNotes.filter((n) => n.parentId === id).forEach((n) => collectDescendants(n.id))
      }
      collectDescendants(targetId)

      const remainingNotes = allNotes.filter((n) => !descendantIds.has(n.id))
      const remainingLeaves = allLeaves.filter((l) => !descendantIds.has(l.noteId))

      updateNotes(remainingNotes)
      updateLeaves(remainingLeaves)
      rebuildLeafStats(remainingLeaves)

      const parentId = targetNote.parentId
      const parentNote = parentId ? remainingNotes.find((f) => f.id === parentId) : null

      const navigateAfterDelete = (paneToCheck: Pane) => {
        const currentNote = paneToCheck === 'left' ? leftNote : rightNote
        const currentLeaf = paneToCheck === 'left' ? leftLeaf : rightLeaf

        const isNoteDeleted = currentNote ? descendantIds.has(currentNote.id) : false
        const isLeafDeleted = currentLeaf ? descendantIds.has(currentLeaf.noteId) : false

        if (isNoteDeleted || isLeafDeleted) {
          if (parentNote) {
            selectNote(parentNote, paneToCheck)
          } else {
            goHome(paneToCheck)
          }
        }
      }

      navigateAfterDelete(pane)
      const otherPane = pane === 'left' ? 'right' : 'left'
      navigateAfterDelete(otherPane)
    }

    const confirmMessage = targetNote.parentId
      ? $_('modal.deleteSubNote')
      : $_('modal.deleteRootNote')

    showConfirm(confirmMessage, deleteNoteAndDescendants)
  }

  function updateNoteName(noteId: string, newName: string) {
    const allNotes = $notes
    const updatedNotes = allNotes.map((f) => (f.id === noteId ? { ...f, name: newName } : f))
    updateNotes(updatedNotes)
  }

  function normalizeBadgeValue(value: string | undefined | null): string {
    return value || ''
  }

  function updateNoteBadge(noteId: string, badgeIcon: string, badgeColor: string) {
    const current = $notes.find((n) => n.id === noteId)
    if (!current) return
    const nextIcon = normalizeBadgeValue(badgeIcon)
    const nextColor = normalizeBadgeValue(badgeColor)
    if (
      normalizeBadgeValue(current.badgeIcon) === nextIcon &&
      normalizeBadgeValue(current.badgeColor) === nextColor
    ) {
      return
    }

    const updated = $notes.map((n) =>
      n.id === noteId ? { ...n, badgeIcon: nextIcon, badgeColor: nextColor } : n
    )
    updateNotes(updated)
  }

  // ドラッグ&ドロップ（汎用ヘルパー関数）- drag-drop.tsに移動

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

  // リーフ管理
  function createLeaf(pane: Pane) {
    if (isOperationsLocked) return
    const targetNote = pane === 'left' ? leftNote : rightNote
    if (!targetNote) return

    const allLeaves = $leaves
    const noteLeaves = allLeaves.filter((n) => n.noteId === targetNote.id)

    const existingTitles = noteLeaves.map((l) => l.title)
    const uniqueTitle = generateUniqueName('リーフ', existingTitles)

    const newLeaf: Leaf = {
      id: crypto.randomUUID(),
      title: uniqueTitle,
      noteId: targetNote.id,
      content: `# ${uniqueTitle}\n\n`,
      updatedAt: Date.now(),
      order: noteLeaves.length,
    }

    const newLeafChars = computeLeafCharCount(newLeaf.content)
    leafCharCounts.set(newLeaf.id, newLeafChars)
    totalLeafCount += 1
    totalLeafChars += newLeafChars

    updateLeaves([...allLeaves, newLeaf])
    selectLeaf(newLeaf, pane)
  }

  function deleteLeaf(leafId: string, pane: Pane) {
    if (isOperationsLocked) {
      showAlert('初回Pullが完了するまで操作できません。設定からPullしてください。')
      return
    }

    const allLeaves = $leaves
    const targetLeaf = allLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return

    const prevChars = leafCharCounts.get(leafId) ?? computeLeafCharCount(targetLeaf.content)

    showConfirm('このリーフを削除しますか？', () => {
      updateLeaves(allLeaves.filter((n) => n.id !== leafId))

      leafCharCounts.delete(leafId)
      totalLeafCount = Math.max(0, totalLeafCount - 1)
      totalLeafChars = Math.max(0, totalLeafChars - prevChars)

      const note = $notes.find((f) => f.id === targetLeaf.noteId)

      // 現在のペインをナビゲート
      if (note) {
        selectNote(note, pane)
      } else {
        goHome(pane)
      }

      // 他方のペインも同じリーフを表示している場合はナビゲート
      const otherPane = pane === 'left' ? 'right' : 'left'
      const otherLeaf = otherPane === 'left' ? leftLeaf : rightLeaf
      if (otherLeaf && otherLeaf.id === leafId) {
        if (note) {
          selectNote(note, otherPane)
        } else {
          goHome(otherPane)
        }
      }
    })
  }

  // リーフコンテンツから # 見出しを抽出 - breadcrumbs.tsに移動
  // リーフコンテンツの1行目の # 見出しを更新 - breadcrumbs.tsに移動

  function updateLeafContent(content: string, leafId: string) {
    if (isOperationsLocked) return

    const allLeaves = $leaves
    const targetLeaf = allLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return

    const previousChars = leafCharCounts.get(leafId) ?? computeLeafCharCount(targetLeaf.content)
    const nextChars = computeLeafCharCount(content)

    // コンテンツの1行目が # 見出しの場合、リーフのタイトルも自動更新
    const h1Title = extractH1Title(content)
    let newTitle = h1Title || targetLeaf.title

    if (h1Title && targetLeaf) {
      const trimmed = h1Title.trim()
      const hasDuplicate = allLeaves.some(
        (l) => l.id !== leafId && l.noteId === targetLeaf.noteId && l.title.trim() === trimmed
      )
      if (hasDuplicate) {
        showAlert($_('modal.duplicateLeafHeading'))
        newTitle = targetLeaf.title
      }
    }

    // グローバルストアを更新（左右ペイン両方に反映される）
    const updatedLeaves = allLeaves.map((n) =>
      n.id === leafId ? { ...n, content, title: newTitle, updatedAt: Date.now() } : n
    )
    updateLeaves(updatedLeaves)

    leafCharCounts.set(leafId, nextChars)
    totalLeafChars += nextChars - previousChars

    // 左ペインのリーフを編集している場合は leftLeaf も更新
    if (leftLeaf?.id === leafId) {
      leftLeaf = { ...leftLeaf, content, title: newTitle, updatedAt: Date.now() }
    }

    // 右ペインのリーフを編集している場合は rightLeaf も更新
    if (rightLeaf?.id === leafId) {
      rightLeaf = { ...rightLeaf, content, title: newTitle, updatedAt: Date.now() }
    }

    // タイトルが変更された場合、パンくずリストも更新
    if (h1Title) {
      refreshBreadcrumbs()
    }
  }

  function updateLeafBadge(leafId: string, badgeIcon: string, badgeColor: string) {
    const allLeaves = $leaves
    const current = allLeaves.find((l) => l.id === leafId)
    if (!current) return

    const nextIcon = normalizeBadgeValue(badgeIcon)
    const nextColor = normalizeBadgeValue(badgeColor)
    if (
      normalizeBadgeValue(current.badgeIcon) === nextIcon &&
      normalizeBadgeValue(current.badgeColor) === nextColor
    ) {
      return
    }

    const updatedLeaves = allLeaves.map((n) =>
      n.id === leafId
        ? { ...n, badgeIcon: nextIcon, badgeColor: nextColor, updatedAt: Date.now() }
        : n
    )
    updateLeaves(updatedLeaves)

    if (leftLeaf?.id === leafId) {
      leftLeaf = { ...leftLeaf, badgeIcon: nextIcon, badgeColor: nextColor, updatedAt: Date.now() }
    }
    if (rightLeaf?.id === leafId) {
      rightLeaf = {
        ...rightLeaf,
        badgeIcon: nextIcon,
        badgeColor: nextColor,
        updatedAt: Date.now(),
      }
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
    const leaf = pane === 'left' ? leftLeaf : rightLeaf
    if (!leaf) return
    moveTargetLeaf = leaf
    moveTargetNote = null
    moveTargetPane = pane
    moveModalOpen = true
  }

  function openMoveModalForNote(pane: Pane) {
    if (isOperationsLocked) return
    const note = pane === 'left' ? leftNote : rightNote
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

  function normalizeNoteOrders(list: Note[], parentId: string | undefined | null): Note[] {
    const sorted = list
      .filter((n) => (n.parentId || null) === (parentId || null))
      .sort((a, b) => a.order - b.order)
    return list.map((n) =>
      (n.parentId || null) === (parentId || null)
        ? { ...n, order: sorted.findIndex((s) => s.id === n.id) }
        : n
    )
  }

  function normalizeLeafOrders(list: Leaf[], noteId: string): Leaf[] {
    const sorted = list.filter((l) => l.noteId === noteId).sort((a, b) => a.order - b.order)
    return list.map((l) =>
      l.noteId === noteId ? { ...l, order: sorted.findIndex((s) => s.id === l.id) } : l
    )
  }

  function handleMoveConfirm(destNoteId: string | null) {
    if (moveTargetLeaf) {
      moveLeafTo(destNoteId)
    } else if (moveTargetNote) {
      moveNoteTo(destNoteId)
    }
  }

  function moveLeafTo(destNoteId: string | null) {
    const leaf = moveTargetLeaf
    if (!leaf) return
    if (!destNoteId) return
    if (leaf.noteId === destNoteId) {
      closeMoveModal()
      return
    }

    const allLeaves = $leaves
    const destinationNote = $notes.find((n) => n.id === destNoteId)
    if (!destinationNote) return

    const hasDuplicate = allLeaves.some(
      (l) => l.noteId === destNoteId && l.title.trim() === leaf.title.trim()
    )
    if (hasDuplicate) {
      showAlert($_('modal.duplicateLeafDestination'))
      return
    }

    const remaining = allLeaves.filter((l) => l.id !== leaf.id)
    let updatedLeaves = normalizeLeafOrders(remaining, leaf.noteId)
    updatedLeaves = normalizeLeafOrders(updatedLeaves, destNoteId)

    const movedLeaf: Leaf = {
      ...leaf,
      noteId: destNoteId,
      order: updatedLeaves.filter((l) => l.noteId === destNoteId).length,
      updatedAt: Date.now(),
    }
    updatedLeaves = [...updatedLeaves, movedLeaf]

    updateLeaves(updatedLeaves)

    if (leftLeaf?.id === leaf.id) {
      leftLeaf = movedLeaf
      leftNote = destinationNote
    }
    if (rightLeaf?.id === leaf.id) {
      rightLeaf = movedLeaf
      rightNote = destinationNote
    }

    closeMoveModal()
    showPushToast('移動しました', 'success')
  }

  function moveNoteTo(destNoteId: string | null) {
    const note = moveTargetNote
    if (!note) return
    const currentParent = note.parentId || null
    const nextParent = destNoteId
    if (currentParent === nextParent) {
      closeMoveModal()
      return
    }
    if (nextParent) {
      const dest = $notes.find((n) => n.id === nextParent)
      if (!dest || dest.parentId) {
        closeMoveModal()
        return
      }
    }

    const hasDuplicate = $notes.some(
      (n) =>
        (n.parentId || null) === nextParent &&
        n.id !== note.id &&
        n.name.trim() === note.name.trim()
    )
    if (hasDuplicate) {
      showAlert($_('modal.duplicateNoteDestination'))
      return
    }

    let updated = $notes.map((n) =>
      n.id === note.id ? { ...n, parentId: nextParent || undefined, order: n.order } : n
    )
    updated = normalizeNoteOrders(updated, currentParent)
    updated = normalizeNoteOrders(updated, nextParent)

    updateNotes(updated)

    const updatedNote = updated.find((n) => n.id === note.id) || note
    if (leftNote?.id === note.id) {
      leftNote = updatedNote
    }
    if (rightNote?.id === note.id) {
      rightNote = updatedNote
    }

    closeMoveModal()
    showPushToast('移動しました', 'success')
  }

  // ヘルパー関数
  function getItemCount(noteId: string): number {
    const allNotes = $notes
    const allLeaves = $leaves
    const subNotesCount = allNotes.filter((f) => f.parentId === noteId).length
    const leavesCount = allLeaves.filter((n) => n.noteId === noteId).length
    return subNotesCount + leavesCount
  }

  function getLeafCount(noteId: string): number {
    return $leaves.filter((n) => n.noteId === noteId).length
  }

  function resetLeafStats() {
    leafCharCounts.clear()
    totalLeafCount = 0
    totalLeafChars = 0
  }

  function computeLeafCharCount(content: string): number {
    return content.replace(/\s+/g, '').length
  }

  function rebuildLeafStats(allLeaves: Leaf[]) {
    resetLeafStats()
    for (const leaf of allLeaves) {
      const chars = computeLeafCharCount(leaf.content)
      leafCharCounts.set(leaf.id, chars)
      totalLeafCount += 1
      totalLeafChars += chars
    }
  }

  function getNoteItems(noteId: string): string[] {
    const allNotes = $notes
    const allLeaves = $leaves
    const subNotesNames = allNotes
      .filter((f) => f.parentId === noteId)
      .sort((a, b) => a.order - b.order)
      .map((f) => `${f.name}/`) // サブノートは末尾にスラッシュで区別
    const leafNames = allLeaves
      .filter((n) => n.noteId === noteId)
      .sort((a, b) => a.order - b.order)
      .map((n) => n.title)

    const allItems = [...subNotesNames, ...leafNames]
    const hasMore = allItems.length > 3
    const items = allItems.slice(0, 3)

    if (hasMore) {
      items.push('...')
    }

    return items
  }

  // GitHub同期
  let isPushing = false
  async function handleSaveToGitHub() {
    // 実行中は何もしない（ダブルクリック防止）
    if (isPushing) return

    isPushing = true
    try {
      // Push開始を通知
      showPushToast('Pushします')

      const result = await executePush($leaves, $notes, $settings, isOperationsLocked)

      // 結果を通知
      showPushToast(result.message, result.variant)

      // Push成功時にダーティフラグをクリア
      if (result.variant === 'success') {
        isDirty.set(false)
      }
    } finally {
      isPushing = false
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
        const parsed = await parseSimpleNoteFile(file)
        if (!parsed || parsed.leaves.length === 0) {
          showPushToast($_('settings.importExport.unsupportedFile'), 'error')
          return
        }

        const allNotes = get(notes)
        const allLeaves = get(leaves)

        const baseName = 'SimpleNote'
        const existingNames = new Set(allNotes.map((n) => n.name))
        let noteName = `${baseName}1`
        let suffix = 1
        while (existingNames.has(noteName)) {
          suffix += 1
          noteName = `${baseName}${suffix}`
        }

        const noteId = crypto.randomUUID()
        const noteOrder = allNotes.length ? Math.max(...allNotes.map((n) => n.order)) + 1 : 0

        const newNote: Note = {
          id: noteId,
          name: noteName,
          order: noteOrder,
        }

        const baseLeafOrder = allLeaves.length ? Math.max(...allLeaves.map((l) => l.order)) + 1 : 0

        const importedLeaves: Leaf[] = parsed.leaves.map((leaf, idx) => ({
          id: crypto.randomUUID(),
          title: leaf.title,
          noteId,
          content: leaf.content,
          updatedAt: leaf.updatedAt ?? Date.now(),
          order: baseLeafOrder + idx,
        }))

        const skipped = parsed.skipped || 0
        const reportTitle = $_('settings.importExport.importReportTitle')
        const perItemLines = importedLeaves.map((leaf) =>
          $_('settings.importExport.importReportPerItemLine', { values: { title: leaf.title } })
        )

        const sanitizedLines =
          parsed.sanitizedTitles && parsed.sanitizedTitles.length > 0
            ? [
                $_('settings.importExport.importReportSanitizedHeader'),
                ...parsed.sanitizedTitles.map((entry) =>
                  $_('settings.importExport.importReportSanitizedLine', { values: { entry } })
                ),
              ]
            : []

        const errorLines =
          parsed.errors?.length && parsed.errors.length > 0
            ? [
                $_('settings.importExport.importReportErrorsHeader'),
                ...parsed.errors.map((msg) =>
                  $_('settings.importExport.importReportErrorLine', { values: { message: msg } })
                ),
              ]
            : []

        const reportLines = [
          $_('settings.importExport.importReportHeader'),
          $_('settings.importExport.importReportSource'),
          $_('settings.importExport.importReportCount', {
            values: { count: importedLeaves.length },
          }),
          $_('settings.importExport.importReportSkipped', {
            values: { skipped },
          }),
          $_('settings.importExport.importReportPlacement', {
            values: { noteName },
          }),
          $_('settings.importExport.importReportUnsupported'),
          ...sanitizedLines,
          $_('settings.importExport.importReportPerItemHeader'),
          ...perItemLines,
          parsed.errors?.length ? $_('settings.importExport.importReportHasErrors') : '',
          $_('settings.importExport.importReportConsole'),
          ...errorLines,
        ].filter(Boolean)

        const reportLeaf: Leaf = {
          id: crypto.randomUUID(),
          title: reportTitle,
          noteId,
          content: reportLines.join('\n'),
          updatedAt: Date.now(),
          order: baseLeafOrder,
        }

        const shiftedImportedLeaves = importedLeaves.map((leaf, idx) => ({
          ...leaf,
          order: baseLeafOrder + 1 + idx,
        }))

        updateNotes([...allNotes, newNote])
        updateLeaves([...allLeaves, reportLeaf, ...shiftedImportedLeaves])

        if (parsed.errors?.length) {
          console.warn('Import skipped items:', parsed.errors)
        }
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
    if (isOperationsLocked) {
      showPushToast('初回Pullが完了するまでダウンロードできません', 'error')
      return
    }

    const allLeaves = $leaves
    const targetLeaf = allLeaves.find((l) => l.id === leafId)
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

  // シェア機能
  function handleCopyUrl(pane: Pane) {
    const url = window.location.href
    navigator.clipboard
      .writeText(url)
      .then(() => {
        showPushToast($_('share.urlCopied'), 'success')
      })
      .catch((err) => {
        console.error('URLのコピーに失敗しました:', err)
        showPushToast($_('share.urlCopied'), 'error')
      })
  }

  function handleCopyMarkdown(pane: Pane) {
    const leaf = pane === 'left' ? leftLeaf : rightLeaf
    const view = pane === 'left' ? leftView : rightView

    if (!leaf) return

    // プレビューモード時は画像をコピー
    if (view === 'preview') {
      handleCopyImageToClipboard(pane)
      return
    }

    // 編集モード時はMarkdownをコピー
    navigator.clipboard
      .writeText(leaf.content)
      .then(() => {
        showPushToast($_('share.markdownCopied'), 'success')
      })
      .catch((err) => {
        console.error('Markdownのコピーに失敗しました:', err)
        showPushToast($_('share.markdownCopied'), 'error')
      })
  }

  // 画像をクリップボードにコピー
  async function handleCopyImageToClipboard(pane: Pane) {
    const previewView = pane === 'left' ? leftPreviewView : rightPreviewView

    if (!previewView || !previewView.copyImageToClipboard) return

    try {
      await previewView.copyImageToClipboard()
      showPushToast($_('share.imageCopied'), 'success')
    } catch (error) {
      console.error('画像のコピーに失敗しました:', error)
      showPushToast($_('share.imageCopyFailed'), 'error')
    }
  }

  // Web Share APIで画像を共有
  async function handleShareImage(pane: Pane) {
    const leaf = pane === 'left' ? leftLeaf : rightLeaf
    const previewView = pane === 'left' ? leftPreviewView : rightPreviewView

    if (!leaf || !previewView || !previewView.shareImage) return

    try {
      await previewView.shareImage(leaf.title)
      // 成功時はトーストを表示しない（共有ダイアログで完結するため）
    } catch (error: any) {
      // Web Share APIがサポートされていない場合はクリップボードにコピー
      if (error.message === 'Web Share API is not supported') {
        await handleCopyImageToClipboard(pane)
      } else if (error.name === 'AbortError') {
        // ユーザーが共有をキャンセルした場合は何もしない
      } else {
        console.error('共有に失敗しました:', error)
        showPushToast($_('share.shareFailed'), 'error')
      }
    }
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
    pullRunning = true
    isOperationsLocked = true
    isPulling = true // Pull処理中はURL更新をスキップ

    // Pull開始を通知
    showPullToast('Pullします')

    // 重要: GitHubが唯一の真実の情報源（Single Source of Truth）
    // IndexedDBは単なるキャッシュであり、Pull成功時に全削除→全作成される
    // 前回終了時のIndexedDBデータは使用しない
    await clearAllData() // IndexedDB全削除
    notes.set([])
    leaves.set([])
    resetLeafStats()
    leftNote = null
    leftLeaf = null
    rightNote = null
    rightLeaf = null

    const result = await executePull($settings, isInitial)

    if (result.success) {
      // 初回Pull時は、データ更新前にisRestoringFromUrlをtrueにする
      // これにより、データ更新によるリアクティブ宣言の発火を防ぐ
      if (isInitial) {
        isRestoringFromUrl = true
      }

      // GitHubから取得したデータでIndexedDBを再作成
      updateNotes(result.notes)
      updateLeaves(result.leaves)
      rebuildLeafStats(result.leaves)
      metadata.set(result.metadata)
      isOperationsLocked = false

      // Pull成功時はGitHubと同期したのでダーティフラグをクリア
      isDirty.set(false)

      // Pull後はURLから状態を復元（初回Pullも含む）
      if (isInitial) {
        restoreStateFromUrl(true)
        isRestoringFromUrl = false
      } else {
        restoreStateFromUrl(false)
      }
    } else {
      // 初回Pull失敗時は静かに処理（設定未完了は正常な状態）
      // 2回目以降のPull失敗はトーストで通知される
    }

    // 結果を通知
    showPullToast(result.message, result.variant)
    pullRunning = false
    isPulling = false // Pull処理完了
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
      pullDisabled={pullRunning || isPushing}
    />

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
          isPreview={leftView === 'preview'}
        />

        <main class="main-pane">
          {#if leftView === 'home'}
            <HomeView
              notes={$rootNotes}
              disabled={isOperationsLocked}
              selectedIndex={selectedIndexLeft}
              isActive={focusedPane === 'left'}
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
            />
          {:else if leftView === 'note' && leftNote}
            <NoteView
              currentNote={leftNote}
              subNotes={$notes
                .filter((n) => n.parentId === leftNote.id)
                .sort((a, b) => a.order - b.order)}
              leaves={$leaves
                .filter((l) => l.noteId === leftNote.id)
                .sort((a, b) => a.order - b.order)}
              disabled={isOperationsLocked}
              selectedIndex={selectedIndexLeft}
              isActive={focusedPane === 'left'}
              vimMode={$settings.vimMode ?? false}
              onSelectNote={(note) => selectNote(note, 'left')}
              onSelectLeaf={(leaf) => selectLeaf(leaf, 'left')}
              onCreateNote={() => createNote(leftNote.id, 'left')}
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
            />
          {:else if leftView === 'edit' && leftLeaf}
            <EditorView
              bind:this={leftEditorView}
              leaf={leftLeaf}
              theme={$settings.theme}
              vimMode={$settings.vimMode ?? false}
              linedMode={$settings.linedMode ?? false}
              pane="left"
              disabled={isOperationsLocked || isPushing}
              onContentChange={updateLeafContent}
              onSave={handleSaveToGitHub}
              onClose={() => closeLeaf('left')}
              onSwitchPane={() => switchPane('left')}
              onDownload={downloadLeafAsMarkdown}
              onDelete={(leafId) => deleteLeaf(leafId, 'left')}
              onScroll={handleLeftScroll}
            />
          {:else if leftView === 'preview' && leftLeaf}
            <PreviewView bind:this={leftPreviewView} leaf={leftLeaf} onScroll={handleLeftScroll} />
          {/if}
        </main>

        {#if leftView === 'home'}
          <HomeFooter
            onCreateNote={() => createNote(undefined, 'left')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
          />
        {:else if leftView === 'note' && leftNote}
          <NoteFooter
            onDeleteNote={() => deleteNote('left')}
            onMove={() => openMoveModalForNote('left')}
            onCreateSubNote={() => createNote(leftNote.id, 'left')}
            onCreateLeaf={() => createLeaf('left')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            canHaveSubNote={!leftNote.parentId}
          />
        {:else if leftView === 'edit' && leftLeaf}
          <EditorFooter
            onDelete={() => deleteLeaf(leftLeaf.id, 'left')}
            onMove={() => openMoveModalForLeaf('left')}
            onDownload={() => downloadLeafAsMarkdown(leftLeaf.id)}
            onTogglePreview={() => togglePreview('left')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
          />
        {:else if leftView === 'preview' && leftLeaf}
          <PreviewFooter
            onMove={() => openMoveModalForLeaf('left')}
            onDownload={() => downloadLeafAsImage(leftLeaf.id, 'left')}
            onToggleEdit={() => togglePreview('left')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
          />
        {/if}

        {#if isOperationsLocked && !showWelcome && !pullRunning}
          <div class="config-required-overlay"></div>
        {/if}
        {#if pullRunning || isPushing}
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
          isPreview={rightView === 'preview'}
        />

        <main class="main-pane">
          {#if rightView === 'home'}
            <HomeView
              notes={$rootNotes}
              disabled={isOperationsLocked}
              selectedIndex={selectedIndexRight}
              isActive={focusedPane === 'right'}
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
            />
          {:else if rightView === 'note' && rightNote}
            <NoteView
              currentNote={rightNote}
              subNotes={$notes
                .filter((n) => n.parentId === rightNote.id)
                .sort((a, b) => a.order - b.order)}
              leaves={$leaves
                .filter((l) => l.noteId === rightNote.id)
                .sort((a, b) => a.order - b.order)}
              disabled={isOperationsLocked}
              selectedIndex={selectedIndexRight}
              isActive={focusedPane === 'right'}
              vimMode={$settings.vimMode ?? false}
              onSelectNote={(note) => selectNote(note, 'right')}
              onSelectLeaf={(leaf) => selectLeaf(leaf, 'right')}
              onCreateNote={() => createNote(rightNote.id, 'right')}
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
            />
          {:else if rightView === 'edit' && rightLeaf}
            <EditorView
              bind:this={rightEditorView}
              leaf={rightLeaf}
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
          {:else if rightView === 'preview' && rightLeaf}
            <PreviewView
              bind:this={rightPreviewView}
              leaf={rightLeaf}
              onScroll={handleRightScroll}
            />
          {/if}
        </main>

        {#if rightView === 'home'}
          <HomeFooter
            onCreateNote={() => createNote(undefined, 'right')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
          />
        {:else if rightView === 'note' && rightNote}
          <NoteFooter
            onDeleteNote={() => deleteNote('right')}
            onMove={() => openMoveModalForNote('right')}
            onCreateSubNote={() => createNote(rightNote.id, 'right')}
            onCreateLeaf={() => createLeaf('right')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
            canHaveSubNote={!rightNote.parentId}
          />
        {:else if rightView === 'edit' && rightLeaf}
          <EditorFooter
            onDelete={() => deleteLeaf(rightLeaf.id, 'right')}
            onMove={() => openMoveModalForLeaf('right')}
            onDownload={() => downloadLeafAsMarkdown(rightLeaf.id)}
            onTogglePreview={() => togglePreview('right')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
          />
        {:else if rightView === 'preview' && rightLeaf}
          <PreviewFooter
            onMove={() => openMoveModalForLeaf('right')}
            onDownload={() => downloadLeafAsImage(rightLeaf.id, 'right')}
            onToggleEdit={() => togglePreview('right')}
            onSave={handleSaveToGitHub}
            disabled={isOperationsLocked}
            isDirty={$isDirty}
          />
        {/if}

        {#if isOperationsLocked && !showWelcome && !pullRunning}
          <div class="config-required-overlay"></div>
        {/if}
        {#if pullRunning || isPushing}
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
            {pullRunning}
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

<style>
  .i18n-loading {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg, #1a1a1a);
  }

  .loading-spinner {
    display: flex;
    gap: 0.5rem;
  }

  .loading-spinner .dot {
    width: 12px;
    height: 12px;
    background: var(--accent, #8b5cf6);
    border-radius: 50%;
    animation: pulse 1.4s ease-in-out infinite;
  }

  .loading-spinner .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .loading-spinner .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes pulse {
    0%,
    80%,
    100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  }
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--bg);
    color: var(--text);
  }

  .app-container {
    width: 100%;
    height: 100vh; /* フォールバック */
    height: 100dvh; /* モバイルブラウザのアドレスバーを考慮 */
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-wrapper {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .content-wrapper.single-pane {
    grid-template-columns: 1fr;
  }

  .pane-divider {
    position: absolute;
    top: 0;
    left: 50%;
    bottom: 0;
    width: 1px;
    background: rgba(0, 0, 0, 0.15);
    z-index: 150;
    pointer-events: none;
  }

  :global([data-theme='greenboard']) .pane-divider,
  :global([data-theme='dotsD']) .pane-divider,
  :global([data-theme='dotsF']) .pane-divider {
    background: rgba(255, 255, 255, 0.15);
  }

  .left-column,
  .right-column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .main-pane {
    flex: 1;
    min-height: 0;
    overflow: auto;
    position: relative;
  }

  .hidden {
    display: none;
  }

  .settings-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 2rem;
  }

  .settings-modal-content {
    background: var(--bg);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 900px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
  }

  .settings-close-button {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 4px;
    transition: all 0.2s;
    z-index: 1;
  }

  .settings-close-button:hover {
    background: var(--surface-1);
    color: var(--text);
  }

  :global(.save-button) {
    position: relative;
  }

  :global(.notification-badge) {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
  }

  .welcome-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 2rem;
  }

  .welcome-modal-content {
    background: var(--bg);
    border-radius: 16px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
    padding: 3rem 2rem;
    max-width: 500px;
    width: 100%;
    text-align: center;
  }

  .welcome-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 1.5rem;
    line-height: 1.4;
    white-space: pre-line;
  }

  .welcome-message {
    font-size: 1rem;
    color: var(--text-muted);
    margin-bottom: 1rem;
    line-height: 1.6;
  }

  .welcome-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 2rem;
  }

  .welcome-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 2rem;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .welcome-button .button-icon {
    display: flex;
    align-items: center;
    width: 20px;
    height: 20px;
  }

  .welcome-button.primary {
    background: var(--accent);
    color: white;
  }

  .welcome-button.primary:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .welcome-button.secondary {
    background: var(--surface-1);
    color: var(--text);
  }

  .welcome-button.secondary:hover {
    background: var(--surface-2);
  }

  @media (max-width: 600px) {
    .welcome-buttons {
      flex-direction: column;
    }

    .welcome-button {
      width: 100%;
    }
  }

  .config-required-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 200;
  }
</style>
