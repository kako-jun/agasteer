// @vitest-environment jsdom
// #321: コミット SHA 指定の読み出し。commit → tree → metadata → blob をすべて SHA で読むこと、
// 取得キャッシュ、失敗時の理由、metadata に ID の無いファイルの検出を検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCommitSnapshot } from './snapshot'
import { encodeContent } from './encoding'

const settings = { token: 'tok', repoName: 'owner/repo' } as never
const API = 'https://api.github.com/repos/owner/repo/git'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const metadata = {
  version: 1,
  pushCount: 5,
  notes: { Work: { id: 'n1', order: 0 } },
  leaves: { 'Work/Todo.md': { id: 'a', updatedAt: 1, order: 0 } },
}

function routes(overrides: Record<string, () => Response> = {}) {
  const table: Record<string, () => Response> = {
    [`${API}/commits/c1`]: () => json({ tree: { sha: 't1' } }),
    [`${API}/trees/t1?recursive=1`]: () =>
      json({
        truncated: false,
        tree: [
          { path: '.agasteer/notes/metadata.json', type: 'blob', sha: 'm1' },
          { path: '.agasteer/notes/Work/Todo.md', type: 'blob', sha: 'b1' },
          { path: 'README.md', type: 'blob', sha: 'r1' },
        ],
      }),
    [`${API}/blobs/m1`]: () => json({ content: encodeContent(JSON.stringify(metadata)) }),
    [`${API}/blobs/b1`]: () => json({ content: encodeContent('hello\nworld') }),
    ...overrides,
  }
  return vi.fn(async (url: string) => {
    const handler = table[url]
    if (!handler) return json({ message: 'not found' }, 404)
    return handler()
  })
}

let fetchMock: ReturnType<typeof routes>

beforeEach(() => {
  fetchMock = routes()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchCommitSnapshot', () => {
  it('コミットの tree と metadata から notes / leaves を組み立てる', async () => {
    const result = await fetchCommitSnapshot(settings, 'c1', {
      includeArchive: false,
      contentCache: new Map(),
    })
    expect(result.status).toBe('success')
    if (result.status !== 'success') return
    expect(result.home.notes).toEqual([
      {
        id: 'n1',
        name: 'Work',
        parentId: undefined,
        order: 0,
        badgeIcon: undefined,
        badgeColor: undefined,
      },
    ])
    expect(result.home.leaves).toMatchObject([
      { id: 'a', noteId: 'n1', title: 'Todo', content: 'hello\nworld', blobSha: 'b1' },
    ])
    expect(result.home.metadata.pushCount).toBe(5)
    expect(result.hasUntrackedEntries).toBe(false)
    expect(result.archive).toBeUndefined()
    // ブランチ名ではなく SHA 指定で読む
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain(
      expect.stringContaining('/trees/main')
    )
  })

  it('キャッシュにある blob は取りに行かず、取った blob はキャッシュに足す', async () => {
    const cache = new Map([['b1', 'cached text']])
    const result = await fetchCommitSnapshot(settings, 'c1', {
      includeArchive: false,
      contentCache: cache,
    })
    if (result.status !== 'success') throw new Error('expected success')
    expect(result.home.leaves[0].content).toBe('cached text')
    const urls = fetchMock.mock.calls.map((c) => c[0])
    expect(urls).not.toContain(`${API}/blobs/b1`)
    expect(cache.has('m1')).toBe(true)
  })

  it('metadata に ID の無いファイルがあれば hasUntrackedEntries', async () => {
    vi.stubGlobal(
      'fetch',
      routes({
        [`${API}/trees/t1?recursive=1`]: () =>
          json({
            tree: [
              { path: '.agasteer/notes/metadata.json', type: 'blob', sha: 'm1' },
              { path: '.agasteer/notes/Work/Todo.md', type: 'blob', sha: 'b1' },
              { path: '.agasteer/notes/Work/Outside.md', type: 'blob', sha: 'b1' },
            ],
          }),
      })
    )
    const result = await fetchCommitSnapshot(settings, 'c1', {
      includeArchive: false,
      contentCache: new Map(),
    })
    expect(result.status === 'success' && result.hasUntrackedEntries).toBe(true)
  })

  it('コミットが無ければ notFound', async () => {
    expect(
      await fetchCommitSnapshot(settings, 'missing', {
        includeArchive: false,
        contentCache: new Map(),
      })
    ).toEqual({ status: 'error', reason: 'notFound', httpStatus: 404 })
  })

  it('tree が truncated なら truncated', async () => {
    vi.stubGlobal(
      'fetch',
      routes({ [`${API}/trees/t1?recursive=1`]: () => json({ truncated: true, tree: [] }) })
    )
    expect(
      await fetchCommitSnapshot(settings, 'c1', { includeArchive: false, contentCache: new Map() })
    ).toEqual({ status: 'error', reason: 'truncated' })
  })

  it('metadata.json が壊れていれば metadataInvalid', async () => {
    vi.stubGlobal(
      'fetch',
      routes({ [`${API}/blobs/m1`]: () => json({ content: encodeContent('{broken') }) })
    )
    expect(
      await fetchCommitSnapshot(settings, 'c1', { includeArchive: false, contentCache: new Map() })
    ).toEqual({ status: 'error', reason: 'metadataInvalid' })
  })

  it('本文の取得失敗は network（途中まで読んだ内容は返さない）', async () => {
    vi.stubGlobal('fetch', routes({ [`${API}/blobs/b1`]: () => json({}, 500) }))
    expect(
      await fetchCommitSnapshot(settings, 'c1', { includeArchive: false, contentCache: new Map() })
    ).toEqual({ status: 'error', reason: 'network', httpStatus: 500 })
  })

  it('includeArchive のときはアーカイブも読む', async () => {
    vi.stubGlobal(
      'fetch',
      routes({
        [`${API}/trees/t1?recursive=1`]: () =>
          json({
            tree: [
              { path: '.agasteer/notes/metadata.json', type: 'blob', sha: 'm1' },
              { path: '.agasteer/notes/Work/Todo.md', type: 'blob', sha: 'b1' },
              { path: '.agasteer/archive/metadata.json', type: 'blob', sha: 'am' },
              { path: '.agasteer/archive/Old/Done.md', type: 'blob', sha: 'b1' },
            ],
          }),
        [`${API}/blobs/am`]: () =>
          json({
            content: encodeContent(
              JSON.stringify({
                version: 1,
                pushCount: 0,
                notes: { Old: { id: 'o1', order: 0 } },
                leaves: { 'Old/Done.md': { id: 'd', updatedAt: 1, order: 0 } },
              })
            ),
          }),
      })
    )
    const result = await fetchCommitSnapshot(settings, 'c1', {
      includeArchive: true,
      contentCache: new Map(),
    })
    if (result.status !== 'success') throw new Error('expected success')
    expect(result.archive?.leaves).toMatchObject([{ id: 'd', noteId: 'o1', title: 'Done' }])
  })

  it('signal が abort されたら timeout を返す', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            )
          })
      )
    )
    const pending = fetchCommitSnapshot(settings, 'c1', {
      includeArchive: false,
      contentCache: new Map(),
      signal: controller.signal,
    })
    controller.abort()
    expect(await pending).toEqual({ status: 'error', reason: 'timeout' })
  })
})
