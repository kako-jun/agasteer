// @vitest-environment jsdom
/**
 * pullFromGitHub と restoreStateFromUrl（本物）を組み合わせたデッドロック回帰テスト
 * （#314 M1/S3）。
 *
 * git-pull.ts の onPriorityComplete は restoreStateFromUrl を await せずに呼ぶ
 * （型上 `() => void`）。restoreStateFromUrl がアーカイブロードを必要とする場合、
 * 内部で isPulling/isPushing/isPushingBackground/isArchiveLoading の busy 待ち
 * （waitForSyncIdle）に入る。
 *
 * 起動時キャンセル（onCancel）経由の呼び出しは pullFromGitHub 自身が
 * `await onCancel?.()` する。onCancel（例: applyPersistedStartupCache）が
 * restoreStateFromUrl を await する実装だと、isPulling を解放する前に呼ぶと
 * 相互待機でデッドロックする（M1）。修正はキャンセル分岐で isPulling を先に
 * 解放してから onCancel を呼ぶこと。
 *
 * このファイルは restoreStateFromUrl を vi.fn() のスタブにせず本物
 * （pane-navigation.svelte.ts）を使い、git-pull.ts と同じ `../stores`
 * （フェイクの通知付き store）を共有することで、両者が同じ isPulling/
 * isArchiveLoading を見るようにする。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ValueStore<T> = { value: T }
function createStore<T>(value: T): ValueStore<T> {
  return { value }
}

// #314 S1: フェイク版の同期シグナル。isPulling 等のフェイク setter と
// vi.mock('../stores/sync-signal', ...) の両方から参照する。
const syncSignal = vi.hoisted(() => {
  const waiters = new Set<() => void>()
  return {
    notify: () => {
      const toResolve = [...waiters]
      waiters.clear()
      for (const resolve of toResolve) resolve()
    },
    wait: (): Promise<void> => new Promise((resolve) => waiters.add(resolve)),
  }
})

function createNotifyingStore<T>(value: T): ValueStore<T> {
  let v = value
  return {
    get value() {
      return v
    },
    set value(nv: T) {
      v = nv
      syncSignal.notify()
    },
  }
}

const stores = vi.hoisted(() => ({
  settings: createStore({ token: 't', repoName: 'owner/repo' }),
  notes: createStore<unknown[]>([]),
  leaves: createStore<unknown[]>([]),
  rootNotes: createStore<unknown[]>([]),
  metadata: createStore({ version: 1, notes: {}, leaves: {}, pushCount: 1 }),
  isDirty: createStore(false),
  isStale: createStore(false),
  lastKnownCommitSha: createStore<string | null>('local-sha'),
  lastPulledPushCount: createStore(0),
  archiveNotes: createStore<unknown[]>([]),
  archiveLeaves: createStore<unknown[]>([]),
  archiveMetadata: createStore({ pushCount: 0 }),
  isArchiveLoaded: createStore(false),
  leftNote: createStore<unknown>(null),
  rightNote: createStore<unknown>(null),
  leftLeaf: createStore<unknown>(null),
  rightLeaf: createStore<unknown>(null),
  leftView: createStore('home'),
  rightView: createStore('home'),
  leftInitialLine: createStore<number | null>(null),
  rightInitialLine: createStore<number | null>(null),
  focusedPane: createStore('left'),
  leftWorld: createStore('home'),
  rightWorld: createStore('home'),
  offlineLeafStore: createStore({ content: '', badgeIcon: '', badgeColor: '' }),
  waitForRehydrate: vi.fn(() => Promise.resolve()),
  isRehydrating: vi.fn(() => false),
  rehydrateForRepo: vi.fn(async () => {}),
}))

const syncFlags = vi.hoisted(() => ({}) as Record<string, ValueStore<boolean>>)

const appState = vi.hoisted(() => {
  let archiveLoading = false
  return {
    isDualPane: false,
    get isArchiveLoading() {
      return archiveLoading
    },
    set isArchiveLoading(v: boolean) {
      archiveLoading = v
      syncSignal.notify()
    },
    pendingRepoSync: false,
    pendingRehydrateRepo: null as string | null,
    repoChangePending: false,
    isFirstPriorityFetched: false,
    isLoadingUI: false,
    isPullCompleted: false,
    isRestoringFromUrl: false,
    selectedIndexLeft: 0,
    selectedIndexRight: 0,
    loadingLeafIds: new Set<string>(),
    leafSkeletonMap: new Map(),
  }
})

const mocks = vi.hoisted(() => ({
  executePull: vi.fn(),
  translateGitHubMessage: vi.fn((m: string) => m),
  canSync: vi.fn(() => ({ canPull: true, canPush: true })),
  fetchRemotePushCount: vi.fn(async () => ({ status: 'success', pushCount: 1 })),
  pullArchive: vi.fn(),
  choiceAsync: vi.fn(),
  showPullToast: vi.fn(),
  showPushToast: vi.fn(),
  clearAllData: vi.fn(async () => {}),
  createBackup: vi.fn(async () => ({ notes: [], leaves: [] })),
  restoreFromBackup: vi.fn(async () => {}),
  saveNotes: vi.fn(async () => {}),
  saveLeaves: vi.fn(async () => {}),
  saveArchiveNotes: vi.fn(async () => {}),
  saveArchiveLeaves: vi.fn(async () => {}),
  loadArchiveNotes: vi.fn(async () => [] as unknown[]),
  loadArchiveLeaves: vi.fn(async () => [] as unknown[]),
  setArchiveBaseline: vi.fn(),
  getPersistedDirtyFlag: vi.fn(() => false),
  executeStaleCheck: vi.fn(),
  setLastPushedSnapshot: vi.fn(),
  refreshDirtyState: vi.fn(),
  runPendingRepoSyncIfIdleShared: vi.fn(async () => false),
  extractWorldPrefix: vi.fn((_path: string): { world: string } => ({ world: 'home' })),
  resolvePath: vi.fn(
    (
      _path: string
    ): { type: string; world: string; note: unknown; leaf: unknown; isPreview: boolean } => ({
      type: 'home',
      world: 'archive',
      note: null,
      leaf: null,
      isPreview: false,
    })
  ),
}))

vi.mock('../stores', () => {
  syncFlags.isPulling = createNotifyingStore(false)
  syncFlags.isPushing = createNotifyingStore(false)
  syncFlags.isPushingBackground = createNotifyingStore(false)
  return {
    ...stores,
    isPulling: syncFlags.isPulling,
    isPushing: syncFlags.isPushing,
    isPushingBackground: syncFlags.isPushingBackground,
    getPersistedDirtyFlag: mocks.getPersistedDirtyFlag,
    executeStaleCheck: mocks.executeStaleCheck,
    setLastPushedSnapshot: mocks.setLastPushedSnapshot,
    addLeafToBaseline: vi.fn(),
    addNotesToBaseline: vi.fn(),
    refreshDirtyState: mocks.refreshDirtyState,
    leafStatsStore: { addLeaf: vi.fn() },
    pullProgressStore: { start: vi.fn(), increment: vi.fn(), reset: vi.fn() },
    flushAllEditors: vi.fn(),
    archiveLeafStatsStore: { addLeaf: vi.fn(), reset: vi.fn(), rebuild: vi.fn() },
    getDialogPositionForPane: vi.fn(() => ({ top: 0, left: 0 })),
    getNotesForWorld: vi.fn(() => []),
    getLeavesForWorld: vi.fn(() => []),
    setArchiveBaseline: mocks.setArchiveBaseline,
    scheduleOfflineSave: vi.fn(),
  }
})

vi.mock('../stores/sync-signal', () => ({
  notifySyncActivityChanged: syncSignal.notify,
  waitForSyncActivityChange: syncSignal.wait,
}))

// appActions.restoreStateFromUrl は後段で本物に差し替える（下記参照）。
const appActionsMock = vi.hoisted(
  () =>
    ({
      restoreStateFromUrl: undefined,
      pushToGitHub: vi.fn(),
      resetLeafStats: vi.fn(),
      rebuildLeafStats: vi.fn(),
      getEditorView: vi.fn(() => ({ focusEditor: vi.fn() })),
    }) as unknown as {
      restoreStateFromUrl: (alreadyRestoring?: boolean) => Promise<void>
      pushToGitHub: () => Promise<void>
      resetLeafStats: () => void
      rebuildLeafStats: () => void
      getEditorView: () => unknown
    }
)

vi.mock('../app-state.svelte', () => ({
  appState,
  appActions: appActionsMock,
  derivedState: { currentOfflineLeaf: null },
  getNotesForPane: vi.fn(() => []),
  getLeavesForPane: vi.fn(() => []),
  getWorldForPane: vi.fn(() => 'home'),
}))

vi.mock('../api', () => ({
  executePull: mocks.executePull,
  translateGitHubMessage: mocks.translateGitHubMessage,
  canSync: mocks.canSync,
  fetchRemotePushCount: mocks.fetchRemotePushCount,
  pullArchive: mocks.pullArchive,
}))

vi.mock('../ui', () => ({
  choiceAsync: mocks.choiceAsync,
  confirmAsync: vi.fn(),
  showPullToast: mocks.showPullToast,
  showPushToast: mocks.showPushToast,
  getBreadcrumbs: vi.fn(() => []),
  handlePaneScroll: vi.fn(),
}))

vi.mock('../data', () => ({
  clearAllData: mocks.clearAllData,
  createBackup: mocks.createBackup,
  restoreFromBackup: mocks.restoreFromBackup,
  saveNotes: mocks.saveNotes,
  saveLeaves: mocks.saveLeaves,
  saveArchiveNotes: mocks.saveArchiveNotes,
  saveArchiveLeaves: mocks.saveArchiveLeaves,
  loadArchiveNotes: mocks.loadArchiveNotes,
  loadArchiveLeaves: mocks.loadArchiveLeaves,
  saveOfflineLeaf: vi.fn(),
}))

vi.mock('../utils', () => ({
  priorityItems: createStore([]),
  createPriorityLeaf: vi.fn(),
  isPriorityLeaf: vi.fn(() => false),
  createOfflineLeaf: vi.fn(),
  isOfflineLeaf: vi.fn(() => false),
}))

vi.mock('../navigation', () => ({
  getPriorityFromUrl: vi.fn(() => null),
  goHome: vi.fn(),
  selectNote: vi.fn(),
  switchPane: vi.fn(),
  togglePreview: vi.fn(),
  resolvePath: mocks.resolvePath,
  buildPath: vi.fn(() => '/'),
  extractWorldPrefix: mocks.extractWorldPrefix,
}))

vi.mock('../editor/wait-for-editor', () => ({
  waitForMatchingEditor: vi.fn(async () => null),
}))

vi.mock('../actions/move', () => ({
  moveNoteToWorld: vi.fn(),
  moveLeafToWorld: vi.fn(),
}))

vi.mock('../sync/repo-sync-queue', () => ({
  runPendingRepoSyncIfIdle: mocks.runPendingRepoSyncIfIdleShared,
}))

vi.mock('../i18n', () => ({
  _: { subscribe: (run: (t: (k: string) => string) => void) => (run((k) => k), () => {}) },
}))

vi.mock('svelte-i18n', () => ({
  locale: { subscribe: (run: (v: string) => void) => (run('ja'), () => {}) },
}))

vi.mock('svelte', () => ({ tick: vi.fn(async () => {}) }))
vi.mock('svelte/store', () => ({ get: vi.fn(() => (k: string) => k) }))

const { pullFromGitHub } = await import('./git-pull')
const { restoreStateFromUrl, updateUrlFromState } = await import('../pane-navigation.svelte')
// git-pull.ts の onPriorityComplete/onCancel は appActions.restoreStateFromUrl 経由で
// 呼ぶ。本物の restoreStateFromUrl（pane-navigation.svelte.ts）に配線する。
appActionsMock.restoreStateFromUrl = restoreStateFromUrl

function setArchiveUrl() {
  window.history.pushState({}, '', '/?left=%2Farchive%2Fx')
}

beforeEach(() => {
  vi.clearAllMocks()
  syncFlags.isPulling.value = false
  syncFlags.isPushing.value = false
  syncFlags.isPushingBackground.value = false
  stores.isDirty.value = false
  stores.isStale.value = false
  stores.isArchiveLoaded.value = false
  stores.archiveNotes.value = []
  stores.archiveLeaves.value = []
  stores.settings.value = { token: 't', repoName: 'owner/repo' }
  stores.leftWorld.value = 'home'
  stores.leftNote.value = null
  stores.leftLeaf.value = null
  stores.leftView.value = 'home'
  stores.isRehydrating.mockReturnValue(false)
  appState.isArchiveLoading = false
  appState.isRestoringFromUrl = false
  appState.isFirstPriorityFetched = false
  appState.isPullCompleted = false
  appState.isDualPane = false
  mocks.getPersistedDirtyFlag.mockReturnValue(false)
  mocks.canSync.mockReturnValue({ canPull: true, canPush: true })
  mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
  mocks.resolvePath.mockReturnValue({
    type: 'home',
    world: 'archive',
    note: null,
    leaf: null,
    isPreview: false,
  })
  mocks.pullArchive.mockResolvedValue({
    success: true,
    notes: [],
    leaves: [],
    metadata: { pushCount: 1 },
  })
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('#314 M1/S3: pullFromGitHub × restoreStateFromUrl のデッドロック回帰', () => {
  it('onPriorityComplete（await しない経路）: restoreStateFromUrl は Pull の finally 後に解決し、デッドロックしない', async () => {
    setArchiveUrl()
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: 'remote-sha',
    })

    let resolveExecutePull!: (v: unknown) => void
    mocks.executePull.mockImplementation(async (_settings: unknown, options: any) => {
      options.onStructure([], { version: 1, notes: {}, leaves: {}, pushCount: 0 }, [])
      // 実物と同じく onPriorityComplete は await されない。この呼び出しの中で
      // appActions.restoreStateFromUrl(true) が発火する（onPriorityComplete 実装）。
      options.onPriorityComplete()
      return new Promise((resolve) => {
        resolveExecutePull = resolve
      })
    })

    const pullPromise = pullFromGitHub(true, undefined, undefined)

    // onPriorityComplete が発火した直後もまだ Pull 自身は完了していない
    // （isPulling はまだ true）。restoreStateFromUrl はこの isPulling を見て
    // busy 待ちに入るため、Pull がまだ完了していないこの時点では
    // アーカイブロードはまだ開始していない。waitForRehydrate/waitForPendingMediaInserts/
    // tick/executeStaleCheck/createBackup/clearAllData と複数の await を経て
    // executePull に到達するため、固定回数の Promise.resolve() ではなく
    // vi.waitFor でそこまで到達するのを待つ。
    await vi.waitFor(() => {
      expect(mocks.executePull).toHaveBeenCalled()
    })
    expect(syncFlags.isPulling.value).toBe(true)
    expect(appState.isArchiveLoading).toBe(false)
    expect(mocks.pullArchive).not.toHaveBeenCalled()
    // #314 Q1: onPriorityComplete は appActions.restoreStateFromUrl(false) を
    // 発火させた直後にこの関数へ戻る（restoreStateFromUrl 自身は archive 待機で
    // まだ pending）。以前は isInitialStartup 分岐だけ、この直後に
    // isRestoringFromUrl を手動で false へ戻していた。ここではまだ true のままで
    // あるべき（さもないと待機中の $effect が updateUrlFromState を素通りさせ、
    // pushState で履歴を余分に積む）。
    expect(appState.isRestoringFromUrl).toBe(true)

    // Pull 自体を完了させる（finally で isPulling が false になる）
    resolveExecutePull({
      success: true,
      notes: [],
      leaves: [],
      metadata: { version: 1, notes: {}, leaves: {}, pushCount: 0 },
      message: 'ok',
      variant: 'success',
    })
    await pullPromise

    expect(syncFlags.isPulling.value).toBe(false)
    // Pull 完了直後もまだ restoreStateFromUrl 自体は archive ロード中で
    // 解決していないため、isRestoringFromUrl はまだ true のまま。
    expect(appState.isRestoringFromUrl).toBe(true)

    // onPriorityComplete から発火した（未 await の）restoreStateFromUrl も、
    // Pull の finally 後にブロック解除されて最後まで解決する（デッドロックしない）。
    // appActions.restoreStateFromUrl は本物の関数参照であり、onPriorityComplete が
    // 呼んだ結果の Promise は外から直接掴めないため、pullArchive の呼び出しと
    // isArchiveLoading の解除という観測可能な副作用で完走を確認する。
    await vi.waitFor(() => {
      expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(appState.isArchiveLoading).toBe(false)
    })
    // #314 Q1: 待機後の解決が完全に終わった時点で、restoreStateFromUrl 自身が
    // isRestoringFromUrl を false に戻す（世代管理により、古い呼び出しに
    // 上書きされていなければ最終的に必ず解除される）。
    await vi.waitFor(() => {
      expect(appState.isRestoringFromUrl).toBe(false)
    })
  })

  it('onCancel（await する経路）: isPulling を解放してから呼ぶため、onCancel が本物の restoreStateFromUrl を await してもデッドロックしない', async () => {
    // 起動時ダーティ → キャンセル選択で onCancel が発火する経路
    stores.isDirty.value = true
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: 'remote-sha',
    })
    mocks.choiceAsync.mockResolvedValue('cancel')
    setArchiveUrl()

    // applyPersistedStartupCache 相当: onCancel は本物の restoreStateFromUrl(true) を
    // await する（これが M1 のデッドロック経路そのもの）。
    const onCancel = async () => {
      await restoreStateFromUrl(true)
    }

    await expect(pullFromGitHub(true, onCancel)).resolves.toBeUndefined()

    expect(syncFlags.isPulling.value).toBe(false)
    expect(mocks.executePull).not.toHaveBeenCalled()
    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
    expect(appState.isArchiveLoading).toBe(false)
  })

  // #314 S1: cancel/push-first 分岐は onCancel/pushToGitHub を待つ前に isPulling を
  // 早期解放する。その解放後、別の Pull がこのロックを取ることがある。早期解放した
  // 側の末尾 finally が無条件に isPulling=false へ戻すと、その間に他の Pull が
  // 取ったロックを誤って消してしまう（lockReleased ガードが無いとここが壊れる）。
  it('cancel分岐で早期解放した後に別のPullがロックを取っても、onCancel完了後のfinallyがそのロックを誤って消さない', async () => {
    // Pull A: dirty → cancel（isPulling を先に解放してから onCancel を呼ぶ）
    stores.isDirty.value = true
    mocks.executeStaleCheck.mockResolvedValueOnce({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: 'remote-sha',
    })
    mocks.choiceAsync.mockResolvedValueOnce('cancel')

    let resolveOnCancel!: () => void
    const onCancel = () =>
      new Promise<void>((resolve) => {
        resolveOnCancel = resolve
      })

    const pullA = pullFromGitHub(false, onCancel)

    // isPulling=true→false の遷移はすべて mock で即解決する Promise 越しのため
    // マイクロタスクだけで完結し、実タイマー間隔でポーリングする vi.waitFor では
    // 一瞬の true を取りこぼしうる（false→true→false の間に一度もポーリングが
    // 挟まらない可能性がある）。onCancel は cancel 分岐が isPulling を解放した
    // 直後・同期的に呼ばれるため、resolveOnCancel が代入されたことを待てば
    // 「ロックは既に解放済み」を確実に確認できる（true の取りこぼしを気にしなくてよい）。
    await vi.waitFor(() => {
      expect(typeof resolveOnCancel).toBe('function')
    })
    expect(syncFlags.isPulling.value).toBe(false)

    // A の onCancel がまだ pending の間に、別の Pull B が来てロックを取る
    // （B は executeStaleCheck を永久に pending にして、ロックを持ったまま止める）。
    stores.isDirty.value = false
    mocks.executeStaleCheck.mockReturnValueOnce(new Promise(() => {}))
    const pullB = pullFromGitHub(false)

    await vi.waitFor(() => {
      expect(syncFlags.isPulling.value).toBe(true)
    })

    // A の onCancel を完了させる。lockReleased ガードがあれば、A の finally は
    // isPulling に触らない（触ると B が持っているロックが消えてしまう）。
    resolveOnCancel()
    await pullA

    // B はまだ実行中（executeStaleCheck が pending のまま）なので、ロックは
    // true のまま保たれているはず。
    expect(syncFlags.isPulling.value).toBe(true)

    void pullB
  })

  // #314 S5: 起動時（isInitialStartup=true）の分岐だけでなく、通常時（Pull(overwrite)/
  // Push first/Cancel の3択）の Cancel 分岐でも同じ理由（先に isPulling を解放してから
  // onCancel を呼ぶ）でデッドロックしないことを固定する。
  it('onCancel（通常時キャンセル分岐、await する経路）: isPulling を解放してから呼ぶため、onCancel が本物の restoreStateFromUrl を await してもデッドロックしない', async () => {
    stores.isDirty.value = true
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: 'remote-sha',
    })
    mocks.choiceAsync.mockResolvedValue('cancel')
    setArchiveUrl()

    const onCancel = async () => {
      await restoreStateFromUrl(true)
    }

    await expect(pullFromGitHub(false, onCancel)).resolves.toBeUndefined()

    expect(syncFlags.isPulling.value).toBe(false)
    expect(mocks.executePull).not.toHaveBeenCalled()
    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
    expect(appState.isArchiveLoading).toBe(false)
  })
})
