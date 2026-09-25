/**
 * metadata-storage.ts / storage.ts の境界値・競合・異常系テスト（#295）
 *
 * metadata-storage.test.ts（移行の主要3ケース＋#295 S1回帰）で未カバーの観点を補う。
 * 対象:
 * - migrateMetadataFromLocalStorage（loadSettings毎回呼ばれる）の未設定/冪等/優先順位/
 *   v131移行との競合/破損JSON
 * - getPersistedMetadata/setPersistedMetadata のリポ未設定/未書込/競合/順序/回復/分離
 * - ログ出力（正常系で沈黙・異常系で期待メッセージ）
 * - notes/leaves の日本語・絵文字・サロゲートペアの往復
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import type { Metadata } from '../types'

const backing = new Map<string, string>()

/** localStorage の 'agasteer' キーへ直接 JSON をセットする（localStorage.setItem を経由しない） */
function seedRaw(value: unknown): void {
  backing.set('agasteer', JSON.stringify(value))
}

beforeEach(() => {
  backing.clear()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => backing.set(key, value),
    removeItem: (key: string) => void backing.delete(key),
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('migrateMetadataFromLocalStorage: 未設定・冪等・優先順位・異常系', () => {
  it('T1 [正常/未設定] legacyもstorageVersionも無い状態でloadSettingsが例外なく完了し、storageVersion:2が保存され、getPersistedMetadataはnull', async () => {
    // 'agasteer' キー自体が存在しない = 初回起動相当。
    vi.resetModules()
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')

    await expect(storage.loadSettings()).resolves.toBeDefined()

    const compact = JSON.parse(backing.get('agasteer')!)
    expect(compact.storageVersion).toBe(2)
    expect(await metadataStorage.getPersistedMetadata()).toBeNull()
  })

  it('T2 [冪等] storageVersion:2の状態でloadSettingsを2回呼んでも、2回目でlocalStorage.setItemが追加で呼ばれない', async () => {
    seedRaw({
      storageVersion: 2,
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: { 'owner/repo': { isDirty: false } },
      v131Migrated: true, // v131移行の副作用を無関係化する
    })
    vi.resetModules()
    const storage = await import('./storage')
    await import('./metadata-storage')

    const setItemSpy = vi.spyOn(globalThis.localStorage, 'setItem')
    await storage.loadSettings()
    const callsAfterFirst = setItemSpy.mock.calls.length

    await storage.loadSettings()
    // 移行が冪等なら2回目はsetItemを追加で呼ばない
    expect(setItemSpy.mock.calls.length).toBe(callsAfterFirst)
  })

  it('T3 [優先順位] IndexedDBにlegacyと異なる値が既にある場合、IndexedDB側を保持しlocalStorageのlegacyだけ除去する', async () => {
    const legacyValue: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 1 }
    seedRaw({
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: { 'owner/repo': { isDirty: true, metadata: legacyValue } },
      v131Migrated: true,
    })
    vi.resetModules()
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')

    // migrateMetadataFromLocalStorage実行前にIndexedDB側へ別の値を先に書いておく
    const existingValue: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 999 }
    await metadataStorage.setPersistedMetadata(existingValue)
    await metadataStorage.flushPersistedMetadata()

    await storage.loadSettings()

    // IndexedDBを正とし、legacyでは上書きしない
    expect(await metadataStorage.getPersistedMetadata()).toEqual(existingValue)
    // localStorage側のlegacyフィールドは移行完了として除去される
    const compact = JSON.parse(backing.get('agasteer')!)
    expect(compact.byRepo['owner/repo'].metadata).toBeUndefined()
    expect(compact.storageVersion).toBe(2)
  })

  it('T4 [race・最重要] v131Migrated未設定でmetadata移行とrunV131MigrationIfNeededが並行しても、両フラグ(v131Migrated:true / storageVersion:2)が最終的に両方残る', async () => {
    const legacyValue: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 1 }
    seedRaw({
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: { 'owner/repo': { isDirty: true, metadata: legacyValue } },
      // v131Migrated, storageVersion とも未設定
    })
    vi.resetModules()
    // storage.ts の import 自体がモジュール評価時に runV131MigrationIfNeeded() を
    // fire-and-forget で起動する（indexedDB.deleteDatabase ベースの非同期処理）。
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')

    // migrateMetadataFromLocalStorage 側は loadSettings() 経由で並行して走る。
    await storage.loadSettings()

    // runV131MigrationIfNeeded は loadSettings() から await されない fire-and-forget
    // なので、その完了を明示的に待つ。
    await vi.waitFor(() => {
      const compact = JSON.parse(backing.get('agasteer')!)
      expect(compact.v131Migrated).toBe(true)
    })

    const compact = JSON.parse(backing.get('agasteer')!)
    expect(compact.v131Migrated).toBe(true)
    expect(compact.storageVersion).toBe(2)
  })

  it('T5 [異常] 破損したJSONをseedすると、agasteer-corrupt-* 退避キーが作られ、リセット後データにstorageVersion:2が共存する', async () => {
    backing.set('agasteer', '{ this is not valid json')
    vi.resetModules()
    const storage = await import('./storage')
    await import('./metadata-storage')

    await storage.loadSettings()

    // storage.ts の import 時点で走る runV131MigrationIfNeeded() も独立に
    // loadStorageData() を呼ぶため、同じ破損JSONに対し退避キーが複数（別々の
    // ランダムsuffix）作られることがある。'agasteer' 本体が最終的に修復されて
    // いれば実害はないため、「1個だけ」ではなく「1個以上・全て原本と一致」を検証する。
    const corruptKeys = [...backing.keys()].filter((k) => k.startsWith('agasteer-corrupt-'))
    expect(corruptKeys.length).toBeGreaterThanOrEqual(1)
    for (const key of corruptKeys) {
      expect(backing.get(key)).toBe('{ this is not valid json')
    }

    const compact = JSON.parse(backing.get('agasteer')!)
    expect(compact.storageVersion).toBe(2)
  })
})

describe('getPersistedMetadata/setPersistedMetadata: 未設定・同値分割・競合・回復・分離', () => {
  it('T6 [未設定] repoName空の場合、getPersistedMetadataはnull、setPersistedMetadataはIndexedDBに触れずresolveする', async () => {
    seedRaw({
      storageVersion: 2,
      settings: { token: '', repoName: '' },
      globalState: { tourShown: true },
      byRepo: {},
      v131Migrated: true,
    })
    vi.resetModules()
    const metadataStorage = await import('./metadata-storage')

    const openSpy = vi.spyOn(globalThis.indexedDB, 'open')

    await expect(metadataStorage.getPersistedMetadata()).resolves.toBeNull()
    const dummy: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 1 }
    await expect(metadataStorage.setPersistedMetadata(dummy)).resolves.toBeUndefined()

    expect(openSpy).not.toHaveBeenCalled()
  })

  it('T7 [同値分割] repoName設定済みだが未書込のリポではgetPersistedMetadataがnull', async () => {
    seedRaw({
      storageVersion: 2,
      settings: { token: '', repoName: 'owner/unwritten' },
      globalState: { tourShown: true },
      byRepo: {},
      v131Migrated: true,
    })
    vi.resetModules()
    const metadataStorage = await import('./metadata-storage')

    expect(await metadataStorage.getPersistedMetadata()).toBeNull()
  })

  it('T8 [race] setPersistedMetadata(A)をawaitせず直後にgetPersistedMetadataを呼ぶと、Aが返る', async () => {
    seedRaw({
      storageVersion: 2,
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: { 'owner/repo': { isDirty: false } },
      v131Migrated: true,
    })
    vi.resetModules()
    const metadataStorage = await import('./metadata-storage')

    const valueA: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 1 }
    const pendingWrite = metadataStorage.setPersistedMetadata(valueA)
    const result = await metadataStorage.getPersistedMetadata()

    expect(result).toEqual(valueA)
    await pendingWrite
  })

  it('T9 [順序] 同一リポへA→Bを連続でawaitせず発行すると、最終値はB', async () => {
    seedRaw({
      storageVersion: 2,
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: { 'owner/repo': { isDirty: false } },
      v131Migrated: true,
    })
    vi.resetModules()
    const metadataStorage = await import('./metadata-storage')

    const valueA: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 1 }
    const valueB: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 2 }
    const writeA = metadataStorage.setPersistedMetadata(valueA)
    const writeB = metadataStorage.setPersistedMetadata(valueB)
    await Promise.all([writeA, writeB])

    expect(await metadataStorage.getPersistedMetadata()).toEqual(valueB)
  })

  it('T10 [回復] 1回目の書き込みがトランザクション失敗した後も、2回目の書き込みは成功し読み出せる', async () => {
    seedRaw({
      storageVersion: 2,
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: { 'owner/repo': { isDirty: false } },
      v131Migrated: true,
    })
    vi.resetModules()
    const metadataStorage = await import('./metadata-storage')

    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new Error('simulated put failure')
    })
    const first: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 1 }
    await expect(metadataStorage.setPersistedMetadata(first)).rejects.toThrow(
      'simulated put failure'
    )
    putSpy.mockRestore()

    const second: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 2 }
    await metadataStorage.setPersistedMetadata(second)

    expect(await metadataStorage.getPersistedMetadata()).toEqual(second)
  })

  it('T11 [分離] リポBへ切替・書込・flush後にAへ戻ると値は不変で、Bへ戻すと更新値のまま', async () => {
    seedRaw({
      storageVersion: 2,
      settings: { token: '', repoName: 'owner/repo-a' },
      globalState: { tourShown: true },
      byRepo: {
        'owner/repo-a': { isDirty: false },
        'owner/repo-b': { isDirty: false },
      },
      v131Migrated: true,
    })
    vi.resetModules()
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')

    // 実アプリでの repo 切替は必ず「settings.repoName の永続化」と「cachedRepoName
    // の更新」がセットで起きる（saveStorageData 経由、または #295 M1 起動時のように
    // Object.assign 直後に syncRepoNameCache で明示同期）。syncRepoNameCache だけを
    // 呼んで永続値と乖離させるのはテスト側の誤用であり、getPerRepoState 経由で
    // loadStorageData が走った際にキャッシュが永続値へ巻き戻されて別リポの書き込み
    // 先を誤る（実運用では起きない組み合わせ）。ここでは実際の切替と同じく両方を
    // 揃えて更新する。
    function switchRepo(repoKey: string): void {
      const current = JSON.parse(backing.get('agasteer')!)
      current.settings.repoName = repoKey
      backing.set('agasteer', JSON.stringify(current))
      storage.syncRepoNameCache(repoKey)
    }

    const valueA: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 1 }
    await metadataStorage.setPersistedMetadata(valueA)
    await metadataStorage.flushPersistedMetadata()

    switchRepo('owner/repo-b')
    expect(await metadataStorage.getPersistedMetadata()).toBeNull()

    const valueB: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 2 }
    await metadataStorage.setPersistedMetadata(valueB)
    await metadataStorage.flushPersistedMetadata()

    switchRepo('owner/repo-a')
    expect(await metadataStorage.getPersistedMetadata()).toEqual(valueA)

    switchRepo('owner/repo-b')
    expect(await metadataStorage.getPersistedMetadata()).toEqual(valueB)
  })

  it('T12 [事故再発防止] IndexedDBが開けない状態でもgetPersistedMetadataはlegacy値を返し、setPersistedDirtyFlag/setPersistedCommitShaの保存は成功する', async () => {
    const legacyValue: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 42 }
    seedRaw({
      storageVersion: 2,
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: { 'owner/repo': { isDirty: false, metadata: legacyValue } },
      v131Migrated: true,
    })
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('indexedDB unavailable')
      },
    })
    vi.resetModules()
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')

    expect(await metadataStorage.getPersistedMetadata()).toEqual(legacyValue)

    expect(() => storage.setPersistedDirtyFlag(true)).not.toThrow()
    expect(storage.getPersistedDirtyFlag()).toBe(true)

    expect(() => storage.setPersistedCommitSha('abc123')).not.toThrow()
    expect(storage.getPersistedCommitSha()).toBe('abc123')
  })
})

describe('ログ出力: 正常系は沈黙・異常系は期待メッセージ付き', () => {
  it('T13a [ログ/正常系] 初回起動のloadSettingsではconsole.errorが呼ばれない', async () => {
    // 'agasteer' キー無し = 初回起動。正常に完了するはず。
    vi.resetModules()
    const storage = await import('./storage')
    await import('./metadata-storage')

    await storage.loadSettings()

    expect(console.error).not.toHaveBeenCalled()
  })

  it('T13b [ログ/異常系] localStorageへの保存(縮小保存)が失敗すると、期待メッセージ付きでconsole.errorが呼ばれる', async () => {
    seedRaw({
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: {},
      v131Migrated: true, // v131側の書き込みは発生させない
    })
    vi.resetModules()
    const storage = await import('./storage')
    await import('./metadata-storage')

    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Write failed', 'QuotaExceededError')
    })

    await expect(storage.loadSettings()).resolves.toBeDefined()

    expect(console.error).toHaveBeenCalledWith(
      'Failed to migrate metadata to IndexedDB:',
      expect.anything()
    )
  })
})

describe('i18n: notes/leavesの日本語・絵文字・サロゲートペアの往復', () => {
  it('T14 [i18n] キー・値に日本語・絵文字・サロゲートペアを含むmetadataが移行後も読み戻しで完全一致する', async () => {
    const original: Metadata = {
      version: 1,
      notes: {
        'ノート/絵文字🎌フォルダ': {
          id: 'id-日本語-🧑‍💻',
          order: 0,
          badgeIcon: '📁',
          badgeColor: '#123456',
        },
      },
      leaves: {
        'リーフ/サロゲート𝓐対応.md': {
          id: 'leaf-😀-テスト',
          updatedAt: 999,
          order: 2,
          badgeIcon: '📝',
        },
      },
      pushCount: 5,
    }
    seedRaw({
      settings: { token: '', repoName: 'owner/repo' },
      globalState: { tourShown: true },
      byRepo: { 'owner/repo': { isDirty: false, metadata: original } },
      v131Migrated: true,
    })
    vi.resetModules()
    const storage = await import('./storage')
    const metadataStorage = await import('./metadata-storage')

    await storage.loadSettings()

    expect(await metadataStorage.getPersistedMetadata()).toEqual(original)
  })
})
