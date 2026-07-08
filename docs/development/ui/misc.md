## アプリアイコン（テーマカラー対応）

### 概要

ヘッダーのアプリタイトル左側にアプリアイコンを表示する機能。アイコンの色はテーマのアクセントカラーに応じて動的に変更されます。

### 表示条件

- **デフォルトタイトル時のみ表示**: ユーザーがツール名を変更していない場合のみ表示
- **タイトル変更後は非表示**: カスタムツール名を設定した場合はアイコンを非表示

### 技術実装

AppIconコンポーネントでSVGアイコンを表示。`isDefaultTitle`でデフォルトタイトル時のみ表示。

### デザイン

- **サイズ**: 24x24px
- **色**: `var(--accent-color)` - テーマのアクセントカラー
- **位置**: アプリタイトルの左側
- **間隔**: タイトルとの間に0.5rem

---

## その他のUI改善

### GitHub設定画面の改善

#### 必須項目マーク

Repository (owner/repo)とGitHub Tokenの入力欄に赤いアスタリスク（\*）で必須であることを表示。

#### リポジトリを開くボタン

Repository入力欄の右にGitHubリポジトリを直接開けるリンクボタンを配置。

**機能:**

- リポジトリ名が入力されている場合のみ表示
- 新しいタブでGitHubリポジトリを開く
- ホバー時にアクセントカラーに変化

#### スマホ対応

画面幅600px以下では、GitHub設定の入力欄を縦1列に配置。

### GitHub Sponsorsリンク

設定画面の最下部にGitHub Sponsorsへのリンクボタンを配置。

**デザイン:**

- 他のボタンと統一したスタイル
- ハートアイコンにビートアニメーション（鼓動エフェクト）
- ホバー時にアクセントカラーに変化

### 統計パネル（StatsPanel）

ホーム画面右下にリーフ数・文字数・Push回数を表示するコンポーネント。

#### 表示項目

| 項目     | 説明                       |
| -------- | -------------------------- |
| リーフ数 | 保存対象リーフの総数       |
| 文字数   | 全リーフのコンテンツ文字数 |
| Push回数 | GitHubへのPush回数         |

#### 文字数キャッシュ

パフォーマンス最適化のため、`totalCharCount`ストアで文字数をキャッシュし、差分更新します。

### プッシュカウントの表示改善

ホーム画面のPush回数表示に3桁カンマ区切り（`toLocaleString()`）を適用。

### Languageドロップダウンのカスタム矢印

ブラウザデフォルトの矢印を無効化し、カスタムCSS矢印を使用。テーマカラーに合わせて変化。

**メリット:**

- 右端からの距離を完全にコントロール可能
- テーマの色に自動的に追従
- 一貫したデザイン

---

## トースト通知

各種操作の完了時にトースト通知を表示して、ユーザーにフィードバックを提供します。

### 対応している操作

| 操作       | i18nキー          |
| ---------- | ----------------- |
| ノート作成 | toast.noteCreated |
| リーフ作成 | toast.leafCreated |
| 移動       | toast.moved       |
| 削除       | toast.deleted     |
| アーカイブ | toast.archived    |
| 復元       | toast.restored    |

### トーストの種類と寿命

- **通常トースト**: 表示から2秒で自動消滅。`showPushToast`（push スロット）はタイマーが「自分が出したトーストがまだ表示中か」を確認してから消すので、後から別のトーストに差し替わっていれば何もしない（**後勝ち**）。`showPullToast`（pull スロット）は guard を持たず2秒後に無条件で消す。
- **sticky トースト**（`showStickyPushToast`、#224）: 自動消滅しない。バックグラウンド Push 中（`isPushingBackground`）に `toast.pushInProgress`「Push中です。アプリの切り替えや終了はしないでください」を出し続け、送信完了前にアプリを切り替え／終了しないよう促す。完了トーストや他操作のトースト、`clearPushToast()` で差し替わる。
- **FF 風カウントダウン**（#238）: sticky トーストの2行目に「残りステージ数」（5→1）を本文と同じサイズでセンタリング表示する（脈動アニメ countdown-pulse 付き）。ステージ対応は `sync/push-stages.ts`、状態は `pushToastCountdown`（`ui/ui.svelte.ts`）。`setPushToastCountdown()` は**単調減少ガード**付きで、リトライ・救済経路で内部的にステージが巻き戻っても表示の数字は増えない。リセット（null 化）は `showStickyPushToast()`（新しい Push の開始）/ `showPushToast()` / `showPushCompletionToast()` / `clearPushToast()` のみ。orphan Push（タイムアウト後も裏で走る旧 `executePush`）の遅延コールバックは `actions/git.ts` の世代カウンタで弾く。
- **カウントダウンのペーシング**（#238 実機フィードバック）: 各数字は最低 `PUSH_COUNTDOWN_MIN_HOLD_MS`（400ms）表示し、次の値はキューに積んで順に出す（実ステージ所要の偏りで終盤の数字が駆け抜けるのを防ぐ）。遅延対象は Push 完了専用入口 `showPushCompletionToast()` の success だけ（最後の数字の保持完了まで、最悪 +2秒弱）。error は遅延せず即時表示・キュー破棄。汎用 `showPushToast()`（crud / move / share 等）は常に即時表示で、割り込み時はキューだけ破棄し、遅延中の完了トーストは汎用トーストの2秒消滅時に必ず表示される。
- Push / Pull は別スロット（`pushToastState` / `pullToastState`）で、同時に並んで表示できる。

**関連ファイル**: `pane-actions-factory.svelte.ts`, `leaves.ts`, `notes.ts`, `ui/ui.svelte.ts`, `layout/Toast.svelte`, `App.svelte`

---
