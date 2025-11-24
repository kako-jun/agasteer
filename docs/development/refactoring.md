# 実装されたリファクタリング

元々App.svelteは1,373行の単一ファイルでしたが、保守性と拡張性を向上させるため、以下のリファクタリングを実施しました。

## 1. コンポーネント分割（実装済み）

### 現在の構造

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

### 成果

- 1,373行の単一ファイルから約2,178行の15ファイルに分割
- 各コンポーネントは単一責任の原則に従い、保守性が向上
- ビューコンポーネントは100-300行程度で適切な粒度

---

## 2. 状態管理の改善（実装済み）

### Svelteストアの導入

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

### 成果

- グローバル状態の一元管理を実現
- コンポーネント間でのデータ共有が容易に
- 派生ストアにより計算ロジックを集約
- テスタビリティが向上

---

## 3. ビジネスロジックの分離（実装済み）

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

---

## 4. TypeScript型定義の強化

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

---

## 5. テストの導入

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

---

## 6. モジュール分離の完了（実装済み 2025-01-23）

App.svelteをモダンな構成に分割し、保守性を大幅に向上させました。

### 新規追加ファイル

```
src/lib/
├── sync.ts    # Push/Pull処理の分離
│   ├── executePush()  - 全リーフをGitHubにPush
│   └── executePull()  - GitHubから全データをPull
│
├── ui.ts      # UI状態管理の分離
│   ├── pushToastState/pullToastState - トースト状態ストア
│   ├── modalState                    - モーダル状態ストア
│   ├── showPushToast/showPullToast   - トースト表示ヘルパー
│   └── showConfirm/showAlert/closeModal - モーダル操作ヘルパー
│
src/components/layout/
└── Toast.svelte  # トースト表示コンポーネント
```

### 成果

- Push/Pull処理をsync.tsに委譲し、ビジネスロジックを分離
- モーダル・トースト状態をui.tsのストアで管理し、グローバル状態を整理
- トースト表示をToastコンポーネント化し、再利用性を向上
- App.svelteのローカル状態変数を約50行削減
- z-index管理を改善（トーストはモーダルより前面に表示）

### UI改善（実装済み 2025-01-23）

- **設定画面**: モーダル化（フルページ遷移からポップアップに変更）
- **URLルーティング**: クエリパラメータベースのディープリンク対応（`?note=uuid&leaf=uuid`）
- **ブラウザ対応**: 戻る/進むボタンでの状態復元
- **ヘルプリンク**: 設定画面に使い方（テキスト・動画）へのリンクを追加
- **テーマボタン**: スマホ対応のため3個ずつ2段表示に変更
- **トースト通知**: Push/Pull開始時に「Pushします」「Pullします」を表示

---

## 7. データ永続化仕様の明確化（実装済み 2025-01-23）

GitHubを唯一の真実の情報源（Single Source of Truth）とする設計を明確化し、実装しました。

### データ永続化の役割分担

| ストレージ       | 役割                       | 同期      |
| ---------------- | -------------------------- | --------- |
| **LocalStorage** | 設定情報のみ保存           | なし      |
| **IndexedDB**    | ノート・リーフのキャッシュ | なし      |
| **GitHub**       | 全リーフの永続化（SSoT）   | Push/Pull |

### Pull処理フロー

1. 「Pullします」トースト表示
2. IndexedDB全削除
3. GitHubから全データ取得
4. IndexedDB全作成
5. 「Pullしました」トースト表示

**重要**: 前回終了時のIndexedDBデータは使用しない。アプリ起動時は必ず初回Pullを実行。

### Push処理フロー

1. 「Pushします」トースト表示
2. 全リーフをGitHubにPush
3. 「Pushしました」トースト表示

**Pushタイミング**:

- 保存ボタン押下時
- 設定ボタン押下時（設定画面を開く前）

**Pullタイミング**:

- アプリ起動時（初回Pull）
- 設定画面の「Pullテスト」ボタン押下時
- 設定画面を閉じるとき

---

## 8. Git Tree APIとSHA最適化（実装済み 2025-01-23）

Push処理をGit Tree APIに移行し、SHA比較による最適化を実装しました。

### Git Tree APIの導入

**以前の実装:**

- ファイルごとにPUT APIを呼び出し
- 削除・リネームが正しく処理されない
- APIリクエスト数が多い（ファイル数 × 2回）

**新しい実装:**

- Git Tree APIで1コミットで全ファイルをPush
- APIリクエスト数を7回に削減
- 削除・リネームを確実に処理

### base_treeを使わない方式

`base_tree`パラメータを使わず、全ファイルを明示的に指定することで削除を確実に処理。

**処理フロー:**

1. 既存ツリーを取得
2. notes/以外のファイル → SHAを保持
3. notes/以下のファイル → 完全に再構築
4. treeItemsに含めないファイルは自動的に削除

**メリット:**

- 削除が確実に動作（treeItemsに含めないだけ）
- README.md等のnotes/以外のファイルは保持

### SHA最適化

変更されていないファイルは既存のSHAを使用し、ネットワーク転送量を削減。

**SHA-1計算:**

```typescript
async function calculateGitBlobSha(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const contentBytes = encoder.encode(content)
  const header = `blob ${contentBytes.length}\0` // UTF-8バイト数
  const headerBytes = encoder.encode(header)

  const data = new Uint8Array(headerBytes.length + contentBytes.length)
  data.set(headerBytes, 0)
  data.set(contentBytes, headerBytes.length)

  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
```

**重要な修正:**

- 文字数（`content.length`）ではなくUTF-8バイト数を使用
- 日本語を含むファイルでSHAが正しく計算される

**最適化の効果:**

```typescript
// 変化なし → 既存のSHAを使用（転送なし）
treeItems.push({
  path,
  mode: '100644',
  type: 'blob',
  sha: existingSha,
})

// 変化あり → contentを送信
treeItems.push({
  path,
  mode: '100644',
  type: 'blob',
  content: leaf.content,
})
```

### Pull時のBase64デコード修正

GitHub APIは改行付きのBase64を返すため、改行を削除してからデコード。

```typescript
// GitHub APIは改行付きBase64を返すので改行を削除
const base64 = contentData.content.replace(/\n/g, '')
content = decodeURIComponent(escape(atob(base64)))
```

### Push並行実行の防止

`isPushing`フラグでダブルクリック等による並行実行を防止。

```typescript
let isPushing = false
async function handleSaveToGitHub() {
  if (isPushing) return
  isPushing = true
  try {
    await executePush(...)
  } finally {
    isPushing = false
  }
}
```

### 強制更新（force: true）

個人用アプリなので、ブランチ更新時に`force: true`を使用。

**設計思想:**

- Pushボタンを押した時点で、ユーザーは「今の状態が正しい」と判断している
- 常に成功させることが重要
- Pullしていない方が悪い（ユーザーの責任）

### 連番の修正

`generateUniqueName`を修正し、リーフ1から開始するように変更。

```typescript
// 修正前: リーフ、リーフ2、リーフ3...
// 修正後: リーフ1、リーフ2、リーフ3...
function generateUniqueName(baseName: string, existingNames: string[]): string {
  let counter = 1
  let name = `${baseName}${counter}`
  while (existingNames.includes(name)) {
    counter++
    name = `${baseName}${counter}`
  }
  return name
}
```

### 成果

- **転送量削減**: 変更されていないファイルは転送しない
- **信頼性向上**: 削除・リネームが確実に動作
- **パフォーマンス向上**: APIリクエスト数を大幅削減（ファイル数 × 2 → 7回）
- **並行実行防止**: ダブルクリック等での不具合を解消
- **UTF-8対応**: 日本語を含むファイルで正しくSHA計算

---

## 9. 左右対称設計への大規模リファクタリング（実装済み 2025-11-24）

デュアルペイン表示の実装により左ペイン中心の設計に非対称性が生まれていたため、完全に左右対等な設計に変更しました。

### 問題点

**非対称な状態管理:**

- 左ペイン: `currentView`, `currentNote`, `currentLeaf`（グローバルストア）
- 右ペイン: `rightView`, `rightNote`, `rightLeaf`（ローカル変数）

**非対称な関数名:**

- 左ペイン: `goHome()`, `selectNote()`, `createNote()`, `deleteNote()`等（サフィックスなし）
- 右ペイン: `selectNoteRight()`, `createNoteRight()`等（Rightサフィックス）

**問題の影響:**

- Pull処理で左ペインだけがリセットされて復元されないバグ
- 右ペインはローカル変数のため、Pull時にリセットされず状態が残る
- 設定画面を開いて閉じた後、リーフ表示時に左ペインだけ描画されなくなる

### 実施した変更

#### 1. 状態管理の統一

**グローバルストアから削除:**

```typescript
// 削除されたストア
export const currentView = writable<View>('home')
export const currentNote = writable<Note | null>(null)
export const currentLeaf = writable<Leaf | null>(null)
export const subNotes = derived([notes, currentNote], ...)
export const currentNoteLeaves = derived([leaves, currentNote], ...)
```

**ローカル変数に統一:**

```typescript
// 左ペインの状態（App.svelte内のローカル変数）
let leftNote: Note | null = null
let leftLeaf: Leaf | null = null
let leftView: View = 'home'

// 右ペインの状態（App.svelte内のローカル変数）
let rightNote: Note | null = null
let rightLeaf: Leaf | null = null
let rightView: View = 'home'
```

**設計思想:**

- 左右のペインは完全に対等
- グローバルストアは全体で共有するデータ（notes, leaves, settings等）のみ
- 表示状態は各ペインが独立して管理

#### 2. ナビゲーション関数の統合

**すべての関数にpane引数を追加:**

```typescript
// Pane型の定義
type Pane = 'left' | 'right'

// 統合されたナビゲーション関数
function goHome(pane: Pane)
function selectNote(note: Note, pane: Pane)
function selectLeaf(leaf: Leaf, pane: Pane)
function createNote(parentId: string | undefined, pane: Pane)
function createLeaf(pane: Pane)
function deleteNote(pane: Pane)
function deleteLeaf(leafId: string, pane: Pane)
function togglePreview(pane: Pane)
```

**削除された関数:**

- `selectNoteRight()` - `selectNote(note, 'right')`に統合
- `selectLeafRight()` - `selectLeaf(leaf, 'right')`に統合
- `createNoteRight()` - `createNote(parentId, 'right')`に統合
- `createLeafRight()` - `createLeaf('right')`に統合
- `togglePreviewRight()` - `togglePreview('right')`に統合

#### 3. パンくずリスト関数の統合

**2つの関数を1つに統合:**

```typescript
// 統合前
function getBreadcrumbs(view, note, leaf, allNotes): Breadcrumb[] // 左ペイン用
function getBreadcrumbsRight(view, note, leaf, allNotes): Breadcrumb[] // 右ペイン用

// 統合後
function getBreadcrumbs(view, note, leaf, allNotes, pane: Pane): Breadcrumb[]
```

**使用例:**

```typescript
$: breadcrumbs = getBreadcrumbs(leftView, leftNote, leftLeaf, $notes, 'left')
$: breadcrumbsRight = getBreadcrumbs(rightView, rightNote, rightLeaf, $notes, 'right')
```

#### 4. Pull処理の修正

**Pull後の状態復元を左右両方に適用:**

```typescript
async function executePullInternal(isInitial: boolean) {
  // IndexedDB全削除
  await clearAllData()
  notes.set([])
  leaves.set([])

  // 左右両方の状態をリセット
  leftNote = null
  leftLeaf = null
  rightNote = null
  rightLeaf = null

  const result = await executePull($settings, isInitial)

  if (result.success) {
    updateNotes(result.notes)
    updateLeaves(result.leaves)

    // Pull後は常にURLから状態を復元（初回Pullも含む）
    if (isInitial) {
      restoreStateFromUrl(true)
      isRestoringFromUrl = false
    } else {
      restoreStateFromUrl(false) // 追加：初回Pull以外でも復元
    }
  }
}
```

**修正のポイント:**

- 左右両方の状態を明示的にnullにリセット
- 初回Pull以外でも`restoreStateFromUrl()`を呼ぶように修正
- これにより、設定画面を閉じた後のPullでも状態が正しく復元される

#### 5. コンポーネント呼び出しの修正

**左ペイン:**

```typescript
<HomeView
  onSelectNote={(note) => selectNote(note, 'left')}
  onCreateNote={() => createNote(undefined, 'left')}
/>

<NoteView
  onSelectLeaf={(leaf) => selectLeaf(leaf, 'left')}
  onCreateLeaf={() => createLeaf('left')}
  onDeleteNote={() => deleteNote('left')}
/>

<EditorFooter
  onDelete={() => deleteLeaf(leftLeaf.id, 'left')}
  onTogglePreview={() => togglePreview('left')}
/>
```

**右ペイン:**

```typescript
<HomeView
  onSelectNote={(note) => selectNote(note, 'right')}
  onCreateNote={() => createNote(undefined, 'right')}
/>

<NoteView
  onSelectLeaf={(leaf) => selectLeaf(leaf, 'right')}
  onCreateLeaf={() => createLeaf('right')}
  onDeleteNote={() => deleteNote('right')}
/>

<EditorFooter
  onDelete={() => deleteLeaf(rightLeaf.id, 'right')}
  onTogglePreview={() => togglePreview('right')}
/>
```

### 成果

- **完全な左右対称**: すべての関数が`pane`引数で制御される統一設計
- **バグ修正**: 設定を閉じた後に左ペインだけ描画されないバグを解決
- **保守性向上**: 左右で重複していたコードを共通化
- **型安全性**: `Pane`型により、左右の指定が明確化
- **コード削減**: 右ペイン専用の関数（~8関数）を削除し、約100行削減

### 削除されたストアと派生ストア

- `currentView` - `leftView`, `rightView`ローカル変数に移行
- `currentNote` - `leftNote`, `rightNote`ローカル変数に移行
- `currentLeaf` - `leftLeaf`, `rightLeaf`ローカル変数に移行
- `subNotes` - インラインfilterに変更（各ペインで独立計算）
- `currentNoteLeaves` - インラインfilterに変更（各ペインで独立計算）

### 設計原則

**左右対等の原則:**

- 左と右のペインに差は一切ない
- すべての処理が`pane: 'left' | 'right'`引数で制御される
- グローバルストアは全体で共有するデータのみ
- 表示状態は各ペインがローカル変数で独立管理

---

## 10. コード重複削減と汎用化（実装済み 2025-11-24）

Version 6.0では、徹底的なコード重複削減とDRY原則の適用により、保守性と再利用性を大幅に向上させました。

### 実施した変更

#### 1. パンくずリスト生成ロジックの分離（breadcrumbs.ts）

**分離前:**

- App.svelteに`getBreadcrumbs()`, `extractH1Title()`, `updateH1Title()`が含まれていた
- 約80行のロジックがApp.svelteに埋め込まれていた

**分離後:**

```typescript
// src/lib/breadcrumbs.ts（新規作成）
export function getBreadcrumbs(
  view: View,
  note: Note | null,
  leaf: Leaf | null,
  allNotes: Note[],
  pane: Pane,
  goHome: (pane: Pane) => void,
  selectNote: (note: Note, pane: Pane) => void,
  selectLeaf: (leaf: Leaf, pane: Pane) => void
): Breadcrumb[]

export function extractH1Title(content: string): string | null

export function updateH1Title(content: string, newTitle: string): string
```

**成果:**

- App.svelteから約80行削減
- パンくずリスト関連のロジックを一元化
- 他のコンポーネントからも再利用可能

#### 2. ドラッグ&ドロップユーティリティの汎用化（drag-drop.ts）

**分離前:**

- ノート用とリーフ用で重複したドラッグ&ドロップ処理
- `handleDragStartNote()`, `handleDragStartLeaf()`等の重複関数
- 型安全性が低い

**分離後:**

```typescript
// src/lib/drag-drop.ts（新規作成）
export function handleDragStart<T extends { id: string }>(item: T): void

export function handleDragEnd(): void

export function handleDragOver<T extends { id: string }>(item: T, callback: (item: T) => void): void

export function reorderItems<T extends { order: number }>(
  items: T[],
  dragId: string,
  dropId: string
): T[]
```

**特徴:**

- ジェネリック型（`<T>`）により、Note/Leaf両方に対応
- 型安全性の向上（`id`プロパティを持つオブジェクトのみ受け付ける）
- 並び替えロジックを汎用化

**成果:**

- App.svelteから約60行削減
- ノートとリーフの重複処理を統一
- テスタビリティの向上

#### 3. ノートカード共通コンポーネント化（NoteCard.svelte）

**問題点:**

- HomeViewとNoteViewで同じノートカードUIが重複実装されていた
- 約40行のHTMLとCSSが重複

**解決策:**

```svelte
<!-- src/components/cards/NoteCard.svelte（新規作成） -->
<script lang="ts">
  import type { Note } from '$lib/types'

  export let note: Note
  export let onSelect: (note: Note) => void
  export let onDragStart: (note: Note) => void
  export let onDragOver: (note: Note) => void
  export let isDragOver: boolean = false
  export let itemCount: number = 0
</script>

<div
  class="note-card {isDragOver ? 'drag-over' : ''}"
  on:click={() => onSelect(note)}
  on:dragstart={() => onDragStart(note)}
  on:dragover|preventDefault={() => onDragOver(note)}
  draggable="true"
>
  <div class="card-title">{note.name}</div>
  <div class="card-meta">{itemCount} items</div>
</div>
```

**使用例:**

```svelte
<!-- HomeView.svelte -->
<NoteCard
  {note}
  onSelect={(n) => onSelectNote(n)}
  onDragStart={(n) => handleDragStart(n)}
  onDragOver={(n) => handleDragOver(n)}
  isDragOver={dragOverId === note.id}
  itemCount={getItemCount(note.id)}
/>
```

**成果:**

- HomeViewとNoteViewから各約40行削減（合計約80行削減）
- UIの一貫性が保証される
- 1箇所の修正で両方に反映される

#### 4. IndexedDB操作の汎用化（storage.ts）

**問題点:**

- fonts/backgrounds関連の6つの関数で重複したIndexedDB操作
- 同じパターンのopen/transaction/put/get/deleteが繰り返される

**解決策:**

```typescript
// src/lib/storage.ts
// 汎用ヘルパー関数を追加
export async function putItem<T>(storeName: string, key: string, value: T): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(storeName, 'readwrite')
  await tx.objectStore(storeName).put(value, key)
  await tx.done
}

export async function getItem<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDB()
  const tx = db.transaction(storeName, 'readonly')
  return (await tx.objectStore(storeName).get(key)) || null
}

export async function deleteItem(storeName: string, key: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(storeName, 'readwrite')
  await tx.objectStore(storeName).delete(key)
  await tx.done
}
```

**リファクタリング例:**

```typescript
// 修正前
export async function saveFontToIndexedDB(arrayBuffer: ArrayBuffer): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('fonts', 'readwrite')
  await tx.objectStore('fonts').put(arrayBuffer, 'custom-font')
  await tx.done
}

// 修正後
export async function saveFontToIndexedDB(arrayBuffer: ArrayBuffer): Promise<void> {
  await putItem<ArrayBuffer>('fonts', 'custom-font', arrayBuffer)
}
```

**成果:**

- 6つの関数を簡略化（約60行削減）
- 型安全性の向上（ジェネリック型`<T>`）
- エラーハンドリングの一元化

#### 5. GitHub設定検証の統一（github.ts）

**問題点:**

- 4つの関数（`saveToGitHub`, `pushAllWithTreeAPI`, `pullFromGitHub`, `testGitHubConnection`）で同じ設定検証が重複

**解決策:**

```typescript
// src/lib/github.ts
export function validateGitHubSettings(settings: Settings): {
  valid: boolean
  message?: string
} {
  if (!settings.token || !settings.repoName) {
    return { valid: false, message: 'GitHub設定が不完全です' }
  }
  if (!settings.repoName.includes('/')) {
    return { valid: false, message: 'リポジトリ名は"owner/repo"形式で入力してください' }
  }
  return { valid: true }
}
```

**使用例:**

```typescript
export async function pushAllWithTreeAPI(
  notes: Note[],
  leaves: Leaf[],
  settings: Settings,
  existingFiles: GitHubFile[],
  pushCount: number
): Promise<{ success: boolean; message: string; pushCount?: number }> {
  const validation = validateGitHubSettings(settings)
  if (!validation.valid) {
    return { success: false, message: validation.message! }
  }
  // ... Pushロジック
}
```

**成果:**

- 4つの関数から検証ロジックを削除（約40行削減）
- 設定検証の一元管理
- 将来の検証ルール追加が容易

#### 6. Footerコンポーネントのリファクタリング

**問題点:**

- 4つのFooterコンポーネント（HomeFooter, NoteFooter, EditorFooter, PreviewFooter）で保存ボタンが重複実装されていた
- isDirty状態のバッジ表示ロジックが4箇所に分散

**解決策:**

```svelte
<!-- src/components/buttons/SaveButton.svelte（新規作成） -->
<script lang="ts">
  import { isDirty } from '$lib/stores'
  import { _ } from 'svelte-i18n'

  export let onSave: () => void
</script>

<button on:click={onSave} class="save-button">
  💾 {$_('common.save')}
  {#if $isDirty}
    <span class="notification-badge"></span>
  {/if}
</button>
```

**使用例:**

```svelte
<!-- EditorFooter.svelte -->
<script lang="ts">
  import SaveButton from '../buttons/SaveButton.svelte'
  export let onSave: () => void
</script>

<SaveButton {onSave} />
```

**成果:**

- 4つのFooterコンポーネントから各約20行削減（合計約80行削減）
- 保存ボタンの一元管理
- isDirty状態の一貫した表示

#### 7. スクロール同期関数の統一（App.svelte）

**問題点:**

- 左→右、右→左のスクロール同期で重複したロジック
- `handleLeftPaneScroll()`, `handleRightPaneScroll()`の重複

**解決策:**

```typescript
// src/App.svelte
function handlePaneScroll(sourcePane: Pane, event: Event) {
  const source = event.target as HTMLElement
  const sourceScrollPercentage = source.scrollTop / (source.scrollHeight - source.clientHeight)

  const targetPane = sourcePane === 'left' ? 'right' : 'left'
  const targetElement = document.getElementById(`${targetPane}-pane`)

  if (!targetElement) return

  // 無限ループ防止フラグ
  if (sourcePane === 'left') {
    isScrollingSyncRight = true
  } else {
    isScrollingSyncLeft = true
  }

  const targetScrollTop =
    sourceScrollPercentage * (targetElement.scrollHeight - targetElement.clientHeight)
  targetElement.scrollTop = targetScrollTop

  setTimeout(() => {
    if (sourcePane === 'left') {
      isScrollingSyncRight = false
    } else {
      isScrollingSyncLeft = false
    }
  }, 100)
}
```

**使用例:**

```svelte
<div id="left-pane" on:scroll={(e) => handlePaneScroll('left', e)}>
  <!-- 左ペインのコンテンツ -->
</div>

<div id="right-pane" on:scroll={(e) => handlePaneScroll('right', e)}>
  <!-- 右ペインのコンテンツ -->
</div>
```

**成果:**

- 約30行のコード削減
- 無限ループ防止ロジックの一元化
- pane引数により左右対称性を保持

#### 8. 背景画像管理の統一（background.ts）

**問題点:**

- 左右ペイン別のアップロード/削除関数が重複
- `uploadBackgroundLeft()`, `uploadBackgroundRight()`等の重複

**解決策:**

```typescript
// src/lib/background.ts
export async function uploadAndApplyBackground(
  file: File,
  pane: 'left' | 'right',
  opacity: number
): Promise<void> {
  const arrayBuffer = await readFileAsArrayBuffer(file)
  const key = pane === 'left' ? 'custom-left' : 'custom-right'

  await putItem<ArrayBuffer>('backgrounds', key, arrayBuffer)

  const url = URL.createObjectURL(new Blob([arrayBuffer]))
  const root = document.documentElement
  root.style.setProperty(`--background-image-${pane}`, `url(${url})`)
  root.style.setProperty(`--background-opacity-${pane}`, opacity.toString())
}

export async function removeAndDeleteCustomBackground(pane: 'left' | 'right'): Promise<void> {
  const key = pane === 'left' ? 'custom-left' : 'custom-right'

  await deleteItem('backgrounds', key)

  const root = document.documentElement
  root.style.removeProperty(`--background-image-${pane}`)
  root.style.removeProperty(`--background-opacity-${pane}`)
}
```

**成果:**

- 約50行のコード削減
- 左右ペインの処理を完全に統一
- 保守性の向上

#### 9. 設定画面の4コンポーネント分割

**問題点:**

- SettingsView.svelte が約400行の大きなファイル
- テーマ選択、フォント、背景画像、GitHub設定が混在

**解決策:**

```
src/components/settings/
├── ThemeSelector.svelte        # テーマ選択（約80行）
├── FontCustomizer.svelte       # カスタムフォント（約60行）
├── BackgroundCustomizer.svelte # カスタム背景画像（約100行）
└── GitHubSettings.svelte       # GitHub連携設定（約120行）
```

**成果:**

- SettingsView.svelteを約360行削減
- 各コンポーネントが単一責任を持つ
- テスト・保守が容易に

#### 10. alert()をアプリ独自のポップアップに統一

**問題点:**

- ブラウザ標準の`alert()`が使用されていた
- アプリのデザインと統一されていない

**解決策:**

- 既存のModalコンポーネントを活用
- すべての`alert()`呼び出しを`showAlert()`に置き換え

```typescript
// 修正前
alert('リーフを削除できませんでした')

// 修正後
showAlert('リーフを削除できませんでした')
```

**成果:**

- UIの一貫性が向上
- アプリのテーマに合ったデザイン

#### 11. ドラッグ&ドロップの視覚的フィードバック強化

**問題点:**

- ノートのドラッグ&ドロップ時は強調表示があった
- リーフのドラッグ&ドロップ時は強調表示がなかった

**解決策:**

NoteView.svelteに欠けていたスタイルを追加:

```css
.note-card {
  /* 基本スタイル */
}

.note-card:hover {
  /* ホバー時のスタイル */
}

.drag-over {
  border: 2px solid var(--accent-color);
  box-shadow: 0 0 10px rgba(var(--accent-color-rgb), 0.5);
}
```

**成果:**

- ノートとリーフで一貫したドラッグ&ドロップ体験
- 視覚的フィードバックの向上

### 総合成果

**コード削減:**

- breadcrumbs.ts分離: 約80行削減
- drag-drop.ts分離: 約60行削減
- NoteCard.svelte作成: 約80行削減
- storage.ts汎用化: 約60行削減
- github.ts統一: 約40行削減
- SaveButton.svelte作成: 約80行削減
- スクロール同期統一: 約30行削減
- 背景画像管理統一: 約50行削減
- 設定画面分割: 約360行削減（構造改善のため、ファイル数は増加）
- **総削減行数: 約840行** （設定画面分割を除くと約480行）

**ファイル数の変化:**

- コンポーネント数: 15個 → 22個
- libモジュール数: 7個 → 13個

**設計原則:**

- **DRY原則**: 重複コードの徹底削減
- **単一責任の原則**: 各コンポーネント・モジュールが単一の責任を持つ
- **型安全性**: ジェネリック型による再利用性と型安全性の向上
- **左右対称設計**: pane引数による統一的な処理

**保守性の向上:**

- コード重複削減により、1箇所の修正で複数箇所に反映
- 汎用ヘルパー関数により、新機能追加が容易
- 型安全性の向上により、バグの早期発見
- コンポーネント分割により、テストが容易

---

## 11. ボタンコンポーネントの共通化（実装済み 2025-11-24）

Version 6.1では、すべてのボタンを`IconButton`コンポーネントと個別のアイコンコンポーネントに分割し、コードの重複を大幅に削減しました。

### 問題点

**重複したボタン実装:**

- ヘッダー、パンくずリスト、シェアメニュー、フッターの各所で同じスタイルのボタンが重複実装されていた
- SVGアイコンが各コンポーネントに埋め込まれていた（約400行のSVG重複）
- スタイルが各コンポーネントに分散していた
- ボタンのサイズが18pxと20pxで不統一
- ホバー効果がバラバラ（opacity変更、background変更）

**メンテナンス性の問題:**

- ボタンのスタイルを変更する際、10箇所以上を修正する必要があった
- 新しいボタン追加時に、毎回同じスタイルとSVGを書く必要があった
- 一貫性の保証が困難

### 実施した変更

#### 1. IconButtonコンポーネントの作成

**汎用的なアイコンボタン:**

```svelte
<!-- src/components/buttons/IconButton.svelte -->
<script lang="ts">
  export let onClick: () => void
  export let title = ''
  export let ariaLabel = ''
  export let disabled = false
  export let variant: 'default' | 'primary' = 'default'
  export let iconSize = 18
</script>

<button
  type="button"
  on:click={onClick}
  {title}
  aria-label={ariaLabel}
  {disabled}
  class="icon-button"
  class:primary={variant === 'primary'}
  style="--icon-size: {iconSize}px"
>
  <slot />
</button>

<style>
  .icon-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s;
    position: relative;
  }

  .icon-button:hover:not(:disabled) {
    opacity: 0.7;
  }

  .icon-button.primary {
    color: var(--accent-color);
  }

  .icon-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .icon-button :global(svg) {
    width: var(--icon-size);
    height: var(--icon-size);
  }
</style>
```

**特徴:**

- `variant`プロパティでprimary/defaultを切り替え
- `iconSize`でアイコンサイズをカスタマイズ可能
- 統一されたホバー効果（opacity: 0.7）
- `<slot>`により任意のアイコンを挿入可能
- disabled状態のサポート

#### 2. 14個のアイコンコンポーネントの作成

**SVGアイコンを独立したコンポーネント化:**

```
src/components/icons/
├── SettingsIcon.svelte    # 設定（ヘッダー）
├── HomeIcon.svelte        # ホーム（パンくずリスト）
├── EditIcon.svelte        # 編集（パンくずリスト）
├── ShareIcon.svelte       # シェア（パンくずリスト）
├── SaveIcon.svelte        # 保存（フッター）
├── DeleteIcon.svelte      # 削除（フッター）
├── DownloadIcon.svelte    # ダウンロード（フッター）
├── EyeIcon.svelte         # プレビュー（フッター）
├── FolderPlusIcon.svelte  # ノート作成（フッター）
├── FilePlusIcon.svelte    # リーフ作成（フッター）
├── LinkIcon.svelte        # URLコピー（シェアメニュー）
├── CopyIcon.svelte        # コピー（シェアメニュー）
├── UploadIcon.svelte      # アップロード（シェアメニュー）
└── FileEditIcon.svelte    # 編集（フッター）
```

**アイコンコンポーネントの例:**

```svelte
<!-- src/components/icons/SaveIcon.svelte -->
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
  <polyline points="17 21 17 13 7 13 7 21" />
  <polyline points="7 3 7 8 15 8" />
</svg>
```

**特徴:**

- SVG定義のみのシンプルなコンポーネント
- サイズは親コンポーネント（IconButton）で制御
- `currentColor`により親の色を継承

#### 3. 既存コンポーネントのリファクタリング

**Header.svelte:**

```svelte
<!-- 修正前 -->
<button class="settings-button" on:click={onSettingsClick}>
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" ...>
    <!-- 長いSVGパス -->
  </svg>
</button>

<!-- 修正後 -->
<IconButton onClick={onSettingsClick} title={$_('header.settings')}>
  <SettingsIcon />
</IconButton>
```

**Breadcrumbs.svelte:**

```svelte
<!-- 修正前 -->
<button class="breadcrumb-button" on:click={crumb.action}>
  {#if index === 0}
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" ...>
      <!-- 長いSVGパス -->
    </svg>
  {:else}
    {crumb.label}
  {/if}
</button>

<!-- 修正後 -->
{#if index === 0}
  <IconButton onClick={crumb.action} title={$_('breadcrumbs.goHome')}>
    <HomeIcon />
  </IconButton>
{:else}
  <button class="breadcrumb-button" on:click={crumb.action}>
    {crumb.label}
  </button>
{/if}
```

**ShareButton.svelte:**

```svelte
<!-- 修正前 -->
<button class="share-button" on:click={toggleMenu}>
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" ...>
    <!-- 長いSVGパス -->
  </svg>
</button>
<div class="share-menu">
  <button class="menu-item" on:click={handleCopyUrl}>
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" ...>
      <!-- 長いSVGパス -->
    </svg>
    <span>{$_('share.copyUrl')}</span>
  </button>
  <!-- 他のメニューアイテム -->
</div>

<!-- 修正後 -->
<IconButton onClick={toggleMenu} title={$_('share.title')}>
  <ShareIcon />
</IconButton>
<div class="share-menu">
  <button class="menu-item" on:click={handleCopyUrl}>
    <LinkIcon />
    <span>{$_('share.copyUrl')}</span>
  </button>
  <!-- 他のメニューアイテム -->
</div>
```

**SaveButton.svelte:**

```svelte
<!-- 修正前 -->
<button type="button" class="primary save-button" on:click={onSave}>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ...>
    <!-- 長いSVGパス -->
  </svg>
  {#if isDirty}
    <span class="notification-badge"></span>
  {/if}
</button>

<!-- 修正後 -->
<div class="save-button-wrapper">
  <IconButton onClick={onSave} title={$_('common.save')} variant="primary">
    <SaveIcon />
  </IconButton>
  {#if isDirty}
    <span class="notification-badge"></span>
  {/if}
</div>
```

**フッターコンポーネント（HomeFooter, NoteFooter, EditorFooter, PreviewFooter）:**

```svelte
<!-- 修正前 -->
<button type="button" on:click={onDelete} {disabled}>
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" ...>
    <!-- 長いSVGパス -->
  </svg>
</button>

<!-- 修正後 -->
<IconButton onClick={onDelete} title={$_('footer.deleteLeaf')} {disabled}>
  <DeleteIcon />
</IconButton>
```

#### 4. Footer.svelteの簡略化

**不要なグローバルスタイルを削除:**

```css
/* 削除されたスタイル（約30行） */
:global(.footer-fixed button) {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}

:global(.footer-fixed button:hover) {
  opacity: 0.7;
}

:global(.footer-fixed button.primary) {
  color: var(--accent-color);
}

:global(.footer-fixed button svg) {
  width: 18px;
  height: 18px;
}

:global(.footer-fixed button:disabled) {
  opacity: 0.4;
  cursor: not-allowed;
}

:global(.footer-fixed .button-icon) {
  margin: 0;
}
```

これらのスタイルはすべて`IconButton.svelte`に集約されました。

### 成果

**コード削減:**

- **517行削除** → **464行追加** = **差し引き53行削減**
- SVG定義の重複削減（約400行相当）
- Footer.svelteから約30行のグローバルスタイルを削除

**ファイル数の変化:**

- コンポーネント数: 22個 → 38個
  - IconButtonコンポーネント: 1個
  - アイコンコンポーネント: 14個
  - 既存コンポーネントの改修: 8個
- 総ファイル数: 38個 → 56個

**スタイルの統一:**

- アイコンサイズ: 全て18pxに統一
- ホバー効果: 全て`opacity: 0.7`に統一
- 色: var(--text-primary)（保存ボタンのみvar(--accent-color)）

**メンテナンス性の向上:**

- **1箇所の修正で全体に反映**: IconButton.svelteを修正するだけで、全ボタンのスタイルが変更される
- **一貫性の保証**: すべてのボタンが同じスタイル・動作を持つ
- **新しいボタン追加が容易**: アイコンコンポーネントを作成して`<IconButton>`に渡すだけ
- **型安全性**: TypeScriptによるpropsの型チェック

**再利用性の向上:**

- IconButtonは他のプロジェクトでも再利用可能
- アイコンコンポーネントは独立しており、どこでも使用可能
- `variant`プロパティにより、様々なスタイルに対応可能

### 設計原則

**コンポーネントの責務分離:**

- **IconButton**: ボタンの挙動とスタイルを担当
- **アイコンコンポーネント**: SVG定義のみを担当
- **親コンポーネント**: イベントハンドリングとビジネスロジックを担当

**Composition over Configuration:**

- 複雑な設定より、シンプルな組み合わせを優先
- `<slot>`により柔軟な拡張性を実現
- variantは最小限（default/primary）

---

## 12. 設定画面のコンポーネント分割（実装済み 2025-11-24）

Version 6.2では、SettingsView.svelteを完全にセクションごとのコンポーネントに分割し、保守性と可読性を大幅に向上させました。

### 問題点

**SettingsView.svelteが大きすぎる:**

- 約490行の大きなファイル
- QRコード、ヘルプリンク、GitHub設定、言語選択、テーマ、フォント、背景、Vimモード、About情報が混在
- 各セクションの責務が不明確
- 設定項目の追加・修正が困難

### 実施した変更

#### 1. 7個の新規コンポーネントの作成

**QRCodeSection.svelte:**

- QRコード画像と説明の表示
- props: なし（i18n のみ使用）

**HelpLinks.svelte:**

- READMEと動画へのヘルプリンク
- props: なし（i18n のみ使用）

**LanguageSelector.svelte:**

- 言語選択ドロップダウン（日本語・英語）
- props: `settings`, `onSettingsChange`
- ロジック: `handleLocaleChange()`

**ToolNameInput.svelte:**

- ツール名入力フィールド
- props: `settings`, `onSettingsChange`
- ロジック: `handleToolNameInput()`

**VimModeToggle.svelte:**

- Vimモードのチェックボックス
- props: `settings`, `onSettingsChange`
- ロジック: `handleVimModeChange()`

**AboutSection.svelte:**

- アプリ情報、作者、スポンサーリンク
- props: なし（i18n のみ使用）

**VersionDisplay.svelte:**

- バージョン番号の表示（ビルド日付を自動表示）
- props: なし
- 機能: `__BUILD_DATE__`を Vite define から取得

#### 2. SettingsView.svelteのリファクタリング

**修正前:**

```svelte
<!-- 約490行 -->
<script lang="ts">
  // 3つのハンドラー関数（33行）
  function handleToolNameInput(event: Event) { ... }
  function handleLocaleChange(event: Event) { ... }
  function handleVimModeChange(event: Event) { ... }
</script>

<section class="settings-container">
  <!-- QRコード表示（15行） -->
  <div class="qr-code-container">...</div>

  <!-- ヘルプリンク（45行） -->
  <div class="help-links">...</div>

  <!-- GitHub設定 -->
  <GitHubSettings ... />

  <!-- 言語選択（10行） -->
  <label for="language">...</label>
  <select id="language" ...>...</select>

  <!-- テーマ選択 -->
  <ThemeSelector ... />

  <!-- ツール名入力（15行） -->
  <div class="tool-name-field">...</div>

  <!-- フォント -->
  <FontCustomizer ... />

  <!-- 背景画像 -->
  <BackgroundCustomizer ... />

  <!-- Vimモード（12行） -->
  <div class="vim-mode-field">...</div>

  <!-- Aboutセクション（65行） -->
  <div class="about-section">...</div>

  <!-- バージョン -->
  <div class="version">v2025-11-24</div>
</section>

<style>
  /* 約250行のスタイル定義 */
</style>
```

**修正後:**

```svelte
<!-- 約100行 -->
<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings, ThemeType } from '../../lib/types'
  import QRCodeSection from '../settings/QRCodeSection.svelte'
  import HelpLinks from '../settings/HelpLinks.svelte'
  import GitHubSettings from '../settings/GitHubSettings.svelte'
  import LanguageSelector from '../settings/LanguageSelector.svelte'
  import ThemeSelector from '../settings/ThemeSelector.svelte'
  import ToolNameInput from '../settings/ToolNameInput.svelte'
  import FontCustomizer from '../settings/FontCustomizer.svelte'
  import BackgroundCustomizer from '../settings/BackgroundCustomizer.svelte'
  import VimModeToggle from '../settings/VimModeToggle.svelte'
  import AboutSection from '../settings/AboutSection.svelte'
  import VersionDisplay from '../settings/VersionDisplay.svelte'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let onThemeChange: (theme: ThemeType) => void
  export let pullRunning: boolean = false
  export let onPull: (isInitial?: boolean) => void
</script>

<section class="settings-container">
  <div class="settings-content">
    <h2>{$_('settings.title')}</h2>

    <QRCodeSection />
    <HelpLinks />

    <div class="form-section">
      <GitHubSettings {settings} {onSettingsChange} {pullRunning} {onPull} />
      <hr />

      <div class="form-row">
        <div class="form-field">
          <h3>{$_('settings.extras.title')}</h3>

          <LanguageSelector {settings} {onSettingsChange} />
          <ThemeSelector {settings} {onThemeChange} {onSettingsChange} />
          <ToolNameInput {settings} {onSettingsChange} />
          <FontCustomizer {settings} {onSettingsChange} />
          <BackgroundCustomizer {settings} {onSettingsChange} />
          <VimModeToggle {settings} {onSettingsChange} />
        </div>
      </div>
    </div>

    <AboutSection />
  </div>

  <VersionDisplay />
</section>

<style>
  /* 最小限のレイアウトスタイルのみ（約48行） */
</style>
```

#### 3. ビルド日付の自動生成（関連機能）

**Vite設定にdefineを追加:**

```typescript
// vite.config.ts
export default defineConfig({
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
  },
  ...
})
```

**TypeScript型定義を追加:**

```typescript
// src/vite-env.d.ts（新規作成）
declare global {
  const __BUILD_DATE__: string
}
export {}
```

**VersionDisplay.svelteで使用:**

```svelte
<script lang="ts">
  // __BUILD_DATE__ is injected at build time by Vite
</script>

<div class="version">v{__BUILD_DATE__}</div>
```

### 成果

**コード削減:**

- SettingsView.svelte: 約490行 → 約100行（**約390行削減**、80%削減）
- ハンドラー関数を各コンポーネントに移動（33行削減）
- HTML/CSSの重複を各コンポーネントに分離（約357行削減）

**ファイル数の変化:**

- コンポーネント数: 38個 → 45個（+7個）
- settings/ディレクトリ: 4個 → 11個（+7個）

**構造の改善:**

```
<!-- 設定画面の構造が一目瞭然 -->
<QRCodeSection />           <!-- QRコード表示 -->
<HelpLinks />               <!-- ヘルプリンク -->
<GitHubSettings ... />      <!-- GitHub設定 -->
<LanguageSelector ... />    <!-- 言語選択 -->
<ThemeSelector ... />       <!-- テーマ選択 -->
<ToolNameInput ... />       <!-- ツール名入力 -->
<FontCustomizer ... />      <!-- フォント -->
<BackgroundCustomizer ... /> <!-- 背景 -->
<VimModeToggle ... />       <!-- Vimモード -->
<AboutSection />            <!-- About情報 -->
<VersionDisplay />          <!-- バージョン -->
```

**保守性の向上:**

- **可読性**: 設定画面の構造が約30行で把握できる
- **責任の分離**: 各コンポーネントが単一の設定項目を管理
- **再利用性**: 各セクションを他の場所でも利用可能
- **テスト容易性**: 各コンポーネントを個別にテストできる
- **変更の局所化**: 1つの設定項目の修正が他に影響しない

**自動化の導入:**

- バージョン番号がビルド日付に自動更新される
- 手動でのバージョン管理が不要

### 設計原則

**コンポーネントの粒度:**

- 1コンポーネント = 1設定項目
- QRコードやヘルプリンクのような表示のみのコンポーネントもOK
- 設定変更のロジックは各コンポーネントに内包

**親コンポーネントの責務:**

- コンポーネントの配置のみを担当
- ビジネスロジックは持たない
- propsのバケツリレー（props drilling）は許容

**ビルド時の自動化:**

- 手動で更新すべき情報は極力減らす
- Vite defineによるビルド時の値注入
- 開発者の負担を軽減

---

## まとめ

SimplestNote.mdは、継続的なリファクタリングにより以下を達成しました：

### コード規模の変遷

- **Version 1.0**: 1,373行の単一ファイル
- **Version 3.0**: 約2,178行の15ファイル
- **Version 5.0**: 完全な左右対称設計（約100行削減）
- **Version 6.0**: 約6,300行の38ファイル（22コンポーネント、13モジュール）
- **Version 6.1**: 約8,100行の56ファイル（38コンポーネント、14モジュール）
- **Version 6.2**: 約8,400行の59ファイル（45コンポーネント、14モジュール）

### リファクタリングの成果

1. **コンポーネント分割**: 単一ファイルから45コンポーネントへ
2. **状態管理改善**: Svelteストアによる一元管理
3. **ビジネスロジック分離**: lib/層への明確な分離
4. **モジュール化**: 14個の専門モジュール
5. **Git Tree API**: GitHub API最適化とSHA比較
6. **左右対称設計**: 完全な2ペイン対応
7. **コード重複削減**: DRY原則の徹底適用（約840行削減）
8. **汎用化**: ジェネリック型による再利用性向上
9. **UI一貫性**: 共通コンポーネントによる統一
10. **国際化対応**: svelte-i18nによる多言語サポート
11. **ボタン共通化**: IconButton + 14アイコン（約53行削減、SVG重複約400行削減）
12. **設定画面分割**: 7個のセクションコンポーネント（約390行削減、80%削減）

### 設計原則

- **シンプリシティ**: 必要最小限のコード
- **DRY原則**: 重複の徹底削減
- **単一責任**: 各コンポーネントが単一の責任を持つ
- **型安全性**: TypeScriptによる静的型チェック
- **左右対称**: 完全に対等な2ペイン設計
- **モジュール性**: 高い凝集度と低い結合度

詳細なアーキテクチャについては、[architecture.md](./architecture.md)を参照してください。
