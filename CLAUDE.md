# SimplestNote.md - 開発者向けドキュメント

このドキュメントは、SimplestNote.mdの内部アーキテクチャ、実装の詳細、およびコードベースの理解を深めるための技術的な情報を提供します。

## 目次

1. [アーキテクチャ概要](#アーキテクチャ概要)
2. [技術スタック](#技術スタック)
3. [プロジェクト構造](#プロジェクト構造)
4. [コードアーキテクチャ](#コードアーキテクチャ)
5. [データモデルと型定義](#データモデルと型定義)
6. [状態管理とデータフロー](#状態管理とデータフロー)
7. [主要機能の実装](#主要機能の実装)
8. [GitHub API統合](#github-api統合)
9. [テーマシステム](#テーマシステム)
10. [LocalStorageスキーマ](#localstorageスキーマ)
11. [実装されたリファクタリング](#実装されたリファクタリング)
12. [拡張の可能性](#拡張の可能性)

---

## アーキテクチャ概要

SimplestNote.mdは、**コンポーネントベースアーキテクチャ**を採用した軽量Markdownノートアプリケーションです。

### 設計哲学

- **シンプリシティ**: 必要最小限の依存関係とコード量
- **ブラウザファースト**: サーバーレス、完全クライアントサイド
- **直接統合**: GitHub APIを直接呼び出し、中間サービス不要
- **即時性**: LocalStorageによる自動保存、設定変更の即座反映
- **モジュール性**: コンポーネント分割による保守性の向上

### アーキテクチャパターン

```
┌─────────────────────────────────────────────────────┐
│                  App.svelte (533行)                 │
│              ルーティング & レイアウト                │
└─────────────────────────────────────────────────────┘
         │
         ├─── Header.svelte (75行)
         ├─── Breadcrumbs.svelte (156行)
         ├─── Modal.svelte (84行)
         │
         ├─── HomeView.svelte (134行)
         ├─── FolderView.svelte (209行)
         ├─── EditorView.svelte (154行)
         │    └─── MarkdownEditor.svelte (137行)
         └─── SettingsView.svelte (322行)

┌─────────────────────────────────────────────────────┐
│                  Lib Layer (362行)                  │
├─────────────────────────────────────────────────────┤
│  stores.ts (54行)   - Svelte Store状態管理         │
│  types.ts (52行)    - TypeScript型定義              │
│  storage.ts (104行) - LocalStorage操作              │
│  github.ts (132行)  - GitHub API統合                │
│  theme.ts (22行)    - テーマ管理                    │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   ┌──────────┐        ┌──────────┐
   │ GitHub   │        │  Local   │
   │   API    │        │  Device  │
   └──────────┘        └──────────┘

総行数: 約2,178行（コメント・空行含む）
```

---

## 技術スタック

### フレームワーク & ライブラリ

| 技術           | バージョン | 役割                         |
| -------------- | ---------- | ---------------------------- |
| **Svelte**     | 4.2.19     | リアクティブUIフレームワーク |
| **TypeScript** | 5.7.2      | 型安全性の提供               |
| **Vite**       | 5.4.10     | ビルドツール & 開発サーバー  |
| **CodeMirror** | 6.0.1      | 高機能エディタ               |

### CodeMirrorエコシステム

```typescript
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { basicSetup } from 'codemirror'
```

- **state**: エディタの状態管理
- **view**: レンダリングとUI
- **commands**: 基本的な編集コマンド（Undo/Redo等）
- **lang-markdown**: Markdown構文ハイライト
- **basicSetup**: 行番号、フォールド等の基本機能

### 開発ツール

- **Prettier** (3.3.3): コード整形
- **prettier-plugin-svelte**: Svelteファイル対応
- **svelte-check** (3.8.6): 型チェック
- **Husky** (9.1.6): Gitフック管理

---

## プロジェクト構造

```
simplest-note-md/
├── .github/
│   └── workflows/
│       └── ci.yml                 # CI/CD (Build + Deploy via GitHub Actions)
├── .husky/
│   └── pre-commit                 # npm run lintを実行
├── src/
│   ├── components/
│   │   ├── editor/
│   │   │   └── MarkdownEditor.svelte  # CodeMirrorエディタコンポーネント (137行)
│   │   ├── layout/
│   │   │   ├── Breadcrumbs.svelte     # パンくずリスト (156行)
│   │   │   ├── Header.svelte          # ヘッダー (75行)
│   │   │   └── Modal.svelte           # モーダルダイアログ (84行)
│   │   └── views/
│   │       ├── EditorView.svelte      # エディタ画面 (154行)
│   │       ├── FolderView.svelte      # フォルダ画面 (209行)
│   │       ├── HomeView.svelte        # ホーム画面 (134行)
│   │       └── SettingsView.svelte    # 設定画面 (322行)
│   ├── lib/
│   │   ├── github.ts              # GitHub API統合 (132行)
│   │   ├── storage.ts             # LocalStorage操作 (104行)
│   │   ├── stores.ts              # Svelte Store状態管理 (54行)
│   │   ├── theme.ts               # テーマ管理 (22行)
│   │   └── types.ts               # TypeScript型定義 (52行)
│   ├── app.css                    # グローバルスタイル + テーマ定義
│   ├── app.d.ts                   # TypeScript型宣言
│   ├── App.svelte                 # ルートコンポーネント (533行)
│   └── main.ts                    # エントリーポイント (8行)
├── dist/                          # ビルド出力（.gitignore）
├── node_modules/
├── .gitignore
├── .prettierrc                    # Prettier設定
├── .prettierignore
├── index.html                     # HTMLエントリーポイント
├── package.json                   # プロジェクトメタデータ
├── README.md                      # ユーザー向けドキュメント
├── CLAUDE.md                      # このファイル（開発者向け）
├── svelte.config.js               # Svelte設定
├── tsconfig.json                  # TypeScript設定
├── tsconfig.node.json             # Node用TypeScript設定
└── vite.config.ts                 # Vite設定
```

### 重要ファイルの役割

#### `src/App.svelte` (533行)

アプリケーションのルートコンポーネント。ビュー切り替えとイベントハンドリングを担当。

**主な責務:**

- ビューのルーティング（home/folder/edit/settings）
- CRUD操作（フォルダ・ノート作成/削除/更新）
- ドラッグ&ドロップ処理
- GitHub同期の呼び出し
- モーダル管理

#### コンポーネント層

**レイアウトコンポーネント:**

- `Header.svelte`: アプリタイトルと設定アイコン
- `Breadcrumbs.svelte`: パンくずナビゲーション（インライン編集機能付き）
- `Modal.svelte`: 確認ダイアログとアラート

**ビューコンポーネント:**

- `HomeView.svelte`: ルートフォルダ一覧表示
- `FolderView.svelte`: フォルダ内のサブフォルダとノート一覧
- `EditorView.svelte`: ノート編集画面（ツールバー含む）
- `SettingsView.svelte`: GitHub設定とテーマ設定

**エディタコンポーネント:**

- `MarkdownEditor.svelte`: CodeMirrorラッパー

#### ビジネスロジック層（lib/）

- `stores.ts`: Svelteストアによる状態管理
- `types.ts`: TypeScript型定義
- `storage.ts`: LocalStorageへの読み書き
- `github.ts`: GitHub API統合（ファイル保存、SHA取得）
- `theme.ts`: テーマ適用ロジック

#### `src/main.ts`

Svelteアプリケーションのエントリーポイント。

```typescript
import './app.css'
import App from './App.svelte'

const app = new App({
  target: document.getElementById('app')!,
})

export default app
```

#### `src/app.css`

CSS変数を使用したテーマシステムの実装。

```css
:root {
  /* lightテーマのデフォルト値 */
}
:root[data-theme='dark'] {
  /* darkテーマのオーバーライド */
}
:root[data-theme='blackboard'] {
  /* ... */
}
:root[data-theme='kawaii'] {
  /* ... */
}
:root[data-theme='custom'] {
  /* ユーザー定義の変数 */
}
```

#### `vite.config.ts`

GitHub Pages用の設定を含む。

```typescript
export default defineConfig({
  plugins: [svelte()],
  base: '/simplest-note-md/', // GitHub Pagesのサブパス
})
```

---

## コードアーキテクチャ

### レイヤー構造

アプリケーションは以下の3層構造に分離されています：

#### 1. プレゼンテーション層（Components）

**責務**: UIの表示とユーザーインタラクション

**レイアウトコンポーネント:**

- `Header.svelte`: アプリケーションヘッダー
- `Breadcrumbs.svelte`: ナビゲーション用パンくずリスト
- `Modal.svelte`: 確認ダイアログとアラート

**ビューコンポーネント:**

```svelte
<!-- App.svelte -->
{#if $currentView === 'home'}
  <HomeView ... />
{:else if $currentView === 'folder'}
  <FolderView ... />
{:else if $currentView === 'edit'}
  <EditorView ... />
{:else if $currentView === 'settings'}
  <SettingsView ... />
{/if}
```

各ビューは独立したコンポーネントとして実装され、propsを通じてデータとイベントハンドラを受け取ります。

#### 2. ビジネスロジック層（App.svelte + lib/）

**App.svelteの主要関数:**

| カテゴリ           | 主要関数                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **フォルダ管理**   | `createFolder()`, `deleteFolder()`, `updateFolderName()`, `selectFolder()`                   |
| **ノート管理**     | `createNewNote()`, `selectNote()`, `deleteNote()`, `updateNoteTitle()`                       |
| **並び替え**       | `handleDragStartFolder()`, `handleDropFolder()`, `handleDragStartNote()`, `handleDropNote()` |
| **ナビゲーション** | `getBreadcrumbs()`, `goHome()`, `goSettings()`                                               |
| **モーダル**       | `showConfirm()`, `showAlert()`, `closeModal()`                                               |
| **ヘルパー**       | `getItemCount()`, `getFolderItems()`                                                         |

**lib/モジュール:**

- `github.ts`: GitHub API統合（`saveToGitHub()`, `fetchCurrentSha()`等）
- `theme.ts`: テーマ適用ロジック（`applyTheme()`）

#### 3. 状態管理層（lib/stores.ts）

**責務**: アプリケーション全体の状態管理

```typescript
// Writable stores
export const settings = writable<Settings>(defaultSettings)
export const folders = writable<Folder[]>([])
export const notes = writable<Note[]>([])
export const currentView = writable<View>('home')
export const currentFolder = writable<Folder | null>(null)
export const currentNote = writable<Note | null>(null)

// Derived stores
export const rootFolders = derived(folders, ($folders) =>
  $folders.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
)
```

#### 4. データ永続化層（lib/storage.ts）

**責務**: LocalStorageへの読み書き

```typescript
export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function loadSettings(): Settings {
  const stored = localStorage.getItem(SETTINGS_KEY)
  return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings
}
```

### Svelteリアクティブシステム

#### Svelteストア

アプリケーション全体で共有される状態は、Svelteストアで管理されています。

**Writable Stores（書き込み可能）:**

```typescript
// lib/stores.ts
export const settings = writable<Settings>(defaultSettings)
export const folders = writable<Folder[]>([])
export const notes = writable<Note[]>([])
export const currentView = writable<View>('home')
export const currentFolder = writable<Folder | null>(null)
export const currentNote = writable<Note | null>(null)
```

**Derived Stores（派生ストア）:**

計算プロパティとして機能し、依存するストアが変更されると自動で再計算されます。

```typescript
// ルートフォルダ（parentIdがnullのもの）
export const rootFolders = derived(folders, ($folders) =>
  $folders.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
)

// 現在のフォルダのサブフォルダ
export const subfolders = derived([folders, currentFolder], ([$folders, $currentFolder]) =>
  $currentFolder
    ? $folders.filter((f) => f.parentId === $currentFolder.id).sort((a, b) => a.order - b.order)
    : []
)

// 現在のフォルダ内のノート
export const currentFolderNotes = derived([notes, currentFolder], ([$notes, $currentFolder]) =>
  $currentFolder
    ? $notes.filter((n) => n.folderId === $currentFolder.id).sort((a, b) => a.order - b.order)
    : []
)

// GitHub設定の完了状態
export const githubConfigured = derived(
  settings,
  ($settings) => !!($settings.token && $settings.repoName)
)
```

**ストアの使用:**

```svelte
<script>
  import { settings, folders } from './lib/stores'

  // ストアの値を読み取る（自動購読）
  console.log($settings.theme)

  // ストアの値を更新
  settings.update((s) => ({ ...s, theme: 'dark' }))
  folders.set([...newFolders])
</script>
```

**メリット:**

- グローバル状態の一元管理
- コンポーネント間でのデータ共有が容易
- 自動的な依存関係追跡と最適化
- テスタビリティの向上

---

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

---

## 主要機能の実装

### エディタ管理

#### 初期化

```typescript
function initializeEditor() {
  if (!editorContainer) return

  const extensions = [
    basicSetup,
    markdown(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    history(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && currentNote) {
        updateNoteContent(currentNote.id, update.state.doc.toString())
      }
    }),
  ]

  // テーマがdarkの場合はダークテーマを追加
  if (settings.theme === 'dark') {
    extensions.push(editorDarkTheme)
  }

  const startState = EditorState.create({
    doc: currentNote?.content || '',
    extensions,
  })

  editorView = new EditorView({
    state: startState,
    parent: editorContainer,
  })
}
```

#### コンテンツリセット

ノート切り替え時にエディタ内容を更新。

```typescript
function resetEditorContent(content: string) {
  if (!editorView) return

  const newState = EditorState.create({
    doc: content,
    extensions: editorView.state.extensions,
  })

  editorView.setState(newState)
}
```

#### 自動保存

エディタの変更を検知して自動保存。

```typescript
EditorView.updateListener.of((update) => {
  if (update.docChanged && currentNote) {
    updateNoteContent(currentNote.id, update.state.doc.toString())
  }
})
```

### パンくずナビゲーション

現在位置を階層的に表示。

```typescript
function getBreadcrumbs() {
  const crumbs: Array<{
    label: string
    action: () => void
    id: string
    type: 'home' | 'folder' | 'note' | 'settings'
  }> = []

  // 常にホームを追加
  crumbs.push({
    label: 'SimplestNote.md',
    action: goHome,
    id: 'home',
    type: 'home',
  })

  // 設定画面の場合
  if (currentView === 'settings') {
    crumbs.push({
      label: '設定',
      action: goSettings,
      id: 'settings',
      type: 'settings',
    })
    return crumbs
  }

  // フォルダ階層を追加
  if (currentFolder) {
    const parentFolder = folders.find((f) => f.id === currentFolder.parentId)
    if (parentFolder) {
      crumbs.push({
        label: parentFolder.name,
        action: () => selectFolder(parentFolder),
        id: parentFolder.id,
        type: 'folder',
      })
    }
    crumbs.push({
      label: currentFolder.name,
      action: () => selectFolder(currentFolder),
      id: currentFolder.id,
      type: 'folder',
    })
  }

  // ノート編集中の場合
  if (currentNote) {
    crumbs.push({
      label: currentNote.title,
      action: () => {},
      id: currentNote.id,
      type: 'note',
    })
  }

  return crumbs
}
```

#### インライン編集

パンくずリストから直接名前を変更可能。

```svelte
{#each breadcrumbs as crumb}
  <span>
    {#if editingBreadcrumb === crumb.id}
      {#if crumb.type === 'note'}
        <input bind:this={titleInput} value={crumb.label} ... />
      {:else if crumb.type === 'folder'}
        <input bind:this={folderNameInput} value={crumb.label} ... />
      {/if}
    {:else}
      <button on:click={crumb.action}>{crumb.label}</button>
      <button on:click={() => startEditingBreadcrumb(crumb)}>✏️</button>
    {/if}
  </span>
{/each}
```

### モーダルシステム

確認ダイアログとアラートダイアログを統一的に管理。

```typescript
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

function confirmModal() {
  if (modalCallback) {
    modalCallback()
  }
  closeModal()
}
```

**使用例:**

```typescript
// 削除確認
showConfirm('このノートを削除しますか？', () => {
  notes = notes.filter((n) => n.id !== currentNote!.id)
  persistNotes()
  goToParentFolder()
})

// エラー通知
showAlert('GitHub同期に失敗しました。')
```

---

## GitHub API統合

### 認証

Personal Access Tokenによるベーシック認証。

```typescript
const headers = {
  Authorization: `Bearer ${settings.token}`,
  'Content-Type': 'application/json',
}
```

### ファイルパスの構築

フォルダ階層に基づいてGitHub上のパスを生成。

```typescript
function buildPath(note: Note): string {
  const folder = folders.find((f) => f.id === note.folderId)
  if (!folder) return `notes/${note.title}.md`

  const folderPath = getFolderPath(folder)
  return `notes/${folderPath}/${note.title}.md`
}

function getFolderPath(folder: Folder): string {
  const parentFolder = folder.parentId ? folders.find((f) => f.id === folder.parentId) : null

  if (parentFolder) {
    return `${parentFolder.name}/${folder.name}`
  }
  return folder.name
}
```

**例:**

- ルートフォルダ「仕事」→ `notes/仕事/メモ.md`
- サブフォルダ「仕事/会議」→ `notes/仕事/会議/議事録.md`

### 既存ファイルのSHA取得

GitHub APIでファイルを更新する際、既存ファイルのSHAが必要。

```typescript
async function fetchCurrentSha(path: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${settings.repoName}/contents/${path}`

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${settings.token}`,
      },
    })

    if (response.ok) {
      const data = await response.json()
      return data.sha
    }
    return null // ファイルが存在しない
  } catch (error) {
    console.error('SHA fetch error:', error)
    return null
  }
}
```

### ファイルの保存

Base64エンコードしてPUTリクエスト。

```typescript
async function saveToGitHub() {
  if (!currentNote) return
  if (!settings.token || !settings.repoName) {
    showAlert('GitHub設定が不完全です。')
    return
  }

  const path = buildPath(currentNote)
  const encodedContent = encodeContent(currentNote.content)
  const sha = await fetchCurrentSha(path)

  const body: any = {
    message: 'auto-sync',
    content: encodedContent,
    committer: {
      name: settings.username || 'SimplestNote User',
      email: settings.email || 'user@example.com',
    },
  }

  if (sha) {
    body.sha = sha // 更新の場合はSHAを含める
  }

  const url = `https://api.github.com/repos/${settings.repoName}/contents/${path}`

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      syncMessage = '✅ GitHubに保存しました'
      syncError = ''
      setTimeout(() => {
        syncMessage = ''
      }, 3000)
    } else {
      const error = await response.json()
      syncError = `❌ 同期エラー: ${error.message}`
      syncMessage = ''
    }
  } catch (error) {
    syncError = `❌ ネットワークエラー`
    syncMessage = ''
  }
}
```

### Base64エンコーディング

日本語を含むテキストを正しくエンコード。

```typescript
function encodeContent(content: string): string {
  // UTF-8 → Base64
  return btoa(unescape(encodeURIComponent(content)))
}
```

**解説:**

1. `encodeURIComponent(content)`: UTF-8バイト列をパーセントエンコード
2. `unescape()`: パーセントエンコードをバイト列に戻す
3. `btoa()`: バイナリをBase64に変換

---

## テーマシステム

### CSS変数ベースのテーマ

`:root`要素の`data-theme`属性で切り替え。

```css
/* app.css */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f3f4f6;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --accent-color: #0f766e;
  --border-color: #d1d5db;
}

:root[data-theme='dark'] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --text-primary: #e5e7eb;
  --text-secondary: #9ca3af;
  --accent-color: #1f4d48;
  --border-color: #374151;
}
```

### テーマの適用

```typescript
function applyTheme(theme: 'light' | 'dark' | 'blackboard' | 'kawaii' | 'custom') {
  if (theme === 'light') {
    document.documentElement.removeAttribute('data-theme')
  } else if (theme === 'custom') {
    document.documentElement.setAttribute('data-theme', 'custom')
    document.documentElement.style.setProperty('--bg-primary', settings.customBgPrimary)
    document.documentElement.style.setProperty('--accent-color', settings.customAccentColor)
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }

  // エディタをテーマに合わせて再初期化
  if (editorView && currentView === 'edit') {
    editorView.destroy()
    initializeEditor()
    if (currentNote) {
      resetEditorContent(currentNote.content)
    }
  }
}
```

### エディタテーマ

CodeMirrorのカスタムテーマ定義。

```typescript
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
```

---

## データ永続化スキーマ

### LocalStorage

**用途:** 設定情報の保存のみ

**キー定義:**

```typescript
const SETTINGS_KEY = 'simplest-md-note/settings'
```

**データ構造:**

#### `simplest-md-note/settings`

```json
{
  "token": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "username": "yamada",
  "email": "yamada@example.com",
  "repoName": "yamada/my-notes",
  "theme": "yomi",
  "toolName": "SimplestNote.md",
  "customBgPrimary": "#ffffff",
  "customAccentColor": "#0f766e"
}
```

**保存タイミング:**

- 設定画面での入力時に即座に反映

### IndexedDB

**用途:** ノートとリーフのデータ保存

**データベース名:** `simplest-note-md`

**オブジェクトストア:**

- `notes`: ノートデータ
- `leaves`: リーフデータ

**データ構造:**

#### `notes` オブジェクトストア

```typescript
interface Note {
  id: string // UUID (主キー)
  name: string // ノート名
  parentId?: string // 親ノートのID（ルートノートの場合はundefined）
  order: number // 並び順
}
```

**例:**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "仕事",
    "order": 0
  },
  {
    "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "name": "プロジェクトA",
    "parentId": "550e8400-e29b-41d4-a716-446655440000",
    "order": 0
  }
]
```

#### `leaves` オブジェクトストア

```typescript
interface Leaf {
  id: string // UUID (主キー)
  title: string // リーフタイトル
  noteId: string // 所属ノートのID
  content: string // Markdownコンテンツ
  updatedAt: number // 最終更新タイムスタンプ（Unix time）
  order: number // 並び順
}
```

**例:**

```json
[
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "title": "会議メモ",
    "noteId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "content": "# 会議メモ\n\n## 議題\n- ...",
    "updatedAt": 1703000000000,
    "order": 0
  }
]
```

**保存タイミング:**

- ノート/リーフの作成・削除・編集時に即座に反映
- ドラッグ&ドロップによる並び替え時

### GitHub（リモートリポジトリ）

**保存対象:**

- 全ノート
- 全リーフのMarkdownファイル

**ファイルパス構造:**

```
notes/
  ├── ノート名1/
  │   ├── サブノート名/
  │   │   └── リーフタイトル.md
  │   └── リーフタイトル.md
  └── ノート名2/
      └── リーフタイトル.md
```

**例:**

```
notes/
  ├── 仕事/
  │   ├── プロジェクトA/
  │   │   └── 会議メモ.md
  │   └── TODO.md
  └── プライベート/
      └── 買い物リスト.md
```

**同期タイミング:**

- **Push:** 保存ボタン、設定ボタン押下時
- **Pull:** 初回起動時、Pullテストボタン、設定画面を閉じたとき

**重要:** 設定情報（LocalStorage）はGitHubには同期されません。

---

## 実装されたリファクタリング

元々App.svelteは1,373行の単一ファイルでしたが、保守性と拡張性を向上させるため、以下のリファクタリングを実施しました。

### 1. コンポーネント分割（実装済み）

#### 現在の構造

```
src/
├── components/
│   ├── layout/
│   │   ├── Header.svelte              # ヘッダー（75行）
│   │   ├── Breadcrumbs.svelte         # パンくずリスト（156行）
│   │   └── Modal.svelte               # 確認ダイアログ（84行）
│   ├── views/
│   │   ├── HomeView.svelte            # ホーム画面（134行）
│   │   ├── FolderView.svelte          # フォルダ画面（209行）
│   │   ├── EditorView.svelte          # エディタ画面（154行）
│   │   └── SettingsView.svelte        # 設定画面（322行）
│   └── editor/
│       └── MarkdownEditor.svelte      # CodeMirrorラッパー（137行）
├── lib/
│   ├── stores.ts                      # Svelteストア（54行）
│   ├── github.ts                      # GitHub API（132行）
│   ├── storage.ts                     # LocalStorage（104行）
│   ├── theme.ts                       # テーマ管理（22行）
│   └── types.ts                       # 型定義（52行）
├── app.css
├── app.d.ts
├── App.svelte                         # ルーター & レイアウト（533行）
└── main.ts
```

**成果:**

- 1,373行の単一ファイルから約2,178行の15ファイルに分割
- 各コンポーネントは単一責任の原則に従い、保守性が向上
- ビューコンポーネントは100-300行程度で適切な粒度

### 2. 状態管理の改善（実装済み）

#### Svelteストアの導入

```typescript
// src/lib/stores.ts
import { writable, derived } from 'svelte/store'
import type { Settings, Folder, Note, View } from './types'

// 基本ストア
export const settings = writable<Settings>(defaultSettings)
export const folders = writable<Folder[]>([])
export const notes = writable<Note[]>([])
export const currentView = writable<View>('home')
export const currentFolder = writable<Folder | null>(null)
export const currentNote = writable<Note | null>(null)

// 派生ストア
export const rootFolders = derived(folders, ($folders) =>
  $folders.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
)

export const subfolders = derived([folders, currentFolder], ([$folders, $currentFolder]) =>
  $currentFolder
    ? $folders.filter((f) => f.parentId === $currentFolder.id).sort((a, b) => a.order - b.order)
    : []
)

export const currentFolderNotes = derived([notes, currentFolder], ([$notes, $currentFolder]) =>
  $currentFolder
    ? $notes.filter((n) => n.folderId === $currentFolder.id).sort((a, b) => a.order - b.order)
    : []
)
```

**成果:**

- グローバル状態の一元管理を実現
- コンポーネント間でのデータ共有が容易に
- 派生ストアにより計算ロジックを集約
- テスタビリティが向上

### 3. ビジネスロジックの分離（実装済み）

```typescript
// src/lib/github.ts
export async function saveToGitHub(
  note: Note,
  folders: Folder[],
  settings: Settings
): Promise<{ success: boolean; message: string }> {
  // GitHub API呼び出しロジック
}

export async function fetchCurrentSha(path: string, settings: Settings): Promise<string | null> {
  // SHA取得ロジック
}

// src/lib/storage.ts
export function loadSettings(): Settings {
  const stored = localStorage.getItem(SETTINGS_KEY)
  return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
```

### 4. TypeScript型定義の強化

```typescript
// src/lib/types.ts
export type UUID = string

export interface Settings {
  token: string
  username: string
  email: string
  repoName: string
  theme: ThemeType
  customBgPrimary: string
  customAccentColor: string
}

export type ThemeType = 'light' | 'dark' | 'blackboard' | 'kawaii' | 'custom'

export interface Folder {
  id: UUID
  name: string
  parentId?: UUID
  order: number
}

export interface Note {
  id: UUID
  title: string
  folderId: UUID
  content: string
  updatedAt: number
  order: number
}

export type View = 'home' | 'settings' | 'edit' | 'folder'

export interface Breadcrumb {
  label: string
  action: () => void
  id: UUID
  type: 'home' | 'folder' | 'note' | 'settings'
}
```

### 5. テストの導入

```typescript
// src/lib/__tests__/storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadSettings, saveSettings } from '../storage'

describe('LocalStorage operations', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should load default settings when none exist', () => {
    const settings = loadSettings()
    expect(settings.theme).toBe('light')
  })

  it('should persist and load settings', () => {
    const testSettings = { ...defaultSettings, theme: 'dark' }
    saveSettings(testSettings)
    const loaded = loadSettings()
    expect(loaded.theme).toBe('dark')
  })
})
```

**必要な依存関係:**

```bash
npm install -D vitest @vitest/ui @testing-library/svelte
```

### 6. ルーティングの導入

現在は`currentView`変数で画面切り替えを行っていますが、URLベースのルーティングを導入することで：

- ブラウザの戻る/進むボタン対応
- ディープリンク対応
- ブックマーク可能

```bash
npm install svelte-spa-router
```

```typescript
// src/App.svelte
import Router from 'svelte-spa-router'
import HomeView from './components/views/HomeView.svelte'
import FolderView from './components/views/FolderView.svelte'
import EditorView from './components/views/EditorView.svelte'
import SettingsView from './components/views/SettingsView.svelte'

const routes = {
  '/': HomeView,
  '/folder/:id': FolderView,
  '/note/:id': EditorView,
  '/settings': SettingsView,
}
```

---

## 拡張の可能性

### 短期的な改善提案

1. **エクスポート/インポート機能**
   - JSONでのバックアップ/復元
   - 複数ノートの一括ダウンロード（ZIP形式）

2. **検索機能**
   - ノート名での検索
   - 全文検索（content内）
   - 正規表現対応

3. **Markdownプレビュー**
   - エディタとプレビューの2ペイン表示
   - `marked`や`markdown-it`を使用

4. **キーボードショートカット**
   - `Ctrl+S`: GitHub保存
   - `Ctrl+N`: 新規ノート
   - `Ctrl+K`: クイック検索

5. **オフライン対応**
   - Service Workerでのキャッシュ
   - オフライン時の同期キュー

### 中期的な機能提案

1. **GitHub双方向同期**
   - GitHub→アプリの自動取得
   - 競合解決UI
   - 差分表示

2. **Markdown拡張**
   - タスクリスト（`- [ ]` / `- [x]`）
   - 数式サポート（KaTeX）
   - Mermaid図表対応

3. **タグシステム**
   - ノートへのタグ付け
   - タグでのフィルタリング
   - タグクラウド表示

4. **履歴管理**
   - ノート編集履歴の保存
   - 差分表示
   - 過去バージョンへの復元

5. **モバイル最適化**
   - スワイプジェスチャー
   - タッチ操作の改善
   - PWA対応

### 長期的なビジョン

1. **プラグインシステム**
   - カスタムコマンドの登録
   - エディタ拡張
   - テーマのプラグイン化

2. **他サービスとの連携**
   - GitLab API対応
   - Dropbox/OneDrive同期
   - WebDAV対応

3. **コラボレーション**
   - 共有リンク生成
   - リアルタイム共同編集（WebSocket）
   - コメント機能

4. **AI統合**
   - 文章校正
   - 自動要約
   - ノートの分類提案

---

## 既知の課題

### メタデータの永続化問題

**現状の問題:**

現在の実装では、GitHubには**リーフのMarkdownファイルのみ**が保存されており、以下のメタデータが失われます：

1. **ノート・リーフのID**
   - Pull時に新しいUUIDが割り当てられる
   - URLのクエリパラメータ（`?note=xxx&leaf=yyy`）が無効になる
   - ブックマークやディープリンクが機能しない

2. **並び順（order）**
   - ユーザーがドラッグ&ドロップで並び替えても、Pull後に順序が失われる
   - ファイルシステムのアルファベット順で表示されてしまう

3. **ノート・リーフの親子関係**
   - ディレクトリ構造から推測するため、ノート名変更時に対応が難しい

**影響範囲:**

- ✅ **影響しない操作:** 編集、新規作成、削除、Push（正常動作）
- ❌ **影響する操作:** Pull後の並び順、URLからの復元、ノート名変更

**仕様との整合性:**

CLAUDE.mdの仕様では「全ノート・全リーフをPush」と記載されているが、実際にはMarkdownファイルのみがPushされている。メタデータ（ID、order、親子関係）はGitHubに保存されていない。

**解決策の方向性（未実装）:**

1. **メタデータファイルの追加**
   - `notes/_metadata.json` にノート・リーフのメタ情報を保存
   - ID、親子関係、並び順を永続化
   - Pull時にメタデータから復元

2. **ファイル名にメタデータを埋め込む**
   - `001_リーフ名_uuid.md` のような命名規則
   - ファイル名から順序とIDを復元

**注意:**

この課題は**設計上の制約**であり、「GitHubが唯一の真実」という設計思想の下で、どこまでのメタデータをGitHubに保存するかという問題です。現在の実装は「Markdownファイルのみを真実とする」という割り切りで動作しています。

### その他の既知の制約

1. **複数デバイスでの同時編集**
   - Last Write Winsの仕様（最後にPushしたデバイスが勝つ）
   - マージ機能なし

2. **Push失敗後のPullでデータ消失**
   - 仕様通りの動作だが、ユーザーにとって直感的でない可能性

3. **ネットワークエラー時の挙動**
   - Push失敗時、編集内容はIndexedDBに残るが、次のPullで消える
   - オフライン対応なし

---

## 開発ワークフロー

### ローカル開発

```bash
# 開発サーバー起動
npm run dev

# 別ターミナルで型チェック（ウォッチモード）
npm run check -- --watch
```

### コード品質チェック

```bash
# フォーマットチェック
npm run format:check

# 型チェック
npm run check

# 両方実行
npm run lint
```

### ビルド

```bash
# 本番ビルド
npm run build

# ビルド結果を確認
npm run preview
```

### デプロイ

`main`ブランチへのプッシュで自動デプロイ（GitHub Actions）。

```bash
git add .
git commit -m "feat: add search functionality"
git push origin main
```

### デバッグ

#### LocalStorageの確認

```javascript
// ブラウザコンソールで実行
console.log('Settings:', localStorage.getItem('simplest-md-note/settings'))
console.log('Folders:', localStorage.getItem('simplest-md-note/folders'))
console.log('Notes:', localStorage.getItem('simplest-md-note/notes'))
```

#### LocalStorageのリセット

```javascript
localStorage.removeItem('simplest-md-note/settings')
localStorage.removeItem('simplest-md-note/folders')
localStorage.removeItem('simplest-md-note/notes')
location.reload()
```

---

## パフォーマンス最適化

### 現在の考慮事項

1. **リアクティブ宣言の最適化**
   - Svelteが自動的に依存関係を追跡
   - 不要な再計算を防ぐ

2. **イミュータブル更新**

   ```typescript
   // ❌ ミュータブル（Svelteが変更を検知しない）
   folders.push(newFolder)

   // ✅ イミュータブル（検知される）
   folders = [...folders, newFolder]
   ```

3. **LocalStorageの書き込み最小化**
   - 変更時のみ`persist*()`を呼び出し
   - デバウンスは不要（変更頻度が低い）

### 将来的な最適化

1. **仮想スクロール**
   - ノートが1000件以上になった場合
   - `svelte-virtual`等のライブラリ使用

2. **遅延ロード**
   - ビューコンポーネントの動的インポート
   - CodeMirrorの遅延初期化

3. **Web Workers**
   - 全文検索処理をバックグラウンド化
   - Markdown→HTML変換の並列処理

---

## セキュリティ考慮事項

### 現在の実装

1. **トークン保存**
   - LocalStorageにクリアテキストで保存
   - ⚠️ XSS攻撃に対して脆弱
   - 推奨: 信頼できる端末でのみ使用

2. **HTTPS通信**
   - GitHub APIへの通信は暗号化
   - トークンはHTTPSヘッダーで送信

3. **CORS**
   - GitHub APIがCORSを許可しているため直接呼び出し可能

### 改善提案

1. **トークンの暗号化**

   ```typescript
   import { AES, enc } from 'crypto-js'

   function encryptToken(token: string, passphrase: string): string {
     return AES.encrypt(token, passphrase).toString()
   }

   function decryptToken(encrypted: string, passphrase: string): string {
     return AES.decrypt(encrypted, passphrase).toString(enc.Utf8)
   }
   ```

2. **トークンの有効期限管理**
   - 設定にexpiration dateを保存
   - 期限切れ時にアラート表示

3. **Content Security Policy**
   ```html
   <!-- index.html -->
   <meta
     http-equiv="Content-Security-Policy"
     content="default-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com;"
   />
   ```

---

## トラブルシューティング

### よくある問題

#### 1. GitHub同期エラー

**症状**: 「同期エラー」メッセージが表示される

**原因と対策**:

- トークンの権限不足 → `repo`スコープを確認
- トークンの有効期限切れ → 新しいトークンを生成
- リポジトリ名の誤り → `owner/repo`形式を確認
- ネットワークエラー → インターネット接続を確認

#### 2. エディタが表示されない

**症状**: ノートを開いても編集画面が空白

**原因と対策**:

- `editorContainer`がnull → DOMのマウント順序を確認
- CodeMirrorの初期化失敗 → コンソールエラーを確認

#### 3. データが消えた

**症状**: 保存したノートやフォルダが表示されない

**原因と対策**:

- ブラウザのキャッシュクリア → GitHubから復元（将来実装予定）
- 別のブラウザ/プロファイル → LocalStorageはブラウザ固有
- シークレットモード → 通常モードでアクセス

---

## まとめ

SimplestNote.mdは、シンプルさを追求した軽量Markdownノートアプリです。単一ファイルアーキテクチャにより、小規模プロジェクトとして理解しやすく、カスタマイズも容易です。

### 主要な技術的特徴

- **Svelteのリアクティブシステム**: 宣言的な状態管理
- **LocalStorage永続化**: サーバーレスでのデータ保存
- **GitHub API直接統合**: 外部サービス不要の同期
- **CodeMirror 6**: モダンで拡張性の高いエディタ
- **CSS変数テーマ**: 柔軟なスタイリングシステム

### 今後の方向性

実装されたリファクタリングにより、以下が実現可能になりました：

1. **保守性の向上**: ✅ コンポーネント分割、ストア導入（実装済み）
2. **テスタビリティ**: ユニットテスト、E2Eテストの追加（今後の課題）
3. **拡張性**: プラグインシステム、ルーティング（検討中）
4. **機能追加**: 検索、双方向同期、履歴管理（今後の機能）

このドキュメントが、SimplestNote.mdの理解と今後の開発に役立つことを願っています。

---

**Document Version**: 2.0
**Last Updated**: 2025-01-20
**Author**: Claude (Anthropic)
**Major Changes**: リファクタリング実装を反映（コンポーネント分割、Svelteストア導入）
