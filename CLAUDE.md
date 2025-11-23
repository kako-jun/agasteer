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

- **[基本機能の実装](./docs/features.md)**
  - エディタ管理（CodeMirror統合）
  - パンくずナビゲーション
  - モーダルシステム
  - ノート階層制限

- **[UI/UX機能](./docs/ui-features.md)**
  - 2ペイン表示（アスペクト比判定、レスポンシブ対応）
  - カスタムフォント機能（クライアントサイド保存、リロード不要）
  - 国際化（i18n）対応（日本語・英語、自動検出、手動切替）

- **[コンテンツ同期機能](./docs/content-sync.md)**
  - リーフのタイトルと#見出しの双方向同期

- **[プレビュー機能](./docs/preview-features.md)**
  - マークダウンプレビュー（marked + DOMPurify）
  - 編集/プレビュー間のスクロール同期

- **[データ保護機能](./docs/data-protection.md)**
  - Push回数カウント
  - 未保存変更の確認

- **[GitHub API統合](./docs/github-integration.md)**
  - 認証とファイルパス構築
  - 既存ファイルのSHA取得
  - ファイル保存とBase64エンコーディング

- **[データ永続化とストレージ](./docs/storage.md)**
  - LocalStorage（設定情報）
  - IndexedDB（ノート・リーフ・カスタムフォントデータ）
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
- [x] **カスタムフォント機能**（.ttf/.otf/.woff/.woff2対応、IndexedDB保存、リロード不要で適用・削除）
- [x] **カスタム背景画像機能**（左右ペイン別々に設定可能、.jpg/.png/.webp/.gif対応、IndexedDB保存、透明度0.1で半透明表示）
- [x] **国際化（i18n）機能**（日本語・英語対応、ブラウザ言語自動検出、設定画面で手動切替、LocalStorage永続化）

#### GitHub同期

- [x] Push/Pull処理の分離（sync.ts）
- [x] トースト状態管理（ui.ts）
- [x] 初回Pull時のIndexedDB全削除→全作成フロー
- [x] **Git Tree APIによる一括Push**（削除・リネーム対応、APIリクエスト数削減）
- [x] **SHA最適化**（変更されていないファイルは転送しない）
- [x] **Push並行実行防止**（isPushingフラグ）
- [x] **強制更新**（force: true、個人用アプリなので常に成功を優先）

#### データ保護

- [x] **未保存変更の確認機能**
  - isDirtyストアでGitHubにPushされていない変更を追跡
  - Pull実行時に確認ダイアログを表示
  - ページ離脱時（タブを閉じる、リロード）にブラウザ標準ダイアログを表示
  - 保存ボタンに赤い丸印（notification badge）を表示
  - アプリ内ナビゲーションは制限されない（自動保存のため）

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

- **総行数**: 約6,300行（コメント・空行含む）
- **ソースファイル数**: 38個（.svelte + .ts）
- **コンポーネント数**: 22個
- **libモジュール数**: 13個
- **ドキュメント数**: 15個（CLAUDE.md + README.md + CONTRIBUTING.md + docs/下の12個）

### 主要技術

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

## 📝 変更履歴

### Version 6.0 (2025-11-24)

- **大規模リファクタリングによるコード品質向上**
  - **ドラッグ&ドロップの視覚的フィードバック強化**
    - リーフのドラッグ&ドロップ時にノートと同様の強調表示を追加
    - アクセントカラーのボーダーとボックスシャドウで視覚的フィードバック
  - **BackgroundCustomizer.svelteの最適化**
    - 動的プロパティアクセスで左右ペインの重複コード削減（約30行削減）
    - `hasCustomBackgroundLeft/Right`、`backgroundOpacityLeft/Right`の動的管理
  - **コードの重複削減と汎用化**
    - **breadcrumbs.ts分離**: パンくずリスト生成ロジックをApp.svelteから分離
    - **drag-drop.ts分離**: ドラッグ&ドロップユーティリティを汎用化（`handleDragStart<T>()`, `handleDragEnd()`, `handleDragOver<T>()`, `reorderItems<T>()`）
    - **NoteCard.svelte作成**: HomeViewとNoteViewの重複したノートカードUIをコンポーネント化（約40行削減）
    - **storage.ts汎用化**: IndexedDB操作を`putItem<T>()`, `getItem<T>()`, `deleteItem()`の3つのヘルパー関数で統一
    - **github.ts統一**: 設定検証ロジックを`validateGitHubSettings()`関数に統一
    - App.svelteを1,499行→1,397行に削減（102行削減）
  - **App.svelteとFooterコンポーネントのリファクタリング**
    - スクロール同期関数を`handlePaneScroll()`に統一
    - **SaveButton.svelte作成**: 全Footerコンポーネント共通の保存ボタンを分離
    - 重複コード削減: 約150行
  - **背景画像管理の統一**
    - `uploadAndApplyBackground(file, pane, opacity)`統一関数を追加
    - `removeAndDeleteCustomBackground(pane)`統一関数を追加
    - 重複コード削減: 約50行
  - **設定画面の4コンポーネント分割**
    - ThemeSelector.svelte（テーマ選択）
    - FontCustomizer.svelte（カスタムフォント）
    - BackgroundCustomizer.svelte（カスタム背景画像）
    - GitHubSettings.svelte（GitHub連携設定）
  - **alert()をアプリ独自のポップアップに統一**
    - Modalコンポーネントを活用してブラウザ標準alert()を置き換え
  - **Cloudflare Pagesへ移行**
    - GitHub PagesからCloudflare Pagesへデプロイ先変更
    - より高速で信頼性の高いホスティング
  - **総削減行数**: 約372行のコード削減
  - **コンポーネント数**: 15個→22個に増加（分割により保守性向上）
  - **libモジュール数**: 7個→13個に増加（モジュール化により再利用性向上）

### Version 5.1 (2025-11-24)

- **国際化（i18n）機能の実装**
  - **svelte-i18nパッケージ**を導入
  - **対応言語**: 日本語（ja）・英語（en）
  - **自動言語検出**: ブラウザの言語設定を検出
    - 日本語（ja, ja-JP）→ 日本語表示
    - それ以外の全言語 → 英語表示（デフォルト）
  - **手動言語切替**: 設定画面に言語選択ドロップダウンを追加
  - **翻訳ファイル**: `src/lib/i18n/locales/` に en.json / ja.json
  - **翻訳対象**: 全UIテキスト（ボタン、ラベル、メッセージ、設定画面など）
  - **永続化**: LocalStorageに言語設定を保存
  - **動的ロード**: 翻訳ファイルは動的インポートでコード分割
  - **初期化処理**: `waitLocale()`で翻訳完全読み込みを待機してからアプリ表示
  - **ローディング画面**: i18n読み込み中は3つのドットアニメーションを表示
  - **影響範囲**:
    - 新規ファイル: `src/lib/i18n/index.ts`, `src/lib/i18n/locales/en.json`, `src/lib/i18n/locales/ja.json`
    - 型定義: `Locale`型を追加、`Settings`に`locale`フィールド追加
    - コンポーネント: 全主要コンポーネントを翻訳対応（Modal, Header, Breadcrumbs, HomeView, NoteView, EditorFooter, SettingsViewなど）

### Version 5.0 (2025-11-24)

- **左右対称設計への大規模リファクタリング**
  - **問題**: 左ペイン（グローバルストア）と右ペイン（ローカル変数）の非対称設計により、Pull後に左ペインのみ状態が失われるバグが発生
  - **設計方針**: 左右ペインを完全に対等にする - コードに差があればバグという原則
  - **グローバルストアの削除**（左ペインをローカル変数化）
    - `currentView`, `currentNote`, `currentLeaf` ストアを削除
    - `subNotes`, `currentNoteLeaves` 派生ストアを削除
    - 左右とも`leftNote/rightNote`などのローカル変数で管理
  - **関数の統一化**（8個以上の重複関数を削減）
    - `type Pane = 'left' | 'right'` 型を追加
    - `goHome(pane)`, `selectNote(note, pane)`, `selectLeaf(leaf, pane)` など全ナビゲーション関数に`pane`パラメータを追加
    - `getBreadcrumbsRight()`を削除、`getBreadcrumbs()`に統一
    - `createNote`, `createLeaf`, `deleteNote`, `deleteLeaf`, `togglePreview` など全CRUD操作を統一
  - **Pull処理の修正**
    - Pull後は常にURLから状態を復元（初回Pullだけでなく全Pull）
    - 左右両方の状態を等しくリセット
  - **コメントの中立化**
    - "currentNoteが変わるたびに"→"ノートが変わるたびに"など、左ペイン中心の表現を削除
  - **影響範囲**
    - `src/App.svelte`: 約100行のコード削減、8個以上の関数統一
    - `src/lib/stores.ts`: 5個のストア削除
    - `src/components/views/NoteView.svelte`: コメント修正
  - **ドキュメント更新**
    - `docs/data-model.md`: 状態管理の章を全面改訂（ストア→ローカル変数）
    - `docs/refactoring.md`: Section 9を追加（本リファクタリングの詳細記録）
  - **成果**: 完全な左右対称性の実現、コード重複の大幅削減、保守性の向上

### Version 4.7 (2025-11-23)

- **カスタム背景画像機能の実装**
  - 左右ペイン別々に背景画像を設定可能
  - 対応フォーマット: .jpg, .jpeg, .png, .webp, .gif
  - IndexedDB `backgrounds` オブジェクトストアに保存（左: `custom-left`, 右: `custom-right`）
  - FileReader APIで画像ファイルをArrayBufferとして読み込み
  - CSS `::before`擬似要素で動的に適用（透明度0.1固定）
  - テーマの背景色の上に半透明で画像を重ねる仕様
  - 設定画面に左右2列レイアウトで「背景画像選択」と「デフォルトに戻す」ボタンを追加
  - 画像削除時も即座に反映（リロード不要）
  - `Settings.hasCustomBackgroundLeft`、`Settings.hasCustomBackgroundRight`フラグで適用状態を管理
  - アプリ起動時に保存された画像を自動復元
  - 設定画面の背景にも左ペインの画像を表示
  - サーバー側に画像を持たず、完全クライアントサイドで動作
  - 新規ファイル追加: `src/lib/background.ts` (背景画像管理モジュール)
  - ドキュメント更新: `docs/ui-features.md`, `CLAUDE.md`

### Version 4.6 (2025-01-23)

- **カスタムフォント機能の実装**
  - ユーザーが自由にフォントファイル（.ttf, .otf, .woff, .woff2）をアップロード可能
  - IndexedDB `fonts` オブジェクトストアにフォントデータを保存（1つのみ、上書き方式）
  - FileReader APIでフォントファイルをArrayBufferとして読み込み
  - CSS `@font-face`を動的に登録して即座に適用（リロード不要）
  - 設定画面に「フォント選択」ボタンと「デフォルトに戻す」ボタンを追加
  - フォント削除時も即座に反映（リロード不要、確認ダイアログなし）
  - `Settings.hasCustomFont`フラグで適用状態を管理
  - アプリ起動時に保存されたフォントを自動復元
  - body, input, textarea, button, CodeMirrorエディタのすべてに適用
  - サーバー側にフォントを持たず、完全クライアントサイドで動作
  - 新規ファイル追加: `src/lib/font.ts` (フォント管理モジュール)
  - ドキュメント更新: `docs/ui-features.md`, `docs/storage.md`

### Version 4.5 (2025-01-23)

- **マークダウンプレビュー機能の実装**
  - `marked` + `DOMPurify`によるセキュアなHTMLレンダリング
  - 編集/プレビュートグルボタン（保存ボタンの左隣に配置）
  - プレビュー中は読み取り専用（編集不可）
  - URLルーティング対応（`:preview`サフィックス）
  - 左右ペイン独立でプレビュー/編集を切り替え可能
  - PreviewView.svelteコンポーネントを追加
  - View型に`'preview'`を追加
  - routing.tsにプレビュー状態の永続化機能を追加
  - 全テーマ対応のプレビュースタイリング

### Version 4.4 (2025-01-23)

- **未保存変更の確認機能**
  - isDirtyストアを追加（GitHubにPushされていない変更を追跡）
  - エディタ編集時、ノート/リーフの作成・削除・変更時にisDirty.set(true)
  - Push成功時とPull成功時にisDirty.set(false)
  - Pull実行時に未保存の変更がある場合、確認ダイアログを表示（Modal.svelte）
  - ページ離脱時（タブを閉じる、リロード）にブラウザ標準の確認ダイアログを表示（beforeunload）
  - 保存ボタンに赤い丸印（notification badge）を表示
  - アプリ内ナビゲーション（ホーム、ノート、リーフ間の移動）は制限されない
  - ブラウザの戻る/進むボタンも制限されない
  - 自動保存（IndexedDB）により、アプリ内でのデータ損失は発生しない

### Version 4.3 (2025-01-23)

- **Push回数カウント機能の実装**
  - metadata.jsonにpushCountフィールドを追加
  - Push時に自動的にカウントをインクリメント
  - ホーム画面右下にPush回数を統計情報として表示
  - 半透明でノート・リーフカードの背面に配置
  - 古いmetadata.jsonとの後方互換性を確保（pushCountがない場合は0にフォールバック）
- **Pull/Push中のローディング表示**
  - 各ペインの中央にパルス動作する3つのドットを表示
  - 半透明の背景でコンテンツを覆う
  - Pull/Push完了後に自動的に非表示
- **GitHub APIキャッシュ問題の発見と解決**
  - Push回数カウント機能の実装中にGitHub Contents APIのキャッシュ問題を発見
  - `fetchGitHubContents`ヘルパー関数を作成しキャッシュバスターを一元管理
  - すべてのContents API呼び出しにタイムスタンプを付与（`?t=${Date.now()}`）
  - Push直後のPullでも最新データを取得できるように修正
  - これまで潜在的に存在していたデータ同期の問題を完全解決

### Version 4.2 (2025-01-23)

- **リーフのタイトルと#見出しの双方向同期**
  - 1行目が `# 見出し` の場合、リーフタイトルを自動更新
  - パンくずリストでタイトル変更時、1行目の見出しも自動更新
  - `## 見出し2` などには適用せず、`# 見出し` のみ対応
- **新規リーフの初期コンテンツ**
  - `# リーフ名` + 2行改行を自動設定
- **左右ペイン独立編集の実装**
  - EditorViewを左右対等に修正（leafIdパラメータを追加）
  - updateLeafContent/deleteLeaf/downloadLeafをleafIdベースに変更
  - $currentLeafへのハードコーディングを解消
- **2ペイン表示での同期**
  - 同じリーフを左右で開いている場合、編集が即座に両方に反映

### Version 4.1 (2025-01-24)

- **2ペイン表示の完全実装**
  - アスペクト比判定（横 > 縦）による自動切替
  - スマホ横向きで2ペイン表示に対応
  - 左右独立したナビゲーションとビュー表示
- **ノート階層制限の実装**
  - ルートノート→サブノートの2階層まで制限
  - createNote関数に階層深さチェックを追加
  - NoteViewのcanHaveSubNoteをリアクティブ宣言に修正（遷移時の誤判定を解消）

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

- **リポジトリ**: [simplest-note-md](https://github.com/kako-jun/simplest-note-md)
- **デモサイト**: [https://simplest-note-md.llll-ll.com](https://simplest-note-md.llll-ll.com)
- **デプロイ**: Cloudflare Pages（自動デプロイ）

---

**Document Version**: 6.0
**Last Updated**: 2025-11-24
**Author**: Claude (Anthropic)
