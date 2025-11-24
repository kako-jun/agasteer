# データモデルと状態管理

SimplestNote.mdのデータモデル、型定義、状態管理について説明します。

## データモデルと型定義

### TypeScript型定義

#### `Settings`

ユーザー設定を保持。

```typescript
type Settings = {
  token: string // GitHub Personal Access Token
  repoName: string // "owner/repo"形式
  theme: ThemeType // 'yomi' | 'campus' | 'greenboard' | 'whiteboard' | 'dotsD' | 'dotsF'
  toolName: string // アプリケーション名（タブタイトル）
  locale: Locale // 'ja' | 'en'
  hasCustomFont?: boolean // カスタムフォント適用フラグ
  hasCustomBackgroundLeft?: boolean // 左ペイン背景画像適用フラグ
  hasCustomBackgroundRight?: boolean // 右ペイン背景画像適用フラグ
  backgroundOpacityLeft?: number // 左ペイン背景画像透明度
  backgroundOpacityRight?: number // 右ペイン背景画像透明度
}
```

**注意**: コミット時のユーザー名とメールアドレスは固定値（`simplest-note-md` / `simplest-note-md@example.com`）を使用します。

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

### Svelteストア

SimplestNote.mdは、Svelteの`writable`と`derived`ストアを使用して状態を管理します。

#### 基本ストア（グローバル）

```typescript
export const settings = writable<Settings>(defaultSettings)
export const notes = writable<Note[]>([])
export const leaves = writable<Leaf[]>([])
export const metadata = writable<Metadata>({ version: 1, notes: {}, leaves: {}, pushCount: 0 })
export const isDirty = writable<boolean>(false) // GitHubにPushされていない変更があるか
```

**重要な設計変更（Version 5.0）:**

- 表示状態（`currentView`, `currentNote`, `currentLeaf`）はローカル変数に変更
- 2ペイン対応のため、各ペインが独立した状態を持つ設計に変更
- グローバルストアは全体で共有するデータ（notes, leaves, settings等）のみ

#### ローカル変数（各ペイン独立）

```typescript
// 左ペインの状態
let leftNote: Note | null = null
let leftLeaf: Leaf | null = null
let leftView: View = 'home'

// 右ペインの状態
let rightNote: Note | null = null
let rightLeaf: Leaf | null = null
let rightView: View = 'home'
```

**設計思想:**

- 左右のペインは完全に対等
- 各ペインが独立したナビゲーション状態を持つ
- URLルーティングで左右別々に状態を管理

#### 派生ストア

```typescript
// ルートノート（parentIdがないもの）
export const rootNotes = derived(notes, ($notes) =>
  $notes.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
)

// GitHub設定が完了しているか
export const githubConfigured = derived(
  settings,
  ($settings) => !!($settings.token && $settings.repoName)
)
```

**削除された派生ストア:**

- `subNotes` - インラインfilterに変更（各ペインで独立して計算）
- `currentNoteLeaves` - インラインfilterに変更（各ペインで独立して計算）

**理由:** 2ペイン表示では左右で異なるノートを表示できるため、グローバルな「currentNote」という概念が不適切

#### ダーティフラグ（isDirty）の管理

`isDirty`ストアは、GitHubにPushされていない変更があるかどうかを追跡します。

**ダーティフラグが立つタイミング:**

- エディタでリーフの内容を編集したとき
- ノートを作成・削除・名前変更・並び替えたとき（`updateNotes()`内で自動的に`isDirty.set(true)`）
- リーフを作成・削除・名前変更・並び替えたとき（`updateLeaves()`内で自動的に`isDirty.set(true)`）

**ダーティフラグがクリアされるタイミング:**

- Push成功時（GitHubとの同期完了）
- Pull成功時（GitHubから最新データを取得）

**ダーティ状態での動作:**

- 保存ボタンに赤い丸印（notification badge）が表示される
- Pull実行時に確認ダイアログが表示される
- ページ離脱時（タブを閉じる、リロード）にブラウザ標準の確認ダイアログが表示される

**アプリ内ナビゲーションは制限されない:**

このアプリは編集時に自動的にIndexedDBに保存されるため、アプリ内のナビゲーション（ホーム、ノート、リーフ間の移動）ではデータが失われません。ダーティフラグは「GitHubにPushしていない」という意味であり、GitHubとの同期を失う操作（Pullとページ離脱）のみ確認が必要です。

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

  const newNote: Note = {
    id: crypto.randomUUID(),
    name: generateUniqueName(
      'ノート',
      targetNotes.map((n) => n.name)
    ),
    parentId: parentId || undefined,
    order: targetNotes.length,
  }

  updateNotes([...allNotes, newNote]) // IndexedDBに保存
}
```

**リーフの作成:**

```typescript
function createLeaf(pane: Pane) {
  if (isOperationsLocked) return
  const targetNote = pane === 'left' ? leftNote : rightNote
  if (!targetNote) return

  const allLeaves = $leaves
  const noteLeaves = allLeaves.filter((n) => n.noteId === targetNote.id)

  const newLeaf: Leaf = {
    id: crypto.randomUUID(),
    title: generateUniqueName(
      'リーフ',
      noteLeaves.map((l) => l.title)
    ),
    noteId: targetNote.id,
    content: `# ${uniqueTitle}\n\n`,
    updatedAt: Date.now(),
    order: noteLeaves.length,
  }

  updateLeaves([...allLeaves, newLeaf]) // IndexedDBに保存
  selectLeaf(newLeaf, pane)
}
```

**重要:** すべてのナビゲーション関数は`pane: 'left' | 'right'`引数を取り、左右のペインを明示的に指定します。

#### Read（読み取り）

**グローバル派生ストア:**

```typescript
// ルートノート（parentIdがないもの）
export const rootNotes = derived(notes, ($notes) =>
  $notes.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
)
```

**ペイン固有の計算（インライン）:**

```typescript
// 左ペインのサブノート
subNotes={$notes
  .filter((n) => n.parentId === leftNote.id)
  .sort((a, b) => a.order - b.order)}

// 左ペインのリーフ
leaves={$leaves
  .filter((l) => l.noteId === leftNote.id)
  .sort((a, b) => a.order - b.order)}
```

**設計変更の理由:** 2ペイン表示では、左右で異なるノートを表示できるため、各ペインで独立してfilter/sortを実行する必要がある。

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
  updateLeaves(updatedLeaves) // IndexedDBに保存

  // 左ペインのリーフを編集している場合は leftLeaf も更新
  if (leftLeaf?.id === leafId) {
    leftLeaf = { ...leftLeaf, content, title: newTitle, updatedAt: Date.now() }
  }

  // 右ペインのリーフを編集している場合は rightLeaf も更新
  if (rightLeaf?.id === leafId) {
    rightLeaf = { ...rightLeaf, content, title: newTitle, updatedAt: Date.now() }
  }
}
```

**重要:** leafIdベースの更新により、左右どちらのペインでも同じリーフを編集可能。同じリーフを左右で開いている場合は即座に同期される。

#### Delete（削除）

**ノートの削除:**

```typescript
function deleteNote(pane: Pane) {
  if (isOperationsLocked) return
  const targetNote = pane === 'left' ? leftNote : rightNote
  if (!targetNote) return

  const allNotes = $notes
  const allLeaves = $leaves
  const hasSubNotes = allNotes.some((f) => f.parentId === targetNote.id)
  const hasLeaves = allLeaves.some((n) => n.noteId === targetNote.id)

  if (hasSubNotes || hasLeaves) {
    showAlert('サブノートやリーフが含まれているため削除できません。')
    return
  }

  showConfirm('このノートを削除しますか？', () => {
    const noteId = targetNote.id
    const parentId = targetNote.parentId
    updateNotes(allNotes.filter((f) => f.id !== noteId)) // IndexedDBに保存

    // 親ノートまたはホームに戻る
    const parentNote = allNotes.find((f) => f.id === parentId)
    if (parentNote) {
      selectNote(parentNote, pane)
    } else {
      goHome(pane)
    }
  })
}
```

**リーフの削除:**

```typescript
function deleteLeaf(leafId: string, pane: Pane) {
  if (isOperationsLocked) return

  const allLeaves = $leaves
  const targetLeaf = allLeaves.find((l) => l.id === leafId)
  if (!targetLeaf) return

  showConfirm('このリーフを削除しますか？', () => {
    updateLeaves(allLeaves.filter((n) => n.id !== leafId)) // IndexedDBに保存

    const note = $notes.find((f) => f.id === targetLeaf.noteId)
    if (note) {
      selectNote(note, pane)
    } else {
      goHome(pane)
    }
  })
}
```

**重要:** すべての削除操作でもpane引数を指定し、削除後のナビゲーションが適切なペインで行われるようにする。

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
