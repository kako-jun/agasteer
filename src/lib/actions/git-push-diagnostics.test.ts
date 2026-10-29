// @vitest-environment jsdom
// #317: Push 経路の診断ログ記録。git.test.ts と同じ hoisted モック流儀で、
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

const { pushToGitHub, pullFromGitHub } = await import('./git')

const SUCCESS = {
  success: true,
  message: 'github.pushSuccess',
  variant: 'success',
  commitSha: 'a'.repeat(40),
  parentSha: 'b'.repeat(40),
}

const diagCalls = (kind: string) => diag.recordDiag.mock.calls.filter((c) => c[0] === kind)

beforeEach(() => {
  vi.clearAllMocks()
  diag.recordDiag.mockReset()
  diag.recordStaleExtras.mockReset()
  diag.recordStaleExtras.mockImplementation(() => Promise.resolve())
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
})

afterEach(() => {
  vi.useRealTimers()
})

describe('stale 検出時の追加観測 (#317)', () => {
  const stale = {
    status: 'stale',
    localCommitSha: 'c'.repeat(40),
    remoteCommitSha: 'd'.repeat(40),
  }

  it('stale 以外（up_to_date）では recordStaleExtras を呼ばず stale-detected も記録しない', async () => {
    mocks.executePush.mockResolvedValue(SUCCESS)
    await pushToGitHub()
    expect(diag.recordStaleExtras).not.toHaveBeenCalled()
    expect(diagCalls('stale-detected')).toHaveLength(0)
  })

  it('check_failed でも recordStaleExtras を呼ばない', async () => {
    mocks.executeStaleCheck.mockResolvedValue({ status: 'check_failed', reason: 'x' })
    mocks.executePush.mockResolvedValue(SUCCESS)
    await pushToGitHub()
    expect(diag.recordStaleExtras).not.toHaveBeenCalled()
  })

  it('stale のときだけ stale-detected と recordStaleExtras が 1 回ずつ（全桁 SHA を渡す）', async () => {
    mocks.executeStaleCheck.mockResolvedValue(stale)
    mocks.choiceAsync.mockResolvedValue('cancel')
    await pushToGitHub()
    expect(diagCalls('stale-detected')).toEqual([
      ['stale-detected', { remoteSha: stale.remoteCommitSha, localSha: stale.localCommitSha }],
    ])
    expect(diag.recordStaleExtras).toHaveBeenCalledExactlyOnceWith(
      stores.settings.value,
      stale.remoteCommitSha
    )
  })

  it('recordStaleExtras が永久 pending でも pushToGitHub は従来どおり完了する（await していない）', async () => {
    mocks.executeStaleCheck.mockResolvedValue(stale)
    diag.recordStaleExtras.mockImplementation(() => new Promise<void>(() => {}))
    mocks.choiceAsync.mockResolvedValue('push')
    mocks.executePush.mockResolvedValue(SUCCESS)
    await pushToGitHub()
    expect(mocks.executePush).toHaveBeenCalledTimes(1)
    expect(stores.lastKnownCommitSha.value).toBe(SUCCESS.commitSha)
    expect(stores.isPushing.value).toBe(false)
    expect(stores.isPushingBackground.value).toBe(false)
  })

  it('recordStaleExtras が reject しても Push の成否・結果反映は不変', async () => {
    mocks.executeStaleCheck.mockResolvedValue(stale)
    diag.recordStaleExtras.mockImplementation(() => Promise.reject(new Error('extras failed')))
    mocks.choiceAsync.mockResolvedValue('push')
    mocks.executePush.mockResolvedValue(SUCCESS)
    await expect(pushToGitHub()).resolves.toBeUndefined()
    expect(stores.lastKnownCommitSha.value).toBe(SUCCESS.commitSha)
    expect(mocks.showPushCompletionToast).toHaveBeenCalledWith('github.pushSuccess', 'success')
  })

  it('stale + ダイアログ cancel の挙動（isStale=true・Push しない）は不変', async () => {
    mocks.executeStaleCheck.mockResolvedValue(stale)
    mocks.choiceAsync.mockResolvedValue('cancel')
    await pushToGitHub()
    expect(stores.isStale.value).toBe(true)
    expect(mocks.executePush).not.toHaveBeenCalled()
  })
})

describe('Push 成否の記録 (#317)', () => {
  it('成功時: push-success に commitSha・parentSha・stamp・noChanges=false を記録', async () => {
    mocks.executePush.mockResolvedValue(SUCCESS)
    await pushToGitHub()
    const [, data] = diagCalls('push-success')[0]
    expect(diagCalls('push-success')).toHaveLength(1)
    expect(data).toEqual({
      commitSha: SUCCESS.commitSha,
      parentSha: SUCCESS.parentSha,
      stamp: expect.any(Number),
      noChanges: false,
    })
    // stamp は inflight-set と同じ値
    expect(data.stamp).toBe(diagCalls('inflight-set')[0][1].stamp)
  })

  it('noChanges 時: noChanges=true、parentSha は結果の値（現在の HEAD）', async () => {
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.noChanges',
      variant: 'success',
      commitSha: 'e'.repeat(40),
      parentSha: 'e'.repeat(40),
    })
    await pushToGitHub()
    expect(diagCalls('push-success')[0][1]).toMatchObject({
      noChanges: true,
      commitSha: 'e'.repeat(40),
      parentSha: 'e'.repeat(40),
    })
  })

  it('commitSha / parentSha が無い成功は null で記録（undefined を渡さない）', async () => {
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
    })
    await pushToGitHub()
    expect(diagCalls('push-success')[0][1]).toMatchObject({ commitSha: null, parentSha: null })
  })

  it('成功時は inflight-set → inflight-clear(response) → push-success の順', async () => {
    mocks.executePush.mockResolvedValue(SUCCESS)
    await pushToGitHub()
    const kinds = diag.recordDiag.mock.calls.map((c) => c[0])
    expect(kinds).toEqual(['push-start', 'inflight-set', 'inflight-clear', 'push-success'])
    expect(diagCalls('inflight-clear')[0][1].reason).toBe('response')
  })

  it('エラー結果（variant=error）では push-success を記録しない', async () => {
    mocks.executePush.mockResolvedValue({
      success: false,
      message: 'github.error',
      variant: 'error',
    })
    await pushToGitHub()
    expect(diagCalls('push-success')).toHaveLength(0)
    expect(diagCalls('inflight-clear')[0][1].reason).toBe('response')
  })

  it('executePush が reject（HTTP エラー等）: inflight-clear reason=http-error・例外は従来どおり再送出', async () => {
    mocks.executePush.mockRejectedValue(new Error('HTTP 500'))
    await expect(pushToGitHub()).rejects.toThrow('HTTP 500')
    expect(diagCalls('inflight-clear')).toEqual([
      ['inflight-clear', { stamp: expect.any(Number), reason: 'http-error' }],
    ])
    expect(mocks.setPushInFlightAt).toHaveBeenLastCalledWith(undefined)
    expect(stores.isPushingBackground.value).toBe(false)
  })

  it('30 秒タイムアウト: push-timeout を記録し、追加 GET の遅延に影響されず従来どおり UI ロックを解除', async () => {
    // stale でない通常 Push。executePush は永久 pending。recordStaleExtras 相当が遅くても
    // タイムアウトは Push 開始から 30 秒ちょうどで発火する
    diag.recordStaleExtras.mockImplementation(() => new Promise<void>(() => {}))
    mocks.executePush.mockImplementation(() => new Promise(() => {}))
    vi.useFakeTimers()
    const p = pushToGitHub()
    await vi.advanceTimersByTimeAsync(29_999)
    expect(stores.isPushingBackground.value).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    await p
    expect(stores.isPushingBackground.value).toBe(false)
    expect(diagCalls('push-timeout')).toEqual([
      ['push-timeout', { stamp: expect.any(Number), timeoutMs: 30_000 }],
    ])
    // タイムアウト経路では inflight-clear を記録しない（救済のためフラグを残す）
    expect(diagCalls('inflight-clear')).toHaveLength(0)
  })

  it('stale + recordStaleExtras 永久 pending でも、Push の 30 秒タイムアウトは不変', async () => {
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'c'.repeat(40),
      remoteCommitSha: 'd'.repeat(40),
    })
    mocks.choiceAsync.mockResolvedValue('push')
    diag.recordStaleExtras.mockImplementation(() => new Promise<void>(() => {}))
    mocks.executePush.mockImplementation(() => new Promise(() => {}))
    vi.useFakeTimers()
    const p = pushToGitHub()
    await vi.advanceTimersByTimeAsync(30_000)
    await p
    expect(diagCalls('push-timeout')).toHaveLength(1)
    expect(stores.isPushingBackground.value).toBe(false)
  })
})

describe('Push の開始・失敗 (#317)', () => {
  it('push-start: dirty・件数・auto を整数/bool で記録する（タイトル等は含めない）', async () => {
    mocks.executePush.mockResolvedValue(SUCCESS)
    stores.isDirty.value = true
    await pushToGitHub()
    expect(diagCalls('push-start')).toEqual([
      ['push-start', { dirty: true, auto: false, noteCount: 1, leafCount: 1 }],
    ])
    expect(diag.recordDiag.mock.calls[0][0]).toBe('push-start')
  })

  it('push-start: abortIfStaleCheckFailed 付き（無人発火）は auto=true', async () => {
    mocks.executePush.mockResolvedValue(SUCCESS)
    await pushToGitHub({ abortIfStaleCheckFailed: true })
    expect(diagCalls('push-start')[0][1].auto).toBe(true)
  })

  it('ロック不可で早期 return したときは push-start を記録しない', async () => {
    mocks.canSync.mockReturnValueOnce({ canPull: true, canPush: false })
    await pushToGitHub()
    expect(diagCalls('push-start')).toHaveLength(0)
  })

  it('variant=error: errorCode / httpStatus / rateLimited を stage=result-error で記録する', async () => {
    mocks.executePush.mockResolvedValue({
      success: false,
      message: 'github.error with SECRET text',
      variant: 'error',
      errorCode: 'E-1234',
      httpStatus: 403,
      rateLimitInfo: { isRateLimited: true },
    })
    await pushToGitHub()
    expect(diagCalls('push-failure')).toEqual([
      [
        'push-failure',
        {
          stamp: expect.any(Number),
          stage: 'result-error',
          errorCode: 'E-1234',
          httpStatus: 403,
          rateLimited: true,
        },
      ],
    ])
    expect(JSON.stringify(diag.recordDiag.mock.calls)).not.toContain('SECRET')
  })

  it('成功時は push-failure を記録しない', async () => {
    mocks.executePush.mockResolvedValue(SUCCESS)
    await pushToGitHub()
    expect(diagCalls('push-failure')).toHaveLength(0)
  })

  it('executePush が reject: stage=rejected のみ（メッセージは記録せず）・例外は従来どおり再送出', async () => {
    mocks.executePush.mockRejectedValue(new Error('HTTP 500 ghp_SECRET'))
    await expect(pushToGitHub()).rejects.toThrow('HTTP 500')
    expect(diagCalls('push-failure')).toEqual([
      ['push-failure', { stamp: expect.any(Number), stage: 'rejected' }],
    ])
  })
})

describe('Pull の開始・結果 (#317)', () => {
  const PULL_OK = {
    success: true,
    message: 'github.pullSuccess',
    variant: 'success',
    notes: [{ id: 'n1' }, { id: 'n2' }],
    leaves: [{ id: 'l1', order: 0, content: 'c' }],
    metadata: { pushCount: 3 },
    commitSha: 'a'.repeat(40),
  }

  beforeEach(() => {
    stores.isDirty.value = false
    mocks.getPersistedDirtyFlag.mockReturnValue(false)
    appState.isPullCompleted = false
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'c'.repeat(40),
      remoteCommitSha: 'd'.repeat(40),
    })
  })

  it('成功: pull-start → pull-result(success, 件数, staleStatus) の順', async () => {
    mocks.executePull.mockResolvedValue(PULL_OK)
    await pullFromGitHub(false)
    const kinds = diag.recordDiag.mock.calls.map((c) => c[0])
    expect(kinds).toEqual(['pull-start', 'pull-result'])
    expect(diagCalls('pull-start')[0][1]).toEqual({
      initialStartup: false,
      dirty: false,
      repoSwitch: false,
      staleStatus: 'stale',
    })
    expect(diagCalls('pull-result')[0][1]).toEqual({
      success: true,
      incomplete: false,
      rateLimited: false,
      noteCount: 2,
      leafCount: 1,
      staleStatus: 'stale',
    })
  })

  it('失敗: errorCode / httpStatus / rateLimited を記録し、メッセージ全文は記録しない', async () => {
    mocks.executePull.mockResolvedValue({
      success: false,
      message: 'github.error SECRET_TITLE',
      variant: 'error',
      notes: [],
      leaves: [],
      metadata: { pushCount: 0 },
      errorCode: 'E-2001',
      httpStatus: 404,
    })
    await pullFromGitHub(false)
    expect(diagCalls('pull-result')[0][1]).toMatchObject({
      success: false,
      errorCode: 'E-2001',
      httpStatus: 404,
      rateLimited: false,
    })
    expect(JSON.stringify(diag.recordDiag.mock.calls)).not.toContain('SECRET')
  })

  it('pullIncomplete は incomplete=true', async () => {
    mocks.executePull.mockResolvedValue({
      success: false,
      message: 'github.pullIncomplete',
      variant: 'error',
      notes: [],
      leaves: [],
      metadata: { pushCount: 0 },
    })
    await pullFromGitHub(false)
    expect(diagCalls('pull-result')[0][1].incomplete).toBe(true)
  })

  it('実 Pull が走らない（up_to_date かつ Pull 完了済み）ときは記録しない', async () => {
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
    appState.isPullCompleted = true
    await pullFromGitHub(false)
    expect(diag.recordDiag).not.toHaveBeenCalled()
    expect(mocks.executePull).not.toHaveBeenCalled()
  })

  it('dirty で cancel: conflict-choice のみで pull-start は記録しない（実 conflict-dialog 経由）', async () => {
    stores.isDirty.value = true
    mocks.choiceAsync.mockResolvedValue('cancel')
    await pullFromGitHub(false)
    expect(mocks.executePull).not.toHaveBeenCalled()
    expect(diagCalls('pull-start')).toHaveLength(0)
    expect(diagCalls('conflict-choice')).toEqual([
      ['conflict-choice', { dialogKind: 'pull-dirty', choice: 'cancel' }],
    ])
  })

  it('dirty で pull 選択: conflict-choice(pull) の後 pull-start(dirty=true)', async () => {
    stores.isDirty.value = true
    mocks.choiceAsync.mockResolvedValue('pull')
    mocks.executePull.mockResolvedValue(PULL_OK)
    await pullFromGitHub(false)
    const kinds = diag.recordDiag.mock.calls.map((c) => c[0])
    expect(kinds).toEqual(['conflict-dialog', 'conflict-choice', 'pull-start', 'pull-result'])
    expect(diagCalls('conflict-choice')[0][1]).toEqual({ dialogKind: 'pull-dirty', choice: 'pull' })
    expect(diagCalls('pull-start')[0][1].dirty).toBe(true)
  })
})
