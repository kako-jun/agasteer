## アプリアイコン（テーマカラー対応）

### 概要

ヘッダーのアプリタイトル左側にアプリアイコンを表示する機能。アイコンの色はテーマのアクセントカラーに応じて動的に変更されます。

### 表示条件

- **デフォルトタイトル時のみ表示**: ユーザーがツール名を変更していない場合のみ表示
- **タイトル変更後は非表示**: カスタムツール名を設定した場合はアイコンを非表示

### 技術実装

#### AppIconコンポーネント

```svelte
<!-- src/components/AppIcon.svelte -->
<script lang="ts">
  export let size: number = 24
  export let color: string = 'currentColor'
</script>

<svg width={size} height={size} viewBox="0 0 100 100" fill={color}>
  <!-- SVGパス -->
</svg>
```

#### 条件付き表示

```svelte
<script>
  import AppIcon from './AppIcon.svelte'
  import { DEFAULT_SETTINGS } from '../lib/types'

  $: isDefaultTitle = settings.toolName === DEFAULT_SETTINGS.toolName
</script>

<header>
  {#if isDefaultTitle}
    <AppIcon color="var(--accent-color)" />
  {/if}
  <span class="title">{settings.toolName}</span>
</header>
```

### デザイン

- **サイズ**: 24x24px
- **色**: `var(--accent-color)` - テーマのアクセントカラー
- **位置**: アプリタイトルの左側
- **間隔**: タイトルとの間に0.5rem

---

## その他のUI改善

### GitHub設定画面の改善

#### 必須項目マーク

Repository (owner/repo)とGitHub Tokenの入力欄に赤いアスタリスク（\*）で必須であることを表示。

```svelte
<label for="repo-name">
  {$_('settings.github.repoName')} <span class="required">*</span>
</label>
```

```css
.required {
  color: #e74c3c;
  font-weight: bold;
}
```

#### リポジトリを開くボタン

Repository入力欄の右にGitHubリポジトリを直接開けるリンクボタンを配置。

```svelte
<div class="input-with-button">
  <input type="text" bind:value={settings.repoName} />
  {#if settings.repoName}
    <a
      href="https://github.com/{settings.repoName}"
      target="_blank"
      rel="noopener noreferrer"
      class="repo-link-button"
      title="Open repository on GitHub"
    >
      <svg><!-- 外部リンクアイコン --></svg>
    </a>
  {/if}
</div>
```

**機能:**

- リポジトリ名が入力されている場合のみ表示
- 新しいタブでGitHubリポジトリを開く
- ホバー時にアクセントカラーに変化

#### スマホ対応

画面幅600px以下では、GitHub設定の入力欄を縦1列に配置。

```css
@media (max-width: 600px) {
  .form-row {
    flex-direction: column;
  }
}
```

### GitHub Sponsorsリンク

設定画面の最下部にGitHub Sponsorsへのリンクボタンを配置。

```svelte
<div class="sponsor-section">
  <a
    href="https://github.com/sponsors/kako-jun"
    target="_blank"
    rel="noopener noreferrer"
    class="sponsor-link"
  >
    <svg class="heart-icon"><!-- ハートアイコン --></svg>
    <span>Sponsor on GitHub</span>
  </a>
</div>
```

**デザイン:**

- 他のボタンと統一したスタイル
- ハートアイコンにビートアニメーション（鼓動エフェクト）
- ホバー時にアクセントカラーに変化

```css
@keyframes heartbeat {
  0%,
  100% {
    transform: scale(1);
  }
  10%,
  30% {
    transform: scale(1.1);
  }
  20%,
  40% {
    transform: scale(1);
  }
}
```

### 統計パネル（StatsPanel）

ホーム画面右下にリーフ数・文字数・Push回数を表示するコンポーネント。

#### StatsPanelコンポーネント

```svelte
<!-- src/components/StatsPanel.svelte -->
<script lang="ts">
  import { leaves, metadata } from '../lib/stores'
  import { totalCharCount } from '../lib/stores'

  $: leafCount = $leaves.length
  $: charCount = $totalCharCount
  $: pushCount = $metadata.pushCount
</script>

<div class="stats-panel">
  <div class="stat-item">
    <span class="stat-label">リーフ数</span>
    <span class="stat-value">{leafCount.toLocaleString()}</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">文字数</span>
    <span class="stat-value">{charCount.toLocaleString()}</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">Push回数</span>
    <span class="stat-value">{pushCount.toLocaleString()}</span>
  </div>
</div>
```

#### 文字数キャッシュ

パフォーマンス最適化のため、文字数は個別にキャッシュし、差分更新します。

```typescript
// totalCharCountストア
export const totalCharCount = writable<number>(0)

// リーフの作成/更新/削除/Pull時に差分更新
export function updateTotalCharCount(leaves: Leaf[]): void {
  const total = leaves.reduce((sum, leaf) => sum + leaf.content.length, 0)
  totalCharCount.set(total)
}
```

#### スタイル

```css
.stats-panel {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  z-index: 0; /* カードの背面 */
  opacity: 0.5;
  pointer-events: none;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--accent-color);
}
```

### プッシュカウントの表示改善

ホーム画面のPush回数表示に3桁カンマ区切りを適用。

```svelte
<div class="stat-value">{$metadata.pushCount.toLocaleString()}</div>
```

**例:**

- 100 → 100
- 1,000 → 1,000
- 1,234,567 → 1,234,567

### Languageドロップダウンのカスタム矢印

ブラウザデフォルトの矢印を無効化し、カスタムCSS矢印を使用。テーマカラーに合わせて変化。

```css
select {
  appearance: none;
  padding-right: 2rem;
}

.select-wrapper::after {
  content: '';
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid var(--text-primary);
}
```

**メリット:**

- 右端からの距離を完全にコントロール可能
- テーマの色に自動的に追従
- 一貫したデザイン

---
