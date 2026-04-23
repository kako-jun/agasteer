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

const { pushToGitHub } = await import('./git')

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
})
