// @vitest-environment jsdom
/**
 * #191: ハートビート・サスペンド検出のテスト。
 *
 * 対象は app-state.svelte.ts の 3 点:
 *   1. 設計不変条件 — HEARTBEAT_INTERVAL_MS が「起きているマシンの背景タイマー
 *      スロットル上限（Chrome で最長〜60秒）」より小さいこと。
 *   2. isLongSuspendGap の境界・代表シナリオ（純関数）。
 *   3. initApp の統合挙動 — awake（背景 interval が gap を詰め続ける）では
 *      long-background モーダルが出ず、実サスペンド（プロセス凍結で interval が
 *      止まり wall-clock だけ進む）では出る。teardown で interval が停止し
 *      visibilitychange も外れる（リーク/多重登録なし）。
 *
 * initApp は 15 近い兄弟モジュールに依存し、起動時に fetch / IndexedDB /
 * i18n / PWA SW 登録に触れる。ここでは #191 の心臓部（ハートビート interval と
 * visibilitychange ハンドラ、いずれも app-state.svelte.ts 内の実コード）だけを
 * 走らせるため、周辺モジュールを vi.mock で差し替え、起動時 IIFE は
 * `waitForSwCheck`（../main）を未解決 Promise にして GitHub/stale 初期化に
 * 到達する前で停止させる。alertAsync（long-background モーダル）を spy にして
 * 発火/非発火を判定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- 値ストア（{ value } 形状）ヘルパ。既存テスト（git.test.ts）と同じ流儀。----
const vstore = <T>(value: T) => ({ value })

// ---- assert 対象・挙動制御に使う spy 群（vi.hoisted で vi.mock より先に用意）----
const spies = vi.hoisted(() => ({
  alertAsync: vi.fn(async () => {}),
  executeStaleCheck: vi.fn(async () => ({}) as unknown),
  // 'up-to-date' は check-failed でも stale-dirty でもない → 追加ダイアログ/リトライを誘発しない
  applyStaleResult: vi.fn(() => 'up-to-date' as const),
  getPushInFlightAt: vi.fn((): number | undefined => undefined),
}))

// ../main を差し替え: waitForSwCheck を未解決のままにして起動 IIFE を停止させ、
// GitHub pull / startStaleChecker 等へ到達させない（かつ virtual:pwa-register を回避）。
vi.mock('../main', () => ({
  waitForSwCheck: new Promise<void>(() => {}),
}))

// i18n: get(_) が翻訳関数を返すよう、最小の subscribe ストアを提供する。
vi.mock('./i18n', () => ({
  initI18n: vi.fn(async () => {}),
  _: { subscribe: (run: (t: (key: string) => string) => void) => (run((key) => key), () => {}) },
}))

// UI 層: alertAsync を spy に、テーマ/フォント適用等は no-op に。
vi.mock('./ui', () => ({
  alertAsync: spies.alertAsync,
  applyTheme: vi.fn(),
  loadAndApplyCustomFont: vi.fn(async () => {}),
  loadAndApplySystemMonoFont: vi.fn(async () => {}),
  loadAndApplyCustomBackgrounds: vi.fn(async () => {}),
  showPushToast: vi.fn(),
  showPullToast: vi.fn(),
}))

// data 層: 起動 IIFE の pre-await 部が IndexedDB/localStorage に触れないようにする。
vi.mock('./data', () => ({
  loadSettings: vi.fn(async () => ({
    locale: 'en',
    theme: 'dark',
    toolName: 'Agasteer',
    repoName: '',
    token: '',
    hasCustomFont: false,
    hasCustomBackgroundLeft: false,
    hasCustomBackgroundRight: false,
  })),
  loadNotes: vi.fn(async () => []),
  loadLeaves: vi.fn(async () => []),
  loadOfflineLeaf: vi.fn(async () => null),
  getPersistedLastPulledPushCount: vi.fn(() => null),
  getPersistedMetadata: vi.fn(() => null),
  shouldShowPwaInstallBanner: vi.fn(() => false),
  setCurrentRepo: vi.fn(async () => {}),
  syncRepoNameCache: vi.fn(),
  getPushInFlightAt: spies.getPushInFlightAt,
}))

// stores 層: init 到達・teardown・visibilitychange ハンドラが呼ぶものを網羅。
// 未到達（waitForSwCheck 後）の export は参照されるだけなので no-op で十分。
vi.mock('./stores', () => ({
  // init で必ず呼ばれ、cleanup 関数を返す（teardown で呼ばれる）
  initActivityDetection: vi.fn(() => vi.fn()),
  setupBeforeUnloadSave: vi.fn(() => vi.fn()),
  initStoreEffects: vi.fn(() => vi.fn()),
  startStaleChecker: vi.fn(),
  stopStaleChecker: vi.fn(),
  // visibilitychange ハンドラが使う
  executeStaleCheck: spies.executeStaleCheck,
  applyStaleResult: spies.applyStaleResult,
  // 値ストア群
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
  metadata: vstore({ leaves: {} }),
  archiveMetadata: vstore({ pushCount: 0 }),
  isArchiveLoaded: vstore(false),
  offlineLeafStore: vstore<Record<string, unknown> | null>(null),
  pullProgressInfo: vstore(null),
  dragStore: { draggedNote: null, draggedLeaf: null, dragOverNoteId: null, dragOverLeafId: null },
  moveModalStore: { isOpen: false, targetLeaf: null, targetNote: null, targetPane: null },
  leafStatsStore: { rebuild: vi.fn() },
  archiveLeafStatsStore: { rebuild: vi.fn() },
  // no-op / 未到達で参照されるだけの関数群
  updateNotes: vi.fn(),
  updateLeaves: vi.fn(),
  updateArchiveNotes: vi.fn(),
  updateArchiveLeaves: vi.fn(),
  clearAllChanges: vi.fn(),
  getPersistedDirtyFlag: vi.fn(() => false),
  resetAutoPushTimer: vi.fn(),
  setLastPushedSnapshot: vi.fn(),
  setArchiveBaseline: vi.fn(),
  // ワールドヘルパ（module-level $derived の遅延依存。安全側に stub）
  getNotesForWorld: vi.fn(() => []),
  getLeavesForWorld: vi.fn(() => []),
  getWorldForPane: vi.fn(() => 'home'),
  getNotesForPane: vi.fn(() => []),
  getLeavesForPane: vi.fn(() => []),
  getWorldForNote: vi.fn(() => 'home'),
  getWorldForLeaf: vi.fn(() => 'home'),
}))

// その他の兄弟モジュール（init 到達 or 参照される可能性のあるものを no-op 化）
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

// app-state.svelte.ts は module-level で `window.matchMedia`（isPWAStandalone 検出）を
// 評価する。全 import（純関数ユニットの import も含む）より前に必要なので、テスト本体の
// 動的 import に先んじてトップレベルで用意しておく（beforeEach では間に合わない）。
if (typeof (globalThis as { matchMedia?: unknown }).matchMedia !== 'function') {
  ;(globalThis as { matchMedia?: unknown }).matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
}

// initApp のシグネチャ（InitAppDeps）— 全て vi.fn の最小 deps で起動する。
function makeDeps() {
  return {
    pullFromGitHub: vi.fn(async () => {}),
    pushToGitHub: vi.fn(async () => {}),
    restoreStateFromUrl: vi.fn(async () => {}),
    handleGlobalKeyDown: vi.fn(),
  }
}

const BACKGROUND_THRESHOLD_MS = 5 * 60 * 1000 // initApp 内ローカル定数の複製（export されていない）
const BASE = 1_700_000_000_000 // 固定基準時刻

// マイクロタスクを一巡させる（visibilitychange ハンドラは async。alertAsync 呼び出し自体は
// 最初の await より前だが、後続の stale check まで含めて安定させるため flush する）。
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('#191 設計不変条件', () => {
  it('HEARTBEAT_INTERVAL_MS は背景タイマースロットル上限(〜60秒)以下', async () => {
    const { HEARTBEAT_INTERVAL_MS } = await import('./app-state.svelte')
    // BACKGROUND_THRESHOLD_MS は initApp 内ローカルで export されていない。
    // 設計の含意: 起きているマシンでは背景 interval が gap を「間隔＋スロットル遅延」
    // 程度に保つ。Chrome の hidden タブ throttle は最長〜60秒なので、間隔がこれを
    // 超えると awake でも gap が閾値(5分)側に近づき誤検出リスクが増す。export 済みの
    // 値だけで縛れる範囲として、間隔 <= 60 秒を保証する。
    expect(HEARTBEAT_INTERVAL_MS).toBeLessThanOrEqual(60_000)
    // 併せて、閾値(5分)より十分小さいことも間接的に担保される
    expect(HEARTBEAT_INTERVAL_MS).toBeLessThan(BACKGROUND_THRESHOLD_MS)
  })
})

describe('#191 isLongSuspendGap 境界・代表シナリオ', () => {
  it('境界は非発火（gap === threshold で false）', async () => {
    const { isLongSuspendGap } = await import('./app-state.svelte')
    const threshold = BACKGROUND_THRESHOLD_MS
    expect(isLongSuspendGap(threshold, threshold)).toBe(false)
  })

  it('閾値+1 で発火（true）', async () => {
    const { isLongSuspendGap } = await import('./app-state.svelte')
    const threshold = BACKGROUND_THRESHOLD_MS
    expect(isLongSuspendGap(threshold + 1, threshold)).toBe(true)
  })

  it('awake 代表値（60秒 gap）は非発火 / suspend 代表値（6分 gap）は発火', async () => {
    const { isLongSuspendGap } = await import('./app-state.svelte')
    // 起きているマシンで背景 throttle が最大まで効いても gap は〜60秒に収まる想定
    expect(isLongSuspendGap(60_000, BACKGROUND_THRESHOLD_MS)).toBe(false)
    // 実サスペンド（OSスリープ）: interval が止まり wall-clock が 6 分進んだ
    expect(isLongSuspendGap(6 * 60_000, BACKGROUND_THRESHOLD_MS)).toBe(true)
  })
})

describe('#191 initApp 統合挙動（ハートビート/サスペンド検出）', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true }))
    )
    // visibilitychange ハンドラ末尾の rAF は jsdom で未定義になり得るため no-op 化
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 0)
    )
    vi.useFakeTimers()
    vi.setSystemTime(BASE)
    spies.alertAsync.mockClear()
    spies.executeStaleCheck.mockClear()
    spies.applyStaleResult.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('awake-hidden → 復帰: 閾値(5分)を超える時間が経っても背景 interval が gap を詰め続けるので long-background モーダルは出ない', async () => {
    const { initApp } = await import('./app-state.svelte')
    const teardown = initApp(makeDeps())

    // 30 秒ごとにハートビート interval が発火し lastHeartbeatTime を現在時刻へ更新するのを
    // 閾値(5分)を確実に超える 6 分ぶん（12 回）繰り返す（＝マシンが起きていて背景タイマーが
    // 走り続けている状態）。経過を閾値超まで進めるのが要点: 4 分しか進めないと interval を
    // 丸ごと消しても gap<閾値 でモーダルが出ず、interval の有無を区別できない（回帰を守れない）。
    // 6 分ぶん interval を刻めば、interval が生きている限り gap は〜30秒に保たれモーダルは
    // 出ず、interval が死ねば gap=6分>閾値 でモーダルが出る、という差が現れる。
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(30_000) // interval 発火 → lastHeartbeatTime = 現在(fake)時刻
    }
    // ここで fake now と lastHeartbeatTime はほぼ一致（gap ≈ 0、経過は 6 分で閾値超）。visible 復帰イベントを流す。
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()

    expect(spies.alertAsync).not.toHaveBeenCalled()

    teardown()
  })

  it('実サスペンド → 復帰: interval が止まったまま wall-clock が 5 分超進むと long-background モーダルが出る', async () => {
    const { initApp } = await import('./app-state.svelte')
    const teardown = initApp(makeDeps())

    // プロセス凍結を再現: interval は 1 度も進めず（発火させず）、Date.now だけを 6 分ジャンプ。
    // → lastHeartbeatTime は初期化時刻(BASE)のまま、gap = 6 分 > 閾値(5分) で発火するはず。
    vi.setSystemTime(BASE + 6 * 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()

    expect(spies.alertAsync).toHaveBeenCalledTimes(1)
    // モーダルは中央表示で呼ばれる
    expect(spies.alertAsync).toHaveBeenCalledWith(expect.anything(), 'center')

    teardown()
  })

  it('teardown で interval が停止し visibilitychange も外れる（リーク/多重登録なし）', async () => {
    const { initApp } = await import('./app-state.svelte')
    const teardown = initApp(makeDeps())

    // 起動直後はハートビート interval が 1 本走っている。
    const timersAfterInit = vi.getTimerCount()
    expect(timersAfterInit).toBeGreaterThanOrEqual(1)

    teardown()

    // teardown 後は clearInterval 済み。保留タイマーが起動時より減っている（interval 停止）。
    expect(vi.getTimerCount()).toBeLessThan(timersAfterInit)

    // さらに、以後は interval が lastHeartbeatTime を更新しないので、実サスペンド相当の
    // ギャップを作って visible 復帰させても発火しない（＝ハンドラも interval も生きていない）。
    vi.setSystemTime(BASE + 6 * 60 * 1000)
    vi.advanceTimersByTime(6 * 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()

    expect(spies.alertAsync).not.toHaveBeenCalled()
  })
})
