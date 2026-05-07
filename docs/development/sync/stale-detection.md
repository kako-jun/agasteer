## Stale編集警告機能

### 概要

PCとスマホなど複数デバイスで同時に編集している場合、他のデバイスでPushされた変更を上書きしてしまう危険があります。この機能は、リモートに新しい変更があることを検出し、Push前に警告を表示します。

### 仕組み

リモートのHEAD commit SHA（Refs API）とローカルで保持している`lastKnownCommitSha`を比較します。
従来の`pushCount`比較ではアプリを経由しない直接git pushを検出できませんでしたが、commit SHA比較により全ての変更を検出可能になりました。

#### lastKnownCommitShaストア

最後にリモートと同期した時点のHEAD commit SHAを保持するストア。
Pull成功後およびPush成功後に更新される。

**永続化:** LocalStorageの **リポジトリ単位スロット**（`byRepo[<owner>/<repo>].lastKnownCommitSha`）に保存される（#131以降）。ページリロードや再起動後も値が復元されるため、リロード直後のstaleチェックでも正しく判定できる。リポジトリ切替時も**`null`にはリセットされず**、新リポのスロットから復元される。これにより、以前開いたリポに戻ってきたときに差分Pullを再利用できる。まだ一度も開いていないリポではスロットが存在しないため `null` となり、初回フルPullが走る。

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
3. staleの場合は`isStale`を`true`にしてPullボタンに赤丸を表示
4. staleの場合は3択ダイアログを表示（Pull first / Push上書き / Cancel）
5. Cancelした場合も赤丸を維持し、ユーザーがPullすべき状態を見失わないようにする
6. staleでなければそのままPush

**衝突ダイアログの単一系統化（#200 / #201 / #202）:**

手動 Push / auto-push / pull-dirty / 起動時 dirty の各経路で個別に `choiceAsync` /
`confirmAsync` を呼んでいた実装を、共通ヘルパー `src/lib/actions/conflict-dialog.ts`
の `showConflictDialog({ kind, ... })` に集約した。`kind` は以下の3種類:

- `stale-push`: 手動 Push / auto-push 共通の stale 警告
- `pull-dirty`: 通常時の Pull 直前 dirty 警告（3択）
- `startup-dirty`: 起動時の Pull 直前 dirty 警告（`disablePush: true` で push first を無効化した2択）

ヘルパー内部で `fetchRemotePushCount` を必ず呼び、ローカル/リモートの SHA と
pushCount を `modal.staleEditDiagnostic` 形式で本文末尾に常時付与する。これに
より「auto-push 経路だけ pushCount が出ない」といった経路差による表示揺れが
解消され、文言・ボタン順を変えるときも 1 箇所の修正で済む。

**API コスト**: 衝突ダイアログを表示するたびに `fetchRemotePushCount` を呼ぶ。
pull-dirty / startup-dirty 経路では本変更で新たに発生する API 呼び出しとなる。
pull → push first → さらに stale-push のように再帰 hop でダイアログが連続する
ケースでは、1 ダイアログにつき 1 回の追加呼び出しがそれぞれ発生する。
認証済みなら 5000 req/h の枠に対して衝突確認頻度では実害なし。
rate-limit やネットワークエラー時は `?` 表示にフォールバックする。

### Push成功後のcommit SHA更新

Push成功後は、Push APIの戻り値から新しいcommit SHAを取得して`lastKnownCommitSha`を更新。これにより、連続Pushでstale警告が出ることを防ぎます。pushCountの更新は統計表示用に引き続き行われます。

**noChangesケースでも更新する:** Push対象の差分がなく`github.noChanges`が返った場合でも、戻り値の`commitSha`（現在のリモートHEAD）で`lastKnownCommitSha`を更新する。これを怠るとSHAがドリフトし、次回のstaleチェックで誤検出（pull/push選択ダイアログの誤表示）を引き起こす。一方、スナップショット更新とダーティクリアはnoChangesでは行わない（後述の設計原則に基づく）。

### 動作フロー

1. **Pull実行** → `lastKnownCommitSha`にリモートのHEAD commit SHAを保存
2. **別デバイスでPush（または直接git push）** → リモートのHEAD commit SHAが変化
3. **このデバイスでPush** → `fetchRemoteHeadSha`でリモートのHEAD commit SHAを取得
4. **比較** → `remoteCommitSha !== lastKnownCommitSha`ならstale
5. **赤丸表示** → `isStale = true`でPullボタンに通知
6. **3択ダイアログ** → Pull first（リモート取得後に再Push）/ Push上書き / キャンセル
7. **Push成功** → 新しいcommit SHAで`lastKnownCommitSha`を更新し、`isStale = false`に戻す

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
2. app-state.svelte.tsで購読し、自動的にPullを実行
3. ユーザー操作不要で最新状態に同期

**ローカルがダーティ（`isDirty === true`）の場合：**

1. `isStale`ストアを`true`に設定
2. Pullボタンに赤い丸印（notification badge）を表示
3. ユーザーがPullボタンを押すまで待機

#### up_to_date時のisStale解除

staleチェックが`up_to_date`を返した場合、`isStale`を`false`に戻す。これにより、一度staleと判定された後にリモート側の状態が解消された場合（例: 別デバイスで元に戻した等）や、誤判定があった場合に赤バッジが自動的に消える。`check_failed`の場合は判定不能のため現状を維持する。

**設計意図:**

5分間無操作だったユーザーがその瞬間に編集を始める確率は低い。ローカルに未保存の変更がなければ、ユーザーに確認を求めずに自動でPullしても問題ない。これにより、複数デバイス間の同期がよりシームレスになる。

**競合状態の考慮:**

stale-checkerが`isDirty`をチェックしてから実際のPull実行までの間にユーザーが編集を開始した場合、`pullFromGitHub()`内で stale 判定されたあとのダーティチェック（#152 以降は stale のときだけ進む）で確認ダイアログが表示される。これにより安全性が保たれる。

### 長時間バックグラウンド復帰時の動作

PWA が 5 分以上バックグラウンドにあった状態から復帰すると、`visibilitychange` ハンドラが「長時間バックグラウンドにいました」モーダルを表示する。モーダルを閉じると stale チェックが走り、結果は周期 stale チェックと**完全に同じ共通関数 `applyStaleResult()`** で処理される（push-in-flight フラグの取り扱い含めて分岐は共通）。

過去はこの経路だけ「stale なら一律 `isStale = true`」と非対称になっており、復帰直後に自動 Pull が走らない問題があった（#164）。周期チェックと同じロジックに統一して解消。

#### 復帰直後の `check_failed` 短期リトライ（#203）

スマホで久しぶりにアプリを開き直した直後は、OS / PWA / 回線復帰タイミングの都合で 1 回目の stale check が `network_error` に倒れ、`applyStaleResult` 上は `check_failed` outcome（=「現状維持」）として扱われがちだった。`executeStaleCheck` は失敗時にも `lastStaleCheckTime` を更新するため、そのまま放置すると次の周期チェック（5 分後）まで沈黙し、ユーザーから見ると Pull / Push が灰色のまま自動同期が止まったように見えていた（過去はこの状態が再現していた）。

これを救うため、`handleVisibilityChange` の長時間バックグラウンド復帰経路と push-hang 復帰経路の両方で、最初の stale check の outcome が `check-failed` だった場合に短期リトライを 1 回呼ぶ。

- 待ち時間: `RESUME_RETRY_BACKOFFS_MS = [2_000, 5_000]`（`src/lib/sync/constants.ts`）
- 最大 2 回まで再試行。`check-failed` 以外の outcome（`rescued` / `stale-auto-pull` / `stale-dirty` / `up-to-date`）を得た時点で早期 return
- 各リトライ前に `document.visibilityState === 'visible'` を再確認し、再び hidden に戻ったら諦める（バックグラウンドで API を打ち続けない）
- push-hang ダイアログとの整合のため、リトライは `consumePushHangFlag` のクロージャを引き継がない（ハング判定は 1 回目で消費済み）

リトライロジックは `src/lib/sync/resume-retry.ts` の純粋関数 `runResumeStaleCheckRetry` に切り出してある。Svelte ストアや `document` への依存は呼び出し側が引数として注入する形にしてあり、`src/lib/sync/resume-retry.test.ts` で単体テスト可能。

> 余地: 将来 `pageshow` / `focus` も補助トリガーとして追加する案がある（#203 改善案 C）。現時点では `visibilitychange` + `online` でカバー範囲は十分と判断している。

#### online 復帰時の stale check 再起動（#203）

`handleOnline` も拡張済み。これまでは `!isFirstPriorityFetched` のときだけ初回 Pull をリトライしていたが、初回 Pull 済みのタブで long-offline → online 復帰しただけ（visibilitychange は発火していないが回線だけ復帰したケース）でも、`visible` / `!isPulling` / `!isPushing` / `!isArchiveLoading` / `githubConfigured` を全て満たす場合に `executeStaleCheck` → `applyStaleResult` を一発走らせる。visibility が hidden の場合は走らせず、後続の visibilitychange 側に任せる。

### Push飛行中フラグ（pushInFlightAt）

スマホでPushのAPIリクエストが送信された後、レスポンスが届く前に端末がスリープに入ると、GitHub側ではPushが成功しているのにローカルの`lastKnownCommitSha`が更新されない。復帰時のstaleチェックで「リモートに新しい変更がある」と誤判定される問題を防止する。

**仕組み:**

1. Push APIリクエスト送信直前に`pushInFlightAt`タイムスタンプをLocalStorageに設定
2. レスポンス受信後（成功・失敗問わず）にクリア
3. staleチェックでstale検出時にフラグが残っていれば、スリープによるレスポンス消失と判断

**stale検出時の分岐:**

| 条件                            | 判定                     | 処理                                                                 |
| ------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| pushInFlightAt あり & 1時間以内 | Pushは成功していた       | SHA更新のみ + フラグクリア（スナップショット・ダーティは変更しない） |
| pushInFlightAt あり & 1時間超過 | フラグが古すぎる（異常） | フラグクリア、通常のstale処理                                        |
| pushInFlightAt なし             | 通常のstale              | 従来通りの処理                                                       |

**なぜSHA更新のみでスナップショットを更新しないか:**

Push API呼び出し後〜スリープ前にユーザーが追加編集した場合を考慮。スナップショットを現在の状態で更新すると、push時点で送信されていない編集がベースラインに吸収され、次回pushで送信されなくなる。SHA更新のみにすることで、追加編集がダーティとして残り、次回pushで正しく送信される。push済みの内容との差分がなければno-op pushになるため安全。

**up_to_date時の処理:**

Staleチェックがup_to_dateを返した場合（PushがGitHubに届かなかった場合）、pushInFlightAtフラグがあれば安全にクリアする。

**フラグの有効期限:**

1時間。クラッシュやバグでフラグが永続化されても、1時間後には無視される。

### Pushハング検出（visibility 復帰時）

#204/#205: スマホで Push 中にスリープすると、`fetch` の Promise が pending のまま戻らず、`pushToGitHub` の `finally` まで到達できず `isPushing` が `true` のまま固まることがある。これを 2 段で救う。

1. **Phase A: `pushToGitHub` 内で `Promise.race` による 30 秒タイムアウト**（`PUSH_TIMEOUT_MS`）
   - タイムアウト時は warning トースト（`toast.pushTimeout`, E-5101）を出して `return`
   - `isPushing` は `finally` で `false` に戻り UI ロックは解除される
   - `pushInFlightAt` は意図的に**残す**（裏で成功した Push を次回 stale check で SHA 救済できるように）

2. **Phase B: `visibilitychange` 復帰時のハング検出**（`PUSH_HANG_THRESHOLD_MS = 60s`）
   - `isPushing === true` かつ `pushInFlightAt` の経過 > 60 秒なら、JS タイマーが
     バックグラウンド停止して Phase A タイムアウトすら発火しなかったケースとみなし、
     `isPushing` を強制 `false` にして `appState.pushHangRecovered = true` を立てる
   - `pushInFlightAt` は残す（次の stale check で救済 or push-hang ダイアログへ）

### Pushハング復旧後のユーザー判断（push-hang ダイアログ）

`pushHangRecovered` が立った状態で stale check の結果に応じて分岐する:

- `up_to_date` → `applyStaleResult` が `pushInFlightAt` をクリア（裏で Push が成功していた、救済成功）
- `stale` → `showConflictDialog({ kind: 'push-hang' })` で 3 択 (`pull` / `push` / `cancel`)
  - ボタン配置・並びは `stale-push` と同じ（pullFirst primary / pushOverwrite secondary / cancel）
  - 本文だけ `modal.pushHangRecovery`（「Push の応答が途切れたため状態が不明」）
  - 専用 UI を増やさず #200 の共通ヘルパーに乗せることで一貫性を保つ（#205）

### 設計思想

- **個人用アプリ**: 複数ユーザーの同時編集は想定しない
- **警告のみ**: ブロックせず、ユーザーの判断で上書き可能
- **ネットワークエラー時**: チェック失敗時はPushを続行（使い勝手優先）
- **force: true**: Git Tree APIでの強制更新は維持（常に成功を優先）
- **定期チェック**: 5分間隔でサイレントにチェック、stale時のみUI通知
- **Push飛行中検出**: スリープによるレスポンス消失を検出し、誤staleを防止
- **Pushハング復旧**: 30 秒タイムアウト + visibility 復帰時の強制解除 + 共通 3 択 (push-hang) で UI ロックを永続化させない

### #206: 2 段階 Push と pushInFlightAt の責務関係

`pushToGitHub()` は preflight phase（`isPushing=true`）と background phase（`isPushingBackground=true`）に分かれた。`pushInFlightAt` は **両フェーズを通じて 1 つの「現在飛んでいる Push」を示す共通フラグ**として機能する。

| フラグ                | 意味                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `isPushing`           | preflight phase（IME flush / stale check / 競合ダイアログ）。UI ロック・編集不可                                                               |
| `isPushingBackground` | background phase（HTTP 送信中）。編集再開可・別 Push/Pull はロック                                                                             |
| `pushInFlightAt`      | 「Push 開始時刻」。preflight phase 終端で `Date.now()` を立て、background phase の正常終了 / Promise.race timeout / hang recovery で消費される |

#### 救済機構との整合

- visibility resume 時の hang 検出（`handleVisibilityChange`）は **`isPushing.value || isPushingBackground.value`** の両方を見る
- 両フェーズいずれでハングしても `pushInFlightAt` の経過時間で検出 → 両フラグを `false` に戻し `pushHangRecovered = true` を立てる
- 直後の stale check で `applyStaleResult` が `up_to_date` を見れば「裏で Push が成功していた」として救済、`stale` なら push-hang ダイアログへ
- 30 秒タイムアウトは background phase の `Promise.race` 内で発火し、`isPushingBackground=false` で UI ロックを解除する（`pushInFlightAt` は意図的に残す: orphan 救済のため）

詳細は [`push-pull.md`](./push-pull.md) の #206 節を参照。

---
