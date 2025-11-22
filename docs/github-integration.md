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

## ファイルパスの構築

フォルダ階層に基づいてGitHub上のパスを生成。

```typescript
function buildPath(note: Note): string {
  const folder = folders.find((f) => f.id === note.folderId)
  if (!folder) return `notes/${note.title}.md`

  const folderPath = getFolderPath(folder)
  return `notes/${folderPath}/${note.title}.md`
}

function getFolderPath(folder: Folder): string {
  const parentFolder = folder.parentId ? folders.find((f) => f.id === folder.parentId) : null

  if (parentFolder) {
    return `${parentFolder.name}/${folder.name}`
  }
  return folder.name
}
```

**例:**

- ルートフォルダ「仕事」→ `notes/仕事/メモ.md`
- サブフォルダ「仕事/会議」→ `notes/仕事/会議/議事録.md`

---

## 既存ファイルのSHA取得

GitHub APIでファイルを更新する際、既存ファイルのSHAが必要。

```typescript
async function fetchCurrentSha(path: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${settings.repoName}/contents/${path}`

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${settings.token}`,
      },
    })

    if (response.ok) {
      const data = await response.json()
      return data.sha
    }
    return null // ファイルが存在しない
  } catch (error) {
    console.error('SHA fetch error:', error)
    return null
  }
}
```

---

## ファイルの保存

Base64エンコードしてPUTリクエスト。

```typescript
async function saveToGitHub() {
  if (!currentNote) return
  if (!settings.token || !settings.repoName) {
    showAlert('GitHub設定が不完全です。')
    return
  }

  const path = buildPath(currentNote)
  const encodedContent = encodeContent(currentNote.content)
  const sha = await fetchCurrentSha(path)

  const body: any = {
    message: 'auto-sync',
    content: encodedContent,
    committer: {
      name: settings.username || 'SimplestNote User',
      email: settings.email || 'user@example.com',
    },
  }

  if (sha) {
    body.sha = sha // 更新の場合はSHAを含める
  }

  const url = `https://api.github.com/repos/${settings.repoName}/contents/${path}`

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      syncMessage = '✅ GitHubに保存しました'
      syncError = ''
      setTimeout(() => {
        syncMessage = ''
      }, 3000)
    } else {
      const error = await response.json()
      syncError = `❌ 同期エラー: ${error.message}`
      syncMessage = ''
    }
  } catch (error) {
    syncError = `❌ ネットワークエラー`
    syncMessage = ''
  }
}
```

---

## Base64エンコーディング

日本語を含むテキストを正しくエンコード。

```typescript
function encodeContent(content: string): string {
  // UTF-8 → Base64
  return btoa(unescape(encodeURIComponent(content)))
}
```

**解説:**

1. `encodeURIComponent(content)`: UTF-8バイト列をパーセントエンコード
2. `unescape()`: パーセントエンコードをバイト列に戻す
3. `btoa()`: バイナリをBase64に変換
