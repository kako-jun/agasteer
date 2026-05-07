import { beforeEach, describe, expect, it, vi } from 'vitest'

type ValueStore<T> = { value: T }

function createStore<T>(value: T): ValueStore<T> {
  return { value }
}

const stores = vi.hoisted(() => ({
  settings: createStore({ token: 'token', repoName: 'owner/repo', branch: 'main' }),
  notes: createStore([{ id: 'note-1', name: 'Note', parentId: null, order: 0 }]),
  leaves: createStore([{ id: 'leaf-1', noteId: 'note-1', content: 'content', order: 0 }]),
  metadata: createStore({ pushCount: 1 }),
  isDirty: createStore(true),
  isPulling: createStore(false),
  isPushing: createStore(false),
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
}))

const mocks = vi.hoisted(() => ({
  choiceAsync: vi.fn(),
  confirmAsync: vi.fn(),
  showPullToast: vi.fn(),
  showPushToast: vi.fn(),
  executePush: vi.fn(),
  executePull: vi.fn(),
  executeStaleCheck: vi.fn(),
  fetchRemotePushCount: vi.fn(),
  testGitHubConnection: vi.fn(),
  translateGitHubMessage: vi.fn((message: string) => message),
  clearAllChanges: vi.fn(),
  flushPendingSaves: vi.fn(),
  flushAllEditors: vi.fn(),
  getPersistedDirtyFlag: vi.fn(() => false),
  setLastPushedSnapshot: vi.fn(),
  setPushInFlightAt: vi.fn(),
  pushToGitHub: vi.fn(),
}))

vi.mock('../stores', () => ({
  ...stores,
  clearAllChanges: mocks.clearAllChanges,
  getPersistedDirtyFlag: mocks.getPersistedDirtyFlag,
  executeStaleCheck: mocks.executeStaleCheck,
  setLastPushedSnapshot: mocks.setLastPushedSnapshot,
  addLeafToBaseline: vi.fn(),
  addNotesToBaseline: vi.fn(),
  refreshDirtyState: vi.fn(),
  flushPendingSaves: mocks.flushPendingSaves,
  leafStatsStore: { addLeaf: vi.fn() },
  pullProgressStore: { start: vi.fn(), increment: vi.fn(), reset: vi.fn() },
  flushAllEditors: mocks.flushAllEditors,
}))

vi.mock('../api', () => ({
  executePush: mocks.executePush,
  executePull: mocks.executePull,
  testGitHubConnection: mocks.testGitHubConnection,
  translateGitHubMessage: mocks.translateGitHubMessage,
  canSync: () => ({ canPull: true, canPush: true }),
  fetchRemotePushCount: mocks.fetchRemotePushCount,
}))

vi.mock('../ui', () => ({
  choiceAsync: mocks.choiceAsync,
  confirmAsync: mocks.confirmAsync,
  showPullToast: mocks.showPullToast,
  showPushToast: mocks.showPushToast,
}))

vi.mock('../data', () => ({
  clearAllData: vi.fn(),
  createBackup: vi.fn(async () => ({ notes: [], leaves: [] })),
  restoreFromBackup: vi.fn(),
  saveNotes: vi.fn(),
  saveLeaves: vi.fn(),
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
  },
}))

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

describe('pushToGitHub stale handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isStale.value = false
    stores.lastKnownCommitSha.value = 'local-sha'
    stores.lastPushTime.value = 0
    appState.isArchiveLoading = false
    appState.isFirstPriorityFetched = true
    appState.pendingRepoSync = false

    mocks.flushPendingSaves.mockResolvedValue(undefined)
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 2 })
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: 'remote-sha',
    })
  })

  it('keeps the pull badge after a stale manual push is cancelled', async () => {
    mocks.choiceAsync.mockResolvedValue('cancel')

    await pushToGitHub()

    expect(stores.isStale.value).toBe(true)
    expect(mocks.executePush).not.toHaveBeenCalled()
    expect(stores.isPushing.value).toBe(false)
  })

  it('clears the pull badge when stale overwrite succeeds without app-data changes', async () => {
    stores.isStale.value = true
    mocks.choiceAsync.mockResolvedValue('push')
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.noChanges',
      variant: 'success',
      commitSha: 'remote-sha',
    })

    await pushToGitHub()

    expect(stores.lastKnownCommitSha.value).toBe('remote-sha')
    expect(stores.isStale.value).toBe(false)
    expect(mocks.clearAllChanges).not.toHaveBeenCalled()
    expect(mocks.setLastPushedSnapshot).not.toHaveBeenCalled()
  })

  it('flushAllEditors is invoked before flushPendingSaves on push (#186)', async () => {
    // staleではなくup_to_dateにして通常の push パスを通す
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'remote-sha',
    })

    const callOrder: string[] = []
    mocks.flushAllEditors.mockImplementation(() => callOrder.push('flushAllEditors'))
    mocks.flushPendingSaves.mockImplementation(async () => {
      callOrder.push('flushPendingSaves')
    })

    await pushToGitHub()

    expect(mocks.flushAllEditors).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['flushAllEditors', 'flushPendingSaves'])
  })

  it('does not call flushAllEditors when push is blocked at the entry guard (#186 lock invariant)', async () => {
    // canSync は常に true を返すモックなので、archive loading 経路で entry guard を発動させる
    appState.isArchiveLoading = true

    await pushToGitHub()

    expect(mocks.flushAllEditors).not.toHaveBeenCalled()
    expect(mocks.flushPendingSaves).not.toHaveBeenCalled()
  })

  it('releases isPushing lock when executePush hangs past PUSH_TIMEOUT_MS (#204)', async () => {
    // #204: executePush が永遠に pending のままになるケースを fake timers で再現する。
    // Promise.race 内のタイムアウト Promise が reject → finally で isPushing=false → UI ロック解除。
    // pushInFlightAt はクリアされず、次回の stale-check で救済される設計のため、
    // setPushInFlightAt(undefined) はタイムアウト経路では呼ばれないことを確認する。
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
    let resolveExecute: ((v: unknown) => void) | undefined
    mocks.executePush.mockImplementation(
      () =>
        new Promise((res) => {
          resolveExecute = res
        })
    )

    vi.useFakeTimers()
    try {
      const pushPromise = pushToGitHub()
      // 30 秒進めてタイムアウトを発火
      await vi.advanceTimersByTimeAsync(30_000)
      await pushPromise

      expect(stores.isPushing.value).toBe(false)
      // タイムアウト経路では setPushInFlightAt(undefined) は呼ばない（救済機構のためフラグを残す）
      expect(mocks.setPushInFlightAt).toHaveBeenCalledWith(expect.any(Number)) // start 時の 1 回のみ
      expect(mocks.setPushInFlightAt).not.toHaveBeenCalledWith(undefined)
      // タイムアウト時の警告トーストが出ている
      expect(mocks.showPushToast).toHaveBeenCalledWith(expect.any(String), 'error')
    } finally {
      vi.useRealTimers()
      // ぶらさがった executePush を resolve してメモリリークを避ける
      resolveExecute?.({ success: false, message: 'github.cancelled', variant: 'error' })
    }
  })
})

describe('pullFromGitHub dirty-check order (#152)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isStale.value = false
    stores.isDirty.value = true
    stores.lastKnownCommitSha.value = 'local-sha'
    stores.lastPushTime.value = 0
    appState.isArchiveLoading = false
    appState.isFirstPriorityFetched = true
    appState.isPullCompleted = true

    mocks.flushPendingSaves.mockResolvedValue(undefined)
    mocks.getPersistedDirtyFlag.mockReturnValue(false)
  })

  it('skips the overwrite confirmation when remote is up_to_date and pull is already completed', async () => {
    // #152: インポート直後など「ローカル先行＆リモート差分なし」の状態で
    // 誤った「Pullすると上書きされます」警告を出さない。
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })

    await pullFromGitHub(false)

    expect(mocks.choiceAsync).not.toHaveBeenCalled()
    expect(mocks.confirmAsync).not.toHaveBeenCalled()
    expect(mocks.executePull).not.toHaveBeenCalled()
    expect(mocks.showPullToast).toHaveBeenCalledWith('github.noRemoteChanges', 'success')
    expect(stores.isPulling.value).toBe(false)
  })

  it('still prompts on initial startup when dirty even if remote is up_to_date', async () => {
    // 初回Pull（isPullCompleted=false）では up_to_date でも早期リターンせず
    // ダーティ確認が走る（従来挙動を維持）。#201 で confirmAsync 2択から
    // showConflictDialog ('startup-dirty', disablePush:true) の choiceAsync 2択に統一。
    appState.isPullCompleted = false
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 2 })
    mocks.choiceAsync.mockResolvedValue('cancel')

    await pullFromGitHub(true)

    // body 文字列は modal.unsavedChangesOnStartup + diagnostic で、key 連結のためマッチを部分一致で
    expect(mocks.choiceAsync).toHaveBeenCalled()
    const [body, options] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('modal.unsavedChangesOnStartup')
    // disablePush:true のためボタンは pull / cancel の 2 択
    expect(options).toHaveLength(2)
    expect(options.map((o: { value: string }) => o.value)).toEqual(['pull', 'cancel'])
    expect(mocks.executePull).not.toHaveBeenCalled()
  })

  it('prompts overwrite confirmation when remote is stale and local is dirty', async () => {
    // stale かつ dirty の場合は従来どおり3択モーダル。
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: 'remote-sha',
    })
    mocks.choiceAsync.mockResolvedValue('cancel')

    await pullFromGitHub(false)

    expect(mocks.choiceAsync).toHaveBeenCalled()
    expect(mocks.executePull).not.toHaveBeenCalled()
  })

  it('reuses precomputedStale and does not execute a second stale check', async () => {
    appState.isPullCompleted = false
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 2 })
    mocks.choiceAsync.mockResolvedValue('cancel')

    await pullFromGitHub(true, undefined, { status: 'up_to_date' })

    expect(mocks.executeStaleCheck).not.toHaveBeenCalled()
    expect(mocks.choiceAsync).toHaveBeenCalled()
    const [body] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('modal.unsavedChangesOnStartup')
  })
})
