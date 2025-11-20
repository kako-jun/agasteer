# simplest-md-note

ブラウザだけで動く軽量なMarkdownノートアプリです。GitHub API への直接同期を行い、外部サービスを使わずに複数ノートを管理できます。

## 特長

- Svelte + Vite による軽量構成
- CodeMirror を使った Markdown エディタ
- GitHub Personal Access Token をローカルに保存して同期
- フォルダ階層は最大2階層。GitHub 上も同じ階層で`.md`ファイルとして保存
- UI は白背景と最低限のボタンのみ

## セットアップ

1. 依存パッケージのインストール
   ```bash
   npm install
   ```
2. 開発サーバーの起動
   ```bash
   npm run dev
   ```
   ブラウザで `http://localhost:5173` を開きます。
3. ビルド
   ```bash
   npm run build
   ```
4. ビルド結果の確認
   ```bash
   npm run preview
   ```

## 品質チェックとコミット前フック

- フォーマット: `npm run format`（Prettier）
- フォーマットチェック: `npm run format:check`
- 型・Lintチェック: `npm run check`（svelte-check）
- まとめて実行: `npm run lint`

Husky の pre-commit フックで `npm run lint` が自動実行されます。初回セットアップ後に `npm run prepare` を一度実行すると `.husky` が有効になります。

## CI

GitHub Actions（`.github/workflows/ci.yml`）で push 時に `npm install` → `npm run lint` → `npm run build` を実行します。

## 使い方

1. 設定セクションで GitHub トークン、コミットユーザー名、メールアドレス、リポジトリ名（`owner/repo`）、保存パスを入力し「設定を保存」を押します。これらは LocalStorage に保存されます。
2. 「新規ノート」でノートを作成し、フォルダ/サブフォルダ名とタイトルを入力します。フォルダ階層は2階層までです。
3. エディタで内容を編集し、「Save to GitHub」を押すと指定パスに`.md`として同期します。コミットメッセージは固定で `auto-sync` です。
4. ローカルに保存したい場合は「Download .md」を押します。

## 実装メモ

- GitHub 同期は `PUT /repos/{owner}/{repo}/contents/{path}` を使用し、最新 SHA を取得して強制上書きします。
- 同期時の committer 情報には設定したユーザー名・メールを使います。
- ノートや設定は LocalStorage に保存し、最近使ったノートをトップに表示します。
- CSS は `src/app.css` に最小限のみ定義しています。

## 注意事項

- GitHub トークンはブラウザの LocalStorage に保存されます。安全な端末で利用してください。
- 本リポジトリにはビルド済みの出力を含みません。必要に応じて `npm run build` を実行してください。
