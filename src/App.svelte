<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import type { Folder, Note, Breadcrumb, View } from './lib/types'
  import {
    settings,
    folders,
    notes,
    currentView,
    currentFolder,
    currentNote,
    rootFolders,
    subfolders,
    currentFolderNotes,
    githubConfigured,
    updateSettings,
    updateFolders,
    updateNotes,
  } from './lib/stores'
  import { loadSettings, loadFolders, loadNotes } from './lib/storage'
  import { saveToGitHub, testGitHubConnection } from './lib/github'
  import { applyTheme } from './lib/theme'
  import Header from './components/layout/Header.svelte'
  import Breadcrumbs from './components/layout/Breadcrumbs.svelte'
  import Modal from './components/layout/Modal.svelte'
  import HomeView from './components/views/HomeView.svelte'
  import FolderView from './components/views/FolderView.svelte'
  import EditorView from './components/views/EditorView.svelte'
  import SettingsView from './components/views/SettingsView.svelte'

  // ローカル状態
  let breadcrumbs: Breadcrumb[] = []
  let editingBreadcrumb: string | null = null
  let draggedFolder: Folder | null = null
  let draggedNote: Note | null = null
  let syncMessage = ''
  let syncError = ''
  let githubTestMessage = ''
  let githubTestRunning = false

  // モーダル状態
  let showModal = false
  let modalMessage = ''
  let modalType: 'confirm' | 'alert' = 'confirm'
  let modalCallback: (() => void) | null = null

  // リアクティブ宣言
  $: breadcrumbs = getBreadcrumbs($currentView, $currentFolder, $currentNote, $folders)
  $: isGitHubConfigured = $githubConfigured
  $: document.title = $settings.toolName

  // 初期化
  onMount(() => {
    const loadedSettings = loadSettings()
    settings.set(loadedSettings)
    applyTheme(loadedSettings.theme, loadedSettings)
    document.title = loadedSettings.toolName
    ;(async () => {
      const [loadedFolders, loadedNotes] = await Promise.all([loadFolders(), loadNotes()])
      folders.set(loadedFolders)
      notes.set(loadedNotes)
    })()
  })

  // モーダル関数
  function showConfirm(message: string, onConfirm: () => void) {
    modalMessage = message
    modalType = 'confirm'
    modalCallback = onConfirm
    showModal = true
  }

  function showAlert(message: string) {
    modalMessage = message
    modalType = 'alert'
    modalCallback = null
    showModal = true
  }

  function closeModal() {
    showModal = false
    modalMessage = ''
    modalCallback = null
  }

  // ナビゲーション
  function goHome() {
    currentView.set('home')
    currentFolder.set(null)
    currentNote.set(null)
  }

  function goSettings() {
    currentView.set('settings')
  }

  // パンくずリスト
  function getBreadcrumbs(
    view: View,
    folder: Folder | null,
    note: Note | null,
    allFolders: Folder[]
  ): Breadcrumb[] {
    const crumbs: Breadcrumb[] = []

    crumbs.push({
      label: 'SimplestNote.md',
      action: goHome,
      id: 'home',
      type: 'home',
    })

    if (view === 'settings') {
      crumbs.push({
        label: '設定',
        action: goSettings,
        id: 'settings',
        type: 'settings',
      })
      return crumbs
    }

    if (folder) {
      const parentFolder = allFolders.find((f) => f.id === folder.parentId)
      if (parentFolder) {
        crumbs.push({
          label: parentFolder.name,
          action: () => selectFolder(parentFolder),
          id: parentFolder.id,
          type: 'folder',
        })
      }
      crumbs.push({
        label: folder.name,
        action: () => selectFolder(folder),
        id: folder.id,
        type: 'folder',
      })
    }

    if (note) {
      crumbs.push({
        label: note.title,
        action: () => {},
        id: note.id,
        type: 'note',
      })
    }

    return crumbs
  }

  function startEditingBreadcrumb(crumb: Breadcrumb) {
    if (crumb.type === 'home' || crumb.type === 'settings') return
    editingBreadcrumb = crumb.id
  }

  function saveEditBreadcrumb(id: string, newName: string, type: Breadcrumb['type']) {
    if (!newName.trim()) return

    if (type === 'folder') {
      updateFolderName(id, newName.trim())
      const updatedFolder = $folders.find((f) => f.id === id)
      if (updatedFolder && $currentFolder?.id === id) {
        currentFolder.set(updatedFolder)
      }
    } else if (type === 'note') {
      const allNotes = $notes
      const updatedNotes = allNotes.map((n) => (n.id === id ? { ...n, title: newName.trim() } : n))
      updateNotes(updatedNotes)
      const updatedNote = updatedNotes.find((n) => n.id === id)
      if (updatedNote && $currentNote?.id === id) {
        currentNote.set(updatedNote)
      }
    }

    editingBreadcrumb = null
  }

  function cancelEditBreadcrumb() {
    editingBreadcrumb = null
  }

  // フォルダ管理
  function createFolder(parentId?: string) {
    const allFolders = $folders
    const targetFolders = parentId
      ? allFolders.filter((f) => f.parentId === parentId)
      : allFolders.filter((f) => !f.parentId)

    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name: `フォルダ${targetFolders.length + 1}`,
      parentId: parentId || undefined,
      order: targetFolders.length,
    }

    updateFolders([...allFolders, newFolder])
  }

  function selectFolder(folder: Folder) {
    currentFolder.set(folder)
    currentNote.set(null)
    currentView.set('folder')
  }

  function deleteFolder() {
    if (!$currentFolder) return

    const allFolders = $folders
    const allNotes = $notes
    const hasSubfolders = allFolders.some((f) => f.parentId === $currentFolder!.id)
    const hasNotes = allNotes.some((n) => n.folderId === $currentFolder!.id)

    if (hasSubfolders || hasNotes) {
      showAlert('サブフォルダやノートが含まれているため削除できません。')
      return
    }

    showConfirm('このフォルダを削除しますか？', () => {
      const folderId = $currentFolder!.id
      const parentId = $currentFolder!.parentId
      updateFolders(allFolders.filter((f) => f.id !== folderId))

      const parentFolder = allFolders.find((f) => f.id === parentId)
      if (parentFolder) {
        selectFolder(parentFolder)
      } else {
        goHome()
      }
    })
  }

  function updateFolderName(folderId: string, newName: string) {
    const allFolders = $folders
    const updatedFolders = allFolders.map((f) => (f.id === folderId ? { ...f, name: newName } : f))
    updateFolders(updatedFolders)
  }

  // ドラッグ&ドロップ（フォルダ）
  function handleDragStartFolder(folder: Folder) {
    draggedFolder = folder
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
  }

  function handleDropFolder(targetFolder: Folder) {
    if (!draggedFolder || draggedFolder.id === targetFolder.id) return
    if (draggedFolder.parentId !== targetFolder.parentId) return

    const allFolders = $folders
    const targetList = draggedFolder.parentId
      ? allFolders.filter((f) => f.parentId === draggedFolder!.parentId)
      : allFolders.filter((f) => !f.parentId)

    const fromIndex = targetList.findIndex((f) => f.id === draggedFolder!.id)
    const toIndex = targetList.findIndex((f) => f.id === targetFolder.id)

    const reordered = [...targetList]
    const [movedItem] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, movedItem)

    const updatedFolders = allFolders.map((f) => {
      const newOrderIndex = reordered.findIndex((r) => r.id === f.id)
      if (newOrderIndex !== -1) {
        return { ...f, order: newOrderIndex }
      }
      return f
    })

    updateFolders(updatedFolders)
    draggedFolder = null
  }

  // ノート管理
  function createNewNote() {
    if (!$currentFolder) return

    const allNotes = $notes
    const folderNotes = allNotes.filter((n) => n.folderId === $currentFolder!.id)

    const newNote: Note = {
      id: crypto.randomUUID(),
      title: `ノート${folderNotes.length + 1}`,
      folderId: $currentFolder.id,
      content: '',
      updatedAt: Date.now(),
      order: folderNotes.length,
    }

    updateNotes([...allNotes, newNote])
    selectNote(newNote)
  }

  function selectNote(note: Note) {
    currentNote.set(note)
    currentView.set('edit')
  }

  function deleteNote() {
    if (!$currentNote) return

    showConfirm('このノートを削除しますか？', () => {
      const allNotes = $notes
      updateNotes(allNotes.filter((n) => n.id !== $currentNote!.id))

      const folder = $folders.find((f) => f.id === $currentNote!.folderId)
      if (folder) {
        selectFolder(folder)
      } else {
        goHome()
      }
    })
  }

  function updateNoteContent(content: string) {
    if (!$currentNote) return

    const allNotes = $notes
    const updatedNotes = allNotes.map((n) =>
      n.id === $currentNote!.id ? { ...n, content, updatedAt: Date.now() } : n
    )
    updateNotes(updatedNotes)
    currentNote.update((n) => (n ? { ...n, content, updatedAt: Date.now() } : n))
  }

  // ドラッグ&ドロップ（ノート）
  function handleDragStartNote(note: Note) {
    draggedNote = note
  }

  function handleDropNote(targetNote: Note) {
    if (!draggedNote || draggedNote.id === targetNote.id) return
    if (draggedNote.folderId !== targetNote.folderId) return

    const allNotes = $notes
    const folderNotes = allNotes
      .filter((n) => n.folderId === draggedNote!.folderId)
      .sort((a, b) => a.order - b.order)

    const fromIndex = folderNotes.findIndex((n) => n.id === draggedNote!.id)
    const toIndex = folderNotes.findIndex((n) => n.id === targetNote.id)

    const reordered = [...folderNotes]
    const [movedItem] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, movedItem)

    const updatedNotes = allNotes.map((n) => {
      const newOrderIndex = reordered.findIndex((r) => r.id === n.id)
      if (newOrderIndex !== -1) {
        return { ...n, order: newOrderIndex }
      }
      return n
    })

    updateNotes(updatedNotes)
    draggedNote = null
  }

  // ヘルパー関数
  function getItemCount(folderId: string): number {
    const allFolders = $folders
    const allNotes = $notes
    const subfoldersCount = allFolders.filter((f) => f.parentId === folderId).length
    const notesCount = allNotes.filter((n) => n.folderId === folderId).length
    return subfoldersCount + notesCount
  }

  function getNoteCount(folderId: string): number {
    return $notes.filter((n) => n.folderId === folderId).length
  }

  function getFolderItems(folderId: string): string[] {
    const allFolders = $folders
    const allNotes = $notes
    const subfoldersNames = allFolders
      .filter((f) => f.parentId === folderId)
      .sort((a, b) => a.order - b.order)
      .map((f) => f.name)
    const notesNames = allNotes
      .filter((n) => n.folderId === folderId)
      .sort((a, b) => a.order - b.order)
      .map((n) => n.title)

    const allItems = [...subfoldersNames, ...notesNames]
    const hasMore = allItems.length > 3
    const items = allItems.slice(0, 3)

    if (hasMore) {
      items.push('...')
    }

    return items
  }

  // GitHub同期
  async function handleSaveToGitHub() {
    if (!$currentNote) return

    syncMessage = ''
    syncError = ''

    const result = await saveToGitHub($currentNote, $folders, $settings)

    if (result.success) {
      syncMessage = result.message
      setTimeout(() => {
        syncMessage = ''
      }, 3000)
    } else {
      syncError = result.message
    }
  }

  // ダウンロード
  function downloadNote() {
    if (!$currentNote) return

    const blob = new Blob([$currentNote.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${$currentNote.title}.md`
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

  async function handleGithubTest() {
    githubTestMessage = ''
    githubTestRunning = true
    const result = await testGitHubConnection($settings)
    githubTestMessage = result.message
    githubTestRunning = false
  }
</script>

<div class="app-container">
  <Header
    githubConfigured={isGitHubConfigured}
    title={$settings.toolName}
    onTitleClick={goHome}
    onSettingsClick={goSettings}
  />

  <Breadcrumbs
    {breadcrumbs}
    editingId={editingBreadcrumb}
    onStartEdit={startEditingBreadcrumb}
    onSaveEdit={saveEditBreadcrumb}
    onCancelEdit={cancelEditBreadcrumb}
  />

  <main>
    {#if $currentView === 'home'}
      <HomeView
        folders={$rootFolders}
        onSelectFolder={selectFolder}
        onCreateFolder={() => createFolder()}
        onDragStart={handleDragStartFolder}
        onDragOver={handleDragOver}
        onDrop={handleDropFolder}
        {getFolderItems}
      />
    {:else if $currentView === 'folder' && $currentFolder}
      <FolderView
        currentFolder={$currentFolder}
        subfolders={$subfolders}
        notes={$currentFolderNotes}
        onSelectFolder={selectFolder}
        onSelectNote={selectNote}
        onCreateFolder={() => createFolder($currentFolder.id)}
        onCreateNote={createNewNote}
        onDeleteFolder={deleteFolder}
        onDragStartFolder={handleDragStartFolder}
        onDragStartNote={handleDragStartNote}
        onDragOver={handleDragOver}
        onDropFolder={handleDropFolder}
        onDropNote={handleDropNote}
        {getFolderItems}
      />
    {:else if $currentView === 'edit' && $currentNote}
      <EditorView
        note={$currentNote}
        theme={$settings.theme}
        {syncMessage}
        {syncError}
        onContentChange={updateNoteContent}
        onSave={handleSaveToGitHub}
        onDownload={downloadNote}
        onDelete={deleteNote}
      />
    {:else if $currentView === 'settings'}
      <SettingsView
        settings={$settings}
        onThemeChange={handleThemeChange}
        onSettingsChange={handleSettingsChange}
        {githubTestMessage}
        {githubTestRunning}
        onTestConnection={handleGithubTest}
      />
    {/if}
  </main>

  <Modal
    show={showModal}
    message={modalMessage}
    type={modalType}
    onConfirm={modalCallback}
    onClose={closeModal}
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
  }

  main {
    position: relative;
  }
</style>
