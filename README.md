# Agasteer

<p align="center">
  <picture>
    <source srcset="./public/assets/app-icon.webp" type="image/webp">
    <img src="./public/assets/app-icon.png" alt="Agasteer" width="128">
  </picture>
</p>

<p align="center">
  <strong>The Simplest Markdown App with GitHub Sync</strong><br>
  <em>GitHubと直接つながる、最もシンプルなMarkdownノートアプリ</em>
</p>

<p align="center">
  <sub>🔊 <b>Agasteer</b> [æɡəstíːr] — アガスティーア</sub>
</p>

<p align="center">
  <a href="https://agasteer.llll-ll.com"><strong>▶ 今すぐ試す → agasteer.llll-ll.com</strong></a>
</p>

<p align="center">
  <sub>インストール不要・アカウント登録不要・ブラウザで開くだけ</sub>
</p>

<!-- TODO: デモGIF（5-10秒、2ペイン表示とPush/Pullの様子） -->
<p align="center">
  <img src="./docs/assets/demo.gif" alt="Agasteer Demo" width="600">
</p>

<!-- TODO: YouTube紹介動画（2-3分、セットアップから基本操作まで） -->
<p align="center">
  <a href="https://www.youtube.com/watch?v=XXXXXXXXXX">
    <img src="https://img.youtube.com/vi/XXXXXXXXXX/maxresdefault.jpg" alt="Agasteer紹介動画" width="480">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version 1.0.0">
  <img src="https://img.shields.io/badge/Made%20with-Svelte-FF3E00?style=flat-square&logo=svelte" alt="Made with Svelte">
  <img src="https://img.shields.io/badge/Build-Vite-646CFF?style=flat-square&logo=vite" alt="Build with Vite">
  <img src="https://img.shields.io/badge/Editor-CodeMirror-D30707?style=flat-square" alt="CodeMirror">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License">
</p>

---

## 特長

| 機能                   | 説明                                           |
| ---------------------- | ---------------------------------------------- |
| **コンフリクトしない** | 起動時に必ずPull、GitHubが唯一の真実           |
| **GitHub直接同期**     | 中間サーバーなし、あなたのリポジトリに直接保存 |
| **スマホ・PC両対応**   | PCはVimモードで高速編集、スマホはタッチで快適  |
| **かわいくできる**     | テーマ、罫線モード、カスタムフォント、背景画像 |

→ 詳細は[ユーザーガイド](./docs/user-guide/index.md)へ

---

## 設計思想 - なぜシンプルにこだわるのか

### 今まではコンフリクトとの戦い

作者は有名ノートアプリたちでコンフリクトに悩まされ続けました。  
ある日とうとうキレて、「理論上コンフリクトしようがないアプリ」を自作しようと決断。  
Agasteerで、データ消失の不安から解放されましょう。

- **起動時に必ずPull** - 古いローカルデータで作業を始めない
- **GitHubが唯一の真実** - 迷ったらPullすればいい

### Markdownはこれから「資産」になる

AIがファイルを読み書きする時代。便利さのために自由を売り渡さない。  
買い物メモも、AIへのプロンプトも、見たい映画リストも。Agasteerで書きためましょう。

- **標準Markdown** - GitHub上で直接編集、そのまま各AIサービスの入力に使える快適さを知って
- **ただの.mdファイル** - VSCodeで開ける、差分や歴史を見られる、10年後も使える

### 軽量・高速・透明

中間サーバーなし。広告なし。ブラウザからGitHub APIに直接通信。  
Agasteerで、シンプルで透明なノート体験を始めましょう。

- **オープンソース** - [コードを確認](https://github.com/kako-jun/agasteer)できます
- **セルフホスト可能** - 自分のサーバーでホストもできます（[CONTRIBUTING.md](./CONTRIBUTING.md)）

---

## Agasteerの特徴

- **GitHub直接同期** - 中間サーバーなし、あなたのリポジトリに直接保存
- **標準Markdown** - 独自形式なし、VSCodeでもAIでも開ける
- **インストール不要** - ブラウザで開くだけ、PWAでホーム画面にも追加可能
- **完全無料** - 機能制限なし、GitHubの無料プランで十分
- **インポート対応** - 他サービスからの移行機能を順次追加中

> **なぜ比較表がないのか**: 「GitHubに直接保存するブラウザ完結型ノートアプリ」という発想の競合が存在しないため、比較する意味がありません。  
> ユーザーのデータを預かることで収益を得るビジネスモデルとは、目指す方向が異なります。

### ほかにもこんな独自性

- **Vimモード！** - 作者がキーボードのみで最速メモするために実装。`hjkl`で駆けめぐれ！
- **罫線モード！** - 現実のノートそっくりな見た目に。なんでみんなこの機能をつけないの！？
- **日本的なかわいいテーマ！** - フォントも背景画像もカスタム可能。作者は青いウィンドウのレトロRPG風にしてます！

---

## はじめかた

めんどうなのは、最初のトークン取得だけ。  
むしろ「いつかGitHubアカウントを作ろう」と思っていた方は、これをきっかけにどうぞ。

AI時代は、子どもも大人もおねーさんもGitHubを持っておくと楽しいです。

→ [初期設定ガイド](./docs/user-guide/getting-started.md)

---

## ドキュメント

### ユーザー向け

→ **[ユーザーガイド](./docs/user-guide/index.md)** - 初期設定、基本操作、応用機能、カスタマイズ

### 開発者向け

→ **[開発者向けドキュメント](./docs/development/index.md)** - アーキテクチャ、データモデル、開発ガイド

---

## コントリビューション

Issue、Pull Requestを歓迎します！詳しくは[CONTRIBUTING.md](./CONTRIBUTING.md)をご覧ください。

---

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

---

○bsi○ianの3連続コンフリクトで、自作の波動に目覚めた © kako-jun
