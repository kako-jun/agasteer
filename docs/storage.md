# データ永続化とストレージ

SimplestNote.mdのデータ永続化スキーマについて説明します。

## LocalStorage

### 用途

設定情報の保存のみ

### キー定義

```typescript
const SETTINGS_KEY = 'simplest-md-note/settings'
```

### データ構造

#### `simplest-md-note/settings`

```json
{
  "token": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "username": "yamada",
  "email": "yamada@example.com",
  "repoName": "yamada/my-notes",
  "theme": "yomi",
  "toolName": "SimplestNote.md",
  "customBgPrimary": "#ffffff",
  "customAccentColor": "#0f766e"
}
```

### 保存タイミング

- 設定画面での入力時に即座に反映

---

## IndexedDB

### 用途

ノートとリーフのデータ保存

### データベース名

`simplest-note-md`

### オブジェクトストア

- `notes`: ノートデータ
- `leaves`: リーフデータ
- `fonts`: カスタムフォントデータ

### データ構造

#### `notes` オブジェクトストア

```typescript
interface Note {
  id: string // UUID (主キー)
  name: string // ノート名
  parentId?: string // 親ノートのID（ルートノートの場合はundefined）
  order: number // 並び順
}
```

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

```typescript
interface Leaf {
  id: string // UUID (主キー)
  title: string // リーフタイトル
  noteId: string // 所属ノートのID
  content: string // Markdownコンテンツ
  updatedAt: number // 最終更新タイムスタンプ（Unix time）
  order: number // 並び順
}
```

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

- ノート/リーフの作成・削除・編集時に即座に反映
- ドラッグ&ドロップによる並び替え時

#### `fonts` オブジェクトストア

```typescript
interface CustomFont {
  name: string // フォント名（常に'custom'）
  data: ArrayBuffer // フォントファイルのバイナリデータ
  type: string // MIMEタイプ（例: 'font/ttf', 'font/woff2'）
}
```

**例:**

```json
{
  "name": "custom",
  "data": ArrayBuffer(...),
  "type": "font/ttf"
}
```

**仕様:**

- **同時保存数**: 1つのみ（固定キー `'custom'` で上書き保存）
- **保存タイミング**: フォント選択時
- **削除タイミング**: 「デフォルトに戻す」ボタン押下時
- **設定フラグ**: `Settings.hasCustomFont` (boolean) をLocalStorageに保存
  - フォント適用時に `true` を設定
  - フォント削除時に `false` を設定
  - アプリ起動時、`true`の場合はIndexedDBからフォントを読み込んで適用

---

## GitHub（リモートリポジトリ）

### 保存対象

- 全ノート
- 全リーフのMarkdownファイル
- メタデータファイル（`metadata.json`）

### ファイルパス構造

```
notes/
  ├── metadata.json  ← メタデータファイル
  ├── .gitkeep
  ├── ノート名1/
  │   ├── .gitkeep
  │   ├── サブノート名/
  │   │   ├── .gitkeep
  │   │   └── リーフタイトル.md
  │   └── リーフタイトル.md
  └── ノート名2/
      ├── .gitkeep
      └── リーフタイトル.md
```

**例:**

```
notes/
  ├── metadata.json
  ├── .gitkeep
  ├── 仕事/
  │   ├── .gitkeep
  │   ├── プロジェクトA/
  │   │   ├── .gitkeep
  │   │   └── 会議メモ.md
  │   └── TODO.md
  └── プライベート/
      ├── .gitkeep
      └── 買い物リスト.md
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
3. Pull時に `pushCount` を取得してSvelteストアに保存
4. ホーム画面で `$metadata.pushCount` として表示

### 同期タイミング

- **Push:** 保存ボタン、設定ボタン押下時
- **Pull:** 初回起動時、Pullテストボタン、設定画面を閉じたとき

**重要:** 設定情報（LocalStorage）はGitHubには同期されません。

---

## テーマシステム

### CSS変数ベースのテーマ

`:root`要素の`data-theme`属性で切り替え。

```css
/* app.css */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f3f4f6;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --accent-color: #0f766e;
  --border-color: #d1d5db;
}

:root[data-theme='dark'] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --text-primary: #e5e7eb;
  --text-secondary: #9ca3af;
  --accent-color: #1f4d48;
  --border-color: #374151;
}
```

### テーマの適用

```typescript
function applyTheme(theme: 'light' | 'dark' | 'blackboard' | 'kawaii' | 'custom') {
  if (theme === 'light') {
    document.documentElement.removeAttribute('data-theme')
  } else if (theme === 'custom') {
    document.documentElement.setAttribute('data-theme', 'custom')
    document.documentElement.style.setProperty('--bg-primary', settings.customBgPrimary)
    document.documentElement.style.setProperty('--accent-color', settings.customAccentColor)
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }

  // エディタをテーマに合わせて再初期化
  if (editorView && currentView === 'edit') {
    editorView.destroy()
    initializeEditor()
    if (currentNote) {
      resetEditorContent(currentNote.content)
    }
  }
}
```

### エディタテーマ

CodeMirrorのカスタムテーマ定義。

```typescript
const editorDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#1a1a1a',
      color: '#e5e7eb',
    },
    '.cm-content': {
      caretColor: '#1f4d48',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#1f4d48',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#1f4d48',
    },
    '.cm-activeLine': {
      backgroundColor: '#2d2d2d',
    },
    '.cm-gutters': {
      backgroundColor: '#1a1a1a',
      color: '#9ca3af',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#2d2d2d',
    },
  },
  { dark: true }
)
```
