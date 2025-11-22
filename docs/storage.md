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

---

## GitHub（リモートリポジトリ）

### 保存対象

- 全ノート
- 全リーフのMarkdownファイル

### ファイルパス構造

```
notes/
  ├── ノート名1/
  │   ├── サブノート名/
  │   │   └── リーフタイトル.md
  │   └── リーフタイトル.md
  └── ノート名2/
      └── リーフタイトル.md
```

**例:**

```
notes/
  ├── 仕事/
  │   ├── プロジェクトA/
  │   │   └── 会議メモ.md
  │   └── TODO.md
  └── プライベート/
      └── 買い物リスト.md
```

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
