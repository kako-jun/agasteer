# 主要機能の実装

SimplestNote.mdの主要機能の実装詳細について説明します。

## エディタ管理

### 初期化

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

### コンテンツリセット

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

### 自動保存

エディタの変更を検知して自動保存。

```typescript
EditorView.updateListener.of((update) => {
  if (update.docChanged && currentNote) {
    updateNoteContent(currentNote.id, update.state.doc.toString())
  }
})
```

---

## パンくずナビゲーション

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

### インライン編集

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

---

## モーダルシステム

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

### 使用例

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

## 2ペイン表示

### アスペクト比判定

画面のアスペクト比（横 > 縦）で2ペイン表示を自動切替。

```typescript
// アスペクト比を監視して isDualPane を更新（横 > 縦で2ペイン表示）
const updateDualPane = () => {
  isDualPane = window.innerWidth > window.innerHeight
}
updateDualPane()

window.addEventListener('resize', updateDualPane)
```

### レスポンシブレイアウト

```svelte
<div class="content-wrapper" class:single-pane={!isDualPane}>
  <div class="pane-divider" class:hidden={!isDualPane}></div>
  <div class="left-column">
    <!-- 左ペイン -->
  </div>
  <div class="right-column" class:hidden={!isDualPane}>
    <!-- 右ペイン -->
  </div>
</div>
```

### CSS Grid切替

```css
.content-wrapper {
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* ... */
}

.content-wrapper.single-pane {
  grid-template-columns: 1fr;
}

.hidden {
  display: none;
}
```

### 動作

- **スマホ縦向き**: 1ペイン表示
- **スマホ横向き**: 2ペイン表示
- **PC横長画面**: 2ペイン表示
- **画面回転時**: 自動的に切り替わる

## ノート階層制限

### 2階層制限の実装

ルートノート→サブノートの2階層までに制限。

```typescript
function createNote(parentId?: string) {
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

  // ... ノート作成処理
}
```

### UIでの制御

```svelte
<script>
  // リアクティブ宣言: currentNoteが変わるたびに再計算
  $: canHaveSubNote = !currentNote.parentId
</script>

{#if canHaveSubNote}
  <button on:click={onCreateNote}>新規サブノート</button>
{/if}
```

### 階層構造

```
ホーム
├── ノート1 (ルートノート)
│   ├── サブノート1 ← サブノート作成可能
│   │   └── リーフ ← サブノート作成不可、リーフのみ作成可能
│   └── サブノート2
└── ノート2 (ルートノート)
    └── サブノート3
```

---

## リーフのタイトルと#見出しの同期

### 双方向同期の仕様

リーフのタイトルとコンテンツの1行目の`# 見出し`が自動的に同期します。

#### コンテンツ → タイトル

1行目が `# ` で始まる場合、リーフのタイトルが自動更新されます。

```typescript
function extractH1Title(content: string): string | null {
  const firstLine = content.split('\n')[0]
  const match = firstLine.match(/^# (.+)/)
  return match ? match[1].trim() : null
}

function updateLeafContent(content: string, leafId: string) {
  const h1Title = extractH1Title(content)
  const newTitle = h1Title || targetLeaf.title

  // グローバルストアを更新（左右ペイン両方に反映される）
  const updatedLeaves = allLeaves.map((n) =>
    n.id === leafId ? { ...n, content, title: newTitle, updatedAt: Date.now() } : n
  )
  updateLeaves(updatedLeaves)
}
```

#### タイトル → コンテンツ

パンくずリストでタイトルを変更すると、1行目の`# 見出し`も自動更新されます。

```typescript
function updateH1Title(content: string, newTitle: string): string {
  const lines = content.split('\n')
  const firstLine = lines[0]
  if (firstLine.match(/^# /)) {
    lines[0] = `# ${newTitle}`
    return lines.join('\n')
  }
  return content
}

function saveEditBreadcrumb(id: string, newName: string, type: 'leaf') {
  const targetLeaf = allLeaves.find((n) => n.id === id)
  let updatedContent = targetLeaf?.content || ''

  if (targetLeaf && extractH1Title(targetLeaf.content)) {
    updatedContent = updateH1Title(targetLeaf.content, newName.trim())
  }

  updateLeaves(
    allLeaves.map((n) =>
      n.id === id ? { ...n, title: newName.trim(), content: updatedContent } : n
    )
  )
}
```

### 新規リーフの初期コンテンツ

リーフを新規作成すると、以下の初期コンテンツが設定されます：

```markdown
# リーフ1
```

- 1行目: `# リーフ名`（自動生成されたタイトルが見出しになる）
- 2行目: 空行
- 3行目: 空行（カーソル位置）

```typescript
function createLeaf() {
  const uniqueTitle = generateUniqueName('リーフ', existingTitles)

  const newLeaf: Leaf = {
    id: crypto.randomUUID(),
    title: uniqueTitle,
    noteId: $currentNote.id,
    content: `# ${uniqueTitle}\n\n`,
    updatedAt: Date.now(),
    order: noteLeaves.length,
  }
}
```

### 適用条件

- **`#` のみ対応**: `## 見出し2` や `### 見出し3` には適用されません
- **スペース必須**: `#見出し`（スペースなし）はマッチしません
- **1行目のみ**: 2行目以降の見出しは無視されます

### 2ペイン表示での同期

左右のペインで同じリーフを開いている場合、どちらかのペインで編集すると**両方のペインに即座に反映**されます。

```typescript
function updateLeafContent(content: string, leafId: string) {
  // グローバルストアを更新（左右ペイン両方に反映される）
  updateLeaves(updatedLeaves)

  // 左ペインのリーフを編集している場合は currentLeaf も更新
  if ($currentLeaf?.id === leafId) {
    currentLeaf.update(...)
  }

  // 右ペインのリーフを編集している場合は rightLeaf も更新
  if (rightLeaf?.id === leafId) {
    rightLeaf = { ...rightLeaf, content, title: newTitle, updatedAt: Date.now() }
  }
}
```

**動作例**:

- 左ペインでリーフAを編集 → 右ペインでも同じリーフAを開いている場合、即座に同期
- 左ペインでリーフA、右ペインでリーフBを編集 → それぞれ独立して動作

---

## Push回数カウント機能

### 概要

アプリの使用状況を可視化するため、GitHub Push回数をカウントして統計情報として表示します。ユーザーがアプリを使い続けてきた長さを示し、楽しみを提供する機能です。

### データ構造

Push回数は `metadata.json` の `pushCount` フィールドに保存されます。

```typescript
export interface Metadata {
  version: number
  notes: Record<string, { id: string; order: number }>
  leaves: Record<string, { id: string; updatedAt: number; order: number }>
  pushCount: number // Push回数
}
```

### Push時の自動インクリメント

`pushAllWithTreeAPI` 関数内で、Push実行前に既存の `pushCount` を取得し、インクリメントします。

```typescript
// 既存のmetadata.jsonからpushCountを取得
let currentPushCount = 0
try {
  const metadataRes = await fetch(
    `https://api.github.com/repos/${settings.repoName}/contents/notes/metadata.json`,
    { headers }
  )
  if (metadataRes.ok) {
    const metadataData = await metadataRes.json()
    if (metadataData.content) {
      const base64 = metadataData.content.replace(/\n/g, '')
      const decoded = atob(base64)
      const existingMetadata: Metadata = JSON.parse(decoded)
      currentPushCount = existingMetadata.pushCount || 0
    }
  }
} catch (e) {
  // エラーは無視（初回Pushの場合）
}

// metadata.jsonを生成
const metadata: Metadata = {
  version: 1,
  notes: {},
  leaves: {},
  pushCount: currentPushCount + 1, // インクリメント
}
```

### Pull時のデータ取得

`pullFromGitHub` 関数内で、metadata.jsonから `pushCount` を取得し、Svelteストアに保存します。

```typescript
// notes/metadata.jsonを取得
let metadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
try {
  const metadataRes = await fetch(
    `https://api.github.com/repos/${settings.repoName}/contents/notes/metadata.json`,
    { headers }
  )
  if (metadataRes.ok) {
    const metadataData = await metadataRes.json()
    if (metadataData.content) {
      const base64 = metadataData.content.replace(/\n/g, '')
      const jsonText = decodeURIComponent(escape(atob(base64)))
      const parsed = JSON.parse(jsonText)
      // 古いmetadata.jsonにはpushCountがない可能性があるので、デフォルト値を設定
      metadata = {
        version: parsed.version || 1,
        notes: parsed.notes || {},
        leaves: parsed.leaves || {},
        pushCount: parsed.pushCount || 0,
      }
    }
  }
} catch (e) {
  console.warn('notes/metadata.json not found or invalid, using defaults')
}

return {
  success: true,
  message: '✅ Pull OK',
  notes: sortedNotes,
  leaves: sortedLeaves,
  metadata, // metadataを返す
}
```

### ストア管理

`stores.ts` に metadata ストアを追加。

```typescript
export const metadata = writable<Metadata>({
  version: 1,
  notes: {},
  leaves: {},
  pushCount: 0,
})
```

App.svelte でPull時にmetadataをストアに保存：

```typescript
// GitHubから取得したデータでIndexedDBを再作成
updateNotes(result.notes)
updateLeaves(result.leaves)
metadata.set(result.metadata) // metadataを保存
```

### UI表示

HomeView.svelte でホーム画面の右下に統計情報を表示。

```svelte
<div class="statistics">
  <div class="stat-item">
    <div class="stat-label">Push回数</div>
    <div class="stat-value">{$metadata.pushCount}</div>
  </div>
</div>
```

```css
.statistics {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  z-index: 0; /* ノート・リーフカードの背面 */
  opacity: 0.5; /* 半透明で控えめに */
  pointer-events: none; /* クリック不可 */
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: var(--accent-color);
}
```

### 後方互換性

古いバージョンで作成された `metadata.json` には `pushCount` フィールドがない可能性があります。そのため、Pull時にフォールバック処理を実装：

```typescript
pushCount: parsed.pushCount || 0
```

フィールドが存在しない場合は `0` として扱われます。

### 動作フロー

1. **初回Pull**: metadata.jsonから `pushCount: 0` を取得
2. **初回Push**: `pushCount` を1にインクリメントしてGitHubに保存
3. **2回目Pull**: `pushCount: 1` を取得してホーム画面に表示
4. **2回目Push**: `pushCount` を2にインクリメント
5. **以降同様に継続**

### 表示位置とデザイン

- **表示位置**: ホーム画面の右下
- **z-index**: 0（ノート・リーフカードの背面）
- **opacity**: 0.5（半透明で控えめ）
- **ラベル**: 小さなグレーのテキスト
- **数値**: 大きく太字でアクセントカラー

これにより、ユーザーの視線を邪魔せず、かつアプリを使い続けてきた実績を可視化できます。

---

## 未保存変更の確認機能

### 概要

GitHubにPushされていない変更がある状態で、データを失う可能性のある操作を行う際に確認ダイアログを表示します。

### ダーティフラグ管理

#### isDirtyストア

GitHubにPushされていない変更があるかどうかを追跡する`isDirty`ストア（`stores.ts`）。

```typescript
export const isDirty = writable<boolean>(false)
```

#### ダーティフラグが立つタイミング

1. **エディタで編集時** (`MarkdownEditor.svelte`)

   ```typescript
   EditorView.updateListener.of((update) => {
     if (update.docChanged) {
       const newContent = update.state.doc.toString()
       onChange(newContent)
       // エディタで変更があったらダーティフラグを立てる
       isDirty.set(true)
     }
   })
   ```

2. **ノート操作時** (`stores.ts`)

   ```typescript
   export function updateNotes(newNotes: Note[]): void {
     notes.set(newNotes)
     saveNotes(newNotes).catch((err) => console.error('Failed to persist notes:', err))
     // ノートの変更があったらダーティフラグを立てる
     isDirty.set(true)
   }
   ```

3. **リーフ操作時** (`stores.ts`)
   ```typescript
   export function updateLeaves(newLeaves: Leaf[]): void {
     leaves.set(newLeaves)
     saveLeaves(newLeaves).catch((err) => console.error('Failed to persist leaves:', err))
     // リーフの変更があったらダーティフラグを立てる
     isDirty.set(true)
   }
   ```

**対象操作:**

- ノート/リーフの作成、削除、名前変更、並び替え
- リーフのコンテンツ編集

#### ダーティフラグがクリアされるタイミング

1. **Push成功時** (`App.svelte`)

   ```typescript
   const result = await executePush($leaves, $notes, $settings, isOperationsLocked)

   if (result.variant === 'success') {
     isDirty.set(false) // Push成功時にダーティフラグをクリア
   }
   ```

2. **Pull成功時** (`App.svelte`)
   ```typescript
   if (result.success) {
     updateNotes(result.notes)
     updateLeaves(result.leaves)
     metadata.set(result.metadata)
     isDirty.set(false) // Pull成功時はGitHubと同期したのでクリア
   }
   ```

### 確認ダイアログの表示

#### 1. Pull実行時（既存モーダル）

未保存の変更がある状態でPullを実行しようとすると確認ダイアログを表示。

```typescript
async function handlePull(isInitial = false) {
  // 初回Pull以外で未保存の変更がある場合は確認
  if (!isInitial && get(isDirty)) {
    showConfirm('未保存の変更があります。Pullを実行しますか？', () =>
      executePullInternal(isInitial)
    )
    return
  }

  await executePullInternal(isInitial)
}
```

- **ダイアログタイプ**: Modal.svelteベースの既存モーダル
- **メッセージ**: 「未保存の変更があります。Pullを実行しますか？」
- **OK**: Pullを実行（GitHubのデータでIndexedDBを上書き）
- **キャンセル**: Pullをキャンセル

#### 2. ページ離脱時（ブラウザ標準ダイアログ）

タブを閉じる、リロード、外部サイトへの移動時に確認ダイアログを表示。

```typescript
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (get(isDirty)) {
    e.preventDefault()
    e.returnValue = '' // Chrome requires returnValue to be set
  }
}
window.addEventListener('beforeunload', handleBeforeUnload)
```

- **ダイアログタイプ**: ブラウザ標準の確認ダイアログ
- **メッセージ**: ブラウザが自動生成（「変更が保存されていない可能性があります」など）
- **OK**: ページを離脱
- **キャンセル**: ページに留まる

### 視覚的なフィードバック

#### 保存ボタンへのダーティマーク

未保存の変更がある場合、保存ボタンに赤い丸印（notification badge）を表示。

```svelte
<button type="button" class="primary save-button" on:click={handleSaveToGitHub}>
  <svg><!-- 保存アイコン --></svg>
  {#if $isDirty}
    <span class="notification-badge"></span>
  {/if}
</button>
```

```css
.save-button {
  position: relative;
}

.notification-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
}
```

- **表示位置**: 保存ボタンの右上
- **サイズ**: 8x8px
- **色**: #ef4444（赤色）
- **形状**: 円形
- **デザイン**: 設定ボタンのnotification badgeと同じスタイル

### アプリ内ナビゲーションは制限されない

このアプリは編集時に自動的にIndexedDBに保存されるため、アプリ内のナビゲーション（ホーム、ノート、リーフ間の移動）ではデータが失われません。

**確認が不要な操作:**

- ホームへの移動
- ノート/リーフの選択
- ブラウザの戻る/進むボタン
- ノート/リーフの作成、削除、名前変更、並び替え

**確認が必要な操作:**

- **Pull実行**: GitHubのデータでIndexedDBを上書きするため
- **ページ離脱**: ブラウザのタブを閉じる、リロード、外部サイトへの移動

ダーティフラグは「GitHubにPushしていない」という意味であり、GitHubとの同期を失う操作のみ確認が必要です。

### 動作フロー

1. **リーフを編集** → `isDirty.set(true)` → 保存ボタンに赤い丸印表示
2. **Pushボタンをクリック** → Push実行 → 成功時に `isDirty.set(false)` → 赤い丸印消える
3. **未保存の状態でPullボタンをクリック** → 確認ダイアログ表示
4. **未保存の状態でタブを閉じる** → ブラウザ標準の確認ダイアログ表示

---

## マークダウンプレビュー機能

### 概要

リーフのマークダウンコンテンツをHTMLとしてレンダリングし、読みやすいプレビューを表示します。編集モードとプレビューモードをトグルで切り替え可能です。

### 技術スタック

- **marked**: マークダウン→HTML変換（軽量・高速、約50KB）
- **DOMPurify**: XSS対策のHTMLサニタイゼーション（約50KB）

```typescript
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// マークダウンをHTMLに変換してサニタイズ
$: htmlContent = DOMPurify.sanitize(marked(leaf.content) as string)
```

### プレビュートグル機能

#### ボタン配置

- **編集モード時**: 保存ボタンの左隣に👁️（目）のプレビューボタン
- **プレビューモード時**: 保存ボタンの左隣に✏️（鉛筆）の編集ボタン

#### トグル関数

```typescript
// 左ペイン用
function togglePreview() {
  if ($currentView === 'edit') {
    currentView.set('preview')
  } else if ($currentView === 'preview') {
    currentView.set('edit')
  }
}

// 右ペイン用
function togglePreviewRight() {
  if (rightView === 'edit') {
    rightView = 'preview'
  } else if (rightView === 'preview') {
    rightView = 'edit'
  }
  updateUrlFromState()
}
```

#### 左右ペイン独立制御

- 左ペインと右ペインは独立してプレビュー/編集を切り替え可能
- 同じリーフを左右で開いても、片方を編集、もう片方をプレビューなど自由に組み合わせ可能

### URLルーティング対応

#### パスサフィックス

プレビューモード時は`:preview`サフィックスをURLに追加。

```
# 左が編集、右がプレビュー
?left=/ノート1/リーフ1&right=/ノート1/リーフ1:preview

# 両方プレビュー
?left=/ノート1/リーフ1:preview&right=/ノート2/リーフ2:preview
```

#### buildPath関数

```typescript
export function buildPath(
  note: Note | null,
  leaf: Leaf | null,
  notes: Note[],
  view?: string
): string {
  let path = segments.join('>')

  // プレビューモードの場合は `:preview` サフィックスを追加
  if (view === 'preview' && leaf) {
    path += ':preview'
  }

  return path
}
```

#### resolvePath関数

```typescript
export function resolvePath(path: string, notes: Note[], leaves: Leaf[]): PathResolution {
  // `:preview` サフィックスを検出
  let isPreview = false
  let cleanPath = path
  if (path.endsWith(':preview')) {
    isPreview = true
    cleanPath = path.slice(0, -8) // ':preview' を除去
  }

  // ... パス解決処理 ...

  return { type: 'leaf', note: subNote, leaf, isPreview }
}
```

### PreviewView.svelteコンポーネント

#### 基本構造

```svelte
<script lang="ts">
  import { marked } from 'marked'
  import DOMPurify from 'dompurify'
  import type { Leaf } from '../../lib/types'

  export let leaf: Leaf

  // マークダウンをHTMLに変換してサニタイズ
  $: htmlContent = DOMPurify.sanitize(marked(leaf.content) as string)
</script>

<section class="preview-section">
  <div class="preview-content">
    {@html htmlContent}
  </div>
</section>
```

#### スタイリング

テーマのCSS変数に追従した全マークダウン要素のスタイル：

```css
/* 見出し */
.preview-content :global(h1) {
  font-size: 2em;
  border-bottom: 2px solid var(--accent-color);
  padding-bottom: 0.3em;
}

/* コードブロック */
.preview-content :global(pre) {
  background: var(--bg-secondary);
  padding: 1em;
  border-radius: 5px;
}

/* リンク */
.preview-content :global(a) {
  color: var(--accent-color);
}

/* 引用 */
.preview-content :global(blockquote) {
  border-left: 4px solid var(--accent-color);
  padding-left: 1em;
}
```

### ビュー型の拡張

#### types.ts

```typescript
export type View = 'home' | 'settings' | 'edit' | 'note' | 'preview'
```

#### App.svelte

```svelte
{:else if $currentView === 'preview' && $currentLeaf}
  <PreviewView leaf={$currentLeaf} />
{/if}
```

### Footerボタンの切り替え

#### 編集モード時

```svelte
<button on:click={togglePreview} title="プレビュー">
  <svg><!-- 👁️（目）アイコン --></svg>
</button>
```

#### プレビューモード時

```svelte
<button on:click={togglePreview} title="編集">
  <svg><!-- ✏️（鉛筆）アイコン --></svg>
</button>
```

### 読み取り専用制御

プレビューモード中は編集不可。CodeMirrorは表示されず、PreviewView.svelteのみが表示されます。

### セキュリティ

#### XSS対策

DOMPurifyでHTMLをサニタイズし、悪意のあるスクリプトを除去。

```typescript
// marked が生成した HTML を DOMPurify でサニタイズ
const htmlContent = DOMPurify.sanitize(marked(leaf.content) as string)
```

#### Svelteの{@html}

```svelte
<!-- サニタイズ済みHTMLを安全に表示 -->
{@html htmlContent}
```

### 2ペイン対応

#### 使用例

- **左ペイン**: リーフAを編集
- **右ペイン**: リーフAをプレビュー → リアルタイムで編集内容がプレビューに反映
- **左ペイン**: リーフBを編集
- **右ペイン**: リーフCをプレビュー → 独立して動作

#### 同期動作

同じリーフを左右で開いている場合、編集内容は即座に両方のペインに反映されるため、編集とプレビューをリアルタイムで確認できます。

### 動作フロー

1. **リーフを編集モードで開く** → CodeMirrorでマークダウンを編集
2. **プレビューボタンをクリック** → PreviewViewに切り替え → HTMLレンダリング表示
3. **編集ボタンをクリック** → EditorViewに戻る
4. **URLに状態を保存** → `:preview`サフィックスでプレビュー状態を永続化
5. **ブラウザの戻る/進むボタン** → 編集/プレビューを行き来できる

---

## 編集/プレビュー間のスクロール同期

### 概要

2ペイン表示で同じリーフを左右に開いている場合（一方が編集モード、他方がプレビューモード）、スクロール位置が双方向に自動同期されます。これにより、長いマークダウン文書の特定箇所を編集しながらプレビューを確認する作業が効率化されます。

### 動作条件

スクロール同期は以下の条件をすべて満たす場合にのみ有効になります：

1. **2ペイン表示**: 画面アスペクト比が横>縦（`isDualPane === true`）
2. **同じリーフ**: 左右のペインで同じリーフID（`$currentLeaf.id === rightLeaf.id`）
3. **片方が編集、もう片方がプレビュー**:
   - 左が`edit`、右が`preview`
   - または左が`preview`、右が`edit`

### 技術実装

#### コンポーネント構成

スクロール同期は4つのコンポーネントで実装されています：

1. **MarkdownEditor.svelte** - CodeMirrorのスクロール制御
2. **PreviewView.svelte** - プレビューのスクロール制御
3. **EditorView.svelte** - スクロールイベントのパススルー
4. **App.svelte** - 左右ペイン間の同期ロジック

#### MarkdownEditor.svelte

```typescript
export let onScroll: ((scrollTop: number, scrollHeight: number) => void) | null = null

let isScrollingSynced = false // 無限ループ防止フラグ

// 外部からスクロール位置を設定
export function scrollTo(scrollTop: number) {
  if (!editorView || isScrollingSynced) return

  isScrollingSynced = true
  const scroller = editorView.scrollDOM
  if (scroller) {
    scroller.scrollTop = scrollTop
  }
  // 次のイベントループでフラグをリセット
  setTimeout(() => {
    isScrollingSynced = false
  }, 0)
}

// スクロールイベントを親に通知
EditorView.domEventHandlers({
  scroll: (event) => {
    if (isScrollingSynced || !onScroll) return
    const target = event.target as HTMLElement
    if (target) {
      onScroll(target.scrollTop, target.scrollHeight)
    }
  },
})
```

#### PreviewView.svelte

```typescript
export let onScroll: ((scrollTop: number, scrollHeight: number) => void) | null = null

let previewSection: HTMLElement
let isScrollingSynced = false // 無限ループ防止フラグ

// 外部からスクロール位置を設定
export function scrollTo(scrollTop: number) {
  if (!previewSection || isScrollingSynced) return

  isScrollingSynced = true
  previewSection.scrollTop = scrollTop
  setTimeout(() => {
    isScrollingSynced = false
  }, 0)
}

// スクロールイベントを親に通知
function handleScroll(event: Event) {
  if (isScrollingSynced || !onScroll) return
  const target = event.target as HTMLElement
  if (target) {
    onScroll(target.scrollTop, target.scrollHeight)
  }
}
```

```svelte
<section class="preview-section" bind:this={previewSection} on:scroll={handleScroll}>
  <!-- プレビューコンテンツ -->
</section>
```

#### EditorView.svelte

```typescript
export let onScroll: ((scrollTop: number, scrollHeight: number) => void) | null = null

let markdownEditor: any = null

// スクロール位置設定をMarkdownEditorに委譲
export function scrollTo(scrollTop: number) {
  if (markdownEditor && markdownEditor.scrollTo) {
    markdownEditor.scrollTo(scrollTop)
  }
}
```

```svelte
<MarkdownEditor
  bind:this={markdownEditor}
  content={leaf.content}
  {theme}
  onChange={handleContentChange}
  {onScroll}
/>
```

#### App.svelte - 双方向同期ロジック

```typescript
// コンポーネント参照
let leftEditorView: any = null
let leftPreviewView: any = null
let rightEditorView: any = null
let rightPreviewView: any = null

// 左ペインのスクロール → 右ペインに同期
function handleLeftScroll(scrollTop: number, scrollHeight: number) {
  // 同期条件チェック
  if (!isDualPane || !$currentLeaf || !rightLeaf || $currentLeaf.id !== rightLeaf.id) return
  if (
    ($currentView === 'edit' && rightView === 'preview') ||
    ($currentView === 'preview' && rightView === 'edit')
  ) {
    const target = rightView === 'edit' ? rightEditorView : rightPreviewView
    if (target && target.scrollTo) {
      target.scrollTo(scrollTop)
    }
  }
}

// 右ペインのスクロール → 左ペインに同期
function handleRightScroll(scrollTop: number, scrollHeight: number) {
  // 同期条件チェック
  if (!isDualPane || !$currentLeaf || !rightLeaf || $currentLeaf.id !== rightLeaf.id) return
  if (
    (rightView === 'edit' && $currentView === 'preview') ||
    (rightView === 'preview' && $currentView === 'edit')
  ) {
    const target = $currentView === 'edit' ? leftEditorView : leftPreviewView
    if (target && target.scrollTo) {
      target.scrollTo(scrollTop)
    }
  }
}
```

```svelte
<!-- 左ペイン -->
{:else if $currentView === 'edit' && $currentLeaf}
  <EditorView
    bind:this={leftEditorView}
    onScroll={handleLeftScroll}
    {/* ... */}
  />
{:else if $currentView === 'preview' && $currentLeaf}
  <PreviewView
    bind:this={leftPreviewView}
    onScroll={handleLeftScroll}
    {/* ... */}
  />
{/if}

<!-- 右ペイン -->
{:else if rightView === 'edit' && rightLeaf}
  <EditorView
    bind:this={rightEditorView}
    onScroll={handleRightScroll}
    {/* ... */}
  />
{:else if rightView === 'preview' && rightLeaf}
  <PreviewView
    bind:this={rightPreviewView}
    onScroll={handleRightScroll}
    {/* ... */}
  />
{/if}
```

### 無限ループ防止

#### 問題

スクロール同期では以下のような無限ループが発生する可能性があります：

1. 左ペインでスクロール → `handleLeftScroll`が発火
2. 右ペインの`scrollTo()`を呼び出し → 右ペインがスクロール
3. 右ペインのスクロールイベント発火 → `handleRightScroll`が発火
4. 左ペインの`scrollTo()`を呼び出し → 左ペインがスクロール
5. 1に戻る（無限ループ）

#### 解決策

各コンポーネントで`isScrollingSynced`フラグを使用し、外部からの`scrollTo()`呼び出し中はスクロールイベントを無視します。

```typescript
let isScrollingSynced = false

export function scrollTo(scrollTop: number) {
  if (isScrollingSynced) return // すでに同期中なら何もしない

  isScrollingSynced = true
  // スクロール位置を設定
  previewSection.scrollTop = scrollTop
  // 次のイベントループでフラグをリセット
  setTimeout(() => {
    isScrollingSynced = false
  }, 0)
}

function handleScroll(event: Event) {
  if (isScrollingSynced || !onScroll) return // 同期中ならイベントを無視
  onScroll(target.scrollTop, target.scrollHeight)
}
```

`setTimeout(..., 0)`を使用することで、スクロール処理が完了してから次のイベントループでフラグをリセットします。

### 双方向性

スクロール同期は完全に双方向です：

- **左→右**: 左ペインをスクロール → 右ペインが追従
- **右→左**: 右ペインをスクロール → 左ペインが追従

どちらのペインからでも自由にスクロールでき、もう一方のペインが自動的に追従します。

### 使用例

#### 長いマークダウンを編集

```
┌─────────────────────┬─────────────────────┐
│ 左ペイン（編集）     │ 右ペイン（プレビュー）│
│                     │                     │
│ # 見出し1           │  見出し1            │
│ 本文...             │  本文...            │
│                     │                     │
│ ## 見出し2          │  見出し2            │
│ ここを編集中 ←──────│→ プレビューも       │
│                     │   自動スクロール    │
│ ## 見出し3          │  見出し3            │
│ ...                 │  ...                │
└─────────────────────┴─────────────────────┘
```

#### 片方がhome/note画面の場合

スクロール同期は無効です。左右両方が同じリーフを表示している必要があります。

```
┌─────────────────────┬─────────────────────┐
│ 左ペイン（home）     │ 右ペイン（編集）     │
│                     │                     │
│ ノート一覧          │  # リーフ1          │
│ - ノート1           │  本文...            │
│ - ノート2           │                     │
│                     │  ← スクロール同期   │
│                     │     されない        │
└─────────────────────┴─────────────────────┘
```

#### 違うリーフを表示している場合

スクロール同期は無効です。同じリーフIDである必要があります。

```
┌─────────────────────┬─────────────────────┐
│ 左ペイン（リーフA）  │ 右ペイン（リーフB）  │
│                     │                     │
│ # リーフA           │  # リーフB          │
│ 本文A...            │  本文B...           │
│                     │                     │
│ ← スクロール同期    │                     │
│    されない         │                     │
└─────────────────────┴─────────────────────┘
```

### 動作フロー

1. **2ペイン表示**: 画面を横長にする（スマホを横向き、またはPC画面）
2. **同じリーフを左右で開く**: 左ペインでリーフを選択 → 右ペインでも同じリーフを選択
3. **片方をプレビューに切り替え**: 右ペインのプレビューボタンをクリック
4. **スクロール**: 左ペイン（編集）をスクロール → 右ペイン（プレビュー）が自動追従
5. **逆方向も同様**: 右ペイン（プレビュー）をスクロール → 左ペイン（編集）が自動追従
