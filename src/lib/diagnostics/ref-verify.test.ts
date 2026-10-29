/**
 * recordRefVerification（#317）: ref PATCH 直後の読み直し記録
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const recordDiag = vi.hoisted(() => vi.fn())
vi.mock('./record', () => ({ recordDiag }))

const { recordRefVerification } = await import('./ref-verify')

const PUSHED = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)

function okRes(sha: unknown, status = 200) {
  return { ok: true, status, json: async () => ({ object: { sha } }) }
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  recordDiag.mockReset()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('recordRefVerification', () => {
  it('一致: match=true・httpStatus=200 で記録', async () => {
    fetchMock.mockResolvedValue(okRes(PUSHED))
    await recordRefVerification('owner/repo', 'tok', 'main', PUSHED)
    expect(recordDiag).toHaveBeenCalledExactlyOnceWith('ref-verify', {
      pushedSha: PUSHED,
      refSha: PUSHED,
      match: true,
      httpStatus: 200,
    })
  })

  it('不一致: match=false で、読み直した SHA も記録', async () => {
    fetchMock.mockResolvedValue(okRes(OTHER))
    await recordRefVerification('owner/repo', 'tok', 'main', PUSHED)
    expect(recordDiag).toHaveBeenCalledExactlyOnceWith('ref-verify', {
      pushedSha: PUSHED,
      refSha: OTHER,
      match: false,
      httpStatus: 200,
    })
  })

  it.each([404, 403, 429])(
    'HTTP %i: refSha=null・match=false・httpStatus を記録',
    async (status) => {
      fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({}) })
      await recordRefVerification('owner/repo', 'tok', 'main', PUSHED)
      expect(recordDiag).toHaveBeenCalledExactlyOnceWith('ref-verify', {
        pushedSha: PUSHED,
        refSha: null,
        match: false,
        httpStatus: status,
      })
    }
  )

  it('fetch が reject しても投げず、記録もしない', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    await expect(
      recordRefVerification('owner/repo', 'tok', 'main', PUSHED)
    ).resolves.toBeUndefined()
    expect(recordDiag).not.toHaveBeenCalled()
  })

  it('res.json が壊れていても投げない', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json')
      },
    })
    await expect(
      recordRefVerification('owner/repo', 'tok', 'main', PUSHED)
    ).resolves.toBeUndefined()
  })

  it('応答に object.sha が無い場合は refSha=null で記録', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    await recordRefVerification('owner/repo', 'tok', 'main', PUSHED)
    expect(recordDiag.mock.calls[0][1]).toMatchObject({ refSha: null, match: false })
  })

  it('cache: no-store を付けて ref エンドポイントを GET する', async () => {
    fetchMock.mockResolvedValue(okRes(PUSHED))
    await recordRefVerification('owner/repo', 'tok', 'main', PUSHED)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/owner/repo/git/ref/heads/main')
    expect(init.cache).toBe('no-store')
  })
})

describe('recordRefVerification + 実 schema（応答由来の値が漏れないこと）', () => {
  it('応答 sha が非 hex（token 風）なら schema で捨てられ refSha は保存されない', async () => {
    vi.resetModules()
    vi.doUnmock('./record')
    const append = vi.fn(async () => {})
    vi.doMock('./log-store', () => ({ appendDiagEntry: append }))
    const mod = await import('./ref-verify')
    fetchMock.mockResolvedValue(okRes('ghp_SECRET_TOKEN_LIKE'))
    await mod.recordRefVerification('owner/repo', 'tok', 'main', PUSHED)
    expect(append).toHaveBeenCalledTimes(1)
    const saved = (append.mock.calls[0] as any[])[0]
    expect('refSha' in saved.data).toBe(false)
    expect(JSON.stringify(saved)).not.toContain('ghp_')
    vi.doUnmock('./log-store')
  })
})
