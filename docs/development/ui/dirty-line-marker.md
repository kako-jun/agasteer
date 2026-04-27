# 行単位ダーティマーカー機能

## 概要

エディタ内で変更された行（ダーティ行）に視覚的なマーカーを表示する機能。VSCodeやPHPStormのように、最後にPushした状態から変更された行を識別できる。

## 実装ファイル

| ファイル                                      | 役割                                        |
| --------------------------------------------- | ------------------------------------------- |
| `src/lib/editor/dirty-lines.ts`               | 差分計算とCodeMirror拡張のファクトリ        |
| `src/lib/stores/stores.svelte.ts`             | `getLastPushedContent()` 基準コンテンツ取得 |
| `src/components/editor/MarkdownEditor.svelte` | 拡張機能の統合（常時有効）                  |
| `src/App.css`                                 | テーマ別CSS変数とマーカースタイル           |

## 既存のダーティチェック機能との連携

### リーフ単位のダーティチェック

Agasteerには既にリーフ単位のダーティチェック機能がある：

| ストア/関数        | 役割                                 | 場所                              |
| ------------------ | ------------------------------------ | --------------------------------- |
| `dirtyLeafIds`     | ダーティなリーフIDのSet              | `src/lib/stores/stores.svelte.ts` |
| `lastPushedLeaves` | 最後にPushした時点のリーフ状態       | `src/lib/stores/stores.svelte.ts` |
| `detectDirtyIds()` | スナップショット比較でダーティを検出 | `src/lib/stores/stores.svelte.ts` |

### 行単位マーカーとの関係

```
┌─────────────────────────────────────────────────────────────┐
│ ドキュメント変更（CodeMirror updateListener）              │
│   ↓ (200ms デバウンス)                                      │
│ 行単位ダーティ計算 (computeDirtyLines)                      │
│   ↓                                                         │
│ ガターマーカー表示                                          │
└─────────────────────────────────────────────────────────────┘
```

**設計方針**: 行単位の差分（LCS）が真の dirty 状態を返すため、リーフ単位 dirty フラグでガードしない。`dirtyLeafIds` の更新タイミングと競合して、既存行の編集がマーカーに反映されない問題（#163）の再発を避けるため。Push 成功後は `getBaseContent()` が新しいスナップショットを返し、LCS が空 Set を返すことでマーカーが自然にクリアされる。

## 設計と実装

### 基準コンテンツの管理

```typescript
// 基準コンテンツを動的に取得する関数（Push後の更新を反映）
const getBaseContent = () => getLastPushedContent(leafId)
```

- `lastPushedLeaves` または `lastPushedArchiveLeaves` から検索
- 見つからなければ `null`（新規リーフ = 全行がダーティ）
- **毎回動的に取得**（Push成功後にスナップショットが更新されるため、キャッシュすると古い基準で比較してしまう）

### 行単位差分の計算

```
基準コンテンツ:        現在のコンテンツ:      結果:
┌──────────────┐      ┌──────────────┐      ┌─────────────────┐
│ 1: # Title   │      │ 1: # Title   │      │ 1: (変更なし)   │
│ 2:           │  vs  │ 2:           │  →   │ 2: (変更なし)   │
│ 3: Hello     │      │ 3: Hello!    │      │ 3: ダーティ     │
│ 4: World     │      │ 4: World     │      │ 4: (変更なし)   │
│              │      │ 5: New line  │      │ 5: 新規行       │
└──────────────┘      └──────────────┘      └─────────────────┘
```

**アルゴリズム**: LCS（Longest Common Subsequence）ベースの差分検出（O(n×m)）

基準と現在の行配列でLCSを計算し、LCSに含まれない行をダーティとしてマークする。
単純な行番号比較では行の挿入/削除で後続行が全てダーティになるが、LCSなら順序を保持した共通部分を正しく検出できる。

```typescript
export function computeDirtyLines(baseContent: string | null, currentContent: string): Set<number> {
  // 基準がnull = 新規リーフ → 全行がダーティ
  if (baseContent === null) {
    // 全行を追加
  }
  const baseLines = baseContent.split('\n')
  const currentLines = currentContent.split('\n')
  // LCSを計算し、LCSに含まれない行をダーティとしてマーク
  const lcsIndices = computeLCS(baseLines, currentLines)
  // lcsIndicesに含まれない行 → ダーティ
}
```

### パフォーマンス最適化

#### 1. デバウンス（200ms）

```typescript
// 入力が止まってから計算
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function debouncedUpdate(view) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    updateDirtyLines(view)
  }, 200)
}
```

#### 2. 基準コンテンツの動的取得

```typescript
// 基準コンテンツを動的に取得する関数を渡す
const getBaseContent = () => getLastPushedContent(leafId)

// 毎回最新の基準を取得して比較（Push後の更新を即座に反映）
const dirtyLines = computeDirtyLines(getBaseContent(), currentContent)
```

### CodeMirrorガターマーカー

```typescript
// StateFieldでダーティ行を管理
const dirtyLinesField = StateField.define<Set<number>>({
  create: () => new Set(),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDirtyLines)) return effect.value
    }
    return value
  },
})

// ガター定義
const dirtyLineGutter = gutter({
  class: 'cm-dirty-gutter',
  lineMarker(view, line) {
    const lineNo = view.state.doc.lineAt(line.from).number
    const dirtyLines = view.state.field(dirtyLinesField)
    return dirtyLines.has(lineNo) ? marker : null
  },
  // StateFieldが変更されたらガターを再描画する
  // これがないとPush後にダーティ線が即座に消えない
  lineMarkerChange(update) {
    return update.transactions.some((tr) => tr.effects.some((e) => e.is(setDirtyLines)))
  },
})
```

## UI/UX

### 表示方法: ガター縦線

VSCodeやJetBrains IDEで採用されている方式。変更行の左端に縦線を表示。

```
┌──┬────────────────────────┐
│1 │ # Title                │
│2 │                        │
│3▌│ Hello World (変更)     │  ← 左端に縦線
│4 │ Foo                    │
│5▌│ New line (追加)        │  ← 左端に縦線
└──┴────────────────────────┘
```

### テーマ別の色

CSS変数 `--dirty-line` を使用：

| テーマ             | 背景色               | 線色               |
| ------------------ | -------------------- | ------------------ |
| yomi（デフォルト） | `#fdfdfc` (白)       | accent系の金色     |
| campus             | `#fdf8ec` (クリーム) | `#2f56c6` (青)     |
| greenboard         | `#102117` (濃緑)     | `#96d46a` (黄緑)   |
| whiteboard         | `#ffffff` (白)       | `#3b82f6` (青)     |
| dotsD              | `#05080f` (黒)       | `#888888` (グレー) |
| dotsF              | `#0000aa` (青)       | `#5ca8ff` (水色)   |

### CSSスタイル

```css
/* ダーティラインマーカー（変更行の左端に縦線） */
.cm-dirty-gutter {
  width: 3px;
  margin-right: 2px;
}

.cm-dirty-line-marker {
  width: 3px;
  height: 100%;
  background: var(--dirty-line);
}
```

### 設定オプション

常時有効。設定画面からの切り替えは不可。

## 実装タスク

### Phase 1: 基本実装 [完了]

- [x] 基準コンテンツ取得関数 `getLastPushedContent()`
- [x] 行単位差分計算 `computeDirtyLines()`
- [x] CodeMirrorガターマーカー `createDirtyLineExtension()`
- [x] CSS変数（テーマ別の色）

### Phase 2: 統合 [完了]

- [x] MarkdownEditor.svelteへの統合（常時有効）
- [x] EditorView.svelte / PaneView.svelte との連携

### Phase 3: 最適化 [完了]

- [x] デバウンス処理（200ms）
- [x] 基準コンテンツの動的取得（Push後の更新を即座に反映）
- [x] `dirtyLeafIds` との連携（ダーティでなければスキップ）
- [x] `lineMarkerChange` によるガター再描画（Push後に即座にマーカー消去）
- [x] クリーンアップ処理（タイマー解除）

### 今後の拡張（未実装）

- [ ] 「変更を破棄」機能（行単位でのリバート）
- [ ] 変更行へのジャンプ機能

## 参考リンク

- [CodeMirror Gutter Example](https://codemirror.net/examples/gutter/)
- [Adding a marker to the gutter if text changes - CodeMirror Discussion](https://discuss.codemirror.net/t/adding-a-marker-to-the-gutter-if-text-changes/4228)
