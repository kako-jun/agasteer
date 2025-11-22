# アーキテクチャドキュメント

SimplestNote.mdのアーキテクチャ、技術スタック、プロジェクト構造について説明します。

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
├── CLAUDE.md                      # 開発者向けドキュメント（目次）
├── docs/                          # 詳細ドキュメント
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
