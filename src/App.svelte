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
  import Modal from './components/layout/Modal.svelte'
  import Toast from './components/layout/Toast.svelte'
  import HomeView from './components/views/HomeView.svelte'
  import NoteView from './components/views/NoteView.svelte'
  import EditorView from './components/views/EditorView.svelte'
  import SettingsView from './components/views/SettingsView.svelte'

  // ローカル状態
  let breadcrumbs: Breadcrumb[] = []
  let breadcrumbsRight: Breadcrumb[] = []
  let editingBreadcrumb: string | null = null
  let draggedNote: Note | null = null
  let draggedLeaf: Leaf | null = null
  let pullRunning = false
  let isOperationsLocked = true
  let showSettings = false

  // 2ペイン用の状態（将来の拡張用、現在は1ペインのみ使用）
  let isDualPane = false // 画面幅で切り替え
  let rightNote: Note | null = null
  let rightLeaf: Leaf | null = null
  let rightView: View = 'home'

  // リアクティブ宣言
  $: breadcrumbs = getBreadcrumbs($currentView, $currentNote, $currentLeaf, $notes)
  $: breadcrumbsRight = getBreadcrumbsRight(rightView, rightNote, rightLeaf, $notes)
  $: isGitHubConfigured = $githubConfigured
  $: document.title = $settings.toolName

  // URLルーティング
  let isRestoringFromUrl = false

  function updateUrlFromState() {
    if (isRestoringFromUrl) return

    const params = new URLSearchParams()

    // 左ペイン（常に設定）
    const leftPath = buildPath($currentNote, $currentLeaf, $notes)
    params.set('left', leftPath)

    // 右ペイン（2ペイン表示時は独立した状態、1ペイン時は左と同じ）
    const rightPath = isDualPane ? buildPath(rightNote, rightLeaf, $notes) : leftPath
    params.set('right', rightPath)

    const newUrl = `?${params.toString()}`
    window.history.pushState({}, '', newUrl)
  }

  function restoreStateFromUrl() {
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

    isRestoringFromUrl = true

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
      currentView.set('edit')
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
        rightView = 'edit'
      }
    } else {
      // 1ペイン表示時は右ペインを左と同じにする
      rightNote = $currentNote
      rightLeaf = $currentLeaf
      rightView = $currentView
    }

    isRestoringFromUrl = false
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

    // 画面幅を監視して isDualPane を更新
    const mediaQuery = window.matchMedia('(min-width: 1025px)')
    isDualPane = mediaQuery.matches

    const handleMediaChange = (e: MediaQueryListEvent) => {
      isDualPane = e.matches
    }
    mediaQuery.addEventListener('change', handleMediaChange)
    ;(async () => {
      // 初回Pull（GitHubから最新データを取得）
      // 重要: IndexedDBからは読み込まない
      // Pull成功時にIndexedDBは全削除→全作成される
      await handlePull(true)

      // Pull成功後、URLから状態を復元
      restoreStateFromUrl()
    })()

    // ブラウザの戻る/進むボタンに対応
    const handlePopState = () => {
      restoreStateFromUrl()
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      mediaQuery.removeEventListener('change', handleMediaChange)
    }
  })

  // ナビゲーション
  async function goHome() {
    currentView.set('home')
    currentNote.set(null)
    currentLeaf.set(null)
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
      const updatedLeaves = allLeaves.map((n) =>
        n.id === actualId ? { ...n, title: newName.trim() } : n
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
    let name = baseName
    let counter = 1
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
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
  }

  function handleDropNote(targetNote: Note) {
    if (!draggedNote || draggedNote.id === targetNote.id) return
    if (draggedNote.parentId !== targetNote.parentId) return

    const allNotes = $notes
    const targetList = draggedNote.parentId
      ? allNotes.filter((f) => f.parentId === draggedNote!.parentId)
      : allNotes.filter((f) => !f.parentId)

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
      content: '',
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

  function deleteLeaf() {
    if (isOperationsLocked) {
      showAlert('初回Pullが完了するまで操作できません。設定からPullしてください。')
      return
    }
    if (!$currentLeaf) return

    showConfirm('このリーフを削除しますか？', () => {
      const allLeaves = $leaves
      updateLeaves(allLeaves.filter((n) => n.id !== $currentLeaf!.id))

      const note = $notes.find((f) => f.id === $currentLeaf!.noteId)
      if (note) {
        selectNote(note)
      } else {
        goHome()
      }
    })
  }

  function updateLeafContent(content: string) {
    if (isOperationsLocked) return
    if (!$currentLeaf) return

    const allLeaves = $leaves
    const updatedLeaves = allLeaves.map((n) =>
      n.id === $currentLeaf!.id ? { ...n, content, updatedAt: Date.now() } : n
    )
    updateLeaves(updatedLeaves)
    currentLeaf.update((n) => (n ? { ...n, content, updatedAt: Date.now() } : n))
  }

  // ドラッグ&ドロップ（リーフ）
  function handleDragStartLeaf(leaf: Leaf) {
    draggedLeaf = leaf
  }

  function handleDropLeaf(targetLeaf: Leaf) {
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
  async function handleSaveToGitHub() {
    // Push開始を通知
    showPushToast('Pushします')

    const result = await executePush($leaves, $notes, $settings, isOperationsLocked)

    // 結果を通知
    showPushToast(result.message, result.variant)
  }

  // ダウンロード
  function downloadLeaf() {
    if (isOperationsLocked) {
      showPushToast('初回Pullが完了するまでダウンロードできません', 'error')
      return
    }
    if (!$currentLeaf) return

    const blob = new Blob([$currentLeaf.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${$currentLeaf.title}.md`
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
    pullRunning = true
    isOperationsLocked = true

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
      // GitHubから取得したデータでIndexedDBを再作成
      updateNotes(result.notes)
      updateLeaves(result.leaves)
      isOperationsLocked = false
    } else {
      if (isInitial) {
        showAlert('初回Pullに失敗しました。設定を確認して再度Pullしてください。')
      }
    }

    // 結果を通知
    showPullToast(result.message, result.variant)
    pullRunning = false
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

  <div class="content-wrapper">
    <div class="left-column">
      <div class="breadcrumbs-pane">
        <Breadcrumbs
          {breadcrumbs}
          editingId={editingBreadcrumb}
          onStartEdit={startEditingBreadcrumb}
          onSaveEdit={saveEditBreadcrumb}
          onCancelEdit={cancelEditBreadcrumb}
        />
      </div>

      <main class="main-pane">
        {#if $currentView === 'home'}
          <HomeView
            notes={$rootNotes}
            disabled={isOperationsLocked}
            onSelectNote={selectNote}
            onCreateNote={() => createNote()}
            onDragStart={handleDragStartNote}
            onDragOver={handleDragOver}
            onDrop={handleDropNote}
            onSave={handleSaveToGitHub}
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
            onDragOver={handleDragOver}
            onDropNote={handleDropNote}
            onDropLeaf={handleDropLeaf}
            onSave={handleSaveToGitHub}
            {getNoteItems}
          />
        {:else if $currentView === 'edit' && $currentLeaf}
          <EditorView
            leaf={$currentLeaf}
            theme={$settings.theme}
            disabled={isOperationsLocked}
            onContentChange={updateLeafContent}
            onSave={handleSaveToGitHub}
            onDownload={downloadLeaf}
            onDelete={deleteLeaf}
          />
        {/if}
      </main>
    </div>

    <div class="right-column">
      <div class="breadcrumbs-pane">
        <Breadcrumbs
          breadcrumbs={breadcrumbsRight}
          editingId={editingBreadcrumb}
          onStartEdit={startEditingBreadcrumb}
          onSaveEdit={saveEditBreadcrumb}
          onCancelEdit={cancelEditBreadcrumb}
        />
      </div>

      <main class="main-pane">
        {#if rightView === 'home'}
          <HomeView
            notes={$rootNotes}
            disabled={isOperationsLocked}
            onSelectNote={selectNoteRight}
            onCreateNote={() => createNoteRight()}
            onDragStart={handleDragStartNote}
            onDragOver={handleDragOver}
            onDrop={handleDropNote}
            onSave={handleSaveToGitHub}
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
            onDragOver={handleDragOver}
            onDropNote={handleDropNote}
            onDropLeaf={handleDropLeaf}
            onSave={handleSaveToGitHub}
            {getNoteItems}
          />
        {:else if rightView === 'edit' && rightLeaf}
          <EditorView
            leaf={rightLeaf}
            theme={$settings.theme}
            disabled={isOperationsLocked}
            onContentChange={updateLeafContent}
            onSave={handleSaveToGitHub}
            onDownload={downloadLeaf}
            onDelete={deleteLeaf}
          />
        {/if}
      </main>
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
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .content-wrapper {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    flex: 1;
    height: calc(100vh - 80px);
    overflow: hidden;
  }

  .left-column,
  .right-column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .left-column {
    border-right: 2px solid var(--border-color);
  }

  .breadcrumbs-pane {
    flex-shrink: 0;
  }

  .main-pane {
    flex: 1;
    overflow: hidden;
  }

  @media (max-width: 1024px) {
    .content-wrapper {
      grid-template-columns: 1fr;
    }
    .right-column {
      display: none;
    }
    .left-column {
      border-right: none;
    }
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
</style>
