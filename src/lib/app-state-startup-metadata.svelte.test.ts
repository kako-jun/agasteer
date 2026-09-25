// @vitest-environment jsdom
/**
 * #295 M1 回帰テスト。
 *
 * 修正前は、永続化済み metadata（IndexedDB `agasteer/metadata`）を store（`metadata`
 * ストア）へ復元する処理が applyPersistedStartupCache() の中にしかなく、それは
 * 「stale check スキップで起動」または「起動時dirtyダイアログでPullキャンセル」の
 * 経路でしか呼ばれなかった。SHA不一致・check_failed・dirty→pull（ダイアログで
 * 'pull' を選択）等の full pull 経路では、Pull が onStructure（GitHub から metadata
 * を受け取った時点）に到達する前に失敗すると、`metadata.value` がモジュール初期値の
 * 空メタデータ（`{version:1,notes:{},leaves:{},pushCount:0}`）のまま initStoreEffects()
 * の初回 effect 実行に渡り、その空値が IndexedDB へ書き戻されて保存済みの値を
 * 消してしまっていた。
 *
 * 修正: initApp() が setCurrentRepo() 完了直後・stale check/Pull を始める前に
 * `metadata.value = (await getPersistedMetadata()) ?? default` で先に復元する
 * （app-state.svelte.ts）。
 *
 * ここでは deps.pullFromGitHub を「何もしない」モックにして、Pull が onStructure に
 * 到達しない（＝失敗した）状況を再現する。shouldUseStartupCache は false 固定にして
 * full pull 経路を強制し、deps.pullFromGitHub が呼ばれた時点の `metadata.value` が
 * 既に永続化済みの値になっていることを確認する。
 *
 * 周辺モジュールの網羅的な vi.mock は app-state-heartbeat.svelte.test.ts（#191）と
 * 同じ流儀に合わせている。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- 値ストア（{ value } 形状）ヘルパ。既存テスト（git.test.ts 等）と同じ流儀。----
const vstore = <T>(value: T) => ({ value })

const EMPTY_METADATA = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
const PERSISTED_METADATA = {
  version: 1,
  notes: {},
  leaves: { 'note/leaf.md': { id: 'leaf-1', updatedAt: 1, order: 0 } },
  pushCount: 7,
}

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
  loadNotes: vi.fn(async () => []),
  loadLeaves: vi.fn(async () => []),
  loadOfflineLeaf: vi.fn(async () => null),
  getPersistedLastPulledPushCount: vi.fn(() => null),
  getPersistedMetadata: vi.fn(async () => PERSISTED_METADATA),
  shouldShowPwaInstallBanner: vi.fn(() => false),
  setCurrentRepo: vi.fn(async () => {}),
  syncRepoNameCache: vi.fn(),
  getPushInFlightAt: vi.fn((): number | undefined => undefined),
}))

// stores 層: init 到達に必要なものを網羅（#191 heartbeat テストと同じ一式）。
// metadata はモジュール初期値相当の空メタデータから始める。
vi.mock('./stores', () => ({
  initActivityDetection: vi.fn(() => vi.fn()),
  setupBeforeUnloadSave: vi.fn(() => vi.fn()),
  initStoreEffects: vi.fn(() => vi.fn()),
  startStaleChecker: vi.fn(),
  stopStaleChecker: vi.fn(),
  executeStaleCheck: vi.fn(async () => ({}) as unknown),
  applyStaleResult: vi.fn(() => 'up-to-date' as const),
  flushPendingSaves: vi.fn(async () => {}),
  settings: vstore({ token: '', repoName: '', branch: 'main' }),
  isPulling: vstore(false),
  isPushing: vstore(false),
  isPushingBackground: vstore(false),
  githubConfigured: vstore(false),
  isDirty: vstore(false),
  isStructureDirty: vstore(false),
  shouldAutoPush: vstore(false),
  shouldAutoPull: vstore(false),
  lastKnownCommitSha: vstore<string | null>(null),
  lastPulledPushCount: vstore(0),
  notes: vstore([]),
  leaves: vstore([]),
  archiveNotes: vstore([]),
  archiveLeaves: vstore([]),
  leftWorld: vstore('home'),
  rightWorld: vstore('home'),
  leftView: vstore('tree'),
  rightView: vstore('tree'),
  metadata: vstore({ ...EMPTY_METADATA }),
  archiveMetadata: vstore({ pushCount: 0 }),
  isArchiveLoaded: vstore(false),
  offlineLeafStore: vstore<Record<string, unknown> | null>(null),
  pullProgressInfo: vstore(null),
  dragStore: { draggedNote: null, draggedLeaf: null, dragOverNoteId: null, dragOverLeafId: null },
  moveModalStore: { isOpen: false, targetLeaf: null, targetNote: null, targetPane: null },
  leafStatsStore: { rebuild: vi.fn() },
  archiveLeafStatsStore: { rebuild: vi.fn() },
  updateNotes: vi.fn(),
  updateLeaves: vi.fn(),
  updateArchiveNotes: vi.fn(),
  updateArchiveLeaves: vi.fn(),
  clearAllChanges: vi.fn(),
  getPersistedDirtyFlag: vi.fn(() => false),
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

function makeDeps(onPull: () => void) {
  return {
    pullFromGitHub: vi.fn(async () => {
      onPull()
    }),
    pushToGitHub: vi.fn(async () => {}),
    restoreStateFromUrl: vi.fn(async () => {}),
    handleGlobalKeyDown: vi.fn(),
  }
}

describe('#295 M1: 起動時のmetadata初期化順序', () => {
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
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('full pull 経路でPullが失敗しても、Pull開始時点で永続化済みmetadataが復元済み', async () => {
    const { metadata } = await import('./stores')
    const { initApp } = await import('./app-state.svelte')

    let metadataAtPullTime: unknown
    const deps = makeDeps(() => {
      // Pull開始時点（=このあと失敗しうる処理に入る直前）のスナップショットを取る。
      metadataAtPullTime = JSON.parse(JSON.stringify(metadata.value))
    })

    const teardown = initApp(deps)

    await vi.waitFor(() => {
      expect(deps.pullFromGitHub).toHaveBeenCalled()
    })

    // 修正前はここが EMPTY_METADATA のままだった
    // （applyPersistedStartupCache 経由の復元しかなく、この経路では未到達のため）。
    expect(metadataAtPullTime).toEqual(PERSISTED_METADATA)

    teardown()
  })
})
