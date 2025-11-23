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
