// @vitest-environment jsdom
// #317: orphan Push 観測の診断ログ記録。git.test.ts と同じ hoisted モック流儀で、
// recordDiag / recordStaleExtras を差し替えて「記録の有無・内容」と「Push の制御フロー不変」を検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ValueStore<T> = { value: T }

function createStore<T>(value: T): ValueStore<T> {
  return { value }
}

const stores = vi.hoisted(() => ({
  settings: createStore({ token: 'token', repoName: 'owner/repo', branch: 'main' }),
  notes: createStore([{ id: 'note-1', name: 'Note', parentId: null, order: 0 }]),
  leaves: createStore([{ id: 'leaf-1', noteId: 'note-1', content: 'content', order: 0 }]),
  // #293: pushCount 以外のフィールド（version/notes/leaves）も実 Metadata 型に揃えておく。
  // {pushCount:number} のみだと #293 テストで他フィールドの非破壊性を検証する際に
  // excess property error（svelte-check）になるため。
  metadata: createStore({ version: 1, notes: {}, leaves: {}, pushCount: 1 }),
  isDirty: createStore(true),
  isPulling: createStore(false),
  isPushing: createStore(false),
  isPushingBackground: createStore(false),
  isStale: createStore(false),
  lastPushTime: createStore(0),
  lastKnownCommitSha: createStore<string | null>('local-sha'),
  lastPulledPushCount: createStore(0),
  isArchiveLoaded: createStore(false),
  archiveNotes: createStore([]),
  archiveLeaves: createStore([]),
  archiveMetadata: createStore({ pushCount: 0 }),
  leftNote: createStore(null),
  leftLeaf: createStore(null),
  rightNote: createStore(null),
  rightLeaf: createStore(null),
  leftView: createStore('tree'),
  leftWorld: createStore('home'),
  focusedPane: createStore('left'),
}))

const appState = vi.hoisted(() => ({
  isArchiveLoading: false,
  pendingRepoSync: false,
  isFirstPriorityFetched: true,
  isPullCompleted: true,
  isLoadingUI: false,
  selectedIndexLeft: 0,
  selectedIndexRight: 0,
  loadingLeafIds: new Set<string>(),
  leafSkeletonMap: new Map(),
  // #147 綻び2: リポ切替起因 Pull かの判定に使う（既定は通常 pull=false）
  repoChangePending: false,
  // #297 S-c: 同期中にリポ切替された場合の保留 rehydrate 先
  pendingRehydrateRepo: null as string | null,
}))

const diag = vi.hoisted(() => ({
  recordDiag: vi.fn(),
  recordStaleExtras: vi.fn((): Promise<void> => Promise.resolve()),
}))

const mocks = vi.hoisted(() => ({
  choiceAsync: vi.fn(),
  confirmAsync: vi.fn(),
  showPullToast: vi.fn(),
  showPushToast: vi.fn(),
  // #238: Push 完了トースト専用入口（通常完了・タイムアウト・orphan 遅延成功）
  showPushCompletionToast: vi.fn(),
  showStickyPushToast: vi.fn(),
  clearPushToast: vi.fn(),
  // #238: Push 進捗カウントダウン
  setPushToastCountdown: vi.fn(),
  // #238: canSync を差し替え可能に（既定は許可。vi.fn(impl) の既定実装は
  // clearAllMocks で消えないため、テスト側は mockReturnValueOnce で上書きする）
  canSync: vi.fn(() => ({ canPull: true, canPush: true })),
  focusEditor: vi.fn(),
  executePush: vi.fn(),
  executePull: vi.fn(),
  executeStaleCheck: vi.fn(),
  fetchRemotePushCount: vi.fn(),
  testGitHubConnection: vi.fn(),
  translateGitHubMessage: vi.fn((message: string) => message),
  clearAllChanges: vi.fn(),
  flushPendingSaves: vi.fn(),
  flushAllEditors: vi.fn(),
  getActiveEditorPane: vi.fn(() => null),
  getPersistedDirtyFlag: vi.fn(() => false),
  setLastPushedSnapshot: vi.fn(),
  refreshDirtyState: vi.fn(),
  setPushInFlightAt: vi.fn(),
  // #235: 既定「フラグなし」。orphan 継続処理の guarded clear は no-op になる
  getPushInFlightAt: vi.fn((): number | undefined => undefined),
  // #235: 既定は「救済しない」（従来の stale ダイアログ経路を維持）
  tryRescueStalePush: vi.fn(() => false),
  pushToGitHub: vi.fn(),
  saveNotes: vi.fn(),
  saveLeaves: vi.fn(),
  createBackup: vi.fn(async () => ({ notes: [], leaves: [] })),
  restoreFromBackup: vi.fn(),
  clearAllData: vi.fn(),
  // #297: 既定は「rehydrate 実行中でない」＝即解決。個別テストで
  // mockReturnValueOnce により制御可能な Promise に差し替える。
  waitForRehydrate: vi.fn(() => Promise.resolve()),
  // #297 S-c: 同期中にリポ切替された場合、予約 pull 開始前に呼ばれる
  rehydrateForRepo: vi.fn(async () => {}),
}))

vi.mock('../stores', () => ({
  ...stores,
  clearAllChanges: mocks.clearAllChanges,
  getPersistedDirtyFlag: mocks.getPersistedDirtyFlag,
  executeStaleCheck: mocks.executeStaleCheck,
  setLastPushedSnapshot: mocks.setLastPushedSnapshot,
  addLeafToBaseline: vi.fn(),
  addNotesToBaseline: vi.fn(),
  refreshDirtyState: mocks.refreshDirtyState,
  flushPendingSaves: mocks.flushPendingSaves,
  leafStatsStore: { addLeaf: vi.fn() },
  pullProgressStore: { start: vi.fn(), increment: vi.fn(), reset: vi.fn() },
  flushAllEditors: mocks.flushAllEditors,
  getActiveEditorPane: mocks.getActiveEditorPane,
  tryRescueStalePush: mocks.tryRescueStalePush,
  waitForRehydrate: mocks.waitForRehydrate,
  rehydrateForRepo: mocks.rehydrateForRepo,
}))

vi.mock('../api', () => ({
  executePush: mocks.executePush,
  executePull: mocks.executePull,
  testGitHubConnection: mocks.testGitHubConnection,
  translateGitHubMessage: mocks.translateGitHubMessage,
  canSync: mocks.canSync,
  fetchRemotePushCount: mocks.fetchRemotePushCount,
}))

vi.mock('../ui', () => ({
  choiceAsync: mocks.choiceAsync,
  confirmAsync: mocks.confirmAsync,
  showPullToast: mocks.showPullToast,
  showPushToast: mocks.showPushToast,
  showPushCompletionToast: mocks.showPushCompletionToast,
  showStickyPushToast: mocks.showStickyPushToast,
  clearPushToast: mocks.clearPushToast,
  setPushToastCountdown: mocks.setPushToastCountdown,
}))

vi.mock('../data', () => ({
  clearAllData: mocks.clearAllData,
  createBackup: mocks.createBackup,
  restoreFromBackup: mocks.restoreFromBackup,
  saveNotes: mocks.saveNotes,
  saveLeaves: mocks.saveLeaves,
  getPushInFlightAt: mocks.getPushInFlightAt,
  setPushInFlightAt: mocks.setPushInFlightAt,
}))

vi.mock('../utils', () => ({
  isNoteSaveable: () => true,
  isLeafSaveable: () => true,
}))

vi.mock('../app-state.svelte', () => ({
  appState,
  appActions: {
    pushToGitHub: mocks.pushToGitHub,
    resetLeafStats: vi.fn(),
    rebuildLeafStats: vi.fn(),
    restoreStateFromUrl: vi.fn(),
    getEditorView: vi.fn(() => ({ focusEditor: mocks.focusEditor })),
  },
}))

vi.mock('../diagnostics/record', () => ({ recordDiag: diag.recordDiag }))
vi.mock('../diagnostics/stale-extras', () => ({ recordStaleExtras: diag.recordStaleExtras }))

vi.mock('../navigation', () => ({
  getPriorityFromUrl: vi.fn(() => null),
}))

vi.mock('../i18n', () => ({
  _: {
    subscribe(run: (translate: (key: string) => string) => void) {
      run((key: string) => key)
      return () => {}
    },
  },
}))

vi.mock('svelte', () => ({
  get: () => (key: string) => key,
  tick: vi.fn(async () => {}),
}))

const { pushToGitHub } = await import('./git')

const LATE = 'a'.repeat(40)

beforeEach(() => {
  vi.clearAllMocks()
  diag.recordDiag.mockReset()
  stores.settings.value = { token: 'token', repoName: 'owner/repo', branch: 'main' }
  stores.isPulling.value = false
  stores.isPushing.value = false
  stores.isPushingBackground.value = false
  stores.isStale.value = false
  stores.lastKnownCommitSha.value = 'local-sha'
  stores.lastPushTime.value = 0
  appState.isArchiveLoading = false
  appState.isFirstPriorityFetched = true
  mocks.getActiveEditorPane.mockReturnValue(null)
  mocks.flushPendingSaves.mockResolvedValue(undefined)
  mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 2 })
  mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
  mocks.tryRescueStalePush.mockReturnValue(false)
  mocks.getPushInFlightAt.mockReturnValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * 30 秒タイムアウトさせて orphan にする。fake timers は有効なまま返す
 * （elapsedMs を Date.now の差で決定論的に検証するため）。
 */
async function runTimeoutPush() {
  let resolvePush!: (v: unknown) => void
  let rejectPush!: (e: unknown) => void
  mocks.executePush.mockImplementation(
    () =>
      new Promise((res, rej) => {
        resolvePush = res
        rejectPush = rej
      })
  )
  vi.useFakeTimers()
  const p = pushToGitHub()
  await vi.advanceTimersByTimeAsync(30_000)
  await p
  const stamp = mocks.setPushInFlightAt.mock.calls.find(
    ([v]) => typeof v === 'number'
  )![0] as number
  return { resolvePush, rejectPush, stamp }
}

/** settle させ、経過時間を進めて then チェーンを流す */
async function settleAfter(ms: number, fn: () => void) {
  await vi.advanceTimersByTimeAsync(ms)
  fn()
  await vi.advanceTimersByTimeAsync(0)
}

const settled = () => diag.recordDiag.mock.calls.filter((c) => c[0] === 'orphan-settled')
const clears = () => diag.recordDiag.mock.calls.filter((c) => c[0] === 'inflight-clear')
const success = {
  success: true,
  message: 'github.pushSuccess',
  variant: 'success',
  commitSha: LATE,
}

describe('observeOrphanPush の診断記録 (#317)', () => {
  it('follow: commitSha と経過時間を記録し、自分のフラグ解除は orphan-settled として記録される', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    await settleAfter(1234, () => resolvePush(success))
    expect(settled()).toEqual([
      ['orphan-settled', { stamp, outcome: 'follow', commitSha: LATE, elapsedMs: 1234 }],
    ])
    expect(clears()).toEqual([['inflight-clear', { stamp, reason: 'orphan-settled' }]])
  })

  it('verify-align: リモート HEAD が orphan コミットと一致', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 1)
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: LATE,
    })
    await settleAfter(500, () => resolvePush(success))
    expect(settled()).toEqual([
      ['orphan-settled', { stamp, outcome: 'verify-align', commitSha: LATE, elapsedMs: 500 }],
    ])
    // 後続 Push のフラグ（stamp+1）は自分のものでないので inflight-clear は記録されない
    expect(clears()).toHaveLength(0)
  })

  it.each([
    ['up_to_date', { status: 'up_to_date' }],
    ['check_failed', { status: 'check_failed', reason: 'net' }],
    ['第三者の stale', { status: 'stale', localCommitSha: 'x', remoteCommitSha: 'f'.repeat(40) }],
  ])('verify-skip: 検証結果が %s', async (_n, check) => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 1)
    mocks.executeStaleCheck.mockResolvedValue(check)
    await settleAfter(10, () => resolvePush(success))
    expect(settled()).toEqual([
      ['orphan-settled', { stamp, outcome: 'verify-skip', commitSha: LATE, elapsedMs: 10 }],
    ])
  })

  it('verify の stale check が throw: 記録されず、従来どおり握りつぶす（unhandled なし）', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 1)
    mocks.executeStaleCheck.mockRejectedValue(new Error('net'))
    await settleAfter(10, () => resolvePush(success))
    expect(settled()).toHaveLength(0)
    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
  })

  it('verify の await 中にリポ切替: 従来どおり全書き込みスキップ（orphan-settled も記録しない。現状の挙動を固定）', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 1)
    mocks.executeStaleCheck.mockImplementation(async () => {
      stores.settings.value = { ...stores.settings.value, repoName: 'owner/other' }
      return { status: 'stale', localCommitSha: 'l', remoteCommitSha: LATE }
    })
    await settleAfter(10, () => resolvePush(success))
    expect(settled()).toHaveLength(0)
    expect(clears()).toHaveLength(0)
  })

  it('failure: success=false で resolve。commitSha は記録しない', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    await settleAfter(77, () =>
      resolvePush({ success: false, message: 'github.error', variant: 'error' })
    )
    expect(settled()).toEqual([['orphan-settled', { stamp, outcome: 'failure', elapsedMs: 77 }]])
    expect(clears()).toEqual([['inflight-clear', { stamp, reason: 'orphan-settled' }]])
  })

  it('rejected: 遅延 reject', async () => {
    const { rejectPush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    await settleAfter(5, () => rejectPush(new Error('network down')))
    expect(settled()).toEqual([['orphan-settled', { stamp, outcome: 'rejected', elapsedMs: 5 }]])
    expect(clears()).toEqual([['inflight-clear', { stamp, reason: 'orphan-settled' }]])
  })

  it('repo-switched（resolve 経路）: outcome を記録、inflight-clear は記録されない', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    stores.settings.value = { ...stores.settings.value, repoName: 'owner/other' }
    await settleAfter(3, () => resolvePush(success))
    expect(settled()).toEqual([
      ['orphan-settled', { stamp, outcome: 'repo-switched', elapsedMs: 3 }],
    ])
    expect(clears()).toHaveLength(0)
  })

  it('repo-switched（reject 経路）: outcome を記録、inflight-clear は記録されない', async () => {
    const { rejectPush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    stores.settings.value = { ...stores.settings.value, repoName: 'owner/other' }
    await settleAfter(3, () => rejectPush(new Error('x')))
    expect(settled()).toEqual([
      ['orphan-settled', { stamp, outcome: 'repo-switched', elapsedMs: 3 }],
    ])
    expect(clears()).toHaveLength(0)
  })

  it('全 outcome で elapsedMs は非負整数', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    await settleAfter(0, () => resolvePush(success))
    const e = settled()[0][1].elapsedMs
    expect(Number.isInteger(e)).toBe(true)
    expect(e).toBeGreaterThanOrEqual(0)
  })

  it('記録しても従来の挙動（SHA 追従・stale 解消・トースト・フラグ解除）は不変', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    stores.isStale.value = true
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    await settleAfter(1, () => resolvePush(success))
    expect(stores.lastKnownCommitSha.value).toBe(LATE)
    expect(stores.isStale.value).toBe(false)
    expect(mocks.showPushCompletionToast).toHaveBeenCalledWith('toast.pushLateSuccess', 'success')
    expect(mocks.setPushInFlightAt).toHaveBeenCalledWith(undefined)
  })
})
