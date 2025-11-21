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
  import { clearAllData, loadSettings, loadFolders, loadNotes } from './lib/storage'
  import { pullFromGitHub, saveToGitHub } from './lib/github'
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
  let pullRunning = false
  let isOperationsLocked = true
  let pullToast = ''
  let pushToast = ''
  let pullToastVariant: 'success' | 'error' | '' = ''
  let pushToastVariant: 'success' | 'error' | '' = ''

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
      await handlePull(true)
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

  function showPushToast(message: string) {
    pushToast = message
    setTimeout(() => {
      pushToast = ''
    }, 2000)
  }

  function notifyPush(success: boolean, message?: string) {
    showPushToast(message ?? (success ? 'プッシュしました' : 'プッシュに失敗しました'))
    pushToastVariant = success ? 'success' : 'error'
  }

  // ナビゲーション
  async function goHome() {
    if ($currentView === 'settings') {
      await handleCloseSettings()
    }
    currentView.set('home')
    currentFolder.set(null)
    currentNote.set(null)
  }

  async function goSettings() {
    if ($currentView !== 'settings') {
      try {
        updateSettings({ ...$settings })
        notifyPush(true)
      } catch (e) {
        notifyPush(false)
      }
    }
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

  function refreshBreadcrumbs() {
    breadcrumbs = getBreadcrumbs($currentView, $currentFolder, $currentNote, $folders)
  }

  function saveEditBreadcrumb(id: string, newName: string, type: Breadcrumb['type']) {
    if (!newName.trim()) return

    if (type === 'folder') {
      updateFolderName(id, newName.trim())
      const updatedFolder = $folders.find((f) => f.id === id)
      if (updatedFolder && $currentFolder?.id === id) {
        currentFolder.set(updatedFolder)
      }
      if (!$folders.some((f) => f.id === $currentFolder?.id)) {
        currentFolder.set(null)
      }
    } else if (type === 'note') {
      const allNotes = $notes
      const updatedNotes = allNotes.map((n) => (n.id === id ? { ...n, title: newName.trim() } : n))
      updateNotes(updatedNotes)
      const updatedNote = updatedNotes.find((n) => n.id === id)
      if (updatedNote && $currentNote?.id === id) {
        currentNote.set(updatedNote)
      }
      if (!$notes.some((n) => n.id === $currentNote?.id)) {
        currentNote.set(null)
      }
    }

    refreshBreadcrumbs()
    editingBreadcrumb = null
  }

  function cancelEditBreadcrumb() {
    editingBreadcrumb = null
  }

  // フォルダ管理
  function createFolder(parentId?: string) {
    if (isOperationsLocked) return
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
    if (isOperationsLocked) {
      showAlert('初回Pullが完了するまで操作できません。設定からPullしてください。')
      return
    }
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
    if (isOperationsLocked) return
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
    if (isOperationsLocked) {
      showAlert('初回Pullが完了するまで操作できません。設定からPullしてください。')
      return
    }
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
    if (isOperationsLocked) return
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
    if (isOperationsLocked) {
      notifyPush(false, '初回Pullが完了するまで保存できません')
      return
    }
    if (!$currentNote) return

    const result = await saveToGitHub($currentNote, $folders, $settings)

    if (result.success) {
      notifyPush(true)
    } else {
      notifyPush(false)
    }
  }

  // ダウンロード
  function downloadNote() {
    if (isOperationsLocked) {
      notifyPush(false, '初回Pullが完了するまでダウンロードできません')
      return
    }
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
  async function handleCloseSettings() {
    // 設定画面から別画面へ移動したときにPullを1回実行
    if ($currentView === 'settings') {
      await handlePull(false)
    }
  }

  async function handlePull(isInitial = false) {
    pullRunning = true
    isOperationsLocked = true

    // Pullを試行する前に全消し
    await clearAllData()
    folders.set([])
    notes.set([])
    currentFolder.set(null)
    currentNote.set(null)

    const result = await pullFromGitHub($settings)
    if (result.success) {
      updateFolders(result.folders)
      updateNotes(result.notes)
      isOperationsLocked = false
      pullToast = 'Pullしました'
      pullToastVariant = 'success'
    } else {
      if (isInitial) {
        showAlert('初回Pullに失敗しました。設定を確認して再度Pullしてください。')
      }
      pullToast = 'Pullに失敗しました'
      pullToastVariant = 'error'
    }

    pullRunning = false
    if (pullToast) {
      setTimeout(() => {
        pullToast = ''
        pullToastVariant = ''
      }, 2000)
    }
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
      if ($currentView === 'settings') {
        handleCloseSettings()
      }
      goSettings()
    }}
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
        disabled={isOperationsLocked}
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
        disabled={isOperationsLocked}
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
        disabled={isOperationsLocked}
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
        {pullRunning}
        onPull={handlePull}
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
  {#if pullToast || pushToast}
    <div class="toast-stack">
      {#if pullToast}
        <div
          class="toast"
          class:success={pullToastVariant === 'success'}
          class:error={pullToastVariant === 'error'}
        >
          {pullToast}
        </div>
      {/if}
      {#if pushToast}
        <div
          class="toast"
          class:success={pushToastVariant === 'success'}
          class:error={pushToastVariant === 'error'}
        >
          {pushToast}
        </div>
      {/if}
    </div>
  {/if}
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

  .toast-stack {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 100;
    align-items: center;
  }

  .toast {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 0.9rem;
    min-width: 140px;
    text-align: center;
  }

  .toast.success {
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  .toast.error {
    border-color: var(--error-color);
    color: var(--error-color);
  }
</style>
