/**
 * 診断ログの永続化層（#317）のテスト（fake-indexeddb）
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { DiagEntry } from './schema'

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

function seedLocalStorage(): void {
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
}

async function load() {
  vi.resetModules()
  return await import('./log-store')
}

function mk(i: number, data: DiagEntry['data'] = { stamp: i }): DiagEntry {
  return { at: 1_700_000_000_000 + i, kind: 'inflight-set', data }
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  seedLocalStorage()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('append / read', () => {
  it('追加した順に昇順で読め、id が連番で採番される', async () => {
    const s = await load()
    for (let i = 1; i <= 3; i++) await s.appendDiagEntry(mk(i))
    const all = await s.readDiagEntries()
    expect(all.map((e) => e.data.stamp)).toEqual([1, 2, 3])
    expect(all.map((e) => e.id)).toEqual([1, 2, 3])
  })

  it('0 件のとき read は空配列', async () => {
    const s = await load()
    expect(await s.readDiagEntries()).toEqual([])
  })

  it('console.error は呼ばれない', async () => {
    const s = await load()
    await s.appendDiagEntry(mk(1))
    await s.readDiagEntries()
    await s.clearDiagEntries()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('上限の切り捨て（add → getAll 後の delete が同一 tx で効くか）', () => {
  it('301 件追加すると 300 件に収まり、最古が消え最新が残る', async () => {
    const s = await load()
    for (let i = 1; i <= 301; i++) await s.appendDiagEntry(mk(i))
    const all = await s.readDiagEntries()
    expect(all).toHaveLength(300)
    expect(all[0].data.stamp).toBe(2)
    expect(all[all.length - 1].data.stamp).toBe(301)
    // TransactionInactiveError 等で握りつぶされていないこと
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('合計 200KB を超えると古い側から削除される', async () => {
    const s = await load()
    const big = 'a'.repeat(60 * 1024)
    for (let i = 1; i <= 5; i++) await s.appendDiagEntry(mk(i, { stamp: i, x: big }))
    const all = await s.readDiagEntries()
    expect(all.length).toBeLessThan(5)
    expect(all.length).toBeGreaterThan(0)
    expect(all[all.length - 1].data.stamp).toBe(5)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('1 件で 200KB を超えるエントリは、追加した直後に自分自身も消える（現状の挙動を固定）', async () => {
    const s = await load()
    await s.appendDiagEntry(mk(1))
    await s.appendDiagEntry(mk(2, { stamp: 2, x: 'a'.repeat(210 * 1024) }))
    expect(await s.readDiagEntries()).toEqual([])
  })
})

describe('clear', () => {
  it('clear 後は 0 件で true を返す', async () => {
    const s = await load()
    await s.appendDiagEntry(mk(1))
    expect(await s.clearDiagEntries()).toBe(true)
    expect(await s.readDiagEntries()).toEqual([])
  })
  it('clear 連打でも壊れない', async () => {
    const s = await load()
    await s.appendDiagEntry(mk(1))
    const r = await Promise.all([s.clearDiagEntries(), s.clearDiagEntries(), s.clearDiagEntries()])
    expect(r).toEqual([true, true, true])
    expect(await s.readDiagEntries()).toEqual([])
  })
  it('clear 後も追加できる', async () => {
    const s = await load()
    await s.appendDiagEntry(mk(1))
    await s.clearDiagEntries()
    await s.appendDiagEntry(mk(2))
    expect((await s.readDiagEntries()).map((e) => e.data.stamp)).toEqual([2])
  })
})

describe('並列 append', () => {
  it('50 並列でも欠落・重複せず上限を守る', async () => {
    const s = await load()
    await Promise.all(Array.from({ length: 50 }, (_, i) => s.appendDiagEntry(mk(i + 1))))
    const all = await s.readDiagEntries()
    expect(all).toHaveLength(50)
    expect(new Set(all.map((e) => e.id)).size).toBe(50)
    expect(new Set(all.map((e) => e.data.stamp)).size).toBe(50)
  })

  it('320 並列でも 300 件に収まる', async () => {
    const s = await load()
    await Promise.all(Array.from({ length: 320 }, (_, i) => s.appendDiagEntry(mk(i + 1))))
    const all = await s.readDiagEntries()
    expect(all.length).toBeLessThanOrEqual(300)
    expect(all.length).toBeGreaterThan(0)
  })
})

describe('失敗しても投げない', () => {
  it('DB open が reject しても append/read/clear は投げず、read=[]・clear=false・console.warn のみ', async () => {
    const failing = {
      open: () => {
        const req: any = {}
        setTimeout(() => {
          req.error = new Error('open denied')
          req.onerror?.()
        }, 0)
        return req
      },
    }
    vi.stubGlobal('indexedDB', failing)
    const s = await load()
    await expect(s.appendDiagEntry(mk(1))).resolves.toBeUndefined()
    expect(await s.readDiagEntries()).toEqual([])
    expect(await s.clearDiagEntries()).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('indexedDB が未定義でも投げない', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const s = await load()
    await expect(s.appendDiagEntry(mk(1))).resolves.toBeUndefined()
    expect(await s.readDiagEntries()).toEqual([])
    expect(await s.clearDiagEntries()).toBe(false)
  })

  it('add が失敗（複製不能な値）しても投げず、既存の記録は無傷', async () => {
    const s = await load()
    await s.appendDiagEntry(mk(1))
    const bad = { at: 1, kind: 'inflight-set', data: { f: () => 1 } } as unknown as DiagEntry
    await expect(s.appendDiagEntry(bad)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
    expect((await s.readDiagEntries()).map((e) => e.data.stamp)).toEqual([1])
  })
})

describe('DB から読んだ値は再検証されない（現状の挙動を固定）', () => {
  it('schema を通っていない値が DB にあれば、そのまま read で返る', async () => {
    const s = await load()
    await s.appendDiagEntry({
      at: 1,
      kind: 'inflight-set',
      data: { evil: 'ghp_SECRET' },
    } as DiagEntry)
    const all = await s.readDiagEntries()
    expect(all[0].data.evil).toBe('ghp_SECRET')
  })
})
