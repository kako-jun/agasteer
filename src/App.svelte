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
  import { pullFromGitHub, saveToGitHub } from './lib/github'
  import { applyTheme } from './lib/theme'
  import Header from './components/layout/Header.svelte'
  import Breadcrumbs from './components/layout/Breadcrumbs.svelte'
  import Modal from './components/layout/Modal.svelte'
  import HomeView from './components/views/HomeView.svelte'
  import NoteView from './components/views/NoteView.svelte'
  import EditorView from './components/views/EditorView.svelte'
  import SettingsView from './components/views/SettingsView.svelte'

  // ローカル状態
  let breadcrumbs: Breadcrumb[] = []
  let editingBreadcrumb: string | null = null
  let draggedNote: Note | null = null
  let draggedLeaf: Leaf | null = null
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
  let showSettings = false

  // リアクティブ宣言
  $: breadcrumbs = getBreadcrumbs($currentView, $currentNote, $currentLeaf, $notes)
  $: isGitHubConfigured = $githubConfigured
  $: document.title = $settings.toolName

  // URLルーティング
  let isRestoringFromUrl = false

  function updateUrlFromState() {
    if (isRestoringFromUrl) return

    const params = new URLSearchParams()
    if ($currentNote) {
      params.set('note', $currentNote.id)
    }
    if ($currentLeaf) {
      params.set('leaf', $currentLeaf.id)
    }

    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
    window.history.pushState({}, '', newUrl)
  }

  function restoreStateFromUrl() {
    const params = new URLSearchParams(window.location.search)
    const noteId = params.get('note')
    const leafId = params.get('leaf')

    isRestoringFromUrl = true

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

    isRestoringFromUrl = false
  }

  // ストアの変更をURLに反映
  $: if ($currentNote || $currentLeaf || (!$currentNote && !$currentLeaf)) {
    updateUrlFromState()
  }

  // 初期化
  onMount(() => {
    const loadedSettings = loadSettings()
    settings.set(loadedSettings)
    applyTheme(loadedSettings.theme, loadedSettings)
    document.title = loadedSettings.toolName
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
    }
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
    showPushToast(message ?? (success ? 'Pushしました' : 'Pushに失敗しました'))
    pushToastVariant = success ? 'success' : 'error'
  }

  // ナビゲーション
  async function goHome() {
    currentView.set('home')
    currentNote.set(null)
    currentLeaf.set(null)
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

  // パンくずリスト
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

  function startEditingBreadcrumb(crumb: Breadcrumb) {
    if (crumb.type === 'home' || crumb.type === 'settings') return
    editingBreadcrumb = crumb.id
  }

  function refreshBreadcrumbs() {
    breadcrumbs = getBreadcrumbs($currentView, $currentNote, $currentLeaf, $notes)
  }

  function saveEditBreadcrumb(id: string, newName: string, type: Breadcrumb['type']) {
    if (!newName.trim()) return

    if (type === 'note') {
      updateNoteName(id, newName.trim())
      const updatedNote = $notes.find((f) => f.id === id)
      if (updatedNote && $currentNote?.id === id) {
        currentNote.set(updatedNote)
      }
      if (!$notes.some((f) => f.id === $currentNote?.id)) {
        currentNote.set(null)
      }
    } else if (type === 'leaf') {
      const allLeaves = $leaves
      const updatedLeaves = allLeaves.map((n) =>
        n.id === id ? { ...n, title: newName.trim() } : n
      )
      updateLeaves(updatedLeaves)
      const updatedLeaf = updatedLeaves.find((n) => n.id === id)
      if (updatedLeaf && $currentLeaf?.id === id) {
        currentLeaf.set(updatedLeaf)
      }
      if (!$leaves.some((n) => n.id === $currentLeaf?.id)) {
        currentLeaf.set(null)
      }
    }

    refreshBreadcrumbs()
    editingBreadcrumb = null
  }

  function cancelEditBreadcrumb() {
    editingBreadcrumb = null
  }

  // ノート管理（束）
  function createNote(parentId?: string) {
    if (isOperationsLocked) return
    const allNotes = $notes
    const targetNotes = parentId
      ? allNotes.filter((f) => f.parentId === parentId)
      : allNotes.filter((f) => !f.parentId)

    const newNote: Note = {
      id: crypto.randomUUID(),
      name: `ノート${targetNotes.length + 1}`,
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

    const newLeaf: Leaf = {
      id: crypto.randomUUID(),
      title: `リーフ${noteLeaves.length + 1}`,
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
    if (isOperationsLocked) {
      notifyPush(false, '初回Pullが完了するまで保存できません')
      return
    }

    // 全リーフを保存
    const allLeaves = $leaves
    if (allLeaves.length === 0) {
      notifyPush(false, '保存するリーフがありません')
      return
    }

    // Push開始を通知
    pushToast = 'Pushします'
    pushToastVariant = ''

    let successCount = 0
    let failCount = 0

    for (const leaf of allLeaves) {
      const result = await saveToGitHub(leaf, $notes, $settings)
      if (result.success) {
        successCount++
      } else {
        failCount++
      }
    }

    if (failCount === 0) {
      notifyPush(true, `✅ ${successCount}件のリーフを保存しました`)
    } else if (successCount > 0) {
      notifyPush(false, `⚠️ ${successCount}件成功、${failCount}件失敗`)
    } else {
      notifyPush(false, `❌ すべての保存に失敗しました`)
    }
  }

  // ダウンロード
  function downloadLeaf() {
    if (isOperationsLocked) {
      notifyPush(false, '初回Pullが完了するまでダウンロードできません')
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
    // 設定画面から別画面へ移動したときにPullを1回実行
    if ($currentView === 'settings') {
      await handlePull(false)
    }
  }

  async function handlePull(isInitial = false) {
    pullRunning = true
    isOperationsLocked = true

    // Pull開始を通知
    pullToast = 'Pullします'
    pullToastVariant = ''

    // 重要: GitHubが唯一の真実の情報源（Single Source of Truth）
    // IndexedDBは単なるキャッシュであり、Pull成功時に全削除→全作成される
    // 前回終了時のIndexedDBデータは使用しない
    await clearAllData() // IndexedDB全削除
    notes.set([])
    leaves.set([])
    currentNote.set(null)
    currentLeaf.set(null)

    const result = await pullFromGitHub($settings)
    if (result.success) {
      // GitHubから取得したデータでIndexedDBを再作成
      updateNotes(result.notes)
      updateLeaves(result.leaves)
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

  <Modal
    show={showModal}
    message={modalMessage}
    type={modalType}
    onConfirm={modalCallback}
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
