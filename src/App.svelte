<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import type { Note, Leaf, Breadcrumb, View } from './lib/types'
  import {
    settings,
    notes,
    leaves,
    currentView,
    currentNote,
    currentLeaf,
    rootNotes,
    subNotes,
    currentNoteLeaves,
    githubConfigured,
    metadata,
    isDirty,
    updateSettings,
    updateNotes,
    updateLeaves,
  } from './lib/stores'
  import { clearAllData, loadSettings } from './lib/storage'
  import { applyTheme } from './lib/theme'
  import { executePush, executePull } from './lib/sync'
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
  import Header from './components/layout/Header.svelte'
  import Breadcrumbs from './components/layout/Breadcrumbs.svelte'
  import Footer from './components/layout/Footer.svelte'
  import Loading from './components/layout/Loading.svelte'
  import Modal from './components/layout/Modal.svelte'
  import Toast from './components/layout/Toast.svelte'
  import HomeView from './components/views/HomeView.svelte'
  import NoteView from './components/views/NoteView.svelte'
  import EditorView from './components/views/EditorView.svelte'
  import PreviewView from './components/views/PreviewView.svelte'
  import SettingsView from './components/views/SettingsView.svelte'

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

  // 2ペイン用の状態（将来の拡張用、現在は1ペインのみ使用）
  let isDualPane = false // 画面幅で切り替え
  let rightNote: Note | null = null
  let rightLeaf: Leaf | null = null
  let rightView: View = 'home'

  // スクロール同期用のコンポーネント参照
  let leftEditorView: any = null
  let leftPreviewView: any = null
  let rightEditorView: any = null
  let rightPreviewView: any = null

  // スクロール同期関数
  function handleLeftScroll(scrollTop: number, scrollHeight: number) {
    // 同じリーフで、左がedit/previewで右がその逆の場合のみ同期
    if (!isDualPane || !$currentLeaf || !rightLeaf || $currentLeaf.id !== rightLeaf.id) return
    if (
      ($currentView === 'edit' && rightView === 'preview') ||
      ($currentView === 'preview' && rightView === 'edit')
    ) {
      const target = rightView === 'edit' ? rightEditorView : rightPreviewView
      if (target && target.scrollTo) {
        target.scrollTo(scrollTop)
      }
    }
  }

  function handleRightScroll(scrollTop: number, scrollHeight: number) {
    // 同じリーフで、右がedit/previewで左がその逆の場合のみ同期
    if (!isDualPane || !$currentLeaf || !rightLeaf || $currentLeaf.id !== rightLeaf.id) return
    if (
      (rightView === 'edit' && $currentView === 'preview') ||
      (rightView === 'preview' && $currentView === 'edit')
    ) {
      const target = $currentView === 'edit' ? leftEditorView : leftPreviewView
      if (target && target.scrollTo) {
        target.scrollTo(scrollTop)
      }
    }
  }

  // リアクティブ宣言
  $: breadcrumbs = getBreadcrumbs($currentView, $currentNote, $currentLeaf, $notes)
  $: breadcrumbsRight = getBreadcrumbsRight(rightView, rightNote, rightLeaf, $notes)
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
    const leftPath = buildPath($currentNote, $currentLeaf, $notes, $currentView)
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
            currentNote.set(note)
            currentLeaf.set(leaf)
            currentView.set('edit')
          }
        }
      } else if (noteId) {
        const note = $notes.find((f) => f.id === noteId)
        if (note) {
          currentNote.set(note)
          currentLeaf.set(null)
          currentView.set('note')
        }
      } else {
        currentNote.set(null)
        currentLeaf.set(null)
        currentView.set('home')
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
      currentNote.set(null)
      currentLeaf.set(null)
      currentView.set('home')
    } else if (leftResolution.type === 'note') {
      currentNote.set(leftResolution.note)
      currentLeaf.set(null)
      currentView.set('note')
    } else if (leftResolution.type === 'leaf') {
      currentNote.set(leftResolution.note)
      currentLeaf.set(leftResolution.leaf)
      currentView.set(leftResolution.isPreview ? 'preview' : 'edit')
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
      rightNote = $currentNote
      rightLeaf = $currentLeaf
      rightView = $currentView
    }

    if (!alreadyRestoring) {
      isRestoringFromUrl = false
    }
  }

  // ストアの変更をURLに反映
  $: if ($currentNote || $currentLeaf || (!$currentNote && !$currentLeaf)) {
    updateUrlFromState()
  }

  // 右ペインの状態変更をURLに反映
  $: if (rightNote || rightLeaf || (!rightNote && !rightLeaf)) {
    updateUrlFromState()
  }

  // 初期化
  onMount(() => {
    const loadedSettings = loadSettings()
    settings.set(loadedSettings)
    applyTheme(loadedSettings.theme, loadedSettings)
    document.title = loadedSettings.toolName

    // アスペクト比を監視して isDualPane を更新（横 > 縦で2ペイン表示）
    const updateDualPane = () => {
      isDualPane = window.innerWidth > window.innerHeight
    }
    updateDualPane()

    window.addEventListener('resize', updateDualPane)
    ;(async () => {
      // 初回Pull（GitHubから最新データを取得）
      // 重要: IndexedDBからは読み込まない
      // Pull成功時にIndexedDBは全削除→全作成される
      // Pull成功後、URLから状態を復元（handlePull内で実行）
      await handlePull(true)
    })()

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

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('resize', updateDualPane)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  })

  // ナビゲーション
  async function goHome() {
    currentView.set('home')
    currentNote.set(null)
    currentLeaf.set(null)
  }

  // プレビュートグル（左ペイン）
  function togglePreview() {
    if ($currentView === 'edit') {
      currentView.set('preview')
    } else if ($currentView === 'preview') {
      currentView.set('edit')
    }
    updateUrlFromState()
  }

  // プレビュートグル（右ペイン）
  function togglePreviewRight() {
    if (rightView === 'edit') {
      rightView = 'preview'
    } else if (rightView === 'preview') {
      rightView = 'edit'
    }
    updateUrlFromState()
  }

  // 右ペイン用ナビゲーション
  function selectNoteRight(note: Note) {
    rightNote = note
    rightLeaf = null
    rightView = 'note'
    updateUrlFromState()
  }

  function selectLeafRight(leaf: Leaf) {
    const note = $notes.find((n) => n.id === leaf.noteId)
    if (note) {
      rightNote = note
      rightLeaf = leaf
      rightView = 'edit'
      updateUrlFromState()
    }
  }

  function createNoteRight(parentId?: string) {
    createNote(parentId)
    updateUrlFromState()
  }

  function createLeafRight() {
    createLeaf()
    updateUrlFromState()
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

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      closeSettings()
    }
  }

  function handleContentClick(e: MouseEvent) {
    e.stopPropagation()
  }

  // パンくずリスト（左ペイン用）
  function getBreadcrumbs(
    view: View,
    note: Note | null,
    leaf: Leaf | null,
    allNotes: Note[]
  ): Breadcrumb[] {
    const crumbs: Breadcrumb[] = []

    crumbs.push({
      label: 'SimplestNote.md',
      action: goHome,
      id: 'home',
      type: 'home',
    })

    if (note) {
      const parentNote = allNotes.find((f) => f.id === note.parentId)
      if (parentNote) {
        crumbs.push({
          label: parentNote.name,
          action: () => selectNote(parentNote),
          id: parentNote.id,
          type: 'note',
        })
      }
      crumbs.push({
        label: note.name,
        action: () => selectNote(note),
        id: note.id,
        type: 'note',
      })
    }

    if (leaf) {
      crumbs.push({
        label: leaf.title,
        action: () => {},
        id: leaf.id,
        type: 'leaf',
      })
    }

    return crumbs
  }

  // パンくずリスト（右ペイン用）
  function getBreadcrumbsRight(
    view: View,
    note: Note | null,
    leaf: Leaf | null,
    allNotes: Note[]
  ): Breadcrumb[] {
    const crumbs: Breadcrumb[] = []

    crumbs.push({
      label: 'SimplestNote.md',
      action: () => {
        rightNote = null
        rightLeaf = null
        rightView = 'home'
        updateUrlFromState()
      },
      id: 'home-right',
      type: 'home',
    })

    if (note) {
      const parentNote = allNotes.find((f) => f.id === note.parentId)
      if (parentNote) {
        crumbs.push({
          label: parentNote.name,
          action: () => selectNoteRight(parentNote),
          id: parentNote.id + '-right',
          type: 'note',
        })
      }
      crumbs.push({
        label: note.name,
        action: () => selectNoteRight(note),
        id: note.id + '-right',
        type: 'note',
      })
    }

    if (leaf) {
      crumbs.push({
        label: leaf.title,
        action: () => {},
        id: leaf.id + '-right',
        type: 'leaf',
      })
    }

    return crumbs
  }

  function startEditingBreadcrumb(crumb: Breadcrumb) {
    if (crumb.type === 'home' || crumb.type === 'settings') return
    editingBreadcrumb = crumb.id
  }

  function refreshBreadcrumbs() {
    breadcrumbs = getBreadcrumbs($currentView, $currentNote, $currentLeaf, $notes)
    breadcrumbsRight = getBreadcrumbsRight(rightView, rightNote, rightLeaf, $notes)
  }

  function saveEditBreadcrumb(id: string, newName: string, type: Breadcrumb['type']) {
    if (!newName.trim()) return

    // 右ペインのパンくずリストかどうかを判定
    const isRight = id.endsWith('-right')
    const actualId = isRight ? id.replace('-right', '') : id

    if (type === 'note') {
      updateNoteName(actualId, newName.trim())
      const updatedNote = $notes.find((f) => f.id === actualId)
      if (updatedNote) {
        if ($currentNote?.id === actualId) {
          currentNote.set(updatedNote)
        }
        if (isRight && rightNote?.id === actualId) {
          rightNote = updatedNote
        }
      }
      if (!$notes.some((f) => f.id === $currentNote?.id)) {
        currentNote.set(null)
      }
      if (isRight && !$notes.some((f) => f.id === rightNote?.id)) {
        rightNote = null
      }
    } else if (type === 'leaf') {
      const allLeaves = $leaves
      const targetLeaf = allLeaves.find((n) => n.id === actualId)

      // リーフのコンテンツの1行目が # 見出しの場合、見出しテキストも更新
      let updatedContent = targetLeaf?.content || ''
      if (targetLeaf && extractH1Title(targetLeaf.content)) {
        updatedContent = updateH1Title(targetLeaf.content, newName.trim())
      }

      const updatedLeaves = allLeaves.map((n) =>
        n.id === actualId
          ? { ...n, title: newName.trim(), content: updatedContent, updatedAt: Date.now() }
          : n
      )
      updateLeaves(updatedLeaves)
      const updatedLeaf = updatedLeaves.find((n) => n.id === actualId)
      if (updatedLeaf) {
        if ($currentLeaf?.id === actualId) {
          currentLeaf.set(updatedLeaf)
        }
        if (isRight && rightLeaf?.id === actualId) {
          rightLeaf = updatedLeaf
        }
      }
      if (!$leaves.some((n) => n.id === $currentLeaf?.id)) {
        currentLeaf.set(null)
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
  function createNote(parentId?: string) {
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

  function selectNote(note: Note) {
    currentNote.set(note)
    currentLeaf.set(null)
    currentView.set('note')
  }

  function deleteNote() {
    if (isOperationsLocked) {
      showAlert('初回Pullが完了するまで操作できません。設定からPullしてください。')
      return
    }
    if (!$currentNote) return

    const allNotes = $notes
    const allLeaves = $leaves
    const hasSubNotes = allNotes.some((f) => f.parentId === $currentNote!.id)
    const hasLeaves = allLeaves.some((n) => n.noteId === $currentNote!.id)

    if (hasSubNotes || hasLeaves) {
      showAlert('サブノートやリーフが含まれているため削除できません。')
      return
    }

    showConfirm('このノートを削除しますか？', () => {
      const noteId = $currentNote!.id
      const parentId = $currentNote!.parentId
      updateNotes(allNotes.filter((f) => f.id !== noteId))

      const parentNote = allNotes.find((f) => f.id === parentId)
      if (parentNote) {
        selectNote(parentNote)
      } else {
        goHome()
      }
    })
  }

  function updateNoteName(noteId: string, newName: string) {
    const allNotes = $notes
    const updatedNotes = allNotes.map((f) => (f.id === noteId ? { ...f, name: newName } : f))
    updateNotes(updatedNotes)
  }

  // ドラッグ&ドロップ（ノート）
  function handleDragStartNote(note: Note) {
    draggedNote = note
    dragOverNoteId = null
  }

  function handleDragEndNote() {
    draggedNote = null
    dragOverNoteId = null
  }

  function handleDragOverNote(e: DragEvent, note: Note) {
    e.preventDefault()
    if (!draggedNote || draggedNote.id === note.id) {
      dragOverNoteId = null
      return
    }
    if (draggedNote.parentId !== note.parentId) {
      dragOverNoteId = null
      return
    }
    dragOverNoteId = note.id
  }

  function handleDropNote(targetNote: Note) {
    dragOverNoteId = null
    if (!draggedNote || draggedNote.id === targetNote.id) return
    if (draggedNote.parentId !== targetNote.parentId) return

    const allNotes = $notes
    const targetList = (
      draggedNote.parentId
        ? allNotes.filter((f) => f.parentId === draggedNote!.parentId)
        : allNotes.filter((f) => !f.parentId)
    ).sort((a, b) => a.order - b.order)

    const fromIndex = targetList.findIndex((f) => f.id === draggedNote!.id)
    const toIndex = targetList.findIndex((f) => f.id === targetNote.id)

    const reordered = [...targetList]
    const [movedItem] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, movedItem)

    const updatedNotes = allNotes.map((f) => {
      const newOrderIndex = reordered.findIndex((r) => r.id === f.id)
      if (newOrderIndex !== -1) {
        return { ...f, order: newOrderIndex }
      }
      return f
    })

    updateNotes(updatedNotes)
    draggedNote = null
  }

  // リーフ管理
  function createLeaf() {
    if (isOperationsLocked) return
    if (!$currentNote) return

    const allLeaves = $leaves
    const noteLeaves = allLeaves.filter((n) => n.noteId === $currentNote!.id)

    const existingTitles = noteLeaves.map((l) => l.title)
    const uniqueTitle = generateUniqueName('リーフ', existingTitles)

    const newLeaf: Leaf = {
      id: crypto.randomUUID(),
      title: uniqueTitle,
      noteId: $currentNote.id,
      content: `# ${uniqueTitle}\n\n`,
      updatedAt: Date.now(),
      order: noteLeaves.length,
    }

    updateLeaves([...allLeaves, newLeaf])
    selectLeaf(newLeaf)
  }

  function selectLeaf(leaf: Leaf) {
    currentLeaf.set(leaf)
    currentView.set('edit')
  }

  function deleteLeaf(leafId: string) {
    if (isOperationsLocked) {
      showAlert('初回Pullが完了するまで操作できません。設定からPullしてください。')
      return
    }

    const allLeaves = $leaves
    const targetLeaf = allLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return

    showConfirm('このリーフを削除しますか？', () => {
      updateLeaves(allLeaves.filter((n) => n.id !== leafId))

      const note = $notes.find((f) => f.id === targetLeaf.noteId)
      if (note) {
        selectNote(note)
      } else {
        goHome()
      }
    })
  }

  // リーフコンテンツから # 見出しを抽出
  function extractH1Title(content: string): string | null {
    const firstLine = content.split('\n')[0]
    const match = firstLine.match(/^# (.+)/)
    return match ? match[1].trim() : null
  }

  // リーフコンテンツの1行目の # 見出しを更新
  function updateH1Title(content: string, newTitle: string): string {
    const lines = content.split('\n')
    const firstLine = lines[0]
    if (firstLine.match(/^# /)) {
      lines[0] = `# ${newTitle}`
      return lines.join('\n')
    }
    return content
  }

  function updateLeafContent(content: string, leafId: string) {
    if (isOperationsLocked) return

    const allLeaves = $leaves
    const targetLeaf = allLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return

    // コンテンツの1行目が # 見出しの場合、リーフのタイトルも自動更新
    const h1Title = extractH1Title(content)
    const newTitle = h1Title || targetLeaf.title

    // グローバルストアを更新（左右ペイン両方に反映される）
    const updatedLeaves = allLeaves.map((n) =>
      n.id === leafId ? { ...n, content, title: newTitle, updatedAt: Date.now() } : n
    )
    updateLeaves(updatedLeaves)

    // 左ペインのリーフを編集している場合は currentLeaf も更新
    if ($currentLeaf?.id === leafId) {
      currentLeaf.update((n) => (n ? { ...n, content, title: newTitle, updatedAt: Date.now() } : n))
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

  // ドラッグ&ドロップ（リーフ）
  function handleDragStartLeaf(leaf: Leaf) {
    draggedLeaf = leaf
    dragOverLeafId = null
  }

  function handleDragEndLeaf() {
    draggedLeaf = null
    dragOverLeafId = null
  }

  function handleDragOverLeaf(e: DragEvent, leaf: Leaf) {
    e.preventDefault()
    if (!draggedLeaf || draggedLeaf.id === leaf.id) {
      dragOverLeafId = null
      return
    }
    if (draggedLeaf.noteId !== leaf.noteId) {
      dragOverLeafId = null
      return
    }
    dragOverLeafId = leaf.id
  }

  function handleDropLeaf(targetLeaf: Leaf) {
    dragOverLeafId = null
    if (!draggedLeaf || draggedLeaf.id === targetLeaf.id) return
    if (draggedLeaf.noteId !== targetLeaf.noteId) return

    const allLeaves = $leaves
    const noteLeaves = allLeaves
      .filter((n) => n.noteId === draggedLeaf!.noteId)
      .sort((a, b) => a.order - b.order)

    const fromIndex = noteLeaves.findIndex((n) => n.id === draggedLeaf!.id)
    const toIndex = noteLeaves.findIndex((n) => n.id === targetLeaf.id)

    const reordered = [...noteLeaves]
    const [movedItem] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, movedItem)

    const updatedLeaves = allLeaves.map((n) => {
      const newOrderIndex = reordered.findIndex((r) => r.id === n.id)
      if (newOrderIndex !== -1) {
        return { ...n, order: newOrderIndex }
      }
      return n
    })

    updateLeaves(updatedLeaves)
    draggedLeaf = null
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

  function getNoteItems(noteId: string): string[] {
    const allNotes = $notes
    const allLeaves = $leaves
    const subNotesNames = allNotes
      .filter((f) => f.parentId === noteId)
      .sort((a, b) => a.order - b.order)
      .map((f) => f.name)
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

  // ダウンロード
  function downloadLeaf(leafId: string) {
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
    // 設定画面を閉じるときにPullを1回実行
    await handlePull(false)
  }

  async function handlePull(isInitial = false) {
    // 初回Pull以外で未保存の変更がある場合は確認
    if (!isInitial && get(isDirty)) {
      showConfirm('未保存の変更があります。Pullを実行しますか？', () =>
        executePullInternal(isInitial)
      )
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
    currentNote.set(null)
    currentLeaf.set(null)

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
      metadata.set(result.metadata)
      isOperationsLocked = false

      // Pull成功時はGitHubと同期したのでダーティフラグをクリア
      isDirty.set(false)

      // 初回Pull時はURLから状態を復元（既にisRestoringFromUrl=trueを設定済み）
      if (isInitial) {
        restoreStateFromUrl(true)
        isRestoringFromUrl = false
      }
    } else {
      if (isInitial) {
        showAlert('初回Pullに失敗しました。設定を確認して再度Pullしてください。')
      }
    }

    // 結果を通知
    showPullToast(result.message, result.variant)
    pullRunning = false
    isPulling = false // Pull処理完了
  }
</script>

<div class="app-container">
  <Header
    githubConfigured={isGitHubConfigured}
    title={$settings.toolName}
    onTitleClick={() => {
      goHome()
    }}
    onSettingsClick={() => {
      goSettings()
    }}
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
      />

      <main class="main-pane">
        {#if $currentView === 'home'}
          <HomeView
            notes={$rootNotes}
            disabled={isOperationsLocked}
            onSelectNote={selectNote}
            onCreateNote={() => createNote()}
            onDragStart={handleDragStartNote}
            onDragEnd={handleDragEndNote}
            onDragOver={handleDragOverNote}
            onDrop={handleDropNote}
            onSave={handleSaveToGitHub}
            {dragOverNoteId}
            {getNoteItems}
          />
        {:else if $currentView === 'note' && $currentNote}
          <NoteView
            currentNote={$currentNote}
            subNotes={$subNotes}
            leaves={$currentNoteLeaves}
            disabled={isOperationsLocked}
            onSelectNote={selectNote}
            onSelectLeaf={selectLeaf}
            onCreateNote={() => createNote($currentNote.id)}
            onCreateLeaf={createLeaf}
            onDeleteNote={deleteNote}
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
          />
        {:else if $currentView === 'edit' && $currentLeaf}
          <EditorView
            bind:this={leftEditorView}
            leaf={$currentLeaf}
            theme={$settings.theme}
            disabled={isOperationsLocked || isPushing}
            onContentChange={updateLeafContent}
            onSave={handleSaveToGitHub}
            onDownload={downloadLeaf}
            onDelete={deleteLeaf}
            onScroll={handleLeftScroll}
          />
        {:else if $currentView === 'preview' && $currentLeaf}
          <PreviewView
            bind:this={leftPreviewView}
            leaf={$currentLeaf}
            onScroll={handleLeftScroll}
          />
        {/if}
      </main>

      {#if $currentView === 'home'}
        <Footer>
          <svelte:fragment slot="left">
            <button
              type="button"
              on:click={() => createNote()}
              title="新規ノート"
              aria-label="新規ノート"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path
                  d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
          </svelte:fragment>
          <svelte:fragment slot="right">
            <button
              type="button"
              class="primary save-button"
              on:click={handleSaveToGitHub}
              title="保存"
              aria-label="保存"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {#if $isDirty}
                <span class="notification-badge"></span>
              {/if}
            </button>
          </svelte:fragment>
        </Footer>
      {:else if $currentView === 'note' && $currentNote}
        <Footer>
          <svelte:fragment slot="left">
            <button
              type="button"
              on:click={deleteNote}
              title="ノートを削除"
              aria-label="ノートを削除"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <polyline points="3 6 5 6 21 6" />
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>

            {#if !$currentNote.parentId}
              <button
                type="button"
                on:click={() => createNote($currentNote.id)}
                title="新規サブノート"
                aria-label="新規サブノート"
                disabled={isOperationsLocked}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="button-icon"
                >
                  <path
                    d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              </button>
            {/if}

            <button
              type="button"
              on:click={createLeaf}
              title="新規リーフ"
              aria-label="新規リーフ"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </button>
          </svelte:fragment>
          <svelte:fragment slot="right">
            <button
              type="button"
              class="primary save-button"
              on:click={handleSaveToGitHub}
              title="保存"
              aria-label="保存"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {#if $isDirty}
                <span class="notification-badge"></span>
              {/if}
            </button>
          </svelte:fragment>
        </Footer>
      {:else if $currentView === 'edit' && $currentLeaf}
        <Footer>
          <svelte:fragment slot="left">
            <button
              type="button"
              on:click={() => deleteLeaf($currentLeaf.id)}
              title="リーフを削除"
              aria-label="リーフを削除"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <polyline points="3 6 5 6 21 6" />
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>

            <button
              type="button"
              on:click={() => downloadLeaf($currentLeaf.id)}
              title="Download"
              aria-label="Download"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </svelte:fragment>
          <svelte:fragment slot="right">
            <button
              type="button"
              on:click={togglePreview}
              title="プレビュー"
              aria-label="プレビュー"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>

            <button
              type="button"
              class="primary save-button"
              on:click={handleSaveToGitHub}
              title="Save"
              aria-label="Save"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {#if $isDirty}
                <span class="notification-badge"></span>
              {/if}
            </button>
          </svelte:fragment>
        </Footer>
      {:else if $currentView === 'preview' && $currentLeaf}
        <Footer>
          <svelte:fragment slot="left">
            <button
              type="button"
              on:click={() => downloadLeaf($currentLeaf.id)}
              title="Download"
              aria-label="Download"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </svelte:fragment>
          <svelte:fragment slot="right">
            <button
              type="button"
              on:click={togglePreview}
              title="編集"
              aria-label="編集"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>

            <button
              type="button"
              class="primary save-button"
              on:click={handleSaveToGitHub}
              title="Save"
              aria-label="Save"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {#if $isDirty}
                <span class="notification-badge"></span>
              {/if}
            </button>
          </svelte:fragment>
        </Footer>
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
      />

      <main class="main-pane">
        {#if rightView === 'home'}
          <HomeView
            notes={$rootNotes}
            disabled={isOperationsLocked}
            onSelectNote={selectNoteRight}
            onCreateNote={() => createNoteRight()}
            onDragStart={handleDragStartNote}
            onDragEnd={handleDragEndNote}
            onDragOver={handleDragOverNote}
            onDrop={handleDropNote}
            onSave={handleSaveToGitHub}
            {dragOverNoteId}
            {getNoteItems}
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
            onSelectNote={selectNoteRight}
            onSelectLeaf={selectLeafRight}
            onCreateNote={() => createNoteRight(rightNote.id)}
            onCreateLeaf={createLeafRight}
            onDeleteNote={deleteNote}
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
          />
        {:else if rightView === 'edit' && rightLeaf}
          <EditorView
            bind:this={rightEditorView}
            leaf={rightLeaf}
            theme={$settings.theme}
            disabled={isOperationsLocked}
            onContentChange={updateLeafContent}
            onSave={handleSaveToGitHub}
            onDownload={downloadLeaf}
            onDelete={deleteLeaf}
            onScroll={handleRightScroll}
          />
        {:else if rightView === 'preview' && rightLeaf}
          <PreviewView bind:this={rightPreviewView} leaf={rightLeaf} onScroll={handleRightScroll} />
        {/if}
      </main>

      {#if rightView === 'home'}
        <Footer>
          <svelte:fragment slot="left">
            <button
              type="button"
              on:click={() => createNoteRight()}
              title="新規ノート"
              aria-label="新規ノート"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path
                  d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
          </svelte:fragment>
          <svelte:fragment slot="right">
            <button
              type="button"
              class="primary save-button"
              on:click={handleSaveToGitHub}
              title="保存"
              aria-label="保存"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {#if $isDirty}
                <span class="notification-badge"></span>
              {/if}
            </button>
          </svelte:fragment>
        </Footer>
      {:else if rightView === 'note' && rightNote}
        <Footer>
          <svelte:fragment slot="left">
            <button
              type="button"
              on:click={deleteNote}
              title="ノートを削除"
              aria-label="ノートを削除"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <polyline points="3 6 5 6 21 6" />
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>

            {#if !rightNote.parentId}
              <button
                type="button"
                on:click={() => createNoteRight(rightNote.id)}
                title="新規サブノート"
                aria-label="新規サブノート"
                disabled={isOperationsLocked}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="button-icon"
                >
                  <path
                    d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              </button>
            {/if}

            <button
              type="button"
              on:click={createLeafRight}
              title="新規リーフ"
              aria-label="新規リーフ"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </button>
          </svelte:fragment>
          <svelte:fragment slot="right">
            <button
              type="button"
              class="primary save-button"
              on:click={handleSaveToGitHub}
              title="保存"
              aria-label="保存"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {#if $isDirty}
                <span class="notification-badge"></span>
              {/if}
            </button>
          </svelte:fragment>
        </Footer>
      {:else if rightView === 'edit' && rightLeaf}
        <Footer>
          <svelte:fragment slot="left">
            <button
              type="button"
              on:click={() => deleteLeaf(rightLeaf.id)}
              title="リーフを削除"
              aria-label="リーフを削除"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <polyline points="3 6 5 6 21 6" />
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>

            <button
              type="button"
              on:click={() => downloadLeaf(rightLeaf.id)}
              title="Download"
              aria-label="Download"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </svelte:fragment>
          <svelte:fragment slot="right">
            <button
              type="button"
              on:click={togglePreviewRight}
              title="プレビュー"
              aria-label="プレビュー"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>

            <button
              type="button"
              class="primary save-button"
              on:click={handleSaveToGitHub}
              title="Save"
              aria-label="Save"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {#if $isDirty}
                <span class="notification-badge"></span>
              {/if}
            </button>
          </svelte:fragment>
        </Footer>
      {:else if rightView === 'preview' && rightLeaf}
        <Footer>
          <svelte:fragment slot="left">
            <button
              type="button"
              on:click={() => downloadLeaf(rightLeaf.id)}
              title="Download"
              aria-label="Download"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </svelte:fragment>
          <svelte:fragment slot="right">
            <button
              type="button"
              on:click={togglePreviewRight}
              title="編集"
              aria-label="編集"
              disabled={isOperationsLocked}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>

            <button
              type="button"
              class="primary save-button"
              on:click={handleSaveToGitHub}
              title="Save"
              aria-label="Save"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="button-icon"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {#if $isDirty}
                <span class="notification-badge"></span>
              {/if}
            </button>
          </svelte:fragment>
        </Footer>
      {/if}

      {#if pullRunning || isPushing}
        <Loading />
      {/if}
    </div>
  </div>

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
      on:click={closeSettings}
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
        />
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

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .app-container {
    width: 100%;
    height: 100vh;
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
    z-index: 100;
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
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  .main-pane {
    flex: 1;
    overflow: auto;
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
    background: var(--bg-primary);
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
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 4px;
    transition: all 0.2s;
    z-index: 1;
  }

  .settings-close-button:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
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
</style>
