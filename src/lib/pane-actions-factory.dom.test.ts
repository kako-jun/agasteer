// @vitest-environment jsdom
/**
 * handleSettingsChange の URL query クリア（#147 綻び1）のテスト
 *
 * リポ切替検知時のみ window.history.replaceState で query を落とし、通常操作
 * （テーマ変更・同一 repoName）では URL に触れないことを縛る。旧 URL のパスと
 * 同名のノート/リーフが新リポにあると、pull 後の restoreStateFromUrl が誤解決して
 * home でなく誤ったノートに着地する回帰を防ぐ不変条件。
 *
 * pane-actions-factory は多数のモジュールを import するため、handleSettingsChange が
 * 実際に触る ./stores / ./app-state.svelte / ./ui だけ実体スタブを与え、残りの兄弟
 * モジュールは空モックで実評価を止める（git.test.ts の vi.hoisted + vi.mock 流儀に合わせる）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stores = vi.hoisted(() => {
  const createStore = <T>(value: T) => ({ value })
  return {
    settings: createStore({ token: 'token', repoName: 'owner/repo', branch: 'main' }),
    isPulling: createStore(false),
    isPushing: createStore(false),
    isPushingBackground: createStore(false),
  }
})

const appState = vi.hoisted(() => ({
  isPullCompleted: true,
  isFirstPriorityFetched: true,
  isArchiveLoading: false,
  repoChangePending: false,
  pendingRepoSync: false,
  pendingRehydrateRepo: null as string | null,
  importOccurredInSettings: false,
}))

const mocks = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  resetForRepoSwitch: vi.fn(),
  rehydrateForRepo: vi.fn(async () => {}),
  // #297 should2: 既定は「rehydrate 実行中でない」＝即解決。個別テストで
  // mockReturnValueOnce により制御可能な Promise に差し替える。
  waitForRehydrate: vi.fn(() => Promise.resolve()),
  archiveReset: vi.fn(),
  applyTheme: vi.fn(),
  // handleCloseSettings の queue/idle 分岐を制御する（既定 undefined=falsy=idle）
  shouldQueueRepoSync: vi.fn(),
  pullFromGitHub: vi.fn(async () => {}),
}))

// handleSettingsChange が実際に触るモジュールだけ実体スタブを与える
vi.mock('./stores', () => ({
  settings: stores.settings,
  isPulling: stores.isPulling,
  isPushing: stores.isPushing,
  isPushingBackground: stores.isPushingBackground,
  updateSettings: mocks.updateSettings,
  resetForRepoSwitch: mocks.resetForRepoSwitch,
  rehydrateForRepo: mocks.rehydrateForRepo,
  waitForRehydrate: mocks.waitForRehydrate,
  archiveLeafStatsStore: { reset: mocks.archiveReset },
}))

vi.mock('./app-state.svelte', () => ({
  appState,
  derivedState: {},
  registerAppActions: vi.fn(),
  getNotesForWorld: vi.fn(),
  getLeavesForWorld: vi.fn(),
  getWorldForNote: vi.fn(),
  getWorldForLeaf: vi.fn(),
  setNotesForWorld: vi.fn(),
  setLeavesForWorld: vi.fn(),
}))

vi.mock('./ui', () => ({
  applyTheme: mocks.applyTheme,
  showPrompt: vi.fn(),
  showConfirm: vi.fn(),
}))

// handleSettingsChange が呼ばない兄弟モジュールは実評価だけ止める（空モック）
vi.mock('./i18n', () => ({ _: { subscribe: () => () => {} } }))
vi.mock('svelte-i18n', () => ({ locale: { subscribe: () => () => {} } }))
vi.mock('./sync/repo-sync-queue', () => ({ shouldQueueRepoSync: mocks.shouldQueueRepoSync }))
vi.mock('./pane-navigation.svelte', () => ({}))
vi.mock('./navigation', () => ({}))
vi.mock('./actions/git', () => ({ pullFromGitHub: mocks.pullFromGitHub }))
vi.mock('./actions/crud', () => ({}))
vi.mock('./actions/move', () => ({}))
vi.mock('./actions/io', () => ({}))
vi.mock('./utils', () => ({}))
vi.mock('./data', () => ({}))

const { handleSettingsChange, handleCloseSettings } = await import('./pane-actions-factory.svelte')

describe('handleSettingsChange の URL query クリア (#147 綻び1)', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    stores.settings.value = { token: 'token', repoName: 'owner/repo', branch: 'main' }
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    appState.isPullCompleted = true
    appState.isFirstPriorityFetched = true
    appState.isArchiveLoading = false
    appState.repoChangePending = false
    appState.pendingRehydrateRepo = null
    mocks.rehydrateForRepo.mockResolvedValue(undefined)
    // 旧 URL に query が載った状態（deep-link 着地後・設定オープン前）を用意する。
    // このセットアップ自身の replaceState は観測対象外にするため、spy はこの後に張る。
    window.history.replaceState({}, '', '/notes/shared-name?leaf=old-leaf&x=1')
    replaceStateSpy = vi.spyOn(window.history, 'replaceState')
  })

  afterEach(() => {
    replaceStateSpy.mockRestore()
  })

  it('リポ切替（repoName が現在と異なる）で replaceState が pathname のみ（query なし）で呼ばれ、search が空になる', () => {
    handleSettingsChange({ repoName: 'owner/new-repo' })

    expect(replaceStateSpy).toHaveBeenCalledTimes(1)
    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/notes/shared-name')
    // 旧 query を保持しない＝新リポで同名パスを誤解決せず home へ収束できる
    expect(window.location.search).toBe('')
    expect(window.location.pathname).toBe('/notes/shared-name')
  })

  it('不発火: テーマだけ変更（repoName 未指定）では replaceState を呼ばず query を保持する', () => {
    handleSettingsChange({ theme: 'greenboard' })

    expect(replaceStateSpy).not.toHaveBeenCalled()
    // 通常操作では URL に触れない（deep-link 状態を壊さない）
    expect(window.location.search).toBe('?leaf=old-leaf&x=1')
    // テーマ適用自体は走る（回帰確認）
    expect(mocks.applyTheme).toHaveBeenCalledTimes(1)
  })

  it('不発火: repoName が現在と同一（変化なし）では replaceState を呼ばず query を保持する', () => {
    handleSettingsChange({ repoName: 'owner/repo' })

    expect(replaceStateSpy).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?leaf=old-leaf&x=1')
    // repo 切替検知に至らないので切替副作用も走らない
    expect(mocks.resetForRepoSwitch).not.toHaveBeenCalled()
    expect(appState.repoChangePending).toBe(false)
  })

  it('リポ切替では切替副作用（resetForRepoSwitch / repoChangePending）と URL クリアが揃って走る', () => {
    handleSettingsChange({ repoName: 'owner/new-repo' })

    expect(mocks.resetForRepoSwitch).toHaveBeenCalledTimes(1)
    expect(appState.repoChangePending).toBe(true)
    expect(window.location.search).toBe('')
  })

  // #147 Q1: query を落とす際に history.state を保持する（{} で潰さない）。
  // top エントリの state には PWA exit guard 等が積んだキーが載っており、{} で
  // 上書きすると popstate のガード検出（e.state?.[PWA_EXIT_GUARD_KEY]）が壊れる。
  // 上の他テストは setup が state={} のため replaceState({}, …) の旧コードでも通って
  // しまい Q1 を縛れない。ここでは非空 state を積み、その同一 state で replaceState が
  // 呼ばれる（＝第1引数が {} でない）ことを縛って旧コードへの退行を検知する。
  it('Q1: 非空の history.state を保持したまま URL query だけ落とす（replaceState({}) 退行検知）', () => {
    const guardState = { 'pwa-exit-guard': true }
    // seed 呼び出しは call-through で history.state を更新するが観測対象外にする
    window.history.replaceState(guardState, '', '/notes/shared-name?leaf=old-leaf')
    replaceStateSpy.mockClear()

    handleSettingsChange({ repoName: 'owner/new-repo' })

    expect(replaceStateSpy).toHaveBeenCalledTimes(1)
    // 第1引数が {} でなく元の state であることが Q1 の核心（旧コードだとここで落ちる）
    expect(replaceStateSpy).toHaveBeenCalledWith(guardState, '', '/notes/shared-name')
    expect(window.history.state).toEqual(guardState)
    expect(window.location.search).toBe('')
  })
})

/**
 * handleCloseSettings の「queue 経由の切替でも scroll reset の印を引き回す」テスト（#147 綻び2 / S1）
 *
 * 同期ビジー中にリポ切替 → close すると予約 pull（pendingRepoSync=true）に載る。
 * このとき repoChangePending を落とすと、予約 pull の入口（git.ts pullFromGitHub）が
 * isRepoSwitchPull を拾えず scroll reset が不発になる（S1 の取りこぼし）。
 * handleCloseSettings が pendingRepoSync=true のとき repoChangePending を保持することを縛る。
 * repoChangePending=true → scroll reset 発火は git.test.ts 側で別途縛っている。
 */
describe('handleCloseSettings queue 経由切替の scroll reset 印引き回し (#147 綻び2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.settings.value = { token: 'token', repoName: 'owner/repo', branch: 'main' }
    stores.isPulling.value = false
    stores.isPushing.value = false
    // 同期ビジー（背景 Push 中）を再現。handleSettingsChange 側の syncBusy 判定にも効く
    stores.isPushingBackground.value = true
    appState.isPullCompleted = true
    appState.isFirstPriorityFetched = true
    appState.isArchiveLoading = false
    appState.repoChangePending = false
    appState.pendingRepoSync = false
    appState.pendingRehydrateRepo = null
    appState.importOccurredInSettings = false
    mocks.rehydrateForRepo.mockResolvedValue(undefined)
  })

  it('queue 経由のリポ切替では予約 pull（pendingRepoSync）に載せつつ repoChangePending を落とさない', async () => {
    // 同期ビジー → close で queue 分岐に入る
    mocks.shouldQueueRepoSync.mockReturnValue(true)

    handleSettingsChange({ repoName: 'owner/new-repo' })
    // 切替検知で予約バッジが立ち、pull 未完了に戻る
    expect(appState.repoChangePending).toBe(true)
    expect(appState.isPullCompleted).toBe(false)

    await handleCloseSettings()

    // 予約 pull に載る。直接 pull は走らない
    expect(appState.pendingRepoSync).toBe(true)
    expect(mocks.pullFromGitHub).not.toHaveBeenCalled()
    // S1 の核心: 予約 pull の入口まで切替印が残る（従来はここで false 化して取りこぼしていた）
    expect(appState.repoChangePending).toBe(true)
  })

  it('不発火（通常 pull デグレ防止）: token 変更で queue した場合は切替印を立てない', async () => {
    mocks.shouldQueueRepoSync.mockReturnValue(true)

    handleSettingsChange({ token: 'new-token' })
    // token 変更はリポ切替ではないので repoChangePending は立たない
    expect(appState.repoChangePending).toBe(false)

    await handleCloseSettings()

    // queue には載るが、切替印は付かない → 予約 pull で scroll reset は起きない
    expect(appState.pendingRepoSync).toBe(true)
    expect(appState.repoChangePending).toBe(false)
  })
})

/**
 * handleCloseSettings は shouldQueueRepoSync 判定より前に waitForRehydrate() を
 * 待つ（#297 should2 / T12）。
 *
 * 待たずに判定すると、判定した瞬間は idle でも、waitForRehydrate() 待機中に
 * 背景 Push がロックを取った場合、待機後にそのまま pullFromGitHub を直接呼んで
 * しまう。実装では pullFromGitHub 自身が waitForRehydrate() を待った後に
 * canSync で黙って return するため、queue にも積まれず Pull が消える
 * （このテストでは pullFromGitHub をモックしているため「消える」ことまでは
 * 再現できないが、shouldQueueRepoSync に渡る状態が待機後の値であること＝
 * queue 分岐に正しく入ることを直接縛る）。
 */
describe('handleCloseSettings は rehydrate 完了を待ってからアイドル判定する (#297 should2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.settings.value = { token: 'token', repoName: 'owner/repo', branch: 'main' }
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    appState.isPullCompleted = true
    appState.isFirstPriorityFetched = true
    appState.isArchiveLoading = false
    appState.repoChangePending = false
    appState.pendingRepoSync = false
    appState.pendingRehydrateRepo = null
    appState.importOccurredInSettings = false
    mocks.rehydrateForRepo.mockResolvedValue(undefined)
    mocks.waitForRehydrate.mockImplementation(() => Promise.resolve())
    // 渡された時点の state をそのまま busy 判定に使う（呼び出しタイミングを縛るため）
    mocks.shouldQueueRepoSync.mockImplementation(
      (state: { isPulling: boolean; isPushing: boolean; isArchiveLoading: boolean }) =>
        state.isPulling || state.isPushing || state.isArchiveLoading
    )
  })

  it('waitForRehydrate 待機中に背景 Push がロックを取った場合、待機後の状態で判定してキューに積む（直接 Pull は呼ばない）', async () => {
    let resolveRehydrate!: () => void
    mocks.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    handleSettingsChange({ token: 'new-token' })
    const closePromise = handleCloseSettings()

    // waitForRehydrate 待機中（まだ判定前）に背景 Push がロックを取る
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.shouldQueueRepoSync).not.toHaveBeenCalled()
    stores.isPushingBackground.value = true

    resolveRehydrate()
    await closePromise

    // 待機後に判定しているので busy と正しく判定してキューに積む
    expect(appState.pendingRepoSync).toBe(true)
    expect(mocks.pullFromGitHub).not.toHaveBeenCalled()
  })

  it('waitForRehydrate がアイドルで即解決するなら従来どおり判定・実行される（回帰確認）', async () => {
    handleSettingsChange({ token: 'new-token' })
    await handleCloseSettings()

    expect(mocks.pullFromGitHub).toHaveBeenCalledTimes(1)
    expect(appState.pendingRepoSync).toBe(false)
  })
})

/**
 * handleCloseSettings はフラグ（githubSettingsChangedInSettings 等）を関数末尾でなく
 * 冒頭で退避・クリアする（#297 N-b）。
 *
 * 末尾でクリアすると、この関数が waitForRehydrate/pullFromGitHub を待っている間に
 * 設定を再度開いてリポ/トークンを変更した分（フラグが再度 true になる）まで、
 * 1回目の呼び出しの末尾クリアで消してしまい、2回目の close でその変更が無視される。
 */
describe('handleCloseSettings はフラグを冒頭で退避してクリアする (#297 N-b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.settings.value = { token: 'token', repoName: 'owner/repo', branch: 'main' }
    stores.isPulling.value = false
    stores.isPushing.value = false
    stores.isPushingBackground.value = false
    appState.isPullCompleted = true
    appState.isFirstPriorityFetched = true
    appState.isArchiveLoading = false
    appState.repoChangePending = false
    appState.pendingRepoSync = false
    appState.pendingRehydrateRepo = null
    appState.importOccurredInSettings = false
    mocks.rehydrateForRepo.mockResolvedValue(undefined)
    mocks.waitForRehydrate.mockImplementation(() => Promise.resolve())
    // 常にアイドル（queue しない）→ 直接 pullFromGitHub 分岐に入れる
    mocks.shouldQueueRepoSync.mockReturnValue(false)
  })

  it('1回目の close が待機中に設定を再度開いてリポを変更すると、2回目の close でその変更が処理される（待機中に消えない）', async () => {
    let resolveRehydrate!: () => void
    mocks.waitForRehydrate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRehydrate = resolve
      })
    )

    handleSettingsChange({ repoName: 'owner/repo-b' })
    const closePromise1 = handleCloseSettings()

    // closePromise1 が waitForRehydrate で止まっている間に、設定を開き直して
    // さらに別リポへ変更する（githubSettingsChangedInSettings が再度 true になる）
    await Promise.resolve()
    await Promise.resolve()
    handleSettingsChange({ repoName: 'owner/repo-c' })

    resolveRehydrate()
    await closePromise1

    // 1回目の close は完了（1回目の変更分の pull は実行済み）
    expect(mocks.pullFromGitHub).toHaveBeenCalledTimes(1)

    // 2回目の close で、待機中に積まれた変更（repo-c への切替）がちゃんと処理される
    // （末尾クリアで消えていれば、ここで pullFromGitHub は増えない＝バグの再現）
    await handleCloseSettings()
    expect(mocks.pullFromGitHub).toHaveBeenCalledTimes(2)
  })

  it('待機中に変更がなければ、2回目の close は何もしない（回帰確認）', async () => {
    handleSettingsChange({ repoName: 'owner/repo-b' })
    await handleCloseSettings()
    expect(mocks.pullFromGitHub).toHaveBeenCalledTimes(1)

    await handleCloseSettings()
    expect(mocks.pullFromGitHub).toHaveBeenCalledTimes(1)
  })
})
