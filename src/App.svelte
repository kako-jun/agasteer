<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorState } from '@codemirror/state'
  import { EditorView, keymap } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { markdown } from '@codemirror/lang-markdown'
  import { basicSetup } from 'codemirror'

  type Settings = {
    token: string
    username: string
    email: string
    repoName: string
    basePath: string
  }

  type Note = {
    id: string
    title: string
    folder?: string
    subfolder?: string
    content: string
    updatedAt: number
  }

  const SETTINGS_KEY = 'simplest-md-note/settings'
  const NOTES_KEY = 'simplest-md-note/notes'

  const defaultSettings: Settings = {
    token: '',
    username: '',
    email: '',
    repoName: '',
    basePath: 'notes',
  }

  let settings: Settings = { ...defaultSettings }
  let notes: Note[] = []
  let currentNote: Note | null = null
  let statusMessage = ''
  let syncMessage = ''
  let syncError = ''
  let editorContainer: HTMLDivElement | null = null
  let editorView: EditorView | null = null

  onMount(() => {
    const storedSettings = localStorage.getItem(SETTINGS_KEY)
    if (storedSettings) {
      settings = { ...settings, ...JSON.parse(storedSettings) }
    }

    const storedNotes = localStorage.getItem(NOTES_KEY)
    if (storedNotes) {
      notes = JSON.parse(storedNotes)
      if (notes.length > 0) {
        currentNote = notes[0]
      }
    }

    initializeEditor()
  })

  function persistSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    statusMessage = '設定を保存しました。'
    setTimeout(() => (statusMessage = ''), 2000)
  }

  function persistNotes() {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
  }

  function createNewNote() {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: 'untitled',
      folder: '',
      subfolder: '',
      content: '# 新しいノート\n',
      updatedAt: Date.now(),
    }
    notes = [newNote, ...notes]
    currentNote = newNote
    persistNotes()
    resetEditorContent(newNote.content)
  }

  function selectNote(note: Note) {
    currentNote = note
    resetEditorContent(note.content)
  }

  function updateNoteContent(value: string) {
    if (!currentNote) return
    currentNote = { ...currentNote, content: value, updatedAt: Date.now() }
    notes = notes.map((n) => (n.id === currentNote?.id ? currentNote : n))
    persistNotes()
  }

  function updateNoteMeta(key: keyof Note, value: string) {
    if (!currentNote) return
    currentNote = { ...currentNote, [key]: value, updatedAt: Date.now() }
    notes = notes.map((n) => (n.id === currentNote?.id ? currentNote : n))
    persistNotes()
  }

  function resetEditorContent(content: string) {
    if (editorView) {
      const newState = EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          markdown(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              updateNoteContent(update.state.doc.toString())
            }
          }),
        ],
      })
      editorView.setState(newState)
    }
  }

  function initializeEditor() {
    if (!editorContainer) return

    editorView = new EditorView({
      state: EditorState.create({
        doc: currentNote?.content ?? '',
        extensions: [
          basicSetup,
          markdown(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              updateNoteContent(update.state.doc.toString())
            }
          }),
        ],
      }),
      parent: editorContainer,
    })
  }

  $: if (editorContainer && !editorView) {
    initializeEditor()
  }

  $: if (editorView && currentNote) {
    const doc = editorView.state.doc.toString()
    if (doc !== currentNote.content) {
      resetEditorContent(currentNote.content)
    }
  }

  function buildPath(note: Note) {
    const base = settings.basePath.replace(/^\/+|\/+$/g, '')
    const segments = [base]
    if (note.folder) segments.push(note.folder.trim())
    if (note.subfolder) segments.push(note.subfolder.trim())
    const fileName = `${note.title.trim() || 'untitled'}.md`
    segments.push(fileName)
    return segments.filter(Boolean).join('/')
  }

  function validateSettings() {
    return (
      settings.token &&
      settings.username &&
      settings.email &&
      settings.repoName &&
      settings.basePath
    )
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
      syncError = '設定が不足しています。'
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

  const folders = () => {
    const map = new Map<string, Note[]>()
    notes.forEach((note) => {
      const key = `${note.folder || 'ルート'}${note.subfolder ? `/${note.subfolder}` : ''}`
      const current = map.get(key) ?? []
      map.set(key, [...current, note])
    })
    return Array.from(map.entries())
  }

  const recentNotes = () => {
    return [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5)
  }
</script>

<main>
  <h1>simplest-md-note</h1>
  <section>
    <h2>設定</h2>
    <div class="flex-row">
      <div class="flex-1">
        <label>GitHubトークン</label>
        <input type="password" bind:value={settings.token} placeholder="ghp_..." />
      </div>
      <div class="flex-1">
        <label>コミットユーザー名</label>
        <input type="text" bind:value={settings.username} placeholder="your-name" />
      </div>
      <div class="flex-1">
        <label>メールアドレス</label>
        <input type="email" bind:value={settings.email} placeholder="you@example.com" />
      </div>
    </div>
    <div class="flex-row">
      <div class="flex-1">
        <label>リポジトリ名（owner/repo）</label>
        <input type="text" bind:value={settings.repoName} placeholder="owner/repo" />
      </div>
      <div class="flex-1">
        <label>パス（ノート保存先）</label>
        <input type="text" bind:value={settings.basePath} placeholder="notes" />
      </div>
    </div>
    <div class="toolbar" style="margin-top: 12px;">
      <button on:click={persistSettings}>設定を保存</button>
      {#if statusMessage}<span class="status">{statusMessage}</span>{/if}
    </div>
  </section>

  <section>
    <div class="toolbar" style="justify-content: space-between; align-items: center;">
      <div>
        <h2 style="margin: 0;">ノート一覧</h2>
        <small>フォルダ階層は最大2階層です。</small>
      </div>
      <button on:click={createNewNote}>新規ノート</button>
    </div>
    <h3>フォルダ</h3>
    <div class="card-grid">
      {#each folders() as [folderName, folderNotes]}
        <div class="note-card">
          <strong>{folderName}</strong>
          <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
            {#each folderNotes as note}
              <button class="secondary" on:click={() => selectNote(note)}>{note.title}</button>
            {/each}
          </div>
        </div>
      {/each}
      {#if notes.length === 0}
        <p>ノートがまだありません。</p>
      {/if}
    </div>

    <h3>最近使ったノート</h3>
    <div class="card-grid">
      {#each recentNotes() as note}
        <div class="note-card">
          <div class="badge">最近</div>
          <div style="margin-top: 6px;">
            <strong>{note.title}</strong>
            <div>
              <small>{note.folder || 'ルート'}{note.subfolder ? `/${note.subfolder}` : ''}</small>
            </div>
          </div>
          <div style="margin-top: 8px;">
            <button class="secondary" on:click={() => selectNote(note)}>開く</button>
          </div>
        </div>
      {/each}
      {#if notes.length === 0}
        <p>最近のノートはありません。</p>
      {/if}
    </div>
  </section>

  {#if currentNote}
    <section>
      <div class="flex-row">
        <div class="flex-1">
          <label>ノート名</label>
          <input
            type="text"
            bind:value={currentNote.title}
            on:input={(e) => updateNoteMeta('title', e.currentTarget.value)}
          />
        </div>
        <div class="flex-1">
          <label>フォルダ</label>
          <input
            type="text"
            bind:value={currentNote.folder}
            on:input={(e) => updateNoteMeta('folder', e.currentTarget.value)}
          />
        </div>
        <div class="flex-1">
          <label>サブフォルダ</label>
          <input
            type="text"
            bind:value={currentNote.subfolder}
            on:input={(e) => updateNoteMeta('subfolder', e.currentTarget.value)}
          />
        </div>
      </div>
      <div style="margin: 12px 0;" bind:this={editorContainer}></div>
      <div class="toolbar" style="margin-top: 12px;">
        <button on:click={saveToGitHub}>Save to GitHub</button>
        <button class="secondary" on:click={downloadMd}>Download .md</button>
        {#if syncMessage}<span class="status">{syncMessage}</span>{/if}
        {#if syncError}<span class="status error">{syncError}</span>{/if}
      </div>
    </section>
  {/if}
</main>
