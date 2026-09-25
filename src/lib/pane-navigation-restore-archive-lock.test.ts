// @vitest-environment jsdom
/**
 * restoreStateFromUrl のアーカイブロード統合のテスト（#307）
 *
 * #301 で handleWorldChange のアーカイブロード本体（IndexedDBキャッシュ読み出し +
 * pullArchive）とそのロック管理（appState.isArchiveLoading）は archive-load.svelte.ts の
 * performArchiveLoad に抽出されたが、restoreStateFromUrl（URL からの状態復元時の
 * アーカイブロード）は独自実装のまま残っていた。その独自実装は
 * `await loadArchiveCacheFromDB()` の後にロックを立てていたため、IndexedDB 読込中は
 * isArchiveLoading が false のままになり、その間に Pull が割り込める窓があった
 * （#297 S-b で handleWorldChange 側は塞いだのと同じ種類の窓）。
 *
 * #307 の修正で restoreStateFromUrl も performArchiveLoad('during URL restore') に
 * 統合し、ロック取得タイミングを揃えた。catch のログ文言だけは呼び出し元で
 * 出し分ける（logContext 引数）。
 *
 * pane-navigation-rehydrate.test.ts と同じ流儀（周辺モジュールをフェイクに差し替え、
 * archive-load.svelte.ts は実物を通す）を使う。restoreStateFromUrl は
 * window.location.search を読むため、このファイルだけ jsdom 環境にする。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  getWorldForPane: vi.fn(),
  runPendingRepoSyncIfIdle: vi.fn(async () => {}),
  goHome: vi.fn(),
  showPullToast: vi.fn(),
  // restoreStateFromUrl 専用: extractWorldPrefix/resolvePath はテストごとに
  // 戻り値を差し替えて、archive 要求の有無・解決結果を制御する。
  // 戻り値の型を string に広げておかないと、初期値の literal 型（"home"）に
  // 縛られて mockReturnValue({ world: 'archive' }) が型エラーになる。
  extractWorldPrefix: vi.fn((): { world: string } => ({ world: 'home' })),
  resolvePath: vi.fn((): { type: string; world: string } => ({ type: 'home', world: 'archive' })),
  // nit3: 正常系での永続化呼び出し（saveArchiveNotes/saveArchiveLeaves/setArchiveBaseline）を
  // assert できるよう、他の mocks 同様に外から参照できる場所に置く。
  saveArchiveNotes: vi.fn(async () => {}),
  saveArchiveLeaves: vi.fn(async () => {}),
  setArchiveBaseline: vi.fn(),
}))

vi.mock('./stores', () => ({
  ...stores,
  archiveLeafStatsStore: mocks.archiveLeafStatsStore,
  getDialogPositionForPane: vi.fn(() => ({ top: 0, left: 0 })),
  getNotesForWorld: vi.fn(() => []),
  getLeavesForWorld: vi.fn(() => []),
  setArchiveBaseline: mocks.setArchiveBaseline,
  scheduleOfflineSave: vi.fn(),
}))

vi.mock('./app-state.svelte', () => ({
  appState,
  derivedState: { currentOfflineLeaf: null },
  getNotesForPane: vi.fn(() => []),
  getLeavesForPane: vi.fn(() => []),
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
  resolvePath: mocks.resolvePath,
  buildPath: vi.fn(() => '/'),
  extractWorldPrefix: mocks.extractWorldPrefix,
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
  // loadArchiveIntoStores の成功パスは戻り値に .catch() を呼ぶため、
  // 単なる vi.fn()（undefined を返す）だと成功時に TypeError を誘発する。
  saveArchiveNotes: mocks.saveArchiveNotes,
  saveArchiveLeaves: mocks.saveArchiveLeaves,
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

const { restoreStateFromUrl } = await import('./pane-navigation.svelte')

function setUrl(query: string) {
  window.history.pushState({}, '', `/?${query}`)
}

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
  stores.archiveNotes.value = []
  stores.archiveLeaves.value = []
  stores.settings.value = { token: 't', repoName: 'owner/repo' }
  appState.isArchiveLoading = false
  appState.isRestoringFromUrl = false
  mocks.runPendingRepoSyncIfIdle.mockImplementation(async () => {})
  mocks.loadArchiveNotes.mockResolvedValue([])
  mocks.loadArchiveLeaves.mockResolvedValue([])
  mocks.pullArchive.mockResolvedValue({
    success: false,
    message: 'github.pullFailed',
  })
  mocks.extractWorldPrefix.mockReturnValue({ world: 'home' })
  mocks.resolvePath.mockReturnValue({ type: 'home', world: 'archive' })
  // loadArchiveIntoStores の成功パスは戻り値に .catch() を呼ぶため、単なる
  // vi.fn()（undefined を返す）だと成功時に TypeError を誘発する。他のmock同様、
  // テストごとに明示的に張り直しておく（mockResolvedValueOnce 等の個別上書きは
  // afterEach の vi.restoreAllMocks() でクリアされるため）。
  mocks.saveArchiveNotes.mockResolvedValue(undefined)
  mocks.saveArchiveLeaves.mockResolvedValue(undefined)
  setUrl('left=%2Fhome%2Fx')
})

// nit1: console.error スパイを個々のテスト末尾の mockRestore() に頼ると、
// アサーション失敗などでその行まで到達しなかった場合にスパイが後続テストへ
// 漏れる。afterEach で確実に戻す。vi.restoreAllMocks() は他の vi.fn() モックも
// 呼び出し履歴込みで初期状態（vi.fn(初期実装) の初期実装）へ戻すため、
// per-test の上書き（mockResolvedValueOnce 等）は消えるが、それらは元々
// beforeEach で毎回明示的に張り直しているため壊れない。
afterEach(() => {
  vi.restoreAllMocks()
})

describe('restoreStateFromUrl の前段ガード（デシジョンテーブル、#307）', () => {
  // needsArchive && !isArchiveLoaded && token && repoName の4条件が揃わない限り
  // アーカイブロード（loadArchiveCacheFromDB 内の loadArchiveNotes/loadArchiveLeaves、
  // 続く pullArchive）を開始しないことを1条件ずつ縛る。

  it('archive 不要な URL（left/right とも archive でない）ではロードしない', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'home' })
    setUrl('left=%2Fhome%2Fx')

    await restoreStateFromUrl()

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
  })

  it('既に isArchiveLoaded の場合はロードしない', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    stores.isArchiveLoaded.value = true
    setUrl('left=%2Farchive%2Fx')

    await restoreStateFromUrl()

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
  })

  it('token が空の場合はロードしない', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    stores.settings.value = { token: '', repoName: 'owner/repo' }
    setUrl('left=%2Farchive%2Fx')

    await restoreStateFromUrl()

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
  })

  it('repoName が空の場合はロードしない', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    stores.settings.value = { token: 't', repoName: '' }
    setUrl('left=%2Farchive%2Fx')

    await restoreStateFromUrl()

    expect(mocks.loadArchiveNotes).not.toHaveBeenCalled()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
  })
})

describe('restoreStateFromUrl の正常系（#307: performArchiveLoad 統合後）', () => {
  it('archive 必須の URL でロードが実行され、ストアが更新されロックが解除される', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resultNotes = [{ id: 'n1' }]
    const resultLeaves = [{ id: 'l1' }]
    mocks.pullArchive.mockResolvedValueOnce({
      success: true,
      notes: resultNotes,
      leaves: resultLeaves,
      metadata: { pushCount: 1 },
    })

    expect(appState.isArchiveLoading).toBe(false)

    await restoreStateFromUrl()

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
    expect(stores.archiveNotes.value).toBe(resultNotes)
    expect(stores.archiveLeaves.value).toBe(resultLeaves)
    expect(stores.isArchiveLoaded.value).toBe(true)
    // finally でロックが解除され、保留中の同期再開が呼ばれる
    expect(appState.isArchiveLoading).toBe(false)
    expect(mocks.runPendingRepoSyncIfIdle).toHaveBeenCalledTimes(1)
    // catch 分岐（異常系）に落ちていないことも確認する
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    // nit3(b): 取得結果の永続化（IndexedDB保存・baseline更新）まで行われることを縛る
    expect(mocks.saveArchiveNotes).toHaveBeenCalledWith(resultNotes)
    expect(mocks.saveArchiveLeaves).toHaveBeenCalledWith(resultLeaves)
    expect(mocks.setArchiveBaseline).toHaveBeenCalledWith(resultNotes, resultLeaves)
  })
})

describe('restoreStateFromUrl のロック窓（#307: IndexedDB 読込中も isArchiveLoading が true）', () => {
  // 修正前は `await loadArchiveCacheFromDB()` の完了後にロックを立てていたため、
  // IndexedDB 読込中（loadArchiveNotes/loadArchiveLeaves が未解決の間）は
  // isArchiveLoading が false のままで、Pull がここに割り込める窓があった。
  // performArchiveLoad への統合後は IndexedDB 読込前（await の前）に同期でロックを
  // 取るため、この窓が塞がれていることを直接縛る。
  it('loadArchiveNotes が未解決の間も appState.isArchiveLoading は true で、pullArchive はまだ呼ばれない', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    let resolveLoadNotes!: (v: unknown[]) => void
    mocks.loadArchiveNotes.mockReturnValueOnce(
      new Promise<unknown[]>((resolve) => {
        resolveLoadNotes = resolve
      })
    )

    const restorePromise = restoreStateFromUrl()

    // #314: restoreStateFromUrl は performArchiveLoad の前に waitForRehydrate() /
    // waitForSyncIdle() を await するようになったため、ロック取得（performArchiveLoad
    // 内で同期）に到達するまでに数マイクロタスクかかる。isPulling/isPushing/
    // isPushingBackground はすべて false（beforeEach）なので waitForSyncIdle() の
    // while ループは即座に抜けるが、待ち合わせ自体が最低1マイクロタスクを要する。
    await vi.waitFor(() => {
      expect(appState.isArchiveLoading).toBe(true)
    })
    expect(mocks.pullArchive).not.toHaveBeenCalled()

    resolveLoadNotes([])
    await restorePromise

    expect(appState.isArchiveLoading).toBe(false)
  })
})

describe('restoreStateFromUrl の異常系（#307: ログ文言の出し分けとロック解除）', () => {
  it("pullArchive が失敗した場合、console.error は 'Archive pull failed during URL restore:' で出て、ロックは解除される", async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('boom')
    mocks.pullArchive.mockRejectedValueOnce(error)

    await restoreStateFromUrl()

    expect(consoleErrorSpy).toHaveBeenCalledWith('Archive pull failed during URL restore:', error)
    expect(appState.isArchiveLoading).toBe(false)
    expect(mocks.runPendingRepoSyncIfIdle).toHaveBeenCalledTimes(1)
  })
})

describe('restoreStateFromUrl の異常系（#307 nit3: IndexedDB 読出し失敗は伝播する）', () => {
  // loadArchiveCacheFromDB（Promise.all(loadArchiveNotes(), loadArchiveLeaves())）の
  // 呼び出しは loadArchiveIntoStores の try/catch の外にあるため、ここでの reject は
  // 捕捉されずそのまま呼び出し元へ伝播する（pullArchive の失敗が内部で catch されて
  // 揉み消されるのとは異なる経路）。performArchiveLoad の finally（ロック解除 +
  // runPendingRepoSyncIfIdle）だけは例外時も必ず実行されることを縛る。
  it('loadArchiveNotes が reject した場合、ロック解除と runPendingRepoSyncIfIdle 呼び出しは起きるが、例外は呼び出し元に伝播する', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    const error = new Error('idb boom')
    mocks.loadArchiveNotes.mockRejectedValueOnce(error)

    await expect(restoreStateFromUrl()).rejects.toBe(error)

    expect(appState.isArchiveLoading).toBe(false)
    expect(mocks.runPendingRepoSyncIfIdle).toHaveBeenCalledTimes(1)
    expect(mocks.pullArchive).not.toHaveBeenCalled()
  })
})

describe('restoreStateFromUrl の前段整合（#314: handleWorldChange と同じ前段に揃える）', () => {
  it('アーカイブロードが必要な URL では waitForRehydrate を待つ', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    await restoreStateFromUrl()

    expect(stores.waitForRehydrate).toHaveBeenCalled()
  })

  it('アーカイブ不要な URL では waitForRehydrate を呼ばない', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'home' })
    setUrl('left=%2Fhome%2Fx')

    await restoreStateFromUrl()

    expect(stores.waitForRehydrate).not.toHaveBeenCalled()
  })
})

describe('restoreStateFromUrl の Pull/Push 待ち合わせ（#314: スキップではなく待ってから解決する）', () => {
  // handleWorldChange は Pull/Push/背景Push中ならワールド表示を戻して諦めるが、
  // restoreStateFromUrl は URL を必ず解決する必要があるため、busy の間はアーカイブ
  // ロードを開始せず待ち、busy が解消してから続行することを縛る（#314）。

  it('isPulling が true の間はアーカイブロードを開始せず、false に戻ってから開始する', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')
    stores.isPulling.value = true

    const restorePromise = restoreStateFromUrl()

    // ポーリング間隔（50ms）を跨いでも isPulling が true のままなら開始しない
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(mocks.pullArchive).not.toHaveBeenCalled()
    expect(appState.isArchiveLoading).toBe(false)

    stores.isPulling.value = false
    await restorePromise

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
    expect(appState.isArchiveLoading).toBe(false)
  })

  it('isPushingBackground が true の間もアーカイブロードを開始せず待つ', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')
    stores.isPushingBackground.value = true

    const restorePromise = restoreStateFromUrl()

    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(mocks.pullArchive).not.toHaveBeenCalled()

    stores.isPushingBackground.value = false
    await restorePromise

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
  })
})

describe('performArchiveLoad の二重ロード防止（#314）', () => {
  // handleWorldChange のロード進行中に popstate でアーカイブ URL に戻ると、
  // 従来は restoreStateFromUrl 側が独自に performArchiveLoad を呼び、pullArchive が
  // 2本走っていた（先に終わった方の finally が isArchiveLoading=false にしてしまい、
  // もう片方の pullArchive 実行中にロックが外れる）。performArchiveLoad 自体の再入
  // デデュープにより、2回目の呼び出しは新しいロードを始めず進行中の Promise を
  // 待つだけになることを、restoreStateFromUrl を2回連続で呼ぶ形で縛る。
  it('restoreStateFromUrl を2回同時に呼んでも pullArchive は1回しか走らない', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    let resolvePullArchive!: (v: unknown) => void
    mocks.pullArchive.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePullArchive = resolve
      })
    )

    const first = restoreStateFromUrl()

    // 1回目がロックを取るまで待ってから、popstate 相当の2回目を重ねて呼ぶ
    // （isArchiveLoaded はまだ false のまま = ガード条件は2回目も通過する）
    await vi.waitFor(() => {
      expect(appState.isArchiveLoading).toBe(true)
    })
    const second = restoreStateFromUrl()

    resolvePullArchive({
      success: true,
      notes: [{ id: 'n1' }],
      leaves: [{ id: 'l1' }],
      metadata: { pushCount: 1 },
    })

    await Promise.all([first, second])

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
    expect(appState.isArchiveLoading).toBe(false)
    expect(stores.isArchiveLoaded.value).toBe(true)
  })
})
