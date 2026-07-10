## マークダウンプレビュー機能

### 概要

リーフのマークダウンコンテンツをHTMLとしてレンダリングし、読みやすいプレビューを表示します。編集モードとプレビューモードをトグルで切り替え可能です。

### 技術スタック

| ライブラリ | サイズ | 役割                            |
| ---------- | ------ | ------------------------------- |
| marked     | 約50KB | マークダウン→HTML変換           |
| DOMPurify  | 約50KB | XSS対策のHTMLサニタイゼーション |

### プレビュートグル機能

#### ボタン配置

- **編集モード時**: 保存ボタンの左隣に👁️（目）のプレビューボタン
- **プレビューモード時**: 保存ボタンの左隣に✏️（鉛筆）の編集ボタン

#### 左右ペイン独立制御

- 左ペインと右ペインは独立してプレビュー/編集を切り替え可能
- 同じリーフを左右で開いても、片方を編集、もう片方をプレビューなど自由に組み合わせ可能

### URLルーティング対応

プレビューモード時は`:preview`サフィックスをURLに追加。

**例:**

```
# 左が編集、右がプレビュー
?left=/ノート1/リーフ1&right=/ノート1/リーフ1:preview

# 両方プレビュー
?left=/ノート1/リーフ1:preview&right=/ノート2/リーフ2:preview
```

### PreviewView.svelteコンポーネント

- markedでマークダウンをHTMLに変換
- DOMPurifyでサニタイズ
- テーマのCSS変数に追従したスタイリング（見出し、コードブロック、リンク、引用など）

### ビュー型

View型に`'preview'`を追加。App.svelteで`currentView === 'preview'`の場合にPreviewViewを表示。

### 読み取り専用制御

プレビューモード中は編集不可。CodeMirrorは表示されず、PreviewView.svelteのみが表示されます。

### セキュリティ

DOMPurifyでHTMLをサニタイズし、悪意のあるスクリプトを除去。Svelteの`{@html}`でサニタイズ済みHTMLを安全に表示。

### 添付メディアの表示解決（#244）

添付ファイル（#242/#243）の raw URL は private リポを指すためブラウザから直接は読めない。プレビューは `lib/preview/media-resolve.ts` がレンダリング後の DOM を走査して解決・差し替えする。

#### 流れ

1. sanitize 済み HTML を `{@html}` で描画（`$effect` が `htmlContent` の再レンダリングごとに再解決）
2. コンテナ DOM の `img[src]` / `a[href]` から **`parseRawMediaUrl` が受理する URL だけ**を検出（自前の緩い正規表現は使わない。`-media` サフィックス・`main` ブランチ・ルート直下 1 セグメントの厳格版）
3. 同期層 `resolveMedia`（pending → mediaCache → 認証 fetch）で ArrayBuffer を取得し Blob URL 化
4. 拡張子で振り分けて差し替え: 画像 → `<img>` / mp4・webm → `<video controls>` / mp3・m4a・ogg・wav → `<audio controls>` / zip 等 → `<a download>`（Blob URL 直ダウンロード）

#### DOMPurify との整合（XSS 面の判断）

`ALLOWED_URI_REGEXP` に `blob:` は**追加しない**。追加すると本文由来の任意の `blob:` URL までサニタイズを通過してしまう。sanitize は現行ポリシーのまま行い、sanitize 後の DOM に対して検証済み URL（parseRawMediaUrl 受理）だけをこちらが生成した Blob URL に置き換える。

**svg のみ Blob 化前に中身も DOMPurify（`USE_PROFILES: svg`）で sanitize する**。blob: URL は生成元（アプリ）オリジンを継承するため、`<img>` 表示は安全でも画像を「新しいタブで開く」と `image/svg+xml` の SVG がドキュメントとして script 実行され、アプリオリジンの localStorage（GitHub PAT）に届いてしまう。MIME 偽装では `<img>` が SVG を描画しなくなるため、中身から活性コンテンツを除去する方式を採る（正当な SVG 図形は表示され続ける）。

#### 状態表示と失敗時

- キャッシュ済み（Blob URL 生成済み）なら即時差し替え、未取得は「読み込み中」プレースホルダ → 完了で差し替え
- 失敗（オフライン・削除済み）は壊れ画像アイコンでなく、ファイル名 + リトライボタン付きプレースホルダ（i18n キー `media.preview.*`、テーマ変数のみでスタイリング）
- public リポでも同じコードパス（認証 fetch は public でも成功する）。可視性分岐はない

#### Blob URL のライフサイクル

- URL → Blob URL の Map で重複排除（同一 URL の複数出現・再レンダリングで resolveMedia と Blob 生成は 1 回）
- 再レンダリングで参照されなくなった Blob URL は次回 apply 時に revoke、コンポーネント破棄時に全 revoke
- 純粋関数（種別判定・MIME 解決・ファイル名抽出）は node 環境の vitest でテスト（`media-resolve.test.ts`）

#### 画像化（html2canvas）との関係

解決済み `<img>` の `blob:` URL は同一オリジン扱いで共有画像に描画される。`<video>`/`<audio>` は html2canvas がフレームを描画しないため共有画像には映らない（既知の制約）。編集モードの選択範囲共有（`share.ts` の `convertMarkdownToImageBlob`）ではメディアを解決しない（安全側=未解決のまま）。

### 2ペイン対応

#### 使用例

- **左ペイン**: リーフAを編集
- **右ペイン**: リーフAをプレビュー → リアルタイムで編集内容がプレビューに反映
- **左ペイン**: リーフBを編集
- **右ペイン**: リーフCをプレビュー → 独立して動作

#### 同期動作

同じリーフを左右で開いている場合、編集内容は即座に両方のペインに反映されるため、編集とプレビューをリアルタイムで確認できます。

### 動作フロー

1. **リーフを編集モードで開く** → CodeMirrorでマークダウンを編集
2. **プレビューボタンをクリック** → PreviewViewに切り替え → HTMLレンダリング表示
3. **編集ボタンをクリック** → EditorViewに戻る
4. **URLに状態を保存** → `:preview`サフィックスでプレビュー状態を永続化
5. **ブラウザの戻る/進むボタン** → 編集/プレビューを行き来できる

---
