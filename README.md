# SimplestNote.md

<p align="center">
  <img src="./public/assets/app-icon.svg" alt="SimplestNote.md" width="128">
</p>

<p align="center">
  <strong>「こういうのでいいんだよ」を実現するMarkdownノートアプリ</strong>
</p>

<p align="center">
  作者: <a href="https://github.com/kako-jun">kako-jun</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version 1.0.0">
  <img src="https://img.shields.io/badge/Made%20with-Svelte-FF3E00?style=flat-square&logo=svelte" alt="Made with Svelte">
  <img src="https://img.shields.io/badge/Build-Vite-646CFF?style=flat-square&logo=vite" alt="Build with Vite">
  <img src="https://img.shields.io/badge/Editor-CodeMirror-D30707?style=flat-square" alt="CodeMirror">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License">
</p>

---

## ✨ 特長

### 🚀 完全ブラウザベース

- サーバー不要、ブラウザだけで完結
- IndexedDBによる高速なローカルストレージ
- オフラインでも快適に編集可能

### 🔗 GitHub直接同期

- Personal Access Tokenで直接リポジトリに保存
- Git Tree APIによる高速一括Push
- SHA最適化で変更されたファイルのみ転送
- 未保存変更の確認機能

### ✏️ 高機能エディタ

- CodeMirror 6による快適な編集環境
- マークダウンプレビュー機能（marked + DOMPurify）
- 編集/プレビュー間のスクロール同期
- リーフタイトルと#見出しの双方向同期

### 📱 2ペイン表示

- 横長画面では左右2ペインで同時編集
- アスペクト比自動判定（横 > 縦で2ペイン表示）
- スマホ横向きにも対応
- 左右独立したナビゲーション

### 🎨 豊富なカスタマイズ

- **6種類のテーマ**: yomi, campus, greenboard, whiteboard, dotsD, dotsF
- **カスタムフォント**: .ttf/.otf/.woff/.woff2をアップロード可能
- **カスタム背景画像**: 左右ペイン別々に設定可能（.jpg/.png/.webp/.gif対応）
- **半透明表示**: 背景画像は透明度0.1で表示

### 🌍 国際化対応

- 日本語・英語の自動切替
- ブラウザ言語設定を自動検出
- 設定画面で手動切替可能

### 📝 シンプルな階層管理

- ノート→サブノートの2階層構造
- ドラッグ&ドロップで並び替え
- 同じノート内でリーフの並び替えが可能

### ⚡ 軽量設計

- Svelte + Viteによる高速でミニマルな構成
- 総コード量: 約6,300行
- ビルドサイズ: 最小限

---

## 🚀 はじめに

### デモサイト

[https://simplest-note-md.llll-ll.com](https://simplest-note-md.llll-ll.com)

### 開発環境のセットアップ

1. **リポジトリをクローン**

   ```bash
   git clone https://github.com/kako-jun/simplest-note-md.git
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

### Cloudflare Pagesでの公開

このプロジェクトはCloudflare Pagesで簡単に公開できます。

1. Cloudflareアカウントにログイン
2. Pages → Create a project
3. GitHubリポジトリを接続
4. ビルド設定:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. デプロイ開始

---

## 📖 使い方

### 初期設定

1. **設定画面を開く**
   - ヘッダー右上の⚙️アイコンをクリック

2. **GitHub連携を設定**
   - **Personal Access Token**: GitHubで生成したトークンを入力（必須）
     - [トークンの作成方法](#github-personal-access-tokenの取得)
   - **リポジトリ名**: `owner/repo`形式（例: `yamada/my-notes`）（必須）
   - コミット情報（ユーザー名・メールアドレス）は自動設定されます

3. **テーマを選択**
   - yomi, campus, greenboard, whiteboard, dotsD, dotsFから選択
   - 6種類の個性的なテーマを用意

4. **カスタムフォントを設定（オプション）**
   - 「フォント選択」ボタンから.ttf/.otf/.woff/.woff2ファイルをアップロード
   - 即座にアプリ全体に適用（リロード不要）
   - 「デフォルトに戻す」ボタンで元に戻せます

5. **カスタム背景画像を設定（オプション）**
   - 左右ペイン別々に背景画像を設定可能
   - 「背景画像選択」ボタンから.jpg/.png/.webp/.gifファイルをアップロード
   - 透明度0.1で半透明表示されます
   - 「デフォルトに戻す」ボタンで削除

6. **言語を選択**
   - 日本語 / English
   - 初回は自動検出、以降は手動切替可能

7. **設定を保存**
   - 💾ボタン（保存）をクリック
   - GitHubに自動Push

### ノートの管理

#### ノートの作成

1. ホーム画面でフッターの「新規ノート」ボタン（フォルダ+アイコン）をクリック
2. 自動的に「ノート1」「ノート2」という名前で作成されます
3. ノート内で「新規サブノート」ボタン（フォルダ+アイコン）をクリックすると、2階層目のノートを作成

#### ノートの編集

1. ノートをクリックして開く
2. CodeMirrorエディタでMarkdownを記述
3. リアルタイムでIndexedDBに自動保存されます
4. 💾ボタンでGitHubにPush

#### ノート名の変更

1. ノートを開く
2. パンくずリストのノート名横にある✏️アイコンをクリック
3. 新しい名前を入力してEnterキー

#### ノートの並び替え

- ノートをドラッグ&ドロップで好きな順番に並び替え
- 同じ階層内でのみ並び替え可能

#### ノートの削除

- ノート画面の🗑️ボタン（ノートを削除）をクリック
- サブノートやリーフが含まれている場合は削除できません

### リーフの管理

#### リーフの作成

1. ノートを開く
2. フッターの「新規リーフ」ボタン（ドキュメント+アイコン）をクリック
3. 自動的に「リーフ1」「リーフ2」という名前で作成されます

#### リーフの編集

1. リーフをクリックして開く
2. エディタでMarkdownを記述
3. 1行目が `# 見出し` の場合、リーフタイトルが自動更新されます

#### リーフのプレビュー

1. エディタ画面の👁️ボタン（プレビュー）をクリック
2. マークダウンがHTMLレンダリングされて表示されます
3. もう一度クリックで編集モードに戻ります

#### リーフの並び替え

- 同じノート内でリーフをドラッグ&ドロップで並び替え
- 別のノートへのリーフ移動は現在サポートされていません

#### リーフの削除

- エディタ画面の🗑️ボタン（リーフを削除）をクリック

### 2ペイン表示

#### 自動切替

- 画面のアスペクト比が横 > 縦の場合、自動的に2ペイン表示になります
- スマホを横向きにすると2ペインに切り替わります

#### 左右独立操作

- 左右それぞれで異なるノート/リーフを開けます
- 左右で同じリーフを開くと、編集が即座に同期されます
- スクロール位置も左右で同期します

### GitHubへの同期

#### Pushの実行

1. ノートを編集
2. 💾ボタン（保存）をクリック
3. GitHub上の`notes/`ディレクトリに`.md`ファイルとして保存されます

#### Pullの実行

1. 設定画面の「Pullテスト」ボタンをクリック
2. GitHub上の最新データをIndexedDBに同期
3. 未保存の変更がある場合は確認ダイアログが表示されます

#### 保存先のパス

```
notes/
├── ノート1/
│   ├── リーフ1.md
│   ├── リーフ2.md
│   └── サブノート1/
│       ├── リーフ3.md
│       └── リーフ4.md
└── ノート2/
    └── リーフ5.md
```

#### 未保存変更の確認

- 💾ボタン（保存）に赤い丸印が表示されます
- Pull実行時に確認ダイアログが表示されます
- ページ離脱時（タブを閉じる、リロード）にブラウザ標準の確認ダイアログが表示されます

#### Push回数カウント

- ホーム画面右下にPush回数が統計情報として表示されます
- `metadata.json`に保存されます

### ローカルへの保存

1. リーフを開く
2. ⬇️ボタン（ダウンロード）をクリック
3. `.md`ファイルとしてダウンロードされます

### ナビゲーション

- **ホームに戻る**: ヘッダーの「SimplestNote.md」をクリック
- **パンくずリスト**: 現在の場所を表示、クリックでその階層に移動
- **ブラウザの戻る/進むボタン**: URLルーティングに対応

---

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

---

## 🎨 テーマ

### 6種類のテーマ

1. **yomi** - シンプルで読みやすいデフォルトテーマ
2. **campus** - 落ち着いた色合いのキャンパステーマ
3. **greenboard** - 緑色の黒板風デザイン
4. **whiteboard** - 明るいホワイトボード風デザイン
5. **dotsD** - ドット柄のダークテーマ
6. **dotsF** - ドット柄の明るいテーマ

---

## 🛠️ 技術スタック

| 技術            | バージョン | 役割                                |
| --------------- | ---------- | ----------------------------------- |
| **Svelte**      | 4.2.19     | リアクティブUIフレームワーク        |
| **TypeScript**  | 5.7.2      | 型安全性の提供                      |
| **Vite**        | 5.4.10     | ビルドツール & 開発サーバー         |
| **CodeMirror**  | 6.0.1      | 高機能エディタ                      |
| **marked**      | 17+        | マークダウン→HTML変換（プレビュー） |
| **DOMPurify**   | 3+         | XSSサニタイゼーション               |
| **svelte-i18n** | 4+         | 国際化（i18n）対応                  |

---

## 🔒 セキュリティとプライバシー

### データの保存場所

- **GitHub Token**: ブラウザのLocalStorage（クリアテキスト）
- **ノート内容**: ブラウザのIndexedDB + GitHub（暗号化されたHTTPS通信）
- **設定情報**: ブラウザのLocalStorage
- **カスタムフォント**: ブラウザのIndexedDB（`fonts`オブジェクトストア）
- **カスタム背景画像**: ブラウザのIndexedDB（`backgrounds`オブジェクトストア）

### 推奨事項

- ✅ 信頼できる個人端末でのみ使用する
- ✅ トークンには適切な有効期限を設定する
- ✅ 定期的にトークンをローテーションする
- ❌ 共用端末では使用しない
- ❌ トークンを他人と共有しない

### データのバックアップ

IndexedDBはブラウザのキャッシュクリアで消える可能性があります。重要なノートは：

- GitHub同期を実行してバックアップ
- ダウンロード機能でローカルに保存
- 定期的にブラウザのバックアップを取る

---

## ❓ よくある質問（FAQ）

### Q: サーバーは必要ですか？

**A:** いいえ、完全にブラウザ上で動作します。静的ホスティング（Cloudflare Pages等）で公開できます。

### Q: オフラインで使えますか？

**A:** はい、一度読み込めばオフラインで編集できます。ただし、GitHub同期にはインターネット接続が必要です。

### Q: 既存のMarkdownファイルをインポートできますか？

**A:** 現在、インポート機能はありません。GitHub上の`notes/`ディレクトリに手動で配置した後、Pullを実行することで読み込めます。

### Q: 複数のデバイスで同期できますか？

**A:** GitHub同期は双方向対応しています。複数デバイスで同じリポジトリにPull/Pushすることで同期できます。ただし、競合解決UIはまだ実装されていません。

### Q: ノート階層を3階層以上にできますか？

**A:** いいえ、現在は2階層（親ノートとサブノート）まで対応しています。

### Q: 画像は埋め込めますか？

**A:** Markdownの画像構文（`![](url)`）は使用できますが、画像アップロード機能はありません。GitHub上に画像を配置してURLを参照してください。

### Q: モバイルでも使えますか？

**A:** はい、レスポンシブデザインでモバイルブラウザでも動作します。スマホを横向きにすると2ペイン表示にも対応します。

---

## 🤝 コントリビューション

Issue、Pull Requestを歓迎します！詳しくは[CONTRIBUTING.md](./CONTRIBUTING.md)をご覧ください。

---

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

---

## 🙏 謝辞

- [Svelte](https://svelte.dev/) - リアクティブフレームワーク
- [Vite](https://vitejs.dev/) - 高速ビルドツール
- [CodeMirror](https://codemirror.net/) - 高機能エディタ
- [GitHub API](https://docs.github.com/en/rest) - リポジトリ連携
- [marked](https://marked.js.org/) - Markdownパーサー
- [DOMPurify](https://github.com/cure53/DOMPurify) - HTMLサニタイザー
- [svelte-i18n](https://github.com/kaisermann/svelte-i18n) - 国際化ライブラリ

---

**SimplestNote.md** - シンプルで強力なMarkdownノート管理

Version 1.0.0 | MIT License | © 2025 kako-jun
