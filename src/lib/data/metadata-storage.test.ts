import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import type { Metadata } from '../types'

const backing = new Map<string, string>()
const quota = 6000

function seed(metadata: Metadata): void {
  backing.set(
    'agasteer',
    JSON.stringify({
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: {
        'owner/repo': { isDirty: true, metadata },
        'owner/other': { isDirty: false, metadata: { ...metadata, pushCount: 9 } },
      },
      v131Migrated: true,
    })
  )
}

beforeEach(() => {
  backing.clear()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > quota) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      backing.set(key, value)
    },
    removeItem: (key: string) => void backing.delete(key),
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('large metadata migration', () => {
  it('moves every repo into IndexedDB before shrinking localStorage, and survives reload', async () => {
    const leaves = Object.fromEntries(
      Array.from({ length: 30_000 }, (_, i) => [
        `note/leaf-${i}.md`,
        { id: `leaf-${i}`, updatedAt: 100 + i, order: i },
      ])
    )
    const original: Metadata = { version: 1, notes: {}, leaves, pushCount: 5 }
    seed(original)
    expect(backing.get('agasteer')!.length).toBeGreaterThan(quota)

    vi.resetModules()
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')
    await storage.loadSettings()
    const compact = JSON.parse(backing.get('agasteer')!)
    expect(compact.storageVersion).toBe(2)
    expect(compact.byRepo['owner/repo']).toEqual({ isDirty: true })
    expect(compact.byRepo['owner/other']).toEqual({ isDirty: false })
    expect(await metadataStorage.getPersistedMetadata()).toEqual(original)
    expect(storage.getPersistedDirtyFlag()).toBe(true)

    storage.setPersistedDirtyFlag(false)
    expect(storage.getPersistedDirtyFlag()).toBe(false)
    const replacement: Metadata = { ...original, pushCount: 6 }
    await metadataStorage.setPersistedMetadata(replacement)
    await metadataStorage.flushPersistedMetadata()

    vi.resetModules()
    const reloaded = await import('./storage')
    const reloadedMetadataStorage = await import('./metadata-storage')
    await reloaded.loadSettings()
    expect(await reloadedMetadataStorage.getPersistedMetadata()).toEqual(replacement)
    reloaded.syncRepoNameCache('owner/other')
    expect((await reloadedMetadataStorage.getPersistedMetadata())?.pushCount).toBe(9)
  })

  it('keeps legacy metadata when IndexedDB migration cannot open', async () => {
    const original: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 4 }
    seed(original)
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('unavailable')
      },
    })
    vi.resetModules()
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')
    await storage.loadSettings()
    expect(JSON.parse(backing.get('agasteer')!).byRepo['owner/repo'].metadata).toEqual(original)
    expect(await metadataStorage.getPersistedMetadata()).toEqual(original)
  })

  it('retries safely if shrinking localStorage fails after the IndexedDB copy', async () => {
    const original: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 7 }
    seed(original)
    const localStorage = globalThis.localStorage
    let failCompactWrite = true
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (failCompactWrite) throw new DOMException('Write failed', 'QuotaExceededError')
      backing.set(key, value)
    })

    vi.resetModules()
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')
    await storage.loadSettings()
    expect(JSON.parse(backing.get('agasteer')!).byRepo['owner/repo'].metadata).toEqual(original)
    expect(await metadataStorage.getPersistedMetadata()).toEqual(original)

    failCompactWrite = false
    await storage.loadSettings()
    expect(JSON.parse(backing.get('agasteer')!).byRepo['owner/repo'].metadata).toBeUndefined()
    expect(await metadataStorage.getPersistedMetadata()).toEqual(original)
  })
})

describe('#295 S1: getPersistedMetadata resilience to a rejected pending write', () => {
  it('still returns the last committed value while a newer write is pending and later rejects', async () => {
    // 移行不要な状態を用意する（legacy byRepo[].metadata なし）。
    backing.set(
      'agasteer',
      JSON.stringify({
        storageVersion: 2,
        settings: { token: '', repoName: 'owner/repo' },
        globalState: { tourShown: true },
        byRepo: { 'owner/repo': { isDirty: false } },
      })
    )

    vi.resetModules()
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')
    await storage.loadSettings()

    const committed: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 3 }
    await metadataStorage.setPersistedMetadata(committed)
    expect(await metadataStorage.getPersistedMetadata()).toEqual(committed)

    // 次の書き込みだけ失敗させる（put() が同期的に throw する = トランザクションが
    // reject する状況を再現）。
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new Error('simulated put failure')
    })
    const failing: Metadata = { ...committed, pushCount: 99 }
    const pendingWrite = metadataStorage.setPersistedMetadata(failing)

    // #295 S1修正前: ここで metadataWrites.get(key) の reject がそのまま伝播し、
    // catch節のlegacyフォールバック（移行済みなのでundefined）→ null になっていた。
    // 修正後は pending write の reject を握りつぶしてから readMetadata するため、
    // IndexedDB に既にコミット済みの値を正しく返す。
    await expect(metadataStorage.getPersistedMetadata()).resolves.toEqual(committed)

    await expect(pendingWrite).rejects.toThrow('simulated put failure')
    putSpy.mockRestore()

    // 失敗した書き込みはコミットされていないので、最終状態も committed のまま。
    expect(await metadataStorage.getPersistedMetadata()).toEqual(committed)
  })
})
