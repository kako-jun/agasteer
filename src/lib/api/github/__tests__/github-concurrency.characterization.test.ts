/**
 * Characterization テスト（#231）— runWithConcurrency（module-private ヘルパ）
 *
 * runWithConcurrency は export されていないので、これを唯一使う public 関数
 * pullFromGitHub / pullArchive の「リーフ content 並列取得」経由で外から pin する。
 *
 * 外からの観測方法（private ヘルパの契約を public 経由で捉える）:
 *   - リーフ content fetch の識別子 = method GET かつ URL に `/contents/` を含む
 *     （Accept: application/vnd.github.raw も付くが、metadata は /git/blobs/ 経由なので
 *      `/contents/` だけで完全に分離できる）。
 *   - fetch-mock の gate（deferred）で content 応答を pending のまま留め、
 *     mock.track() で同時 in-flight のピークを観測する。応答が pending の間は
 *     runWithConcurrency のワーカースロットを掴んだままなので、ここに並列度が現れる。
 *
 * すべて現状挙動をそのまま固定する（quirky でも修正しない）。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { createFetchMock, createDeferred, makeSettings, type FetchMock } from './fetch-mock'

// github.ts はバレル経由で stores → localStorage に触れるため、他 Wave と同じく
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

const REPO = 'https://api.github.com/repos/owner/repo'
const NOTES = '.agasteer/notes'
const ARCHIVE = '.agasteer/archive'

// runWithConcurrency に渡る CONTENT_FETCH_CONCURRENCY（本番定数）は 10。
const LIMIT = 10

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

/** repo -> ref -> tree（1〜3 段）を即時応答で仕込む（pull 用） */
function stagePullRepoRefTree(leafPaths: string[]) {
  mock.on('GET', REPO, { json: { default_branch: 'main' } })
  mock.on('GET', '/git/ref/heads/main', { json: { object: { sha: 'c' } } })
  mock.on('GET', '/git/trees/main?recursive=1', {
    json: {
      truncated: false,
      tree: leafPaths.map((p, i) => ({ path: `${NOTES}/${p}`, type: 'blob', sha: `sha-${i}` })),
    },
  })
}

/** repo -> tree（archive は ref を踏まない）を即時応答で仕込む */
function stageArchiveRepoTree(leafPaths: string[]) {
  mock.on('GET', REPO, { json: { default_branch: 'main' } })
  mock.on('GET', '/git/trees/main?recursive=1', {
    json: {
      truncated: false,
      tree: leafPaths.map((p, i) => ({ path: `${ARCHIVE}/${p}`, type: 'blob', sha: `asha-${i}` })),
    },
  })
}

/** content fetch = GET かつ URL に /contents/ を含む */
const isContent = (url: string) => url.includes('/contents/')

/** 全 pending microtask を吐き出す（macrotask 1 tick） */
const flush = () => new Promise((r) => setTimeout(r, 0))

// ============================================================
// (a) 同時 in-flight <= limit(10)
// ============================================================
describe('runWithConcurrency: caps concurrent leaf content fetches at the limit', () => {
  it('never runs more than 10 content fetches in flight even with 15 staged leaves', async () => {
    const N = 15
    const paths = Array.from({ length: N }, (_, i) => `Note/L${String(i).padStart(2, '0')}.md`)
    stagePullRepoRefTree(paths)

    // 各リーフ content 応答を gate（deferred）で pending 固定 → スロットを掴んだままにする。
    const gates = paths.map(() => createDeferred())
    paths.forEach((p, i) => {
      mock.on('GET', `/contents/${NOTES}/${p}`, { text: `body-${i}`, gate: gates[i].promise })
    })

    const contentTracker = mock.track('GET', isContent)

    // await せずに走らせる。gate 未 resolve の間は content fetch が pending。
    const pending = pullFromGitHub(makeSettings())

    // 先行ワーカーが立ち上がるのを待つ（repo/ref/tree は即時、content は gate で止まる）。
    await vi.waitFor(() => expect(contentTracker.current).toBe(LIMIT))

    // gate を一切 resolve していないので、11 本目は始まらない（＝先行 10 本が
    // resolve するまで次は動かない）。少し待っても 10 で頭打ちのまま。
    await flush()
    expect(contentTracker.current).toBe(LIMIT)
    expect(mock.callsMatching('GET', isContent)).toHaveLength(LIMIT)

    // 先行 10 本を resolve → スロットが空き、残り 5 本が流れ込む。
    gates.forEach((g) => g.resolve())
    const res = await pending

    expect(res.success).toBe(true)
    // 全 15 本が最終的に取得され、
    expect(res.leaves).toHaveLength(N)
    // 同時 in-flight のピークは limit ちょうどに到達し、超えない。
    expect(contentTracker.max).toBe(LIMIT)
    expect(mock.callsMatching('GET', isContent)).toHaveLength(N)
  })
})

// ============================================================
// (c) items < limit: 立ち上がりが items 数で頭打ち
// ============================================================
describe('runWithConcurrency: does not spin up more workers than items', () => {
  it('peaks in-flight at 3 (not 10) when only 3 leaves are staged', async () => {
    const paths = ['N/A.md', 'N/B.md', 'N/C.md']
    stagePullRepoRefTree(paths)
    const gates = paths.map(() => createDeferred())
    paths.forEach((p, i) => {
      mock.on('GET', `/contents/${NOTES}/${p}`, { text: `b${i}`, gate: gates[i].promise })
    })

    const contentTracker = mock.track('GET', isContent)
    const pending = pullFromGitHub(makeSettings())

    // ワーカー数 = min(limit, items) = 3。3 本立ち上がったら頭打ち。
    await vi.waitFor(() => expect(contentTracker.current).toBe(3))
    await flush()
    expect(contentTracker.current).toBe(3)

    gates.forEach((g) => g.resolve())
    const res = await pending
    expect(res.success).toBe(true)
    // limit(10) までは立ち上がらない。
    expect(contentTracker.max).toBe(3)
  })
})

// ============================================================
// (e) 完了順の onLeaf 発火 vs 最終 leaves の再ソート
// ============================================================
describe('runWithConcurrency: onLeaf fires in completion order; final leaves re-sorted by order', () => {
  it('fires onLeaf in resolution order (reverse) but returns leaves sorted ascending by order', async () => {
    // tree 順（= 既定 order 昇順）で A(0) B(1) C(2) を仕込み、
    // gate を逆順（C→B→A）に resolve して完了順を order 昇順とわざと食い違わせる。
    const paths = ['N/A.md', 'N/B.md', 'N/C.md']
    stagePullRepoRefTree(paths)
    const gA = createDeferred()
    const gB = createDeferred()
    const gC = createDeferred()
    mock.on('GET', `/contents/${NOTES}/N/A.md`, { text: 'a', gate: gA.promise })
    mock.on('GET', `/contents/${NOTES}/N/B.md`, { text: 'b', gate: gB.promise })
    mock.on('GET', `/contents/${NOTES}/N/C.md`, { text: 'c', gate: gC.promise })

    const contentTracker = mock.track('GET', isContent)
    const onLeafOrder: string[] = []
    const onLeaf = vi.fn((leaf: any) => onLeafOrder.push(leaf.title))

    const pending = pullFromGitHub(makeSettings(), { onLeaf })

    // 3 本とも in-flight になってから逆順で開放する。
    await vi.waitFor(() => expect(contentTracker.current).toBe(3))
    gC.resolve()
    await flush()
    gB.resolve()
    await flush()
    gA.resolve()

    const res = await pending
    expect(res.success).toBe(true)

    // onLeaf は完了順（C, B, A）で発火する。
    expect(onLeafOrder).toEqual(['C', 'B', 'A'])
    // 一方、最終 res.leaves は order 昇順に再ソートされ、onLeaf 発火順とは独立（A, B, C）。
    expect(res.leaves.map((l) => l.title)).toEqual(['A', 'B', 'C'])
  })
})

// ============================================================
// 失敗リーフは onLeaf を発火しない（コールバック発火に絞った観点）
// ============================================================
describe('runWithConcurrency: failed content fetch does not fire onLeaf', () => {
  it('fires onLeaf only for the successful leaves when one content fetch fails', async () => {
    const paths = ['N/Ok1.md', 'N/Bad.md', 'N/Ok2.md']
    stagePullRepoRefTree(paths)
    mock.on('GET', `/contents/${NOTES}/N/Ok1.md`, { text: 'ok1' })
    mock.on('GET', `/contents/${NOTES}/N/Bad.md`, { status: 500, json: {} }) // 失敗
    mock.on('GET', `/contents/${NOTES}/N/Ok2.md`, { text: 'ok2' })

    const onLeafTitles: string[] = []
    const onLeaf = vi.fn((leaf: any) => onLeafTitles.push(leaf.title))

    // 部分失敗なので pull 全体は E-2008（既存テストで固定済み）。ここは onLeaf 発火だけ観る。
    const res = await pullFromGitHub(makeSettings(), { onLeaf })
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('E-2008')

    // onLeaf は成功した 2 本だけ発火し、失敗リーフでは発火しない。
    expect(onLeaf).toHaveBeenCalledTimes(2)
    expect([...onLeafTitles].sort()).toEqual(['Ok1', 'Ok2'])
  })
})

// ============================================================
// pullArchive 版（pull と分岐する onLeafFetched コールバックだけ確認）
// ============================================================
describe('runWithConcurrency via pullArchive', () => {
  it('caps archive content fetches at the limit and fires onLeafFetched per success', async () => {
    const N = 12
    const paths = Array.from({ length: N }, (_, i) => `Old/L${String(i).padStart(2, '0')}.md`)
    stageArchiveRepoTree(paths)
    const gates = paths.map(() => createDeferred())
    paths.forEach((p, i) => {
      mock.on('GET', `/contents/${ARCHIVE}/${p}`, { text: `arch-${i}`, gate: gates[i].promise })
    })

    const contentTracker = mock.track('GET', isContent)
    const onLeafFetched = vi.fn()
    const pending = pullArchive(makeSettings(), { onLeafFetched })

    // pull と同じ limit(10) で頭打ち。
    await vi.waitFor(() => expect(contentTracker.current).toBe(LIMIT))
    await flush()
    expect(contentTracker.current).toBe(LIMIT)

    gates.forEach((g) => g.resolve())
    const res = await pending

    expect(res.success).toBe(true)
    expect(contentTracker.max).toBe(LIMIT)
    // archive は onLeafFetched を成功リーフ 1 本ごとに発火する（pull の onLeaf に対応）。
    expect(onLeafFetched).toHaveBeenCalledTimes(N)
  })
})
