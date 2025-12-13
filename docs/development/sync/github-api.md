# GitHub API統合

AgasteerのGitHub API統合について説明します。

## 認証

Personal Access Tokenによるベーシック認証。

```typescript
const headers = {
  Authorization: `Bearer ${settings.token}`,
  'Content-Type': 'application/json',
}
```

---

## 接続テスト

設定画面の「接続テスト」ボタンは、実際のPullを行わずにGitHub接続が可能かどうかだけを確認します。

### 目的

- トークンが有効か確認
- リポジトリにアクセス可能か確認
- **実際のデータはPullしない**（設定画面で「ローカルの方が進んでいる」等のメッセージを出さないため）

### 実装

```typescript
export async function testGitHubConnection(settings: Settings): Promise<{
  success: boolean
  message: string
  rateLimitInfo?: { remaining: number; resetMinutes: number }
}> {
  // 1. 設定値のバリデーション
  const validation = validateGitHubSettings(settings)
  if (!validation.valid) {
    return { success: false, message: validation.message }
  }

  // 2. ユーザー情報取得（トークン検証）
  const userRes = await fetchGitHubUser(settings.token)
  if (!userRes.ok) {
    // 401: 無効なトークン, 403: Rate limit等
    return { success: false, message: 'github.invalidToken' }
  }

  // 3. リポジトリ存在確認
  const repoRes = await fetchGitHubRepo(settings.repoName, settings.token)
  if (!repoRes.ok) {
    if (repoRes.status === 404) {
      return { success: false, message: 'github.repoNotFound' }
    }
    if (repoRes.status === 403) {
      return { success: false, message: 'github.noPermission' }
    }
    return { success: false, message: 'github.repoFetchFailed' }
  }

  return { success: true, message: 'github.connectionOk' }
}
```

### UIフロー

```
設定画面
    ↓
「接続テスト」ボタンをクリック
    ↓
testGitHubConnection()実行
    ↓
    ├─ 成功 → 「接続OK（認証・リポジトリ参照に成功）」
    └─ 失敗 → エラーメッセージ（トークン無効、リポジトリ不明等）
```

### Pull/Pushとの違い

| 機能       | 実行内容                 | データ取得 |
| ---------- | ------------------------ | ---------- |
| 接続テスト | 認証・リポジトリ存在確認 | なし       |
| Pull       | 接続テスト + データ取得  | あり       |
| Push       | 接続テスト + データ送信  | あり       |

---

## Push処理（Git Tree API）

全リーフを1コミットでPushする実装。Git Tree APIを使用することで、削除・リネームを確実に処理し、APIリクエスト数を最小化（約8回）。

### ワールド別Push処理

Push時は`.agasteer/notes/`と`.agasteer/archive/`の両方を処理します。

| 条件              | 処理                                 |
| ----------------- | ------------------------------------ |
| Archiveロード済み | Home + Archive 両方を再構築          |
| Archiveロード前   | Homeのみ再構築、既存のarchive/を保持 |

**重要**: Archiveがロードされていない場合、既存の`archive/`ディレクトリを保持します。これにより、ユーザーがArchiveを見ていない状態でPushしても、アーカイブデータが消失しません。

```typescript
// 既存ツリーから.agasteer/以外のファイルと.agasteer/archive/を保持
for (const item of existingTree.tree) {
  if (!item.path.startsWith('.agasteer/notes/')) {
    if (item.path.startsWith('.agasteer/archive/') && !$isArchiveLoaded) {
      // Archiveがロードされていない場合は既存のSHAを保持
      preserveItems.push(item)
    } else if (!item.path.startsWith('.agasteer/')) {
      // .agasteer/以外のファイル（README.md等）を保持
      preserveItems.push(item)
    }
  }
}
```

### 処理フロー

1. デフォルトブランチを取得
2. 現在のブランチのHEADを取得
3. 現在のコミットからTreeのSHAを取得
4. 既存ツリーを取得（`.agasteer/`以外のファイルと必要に応じて`archive/`のSHAを記録）
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
    name: 'agasteer',
    email: 'agasteer@example.com',
  },
  author: {
    name: 'agasteer',
    email: 'agasteer@example.com',
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

### ワールド別Pull処理

AgasteerはHome/Archiveの2つのワールドを持ち、それぞれ異なるPull戦略を使用します。

| ワールド | Pull対象             | タイミング                    | 関数               |
| -------- | -------------------- | ----------------------------- | ------------------ |
| Home     | `.agasteer/notes/`   | アプリ起動時、手動Pull        | `pullFromGitHub()` |
| Archive  | `.agasteer/archive/` | ユーザーがArchiveに切り替え時 | `pullArchive()`    |

**遅延Pull**:

- 通常のPull（起動時、手動）では`.agasteer/notes/`のみ取得
- Archiveに初めて切り替えた時に`.agasteer/archive/`をPull
- 一度ロードしたArchiveは`isArchiveLoaded`フラグで管理

```typescript
// Archiveへの切り替え時
async function switchToArchive() {
  if (!$isArchiveLoaded) {
    // 初回アクセス時のみPull
    await pullArchive($settings)
    isArchiveLoaded.set(true)
  }
  currentWorld.set('archive')
}
```

### 空リポジトリの処理

初回コミットがない空のリポジトリに対応。GitHub APIは空リポジトリに対して特殊なレスポンスを返す。

#### APIレスポンス

| エンドポイント        | ステータス | メッセージ                  |
| --------------------- | ---------- | --------------------------- |
| `/contents/...`       | 404        | "This repository is empty." |
| `/git/trees/{branch}` | 409        | "Git Repository is empty."  |

#### 処理フロー

```
空リポジトリへのPull
    ↓
metadata.json取得 → 404
    ↓
fetchRemotePushCount → -1（チェック不可）
    ↓
staleチェック → true（Pullせよ）
    ↓
tree取得 → 409 Conflict
    ↓
空リポジトリとして正常処理
    ↓
onStructure([], defaultMetadata, [])
onPriorityComplete()
    ↓
isFirstPriorityFetched = true
    ↓
UI活性化（ノート作成可能）
```

#### 実装

```typescript
// tree取得後の処理
if (treeRes.status === 404 || treeRes.status === 409) {
  // 空のリポジトリ → 空のデータで成功扱い
  options?.onStructure?.([], defaultMetadata, [])
  options?.onPriorityComplete?.()
  return {
    success: true,
    message: 'github.pullOk',
    notes: [],
    leaves: [],
    metadata: defaultMetadata,
  }
}
```

### 優先度ベースの段階的ローディング（2025-11）

200件以上のリーフがある場合、全件取得には10秒以上かかります。ユーザー体験を改善するため、URLで指定されたコンテンツを優先的に取得し、UIを早期に解放する仕組みを実装。

#### 処理フロー

1. **Phase 1**: リポジトリ情報取得 → ツリー + metadata.json を並列取得
2. **Phase 2**: ノート構造を確定 → `onStructure`コールバックで通知
3. **Phase 3**: リーフを優先度順にソートしてキューイング
4. **Phase 4**: 10並列でリーフを取得、各完了時に`onLeaf`コールバック
5. **Phase 5**: 第1優先リーフ完了時に`onPriorityComplete`コールバック → UIロック解除

#### 優先度の定義

```typescript
export interface PullPriority {
  leafPaths: string[] // 第1優先: URLで指定されたリーフのパス
  noteIds: string[] // 第2優先: 第1優先リーフと同じノート配下
}
```

**優先度レベル:**

- **優先度0**: URLで直接指定されたリーフ（`?left=Note>Leaf`）
- **優先度1**: 第1優先リーフと同じノート配下のリーフ
- **優先度2**: その他すべてのリーフ

#### コールバックインターフェース

```typescript
export interface PullOptions {
  // ノート構造確定時（優先情報を返す）
  onStructure?: (notes: Note[], metadata: Metadata) => PullPriority | void
  // 各リーフ取得完了時
  onLeaf?: (leaf: Leaf) => void
  // 第1優先リーフ取得完了時（UIロック解除のタイミング）
  onPriorityComplete?: () => void
}
```

#### App.svelteでの使用例

```typescript
const options: PullOptions = {
  onStructure: (notesFromGitHub, metadataFromGitHub) => {
    // ノートを先に反映（ナビゲーション可能に）
    notes.set(notesFromGitHub)
    metadata.set(metadataFromGitHub)
    // URLから優先情報を計算して返す
    return getPriorityFromUrl(notesFromGitHub)
  },
  onLeaf: (leaf) => {
    // 各リーフをストアに追加
    leaves.update((current) => [...current, leaf])
  },
  onPriorityComplete: () => {
    // UIロック解除、ガラス効果解除
    isOperationsLocked = false
    isLoadingUI = false
    // URL復元
    restoreStateFromUrl(true)
  },
}

const result = await executePull($settings, options)
```

#### 優先度0リーフが0件の場合

両方のペインがノートを表示している場合（`?left=ideas&right=SimpleNote1`）、第1優先リーフは存在しません。この場合、リーフ取得開始**前**に`onPriorityComplete`を呼び出してUIを即座に解放します。

```typescript
const priority1Count = sortedTargets.filter((t) => getPriority(t) === 0).length

// 第1優先リーフが0件なら、リーフ取得開始前にUIロック解除
if (priority1Count === 0) {
  priority1CallbackFired = true
  options?.onPriorityComplete?.()
}
```

### 交通整理（canSync関数）

Pull/Push操作の排他制御を一元管理する関数。

```typescript
function canSync(): { canPull: boolean; canPush: boolean } {
  // Pull中またはPush中は両方とも不可
  if (isPulling || isPushing) {
    return { canPull: false, canPush: false }
  }
  return { canPull: true, canPush: true }
}
```

**使用箇所:**

- `handleSaveToGitHub()`: `if (!canSync().canPush) return`
- `handlePull()`: `if (!isInitial && !canSync().canPull) return`
- Header: `pullDisabled={!canSync().canPull}`

これにより、ボタンクリックでもVimの`:w`でも、同じ条件でブロックされます。

### UI状態フラグ

```typescript
let isLoadingUI = false // ガラス効果・操作不可（優先リーフ完了で解除）
let isPulling = false // Pull処理中（全完了で解除、URL更新スキップ用）
let isPushing = false // Push処理中
```

- `isLoadingUI`: 優先リーフ取得完了で`false`に（ガラス効果解除）
- `isPulling`: 全リーフ取得完了で`false`に（Pull/Pushボタン活性化）

### 技術的な最適化

- **生テキスト取得**: `Accept: application/vnd.github.raw`でBase64デコードを回避
- **並列取得**: `CONTENT_FETCH_CONCURRENCY = 10`で10並列実行
- **キャッシュバスター**: `?t=${Date.now()}`で常に最新データを取得

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

### パス定数

```typescript
// Home用パス
const NOTES_PATH = '.agasteer/notes'
const NOTES_METADATA_PATH = '.agasteer/notes/metadata.json'

// Archive用パス
const ARCHIVE_PATH = '.agasteer/archive'
const ARCHIVE_METADATA_PATH = '.agasteer/archive/metadata.json'
```

### パス生成関数

```typescript
function buildPath(leaf: Leaf, notes: Note[], world: WorldType = 'home'): string {
  const basePath = world === 'home' ? NOTES_PATH : ARCHIVE_PATH
  const note = notes.find((f) => f.id === leaf.noteId)
  if (!note) return `${basePath}/${leaf.title}.md`

  const folderPath = getFolderPath(note, notes)
  return `${basePath}/${folderPath}/${leaf.title}.md`
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

- ルートノート「仕事」のリーフ → `.agasteer/notes/仕事/リーフ1.md`
- サブノート「仕事/会議」のリーフ → `.agasteer/notes/仕事/会議/議事録.md`
- アーカイブされたリーフ → `.agasteer/archive/旧仕事/メモ.md`

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
