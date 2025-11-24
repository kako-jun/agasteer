# GitHub API統合

SimplestNote.mdのGitHub API統合について説明します。

## 認証

Personal Access Tokenによるベーシック認証。

```typescript
const headers = {
  Authorization: `Bearer ${settings.token}`,
  'Content-Type': 'application/json',
}
```

---

## Push処理（Git Tree API）

全リーフを1コミットでPushする実装。Git Tree APIを使用することで、削除・リネームを確実に処理し、APIリクエスト数を最小化（約8回）。

### 処理フロー

1. デフォルトブランチを取得
2. 現在のブランチのHEADを取得
3. 現在のコミットからTreeのSHAを取得
4. 既存ツリーを取得（notes/以外のファイルとnotes/以下のSHAを記録）
5. 新しいTreeを構築（全ファイルを明示的に指定）
6. 新しいTreeを作成
7. 新しいコミットを作成
8. ブランチのリファレンスを更新（`force: true`）

### SHA最適化

変更されていないファイルは既存のSHAを使用し、変更されたファイルのみcontentを送信することで、ネットワーク転送量を大幅削減。

```typescript
// SHA-1計算（Git blob形式）
async function calculateGitBlobSha(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const contentBytes = encoder.encode(content)
  const header = `blob ${contentBytes.length}\0` // UTF-8バイト数を使用
  const headerBytes = encoder.encode(header)

  const data = new Uint8Array(headerBytes.length + contentBytes.length)
  data.set(headerBytes, 0)
  data.set(contentBytes, headerBytes.length)

  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// リーフをTreeに追加
for (const leaf of leaves) {
  const path = buildPath(leaf, notes)
  const existingSha = existingNotesFiles.get(path)

  if (existingSha) {
    const localSha = await calculateGitBlobSha(leaf.content)
    if (localSha === existingSha) {
      // 変化なし → 既存のSHAを使用（転送量削減）
      treeItems.push({
        path,
        mode: '100644',
        type: 'blob',
        sha: existingSha,
      })
      continue
    }
  }

  // 新規ファイルまたは変化あり → contentを送信
  treeItems.push({
    path,
    mode: '100644',
    type: 'blob',
    content: leaf.content,
  })
}
```

### base_treeを使わない方式

`base_tree`を使わず、全ファイルを明示的に指定することで削除を確実に処理。

**notes/以外のファイル:**

- 既存ツリーから取得してSHAを保持
- README.md等のnotes/以外のファイルは変更されない

**notes/以下のファイル:**

- 完全に再構築
- treeItemsに含めないファイルは自動的に削除される

```typescript
// notes/以外のファイルを保持
for (const item of preserveItems) {
  treeItems.push(item) // 既存のSHA
}

// notes/以下を再構築
// .gitkeep、リーフのみをtreeItemsに追加
```

### 強制更新（force: true）

個人用アプリなので、ブランチ更新時に`force: true`を使用。

```typescript
{
  sha: newCommitSha,
  force: true, // 強制更新（他デバイスとの同時編集は非対応）
}
```

**設計思想:**

- Pushボタンを押した時点で、ユーザーは「今の状態が正しい」と判断している
- 常に成功させることが重要
- Pullしていない方が悪い（ユーザーの責任）

### 並行実行の防止

`isPushing`フラグでダブルクリック等による並行実行を防止。

```typescript
let isPushing = false
async function handleSaveToGitHub() {
  if (isPushing) return
  isPushing = true
  try {
    await executePush(...)
  } finally {
    isPushing = false
  }
}
```

### コミッター情報の固定値

コミット時のユーザー名とメールアドレスは固定値を使用。設定画面での入力は不要。

```typescript
{
  message: 'auto-sync',
  tree: newTreeSha,
  parents: [currentCommitSha],
  committer: {
    name: 'simplest-note-md',
    email: 'simplest-note-md@example.com',
  },
  author: {
    name: 'simplest-note-md',
    email: 'simplest-note-md@example.com',
  },
}
```

### Push最適化（変更がない場合はスキップ）

実質的な変更がない場合（すべてのファイルのSHAが既存と一致）は、コミットを作成せずに早期リターン。pushCountもインクリメントされない。

```typescript
// 変更があるか確認（contentを使っているアイテムがあるか）
const hasChanges = treeItems.some((item) => 'content' in item)
if (!hasChanges) {
  // 変更がない場合は何もせずに成功を返す
  return { success: true, message: '✅ 変更なし（Pushスキップ）' }
}

// 変更がある場合のみpushCountをインクリメント
metadata.pushCount = currentPushCount + 1
```

**メリット:**

- 無駄なコミットを作成しない
- pushCountが不必要にインクリメントされない
- GitHubのコミット履歴が整理される

---

## Pull処理

GitHubから全データをPull。

### Base64デコード

GitHub APIは改行付きのBase64を返すため、改行を削除してからデコード。

```typescript
let content = ''
if (contentData.content) {
  try {
    // GitHub APIは改行付きBase64を返すので改行を削除
    const base64 = contentData.content.replace(/\n/g, '')
    content = decodeURIComponent(escape(atob(base64)))
  } catch (e) {
    content = ''
  }
}
```

### 重要な仕様

- GitHubが唯一の真実の情報源（Single Source of Truth）
- IndexedDBは単なるキャッシュ
- Pull成功時にIndexedDBは全削除→全作成

### GitHub APIのキャッシュ問題と解決策

GitHub Contents APIはレスポンスをキャッシュするため、Push直後のPullで古いデータが返される問題がありました。

**問題の発見経緯:**

Push回数カウント機能の実装中に、Push直後にPullしても`pushCount`が更新されない現象を発見。調査の結果、GitHub Contents APIがキャッシュを返していることが判明。

**影響範囲:**

- Push直後のPull: 古いノート・リーフが表示される
- 複数デバイスでの同期: 他のデバイスでPushした変更が即座に反映されない
- 編集の喪失: 最新のデータを取得できず、古いバージョンで上書きする可能性

**解決策:**

GitHub Contents API呼び出しにキャッシュバスター（タイムスタンプ）を付与。

```typescript
/**
 * GitHub Contents APIを呼ぶヘルパー関数（キャッシュバスター付き）
 */
async function fetchGitHubContents(path: string, repoName: string, token: string) {
  const url = `https://api.github.com/repos/${repoName}/contents/${path}?t=${Date.now()}`
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}
```

このヘルパー関数を以下の箇所で使用：

1. `fetchCurrentSha` - ファイルのSHA取得
2. `pushAllWithTreeAPI` - Push時のmetadata.json取得
3. `pullFromGitHub` - Pull時のmetadata.json取得
4. `pullFromGitHub` - Pull時のリーフcontent取得

**効果:**

- ✅ Push直後のPullでも最新データを取得
- ✅ metadata.jsonの`pushCount`が正しく反映
- ✅ リーフコンテンツも常に最新
- ✅ キャッシュバスターの管理が一元化（保守性向上）

---

## ファイルパスの構築

ノート階層に基づいてGitHub上のパスを生成。

```typescript
function buildPath(leaf: Leaf, notes: Note[]): string {
  const note = notes.find((f) => f.id === leaf.noteId)
  if (!note) return `notes/${leaf.title}.md`

  const folderPath = getFolderPath(note, notes)
  return `notes/${folderPath}/${leaf.title}.md`
}

function getFolderPath(note: Note, allNotes: Note[]): string {
  const parentNote = note.parentId ? allNotes.find((f) => f.id === note.parentId) : null

  if (parentNote) {
    return `${parentNote.name}/${note.name}`
  }
  return note.name
}
```

**例:**

- ルートノート「仕事」のリーフ → `notes/仕事/リーフ1.md`
- サブノート「仕事/会議」のリーフ → `notes/仕事/会議/議事録.md`

---

## .gitkeepファイル

Gitにはディレクトリの概念がないため、空のノート（リーフがないノート）を保持するために`.gitkeep`ファイルを使用。

```typescript
// 全ノートに対して.gitkeepを配置
for (const note of notes) {
  const notePath = getNotePath(note, notes)
  const gitkeepPath = `${notePath}/.gitkeep`
  const gitkeepExisting = existingNotesFiles.get(gitkeepPath)

  treeItems.push({
    path: gitkeepPath,
    mode: '100644',
    type: 'blob',
    // 空ファイルなのでSHAは常に同じ
    ...(gitkeepExisting === emptyGitkeepSha ? { sha: gitkeepExisting } : { content: '' }),
  })
}
```

**Pull時の処理:**

1. まず`.gitkeep`ファイルから空のノート（リーフがないノート）を復元
2. 次に`.md`ファイル（リーフ）を復元
3. `.gitkeep`ファイル自体はユーザーには見えない

```typescript
// まず.gitkeepファイルから空ノートを復元
const gitkeepPaths = entries.filter(
  (e) =>
    e.type === 'blob' &&
    e.path.startsWith('notes/') &&
    e.path.endsWith('.gitkeep') &&
    e.path !== 'notes/.gitkeep' // notes/.gitkeepは除外
)

for (const entry of gitkeepPaths) {
  const relativePath = entry.path.replace(/^notes\//, '').replace(/\/\.gitkeep$/, '')
  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length === 0) continue

  // .gitkeepがあるディレクトリのノートを復元
  ensureNotePath(parts)
}

// 次に.mdファイル（リーフ）を復元
const notePaths = entries.filter(
  (e) =>
    e.type === 'blob' &&
    e.path.startsWith('notes/') &&
    e.path.endsWith('.md') &&
    !e.path.endsWith('.gitkeep') // .gitkeepは除外
)
```

---

## API呼び出し回数

### Push処理（Git Tree API）

1. リポジトリ情報取得（1回）
2. ブランチのHEAD取得（1回）
3. コミット取得（1回）
4. 既存ツリー取得（1回）
5. 新しいTree作成（1回）
6. 新しいコミット作成（1回）
7. ブランチ更新（1回）

**合計: 7回**

### Pull処理

1. リポジトリ情報取得（1回）
2. ツリー取得（1回、recursive）
3. 各ファイルのコンテンツ取得（ファイル数回）

**合計: 2 + ファイル数**

---

## エラーハンドリング

- 各API呼び出しでエラーチェック
- エラーメッセージをユーザーに表示
- ネットワークエラーは catch で捕捉

```typescript
if (!response.ok) {
  const error = await response.json()
  return { success: false, message: `❌ エラー: ${error.message}` }
}
```
