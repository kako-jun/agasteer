# バグレポート用診断ログ

> Issue #317。同期まわりの不具合を、利用者が直後に開発者へ渡せるようにする仕組み。

## 目的

Push 直後の再 Push で pushCount が同じなのに衝突ダイアログが出る件（#316）のように、間欠的で再現しない不具合は、スマホでは `console.log` を見られず、リロードでも消えるため調べる手段がない。そこで同期の出来事を端末内に記録し、利用者が画面で内容を確認して「コピー」し、Issue などに貼り付けて渡せるようにした。サーバー送信はしない。常時オン。

#316 の原因調査に使う。各種別が判別する候補は後述。

## 記録の対象

実装は `src/lib/diagnostics/`。記録の入口は `recordDiag(kind, data)`（`record.ts`）。同期呼び出し・戻り値なし・例外を投げない。IndexedDB への書き込みは裏で進み、呼び出し側は待たない。

許可リストは `src/lib/diagnostics/schema.ts` の `DIAG_SCHEMA`。値の型は `sha`（16進7〜64桁または null）／`int`（有限の整数）／`bool`／`iso`（ISO 8601 風の日時文字列）／固定候補の文字列（候補と完全一致する値だけ）。

| 種別                  | キー                                                                                                                                 | 記録する場面                                                                                | #316 で判別するもの                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `push-success`        | `commitSha`(sha) `parentSha`(sha) `stamp`(int) `noChanges`(bool)                                                                     | Push 成功（`git-push.ts`）。`parentSha` は Push 開始時に読んだ親                            | 新コミットとその親の連なり。次回 stale 時の remote/local との突き合わせ |
| `stale-detected`      | `remoteSha`(sha) `localSha`(sha)                                                                                                     | preflight が stale と判定した値（`git-push.ts`）                                            | 判定に使われた SHA の全桁                                               |
| `stale-recheck`       | `status`(`success`/`failed`) `headSha`(sha) `sameAsRemote`(bool)                                                                     | stale 直後にリモート HEAD をもう一度読んだ結果                                              | 一過性のずれ（読み直すと一致する）か、本当に別コミットか                |
| `stale-remote-commit` | `headSha`(sha) `parentSha`(sha) `commitDate`(iso)                                                                                    | stale 時のリモート HEAD コミットの親と日時                                                  | 誰がいつ積んだ HEAD か。自分の直前 Push の親子関係か                    |
| `ref-verify`          | `pushedSha`(sha) `refSha`(sha) `match`(bool) `httpStatus`(int)                                                                       | ref を PATCH した直後に読み直し、PATCH した SHA と照合（`api/github.ts` → `ref-verify.ts`） | PATCH 直後の GET が古い値を返すか（読み取りの遅れ）                     |
| `inflight-set`        | `stamp`(int)                                                                                                                         | `pushInFlightAt` の設定                                                                     | 救済マーカーの寿命                                                      |
| `inflight-clear`      | `stamp`(int) `reason`(`response`/`http-error`/`orphan-settled`/`orphan-rejected`)                                                    | `pushInFlightAt` の解除                                                                     | 設定と解除の対応、解除理由                                              |
| `push-timeout`        | `stamp`(int) `timeoutMs`(int)                                                                                                        | Push 応答タイムアウトで UI をあきらめた                                                     | タイムアウトが絡むか                                                    |
| `orphan-settled`      | `stamp`(int) `outcome`(`follow`/`verify-align`/`verify-skip`/`failure`/`rejected`/`repo-switched`) `commitSha`(sha) `elapsedMs`(int) | タイムアウト後の orphan Push が settle した（`git-orphan.ts`）                              | orphan が成功して SHA 追従したか                                        |
| `rehydrate-sha`       | `oldSha`(sha) `newSha`(sha)                                                                                                          | rehydrate での `lastKnownCommitSha` の差し替え（`rehydrate.svelte.ts`）                     | リポ切替などで local SHA が変わったか                                   |
| `conflict-dialog`     | `dialogKind`(`stale-push`/`pull-dirty`/`startup-dirty`/`push-hang`) `localSha`(sha) `remoteSha`(sha)                                 | 衝突ダイアログの表示（`conflict-dialog.ts`）                                                | ダイアログ表示時点の SHA。直前の `push-success` との比較                |

`stale-recheck` / `stale-remote-commit`（`stale-extras.ts`）は stale 時だけ追加の API 呼び出しを行う記録専用の観測で、判定には使わない。失敗は握りつぶす。`ref-verify` も記録専用で、不一致でも Push の成否に影響しない。

Pull の開始・結果、Push の失敗、エラーコード（`E-xxxx`）、衝突ダイアログでの選択は、現状は記録していない（上表が記録の全て）。

## 1件の形式

保存される1件は `{ id, at, kind, data }`（`DiagEntry`）。`id` は IndexedDB の自動採番、`at` は epoch ms、`data` は許可リストを通過した値だけ。コピーされる全文では1件が1行になる: `ISO時刻 種別 key=value ...`（null は `null`）。全文の先頭にはアプリのバージョン・端末（UA をブラウザ/OS に要約）・件数が付く（`format.ts`）。

## 記録しないもの

ノート・リーフの本文、タイトル、パス、認証トークン、リポ名、ユーザー名。

許可リスト方式で守っている。`buildEntry`（`schema.ts`）は、未知の種別を保存せず、定義外のキーと型・値が合わないキーを黙って捨てる。型レベルでも `DiagData<K>` は許可キーだけで、自由文字列は固定候補の enum 以外受け付けない（sha・iso は正規表現で縛る）。そのため呼び出し側が間違えても、本文・タイトル・トークンなどは保存できない。

`console.*` は自動で取り込まない。既存の `console.*`（約200か所）にはノートのタイトル等が混ざりうり、「記録しないもの」を保証できなくなるため。明示的に `recordDiag` を呼んだ出来事だけを記録する。

## 保存先

共有 IndexedDB `agasteer/shared`（DB バージョン 2）の `diagLog` store（keyPath `id`、autoIncrement）。v1 → v2 は store 追加のみ。store 定義は `data/storage.ts`、読み書きは `diagnostics/log-store.ts`。リポ切替では消さない。

- 上限: 300 件・合計 200KB（JSON 化した文字数の概算）。`trimEntries`（`format.ts`）が新しい側を優先して残し、古い順に切り捨てる
- 追加のたびに、同じトランザクション内で上限超過分を削除する
- 書き込み・読み込み・消去の失敗は `console.warn` のみで握りつぶし、同期処理を妨げない（読み込み失敗は空配列、消去失敗は false を返す）。`record.ts` も `appendDiagEntry` の reject を `console.warn` に落とし、unhandled rejection を出さない

## 画面

設定画面の「バグレポート」（`components/settings/BugReportSection.svelte`、`SettingsView.svelte` に配置）。

- 記録するもの／しないもの／使い方の説明、上限の説明
- ログの要約（件数と最古〜最新の日時）、アプリのバージョン、端末
- コピーされる全文のプレビュー（読み取り専用）
- 「コピー」: 成功で「コピーしました」。クリップボードが使えない場合は `copyFailed` を表示（全文を選んで手動コピーを案内）
- 「ログを消す」: `clearDiagEntries()` が成功したときだけ「ログを消しました」。失敗時は `clearFailed`（「ログを消せませんでした。」）を表示する。どちらの場合も一覧を読み直して表示を実態に合わせる
- 状態メッセージは 3 秒で消える

衝突ダイアログ本文の末尾に1行の案内（`modal.conflictBugReportHint`: 「詳しくは 設定 > バグレポート をご覧ください。」）を付ける。ボタンは増やさない。エラートーストからの導線は現状ない。

i18n キーは `settings.bugReport.*`（title, description, recordedTitle, recorded, notRecordedTitle, notRecorded, howToTitle, howTo, limit, summary, summaryEmpty, appVersion, device, previewTitle, copy, copied, copyFailed, clear, cleared, clearFailed）と `modal.conflictBugReportHint`。ja / en 両方。

## 記録を足す手順

1. `schema.ts` の `DIAG_SCHEMA` に種別と許可キー（型）を足す
2. 記録したい場所で `recordDiag('種別', { ... })` を1行呼ぶ（待たない・戻り値を使わない・挙動を変えない）
3. 本ドキュメントの種別表を更新する

## 関連

- [sync/stale-detection.md](./sync/stale-detection.md): stale 検出と衝突ダイアログ
- [storage.md](./storage.md): 共有 DB
