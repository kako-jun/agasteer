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
  // #297 N-a: 実装は beforeEach で実ストアを読む実装に差し替える
  // （handleWorldChange が leftWorld/rightWorld を書き換えた結果を
  // 再判定で読めることの検証に使う）。
  getWorldForPane: vi.fn(),
  runPendingRepoSyncIfIdle: vi.fn(async () => {}),
  // #297 N2/N3/Q1: 戻し処理（Pull/Push理由の再判定）のgoHome呼び出し有無・
  // showPullToastでの案内を検証するために公開する。
  goHome: vi.fn(),
  showPullToast: vi.fn(),
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
  // #297 N-a: handleWorldChange の再判定が使う。
  // 既定は両ペインとも 'home'（個別テストで上書き）。
  getWorldForPane: mocks.getWorldForPane,
}))

vi.mock('./ui', () => ({
  showPushToast: vi.fn(),
  showPullToast: mocks.showPullToast,
  confirmAsync: vi.fn(),
  getBreadcrumbs: vi.fn(() => []),
  handlePaneScroll: vi.fn(),
}))

vi.mock('./navigation', () => ({
  goHome: mocks.goHome,
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
  //
  // #297 4巡目: 再判定が Pull/Push を理由に打ち切った場合、以前は
  // pendingArchiveLoad による自動再開でアーカイブ未ロードのまま残る問題を
  // 救っていたが、新たなバグ（旧DBへの誤保存・例外伝播・未テスト配線）を
  // 生んだため撤去した。代わりにワールド表示を切替前（home）へ戻す。
  it('waitForRehydrate 待機中に isPulling が true になった場合、待機後の再判定でアーカイブロードを開始せず、ペインのワールドが元に戻る', async () => {
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
    // ワールド表示は判定より前に一度 archive へ切り替わるが（push-pull.md 注8）、
    // Pull が理由で未ロードのまま打ち切られたので、切替前（home）に戻される
    expect(stores.leftWorld.value).toBe('home')
    // #297 N1: view は home のまま（media 等へ移っていない）なので、戻し処理でも
    // goHome が呼ばれる。1回目はワールド切替直後の初回分、2回目が戻し処理分。
    expect(mocks.goHome).toHaveBeenCalledTimes(2)
    // #297 N3: 黙って戻さず、案内トーストを1回出す
    expect(mocks.showPullToast).toHaveBeenCalledWith('toast.archiveOpenBlocked')
  })

  // #297 N2: 戻し処理は右ペインでも同様に動く（左ペイン専用のロジックでないことを縛る）
  it('waitForRehydrate 待機中に isPulling が true になった場合、right pane でも rightWorld だけが元に戻る', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )
    // 左ペインは既に archive 表示（この操作の対象外）にしておき、触られないことを縛る
    stores.leftWorld.value = 'archive'

    const changePromise = handleWorldChange('archive', 'right')

    await Promise.resolve()
    await Promise.resolve()
    stores.isPulling.value = true

    resolveRehydrate()
    await changePromise

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
    expect(stores.rightWorld.value).toBe('home')
    // 対象外の左ペインには触らない
    expect(stores.leftWorld.value).toBe('archive')
  })

  // #297 N2: Pull だけでなく isPushing が理由でも同じ戻し処理が発火する
  it('waitForRehydrate 待機中に isPushing が true になった場合、待機後の再判定でアーカイブロードを開始せず、ペインのワールドが元に戻る', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    await Promise.resolve()
    await Promise.resolve()
    stores.isPushing.value = true

    resolveRehydrate()
    await changePromise

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
    expect(stores.leftWorld.value).toBe('home')
  })

  // #297 N2: 背景 Push（isPushingBackground）が理由でも同じ戻し処理が発火する
  it('waitForRehydrate 待機中に isPushingBackground が true になった場合、待機後の再判定でアーカイブロードを開始せず、ペインのワールドが元に戻る', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    await Promise.resolve()
    await Promise.resolve()
    stores.isPushingBackground.value = true

    resolveRehydrate()
    await changePromise

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
    expect(stores.leftWorld.value).toBe('home')
  })

  // #297 Q1: 待機中にペインが archive の外（メディア画面遷移等）へ既に移動していた場合、
  // 戻し処理の goHome で上書きしない
  it('waitForRehydrate 待機中にペインが media 表示へ遷移していた場合、Pull 理由の戻し処理で goHome によって上書きされない', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    await Promise.resolve()
    await Promise.resolve()
    // 待機中にユーザーがメディアライブラリへ遷移した（archive の外へ出る操作）
    stores.leftView.value = 'media'
    stores.isPulling.value = true

    resolveRehydrate()
    await changePromise

    // ワールド値は戻すが、view は home ではないため goHome を呼ばない
    expect(stores.leftWorld.value).toBe('home')
    expect(stores.leftView.value).toBe('media')
    // goHome はワールド切替直後の初回分だけで、戻し処理からは呼ばれない
    expect(mocks.goHome).toHaveBeenCalledTimes(1)
    expect(mocks.goHome).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'left')
  })

  it('waitForRehydrate 待機中に appState.isArchiveLoading が true になった場合（別ペインのアーカイブロード等）、待機後の再判定でアーカイブロードを開始せず、ワールド表示も戻さない', async () => {
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
    // AL が理由（進行中）の打ち切りは戻さない: 進行中のロードがこのペインの
    // 画面も正しく埋めるため、home へ戻す必要がない（Pull/Push ケースとの違い）
    expect(stores.leftWorld.value).toBe('archive')
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
    // ユーザーが既に home へ移った後なので、そのペインには一切触らない
    // （home のまま。archive への巻き戻し等は起きない）
    expect(stores.leftWorld.value).toBe('home')
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

  // #297 4巡目 (c): 待機中に Pull が busy になっても、ユーザーが既に別ワールドへ
  // 移っていれば「元に戻す」対象はそのペインの現在の選択ではない。再判定の
  // 世界チェック（getWorldForPane(pane) !== 'archive'）が Pull チェックより先に
  // 発火し、busy 分岐（戻す処理）まで到達しないことを直接縛る。
  it('待機中に Pull が busy になっても、ペインが既に別ワールドへ移っていれば触らない', async () => {
    let resolveRehydrate!: () => void
    stores.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    const changePromise = handleWorldChange('archive', 'left')

    await Promise.resolve()
    await Promise.resolve()
    // 待機中にユーザー操作で home に戻り、かつ Pull も busy になった
    stores.leftWorld.value = 'home'
    stores.isPulling.value = true

    resolveRehydrate()
    await changePromise

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
    // ユーザーの選択（home）のまま。戻す処理による上書きは発生しない
    expect(stores.leftWorld.value).toBe('home')
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

// #307: restoreStateFromUrl も performArchiveLoad(logContext) 経由に統合されたが、
// handleWorldChange は引き続き logContext なしで performArchiveLoad() を呼ぶ契約を持つ
// （呼び出し元ごとに catch のログ文言を出し分けるため）。restoreStateFromUrl 側の
// 'during URL restore' 付きログは pane-navigation-restore-archive-lock.test.ts で
// 縛っており、ここでは logContext 未指定側が退行していないことだけを確認する。
describe('handleWorldChange のアーカイブロード失敗時ログ文言 (#307: logContext 未指定の回帰確認)', () => {
  it('pullArchive が失敗した場合、console.error は接尾辞なしの「Archive pull failed:」のまま', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('boom')
    mocks.pullArchive.mockRejectedValueOnce(error)

    await handleWorldChange('archive', 'left')

    expect(consoleErrorSpy).toHaveBeenCalledWith('Archive pull failed:', error)

    consoleErrorSpy.mockRestore()
  })
})
