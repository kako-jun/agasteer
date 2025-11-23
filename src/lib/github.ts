/**
 * GitHub API統合
 * GitHubへのファイル保存とSHA取得を担当
 */

import type { Leaf, Note, Settings, Metadata } from './types'

/**
 * Git blob形式のSHA-1を計算
 * Git仕様: sha1("blob " + UTF-8バイト数 + "\0" + content)
 */
async function calculateGitBlobSha(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const contentBytes = encoder.encode(content)
  const header = `blob ${contentBytes.length}\0`
  const headerBytes = encoder.encode(header)

  // headerとcontentを結合
  const data = new Uint8Array(headerBytes.length + contentBytes.length)
  data.set(headerBytes, 0)
  data.set(contentBytes, headerBytes.length)

  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

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
  metadata: Metadata
}
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

/**
 * ノートのフルパスを取得（notes/配下のディレクトリパス）
 */
function getNotePath(note: Note, allNotes: Note[]): string {
  return `notes/${getFolderPath(note, allNotes)}`
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
  try {
    const response = await fetchGitHubContents(path, settings.repoName, settings.token)

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
 *
 * notes/以下を完全に再構築することで削除・リネームを確実に処理
 * notes/以外のファイル（README等）は保持される
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

    // 4. 既存ツリーを取得
    const existingTreeRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/trees/${baseTreeSha}?recursive=1`,
      { headers }
    )
    const preserveItems: Array<{ path: string; mode: string; type: string; sha: string }> = []
    const existingNotesFiles = new Map<string, string>() // path -> sha
    if (existingTreeRes.ok) {
      const existingTreeData = await existingTreeRes.json()
      const entries: { path: string; mode: string; type: string; sha: string }[] =
        existingTreeData.tree || []
      for (const entry of entries) {
        if (entry.type === 'blob') {
          if (!entry.path.startsWith('notes/')) {
            // notes/以外のファイルを全て保持
            preserveItems.push({
              path: entry.path,
              mode: entry.mode,
              type: entry.type,
              sha: entry.sha,
            })
          } else {
            // notes/以下のファイルのSHAを記録
            existingNotesFiles.set(entry.path, entry.sha)
          }
        }
      }
    }

    // 5. 新しいTreeを構築（base_treeは使わない）
    const treeItems: Array<{
      path: string
      mode: string
      type: string
      content?: string
      sha?: string
    }> = []

    // notes/以外のファイルを保持
    for (const item of preserveItems) {
      treeItems.push(item)
    }

    // .gitkeep用の空コンテンツのSHA（常に同じ）
    const emptyGitkeepSha = await calculateGitBlobSha('')

    // 既存のmetadata.jsonからpushCountを取得
    let currentPushCount = 0
    try {
      const metadataRes = await fetchGitHubContents(
        'notes/metadata.json',
        settings.repoName,
        settings.token
      )
      if (metadataRes.ok) {
        const metadataData = await metadataRes.json()
        if (metadataData.content) {
          const base64 = metadataData.content.replace(/\n/g, '')
          const decoded = atob(base64)
          const existingMetadata: Metadata = JSON.parse(decoded)
          currentPushCount = existingMetadata.pushCount || 0
        }
      }
    } catch (e) {
      // エラーは無視（初回Pushの場合）
    }

    // metadata.jsonを生成
    const metadata: Metadata = {
      version: 1,
      notes: {},
      leaves: {},
      pushCount: currentPushCount + 1,
    }

    // ノートのメタ情報を追加
    for (const note of notes) {
      const folderPath = getFolderPath(note, notes)
      metadata.notes[folderPath] = {
        id: note.id,
        order: note.order,
      }
    }

    // リーフのメタ情報を追加
    for (const leaf of leaves) {
      const path = buildPath(leaf, notes).replace(/^notes\//, '') // "notes/"を除去
      metadata.leaves[path] = {
        id: leaf.id,
        updatedAt: leaf.updatedAt,
        order: leaf.order,
      }
    }

    const metadataContent = JSON.stringify(metadata, null, 2)
    const metadataPath = 'notes/metadata.json'
    const metadataExisting = existingNotesFiles.get(metadataPath)
    const metadataSha = await calculateGitBlobSha(metadataContent)

    treeItems.push({
      path: metadataPath,
      mode: '100644',
      type: 'blob',
      ...(metadataExisting === metadataSha
        ? { sha: metadataExisting }
        : { content: metadataContent }),
    })

    // notes/.gitkeep を追加（notesディレクトリが空でも削除されないように）
    const notesGitkeepPath = 'notes/.gitkeep'
    const notesGitkeepExisting = existingNotesFiles.get(notesGitkeepPath)
    treeItems.push({
      path: notesGitkeepPath,
      mode: '100644',
      type: 'blob',
      ...(notesGitkeepExisting === emptyGitkeepSha
        ? { sha: notesGitkeepExisting }
        : { content: '' }),
    })

    // 全ノートに対して.gitkeepを配置（リーフがなくてもディレクトリを保持）
    for (const note of notes) {
      const notePath = getNotePath(note, notes)
      const gitkeepPath = `${notePath}/.gitkeep`
      const gitkeepExisting = existingNotesFiles.get(gitkeepPath)
      treeItems.push({
        path: gitkeepPath,
        mode: '100644',
        type: 'blob',
        ...(gitkeepExisting === emptyGitkeepSha ? { sha: gitkeepExisting } : { content: '' }),
      })
    }

    // 全リーフをTreeに追加（変化していないファイルは既存SHAを使用）
    for (const leaf of leaves) {
      const path = buildPath(leaf, notes)
      const existingSha = existingNotesFiles.get(path)

      if (existingSha) {
        // 既存ファイルがある場合、SHAを計算して比較
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

    // 6. 新しいTreeを作成（base_treeなし、全ファイルを明示的に指定）
    const newTreeRes = await fetch(`https://api.github.com/repos/${settings.repoName}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tree: treeItems,
      }),
    })
    if (!newTreeRes.ok) {
      const error = await newTreeRes.json()
      return { success: false, message: `❌ Tree作成失敗: ${error.message}` }
    }
    const newTreeData = await newTreeRes.json()
    const newTreeSha = newTreeData.sha

    // 7. 新しいコミットを作成
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

    // 8. ブランチのリファレンスを更新（強制更新）
    // 注: 他のデバイスとの同時編集は想定していないため、force: trueで上書き
    const updateRefRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          sha: newCommitSha,
          force: true, // 強制更新（他デバイスとの同時編集は非対応）
        }),
      }
    )
    if (!updateRefRes.ok) {
      const error = await updateRefRes.json()
      return { success: false, message: `❌ ブランチ更新失敗: ${JSON.stringify(error)}` }
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
  const defaultMetadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }

  if (!settings.token) {
    return {
      success: false,
      message: '❌ トークンが未設定です',
      notes: [],
      leaves: [],
      metadata: defaultMetadata,
    }
  }
  if (!settings.repoName || !settings.repoName.includes('/')) {
    return {
      success: false,
      message: '❌ リポジトリ名が不正です（owner/repo）',
      notes: [],
      leaves: [],
      metadata: defaultMetadata,
    }
  }

  const headers = {
    Authorization: `Bearer ${settings.token}`,
  }

  try {
    const repoRes = await fetch(`https://api.github.com/repos/${settings.repoName}`, { headers })
    if (repoRes.status === 404) {
      return {
        success: false,
        message: '❌ リポジトリが見つかりません',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }
    if (repoRes.status === 401 || repoRes.status === 403) {
      return {
        success: false,
        message: '❌ リポジトリへの権限がありません',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }
    if (!repoRes.ok) {
      return {
        success: false,
        message: `❌ リポジトリ確認に失敗 (${repoRes.status})`,
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
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
        metadata: defaultMetadata,
      }
    }

    const treeData = await treeRes.json()
    const entries: { path: string; type: string }[] = treeData.tree || []

    // notes/metadata.jsonを取得
    let metadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
    try {
      const metadataRes = await fetchGitHubContents(
        'notes/metadata.json',
        settings.repoName,
        settings.token
      )
      if (metadataRes.ok) {
        const metadataData = await metadataRes.json()
        if (metadataData.content) {
          const base64 = metadataData.content.replace(/\n/g, '')
          const jsonText = decodeURIComponent(escape(atob(base64)))
          const parsed = JSON.parse(jsonText)
          // 古いmetadata.jsonにはpushCountがない可能性があるので、デフォルト値を設定
          metadata = {
            version: parsed.version || 1,
            notes: parsed.notes || {},
            leaves: parsed.leaves || {},
            pushCount: parsed.pushCount || 0,
          }
        }
      }
    } catch (e) {
      console.warn('notes/metadata.json not found or invalid, using defaults')
    }

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
        // metadata.jsonからメタ情報を取得
        const meta = metadata.notes[partial] || {
          id: crypto.randomUUID(),
          order: noteMap.size,
        }
        const note: Note = {
          id: meta.id,
          name: pathParts[i],
          parentId,
          order: meta.order,
        }
        noteMap.set(partial, note)
        parentId = note.id
      }
      return parentId || ''
    }

    const notePaths = entries.filter(
      (e) =>
        e.type === 'blob' &&
        e.path.startsWith('notes/') &&
        e.path.toLowerCase().endsWith('.md') &&
        !e.path.endsWith('.gitkeep') // .gitkeepは除外
    )

    for (const entry of notePaths) {
      const relativePath = entry.path.replace(/^notes\//, '')
      const parts = relativePath.split('/').filter(Boolean)
      if (parts.length === 0) continue

      const fileName = parts.pop()!
      const title = fileName.replace(/\.md$/i, '') || 'Untitled'
      const noteId = ensureNotePath(parts)

      // fetch content
      const contentRes = await fetchGitHubContents(entry.path, settings.repoName, settings.token)
      if (!contentRes.ok) continue
      const contentData = await contentRes.json()
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

      // metadata.jsonからメタ情報を取得
      const leafPath = entry.path.replace(/^notes\//, '')
      const leafMeta = metadata.leaves[leafPath] || {
        id: crypto.randomUUID(),
        updatedAt: Date.now(),
        order: leaves.length,
      }

      leaves.push({
        id: leafMeta.id,
        title,
        noteId,
        content,
        updatedAt: leafMeta.updatedAt,
        order: leafMeta.order,
      })
    }

    // orderでソート（同一親ノート内、同一noteId内でソート）
    const sortedNotes = Array.from(noteMap.values()).sort((a, b) => a.order - b.order)
    const sortedLeaves = leaves.sort((a, b) => a.order - b.order)

    return {
      success: true,
      message: '✅ Pull OK',
      notes: sortedNotes,
      leaves: sortedLeaves,
      metadata,
    }
  } catch (error) {
    console.error('GitHub pull error:', error)
    return {
      success: false,
      message: '❌ ネットワークエラー',
      notes: [],
      leaves: [],
      metadata: defaultMetadata,
    }
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
