## バッジ機能（アイコン＋色パレット）

### 概要

ノートとリーフのカード右上にバッジを表示する機能。アイコンと色を自由に組み合わせて視覚的に区別できます。

### データ構造

```typescript
interface Note {
  id: string
  name: string
  parentId: string | null
  order: number
  badgeIcon?: string // アイコン識別子（例: 'star', 'heart'）
  badgeColor?: string // カラーコード（例: '#ff6b6b'）
}

interface Leaf {
  id: string
  title: string
  content: string
  noteId: string
  order: number
  updatedAt: number
  badgeIcon?: string
  badgeColor?: string
}
```

### UI実装

#### バッジ表示

```svelte
<div class="card">
  <button class="badge" on:click={openBadgePicker}>
    {#if badgeIcon && badgeIcon !== '+'}
      <span class="badge-icon" style="color: {badgeColor}">{badgeIcon}</span>
    {:else}
      <span class="badge-plus">+</span>
    {/if}
  </button>
</div>
```

#### アイコン選択UI（5×5グリッド）

```svelte
<div class="icon-grid">
  {#each icons as icon}
    <button
      class="icon-option"
      class:selected={selectedIcon === icon}
      on:click={() => selectIcon(icon)}
    >
      {icon}
    </button>
  {/each}
</div>
```

利用可能なアイコン（25種類）:

- スター、ハート、チェック、フラグ、ブックマーク
- 電球、ピン、ベル、時計、カレンダー
- その他フォントアイコン

#### 色選択UI（5色パレット）

```svelte
<div class="color-palette">
  {#each colors as color}
    <button
      class="color-option"
      style="background-color: {color}"
      class:selected={selectedColor === color}
      on:click={() => selectColor(color)}
    />
  {/each}
</div>
```

カラーパレット:

- `#ff6b6b` (赤)
- `#ffd93d` (黄)
- `#6bcb77` (緑)
- `#4d96ff` (青)
- `#9b59b6` (紫)

### 保存先

- **IndexedDB**: ノート/リーフのフィールドとして保存
- **GitHub**: `metadata.json`内の各ノート/リーフエントリに保存

---
