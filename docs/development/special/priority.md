## Priorityリーフ（優先段落の集約）

### 概要

複数のリーフに散らばった優先度付き段落を1つの仮想リーフにまとめて表示する機能。`[n]` マーカー（nは数字）付きの段落を全リーフから抽出し、優先度順にソートして表示します。

### データ構造

#### PriorityItem

| フィールド   | 型     | 説明                                     |
| ------------ | ------ | ---------------------------------------- |
| priority     | number | 優先度（数字、小さいほど優先）           |
| content      | string | 段落のテキスト内容                       |
| leafId       | string | 元のリーフID                             |
| leafTitle    | string | 元のリーフタイトル                       |
| noteId       | string | 元のノートID                             |
| noteName     | string | 元のノート名                             |
| displayOrder | number | 表示順序（ノート順 \* 10000 + リーフ順） |

#### 仮想リーフ

| 定数               | 値             |
| ------------------ | -------------- |
| PRIORITY_LEAF_ID   | `__priority__` |
| PRIORITY_LEAF_NAME | `Priority`     |

`createPriorityLeaf()`で`PriorityItem[]`から仮想リーフを生成します。`noteId`は空文字（ホーム直下）に設定されます。

### マーカー検出ロジック

#### 抽出条件

- **先頭パターン**: 段落の先頭行が `[n] ` で始まる（後ろにスペース必須）
- **末尾パターン**: 段落の最終行が ` [n]` で終わる（前にスペース必須）

`extractPriority()`関数で段落からマーカーを検出し、優先度の数値を返します。

#### スペース必須の理由

誤マッチを防ぐため：

- `array[0]` → 配列の添え字（マッチしない）
- `テキスト[1]` → 参考文献番号（マッチしない）
- `[1] タスク` → 優先マーカー（マッチする）
- `タスク [2]` → 優先マーカー（マッチする）

### ソートロジック

1. 優先度（数字昇順）
2. 同じ優先度は表示順（ノート順 \* 10000 + リーフ順）

### 保存対象の判定

#### 設計思想

このアプリはホーム直下にノートのみ許可し、リーフは許可しない仕様。そのため、ホーム直下のリーフ（noteIdが実際のノートに存在しない）は保存対象外とする汎用的なロジックで実装。

| 関数名         | 判定内容                                 |
| -------------- | ---------------------------------------- |
| isLeafSaveable | リーフのnoteIdが実際のノートに存在するか |
| isNoteSaveable | ノートのIDが`__`で始まらないか           |

#### 使用箇所

1. **Push時のフィルタリング**: 保存対象のみGitHubにPush
2. **統計計算時のフィルタリング**: リーフ数・文字数のカウント対象外
3. **パンくずリストの表示**: 実際のノートのみ表示

### UI実装

#### HomeView.svelte での表示

Priorityリーフは通常のリーフカードと同じ見た目で、常に先頭に表示されます。

#### ナビゲーション

`openPriorityView(pane)`でPriorityリーフを表示。`leftNote`/`rightNote`は`null`（ホーム直下）、`leftView`/`rightView`は`'preview'`（読み取り専用）に設定。

### リアルタイム更新

Svelte derived store `priorityItems`を使用して、リーフの変更を自動的に反映します。

### 生成されるMarkdownコンテンツ

`generatePriorityContent()`で以下の形式のMarkdownを生成：

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

| 項目               | 内容                                               |
| ------------------ | -------------------------------------------------- |
| **リーフID**       | `__priority__`                                     |
| **リーフ名**       | `Priority`                                         |
| **noteId**         | 空文字（ホーム直下）                               |
| **保存**           | コンテンツは保存対象外、バッジのみmetadataで永続化 |
| **統計**           | リーフ数・文字数に含めない                         |
| **表示位置**       | ホーム画面の先頭（Offlineリーフの次）              |
| **表示モード**     | プレビューのみ（読み取り専用）                     |
| **バッジ**         | 設定可能（metadata.jsonで永続化）                  |
| **更新タイミング** | リーフ変更時に自動更新                             |

### バッジ情報の永続化

Priorityリーフのバッジ情報（アイコン・色）は`metadata.json`の`leaves`セクションに保存されます。

```json
{
  "leaves": {
    "__priority__": {
      "id": "__priority__",
      "updatedAt": 0,
      "order": 0,
      "badgeIcon": "circle",
      "badgeColor": "#c7a443"
    }
  }
}
```

**注意点:**

- `updatedAt`は固定値`0`を使用（比較時の差分検出を防ぐため）
- コンテンツは動的に生成されるためGitには保存されない
- バッジ情報のみがデバイス間で同期される

### ファイル構成

`src/lib/priority.ts`に以下の関数・ストアを配置：

| 名前                      | 説明                                |
| ------------------------- | ----------------------------------- |
| extractPriority           | マーカー検出                        |
| removePriorityMarker      | マーカー除去                        |
| extractPriorityItems      | リーフから優先段落を抽出            |
| priorityItems             | derived store                       |
| generatePriorityContent   | Markdown生成（プレビュー用）        |
| generatePriorityPlainText | プレーンテキスト生成（QR/シェア用） |
| createPriorityLeaf        | 仮想リーフ生成                      |
| isPriorityLeaf            | リーフID判定                        |
| isLeafSaveable            | 保存対象判定（リーフ）              |
| isNoteSaveable            | 保存対象判定（ノート）              |

---
