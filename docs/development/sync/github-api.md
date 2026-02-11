# GitHub API統合

AgasteerのGitHub API統合について説明します。

## 認証

Personal Access Tokenによるベーシック認証。`Authorization: Bearer {token}`ヘッダーを使用します。

---

## 接続テスト

設定画面の「接続テスト」ボタンは、実際のPullを行わずにGitHub接続が可能かどうかだけを確認します。

### 目的

- トークンが有効か確認
- リポジトリにアクセス可能か確認
- **実際のデータはPullしない**（設定画面で「ローカルの方が進んでいる」等のメッセージを出さないため）

### 処理フロー

1. 設定値のバリデーション
2. ユーザー情報取得（トークン検証）
3. リポジトリ存在確認

結果に応じて成功/失敗メッセージを返します。

### Pull/Pushとの違い

| 機能       | 実行内容                 | データ取得 |
| ---------- | ------------------------ | ---------- |
| 接続テスト | 認証・リポジトリ存在確認 | なし       |
| Pull       | 接続テスト + データ取得  | あり       |
| Push       | 接続テスト + データ送信  | あり       |

---

## Push処理（Git Tree API）

全リーフを1コミットでPushする実装。Git Tree APIを使用することで、削除・リネームを確実に処理し、APIリクエスト数を最小化（約8回）。

### ワールド別Push処理

Push時は`.agasteer/notes/`と`.agasteer/archive/`の両方を処理します。

| 条件              | 処理                                 |
| ----------------- | ------------------------------------ |
| Archiveロード済み | Home + Archive 両方を再構築          |
| Archiveロード前   | Homeのみ再構築、既存のarchive/を保持 |

**重要**: Archiveがロードされていない場合、既存の`archive/`ディレクトリを保持します。これにより、ユーザーがArchiveを見ていない状態でPushしても、アーカイブデータが消失しません。

### 処理フロー

1. デフォルトブランチを取得
2. 現在のブランチのHEADを取得
3. 現在のコミットからTreeのSHAを取得
4. 既存ツリーを取得（`.agasteer/`以外のファイルと必要に応じて`archive/`のSHAを記録）
5. 既存ツリーからmetadata.jsonのblob SHAを取得し、Blob APIで読み取り（pushCount等）
6. 新しいTreeを構築（全ファイルを明示的に指定）
7. 新しいTreeを作成
8. 新しいコミットを作成
9. ブランチのリファレンスを更新（`force: true`）

### SHA最適化

変更されていないファイルは既存のSHAを使用し、変更されたファイルのみcontentを送信することで、ネットワーク転送量を大幅削減。

- Git blob形式のSHA-1を`crypto.subtle.digest()`で計算
- ローカルSHAと既存SHAが一致する場合はSHAのみ送信
- 変化がある場合のみcontentを送信

### base_treeを使わない方式

`base_tree`を使わず、全ファイルを明示的に指定することで削除を確実に処理。

**notes/以外のファイル:**

- 既存ツリーから取得してSHAを保持
- README.md等のnotes/以外のファイルは変更されない

**notes/以下のファイル:**

- 完全に再構築
- treeItemsに含めないファイルは自動的に削除される

### 強制更新（force: true）

個人用アプリなので、ブランチ更新時に`force: true`を使用します。

**設計思想:**

- Pushボタンを押した時点で、ユーザーは「今の状態が正しい」と判断している
- 常に成功させることが重要
- Pullしていない方が悪い（ユーザーの責任）

### 並行実行の防止

`isPushing`フラグでダブルクリック等による並行実行を防止。try-finallyでロックの取得・解放を確実に行います。

### コミッター情報の固定値

コミット時のユーザー名とメールアドレスは固定値（`agasteer` / `agasteer@example.com`）を使用。設定画面での入力は不要。

### Push最適化（変更がない場合はスキップ）

実質的な変更がない場合（すべてのファイルのSHAが既存と一致）は、コミットを作成せずに早期リターン。pushCountもインクリメントされない。

**メリット:**

- 無駄なコミットを作成しない
- pushCountが不必要にインクリメントされない
- GitHubのコミット履歴が整理される

### Push処理の安全性と失敗時の挙動

#### 原子性（Atomicity）

Push処理は以下の3段階で構成され、各段階で失敗した場合は即座に`success: false`を返します：

1. **Tree作成** (`POST /git/trees`): 全ファイルを1つのJSONで送信
2. **Commit作成** (`POST /git/commits`): 上記Treeを指すCommitオブジェクトを作成
3. **Ref更新** (`PATCH /git/refs/heads/{branch}`): ブランチのHEADを新Commitに向ける

```typescript
// 各段階での失敗チェック
if (!newTreeRes.ok) return { success: false, message: 'github.treeCreateFailed' }
if (!newCommitRes.ok) return { success: false, message: 'github.commitCreateFailed' }
if (!updateRefRes.ok) return { success: false, message: 'github.branchUpdateFailed' }

// すべて成功した場合のみ
return { success: true, message: 'github.pushOk', ... }
```

#### ダーティフラグの維持

失敗時は`success: false`が返されるため、App.svelteの以下のロジックによりダーティフラグが維持されます：

```typescript
if (result.variant === 'success') {
  clearAllChanges() // 成功時のみクリア
  lastPushTime.set(Date.now())
}
// 失敗時はダーティフラグが残る → 次回Pushで再送信
```

#### 冪等性（Idempotency）

ダーティフラグが維持されている限り、何度Pushしても同じ結果になります：

- 失敗したPushを再実行 → 全データを再送信
- 通信エラーで中断されたPush → 次回は最初から全データを送信
- 「一部だけ送信された」という状態は起きない

#### Orphan Commitの扱い

**発生条件:**

Commit作成は成功したがRef更新で失敗した場合（ネットワークタイムアウト等）。

**影響:**

- Commitオブジェクトは作られるがブランチから到達不可能（orphan）
- GitHubのリポジトリには存在するが、通常の操作では見えない
- 次回Push時に別の新しいCommitを作成（重複するが無害）

**自動クリーンアップ:**

GitHubのGC（garbage collection）が自動的に削除するため、特別な処理は不要。

#### PullとPushの違い

| 項目             | Pull                     | Push                     |
| ---------------- | ------------------------ | ------------------------ |
| API呼び出し      | リーフ数だけ（並列）     | 固定3回（直列）          |
| 部分的失敗       | あり得る                 | なし                     |
| 失敗時の特別処理 | 1つでも失敗なら全体失敗  | 各段階で失敗チェックのみ |
| データ整合性     | isOperationsLockedで保護 | ダーティフラグで保護     |

Push処理は単一のトランザクション的処理であり、Pullのような並列処理特有の問題は存在しません。

---

## Pull処理

GitHubから全データをPull。

### ワールド別Pull処理

AgasteerはHome/Archiveの2つのワールドを持ち、それぞれ異なるPull戦略を使用します。

| ワールド | Pull対象             | タイミング                    | 関数               |
| -------- | -------------------- | ----------------------------- | ------------------ |
| Home     | `.agasteer/notes/`   | アプリ起動時、手動Pull        | `pullFromGitHub()` |
| Archive  | `.agasteer/archive/` | ユーザーがArchiveに切り替え時 | `pullArchive()`    |

**遅延Pull**:

- 通常のPull（起動時、手動）では`.agasteer/notes/`のみ取得
- Archiveに初めて切り替えた時に`.agasteer/archive/`をPull
- 一度ロードしたArchiveは`isArchiveLoaded`フラグで管理

### 空リポジトリの処理

初回コミットがない空のリポジトリに対応。GitHub APIは空リポジトリに対して特殊なレスポンスを返す。

#### APIレスポンス

| エンドポイント        | ステータス | メッセージ                  |
| --------------------- | ---------- | --------------------------- |
| `/contents/...`       | 404        | "This repository is empty." |
| `/git/trees/{branch}` | 409        | "Git Repository is empty."  |

#### 処理フロー

```
空リポジトリへのPull
    ↓
metadata.json取得 → 404
    ↓
fetchRemotePushCount → -1（チェック不可）
    ↓
staleチェック → true（Pullせよ）
    ↓
tree取得 → 409 Conflict
    ↓
空リポジトリとして正常処理
    ↓
onStructure([], defaultMetadata, [])
onPriorityComplete()
    ↓
isFirstPriorityFetched = true
    ↓
UI活性化（ノート作成可能）
```

#### 実装

ツリー取得で404/409が返された場合は空リポジトリとして正常処理し、空のデータで`onStructure`/`onPriorityComplete`コールバックを呼び出します。

### 優先度ベースの段階的ローディング（2025-11）

200件以上のリーフがある場合、全件取得には10秒以上かかります。ユーザー体験を改善するため、URLで指定されたコンテンツを優先的に取得し、UIを早期に解放する仕組みを実装。

#### 処理フロー

1. **Phase 1**: リポジトリ情報取得 → ツリー + metadata.json を並列取得
2. **Phase 2**: ノート構造を確定 → `onStructure`コールバックで通知
3. **Phase 3**: リーフを優先度順にソートしてキューイング
4. **Phase 4**: 10並列でリーフを取得、各完了時に`onLeaf`コールバック
5. **Phase 5**: 第1優先リーフ完了時に`onPriorityComplete`コールバック → UIロック解除

#### 優先度の定義

**PullPriority インターフェース:**

- `leafPaths`: 第1優先（URLで指定されたリーフのパス）
- `noteIds`: 第2優先（第1優先リーフと同じノート配下）

**優先度レベル:**

- **優先度0**: URLで直接指定されたリーフ（`?left=Note>Leaf`）
- **優先度1**: 第1優先リーフと同じノート配下のリーフ
- **優先度2**: その他すべてのリーフ

#### コールバックインターフェース

**PullOptions:**

- `onStructure`: ノート構造確定時（優先情報を返す）
- `onLeaf`: 各リーフ取得完了時
- `onPriorityComplete`: 第1優先リーフ取得完了時（UIロック解除のタイミング）

#### 優先度0リーフが0件の場合

両方のペインがノートを表示している場合、第1優先リーフは存在しません。この場合、リーフ取得開始**前**に`onPriorityComplete`を呼び出してUIを即座に解放します。

### 交通整理（canSync関数）

Pull/Push操作の排他制御を一元管理する関数。Pull中またはPush中は両方とも不可を返します。

**使用箇所:** handleSaveToGitHub(), handlePull(), Headerコンポーネント

これにより、ボタンクリックでもVimの`:w`でも、同じ条件でブロックされます。

### UI状態フラグ

| フラグ                 | 説明                                                  |
| ---------------------- | ----------------------------------------------------- |
| isLoadingUI            | ガラス効果・全操作不可（第1優先リーフ完了で解除）     |
| isPulling              | Pull処理中（全完了で解除）                            |
| isPushing              | Push処理中                                            |
| isFirstPriorityFetched | 第1優先リーフ取得完了（閲覧・編集可能、フッタは無効） |
| isPullCompleted        | Pull完全完了（すべての操作が可能）                    |

**UI制御の段階:**

- **第1段階完了まで**: `isLoadingUI = true`で全体がガラス効果、完全に操作不可
- **第1段階完了後**: `isFirstPriorityFetched = true`, `isLoadingUI = false`でガラス効果解除。リーフの閲覧・編集が可能だが、フッタのボタン（作成・削除・移動など）は`!isPullCompleted`で無効化
- **第2段階完了後**: `isPullCompleted = true`ですべての操作が可能

この段階的制御により、残りのリーフ取得中にユーザーが同名リーフを作成したり、まだ取得していないノートを削除するなどの矛盾を防ぎます。

### 技術的な最適化

- **生テキスト取得**: `Accept: application/vnd.github.raw`でBase64デコードを回避
- **並列取得**: `CONTENT_FETCH_CONCURRENCY = 10`で10並列実行
- **キャッシュバスター**: `?t=${Date.now()}`で常に最新データを取得

### Base64デコード

GitHub APIは改行付きのBase64を返すため、改行を削除してから`atob()`でデコードします。

### 重要な仕様

- GitHubが唯一の真実の情報源（Single Source of Truth）
- IndexedDBは単なるキャッシュ
- Pull成功時にIndexedDBは全削除→全作成

### GitHub APIのキャッシュ問題と解決策

GitHub Contents APIはレスポンスをキャッシュするため、Push直後のPullで古いデータが返される問題がありました。

**問題の発見経緯:**

Push回数カウント機能の実装中に、Push直後にPullしても`pushCount`が更新されない現象を発見。調査の結果、GitHub Contents APIがキャッシュを返していることが判明。

**影響範囲:**

- Push直後のPull: 古いノート・リーフが表示される
- 複数デバイスでの同期: 他のデバイスでPushした変更が即座に反映されない
- 編集の喪失: 最新のデータを取得できず、古いバージョンで上書きする可能性

**解決策:**

GitHub Contents API呼び出しにキャッシュバスター（`?t=${Date.now()}`）を付与。以下の箇所で使用：

1. `fetchCurrentSha` - ファイルのSHA取得
2. `pullFromGitHub` - Pull時のmetadata.json取得
3. `pullFromGitHub` - Pull時のリーフcontent取得

> **注**: `pushAllWithTreeAPI`のmetadata.json取得は、Contents APIからBlob APIに変更済み。
> 既存ツリーのblob SHAからBlob APIで読み取るため、キャッシュバスターは不要（同一commitのtreeに紐づく）。

**効果:**

- ✅ Push直後のPullでも最新データを取得
- ✅ metadata.jsonの`pushCount`が正しく反映
- ✅ リーフコンテンツも常に最新
- ✅ キャッシュバスターの管理が一元化（保守性向上）

---

## ファイルパスの構築

ノート階層に基づいてGitHub上のパスを生成。

### パス定数

| パス                              | 説明                |
| --------------------------------- | ------------------- |
| `.agasteer/notes`                 | Home用ベースパス    |
| `.agasteer/notes/metadata.json`   | Homeメタデータ      |
| `.agasteer/archive`               | Archive用ベースパス |
| `.agasteer/archive/metadata.json` | Archiveメタデータ   |

### パス生成ルール

`buildPath()`関数でノート階層に基づいてパスを生成。

**例:**

- ルートノート「仕事」のリーフ → `.agasteer/notes/仕事/リーフ1.md`
- サブノート「仕事/会議」のリーフ → `.agasteer/notes/仕事/会議/議事録.md`
- アーカイブされたリーフ → `.agasteer/archive/旧仕事/メモ.md`

---

## .gitkeepファイル

Gitにはディレクトリの概念がないため、空のノート（リーフがないノート）を保持するために`.gitkeep`ファイルを使用。

**Push時:**

- 全ノートに対して`.gitkeep`を配置
- 空ファイルなのでSHAは常に同じ（既存SHAがあれば再利用）

**Pull時:**

1. まず`.gitkeep`ファイルから空のノート（リーフがないノート）を復元
2. 次に`.md`ファイル（リーフ）を復元
3. `.gitkeep`ファイル自体はユーザーには見えない

---

## API呼び出し回数

### Push処理（Git Tree API）

1. リポジトリ情報取得（1回）
2. ブランチのHEAD取得（1回）
3. コミット取得（1回）
4. 既存ツリー取得（1回）
5. 新しいTree作成（1回）
6. 新しいコミット作成（1回）
7. ブランチ更新（1回）

**合計: 7回**

### Pull処理

1. リポジトリ情報取得（1回）
2. ツリー取得（1回、recursive）
3. 各ファイルのコンテンツ取得（ファイル数回）

**合計: 2 + ファイル数**

---

## エラーハンドリング

- 各API呼び出しでエラーチェック（`response.ok`）
- エラーメッセージをユーザーに表示
- ネットワークエラーはtry-catchで捕捉
