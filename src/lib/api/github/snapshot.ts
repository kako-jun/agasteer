/**
 * 指定コミットのノート・リーフを読み出す（競合時の3方向マージ用・#321）
 *
 * 通常の Pull はブランチ名で tree を読み、本文を Contents API で取るため、読んでいる間に
 * リモートが進むと別コミットの内容が混ざり得る。競合の比較では「共通の基準（最後に
 * 同期したコミット）」と「リモート HEAD」を正確に比べたいので、ここではコミット SHA を
 * 起点に commit → tree → metadata.json → 本文 blob をすべて SHA 指定で読む
 * （SHA 指定の内容は変わらない）。
 *
 * ストアや IndexedDB には一切触れない（読み出し専用）。
 */

import type { Leaf, Metadata, Note, Settings } from '../../types'
import { NOTES_PATH, NOTES_METADATA_PATH, ARCHIVE_PATH, ARCHIVE_METADATA_PATH } from './paths'
import { parseRateLimitResponse } from './rate-limit'
import { decodeBase64ToString } from './encoding'
import { normalizePulledMetadata } from './metadata'
import { runWithConcurrency, validateGitHubSettings } from './http'
import { buildLeafFromTarget, buildWorldStructure, type TreeEntry } from './pull-map'

const BLOB_FETCH_CONCURRENCY = 10

export interface WorldData {
  notes: Note[]
  leaves: Leaf[]
  metadata: Metadata
}

export type CommitSnapshotErrorReason =
  /** コミットが見つからない（履歴が書き換えられた等） */
  | 'notFound'
  /** tree が大きすぎて一度に読めない */
  | 'truncated'
  /** metadata.json が壊れている */
  | 'metadataInvalid'
  | 'rateLimited'
  /** options.signal で打ち切られた（比較の時間上限） */
  | 'timeout'
  /** 通信失敗・その他の HTTP エラー */
  | 'network'

export type CommitSnapshotResult =
  | {
      status: 'success'
      commitSha: string
      home: WorldData
      /** includeArchive=false のときは undefined */
      archive?: WorldData
      /**
       * metadata.json に ID が無いノート/リーフがあった（アプリ外で追加されたファイル等）。
       * そのノート/リーフの ID は読むたびに変わるため、別コミットとの対応づけに使えない。
       */
      hasUntrackedEntries: boolean
    }
  | { status: 'error'; reason: CommitSnapshotErrorReason; httpStatus?: number }

export interface FetchCommitSnapshotOptions {
  includeArchive: boolean
  /**
   * blob SHA → 本文。手元で分かっている本文（ローカルの本文から計算した SHA）を渡すと
   * 取得を省く。取得した本文もここに書き足すので、同じ Map を複数のコミットで共有すると
   * 同じ blob を2回取らない。
   */
  contentCache: Map<string, string>
  /** 打ち切り用（比較の時間上限）。abort されたら `timeout` を返す */
  signal?: AbortSignal
}

class SnapshotFetchError extends Error {
  constructor(
    readonly reason: CommitSnapshotErrorReason,
    readonly httpStatus?: number
  ) {
    super(reason)
  }
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers, signal })
  if (parseRateLimitResponse(res).isRateLimited) {
    throw new SnapshotFetchError('rateLimited', res.status)
  }
  if (res.status === 404 || res.status === 422) {
    throw new SnapshotFetchError('notFound', res.status)
  }
  if (!res.ok) throw new SnapshotFetchError('network', res.status)
  return (await res.json()) as Record<string, unknown>
}

/**
 * コミット SHA を指定して、そのコミット時点のノート・リーフを読み出す。
 */
export async function fetchCommitSnapshot(
  settings: Settings,
  commitSha: string,
  options: FetchCommitSnapshotOptions
): Promise<CommitSnapshotResult> {
  if (!validateGitHubSettings(settings).valid) {
    return { status: 'error', reason: 'network' }
  }
  const headers = { Authorization: `Bearer ${settings.token}` }
  const api = `https://api.github.com/repos/${settings.repoName}/git`
  const cache = options.contentCache

  const fetchBlobText = async (sha: string): Promise<string> => {
    const cached = cache.get(sha)
    if (cached !== undefined) return cached
    const data = await getJson(`${api}/blobs/${sha}`, headers, options.signal)
    const text = decodeBase64ToString(String(data.content ?? ''))
    cache.set(sha, text)
    return text
  }

  try {
    const commit = await getJson(`${api}/commits/${commitSha}`, headers, options.signal)
    const treeSha = (commit.tree as { sha?: string } | undefined)?.sha
    if (!treeSha) throw new SnapshotFetchError('notFound')
    const tree = await getJson(`${api}/trees/${treeSha}?recursive=1`, headers, options.signal)
    if (tree.truncated) throw new SnapshotFetchError('truncated')
    const entries = (tree.tree as TreeEntry[] | undefined) ?? []

    let hasUntrackedEntries = false
    const markUntracked = () => {
      hasUntrackedEntries = true
      return crypto.randomUUID()
    }

    const readWorld = async (basePath: string, metadataPath: string): Promise<WorldData> => {
      let metadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
      const metadataEntry = entries.find((e) => e.type === 'blob' && e.path === metadataPath)
      if (metadataEntry) {
        try {
          metadata = normalizePulledMetadata(JSON.parse(await fetchBlobText(metadataEntry.sha)))
        } catch (e) {
          if (e instanceof SnapshotFetchError) throw e
          throw new SnapshotFetchError('metadataInvalid')
        }
      }
      const { notes, leafTargets } = buildWorldStructure({
        entries,
        basePath,
        metadata,
        idGenerator: markUntracked,
      })
      const leaves = await runWithConcurrency(leafTargets, BLOB_FETCH_CONCURRENCY, async (t) =>
        buildLeafFromTarget(t, await fetchBlobText(t.entry.sha), t.entry.sha)
      )
      leaves.sort((a, b) => a.order - b.order)
      return { notes, leaves, metadata }
    }

    const home = await readWorld(NOTES_PATH, NOTES_METADATA_PATH)
    const archive = options.includeArchive
      ? await readWorld(ARCHIVE_PATH, ARCHIVE_METADATA_PATH)
      : undefined
    return { status: 'success', commitSha, home, archive, hasUntrackedEntries }
  } catch (e) {
    if (options.signal?.aborted) return { status: 'error', reason: 'timeout' }
    if (e instanceof SnapshotFetchError) {
      return { status: 'error', reason: e.reason, httpStatus: e.httpStatus }
    }
    console.error('fetchCommitSnapshot failed:', e)
    return { status: 'error', reason: 'network' }
  }
}
