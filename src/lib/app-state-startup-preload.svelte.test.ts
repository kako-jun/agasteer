// @vitest-environment jsdom
/**
 * #321: initApp の起動時の先読み込み（dirty なキャッシュを Pull の前にストアへ読み込む）と、
 * push-hang の競合解決中のロックを検証する。
 * 周辺モジュールのモック一式は app-state-startup-metadata.svelte.test.ts と同じ流儀。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- 値ストア（{ value } 形状）ヘルパ。既存テスト（git.test.ts 等）と同じ流儀。----
const vstore = <T>(value: T) => ({ value })

const CACHED_NOTES = [{ id: 'n1', name: 'Work', order: 0 }]
const CACHED_LEAVES = [
  { id: 'a', noteId: 'n1', title: 'Todo', content: 'local edit', updatedAt: 1, order: 0 },
]

// テストごとに差し替える観測点（vi.mock ファクトリから参照するため hoisted）
const h = vi.hoisted(() => {
  const s = <T>(value: T) => ({ value })
  return {
    notes: s<unknown[]>([]),
    leaves: s<unknown[]>([]),
    isPulling: s(false),
    isPushing: s(false),
    isPushingBackground: s(false),
    isStructureDirty: s(false),
    getPersistedDirtyFlag: vi.fn(() => true),
    rebuild: vi.fn(),
    getPushInFlightAt: vi.fn((): number | undefined => undefined),
    executeStaleCheck: vi.fn(async (): Promise<unknown> => ({ status: 'up_to_date' })),
    applyStaleResult: vi.fn((): string => 'up-to-date'),
    resolveConflict: vi.fn(async (): Promise<string> => 'cancel'),
  }
})

const EMPTY_METADATA = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
const PERSISTED_METADATA = {
  version: 1,
  notes: {},
  leaves: { 'note/leaf.md': { id: 'leaf-1', updatedAt: 1, order: 0 } },
  pushCount: 7,
}

// `./stores` モック内の metadata ストア（下の vi.mock ファクトリと initStoreEffects
// モックの両方から同じインスタンスを参照するため、モジュールスコープに置く）。
const metadataStore = vstore({ ...EMPTY_METADATA })

// persistence-effects.svelte.ts の initStoreEffects() は $effect.root 内の metadata 用
// $effect が登録直後に一度発火し、その時点の metadata.value で
// setPersistedMetadata() を呼ぶ。このスパイはその発火を模倣し、事故本体
// （空 metadata の書き戻し）を直接検知する。
const persistMetadataSpy = vi.fn()

// ../main を差し替え: waitForSwCheck を即解決にして起動 IIFE を GitHub 設定チェックまで進める。
vi.mock('../main', () => ({
  waitForSwCheck: Promise.resolve(),
}))

// i18n: get(_) が翻訳関数を返すよう、最小の subscribe ストアを提供する。
vi.mock('./i18n', () => ({
  initI18n: vi.fn(async () => {}),
  _: { subscribe: (run: (t: (key: string) => string) => void) => (run((key) => key), () => {}) },
}))

vi.mock('./ui', () => ({
  alertAsync: vi.fn(async () => {}),
  applyTheme: vi.fn(),
  loadAndApplyCustomFont: vi.fn(async () => {}),
  loadAndApplySystemMonoFont: vi.fn(async () => {}),
  loadAndApplyCustomBackgrounds: vi.fn(async () => {}),
  showPushToast: vi.fn(),
  showPullToast: vi.fn(),
}))

// data 層: リポ設定済み（token/repoName あり）で起動し、full pull 経路に入らせる。
vi.mock('./data', () => ({
  loadSettings: vi.fn(async () => ({
    locale: 'en',
    theme: 'dark',
    toolName: 'Agasteer',
    repoName: 'owner/repo',
    token: 'tok',
    hasCustomFont: false,
    hasCustomBackgroundLeft: false,
    hasCustomBackgroundRight: false,
  })),
  loadNotes: vi.fn(async () => CACHED_NOTES),
  loadLeaves: vi.fn(async () => CACHED_LEAVES),
  loadOfflineLeaf: vi.fn(async () => null),
  getPersistedLastPulledPushCount: vi.fn(() => null),
  getPersistedMetadata: vi.fn(async () => PERSISTED_METADATA),
  shouldShowPwaInstallBanner: vi.fn(() => false),
  setCurrentRepo: vi.fn(async () => {}),
  syncRepoNameCache: vi.fn(),
  getPushInFlightAt: h.getPushInFlightAt,
}))

// stores 層: init 到達に必要なものを網羅（#191 heartbeat テストと同じ一式）。
// metadata はモジュール初期値相当の空メタデータから始める。
vi.mock('./stores', () => ({
  initActivityDetection: vi.fn(() => vi.fn()),
  setupBeforeUnloadSave: vi.fn(() => vi.fn()),
  // 実装（persistence-effects.svelte.ts）の $effect.root 内 metadata 用 $effect は
  // 登録直後に一度発火し、その時点の metadata.value を setPersistedMetadata() に渡す。
  // ここではその初回発火だけを persistMetadataSpy 経由で模倣する（#295 M1）。
  // 注: persistence-effects.svelte.ts 側の $effect 自体の挙動（isRehydrating ガード等）は
  // このテストの範囲外。本物の初回発火は microtask 遅延だが、ここでは
  // initStoreEffects() が呼ばれた時点の metadata.value で同期に模倣している。
  initStoreEffects: vi.fn(() => {
    persistMetadataSpy(JSON.parse(JSON.stringify(metadataStore.value)))
    return vi.fn()
  }),
  startStaleChecker: vi.fn(),
  stopStaleChecker: vi.fn(),
  executeStaleCheck: h.executeStaleCheck,
  applyStaleResult: h.applyStaleResult,
  flushPendingSaves: vi.fn(async () => {}),
  settings: vstore({ token: '', repoName: '', branch: 'main' }),
  isPulling: h.isPulling,
  isPushing: h.isPushing,
  isPushingBackground: h.isPushingBackground,
  githubConfigured: vstore(false),
  isDirty: vstore(false),
  isStructureDirty: h.isStructureDirty,
  shouldAutoPush: vstore(false),
  shouldAutoPull: vstore(false),
  lastKnownCommitSha: vstore<string | null>('base-sha'),
  lastPulledPushCount: vstore(0),
  notes: h.notes,
  leaves: h.leaves,
  archiveNotes: vstore([]),
  archiveLeaves: vstore([]),
  leftWorld: vstore('home'),
  rightWorld: vstore('home'),
  leftView: vstore('tree'),
  rightView: vstore('tree'),
  metadata: metadataStore,
  archiveMetadata: vstore({ pushCount: 0 }),
  isArchiveLoaded: vstore(false),
  offlineLeafStore: vstore<Record<string, unknown> | null>(null),
  pullProgressInfo: vstore(null),
  dragStore: { draggedNote: null, draggedLeaf: null, dragOverNoteId: null, dragOverLeafId: null },
  moveModalStore: { isOpen: false, targetLeaf: null, targetNote: null, targetPane: null },
  leafStatsStore: { rebuild: h.rebuild },
  archiveLeafStatsStore: { rebuild: vi.fn() },
  updateNotes: vi.fn(),
  updateLeaves: vi.fn(),
  updateArchiveNotes: vi.fn(),
  updateArchiveLeaves: vi.fn(),
  clearAllChanges: vi.fn(),
  getPersistedDirtyFlag: h.getPersistedDirtyFlag,
  resetAutoPushTimer: vi.fn(),
  setLastPushedSnapshot: vi.fn(),
  setArchiveBaseline: vi.fn(),
  getNotesForWorld: vi.fn(() => []),
  getLeavesForWorld: vi.fn(() => []),
  getWorldForPane: vi.fn(() => 'home'),
  getNotesForPane: vi.fn(() => []),
  getLeavesForPane: vi.fn(() => []),
  getWorldForNote: vi.fn(() => 'home'),
  getWorldForLeaf: vi.fn(() => 'home'),
}))

vi.mock('./utils', () => ({
  priorityItems: vstore([]),
  createPriorityLeaf: vi.fn(() => ({})),
  createOfflineLeaf: vi.fn(() => ({})),
  PRIORITY_LEAF_ID: 'priority',
  OFFLINE_LEAF_ID: 'offline',
}))
vi.mock('./startup-cache', () => ({ shouldUseStartupCache: vi.fn(() => false) }))
vi.mock('./actions/conflict-dialog', () => ({ showConflictDialog: vi.fn() }))
vi.mock('./actions/conflict-resolve', () => ({
  resolveConflict: h.resolveConflict,
  isResolvingConflict: () => false,
}))
vi.mock('./sync/constants', () => ({
  PUSH_HANG_THRESHOLD_MS: 60_000,
  RESUME_RETRY_BACKOFFS_MS: [1000],
}))
vi.mock('./sync/resume-retry', () => ({ runResumeStaleCheckRetry: vi.fn(async () => {}) }))
vi.mock('./api', () => ({
  pullArchive: vi.fn(async () => {}),
  translateGitHubMessage: vi.fn((m: string) => m),
}))
vi.mock('./api/media', () => ({ initMediaOnlineRetry: vi.fn(() => vi.fn()) }))

// app-state.svelte.ts は module-level で `window.matchMedia` を評価するため、
// 全 import より前にトップレベルで用意しておく（beforeEach では間に合わない）。
if (typeof (globalThis as { matchMedia?: unknown }).matchMedia !== 'function') {
  ;(globalThis as { matchMedia?: unknown }).matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
}

type PullFn = (
  isInitialStartup: boolean,
  onCancel?: () => void | Promise<void>,
  precomputed?: unknown
) => Promise<void>

function makeDeps(onPull: PullFn) {
  return {
    pullFromGitHub: vi.fn(onPull),
    pushToGitHub: vi.fn(async () => {}),
    restoreStateFromUrl: vi.fn(async () => {}),
    handleGlobalKeyDown: vi.fn(),
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true }))
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 0)
  )
  vi.clearAllMocks()
  h.notes.value = []
  h.leaves.value = []
  h.isPulling.value = false
  h.isPushing.value = false
  h.isPushingBackground.value = false
  h.isStructureDirty.value = false
  h.getPersistedDirtyFlag.mockReturnValue(true)
  h.rebuild.mockImplementation(() => {})
  h.getPushInFlightAt.mockReturnValue(undefined)
  h.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
  h.applyStaleResult.mockReturnValue('up-to-date')
  h.resolveConflict.mockResolvedValue('cancel')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('#321 起動時の先読み込み', () => {
  it('dirty なら Pull の前に dirty キャッシュ（ベースラインにしない）をストアへ読み込み、URL 復元は省く', async () => {
    const { initApp } = await import('./app-state.svelte')
    const { setLastPushedSnapshot } = await import('./stores')
    let atPull: { notes: unknown; dirty: boolean; restoreCalls: number } | undefined
    const deps = makeDeps(async () => {
      atPull = {
        notes: h.notes.value,
        dirty: h.isStructureDirty.value,
        restoreCalls: deps.restoreStateFromUrl.mock.calls.length,
      }
    })
    const teardown = initApp(deps)
    await vi.waitFor(() => expect(deps.pullFromGitHub).toHaveBeenCalled())

    expect(atPull).toEqual({ notes: CACHED_NOTES, dirty: true, restoreCalls: 0 })
    expect(deps.pullFromGitHub.mock.calls[0][0]).toBe(true)
    expect(setLastPushedSnapshot).not.toHaveBeenCalled()
    teardown()
  })

  it('キャンセル時は二重に読み込まず、省いた URL 復元だけ行う', async () => {
    const { initApp } = await import('./app-state.svelte')
    const deps = makeDeps(async (_startup, onCancel) => {
      await onCancel?.()
    })
    const teardown = initApp(deps)
    await vi.waitFor(() => expect(deps.restoreStateFromUrl).toHaveBeenCalledTimes(1))

    // 読み込み（集計の再構築）は先読み込みの1回だけ
    expect(h.rebuild).toHaveBeenCalledTimes(1)
    expect(h.notes.value).toEqual(CACHED_NOTES)
    teardown()
  })

  it('先読み込みが失敗したら、従来どおりキャンセル時に読み込む', async () => {
    h.rebuild.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { initApp } = await import('./app-state.svelte')
    const deps = makeDeps(async (_startup, onCancel) => {
      await onCancel?.()
    })
    const teardown = initApp(deps)
    await vi.waitFor(() => expect(deps.restoreStateFromUrl).toHaveBeenCalledTimes(1))

    // 1回目（先読み込み）は失敗、2回目（キャンセル時の従来の読み込み）で読み込まれる
    expect(h.rebuild).toHaveBeenCalledTimes(2)
    expect(h.notes.value).toEqual(CACHED_NOTES)
    spy.mockRestore()
    teardown()
  })

  it('dirty でなければ先読み込みしない（従来どおり Pull だけ）', async () => {
    h.getPersistedDirtyFlag.mockReturnValue(false)
    const { initApp } = await import('./app-state.svelte')
    const deps = makeDeps(async () => {})
    const teardown = initApp(deps)
    await vi.waitFor(() => expect(deps.pullFromGitHub).toHaveBeenCalled())

    expect(h.rebuild).not.toHaveBeenCalled()
    expect(h.notes.value).toEqual([])
    teardown()
  })
})

describe('#321 push-hang の競合解決中のロック', () => {
  async function startAndTriggerHang(resolution: string) {
    h.getPersistedDirtyFlag.mockReturnValue(false)
    const { initApp } = await import('./app-state.svelte')
    let pushingDuringResolve: boolean | undefined
    h.resolveConflict.mockImplementation(async () => {
      pushingDuringResolve = h.isPushing.value
      return resolution
    })
    const deps = makeDeps(async () => {})
    const teardown = initApp(deps)
    await vi.waitFor(() => expect(deps.pullFromGitHub).toHaveBeenCalled())
    deps.pullFromGitHub.mockClear()

    // Push がハングしたまま復帰した状態: isPushing が立ったまま・飛行中フラグが古い
    h.isPushing.value = true
    h.getPushInFlightAt.mockReturnValue(Date.now() - 120_000)
    h.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'base-sha',
      remoteCommitSha: 'remote-sha',
    })
    h.applyStaleResult.mockReturnValue('stale-dirty')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    return { deps, teardown, pushingDuringResolve: () => pushingDuringResolve }
  }

  it('解決中は isPushing を立て、マージ後の Push の前に解放する', async () => {
    const { deps, teardown, pushingDuringResolve } = await startAndTriggerHang('merged')
    let pushingAtPush: boolean | undefined
    deps.pushToGitHub.mockImplementation(async () => {
      pushingAtPush = h.isPushing.value
    })
    await vi.waitFor(() => expect(deps.pushToGitHub).toHaveBeenCalled())

    expect(h.resolveConflict).toHaveBeenCalledWith(expect.objectContaining({ kind: 'push-hang' }))
    expect(pushingDuringResolve()).toBe(true)
    expect(pushingAtPush).toBe(false)
    expect(h.isPushing.value).toBe(false)
    teardown()
  })

  it('Pull を選んだときも Pull の前に解放する（解決中は isPushing が立っている）', async () => {
    const { deps, teardown, pushingDuringResolve } = await startAndTriggerHang('pull')
    let pushingAtPull: boolean | undefined
    deps.pullFromGitHub.mockImplementation(async () => {
      pushingAtPull = h.isPushing.value
    })
    await vi.waitFor(() => expect(deps.pullFromGitHub).toHaveBeenCalled())
    expect(pushingDuringResolve()).toBe(true)
    expect(pushingAtPull).toBe(false)
    teardown()
  })

  it('S1: 解決中に visibility 復帰が起きても、ダイアログは再入せずロックも外れない', async () => {
    let finish: (v: string) => void = () => {}
    h.resolveConflict.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        })
    )
    h.getPersistedDirtyFlag.mockReturnValue(false)
    const { initApp, appState } = await import('./app-state.svelte')
    const deps = makeDeps(async () => {})
    const teardown = initApp(deps)
    await vi.waitFor(() => expect(deps.pullFromGitHub).toHaveBeenCalled())
    deps.pullFromGitHub.mockClear()

    h.isPushing.value = true
    h.getPushInFlightAt.mockReturnValue(Date.now() - 120_000)
    h.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: 'base-sha',
      remoteCommitSha: 'remote-sha',
    })
    h.applyStaleResult.mockReturnValue('stale-dirty')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(h.resolveConflict).toHaveBeenCalledTimes(1))
    expect(h.isPushing.value).toBe(true)

    // 解決中（ダイアログ表示中）にアプリを切り替えて戻る。飛行中フラグは古いまま
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 50))
    expect(h.resolveConflict).toHaveBeenCalledTimes(1)
    expect(h.isPushing.value).toBe(true)
    expect(appState.pushHangRecovered).toBe(false)

    finish('merged')
    await vi.waitFor(() => expect(deps.pushToGitHub).toHaveBeenCalledTimes(1))
    expect(h.isPushing.value).toBe(false)
    teardown()
  })

  it.each(['isPulling', 'isPushing', 'isPushingBackground', 'isArchiveLoading'] as const)(
    'S2: 他の同期中（%s）なら解決も Push / Pull もせず、push-hang フラグは消費される',
    async (busy) => {
      h.getPersistedDirtyFlag.mockReturnValue(false)
      const { initApp, appState } = await import('./app-state.svelte')
      const deps = makeDeps(async () => {})
      const teardown = initApp(deps)
      await vi.waitFor(() => expect(deps.pullFromGitHub).toHaveBeenCalled())
      deps.pullFromGitHub.mockClear()

      h.isPushing.value = true
      h.getPushInFlightAt.mockReturnValue(Date.now() - 120_000)
      // ハング検出で isPushing / isPushingBackground は落とされるので、別の同期は stale check の
      // 間に始まったことにする
      h.executeStaleCheck.mockImplementation(async () => {
        if (busy === 'isArchiveLoading') appState.isArchiveLoading = true
        else h[busy].value = true
        return { status: 'stale', localCommitSha: 'base-sha', remoteCommitSha: 'remote-sha' }
      })
      h.applyStaleResult.mockReturnValue('stale-dirty')
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(h.executeStaleCheck).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 50))

      expect(h.resolveConflict).not.toHaveBeenCalled()
      expect(deps.pushToGitHub).not.toHaveBeenCalled()
      expect(deps.pullFromGitHub).not.toHaveBeenCalled()
      expect(appState.pushHangRecovered).toBe(false)
      appState.isArchiveLoading = false
      teardown()
    }
  )

  it('解決が例外で終わってもロックを残さない', async () => {
    const { deps, teardown } = await startAndTriggerHang('cancel')
    h.resolveConflict.mockRejectedValueOnce(new Error('x'))
    await vi.waitFor(() => expect(h.resolveConflict).toHaveBeenCalled())
    await vi.waitFor(() => expect(h.isPushing.value).toBe(false))
    expect(deps.pushToGitHub).not.toHaveBeenCalled()
    teardown()
  })
})
