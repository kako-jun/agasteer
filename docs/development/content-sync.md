# コンテンツ同期機能

Agasteerのコンテンツ同期機能の実装詳細について説明します。

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
