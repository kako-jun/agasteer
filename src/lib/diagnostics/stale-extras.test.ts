/**
 * recordStaleExtras（#317）: stale 検出時だけの追加観測。記録専用で失敗は握りつぶす
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import type { Settings } from '../types'

const recordDiag = vi.hoisted(() => vi.fn())
const fetchRemoteHeadSha = vi.hoisted(() => vi.fn())
vi.mock('./record', () => ({ recordDiag }))
vi.mock('../api/github', () => ({ fetchRemoteHeadSha }))

const { recordStaleExtras } = await import('./stale-extras')

const settings = { token: 'tok', repoName: 'owner/repo', branch: 'main' } as unknown as Settings
const DETECTED = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const PARENT = 'c'.repeat(40)

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  recordDiag.mockReset()
  fetchRemoteHeadSha.mockReset()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const commitOk = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const kindsRecorded = () => recordDiag.mock.calls.map((c) => c[0])

describe('recordStaleExtras: recheck × commit の組み合わせ', () => {
  it('recheck success（同じ SHA）+ commit ok: 2 件記録、sameAsRemote=true', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: DETECTED })
    fetchMock.mockResolvedValue(
      commitOk({ parents: [{ sha: PARENT }], committer: { date: '2026-01-02T03:04:05Z' } })
    )
    await recordStaleExtras(settings, DETECTED)
    expect(recordDiag).toHaveBeenNthCalledWith(1, 'stale-recheck', {
      status: 'success',
      headSha: DETECTED,
      sameAsRemote: true,
    })
    expect(recordDiag).toHaveBeenNthCalledWith(2, 'stale-remote-commit', {
      headSha: DETECTED,
      parentSha: PARENT,
      commitDate: '2026-01-02T03:04:05Z',
    })
  })

  it('recheck success（違う SHA）: sameAsRemote=false', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: OTHER })
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    await recordStaleExtras(settings, DETECTED)
    expect(recordDiag.mock.calls[0]).toEqual([
      'stale-recheck',
      { status: 'success', headSha: OTHER, sameAsRemote: false },
    ])
  })

  it('recheck success + commit !ok: stale-recheck のみ記録', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: DETECTED })
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    await recordStaleExtras(settings, DETECTED)
    expect(kindsRecorded()).toEqual(['stale-recheck'])
  })

  it('recheck success + commit fetch reject: 投げず、stale-recheck のみ記録', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: DETECTED })
    fetchMock.mockRejectedValue(new Error('net'))
    await expect(recordStaleExtras(settings, DETECTED)).resolves.toBeUndefined()
    expect(kindsRecorded()).toEqual(['stale-recheck'])
  })

  it('recheck failed + commit ok: status=failed のみ + commit 記録', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'failed' })
    fetchMock.mockResolvedValue(
      commitOk({ parents: [{ sha: PARENT }], committer: { date: '2026-01-02T03:04:05Z' } })
    )
    await recordStaleExtras(settings, DETECTED)
    expect(recordDiag.mock.calls[0]).toEqual(['stale-recheck', { status: 'failed' }])
    expect(kindsRecorded()).toEqual(['stale-recheck', 'stale-remote-commit'])
  })

  it('recheck failed + commit !ok: failed のみ', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'failed' })
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    await recordStaleExtras(settings, DETECTED)
    expect(recordDiag.mock.calls).toEqual([['stale-recheck', { status: 'failed' }]])
  })

  it('recheck failed + commit reject: failed のみ・投げない', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'failed' })
    fetchMock.mockRejectedValue(new Error('net'))
    await expect(recordStaleExtras(settings, DETECTED)).resolves.toBeUndefined()
    expect(recordDiag.mock.calls).toEqual([['stale-recheck', { status: 'failed' }]])
  })
})

describe('recordStaleExtras: 異常系', () => {
  it('fetchRemoteHeadSha が throw しても投げない（commit 取得にも進まない）', async () => {
    fetchRemoteHeadSha.mockRejectedValue(new Error('boom'))
    await expect(recordStaleExtras(settings, DETECTED)).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('parents が空・committer.date 欠落でも投げず、parentSha=null で記録する', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: DETECTED })
    fetchMock.mockResolvedValue(commitOk({ parents: [] }))
    await expect(recordStaleExtras(settings, DETECTED)).resolves.toBeUndefined()
    expect(recordDiag.mock.calls[1]).toEqual([
      'stale-remote-commit',
      { headSha: DETECTED, parentSha: null, commitDate: undefined },
    ])
  })

  it('応答が空オブジェクト・null でも投げない', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: DETECTED })
    fetchMock.mockResolvedValue(commitOk(null))
    await expect(recordStaleExtras(settings, DETECTED)).resolves.toBeUndefined()
  })

  it('commit 取得は cache: no-store・Authorization 付きで該当 SHA の URL を叩く', async () => {
    fetchRemoteHeadSha.mockResolvedValue({ status: 'failed' })
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    await recordStaleExtras(settings, DETECTED)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://api.github.com/repos/owner/repo/git/commits/${DETECTED}`)
    expect(init.cache).toBe('no-store')
  })
})

describe('recordStaleExtras + 実 schema', () => {
  async function run(body: unknown) {
    vi.resetModules()
    vi.doUnmock('./record')
    const append = vi.fn(async () => {})
    vi.doMock('./log-store', () => ({ appendDiagEntry: append }))
    vi.doMock('../api/github', () => ({
      fetchRemoteHeadSha: vi.fn(async () => ({ status: 'success', commitSha: DETECTED })),
    }))
    const mod = await import('./stale-extras')
    fetchMock.mockResolvedValue(commitOk(body))
    await mod.recordStaleExtras(settings, DETECTED)
    const saved = append.mock.calls.map((c) => (c as any[])[0])
    vi.doUnmock('./log-store')
    vi.doUnmock('../api/github')
    return saved
  }

  it('日付が不正文字列なら commitDate は保存されない（親 SHA は保存）', async () => {
    const saved = await run({ parents: [{ sha: PARENT }], committer: { date: 'SECRET yesterday' } })
    const commit = saved.find((e) => e.kind === 'stale-remote-commit')
    expect(commit.data).toEqual({ headSha: DETECTED, parentSha: PARENT })
    expect(JSON.stringify(saved)).not.toContain('SECRET')
  })

  it('parent.sha が token 風でも保存されない', async () => {
    const saved = await run({
      parents: [{ sha: 'ghp_SECRET' }],
      committer: { date: '2026-01-02T03:04:05Z' },
    })
    expect(JSON.stringify(saved)).not.toContain('ghp_')
  })

  it('日付が有効なら commitDate が保存される', async () => {
    const saved = await run({
      parents: [{ sha: PARENT }],
      committer: { date: '2026-01-02T03:04:05Z' },
    })
    expect(saved.find((e) => e.kind === 'stale-remote-commit').data.commitDate).toBe(
      '2026-01-02T03:04:05Z'
    )
  })
})
