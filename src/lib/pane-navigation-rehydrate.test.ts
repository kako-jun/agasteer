/**
 * handleWorldChange の rehydrate 待機のテスト（#297 T12 / should5 回帰）
 *
 * pane-navigation.svelte.ts の handleWorldChange は、Archive world への初回遷移時に
 * waitForRehydrate() を待ってからアーカイブロード（loadArchiveCacheFromDB 内の
 * loadArchiveNotes/loadArchiveLeaves、続く pullArchive）を開始する契約を持つ
 * （#297 should5: rehydrateForRepo によるリポ切替の途中で新/旧どちらの DB を
 * 読むか取り違える窓を塞ぐため）。
 *
 * pane-navigation.svelte.ts は stores/app-state/ui などの巨大な依存を持つため、
 * git.test.ts / pane-navigation-media.test.ts と同じ流儀で周辺モジュールを
 * フェイクに差し替え、waitForRehydrate 解決前後でアーカイブロードの呼び出しが
 * どう変わるかを観測する。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type ValueStore<T> = { value: T }
function createStore<T>(value: T): ValueStore<T> {
  return { value }
}

const stores = vi.hoisted(() => ({
  notes: createStore<unknown[]>([]),
  leaves: createStore<unknown[]>([]),
  rootNotes: createStore<unknown[]>([]),
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
  isPulling: createStore(false),
  isPushing: createStore(false),
  isPushingBackground: createStore(false),
  settings: createStore({ token: 't', repoName: 'owner/repo' }),
  offlineLeafStore: createStore({ content: '', badgeIcon: '', badgeColor: '' }),
  archiveNotes: createStore<unknown[]>([]),
  archiveLeaves: createStore<unknown[]>([]),
  archiveMetadata: createStore({ pushCount: 0 }),
  isArchiveLoaded: createStore(false),
  isDirty: createStore(false),
  // #297 T12: 既定はモックしないと以前のテストと衝突するため即解決を既定にする
  waitForRehydrate: vi.fn(() => Promise.resolve()),
}))

const appState = vi.hoisted(() => ({
  isDualPane: true,
  isArchiveLoading: false,
  pendingRepoSync: false,
  isFirstPriorityFetched: true,
  isRestoringFromUrl: false,
  selectedIndexLeft: 0,
  selectedIndexRight: 0,
  showSettings: false,
  leftEditorView: null,
  rightEditorView: null,
  breadcrumbs: [] as unknown[],
  breadcrumbsRight: [] as unknown[],
  editingBreadcrumb: null as string | null,
}))

const mocks = vi.hoisted(() => ({
  loadArchiveNotes: vi.fn(async () => [] as unknown[]),
  loadArchiveLeaves: vi.fn(async () => [] as unknown[]),
  pullArchive: vi.fn(),
  archiveLeafStatsStore: {
    addLeaf: vi.fn(),
    reset: vi.fn(),
    rebuild: vi.fn(),
  },
}))

vi.mock('./stores', () => ({
  ...stores,
  archiveLeafStatsStore: mocks.archiveLeafStatsStore,
  getDialogPositionForPane: vi.fn(() => ({ top: 0, left: 0 })),
  getNotesForWorld: vi.fn(() => []),
  getLeavesForWorld: vi.fn(() => []),
  setArchiveBaseline: vi.fn(),
  scheduleOfflineSave: vi.fn(),
}))

vi.mock('./app-state.svelte', () => ({
  appState,
  appActions: { pullFromGitHub: vi.fn() },
  derivedState: { currentOfflineLeaf: null },
  getNotesForPane: vi.fn(() => []),
  getLeavesForPane: vi.fn(() => []),
}))

vi.mock('./ui', () => ({
  showPushToast: vi.fn(),
  showPullToast: vi.fn(),
  confirmAsync: vi.fn(),
  getBreadcrumbs: vi.fn(() => []),
  handlePaneScroll: vi.fn(),
}))

vi.mock('./navigation', () => ({
  goHome: vi.fn(),
  selectNote: vi.fn(),
  switchPane: vi.fn(),
  togglePreview: vi.fn(),
  resolvePath: vi.fn(),
  buildPath: vi.fn(() => '/'),
  extractWorldPrefix: vi.fn(() => ({ world: 'home' })),
}))

vi.mock('./utils', () => ({
  priorityItems: createStore([]),
  createPriorityLeaf: vi.fn(),
  isPriorityLeaf: vi.fn(() => false),
  createOfflineLeaf: vi.fn(),
  isOfflineLeaf: vi.fn(() => false),
}))

vi.mock('./data', () => ({
  saveOfflineLeaf: vi.fn(),
  saveArchiveNotes: vi.fn(),
  saveArchiveLeaves: vi.fn(),
  loadArchiveNotes: mocks.loadArchiveNotes,
  loadArchiveLeaves: mocks.loadArchiveLeaves,
}))

vi.mock('./api', () => ({
  pullArchive: mocks.pullArchive,
  translateGitHubMessage: vi.fn((m: string) => m),
}))

vi.mock('./actions/move', () => ({
  moveNoteToWorld: vi.fn(),
  moveLeafToWorld: vi.fn(),
}))

vi.mock('./editor/wait-for-editor', () => ({
  waitForMatchingEditor: vi.fn(async () => null),
}))

vi.mock('./sync/repo-sync-queue', () => ({
  runPendingRepoSyncIfIdle: vi.fn(async () => {}),
}))

vi.mock('./i18n', () => ({
  _: { subscribe: (run: (t: (k: string) => string) => void) => (run((k) => k), () => {}) },
}))

vi.mock('svelte-i18n', () => ({
  locale: { subscribe: (run: (v: string) => void) => (run('ja'), () => {}) },
}))

vi.mock('svelte', () => ({ tick: vi.fn(async () => {}) }))
vi.mock('svelte/store', () => ({ get: vi.fn(() => (k: string) => k) }))

const { handleWorldChange } = await import('./pane-navigation.svelte')

beforeEach(() => {
  vi.clearAllMocks()
  stores.leftWorld.value = 'home'
  stores.rightWorld.value = 'home'
  stores.leftView.value = 'home'
  stores.rightView.value = 'home'
  stores.leftNote.value = null
  stores.rightNote.value = null
  stores.leftLeaf.value = null
  stores.rightLeaf.value = null
  stores.isPulling.value = false
  stores.isPushing.value = false
  stores.isPushingBackground.value = false
  stores.isArchiveLoaded.value = false
  stores.settings.value = { token: 't', repoName: 'owner/repo' }
  appState.isArchiveLoading = false
  stores.waitForRehydrate.mockImplementation(() => Promise.resolve())
  mocks.loadArchiveNotes.mockResolvedValue([])
  mocks.loadArchiveLeaves.mockResolvedValue([])
  mocks.pullArchive.mockResolvedValue({
    success: false,
    message: 'github.pullFailed',
  })
})

describe('handleWorldChange の rehydrate 待機 (#297 T12 / should5)', () => {
  it('waitForRehydrate 解決前はアーカイブロード（loadArchiveNotes/loadArchiveLeaves）を開始しない', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    // マイクロタスクを数回流しても、rehydrate待ちの間はアーカイブロードに進まない
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.loadArchiveLeaves).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()

    resolveRehydrate()
    await changePromise

    // 解決後はアーカイブロードが開始される
    expect(mocks.loadArchiveNotes).toHaveBeenCalledTimes(1)
    expect(mocks.loadArchiveLeaves).toHaveBeenCalledTimes(1)
    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
  })

  it('waitForRehydrate が即解決（idle）ならアーカイブロードがそのまま進む（回帰確認）', async () => {
    await handleWorldChange('archive', 'left')

    expect(mocks.loadArchiveNotes).toHaveBeenCalledTimes(1)
    expect(mocks.loadArchiveLeaves).toHaveBeenCalledTimes(1)
    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
  })
})
