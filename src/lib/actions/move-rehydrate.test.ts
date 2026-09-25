/**
 * moveNoteToWorld / moveLeafToWorld の rehydrate 待機のテスト（#297 T12 / should5 回帰）
 *
 * actions/move.ts の moveNoteToWorld・moveLeafToWorld は、Archive 未ロード状態で
 * targetWorld==='archive' へ移動しようとする際、waitForRehydrate() を待ってから
 * pullArchive（アーカイブロード）を開始する契約を持つ（#297 should5: rehydrateForRepo
 * によるリポ切替の途中で pullArchive の保存処理が旧/新どちらの DB に書くか
 * 取り違える窓を塞ぐため）。
 *
 * move.ts は notes/stores・data・api など多くの依存を持つが、pullArchive を
 * 失敗させることで移動処理の本体（ノート/リーフの実移動ロジック）に踏み込む前に
 * 早期 return させ、rehydrate 待機の観測に必要な最小限のモックで済ませる。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type ValueStore<T> = { value: T }
function createStore<T>(value: T): ValueStore<T> {
  return { value }
}

const stores = vi.hoisted(() => ({
  settings: createStore({ token: 't', repoName: 'owner/repo' }),
  notes: createStore<unknown[]>([]),
  leaves: createStore<unknown[]>([]),
  archiveNotes: createStore<unknown[]>([]),
  archiveLeaves: createStore<unknown[]>([]),
  archiveMetadata: createStore({ pushCount: 0 }),
  isPulling: createStore(false),
  isPushing: createStore(false),
  isPushingBackground: createStore(false),
  isArchiveLoaded: createStore(false),
  isStructureDirty: createStore(false),
  leftWorld: createStore('home'),
  rightWorld: createStore('home'),
  leftNote: createStore<unknown>(null),
  rightNote: createStore<unknown>(null),
  leftLeaf: createStore<unknown>(null),
  rightLeaf: createStore<unknown>(null),
  leftView: createStore('home'),
  rightView: createStore('home'),
  // #297 T12: 既定は即解決。個別テストで差し替える
  waitForRehydrate: vi.fn(() => Promise.resolve()),
}))

const appState = vi.hoisted(() => ({
  isArchiveLoading: false,
  pendingRepoSync: false,
}))

const mocks = vi.hoisted(() => ({
  pullArchive: vi.fn(),
  archiveLeafStatsStore: {
    addLeaf: vi.fn(),
    reset: vi.fn(),
    rebuild: vi.fn(),
  },
  runPendingRepoSyncIfIdle: vi.fn(async () => false),
  showPullToast: vi.fn(),
  showPushToast: vi.fn(),
  choiceAsync: vi.fn(),
  alertAsync: vi.fn(),
  translateGitHubMessage: vi.fn((m: string) => m),
}))

vi.mock('../stores', () => ({
  ...stores,
  updateNotes: vi.fn(),
  updateLeaves: vi.fn(),
  updateArchiveNotes: vi.fn(),
  updateArchiveLeaves: vi.fn(),
  archiveLeafStatsStore: mocks.archiveLeafStatsStore,
  setArchiveBaseline: vi.fn(),
  applyLeafFieldUpdate: vi.fn(),
}))

vi.mock('../data', () => ({
  saveNotes: vi.fn(),
  saveLeaves: vi.fn(),
  saveArchiveNotes: vi.fn(),
  saveArchiveLeaves: vi.fn(),
  moveLeafTo: vi.fn(),
  moveNoteTo: vi.fn(),
}))

vi.mock('../api', () => ({
  pullArchive: mocks.pullArchive,
  translateGitHubMessage: mocks.translateGitHubMessage,
}))

vi.mock('../utils', () => ({
  generateUniqueName: vi.fn((name: string) => name),
}))

vi.mock('../app-state.svelte', () => ({
  appState,
  appActions: { pullFromGitHub: vi.fn() },
  getWorldForPane: vi.fn(() => 'home'),
}))

vi.mock('../i18n', () => ({
  _: { subscribe: (run: (t: (k: string) => string) => void) => (run((k) => k), () => {}) },
}))

vi.mock('../sync/repo-sync-queue', () => ({
  runPendingRepoSyncIfIdle: mocks.runPendingRepoSyncIfIdle,
}))

vi.mock('../ui', () => ({
  showPushToast: mocks.showPushToast,
  showPullToast: mocks.showPullToast,
  choiceAsync: mocks.choiceAsync,
  alertAsync: mocks.alertAsync,
}))

vi.mock('svelte/store', () => ({ get: vi.fn(() => (k: string) => k) }))

const { moveNoteToWorld, moveLeafToWorld } = await import('./move')

beforeEach(() => {
  vi.clearAllMocks()
  stores.settings.value = { token: 't', repoName: 'owner/repo' }
  stores.isPulling.value = false
  stores.isPushing.value = false
  stores.isPushingBackground.value = false
  stores.isArchiveLoaded.value = false
  appState.isArchiveLoading = false
  stores.waitForRehydrate.mockImplementation(() => Promise.resolve())
  // pullArchive を失敗させ、移動処理本体（ノート/リーフの実移動ロジック）に
  // 踏み込む前に早期 return させる。rehydrate 待機の観測だけに集中するため。
  mocks.pullArchive.mockResolvedValue({
    success: false,
    message: 'github.pullFailed',
  })
})

describe('moveNoteToWorld の rehydrate 待機 (#297 T12 / should5)', () => {
  it('waitForRehydrate 解決前はアーカイブロード（pullArchive）を開始しない', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const movePromise = moveNoteToWorld(
      { id: 'note-1', name: 'n', parentId: null, order: 0 } as never,
      'archive',
      'left'
    )

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.pullArchive).not.toHaveBeenCalled()

    resolveRehydrate()
    await movePromise

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
  })

  it('waitForRehydrate が即解決（idle）ならアーカイブロードがそのまま進む（回帰確認）', async () => {
    await moveNoteToWorld(
      { id: 'note-1', name: 'n', parentId: null, order: 0 } as never,
      'archive',
      'left'
    )

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
  })
})

describe('moveLeafToWorld の rehydrate 待機 (#297 T12 / should5)', () => {
  it('waitForRehydrate 解決前はアーカイブロード（pullArchive）を開始しない', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const movePromise = moveLeafToWorld(
      { id: 'leaf-1', noteId: 'note-1', content: 'c', order: 0 } as never,
      'archive',
      'left'
    )

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.pullArchive).not.toHaveBeenCalled()

    resolveRehydrate()
    await movePromise

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
  })

  it('waitForRehydrate が即解決（idle）ならアーカイブロードがそのまま進む（回帰確認）', async () => {
    await moveLeafToWorld(
      { id: 'leaf-1', noteId: 'note-1', content: 'c', order: 0 } as never,
      'archive',
      'left'
    )

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
  })
})
