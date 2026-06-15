/**
 * Characterization テスト（#231 Wave A）— pushAllWithTreeAPI
 *
 * 対象: pushAllWithTreeAPI（blob/tree/commit/ref の GitHub Git Data API シーケンス）
 *
 * 本番コードは変更しない。現状の API 呼び出し列・リクエストボディ・差分判定・
 * 各エラー分岐を fetch モックで観測して golden master に固定する。
 *
 * シーケンス（既存リポ・変更ありの golden path）:
 *   1. GET  /repos/{repo}                      -> default_branch
 *   2. GET  /git/ref/heads/{branch}            -> object.sha (HEAD commit)
 *   3. GET  /git/commits/{sha}                 -> tree.sha (base tree)
 *   4. GET  /git/trees/{baseTreeSha}?recursive=1 -> 既存ファイル一覧
 *   5. (既存 metadata.json があれば) GET /git/blobs/{sha} -> pushCount
 *   6. POST /git/trees                         -> 新 tree sha
 *   7. POST /git/commits                       -> 新 commit sha
 *   8. PATCH /git/refs/heads/{branch}          -> ref 更新
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import {
  createFetchMock,
  makeSettings,
  makeNote,
  makeLeaf,
  b64,
  type FetchMock,
} from './fetch-mock'

// localStorage スタブ → 動的 import（github-status 側と同じ理由）
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

const { pushAllWithTreeAPI } = await import('../../github')
const { calculateGitBlobSha } = await import('../sha')

let mock: FetchMock

beforeEach(() => {
  mock = createFetchMock()
  vi.stubGlobal('fetch', mock.fn)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const REPO = 'https://api.github.com/repos/owner/repo'

/** 既存リポの 1〜4 段（repo/ref/commit/tree）を仕込む共通ヘルパ */
function stageExistingRepo(opts: {
  branch?: string
  headSha?: string
  baseTreeSha?: string
  treeEntries?: Array<{ path: string; mode?: string; type?: string; sha: string }>
  truncated?: boolean
}) {
  const branch = opts.branch ?? 'main'
  const headSha = opts.headSha ?? 'head-commit-sha'
  const baseTreeSha = opts.baseTreeSha ?? 'base-tree-sha'
  mock
    .on('GET', REPO, { json: { default_branch: branch } })
    .on('GET', `/git/ref/heads/${branch}`, { json: { object: { sha: headSha } } })
    .on('GET', `/git/commits/${headSha}`, { json: { tree: { sha: baseTreeSha } } })
    .on('GET', `/git/trees/${baseTreeSha}?recursive=1`, {
      json: {
        truncated: opts.truncated ?? false,
        tree: (opts.treeEntries ?? []).map((e) => ({
          path: e.path,
          mode: e.mode ?? '100644',
          type: e.type ?? 'blob',
          sha: e.sha,
        })),
      },
    })
  return { branch, headSha, baseTreeSha }
}

/** 6〜8 段（new tree / new commit / patch ref）を仕込む共通ヘルパ */
function stageWriteSequence(opts: { branch?: string; newTreeSha?: string; newCommitSha?: string }) {
  const branch = opts.branch ?? 'main'
  mock
    .on('POST', '/git/trees', { json: { sha: opts.newTreeSha ?? 'new-tree-sha' } })
    .on('POST', '/git/commits', { json: { sha: opts.newCommitSha ?? 'new-commit-sha' } })
    .on('PATCH', `/git/refs/heads/${branch}`, { json: { ref: `refs/heads/${branch}` } })
}

const notes = [makeNote({ id: 'note-1', name: 'MyNote' })]
const leaf = makeLeaf({ id: 'leaf-1', noteId: 'note-1', title: 'MyLeaf', content: 'fresh content' })

// ============================================
// バリデーション
// ============================================
describe('pushAllWithTreeAPI: validation', () => {
  it('returns E-1018 before any fetch when settings invalid', async () => {
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings({ token: '' }))
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('E-1018')
    expect(mock.calls).toHaveLength(0)
  })
})

// ============================================
// golden path（既存リポ・初回 push 相当＝metadata 無し・リーフ新規）
// ============================================
describe('pushAllWithTreeAPI: golden path (existing repo, changed leaf)', () => {
  it('walks repo->ref->commit->tree then POST tree, POST commit, PATCH ref', async () => {
    stageExistingRepo({ treeEntries: [] }) // 空 tree = metadata 無し = 初回相当
    stageWriteSequence({ newCommitSha: 'commit-XYZ' })

    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())

    expect(res.success).toBe(true)
    expect(res.message).toBe('github.pushOk')
    expect(res.commitSha).toBe('commit-XYZ')
    expect(res.changedLeafCount).toBe(1)
    expect(res.changedArchiveLeafCount).toBe(0)
    expect(res.metadataOnlyChanged).toBe(false)

    // 呼び出し列の順序と method を pin
    const seq = mock.calls.map((c) => `${c.method} ${c.url.replace(/\?t=\d+/, '')}`)
    expect(seq).toEqual([
      'GET https://api.github.com/repos/owner/repo',
      'GET https://api.github.com/repos/owner/repo/git/ref/heads/main',
      'GET https://api.github.com/repos/owner/repo/git/commits/head-commit-sha',
      'GET https://api.github.com/repos/owner/repo/git/trees/base-tree-sha?recursive=1',
      'POST https://api.github.com/repos/owner/repo/git/trees',
      'POST https://api.github.com/repos/owner/repo/git/commits',
      'PATCH https://api.github.com/repos/owner/repo/git/refs/heads/main',
    ])
  })

  it('sends Authorization: Bearer <token> and JSON content-type on the repo fetch', async () => {
    stageExistingRepo({ treeEntries: [] })
    stageWriteSequence({})
    await pushAllWithTreeAPI([leaf], notes, makeSettings())
    const repoCall = mock.firstCall('GET', REPO)
    expect(repoCall!.headers.Authorization).toBe('Bearer test-token')
    expect(repoCall!.headers['Content-Type']).toBe('application/json')
    // ref/commit/tree は cache: no-store でないものもあるが repo と ref は no-store
    expect(repoCall!.cache).toBe('no-store')
    expect(mock.firstCall('GET', '/git/ref/heads/main')!.cache).toBe('no-store')
  })

  it('POST /git/trees includes leaf content as a blob entry (no base_tree)', async () => {
    stageExistingRepo({ treeEntries: [] })
    stageWriteSequence({})
    await pushAllWithTreeAPI([leaf], notes, makeSettings())

    const treeCall = mock.firstCall('POST', '/git/trees')
    expect(treeCall).toBeDefined()
    // base_tree は使わない（全ファイル明示）
    expect('base_tree' in treeCall!.body).toBe(false)
    const items: any[] = treeCall!.body.tree
    const leafItem = items.find((i) => i.path === '.agasteer/notes/MyNote/MyLeaf.md')
    expect(leafItem).toMatchObject({
      path: '.agasteer/notes/MyNote/MyLeaf.md',
      mode: '100644',
      type: 'blob',
      content: 'fresh content',
    })
    // metadata.json も tree に含まれ、pushCount は 0->1 にインクリメントされる
    const metaItem = items.find((i) => i.path === '.agasteer/notes/metadata.json')
    expect(metaItem).toBeDefined()
    const writtenMeta = JSON.parse(metaItem.content)
    expect(writtenMeta.pushCount).toBe(1)
    expect(writtenMeta.leaves['MyNote/MyLeaf.md']).toMatchObject({ id: 'leaf-1', order: 0 })
    expect(writtenMeta.notes['MyNote']).toMatchObject({ id: 'note-1', order: 0 })
    // ノートとルートの .gitkeep が含まれる
    expect(items.some((i) => i.path === '.agasteer/notes/.gitkeep')).toBe(true)
    expect(items.some((i) => i.path === '.agasteer/notes/MyNote/.gitkeep')).toBe(true)
  })

  it('POST /git/commits has parents=[HEAD sha], the new tree sha and the agasteer author/committer', async () => {
    stageExistingRepo({ headSha: 'head-commit-sha', treeEntries: [] })
    stageWriteSequence({ newTreeSha: 'tree-NEW' })
    await pushAllWithTreeAPI([leaf], notes, makeSettings())

    const commitCall = mock.firstCall('POST', '/git/commits')
    expect(commitCall!.body.tree).toBe('tree-NEW')
    expect(commitCall!.body.parents).toEqual(['head-commit-sha'])
    expect(commitCall!.body.message).toBe('Agasteer pushed notes')
    expect(commitCall!.body.author).toEqual({
      name: 'agasteer',
      email: 'agasteer@users.noreply.github.com',
    })
    expect(commitCall!.body.committer).toEqual({
      name: 'agasteer',
      email: 'agasteer@users.noreply.github.com',
    })
  })

  it('PATCH ref uses the new commit sha with force:true', async () => {
    stageExistingRepo({ treeEntries: [] })
    stageWriteSequence({ newCommitSha: 'commit-NEW' })
    await pushAllWithTreeAPI([leaf], notes, makeSettings())

    const patchCall = mock.firstCall('PATCH', '/git/refs/heads/main')
    expect(patchCall!.body).toEqual({ sha: 'commit-NEW', force: true })
  })

  it('respects a non-default branch name across ref, commit-parent and patch', async () => {
    stageExistingRepo({ branch: 'develop', treeEntries: [] })
    stageWriteSequence({ branch: 'develop' })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.success).toBe(true)
    expect(mock.firstCall('GET', '/git/ref/heads/develop')).toBeDefined()
    expect(mock.firstCall('PATCH', '/git/refs/heads/develop')).toBeDefined()
  })
})

// ============================================
// 差分判定（変更なし → early return / push スキップ）
// ============================================
describe('pushAllWithTreeAPI: no-change short circuit', () => {
  it('returns github.noChanges and skips tree/commit/ref when nothing changed', async () => {
    // 既存 tree に、同じ content のリーフ blob と一致する metadata.json を仕込む
    const leafPath = '.agasteer/notes/MyNote/MyLeaf.md'
    const leafSha = await calculateGitBlobSha('fresh content')
    // 既存 metadata はこのリーフ/ノートを既に含む（差分ゼロにするため）
    const existingMeta = {
      version: 1,
      pushCount: 5,
      notes: { MyNote: { id: 'note-1', order: 0 } },
      leaves: { 'MyNote/MyLeaf.md': { id: 'leaf-1', updatedAt: 1000, order: 0 } },
    }
    const metaSha = 'meta-blob-sha'
    stageExistingRepo({
      treeEntries: [
        { path: leafPath, sha: leafSha },
        { path: '.agasteer/notes/metadata.json', sha: metaSha },
      ],
    })
    // metadata.json の blob 取得
    mock.on('GET', `/git/blobs/${metaSha}`, {
      json: { content: b64(JSON.stringify(existingMeta)) },
    })

    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())

    expect(res.success).toBe(true)
    expect(res.message).toBe('github.noChanges')
    expect(res.commitSha).toBe('head-commit-sha')
    // write 系は一切呼ばれない
    expect(mock.callsMatching('POST', '/git/trees')).toHaveLength(0)
    expect(mock.callsMatching('POST', '/git/commits')).toHaveLength(0)
    expect(mock.callsMatching('PATCH', '/git/refs/heads/main')).toHaveLength(0)
  })

  it('reuses the existing blob sha (does not resend content) for an unchanged leaf when metadata differs', async () => {
    // リーフ content は不変だが metadata 差分（pushCount 以外）を作って push を発火させる
    const leafPath = '.agasteer/notes/MyNote/MyLeaf.md'
    const leafSha = await calculateGitBlobSha('fresh content')
    // 既存 metadata はリーフ未登録 → metadata 差分が出る
    const existingMeta = { version: 1, pushCount: 2, notes: {}, leaves: {} }
    const metaSha = 'meta-blob-sha2'
    stageExistingRepo({
      treeEntries: [
        { path: leafPath, sha: leafSha },
        { path: '.agasteer/notes/metadata.json', sha: metaSha },
      ],
    })
    mock.on('GET', `/git/blobs/${metaSha}`, {
      json: { content: b64(JSON.stringify(existingMeta)) },
    })
    stageWriteSequence({})

    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.success).toBe(true)
    // リーフ自体は変更なし扱い → changedLeafCount 0、metadataOnlyChanged true
    expect(res.changedLeafCount).toBe(0)
    expect(res.metadataOnlyChanged).toBe(true)

    const treeCall = mock.firstCall('POST', '/git/trees')
    const items: any[] = treeCall!.body.tree
    const leafItem = items.find((i) => i.path === leafPath)
    // content ではなく既存 sha を使う
    expect(leafItem.sha).toBe(leafSha)
    expect('content' in leafItem).toBe(false)
    // pushCount は existing(2) + 1 = 3
    const metaItem = items.find((i) => i.path === '.agasteer/notes/metadata.json')
    expect(JSON.parse(metaItem.content).pushCount).toBe(3)
  })
})

// ============================================
// 空リポジトリ / 初回 push（ref 404|409）
// ============================================
describe('pushAllWithTreeAPI: empty repository', () => {
  it('initializes via Contents .gitkeep then writes a commit with empty parents', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { status: 409, json: {} })
      // Contents PUT .gitkeep -> commit + tree sha
      .on('PUT', '/contents/.gitkeep', {
        json: { commit: { sha: 'init-commit-sha', tree: { sha: 'init-tree-sha' } } },
      })
      // 既存 tree 取得（init-tree-sha） -> 空
      .on('GET', '/git/trees/init-tree-sha?recursive=1', { json: { truncated: false, tree: [] } })
    stageWriteSequence({})

    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.success).toBe(true)
    expect(res.message).toBe('github.pushOk')

    // 初回コミットは parents が init-commit-sha（Contents API が作ったコミット）
    const commitCall = mock.firstCall('POST', '/git/commits')
    expect(commitCall!.body.parents).toEqual(['init-commit-sha'])
    // .gitkeep 初期化 PUT のボディ
    const initPut = mock.firstCall('PUT', '/contents/.gitkeep')
    expect(initPut!.body.message).toBe('Initialize repository')
    expect(initPut!.body.content).toBe('')
  })

  it('returns E-1004 when the .gitkeep init PUT fails', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { status: 404, json: {} })
      .on('PUT', '/contents/.gitkeep', { status: 500, json: {} })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('E-1004')
  })
})

// ============================================
// rate-limit / error 分岐
// ============================================
describe('pushAllWithTreeAPI: rate-limit and error branches', () => {
  it('returns rateLimited E-1001 when the repo fetch is rate limited (403 remaining 0)', async () => {
    mock.on('GET', REPO, {
      status: 403,
      json: {},
      headers: { 'X-RateLimit-Remaining': '0' },
    })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.message).toBe('github.rateLimited')
    expect(res.errorCode).toBe('E-1001')
    expect(res.rateLimitInfo?.isRateLimited).toBe(true)
    expect(res.httpStatus).toBe(403)
  })

  it('returns repoFetchFailed E-1002 on a non-ok, non-rate-limited repo response (e.g. 403 with quota left = permission)', async () => {
    mock.on('GET', REPO, {
      status: 403,
      json: {},
      headers: { 'X-RateLimit-Remaining': '50' },
    })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.message).toBe('github.repoFetchFailed')
    expect(res.errorCode).toBe('E-1002')
  })

  it('returns rateLimited E-1003 when the ref fetch is rate limited', async () => {
    mock.on('GET', REPO, { json: { default_branch: 'main' } }).on('GET', '/git/ref/heads/main', {
      status: 403,
      json: {},
      headers: { 'X-RateLimit-Remaining': '0' },
    })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.errorCode).toBe('E-1003')
    expect(res.message).toBe('github.rateLimited')
  })

  it('returns branchFetchFailed E-1005 on a non-empty, non-ok ref response', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { status: 500, json: {} })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.errorCode).toBe('E-1005')
    expect(res.message).toBe('github.branchFetchFailed')
  })

  it('returns commitFetchFailed E-1007 when the commit fetch fails', async () => {
    mock
      .on('GET', REPO, { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { json: { object: { sha: 'h' } } })
      .on('GET', '/git/commits/h', { status: 500, json: {} })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.errorCode).toBe('E-1007')
    expect(res.message).toBe('github.commitFetchFailed')
  })

  it('returns treeCreateFailed E-1012 when POST /git/trees fails', async () => {
    stageExistingRepo({ treeEntries: [] })
    mock.on('POST', '/git/trees', { status: 500, json: {} })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.errorCode).toBe('E-1012')
    expect(res.message).toBe('github.treeCreateFailed')
  })

  it('returns commitCreateFailed E-1014 when POST /git/commits fails', async () => {
    stageExistingRepo({ treeEntries: [] })
    mock
      .on('POST', '/git/trees', { json: { sha: 'nt' } })
      .on('POST', '/git/commits', { status: 422, json: {} })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.errorCode).toBe('E-1014')
    expect(res.message).toBe('github.commitCreateFailed')
  })

  it('returns branchUpdateFailed E-1016 when PATCH ref fails (conflict / ref mismatch)', async () => {
    stageExistingRepo({ treeEntries: [] })
    mock
      .on('POST', '/git/trees', { json: { sha: 'nt' } })
      .on('POST', '/git/commits', { json: { sha: 'nc' } })
      .on('PATCH', '/git/refs/heads/main', {
        status: 422,
        json: { message: 'Update is not a fast forward' },
      })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.errorCode).toBe('E-1016')
    expect(res.message).toBe('github.branchUpdateFailed')
  })

  it('returns networkError E-1017 when a fetch throws mid-sequence', async () => {
    // repo ok, ref not queued -> throws -> caught
    mock.on('GET', REPO, { json: { default_branch: 'main' } })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    expect(res.errorCode).toBe('E-1017')
    expect(res.message).toBe('github.networkError')
  })

  it('throws-and-catches (E-1017) when the existing tree is truncated', async () => {
    stageExistingRepo({ treeEntries: [], truncated: true })
    const res = await pushAllWithTreeAPI([leaf], notes, makeSettings())
    // truncated は throw new Error → 関数の try/catch で E-1017 に化ける（現状挙動を pin）
    expect(res.errorCode).toBe('E-1017')
    expect(res.message).toBe('github.networkError')
  })
})

// ============================================
// options オーバーロード + アーカイブ
// ============================================
describe('pushAllWithTreeAPI: options overload + archive', () => {
  it('accepts the PushOptions object form and writes archive metadata + leaves', async () => {
    const archiveNotes = [makeNote({ id: 'anote-1', name: 'ArchNote' })]
    const archiveLeaf = makeLeaf({
      id: 'aleaf-1',
      noteId: 'anote-1',
      title: 'ArchLeaf',
      content: 'archived body',
    })
    stageExistingRepo({ treeEntries: [] })
    stageWriteSequence({})

    const res = await pushAllWithTreeAPI({
      leaves: [leaf],
      notes,
      settings: makeSettings(),
      archiveLeaves: [archiveLeaf],
      archiveNotes,
      isArchiveLoaded: true,
    })

    expect(res.success).toBe(true)
    expect(res.changedArchiveLeafCount).toBe(1)

    const items: any[] = mock.firstCall('POST', '/git/trees')!.body.tree
    const archLeafItem = items.find((i) => i.path === '.agasteer/archive/ArchNote/ArchLeaf.md')
    expect(archLeafItem).toMatchObject({ content: 'archived body', mode: '100644', type: 'blob' })
    const archMetaItem = items.find((i) => i.path === '.agasteer/archive/metadata.json')
    expect(archMetaItem).toBeDefined()
    const archMeta = JSON.parse(archMetaItem.content)
    expect(archMeta.leaves['ArchNote/ArchLeaf.md']).toMatchObject({ id: 'aleaf-1' })
  })

  it('preserves existing archive files when the archive is not loaded', async () => {
    stageExistingRepo({
      treeEntries: [{ path: '.agasteer/archive/Old/keep.md', sha: 'old-archive-sha' }],
    })
    stageWriteSequence({})
    const res = await pushAllWithTreeAPI({
      leaves: [leaf],
      notes,
      settings: makeSettings(),
      isArchiveLoaded: false,
    })
    expect(res.success).toBe(true)
    const items: any[] = mock.firstCall('POST', '/git/trees')!.body.tree
    const preserved = items.find((i) => i.path === '.agasteer/archive/Old/keep.md')
    // 既存 sha のまま保持（content 再送なし）
    expect(preserved).toMatchObject({ sha: 'old-archive-sha' })
    expect('content' in preserved).toBe(false)
  })

  it('preserves non-.agasteer files (e.g. README) in the new tree', async () => {
    stageExistingRepo({
      treeEntries: [{ path: 'README.md', sha: 'readme-sha' }],
    })
    stageWriteSequence({})
    await pushAllWithTreeAPI([leaf], notes, makeSettings())
    const items: any[] = mock.firstCall('POST', '/git/trees')!.body.tree
    const readme = items.find((i) => i.path === 'README.md')
    expect(readme).toMatchObject({ path: 'README.md', sha: 'readme-sha' })
  })
})
