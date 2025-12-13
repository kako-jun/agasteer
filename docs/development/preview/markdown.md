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
