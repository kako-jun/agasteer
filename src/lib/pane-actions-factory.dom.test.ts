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
  pendingRehydrateRepo: null as string | null,
}))

const mocks = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  resetForRepoSwitch: vi.fn(),
  rehydrateForRepo: vi.fn(async () => {}),
  archiveReset: vi.fn(),
  applyTheme: vi.fn(),
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
vi.mock('./sync/repo-sync-queue', () => ({ shouldQueueRepoSync: vi.fn() }))
vi.mock('./pane-navigation.svelte', () => ({}))
vi.mock('./navigation', () => ({}))
vi.mock('./actions/git', () => ({}))
vi.mock('./actions/crud', () => ({}))
vi.mock('./actions/move', () => ({}))
vi.mock('./actions/io', () => ({}))
vi.mock('./utils', () => ({}))
vi.mock('./data', () => ({}))

const { handleSettingsChange } = await import('./pane-actions-factory.svelte')

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
})
