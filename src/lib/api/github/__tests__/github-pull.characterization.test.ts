/**
 * Characterization テスト（#231 Wave B）— pull 系（pullFromGitHub / pullArchive）
 *
 * 対象:
 *   - pullFromGitHub（Home の pull・段階ロードコールバック・優先度・blob SHA キャッシュ）
 *   - pullArchive（アーカイブ pull）
 *
 * 本番コードは一切変更しない。現状の API 呼び出し列・base64 デコード・パス復元
 * （2 階層 collapse + sanitize）・戻り値（PullResult.{notes,leaves,metadata,commitSha}）・
 * 各エラー分岐を fetch モックで観測して golden master に固定する（quirky でも現状のまま pin）。
 *
 * pull の golden path シーケンス（既存リポ・リーフあり）:
 *   1. GET  /repos/{repo}                                   -> default_branch
 *   2. GET  /git/ref/heads/{branch}                         -> object.sha (commitSha)
 *   3. GET  /git/trees/{branch}?recursive=1                 -> tree エントリ一覧
 *   4. (metadata.json が tree にあれば) GET /git/blobs/{sha} -> metadata
 *   5. 各リーフ GET /contents/{path}?t=... (Accept: raw)    -> 本文
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { createFetchMock, makeSettings, b64, type FetchMock } from './fetch-mock'

// github.ts はバレル経由で stores → localStorage に触れるため、Wave A と同じく
// localStorage をスタブしてから動的 import する。
const storageBacking = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => storageBacking.get(k) ?? null,
  setItem: (k: string, v: string) => void storageBacking.set(k, v),
  removeItem: (k: string) => void storageBacking.delete(k),
  clear: () => storageBacking.clear(),
  key: (i: number) => Array.from(storageBacking.keys())[i] ?? null,
  get length() {
    return storageBacking.size
  },
}

const { pullFromGitHub, pullArchive } = await import('../../github')

let mock: FetchMock

beforeEach(() => {
  mock = createFetchMock()
  vi.stubGlobal('fetch', mock.fn)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  // 各 test 後に未消費キューが残っていないか検証（過剰ステージング検出）。
  // ステージしたものは全部消費されるはず＝意味のあるシーケンスだけ仕込んでいる証拠。
  mock.assertDrained()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const REPO = 'https://api.github.com/repos/owner/repo'
const NOTES = '.agasteer/notes'
const ARCHIVE = '.agasteer/archive'

/** URL から ?t=<ms> / ?recursive=1 を除いた比較用文字列 */
function normalize(url: string): string {
  return url.replace(/\?t=\d+/, '').replace(/\?recursive=1/, '')
}

interface TreeEntry {
  path: string
  type?: string
  sha: string
}

/** repo -> ref -> tree の 1〜3 段を仕込む共通ヘルパ（Home pull 用） */
function stageRepoRefTree(opts: {
  branch?: string
  commitSha?: string
  treeEntries?: TreeEntry[]
  truncated?: boolean
  refOk?: boolean
}) {
  const branch = opts.branch ?? 'main'
  const commitSha = opts.commitSha ?? 'pull-commit-sha'
  mock.on('GET', REPO, { json: { default_branch: branch } })
  if (opts.refOk === false) {
    mock.on('GET', `/git/ref/heads/${branch}`, { status: 404, json: {} })
  } else {
    mock.on('GET', `/git/ref/heads/${branch}`, { json: { object: { sha: commitSha } } })
  }
  mock.on('GET', `/git/trees/${branch}?recursive=1`, {
    json: {
      truncated: opts.truncated ?? false,
      tree: (opts.treeEntries ?? []).map((e) => ({
        path: e.path,
        type: e.type ?? 'blob',
        sha: e.sha,
      })),
    },
  })
  return { branch, commitSha }
}

/** tree に metadata.json blob を含めるときの blob 応答を仕込む */
function stageMetadataBlob(sha: string, metadata: unknown) {
  mock.on('GET', `/git/blobs/${sha}`, { json: { content: b64(JSON.stringify(metadata)) } })
}

/** リーフ content (raw) 応答を仕込む */
function stageLeafContent(path: string, content: string, status = 200) {
  mock.on('GET', `/contents/${path}`, status === 200 ? { text: content } : { status, json: {} })
}

// ============================================================
// pullFromGitHub: validation
// ============================================================
describe('pullFromGitHub: validation', () => {
  it('returns E-2010 before any fetch when settings invalid', async () => {
    const res = await pullFromGitHub(makeSettings({ token: '' }))
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('E-2010')
    expect(res.message).toBe('github.tokenNotSet')
    expect(res.notes).toEqual([])
    expect(res.leaves).toEqual([])
    expect(res.metadata).toEqual({ version: 1, notes: {}, leaves: {}, pushCount: 0 })
    expect(mock.calls).toHaveLength(0)
  })

  it('returns invalidRepoName when repoName has no slash', async () => {
    const res = await pullFromGitHub(makeSettings({ repoName: 'norepo' }))
    expect(res.success).toBe(false)
    expect(res.message).toBe('github.invalidRepoName')
    expect(res.errorCode).toBe('E-2010')
    expect(mock.calls).toHaveLength(0)
  })
})

// ============================================================
// pullFromGitHub: golden path（既存リポ・サブフォルダ・metadata あり）
// ============================================================
describe('pullFromGitHub: golden path', () => {
  it('walks repo->ref->tree->blob->content and returns notes/leaves/metadata/commitSha', async () => {
    const metaSha = 'meta-sha'
    const metadata = {
      version: 1,
      pushCount: 7,
      notes: { MyNote: { id: 'note-1', order: 0 } },
      leaves: { 'MyNote/MyLeaf.md': { id: 'leaf-1', updatedAt: 1234, order: 0 } },
    }
    stageRepoRefTree({
      commitSha: 'COMMIT-ABC',
      treeEntries: [
        { path: `${NOTES}/metadata.json`, sha: metaSha },
        { path: `${NOTES}/MyNote/MyLeaf.md`, sha: 'leaf-blob-sha' },
      ],
    })
    stageMetadataBlob(metaSha, metadata)
    stageLeafContent(`${NOTES}/MyNote/MyLeaf.md`, 'hello body')

    const res = await pullFromGitHub(makeSettings())

    expect(res.success).toBe(true)
    expect(res.message).toBe('github.pullOk')
    expect(res.commitSha).toBe('COMMIT-ABC')

    // メタデータが Blob API からデコードされて復元される
    expect(res.metadata.pushCount).toBe(7)
    expect(res.metadata.leaves['MyNote/MyLeaf.md']).toMatchObject({ id: 'leaf-1' })

    // ノート構造が復元される（metadata の id を引き継ぐ）
    expect(res.notes).toHaveLength(1)
    expect(res.notes[0]).toMatchObject({ id: 'note-1', name: 'MyNote', order: 0 })

    // リーフ本文が raw content から復元される（id/title/noteId/blobSha も）
    expect(res.leaves).toHaveLength(1)
    expect(res.leaves[0]).toMatchObject({
      id: 'leaf-1',
      title: 'MyLeaf',
      noteId: 'note-1',
      content: 'hello body',
      updatedAt: 1234,
      order: 0,
      blobSha: 'leaf-blob-sha',
    })
  })

  it('pins the exact API call sequence and methods', async () => {
    const metaSha = 'm'
    stageRepoRefTree({
      treeEntries: [
        { path: `${NOTES}/metadata.json`, sha: metaSha },
        { path: `${NOTES}/N/L.md`, sha: 's1' },
      ],
    })
    stageMetadataBlob(metaSha, { version: 1, notes: {}, leaves: {}, pushCount: 0 })
    stageLeafContent(`${NOTES}/N/L.md`, 'x')

    await pullFromGitHub(makeSettings())

    const seq = mock.calls.map((c) => `${c.method} ${normalize(c.url)}`)
    expect(seq).toEqual([
      'GET https://api.github.com/repos/owner/repo',
      'GET https://api.github.com/repos/owner/repo/git/ref/heads/main',
      'GET https://api.github.com/repos/owner/repo/git/trees/main',
      'GET https://api.github.com/repos/owner/repo/git/blobs/m',
      'GET https://api.github.com/repos/owner/repo/contents/.agasteer/notes/N/L.md',
    ])
  })

  it('uses Authorization Bearer header and cache:no-store on repo/ref/tree (but not the metadata blob)', async () => {
    const metaSha = 'm2'
    stageRepoRefTree({
      treeEntries: [{ path: `${NOTES}/metadata.json`, sha: metaSha }],
    })
    stageMetadataBlob(metaSha, { version: 1, notes: {}, leaves: {}, pushCount: 0 })

    await pullFromGitHub(makeSettings())

    const repoCall = mock.firstCall('GET', REPO)
    expect(repoCall!.headers.Authorization).toBe('Bearer test-token')
    expect(repoCall!.cache).toBe('no-store')
    expect(mock.firstCall('GET', '/git/ref/heads/main')!.cache).toBe('no-store')
    expect(mock.firstCall('GET', '/git/trees/main')!.cache).toBe('no-store')
    // metadata blob 取得は no-store を付けない（現状挙動）
    expect(mock.firstCall('GET', `/git/blobs/${metaSha}`)!.cache).toBeUndefined()
  })

  it('fetches leaf content via Contents API with raw Accept and cache buster (?t=)', async () => {
    stageRepoRefTree({ treeEntries: [{ path: `${NOTES}/N/L.md`, sha: 's' }] })
    stageLeafContent(`${NOTES}/N/L.md`, 'body')

    await pullFromGitHub(makeSettings())

    const contentCall = mock.firstCall('GET', `/contents/${NOTES}/N/L.md`)
    expect(contentCall).toBeDefined()
    expect(contentCall!.headers.Accept).toBe('application/vnd.github.raw')
    expect(contentCall!.headers.Authorization).toBe('Bearer test-token')
    expect(contentCall!.url).toMatch(/\?t=\d+$/)
  })

  it('restores sub-folder structure into a single collapsed note (2-level collapse)', async () => {
    // 3 階層 a/b/c のパスは a + "b/c" の 2 階層に collapse される
    stageRepoRefTree({
      treeEntries: [{ path: `${NOTES}/a/b/c/deep.md`, sha: 's' }],
    })
    stageLeafContent(`${NOTES}/a/b/c/deep.md`, 'deep')

    const res = await pullFromGitHub(makeSettings())
    expect(res.success).toBe(true)
    // ファイル名を除いた a/b/c が a + "b/c" に collapse され、さらに sanitizePathPart で
    // "/" が "-" に置換されるので 2 番目のノート名は "b-c"（現状挙動を pin）
    const names = res.notes.map((n) => n.name)
    expect(names).toContain('a')
    expect(names).toContain('b-c')
    expect(res.notes).toHaveLength(2)
    // リーフはタイトル "deep"、最も深い（collapse 後の）ノート配下
    expect(res.leaves[0].title).toBe('deep')
    const deepNote = res.notes.find((n) => n.name === 'b-c')!
    expect(res.leaves[0].noteId).toBe(deepNote.id)
  })

  it('restores empty notes from .gitkeep files (excluding the root .gitkeep)', async () => {
    stageRepoRefTree({
      treeEntries: [
        { path: `${NOTES}/.gitkeep`, sha: 'root-keep' }, // ルートは除外
        { path: `${NOTES}/EmptyNote/.gitkeep`, sha: 'keep1' },
      ],
    })

    const res = await pullFromGitHub(makeSettings())
    expect(res.success).toBe(true)
    expect(res.notes.map((n) => n.name)).toEqual(['EmptyNote'])
    expect(res.leaves).toHaveLength(0)
  })
})

// ============================================================
// pullFromGitHub: 日本語 / 絵文字の往復健全性
// ============================================================
describe('pullFromGitHub: unicode round-trip', () => {
  it('round-trips Japanese/emoji note names and leaf bodies', async () => {
    const noteName = '日本語ノート'
    const leafTitle = '絵文字😀リーフ'
    const body = 'こんにちは🌏\n二行目'
    stageRepoRefTree({
      treeEntries: [{ path: `${NOTES}/${noteName}/${leafTitle}.md`, sha: 'uni-sha' }],
    })
    stageLeafContent(`${NOTES}/${noteName}/${leafTitle}.md`, body)

    const res = await pullFromGitHub(makeSettings())
    expect(res.success).toBe(true)
    expect(res.notes[0].name).toBe(noteName)
    expect(res.leaves[0].title).toBe(leafTitle)
    expect(res.leaves[0].content).toBe(body)
  })

  it('decodes base64-encoded unicode metadata via the blob API', async () => {
    const metaSha = 'um'
    const metadata = {
      version: 1,
      pushCount: 0,
      notes: { 日本語: { id: 'jp-note', order: 0 } },
      leaves: {},
    }
    stageRepoRefTree({
      treeEntries: [
        { path: `${NOTES}/metadata.json`, sha: metaSha },
        { path: `${NOTES}/日本語/.gitkeep`, sha: 'k' },
      ],
    })
    stageMetadataBlob(metaSha, metadata)

    const res = await pullFromGitHub(makeSettings())
    expect(res.success).toBe(true)
    // metadata の id が collapse 後パスキー（日本語）で引き当てられる
    expect(res.notes.find((n) => n.name === '日本語')?.id).toBe('jp-note')
  })
})

// ============================================================
// pullFromGitHub: 段階ロードコールバック + 優先度
// ============================================================
describe('pullFromGitHub: callbacks and priority', () => {
  it('calls onStructure with sorted notes, metadata and leaf skeletons before fetching content', async () => {
    const metaSha = 'cm'
    stageRepoRefTree({
      treeEntries: [
        { path: `${NOTES}/metadata.json`, sha: metaSha },
        { path: `${NOTES}/N/A.md`, sha: 'sa' },
      ],
    })
    stageMetadataBlob(metaSha, {
      version: 1,
      pushCount: 3,
      notes: { N: { id: 'n', order: 0 } },
      leaves: { 'N/A.md': { id: 'la', updatedAt: 1, order: 0 } },
    })
    stageLeafContent(`${NOTES}/N/A.md`, 'a')

    const onStructure = vi.fn()
    await pullFromGitHub(makeSettings(), { onStructure })

    expect(onStructure).toHaveBeenCalledTimes(1)
    const [notesArg, metaArg, skeletons] = onStructure.mock.calls[0]
    expect(notesArg.map((n: any) => n.name)).toEqual(['N'])
    expect(metaArg.pushCount).toBe(3)
    expect(skeletons).toEqual([
      { id: 'la', title: 'A', noteId: 'n', order: 0, badgeIcon: undefined, badgeColor: undefined },
    ])
  })

  it('fires onLeaf for each fetched leaf and onPriorityComplete once', async () => {
    stageRepoRefTree({
      treeEntries: [
        { path: `${NOTES}/N/A.md`, sha: 'sa' },
        { path: `${NOTES}/N/B.md`, sha: 'sb' },
      ],
    })
    stageLeafContent(`${NOTES}/N/A.md`, 'a')
    stageLeafContent(`${NOTES}/N/B.md`, 'b')

    const onLeaf = vi.fn()
    const onPriorityComplete = vi.fn()
    // priority を返さない onStructure → priority1Count=0 → onPriorityComplete が即発火
    await pullFromGitHub(makeSettings(), { onLeaf, onPriorityComplete })

    expect(onLeaf).toHaveBeenCalledTimes(2)
    expect(onPriorityComplete).toHaveBeenCalledTimes(1)
  })

  it('loads priority-1 leaves first when onStructure returns leafPaths', async () => {
    stageRepoRefTree({
      treeEntries: [
        { path: `${NOTES}/N/A.md`, sha: 'sa' },
        { path: `${NOTES}/N/B.md`, sha: 'sb' },
        { path: `${NOTES}/N/Z.md`, sha: 'sz' },
      ],
    })
    stageLeafContent(`${NOTES}/N/A.md`, 'a')
    stageLeafContent(`${NOTES}/N/B.md`, 'b')
    stageLeafContent(`${NOTES}/N/Z.md`, 'z')

    let priorityCompleteAtCall = -1
    const onPriorityComplete = vi.fn(() => {
      // onPriorityComplete が発火した時点で取得済みの content 件数を記録
      priorityCompleteAtCall = mock.callsMatching('GET', `/contents/${NOTES}/`).length
    })
    // Z を第1優先に指定
    const res = await pullFromGitHub(makeSettings(), {
      onStructure: () => ({ leafPaths: ['N/Z.md'], noteIds: [] }),
      onPriorityComplete,
    })

    expect(res.success).toBe(true)
    expect(onPriorityComplete).toHaveBeenCalledTimes(1)
    // 第1優先 Z は最初に content fetch される（onPriorityComplete 発火時点で >=1 件取得済み）
    expect(priorityCompleteAtCall).toBeGreaterThanOrEqual(1)
    // 取得列の先頭が優先リーフ Z
    const firstContent = mock.callsMatching('GET', `/contents/${NOTES}/`)[0]
    expect(normalize(firstContent.url)).toContain('/N/Z.md')
  })
})

// ============================================================
// pullFromGitHub: blob SHA キャッシュ
// ============================================================
describe('pullFromGitHub: blob sha cache', () => {
  it('reuses cached leaf content (skips the contents fetch) when the blob sha matches', async () => {
    stageRepoRefTree({
      treeEntries: [{ path: `${NOTES}/N/Cached.md`, sha: 'cached-sha' }],
    })
    // content fetch は一切ステージしない → キャッシュヒットで fetch されないことを証明

    const cachedLeaves = new Map([
      [
        'cached-sha',
        {
          id: 'old-id',
          title: 'old',
          noteId: 'old',
          content: 'CACHED CONTENT',
          updatedAt: 0,
          order: 0,
        } as any,
      ],
    ])
    const onLeaf = vi.fn()
    const res = await pullFromGitHub(makeSettings(), { cachedLeaves, onLeaf })

    expect(res.success).toBe(true)
    // content は contents API ではなくキャッシュから来る
    expect(res.leaves[0].content).toBe('CACHED CONTENT')
    // ただし id/title/noteId は tree 由来（新規 UUID/title）で上書きされる
    expect(res.leaves[0].title).toBe('Cached')
    expect(res.leaves[0].blobSha).toBe('cached-sha')
    // contents API は呼ばれていない
    expect(mock.callsMatching('GET', '/contents/')).toHaveLength(0)
    expect(onLeaf).toHaveBeenCalledTimes(1)
  })
})

// ============================================================
// pullFromGitHub: 空リポジトリ / 404・409
// ============================================================
describe('pullFromGitHub: empty repo / tree not found', () => {
  it('treats tree 409 (empty repo) as success with empty data and fires callbacks', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { status: 404, json: {} }) // 空リポは ref 無し
      .on('GET', '/git/trees/main?recursive=1', { status: 409, json: {} })

    const onStructure = vi.fn()
    const onPriorityComplete = vi.fn()
    const res = await pullFromGitHub(makeSettings(), { onStructure, onPriorityComplete })

    expect(res.success).toBe(true)
    expect(res.message).toBe('github.pullOk')
    expect(res.notes).toEqual([])
    expect(res.leaves).toEqual([])
    expect(res.commitSha).toBeUndefined()
    // 空でも UI 遷移用コールバックは呼ばれる
    expect(onStructure).toHaveBeenCalledWith([], expect.any(Object), [])
    expect(onPriorityComplete).toHaveBeenCalledTimes(1)
  })

  it('treats tree 404 as the same empty-success branch', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { json: { object: { sha: 's' } } })
      .on('GET', '/git/trees/main?recursive=1', { status: 404, json: {} })
    const res = await pullFromGitHub(makeSettings())
    expect(res.success).toBe(true)
    expect(res.message).toBe('github.pullOk')
  })
})

// ============================================================
// pullFromGitHub: error / rate-limit branches
// ============================================================
describe('pullFromGitHub: error branches', () => {
  it('returns repoNotFound E-2001 on repo 404', async () => {
    mock.on('GET', REPO, { status: 404, json: {} })
    const res = await pullFromGitHub(makeSettings())
    expect(res.success).toBe(false)
    expect(res.message).toBe('github.repoNotFound')
    expect(res.errorCode).toBe('E-2001')
    expect(res.httpStatus).toBe(404)
  })

  it('returns rateLimited E-2002 when the repo fetch is rate limited (403 remaining 0)', async () => {
    mock.on('GET', REPO, {
      status: 403,
      json: {},
      headers: { 'X-RateLimit-Remaining': '0' },
    })
    const res = await pullFromGitHub(makeSettings())
    expect(res.message).toBe('github.rateLimited')
    expect(res.errorCode).toBe('E-2002')
    expect(res.rateLimitInfo?.isRateLimited).toBe(true)
    expect(res.httpStatus).toBe(403)
  })

  it('returns noPermission E-2003 on repo 401', async () => {
    mock.on('GET', REPO, { status: 401, json: {} })
    const res = await pullFromGitHub(makeSettings())
    expect(res.message).toBe('github.noPermission')
    expect(res.errorCode).toBe('E-2003')
  })

  it('returns repoFetchFailed E-2004 on a non-ok, non-rate-limited repo response', async () => {
    mock.on('GET', REPO, {
      status: 500,
      json: {},
      headers: { 'X-RateLimit-Remaining': '50' },
    })
    const res = await pullFromGitHub(makeSettings())
    expect(res.message).toBe('github.repoFetchFailed')
    expect(res.errorCode).toBe('E-2004')
  })

  it('returns rateLimited E-2005 when the tree fetch is rate limited', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { json: { object: { sha: 's' } } })
      .on('GET', '/git/trees/main?recursive=1', {
        status: 403,
        json: {},
        headers: { 'X-RateLimit-Remaining': '0' },
      })
    const res = await pullFromGitHub(makeSettings())
    expect(res.message).toBe('github.rateLimited')
    expect(res.errorCode).toBe('E-2005')
  })

  it('returns treeFetchFailed E-2006 on a non-ok tree response (not 404/409)', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { json: { object: { sha: 's' } } })
      .on('GET', '/git/trees/main?recursive=1', { status: 500, json: {} })
    const res = await pullFromGitHub(makeSettings())
    expect(res.message).toBe('github.treeFetchFailed')
    expect(res.errorCode).toBe('E-2006')
  })

  it('returns treeTruncated E-2007 when the tree is truncated', async () => {
    stageRepoRefTree({ treeEntries: [], truncated: true })
    const res = await pullFromGitHub(makeSettings())
    expect(res.message).toBe('github.treeTruncated')
    expect(res.errorCode).toBe('E-2007')
  })

  it('returns pullIncomplete E-2008 when a leaf content fetch fails (partial failure)', async () => {
    stageRepoRefTree({
      treeEntries: [
        { path: `${NOTES}/N/Ok.md`, sha: 'ok' },
        { path: `${NOTES}/N/Bad.md`, sha: 'bad' },
      ],
    })
    stageLeafContent(`${NOTES}/N/Ok.md`, 'ok')
    stageLeafContent(`${NOTES}/N/Bad.md`, '', 500) // 失敗

    const res = await pullFromGitHub(makeSettings())
    expect(res.success).toBe(false)
    expect(res.message).toBe('github.pullIncomplete')
    expect(res.errorCode).toBe('E-2008')
    // 部分失敗は notes/leaves を空に潰す（不完全 push 防止）
    expect(res.notes).toEqual([])
    expect(res.leaves).toEqual([])
  })

  it('returns networkError E-2009 when a fetch throws mid-sequence', async () => {
    // repo は ok、ref を仕込まない → throw → catch で E-2009
    mock.on('GET', REPO, { json: { default_branch: 'main' } })
    const res = await pullFromGitHub(makeSettings())
    expect(res.message).toBe('github.networkError')
    expect(res.errorCode).toBe('E-2009')
    // throw を消費し残しでない（ref/tree はキューしていない）
    expect(mock.pendingCount()).toBe(0)
  })

  it('falls back to default metadata when the metadata blob is invalid JSON (warns, still ok)', async () => {
    const metaSha = 'bad-meta'
    stageRepoRefTree({
      treeEntries: [
        { path: `${NOTES}/metadata.json`, sha: metaSha },
        { path: `${NOTES}/N/L.md`, sha: 's' },
      ],
    })
    mock.on('GET', `/git/blobs/${metaSha}`, { json: { content: b64('not json{{{') } })
    stageLeafContent(`${NOTES}/N/L.md`, 'body')

    const res = await pullFromGitHub(makeSettings())
    expect(res.success).toBe(true)
    // 不正 metadata は default（pushCount 0・新規 UUID）にフォールバック
    expect(res.metadata.pushCount).toBe(0)
    expect(res.leaves[0].content).toBe('body')
  })
})

// ============================================================
// pullArchive
// ============================================================
function stageArchiveRepoTree(opts: {
  branch?: string
  treeEntries?: TreeEntry[]
  truncated?: boolean
}) {
  const branch = opts.branch ?? 'main'
  mock.on('GET', REPO, { json: { default_branch: branch } })
  mock.on('GET', `/git/trees/${branch}?recursive=1`, {
    json: {
      truncated: opts.truncated ?? false,
      tree: (opts.treeEntries ?? []).map((e) => ({
        path: e.path,
        type: e.type ?? 'blob',
        sha: e.sha,
      })),
    },
  })
}

describe('pullArchive: validation and golden path', () => {
  it('returns E-4001 before any fetch when settings invalid', async () => {
    const res = await pullArchive(makeSettings({ token: '' }))
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('E-4001')
    expect(mock.calls).toHaveLength(0)
  })

  it('does NOT fetch a ref (archive pull skips the HEAD sha step)', async () => {
    stageArchiveRepoTree({ treeEntries: [{ path: `${ARCHIVE}/N/L.md`, sha: 's' }] })
    stageLeafContent(`${ARCHIVE}/N/L.md`, 'archived')
    await pullArchive(makeSettings())
    // pull (Home) と違い ref は呼ばない
    expect(mock.callsMatching('GET', '/git/ref/heads/')).toHaveLength(0)
    const seq = mock.calls.map((c) => `${c.method} ${normalize(c.url)}`)
    expect(seq).toEqual([
      'GET https://api.github.com/repos/owner/repo',
      'GET https://api.github.com/repos/owner/repo/git/trees/main',
      'GET https://api.github.com/repos/owner/repo/contents/.agasteer/archive/N/L.md',
    ])
  })

  it('restores archive notes/leaves/metadata and fires onLeafFetched', async () => {
    const metaSha = 'am'
    stageArchiveRepoTree({
      treeEntries: [
        { path: `${ARCHIVE}/metadata.json`, sha: metaSha },
        { path: `${ARCHIVE}/Old/Note.md`, sha: 'leaf-sha' },
      ],
    })
    stageMetadataBlob(metaSha, {
      version: 1,
      pushCount: 9,
      notes: { Old: { id: 'old-note', order: 0 } },
      leaves: { 'Old/Note.md': { id: 'old-leaf', updatedAt: 5, order: 0 } },
    })
    stageLeafContent(`${ARCHIVE}/Old/Note.md`, 'archived body')

    const onLeafFetched = vi.fn()
    const res = await pullArchive(makeSettings(), { onLeafFetched })

    expect(res.success).toBe(true)
    expect(res.message).toBe('github.pullOk')
    expect(res.metadata.pushCount).toBe(9)
    expect(res.notes[0]).toMatchObject({ id: 'old-note', name: 'Old' })
    expect(res.leaves[0]).toMatchObject({
      id: 'old-leaf',
      title: 'Note',
      content: 'archived body',
      blobSha: 'leaf-sha',
    })
    expect(onLeafFetched).toHaveBeenCalledTimes(1)
  })

  it('returns empty-success when the tree has no archive entries at all', async () => {
    stageArchiveRepoTree({
      treeEntries: [{ path: `${NOTES}/N/L.md`, sha: 's' }], // notes だけ・archive 無し
    })
    const res = await pullArchive(makeSettings())
    expect(res.success).toBe(true)
    expect(res.message).toBe('github.pullOk')
    expect(res.notes).toEqual([])
    expect(res.leaves).toEqual([])
  })

  it('treats tree 409 (empty repo) as empty-success', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/trees/main?recursive=1', { status: 409, json: {} })
    const res = await pullArchive(makeSettings())
    expect(res.success).toBe(true)
    expect(res.message).toBe('github.pullOk')
  })

  it('reuses cached archive leaf content (skips contents fetch) on blob sha match', async () => {
    stageArchiveRepoTree({
      treeEntries: [{ path: `${ARCHIVE}/N/C.md`, sha: 'arch-cached' }],
    })
    const cachedLeaves = new Map([
      [
        'arch-cached',
        { id: 'x', title: 'x', noteId: 'x', content: 'ARCH CACHED', updatedAt: 0, order: 0 } as any,
      ],
    ])
    const res = await pullArchive(makeSettings(), { cachedLeaves })
    expect(res.success).toBe(true)
    expect(res.leaves[0].content).toBe('ARCH CACHED')
    expect(mock.callsMatching('GET', '/contents/')).toHaveLength(0)
  })
})

describe('pullArchive: error branches', () => {
  it('returns repoNotFound E-4002 on repo 404', async () => {
    mock.on('GET', REPO, { status: 404, json: {} })
    const res = await pullArchive(makeSettings())
    expect(res.message).toBe('github.repoNotFound')
    expect(res.errorCode).toBe('E-4002')
  })

  it('returns rateLimited E-4003 when the repo fetch is rate limited', async () => {
    mock.on('GET', REPO, { status: 403, json: {}, headers: { 'X-RateLimit-Remaining': '0' } })
    const res = await pullArchive(makeSettings())
    expect(res.message).toBe('github.rateLimited')
    expect(res.errorCode).toBe('E-4003')
  })

  it('returns repoFetchFailed E-4004 on a non-ok repo response', async () => {
    mock.on('GET', REPO, { status: 500, json: {}, headers: { 'X-RateLimit-Remaining': '50' } })
    const res = await pullArchive(makeSettings())
    expect(res.message).toBe('github.repoFetchFailed')
    expect(res.errorCode).toBe('E-4004')
  })

  it('returns rateLimited E-4005 when the tree fetch is rate limited', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/trees/main?recursive=1', {
        status: 403,
        json: {},
        headers: { 'X-RateLimit-Remaining': '0' },
      })
    const res = await pullArchive(makeSettings())
    expect(res.message).toBe('github.rateLimited')
    expect(res.errorCode).toBe('E-4005')
  })

  it('returns treeFetchFailed E-4006 on a non-ok tree response', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/trees/main?recursive=1', { status: 500, json: {} })
    const res = await pullArchive(makeSettings())
    expect(res.message).toBe('github.treeFetchFailed')
    expect(res.errorCode).toBe('E-4006')
  })

  it('returns treeTruncated E-4007 when the tree is truncated', async () => {
    stageArchiveRepoTree({ treeEntries: [], truncated: true })
    const res = await pullArchive(makeSettings())
    expect(res.message).toBe('github.treeTruncated')
    expect(res.errorCode).toBe('E-4007')
  })

  it('returns pullIncomplete E-4008 when an archive leaf content fetch fails', async () => {
    stageArchiveRepoTree({
      treeEntries: [
        { path: `${ARCHIVE}/N/Ok.md`, sha: 'ok' },
        { path: `${ARCHIVE}/N/Bad.md`, sha: 'bad' },
      ],
    })
    stageLeafContent(`${ARCHIVE}/N/Ok.md`, 'ok')
    stageLeafContent(`${ARCHIVE}/N/Bad.md`, '', 500)
    const res = await pullArchive(makeSettings())
    expect(res.success).toBe(false)
    expect(res.message).toBe('github.pullIncomplete')
    expect(res.errorCode).toBe('E-4008')
  })

  it('returns networkError E-4009 when a fetch throws mid-sequence', async () => {
    // repo は ok、tree を仕込まない → throw → catch で E-4009
    mock.on('GET', REPO, { json: { default_branch: 'main' } })
    const res = await pullArchive(makeSettings())
    expect(res.message).toBe('github.networkError')
    expect(res.errorCode).toBe('E-4009')
  })
})
