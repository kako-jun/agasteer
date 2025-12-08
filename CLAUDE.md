# Agasteer - 開発者向けドキュメント

> このドキュメントは、Agasteerの全体像を把握するための目次とプロジェクト進捗管理を提供します。
> 詳細なドキュメントは[docs/](./docs/)ディレクトリに分割して配置されています。

---

## 📚 ドキュメント目次

### ユーザー向けドキュメント

- **[ユーザーガイド](./docs/user-guide/index.md)** - Agasteerの使い方
  - [初期設定とクイックスタート](./docs/user-guide/getting-started.md)
  - [ノートとリーフの管理](./docs/user-guide/basic-features.md)
  - [応用機能（2ペイン、プレビュー、Vimモード）](./docs/user-guide/advanced-features.md)
  - [GitHub連携](./docs/user-guide/github-sync.md)
  - [カスタマイズ（テーマ、フォント、背景画像）](./docs/user-guide/customization.md)
  - [よくある質問（FAQ）](./docs/user-guide/faq.md)

### 開発者向けドキュメント

- **[開発者向けドキュメント](./docs/development/index.md)** - 技術仕様と開発ガイド

#### 基本設計

- **[アーキテクチャ](./docs/development/architecture.md)**
  - アーキテクチャ概要と設計哲学
  - 技術スタック（Svelte, TypeScript, Vite, CodeMirror）
  - プロジェクト構造とファイル構成
  - コードアーキテクチャとレイヤー構造

- **[データモデルと状態管理](./docs/development/data-model.md)**
  - TypeScript型定義（Settings, Folder, Note, View）
  - データの一意性とリレーション
  - 状態管理とデータフロー
  - CRUD操作のパターン

#### 機能実装

- **[基本機能の実装](./docs/development/features.md)**
  - エディタ管理（CodeMirror統合）
  - Ctrl+S / Cmd+S でPush
  - Vimモード（カスタムコマンド、2ペイン対応）
  - パンくずナビゲーション
  - モーダルシステム
  - ノート階層制限

- **[UI/UX機能](./docs/development/ui-features.md)**
  - 2ペイン表示（アスペクト比判定、レスポンシブ対応）
  - 罫線エディタモード（ノート風罫線、行番号表示）
  - カスタムフォント機能（クライアントサイド保存、リロード不要）
  - システム等幅Webフォント（BIZ UDGothic、IndexedDBキャッシュ）
  - カスタム背景画像機能（左右ペイン別々に設定可能）
  - 国際化（i18n）対応（日本語・英語、自動検出、手動切替）
  - バッジ機能（ノート/リーフにアイコン+色を設定）
  - ウェルカムポップアップ（モバイル対応、言語自動検出）
  - アプリアイコン（テーマカラー対応）
  - 統計パネル（リーフ数、文字数、Push回数）
  - シェア機能（URLコピー、Markdownコピー）
  - PWA対応（アイコン、スタンドアロンモード、ヘッダーPullボタン）
  - タイトルリンク化（別タブで開く）
  - GitHub設定ヘルプ（?アイコンでモーダル表示）
  - Priorityリーフ（優先段落の集約、仮想リーフ、統計除外）

- **[コンテンツ同期機能](./docs/development/content-sync.md)**
  - リーフのタイトルと#見出しの双方向同期

- **[プレビュー機能](./docs/development/preview-features.md)**
  - マークダウンプレビュー（marked + DOMPurify）
  - 編集/プレビュー間のスクロール同期
  - プレビュー画像ダウンロード（html2canvas、全体キャプチャ）
  - プレビュー画像シェア（Clipboard API、Web Share API）

- **[データ保護機能](./docs/development/data-protection.md)**
  - Push回数カウント
  - 未保存変更の確認

- **[GitHub API統合](./docs/development/github-integration.md)**
  - 認証とファイルパス構築
  - 既存ファイルのSHA取得
  - ファイル保存とBase64エンコーディング

- **[データ永続化とストレージ](./docs/development/storage.md)**
  - LocalStorage（設定情報）
  - IndexedDB（ノート・リーフ・カスタムフォントデータ）
  - GitHub（リモートリポジトリ）
  - テーマシステム

#### 開発・運用

- **[実装されたリファクタリング](./docs/development/refactoring.md)**
  - コンポーネント分割の経緯
  - 状態管理の改善（Svelteストア導入）
  - ビジネスロジックの分離
  - モジュール分離の完了（sync.ts, ui.ts, Toast.svelte）

- **[開発ガイド](./docs/development/development.md)**
  - 開発ワークフロー
  - パフォーマンス最適化
  - セキュリティ考慮事項
  - トラブルシューティング

- **[拡張計画と既知の課題](./docs/development/future-plans.md)**
  - 短期・中期・長期的な拡張計画
  - 既知の課題（メタデータの永続化問題）
  - 次の実装計画

### 共有リソース

- **[GitHub Personal Access Tokenの取得](./docs/shared/github-token.md)** - トークン取得の詳細な手順

---

## 🎯 現在の進捗状況

### ✅ 完了した実装（2025-11-27時点）

#### コンポーネント分割とモジュール化

- [x] 1,373行の単一ファイルから15ファイルへの分割
- [x] レイアウトコンポーネント（Header, Breadcrumbs, Modal）
- [x] ビューコンポーネント（Home, Folder, Editor, Settings）
- [x] エディタコンポーネント（MarkdownEditor）
- [x] ビジネスロジック層（stores, github, storage, theme, types）
- [x] **設定画面のコンポーネント分割**（490行→100行、7個の独立コンポーネント作成）

#### 状態管理とデータフロー

- [x] Svelteストアの導入（writable, derived）
- [x] グローバル状態の一元管理
- [x] データ永続化仕様の明確化（GitHub SSoT設計）
- [x] LocalStorage（設定のみ）とIndexedDB（ノート・リーフ）の分離
- [x] **ノート階層制限**（ルートノート→サブノートの2階層まで）
- [x] **左右対称設計**（ビューストアをローカル変数化、全ナビゲーション関数統一）

#### UI/UX改善

- [x] 設定画面のモーダル化
- [x] URLルーティング（パスベース）の実装（1ペイン版）
- [x] ブラウザ履歴対応（戻る/進むボタン）
- [x] トースト通知（Push/Pull開始時）
- [x] テーマボタンのスマホ対応（3個ずつ2段表示）
- [x] **2ペイン表示**（アスペクト比判定: 横 > 縦で2ペイン表示）
- [x] **レスポンシブ対応**（スマホ横向きで2ペイン表示に自動切替）
- [x] **リーフのタイトルと#見出しの双方向同期**（# のみ対応、新規リーフは初期コンテンツ設定）
- [x] **左右ペイン独立編集**（EditorViewを左右対等に実装、leafIdベース更新）
- [x] **2ペイン表示での同期**（同じリーフを左右で開いている場合は即座に同期）
- [x] **マークダウンプレビュー機能**（marked + DOMPurify、編集/プレビュートグル、URLルーティング対応）
- [x] **編集/プレビュー間のスクロール同期**（同じリーフを左右で開いた際の双方向スクロール同期、無限ループ防止）
- [x] **プレビュー画像ダウンロード**（html2canvas動的ロード、白背景+20px余白、スクロール全体を1枚の画像に、PNG形式）
- [x] **プレビュー画像シェア**（Clipboard APIで画像コピー、Web Share APIでLINE等に直接送信、編集/プレビューで自動切替）
- [x] **カスタムフォント機能**（.ttf/.otf/.woff/.woff2対応、IndexedDB保存、リロード不要で適用・削除）
- [x] **システム等幅Webフォント**（BIZ UDGothic自動ダウンロード、IndexedDBキャッシュ、エディタ+codeブロックのみ適用）
- [x] **カスタム背景画像機能**（左右ペイン別々に設定可能、.jpg/.png/.webp/.gif対応、IndexedDB保存、透明度0.1で半透明表示）
- [x] **国際化（i18n）機能**（日本語・英語対応、ブラウザ言語自動検出、設定画面で手動切替、LocalStorage永続化）
- [x] **シェア機能**（パンくずリストからURLコピー、Markdownコピー）
- [x] **PWA対応**（アイコン追加、スタンドアロンモード、スマホホーム画面対応）
- [x] **タイトルリンク化**（Ctrl+クリックで別タブを開く、中クリック対応）
- [x] **GitHub設定ヘルプ**（リポジトリ名・トークン入力欄に?アイコン、モーダルで説明画像表示）
- [x] **Vimモード**（CodeMirror Vim、設定画面で切り替え可能、`:w`でPush、`:q`で親ノートへ遷移、`:wq`で保存して閉じる、`<Space>`でペイン切り替え、2ペイン対応で左右独立実行）
- [x] **ボタン共通化**（IconButtonコンポーネント、14個のアイコンコンポーネント、コード重複削減）
- [x] **ビルド日付の自動生成**（Vite define、ビルド時に自動的にバージョン番号を日付に設定）
- [x] **PWAヘッダPullボタン**（#1）タイトル右にダウンロードアイコン、PWA版でもリロードなしでPull可能
- [x] **アプリアイコン（テーマカラー対応）**（#4）デフォルトタイトル時のみヘッダー左にアイコン表示、アクセントカラーで描画
- [x] **ウェルカムポップアップ改善**（#5）モバイルで縦並びボタン、ブラウザ言語自動検出で日本語表示
- [x] **Ctrl+S でPush**（#11）ブラウザ保存ダイアログをオーバーライド、空コミット防止
- [x] **バッジ機能**（#13）ノート/リーフカード右上にアイコン+色を設定、5×5グリッド+5色パレット
- [x] **ホーム統計拡張**（#15）リーフ数・文字数・Push回数を右下に表示、StatsPanelコンポーネント
- [x] **罫線エディタモード**（#18）設定で有効化、ノート風罫線と行番号を表示、ライト/ダーク対応
- [x] **Priorityリーフ**（#14）`[n]` マーカー付き段落を集約、仮想リーフとして表示、統計除外
- [x] **新規ノート/リーフ作成時の名前入力モーダル**（フッターボタンクリックでモーダル表示、名前確定後に作成、Enter/Escキー対応）

#### GitHub同期

- [x] Push/Pull処理の分離（sync.ts）
- [x] トースト状態管理（ui.ts）
- [x] 初回Pull時のIndexedDB全削除→全作成フロー
- [x] **Git Tree APIによる一括Push**（削除・リネーム対応、APIリクエスト数削減）
- [x] **SHA最適化**（変更されていないファイルは転送しない）
- [x] **Push並行実行防止**（isPushingフラグ）
- [x] **強制更新**（force: true、個人用アプリなので常に成功を優先）
- [x] **Pull高速化**（優先度ベースの段階的ローディング）
  - URLで指定されたリーフを第1優先で取得、UIを早期解放
  - 同じノート配下のリーフを第2優先で取得
  - 10並列でリーフを取得（CONTENT_FETCH_CONCURRENCY = 10）
  - `onStructure`/`onLeaf`/`onPriorityComplete`コールバック
- [x] **交通整理（canSync関数）**
  - Pull/Push操作の排他制御を一元管理
  - ボタンでもVim `:w`でも同じ条件でブロック

#### データ保護

- [x] **未保存変更の確認機能**
  - isDirtyストアでGitHubにPushされていない変更を追跡
  - Pull実行時に確認ダイアログを表示
  - ページ離脱時（タブを閉じる、リロード）にブラウザ標準ダイアログを表示
  - 保存ボタンに赤い丸印（notification badge）を表示
  - アプリ内ナビゲーションは制限されない（自動保存のため）
- [x] **Stale編集警告**（PC/スマホ同時編集時の上書き防止）
  - Push前にリモートのpushCountをチェック
  - リモートに新しい変更があれば警告ダイアログを表示
  - lastPulledPushCountストアで最後のPull時点を記録

### 🚧 実装中の機能

なし（現在、すべての計画済み機能が実装完了）

### 📋 今後の実装予定

#### 短期的な改善

- [ ] エクスポート/インポート機能（JSON, ZIP）
- [ ] 検索機能（ノート名、全文検索、正規表現）
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

- **総行数**: 約8,400行（コメント・空行含む）
- **ソースファイル数**: 59個（.svelte + .ts）
- **コンポーネント数**: 45個（30個の一般コンポーネント + 14個のアイコン + 1個のIconButton）
- **libモジュール数**: 14個
- **ドキュメント数**: 24個（CLAUDE.md + README.md + CONTRIBUTING.md + user-guide/7個 + development/13個 + shared/1個）

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

## 📝 変更履歴

詳細な変更履歴は [CHANGELOG.md](./CHANGELOG.md) をご覧ください。

---

## 📞 サポート

- **リポジトリ**: [agasteer](https://github.com/kako-jun/agasteer)
- **デモサイト**: [https://agasteer.llll-ll.com](https://agasteer.llll-ll.com)
- **デプロイ**: Cloudflare Pages（自動デプロイ）

---

**Last Updated**: 2025-12-08
