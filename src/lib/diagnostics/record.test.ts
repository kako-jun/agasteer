/**
 * recordDiag（#317）: 同期・戻り値なし・例外を投げない・秘匿値を保存しない
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

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

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  storageBacking.clear()
  storageBacking.set(
    'agasteer',
    JSON.stringify({
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true, saveGuideShown: true },
      byRepo: {},
      v131Migrated: true,
    })
  )
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.resetModules()
})
afterEach(() => {
  vi.doUnmock('./log-store')
  vi.doUnmock('./schema')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('recordDiag（log-store をモック）', () => {
  it('同期で戻り、戻り値は undefined。保存は裏で進む', async () => {
    const append = vi.fn((_e: unknown) => new Promise<void>(() => {})) // 永久 pending
    vi.doMock('./log-store', () => ({ appendDiagEntry: append }))
    const { recordDiag } = await import('./record')
    const r = recordDiag('inflight-set', { stamp: 1 })
    expect(r).toBeUndefined()
    expect(append).toHaveBeenCalledTimes(1)
    expect(append.mock.calls[0][0]).toMatchObject({ kind: 'inflight-set', data: { stamp: 1 } })
  })

  it('未知 kind を渡しても何も保存せず投げない', async () => {
    const append = vi.fn(async () => {})
    vi.doMock('./log-store', () => ({ appendDiagEntry: append }))
    const { recordDiag } = await import('./record')
    expect(() => (recordDiag as any)('__proto__', { a: 1 })).not.toThrow()
    expect(() => (recordDiag as any)('nope', { a: 1 })).not.toThrow()
    expect(append).not.toHaveBeenCalled()
  })

  it('buildEntry が例外を投げても外に漏れない', async () => {
    const append = vi.fn(async () => {})
    vi.doMock('./log-store', () => ({ appendDiagEntry: append }))
    vi.doMock('./schema', () => ({
      buildEntry: () => {
        throw new Error('boom')
      },
    }))
    const { recordDiag } = await import('./record')
    expect(() => recordDiag('inflight-set', { stamp: 1 })).not.toThrow()
    expect(append).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('data が null / 不正オブジェクトでも投げない', async () => {
    vi.doMock('./log-store', () => ({ appendDiagEntry: vi.fn(async () => {}) }))
    const { recordDiag } = await import('./record')
    expect(() => (recordDiag as any)('inflight-set', null)).not.toThrow()
    expect(() => (recordDiag as any)('inflight-set', undefined)).not.toThrow()
  })
})

describe('recordDiag（実 IndexedDB）', () => {
  it('token 風・パス風・リポ名風を渡して DB 全走査しても ghp_ 等は存在しない', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const { recordDiag } = await import('./record')
    const { readDiagEntries } = await import('./log-store')
    ;(recordDiag as any)('push-success', {
      commitSha: 'ghp_SECRET',
      parentSha: 'secret/repo',
      stamp: 'notes/SECRET.md',
      noChanges: 'SECRET_TITLE',
      token: 'ghp_SECRET',
      title: 'SECRET_TITLE',
    })
    ;(recordDiag as any)('conflict-dialog', { dialogKind: 'ghp_SECRET', localSha: 'ghp_SECRET' })
    await new Promise((r) => setTimeout(r, 200))
    const all = await readDiagEntries()
    expect(all).toHaveLength(2)
    const json = JSON.stringify(all)
    for (const s of ['ghp_', 'SECRET', 'secret/', 'notes/']) expect(json).not.toContain(s)
  })
})
