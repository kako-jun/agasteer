/**
 * GitHub API統合
 * GitHubへのファイル保存とSHA取得を担当
 */

import type { Leaf, Note, Settings, Metadata, WorldType, FetchPushCountResult } from '../types'
import { PRIORITY_LEAF_ID } from '../utils'

// ============================================
// パス定数
// ============================================

/** Home用パス（通常のノート・リーフ） */
export const NOTES_PATH = '.agasteer/notes'
export const NOTES_METADATA_PATH = '.agasteer/notes/metadata.json'

/** Archive用パス */
export const ARCHIVE_PATH = '.agasteer/archive'
export const ARCHIVE_METADATA_PATH = '.agasteer/archive/metadata.json'

/**
 * ワールドに応じたベースパスを取得
 */
export function getBasePath(world: WorldType): string {
  return world === 'home' ? NOTES_PATH : ARCHIVE_PATH
}

/**
 * ワールドに応じたメタデータパスを取得
 */
export function getMetadataPath(world: WorldType): string {
  return world === 'home' ? NOTES_METADATA_PATH : ARCHIVE_METADATA_PATH
}

/**
 * レート制限エラー情報
 */
export interface RateLimitInfo {
  isRateLimited: boolean
  resetTime?: Date
  remainingSeconds?: number
}

/**
 * レスポンスからレート制限情報を抽出
 */
export function parseRateLimitResponse(response: Response): RateLimitInfo {
  if (response.status !== 403 && response.status !== 429) {
    return { isRateLimited: false }
  }

  // X-RateLimit-Remaining が 0 の場合はレートリミット確定
  const remainingHeader = response.headers.get('X-RateLimit-Remaining')
  const isRateLimited = remainingHeader === '0' || response.status === 429

  if (!isRateLimited) {
    // 403だがレートリミットではない（権限エラーなど）
    return { isRateLimited: false }
  }

  const resetHeader = response.headers.get('X-RateLimit-Reset')
  if (resetHeader) {
    const resetTimestamp = parseInt(resetHeader, 10) * 1000 // 秒→ミリ秒
    const resetTime = new Date(resetTimestamp)
    const remainingSeconds = Math.max(0, Math.ceil((resetTimestamp - Date.now()) / 1000))
    return {
      isRateLimited: true,
      resetTime,
      remainingSeconds,
    }
  }

  // ヘッダーがない場合（Secondary rate limitなど）
  // GitHubのドキュメントによると通常1分程度で解除される
  return { isRateLimited: true, remainingSeconds: 60 }
}

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
  rateLimitInfo?: RateLimitInfo
  /** 変更されたリーフの数（コンテンツ変更のみカウント） */
  changedLeafCount?: number
  /** メタデータのみ変更されたか（リーフ変更なしでメタデータ変更あり） */
  metadataOnlyChanged?: boolean
}

export interface TestResult {
  success: boolean
  message: string
  rateLimitInfo?: RateLimitInfo
}

export interface PullResult {
  success: boolean
  message: string
  notes: Note[]
  leaves: Leaf[]
  metadata: Metadata
  rateLimitInfo?: RateLimitInfo
}

/**
 * Pull時の優先情報
 */
export interface PullPriority {
  /** 第1優先: URLで指定されたリーフのパス（notes/を除いた相対パス） */
  leafPaths: string[]
  /** 第2優先: URLで指定されたリーフと同じノートID */
  noteIds: string[]
}

/**
 * リーフのメタ情報（コンテンツ取得前に分かる情報）
 */
export interface LeafSkeleton {
  id: string
  title: string
  noteId: string
  order: number
  badgeIcon?: string
  badgeColor?: string
}

/**
 * Pull時のオプション
 */
export interface PullOptions {
  /** ノート構造確定時のコールバック（リーフ取得前に呼ばれる）。優先情報を返す */
  onStructure?: (
    notes: Note[],
    metadata: Metadata,
    leafSkeletons: LeafSkeleton[]
  ) => PullPriority | void
  /** 各リーフ取得完了時のコールバック */
  onLeaf?: (leaf: Leaf) => void
  /** 第1優先リーフ全取得完了時のコールバック */
  onPriorityComplete?: () => void
}

// コンテンツ取得を並列化する際の上限（HTTP/2では同時接続数制限が緩和されている）
const CONTENT_FETCH_CONCURRENCY = 10

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R | null>
): Promise<R[]> {
  const results: R[] = []
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const currentIndex = index++
      if (currentIndex >= items.length) break
      const item = items[currentIndex]
      const result = await worker(item, currentIndex)
      if (result !== null) {
        results.push(result)
      }
    }
  })
  await Promise.all(workers)
  return results
}
/**
 * GitHub設定を検証
 */
function validateGitHubSettings(settings: Settings): { valid: boolean; error?: string } {
  if (!settings.token) {
    return { valid: false, error: 'トークンが未設定です' }
  }
  if (!settings.repoName || !settings.repoName.includes('/')) {
    return { valid: false, error: 'リポジトリ名が不正です（owner/repo）' }
  }
  return { valid: true }
}

/**
 * GitHub Contents APIを呼ぶヘルパー関数（キャッシュバスター付き）
 */
async function fetchGitHubContents(
  path: string,
  repoName: string,
  token: string,
  options?: { raw?: boolean }
) {
  const url = `https://api.github.com/repos/${repoName}/contents/${path}?t=${Date.now()}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  // RawモードはBase64デコードを省きレスポンスサイズを抑える
  if (options?.raw) {
    headers.Accept = 'application/vnd.github.raw'
  }
  return fetch(url, {
    headers,
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
 * ノートのフルパスを取得（.agasteer/notes/または.agasteer/archive/配下のディレクトリパス）
 */
function getNotePath(note: Note, allNotes: Note[], world: WorldType = 'home'): string {
  const basePath = getBasePath(world)
  return `${basePath}/${getFolderPath(note, allNotes)}`
}

function buildPath(leaf: Leaf, notes: Note[], world: WorldType = 'home'): string {
  const note = notes.find((f) => f.id === leaf.noteId)
  const basePath = getBasePath(world)
  // ファイル名に使えない文字をサニタイズ
  const sanitizedTitle = sanitizePathPart(leaf.title)
  if (!note) {
    console.warn('[buildPath] Note not found for leaf:', leaf.title, 'noteId:', leaf.noteId)
    return `${basePath}/${sanitizedTitle}.md`
  }

  const folderPath = getFolderPath(note, notes)
  const path = `${basePath}/${folderPath}/${sanitizedTitle}.md`
  return path
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
  const validation = validateGitHubSettings(settings)
  if (!validation.valid) {
    return {
      success: false,
      message: `❌ ${validation.error}`,
    }
  }

  const path = buildPath(leaf, notes)
  const encodedContent = encodeContent(leaf.content)
  const sha = await fetchCurrentSha(path, settings)

  const body: any = {
    message: 'Agasteer push',
    content: encodedContent,
    committer: {
      name: 'agasteer',
      email: 'agasteer@users.noreply.github.com',
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
 * Push用のオプション
 */
export interface PushOptions {
  /** Homeのリーフ */
  leaves: Leaf[]
  /** Homeのノート */
  notes: Note[]
  /** 設定 */
  settings: Settings
  /** Homeのローカルメタデータ */
  localMetadata?: Metadata
  /** アーカイブのリーフ（ロード済みの場合のみ指定） */
  archiveLeaves?: Leaf[]
  /** アーカイブのノート（ロード済みの場合のみ指定） */
  archiveNotes?: Note[]
  /** アーカイブのローカルメタデータ（ロード済みの場合のみ指定） */
  archiveMetadata?: Metadata
  /** アーカイブがロード済みかどうか */
  isArchiveLoaded?: boolean
}

/**
 * Git Tree APIを使って全リーフを1コミットでPush
 *
 * .agasteer/notes/と.agasteer/archive/を完全に再構築することで削除・リネームを確実に処理
 * .agasteer/以外のファイル（README等）は保持される
 * 旧形式(notes/)からの移行: 旧notes/ディレクトリは削除される
 */
export async function pushAllWithTreeAPI(
  leaves: Leaf[],
  notes: Note[],
  settings: Settings,
  localMetadata?: Metadata
): Promise<SaveResult>
export async function pushAllWithTreeAPI(options: PushOptions): Promise<SaveResult>
export async function pushAllWithTreeAPI(
  leavesOrOptions: Leaf[] | PushOptions,
  notesArg?: Note[],
  settingsArg?: Settings,
  localMetadataArg?: Metadata
): Promise<SaveResult> {
  // オーバーロードの解決
  const isOptionsArg = !Array.isArray(leavesOrOptions)
  const leaves = isOptionsArg ? leavesOrOptions.leaves : leavesOrOptions
  const notes = isOptionsArg ? leavesOrOptions.notes : notesArg!
  const settings = isOptionsArg ? leavesOrOptions.settings : settingsArg!
  const localMetadata = isOptionsArg ? leavesOrOptions.localMetadata : localMetadataArg
  const archiveLeaves = isOptionsArg ? leavesOrOptions.archiveLeaves : undefined
  const archiveNotes = isOptionsArg ? leavesOrOptions.archiveNotes : undefined
  const archiveMetadata = isOptionsArg ? leavesOrOptions.archiveMetadata : undefined
  const isArchiveLoaded = isOptionsArg ? leavesOrOptions.isArchiveLoaded : false
  const decodeBase64ToString = (base64: string): string => {
    const clean = base64.replace(/\n/g, '')
    const binary = atob(clean)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  }

  const stableStringify = (value: any): string => {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(',')}]`
    }
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }

  const normalizeMetadata = (meta: Metadata, pushCountOverride?: number): Metadata => {
    const normalized: Metadata = {
      version: meta.version ?? 1,
      pushCount: pushCountOverride ?? meta.pushCount ?? 0,
      notes: {},
      leaves: {},
    }

    const noteKeys = Object.keys(meta.notes || {}).sort()
    for (const key of noteKeys) {
      const n = meta.notes[key]
      const entry: any = { id: n.id, order: n.order }
      if (n.badgeIcon) entry.badgeIcon = n.badgeIcon
      if (n.badgeColor) entry.badgeColor = n.badgeColor
      normalized.notes[key] = entry
    }

    const leafKeys = Object.keys(meta.leaves || {}).sort()
    for (const key of leafKeys) {
      const l = meta.leaves[key]
      const entry: any = { id: l.id, updatedAt: l.updatedAt, order: l.order }
      if (l.badgeIcon) entry.badgeIcon = l.badgeIcon
      if (l.badgeColor) entry.badgeColor = l.badgeColor
      normalized.leaves[key] = entry
    }

    return normalized
  }

  // 設定の検証
  const validation = validateGitHubSettings(settings)
  if (!validation.valid) {
    return {
      success: false,
      message: `❌ ${validation.error}`,
    }
  }

  const headers = {
    Authorization: `Bearer ${settings.token}`,
    'Content-Type': 'application/json',
  }

  try {
    // 1. デフォルトブランチを取得
    const repoRes = await fetch(`https://api.github.com/repos/${settings.repoName}`, { headers })
    // レート制限チェック
    const repoRateLimit = parseRateLimitResponse(repoRes)
    if (repoRateLimit.isRateLimited) {
      return { success: false, message: 'github.rateLimited', rateLimitInfo: repoRateLimit }
    }
    if (!repoRes.ok) {
      return { success: false, message: 'github.repoFetchFailed' }
    }
    const repoData = await repoRes.json()
    const branch = repoData.default_branch || 'main'

    // 2. 現在のブランチのHEADを取得
    const refRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/ref/heads/${branch}`,
      { headers }
    )
    // レート制限チェック
    const refRateLimit = parseRateLimitResponse(refRes)
    if (refRateLimit.isRateLimited) {
      return { success: false, message: 'github.rateLimited', rateLimitInfo: refRateLimit }
    }

    // 空のリポジトリかどうか（ブランチがまだない場合）
    const isEmptyRepo = refRes.status === 404
    let currentCommitSha: string | null = null
    let baseTreeSha: string | null = null

    if (!isEmptyRepo) {
      if (!refRes.ok) {
        return { success: false, message: 'github.branchFetchFailed' }
      }
      const refData = await refRes.json()
      currentCommitSha = refData.object.sha

      // 3. 現在のコミットを取得してTreeのSHAを取得
      const commitRes = await fetch(
        `https://api.github.com/repos/${settings.repoName}/git/commits/${currentCommitSha}`,
        { headers }
      )
      // レート制限チェック
      const commitRateLimit = parseRateLimitResponse(commitRes)
      if (commitRateLimit.isRateLimited) {
        return { success: false, message: 'github.rateLimited', rateLimitInfo: commitRateLimit }
      }
      if (!commitRes.ok) {
        return { success: false, message: 'github.commitFetchFailed' }
      }
      const commitData = await commitRes.json()
      baseTreeSha = commitData.tree.sha
    }

    // 4. 既存ツリーを取得（空リポジトリの場合はスキップ）
    const preserveItems: Array<{ path: string; mode: string; type: string; sha: string }> = []
    const existingNotesFiles = new Map<string, string>() // path -> sha (for .agasteer/notes/)
    const existingArchiveFiles = new Map<string, string>() // path -> sha (for .agasteer/archive/)

    if (!isEmptyRepo && baseTreeSha) {
      const existingTreeRes = await fetch(
        `https://api.github.com/repos/${settings.repoName}/git/trees/${baseTreeSha}?recursive=1`,
        { headers }
      )
      // レート制限チェック
      const existingTreeRateLimit = parseRateLimitResponse(existingTreeRes)
      if (existingTreeRateLimit.isRateLimited) {
        return {
          success: false,
          message: 'github.rateLimited',
          rateLimitInfo: existingTreeRateLimit,
        }
      }
      if (existingTreeRes.ok) {
        const existingTreeData = await existingTreeRes.json()
        const entries: { path: string; mode: string; type: string; sha: string }[] =
          existingTreeData.tree || []
        for (const entry of entries) {
          if (entry.type === 'blob') {
            if (entry.path.startsWith(`${NOTES_PATH}/`)) {
              // .agasteer/notes/以下のファイルのSHAを記録
              existingNotesFiles.set(entry.path, entry.sha)
            } else if (entry.path.startsWith(`${ARCHIVE_PATH}/`)) {
              // .agasteer/archive/以下のファイルのSHAを記録
              existingArchiveFiles.set(entry.path, entry.sha)
            } else {
              // .agasteer/以外のファイルを全て保持
              preserveItems.push({
                path: entry.path,
                mode: entry.mode,
                type: entry.type,
                sha: entry.sha,
              })
            }
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
    let existingMetadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
    let existingArchiveMetadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
    try {
      const metadataRes = await fetchGitHubContents(
        NOTES_METADATA_PATH,
        settings.repoName,
        settings.token
      )
      if (metadataRes.ok) {
        const metadataData = await metadataRes.json()
        if (metadataData.content) {
          const decoded = decodeBase64ToString(metadataData.content)
          existingMetadata = JSON.parse(decoded)
          currentPushCount = existingMetadata.pushCount || 0
        }
      }
    } catch (e) {
      // エラーは無視（初回Pushの場合）
    }

    // アーカイブのmetadata.jsonを取得
    try {
      const archiveMetadataRes = await fetchGitHubContents(
        ARCHIVE_METADATA_PATH,
        settings.repoName,
        settings.token
      )
      if (archiveMetadataRes.ok) {
        const metadataData = await archiveMetadataRes.json()
        if (metadataData.content) {
          const decoded = decodeBase64ToString(metadataData.content)
          existingArchiveMetadata = JSON.parse(decoded)
        }
      }
    } catch (e) {
      // エラーは無視
    }

    // metadata.jsonを生成（pushCountはまだインクリメントしない）
    const metadata: Metadata = {
      version: 1,
      notes: {},
      leaves: {},
      pushCount: currentPushCount,
    }

    // ノートのメタ情報を追加（undefinedは含めない）
    for (const note of notes) {
      const folderPath = getFolderPath(note, notes)
      const meta: Record<string, unknown> = {
        id: note.id,
        order: note.order,
      }
      if (note.badgeIcon !== undefined) meta.badgeIcon = note.badgeIcon
      if (note.badgeColor !== undefined) meta.badgeColor = note.badgeColor
      metadata.notes[folderPath] = meta as Metadata['notes'][string]
    }

    // リーフのメタ情報を追加（undefinedは含めない）
    for (const leaf of leaves) {
      const fullPath = buildPath(leaf, notes, 'home')
      // ベースパス(.agasteer/notes/)を除去して相対パスにする
      const path = fullPath.replace(new RegExp(`^${NOTES_PATH}/`), '')
      const meta: Record<string, unknown> = {
        id: leaf.id,
        updatedAt: leaf.updatedAt,
        order: leaf.order,
      }
      if (leaf.badgeIcon !== undefined) meta.badgeIcon = leaf.badgeIcon
      if (leaf.badgeColor !== undefined) meta.badgeColor = leaf.badgeColor
      metadata.leaves[path] = meta as Metadata['leaves'][string]
    }

    // 仮想リーフ（Priority）のバッジ情報を保持
    // 仮想リーフはGitにファイルとして保存されないが、バッジ情報はmetadataで永続化
    // ローカルのmetadataストアを優先し、なければGitHubの既存metadataから復元
    const priorityMeta =
      localMetadata?.leaves?.[PRIORITY_LEAF_ID] || existingMetadata?.leaves?.[PRIORITY_LEAF_ID]
    if (priorityMeta && (priorityMeta.badgeIcon || priorityMeta.badgeColor)) {
      metadata.leaves[PRIORITY_LEAF_ID] = {
        id: PRIORITY_LEAF_ID,
        updatedAt: priorityMeta.updatedAt || Date.now(),
        order: 0,
        badgeIcon: priorityMeta.badgeIcon,
        badgeColor: priorityMeta.badgeColor,
      }
    }

    // .agasteer/notes/.gitkeep を追加（notesディレクトリが空でも削除されないように）
    const notesGitkeepPath = `${NOTES_PATH}/.gitkeep`
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
      const notePath = getNotePath(note, notes, 'home')
      const gitkeepPath = `${notePath}/.gitkeep`
      const gitkeepExisting = existingNotesFiles.get(gitkeepPath)
      treeItems.push({
        path: gitkeepPath,
        mode: '100644',
        type: 'blob',
        ...(gitkeepExisting === emptyGitkeepSha ? { sha: gitkeepExisting } : { content: '' }),
      })
    }

    const changedLeafPaths: string[] = []

    // 全リーフをTreeに追加（変化していないファイルは既存SHAを使用）
    for (const leaf of leaves) {
      const path = buildPath(leaf, notes, 'home')
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
      changedLeafPaths.push(path)
    }

    // metadata差分を含めて変更チェック（pushCountのインクリメントは除外）
    const normalizedExisting = normalizeMetadata(existingMetadata, currentPushCount)
    const normalizedCurrent = normalizeMetadata(metadata, currentPushCount)
    const metadataChanged =
      stableStringify(normalizedExisting) !== stableStringify(normalizedCurrent)

    const leafChanged = changedLeafPaths.length > 0
    const hasAnyChanges = leafChanged || metadataChanged
    if (!hasAnyChanges) {
      // 変更がない場合は何もせずに成功を返す
      return { success: true, message: 'github.noChanges' }
    }

    // 変更がある場合のみpushCountをインクリメントし、metadata.jsonを追加
    const metadataToWrite = normalizeMetadata(metadata, currentPushCount + 1)
    const metadataContent = JSON.stringify(metadataToWrite, null, 2)

    treeItems.push({
      path: NOTES_METADATA_PATH,
      mode: '100644',
      type: 'blob',
      content: metadataContent,
    })

    // アーカイブの処理
    if (isArchiveLoaded && archiveNotes && archiveLeaves) {
      // アーカイブがロード済みの場合は、アーカイブデータも書き込む
      const archiveMeta: Metadata = {
        version: 1,
        notes: {},
        leaves: {},
        pushCount: 0, // アーカイブ側のpushCountは使わない
      }

      // アーカイブノートのメタ情報
      for (const note of archiveNotes) {
        const folderPath = getFolderPath(note, archiveNotes)
        const meta: Record<string, unknown> = {
          id: note.id,
          order: note.order,
        }
        if (note.badgeIcon !== undefined) meta.badgeIcon = note.badgeIcon
        if (note.badgeColor !== undefined) meta.badgeColor = note.badgeColor
        archiveMeta.notes[folderPath] = meta as Metadata['notes'][string]
      }

      // アーカイブリーフのメタ情報
      for (const leaf of archiveLeaves) {
        const fullPath = buildPath(leaf, archiveNotes, 'archive')
        const path = fullPath.replace(new RegExp(`^${ARCHIVE_PATH}/`), '')
        const meta: Record<string, unknown> = {
          id: leaf.id,
          updatedAt: leaf.updatedAt,
          order: leaf.order,
        }
        if (leaf.badgeIcon !== undefined) meta.badgeIcon = leaf.badgeIcon
        if (leaf.badgeColor !== undefined) meta.badgeColor = leaf.badgeColor
        archiveMeta.leaves[path] = meta as Metadata['leaves'][string]
      }

      // アーカイブの.gitkeep
      const archiveGitkeepPath = `${ARCHIVE_PATH}/.gitkeep`
      const archiveGitkeepExisting = existingArchiveFiles.get(archiveGitkeepPath)
      treeItems.push({
        path: archiveGitkeepPath,
        mode: '100644',
        type: 'blob',
        ...(archiveGitkeepExisting === emptyGitkeepSha
          ? { sha: archiveGitkeepExisting }
          : { content: '' }),
      })

      // アーカイブノートの.gitkeep
      for (const note of archiveNotes) {
        const notePath = getNotePath(note, archiveNotes, 'archive')
        const gitkeepPath = `${notePath}/.gitkeep`
        const gitkeepExisting = existingArchiveFiles.get(gitkeepPath)
        treeItems.push({
          path: gitkeepPath,
          mode: '100644',
          type: 'blob',
          ...(gitkeepExisting === emptyGitkeepSha ? { sha: gitkeepExisting } : { content: '' }),
        })
      }

      // アーカイブリーフ
      for (const leaf of archiveLeaves) {
        const path = buildPath(leaf, archiveNotes, 'archive')
        const existingSha = existingArchiveFiles.get(path)

        if (existingSha) {
          const localSha = await calculateGitBlobSha(leaf.content)
          if (localSha === existingSha) {
            treeItems.push({
              path,
              mode: '100644',
              type: 'blob',
              sha: existingSha,
            })
            continue
          }
        }

        treeItems.push({
          path,
          mode: '100644',
          type: 'blob',
          content: leaf.content,
        })
        changedLeafPaths.push(path)
      }

      // アーカイブのmetadata.json
      const archiveMetaContent = JSON.stringify(archiveMeta, null, 2)
      treeItems.push({
        path: ARCHIVE_METADATA_PATH,
        mode: '100644',
        type: 'blob',
        content: archiveMetaContent,
      })
    } else {
      // アーカイブがロードされていない場合は、既存のアーカイブファイルを保持
      for (const [path, sha] of existingArchiveFiles) {
        treeItems.push({
          path,
          mode: '100644',
          type: 'blob',
          sha,
        })
      }
    }

    // 6. 新しいTreeを作成（base_treeなし、全ファイルを明示的に指定）
    const newTreeRes = await fetch(`https://api.github.com/repos/${settings.repoName}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tree: treeItems,
      }),
    })
    // レート制限チェック
    const newTreeRateLimit = parseRateLimitResponse(newTreeRes)
    if (newTreeRateLimit.isRateLimited) {
      return { success: false, message: 'github.rateLimited', rateLimitInfo: newTreeRateLimit }
    }
    if (!newTreeRes.ok) {
      return { success: false, message: 'github.treeCreateFailed' }
    }
    const newTreeData = await newTreeRes.json()
    const newTreeSha = newTreeData.sha

    // 7. 新しいコミットを作成
    // 空リポジトリの場合はparentsを空配列にする（初回コミット）
    const newCommitRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: 'Agasteer pushed notes',
          tree: newTreeSha,
          parents: isEmptyRepo ? [] : [currentCommitSha],
          committer: {
            name: 'agasteer',
            email: 'agasteer@users.noreply.github.com',
          },
          author: {
            name: 'agasteer',
            email: 'agasteer@users.noreply.github.com',
          },
        }),
      }
    )
    // レート制限チェック
    const newCommitRateLimit = parseRateLimitResponse(newCommitRes)
    if (newCommitRateLimit.isRateLimited) {
      return { success: false, message: 'github.rateLimited', rateLimitInfo: newCommitRateLimit }
    }
    if (!newCommitRes.ok) {
      return { success: false, message: 'github.commitCreateFailed' }
    }
    const newCommitData = await newCommitRes.json()
    const newCommitSha = newCommitData.sha

    // 8. ブランチのリファレンスを更新または作成
    // 空リポジトリの場合はPOSTで新規作成、既存の場合はPATCHで更新
    let updateRefRes: Response
    if (isEmptyRepo) {
      // 新規ブランチを作成
      updateRefRes = await fetch(`https://api.github.com/repos/${settings.repoName}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: newCommitSha,
        }),
      })
    } else {
      // 既存ブランチを更新（強制更新）
      updateRefRes = await fetch(
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
    }
    // レート制限チェック
    const updateRefRateLimit = parseRateLimitResponse(updateRefRes)
    if (updateRefRateLimit.isRateLimited) {
      return { success: false, message: 'github.rateLimited', rateLimitInfo: updateRefRateLimit }
    }
    if (!updateRefRes.ok) {
      return { success: false, message: 'github.branchUpdateFailed' }
    }

    return {
      success: true,
      message: 'github.pushOk',
      changedLeafCount: changedLeafPaths.length,
      metadataOnlyChanged: !leafChanged && metadataChanged,
    }
  } catch (error) {
    console.error('GitHub Tree API error:', error)
    return {
      success: false,
      message: 'github.networkError',
    }
  }
}

/**
 * GitHubからPull
 *
 * 段階ロード対応:
 * 1. ノート構造とmetadataを取得 → onStructureコールバック
 * 2. 優先度でソートしてリーフを並列取得 → 各リーフ取得時にonLeafコールバック
 * 3. 第1優先リーフ取得完了 → onPriorityCompleteコールバック
 */
export async function pullFromGitHub(
  settings: Settings,
  options?: PullOptions
): Promise<PullResult> {
  const defaultMetadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }

  const validation = validateGitHubSettings(settings)
  if (!validation.valid) {
    return {
      success: false,
      message: `❌ ${validation.error}`,
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
        message: 'github.repoNotFound',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }
    // レート制限チェック
    const repoRateLimit = parseRateLimitResponse(repoRes)
    if (repoRateLimit.isRateLimited) {
      return {
        success: false,
        message: 'github.rateLimited',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
        rateLimitInfo: repoRateLimit,
      }
    }
    if (repoRes.status === 401) {
      return {
        success: false,
        message: 'github.noPermission',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }
    if (!repoRes.ok) {
      return {
        success: false,
        message: 'github.repoFetchFailed',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }

    const repoData = await repoRes.json()
    const defaultBranch = repoData.default_branch || 'main'

    // tree取得
    const treeRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/trees/${defaultBranch}?recursive=1`,
      { headers }
    )

    // レート制限チェック（tree）
    const treeRateLimit = parseRateLimitResponse(treeRes)
    if (treeRateLimit.isRateLimited) {
      return {
        success: false,
        message: 'github.rateLimited',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
        rateLimitInfo: treeRateLimit,
      }
    }
    // 空のリポジトリ（コミットがない）の場合は404または409が返る → 空のデータで成功扱い
    // 404: ブランチが存在しない
    // 409: Conflict - Git Repository is empty（GitHub APIの仕様）
    if (treeRes.status === 404 || treeRes.status === 409) {
      // コールバックを呼んでUIを正常状態に遷移させる
      // 1. onStructure: ノート構造を設定（空）
      options?.onStructure?.([], defaultMetadata, [])
      // 2. onPriorityComplete: isFirstPriorityFetched=true, isLoadingUI=false を設定
      options?.onPriorityComplete?.()
      return {
        success: true,
        message: 'github.pullOk',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }
    if (!treeRes.ok) {
      return {
        success: false,
        message: 'github.treeFetchFailed',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }

    const treeData = await treeRes.json()
    const entries: { path: string; type: string }[] = treeData.tree || []

    // metadata.jsonを取得してパース
    let metadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
    try {
      const metadataRes = await fetchGitHubContents(
        NOTES_METADATA_PATH,
        settings.repoName,
        settings.token
      )
      if (metadataRes.ok) {
        const metadataData = await metadataRes.json()
        if (metadataData.content) {
          const base64 = metadataData.content.replace(/\n/g, '')
          const jsonText = decodeURIComponent(escape(atob(base64)))
          const parsed = JSON.parse(jsonText)
          metadata = {
            version: parsed.version || 1,
            notes: parsed.notes || {},
            leaves: parsed.leaves || {},
            pushCount: parsed.pushCount || 0,
          }
        }
      }
    } catch (e) {
      console.warn(`${NOTES_METADATA_PATH} not found or invalid, using defaults`)
    }

    const noteMap = new Map<string, Note>()

    const collapseToTwoLevels = (parts: string[]): string[] => {
      if (parts.length <= 2) return parts.map((p) => sanitizePathPart(p))
      return [sanitizePathPart(parts[0]), sanitizePathPart(parts.slice(1).join('/'))]
    }

    const ensureNotePath = (pathParts: string[]): string => {
      const collapsed = collapseToTwoLevels(pathParts)
      let parentId: string | undefined
      for (let i = 0; i < collapsed.length; i++) {
        const partial = collapsed.slice(0, i + 1).join('/')
        if (noteMap.has(partial)) {
          parentId = noteMap.get(partial)!.id
          continue
        }
        // metadata.jsonからメタ情報を取得
        const meta = metadata.notes[partial] || {
          id: crypto.randomUUID(),
          order: noteMap.size,
          badgeIcon: undefined,
          badgeColor: undefined,
        }
        const note: Note = {
          id: meta.id,
          name: collapsed[i],
          parentId,
          order: meta.order,
          badgeIcon: meta.badgeIcon,
          badgeColor: meta.badgeColor,
        }
        noteMap.set(partial, note)
        parentId = note.id
      }
      return parentId || ''
    }

    // ベースパスのプレフィックスを作成（末尾スラッシュ付き）
    const basePathPrefix = `${NOTES_PATH}/`
    const basePathGitkeep = `${NOTES_PATH}/.gitkeep`

    // まず.gitkeepファイルから空ノートを復元
    const gitkeepPaths = entries.filter(
      (e) =>
        e.type === 'blob' &&
        e.path.startsWith(basePathPrefix) &&
        e.path.endsWith('.gitkeep') &&
        e.path !== basePathGitkeep // ルートの.gitkeepは除外
    )

    for (const entry of gitkeepPaths) {
      const relativePath = entry.path
        .replace(new RegExp(`^${NOTES_PATH}/`), '')
        .replace(/\/\.gitkeep$/, '')
      const parts = collapseToTwoLevels(relativePath.split('/').filter(Boolean))
      if (parts.length === 0) continue

      // .gitkeepがあるディレクトリのノートを復元
      ensureNotePath(parts)
    }

    // 次に.mdファイル（リーフ）を復元
    const notePaths = entries.filter(
      (e) =>
        e.type === 'blob' &&
        e.path.startsWith(basePathPrefix) &&
        e.path.toLowerCase().endsWith('.md') &&
        !e.path.endsWith('.gitkeep') // .gitkeepは除外
    )

    // コンテンツ取得用のターゲットを事前に作成（メタデータ取得はここで済ませる）
    const leafTargets = notePaths.map((entry, idx) => {
      const relativePath = entry.path.replace(new RegExp(`^${NOTES_PATH}/`), '')
      const allParts = relativePath.split('/').filter(Boolean)
      // ファイル名を先に分離してから、ノートパス部分だけをcollapseする
      const fileName = allParts.pop() || ''
      const noteParts = collapseToTwoLevels(allParts)
      const title = fileName.replace(/\.md$/i, '') || 'Untitled'
      const noteId = ensureNotePath(noteParts)
      const leafPathOriginal = entry.path.replace(new RegExp(`^${NOTES_PATH}/`), '')
      const leafPathCollapsed = [...noteParts, fileName].join('/')
      const leafMeta = metadata.leaves[leafPathCollapsed] ||
        metadata.leaves[leafPathOriginal] || {
          id: crypto.randomUUID(),
          updatedAt: Date.now(),
          order: idx,
          badgeIcon: undefined,
          badgeColor: undefined,
        }
      return {
        entry,
        title,
        noteId,
        leafMeta,
        relativePath: leafPathCollapsed,
      }
    })

    // ノート構造確定 → onStructureコールバック（優先情報を返してもらう）
    const sortedNotes = Array.from(noteMap.values()).sort((a, b) => a.order - b.order)

    // リーフのスケルトン情報を作成（コンテンツ取得前に分かる情報）
    const leafSkeletons: LeafSkeleton[] = leafTargets.map((target) => ({
      id: target.leafMeta.id,
      title: target.title,
      noteId: target.noteId,
      order: target.leafMeta.order,
      badgeIcon: target.leafMeta.badgeIcon,
      badgeColor: target.leafMeta.badgeColor,
    }))

    const priority = options?.onStructure?.(sortedNotes, metadata, leafSkeletons)

    // 優先度でソート（priorityがvoidの場合は空セット）
    const priorityLeafPaths = new Set(priority && 'leafPaths' in priority ? priority.leafPaths : [])
    const priorityNoteIds = new Set(priority && 'noteIds' in priority ? priority.noteIds : [])

    const getPriority = (target: (typeof leafTargets)[0]): number => {
      // 第1優先: URLで指定されたリーフ
      if (priorityLeafPaths.has(target.relativePath)) return 0
      // 第2優先: URLで指定されたリーフと同じノート配下
      if (priorityNoteIds.has(target.noteId)) return 1
      // その他
      return 2
    }

    const sortedTargets = [...leafTargets].sort((a, b) => {
      const priorityDiff = getPriority(a) - getPriority(b)
      if (priorityDiff !== 0) return priorityDiff
      return a.leafMeta.order - b.leafMeta.order
    })

    // 第1優先リーフの数をカウント
    const priority1Count = sortedTargets.filter((t) => getPriority(t) === 0).length
    let priority1Completed = 0
    let priority1CallbackFired = false

    // 第1優先リーフが0件なら、リーフ取得開始前にUIロック解除
    if (priority1Count === 0) {
      priority1CallbackFired = true
      options?.onPriorityComplete?.()
    }

    // リーフを並列取得（コールバック付き）
    const leaves = await runWithConcurrency(
      sortedTargets,
      CONTENT_FETCH_CONCURRENCY,
      async (target) => {
        const contentRes = await fetchGitHubContents(
          target.entry.path,
          settings.repoName,
          settings.token,
          { raw: true }
        )
        if (!contentRes.ok) return null
        const content = await contentRes.text()

        const leaf: Leaf = {
          id: target.leafMeta.id,
          title: target.title,
          noteId: target.noteId,
          content,
          updatedAt: target.leafMeta.updatedAt,
          order: target.leafMeta.order,
          badgeIcon: target.leafMeta.badgeIcon,
          badgeColor: target.leafMeta.badgeColor,
        }

        // 各リーフ取得完了時のコールバック
        options?.onLeaf?.(leaf)

        // 第1優先リーフの完了チェック
        if (getPriority(target) === 0) {
          priority1Completed++
          if (priority1Completed >= priority1Count && !priority1CallbackFired) {
            priority1CallbackFired = true
            options?.onPriorityComplete?.()
          }
        }

        return leaf
      }
    )

    // orderでソート
    const sortedLeaves = leaves.sort((a, b) => a.order - b.order)

    return {
      success: true,
      message: 'github.pullOk',
      notes: sortedNotes,
      leaves: sortedLeaves,
      metadata,
    }
  } catch (error) {
    console.error('GitHub pull error:', error)
    return {
      success: false,
      message: 'github.networkError',
      notes: [],
      leaves: [],
      metadata: defaultMetadata,
    }
  }
}

/**
 * リモートのpushCountを取得（Stale編集検出用）
 *
 * ## Stale（ステイル）とは
 * 「Stale = 古くなった」状態を指す。
 * 例: PCでPull→スマホで編集してPush→PCで編集を続行
 * この時、PCのローカルデータはリモートより古い（Stale）状態。
 * PCからそのままPushすると、スマホでの変更が上書きされてしまう。
 *
 * ## 判定ロジック
 * リモートのpushCount > ローカルのlastPulledPushCount → Stale
 *
 * ## 処理フェーズ
 *   Phase 1: 設定バリデーション
 *   Phase 2: metadata.json取得
 *   Phase 3: レスポンス解析・結果判定
 *
 * @returns FetchPushCountResult - 明確な状態を持つ結果オブジェクト
 */
export async function fetchRemotePushCount(settings: Settings): Promise<FetchPushCountResult> {
  // Phase 1: 設定バリデーション
  const validation = validateGitHubSettings(settings)
  if (!validation.valid) {
    return { status: 'settings_invalid' }
  }

  // Phase 2: metadata.json取得
  try {
    const metadataRes = await fetchGitHubContents(
      NOTES_METADATA_PATH,
      settings.repoName,
      settings.token
    )

    // Phase 3: レスポンス解析・結果判定
    if (metadataRes.ok) {
      const metadataData = await metadataRes.json()
      if (metadataData.content) {
        const base64 = metadataData.content.replace(/\n/g, '')
        const jsonText = decodeURIComponent(escape(atob(base64)))
        const parsed = JSON.parse(jsonText)
        return { status: 'success', pushCount: parsed.pushCount || 0 }
      }
    }

    // 404/409: 空リポジトリ、またはmetadata.jsonがまだない
    if (metadataRes.status === 404 || metadataRes.status === 409) {
      return { status: 'empty_repository' }
    }

    // 401/403: 認証エラー
    if (metadataRes.status === 401 || metadataRes.status === 403) {
      return { status: 'auth_error' }
    }

    // その他のエラー（500等）はネットワークエラーとして扱う
    return { status: 'network_error' }
  } catch (e) {
    console.warn('Failed to fetch remote pushCount:', e)
    return { status: 'network_error', error: e }
  }
}

/**
 * GitHub接続テスト（認証＋リポジトリ参照）
 */
export async function testGitHubConnection(settings: Settings): Promise<TestResult> {
  const validation = validateGitHubSettings(settings)
  if (!validation.valid) {
    return { success: false, message: `❌ ${validation.error}` }
  }

  const headers = {
    Authorization: `Bearer ${settings.token}`,
  }

  try {
    // 認証確認
    const userRes = await fetch('https://api.github.com/user', { headers })
    if (userRes.status === 401) {
      return { success: false, message: 'github.invalidToken' }
    }
    // レート制限チェック
    const userRateLimit = parseRateLimitResponse(userRes)
    if (userRateLimit.isRateLimited) {
      return { success: false, message: 'github.rateLimited', rateLimitInfo: userRateLimit }
    }
    if (!userRes.ok) {
      return { success: false, message: 'github.userFetchFailed' }
    }

    // リポジトリ参照確認
    const repoRes = await fetch(`https://api.github.com/repos/${settings.repoName}`, { headers })
    if (repoRes.status === 404) {
      return { success: false, message: 'github.repoNotFound' }
    }
    // レート制限チェック
    const repoRateLimit = parseRateLimitResponse(repoRes)
    if (repoRateLimit.isRateLimited) {
      return { success: false, message: 'github.rateLimited', rateLimitInfo: repoRateLimit }
    }
    if (repoRes.status === 401) {
      return { success: false, message: 'github.noPermission' }
    }
    if (!repoRes.ok) {
      return { success: false, message: 'github.repoFetchFailed' }
    }

    return { success: true, message: 'github.connectionOk' }
  } catch (error) {
    console.error('GitHub test error:', error)
    return { success: false, message: 'github.networkError' }
  }
}
const sanitizePathPart = (raw: string): string => {
  const cleaned = raw.replace(/[\\/:*?"<>|#]/g, '-').replace(/\s+/g, ' ')
  const limited = cleaned.slice(0, 80)
  return limited.length === 0 ? 'Untitled' : limited
}

const collapseToTwoLevels = (parts: string[]): string[] => {
  if (parts.length <= 2) return parts
  const first = sanitizePathPart(parts[0])
  const second = sanitizePathPart(parts.slice(1).join('/'))
  return [first, second]
}

/**
 * アーカイブ用のPull結果
 */
export interface ArchivePullResult {
  success: boolean
  message: string
  notes: Note[]
  leaves: Leaf[]
  metadata: Metadata
  rateLimitInfo?: RateLimitInfo
}

/**
 * GitHubからアーカイブをPull（遅延ローディング用）
 *
 * Homeとは別にアーカイブのみを取得する。
 * ユーザーがArchiveビューに切り替えた時に呼び出される。
 */
export async function pullArchive(settings: Settings): Promise<ArchivePullResult> {
  const defaultMetadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }

  const validation = validateGitHubSettings(settings)
  if (!validation.valid) {
    return {
      success: false,
      message: `❌ ${validation.error}`,
      notes: [],
      leaves: [],
      metadata: defaultMetadata,
    }
  }

  const headers = {
    Authorization: `Bearer ${settings.token}`,
  }

  try {
    // リポジトリ情報を取得
    const repoRes = await fetch(`https://api.github.com/repos/${settings.repoName}`, { headers })
    if (repoRes.status === 404) {
      return {
        success: false,
        message: 'github.repoNotFound',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }
    const repoRateLimit = parseRateLimitResponse(repoRes)
    if (repoRateLimit.isRateLimited) {
      return {
        success: false,
        message: 'github.rateLimited',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
        rateLimitInfo: repoRateLimit,
      }
    }
    if (!repoRes.ok) {
      return {
        success: false,
        message: 'github.repoFetchFailed',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }

    const repoData = await repoRes.json()
    const defaultBranch = repoData.default_branch || 'main'

    // tree取得
    const treeRes = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/trees/${defaultBranch}?recursive=1`,
      { headers }
    )

    const treeRateLimit = parseRateLimitResponse(treeRes)
    if (treeRateLimit.isRateLimited) {
      return {
        success: false,
        message: 'github.rateLimited',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
        rateLimitInfo: treeRateLimit,
      }
    }
    // 空のリポジトリの場合は404または409が返る → 空のデータで成功扱い
    if (treeRes.status === 404 || treeRes.status === 409) {
      return {
        success: true,
        message: 'github.pullOk',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }
    if (!treeRes.ok) {
      return {
        success: false,
        message: 'github.treeFetchFailed',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }

    const treeData = await treeRes.json()
    const entries: { path: string; type: string }[] = treeData.tree || []

    // アーカイブパスのエントリがあるか確認
    const hasArchive = entries.some((e) => e.path.startsWith(`${ARCHIVE_PATH}/`))
    if (!hasArchive) {
      // アーカイブが存在しない場合は空を返す
      return {
        success: true,
        message: 'github.pullOk',
        notes: [],
        leaves: [],
        metadata: defaultMetadata,
      }
    }

    // アーカイブのmetadata.jsonを取得
    let metadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
    try {
      const metadataRes = await fetchGitHubContents(
        ARCHIVE_METADATA_PATH,
        settings.repoName,
        settings.token
      )
      if (metadataRes.ok) {
        const metadataData = await metadataRes.json()
        if (metadataData.content) {
          const base64 = metadataData.content.replace(/\n/g, '')
          const jsonText = decodeURIComponent(escape(atob(base64)))
          const parsed = JSON.parse(jsonText)
          metadata = {
            version: parsed.version || 1,
            notes: parsed.notes || {},
            leaves: parsed.leaves || {},
            pushCount: parsed.pushCount || 0,
          }
        }
      }
    } catch (e) {
      console.warn(`${ARCHIVE_METADATA_PATH} not found or invalid, using defaults`)
    }

    const noteMap = new Map<string, Note>()

    const collapseToTwoLevelsLocal = (parts: string[]): string[] => {
      if (parts.length <= 2) return parts.map((p) => sanitizePathPart(p))
      return [sanitizePathPart(parts[0]), sanitizePathPart(parts.slice(1).join('/'))]
    }

    const ensureNotePath = (pathParts: string[]): string => {
      const collapsed = collapseToTwoLevelsLocal(pathParts)
      let parentId: string | undefined
      for (let i = 0; i < collapsed.length; i++) {
        const partial = collapsed.slice(0, i + 1).join('/')
        if (noteMap.has(partial)) {
          parentId = noteMap.get(partial)!.id
          continue
        }
        const meta = metadata.notes[partial] || {
          id: crypto.randomUUID(),
          order: noteMap.size,
          badgeIcon: undefined,
          badgeColor: undefined,
        }
        const note: Note = {
          id: meta.id,
          name: collapsed[i],
          parentId,
          order: meta.order,
          badgeIcon: meta.badgeIcon,
          badgeColor: meta.badgeColor,
        }
        noteMap.set(partial, note)
        parentId = note.id
      }
      return parentId || ''
    }

    const basePathPrefix = `${ARCHIVE_PATH}/`
    const basePathGitkeep = `${ARCHIVE_PATH}/.gitkeep`

    // .gitkeepファイルから空ノートを復元
    const gitkeepPaths = entries.filter(
      (e) =>
        e.type === 'blob' &&
        e.path.startsWith(basePathPrefix) &&
        e.path.endsWith('.gitkeep') &&
        e.path !== basePathGitkeep
    )

    for (const entry of gitkeepPaths) {
      const relativePath = entry.path
        .replace(new RegExp(`^${ARCHIVE_PATH}/`), '')
        .replace(/\/\.gitkeep$/, '')
      const parts = collapseToTwoLevelsLocal(relativePath.split('/').filter(Boolean))
      if (parts.length === 0) continue
      ensureNotePath(parts)
    }

    // .mdファイル（リーフ）を復元
    const leafPaths = entries.filter(
      (e) =>
        e.type === 'blob' &&
        e.path.startsWith(basePathPrefix) &&
        e.path.toLowerCase().endsWith('.md') &&
        !e.path.endsWith('.gitkeep')
    )

    const leafTargets = leafPaths.map((entry, idx) => {
      const relativePath = entry.path.replace(new RegExp(`^${ARCHIVE_PATH}/`), '')
      const allParts = relativePath.split('/').filter(Boolean)
      const fileName = allParts.pop() || ''
      const noteParts = collapseToTwoLevelsLocal(allParts)
      const title = fileName.replace(/\.md$/i, '') || 'Untitled'
      const noteId = ensureNotePath(noteParts)
      const leafPathOriginal = entry.path.replace(new RegExp(`^${ARCHIVE_PATH}/`), '')
      const leafPathCollapsed = [...noteParts, fileName].join('/')
      const leafMeta = metadata.leaves[leafPathCollapsed] ||
        metadata.leaves[leafPathOriginal] || {
          id: crypto.randomUUID(),
          updatedAt: Date.now(),
          order: idx,
          badgeIcon: undefined,
          badgeColor: undefined,
        }
      return {
        entry,
        title,
        noteId,
        leafMeta,
        relativePath: leafPathCollapsed,
      }
    })

    // リーフを並列取得
    const leaves = await runWithConcurrency(
      leafTargets,
      CONTENT_FETCH_CONCURRENCY,
      async (target) => {
        const contentRes = await fetchGitHubContents(
          target.entry.path,
          settings.repoName,
          settings.token,
          { raw: true }
        )
        if (!contentRes.ok) return null
        const content = await contentRes.text()

        const leaf: Leaf = {
          id: target.leafMeta.id,
          title: target.title,
          noteId: target.noteId,
          content,
          updatedAt: target.leafMeta.updatedAt,
          order: target.leafMeta.order,
          badgeIcon: target.leafMeta.badgeIcon,
          badgeColor: target.leafMeta.badgeColor,
        }

        return leaf
      }
    )

    const sortedNotes = Array.from(noteMap.values()).sort((a, b) => a.order - b.order)
    const sortedLeaves = leaves.sort((a, b) => a.order - b.order)

    return {
      success: true,
      message: 'github.pullOk',
      notes: sortedNotes,
      leaves: sortedLeaves,
      metadata,
    }
  } catch (error) {
    console.error('GitHub archive pull error:', error)
    return {
      success: false,
      message: 'github.networkError',
      notes: [],
      leaves: [],
      metadata: defaultMetadata,
    }
  }
}
