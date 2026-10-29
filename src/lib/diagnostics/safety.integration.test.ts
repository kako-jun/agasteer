/**
 * 診断ログの安全性（#317・最重要）: 統合テスト
 *
 * token=ghp_SECRET / repoName=secret/repo / ノートタイトル SECRET_TITLE / パス notes/SECRET.md を
 * 設定した状態で、Push 成功・stale・timeout/orphan・conflict・rehydrate の全シナリオを
 * 実際のコード（recordDiag・schema・log-store・fake-indexeddb）に流し、
 * DB 全件の JSON とコピー全文のどこにも秘匿値が現れないこと、
 * 保存された全値が型制約（hex / null / 整数 / bool / ISO / enum）を満たすことを確認する。
 * git.test.ts と同じ hoisted モックで UI/ストア側だけを差し替え、診断層は実物を使う。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

type ValueStore<T> = { value: T }

function createStore<T>(value: T): ValueStore<T> {
  return { value }
}

const stores = vi.hoisted(() => ({
  settings: createStore({ token: 'token', repoName: 'owner/repo', branch: 'main' }),
  notes: createStore([{ id: 'note-1', name: 'Note', parentId: null, order: 0 }]),
  leaves: createStore([{ id: 'leaf-1', noteId: 'note-1', content: 'content', order: 0 }]),
  // #293: pushCount 以外のフィールド（version/notes/leaves）も実 Metadata 型に揃えておく。
  // {pushCount:number} のみだと #293 テストで他フィールドの非破壊性を検証する際に
  // excess property error（svelte-check）になるため。
  metadata: createStore({ version: 1, notes: {}, leaves: {}, pushCount: 1 }),
  isDirty: createStore(true),
  isPulling: createStore(false),
  isPushing: createStore(false),
  isPushingBackground: createStore(false),
  isStale: createStore(false),
  lastPushTime: createStore(0),
  lastKnownCommitSha: createStore<string | null>('local-sha'),
  lastPulledPushCount: createStore(0),
  isArchiveLoaded: createStore(false),
  archiveNotes: createStore([]),
  archiveLeaves: createStore([]),
  archiveMetadata: createStore({ pushCount: 0 }),
  leftNote: createStore(null),
  leftLeaf: createStore(null),
  rightNote: createStore(null),
  rightLeaf: createStore(null),
  leftView: createStore('tree'),
  leftWorld: createStore('home'),
  focusedPane: createStore('left'),
}))

const appState = vi.hoisted(() => ({
  isArchiveLoading: false,
  pendingRepoSync: false,
  isFirstPriorityFetched: true,
  isPullCompleted: true,
  isLoadingUI: false,
  selectedIndexLeft: 0,
  selectedIndexRight: 0,
  loadingLeafIds: new Set<string>(),
  leafSkeletonMap: new Map(),
  // #147 綻び2: リポ切替起因 Pull かの判定に使う（既定は通常 pull=false）
  repoChangePending: false,
  // #297 S-c: 同期中にリポ切替された場合の保留 rehydrate 先
  pendingRehydrateRepo: null as string | null,
}))

const mocks = vi.hoisted(() => ({
  choiceAsync: vi.fn(),
  confirmAsync: vi.fn(),
  showPullToast: vi.fn(),
  showPushToast: vi.fn(),
  // #238: Push 完了トースト専用入口（通常完了・タイムアウト・orphan 遅延成功）
  showPushCompletionToast: vi.fn(),
  showStickyPushToast: vi.fn(),
  clearPushToast: vi.fn(),
  // #238: Push 進捗カウントダウン
  setPushToastCountdown: vi.fn(),
  // #238: canSync を差し替え可能に（既定は許可。vi.fn(impl) の既定実装は
  // clearAllMocks で消えないため、テスト側は mockReturnValueOnce で上書きする）
  canSync: vi.fn(() => ({ canPull: true, canPush: true })),
  focusEditor: vi.fn(),
  executePush: vi.fn(),
  executePull: vi.fn(),
  executeStaleCheck: vi.fn(),
  fetchRemotePushCount: vi.fn(),
  testGitHubConnection: vi.fn(),
  translateGitHubMessage: vi.fn((message: string) => message),
  clearAllChanges: vi.fn(),
  flushPendingSaves: vi.fn(),
  flushAllEditors: vi.fn(),
  getActiveEditorPane: vi.fn(() => null),
  getPersistedDirtyFlag: vi.fn(() => false),
  setLastPushedSnapshot: vi.fn(),
  refreshDirtyState: vi.fn(),
  setPushInFlightAt: vi.fn(),
  // #235: 既定「フラグなし」。orphan 継続処理の guarded clear は no-op になる
  getPushInFlightAt: vi.fn((): number | undefined => undefined),
  // #235: 既定は「救済しない」（従来の stale ダイアログ経路を維持）
  tryRescueStalePush: vi.fn(() => false),
  pushToGitHub: vi.fn(),
  saveNotes: vi.fn(),
  saveLeaves: vi.fn(),
  createBackup: vi.fn(async () => ({ notes: [], leaves: [] })),
  restoreFromBackup: vi.fn(),
  clearAllData: vi.fn(),
  // #297: 既定は「rehydrate 実行中でない」＝即解決。個別テストで
  // mockReturnValueOnce により制御可能な Promise に差し替える。
  waitForRehydrate: vi.fn(() => Promise.resolve()),
  // #297 S-c: 同期中にリポ切替された場合、予約 pull 開始前に呼ばれる
  rehydrateForRepo: vi.fn(async () => {}),
}))

vi.mock('../stores', () => ({
  ...stores,
  clearAllChanges: mocks.clearAllChanges,
  getPersistedDirtyFlag: mocks.getPersistedDirtyFlag,
  executeStaleCheck: mocks.executeStaleCheck,
  setLastPushedSnapshot: mocks.setLastPushedSnapshot,
  addLeafToBaseline: vi.fn(),
  addNotesToBaseline: vi.fn(),
  refreshDirtyState: mocks.refreshDirtyState,
  flushPendingSaves: mocks.flushPendingSaves,
  leafStatsStore: { addLeaf: vi.fn() },
  pullProgressStore: { start: vi.fn(), increment: vi.fn(), reset: vi.fn() },
  flushAllEditors: mocks.flushAllEditors,
  getActiveEditorPane: mocks.getActiveEditorPane,
  tryRescueStalePush: mocks.tryRescueStalePush,
  waitForRehydrate: mocks.waitForRehydrate,
  rehydrateForRepo: mocks.rehydrateForRepo,
}))

vi.mock('../api', () => ({
  executePush: mocks.executePush,
  executePull: mocks.executePull,
  testGitHubConnection: mocks.testGitHubConnection,
  translateGitHubMessage: mocks.translateGitHubMessage,
  canSync: mocks.canSync,
  fetchRemotePushCount: mocks.fetchRemotePushCount,
}))

vi.mock('../ui', () => ({
  choiceAsync: mocks.choiceAsync,
  confirmAsync: mocks.confirmAsync,
  showPullToast: mocks.showPullToast,
  showPushToast: mocks.showPushToast,
  showPushCompletionToast: mocks.showPushCompletionToast,
  showStickyPushToast: mocks.showStickyPushToast,
  clearPushToast: mocks.clearPushToast,
  setPushToastCountdown: mocks.setPushToastCountdown,
}))

vi.mock('../data', () => ({
  clearAllData: mocks.clearAllData,
  createBackup: mocks.createBackup,
  restoreFromBackup: mocks.restoreFromBackup,
  saveNotes: mocks.saveNotes,
  saveLeaves: mocks.saveLeaves,
  getPushInFlightAt: mocks.getPushInFlightAt,
  setPushInFlightAt: mocks.setPushInFlightAt,
}))

vi.mock('../utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils')>()),
  isNoteSaveable: () => true,
  isLeafSaveable: () => true,
}))

vi.mock('../app-state.svelte', () => ({
  appState,
  appActions: {
    pushToGitHub: mocks.pushToGitHub,
    resetLeafStats: vi.fn(),
    rebuildLeafStats: vi.fn(),
    restoreStateFromUrl: vi.fn(),
    getEditorView: vi.fn(() => ({ focusEditor: mocks.focusEditor })),
  },
}))

vi.mock('../navigation', () => ({
  getPriorityFromUrl: vi.fn(() => null),
}))

vi.mock('../i18n', () => ({
  _: {
    subscribe(run: (translate: (key: string) => string) => void) {
      run((key: string) => key)
      return () => {}
    },
  },
}))

vi.mock('svelte', () => ({
  get: () => (key: string) => key,
  tick: vi.fn(async () => {}),
}))

const { pushToGitHub, pullFromGitHub } = await import('../actions/git')

const SECRET_TOKEN = 'ghp_SECRET'
const SECRET_REPO = 'secret/repo'
const SECRET_TITLE = 'SECRET_TITLE'
const SECRET_PATH = 'notes/SECRET.md'
const SECRETS = [SECRET_TOKEN, 'SECRET', 'secret/repo', SECRET_TITLE, SECRET_PATH, 'SECRET_USER']

const H = (c: string) => c.repeat(40)

// ---- localStorage / IndexedDB（storage.ts の素の状態を毎テストで作る）----
const storageBacking = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => storageBacking.get(k) ?? null,
  setItem: (k: string, v: string) => void storageBacking.set(k, v),
  removeItem: (k: string) => void storageBacking.delete(k),
  clear: () => storageBacking.clear(),
  key: (i: number) => Array.from(storageBacking.keys())[i] ?? null,
  get length() {
    return storageBacking.size
  },
}

/** GitHub API の簡易ルータ（応答に秘匿値風の文字列を混ぜ、記録層が拾わないことを確認する） */
function installGithubFetch(opts: { refAfterPatch?: unknown } = {}) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init?: any) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      calls.push(`${method} ${url}`)
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      if (method === 'GET' && /\/repos\/secret\/repo(\?|$)/.test(url))
        return json({ default_branch: 'main' })
      if (method === 'GET' && url.includes('/git/ref/heads/main')) {
        const patched = calls.some((c) => c.startsWith('PATCH'))
        return json({
          object: { sha: patched ? (opts.refAfterPatch ?? H('2')) : H('1') },
          ref: `refs/heads/main#${SECRET_TOKEN}`,
        })
      }
      if (method === 'GET' && /\/git\/commits\//.test(url))
        return json({
          tree: { sha: H('9') },
          parents: [{ sha: H('3'), url: `https://x/${SECRET_REPO}` }],
          committer: {
            date: '2026-01-02T03:04:05Z',
            name: 'SECRET_USER',
            email: 'secret@example.com',
          },
          message: `edit ${SECRET_TITLE} ${SECRET_PATH}`,
        })
      if (method === 'GET' && url.includes('/git/trees/'))
        return json({ truncated: false, tree: [] })
      if (method === 'POST' && url.endsWith('/git/trees')) return json({ sha: H('8') })
      if (method === 'POST' && url.endsWith('/git/commits')) return json({ sha: H('2') })
      if (method === 'PATCH') return json({ ref: 'refs/heads/main' })
      return json({}, 404)
    })
  )
  return calls
}

async function settleDb(): Promise<void> {
  vi.useRealTimers()
  let last = -1
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 15))
    const { readDiagEntries } = await import('./log-store')
    const n = (await readDiagEntries()).length
    if (n === last && i > 4) return
    last = n
  }
}

const HEX = /^[0-9a-f]{7,64}$/i
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/

/** 保存された全エントリが型制約を満たし、秘匿値を含まないことを検証する */
async function assertSafe(expectKinds: string[]) {
  await settleDb()
  const { readDiagEntries } = await import('./log-store')
  const { DIAG_SCHEMA } = await import('./schema')
  const { formatReport, summarizeUserAgent } = await import('./format')
  const entries = await readDiagEntries()
  const spec = DIAG_SCHEMA as unknown as Record<string, Record<string, any>>

  const json = JSON.stringify(entries)
  const report = formatReport(entries, {
    appVersion: 'dev',
    device: summarizeUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
  })
  for (const s of SECRETS) {
    expect(json, `DB に ${s} が含まれる`).not.toContain(s)
    expect(report, `コピー全文に ${s} が含まれる`).not.toContain(s)
  }

  for (const e of entries) {
    expect(Object.keys(spec)).toContain(e.kind)
    expect(Number.isInteger(e.at)).toBe(true)
    for (const [k, v] of Object.entries(e.data)) {
      const t = spec[e.kind][k]
      expect(t, `${e.kind}.${k} は許可リスト外`).toBeDefined()
      if (t === 'sha') expect(v === null || (typeof v === 'string' && HEX.test(v))).toBe(true)
      else if (t === 'int') expect(Number.isInteger(v)).toBe(true)
      else if (t === 'bool') expect(typeof v).toBe('boolean')
      else if (t === 'iso') expect(typeof v === 'string' && ISO.test(v as string)).toBe(true)
      else if (t === 'errcode') expect(typeof v === 'string' && /^E-\d{4}$/.test(v)).toBe(true)
      else expect(t).toContain(v)
    }
  }
  const kinds = new Set(entries.map((e) => e.kind))
  for (const k of expectKinds) expect(kinds.has(k as any), `kind ${k} が記録されている`).toBe(true)
  return entries
}

const SUCCESS = {
  success: true,
  message: 'github.pushSuccess',
  variant: 'success',
  commitSha: H('a'),
  parentSha: H('b'),
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('indexedDB', new IDBFactory())
  // storage.ts の共有 DB ハンドルはモジュール変数に残るため、前テストの記録を消して独立させる
  await (await import('./log-store')).clearDiagEntries()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  storageBacking.clear()
  storageBacking.set(
    'agasteer',
    JSON.stringify({
      settings: { token: SECRET_TOKEN, repoName: SECRET_REPO },
      globalState: { tourShown: true, saveGuideShown: true },
      byRepo: {},
      v131Migrated: true,
    })
  )
  stores.settings.value = { token: SECRET_TOKEN, repoName: SECRET_REPO, branch: 'main' } as any
  stores.notes.value = [{ id: 'note-1', name: SECRET_TITLE, parentId: null, order: 0 }] as any
  stores.leaves.value = [
    {
      id: 'leaf-1',
      noteId: 'note-1',
      title: SECRET_TITLE,
      content: `${SECRET_PATH} ${SECRET_TOKEN}`,
      order: 0,
    },
  ] as any
  stores.isPulling.value = false
  stores.isPushing.value = false
  stores.isPushingBackground.value = false
  stores.isStale.value = false
  stores.lastKnownCommitSha.value = H('c')
  stores.lastPushTime.value = 0
  appState.isArchiveLoading = false
  appState.isFirstPriorityFetched = true
  mocks.getActiveEditorPane.mockReturnValue(null)
  mocks.flushPendingSaves.mockResolvedValue(undefined)
  mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 2 })
  mocks.executeStaleCheck.mockResolvedValue({ status: 'up_to_date' })
  mocks.tryRescueStalePush.mockReturnValue(false)
  mocks.getPushInFlightAt.mockReturnValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('診断ログの安全性（統合）', () => {
  it('Push 成功: 実 github.ts（Git Data API）→ pushToGitHub の全経路で秘匿値が保存されない', async () => {
    installGithubFetch()
    const { pushAllWithTreeAPI } = await import('../api/github')
    mocks.executePush.mockImplementation(async () => {
      const r = await pushAllWithTreeAPI(
        stores.leaves.value as any,
        stores.notes.value as any,
        stores.settings.value as any
      )
      return { ...r, variant: r.success ? 'success' : 'error' }
    })
    await pushToGitHub()
    const entries = await assertSafe([
      'inflight-set',
      'inflight-clear',
      'push-success',
      'ref-verify',
    ])
    const ok = entries.find((e) => e.kind === 'push-success')!
    expect(ok.data.commitSha).toBe(H('2'))
    expect(ok.data.parentSha).toBe(H('1'))
    const rv = entries.find((e) => e.kind === 'ref-verify')!
    expect(rv.data).toMatchObject({
      pushedSha: H('2'),
      refSha: H('2'),
      match: true,
      httpStatus: 200,
    })
  })

  it('Push 成功: ref 読み直しが token 風の値を返しても保存されない', async () => {
    installGithubFetch({ refAfterPatch: SECRET_TOKEN })
    const { pushAllWithTreeAPI } = await import('../api/github')
    mocks.executePush.mockImplementation(async () => {
      const r = await pushAllWithTreeAPI(
        stores.leaves.value as any,
        stores.notes.value as any,
        stores.settings.value as any
      )
      return { ...r, variant: r.success ? 'success' : 'error' }
    })
    await pushToGitHub()
    const entries = await assertSafe(['push-success', 'ref-verify'])
    const rv = entries.find((e) => e.kind === 'ref-verify')!
    expect('refSha' in rv.data).toBe(false)
    expect(rv.data.match).toBe(false)
  })

  it('stale + conflict ダイアログ + 追加観測（実 stale-extras・実 conflict-dialog）', async () => {
    installGithubFetch()
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: H('c'),
      remoteCommitSha: H('d'),
    })
    mocks.choiceAsync.mockResolvedValue('cancel')
    await pushToGitHub()
    const entries = await assertSafe([
      'stale-detected',
      'stale-recheck',
      'stale-remote-commit',
      'conflict-dialog',
    ])
    const c = entries.find((e) => e.kind === 'conflict-dialog')!
    expect(c.data).toEqual({ dialogKind: 'stale-push', localSha: H('c'), remoteSha: H('d') })
  })

  it('stale → 上書き Push → 成功（全記録が混在）', async () => {
    installGithubFetch()
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: H('c'),
      remoteCommitSha: H('d'),
    })
    mocks.choiceAsync.mockResolvedValue('push')
    mocks.executePush.mockResolvedValue(SUCCESS)
    await pushToGitHub()
    await assertSafe(['stale-detected', 'conflict-dialog', 'inflight-set', 'push-success'])
  })

  it('タイムアウト → orphan 成功(follow) の経路', async () => {
    installGithubFetch()
    let resolvePush!: (v: unknown) => void
    mocks.executePush.mockImplementation(() => new Promise((r) => (resolvePush = r)))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const p = pushToGitHub()
    await vi.advanceTimersByTimeAsync(30_000)
    await p
    const stamp = mocks.setPushInFlightAt.mock.calls.find(([v]) => typeof v === 'number')![0]
    mocks.getPushInFlightAt.mockReturnValue(stamp)
    resolvePush({ ...SUCCESS, message: `ok ${SECRET_TITLE}` })
    await vi.advanceTimersByTimeAsync(0)
    await assertSafe(['push-timeout', 'orphan-settled', 'inflight-clear'])
  })

  it('orphan の各結末（failure / rejected / repo-switched / verify）でも秘匿値は保存されない', async () => {
    installGithubFetch()
    const outcomes: Array<(r: (v: unknown) => void, j: (e: unknown) => void) => void> = [
      (r) => r({ success: false, message: `fail ${SECRET_TITLE}`, variant: 'error' }),
      (_r, j) => j(new Error(`boom ${SECRET_TOKEN}`)),
    ]
    for (const settle of outcomes) {
      let res!: (v: unknown) => void
      let rej!: (e: unknown) => void
      mocks.executePush.mockImplementation(() => new Promise((a, b) => ((res = a), (rej = b))))
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      const p = pushToGitHub()
      await vi.advanceTimersByTimeAsync(30_000)
      await p
      const stamp = mocks.setPushInFlightAt.mock.calls
        .filter(([v]) => typeof v === 'number')
        .pop()![0]
      mocks.getPushInFlightAt.mockReturnValue(stamp)
      settle(res, rej)
      await vi.advanceTimersByTimeAsync(0)
      vi.useRealTimers()
    }
    // 不一致 → verify-align
    let res!: (v: unknown) => void
    mocks.executePush.mockImplementation(() => new Promise((a) => (res = a)))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const p = pushToGitHub()
    await vi.advanceTimersByTimeAsync(30_000)
    await p
    const stamp = mocks.setPushInFlightAt.mock.calls
      .filter(([v]) => typeof v === 'number')
      .pop()![0]
    mocks.getPushInFlightAt.mockReturnValue((stamp as number) + 1)
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: H('c'),
      remoteCommitSha: SUCCESS.commitSha,
    })
    res(SUCCESS)
    await vi.advanceTimersByTimeAsync(0)
    // repo-switched
    let res2!: (v: unknown) => void
    mocks.executePush.mockImplementation(() => new Promise((a) => (res2 = a)))
    const p2 = pushToGitHub()
    await vi.advanceTimersByTimeAsync(30_000)
    await p2
    stores.settings.value = { ...stores.settings.value, repoName: 'secret/other' } as any
    res2(SUCCESS)
    await vi.advanceTimersByTimeAsync(0)
    const entries = await assertSafe(['orphan-settled'])
    const outs = entries.filter((e) => e.kind === 'orphan-settled').map((e) => e.data.outcome)
    expect(outs).toEqual(
      expect.arrayContaining(['failure', 'rejected', 'verify-align', 'repo-switched'])
    )
  })

  it('HTTP エラー（executePush が token 入りメッセージで reject）でも保存されない', async () => {
    mocks.executePush.mockRejectedValue(new Error(`HTTP 500 ${SECRET_TOKEN} ${SECRET_REPO}`))
    await expect(pushToGitHub()).rejects.toThrow()
    await assertSafe(['inflight-clear'])
  })

  it('Push 失敗（応答に秘匿文字列入りメッセージ・不正な errorCode）: push-start / push-failure に秘匿値は残らない', async () => {
    mocks.executePush.mockResolvedValue({
      success: false,
      message: `fail ${SECRET_TITLE} ${SECRET_PATH}`,
      variant: 'error',
      errorCode: `E-12 ${SECRET_TOKEN}`,
      httpStatus: 500,
    })
    await pushToGitHub()
    const entries = await assertSafe(['push-start', 'push-failure'])
    const f = entries.find((e) => e.kind === 'push-failure')!
    expect(f.data.httpStatus).toBe(500)
    expect('errorCode' in f.data).toBe(false)
  })

  it('Pull 成功・失敗: pull-start / pull-result に秘匿値は残らず、E-xxxx と件数だけが残る', async () => {
    stores.isDirty.value = false
    appState.isPullCompleted = false
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: H('c'),
      remoteCommitSha: H('d'),
    })
    mocks.executePull.mockResolvedValueOnce({
      success: true,
      message: `ok ${SECRET_TITLE}`,
      variant: 'success',
      notes: stores.notes.value,
      leaves: stores.leaves.value,
      metadata: { pushCount: 1 },
      commitSha: H('a'),
    })
    await pullFromGitHub(false)
    mocks.executePull.mockResolvedValueOnce({
      success: false,
      message: `fail ${SECRET_PATH}`,
      variant: 'error',
      notes: [],
      leaves: [],
      metadata: { pushCount: 0 },
      errorCode: 'E-2003',
      httpStatus: 404,
    })
    await pullFromGitHub(false)
    const entries = await assertSafe(['pull-start', 'pull-result'])
    const rs = entries.filter((e) => e.kind === 'pull-result')
    expect(rs[0].data).toMatchObject({ success: true, noteCount: 1, leafCount: 1 })
    expect(rs[1].data).toMatchObject({ success: false, errorCode: 'E-2003', httpStatus: 404 })
  })

  it('衝突ダイアログの選択（pull / push / cancel）が記録され、秘匿値は残らない', async () => {
    mocks.executeStaleCheck.mockResolvedValue({
      status: 'stale',
      localCommitSha: H('c'),
      remoteCommitSha: H('d'),
    })
    mocks.executePush.mockResolvedValue(SUCCESS)
    mocks.choiceAsync.mockResolvedValue('push')
    await pushToGitHub()
    mocks.choiceAsync.mockResolvedValue('cancel')
    await pushToGitHub()
    const entries = await assertSafe(['conflict-choice'])
    expect(entries.filter((e) => e.kind === 'conflict-choice').map((e) => e.data.choice)).toEqual([
      'push',
      'cancel',
    ])
  })

  it('rehydrate: リポ切替で lastKnownCommitSha の差し替えが記録されても秘匿値は保存されない', async () => {
    const { rehydrateForRepo } = await vi.importActual<typeof import('../stores/rehydrate.svelte')>(
      '../stores/rehydrate.svelte'
    )
    const { lastKnownCommitSha } =
      await vi.importActual<typeof import('../stores/stores.svelte')>('../stores/stores.svelte')
    lastKnownCommitSha.value = H('e')
    await rehydrateForRepo(SECRET_REPO)
    const entries = await assertSafe(['rehydrate-sha'])
    expect(entries.find((e) => e.kind === 'rehydrate-sha')!.data.oldSha).toBe(H('e'))
  })

  it('悪意ある直接呼び出し（全 kind に秘匿値）でも保存されない', async () => {
    const { recordDiag } = await import('./record')
    const { DIAG_SCHEMA } = await import('./schema')
    for (const kind of Object.keys(DIAG_SCHEMA)) {
      const data: Record<string, unknown> = {}
      for (const k of Object.keys((DIAG_SCHEMA as any)[kind]))
        data[k] = `${SECRET_TOKEN} ${SECRET_REPO} ${SECRET_TITLE} ${SECRET_PATH}`
      ;(recordDiag as any)(kind, data)
    }
    const entries = await assertSafe([])
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) expect(e.data).toEqual({})
  })
})
