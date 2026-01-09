# 実装されたリファクタリング

元々App.svelteは1,373行の単一ファイルでしたが、保守性と拡張性を向上させるため、以下のリファクタリングを実施しました。

## 1. コンポーネント分割（実装済み）

### 現在の構造

```
src/
├── components/
│   ├── layout/
│   │   ├── Header.svelte              # ヘッダー（75行）
│   │   ├── Breadcrumbs.svelte         # パンくずリスト（156行）
│   │   └── Modal.svelte               # 確認ダイアログ（84行）
│   ├── views/
│   │   ├── HomeView.svelte            # ホーム画面（134行）
│   │   ├── FolderView.svelte          # フォルダ画面（209行）
│   │   ├── EditorView.svelte          # エディタ画面（154行）
│   │   └── SettingsView.svelte        # 設定画面（322行）
│   └── editor/
│       └── MarkdownEditor.svelte      # CodeMirrorラッパー（137行）
├── lib/
│   ├── stores.ts                      # Svelteストア（54行）
│   ├── github.ts                      # GitHub API（132行）
│   ├── storage.ts                     # LocalStorage（104行）
│   ├── theme.ts                       # テーマ管理（22行）
│   └── types.ts                       # 型定義（52行）
├── app.css
├── app.d.ts
├── App.svelte                         # ルーター & レイアウト（533行）
└── main.ts
```

### 成果

- 1,373行の単一ファイルから約2,178行の15ファイルに分割
- 各コンポーネントは単一責任の原則に従い、保守性が向上
- ビューコンポーネントは100-300行程度で適切な粒度

---

## 2. 状態管理の改善（実装済み）

### Svelteストアの導入

**基本ストア（`src/lib/stores.ts`）:**

| ストア名      | 型             | 説明           |
| ------------- | -------------- | -------------- |
| settings      | Settings       | アプリ設定     |
| folders       | Folder[]       | フォルダ一覧   |
| notes         | Note[]         | ノート一覧     |
| currentView   | View           | 現在のビュー   |
| currentFolder | Folder \| null | 選択中フォルダ |
| currentNote   | Note \| null   | 選択中ノート   |

**派生ストア:**

| ストア名           | 説明                       |
| ------------------ | -------------------------- |
| rootFolders        | 親IDがないフォルダをソート |
| subfolders         | currentFolderの子フォルダ  |
| currentFolderNotes | currentFolder内のノート    |

### 成果

- グローバル状態の一元管理を実現
- コンポーネント間でのデータ共有が容易に
- 派生ストアにより計算ロジックを集約
- テスタビリティが向上

---

## 3. ビジネスロジックの分離（実装済み）

| モジュール       | 関数              | 説明                     |
| ---------------- | ----------------- | ------------------------ |
| `lib/github.ts`  | saveToGitHub()    | GitHub API呼び出し       |
| `lib/github.ts`  | fetchCurrentSha() | SHA取得ロジック          |
| `lib/storage.ts` | loadSettings()    | LocalStorageから読み込み |
| `lib/storage.ts` | saveSettings()    | LocalStorageに保存       |

---

## 4. TypeScript型定義の強化

**主要な型定義（`src/lib/types.ts`）:**

| 型名       | 説明                                           |
| ---------- | ---------------------------------------------- |
| UUID       | string型のエイリアス                           |
| Settings   | トークン、テーマ等の設定情報                   |
| ThemeType  | 'light' \| 'dark' \| 'blackboard' 等           |
| Folder     | id, name, parentId?, order                     |
| Note       | id, title, folderId, content, updatedAt, order |
| View       | 'home' \| 'settings' \| 'edit' \| 'folder'     |
| Breadcrumb | label, action, id, type                        |

---

## 5. テストの導入

- vitestによるユニットテスト
- `src/lib/__tests__/storage.test.ts`にテスト配置
- LocalStorageの読み書きをテスト

**必要な依存関係:** `vitest`, `@vitest/ui`, `@testing-library/svelte`

---

## 6. モジュール分離の完了（実装済み 2025-01-23）

App.svelteをモダンな構成に分割し、保守性を大幅に向上させました。

### 新規追加ファイル

```
src/lib/
├── sync.ts    # Push/Pull処理の分離
│   ├── executePush()  - 全リーフをGitHubにPush
│   └── executePull()  - GitHubから全データをPull
│
├── ui.ts      # UI状態管理の分離
│   ├── pushToastState/pullToastState - トースト状態ストア
│   ├── modalState                    - モーダル状態ストア
│   ├── showPushToast/showPullToast   - トースト表示ヘルパー
│   └── showConfirm/showAlert/closeModal - モーダル操作ヘルパー
│
src/components/layout/
└── Toast.svelte  # トースト表示コンポーネント
```

### 成果

- Push/Pull処理をsync.tsに委譲し、ビジネスロジックを分離
- モーダル・トースト状態をui.tsのストアで管理し、グローバル状態を整理
- トースト表示をToastコンポーネント化し、再利用性を向上
- App.svelteのローカル状態変数を約50行削減
- z-index管理を改善（トーストはモーダルより前面に表示）

### UI改善（実装済み 2025-01-23）

- **設定画面**: モーダル化（フルページ遷移からポップアップに変更）
- **URLルーティング**: クエリパラメータベースのディープリンク対応（`?note=uuid&leaf=uuid`）
- **ブラウザ対応**: 戻る/進むボタンでの状態復元
- **ヘルプリンク**: 設定画面に使い方（テキスト・動画）へのリンクを追加
- **テーマボタン**: スマホ対応のため3個ずつ2段表示に変更
- **トースト通知**: Push/Pull開始時に「Pushします」「Pullします」を表示

---

## 7. データ永続化仕様の明確化（実装済み 2025-01-23）

GitHubを唯一の真実の情報源（Single Source of Truth）とする設計を明確化し、実装しました。

### データ永続化の役割分担

| ストレージ       | 役割                       | 同期      |
| ---------------- | -------------------------- | --------- |
| **LocalStorage** | 設定情報のみ保存           | なし      |
| **IndexedDB**    | ノート・リーフのキャッシュ | なし      |
| **GitHub**       | 全リーフの永続化（SSoT）   | Push/Pull |

### Pull処理フロー

1. 「Pullします」トースト表示
2. IndexedDB全削除
3. GitHubから全データ取得
4. IndexedDB全作成
5. 「Pullしました」トースト表示

**重要**: 前回終了時のIndexedDBデータは使用しない。アプリ起動時は必ず初回Pullを実行。

### Push処理フロー

1. 「Pushします」トースト表示
2. 全リーフをGitHubにPush
3. 「Pushしました」トースト表示

**Pushタイミング**:

- 保存ボタン押下時
- 設定ボタン押下時（設定画面を開く前）

**Pullタイミング**:

- アプリ起動時（初回Pull）
- 設定画面の「Pullテスト」ボタン押下時
- 設定画面を閉じるとき

---

## 8. Git Tree APIとSHA最適化（実装済み 2025-01-23）

Push処理をGit Tree APIに移行し、SHA比較による最適化を実装しました。

### Git Tree APIの導入

**以前の実装:**

- ファイルごとにPUT APIを呼び出し
- 削除・リネームが正しく処理されない
- APIリクエスト数が多い（ファイル数 × 2回）

**新しい実装:**

- Git Tree APIで1コミットで全ファイルをPush
- APIリクエスト数を7回に削減
- 削除・リネームを確実に処理

### base_treeを使わない方式

`base_tree`パラメータを使わず、全ファイルを明示的に指定することで削除を確実に処理。

**処理フロー:**

1. 既存ツリーを取得
2. notes/以外のファイル → SHAを保持
3. notes/以下のファイル → 完全に再構築
4. treeItemsに含めないファイルは自動的に削除

**メリット:**

- 削除が確実に動作（treeItemsに含めないだけ）
- README.md等のnotes/以外のファイルは保持

### SHA最適化

変更されていないファイルは既存のSHAを使用し、ネットワーク転送量を削減。

**SHA-1計算:** `calculateGitBlobSha()`関数でGit Blob形式のSHA-1を計算

**重要な修正:**

- 文字数（`content.length`）ではなくUTF-8バイト数を使用
- 日本語を含むファイルでSHAが正しく計算される

**最適化の効果:**

| 状態     | 処理                          |
| -------- | ----------------------------- |
| 変化なし | 既存のSHAを使用（転送なし）   |
| 変化あり | contentを送信（新規Blob作成） |

### Pull時のBase64デコード修正

GitHub APIは改行付きのBase64を返すため、改行を削除（`.replace(/\n/g, '')`）してからデコード。

### Push並行実行の防止

`isPushing`フラグでダブルクリック等による並行実行を防止。関数開始時にtrueに設定し、finally句でfalseに戻す。

### 強制更新（force: true）

個人用アプリなので、ブランチ更新時に`force: true`を使用。

**設計思想:**

- Pushボタンを押した時点で、ユーザーは「今の状態が正しい」と判断している
- 常に成功させることが重要
- Pullしていない方が悪い（ユーザーの責任）

### 連番の修正

`generateUniqueName`を修正し、リーフ1から開始するように変更。

| 修正前                      | 修正後                       |
| --------------------------- | ---------------------------- |
| リーフ, リーフ2, リーフ3... | リーフ1, リーフ2, リーフ3... |

### 成果

- **転送量削減**: 変更されていないファイルは転送しない
- **信頼性向上**: 削除・リネームが確実に動作
- **パフォーマンス向上**: APIリクエスト数を大幅削減（ファイル数 × 2 → 7回）
- **並行実行防止**: ダブルクリック等での不具合を解消
- **UTF-8対応**: 日本語を含むファイルで正しくSHA計算

---

## 9. 左右対称設計への大規模リファクタリング（実装済み 2025-11-24）

デュアルペイン表示の実装により左ペイン中心の設計に非対称性が生まれていたため、完全に左右対等な設計に変更しました。

### 問題点

**非対称な状態管理:**

| ペイン | 状態変数                              | 管理方式         |
| ------ | ------------------------------------- | ---------------- |
| 左     | currentView, currentNote, currentLeaf | グローバルストア |
| 右     | rightView, rightNote, rightLeaf       | ローカル変数     |

**非対称な関数名:**

| ペイン | 関数例                                             | サフィックス |
| ------ | -------------------------------------------------- | ------------ |
| 左     | goHome(), selectNote(), createNote(), deleteNote() | なし         |
| 右     | selectNoteRight(), createNoteRight()               | Right        |

**問題の影響:**

- Pull処理で左ペインだけがリセットされて復元されないバグ
- 右ペインはローカル変数のため、Pull時にリセットされず状態が残る
- 設定画面を開いて閉じた後、リーフ表示時に左ペインだけ描画されなくなる

### 実施した変更

#### 1. 状態管理の統一

**グローバルストアから削除:** `currentView`, `currentNote`, `currentLeaf`, `subNotes`, `currentNoteLeaves`

**ローカル変数に統一（App.svelte内）:**

| 左ペイン | 右ペイン  | 型           |
| -------- | --------- | ------------ |
| leftNote | rightNote | Note \| null |
| leftLeaf | rightLeaf | Leaf \| null |
| leftView | rightView | View         |

**設計思想:**

- 左右のペインは完全に対等
- グローバルストアは全体で共有するデータ（notes, leaves, settings等）のみ
- 表示状態は各ペインが独立して管理

#### 2. ナビゲーション関数の統合

**すべての関数にpane引数を追加:** `type Pane = 'left' | 'right'`

| 統合後の関数               | 説明           |
| -------------------------- | -------------- |
| goHome(pane)               | ホームに遷移   |
| selectNote(note, pane)     | ノート選択     |
| selectLeaf(leaf, pane)     | リーフ選択     |
| createNote(parentId, pane) | ノート作成     |
| createLeaf(pane)           | リーフ作成     |
| deleteNote(pane)           | ノート削除     |
| deleteLeaf(leafId, pane)   | リーフ削除     |
| togglePreview(pane)        | プレビュー切替 |

**削除された関数:** `selectNoteRight()`, `selectLeafRight()`, `createNoteRight()`, `createLeafRight()`, `togglePreviewRight()` → 各々`(note/leaf, 'right')`に統合

#### 3. パンくずリスト関数の統合

**2つの関数を1つに統合:**

| 統合前                | 統合後                                           |
| --------------------- | ------------------------------------------------ |
| getBreadcrumbs()      | getBreadcrumbs(view, note, leaf, allNotes, pane) |
| getBreadcrumbsRight() | （削除）                                         |

`pane`引数で左右を区別し、同じ関数で処理。

#### 4. Pull処理の修正

**Pull後の状態復元を左右両方に適用:**

1. IndexedDB全削除、notes/leavesストアをクリア
2. 左右両方の状態を明示的にnullにリセット（`leftNote`, `leftLeaf`, `rightNote`, `rightLeaf`）
3. Pull実行後、成功時は`restoreStateFromUrl()`を呼び出し
4. 初回Pull以外でも`restoreStateFromUrl(false)`を呼ぶように修正

**修正のポイント:** 設定画面を閉じた後のPullでも状態が正しく復元される

#### 5. コンポーネント呼び出しの修正

コンポーネントのイベントハンドラにペイン指定を追加:

| コンポーネント | 左ペイン例                                      | 右ペイン例                                       |
| -------------- | ----------------------------------------------- | ------------------------------------------------ |
| HomeView       | `onSelectNote={(n) => selectNote(n, 'left')}`   | `onSelectNote={(n) => selectNote(n, 'right')}`   |
| NoteView       | `onCreateLeaf={() => createLeaf('left')}`       | `onCreateLeaf={() => createLeaf('right')}`       |
| EditorFooter   | `onTogglePreview={() => togglePreview('left')}` | `onTogglePreview={() => togglePreview('right')}` |

### 成果

- **完全な左右対称**: すべての関数が`pane`引数で制御される統一設計
- **バグ修正**: 設定を閉じた後に左ペインだけ描画されないバグを解決
- **保守性向上**: 左右で重複していたコードを共通化
- **型安全性**: `Pane`型により、左右の指定が明確化
- **コード削減**: 右ペイン専用の関数（~8関数）を削除し、約100行削減

### 削除されたストアと派生ストア

- `currentView` - `leftView`, `rightView`ローカル変数に移行
- `currentNote` - `leftNote`, `rightNote`ローカル変数に移行
- `currentLeaf` - `leftLeaf`, `rightLeaf`ローカル変数に移行
- `subNotes` - インラインfilterに変更（各ペインで独立計算）
- `currentNoteLeaves` - インラインfilterに変更（各ペインで独立計算）

### 設計原則

**左右対等の原則:**

- 左と右のペインに差は一切ない
- すべての処理が`pane: 'left' | 'right'`引数で制御される
- グローバルストアは全体で共有するデータのみ
- 表示状態は各ペインがローカル変数で独立管理

---

## 10. コード重複削減と汎用化（実装済み 2025-11-24）

Version 6.0では、徹底的なコード重複削減とDRY原則の適用により、保守性と再利用性を大幅に向上させました。

### 実施した変更

#### 1. パンくずリスト生成ロジックの分離（breadcrumbs.ts）

**分離前:**

- App.svelteに`getBreadcrumbs()`, `extractH1Title()`, `updateH1Title()`が含まれていた
- 約80行のロジックがApp.svelteに埋め込まれていた

**分離後（`src/lib/breadcrumbs.ts`に配置）:**

| 関数名           | 説明                                     |
| ---------------- | ---------------------------------------- |
| getBreadcrumbs() | パンくずリスト生成（pane引数で左右対応） |
| extractH1Title() | コンテンツからH1タイトルを抽出           |
| updateH1Title()  | コンテンツ内のH1タイトルを更新           |

**成果:**

- App.svelteから約80行削減
- パンくずリスト関連のロジックを一元化
- 他のコンポーネントからも再利用可能

#### 2. ドラッグ&ドロップユーティリティの汎用化（drag-drop.ts）

**分離前:**

- ノート用とリーフ用で重複したドラッグ&ドロップ処理
- `handleDragStartNote()`, `handleDragStartLeaf()`等の重複関数
- 型安全性が低い

**分離後（`src/lib/drag-drop.ts`に配置）:**

| 関数名          | 説明                               |
| --------------- | ---------------------------------- |
| handleDragStart | ドラッグ開始（ジェネリック型対応） |
| handleDragEnd   | ドラッグ終了                       |
| handleDragOver  | ドラッグオーバー処理               |
| reorderItems    | アイテム並び替え（order更新）      |

**特徴:**

- ジェネリック型（`<T>`）により、Note/Leaf両方に対応
- 型安全性の向上（`id`プロパティを持つオブジェクトのみ受け付ける）
- 並び替えロジックを汎用化

**成果:**

- App.svelteから約60行削減
- ノートとリーフの重複処理を統一
- テスタビリティの向上

#### 3. ノートカード共通コンポーネント化（NoteCard.svelte）

**問題点:**

- HomeViewとNoteViewで同じノートカードUIが重複実装されていた
- 約40行のHTMLとCSSが重複

**解決策（`src/components/cards/NoteCard.svelte`を新規作成）:**

| props       | 型                   | 説明               |
| ----------- | -------------------- | ------------------ |
| note        | Note                 | 表示するノート     |
| onSelect    | (note: Note) => void | 選択時コールバック |
| onDragStart | (note: Note) => void | ドラッグ開始       |
| onDragOver  | (note: Note) => void | ドラッグオーバー   |
| isDragOver  | boolean              | ドラッグ中フラグ   |
| itemCount   | number               | 子アイテム数       |

**成果:**

- HomeViewとNoteViewから各約40行削減（合計約80行削減）
- UIの一貫性が保証される
- 1箇所の修正で両方に反映される

#### 4. IndexedDB操作の汎用化（storage.ts）

**問題点:**

- fonts/backgrounds関連の6つの関数で重複したIndexedDB操作
- 同じパターンのopen/transaction/put/get/deleteが繰り返される

**解決策（汎用ヘルパー関数を追加）:**

| 関数名     | 説明                           |
| ---------- | ------------------------------ |
| putItem    | 任意のストアにアイテムを保存   |
| getItem    | 任意のストアからアイテムを取得 |
| deleteItem | 任意のストアからアイテムを削除 |

**リファクタリング例:** `saveFontToIndexedDB()`を`putItem('fonts', 'custom-font', arrayBuffer)`で簡略化

**成果:**

- 6つの関数を簡略化（約60行削減）
- 型安全性の向上（ジェネリック型`<T>`）
- エラーハンドリングの一元化

#### 5. GitHub設定検証の統一（github.ts）

**問題点:**

- 4つの関数（`saveToGitHub`, `pushAllWithTreeAPI`, `pullFromGitHub`, `testGitHubConnection`）で同じ設定検証が重複

**解決策:** `validateGitHubSettings()`関数を作成し、トークン・リポジトリ名の検証を一元化

**検証内容:**

| チェック項目     | エラーメッセージ                                 |
| ---------------- | ------------------------------------------------ |
| token/repoName空 | GitHub設定が不完全です                           |
| repoNameに/なし  | リポジトリ名は"owner/repo"形式で入力してください |

**成果:**

- 4つの関数から検証ロジックを削除（約40行削減）
- 設定検証の一元管理
- 将来の検証ルール追加が容易

#### 6. Footerコンポーネントのリファクタリング

**問題点:**

- 4つのFooterコンポーネント（HomeFooter, NoteFooter, EditorFooter, PreviewFooter）で保存ボタンが重複実装されていた
- isDirty状態のバッジ表示ロジックが4箇所に分散

**解決策:** `SaveButton.svelte`を新規作成し、保存ボタンとisDirtyバッジ表示を一元化

**成果:**

- 4つのFooterコンポーネントから各約20行削減（合計約80行削減）
- 保存ボタンの一元管理
- isDirty状態の一貫した表示

#### 7. スクロール同期関数の統一（App.svelte）

**問題点:**

- 左→右、右→左のスクロール同期で重複したロジック
- `handleLeftPaneScroll()`, `handleRightPaneScroll()`の重複

**解決策:** `handlePaneScroll(sourcePane, event)`に統合

- スクロール位置をパーセンテージで計算
- 対象ペインを`sourcePane === 'left' ? 'right' : 'left'`で決定
- 無限ループ防止フラグで相互呼び出しを抑制

**成果:**

- 約30行のコード削減
- 無限ループ防止ロジックの一元化
- pane引数により左右対称性を保持

#### 8. 背景画像管理の統一（background.ts）

**問題点:**

- 左右ペイン別のアップロード/削除関数が重複
- `uploadBackgroundLeft()`, `uploadBackgroundRight()`等の重複

**解決策（`src/lib/background.ts`）:**

| 関数名                            | 説明                                     |
| --------------------------------- | ---------------------------------------- |
| uploadAndApplyBackground()        | 背景画像のアップロードと適用（pane指定） |
| removeAndDeleteCustomBackground() | 背景画像の削除（pane指定）               |

pane引数（`'left' | 'right'`）で左右を区別し、`custom-left`/`custom-right`キーで保存。

**成果:**

- 約50行のコード削減
- 左右ペインの処理を完全に統一
- 保守性の向上

#### 9. 設定画面の4コンポーネント分割

**問題点:**

- SettingsView.svelte が約400行の大きなファイル
- テーマ選択、フォント、背景画像、GitHub設定が混在

**解決策:**

```
src/components/settings/
├── ThemeSelector.svelte        # テーマ選択（約80行）
├── FontCustomizer.svelte       # カスタムフォント（約60行）
├── BackgroundCustomizer.svelte # カスタム背景画像（約100行）
└── GitHubSettings.svelte       # GitHub連携設定（約120行）
```

**成果:**

- SettingsView.svelteを約360行削減
- 各コンポーネントが単一責任を持つ
- テスト・保守が容易に

#### 10. alert()をアプリ独自のポップアップに統一

**問題点:**

- ブラウザ標準の`alert()`が使用されていた
- アプリのデザインと統一されていない

**解決策:**

- 既存のModalコンポーネントを活用
- すべての`alert()`呼び出しを`showAlert()`に置き換え

**成果:**

- UIの一貫性が向上
- アプリのテーマに合ったデザイン

#### 11. ドラッグ&ドロップの視覚的フィードバック強化

**問題点:**

- ノートのドラッグ&ドロップ時は強調表示があった
- リーフのドラッグ&ドロップ時は強調表示がなかった

**解決策:** NoteView.svelteに`.drag-over`クラスのスタイル（ボーダー、シャドウ）を追加

**成果:**

- ノートとリーフで一貫したドラッグ&ドロップ体験
- 視覚的フィードバックの向上

### 総合成果

**コード削減:**

- breadcrumbs.ts分離: 約80行削減
- drag-drop.ts分離: 約60行削減
- NoteCard.svelte作成: 約80行削減
- storage.ts汎用化: 約60行削減
- github.ts統一: 約40行削減
- SaveButton.svelte作成: 約80行削減
- スクロール同期統一: 約30行削減
- 背景画像管理統一: 約50行削減
- 設定画面分割: 約360行削減（構造改善のため、ファイル数は増加）
- **総削減行数: 約840行** （設定画面分割を除くと約480行）

**ファイル数の変化:**

- コンポーネント数: 15個 → 22個
- libモジュール数: 7個 → 13個

**設計原則:**

- **DRY原則**: 重複コードの徹底削減
- **単一責任の原則**: 各コンポーネント・モジュールが単一の責任を持つ
- **型安全性**: ジェネリック型による再利用性と型安全性の向上
- **左右対称設計**: pane引数による統一的な処理

**保守性の向上:**

- コード重複削減により、1箇所の修正で複数箇所に反映
- 汎用ヘルパー関数により、新機能追加が容易
- 型安全性の向上により、バグの早期発見
- コンポーネント分割により、テストが容易

---

## 11. ボタンコンポーネントの共通化（実装済み 2025-11-24）

Version 6.1では、すべてのボタンを`IconButton`コンポーネントと個別のアイコンコンポーネントに分割し、コードの重複を大幅に削減しました。

### 問題点

**重複したボタン実装:**

- ヘッダー、パンくずリスト、シェアメニュー、フッターの各所で同じスタイルのボタンが重複実装されていた
- SVGアイコンが各コンポーネントに埋め込まれていた（約400行のSVG重複）
- スタイルが各コンポーネントに分散していた
- ボタンのサイズが18pxと20pxで不統一
- ホバー効果がバラバラ（opacity変更、background変更）

**メンテナンス性の問題:**

- ボタンのスタイルを変更する際、10箇所以上を修正する必要があった
- 新しいボタン追加時に、毎回同じスタイルとSVGを書く必要があった
- 一貫性の保証が困難

### 実施した変更

#### 1. IconButtonコンポーネントの作成

**汎用的なアイコンボタン（`src/components/buttons/IconButton.svelte`）:**

| props     | 型                     | 説明                   |
| --------- | ---------------------- | ---------------------- |
| onClick   | () => void             | クリック時コールバック |
| title     | string                 | ツールチップ           |
| ariaLabel | string                 | アクセシビリティ       |
| disabled  | boolean                | 無効状態               |
| variant   | 'default' \| 'primary' | スタイルバリアント     |
| iconSize  | number                 | アイコンサイズ（px）   |

**特徴:**

- `variant`プロパティでprimary/defaultを切り替え
- `iconSize`でアイコンサイズをカスタマイズ可能
- 統一されたホバー効果（opacity: 0.7）
- `<slot>`により任意のアイコンを挿入可能
- disabled状態のサポート

#### 2. 14個のアイコンコンポーネントの作成

**SVGアイコンを独立したコンポーネント化（`src/components/icons/`）:**

| コンポーネント名 | 用途                           |
| ---------------- | ------------------------------ |
| SettingsIcon     | 設定（ヘッダー）               |
| HomeIcon         | ホーム（パンくずリスト）       |
| EditIcon         | 編集（パンくずリスト）         |
| ShareIcon        | シェア（パンくずリスト）       |
| SaveIcon         | 保存（フッター）               |
| DeleteIcon       | 削除（フッター）               |
| DownloadIcon     | ダウンロード（フッター）       |
| EyeIcon          | プレビュー（フッター）         |
| FolderPlusIcon   | ノート作成（フッター）         |
| FilePlusIcon     | リーフ作成（フッター）         |
| LinkIcon         | URLコピー（シェアメニュー）    |
| CopyIcon         | コピー（シェアメニュー）       |
| UploadIcon       | アップロード（シェアメニュー） |
| FileEditIcon     | 編集（フッター）               |

**特徴:**

- SVG定義のみのシンプルなコンポーネント
- サイズは親コンポーネント（IconButton）で制御
- `currentColor`により親の色を継承

#### 3. 既存コンポーネントのリファクタリング

各コンポーネントのSVG埋め込みボタンを`<IconButton><XxxIcon /></IconButton>`形式に置き換え:

| コンポーネント         | 修正内容                                               |
| ---------------------- | ------------------------------------------------------ |
| Header                 | 設定ボタン → IconButton + SettingsIcon                 |
| Breadcrumbs            | ホームボタン → IconButton + HomeIcon                   |
| ShareButton            | シェアボタン/メニュー → IconButton + 各種Icon          |
| SaveButton             | 保存ボタン → IconButton + SaveIcon (variant='primary') |
| 各Footerコンポーネント | 各アクションボタン → IconButton + 対応Icon             |

#### 4. Footer.svelteの簡略化

Footer.svelteから約30行のグローバルスタイル（`:global(.footer-fixed button)`等）を削除。これらのスタイルはすべて`IconButton.svelte`に集約。

### 成果

**コード削減:**

- **517行削除** → **464行追加** = **差し引き53行削減**
- SVG定義の重複削減（約400行相当）
- Footer.svelteから約30行のグローバルスタイルを削除

**ファイル数の変化:**

- コンポーネント数: 22個 → 38個
  - IconButtonコンポーネント: 1個
  - アイコンコンポーネント: 14個
  - 既存コンポーネントの改修: 8個
- 総ファイル数: 38個 → 56個

**スタイルの統一:**

- アイコンサイズ: 全て18pxに統一
- ホバー効果: 全て`opacity: 0.7`に統一
- 色: var(--text-primary)（保存ボタンのみvar(--accent-color)）

**メンテナンス性の向上:**

- **1箇所の修正で全体に反映**: IconButton.svelteを修正するだけで、全ボタンのスタイルが変更される
- **一貫性の保証**: すべてのボタンが同じスタイル・動作を持つ
- **新しいボタン追加が容易**: アイコンコンポーネントを作成して`<IconButton>`に渡すだけ
- **型安全性**: TypeScriptによるpropsの型チェック

**再利用性の向上:**

- IconButtonは他のプロジェクトでも再利用可能
- アイコンコンポーネントは独立しており、どこでも使用可能
- `variant`プロパティにより、様々なスタイルに対応可能

### 設計原則

**コンポーネントの責務分離:**

- **IconButton**: ボタンの挙動とスタイルを担当
- **アイコンコンポーネント**: SVG定義のみを担当
- **親コンポーネント**: イベントハンドリングとビジネスロジックを担当

**Composition over Configuration:**

- 複雑な設定より、シンプルな組み合わせを優先
- `<slot>`により柔軟な拡張性を実現
- variantは最小限（default/primary）

---

## 12. 設定画面のコンポーネント分割（実装済み 2025-11-24）

Version 6.2では、SettingsView.svelteを完全にセクションごとのコンポーネントに分割し、保守性と可読性を大幅に向上させました。

### 問題点

**SettingsView.svelteが大きすぎる:**

- 約490行の大きなファイル
- QRコード、ヘルプリンク、GitHub設定、言語選択、テーマ、フォント、背景、Vimモード、About情報が混在
- 各セクションの責務が不明確
- 設定項目の追加・修正が困難

### 実施した変更

#### 1. 7個の新規コンポーネントの作成

| コンポーネント   | 説明                               | props                           |
| ---------------- | ---------------------------------- | ------------------------------- |
| QRCodeSection    | QRコード画像と説明                 | なし                            |
| ~~HelpLinks~~    | ~~READMEと動画へのヘルプリンク~~   | ~~なし~~（※後にヘッダーへ移動） |
| LanguageSelector | 言語選択ドロップダウン             | settings, onSettingsChange      |
| ToolNameInput    | ツール名入力フィールド             | settings, onSettingsChange      |
| VimModeToggle    | Vimモードのチェックボックス        | settings, onSettingsChange      |
| AboutSection     | アプリ情報、作者、スポンサーリンク | なし                            |
| VersionDisplay   | バージョン番号表示（ビルド日付）   | なし                            |

#### 2. SettingsView.svelteのリファクタリング

**修正前:** 約490行（ハンドラー関数、HTML、スタイルが混在）

**修正後:** 約100行（各セクションをコンポーネントとしてインポートして配置するだけ）

設定画面の構造（当時）:

```
<QRCodeSection />
<!-- HelpLinks は後にヘッダーへ移動 -->
<GitHubSettings />
<LanguageSelector />
<ThemeSelector />
<ToolNameInput />
<FontCustomizer />
<BackgroundCustomizer />
<VimModeToggle />
<AboutSection />
<VersionDisplay />
```

#### 3. ビルド日付の自動生成（関連機能）

| 設定ファイル      | 内容                                              |
| ----------------- | ------------------------------------------------- |
| vite.config.ts    | `define: { __BUILD_DATE__: ... }` を追加          |
| src/vite-env.d.ts | `declare global { const __BUILD_DATE__: string }` |
| VersionDisplay    | `v{__BUILD_DATE__}` で表示                        |

### 成果

**コード削減:**

- SettingsView.svelte: 約490行 → 約100行（**約390行削減**、80%削減）
- ハンドラー関数を各コンポーネントに移動（33行削減）
- HTML/CSSの重複を各コンポーネントに分離（約357行削減）

**ファイル数の変化:**

- コンポーネント数: 38個 → 45個（+7個）
- settings/ディレクトリ: 4個 → 11個（+7個）

**構造の改善:**

```
<!-- 設定画面の構造が一目瞭然（当時） -->
<QRCodeSection />           <!-- QRコード表示 -->
<!-- HelpLinks は後にヘッダーへ移動 -->
<GitHubSettings ... />      <!-- GitHub設定 -->
<LanguageSelector ... />    <!-- 言語選択 -->
<ThemeSelector ... />       <!-- テーマ選択 -->
<ToolNameInput ... />       <!-- ツール名入力 -->
<FontCustomizer ... />      <!-- フォント -->
<BackgroundCustomizer ... /> <!-- 背景 -->
<VimModeToggle ... />       <!-- Vimモード -->
<AboutSection />            <!-- About情報 -->
<VersionDisplay />          <!-- バージョン -->
```

**保守性の向上:**

- **可読性**: 設定画面の構造が約30行で把握できる
- **責任の分離**: 各コンポーネントが単一の設定項目を管理
- **再利用性**: 各セクションを他の場所でも利用可能
- **テスト容易性**: 各コンポーネントを個別にテストできる
- **変更の局所化**: 1つの設定項目の修正が他に影響しない

**自動化の導入:**

- バージョン番号がビルド日付に自動更新される
- 手動でのバージョン管理が不要

### 設計原則

**コンポーネントの粒度:**

- 1コンポーネント = 1設定項目
- QRコードやヘルプリンクのような表示のみのコンポーネントもOK
- 設定変更のロジックは各コンポーネントに内包

**親コンポーネントの責務:**

- コンポーネントの配置のみを担当
- ビジネスロジックは持たない
- propsのバケツリレー（props drilling）は許容

**ビルド時の自動化:**

- 手動で更新すべき情報は極力減らす
- Vite defineによるビルド時の値注入
- 開発者の負担を軽減

---

## まとめ

Agasteerは、継続的なリファクタリングにより以下を達成しました：

### コード規模の変遷

- **Version 1.0**: 1,373行の単一ファイル
- **Version 3.0**: 約2,178行の15ファイル
- **Version 5.0**: 完全な左右対称設計（約100行削減）
- **Version 6.0**: 約6,300行の38ファイル（22コンポーネント、13モジュール）
- **Version 6.1**: 約8,100行の56ファイル（38コンポーネント、14モジュール）
- **Version 6.2**: 約8,400行の59ファイル（45コンポーネント、14モジュール）

### リファクタリングの成果

1. **コンポーネント分割**: 単一ファイルから45コンポーネントへ
2. **状態管理改善**: Svelteストアによる一元管理
3. **ビジネスロジック分離**: lib/層への明確な分離
4. **モジュール化**: 14個の専門モジュール
5. **Git Tree API**: GitHub API最適化とSHA比較
6. **左右対称設計**: 完全な2ペイン対応
7. **コード重複削減**: DRY原則の徹底適用（約840行削減）
8. **汎用化**: ジェネリック型による再利用性向上
9. **UI一貫性**: 共通コンポーネントによる統一
10. **国際化対応**: svelte-i18nによる多言語サポート
11. **ボタン共通化**: IconButton + 14アイコン（約53行削減、SVG重複約400行削減）
12. **設定画面分割**: 7個のセクションコンポーネント（約390行削減、80%削減）

### 設計原則

- **シンプリシティ**: 必要最小限のコード
- **DRY原則**: 重複の徹底削減
- **単一責任**: 各コンポーネントが単一の責任を持つ
- **型安全性**: TypeScriptによる静的型チェック
- **左右対称**: 完全に対等な2ペイン設計
- **モジュール性**: 高い凝集度と低い結合度

詳細なアーキテクチャについては、[architecture.md](./architecture.md)を参照してください。
