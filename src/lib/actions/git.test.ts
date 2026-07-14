// @vitest-environment jsdom
// #147 綻び2 のスクロールリセットは document.querySelectorAll と実 scrollTop を
// 触るため jsdom が要る。既存 50 件は node でも jsdom でも全パスすることを確認済み
// （setImmediate 等の Node グローバルは jsdom 環境でも利用可能）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
// #254: insert-phase はモックせず実物を使う（push/pull preflight が待つことの結合検証）
const { beginMediaInsertPhase } = await import('../api/media/insert-phase')

/** マイクロタスク＋直近のマクロタスクを流しきる（preflight が進まないことの観測用） */
function flushTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('pushToGitHub stale handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    stores.isStale.value = false
    stores.lastKnownCommitSha.value = 'local-sha'
    stores.focusedPane.value = 'left'
    stores.lastPushTime.value = 0
    appState.isArchiveLoading = false
    appState.isFirstPriorityFetched = true
    appState.pendingRepoSync = false
    mocks.getActiveEditorPane.mockReturnValue(null)

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

  it('restores editor focus to the active editor pane even if focusedPane is stale (#222)', async () => {
    const { appActions } = await import('../app-state.svelte')
    stores.focusedPane.value = 'left'
    mocks.getActiveEditorPane.mockReturnValue('right')
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'remote-sha',
    })

    await pushToGitHub()

    expect(appActions.getEditorView).toHaveBeenCalledWith('right')
    expect(mocks.focusEditor).toHaveBeenCalledTimes(1)
  })

  it('releases isPushing lock when executePush hangs past PUSH_TIMEOUT_MS (#204)', async () => {
    // #204: executePush が永遠に pending のままになるケースを fake timers で再現する。
    // Promise.race 内のタイムアウト Promise が reject → finally で isPushing=false → UI ロック解除。
    // pushInFlightAt はクリアされず、orphan の遅延結果は observeOrphanPush が settle 時に
    // 観測する設計（#235。リロードで continuation ごと消えた場合の保険として
    // 次回 stale-check の tryRescueStalePush 救済も残る）のため、
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
      // タイムアウト時の警告トーストが出ている（完了トースト入口・error は即時表示）
      expect(mocks.showPushCompletionToast).toHaveBeenCalledWith(expect.any(String), 'error')
      // #224: timeout 経路は sticky を error トーストで差し替える設計のため clearPushToast は呼ばない
      expect(mocks.clearPushToast).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      // ぶらさがった executePush を resolve してメモリリークを避ける
      resolveExecute?.({ success: false, message: 'github.cancelled', variant: 'error' })
    }
  })
})

describe('pushToGitHub background phase (#206)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    stores.isStale.value = false
    stores.lastKnownCommitSha.value = 'local-sha'
    stores.lastPushTime.value = 0
    stores.notes.value = [{ id: 'note-1', name: 'Note', parentId: null, order: 0 }]
    stores.leaves.value = [{ id: 'leaf-1', noteId: 'note-1', content: 'orig', order: 0 }]
    appState.isArchiveLoading = false
    appState.isFirstPriorityFetched = true

    mocks.flushPendingSaves.mockResolvedValue(undefined)
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 2 })
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
  })

  it('switches isPushing→false and isPushingBackground→true after stale check passes (#206)', async () => {
    // executePush の中でフラグの状態を観測する
    let isPushingDuringPush: boolean | undefined
    let isPushingBackgroundDuringPush: boolean | undefined
    mocks.executePush.mockImplementation(async () => {
      isPushingDuringPush = stores.isPushing.value
      isPushingBackgroundDuringPush = stores.isPushingBackground.value
      return {
        success: true,
        message: 'github.pushSuccess',
        variant: 'success',
        commitSha: 'remote-sha',
      }
    })

    await pushToGitHub()

    expect(isPushingDuringPush).toBe(false)
    expect(isPushingBackgroundDuringPush).toBe(true)
    // 完了後は両方 false に戻る
    expect(stores.isPushing.value).toBe(false)
    expect(stores.isPushingBackground.value).toBe(false)
  })

  it('passes a fixed snapshot to executePush, immune to live-state mutation during background push (#206)', async () => {
    // executePush に渡された notes/leaves が live state と独立した snapshot であることを検証する
    let capturedNotes: unknown
    let capturedLeaves: unknown
    mocks.executePush.mockImplementation(async (args: { notes: unknown; leaves: unknown }) => {
      // Push 中に live state を破壊的に変更しても snapshot は不変であるべき
      stores.notes.value = []
      stores.leaves.value = [{ id: 'leaf-2', noteId: 'note-1', content: 'mutated', order: 0 }]
      capturedNotes = args.notes
      capturedLeaves = args.leaves
      return {
        success: true,
        message: 'github.pushSuccess',
        variant: 'success',
        commitSha: 'remote-sha',
      }
    })

    await pushToGitHub()

    expect(capturedNotes).toEqual([{ id: 'note-1', name: 'Note', parentId: null, order: 0 }])
    expect(capturedLeaves).toEqual([{ id: 'leaf-1', noteId: 'note-1', content: 'orig', order: 0 }])
  })

  it('updates the baseline with the snapshot (not live state) and refreshes dirty state (#206)', async () => {
    // Push 中に追記された変更は dirty として残るべきなので、setLastPushedSnapshot は固定 snapshot を、
    // refreshDirtyState は呼ばれて clearAllChanges は呼ばれないことを検証する。
    mocks.executePush.mockImplementation(async () => {
      // Push 中に live state を変更（追記）
      stores.leaves.value = [{ id: 'leaf-1', noteId: 'note-1', content: 'orig + new', order: 0 }]
      return {
        success: true,
        message: 'github.pushSuccess',
        variant: 'success',
        commitSha: 'remote-sha',
      }
    })

    await pushToGitHub()

    // setLastPushedSnapshot は live state ではなく snapshot で呼ばれる
    expect(mocks.setLastPushedSnapshot).toHaveBeenCalledTimes(1)
    const [snapNotes, snapLeaves] = mocks.setLastPushedSnapshot.mock.calls[0]
    expect(snapLeaves).toEqual([{ id: 'leaf-1', noteId: 'note-1', content: 'orig', order: 0 }])
    expect(snapNotes).toEqual([{ id: 'note-1', name: 'Note', parentId: null, order: 0 }])
    // clearAllChanges は使わず refreshDirtyState を使う
    expect(mocks.clearAllChanges).not.toHaveBeenCalled()
    expect(mocks.refreshDirtyState).toHaveBeenCalledTimes(1)
  })

  it('バックグラウンドフェーズ突入で sticky トーストを表示する (#224)', async () => {
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'remote-sha',
    })

    await pushToGitHub()

    expect(mocks.showStickyPushToast).toHaveBeenCalledWith('toast.pushInProgress')
  })

  it('push 成功で sticky を成功トーストに差し替える (#224)', async () => {
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'remote-sha',
    })

    await pushToGitHub()

    // 送信中は sticky、完了で success variant の完了トースト
    expect(mocks.showStickyPushToast).toHaveBeenCalledWith('toast.pushInProgress')
    expect(mocks.showPushCompletionToast).toHaveBeenCalledWith('github.pushSuccess', 'success')
    // 順序: sticky → success
    const stickyOrder = mocks.showStickyPushToast.mock.invocationCallOrder[0]
    const successCall = mocks.showPushCompletionToast.mock.calls.findIndex(
      ([, variant]) => variant === 'success'
    )
    const successOrder = mocks.showPushCompletionToast.mock.invocationCallOrder[successCall]
    expect(stickyOrder).toBeLessThan(successOrder)
  })

  it('想定外 push エラーで sticky を消して rethrow する (#224)', async () => {
    mocks.executePush.mockRejectedValueOnce(new Error('500'))

    await expect(pushToGitHub()).rejects.toThrow()

    expect(mocks.clearPushToast).toHaveBeenCalledTimes(1)
    expect(mocks.setPushInFlightAt).toHaveBeenCalledWith(undefined)
  })

  it('preflight で loading.pushing トーストを出す（①無変更の回帰確認）', async () => {
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'remote-sha',
    })

    await pushToGitHub()

    expect(mocks.showPushToast).toHaveBeenCalledWith('loading.pushing')
  })
})

describe('メディア挿入フェーズの待ち合わせ (#254)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    stores.isStale.value = false
    stores.lastKnownCommitSha.value = 'local-sha'
    stores.lastPushTime.value = 0
    stores.notes.value = [{ id: 'note-1', name: 'Note', parentId: null, order: 0 }]
    stores.leaves.value = [{ id: 'leaf-1', noteId: 'note-1', content: 'orig', order: 0 }]
    appState.isArchiveLoading = false
    appState.isFirstPriorityFetched = true
    appState.isPullCompleted = true

    mocks.flushPendingSaves.mockResolvedValue(undefined)
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 2 })
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'remote-sha',
    })
  })

  it('Push preflight は挿入フェーズ着地を待ち、着地後の内容をスナップショットする（添付直後 Push の no-op 防止）', async () => {
    const end = beginMediaInsertPhase()
    try {
      const pushDone = pushToGitHub()
      await flushTasks()
      // 挿入フェーズが開いている間は preflight が進まない（ロックだけ取得済み）
      expect(stores.isPushing.value).toBe(true)
      expect(mocks.flushAllEditors).not.toHaveBeenCalled()
      expect(mocks.executePush).not.toHaveBeenCalled()

      // 挿入着地（attachMediaFiles の deps.insert → store 反映）を模擬してからフェーズ終了
      stores.leaves.value = [
        {
          id: 'leaf-1',
          noteId: 'note-1',
          content: 'orig\n![a](https://example.com/a.png)',
          order: 0,
        },
      ]
      end()
      await pushDone
    } finally {
      end()
    }

    // 挿入後の内容が送信スナップショットに入っている＝「変更なし」no-op にならない
    expect(mocks.executePush).toHaveBeenCalledTimes(1)
    const args = mocks.executePush.mock.calls[0][0]
    expect(args.leaves).toEqual([
      {
        id: 'leaf-1',
        noteId: 'note-1',
        content: 'orig\n![a](https://example.com/a.png)',
        order: 0,
      },
    ])
  })

  it('Pull preflight も挿入フェーズ着地を待つ（挿入前の clean 誤認による上書き防止）', async () => {
    const end = beginMediaInsertPhase()
    try {
      const pullDone = pullFromGitHub(false)
      await flushTasks()
      // 挿入フェーズが開いている間は flush にも stale check にも進まない
      expect(stores.isPulling.value).toBe(true)
      expect(mocks.flushAllEditors).not.toHaveBeenCalled()
      expect(mocks.executeStaleCheck).not.toHaveBeenCalled()

      end()
      await pullDone
    } finally {
      end()
    }
    // 挿入着地後に composition flush（IME 中の着地を store へ反映）→ stale check の順で進む。
    // up_to_date + isPullCompleted なので実 Pull なしで終了
    expect(mocks.flushAllEditors).toHaveBeenCalledTimes(1)
    expect(mocks.executeStaleCheck).toHaveBeenCalledTimes(1)
    expect(stores.isPulling.value).toBe(false)
  })

  it('挿入フェーズが開いていなければ Push は従来どおり即進む（回帰確認）', async () => {
    await pushToGitHub()
    expect(mocks.executePush).toHaveBeenCalledTimes(1)
  })
})

describe('pushToGitHub preflight rescue / abortIfStaleCheckFailed (#235)', () => {
  const staleResult = {
    status: 'stale',
    localCommitSha: 'local-sha',
    remoteCommitSha: 'remote-sha',
  }
  const checkFailedResult = {
    status: 'check_failed',
    reason: { status: 'network_error' },
  }
  const pushSuccessResult = {
    success: true,
    message: 'github.pushSuccess',
    variant: 'success',
    commitSha: 'remote-sha',
  }

  beforeEach(() => {
    vi.clearAllMocks()
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
    // clearAllMocks は mockReturnValue を消さないため、#235 の既定値を明示的に再設定する
    mocks.tryRescueStalePush.mockReturnValue(false)
    mocks.getPushInFlightAt.mockReturnValue(undefined)
  })

  it('stale でも tryRescueStalePush が true なら、ダイアログなしで Push を続行する（#235 主シナリオの土台）', async () => {
    mocks.executeStaleCheck.mockResolvedValue(staleResult)
    mocks.tryRescueStalePush.mockReturnValue(true)
    mocks.executePush.mockResolvedValue(pushSuccessResult)

    await pushToGitHub()

    expect(mocks.tryRescueStalePush).toHaveBeenCalledExactlyOnceWith(staleResult, 'Push preflight')
    expect(mocks.choiceAsync).not.toHaveBeenCalled()
    expect(mocks.executePush).toHaveBeenCalledTimes(1)
  })

  it('stale で救済不成立のとき、救済判定がダイアログ表示より先に走り、cancel の3択フローは従来どおり', async () => {
    mocks.executeStaleCheck.mockResolvedValue(staleResult)
    mocks.tryRescueStalePush.mockReturnValue(false)
    mocks.choiceAsync.mockResolvedValue('cancel')

    await pushToGitHub()

    expect(mocks.tryRescueStalePush).toHaveBeenCalledTimes(1)
    expect(mocks.choiceAsync).toHaveBeenCalledTimes(1)
    expect(mocks.tryRescueStalePush.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.choiceAsync.mock.invocationCallOrder[0]
    )
    // 従来の cancel 挙動維持（Push しない・赤バッジ維持）
    expect(mocks.executePush).not.toHaveBeenCalled()
    expect(stores.isStale.value).toBe(true)
  })

  it('abortIfStaleCheckFailed: check_failed なら Push を静かに中止する（auto-push の無人スキップ）', async () => {
    mocks.executeStaleCheck.mockResolvedValue(checkFailedResult)

    await pushToGitHub({ abortIfStaleCheckFailed: true })

    expect(mocks.executePush).not.toHaveBeenCalled()
    expect(mocks.choiceAsync).not.toHaveBeenCalled()
    // loading.pushing を含めトーストは一切出さない（静かにスキップ）
    expect(mocks.showPushToast).not.toHaveBeenCalled()
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalled()
    expect(stores.isPushing.value).toBe(false)
  })

  it('オプションなしの手動 Push は check_failed でもそのまま続行する（従来挙動の回帰確認）', async () => {
    mocks.executeStaleCheck.mockResolvedValue(checkFailedResult)
    mocks.executePush.mockResolvedValue(pushSuccessResult)

    await pushToGitHub()

    expect(mocks.executePush).toHaveBeenCalledTimes(1)
    expect(mocks.choiceAsync).not.toHaveBeenCalled()
  })

  it('abortIfStaleCheckFailed 指定でも up_to_date なら通常どおり Push する', async () => {
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
    mocks.executePush.mockResolvedValue(pushSuccessResult)

    await pushToGitHub({ abortIfStaleCheckFailed: true })

    expect(mocks.executePush).toHaveBeenCalledTimes(1)
    expect(mocks.choiceAsync).not.toHaveBeenCalled()
  })

  it('abortIfStaleCheckFailed + stale + 救済成立で、ダイアログなしに Push する（#235 主シナリオ）', async () => {
    mocks.executeStaleCheck.mockResolvedValue(staleResult)
    mocks.tryRescueStalePush.mockReturnValue(true)
    mocks.executePush.mockResolvedValue(pushSuccessResult)

    await pushToGitHub({ abortIfStaleCheckFailed: true })

    expect(mocks.choiceAsync).not.toHaveBeenCalled()
    expect(mocks.executePush).toHaveBeenCalledTimes(1)
  })
})

describe('observeOrphanPush: タイムアウト後の遅延結果観測 (#235)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // リポ一致ガードのテストで書き換えるため毎回リセット
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
   * executePush を pending のまま PUSH_TIMEOUT_MS を経過させ、タイムアウト経路で
   * pushToGitHub を return させる（#204 テストの fake timers パターン踏襲）。
   * 戻り値の resolvePush / rejectPush で orphan の遅延 settle を再現できる。
   * stamp は pushToGitHub が setPushInFlightAt に設定した飛行中マーカー。
   */
  async function runTimeoutPush(): Promise<{
    resolvePush: (v: unknown) => void
    rejectPush: (e: unknown) => void
    stamp: number
  }> {
    let resolvePush: ((v: unknown) => void) | undefined
    let rejectPush: ((e: unknown) => void) | undefined
    mocks.executePush.mockImplementation(
      () =>
        new Promise((res, rej) => {
          resolvePush = res
          rejectPush = rej
        })
    )

    vi.useFakeTimers()
    const pushPromise = pushToGitHub()
    await vi.advanceTimersByTimeAsync(30_000)
    await pushPromise
    // settle 後の then チェーンを実時間で flush するため real timers に戻す
    vi.useRealTimers()

    const stampCall = mocks.setPushInFlightAt.mock.calls.find(([v]) => typeof v === 'number')
    expect(stampCall).toBeDefined()
    return { resolvePush: resolvePush!, rejectPush: rejectPush!, stamp: stampCall![0] as number }
  }

  /** observeOrphanPush の then チェーンを flush する */
  const flushThenChain = () => new Promise((r) => setTimeout(r, 0))

  it('遅延成功: SHA を追従・stale 解消・pushLateSuccess トースト・自分の飛行中フラグをクリアする', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    stores.isStale.value = true
    // 飛行中フラグは自分の stamp のまま（後続 Push なし）
    mocks.getPushInFlightAt.mockReturnValue(stamp)

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'late-sha',
    })
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('late-sha')
    expect(stores.isStale.value).toBe(false)
    expect(mocks.showPushCompletionToast).toHaveBeenCalledWith('toast.pushLateSuccess', 'success')
    expect(mocks.setPushInFlightAt).toHaveBeenCalledWith(undefined)
  })

  it('settle 時に飛行中フラグが後続 Push の値（不一致）なら、盲目追従せず stale check で実リモート HEAD に揃える', async () => {
    // 後続 Push が挟まった兆候。settle 順 ≠ ref 更新順があり得るため
    // 戻り値の commitSha には盲目追従せず、実リモート HEAD を確認する。
    // align するのは「リモート HEAD = 自分の orphan コミット」と確認できた
    // 場合のみ（このテストでは remoteCommitSha === late-sha）。
    // guarded clear は「自分が設定した値のときだけ」クリアする
    // （後続 Push の救済マーカーを壊さない）ためフラグにも触らない。
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 999)
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: 'late-sha',
    })

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'late-sha',
    })
    await flushThenChain()

    expect(mocks.setPushInFlightAt).not.toHaveBeenCalledWith(undefined)
    // 検証（stale check）を経て、実リモート HEAD = orphan コミットに揃う
    expect(stores.lastKnownCommitSha.value).toBe('late-sha')
    expect(mocks.executeStaleCheck).toHaveBeenLastCalledWith(stores.settings.value, 'local-sha')
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
  })

  it('不一致 + stale だがリモート HEAD が第三者のコミット: align せず通常の stale フローに委ねる', async () => {
    // 第三者（別デバイス）のコミットに揃えると真正な divergence を隠し、
    // 次の Push が無警告上書きになるため、何もしない
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 999)
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: 'third-party-sha',
    })

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'late-sha',
    })
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
    expect(mocks.setPushInFlightAt).not.toHaveBeenCalledWith(undefined)
  })

  it('不一致 + 検証の stale check await 中にリポが切り替わった: align せず全書き込みをスキップする', async () => {
    // M1 のリポ一致ガードは continuation 冒頭だけでなく、検証 await 後にも
    // 再チェックされる（await 中の切替窓を塞ぐ）
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 999)
    mocks.executeStaleCheck.mockImplementation(async () => {
      // stale check の応答待ちの間にユーザーがリポを切り替えた状況を再現
      stores.settings.value = { ...stores.settings.value, repoName: 'owner/other-repo' }
      return {
        status: 'stale',
        localCommitSha: 'local-sha',
        remoteCommitSha: 'late-sha',
      }
    })

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'late-sha',
    })
    await flushThenChain()

    // remoteCommitSha === late-sha（align 条件は満たす）でもリポ再チェックで止まる
    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
    expect(mocks.setPushInFlightAt).not.toHaveBeenCalledWith(undefined)
  })

  it('不一致 + stale check が up_to_date: 既に整合しているので何もしない', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 999)
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'late-sha',
    })
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
    expect(mocks.setPushInFlightAt).not.toHaveBeenCalledWith(undefined)
  })

  it('不一致 + stale check が check_failed: 何もせず次回の定期チェックに委ねる', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 999)
    mocks.executeStaleCheck.mockResolvedValue({ status: 'check_failed', reason: 'network' })

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'late-sha',
    })
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
  })

  it('不一致 + stale check が例外: unhandledrejection にせず何もしない', async () => {
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp + 999)
    mocks.executeStaleCheck.mockRejectedValue(new Error('network down'))

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'late-sha',
    })
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
  })

  it('リポ切替後の settle（遅延成功）: 別リポの状態を汚さないよう全書き込みをスキップする', async () => {
    // M1: lastKnownCommitSha / isStale / pushInFlightAt は「現在リポ」スロット
    // 対象のため、settle 前にリポが切り替わっていたら一切書き込まない。
    // 旧リポの pushInFlightAt は残り、戻ったとき tryRescueStalePush が拾う。
    const { resolvePush, stamp } = await runTimeoutPush()
    stores.isStale.value = true
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    stores.settings.value = { ...stores.settings.value, repoName: 'owner/other-repo' }

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'late-sha',
    })
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(stores.isStale.value).toBe(true)
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
    expect(mocks.setPushInFlightAt).not.toHaveBeenCalledWith(undefined)
    // stale check 経由の検証も走らせない（preflight の 1 回だけ）
    expect(mocks.executeStaleCheck).toHaveBeenCalledTimes(1)
  })

  it('リポ切替後の settle（遅延 reject）: フラグにも触らず握りつぶす', async () => {
    const { rejectPush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    stores.settings.value = { ...stores.settings.value, repoName: 'owner/other-repo' }

    rejectPush(new Error('network down'))
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(mocks.setPushInFlightAt).not.toHaveBeenCalledWith(undefined)
  })

  it('別 Push 進行中の遅延成功（スロット一致）: SHA は反映するがトーストは出さない', async () => {
    // N2: 進行中 Push の sticky トースト（toast.pushInProgress）を
    // 成功トーストで消してしまわないため、通知はログに留める
    const { resolvePush, stamp } = await runTimeoutPush()
    stores.isStale.value = true
    stores.isPushingBackground.value = true
    mocks.getPushInFlightAt.mockReturnValue(stamp)

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'late-sha',
    })
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('late-sha')
    expect(stores.isStale.value).toBe(false)
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
    expect(mocks.setPushInFlightAt).toHaveBeenCalledWith(undefined)
  })

  it('遅延失敗（success:false で resolve）: SHA は触らず、成功トーストも出さず、フラグだけクリアする', async () => {
    // フラグを残すと次の stale check が「Push 成功」と誤認して SHA を救済してしまう
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)

    resolvePush({ success: false, message: 'github.error', variant: 'error' })
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
    expect(mocks.setPushInFlightAt).toHaveBeenCalledWith(undefined)
  })

  it('遅延 reject: unhandledrejection にせず、フラグだけクリアする', async () => {
    const { rejectPush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)

    // reject が観測されないと vitest が unhandled rejection としてテストを落とすため、
    // このテストが正常終了すること自体が「握りつぶし済み」の検証になる
    rejectPush(new Error('network down'))
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(mocks.setPushInFlightAt).toHaveBeenCalledWith(undefined)
  })

  it('success:true でも commitSha がなければ失敗側の分岐（SHA 追従もトーストもしない）', async () => {
    // observeOrphanPush の AND 条件（success && commitSha）の狙い撃ち
    const { resolvePush, stamp } = await runTimeoutPush()
    mocks.getPushInFlightAt.mockReturnValue(stamp)

    resolvePush({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: undefined,
    })
    await flushThenChain()

    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(mocks.showPushCompletionToast).not.toHaveBeenCalledWith(
      'toast.pushLateSuccess',
      'success'
    )
    expect(mocks.setPushInFlightAt).toHaveBeenCalledWith(undefined)
  })
})

describe('Push 進捗カウントダウンの世代ガード (#238)', () => {
  const pushSuccessResult = {
    success: true,
    message: 'github.pushSuccess',
    variant: 'success',
    commitSha: 'remote-sha',
  }

  beforeEach(() => {
    vi.clearAllMocks()
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
   * executePush を pending のまま PUSH_TIMEOUT_MS を経過させ、タイムアウト経路で
   * pushToGitHub を return させる（#235 テストの fake timers パターン踏襲）。
   * 戻り値の onProgress はタイムアウトした Push（orphan）に渡されたコールバック。
   */
  async function runTimeoutPush(): Promise<{
    onProgress: (remainingStages: number) => void
    resolvePush: (v: unknown) => void
    stamp: number
  }> {
    let resolvePush: ((v: unknown) => void) | undefined
    mocks.executePush.mockImplementation(
      () =>
        new Promise((res) => {
          resolvePush = res
        })
    )

    vi.useFakeTimers()
    const pushPromise = pushToGitHub()
    await vi.advanceTimersByTimeAsync(30_000)
    await pushPromise
    vi.useRealTimers()

    const onProgress = mocks.executePush.mock.calls[0][0].onProgress
    expect(onProgress).toEqual(expect.any(Function))
    const stampCall = mocks.setPushInFlightAt.mock.calls.find(([v]) => typeof v === 'number')
    expect(stampCall).toBeDefined()
    return { onProgress, resolvePush: resolvePush!, stamp: stampCall![0] as number }
  }

  /** observeOrphanPush の then チェーンを flush する */
  const flushThenChain = () => new Promise((r) => setTimeout(r, 0))

  it('正常 Push: executePush に渡った onProgress が setPushToastCountdown に同値で素通しされる', async () => {
    mocks.executePush.mockImplementation(async (args: { onProgress?: (n: number) => void }) => {
      args.onProgress?.(5)
      args.onProgress?.(4)
      return pushSuccessResult
    })

    await pushToGitHub()

    expect(mocks.setPushToastCountdown.mock.calls).toEqual([[5], [4]])
  })

  it('タイムアウト後は同じ Push の onProgress を棄却する（世代 bump）', async () => {
    const { onProgress, resolvePush } = await runTimeoutPush()
    mocks.setPushToastCountdown.mockClear()

    // タイムアウトのエラートースト表示後に orphan の遅延進捗が届いても描かない
    onProgress(3)
    expect(mocks.setPushToastCountdown).not.toHaveBeenCalled()

    resolvePush({ success: false, message: 'github.cancelled', variant: 'error' })
    await flushThenChain()
  })

  it('orphan A の遅延 onProgress は新 Push B の進行を殺さない（低値でも棄却・本機能の核）', async () => {
    // 最悪シナリオ: orphan A の低値（2）が B の 5 を単調ガードで殺すと、
    // B のカウントダウンが 2 から始まったように見える。世代ガードで遮断する。
    const { onProgress: orphanProgress, resolvePush } = await runTimeoutPush()

    // 新 Push B（正常完走）。B 自身の onProgress(5) は反映される
    mocks.executePush.mockImplementation(async (args: { onProgress?: (n: number) => void }) => {
      args.onProgress?.(5)
      return pushSuccessResult
    })
    await pushToGitHub()
    expect(mocks.setPushToastCountdown).toHaveBeenCalledWith(5)

    // orphan A の遅延 onProgress(2) は棄却される
    mocks.setPushToastCountdown.mockClear()
    orphanProgress(2)
    expect(mocks.setPushToastCountdown).not.toHaveBeenCalled()

    resolvePush({ success: false, message: 'github.cancelled', variant: 'error' })
    await flushThenChain()
  })

  it('Push 開始時、showStickyPushToast（カウントダウンリセット）が executePush 呼び出しより先に走る', async () => {
    // リセット（sticky 再表示）→ 世代確定 → 送信の順序が崩れると、
    // 新 Push の初回進捗がリセットで消される
    mocks.executePush.mockResolvedValue(pushSuccessResult)

    await pushToGitHub()

    expect(mocks.showStickyPushToast).toHaveBeenCalledTimes(1)
    expect(mocks.showStickyPushToast.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.executePush.mock.invocationCallOrder[0]
    )
  })

  it('orphan の遅延成功が別 Push 進行中に settle しても showPushToast を呼ばない（B のカウントダウンを null 化しない）', async () => {
    // showPushToast はカウントダウンを null 化するため、B の進行中に呼ばれると
    // B の表示が消える。既存 #235 テストの「トースト抑止」を countdown 観点で固定する
    const { resolvePush, stamp } = await runTimeoutPush()
    stores.isPushingBackground.value = true
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    const callsBefore = mocks.showPushToast.mock.calls.length

    resolvePush(pushSuccessResult)
    await flushThenChain()

    expect(mocks.showPushToast.mock.calls.length).toBe(callsBefore)
  })

  it('Push 進行中の再入（canSync 拒否）では sticky も executePush も呼ばれずカウントダウンがリセットされない', async () => {
    mocks.canSync.mockReturnValueOnce({ canPull: false, canPush: false })

    await pushToGitHub()

    expect(mocks.showStickyPushToast).not.toHaveBeenCalled()
    expect(mocks.executePush).not.toHaveBeenCalled()
    expect(mocks.setPushToastCountdown).not.toHaveBeenCalled()
  })

  it('世代不一致の棄却は console.warn / console.error を出さない（ログ汚染防止）', async () => {
    const { onProgress, resolvePush } = await runTimeoutPush()
    // タイムアウト経路自身の warn を数えないよう、棄却の直前から観測する
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      onProgress(3)
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()

      resolvePush({ success: false, message: 'github.cancelled', variant: 'error' })
      await flushThenChain()
    } finally {
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})

describe('i18n locales (#235)', () => {
  it('toast.pushLateSuccess が ja / en 両方に定義されている', async () => {
    const ja = (await import('../i18n/locales/ja.json')).default
    const en = (await import('../i18n/locales/en.json')).default

    expect(ja.toast.pushLateSuccess).toEqual(expect.any(String))
    expect(ja.toast.pushLateSuccess).not.toBe('')
    expect(en.toast.pushLateSuccess).toEqual(expect.any(String))
    expect(en.toast.pushLateSuccess).not.toBe('')
  })
})

describe('pullFromGitHub dirty-check order (#152)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
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

describe('pullFromGitHub pullIncomplete partial cache (#207)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    stores.isStale.value = false
    stores.isDirty.value = false
    stores.lastKnownCommitSha.value = null
    stores.lastPushTime.value = 0
    stores.notes.value = []
    stores.leaves.value = []
    appState.isArchiveLoading = false
    appState.isFirstPriorityFetched = false
    appState.isPullCompleted = false

    mocks.flushPendingSaves.mockResolvedValue(undefined)
    mocks.getPersistedDirtyFlag.mockReturnValue(false)
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 1 })
  })

  it('awaits saveLeaves/saveNotes before closing the pull cycle so next pull can use blobSha cache', async () => {
    // #207: partial save が fire-and-forget だと、次回 Pull の createBackup() が
    // 空の IndexedDB を読んでしまい blobSha キャッシュが効かない。
    // ここでは saveLeaves が遅延 Promise でも、関数戻り値前に解決していることを確認する。

    const partialLeaf = { id: 'leaf-A', noteId: 'note-A', content: 'partial', order: 0 }
    const partialNote = { id: 'note-A', name: 'NoteA', parentId: null, order: 0 }

    let saveLeavesResolved = false
    let saveNotesResolved = false

    mocks.saveLeaves.mockImplementation(async () => {
      // 遅延を入れて await されているか検出
      await new Promise((r) => setTimeout(r, 10))
      saveLeavesResolved = true
    })
    mocks.saveNotes.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      saveNotesResolved = true
    })

    mocks.executePull.mockImplementation(async (_settings, options) => {
      // 部分的に取得：onLeaf を1件呼んでから pullIncomplete を返す
      options.onStructure?.([partialNote], { pushCount: 1 }, [
        { id: partialLeaf.id, noteId: 'note-A' },
      ])
      options.onLeaf?.(partialLeaf)
      return {
        success: false,
        message: 'github.pullIncomplete',
        leaves: [],
        notes: [],
        metadata: { pushCount: 1 },
        variant: 'error',
      }
    })

    await pullFromGitHub(true)

    // partial save が await された結果、戻り時点で必ず resolve されている
    expect(saveLeavesResolved).toBe(true)
    expect(saveNotesResolved).toBe(true)
    expect(mocks.saveLeaves).toHaveBeenCalledWith([partialLeaf])
    expect(mocks.saveNotes).toHaveBeenCalledWith([partialNote])
  })

  it('does not throw when saveLeaves rejects (graceful degradation)', async () => {
    // partial save が失敗しても次回 Pull に再試行されるので、ここで throw せず続行する
    mocks.saveLeaves.mockRejectedValue(new Error('IndexedDB quota exceeded'))
    mocks.saveNotes.mockResolvedValue(undefined)

    mocks.executePull.mockImplementation(async (_settings, options) => {
      options.onStructure?.([{ id: 'n1', name: 'N', parentId: null, order: 0 }], { pushCount: 1 }, [
        { id: 'l1', noteId: 'n1' },
      ])
      options.onLeaf?.({ id: 'l1', noteId: 'n1', content: 'x', order: 0 })
      return {
        success: false,
        message: 'github.pullIncomplete',
        leaves: [],
        notes: [],
        metadata: { pushCount: 1 },
        variant: 'error',
      }
    })

    await expect(pullFromGitHub(true)).resolves.toBeUndefined()
    expect(stores.isPulling.value).toBe(false)
  })

  it('skips partial save calls when no partial data was received', async () => {
    // 取得 0 件で pullIncomplete になった場合、saveLeaves/saveNotes は呼ばない
    mocks.executePull.mockImplementation(async () => ({
      success: false,
      message: 'github.pullIncomplete',
      leaves: [],
      notes: [],
      metadata: { pushCount: 1 },
      variant: 'error',
    }))

    await pullFromGitHub(true)

    expect(mocks.saveLeaves).not.toHaveBeenCalled()
    expect(mocks.saveNotes).not.toHaveBeenCalled()
  })
})

describe('pullFromGitHub リポ切替時のスクロールリセット (#147 綻び2)', () => {
  // Pull 成功分岐まで到達させるための最小成功結果
  const pullSuccessResult = {
    success: true,
    message: 'github.pullSuccess',
    variant: 'success' as const,
    notes: [{ id: 'note-1', name: 'Note', parentId: null, order: 0 }],
    leaves: [{ id: 'leaf-1', noteId: 'note-1', content: 'remote', order: 0 }],
    metadata: { pushCount: 2 },
    commitSha: 'remote-sha',
  }

  /**
   * app-state.svelte.ts の PWA 復帰修復と同じ .left-column/.right-column 配下に
   * .main-pane を用意し、初期 scrollTop（非0）を入れて残骸を再現する。
   */
  function setupPanes(leftTop: number, rightTop: number) {
    document.body.innerHTML =
      '<div class="left-column"><div class="main-pane"></div></div>' +
      '<div class="right-column"><div class="main-pane"></div></div>'
    const left = document.querySelector('.left-column .main-pane') as HTMLElement
    const right = document.querySelector('.right-column .main-pane') as HTMLElement
    left.scrollTop = leftTop
    right.scrollTop = rightTop
    return { left, right }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    stores.settings.value = { token: 'token', repoName: 'owner/repo', branch: 'main' }
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    stores.isStale.value = false
    stores.isDirty.value = false
    stores.lastKnownCommitSha.value = 'local-sha'
    stores.lastPushTime.value = 0
    stores.notes.value = []
    stores.leaves.value = []
    appState.isArchiveLoading = false
    appState.isFirstPriorityFetched = false
    appState.isPullCompleted = false
    // #147: このフラグの真偽で scroll reset の発火が決まる（既定は通常 pull=false）
    appState.repoChangePending = false

    mocks.getPersistedDirtyFlag.mockReturnValue(false)
    // up_to_date + isPullCompleted の早期 return を避け、実 Pull（success 分岐）へ進める
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'local-sha',
      remoteCommitSha: 'remote-sha',
    })
    mocks.saveNotes.mockResolvedValue(undefined)
    mocks.saveLeaves.mockResolvedValue(undefined)
    mocks.executePull.mockResolvedValue(pullSuccessResult)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('リポ切替起因（repoChangePending=true）の Pull 成功で両 .main-pane の scrollTop が 0 になる', async () => {
    appState.repoChangePending = true
    const { left, right } = setupPanes(300, 150)

    await pullFromGitHub(false)

    expect(mocks.executePull).toHaveBeenCalledTimes(1)
    expect(left.scrollTop).toBe(0)
    expect(right.scrollTop).toBe(0)
  })

  it('不発火（デグレ防止の核心）: 通常 Pull（repoChangePending=false）成功では .main-pane の scrollTop に触れない', async () => {
    // deep-link 復元でスクロールが飛ばないことを縛る。成功しても scroll は残す。
    appState.repoChangePending = false
    const { left, right } = setupPanes(300, 150)

    await pullFromGitHub(false)

    expect(mocks.executePull).toHaveBeenCalledTimes(1)
    expect(left.scrollTop).toBe(300)
    expect(right.scrollTop).toBe(150)
  })

  it('入口で控えた isRepoSwitchPull は Pull 中に repoChangePending が false 化されても保持され、成功時に scroll reset が走る', async () => {
    // repoChangePending は pullFromGitHub 入口直後で false 化される（進捗%へ交代）。
    // scroll reset が「成功時点の live フラグ」でなく「入口で控えた const」で
    // 判定されることを縛る（＝false 化後でも reset が走る）。
    appState.repoChangePending = true
    const { left, right } = setupPanes(300, 150)

    let pendingAtExecutePull: boolean | undefined
    mocks.executePull.mockImplementation(async () => {
      // executePull 到達時点では repoChangePending は既に落ちている
      pendingAtExecutePull = appState.repoChangePending
      return pullSuccessResult
    })

    await pullFromGitHub(false)

    expect(pendingAtExecutePull).toBe(false)
    // それでも入口 const 由来で scroll reset は走る
    expect(left.scrollTop).toBe(0)
    expect(right.scrollTop).toBe(0)
  })

  it('リポ切替起因でも Pull が失敗（success:false）なら scroll には触れない（reset は success 分岐内）', async () => {
    appState.repoChangePending = true
    const { left, right } = setupPanes(300, 150)
    mocks.executePull.mockResolvedValue({
      success: false,
      message: 'github.pullFailed',
      variant: 'error' as const,
      notes: [],
      leaves: [],
      metadata: { pushCount: 2 },
    })

    await pullFromGitHub(false)

    expect(left.scrollTop).toBe(300)
    expect(right.scrollTop).toBe(150)
  })
})
