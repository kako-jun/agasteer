<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorState } from '@codemirror/state'
  import { EditorView, keymap } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { markdown } from '@codemirror/lang-markdown'
  import { basicSetup } from 'codemirror'

  // CodeMirrorダークテーマ
  const editorDarkTheme = EditorView.theme(
    {
      '&': {
        backgroundColor: '#1a1a1a',
        color: '#e5e7eb',
      },
      '.cm-content': {
        caretColor: '#1f4d48',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: '#1f4d48',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: '#1f4d48',
      },
      '.cm-activeLine': {
        backgroundColor: '#2d2d2d',
      },
      '.cm-gutters': {
        backgroundColor: '#1a1a1a',
        color: '#9ca3af',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#2d2d2d',
      },
    },
    { dark: true }
  )

  type Settings = {
    token: string
    username: string
    email: string
    repoName: string
    theme: 'light' | 'dark' | 'blackboard' | 'kawaii' | 'custom'
    customBgPrimary: string
    customAccentColor: string
  }

  type Folder = {
    id: string
    name: string
    parentId?: string
    order: number
  }

  type Note = {
    id: string
    title: string
    folderId: string
    content: string
    updatedAt: number
    order: number
  }

  type View = 'home' | 'settings' | 'edit' | 'folder'

  const SETTINGS_KEY = 'simplest-md-note/settings'
  const NOTES_KEY = 'simplest-md-note/notes'
  const FOLDERS_KEY = 'simplest-md-note/folders'

  const defaultSettings: Settings = {
    token: '',
    username: '',
    email: '',
    repoName: '',
    theme: 'light',
    customBgPrimary: '#ffffff',
    customAccentColor: '#0f766e',
  }

  let currentView: View = 'home'
  let settings: Settings = { ...defaultSettings }
  let folders: Folder[] = []
  let notes: Note[] = []
  let currentFolder: Folder | null = null
  let currentNote: Note | null = null
  let statusMessage = ''
  let syncMessage = ''
  let syncError = ''
  let breadcrumbs: Array<{
    label: string
    action: () => void
    id: string
    type: 'home' | 'folder' | 'note' | 'settings'
  }> = []
  let editorContainer: HTMLDivElement | null = null
  let editorView: EditorView | null = null
  let titleInput: HTMLInputElement | null = null
  let originalTitle = ''
  let folderNameInput: HTMLInputElement | null = null
  let originalFolderName = ''
  let editingBreadcrumb: string | null = null
  let draggedFolder: Folder | null = null
  let draggedNote: Note | null = null
  let showModal = false
  let modalMessage = ''
  let modalType: 'confirm' | 'alert' = 'confirm'
  let modalCallback: (() => void) | null = null

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

  function confirmModal() {
    if (modalCallback) {
      modalCallback()
    }
    closeModal()
  }

  onMount(() => {
    const storedSettings = localStorage.getItem(SETTINGS_KEY)
    if (storedSettings) {
      settings = { ...settings, ...JSON.parse(storedSettings) }
    }
    applyTheme(settings.theme)

    const storedFolders = localStorage.getItem(FOLDERS_KEY)
    console.log('LocalStorage FOLDERS_KEY:', FOLDERS_KEY)
    console.log('Stored folders string:', storedFolders)
    if (storedFolders) {
      const parsedFolders = JSON.parse(storedFolders)
      console.log('Parsed folders:', parsedFolders)
      // 既存フォルダにorderがない場合は追加
      let needsUpdate = false
      const updatedFolders = parsedFolders.map((folder: Folder, index: number) => {
        if (folder.order === undefined) {
          needsUpdate = true
          return { ...folder, order: index }
        }
        return folder
      })
      folders = updatedFolders
      console.log('Assigned folders to state:', folders)
      if (needsUpdate) {
        console.log('Updating folders with order:', folders)
        persistFolders()
      }
    } else {
      console.log('No folders in LocalStorage')
    }

    const storedNotes = localStorage.getItem(NOTES_KEY)
    if (storedNotes) {
      const parsedNotes = JSON.parse(storedNotes)
      // 既存ノートにorderがない場合は追加
      let needsUpdate = false
      const updatedNotes = parsedNotes.map((note: Note, index: number) => {
        if (note.order === undefined) {
          needsUpdate = true
          return { ...note, order: index }
        }
        return note
      })
      notes = updatedNotes
      if (needsUpdate) {
        persistNotes()
      }
    }

    initializeEditor()
  })

  function applyTheme(theme: 'light' | 'dark' | 'blackboard' | 'kawaii' | 'custom') {
    if (theme === 'light') {
      document.documentElement.removeAttribute('data-theme')
    } else if (theme === 'custom') {
      document.documentElement.setAttribute('data-theme', 'custom')
      // カスタムカラーを適用
      document.documentElement.style.setProperty('--bg-primary', settings.customBgPrimary)
      document.documentElement.style.setProperty('--accent-color', settings.customAccentColor)
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }

  // テーマ変更を即座に反映し、保存
  $: {
    applyTheme(settings.theme)
    persistSettings()
  }

  // GitHub設定が完了しているかチェック
  $: isGitHubConfigured =
    settings.token.trim() !== '' &&
    settings.username.trim() !== '' &&
    settings.email.trim() !== '' &&
    settings.repoName.trim() !== ''

  // フォルダ変更の監視（デバッグ用）
  $: console.log('Reactive: folders changed, count:', folders.length, folders)

  // リアクティブに計算されるルートフォルダ
  $: rootFolders = folders.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
  $: console.log('Reactive: rootFolders computed:', rootFolders)

  // リアクティブに計算されるサブフォルダ
  $: subfolders = currentFolder
    ? folders.filter((f) => f.parentId === currentFolder.id).sort((a, b) => a.order - b.order)
    : []
  $: console.log('Reactive: subfolders computed:', subfolders)

  // リアクティブに計算されるカレントフォルダのノート
  $: currentFolderNotes = currentFolder
    ? notes.filter((n) => n.folderId === currentFolder.id).sort((a, b) => a.order - b.order)
    : []

  function persistSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    statusMessage = '設定を保存しました。'
    setTimeout(() => (statusMessage = ''), 2000)
  }

  function persistNotes() {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
  }

  function persistFolders() {
    console.log('Persisting folders:', folders)
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
    console.log('Saved to LocalStorage:', localStorage.getItem(FOLDERS_KEY))
  }

  function getNextFolderName(): string {
    const pattern = /^フォルダ(\d+)$/
    const numbers = folders
      .map((f) => {
        const match = f.name.match(pattern)
        return match ? parseInt(match[1], 10) : 0
      })
      .filter((n) => n > 0)
    const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0
    return `フォルダ${maxNumber + 1}`
  }

  function createFolder(parentId?: string) {
    const siblingFolders = folders.filter((f) => f.parentId === parentId)
    const maxOrder =
      siblingFolders.length > 0 ? Math.max(...siblingFolders.map((f) => f.order)) : -1
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name: getNextFolderName(),
      parentId,
      order: maxOrder + 1,
    }
    console.log('Creating folder:', newFolder)
    folders = [...folders, newFolder]
    console.log('Folders array after adding:', folders)
    persistFolders()
  }

  function selectFolder(folder: Folder) {
    currentFolder = folder
    currentView = 'folder'
  }

  function getBreadcrumbs() {
    const crumbs: Array<{
      label: string
      action: () => void
      id: string
      type: 'home' | 'folder' | 'note' | 'settings'
    }> = [
      {
        label: 'ホーム',
        action: () => {
          console.log('Home breadcrumb clicked!')
          currentView = 'home'
        },
        id: 'home',
        type: 'home',
      },
    ]

    if (currentView === 'settings') {
      crumbs.push({
        label: '設定',
        action: () => {},
        id: 'settings',
        type: 'settings',
      })
    } else if (currentView === 'folder' && currentFolder) {
      if (currentFolder.parentId) {
        const parent = folders.find((f) => f.id === currentFolder.parentId)
        if (parent) {
          crumbs.push({
            label: parent.name,
            action: () => selectFolder(parent),
            id: parent.id,
            type: 'folder',
          })
        }
      }
      crumbs.push({
        label: currentFolder.name,
        action: () => selectFolder(currentFolder),
        id: currentFolder.id,
        type: 'folder',
      })
    } else if (currentView === 'edit' && currentNote) {
      const folder = folders.find((f) => f.id === currentNote.folderId)
      if (folder) {
        if (folder.parentId) {
          const parent = folders.find((f) => f.id === folder.parentId)
          if (parent) {
            crumbs.push({
              label: parent.name,
              action: () => selectFolder(parent),
              id: parent.id,
              type: 'folder',
            })
          }
        }
        crumbs.push({
          label: folder.name,
          action: () => selectFolder(folder),
          id: folder.id,
          type: 'folder',
        })
      }
      crumbs.push({
        label: currentNote.title,
        action: () => {},
        id: currentNote.id,
        type: 'note',
      })
    }

    return crumbs
  }

  // リアクティブに計算されるパンくずリスト
  $: {
    currentView
    currentFolder
    currentNote
    folders
    breadcrumbs = getBreadcrumbs()
  }

  function getNextNoteName(): string {
    const pattern = /^ノート(\d+)$/
    const numbers = notes
      .map((n) => {
        const match = n.title.match(pattern)
        return match ? parseInt(match[1], 10) : 0
      })
      .filter((n) => n > 0)
    const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0
    return `ノート${maxNumber + 1}`
  }

  function createNewNote() {
    if (!currentFolder) return
    const title = getNextNoteName()
    const folderNotes = notes.filter((n) => n.folderId === currentFolder.id)
    const maxOrder = folderNotes.length > 0 ? Math.max(...folderNotes.map((n) => n.order)) : -1
    const newNote: Note = {
      id: crypto.randomUUID(),
      title,
      folderId: currentFolder.id,
      content: `# ${title}\n`,
      updatedAt: Date.now(),
      order: maxOrder + 1,
    }
    notes = [...notes, newNote]
    currentNote = newNote
    currentView = 'edit'
    persistNotes()
    resetEditorContent(newNote.content)
  }

  function selectNote(note: Note) {
    currentNote = note
    currentView = 'edit'
    resetEditorContent(note.content)
  }

  function deleteNote() {
    if (!currentNote) return
    const noteToDelete = currentNote
    showConfirm(`ノート「${noteToDelete.title}」を削除しますか？`, () => {
      const folderId = noteToDelete.folderId
      notes = notes.filter((n) => n.id !== noteToDelete.id)
      persistNotes()

      // フォルダビューに戻る
      const folder = folders.find((f) => f.id === folderId)
      if (folder) {
        currentFolder = folder
        currentView = 'folder'
      } else {
        currentView = 'home'
      }
      currentNote = null
    })
  }

  function deleteFolder() {
    if (!currentFolder) return

    // サブフォルダがある場合は削除できない
    const hasSubfolders = folders.some((f) => f.parentId === currentFolder.id)
    if (hasSubfolders) {
      showAlert('サブフォルダがあるため削除できません。先にサブフォルダを削除してください。')
      return
    }

    // フォルダ内のノートを確認
    const folderToDelete = { ...currentFolder }
    console.log('Deleting folder:', folderToDelete)
    const folderNotes = notes.filter((n) => n.folderId === folderToDelete.id)
    const notesCount = folderNotes.length
    const folderName = folderToDelete.name || '名前なし'
    const message =
      notesCount > 0
        ? `フォルダ「${folderName}」とその中のノート${notesCount}件を削除しますか？`
        : `フォルダ「${folderName}」を削除しますか？`

    console.log('Delete message:', message)
    showConfirm(message, () => {
      const parentId = folderToDelete.parentId

      // フォルダ内のノートを削除
      notes = notes.filter((n) => n.folderId !== folderToDelete.id)
      persistNotes()

      // フォルダを削除
      folders = folders.filter((f) => f.id !== folderToDelete.id)
      persistFolders()

      // 親フォルダまたはホームに戻る
      if (parentId) {
        const parent = folders.find((f) => f.id === parentId)
        if (parent) {
          currentFolder = parent
          currentView = 'folder'
        } else {
          currentView = 'home'
          currentFolder = null
        }
      } else {
        currentView = 'home'
        currentFolder = null
      }
    })
  }

  function updateNoteContent(value: string) {
    if (!currentNote) return
    currentNote = { ...currentNote, content: value, updatedAt: Date.now() }
    notes = notes.map((n) => (n.id === currentNote?.id ? currentNote : n))
    persistNotes()
  }

  function updateNoteMeta(key: keyof Note, value: string) {
    if (!currentNote) return
    // 空文字チェック: タイトルの場合は空文字を許可しない
    if (key === 'title' && value.trim() === '') {
      return
    }
    currentNote = { ...currentNote, [key]: value, updatedAt: Date.now() }
    notes = notes.map((n) => (n.id === currentNote?.id ? currentNote : n))
    persistNotes()
  }

  function startEditingBreadcrumb(id: string, type: 'folder' | 'note') {
    editingBreadcrumb = id
    if (type === 'note' && currentNote) {
      originalTitle = currentNote.title
      setTimeout(() => {
        if (titleInput) {
          titleInput.focus()
          titleInput.select()
        }
      }, 0)
    } else if (type === 'folder') {
      const folder = folders.find((f) => f.id === id)
      if (folder) {
        originalFolderName = folder.name
        setTimeout(() => {
          if (folderNameInput) {
            folderNameInput.focus()
            folderNameInput.select()
          }
        }, 0)
      }
    }
  }

  function finishEditingBreadcrumb() {
    // 編集終了時に空文字チェック: 空の場合は元の値に戻す
    if (currentNote && currentNote.title.trim() === '') {
      currentNote.title = originalTitle
      updateNoteMeta('title', originalTitle)
    }
    // フォルダ名が編集されている場合のチェック
    if (editingBreadcrumb) {
      const folder = folders.find((f) => f.id === editingBreadcrumb)
      if (folder && folder.name.trim() === '') {
        folder.name = originalFolderName
        folders = folders.map((f) => (f.id === editingBreadcrumb ? folder : f))
        persistFolders()
      }
    }
    editingBreadcrumb = null
  }

  function cancelEditingBreadcrumb(type: 'folder' | 'note', id: string) {
    if (type === 'note' && currentNote) {
      currentNote.title = originalTitle
      updateNoteMeta('title', originalTitle)
    } else if (type === 'folder') {
      const folder = folders.find((f) => f.id === id)
      if (folder) {
        folder.name = originalFolderName
        folders = folders.map((f) => (f.id === id ? folder : f))
        persistFolders()
      }
    }
    editingBreadcrumb = null
  }

  function handleBreadcrumbKeydown(e: KeyboardEvent, type: 'folder' | 'note', id: string) {
    if (e.key === 'Enter') {
      finishEditingBreadcrumb()
    } else if (e.key === 'Escape') {
      cancelEditingBreadcrumb(type, id)
    }
  }

  function updateFolderName(id: string, name: string) {
    const folder = folders.find((f) => f.id === id)
    if (!folder) return
    // 空文字チェック: 空文字を許可しない
    if (name.trim() === '') {
      return
    }
    folder.name = name
    folders = folders.map((f) => (f.id === id ? folder : f))
    persistFolders()
  }

  function resetEditorContent(content: string) {
    if (editorView) {
      const extensions = [
        basicSetup,
        markdown(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            updateNoteContent(update.state.doc.toString())
          }
        }),
      ]
      if (settings.theme === 'dark' || settings.theme === 'blackboard') {
        extensions.push(editorDarkTheme)
      }
      const newState = EditorState.create({
        doc: content,
        extensions,
      })
      editorView.setState(newState)
    }
  }

  function initializeEditor() {
    if (!editorContainer) return

    const extensions = [
      basicSetup,
      markdown(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          updateNoteContent(update.state.doc.toString())
        }
      }),
    ]
    if (settings.theme === 'dark' || settings.theme === 'blackboard') {
      extensions.push(editorDarkTheme)
    }

    editorView = new EditorView({
      state: EditorState.create({
        doc: currentNote?.content ?? '',
        extensions,
      }),
      parent: editorContainer,
    })
  }

  $: if (editorContainer || settings.theme) {
    if (editorView) {
      editorView.destroy()
      editorView = null
    }
    if (editorContainer) {
      initializeEditor()
    }
  }

  $: if (editorView && currentNote) {
    const doc = editorView.state.doc.toString()
    if (doc !== currentNote.content) {
      resetEditorContent(currentNote.content)
    }
  }

  function getFolderPath(folderId: string): string[] {
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return []

    const path = [folder.name]
    if (folder.parentId) {
      const parent = folders.find((f) => f.id === folder.parentId)
      if (parent) path.unshift(parent.name)
    }
    return path
  }

  function buildPath(note: Note) {
    const segments = ['notes']
    const folderPath = getFolderPath(note.folderId)
    segments.push(...folderPath)
    const fileName = `${note.title.trim() || 'untitled'}.md`
    segments.push(fileName)
    return segments.filter(Boolean).join('/')
  }

  function validateSettings() {
    return settings.token && settings.username && settings.email && settings.repoName
  }

  function encodeContent(content: string) {
    return btoa(unescape(encodeURIComponent(content)))
  }

  async function fetchCurrentSha(path: string, owner: string, repo: string) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: {
        Authorization: `Bearer ${settings.token}`,
        Accept: 'application/vnd.github+json',
      },
    })

    if (res.status === 200) {
      const data = await res.json()
      return data.sha as string
    }

    if (res.status === 404) {
      return null
    }

    throw new Error(`GitHub API error: ${res.status}`)
  }

  async function saveToGitHub() {
    syncMessage = ''
    syncError = ''

    if (!currentNote) {
      syncError = 'ノートが選択されていません。'
      return
    }

    if (!validateSettings()) {
      syncError = 'ローカルに保存しました（GitHub同期の設定が不足しています）'
      return
    }

    const [owner, repo] = settings.repoName.split('/')
    if (!owner || !repo) {
      syncError = 'リポジトリ名は「owner/repo」で入力してください。'
      return
    }

    const path = buildPath(currentNote)
    const content = encodeContent(currentNote.content)

    try {
      const sha = await fetchCurrentSha(path, owner, repo)
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${settings.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({
          message: 'auto-sync',
          content,
          sha: sha ?? undefined,
          committer: {
            name: settings.username,
            email: settings.email,
          },
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || '同期に失敗しました。')
      }

      syncMessage = 'GitHubへ保存しました。'
    } catch (err) {
      syncError = err instanceof Error ? err.message : '同期に失敗しました。'
    }
  }

  function downloadMd() {
    if (!currentNote) return
    const blob = new Blob([currentNote.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentNote.title || 'note'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function getNotesInFolder(folderId: string) {
    return notes.filter((n) => n.folderId === folderId).sort((a, b) => a.order - b.order)
  }

  function getFolderDisplayName(folder: Folder): string {
    if (folder.parentId) {
      const parent = folders.find((f) => f.id === folder.parentId)
      if (parent) return `${parent.name}/${folder.name}`
    }
    return folder.name
  }

  function getRootFolders() {
    const rootFolders = folders.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
    console.log('getRootFolders called, folders:', folders, 'rootFolders:', rootFolders)
    return rootFolders
  }

  function getSubfolders(parentId: string) {
    return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order)
  }

  function handleDragStart(folder: Folder) {
    draggedFolder = folder
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
  }

  function handleDrop(targetFolder: Folder) {
    if (!draggedFolder || draggedFolder.id === targetFolder.id) return
    if (draggedFolder.parentId !== targetFolder.parentId) return // 同じ階層のみ

    const siblingFolders = folders.filter((f) => f.parentId === targetFolder.parentId)
    const sortedSiblings = siblingFolders.sort((a, b) => a.order - b.order)

    const draggedIndex = sortedSiblings.findIndex((f) => f.id === draggedFolder.id)
    const targetIndex = sortedSiblings.findIndex((f) => f.id === targetFolder.id)

    if (draggedIndex === -1 || targetIndex === -1) return

    // 並び替え
    sortedSiblings.splice(draggedIndex, 1)
    sortedSiblings.splice(targetIndex, 0, draggedFolder)

    // order を再設定
    sortedSiblings.forEach((folder, index) => {
      folder.order = index
    })

    folders = [...folders]
    persistFolders()
    draggedFolder = null
  }

  function handleNoteDragStart(note: Note) {
    draggedNote = note
  }

  function handleNoteDrop(targetNote: Note) {
    if (!draggedNote || draggedNote.id === targetNote.id) return
    if (draggedNote.folderId !== targetNote.folderId) return

    const folderNotes = notes.filter((n) => n.folderId === targetNote.folderId)
    const sortedNotes = folderNotes.sort((a, b) => a.order - b.order)

    const draggedIndex = sortedNotes.findIndex((n) => n.id === draggedNote.id)
    const targetIndex = sortedNotes.findIndex((n) => n.id === targetNote.id)

    if (draggedIndex === -1 || targetIndex === -1) return

    // 並び替え
    sortedNotes.splice(draggedIndex, 1)
    sortedNotes.splice(targetIndex, 0, draggedNote)

    // order を再設定
    sortedNotes.forEach((note, index) => {
      note.order = index
    })

    notes = [...notes]
    persistNotes()
    draggedNote = null
  }
</script>

<header>
  <h1 style="cursor: pointer;" on:click={() => (currentView = 'home')}>SimplestNote.md</h1>
  {#if currentView !== 'settings'}
    <button
      class="icon-button"
      on:click={() => (currentView = 'settings')}
      title="設定"
      style="position: relative;"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
      {#if !isGitHubConfigured}
        <span
          style="position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; background: var(--error-color); border-radius: 50%;"
        ></span>
      {/if}
    </button>
  {/if}
</header>

<main>
  <div
    style="height: 40px; padding: 0 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); display: flex; align-items: center; gap: 8px; box-sizing: border-box;"
  >
    {#each breadcrumbs as crumb, index}
      {#if index > 0}
        <span style="color: var(--text-secondary);">/</span>
      {/if}
      {#if editingBreadcrumb === crumb.id && (crumb.type === 'folder' || crumb.type === 'note')}
        <div style="display: flex; align-items: center; gap: 4px;">
          {#if crumb.type === 'note'}
            <input
              type="text"
              bind:this={titleInput}
              bind:value={currentNote.title}
              on:keydown={(e) => handleBreadcrumbKeydown(e, 'note', crumb.id)}
              on:input={(e) => updateNoteMeta('title', e.currentTarget.value)}
              on:blur={finishEditingBreadcrumb}
              style="font-size: 14px; font-weight: 600; border: 1px solid var(--accent-color); border-radius: 4px; padding: 2px 8px; background: var(--bg-primary); color: var(--text-primary); height: 28px; line-height: 1;"
            />
          {:else if crumb.type === 'folder'}
            <input
              type="text"
              bind:this={folderNameInput}
              value={crumb.label}
              on:keydown={(e) => handleBreadcrumbKeydown(e, 'folder', crumb.id)}
              on:input={(e) => updateFolderName(crumb.id, e.currentTarget.value)}
              on:blur={finishEditingBreadcrumb}
              style="font-size: 14px; font-weight: 600; border: 1px solid var(--accent-color); border-radius: 4px; padding: 2px 8px; background: var(--bg-primary); color: var(--text-primary); height: 28px; line-height: 1;"
            />
          {/if}
          <button
            class="icon-button"
            on:click={() =>
              cancelEditingBreadcrumb(crumb.type === 'note' ? 'note' : 'folder', crumb.id)}
            title="キャンセル"
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
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      {:else}
        <button
          class="breadcrumb-link"
          on:click={(e) => {
            console.log('Breadcrumb button clicked', {
              index,
              total: breadcrumbs.length,
              disabled: crumb.type !== 'home' && index === breadcrumbs.length - 1,
              crumb,
            })
            crumb.action()
          }}
          disabled={crumb.type !== 'home' && index === breadcrumbs.length - 1}
        >
          {#if index === 0}
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
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          {:else}
            {crumb.label}
          {/if}
        </button>
        {#if index === breadcrumbs.length - 1 && (crumb.type === 'folder' || crumb.type === 'note')}
          <button
            class="icon-button"
            on:click={() =>
              startEditingBreadcrumb(crumb.id, crumb.type === 'note' ? 'note' : 'folder')}
            title={crumb.type === 'note' ? 'ノート名を編集' : 'フォルダ名を編集'}
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
            >
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </button>
        {/if}
      {/if}
    {/each}
  </div>

  {#if currentView === 'settings'}
    <section>
      <div class="flex-row" style="margin-bottom: 16px;">
        <div class="flex-1">
          <label>リポジトリ名（owner/repo）</label>
          <input type="text" bind:value={settings.repoName} placeholder="owner/repo" />
        </div>
        <div class="flex-1">
          <label>GitHubトークン</label>
          <input type="password" bind:value={settings.token} placeholder="ghp_..." />
        </div>
      </div>
      <div class="flex-row" style="margin-bottom: 16px;">
        <div class="flex-1">
          <label>コミットユーザー名</label>
          <input type="text" bind:value={settings.username} placeholder="your-name" />
        </div>
        <div class="flex-1">
          <label>コミットメールアドレス</label>
          <input type="email" bind:value={settings.email} placeholder="you@example.com" />
        </div>
      </div>
      <div
        class="toolbar"
        style="margin-top: 12px; justify-content: flex-end; align-items: center;"
      >
        {#if statusMessage}<span class="status">{statusMessage}</span>{/if}
        <button type="button" on:click={persistSettings}>設定を保存</button>
      </div>

      <hr style="border: none; border-top: 1px solid var(--border-color); margin: 24px -16px;" />

      <div style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 12px;">テーマ選択</h3>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
          <button
            type="button"
            class={settings.theme === 'light' ? '' : 'secondary'}
            on:click={() => (settings.theme = 'light')}
          >
            ライト
          </button>
          <button
            type="button"
            class={settings.theme === 'dark' ? '' : 'secondary'}
            on:click={() => (settings.theme = 'dark')}
          >
            ダーク
          </button>
          <button
            type="button"
            class={settings.theme === 'blackboard' ? '' : 'secondary'}
            on:click={() => (settings.theme = 'blackboard')}
          >
            黒板
          </button>
          <button
            type="button"
            class={settings.theme === 'kawaii' ? '' : 'secondary'}
            on:click={() => (settings.theme = 'kawaii')}
          >
            Kawaii
          </button>
          <button
            type="button"
            class={settings.theme === 'custom' ? '' : 'secondary'}
            on:click={() => (settings.theme = 'custom')}
          >
            カスタム
          </button>
        </div>
        {#if settings.theme === 'custom'}
          <div style="margin-top: 16px; display: flex; gap: 16px; justify-content: center;">
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 14px;">背景色</label>
              <input type="color" bind:value={settings.customBgPrimary} />
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 14px;"
                >アクセント色</label
              >
              <input type="color" bind:value={settings.customAccentColor} />
            </div>
          </div>
        {/if}
      </div>

      <hr style="border: none; border-top: 1px solid var(--border-color); margin: 24px -16px;" />

      <div style="text-align: center; color: var(--text-secondary); font-size: 14px;">
        <h3 style="color: var(--text-primary); margin-bottom: 8px;">SimplestNote.md</h3>
        <p style="margin: 8px 0; line-height: 1.6;">
          コンフリクトばかりのObsidianや<br />
          シンプルでないSimplenoteがいやになって作りました。<br />
          「こういうのでいいんだよ」を目指しています。
        </p>
        <p
          style="margin: 8px 0; display: flex; align-items: center; justify-content: center; gap: 8px;"
        >
          作者: <strong>kako-jun</strong>
          <a
            href="https://github.com/kako-jun/simplest-note-md"
            target="_blank"
            rel="noopener noreferrer"
            style="color: var(--text-primary); display: flex; align-items: center;"
            title="GitHub"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path
                d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
              />
            </svg>
          </a>
        </p>
      </div>
    </section>
  {:else if currentView === 'home'}
    <section style="padding: 16px; height: calc(100vh - 80px - 60px); overflow-y: auto;">
      <div class="card-grid">
        {#each rootFolders as folder}
          <div
            class="note-card"
            draggable="true"
            on:dragstart={() => handleDragStart(folder)}
            on:dragover={handleDragOver}
            on:drop|preventDefault={() => handleDrop(folder)}
            on:click={() => selectFolder(folder)}
            style="cursor: pointer; background: var(--bg-tertiary);"
          >
            <strong>{folder.name}</strong>
            <div style="margin-top: 8px;">
              <small
                >{getNotesInFolder(folder.id).length + getSubfolders(folder.id).length} 項目</small
              >
            </div>
          </div>
        {/each}
        {#if rootFolders.length === 0}
          <p>フォルダがまだありません。</p>
        {/if}
      </div>
    </section>
    <div
      class="toolbar"
      style="position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg-primary); border-top: 1px solid var(--border-color); padding: 12px 16px; box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1); z-index: 10; justify-content: flex-end;"
    >
      <button type="button" on:click={() => createFolder()}>
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
          style="margin-right: 4px;"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
        新規フォルダ
      </button>
    </div>
  {:else if currentView === 'folder' && currentFolder}
    <section style="padding: 16px; height: calc(100vh - 80px - 60px); overflow-y: auto;">
      <div class="card-grid">
        {#each subfolders as subfolder}
          <div
            class="note-card"
            draggable="true"
            on:dragstart={() => handleDragStart(subfolder)}
            on:dragover={handleDragOver}
            on:drop|preventDefault={() => handleDrop(subfolder)}
            on:click={() => selectFolder(subfolder)}
            style="cursor: pointer; background: var(--bg-tertiary);"
          >
            <strong>{subfolder.name}</strong>
            <div style="margin-top: 8px;">
              <small>{getNotesInFolder(subfolder.id).length} ノート</small>
            </div>
          </div>
        {/each}
        {#each currentFolderNotes as note}
          <div
            class="note-card"
            draggable="true"
            on:dragstart={() => handleNoteDragStart(note)}
            on:dragover={handleDragOver}
            on:drop|preventDefault={() => handleNoteDrop(note)}
            on:click={() => selectNote(note)}
            style="cursor: pointer;"
          >
            <strong>{note.title}</strong>
            <div style="margin-top: 8px;">
              <small>{new Date(note.updatedAt).toLocaleDateString()}</small>
            </div>
          </div>
        {/each}
        {#if currentFolderNotes.length === 0 && subfolders.length === 0}
          <p>ノートとサブフォルダがまだありません。</p>
        {/if}
      </div>
    </section>
    <div
      class="toolbar"
      style="position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg-primary); border-top: 1px solid var(--border-color); padding: 12px 16px; box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1); z-index: 10;"
    >
      <button type="button" class="secondary" on:click={deleteFolder}>
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
          style="margin-right: 4px;"
        >
          <polyline points="3 6 5 6 21 6" />
          <path
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
        削除
      </button>
      {#if !currentFolder.parentId}
        <button
          type="button"
          class="secondary"
          on:click={() => createFolder(currentFolder.id)}
          style="margin-left: auto;"
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
            style="margin-right: 4px;"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          新規サブフォルダ
        </button>
      {:else}
        <span style="margin-left: auto;"></span>
      {/if}
      <button type="button" on:click={createNewNote}>
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
          style="margin-right: 4px;"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
        新規ノート
      </button>
    </div>
  {:else if currentView === 'edit' && currentNote}
    <section style="padding: 0;">
      <div
        style="height: calc(100vh - 80px - 60px); margin: 0; overflow: hidden;"
        bind:this={editorContainer}
      ></div>
      <div
        class="toolbar"
        style="position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg-primary); border-top: 1px solid var(--border-color); padding: 12px 16px; box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1); z-index: 10;"
      >
        <button type="button" class="secondary" on:click={deleteNote}>
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
            style="margin-right: 4px;"
          >
            <polyline points="3 6 5 6 21 6" />
            <path
              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          削除
        </button>
        {#if syncMessage}<span class="status">{syncMessage}</span>{/if}
        {#if syncError}<span class="status error">{syncError}</span>{/if}
        <button type="button" class="secondary" on:click={downloadMd} style="margin-left: auto;">
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
            style="margin-right: 4px;"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download
        </button>
        <button type="button" on:click={saveToGitHub}>
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
            style="margin-right: 4px;"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          Save
        </button>
      </div>
    </section>
  {/if}
</main>

{#if showModal}
  <div
    style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;"
    on:click={closeModal}
  >
    <div
      style="background: var(--bg-primary); border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);"
      on:click|stopPropagation
    >
      <p style="margin: 0 0 24px 0; color: var(--text-primary); font-size: 16px; line-height: 1.5;">
        {modalMessage}
      </p>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        {#if modalType === 'confirm'}
          <button type="button" class="secondary" on:click={closeModal}>キャンセル</button>
          <button type="button" on:click={confirmModal}>OK</button>
        {:else}
          <button type="button" on:click={closeModal}>OK</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
