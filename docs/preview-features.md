# プレビュー機能

SimplestNote.mdのマークダウンプレビュー関連機能の実装詳細について説明します。

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
