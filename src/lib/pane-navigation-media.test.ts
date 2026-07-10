/**
 * メディアライブラリ画面へのナビゲーションのテスト（#250）
 *
 * `navigateToMediaLibrary` は「View='media' へ遷移するが world（Home/Archive）は
 * 触らない」契約を持つ（media は world ではなく独立の View）。WorldType を 3 値化
 * （'media' を world に混ぜる）回帰への型 + 挙動のガード。
 *
 * pane-navigation.svelte.ts は stores/app-state/ui などの巨大な依存を持つため、
 * git.test.ts と同じ流儀で周辺モジュールをフェイクに差し替え、観測可能な
 * `{ value }` ストアで world 不変を assert する。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type ValueStore<T> = { value: T }
function createStore<T>(value: T): ValueStore<T> {
  return { value }
}

// navigateToMediaLibrary / refreshBreadcrumbs が読み書きするストア群。
// world 不変の観測が目的なので left/right の world・view・note・leaf を実体で持つ。
const stores = vi.hoisted(() => ({
  notes: createStore<unknown[]>([]),
  leaves: createStore<unknown[]>([]),
  rootNotes: createStore<unknown[]>([]),
  leftNote: createStore<unknown>({ id: 'note-x' }),
  rightNote: createStore<unknown>({ id: 'note-y' }),
  leftLeaf: createStore<unknown>({ id: 'leaf-x' }),
  rightLeaf: createStore<unknown>({ id: 'leaf-y' }),
  leftView: createStore('home'),
  rightView: createStore('note'),
  leftInitialLine: createStore<number | null>(null),
  rightInitialLine: createStore<number | null>(null),
  focusedPane: createStore('left'),
  leftWorld: createStore('home'),
  rightWorld: createStore('archive'),
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

vi.mock('./stores', () => ({
  ...stores,
  archiveLeafStatsStore: { addLeaf: vi.fn(), reset: vi.fn(), rebuild: vi.fn() },
  getDialogPositionForPane: vi.fn(() => ({ top: 0, left: 0 })),
  // refreshBreadcrumbs が使う world 別セレクタ（中身は問わないので空配列）
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
  // buildBreadcrumbs のエイリアス元。呼ばれるが結果は問わない
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
  loadArchiveNotes: vi.fn(async () => []),
  loadArchiveLeaves: vi.fn(async () => []),
}))

vi.mock('./api', () => ({
  pullArchive: vi.fn(),
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

const { navigateToMediaLibrary } = await import('./pane-navigation.svelte')

beforeEach(() => {
  stores.leftWorld.value = 'home'
  stores.rightWorld.value = 'archive'
  stores.leftView.value = 'home'
  stores.rightView.value = 'note'
  stores.leftNote.value = { id: 'note-x' }
  stores.rightNote.value = { id: 'note-y' }
  stores.leftLeaf.value = { id: 'leaf-x' }
  stores.rightLeaf.value = { id: 'leaf-y' }
})

describe('navigateToMediaLibrary（#250: world を触らない View 遷移）', () => {
  it('左ペイン: View=media・note/leaf クリア。world（左右とも）は不変', () => {
    navigateToMediaLibrary('left')

    expect(stores.leftView.value).toBe('media')
    expect(stores.leftNote.value).toBeNull()
    expect(stores.leftLeaf.value).toBeNull()
    // world は Home/Archive のまま（media を world に混ぜない）
    expect(stores.leftWorld.value).toBe('home')
    expect(stores.rightWorld.value).toBe('archive')
    // 反対ペインの View は無変更
    expect(stores.rightView.value).toBe('note')
  })

  it('右ペイン: View=media・note/leaf クリア。world（左右とも）は不変', () => {
    navigateToMediaLibrary('right')

    expect(stores.rightView.value).toBe('media')
    expect(stores.rightNote.value).toBeNull()
    expect(stores.rightLeaf.value).toBeNull()
    expect(stores.leftWorld.value).toBe('home')
    expect(stores.rightWorld.value).toBe('archive')
    // 反対ペインの View は無変更
    expect(stores.leftView.value).toBe('home')
  })

  it('既定ペインは left（引数なしでも左ペインが media になる）', () => {
    navigateToMediaLibrary()

    expect(stores.leftView.value).toBe('media')
    expect(stores.leftWorld.value).toBe('home')
    expect(stores.rightWorld.value).toBe('archive')
  })
})
