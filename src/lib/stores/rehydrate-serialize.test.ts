import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// #297: rehydrateForRepo の直列化（実行中の再切替は最後の要求だけを適用し、
// 中間の要求は破棄する）を縛る回帰テスト。
//
// 他のテスト（leaf-stats.test.ts 等）と同様、storage 系モジュールがトップレベルで
// 参照する localStorage をスタブしてから動的 import する。
const localStorageBacking = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => localStorageBacking.get(k) ?? null,
  setItem: (k: string, v: string) => void localStorageBacking.set(k, v),
  removeItem: (k: string) => void localStorageBacking.delete(k),
  clear: () => localStorageBacking.clear(),
  key: (i: number) => Array.from(localStorageBacking.keys())[i] ?? null,
  get length() {
    return localStorageBacking.size
  },
}

const mocks = vi.hoisted(() => ({
  setCurrentRepo: vi.fn(async (_repoKey: string) => {}),
  closeCurrentRepoDb: vi.fn(),
  loadNotes: vi.fn(async () => []),
  loadLeaves: vi.fn(async () => []),
  getPersistedCommitSha: vi.fn(() => null as string | null),
  getPersistedLastPulledPushCount: vi.fn(() => 0 as number | null),
  getPersistedMetadata: vi.fn(async () => null),
  flushPersistedMetadata: vi.fn(async () => {}),
  setPersistedMetadata: vi.fn(async () => {}),
  flushPendingSaves: vi.fn(async () => {}),
  waitForPendingMediaInserts: vi.fn(async () => {}),
}))

// #297: setCurrentRepo の呼び出し順・タイミングだけを観測したいので、実 IndexedDB
// アクセス（loadNotes/loadLeaves/getPersistedCommitSha/getPersistedLastPulledPushCount
// を含む）はモックに差し替える。他の export は素通しする。
vi.mock('../data/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/storage')>()
  return {
    ...actual,
    setCurrentRepo: mocks.setCurrentRepo,
    closeCurrentRepoDb: mocks.closeCurrentRepoDb,
    loadNotes: mocks.loadNotes,
    loadLeaves: mocks.loadLeaves,
    getPersistedCommitSha: mocks.getPersistedCommitSha,
    getPersistedLastPulledPushCount: mocks.getPersistedLastPulledPushCount,
  }
})

vi.mock('../data/metadata-storage', () => ({
  getPersistedMetadata: mocks.getPersistedMetadata,
  flushPersistedMetadata: mocks.flushPersistedMetadata,
  setPersistedMetadata: mocks.setPersistedMetadata,
}))

vi.mock('./auto-save.svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auto-save.svelte')>()
  return {
    ...actual,
    flushPendingSaves: mocks.flushPendingSaves,
  }
})

vi.mock('../api/media/insert-phase', () => ({
  waitForPendingMediaInserts: mocks.waitForPendingMediaInserts,
}))

const { rehydrateForRepo, waitForRehydrate } = await import('./stores.svelte')

/** 明示的に resolve/reject を外から制御できる Promise */
function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('rehydrateForRepo の直列化 (#297)', () => {
  // #297: rehydrateInFlight / nextRehydrateKey は stores.svelte.ts のモジュール
  // スコープ変数のため、テストが assertion 失敗で早期終了しても次のテストへ
  // 「止まったままの rehydrate」を持ち越さないよう、常にゲートを開けて
  // キューを空にしてから終える。
  let repoAGate: ReturnType<typeof deferred<void>>

  beforeEach(() => {
    vi.clearAllMocks()
    repoAGate = deferred<void>()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    repoAGate.resolve()
    // 直前のテストが assertion 失敗で終わっていても、キューを空にして
    // 次のテストへ pending な rehydrate を持ち越さない。
    await waitForRehydrate().catch(() => {})
  })

  it('実行中に来た切替要求は中間を破棄し、最後に要求された repoKey だけを適用する', async () => {
    mocks.setCurrentRepo.mockImplementation(async (repoKey: string) => {
      if (repoKey === 'repoA') {
        await repoAGate.promise
      }
    })

    // repoA の rehydrate を開始（setCurrentRepo('repoA') の途中で止まる）
    const promiseA = rehydrateForRepo('repoA')
    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
    })
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(1, 'repoA')

    // repoA 実行中に repoB → repoC の順で切替要求が来る（中間の repoB は破棄される想定）
    const promiseB = rehydrateForRepo('repoB')
    const promiseC = rehydrateForRepo('repoC')

    // 3つの呼び出し元 Promise は「最終適用の完了」で揃って resolve する仕様
    expect(promiseB).toBe(promiseA)
    expect(promiseC).toBe(promiseA)

    // repoA の setCurrentRepo をまだ止めているので、repoB は一切適用されない
    expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)

    // repoA の処理を進める
    repoAGate.resolve()
    await promiseA

    // repoB を経由せず、最後に要求された repoC だけが repoA の後に適用される
    expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(2)
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(1, 'repoA')
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(2, 'repoC')

    // 3つの Promise はすべて解決済み
    await Promise.all([promiseA, promiseB, promiseC])
  })

  it('キューが空になるまで waitForRehydrate() は解決しない', async () => {
    mocks.setCurrentRepo.mockImplementation(async (repoKey: string) => {
      if (repoKey === 'repoA') {
        await repoAGate.promise
      }
    })

    const promiseA = rehydrateForRepo('repoA')
    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
    })

    rehydrateForRepo('repoD')

    let waitResolved = false
    const waitPromise = waitForRehydrate().then(() => {
      waitResolved = true
    })

    // repoA を止めたままなら waitForRehydrate はまだ解決しない
    await Promise.resolve()
    await Promise.resolve()
    expect(waitResolved).toBe(false)

    repoAGate.resolve()
    await promiseA
    await waitPromise

    expect(waitResolved).toBe(true)
    // idle に戻った後は即座に解決する
    await expect(waitForRehydrate()).resolves.toBeUndefined()
  })
})
