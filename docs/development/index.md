# SimplestNote.md - 開発者向けドキュメント

> SimplestNote.mdの技術仕様と開発ガイドです。

---

## 📚 ドキュメント目次

### 基本設計

- **[アーキテクチャ](./architecture.md)**
  - アーキテクチャ概要と設計哲学
  - 技術スタック（Svelte, TypeScript, Vite, CodeMirror）
  - プロジェクト構造とファイル構成
  - コードアーキテクチャとレイヤー構造

- **[データモデルと状態管理](./data-model.md)**
  - TypeScript型定義（Settings, Folder, Note, View）
  - データの一意性とリレーション
  - 状態管理とデータフロー
  - CRUD操作のパターン

### 機能実装

- **[基本機能の実装](./features.md)**
  - エディタ管理（CodeMirror統合）
  - パンくずナビゲーション
  - モーダルシステム
  - ノート階層制限

- **[UI/UX機能](./ui-features.md)**
  - 2ペイン表示（アスペクト比判定、レスポンシブ対応）
  - カスタムフォント機能（クライアントサイド保存、リロード不要）
  - カスタム背景画像機能（左右ペイン別々に設定可能）
  - 国際化（i18n）対応（日本語・英語、自動検出、手動切替）
  - シェア機能（URLコピー、Markdownコピー）
  - PWA対応（アイコン、スタンドアロンモード）
  - タイトルリンク化（別タブで開く）
  - GitHub設定ヘルプ（?アイコンでモーダル表示）

- **[コンテンツ同期機能](./content-sync.md)**
  - リーフのタイトルと#見出しの双方向同期

- **[プレビュー機能](./preview-features.md)**
  - マークダウンプレビュー（marked + DOMPurify）
  - 編集/プレビュー間のスクロール同期
  - プレビュー画像ダウンロード（html2canvas、全体キャプチャ）
  - プレビュー画像シェア（Clipboard API、Web Share API）

- **[データ保護機能](./data-protection.md)**
  - Push回数カウント
  - 未保存変更の確認

- **[GitHub API統合](./github-integration.md)**
  - 認証とファイルパス構築
  - 既存ファイルのSHA取得
  - ファイル保存とBase64エンコーディング

- **[データ永続化とストレージ](./storage.md)**
  - LocalStorage（設定情報）
  - IndexedDB（ノート・リーフ・カスタムフォントデータ）
  - GitHub（リモートリポジトリ）
  - テーマシステム

### 開発・運用

- **[実装されたリファクタリング](./refactoring.md)**
  - コンポーネント分割の経緯
  - 状態管理の改善（Svelteストア導入）
  - ビジネスロジックの分離
  - モジュール分離の完了（sync.ts, ui.ts, Toast.svelte）

- **[開発ガイド](./development.md)**
  - 開発ワークフロー
  - パフォーマンス最適化
  - セキュリティ考慮事項
  - トラブルシューティング

- **[拡張計画と既知の課題](./future-plans.md)**
  - 短期・中期・長期的な拡張計画
  - 既知の課題（メタデータの永続化問題）
  - 次の実装計画

---

## 🛠️ クイックリファレンス

### 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# 型チェック（ウォッチモード）
npm run check -- --watch

# フォーマットチェック
npm run format:check

# リント（フォーマット + 型チェック）
npm run lint

# 本番ビルド
npm run build

# ビルド結果確認
npm run preview
```

### プロジェクト統計

- **総行数**: 約8,400行（コメント・空行含む）
- **ソースファイル数**: 59個（.svelte + .ts）
- **コンポーネント数**: 45個（30個の一般コンポーネント + 14個のアイコン + 1個のIconButton）
- **libモジュール数**: 14個
- **ドキュメント数**: 20個以上（CLAUDE.md + README.md + CONTRIBUTING.md + docs/下）

### 主要技術

| 技術                       | バージョン | 役割                                |
| -------------------------- | ---------- | ----------------------------------- |
| **Svelte**                 | 4.2.19     | リアクティブUIフレームワーク        |
| **TypeScript**             | 5.7.2      | 型安全性の提供                      |
| **Vite**                   | 5.4.10     | ビルドツール & 開発サーバー         |
| **CodeMirror**             | 6.0.1      | 高機能エディタ                      |
| **@replit/codemirror-vim** | latest     | Vimキーバインディング               |
| **marked**                 | 17+        | マークダウン→HTML変換（プレビュー） |
| **DOMPurify**              | 3+         | XSSサニタイゼーション               |
| **svelte-i18n**            | 4+         | 国際化（i18n）対応                  |

---

## 🎯 コントリビューション

Issue、Pull Requestを歓迎します！詳しくは[CONTRIBUTING.md](../../CONTRIBUTING.md)をご覧ください。

---

## 📞 サポート

- **リポジトリ**: [simplest-note-md](https://github.com/kako-jun/simplest-note-md)
- **デモサイト**: [https://simplest-note-md.llll-ll.com](https://simplest-note-md.llll-ll.com)
- **デプロイ**: Cloudflare Pages（自動デプロイ）

---

**Last Updated**: 2025-11-24
