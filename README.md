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

サーバー不要、ブラウザだけで完結するMarkdownノートアプリです。

- IndexedDBによる高速なローカルストレージ
- オフラインでも快適に編集可能
- 静的ホスティングで簡単に公開可能

### 🔗 GitHub直接同期

Personal Access Tokenで直接GitHubリポジトリに保存できます。

- Git Tree APIによる高速一括Push
- SHA最適化で変更されたファイルのみ転送
- 未保存変更の確認機能

### ✏️ 高機能エディタ

CodeMirror 6による快適な編集環境を提供します。

- マークダウンプレビュー機能（marked + DOMPurify）
- 編集/プレビュー間のスクロール同期
- リーフタイトルと#見出しの双方向同期
- Vimモード対応（カスタムコマンド`:w` `:q` `:wq`、ペイン切り替え`<Space>`）

### 📱 2ペイン表示

横長画面では左右2ペインで同時編集できます。

- アスペクト比自動判定（横 > 縦で2ペイン表示）
- スマホ横向きにも対応
- 左右独立したナビゲーション

### 🎨 豊富なカスタマイズ

6種類のテーマとカスタマイズ機能を搭載しています。

- **6種類のテーマ**: yomi, campus, greenboard, whiteboard, dotsD, dotsF
- **カスタムフォント**: .ttf/.otf/.woff/.woff2をアップロード可能
- **カスタム背景画像**: 左右ペイン別々に設定可能
- **国際化対応**: 日本語・英語の自動切替

---

## 🚀 クイックスタート

### デモサイト

すぐに試せます：[https://simplest-note-md.llll-ll.com](https://simplest-note-md.llll-ll.com)

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/kako-jun/simplest-note-md.git
cd simplest-note-md

# 依存パッケージをインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

### 本番環境用ビルド

```bash
npm run build
npm run preview
```

---

## 📖 ドキュメント

### ユーザー向けドキュメント

SimplestNote.mdの使い方を学ぶための包括的なガイドです。

→ **[ユーザーガイド](./docs/user-guide/index.md)**

- [初期設定とクイックスタート](./docs/user-guide/getting-started.md)
- [ノートとリーフの管理](./docs/user-guide/basic-features.md)
- [応用機能（2ペイン、プレビュー、Vimモード）](./docs/user-guide/advanced-features.md)
- [GitHub連携](./docs/user-guide/github-sync.md)
- [カスタマイズ（テーマ、フォント、背景画像）](./docs/user-guide/customization.md)
- [よくある質問（FAQ）](./docs/user-guide/faq.md)

### 開発者向けドキュメント

SimplestNote.mdの技術仕様と開発ガイドです。

→ **[開発者向けドキュメント](./docs/development/index.md)**

- [アーキテクチャ](./docs/development/architecture.md)
- [データモデルと状態管理](./docs/development/data-model.md)
- [開発ガイド](./docs/development/development.md)
- [拡張計画と既知の課題](./docs/development/future-plans.md)

### 共有リソース

- [GitHub Personal Access Tokenの取得](./docs/shared/github-token.md)

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
