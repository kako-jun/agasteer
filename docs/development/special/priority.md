## Priorityリーフ（優先段落の集約）

### 概要

複数のリーフに散らばった優先度付き段落を1つの仮想リーフにまとめて表示する機能。`[n]` マーカー（nは数字）付きの段落を全リーフから抽出し、優先度順にソートして表示します。

### データ構造

#### PriorityItem

```typescript
interface PriorityItem {
  /** 優先度（数字、小さいほど優先） */
  priority: number
  /** 段落のテキスト内容 */
  content: string
  /** 元のリーフID */
  leafId: string
  /** 元のリーフタイトル */
  leafTitle: string
  /** 元のノートID */
  noteId: string
  /** 元のノート名 */
  noteName: string
  /** 表示順序（ノート順 + リーフ順） */
  displayOrder: number
}
```

#### 仮想リーフ

```typescript
const PRIORITY_LEAF_ID = '__priority__'
const PRIORITY_LEAF_NAME = 'Priority'

function createPriorityLeaf(items: PriorityItem[]): Leaf {
  return {
    id: PRIORITY_LEAF_ID,
    title: PRIORITY_LEAF_NAME,
    noteId: '', // 空文字 = ホーム直下
    content: generatePriorityContent(items),
    updatedAt: Date.now(),
    order: 0,
  }
}
```

### マーカー検出ロジック

#### 抽出条件

- **先頭パターン**: 段落の先頭行が `[n] ` で始まる（後ろにスペース必須）
- **末尾パターン**: 段落の最終行が ` [n]` で終わる（前にスペース必須）

```typescript
function extractPriority(paragraph: string): number | null {
  const lines = paragraph.split('\n')
  const firstLine = lines[0]
  const lastLine = lines[lines.length - 1]

  // 先頭行の左端が [n] で始まり、その後にスペースがある場合
  const startMatch = firstLine.match(/^\[(\d+)\] /)
  if (startMatch) {
    return parseInt(startMatch[1], 10)
  }

  // 最後行の右端が [n] で終わり、その前にスペースがある場合
  const endMatch = lastLine.match(/ \[(\d+)\]$/)
  if (endMatch) {
    return parseInt(endMatch[1], 10)
  }

  return null
}
```

#### スペース必須の理由

誤マッチを防ぐため：

- `array[0]` → 配列の添え字（マッチしない）
- `テキスト[1]` → 参考文献番号（マッチしない）
- `[1] タスク` → 優先マーカー（マッチする）
- `タスク [2]` → 優先マーカー（マッチする）

### ソートロジック

```typescript
items.sort((a, b) => {
  // 1. 優先度（数字昇順）
  if (a.priority !== b.priority) {
    return a.priority - b.priority
  }
  // 2. 同じ優先度は表示順（ノート順 * 10000 + リーフ順）
  return a.displayOrder - b.displayOrder
})
```

### 保存対象の判定

#### 設計思想

このアプリはホーム直下にノートのみ許可し、リーフは許可しない仕様。そのため、ホーム直下のリーフ（noteIdが実際のノートに存在しない）は保存対象外とする汎用的なロジックで実装。

```typescript
/**
 * リーフがGit保存対象かどうかを判定
 */
function isLeafSaveable(leaf: Leaf, allNotes: Note[]): boolean {
  return allNotes.some((n) => n.id === leaf.noteId)
}

/**
 * ノートがGit保存対象かどうかを判定
 */
function isNoteSaveable(note: Note): boolean {
  return !note.id.startsWith('__')
}
```

#### 使用箇所

1. **Push時のフィルタリング** (`App.svelte`)

```typescript
const saveableNotes = $notes.filter((n) => isNoteSaveable(n))
const saveableLeaves = $leaves.filter((l) => isLeafSaveable(l, saveableNotes))
```

2. **統計計算時のフィルタリング** (`App.svelte`)

```typescript
function rebuildLeafStats(allLeaves: Leaf[], allNotes: Note[]) {
  for (const leaf of allLeaves) {
    if (!isLeafSaveable(leaf, allNotes)) continue
    // リーフ数・文字数をカウント
  }
}
```

3. **パンくずリストの表示** (`breadcrumbs.ts`)

```typescript
if (note && isNoteSaveable(note)) {
  // 実際のノートのみパンくずに表示
}
```

### UI実装

#### HomeView.svelte での表示

Priorityリーフは通常のリーフカードと同じ見た目で、常に先頭に表示：

```svelte
<div class="card-grid">
  <!-- Priority リーフ: 常に先頭に表示 -->
  {#if priorityLeaf}
    <div
      class="leaf-card"
      class:selected={vimMode && isActive && selectedIndex === 0}
      on:click={onSelectPriority}
    >
      <BadgeButton
        icon={priorityLeaf.badgeIcon || ''}
        color={priorityLeaf.badgeColor || ''}
        onChange={(icon, color) => onUpdatePriorityBadge(icon, color)}
      />
      <strong>{priorityLeaf.title}</strong>
      <div class="card-meta">
        <small class="leaf-stats">
          {formatLeafStats(priorityLeaf.content)}
        </small>
        <small class="leaf-updated">
          {formatDateTime(priorityLeaf.updatedAt, 'short')}
        </small>
      </div>
    </div>
  {/if}

  <!-- 通常のノート一覧 -->
  {#each notes as note}
    <NoteCard {note} ... />
  {/each}
</div>
```

#### ナビゲーション

```typescript
function openPriorityView(pane: Pane) {
  const items = get(priorityItems)
  const priorityLeaf = createPriorityLeaf(items)

  if (pane === 'left') {
    leftNote = null // ホーム直下なのでnull
    leftLeaf = priorityLeaf
    leftView = 'preview' // 読み取り専用
  } else {
    rightNote = null
    rightLeaf = priorityLeaf
    rightView = 'preview'
  }
}
```

### リアルタイム更新

Svelte derived storeを使用して、リーフの変更を自動的に反映：

```typescript
export const priorityItems = derived([leaves, notes], ([$leaves, $notes]) => {
  const items: PriorityItem[] = []

  for (const leaf of $leaves) {
    const noteName = getNoteName(leaf.noteId, $notes)
    const displayOrder = getNoteDisplayOrder(leaf.noteId, $notes) * 10000 + leaf.order
    const extracted = extractPriorityItems(leaf, noteName, displayOrder)
    items.push(...extracted)
  }

  items.sort(/* 優先度順 → 表示順 */)
  return items
})
```

### 生成されるMarkdownコンテンツ

```typescript
function generatePriorityContent(items: PriorityItem[]): string {
  if (items.length === 0) {
    return `# Priority\n\n_No priority items found._\n_Add markers like "[1] " at the start or " [2]" at the end of paragraphs._`
  }

  const lines: string[] = ['# Priority', '']

  for (const item of items) {
    // 優先度バッジ + 内容
    lines.push(`**[${item.priority}]** ${item.content}`)
    // 出典（リーフ名 @ ノート名）
    lines.push(`_— ${item.leafTitle} @ ${item.noteName}_`)
    lines.push('')
  }

  return lines.join('\n')
}
```

出力例：

```markdown
# Priority

**[1]** 最優先で対応すべきタスク
_— タスク管理 @ 仕事ノート_

**[2]** 重要な作業項目
_— 週次レビュー @ プロジェクトA_

**[3]** 今週中に完了させる
_— TODO @ 個人メモ_
```

### 仕様まとめ

| 項目               | 内容                             |
| ------------------ | -------------------------------- |
| **リーフID**       | `__priority__`                   |
| **リーフ名**       | `Priority`                       |
| **noteId**         | 空文字（ホーム直下）             |
| **保存**           | Git保存対象外（仮想リーフ）      |
| **統計**           | リーフ数・文字数に含めない       |
| **表示位置**       | ホーム画面の先頭                 |
| **表示モード**     | プレビューのみ（読み取り専用）   |
| **バッジ**         | 設定可能（ただし永続化されない） |
| **更新タイミング** | リーフ変更時に自動更新           |

### ファイル構成

```
src/lib/priority.ts
├── extractPriority()          # マーカー検出
├── removePriorityMarker()     # マーカー除去
├── extractPriorityItems()     # リーフから優先段落を抽出
├── priorityItems              # derived store
├── generatePriorityContent()  # Markdown生成
├── createPriorityLeaf()       # 仮想リーフ生成
├── isPriorityLeaf()           # リーフID判定
├── isLeafSaveable()           # 保存対象判定（リーフ）
└── isNoteSaveable()           # 保存対象判定（ノート）
```

---
