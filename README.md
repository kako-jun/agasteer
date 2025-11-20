# SimplestNote.md

ブラウザだけで動く、シンプルで軽量なMarkdownノートアプリケーションです。GitHub APIを使って、外部サービス不要でノートを直接リポジトリに同期できます。

<p align="center">
  <img src="https://img.shields.io/badge/Made%20with-Svelte-FF3E00?style=flat-square&logo=svelte" alt="Made with Svelte">
  <img src="https://img.shields.io/badge/Build-Vite-646CFF?style=flat-square&logo=vite" alt="Build with Vite">
  <img src="https://img.shields.io/badge/Editor-CodeMirror-D30707?style=flat-square" alt="CodeMirror">
</p>

## ✨ 特長

- **完全ブラウザベース** - サーバー不要、ブラウザだけで完結
- **GitHub直接同期** - Personal Access Tokenで直接リポジトリに保存
- **高機能エディタ** - CodeMirror 6を使用した快適な編集環境
- **階層管理** - フォルダとサブフォルダで2階層のノート整理
- **多彩なテーマ** - ライト、ダーク、黒板、かわいい、カスタムの5種類
- **ドラッグ&ドロップ** - フォルダやノートの並び替えが簡単
- **軽量設計** - Svelte + Viteによる高速でミニマルな構成
- **ローカル保存** - LocalStorageで自動保存、オフラインでも使用可能

## 🚀 はじめに

### 開発環境のセットアップ

1. **リポジトリをクローン**

   ```bash
   git clone https://github.com/yourusername/simplest-note-md.git
   cd simplest-note-md
   ```

2. **依存パッケージをインストール**

   ```bash
   npm install
   ```

3. **開発サーバーを起動**

   ```bash
   npm run dev
   ```

   ブラウザで `http://localhost:5173` を開きます。

4. **本番環境用にビルド**

   ```bash
   npm run build
   ```

   `dist/`ディレクトリに出力されます。

5. **ビルド結果をプレビュー**
   ```bash
   npm run preview
   ```

### GitHub Pagesでの公開

このプロジェクトはGitHub Pagesで簡単に公開できます。

1. GitHubリポジトリの `Settings` → `Pages` を開く
2. `Source` を `GitHub Actions` に設定
3. `main`ブランチにプッシュすると自動デプロイされます

`.github/workflows/ci.yml`が自動的にビルドとデプロイを行います。

## 📖 使い方

### 初期設定

1. **設定画面を開く**
   - ヘッダー右上の⚙️アイコンをクリック

2. **GitHub連携を設定**
   - **Personal Access Token**: GitHubで生成したトークンを入力
     - [トークンの作成方法](#github-personal-access-tokenの取得)
   - **ユーザー名**: GitHubのコミット履歴に表示される名前
   - **メールアドレス**: コミット情報に使用されるメール
   - **リポジトリ名**: `owner/repo`形式（例: `yamada/my-notes`）

3. **テーマを選択**
   - ライト、ダーク、黒板、かわいい、カスタムから選択
   - カスタムテーマでは背景色とアクセントカラーを自由に設定可能

4. **設定を保存**
   - 「設定を保存」ボタンをクリック
   - すべての設定はブラウザのLocalStorageに保存されます

### フォルダの管理

#### フォルダの作成

- ホーム画面で「+ 新規フォルダ」をクリック
- フォルダ内で「+ 新規サブフォルダ」をクリックすると、2階層目のフォルダを作成

#### フォルダ名の変更

1. フォルダをクリックして開く
2. パンくずリストのフォルダ名横にある✏️アイコンをクリック
3. 新しい名前を入力してEnterキー

#### フォルダの並び替え

- フォルダをドラッグ&ドロップで好きな順番に並び替え
- 同じ階層内でのみ並び替え可能

#### フォルダの削除

- フォルダ内の「🗑️ フォルダを削除」ボタンをクリック
- サブフォルダやノートが含まれている場合は削除できません

### ノートの管理

#### ノートの作成

1. フォルダを開く
2. 「+ 新規ノート」をクリック
3. 自動的に「ノート1」「ノート2」という名前で作成されます

#### ノートの編集

1. ノートをクリックして開く
2. CodeMirrorエディタでMarkdownを記述
3. リアルタイムで編集内容が保存されます

#### ノート名の変更

1. ノートを開く
2. パンくずリストのノート名横にある✏️アイコンをクリック
3. 新しい名前を入力してEnterキー

#### ノートの並び替え

- フォルダ内でノートをドラッグ&ドロップで並び替え

#### ノートの削除

- エディタ画面の「🗑️ ノートを削除」ボタンをクリック

### GitHubへの同期

#### 同期の実行

1. ノートを編集
2. 「💾 Save」ボタンをクリック
3. GitHub上の`notes/`ディレクトリに`.md`ファイルとして保存されます

#### 保存先のパス

```
notes/
├── フォルダ1/
│   ├── ノート1.md
│   ├── ノート2.md
│   └── サブフォルダ1/
│       ├── ノート3.md
│       └── ノート4.md
└── フォルダ2/
    └── ノート5.md
```

#### コミット情報

- コミットメッセージ: 固定で`auto-sync`
- Committer: 設定画面で入力したユーザー名とメール
- 既存ファイルは自動的に上書き更新されます

### ローカルへの保存

1. ノートを開く
2. 「⬇️ Download」ボタンをクリック
3. `.md`ファイルとしてダウンロードされます

### ナビゲーション

- **ホームに戻る**: ヘッダーの「SimplestNote.md」をクリック
- **パンくずリスト**: 現在の場所を表示、クリックでその階層に移動
- **戻る**: ブラウザの戻るボタンは使用できません（アプリ内でナビゲーション）

## 🔑 GitHub Personal Access Tokenの取得

1. GitHubにログインし、[Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)を開く
2. 「Generate new token」→「Generate new token (classic)」をクリック
3. トークンの設定:
   - **Note**: `SimplestNote.md`など分かりやすい名前
   - **Expiration**: 有効期限を設定（推奨: 90日以上）
   - **Scopes**: `repo`にチェック（リポジトリへの読み書き権限）
4. 「Generate token」をクリック
5. 表示されたトークンをコピー（一度しか表示されないので注意）
6. SimplestNote.mdの設定画面に貼り付け

## 🎨 テーマ

### ビルトインテーマ

1. **ライト** - 明るく読みやすいデフォルトテーマ
2. **ダーク** - 目に優しいダークモード
3. **黒板** - 緑色のチョークボード風デザイン
4. **かわいい** - ピンクベースの可愛らしいテーマ
5. **カスタム** - 背景色とアクセントカラーを自由にカスタマイズ

### カスタムテーマの作成

1. 設定画面で「カスタム」を選択
2. カラーピッカーで以下を設定:
   - **背景色（プライマリ）**: メインの背景色
   - **アクセントカラー**: ボタンやリンクの色
3. 設定を保存すると即座に反映されます

## 🛠️ 開発者向け情報

### コマンド

```bash
# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# ビルド結果のプレビュー
npm run preview

# コードフォーマット
npm run format

# フォーマットチェック
npm run format:check

# 型チェック
npm run check

# リントチェック（フォーマット + 型チェック）
npm run lint

# Huskyのセットアップ
npm run prepare
```

### コード品質管理

- **Prettier**: コードフォーマット
- **svelte-check**: TypeScript型チェック
- **Husky**: pre-commitフックで`npm run lint`を自動実行
- **GitHub Actions**: プッシュ時に自動ビルドとデプロイ

### プロジェクト構成

```
simplest-note-md/
├── .github/
│   └── workflows/
│       └── ci.yml           # CI/CDパイプライン
├── .husky/
│   └── pre-commit           # Git pre-commitフック
├── src/
│   ├── app.css              # グローバルスタイル
│   ├── app.d.ts             # TypeScript型定義
│   ├── App.svelte           # メインアプリケーション
│   └── main.ts              # エントリーポイント
├── dist/                    # ビルド出力（未コミット）
├── index.html               # HTMLエントリーポイント
├── package.json             # プロジェクト設定
├── vite.config.ts           # Vite設定
├── tsconfig.json            # TypeScript設定
└── README.md                # このファイル
```

詳細なアーキテクチャ情報については[CLAUDE.md](./CLAUDE.md)を参照してください。

## 🔒 セキュリティとプライバシー

### データの保存場所

- **GitHub Token**: ブラウザのLocalStorage（クリアテキスト）
- **ノート内容**: ブラウザのLocalStorage + GitHub（暗号化されたHTTPS通信）
- **設定情報**: ブラウザのLocalStorage

### 推奨事項

- ✅ 信頼できる個人端末でのみ使用する
- ✅ トークンには適切な有効期限を設定する
- ✅ 定期的にトークンをローテーションする
- ❌ 共用端末では使用しない
- ❌ トークンを他人と共有しない

### データのバックアップ

LocalStorageはブラウザのキャッシュクリアで消える可能性があります。重要なノートは：

- GitHub同期を実行してバックアップ
- ダウンロード機能でローカルに保存
- 定期的にブラウザのバックアップを取る

## ❓ よくある質問（FAQ）

### Q: サーバーは必要ですか？

**A:** いいえ、完全にブラウザ上で動作します。静的ホスティング（GitHub Pages等）で公開できます。

### Q: オフラインで使えますか？

**A:** はい、一度読み込めばオフラインで編集できます。ただし、GitHub同期にはインターネット接続が必要です。

### Q: 既存のMarkdownファイルをインポートできますか？

**A:** 現在、インポート機能はありません。GitHub上の`notes/`ディレクトリに手動で配置することは可能ですが、アプリ上では表示されません。

### Q: 複数のデバイスで同期できますか？

**A:** GitHub同期は一方向（アプリ→GitHub）のみです。複数デバイスでの双方向同期には対応していません。

### Q: フォルダ階層を3階層以上にできますか？

**A:** いいえ、現在は2階層（親フォルダとサブフォルダ）まで対応しています。

### Q: 画像は埋め込めますか？

**A:** Markdownの画像構文（`![](url)`）は使用できますが、画像アップロード機能はありません。

### Q: モバイルでも使えますか？

**A:** はい、レスポンシブデザインでモバイルブラウザでも動作します。

## 🤝 コントリビューション

Issue、Pull Requestを歓迎します！

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Requestを作成

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🙏 謝辞

- [Svelte](https://svelte.dev/) - リアクティブフレームワーク
- [Vite](https://vitejs.dev/) - 高速ビルドツール
- [CodeMirror](https://codemirror.net/) - 高機能エディタ
- [GitHub API](https://docs.github.com/en/rest) - リポジトリ連携

---

**SimplestNote.md** - シンプルで強力なMarkdownノート管理
