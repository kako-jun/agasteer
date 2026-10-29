/**
 * 共有 DB（agasteer/shared）の v1→v2 移行（diagLog store 追加、#317）のテスト
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

const SHARED = 'agasteer/shared'

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

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

/** v1 の共有 DB（fonts / backgrounds のみ）を作ってデータを入れる */
async function createV1(factory: IDBFactory): Promise<void> {
  const open = factory.open(SHARED, 1)
  open.onupgradeneeded = () => {
    const db = open.result
    db.createObjectStore('fonts', { keyPath: 'name' })
    db.createObjectStore('backgrounds', { keyPath: 'name' })
  }
  const db = await req(open)
  const tx = db.transaction(['fonts', 'backgrounds'], 'readwrite')
  tx.objectStore('fonts').put({ name: 'myfont', data: new Uint8Array([1, 2, 3]).buffer })
  tx.objectStore('backgrounds').put({ name: 'bg1', data: new Uint8Array([9]).buffer })
  await new Promise<void>((res) => (tx.oncomplete = () => res()))
  db.close()
}

async function inspect(factory: IDBFactory) {
  const open = factory.open(SHARED)
  const db = await req(open)
  const info = { version: db.version, stores: Array.from(db.objectStoreNames).sort() }
  const fonts = await req(db.transaction('fonts').objectStore('fonts').getAll())
  const bgs = await req(db.transaction('backgrounds').objectStore('backgrounds').getAll())
  db.close()
  return { ...info, fonts, bgs }
}

beforeEach(() => {
  seedLocalStorage()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('共有 DB v1→v2', () => {
  it('v1 の fonts / backgrounds のデータが残り、diagLog store ができる', async () => {
    const factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
    await createV1(factory)
    vi.resetModules()
    const { getSharedDb } = await import('./storage')
    const db = await getSharedDb()
    expect(db.version).toBe(2)
    expect(Array.from(db.objectStoreNames).sort()).toEqual(['backgrounds', 'diagLog', 'fonts'])
    db.close()
    const s = await inspect(factory)
    expect(s.fonts).toHaveLength(1)
    expect(s.fonts[0].name).toBe('myfont')
    expect(new Uint8Array(s.fonts[0].data)).toEqual(new Uint8Array([1, 2, 3]))
    expect(s.bgs).toHaveLength(1)
    expect(s.bgs[0].name).toBe('bg1')
  })

  it('移行後の diagLog に追加・読み取りができる', async () => {
    const factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
    await createV1(factory)
    vi.resetModules()
    const store = await import('../diagnostics/log-store')
    await store.appendDiagEntry({ at: 1, kind: 'inflight-set', data: { stamp: 1 } })
    expect(await store.readDiagEntries()).toHaveLength(1)
  })

  it('新規作成で 3 store が揃う', async () => {
    const factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
    vi.resetModules()
    const { getSharedDb } = await import('./storage')
    const db = await getSharedDb()
    expect(Array.from(db.objectStoreNames).sort()).toEqual(['backgrounds', 'diagLog', 'fonts'])
    db.close()
  })

  it('v2 の再オープンは冪等（データ・store・バージョンが変わらない）', async () => {
    const factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
    await createV1(factory)
    vi.resetModules()
    let mod = await import('./storage')
    ;(await mod.getSharedDb()).close()
    const before = await inspect(factory)
    vi.resetModules()
    mod = await import('./storage')
    ;(await mod.getSharedDb()).close()
    const after = await inspect(factory)
    expect(after).toEqual(before)
    expect(after.version).toBe(2)
  })
})
