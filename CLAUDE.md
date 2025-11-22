# SimplestNote.md - 開発者向けドキュメント

> このドキュメントは、SimplestNote.mdの全体像を把握するための目次とプロジェクト進捗管理を提供します。
> 詳細なドキュメントは[docs/](./docs/)ディレクトリに分割して配置されています。

---

## 📚 ドキュメント目次

### 基本設計

- **[アーキテクチャ](./docs/architecture.md)**
  - アーキテクチャ概要と設計哲学
  - 技術スタック（Svelte, TypeScript, Vite, CodeMirror）
  - プロジェクト構造とファイル構成
  - コードアーキテクチャとレイヤー構造

- **[データモデルと状態管理](./docs/data-model.md)**
  - TypeScript型定義（Settings, Folder, Note, View）
  - データの一意性とリレーション
  - 状態管理とデータフロー
  - CRUD操作のパターン

### 機能実装

- **[主要機能の実装](./docs/features.md)**
  - エディタ管理（CodeMirror統合）
  - パンくずナビゲーション
  - モーダルシステム

- **[GitHub API統合](./docs/github-integration.md)**
  - 認証とファイルパス構築
  - 既存ファイルのSHA取得
  - ファイル保存とBase64エンコーディング

- **[データ永続化とストレージ](./docs/storage.md)**
  - LocalStorage（設定情報）
  - IndexedDB（ノート・リーフデータ）
  - GitHub（リモートリポジトリ）
  - テーマシステム

### 開発・運用

- **[実装されたリファクタリング](./docs/refactoring.md)**
  - コンポーネント分割の経緯
  - 状態管理の改善（Svelteストア導入）
  - ビジネスロジックの分離
  - モジュール分離の完了（sync.ts, ui.ts, Toast.svelte）

- **[開発ガイド](./docs/development.md)**
  - 開発ワークフロー
  - パフォーマンス最適化
  - セキュリティ考慮事項
  - トラブルシューティング

- **[拡張計画と既知の課題](./docs/future-plans.md)**
  - 短期・中期・長期的な拡張計画
  - 既知の課題（メタデータの永続化問題）
  - 次の実装計画（2ペイン表示、パスベースURLルーティング）

---

## 🎯 現在の進捗状況

### ✅ 完了した実装（2025-01-23時点）

#### コンポーネント分割とモジュール化

- [x] 1,373行の単一ファイルから15ファイルへの分割
- [x] レイアウトコンポーネント（Header, Breadcrumbs, Modal）
- [x] ビューコンポーネント（Home, Folder, Editor, Settings）
- [x] エディタコンポーネント（MarkdownEditor）
- [x] ビジネスロジック層（stores, github, storage, theme, types）

#### 状態管理とデータフロー

- [x] Svelteストアの導入（writable, derived）
- [x] グローバル状態の一元管理
- [x] データ永続化仕様の明確化（GitHub SSoT設計）
- [x] LocalStorage（設定のみ）とIndexedDB（ノート・リーフ）の分離

#### UI/UX改善

- [x] 設定画面のモーダル化
- [x] URLルーティング（パスベース）の実装（1ペイン版）
- [x] ブラウザ履歴対応（戻る/進むボタン）
- [x] トースト通知（Push/Pull開始時）
- [x] テーマボタンのスマホ対応（3個ずつ2段表示）

#### GitHub同期

- [x] Push/Pull処理の分離（sync.ts）
- [x] トースト状態管理（ui.ts）
- [x] 初回Pull時のIndexedDB全削除→全作成フロー

### 🚧 実装中の機能

#### 2ペイン表示（横長画面対応）

- [x] パス解決ロジック（routing.ts）
- [x] 名前重複チェック（generateUniqueName）
- [x] URLクエリパース処理（left/right対応）
- [ ] **次のステップ**: 2ペインレイアウトの実装
  - CSS Grid / Flexboxでのレイアウト分割
  - 左右独立したビュー表示
  - 状態変数（rightNote, rightLeaf, rightView）の活用
- [ ] レスポンシブ対応（メディアクエリ）
- [ ] エラーハンドリング（404エラー表示）

### 📋 今後の実装予定

#### 短期的な改善

- [ ] エクスポート/インポート機能（JSON, ZIP）
- [ ] 検索機能（ノート名、全文検索、正規表現）
- [ ] Markdownプレビュー（2ペイン）
- [ ] キーボードショートカット
- [ ] オフライン対応（Service Worker）

#### 中期的な機能

- [ ] GitHub双方向同期（自動Pull、競合解決UI）
- [ ] Markdown拡張（タスクリスト、数式、Mermaid）
- [ ] タグシステム
- [ ] 履歴管理（編集履歴、差分表示）
- [ ] モバイル最適化（PWA対応）

#### 長期的なビジョン

- [ ] プラグインシステム
- [ ] 他サービスとの連携（GitLab, Dropbox, OneDrive）
- [ ] コラボレーション（共有リンク、リアルタイム編集）
- [ ] AI統合（文章校正、自動要約）

---

## 🔧 クイックリファレンス

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

- **総行数**: 約2,178行（コメント・空行含む）
- **コンポーネント数**: 8個
- **libモジュール数**: 7個
- **ドキュメント数**: 8個（このファイル含む）

### 主要技術

| 技術           | バージョン | 役割                         |
| -------------- | ---------- | ---------------------------- |
| **Svelte**     | 4.2.19     | リアクティブUIフレームワーク |
| **TypeScript** | 5.7.2      | 型安全性の提供               |
| **Vite**       | 5.4.10     | ビルドツール & 開発サーバー  |
| **CodeMirror** | 6.0.1      | 高機能エディタ               |

---

## 📝 変更履歴

### Version 4.0 (2025-01-23)

- **ドキュメント整理**: CLAUDE.mdを目次と進捗管理に特化
- **docs/ディレクトリ**: 詳細ドキュメントを8ファイルに分割
  - architecture.md - アーキテクチャ概要
  - data-model.md - データモデルと状態管理
  - features.md - 主要機能の実装
  - github-integration.md - GitHub API統合
  - storage.md - データ永続化とストレージ
  - refactoring.md - 実装されたリファクタリング
  - development.md - 開発ガイド
  - future-plans.md - 拡張計画と既知の課題

### Version 3.0 (2025-01-23)

- モジュール分離の完了（sync.ts、ui.ts、Toast.svelte追加）
- データ永続化仕様の明確化（GitHub SSoT設計）
- UI改善（設定モーダル化、URLルーティング、トースト通知）
- 次の実装計画の追加（パスベースURLルーティング）

---

## 📞 サポート

- **リポジトリ**: [simplest-note-md](https://github.com/ariori/simplest-note-md)
- **デプロイ**: GitHub Pages（自動デプロイ）
- **CI/CD**: GitHub Actions

---

**Document Version**: 4.0
**Last Updated**: 2025-01-23
**Author**: Claude (Anthropic)
