# 変更履歴

Agasteerの変更履歴を記録しています。

---

## 2025-11-24 - パフォーマンス最適化

- **初回表示速度の大幅改善**
  - **CodeMirrorの遅延ロード**
    - エディタ画面を開くまでCodeMirror（約600 KB）をロードしない
    - 動的インポートで必要な時だけ読み込み
    - ローディング中は3つのドットアニメーションを表示
  - **marked/DOMPurifyの遅延ロード**
    - プレビュー画面を開くまでmarkdown-tools（約64 KB）をロードしない
    - 動的インポートで必要な時だけ読み込み
    - ローディング中は3つのドットアニメーションを表示
  - **Viteのマニュアルチャンク設定**
    - CodeMirror関連を`codemirror`チャンクに分離（609.98 KB）
    - marked/DOMPurifyを`markdown-tools`チャンクに分離（64.07 KB）
    - svelte-i18nを`i18n`チャンクに分離（60.47 KB）
    - ベンダーライブラリを分割してキャッシュ効率を向上
  - **PWA対応（Service Worker）**
    - vite-plugin-pwaを導入
    - 2回目以降の起動を劇的に高速化
    - GitHub API（5分間）のランタイムキャッシュ
    - オフラインでの基本動作をサポート
  - **最適化効果**
    - ホーム画面の初回読み込み：278.78 KB → 33.94 KB（gzip）**87.8%削減**
    - エディタ使用時：242.97 KB（gzip）**12.9%削減**
    - プレビュー使用時：55.38 KB（gzip）**80.1%削減**
    - 2回目以降：PWAキャッシュでほぼ瞬時に起動
  - **影響範囲**
    - vite.config.ts：PWA設定とマニュアルチャンク設定を追加
    - MarkdownEditor.svelte：CodeMirrorモジュールを動的ロード
    - PreviewView.svelte：marked/DOMPurifyを動的ロード
    - package.json：vite-plugin-pwaを追加

## 2025-11-24 - 大規模リファクタリング

- **コード品質向上**
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

## 2025-11-24 - 国際化（i18n）機能

- **多言語対応の実装**
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

## 2025-11-24 - 左右対称設計への大規模リファクタリング

- **完全対称設計の実現**
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

## 2025-11-23 - カスタム背景画像機能

- **背景画像のカスタマイズ機能を実装**
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

## 2025-01-23 - カスタムフォント機能

- **フォントのカスタマイズ機能を実装**
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

## 2025-01-23 - マークダウンプレビュー機能

- **プレビュー機能の実装**
  - `marked` + `DOMPurify`によるセキュアなHTMLレンダリング
  - 編集/プレビュートグルボタン（保存ボタンの左隣に配置）
  - プレビュー中は読み取り専用（編集不可）
  - URLルーティング対応（`:preview`サフィックス）
  - 左右ペイン独立でプレビュー/編集を切り替え可能
  - PreviewView.svelteコンポーネントを追加
  - View型に`'preview'`を追加
  - routing.tsにプレビュー状態の永続化機能を追加
  - 全テーマ対応のプレビュースタイリング

## 2025-01-23 - 未保存変更の確認機能

- **データ保護機能の実装**
  - isDirtyストアを追加（GitHubにPushされていない変更を追跡）
  - エディタ編集時、ノート/リーフの作成・削除・変更時にisDirty.set(true)
  - Push成功時とPull成功時にisDirty.set(false)
  - Pull実行時に未保存の変更がある場合、確認ダイアログを表示（Modal.svelte）
  - ページ離脱時（タブを閉じる、リロード）にブラウザ標準の確認ダイアログを表示（beforeunload）
  - 保存ボタンに赤い丸印（notification badge）を表示
  - アプリ内ナビゲーション（ホーム、ノート、リーフ間の移動）は制限されない
  - ブラウザの戻る/進むボタンも制限されない
  - 自動保存（IndexedDB）により、アプリ内でのデータ損失は発生しない

## 2025-01-23 - Push回数カウント機能

- **統計機能とGitHub APIキャッシュ問題の解決**
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

## 2025-01-23 - コンテンツ同期機能

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

## 2025-01-24 - 2ペイン表示とノート階層制限

- **2ペイン表示の完全実装**
  - アスペクト比判定（横 > 縦）による自動切替
  - スマホ横向きで2ペイン表示に対応
  - 左右独立したナビゲーションとビュー表示
- **ノート階層制限の実装**
  - ルートノート→サブノートの2階層まで制限
  - createNote関数に階層深さチェックを追加
  - NoteViewのcanHaveSubNoteをリアクティブ宣言に修正（遷移時の誤判定を解消）

## 2025-01-23 - ドキュメント整理

- **ドキュメント構造の再編成**
- **docs/ディレクトリ**: 詳細ドキュメントを8ファイルに分割
  - architecture.md - アーキテクチャ概要
  - data-model.md - データモデルと状態管理
  - features.md - 主要機能の実装
  - github-integration.md - GitHub API統合
  - storage.md - データ永続化とストレージ
  - refactoring.md - 実装されたリファクタリング
  - development.md - 開発ガイド
  - future-plans.md - 拡張計画と既知の課題

## 2025-01-23 - モジュール分離とUI改善

- モジュール分離の完了（sync.ts、ui.ts、Toast.svelte追加）
- データ永続化仕様の明確化（GitHub SSoT設計）
- UI改善（設定モーダル化、URLルーティング、トースト通知）
- 次の実装計画の追加（パスベースURLルーティング）
