# データ永続化とストレージ

Agasteerのデータ永続化スキーマについて説明します。

## LocalStorage

### 用途

設定情報の保存のみ

### キー定義

`agasteer/settings`

### データ構造

#### `agasteer/settings`

```json
{
  "token": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "repoName": "yamada/my-notes",
  "theme": "yomi",
  "toolName": "Agasteer",
  "locale": "ja",
  "hasCustomFont": false,
  "hasCustomBackgroundLeft": false,
  "hasCustomBackgroundRight": false,
  "backgroundOpacityLeft": 0.1,
  "backgroundOpacityRight": 0.1
}
```

**注意**: コミット時のユーザー名とメールアドレスは固定値（`agasteer` / `agasteer@example.com`）を使用するため、設定に含まれません。

### 保存タイミング

- 設定画面での入力時に即座に反映

---

## IndexedDB

### 用途

ノートとリーフのデータ保存

### データベース名

`agasteer`

### オブジェクトストア

- `notes`: ノートデータ（Home用）
- `leaves`: リーフデータ（Home用）
- `archiveNotes`: ノートデータ（Archive用）
- `archiveLeaves`: リーフデータ（Archive用）
- `fonts`: カスタムフォントデータ
- `backgrounds`: カスタム背景画像データ

### データ構造

#### `notes` オブジェクトストア

| フィールド | 型      | 説明                                     |
| ---------- | ------- | ---------------------------------------- |
| id         | string  | UUID（主キー）                           |
| name       | string  | ノート名                                 |
| parentId   | string? | 親ノートのID（ルートノートの場合は省略） |
| order      | number  | 並び順                                   |

**例:**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "仕事",
    "order": 0
  },
  {
    "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "name": "プロジェクトA",
    "parentId": "550e8400-e29b-41d4-a716-446655440000",
    "order": 0
  }
]
```

#### `leaves` オブジェクトストア

| フィールド | 型     | 説明                                |
| ---------- | ------ | ----------------------------------- |
| id         | string | UUID（主キー）                      |
| title      | string | リーフタイトル                      |
| noteId     | string | 所属ノートのID                      |
| content    | string | Markdownコンテンツ                  |
| updatedAt  | number | 最終更新タイムスタンプ（Unix time） |
| order      | number | 並び順                              |

**例:**

```json
[
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "title": "会議メモ",
    "noteId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "content": "# 会議メモ\n\n## 議題\n- ...",
    "updatedAt": 1703000000000,
    "order": 0
  }
]
```

### 保存タイミング

- ノート/リーフの作成・削除・編集時（**デバウンス方式**: 最後の操作から1秒後に保存）
- ドラッグ&ドロップによる並び替え時
- Push実行前（保留中の保存を即座に実行）

#### 自動保存のデバウンス機構

ユーザー操作（キー入力、クリック、タッチ、スクロール、マウス移動）を検知し、最後の操作から1秒間無操作が続いた場合にIndexedDBへ保存します。

**動作フロー:**

1. `updateLeaves()` / `updateNotes()` 呼び出し → Svelteストア即座更新 + 保存フラグON
2. ユーザー操作検知 → タイマーリセット（1秒にリスタート）
3. 1秒間無操作 → IndexedDBへ一括保存
4. Push実行時 → 保留中の保存を強制フラッシュ

#### `fonts` オブジェクトストア

| フィールド | 型          | 説明                                       |
| ---------- | ----------- | ------------------------------------------ |
| name       | string      | フォント名（常に'custom'）                 |
| data       | ArrayBuffer | フォントファイルのバイナリデータ           |
| type       | string      | MIMEタイプ（例: 'font/ttf', 'font/woff2'） |

**仕様:**

- **同時保存数**: 1つのみ（固定キー `'custom'` で上書き保存）
- **保存タイミング**: フォント選択時
- **削除タイミング**: 「デフォルトに戻す」ボタン押下時
- **設定フラグ**: `Settings.hasCustomFont` (boolean) をLocalStorageに保存
  - フォント適用時に `true` を設定
  - フォント削除時に `false` を設定
  - アプリ起動時、`true`の場合はIndexedDBからフォントを読み込んで適用

#### `backgrounds` オブジェクトストア

| フィールド | 型          | 説明                                          |
| ---------- | ----------- | --------------------------------------------- |
| name       | string      | 固定キー: 'custom-left' または 'custom-right' |
| data       | ArrayBuffer | 画像ファイルのバイナリデータ                  |
| type       | string      | MIMEタイプ（例: 'image/jpeg', 'image/png'）   |

**仕様:**

- **同時保存数**: 左右それぞれ1つ（固定キー `'custom-left'`, `'custom-right'` で上書き保存）
- **保存タイミング**: 背景画像選択時
- **削除タイミング**: 「クリア」ボタン押下時
- **設定フラグ**: LocalStorageに以下を保存
  - `Settings.hasCustomBackgroundLeft` (boolean) - 左ペインの背景画像適用状態
  - `Settings.hasCustomBackgroundRight` (boolean) - 右ペインの背景画像適用状態
  - `Settings.backgroundOpacityLeft` (number, デフォルト: 0.1) - 左ペインの透明度
  - `Settings.backgroundOpacityRight` (number, デフォルト: 0.1) - 右ペインの透明度
  - アプリ起動時、フラグが`true`の場合はIndexedDBから画像を読み込んで適用

---

## GitHub（リモートリポジトリ）

### 保存対象

- 全ノート（Home + Archive）
- 全リーフのMarkdownファイル
- メタデータファイル（`metadata.json`）

### ファイルパス構造

```
.agasteer/
  ├── notes/                     ← Homeワールド
  │   ├── metadata.json          ← メタデータファイル
  │   ├── .gitkeep
  │   ├── ノート名1/
  │   │   ├── .gitkeep
  │   │   ├── サブノート名/
  │   │   │   ├── .gitkeep
  │   │   │   └── リーフタイトル.md
  │   │   └── リーフタイトル.md
  │   └── ノート名2/
  │       ├── .gitkeep
  │       └── リーフタイトル.md
  └── archive/                   ← Archiveワールド
      ├── metadata.json          ← アーカイブ用メタデータ
      ├── .gitkeep
      ├── アーカイブノート/
      │   ├── .gitkeep
      │   └── リーフタイトル.md
      └── standalone.md          ← リーフ単体のアーカイブ
```

**例:**

```
.agasteer/
  ├── notes/
  │   ├── metadata.json
  │   ├── .gitkeep
  │   ├── 仕事/
  │   │   ├── .gitkeep
  │   │   ├── プロジェクトA/
  │   │   │   ├── .gitkeep
  │   │   │   └── 会議メモ.md
  │   │   └── TODO.md
  │   └── プライベート/
  │       ├── .gitkeep
  │       └── 買い物リスト.md
  └── archive/
      ├── metadata.json
      ├── .gitkeep
      └── 旧プロジェクト/
          ├── .gitkeep
          └── 古いメモ.md
```

### metadata.json の構造

ノート・リーフのメタ情報（ID、並び順、更新日時）と統計情報を保存します。

```json
{
  "version": 1,
  "pushCount": 42,
  "notes": {
    "仕事": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "order": 0
    },
    "仕事/プロジェクトA": {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "order": 0
    }
  },
  "leaves": {
    "仕事/プロジェクトA/会議メモ.md": {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "updatedAt": 1703000000000,
      "order": 0
    }
  }
}
```

#### フィールド説明

| フィールド  | 型     | 説明                                              |
| ----------- | ------ | ------------------------------------------------- |
| `version`   | number | メタデータのバージョン（現在は常に1）             |
| `pushCount` | number | GitHub Pushの累積回数（統計情報）                 |
| `notes`     | object | ノートのメタ情報（パス → {id, order}）            |
| `leaves`    | object | リーフのメタ情報（パス → {id, updatedAt, order}） |

#### pushCount フィールド

- **用途**: アプリの使用状況を可視化する統計情報
- **更新タイミング**: 毎回Pushする際に自動的にインクリメント
- **表示場所**: ホーム画面の右下に表示
- **初期値**: 0（存在しない場合はフォールバック）

**動作:**

1. Push前に既存の `metadata.json` から `pushCount` を取得
2. `pushCount + 1` を新しい `metadata.json` に保存
3. Push成功後にcommit SHAを `lastKnownCommitSha` ストアに保存（stale検出用）
4. Push成功後にリモートから最新の `pushCount` を取得して `lastPulledPushCount` ストアを更新（統計表示用）
5. Pull時も `pushCount` を取得して `lastPulledPushCount` に保存、commit SHAを `lastKnownCommitSha` に保存
6. ホーム画面で `lastPulledPushCount` として表示

### 同期タイミング

- **Push:** 保存ボタン、設定ボタン押下時
- **Pull:** 初回起動時、Pullテストボタン、設定画面を閉じたとき

**重要:** 設定情報（LocalStorage）はGitHubには同期されません。

---

## テーマシステム

### CSS変数ベースのテーマ

`:root`要素の`data-theme`属性で切り替え。各テーマはCSS変数（`--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-secondary`, `--accent-color`, `--border-color`）を定義します。

### テーマの適用

`applyTheme()`関数で`:root`要素に`data-theme`属性を設定。テーマ変更時はエディタも再初期化してスタイルを反映します。

### エディタテーマ

CodeMirrorの`EditorView.theme()`でエディタ専用のテーマを定義。背景色、カーソル色、選択範囲色、ガター色などをアプリテーマに合わせて設定します。
