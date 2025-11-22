# データモデルと状態管理

SimplestNote.mdのデータモデル、型定義、状態管理について説明します。

## データモデルと型定義

### TypeScript型定義

#### `Settings`

ユーザー設定を保持。

```typescript
type Settings = {
  token: string // GitHub Personal Access Token
  username: string // コミット用ユーザー名
  email: string // コミット用メールアドレス
  repoName: string // "owner/repo"形式
  theme: 'light' | 'dark' | 'blackboard' | 'kawaii' | 'custom'
  customBgPrimary: string // カスタムテーマ背景色
  customAccentColor: string // カスタムテーマアクセントカラー
}
```

#### `Folder`

フォルダ情報（最大2階層）。

```typescript
type Folder = {
  id: string // UUID (crypto.randomUUID())
  name: string // 表示名
  parentId?: string // 親フォルダのID（undefinedの場合はルート）
  order: number // 並び順（同階層内）
}
```

**階層構造:**

- `parentId === undefined`: ルートフォルダ
- `parentId !== undefined`: サブフォルダ

#### `Note`

ノート情報。

```typescript
type Note = {
  id: string // UUID
  title: string // ノート名
  folderId: string // 所属フォルダのID
  content: string // Markdown本文
  updatedAt: number // 最終更新タイムスタンプ（Unix time）
  order: number // 並び順（フォルダ内）
}
```

#### `View`

現在のビュー状態。

```typescript
type View = 'home' | 'settings' | 'edit' | 'folder'
```

- **home**: ルートフォルダ一覧
- **folder**: フォルダ内のサブフォルダとノート一覧
- **edit**: ノート編集画面
- **settings**: 設定画面

### データの一意性とリレーション

```
Folder (id: uuid-1, parentId: null)         // ルートフォルダ
   ├─ Folder (id: uuid-2, parentId: uuid-1) // サブフォルダ
   │    └─ Note (id: uuid-5, folderId: uuid-2)
   └─ Note (id: uuid-3, folderId: uuid-1)
```

**UUIDの使用理由:**

- 名前変更に対して安定した参照
- 衝突のないグローバルユニークID
- 追加ライブラリ不要（`crypto.randomUUID()`はモダンブラウザで利用可能）

---

## 状態管理とデータフロー

### データ永続化の仕様

SimplestNote.mdは、データを2つの異なるストレージに保存します。

#### LocalStorage

**保存対象:**

- 設定情報（Settings）のみ
  - GitHubトークン
  - リポジトリ名
  - コミット用ユーザー名・メールアドレス
  - テーマ設定
  - カスタムテーマ設定
  - ツール名

**保存タイミング:**

- 設定画面内での操作時に即座に反映

**重要:** 設定情報はGitHubには同期されません。デバイスローカルのみです。

#### IndexedDB

**役割:** GitHubからPullしたデータの一時キャッシュ

**重要な設計思想:**

- **GitHubが唯一の真実の情報源（Single Source of Truth）**
- IndexedDBは単なるキャッシュであり、GitHubから取得したデータを一時保存するだけ
- 前回終了時のIndexedDBデータは意味を持たない
- 毎回のPull成功時にIndexedDBは全削除→全作成される

**保存対象:**

- ノート（Note）データ
- リーフ（Leaf）データ

**保存タイミング:**

- ノート/リーフの作成・削除・編集時に即座に反映
- ノート名の変更時
- リーフタイトル・コンテンツの変更時
- ドラッグ&ドロップによる並び替え時
- **Pull成功時に全削除→全作成（最重要）**

#### GitHub（リモートリポジトリ）

**Push対象:**

- 全ノート
- 全リーフ

**Pushタイミング:**

1. 保存ボタンを押したとき
   - 全リーフをGitHubにPush
   - 処理フロー: 「Pushします」→ Push実行 → 結果表示
2. 設定ボタンを押したとき（設定画面を開くとき）
   - 全リーフをGitHubにPush
   - 処理フロー: 「Pushします」→ Push実行 → 結果表示

**Pullタイミング:**

1. 初回Pull（アプリ起動時）
   - 処理フロー: 「Pullします」→ Pull実行 → **IndexedDB全削除** → **IndexedDB全作成** → 画面表示 → 結果表示
   - **初回Pull成功まで、画面にノート・リーフは表示されない**
2. Pullテストボタンを押したとき
   - 処理フロー: 「Pullします」→ Pull実行 → **IndexedDB全削除** → **IndexedDB全作成** → 結果表示
3. 設定画面を閉じたとき
   - 処理フロー: 「Pullします」→ Pull実行 → **IndexedDB全削除** → **IndexedDB全作成** → 結果表示

**重要な仕様:**

- Pull成功のたびに、IndexedDBは完全にクリアされ、GitHubから取得したデータで再構築される
- 前回終了時のIndexedDBデータは使用されない（次のPullで必ず上書きされる）
- 設定情報（LocalStorage）はGitHubには含まれない
- ノートとリーフのMarkdownファイルのみが同期される

### データフローパターン

```
User Action
    ↓
Event Handler (e.g., createNote, updateLeafContent)
    ↓
State Update (notes = [...notes, newNote])
    ↓
Persist to IndexedDB (updateNotes, updateLeaves)
    ↓
Svelte Reactive System ($:)
    ↓
UI Re-render
```

**設定変更の場合:**

```
User Action (設定画面での操作)
    ↓
Event Handler (handleSettingsChange)
    ↓
State Update (settings = { ...settings, ...payload })
    ↓
Persist to LocalStorage (updateSettings)
    ↓
Svelte Reactive System ($:)
    ↓
UI Re-render
```

### 状態の初期化フロー

**onMount時の処理:**

```typescript
onMount(() => {
  // 1. LocalStorageから設定の読み込み
  const loadedSettings = loadSettings()
  settings.set(loadedSettings)
  applyTheme(loadedSettings.theme, loadedSettings)
  document.title = loadedSettings.toolName
  ;(async () => {
    // 2. 初回Pull（GitHubからデータを取得）
    //    重要: IndexedDBからは読み込まない
    //    Pull成功時にIndexedDBは全削除→全作成される
    await handlePull(true)

    // 3. Pull成功後、URLから状態を復元（ディープリンク対応）
    restoreStateFromUrl()
  })()

  // 4. ブラウザの戻る/進むボタンに対応
  const handlePopState = () => {
    restoreStateFromUrl()
  }
  window.addEventListener('popstate', handlePopState)

  return () => {
    window.removeEventListener('popstate', handlePopState)
  }
})
```

**重要な仕様:**

- アプリ起動時、IndexedDBからの読み込みは行わない
- 必ず最初にPullを実行し、GitHubから最新データを取得する
- Pull成功時に、IndexedDBを全削除→GitHubから取得したデータで全作成
- 初回Pull成功まで、画面にノート・リーフは表示されない（`isOperationsLocked = true`）
- Pull失敗時は、ユーザーに設定確認を促すアラートを表示

### CRUD操作のパターン

#### Create（作成）

**ノートの作成:**

```typescript
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

  updateNotes([...allNotes, newNote]) // IndexedDBに保存
}
```

**リーフの作成:**

```typescript
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

  updateLeaves([...allLeaves, newLeaf]) // IndexedDBに保存
  selectLeaf(newLeaf)
}
```

#### Read（読み取り）

リアクティブ宣言（Derived Stores）によって自動的に計算。

```typescript
// ルートノート（parentIdがないもの）
export const rootNotes = derived(notes, ($notes) =>
  $notes.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
)

// 現在のノート内のリーフ
export const currentNoteLeaves = derived([leaves, currentNote], ([$leaves, $currentNote]) =>
  $currentNote
    ? $leaves.filter((n) => n.noteId === $currentNote.id).sort((a, b) => a.order - b.order)
    : []
)
```

#### Update（更新）

**ノート名の更新:**

```typescript
function updateNoteName(noteId: string, newName: string) {
  const allNotes = $notes
  const updatedNotes = allNotes.map((f) => (f.id === noteId ? { ...f, name: newName } : f))
  updateNotes(updatedNotes) // IndexedDBに保存
}
```

**リーフコンテンツの更新:**

```typescript
function updateLeafContent(content: string) {
  if (isOperationsLocked) return
  if (!$currentLeaf) return

  const allLeaves = $leaves
  const updatedLeaves = allLeaves.map((n) =>
    n.id === $currentLeaf!.id ? { ...n, content, updatedAt: Date.now() } : n
  )
  updateLeaves(updatedLeaves) // IndexedDBに保存
  currentLeaf.update((n) => (n ? { ...n, content, updatedAt: Date.now() } : n))
}
```

#### Delete（削除）

**ノートの削除:**

```typescript
function deleteNote() {
  if (isOperationsLocked) return
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
    updateNotes(allNotes.filter((f) => f.id !== noteId)) // IndexedDBに保存

    // 親ノートまたはホームに戻る
    const parentNote = allNotes.find((f) => f.id === parentId)
    if (parentNote) {
      selectNote(parentNote)
    } else {
      goHome()
    }
  })
}
```

**リーフの削除:**

```typescript
function deleteLeaf() {
  if (isOperationsLocked) return
  if (!$currentLeaf) return

  showConfirm('このリーフを削除しますか？', () => {
    const allLeaves = $leaves
    updateLeaves(allLeaves.filter((n) => n.id !== $currentLeaf!.id)) // IndexedDBに保存

    const note = $notes.find((f) => f.id === $currentLeaf!.noteId)
    if (note) {
      selectNote(note)
    } else {
      goHome()
    }
  })
}
```

### 並び替えのデータフロー

ドラッグ&ドロップによる並び替えの実装。

**1. ドラッグ開始**

```typescript
function handleDragStart(e: DragEvent, folder: Folder) {
  draggedFolder = folder
}
```

**2. ドロップ**

```typescript
function handleDrop(e: DragEvent, targetFolder: Folder) {
  if (!draggedFolder || draggedFolder.id === targetFolder.id) return
  if (draggedFolder.parentId !== targetFolder.parentId) return // 同階層のみ

  const targetList = draggedFolder.parentId ? subfolders : rootFolders

  const fromIndex = targetList.findIndex((f) => f.id === draggedFolder!.id)
  const toIndex = targetList.findIndex((f) => f.id === targetFolder.id)

  // 並び順を再計算
  const reordered = [...targetList]
  const [movedItem] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, movedItem)

  // orderフィールドを更新
  const updatedFolders = folders.map((f) => {
    const newOrderIndex = reordered.findIndex((r) => r.id === f.id)
    if (newOrderIndex !== -1) {
      return { ...f, order: newOrderIndex }
    }
    return f
  })

  folders = updatedFolders
  persistFolders()
  draggedFolder = null
}
```
