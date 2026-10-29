import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// #317: rehydrate での lastKnownCommitSha 差し替えの診断記録。

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

const diag = vi.hoisted(() => ({ recordDiag: vi.fn() }))
vi.mock('../diagnostics/record', () => ({ recordDiag: diag.recordDiag }))

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
  // #297 T2/T3: isRehydrating ガードの true/false トグルを観測するためのスパイ。
  // 実装（isRehydrating フラグ）自体は本テストファイルの経路では誰も読まないため
  // （initStoreEffects は呼ばれない）、実体呼び出しには委譲せず記録だけする。
  setRehydrating: vi.fn(),
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

// #297 T2/T3: setRehydrating だけスパイに差し替える。他の export（notes/leaves 等）は
// 実物をそのまま通す（rehydrate.svelte.ts 内の他ロジックへの影響を避けるため）。
vi.mock('./stores.svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stores.svelte')>()
  return {
    ...actual,
    setRehydrating: mocks.setRehydrating,
  }
})

// #297 nit11: rehydrateForRepo/waitForRehydrate は rehydrate.svelte.ts へ分離済み
const { rehydrateForRepo, waitForRehydrate } = await import('./rehydrate.svelte')
// #297 T3: 最終適用結果（notes.value）を検証するため、実体ストアも取得する
const { notes: notesStore } = await import('./stores.svelte')

const { lastKnownCommitSha } = await import('./stores.svelte')

const OLD = 'a'.repeat(40)
const NEW = 'b'.repeat(40)

beforeEach(() => {
  vi.clearAllMocks()
  diag.recordDiag.mockReset()
  mocks.setCurrentRepo.mockImplementation(async () => {})
  mocks.loadNotes.mockResolvedValue([])
  mocks.loadLeaves.mockResolvedValue([])
  mocks.getPersistedCommitSha.mockReturnValue(null)
  mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
  mocks.getPersistedMetadata.mockResolvedValue(null)
})

afterEach(async () => {
  await waitForRehydrate().catch(() => {})
})

describe('rehydrate-sha の記録 (#317)', () => {
  it('oldSha / newSha（どちらも SHA）を記録し、store は新しい値に差し替わる', async () => {
    lastKnownCommitSha.value = OLD
    mocks.getPersistedCommitSha.mockReturnValue(NEW)
    await rehydrateForRepo('owner/repo')
    expect(diag.recordDiag).toHaveBeenCalledExactlyOnceWith('rehydrate-sha', {
      oldSha: OLD,
      newSha: NEW,
    })
    expect(lastKnownCommitSha.value).toBe(NEW)
  })

  it('旧値が null でも記録される（oldSha=null）', async () => {
    lastKnownCommitSha.value = null
    mocks.getPersistedCommitSha.mockReturnValue(NEW)
    await rehydrateForRepo('owner/repo')
    expect(diag.recordDiag).toHaveBeenCalledWith('rehydrate-sha', { oldSha: null, newSha: NEW })
  })

  it('新値が null でも記録される（newSha=null）', async () => {
    lastKnownCommitSha.value = OLD
    mocks.getPersistedCommitSha.mockReturnValue(null)
    await rehydrateForRepo('owner/repo')
    expect(diag.recordDiag).toHaveBeenCalledWith('rehydrate-sha', { oldSha: OLD, newSha: null })
  })

  it('途中の要求が破棄された場合、記録は最終適用の 1 回だけ（中間 repoKey の混線値を記録しない）', async () => {
    lastKnownCommitSha.value = OLD
    let gate!: () => void
    const gateP = new Promise<void>((r) => (gate = r))
    mocks.setCurrentRepo.mockImplementation(async (k: string) => {
      if (k === 'repoA') await gateP
    })
    mocks.getPersistedCommitSha.mockReturnValue(NEW)
    const p = rehydrateForRepo('repoA')
    await vi.waitFor(() => expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1))
    void rehydrateForRepo('repoB')
    gate()
    await p
    expect(diag.recordDiag.mock.calls.filter((c) => c[0] === 'rehydrate-sha')).toHaveLength(1)
  })
})
