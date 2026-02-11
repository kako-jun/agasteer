## Stale編集警告機能

### 概要

PCとスマホなど複数デバイスで同時に編集している場合、他のデバイスでPushされた変更を上書きしてしまう危険があります。この機能は、リモートに新しい変更があることを検出し、Push前に警告を表示します。

### 仕組み

リモートのHEAD commit SHA（Refs API）とローカルで保持している`lastKnownCommitSha`を比較します。
従来の`pushCount`比較ではアプリを経由しない直接git pushを検出できませんでしたが、commit SHA比較により全ての変更を検出可能になりました。

#### lastKnownCommitShaストア

最後にリモートと同期した時点のHEAD commit SHAを保持するストア。
Pull成功後およびPush成功後に更新される。

#### stale検出ロジック

`fetchRemoteHeadSha()`でリモートのHEAD commit SHAを取得し、`lastKnownCommitSha`と比較します。

**判定ロジック:**

- `lastKnownCommitSha === null` → まだ一度もPull/Pushしていない → up_to_date
- `remoteCommitSha !== lastKnownCommitSha` → stale（リモートに新しい変更がある）
- `remoteCommitSha === lastKnownCommitSha` → 最新（Pushして問題なし）

**チェック不可の場合:**

設定が無効、認証エラー、ネットワークエラーなどでリモートの状態を確認できない場合、`check_failed`を返します。これにより、Pull/Push処理が続行され、適切なエラーメッセージ（例: 「トークンが無効です」「リポジトリが見つかりません」）が表示されます。

**空リポジトリの扱い:**

Refs APIが404/409を返す場合は`empty_repository`として`up_to_date`を返します。空リポジトリの場合は初回Pullで正常に処理されます。

### Push時の確認フロー

1. 交通整理（Push不可なら何もしない）
2. stale編集かどうかチェック
3. staleの場合は確認ダイアログを表示
4. staleでなければそのままPush

### Push成功後のcommit SHA更新

Push成功後は、Push APIの戻り値から新しいcommit SHAを取得して`lastKnownCommitSha`を更新。これにより、連続Pushでstale警告が出ることを防ぎます。pushCountの更新は統計表示用に引き続き行われます。

### 動作フロー

1. **Pull実行** → `lastKnownCommitSha`にリモートのHEAD commit SHAを保存
2. **別デバイスでPush（または直接git push）** → リモートのHEAD commit SHAが変化
3. **このデバイスでPush** → `fetchRemoteHeadSha`でリモートのHEAD commit SHAを取得
4. **比較** → `remoteCommitSha !== lastKnownCommitSha`ならstale
5. **警告表示** → ユーザーが確認後にPush、またはキャンセル
6. **Push成功** → 新しいcommit SHAで`lastKnownCommitSha`を更新

### 定期的なstaleチェック

バックグラウンドで定期的にリモートの状態をチェックし、他のデバイスでPushされた変更を検出します。

#### 仕組み

- **チェック間隔**: 5分
- **条件**: 前回のチェックから5分経過後にチェック
- **タブがアクティブ時のみ**: `document.visibilityState === 'visible'`
- **Pull/Push中はスキップ**: 操作中は干渉しない
- **サイレント実行**: UIブロックなし、通知なし

#### lastStaleCheckTimeストア

最後にstaleチェックを実行した時刻を保持するストア。

この時刻は以下のタイミングで更新される：

- Pullボタン押下時のstaleチェック
- 手動Push時のstaleチェック
- 自動Push時のstaleチェック
- 定期チェック実行時

これにより、手動操作でチェックが行われた場合は定期チェックが5分延長される。

#### チェック実行条件

1. GitHub設定済み
2. タブがアクティブ
3. Pull/Push中でない
4. 初回Pull完了済み

#### 進捗バー表示

ヘッダー左上に、次のチェックまでの残り時間を示す進捗バーを表示。

- **位置**: ヘッダー左端、上から下に伸びる
- **幅**: 2px
- **色**: アクセントカラー（opacity: 0.5）
- **高さ**: ヘッダー高さ × 進捗（0〜1）

1ドット（1px）あたりの時間 = 5分 ÷ ヘッダー高さ（約48px）≈ 6.25秒

**バーの表示条件:**

- GitHub設定済み
- タブがアクティブ
- Pull/Push中でない
- 初回Pull完了済み

条件を満たさない場合、バーは表示されない（progress = 0）。

**チェック実行とリセット:**

- 進捗が100%（5分経過）に達するとチェックを実行
- チェック実行で`lastStaleCheckTime`が更新され、バーは0にリセット
- 再び0から伸び始める

#### stale検出時の動作

定期チェックでstaleを検出した場合、ローカルの状態に応じて動作が分岐します：

**ローカルがクリーン（`isDirty === false`）の場合：**

1. `shouldAutoPull`ストアを`true`に設定
2. App.svelteで購読し、自動的にPullを実行
3. ユーザー操作不要で最新状態に同期

**ローカルがダーティ（`isDirty === true`）の場合：**

1. `isStale`ストアを`true`に設定
2. Pullボタンに赤い丸印（notification badge）を表示
3. ユーザーがPullボタンを押すまで待機

**設計意図:**

5分間無操作だったユーザーがその瞬間に編集を始める確率は低い。ローカルに未保存の変更がなければ、ユーザーに確認を求めずに自動でPullしても問題ない。これにより、複数デバイス間の同期がよりシームレスになる。

**競合状態の考慮:**

stale-checkerが`isDirty`をチェックしてから実際のPull実行までの間にユーザーが編集を開始した場合、`pullFromGitHub()`内のダーティチェックで確認ダイアログが表示される。これにより安全性が保たれる。

### 設計思想

- **個人用アプリ**: 複数ユーザーの同時編集は想定しない
- **警告のみ**: ブロックせず、ユーザーの判断で上書き可能
- **ネットワークエラー時**: チェック失敗時はPushを続行（使い勝手優先）
- **force: true**: Git Tree APIでの強制更新は維持（常に成功を優先）
- **定期チェック**: 5分間隔でサイレントにチェック、stale時のみUI通知

---
