/**
 * GitHub API統合
 * GitHubへのファイル保存とSHA取得を担当
 */

import type { Leaf, Note, Settings } from './types'

export interface SaveResult {
  success: boolean
  message: string
}

export interface TestResult {
  success: boolean
  message: string
}

export interface PullResult {
  success: boolean
  message: string
  notes: Note[]
  leaves: Leaf[]
}
/**
 * UTF-8テキストをBase64エンコード
 */
function encodeContent(content: string): string {
  return btoa(unescape(encodeURIComponent(content)))
}

/**
 * ノートパスを構築
 */
function getFolderPath(note: Note, allNotes: Note[]): string {
  const parentNote = note.parentId ? allNotes.find((f) => f.id === note.parentId) : null

  if (parentNote) {
    return `${parentNote.name}/${note.name}`
  }
  return note.name
}

function buildPath(leaf: Leaf, notes: Note[]): string {
  const note = notes.find((f) => f.id === leaf.noteId)
  if (!note) return `notes/${leaf.title}.md`

  const folderPath = getFolderPath(note, notes)
  return `notes/${folderPath}/${leaf.title}.md`
}

/**
 * 既存ファイルのSHAを取得
 * ファイルが存在しない場合はnullを返す
 */
export async function fetchCurrentSha(path: string, settings: Settings): Promise<string | null> {
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

/**
 * GitHubにノートを保存（旧実装、後方互換性のため残す）
 */
export async function saveToGitHub(
  leaf: Leaf,
  notes: Note[],
  settings: Settings
): Promise<SaveResult> {
  // 設定の検証
  if (!settings.token || !settings.repoName) {
    return {
      success: false,
      message: 'GitHub設定が不完全です。設定画面でトークンとリポジトリ名を入力してください。',
    }
  }

  const path = buildPath(leaf, notes)
  const encodedContent = encodeContent(leaf.content)
  const sha = await fetchCurrentSha(path, settings)

  const body: any = {
    message: 'auto-sync',
    content: encodedContent,
    committer: {
      name: settings.username || 'SimplestNote User',
      email: settings.email || 'user@example.com',
    },
  }

  // 既存ファイルの場合はSHAを含める
  if (sha) {
    body.sha = sha
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
      return {
        success: true,
        message: '✅ GitHubに保存しました',
      }
    } else {
      const error = await response.json()
      return {
        success: false,
        message: `❌ 同期エラー: ${error.message}`,
      }
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ ネットワークエラー',
    }
  }
}

/**
 * Git Tree APIを使って全リーフを1コミットでPush
 * リネーム・削除されたファイルも正しく処理される
 */
export async function pushAllWithTreeAPI(
  leaves: Leaf[],
  notes: Note[],
  settings: Settings
): Promise<SaveResult> {
  // 設定の検証
  if (!settings.token || !settings.repoName) {
    return {
      success: false,
      message: 'GitHub設定が不完全です。',
    }
  }

  const headers = {
    Authorization: `Bearer ${settings.token}`,
    'Content-Type': 'application/json',
  }

  try {
    // 1. デフォルトブランチを取得
    const repoRes = await fetch(`https://api.github.com/repos/${settings.repoName}`, { headers })
    if (!repoRes.ok) {
      return { success: false, message: `❌ リポジトリ取得失敗 (${repoRes.status})` }
    }
    const repoData = await repoRes.json()
    const branch = repoData.default_branch || 'main'

    // 2. 現在のブランチのHEADを取得
    const refRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/ref/heads/${branch}`,
      { headers }
    )
    if (!refRes.ok) {
      return { success: false, message: `❌ ブランチ取得失敗 (${refRes.status})` }
    }
    const refData = await refRes.json()
    const currentCommitSha = refData.object.sha

    // 3. 現在のコミットを取得してTreeのSHAを取得
    const commitRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/commits/${currentCommitSha}`,
      { headers }
    )
    if (!commitRes.ok) {
      return { success: false, message: `❌ コミット取得失敗 (${commitRes.status})` }
    }
    const commitData = await commitRes.json()
    const baseTreeSha = commitData.tree.sha

    // 4. 新しいTreeを構築（notes/配下を全て定義）
    const treeItems: Array<{
      path: string
      mode: string
      type: string
      content?: string
      sha?: string | null
    }> = []

    // notes/.gitkeep を追加（notesディレクトリが空でも削除されないように）
    treeItems.push({
      path: 'notes/.gitkeep',
      mode: '100644',
      type: 'blob',
      content: '',
    })

    // 全リーフをTreeに追加
    for (const leaf of leaves) {
      const path = buildPath(leaf, notes)
      treeItems.push({
        path,
        mode: '100644',
        type: 'blob',
        content: leaf.content, // Git APIはUTF-8をそのまま受け付ける
      })
    }

    // 5. 新しいTreeを作成
    const treeRes = await fetch(`https://api.github.com/repos/${settings.repoName}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems,
      }),
    })
    if (!treeRes.ok) {
      const error = await treeRes.json()
      return { success: false, message: `❌ Tree作成失敗: ${error.message}` }
    }
    const treeData = await treeRes.json()
    const newTreeSha = treeData.sha

    // 6. 新しいコミットを作成
    const newCommitRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: 'auto-sync',
          tree: newTreeSha,
          parents: [currentCommitSha],
          committer: {
            name: settings.username || 'SimplestNote User',
            email: settings.email || 'user@example.com',
          },
          author: {
            name: settings.username || 'SimplestNote User',
            email: settings.email || 'user@example.com',
          },
        }),
      }
    )
    if (!newCommitRes.ok) {
      const error = await newCommitRes.json()
      return { success: false, message: `❌ コミット作成失敗: ${error.message}` }
    }
    const newCommitData = await newCommitRes.json()
    const newCommitSha = newCommitData.sha

    // 7. ブランチのリファレンスを更新
    const updateRefRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          sha: newCommitSha,
          force: false, // 強制更新しない（競合を検出）
        }),
      }
    )
    if (!updateRefRes.ok) {
      const error = await updateRefRes.json()
      return { success: false, message: `❌ ブランチ更新失敗: ${error.message}` }
    }

    return {
      success: true,
      message: `✅ ${leaves.length}件のリーフを保存しました`,
    }
  } catch (error) {
    console.error('GitHub Tree API error:', error)
    return {
      success: false,
      message: '❌ ネットワークエラー',
    }
  }
}

/**
 * GitHubからの簡易Pull（接続確認＋notesディレクトリ参照）
 * データのマージはせず、アクセス可否だけを確認する
 */
export async function pullFromGitHub(settings: Settings): Promise<PullResult> {
  if (!settings.token) {
    return { success: false, message: '❌ トークンが未設定です', notes: [], leaves: [] }
  }
  if (!settings.repoName || !settings.repoName.includes('/')) {
    return {
      success: false,
      message: '❌ リポジトリ名が不正です（owner/repo）',
      notes: [],
      leaves: [],
    }
  }

  const headers = {
    Authorization: `Bearer ${settings.token}`,
  }

  try {
    const repoRes = await fetch(`https://api.github.com/repos/${settings.repoName}`, { headers })
    if (repoRes.status === 404) {
      return { success: false, message: '❌ リポジトリが見つかりません', notes: [], leaves: [] }
    }
    if (repoRes.status === 401 || repoRes.status === 403) {
      return {
        success: false,
        message: '❌ リポジトリへの権限がありません',
        notes: [],
        leaves: [],
      }
    }
    if (!repoRes.ok) {
      return {
        success: false,
        message: `❌ リポジトリ確認に失敗 (${repoRes.status})`,
        notes: [],
        leaves: [],
      }
    }

    const repoData = await repoRes.json()
    const defaultBranch = repoData.default_branch || 'main'

    const treeRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/trees/${defaultBranch}?recursive=1`,
      { headers }
    )
    if (!treeRes.ok) {
      return {
        success: false,
        message: `❌ ツリー取得に失敗 (${treeRes.status})`,
        notes: [],
        leaves: [],
      }
    }

    const treeData = await treeRes.json()
    const entries: { path: string; type: string }[] = treeData.tree || []

    const noteMap = new Map<string, Note>()
    const leaves: Leaf[] = []

    const ensureNotePath = (pathParts: string[]): string => {
      let parentId: string | undefined
      for (let i = 0; i < pathParts.length; i++) {
        const partial = pathParts.slice(0, i + 1).join('/')
        if (noteMap.has(partial)) {
          parentId = noteMap.get(partial)!.id
          continue
        }
        const note: Note = {
          id: crypto.randomUUID(),
          name: pathParts[i],
          parentId,
          order: noteMap.size,
        }
        noteMap.set(partial, note)
        parentId = note.id
      }
      return parentId || ''
    }

    const notePaths = entries.filter(
      (e) =>
        e.type === 'blob' && e.path.startsWith('notes/') && e.path.toLowerCase().endsWith('.md')
    )

    for (const entry of notePaths) {
      const relativePath = entry.path.replace(/^notes\//, '')
      const parts = relativePath.split('/').filter(Boolean)
      if (parts.length === 0) continue

      const fileName = parts.pop()!
      const title = fileName.replace(/\.md$/i, '') || 'Untitled'
      const noteId = ensureNotePath(parts)

      // fetch content
      const contentRes = await fetch(
        `https://api.github.com/repos/${settings.repoName}/contents/${entry.path}`,
        { headers }
      )
      if (!contentRes.ok) continue
      const contentData = await contentRes.json()
      let content = ''
      if (contentData.content) {
        try {
          content = decodeURIComponent(escape(atob(contentData.content)))
        } catch (e) {
          content = ''
        }
      }

      leaves.push({
        id: crypto.randomUUID(),
        title,
        noteId,
        content,
        updatedAt: Date.now(),
        order: leaves.length,
      })
    }

    return {
      success: true,
      message: '✅ Pull OK',
      notes: Array.from(noteMap.values()),
      leaves,
    }
  } catch (error) {
    console.error('GitHub pull error:', error)
    return { success: false, message: '❌ ネットワークエラー', notes: [], leaves: [] }
  }
}

/**
 * GitHub接続テスト（認証＋リポジトリ参照）
 */
export async function testGitHubConnection(settings: Settings): Promise<TestResult> {
  if (!settings.token) {
    return { success: false, message: '❌ トークンが未設定です' }
  }
  if (!settings.repoName || !settings.repoName.includes('/')) {
    return { success: false, message: '❌ リポジトリ名が不正です（owner/repo）' }
  }

  const headers = {
    Authorization: `Bearer ${settings.token}`,
  }

  try {
    // 認証確認
    const userRes = await fetch('https://api.github.com/user', { headers })
    if (userRes.status === 401) {
      return { success: false, message: '❌ トークンが無効です' }
    }
    if (!userRes.ok) {
      return { success: false, message: `❌ ユーザー情報取得に失敗 (${userRes.status})` }
    }

    // リポジトリ参照確認
    const repoRes = await fetch(`https://api.github.com/repos/${settings.repoName}`, { headers })
    if (repoRes.status === 404) {
      return { success: false, message: '❌ リポジトリが見つかりません' }
    }
    if (repoRes.status === 401 || repoRes.status === 403) {
      return { success: false, message: '❌ リポジトリへの権限がありません' }
    }
    if (!repoRes.ok) {
      return { success: false, message: `❌ リポジトリ確認に失敗 (${repoRes.status})` }
    }

    return { success: true, message: '✅ 接続OK（認証・リポジトリ参照に成功）' }
  } catch (error) {
    console.error('GitHub test error:', error)
    return { success: false, message: '❌ ネットワークエラー' }
  }
}
