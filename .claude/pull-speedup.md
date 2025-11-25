# Pull 高速化/段階ロードの実装メモ

## 現状

- Pull は `pullFromGitHub`（`src/lib/github.ts`）をシリアルで呼び、Contents API の Base64 をデコードしている。
- キャッシュバスター `?t=${Date.now()}` は付いているが、raw/gzip・並列取得・段階ロードは未導入。
- UI 側（`src/App.svelte`）は Pull 完了まで isOperationsLocked を解除せず、ホーム/ノート/リーフは全件ロード後に描画。

## 高速化オプション（後方互換を保つ）

サーバー側オプションを増やすだけなので、従来呼び出しはそのまま動かせる。

1. **raw + gzip**: `Accept: application/vnd.github.raw` で `.md` を生テキスト取得（GitHub 側で gzip）。Base64/JSON を経由しない。
2. **並列取得**: リーフ本文取得を 6 並列（`CONTENT_FETCH_CONCURRENCY`）で実行。
3. **優先取得**: `priorityPaths` で URL left/right 等を先に取得するキューを作る（`:preview` は取り除く）。
4. **段階通知**: Pull時に `onStructure`（ノート構造とメタデータを先出し）と `onLeaf`（各リーフ取得完了を逐次通知）のコールバックを指定できる。
5. **互換モード**: PullOptions を指定しなければ従来のシリアル + Base64 デコードで動くように分岐させる。

## 変更予定ファイルと内容

### 1) `src/lib/github.ts`

- PullOptions 追加: `priorityPaths?`, `onStructure?`, `onLeaf?`.
- LeafTarget 型追加: id/path/repoPath/title/noteId/order/updatedAt。
- fetchGitHubContents に raw オプション追加（Accept ヘッダー切替）。
- 既存 notePaths 生成後:
  - leafTargets 作成（metadata から id/order/updatedAt を引く。なければ乱数と idx）。
  - priorityPaths に基づき leafTargets をソート。
  - onStructure を呼ぶ（notes/metadata/leafTargets を渡す）。
  - runWithConcurrency(sortedTargets, CONCURRENCY, worker):
    - raw テキスト取得 → Leaf を組み立て → onLeaf(leaf, { path }).
  - options 未指定のときは従来どおりのシリアル + Base64 デコードを使う道を残す（後方互換）。

### 2) `src/lib/sync.ts`

- executePull に PullOptions を透過させるだけ（従来シグネチャはデフォルト値で後方互換）。

### 3) `src/App.svelte`（UI 段階ロードの配線）

- 追加のローカル state: `loadingLeafIds: Set<string>`（初期化時に空セット）。
- `getTargetPathsFromUrl()` を追加し、left/right（`:preview` 除去）を重複なしで返す。
  +- `selectLeaf` で loadingLeafIds に入っている id をクリックした場合はトースト表示＋無視。
- handlePull / executePullInternal の中で:
  - priorityPaths = getTargetPathsFromUrl()
  - Pull開始時に loadingLeafIds を空セットに初期化
  - executePull に options を渡す:
    - onStructure: notes/metadata を更新、leafTargets から loadingLeafIds を埋める。構造が揃った時点で overlay を外せるなら pullRunning=false にして体感を改善。
    - onLeaf: 該当 id を loadingLeafIds から外し、leaves ストアに反映。初回 Pull で priority の leaf が揃ったら URL 復元を走らせる。
- 右/左ペインの URL 復元は既存の restoreStateFromUrl を再利用（isRestoringFromUrl フラグを適切に扱う）。
- UI 表示上、リーフが loading 中であることを示すバッジ/スピナー（任意）とクリック無効を実装するなら NoteView/EditorView に props を足す。

## テスト方針

- svelte-check / npm run check
- Pull: 50 ノート規模で初回 Pull の体感時間短縮を目視確認（優先パスを含む URL で起動）。

## 備考

- 並列度は 6（ブラウザの同一ホスト同時接続上限に合わせた無難値）。スロットリングに遭う場合は 4 に下げる、もっと攻めるなら 8〜10。
- raw 取得は `.md` のみを対象にしている前提。もし notes/ 配下にバイナリを置く場合は拡張子ホワイトリストで raw を限定する。
