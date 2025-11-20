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
11. [リファクタリングの考察](#リファクタリングの考察)
12. [拡張の可能性](#拡張の可能性)

---

## アーキテクチャ概要

SimplestNote.mdは、**シングルファイルコンポーネントアーキテクチャ**を採用した軽量Markdownノートアプリケーションです。

### 設計哲学

- **シンプリシティ**: 必要最小限の依存関係とコード量
- **ブラウザファースト**: サーバーレス、完全クライアントサイド
- **直接統合**: GitHub APIを直接呼び出し、中間サービス不要
- **即時性**: LocalStorageによる自動保存、設定変更の即座反映

### アーキテクチャパターン

```
┌─────────────────────────────────────────┐
│           App.svelte (1,373 lines)      │
│  ┌───────────────────────────────────┐  │
│  │    UI Layer (Template/Markup)    │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  Business Logic Layer (Script)   │  │
│  │  - State Management              │  │
│  │  - CRUD Operations               │  │
│  │  - GitHub Integration            │  │
│  │  - Theme Management              │  │
│  │  - Editor Management             │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │   Data Layer (LocalStorage)      │  │
│  │  - Settings                      │  │
│  │  - Folders                       │  │
│  │  - Notes                         │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   ┌──────────┐        ┌──────────┐
   │ GitHub   │        │  Local   │
   │   API    │        │  Device  │
   └──────────┘        └──────────┘
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
│       └── ci.yml                 # CI/CD (Build + Deploy to Pages)
├── .husky/
│   └── pre-commit                 # npm run lintを実行
├── src/
│   ├── app.css                    # グローバルスタイル + テーマ定義
│   ├── app.d.ts                   # TypeScript型宣言
│   ├── App.svelte                 # メインアプリケーションコンポーネント
│   └── main.ts                    # エントリーポイント
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

#### `src/App.svelte` (1,373行)

アプリケーションの全ロジックを含むメインコンポーネント。

**構成:**

- **Lines 1-38**: インポートとCodeMirrorテーマ定義
- **Lines 40-70**: 型定義 (Settings, Folder, Note, View)
- **Lines 72-109**: 状態変数とLocalStorageキー
- **Lines 111-136**: モーダル関数
- **Lines 138-189**: onMountライフサイクル（初期化処理）
- **Lines 191-837**: ビジネスロジック関数群
- **Lines 840-1372**: UIテンプレート（条件付きレンダリング）

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

App.svelteは論理的に以下のレイヤーに分離されています：

#### 1. UIレイヤー（Template Layer）

**責務**: ビューの条件付きレンダリング

```svelte
{#if currentView === 'home'}
  <!-- ホーム画面: ルートフォルダ一覧 -->
{:else if currentView === 'folder'}
  <!-- フォルダ画面: サブフォルダとノート一覧 -->
{:else if currentView === 'edit'}
  <!-- エディタ画面: CodeMirror + ツールバー -->
{:else if currentView === 'settings'}
  <!-- 設定画面: GitHub連携とテーマ設定 -->
{/if}
```

**コンポーネント:**

- Header（タイトル + 設定アイコン）
- Breadcrumbs（パンくずリスト）
- Modal（確認ダイアログ）
- View-specific UI（各ビュー専用UI）

#### 2. ビジネスロジックレイヤー

**責務**: データの操作、API呼び出し、状態更新

| カテゴリ           | 主要関数                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **フォルダ管理**   | `createFolder()`, `deleteFolder()`, `updateFolderName()`, `selectFolder()`                   |
| **ノート管理**     | `createNewNote()`, `selectNote()`, `deleteNote()`, `updateNoteContent()`, `updateNoteMeta()` |
| **並び替え**       | `handleDragStart()`, `handleDrop()`, `handleNoteDragStart()`, `handleNoteDrop()`             |
| **GitHub統合**     | `saveToGitHub()`, `fetchCurrentSha()`, `encodeContent()`, `buildPath()`                      |
| **エディタ管理**   | `initializeEditor()`, `resetEditorContent()`                                                 |
| **テーマ管理**     | `applyTheme()`                                                                               |
| **ナビゲーション** | `getBreadcrumbs()`, `goHome()`, `goSettings()`                                               |
| **モーダル**       | `showConfirm()`, `showAlert()`, `closeModal()`, `confirmModal()`                             |

#### 3. データ永続化レイヤー

**責務**: LocalStorageへの読み書き

```typescript
function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

function persistFolders() {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
}

function persistNotes() {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
}
```

### Svelteリアクティブシステム

#### リアクティブ宣言 (`$:`)

計算プロパティとして機能し、依存する変数が変更されると自動で再計算されます。

```typescript
// ルートフォルダ（parentIdがnullのもの）
$: rootFolders = folders.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)

// 現在のフォルダのサブフォルダ
$: subfolders = currentFolder
  ? folders.filter((f) => f.parentId === currentFolder.id).sort((a, b) => a.order - b.order)
  : []

// 現在のフォルダ内のノート
$: currentFolderNotes = currentFolder
  ? notes.filter((n) => n.folderId === currentFolder.id).sort((a, b) => a.order - b.order)
  : []

// パンくずリスト
$: breadcrumbs = getBreadcrumbs()

// GitHub設定の完了状態
$: githubConfigured = !!(settings.token && settings.repoName)
```

**メリット:**

- 宣言的でわかりやすい
- 自動的な依存関係追跡
- 無駄な再計算を防ぐ最適化

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

### データフローパターン

```
User Action
    ↓
Event Handler (e.g., createNewNote)
    ↓
State Update (notes = [...notes, newNote])
    ↓
Persist to LocalStorage (persistNotes)
    ↓
Svelte Reactive System ($:)
    ↓
UI Re-render
```

### 状態の初期化フロー

**onMount時の処理:**

```typescript
onMount(() => {
  // 1. 設定の読み込み
  const storedSettings = localStorage.getItem(SETTINGS_KEY)
  if (storedSettings) {
    settings = { ...settings, ...JSON.parse(storedSettings) }
  }
  applyTheme(settings.theme)

  // 2. フォルダの読み込み + 後方互換性処理
  const storedFolders = localStorage.getItem(FOLDERS_KEY)
  if (storedFolders) {
    const parsedFolders = JSON.parse(storedFolders)
    // orderフィールドがない場合は追加
    const updatedFolders = parsedFolders.map((folder, index) => {
      if (folder.order === undefined) {
        return { ...folder, order: index }
      }
      return folder
    })
    folders = updatedFolders
    persistFolders() // 更新があれば保存
  }

  // 3. ノートの読み込み（同様に後方互換性処理）
  const storedNotes = localStorage.getItem(NOTES_KEY)
  // ... 同様の処理

  // 4. エディタの初期化
  initializeEditor()
})
```

### CRUD操作のパターン

#### Create（作成）

```typescript
function createFolder() {
  const newFolder: Folder = {
    id: crypto.randomUUID(),
    name: `フォルダ${rootFolders.length + 1}`,
    parentId: currentFolder?.id,
    order: (currentFolder ? subfolders : rootFolders).length,
  }
  folders = [...folders, newFolder] // イミュータブル更新
  persistFolders()
}
```

#### Read（読み取り）

リアクティブ宣言によって自動的に計算。

```typescript
$: currentFolderNotes = currentFolder
  ? notes.filter((n) => n.folderId === currentFolder.id).sort((a, b) => a.order - b.order)
  : []
```

#### Update（更新）

```typescript
function updateFolderName(folderId: string, newName: string) {
  folders = folders.map((f) => (f.id === folderId ? { ...f, name: newName } : f))
  persistFolders()
  breadcrumbs = getBreadcrumbs() // パンくず更新
}
```

#### Delete（削除）

```typescript
function deleteFolder() {
  if (!currentFolder) return

  // 削除防止チェック
  const hasSubfolders = folders.some((f) => f.parentId === currentFolder.id)
  const hasNotes = notes.some((n) => n.folderId === currentFolder.id)

  if (hasSubfolders || hasNotes) {
    showAlert('サブフォルダやノートが含まれているため削除できません。')
    return
  }

  showConfirm('このフォルダを削除しますか？', () => {
    folders = folders.filter((f) => f.id !== currentFolder!.id)
    persistFolders()

    // 親フォルダまたはホームに戻る
    const parentFolder = folders.find((f) => f.id === currentFolder!.parentId)
    if (parentFolder) {
      selectFolder(parentFolder)
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

## LocalStorageスキーマ

### キー定義

```typescript
const SETTINGS_KEY = 'simplest-md-note/settings'
const NOTES_KEY = 'simplest-md-note/notes'
const FOLDERS_KEY = 'simplest-md-note/folders'
```

### データ構造

#### `simplest-md-note/settings`

```json
{
  "token": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "username": "yamada",
  "email": "yamada@example.com",
  "repoName": "yamada/my-notes",
  "theme": "dark",
  "customBgPrimary": "#ffffff",
  "customAccentColor": "#0f766e"
}
```

#### `simplest-md-note/folders`

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "仕事",
    "order": 0
  },
  {
    "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "name": "会議",
    "parentId": "550e8400-e29b-41d4-a716-446655440000",
    "order": 0
  }
]
```

#### `simplest-md-note/notes`

```json
[
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "title": "議事録",
    "folderId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "content": "# 会議メモ\n\n## 議題\n- ...",
    "updatedAt": 1703000000000,
    "order": 0
  }
]
```

### マイグレーション

`order`フィールドの追加など、後方互換性を保つ処理。

```typescript
onMount(() => {
  const storedFolders = localStorage.getItem(FOLDERS_KEY)
  if (storedFolders) {
    const parsedFolders = JSON.parse(storedFolders)
    let needsUpdate = false
    const updatedFolders = parsedFolders.map((folder, index) => {
      if (folder.order === undefined) {
        needsUpdate = true
        return { ...folder, order: index }
      }
      return folder
    })
    folders = updatedFolders
    if (needsUpdate) {
      persistFolders()
    }
  }
})
```

---

## リファクタリングの考察

現在、App.svelteは1,373行の単一ファイルです。保守性と拡張性を向上させるため、以下のリファクタリングを検討します。

### 1. コンポーネント分割

#### 提案される構造

```
src/
├── components/
│   ├── layout/
│   │   ├── Header.svelte              # ヘッダー（タイトル + 設定アイコン）
│   │   ├── Breadcrumbs.svelte         # パンくずリスト
│   │   └── Modal.svelte               # 確認ダイアログ
│   ├── views/
│   │   ├── HomeView.svelte            # ホーム画面
│   │   ├── FolderView.svelte          # フォルダ画面
│   │   ├── EditorView.svelte          # エディタ画面
│   │   └── SettingsView.svelte        # 設定画面
│   ├── folder/
│   │   ├── FolderCard.svelte          # フォルダカード（ドラッグ対応）
│   │   └── FolderList.svelte          # フォルダ一覧
│   ├── note/
│   │   ├── NoteCard.svelte            # ノートカード（ドラッグ対応）
│   │   └── NoteList.svelte            # ノート一覧
│   └── editor/
│       ├── MarkdownEditor.svelte      # CodeMirrorラッパー
│       └── EditorToolbar.svelte       # Save/Downloadボタン
├── lib/
│   ├── stores.ts                      # Svelteストア（状態管理）
│   ├── github.ts                      # GitHub API関連
│   ├── storage.ts                     # LocalStorage操作
│   ├── theme.ts                       # テーマ管理
│   └── types.ts                       # 型定義
├── app.css
├── app.d.ts
├── App.svelte                         # ルーター & レイアウト
└── main.ts
```

### 2. 状態管理の改善

#### Svelteストアの活用

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

**メリット:**

- グローバル状態の一元管理
- コンポーネント間でのデータ共有が容易
- テスタビリティの向上

### 3. ビジネスロジックの分離

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

リファクタリングにより、以下が実現可能です：

1. **保守性の向上**: コンポーネント分割、ストア導入
2. **テスタビリティ**: ユニットテスト、E2Eテストの追加
3. **拡張性**: プラグインシステム、ルーティング
4. **機能追加**: 検索、双方向同期、履歴管理

このドキュメントが、SimplestNote.mdの理解と今後の開発に役立つことを願っています。

---

**Document Version**: 1.0
**Last Updated**: 2025-11-20
**Author**: Claude (Anthropic)
