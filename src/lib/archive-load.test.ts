/**
 * performArchiveLoad の archiveLoadInFlight 寿命のテスト（#314 M3）。
 *
 * 以前は「ロード本体＋ロック解放」の後、さらに runPendingRepoSyncIfIdle() が
 * 完了するまで archiveLoadInFlight を null にしていなかった。この窓
 * （isArchiveLoading=false になった後・runPendingRepoSyncIfIdle() 完了前）に
 * 別の performArchiveLoad() 呼び出しが来ると、新しいロードを始めず「実質完了済みの
 * 旧い Promise」をそのまま返してしまい、新しい呼び出し元は自分のデータが
 * ロードされたと誤認する可能性があった。
 *
 * 修正: archiveLoadInFlight の寿命を「ロックが立っている期間」と厳密に一致させる
 * （isArchiveLoading=false にするのと同じ finally 内で null に戻す）。
 * runPendingRepoSyncIfIdle() はその外（最初の呼び出し元の流れ）で行い、
 * 「ロード後に予約同期が走る」という副作用自体は保つ。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ValueStore<T> = { value: T }
function createStore<T>(value: T): ValueStore<T> {
  return { value }
}

const stores = vi.hoisted(() => ({
  archiveNotes: createStore<unknown[]>([]),
  archiveLeaves: createStore<unknown[]>([]),
  archiveMetadata: createStore({ pushCount: 0 }),
  isArchiveLoaded: createStore(false),
  isDirty: createStore(false),
  settings: createStore({ token: 't', repoName: 'owner/repo' }),
}))

const appState = vi.hoisted(() => ({
  isArchiveLoading: false,
}))

const mocks = vi.hoisted(() => ({
  pullArchive: vi.fn(),
  archiveLeafStatsStore: { addLeaf: vi.fn(), reset: vi.fn(), rebuild: vi.fn() },
  setArchiveBaseline: vi.fn(),
  saveArchiveNotes: vi.fn(async () => {}),
  saveArchiveLeaves: vi.fn(async () => {}),
  loadArchiveNotes: vi.fn(async () => [] as unknown[]),
  loadArchiveLeaves: vi.fn(async () => [] as unknown[]),
  showPullToast: vi.fn(),
  translateGitHubMessage: vi.fn((m: string) => m),
  // M3 の核: runPendingRepoSyncIfIdle をテストから制御可能な Promise にする。
  runPendingRepoSyncIfIdle: vi.fn(),
}))

vi.mock('./stores', () => ({
  ...stores,
  archiveLeafStatsStore: mocks.archiveLeafStatsStore,
  setArchiveBaseline: mocks.setArchiveBaseline,
}))

vi.mock('./app-state.svelte', () => ({ appState }))

vi.mock('./data', () => ({
  saveArchiveNotes: mocks.saveArchiveNotes,
  saveArchiveLeaves: mocks.saveArchiveLeaves,
  loadArchiveNotes: mocks.loadArchiveNotes,
  loadArchiveLeaves: mocks.loadArchiveLeaves,
}))

vi.mock('./api', () => ({
  pullArchive: mocks.pullArchive,
  translateGitHubMessage: mocks.translateGitHubMessage,
}))

vi.mock('./ui', () => ({
  showPullToast: mocks.showPullToast,
}))

vi.mock('./actions/git-pull', () => ({
  runPendingRepoSyncIfIdle: mocks.runPendingRepoSyncIfIdle,
}))

vi.mock('./i18n', () => ({
  _: { subscribe: (run: (t: (k: string) => string) => void) => (run((k) => k), () => {}) },
}))

vi.mock('svelte/store', () => ({ get: vi.fn(() => (k: string) => k) }))

const { performArchiveLoad } = await import('./archive-load.svelte')

beforeEach(() => {
  vi.clearAllMocks()
  stores.archiveNotes.value = []
  stores.archiveLeaves.value = []
  stores.isArchiveLoaded.value = false
  stores.isDirty.value = false
  stores.settings.value = { token: 't', repoName: 'owner/repo' }
  appState.isArchiveLoading = false
  mocks.loadArchiveNotes.mockResolvedValue([])
  mocks.loadArchiveLeaves.mockResolvedValue([])
  mocks.saveArchiveNotes.mockResolvedValue(undefined)
  mocks.saveArchiveLeaves.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('performArchiveLoad の archiveLoadInFlight 寿命（#314 M3）', () => {
  it('runPendingRepoSyncIfIdle 待機中に来た新しい呼び出しは、古い（実質完了済みの）Promise を掴まず新しいロードを始める', async () => {
    let resolveRunPendingSync!: () => void
    mocks.runPendingRepoSyncIfIdle.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRunPendingSync = resolve
      })
    )

    mocks.pullArchive
      .mockResolvedValueOnce({
        success: true,
        notes: [{ id: 'n1' }],
        leaves: [{ id: 'l1' }],
        metadata: { pushCount: 1 },
      })
      .mockResolvedValueOnce({
        success: true,
        notes: [{ id: 'n2' }],
        leaves: [{ id: 'l2' }],
        metadata: { pushCount: 2 },
      })

    const first = performArchiveLoad()

    // 1回目のロードが完了し、ロックが外れるまで待つ。runPendingRepoSyncIfIdle は
    // まだ未解決（テストが握っている）ため、この時点では「ロード完了後・
    // 予約同期完了前」の窓にいる。
    await vi.waitFor(() => {
      expect(appState.isArchiveLoading).toBe(false)
    })
    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)

    // この窓の間に2回目の呼び出しが来る。archiveLoadInFlight の寿命がロック期間と
    // 一致していれば（M3 の修正）、これは新しいロードを始める（pullArchive 2回目）。
    // 修正前は archiveLoadInFlight がまだ1回目の（実質完了済みの）Promise を
    // 指していたため、2回目はそれをそのまま返し、pullArchive は呼ばれなかった。
    // 両方の呼び出しの戻り Promise は runPendingRepoSyncIfIdle() の完了も含む
    // （テストが握っている）ため、先に解決してから待つ（さもないと自己デッドロック）。
    const second = performArchiveLoad()

    await vi.waitFor(() => {
      expect(mocks.pullArchive).toHaveBeenCalledTimes(2)
    })
    expect(stores.archiveNotes.value).toEqual([{ id: 'n2' }])

    resolveRunPendingSync()
    await Promise.all([first, second])
  })

  it('ロード後に予約同期（runPendingRepoSyncIfIdle）が最初の呼び出しの流れとして必ず走る（挙動は保つ）', async () => {
    mocks.runPendingRepoSyncIfIdle.mockResolvedValue(undefined)
    mocks.pullArchive.mockResolvedValueOnce({
      success: true,
      notes: [],
      leaves: [],
      metadata: { pushCount: 1 },
    })

    await performArchiveLoad()

    expect(mocks.runPendingRepoSyncIfIdle).toHaveBeenCalledTimes(1)
  })
})
