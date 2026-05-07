## ウェルカムポップアップ

### 概要

初回訪問時に表示されるウェルカムポップアップ。アプリの使い方を簡潔に紹介し、ユーザーがスムーズに開始できるようサポートします。

### 機能

- **言語自動検出**: ブラウザ/OSの言語設定に基づいて日本語/英語で表示
- **レスポンシブ対応**: スマートフォンなど狭い画面ではボタンが縦並びに配置
- **初回のみ表示**: LocalStorageで表示済みフラグを管理

### レスポンシブ実装

狭い画面（480px以下）ではボタンを縦配置に自動切替。

### i18n対応

`welcome.*`キーで日本語/英語の翻訳を提供。

---

## 初回ガイド（吹き出し）

初めての操作時に、ボタンの近くに吹き出しでヒントを表示するシンプルなガイド機能。

### 表示タイミング

| 条件                       | 吹き出しの内容                           | 表示位置         |
| -------------------------- | ---------------------------------------- | ---------------- |
| ノートが0個のとき          | 「ここをクリックしてノートを作成」       | ノート追加ボタン |
| リーフが0個のとき          | 「ここをクリックしてリーフを作成」       | リーフ追加ボタン |
| 初めてダーティになったとき | 「GitHubに保存してデータを残しましょう」 | 保存ボタン       |

### 消える条件

- 該当のボタンをクリック
- 吹き出し自体をクリック（×ボタン）

一度消すと、LocalStorageにフラグが保存され、二度と表示されません。

### 状態管理

| フラグ           | 用途                              |
| ---------------- | --------------------------------- |
| `tourShown`      | ノート/リーフ作成ガイドの表示済み |
| `saveGuideShown` | 保存ガイドの表示済み              |

### ファイル構成

| ファイル                                         | 説明             |
| ------------------------------------------------ | ---------------- |
| `src/lib/tour.ts`                                | ガイドロジック   |
| `src/lib/data/storage.ts`                        | フラグの永続化   |
| `src/components/buttons/PushButton.svelte`       | 保存ガイドの表示 |
| `src/components/layout/footer/HomeFooter.svelte` | ノート作成ガイド |
| `src/components/layout/footer/NoteFooter.svelte` | リーフ作成ガイド |

### スタイル

各コンポーネントに`.guide-tooltip`クラスで吹き出しスタイルを定義。

- 左端のボタン: `left: 0;` で左寄せ、矢印も `left: 12px;`
- 右端のボタン: `right: 0;` で右寄せ、矢印も `right: 12px;`

これにより、画面端で吹き出しが見切れるのを防止。

### デバッグ

開発者コンソールで以下を実行してリロードするとガイドをリセットできます:

```js
// 現行（#131 以降）: globalState 構造
const data = JSON.parse(localStorage.getItem('agasteer'))
data.globalState.tourShown = false
data.globalState.saveGuideShown = false
localStorage.setItem('agasteer', JSON.stringify(data))
```

> 旧形式 `data.state.tourShown` は #131 で廃止された。現行の永続化キーは `data.globalState.*`（リポ非依存のフラグ）と `data.byRepo[<repoName>].*`（リポ単位の状態）に分かれている。詳細は [storage.md](../storage.md) を参照。

### localStorage 破損時の診断（#208）

`loadStorageData()` の JSON parse が失敗した場合、raw を `agasteer-corrupt-<timestamp>` キーに退避してからデフォルト値で起動する。`tourShown` などのヒントが想定外に再表示されたら、まず以下を確認する:

```js
// 破損退避が残っていないか
Object.keys(localStorage).filter((k) => k.startsWith('agasteer-corrupt-'))
```

退避が見つかれば、JSON 破損による silent fallback が原因（= 本当に消えたわけではない）。コンソールにも `localStorage parse failed; raw saved as "..."` のログが残る。
