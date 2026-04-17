# Offlineリーフ

ローカル専用のメモ機能。GitHubとの同期対象外で、IndexedDBにのみ保存される。

## 概要

- **用途**: オフライン時や急ぎのメモ用
- **保存先**: IndexedDBのみ（GitHubには保存しない）
- **表示位置**: ホーム画面の先頭（Priorityリーフの前）
- **編集制限**: なし（Pull中でも編集可能）

## 仕様

| 項目         | 内容                            |
| ------------ | ------------------------------- |
| **リーフID** | `__offline__`                   |
| **リーフ名** | `Offline`                       |
| **noteId**   | 空文字（ホーム直下）            |
| **order**    | -1（最上位表示）                |
| **保存**     | IndexedDB（`offlineLeafStore`） |
| **統計**     | リーフ数・文字数に含めない      |
| **バッジ**   | 設定可能（IndexedDBに永続化）   |

## 実装

### 定数とファクトリ関数

| 定数/関数           | 説明                               |
| ------------------- | ---------------------------------- |
| OFFLINE_LEAF_NAME   | 固定名（`Offline`）                |
| OFFLINE_LEAF_ID     | 固定ID（`__offline__`）            |
| createOfflineLeaf() | オフラインリーフを生成             |
| isOfflineLeaf()     | リーフIDがオフラインリーフかどうか |

### ストア管理

`offlineLeafStore`でオフラインリーフの状態（content, badgeIcon, badgeColor）を管理。

### IndexedDB保存

| 関数名          | 説明                  |
| --------------- | --------------------- |
| saveOfflineLeaf | IndexedDBに保存       |
| loadOfflineLeaf | IndexedDBから読み込み |

## Pull中の編集保護除外

Pull中はガラス効果オーバーレイが表示されるが、Offlineリーフは除外される。`isOfflineLeaf(currentLeaf.id)`でチェック。

ガラス効果の表示と同時に、背面の `<main class="main-pane">` に `inert` 属性が付与され、エディタや Priority リーフのリンクなど背面要素が完全に操作不可になる（視覚的なオーバーレイだけでなく DOM レベルで遮断）。Offline リーフを開いている間はオーバーレイも `inert` も適用されず、通常通り編集できる。

## 検索機能

検索機能はオフラインリーフも対象に含む。

- **リーフ名検索**: 「Offline」で検索するとヒット
- **本文検索**: オフラインリーフの本文も検索対象
- **パス表示**: noteIdが空のため、パスは「Offline」のみ（ノート名なし）

### 実装

`searchResults`派生ストアで`offlineLeafStore`を監視し、`createOfflineLeaf()`でLeaf形式に変換して検索対象に追加。

## ファイル構成

| ファイル                          | 内容                             |
| --------------------------------- | -------------------------------- |
| `src/lib/utils/offline.ts`        | 定数、ファクトリ関数、判定関数   |
| `src/lib/stores/stores.svelte.ts` | offlineLeafStore                 |
| `src/lib/data/storage.ts`         | saveOfflineLeaf, loadOfflineLeaf |
