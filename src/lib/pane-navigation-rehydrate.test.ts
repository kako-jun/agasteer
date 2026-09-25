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
  // #297 S-a: Pull/Push を理由に打ち切られたアーカイブロードの再開待ちフラグ
  pendingArchiveLoad: false,
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
  // #297 N-a/S-a: 実装は beforeEach で実ストアを読む実装に差し替える
  // （handleWorldChange が leftWorld/rightWorld を書き換えた結果を
  // 再判定で読めることの検証に使う）。
  getWorldForPane: vi.fn(),
  runPendingRepoSyncIfIdle: vi.fn(async () => {}),
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
  derivedState: { currentOfflineLeaf: null },
  getNotesForPane: vi.fn(() => []),
  getLeavesForPane: vi.fn(() => []),
  // #297 N-a/S-a: handleWorldChange の再判定・resumeArchiveLoadIfPending が使う。
  // 既定は両ペインとも 'home'（個別テストで上書き）。
  getWorldForPane: mocks.getWorldForPane,
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

// #297 S-c: pane-navigation.svelte.ts は runPendingRepoSyncIfIdle の複製を廃止し、
// git-pull.ts の実装（正本）を直接 import するようになった。
vi.mock('./actions/git-pull', () => ({
  runPendingRepoSyncIfIdle: mocks.runPendingRepoSyncIfIdle,
}))

vi.mock('./i18n', () => ({
  _: { subscribe: (run: (t: (k: string) => string) => void) => (run((k) => k), () => {}) },
}))

vi.mock('svelte-i18n', () => ({
  locale: { subscribe: (run: (v: string) => void) => (run('ja'), () => {}) },
}))

vi.mock('svelte', () => ({ tick: vi.fn(async () => {}) }))
vi.mock('svelte/store', () => ({ get: vi.fn(() => (k: string) => k) }))

const { handleWorldChange, resumeArchiveLoadIfPending } = await import('./pane-navigation.svelte')

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
  appState.pendingArchiveLoad = false
  mocks.getWorldForPane.mockImplementation((pane: 'left' | 'right') =>
    pane === 'left' ? stores.leftWorld.value : stores.rightWorld.value
  )
  mocks.runPendingRepoSyncIfIdle.mockImplementation(async () => {})
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

  // #297 must1 (T12): 判定→待機→再判定なしでロックを取得すると、待機中に
  // Pull/AL がロックを取ってもそのままアーカイブロードへ進んでしまい、
  // Pull とアーカイブロードが並走したり（排他表崩壊）、連続 Archive 操作で
  // AL が二重起動したりする。待機後に再判定して打ち切ることを直接縛る。
  it('waitForRehydrate 待機中に isPulling が true になった場合、待機後の再判定でアーカイブロードを開始しない', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    await Promise.resolve()
    await Promise.resolve()
    // waitForRehydrate 待機中（まだ再判定前）に Pull がロックを取る
    stores.isPulling.value = true

    resolveRehydrate()
    await changePromise

    // 再判定でブロックされ、アーカイブロードは開始されない
    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.loadArchiveLeaves).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
    // ワールド表示自体は判定より前に即座に切り替わっている（push-pull.md 注8）
    expect(stores.leftWorld.value).toBe('archive')
  })

  it('waitForRehydrate 待機中に appState.isArchiveLoading が true になった場合（別ペインのアーカイブロード等）、待機後の再判定でアーカイブロードを開始しない', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    await Promise.resolve()
    await Promise.resolve()
    // 別ペインの handleWorldChange 等が先にアーカイブロードを開始した状態を再現
    appState.isArchiveLoading = true

    resolveRehydrate()
    await changePromise

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.loadArchiveLeaves).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
  })
})

describe('handleWorldChange の再判定 (#297 N-a: ペイン状態/設定の再確認)', () => {
  it('待機中にペインが archive 表示でなくなった場合、待機後の再判定でアーカイブロードを開始しない', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    await Promise.resolve()
    await Promise.resolve()
    // 待機中に別の操作で home に戻った（例: 連続クリック）
    stores.leftWorld.value = 'home'

    resolveRehydrate()
    await changePromise

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
    // Pull/Push が理由ではないので自動再開の保留フラグも立てない
    expect(appState.pendingArchiveLoad).toBe(false)
  })

  it('待機中に設定（token/repoName）が無効化された場合、待機後の再判定でアーカイブロードを開始しない', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    await Promise.resolve()
    await Promise.resolve()
    stores.settings.value = { token: '', repoName: '' }

    resolveRehydrate()
    await changePromise

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
  })
})

describe('handleWorldChange のアーカイブロードのロック取得タイミング (#297 S-b)', () => {
  it('再判定通過直後、IndexedDB読込（loadArchiveCacheFromDB）が終わる前から isArchiveLoading が true になっている', async () => {
    let resolveLoadNotes!: (v: unknown[]) => void
    mocks.loadArchiveNotes.mockReturnValueOnce(
      new Promise<unknown[]>((resolve) => {
        resolveLoadNotes = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    // マイクロタスクを流して loadArchiveCacheFromDB の途中まで進める
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    // IndexedDB読込（loadArchiveNotes）がまだ解決していない時点で、既にロック済み
    expect(appState.isArchiveLoading).toBe(true)
    expect(mocks.pullArchive).not.toHaveBeenCalled()

    resolveLoadNotes([])
    await changePromise

    expect(appState.isArchiveLoading).toBe(false)
  })
})

describe('resumeArchiveLoadIfPending / handleWorldChange の自動再開 (#297 S-a)', () => {
  it('Pull 中に Archive へ切替 → pendingArchiveLoad が立ち、Pull 完了後の resumeArchiveLoadIfPending でアーカイブが自動ロードされる', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')
    await Promise.resolve()
    await Promise.resolve()
    // waitForRehydrate 待機中に Pull が始まった
    stores.isPulling.value = true
    resolveRehydrate()
    await changePromise

    expect(mocks.pullArchive).not.toHaveBeenCalled()
    expect(appState.pendingArchiveLoad).toBe(true)
    // ワールド表示自体は即座に切り替わったまま（画面が空にならない）
    expect(stores.leftWorld.value).toBe('archive')

    // Pull 完了。既存フック（git-pull.ts の runPendingRepoSyncIfIdle）相当として
    // resumeArchiveLoadIfPending を呼ぶ。
    stores.isPulling.value = false
    await resumeArchiveLoadIfPending()

    expect(mocks.loadArchiveNotes).toHaveBeenCalledTimes(1)
    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
    expect(appState.pendingArchiveLoad).toBe(false)
  })

  it('ペインが home に戻っていれば、resumeArchiveLoadIfPending はロードせずフラグだけ下ろす', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')
    await Promise.resolve()
    await Promise.resolve()
    stores.isPulling.value = true
    resolveRehydrate()
    await changePromise

    expect(appState.pendingArchiveLoad).toBe(true)

    // Pull完了までの間にユーザーが home に戻った
    stores.leftWorld.value = 'home'
    stores.isPulling.value = false
    await resumeArchiveLoadIfPending()

    expect(mocks.pullArchive).not.toHaveBeenCalled()
    expect(appState.pendingArchiveLoad).toBe(false)
  })

  it('まだ他の同期がビジーなら resumeArchiveLoadIfPending は何もせずフラグを維持する', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')
    await Promise.resolve()
    await Promise.resolve()
    stores.isPulling.value = true
    resolveRehydrate()
    await changePromise

    expect(appState.pendingArchiveLoad).toBe(true)

    // Pull がまだ継続中に呼ばれても何もしない（フラグは次の完了フックのために残す）
    await resumeArchiveLoadIfPending()

    expect(mocks.pullArchive).not.toHaveBeenCalled()
    expect(appState.pendingArchiveLoad).toBe(true)
  })

  it('pendingArchiveLoad が立っていなければ resumeArchiveLoadIfPending は何もしない（回帰確認）', async () => {
    appState.pendingArchiveLoad = false

    await resumeArchiveLoadIfPending()

    expect(mocks.pullArchive).not.toHaveBeenCalled()
    expect(mocks.runPendingRepoSyncIfIdle).not.toHaveBeenCalled()
  })
})
