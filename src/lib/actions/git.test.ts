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
// #297 S-c: runPendingRepoSyncIfIdle は git.ts バレルには re-export されていない
// （正本は git-pull.ts）ため、単体テストのために直接 import する。
const { runPendingRepoSyncIfIdle } = await import('./git-pull')
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

describe('pushToGitHub Phase 2成功時のmetadata.pushCount追従 (#293)', () => {
  // pushCount 以外のフィールド（notes/leaves/version）を非破壊性検証に使うため、
  // metadata の初期値は pushCount 以外にも意味のある内容を入れておく。
  // 初期値 9 は「更新後の新しい値（5）」「falsy値（0）」どちらとも区別できるよう選ぶ。
  const initialMetadata = () => ({
    version: 7,
    notes: { 'note-1': { id: 'note-1', order: 0 } },
    leaves: { 'leaf-1': { id: 'leaf-1', updatedAt: 123, order: 0 } },
    pushCount: 9,
  })
  const pushSuccessResult = {
    success: true,
    message: 'github.pushSuccess',
    variant: 'success' as const,
    commitSha: 'remote-sha',
  }
  const pushNoChangesResult = {
    success: true,
    message: 'github.noChanges',
    variant: 'success' as const,
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
    stores.lastPulledPushCount.value = 9
    stores.notes.value = [{ id: 'note-1', name: 'Note', parentId: null, order: 0 }]
    stores.leaves.value = [{ id: 'leaf-1', noteId: 'note-1', content: 'orig', order: 0 }]
    stores.metadata.value = initialMetadata()
    stores.archiveMetadata.value = { pushCount: 3 }
    appState.isArchiveLoading = false
    appState.isFirstPriorityFetched = true

    mocks.flushPendingSaves.mockResolvedValue(undefined)
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
  })

  afterEach(() => {
    // このdescribeブロックのテストはstores.metadata.value（vi.hoistedの共有オブジェクト）を
    // 書き換えるため、後続の他describeブロックに漏れ出さないよう既定値に戻す。
    stores.metadata.value = { version: 1, notes: {}, leaves: {}, pushCount: 1 }
  })

  it('push成功（noChanges以外）でmetadata.value.pushCountがリモート最新値に更新され、lastPulledPushCountと揃う（デシジョンテーブル行2・主シナリオ）', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 5 })
      mocks.executePush.mockResolvedValue(pushSuccessResult)

      await pushToGitHub()

      expect(stores.metadata.value.pushCount).toBe(5)
      expect(stores.lastPulledPushCount.value).toBe(5)
      // 整合性: 両者は常に同じ値に揃う
      expect(stores.metadata.value.pushCount).toBe(stores.lastPulledPushCount.value)
      // ついでにログ汚染がないことも確認（軽微）
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('push成功だが message==="github.noChanges" の場合、fetchRemotePushCount自体が呼ばれずmetadata.value.pushCountも変化しない（デシジョンテーブル行1）', async () => {
    mocks.executePush.mockResolvedValue(pushNoChangesResult)

    await pushToGitHub()

    expect(mocks.fetchRemotePushCount).not.toHaveBeenCalled()
    expect(stores.metadata.value.pushCount).toBe(9)
  })

  it('fetchRemotePushCountがnetwork_errorを返す場合、metadata.value.pushCount/lastPulledPushCountとも更新されず、push完了処理自体は正常に終わり成功トーストのままになる（デシジョンテーブル行3-6代表・異常系）', async () => {
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'network_error' })
    mocks.executePush.mockResolvedValue(pushSuccessResult)

    await expect(pushToGitHub()).resolves.toBeUndefined()

    expect(stores.metadata.value.pushCount).toBe(9)
    expect(stores.lastPulledPushCount.value).toBe(9)
    expect(mocks.showPushCompletionToast).toHaveBeenCalledWith('github.pushSuccess', 'success')
  })

  it.each([
    { status: 'auth_error' },
    { status: 'settings_invalid' },
    { status: 'empty_repository' },
  ])(
    'fetchRemotePushCountが$statusを返す場合もmetadata.value.pushCountは更新されない（同値分割の裏取り）',
    async ({ status }) => {
      mocks.fetchRemotePushCount.mockResolvedValue({ status })
      mocks.executePush.mockResolvedValue(pushSuccessResult)

      await pushToGitHub()

      expect(stores.metadata.value.pushCount).toBe(9)
      expect(stores.lastPulledPushCount.value).toBe(9)
    }
  )

  it('fetchRemotePushCount成功時のpushCountが0（falsy値）でも正しく反映される（||等の誤ったfalsyガードがないことの回帰防止）', async () => {
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 0 })
    mocks.executePush.mockResolvedValue(pushSuccessResult)

    await pushToGitHub()

    expect(stores.metadata.value.pushCount).toBe(0)
    expect(stores.lastPulledPushCount.value).toBe(0)
  })

  it('metadata.value.pushCount更新時に他フィールド（version/notes/leaves）は失われない（非破壊性）', async () => {
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 5 })
    mocks.executePush.mockResolvedValue(pushSuccessResult)

    await pushToGitHub()

    expect(stores.metadata.value.pushCount).toBe(5)
    expect(stores.metadata.value.version).toBe(7)
    expect(stores.metadata.value.notes).toEqual({ 'note-1': { id: 'note-1', order: 0 } })
    expect(stores.metadata.value.leaves).toEqual({
      'leaf-1': { id: 'leaf-1', updatedAt: 123, order: 0 },
    })
  })

  it('fetchRemotePushCount待機中に別処理がmetadata.valueの他フィールドを書き換えても、pushCount反映時に上書き消失しない（並行実行/race）', async () => {
    mocks.executePush.mockResolvedValue(pushSuccessResult)
    mocks.fetchRemotePushCount.mockImplementation(async () => {
      // await 中に他処理が metadata.value の別フィールドを書き換える。
      // 更新後の metadata.value = {...metadata.value, pushCount} が await 解決後の
      // 最新値を読んでいなければ、この version:42 は上書きで消える。
      stores.metadata.value = { ...stores.metadata.value, version: 42 }
      return { status: 'success', pushCount: 5 }
    })

    await pushToGitHub()

    expect(stores.metadata.value.pushCount).toBe(5)
    expect(stores.metadata.value.version).toBe(42)
  })

  it('noChangesでもlastKnownCommitSha/isStaleは従来どおり更新されるが、metadata.value.pushCountはそれとは独立して不変（回帰確認）', async () => {
    stores.isStale.value = true
    mocks.executePush.mockResolvedValue(pushNoChangesResult)

    await pushToGitHub()

    expect(stores.lastKnownCommitSha.value).toBe('remote-sha')
    expect(stores.isStale.value).toBe(false)
    expect(mocks.fetchRemotePushCount).not.toHaveBeenCalled()
    expect(stores.metadata.value.pushCount).toBe(9)
  })

  it('archiveMetadata.value.pushCountは本Push成功処理で変化しない（home/archiveの非対称性の回帰確認）', async () => {
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 5 })
    mocks.executePush.mockResolvedValue(pushSuccessResult)

    await pushToGitHub()

    expect(stores.metadata.value.pushCount).toBe(5)
    expect(stores.archiveMetadata.value.pushCount).toBe(3)
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

describe('pullFromGitHub / pushToGitHub は rehydrate 完了を待つ (#297)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    appState.isArchiveLoading = false
  })

  it('pullFromGitHub は rehydrate 完了まで canSync 判定・ロック取得を開始しない', async () => {
    let resolveRehydrate!: () => void
    mocks.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )
    // canSync 判定に到達した時点で早期returnさせ、以降の本処理には踏み込ませない
    mocks.canSync.mockReturnValueOnce({ canPull: false, canPush: false })

    const pullPromise = pullFromGitHub(false)
    await flushTasks()

    expect(mocks.canSync).not.toHaveBeenCalled()
    expect(stores.isPulling.value).toBe(false)

    resolveRehydrate()
    await pullPromise

    expect(mocks.canSync).toHaveBeenCalledTimes(1)
    expect(stores.isPulling.value).toBe(false)
  })

  it('pushToGitHub は rehydrate 完了まで canSync 判定・ロック取得を開始しない', async () => {
    let resolveRehydrate!: () => void
    mocks.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )
    mocks.canSync.mockReturnValueOnce({ canPull: false, canPush: false })

    const pushPromise = pushToGitHub()
    await flushTasks()

    expect(mocks.canSync).not.toHaveBeenCalled()
    expect(stores.isPushing.value).toBe(false)

    resolveRehydrate()
    await pushPromise

    expect(mocks.canSync).toHaveBeenCalledTimes(1)
    expect(stores.isPushing.value).toBe(false)
  })
})

// #297 T8 は削除済み（2巡目レビュー S3）。waitForRehydrate をモックした状態で
// 「reject を握って resolve する」ことをシミュレートしても、pullFromGitHub/
// pushToGitHub 側から見れば「ただ resolve した Promise を await した」場合と
// 区別がつかず、正常系（既定の mocks.waitForRehydrate = 即 resolve）の他テストと
// 同じ経路しか踏めていなかった（無意味）。
// 「reject を握って resolve する」という実装契約そのものは、waitForRehydrate の
// 実体を使う rehydrate-serialize.test.ts の must2 で既に検証済み。git.test.ts
// 側で実体の waitForRehydrate を使って区別可能なテストを組むには、
// applyRehydrateForRepo が依存する ../data/storage・../data/metadata-storage・
// ./auto-save.svelte・./stores/leaf-stats.svelte・../api/media/insert-phase を
// 追加でモックし、real ../stores.svelte（929行の god file）まで読み込む必要が
// あり、この観点（「呼び出し元が reject を意識しない」）のためだけに導入するには
// 見合わないと判断し削除する。

describe('rehydrate idle 時の pullFromGitHub/pushToGitHub 二重起動 (#297 T9)', () => {
  const defaultCanSyncImpl = () => ({ canPull: true, canPush: true })

  beforeEach(() => {
    vi.clearAllMocks()
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    stores.isStale.value = false
    stores.lastKnownCommitSha.value = 'local-sha'
    appState.isArchiveLoading = false
    appState.isFirstPriorityFetched = true
    appState.isPullCompleted = true
    mocks.getActiveEditorPane.mockReturnValue(null)
    mocks.waitForRehydrate.mockImplementation(() => Promise.resolve())
    mocks.flushPendingSaves.mockResolvedValue(undefined)
    mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'network_error' })
    // #297 T9: 既定の canSync モックは常時許可の静的値のため、この describe では
    // 実ロック状態（isPulling/isPushing/isPushingBackground）に応じた判定に差し替える。
    // 1本目が同期的にロックを確定してから2本目のcanSyncが評価される順序を検証したい。
    // #297 T9: mocks.canSync は `vi.fn(() => ({...}))`（0引数）で宣言されているため、
    // mockImplementation の型はその0引数シグネチャに縛られる。実引数は optional にして
    // 型エラーを避けつつ、実際の呼び出し（常に3引数）では通常どおり値を受け取る。
    mocks.canSync.mockImplementation(
      (isPulling?: boolean, isPushing?: boolean, isPushingBackground?: boolean) => ({
        canPull: !isPulling && !isPushing && !isPushingBackground,
        canPush: !isPulling && !isPushing && !isPushingBackground,
      })
    )
  })

  afterEach(() => {
    // 他のdescribeブロックへ差し替えた実装を持ち越さない
    mocks.canSync.mockImplementation(defaultCanSyncImpl)
  })

  it('pullFromGitHubを同時に2回呼ぶと1本目がisPullingロックを確定し、2本目はcanSyncで弾かれる', async () => {
    const p1 = pullFromGitHub(false)
    const p2 = pullFromGitHub(false)

    await Promise.all([p1, p2])

    expect(mocks.canSync).toHaveBeenCalledTimes(2)
    expect(mocks.canSync).toHaveBeenNthCalledWith(1, false, false, false)
    // 2本目の呼び出し時点では1本目が既にisPulling=trueを確定済み
    expect(mocks.canSync).toHaveBeenNthCalledWith(2, true, false, false)
    expect(stores.isPulling.value).toBe(false)
  })

  it('pushToGitHubを同時に2回呼ぶと1本目がisPushingロックを確定し、2本目はcanSyncで弾かれる', async () => {
    mocks.executePush.mockResolvedValue({
      success: true,
      message: 'github.pushSuccess',
      variant: 'success',
      commitSha: 'remote-sha',
    })

    const p1 = pushToGitHub()
    const p2 = pushToGitHub()

    await Promise.all([p1, p2])

    expect(mocks.canSync).toHaveBeenCalledTimes(2)
    expect(mocks.canSync).toHaveBeenNthCalledWith(1, false, false, false)
    // 2本目の呼び出し時点では1本目が既にisPushing=trueを確定済み
    expect(mocks.canSync).toHaveBeenNthCalledWith(2, false, true, false)
    expect(mocks.executePush).toHaveBeenCalledTimes(1)
    expect(stores.isPushing.value).toBe(false)
    expect(stores.isPushingBackground.value).toBe(false)
  })
})

/**
 * runPendingRepoSyncIfIdle（git-pull.ts の正本）は、予約 pull を開始する前に
 * appState.pendingRehydrateRepo が立っていればそれを rehydrate してから pull する
 * （#297 S-c）。
 *
 * 以前は move.ts / pane-navigation.svelte.ts にこのロジックを持たない複製
 * （waitForRehydrate も pendingRehydrateRepo の rehydrate もせず pullFromGitHub を
 * 直接呼ぶだけの簡略版）があり、AL 完了後の予約 pull で旧リポの DB に新リポの
 * pull 結果を書いてしまう窓があった。一本化後は AL 完了経路も含めて全て
 * このロジックを通る。
 */
describe('runPendingRepoSyncIfIdle は保留中の rehydrate を先に行ってから予約 pull する (#297 S-c)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.settings.value = { token: 'token', repoName: 'owner/repo', branch: 'main' }
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    appState.isArchiveLoading = false
    appState.pendingRepoSync = true
    appState.pendingRehydrateRepo = 'owner/other-repo'
    mocks.waitForRehydrate.mockImplementation(() => Promise.resolve())
    // 予約 pull（pullFromGitHub 内部）が canSync に到達したことを、rehydrate との
    // 呼び出し順を観測するためだけの目印として使う。以降の本処理には踏み込ませない
    // （このテストの関心は rehydrate→pull の順序と消費後のクリアだけ）。
    mocks.canSync.mockReturnValueOnce({ canPull: false, canPush: false })
  })

  it('pendingRehydrateRepo があれば、予約 pull（canSync 到達）より前に rehydrateForRepo が呼ばれ、消費後は null にクリアされる', async () => {
    await runPendingRepoSyncIfIdle()

    expect(mocks.rehydrateForRepo).toHaveBeenCalledWith('owner/other-repo')
    expect(mocks.canSync).toHaveBeenCalledTimes(1)
    expect(mocks.rehydrateForRepo.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.canSync.mock.invocationCallOrder[0]
    )
    expect(appState.pendingRehydrateRepo).toBeNull()
    expect(appState.pendingRepoSync).toBe(false)
  })

  it('pendingRehydrateRepo がなければ rehydrateForRepo を呼ばずに予約 pull する（回帰確認）', async () => {
    appState.pendingRehydrateRepo = null

    await runPendingRepoSyncIfIdle()

    expect(mocks.rehydrateForRepo).not.toHaveBeenCalled()
    expect(mocks.canSync).toHaveBeenCalledTimes(1)
  })
})
