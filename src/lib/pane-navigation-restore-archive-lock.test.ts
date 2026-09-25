// @vitest-environment jsdom
/**
 * restoreStateFromUrl のアーカイブロード統合・待ち合わせのテスト（#307/#314）
 *
 * #301 で handleWorldChange のアーカイブロード本体（IndexedDBキャッシュ読み出し +
 * pullArchive）とそのロック管理（appState.isArchiveLoading）は archive-load.svelte.ts の
 * performArchiveLoad に抽出されたが、restoreStateFromUrl（URL からの状態復元時の
 * アーカイブロード）は独自実装のまま残っていた。#307 でロック取得タイミングを揃え、
 * #314 で再入・Pull/Push 並走のガード（must M2/M4）と、待ち合わせの signal 化（should S1）・
 * 世代管理と pane スナップショット比較による上書き防止（must M4）を追加した。
 *
 * #314 S1: isPulling/isPushing/isPushingBackground/appState.isArchiveLoading の
 * setter は stores/sync-signal.ts の notifySyncActivityChanged() を呼ぶことで
 * 待機者を起こす。このテストファイルは `./stores` と `./app-state.svelte` を丸ごと
 * フェイクに差し替えるため、実物の setter を経由しない。フェイク側の value setter が
 * 同じ signal（syncSignal）を鳴らすようにし、`./stores/sync-signal` もこの signal で
 * 差し替えることで、restoreStateFromUrl 側の待機（pane-navigation-url-restore.svelte.ts
 * の waitForSyncIdle）が実物と同じ形で解決されるようにする。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ValueStore<T> = { value: T }
function createStore<T>(value: T): ValueStore<T> {
  return { value }
}

// #314 S1: フェイク版の同期シグナル。stores/isPulling 等・appState.isArchiveLoading の
// フェイク setter と、vi.mock('./stores/sync-signal', ...) の両方から参照する。
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
  settings: createStore({ token: 't', repoName: 'owner/repo' }),
  offlineLeafStore: createStore({ content: '', badgeIcon: '', badgeColor: '' }),
  archiveNotes: createStore<unknown[]>([]),
  archiveLeaves: createStore<unknown[]>([]),
  archiveMetadata: createStore({ pushCount: 0 }),
  isArchiveLoaded: createStore(false),
  isDirty: createStore(false),
  waitForRehydrate: vi.fn(() => Promise.resolve()),
  isRehydrating: vi.fn(() => false),
}))

// isPulling/isPushing/isPushingBackground は #314 S1 で setter が signal を鳴らすように
// なった。フェイクでも同じ挙動にする（syncSignal.notify を経由する専用 store）。
const syncFlags = vi.hoisted(() => ({}) as Record<string, ValueStore<boolean>>)

const appState = vi.hoisted(() => {
  let archiveLoading = false
  return {
    isDualPane: true,
    get isArchiveLoading() {
      return archiveLoading
    },
    set isArchiveLoading(v: boolean) {
      archiveLoading = v
      syncSignal.notify()
    },
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
  }
})

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
  // nit3: 正常系での永続化呼び出し（saveArchiveNotes/saveArchiveLeaves/setArchiveBaseline）を
  // assert できるよう、他の mocks 同様に外から参照できる場所に置く。
  saveArchiveNotes: vi.fn(async () => {}),
  saveArchiveLeaves: vi.fn(async () => {}),
  setArchiveBaseline: vi.fn(),
}))

vi.mock('./stores', () => {
  syncFlags.isPulling = createNotifyingStore(false)
  syncFlags.isPushing = createNotifyingStore(false)
  syncFlags.isPushingBackground = createNotifyingStore(false)
  return {
    ...stores,
    isPulling: syncFlags.isPulling,
    isPushing: syncFlags.isPushing,
    isPushingBackground: syncFlags.isPushingBackground,
    archiveLeafStatsStore: mocks.archiveLeafStatsStore,
    getDialogPositionForPane: vi.fn(() => ({ top: 0, left: 0 })),
    getNotesForWorld: vi.fn(() => []),
    getLeavesForWorld: vi.fn(() => []),
    setArchiveBaseline: mocks.setArchiveBaseline,
    scheduleOfflineSave: vi.fn(),
  }
})

vi.mock('./stores/sync-signal', () => ({
  notifySyncActivityChanged: syncSignal.notify,
  waitForSyncActivityChange: syncSignal.wait,
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
  syncFlags.isPulling.value = false
  syncFlags.isPushing.value = false
  syncFlags.isPushingBackground.value = false
  stores.isArchiveLoaded.value = false
  stores.archiveNotes.value = []
  stores.archiveLeaves.value = []
  stores.settings.value = { token: 't', repoName: 'owner/repo' }
  stores.isRehydrating.mockReturnValue(false)
  appState.isArchiveLoading = false
  appState.isRestoringFromUrl = false
  appState.isDualPane = true
  mocks.runPendingRepoSyncIfIdle.mockImplementation(async () => {})
  mocks.loadArchiveNotes.mockResolvedValue([])
  mocks.loadArchiveLeaves.mockResolvedValue([])
  mocks.pullArchive.mockResolvedValue({
    success: false,
    message: 'github.pullFailed',
  })
  mocks.extractWorldPrefix.mockReturnValue({ world: 'home' })
  mocks.resolvePath.mockReturnValue({
    type: 'home',
    world: 'archive',
    note: null,
    leaf: null,
    isPreview: false,
  })
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
    // isPushingBackground/isArchiveLoading はすべて false（beforeEach）なので
    // waitForSyncIdle() の busy チェックは即座に抜けるが、待ち合わせ自体が最低
    // 1マイクロタスクを要する。
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

describe('restoreStateFromUrl の isRestoringFromUrl 生死管理（#314 M-1: try/finally + 世代ガード）', () => {
  // 修正前は本体の先頭で true、末尾で無条件に false へ戻すだけだった。(a) 旧形式/
  // 引数無し URL の早期 return 経路、(b) waitUntilArchiveReady 内（IndexedDB reject 等）
  // で例外が飛ぶ経路のどちらも末尾に届かず、isRestoringFromUrl が true のまま残って
  // いた。true のままだと updateUrlFromState の早期 return ガードに引っかかり続け、
  // 以後 URL・履歴が一切更新されなくなる（App.svelte の $effect → updateUrlFromState）。
  it('待機中に旧形式URLで2回目を呼ぶと、1回目が完了しても isRestoringFromUrl は2回目が確定させた false のまま', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    let resolvePullArchive!: (v: unknown) => void
    mocks.pullArchive.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePullArchive = resolve
      })
    )

    const first = restoreStateFromUrl()
    await vi.waitFor(() => {
      expect(appState.isArchiveLoading).toBe(true)
    })
    expect(appState.isRestoringFromUrl).toBe(true)

    // 1回目が待機中に、2回目（旧形式: left/right も note/leaf も無い URL）を呼ぶ。
    // resolveLegacyUrlParams の早期 return 経路を通る。
    window.history.pushState({}, '', '/')
    const second = restoreStateFromUrl()
    await second

    // 2回目（最新世代）は即座に完了し、isRestoringFromUrl を false に戻す
    expect(appState.isRestoringFromUrl).toBe(false)

    // 1回目のアーカイブロードを完了させる
    resolvePullArchive({
      success: true,
      notes: [{ id: 'n1' }],
      leaves: [{ id: 'l1' }],
      metadata: { pushCount: 1 },
    })
    await first

    // 1回目（古い世代）の finally は、2回目が既に false にした isRestoringFromUrl を
    // 上書きしない（世代ガードで無視される）。true に戻ってしまわないことを縛る。
    expect(appState.isRestoringFromUrl).toBe(false)
  })

  it('loadArchiveNotes が reject して restoreStateFromUrl 自体が例外を投げても、isRestoringFromUrl は false に戻る', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    const error = new Error('idb boom')
    mocks.loadArchiveNotes.mockRejectedValueOnce(error)

    expect(appState.isRestoringFromUrl).toBe(false)
    await expect(restoreStateFromUrl()).rejects.toBe(error)

    expect(appState.isRestoringFromUrl).toBe(false)
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

describe('restoreStateFromUrl の Pull/Push 待ち合わせ（#314 S1: signal 通知で待つ）', () => {
  // handleWorldChange は Pull/Push/背景Push中ならワールド表示を戻して諦めるが、
  // restoreStateFromUrl は URL を必ず解決する必要があるため、busy の間はアーカイブ
  // ロードを開始せず待ち、busy が解消してから続行することを縛る（#314）。
  //
  // #314 S2: 実時間 setTimeout に頼るポーリング待ちのテストをやめ、
  // syncFlags/appState のフェイク setter が鳴らす signal（syncSignal）で
  // 手動 resolve する（fake timers 不要）。

  it('isPulling が true の間はアーカイブロードを開始せず、false に戻ってから開始する', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')
    syncFlags.isPulling.value = true

    const restorePromise = restoreStateFromUrl()

    // busy な間はマイクロタスクをいくつ挟んでも pullArchive は呼ばれない
    // （isPulling が true のままである限り waitForSyncIdle のループを抜けられない
    // ため、この否定アサーションはタイミングに依存せず常に成り立つ）
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.pullArchive).not.toHaveBeenCalled()
    expect(appState.isArchiveLoading).toBe(false)

    syncFlags.isPulling.value = false
    await restorePromise

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
    expect(appState.isArchiveLoading).toBe(false)
  })

  it('isPushingBackground が true の間もアーカイブロードを開始せず待つ', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')
    syncFlags.isPushingBackground.value = true

    const restorePromise = restoreStateFromUrl()

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.pullArchive).not.toHaveBeenCalled()

    syncFlags.isPushingBackground.value = false
    await restorePromise

    expect(mocks.pullArchive).toHaveBeenCalledTimes(1)
  })
})

describe('restoreStateFromUrl のアーカイブロード待ち合わせ（#314 M2: isArchiveLoading も待つ）', () => {
  // move.ts（moveNoteToWorld/moveLeafToWorld）は performArchiveLoad を経由せず
  // 自前で appState.isArchiveLoading=true にして pullArchive する。restoreStateFromUrl
  // 側の待機条件に isArchiveLoading を含めないと、move.ts のロード中にも
  // restoreStateFromUrl 自身が2本目の pullArchive を始めてしまう（二重ロード）。
  it('他所（move.ts 相当）が isArchiveLoading=true でロード中の場合、ロードが完了して isArchiveLoaded=true になるまで待ち、自分では pullArchive を呼ばない', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    // move.ts 相当: performArchiveLoad を経由せず自前でロード中
    appState.isArchiveLoading = true

    const restorePromise = restoreStateFromUrl()

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.pullArchive).not.toHaveBeenCalled()

    // move.ts 相当のロードが完了する
    stores.archiveNotes.value = [{ id: 'n1' }]
    stores.archiveLeaves.value = [{ id: 'l1' }]
    stores.isArchiveLoaded.value = true
    appState.isArchiveLoading = false

    await restorePromise

    // restoreStateFromUrl 自身は一度も pullArchive を呼んでいない（二重ロードしていない）
    expect(mocks.pullArchive).not.toHaveBeenCalled()
  })
})

describe('performArchiveLoad の二重ロード防止（#314 M3）', () => {
  // handleWorldChange のロード進行中に popstate でアーカイブ URL に戻ると、
  // 従来は restoreStateFromUrl 側が独自に performArchiveLoad を呼び、pullArchive が
  // 2本走っていた（先に終わった方の finally が isArchiveLoading=false にしてしまい、
  // もう片方の pullArchive 実行中にロックが外れる）。performArchiveLoad 自体の再入
  // デデュープ、および restoreStateFromUrl 側の待機が isArchiveLoading も見るように
  // なったことで、2回目の呼び出しは新しいロードを始めず進行中のロード完了を待つだけに
  // なることを、restoreStateFromUrl を2回連続で呼ぶ形で縛る。
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

describe('restoreStateFromUrl の世代管理（#314 M4b: 新しい呼び出しが古い呼び出しを上書きする）', () => {
  it('待機中に2回目（archive を必要としない URL）が来て先に解決したら、1回目（古い世代）はその結果を上書きしない', async () => {
    mocks.extractWorldPrefix.mockImplementation((path: string) => ({
      world: path.startsWith('/archive') ? 'archive' : 'home',
    }))
    mocks.resolvePath.mockImplementation((path: string) => ({
      type: 'note',
      world: path.startsWith('/archive') ? 'archive' : 'home',
      note: { id: `resolved:${path}` },
      leaf: null,
      isPreview: false,
    }))

    setUrl('left=%2Farchive%2Fx')
    let resolvePullArchive!: (v: unknown) => void
    mocks.pullArchive.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePullArchive = resolve
      })
    )

    const first = restoreStateFromUrl()
    await vi.waitFor(() => {
      expect(appState.isArchiveLoading).toBe(true)
    })

    // 待機中に2回目（home URL、archive 不要）が来て即座に解決する
    setUrl('left=%2Fhome%2Fy')
    const second = restoreStateFromUrl()
    await second
    expect(stores.leftNote.value).toEqual({ id: 'resolved:/home/y' })

    // 1回目のアーカイブロードが完了する
    resolvePullArchive({
      success: true,
      notes: [{ id: 'n1' }],
      leaves: [{ id: 'l1' }],
      metadata: { pushCount: 1 },
    })
    await first

    // 1回目（古い世代）は2回目が解決した pane 状態を上書きしない
    expect(stores.leftNote.value).toEqual({ id: 'resolved:/home/y' })
  })
})

describe('restoreStateFromUrl の pane スナップショット比較（#314 M4b: ユーザー操作後は上書きしない）', () => {
  it('待機中にユーザーがそのペインを別のノートへ動かしていたら、待機後の解決で上書きしない', async () => {
    mocks.extractWorldPrefix.mockReturnValue({ world: 'archive' })
    setUrl('left=%2Farchive%2Fx')

    let resolvePullArchive!: (v: unknown) => void
    mocks.pullArchive.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePullArchive = resolve
      })
    )

    const restorePromise = restoreStateFromUrl()
    await vi.waitFor(() => {
      expect(appState.isArchiveLoading).toBe(true)
    })

    // 待機中にユーザーが（selectNote 等、restoreStateFromUrl を経由しない操作で）
    // left pane を別のノートへ動かした
    const userNote = { id: 'user-picked' }
    stores.leftNote.value = userNote
    stores.leftView.value = 'note'

    resolvePullArchive({
      success: true,
      notes: [{ id: 'n1' }],
      leaves: [{ id: 'l1' }],
      metadata: { pushCount: 1 },
    })
    await restorePromise

    // URL 復元の結果で上書きされず、ユーザーが選んだノートのままである
    expect(stores.leftNote.value).toBe(userNote)
  })
})

describe('restoreStateFromUrl の pane 別解決（#314 M4a: archive 不要な pane は待たない）', () => {
  it('left=home, right=archive のとき、left は right 側のアーカイブロード完了を待たず即座に解決される', async () => {
    appState.isDualPane = true
    mocks.extractWorldPrefix.mockImplementation((path: string) => ({
      world: path.startsWith('/archive') ? 'archive' : 'home',
    }))
    mocks.resolvePath.mockImplementation((path: string) => ({
      type: 'note',
      world: path.startsWith('/archive') ? 'archive' : 'home',
      note: { id: `resolved:${path}` },
      leaf: null,
      isPreview: false,
    }))
    setUrl('left=%2Fhome%2Fx&right=%2Farchive%2Fy')

    let resolvePullArchive!: (v: unknown) => void
    mocks.pullArchive.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePullArchive = resolve
      })
    )

    const restorePromise = restoreStateFromUrl()

    // await すら挟まない（真に同期的な即時解決）: left は right の pullArchive 完了を
    // 待たずに、呼び出し直後の時点で既に解決済みである
    expect(stores.leftNote.value).toEqual({ id: 'resolved:/home/x' })

    // クリーンアップ: right 側の待機も完了させておく
    resolvePullArchive({
      success: true,
      notes: [],
      leaves: [],
      metadata: { pushCount: 1 },
    })
    await restorePromise
  })
})
