// #321: 競合時の3方向比較（analyzeConflictMerge）と反映（applyConflictMerge）。
// GitHub 読み出し（fetchCommitSnapshot / fetchRemoteHeadSha）とストアを差し替え、
// 「比較は読むだけ」「比較後の変化では何も書き換えない」「反映後はベースライン＝リモート」を検証する。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Leaf, Note, Metadata } from '../types'

const stores = vi.hoisted(() => {
  const s = <T>(value: T) => ({ value })
  return {
    notes: s([] as Note[]),
    leaves: s([] as Leaf[]),
    metadata: s({ version: 1, notes: {}, leaves: {}, pushCount: 3 } as Metadata),
    archiveNotes: s([] as Note[]),
    archiveLeaves: s([] as Leaf[]),
    archiveMetadata: s({ version: 1, notes: {}, leaves: {}, pushCount: 0 } as Metadata),
    isArchiveLoaded: s(false),
    lastKnownCommitSha: s<string | null>('base-sha'),
    lastPulledPushCount: s(3),
    isStale: s(true),
    leftNote: s<Note | null>(null),
    leftLeaf: s<Leaf | null>(null),
    rightNote: s<Note | null>(null),
    rightLeaf: s<Leaf | null>(null),
  }
})

const mocks = vi.hoisted(() => ({
  fetchCommitSnapshot: vi.fn(),
  fetchRemoteHeadSha: vi.fn(),
  setLastPushedSnapshot: vi.fn(),
  getArchiveBaseline: vi.fn((): { notes: Note[]; leaves: Leaf[] } => ({ notes: [], leaves: [] })),
  refreshDirtyState: vi.fn(),
  syncLeafEditors: vi.fn(),
  archiveRebuild: vi.fn(),
  rebuildLeafStats: vi.fn(),
  restoreStateFromUrl: vi.fn(async () => {}),
  saveNotes: vi.fn(async () => {}),
  saveLeaves: vi.fn(async () => {}),
  saveArchiveNotes: vi.fn(async () => {}),
  saveArchiveLeaves: vi.fn(async () => {}),
}))

const appState = vi.hoisted(() => ({
  isFirstPriorityFetched: true,
  loadingLeafIds: new Set<string>(),
}))

vi.mock('../stores', () => ({
  ...stores,
  archiveLeafStatsStore: { rebuild: mocks.archiveRebuild },
  setLastPushedSnapshot: mocks.setLastPushedSnapshot,
  getArchiveBaseline: mocks.getArchiveBaseline,
  refreshDirtyState: mocks.refreshDirtyState,
  syncLeafEditors: mocks.syncLeafEditors,
}))
vi.mock('../data', () => ({
  saveNotes: mocks.saveNotes,
  saveLeaves: mocks.saveLeaves,
  saveArchiveNotes: mocks.saveArchiveNotes,
  saveArchiveLeaves: mocks.saveArchiveLeaves,
}))
vi.mock('../api', () => ({
  fetchCommitSnapshot: mocks.fetchCommitSnapshot,
  fetchRemoteHeadSha: mocks.fetchRemoteHeadSha,
}))
vi.mock('../app-state.svelte', () => ({
  appState,
  appActions: {
    rebuildLeafStats: mocks.rebuildLeafStats,
    restoreStateFromUrl: mocks.restoreStateFromUrl,
  },
}))

const { analyzeConflictMerge, applyConflictMerge } = await import('./conflict-merge')

const settings = { token: 't', repoName: 'o/r' } as never
const stale = {
  status: 'stale' as const,
  localCommitSha: 'base-sha',
  remoteCommitSha: 'remote-sha',
}

function note(id: string, name: string): Note {
  return { id, name, order: 0 }
}
function leaf(id: string, noteId: string, title: string, content: string): Leaf {
  return { id, noteId, title, content, updatedAt: 1, order: 0 }
}
const meta = (pushCount: number): Metadata => ({ version: 1, notes: {}, leaves: {}, pushCount })
const world = (notes: Note[], leaves: Leaf[], pushCount = 3) => ({
  notes,
  leaves,
  metadata: meta(pushCount),
})
const snapshot = (sha: string, w: ReturnType<typeof world>, extra = {}) => ({
  status: 'success',
  commitSha: sha,
  home: w,
  hasUntrackedEntries: false,
  ...extra,
})

const baseWorld = () =>
  world(
    [note('n1', 'Work')],
    [leaf('a', 'n1', 'Todo', 'one\ntwo\nthree\nfour'), leaf('b', 'n1', 'Memo', 'memo')]
  )

function setLocal(w: ReturnType<typeof world>) {
  stores.notes.value = JSON.parse(JSON.stringify(w.notes))
  stores.leaves.value = JSON.parse(JSON.stringify(w.leaves))
}

beforeEach(() => {
  vi.clearAllMocks()
  appState.isFirstPriorityFetched = true
  appState.loadingLeafIds = new Set()
  stores.isArchiveLoaded.value = false
  stores.archiveNotes.value = []
  stores.archiveLeaves.value = []
  mocks.getArchiveBaseline.mockReturnValue({ notes: [], leaves: [] })
  stores.lastKnownCommitSha.value = 'base-sha'
  stores.isStale.value = true
  stores.leftNote.value = null
  stores.leftLeaf.value = null
  stores.rightNote.value = null
  stores.rightLeaf.value = null
  stores.metadata.value = meta(3)
})

/** ローカル=Todo の1行目を編集、リモート=Todo の4行目を編集＋リーフ追加 */
function setupMergeable() {
  const local = baseWorld()
  local.leaves[0].content = 'ONE\ntwo\nthree\nfour'
  setLocal(local)
  const remote = baseWorld()
  remote.leaves[0].content = 'one\ntwo\nthree\nFOUR'
  remote.leaves.push(leaf('c', 'n1', 'Added', 'new'))
  remote.metadata = meta(4)
  mocks.fetchCommitSnapshot.mockImplementation(async (_s: unknown, sha: string) =>
    sha === 'base-sha' ? snapshot('base-sha', baseWorld()) : snapshot('remote-sha', remote)
  )
  return { local, remote }
}

describe('analyzeConflictMerge', () => {
  it('マージ可能: 結果と件数を返し、ストアは書き換えない', async () => {
    setupMergeable()
    const before = JSON.stringify(stores.leaves.value)

    const analysis = await analyzeConflictMerge(stale, settings)

    expect(analysis.status).toBe('mergeable')
    if (analysis.status !== 'mergeable') return
    expect(analysis.localChangeCount).toBe(1)
    expect(analysis.remoteChangeCount).toBe(2)
    expect(analysis.plan.home.merged.leaves.find((l) => l.id === 'a')?.content).toBe(
      'ONE\ntwo\nthree\nFOUR'
    )
    // base と remote を SHA 指定で読む（ブランチ名ではない）
    expect(mocks.fetchCommitSnapshot.mock.calls.map((c) => c[1])).toEqual([
      'base-sha',
      'remote-sha',
    ])
    expect(JSON.stringify(stores.leaves.value)).toBe(before)
    expect(mocks.setLastPushedSnapshot).not.toHaveBeenCalled()
  })

  it('ローカルの本文の blob SHA を取得キャッシュに入れて渡す（変わらない本文は取りに行かない）', async () => {
    setupMergeable()
    await analyzeConflictMerge(stale, settings)
    const cache = mocks.fetchCommitSnapshot.mock.calls[0][2].contentCache as Map<string, string>
    expect([...cache.values()].sort()).toEqual(['ONE\ntwo\nthree\nfour', 'memo'].sort())
  })

  it('競合: 対象と種類を返す', async () => {
    const local = baseWorld()
    local.leaves[1].content = 'local memo'
    setLocal(local)
    const remote = baseWorld()
    remote.leaves[1].content = 'remote memo'
    mocks.fetchCommitSnapshot.mockImplementation(async (_s: unknown, sha: string) =>
      sha === 'base-sha' ? snapshot('base-sha', baseWorld()) : snapshot('remote-sha', remote)
    )
    const analysis = await analyzeConflictMerge(stale, settings)
    expect(analysis.status).toBe('conflicts')
    if (analysis.status !== 'conflicts') return
    expect(analysis.conflicts).toHaveLength(1)
    expect(analysis.conflicts[0]).toMatchObject({
      world: 'home',
      kind: 'content',
      path: 'Work/Memo',
    })
  })

  it('stale でない（check_failed 等）なら比較せず「リモートの状態不明」', async () => {
    const analysis = await analyzeConflictMerge(
      { status: 'check_failed', reason: { status: 'network_error' } },
      settings
    )
    expect(analysis).toEqual({ status: 'unavailable', reason: 'remoteStateUnknown' })
    expect(mocks.fetchCommitSnapshot).not.toHaveBeenCalled()
  })

  it('共通の基準が取得できない（コミットが無い）なら判定不能', async () => {
    setLocal(baseWorld())
    mocks.fetchCommitSnapshot.mockResolvedValue({ status: 'error', reason: 'notFound' })
    expect(await analyzeConflictMerge(stale, settings)).toEqual({
      status: 'unavailable',
      reason: 'baseUnavailable',
    })
  })

  it('base の SHA が無いなら判定不能', async () => {
    expect(await analyzeConflictMerge({ ...stale, localCommitSha: null }, settings)).toEqual({
      status: 'unavailable',
      reason: 'baseUnavailable',
    })
  })

  it('base に ID の記録が無いファイルがあれば判定不能（対応づけられない）', async () => {
    setLocal(baseWorld())
    mocks.fetchCommitSnapshot.mockResolvedValue(
      snapshot('base-sha', baseWorld(), { hasUntrackedEntries: true })
    )
    expect(await analyzeConflictMerge(stale, settings)).toEqual({
      status: 'unavailable',
      reason: 'untracked',
    })
  })

  it('リモートの読み出し失敗は判定不能（大きすぎる tree / 利用上限は理由を分ける）', async () => {
    setLocal(baseWorld())
    for (const [reason, expected] of [
      ['network', 'remoteUnavailable'],
      ['truncated', 'tooLarge'],
      ['rateLimited', 'rateLimited'],
    ]) {
      mocks.fetchCommitSnapshot.mockImplementation(async (_s: unknown, sha: string) =>
        sha === 'base-sha' ? snapshot('base-sha', baseWorld()) : { status: 'error', reason }
      )
      expect(await analyzeConflictMerge(stale, settings)).toEqual({
        status: 'unavailable',
        reason: expected,
      })
    }
  })

  it('ローカルの読み込み途中なら判定不能（欠けたリーフを削除と誤認しない）', async () => {
    appState.loadingLeafIds = new Set(['a'])
    expect(await analyzeConflictMerge(stale, settings)).toEqual({
      status: 'unavailable',
      reason: 'localIncomplete',
    })
    expect(mocks.fetchCommitSnapshot).not.toHaveBeenCalled()
  })

  it('予期しない例外は判定不能（failed）', async () => {
    setLocal(baseWorld())
    mocks.fetchCommitSnapshot.mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await analyzeConflictMerge(stale, settings)).toEqual({
      status: 'unavailable',
      reason: 'failed',
    })
    spy.mockRestore()
  })
})

describe('applyConflictMerge', () => {
  async function mergeablePlan() {
    const ctx = setupMergeable()
    const analysis = await analyzeConflictMerge(stale, settings)
    if (analysis.status !== 'mergeable') throw new Error('expected mergeable')
    return { ...ctx, plan: analysis.plan }
  }

  it('反映: ローカル=マージ結果、ベースライン=リモート、SHA=リモート、保存まで行う', async () => {
    const { plan, remote } = await mergeablePlan()
    mocks.fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: 'remote-sha' })
    stores.leftNote.value = stores.notes.value[0]
    stores.leftLeaf.value = stores.leaves.value[0]

    const result = await applyConflictMerge(plan, settings)

    expect(result).toEqual({ status: 'applied' })
    const byId = new Map(stores.leaves.value.map((l) => [l.id, l]))
    expect(byId.get('a')?.content).toBe('ONE\ntwo\nthree\nFOUR')
    expect(byId.get('c')?.content).toBe('new')
    expect(mocks.setLastPushedSnapshot).toHaveBeenCalledWith(
      remote.notes,
      remote.leaves,
      undefined,
      undefined
    )
    expect(stores.lastKnownCommitSha.value).toBe('remote-sha')
    expect(stores.lastPulledPushCount.value).toBe(4)
    expect(stores.isStale.value).toBe(false)
    expect(mocks.refreshDirtyState).toHaveBeenCalled()
    expect(mocks.saveLeaves).toHaveBeenCalledWith(stores.leaves.value)
    // 開いていたリーフの参照は新しいオブジェクトに差し替わり、エディタへ本文を流す
    expect(stores.leftLeaf.value?.content).toBe('ONE\ntwo\nthree\nFOUR')
    expect(mocks.syncLeafEditors).toHaveBeenCalledWith('a', 'ONE\ntwo\nthree\nFOUR')
  })

  it('比較後にリモートが進んでいたら何も書き換えずに changed(remote)', async () => {
    const { plan } = await mergeablePlan()
    mocks.fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: 'newer-sha' })
    const before = JSON.stringify(stores.leaves.value)

    expect(await applyConflictMerge(plan, settings)).toEqual({ status: 'changed', side: 'remote' })
    expect(JSON.stringify(stores.leaves.value)).toBe(before)
    expect(stores.lastKnownCommitSha.value).toBe('base-sha')
    expect(mocks.setLastPushedSnapshot).not.toHaveBeenCalled()
    expect(mocks.saveLeaves).not.toHaveBeenCalled()
  })

  it('比較後にローカルが変わっていたら何も書き換えずに changed(local)', async () => {
    const { plan } = await mergeablePlan()
    mocks.fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: 'remote-sha' })
    stores.leaves.value[1].content = 'typed after compare'

    expect(await applyConflictMerge(plan, settings)).toEqual({ status: 'changed', side: 'local' })
    expect(stores.leaves.value[1].content).toBe('typed after compare')
    expect(stores.lastKnownCommitSha.value).toBe('base-sha')
    expect(mocks.setLastPushedSnapshot).not.toHaveBeenCalled()
  })

  it('リモートの状態を確認できなければ何も書き換えずに failed', async () => {
    const { plan } = await mergeablePlan()
    mocks.fetchRemoteHeadSha.mockResolvedValue({ status: 'network_error' })
    const before = JSON.stringify(stores.leaves.value)

    expect(await applyConflictMerge(plan, settings)).toEqual({ status: 'failed', reason: 'remote' })
    expect(JSON.stringify(stores.leaves.value)).toBe(before)
    expect(stores.lastKnownCommitSha.value).toBe('base-sha')
  })

  it('S4: 反映前のリモート確認が返らなくても時間上限で failed(remote) になる（ロックを残さない）', async () => {
    const { plan } = await mergeablePlan()
    vi.useFakeTimers()
    try {
      mocks.fetchRemoteHeadSha.mockReturnValue(new Promise(() => {}))
      const pending = applyConflictMerge(plan, settings)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await pending).toEqual({ status: 'failed', reason: 'remote' })
      expect(stores.lastKnownCommitSha.value).toBe('base-sha')
    } finally {
      vi.useRealTimers()
    }
  })

  it('S2: IndexedDB への保存を SHA・ベースラインより先に行う', async () => {
    const { plan } = await mergeablePlan()
    mocks.fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: 'remote-sha' })
    const shaAtSave: (string | null)[] = []
    mocks.saveLeaves.mockImplementationOnce(async () => {
      shaAtSave.push(stores.lastKnownCommitSha.value)
      expect(mocks.setLastPushedSnapshot).not.toHaveBeenCalled()
    })

    expect(await applyConflictMerge(plan, settings)).toEqual({ status: 'applied' })
    expect(shaAtSave).toEqual(['base-sha'])
    expect(stores.lastKnownCommitSha.value).toBe('remote-sha')
  })

  it('S2: 保存に失敗したら SHA・ベースライン・ストアを進めずに failed(save)', async () => {
    const { plan } = await mergeablePlan()
    mocks.fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: 'remote-sha' })
    mocks.saveLeaves.mockRejectedValueOnce(new Error('quota'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = JSON.stringify(stores.leaves.value)

    expect(await applyConflictMerge(plan, settings)).toEqual({ status: 'failed', reason: 'save' })
    expect(JSON.stringify(stores.leaves.value)).toBe(before)
    expect(stores.lastKnownCommitSha.value).toBe('base-sha')
    expect(stores.isStale.value).toBe(true)
    expect(mocks.setLastPushedSnapshot).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('保存対象外（仮想ノート配下）のローカル項目はそのまま残す', async () => {
    const { plan } = await mergeablePlan()
    const virtualNote = note('__offline__', 'Offline')
    const virtualLeaf = leaf('__offline_leaf__', '__offline__', 'Offline', 'keep')
    // 比較時の内容（保存対象だけ）には影響しないので fingerprint は変わらない
    stores.notes.value = [...stores.notes.value, virtualNote]
    stores.leaves.value = [...stores.leaves.value, virtualLeaf]
    mocks.fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: 'remote-sha' })

    expect(await applyConflictMerge(plan, settings)).toEqual({ status: 'applied' })
    expect(stores.notes.value.some((n) => n.id === '__offline__')).toBe(true)
    expect(stores.leaves.value.find((l) => l.id === '__offline_leaf__')?.content).toBe('keep')
  })

  it('開いていたリーフがマージで消えたら、ペインを空にして URL から復元する', async () => {
    // ローカルは Memo を未変更、リモートが Memo を削除 → マージで消える
    setLocal(baseWorld())
    const remote = baseWorld()
    remote.leaves = remote.leaves.filter((l) => l.id !== 'b')
    mocks.fetchCommitSnapshot.mockImplementation(async (_s: unknown, sha: string) =>
      sha === 'base-sha' ? snapshot('base-sha', baseWorld()) : snapshot('remote-sha', remote)
    )
    const analysis = await analyzeConflictMerge(stale, settings)
    if (analysis.status !== 'mergeable') throw new Error('expected mergeable')
    stores.leftLeaf.value = stores.leaves.value[1]
    mocks.fetchRemoteHeadSha.mockResolvedValue({ status: 'success', commitSha: 'remote-sha' })

    await applyConflictMerge(analysis.plan, settings)

    expect(stores.leftLeaf.value).toBeNull()
    expect(mocks.restoreStateFromUrl).toHaveBeenCalled()
  })
})

describe('analyzeConflictMerge（レビュー指摘の追加分）', () => {
  it('S4: 比較の通信が返らなくても時間上限で timeout（理由つきで従来の選択肢へ）', async () => {
    setLocal(baseWorld())
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      mocks.fetchCommitSnapshot.mockImplementation(
        (_s: unknown, _sha: string, opts: { signal: AbortSignal }) => {
          signal = opts.signal
          return new Promise(() => {})
        }
      )
      const pending = analyzeConflictMerge(stale, settings)
      await vi.advanceTimersByTimeAsync(20_000)
      expect(await pending).toEqual({ status: 'unavailable', reason: 'timeout' })
      expect(signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('metadata.json の破損は専用の理由（基準・リモートの取得失敗と分ける）', async () => {
    setLocal(baseWorld())
    mocks.fetchCommitSnapshot.mockResolvedValue({ status: 'error', reason: 'metadataInvalid' })
    expect(await analyzeConflictMerge(stale, settings)).toEqual({
      status: 'unavailable',
      reason: 'metadataInvalid',
    })
  })

  it('M2: アーカイブを base より新しいコミットから読んでいたら判定不能（他端末の削除を復活させない）', async () => {
    // C1(base): アーカイブ空 → 他端末が C2 で X を追加 → 自分は C2 の時点でアーカイブを読込
    // → 他端末が C3 で X を削除。ローカルのアーカイブには X があるが、base(C1) には無いので
    // そのまま比べると「ローカルで追加」と誤認して X を復活させてしまう
    setLocal(baseWorld())
    stores.isArchiveLoaded.value = true
    const x = leaf('x', 'o1', 'X', 'archived')
    stores.archiveNotes.value = [note('o1', 'Old')]
    stores.archiveLeaves.value = [x]
    mocks.getArchiveBaseline.mockReturnValue({ notes: [note('o1', 'Old')], leaves: [x] })
    const emptyArchive = world([note('o1', 'Old')], [])
    mocks.fetchCommitSnapshot.mockImplementation(async (_s: unknown, sha: string) =>
      snapshot(sha, baseWorld(), { archive: emptyArchive })
    )

    expect(await analyzeConflictMerge(stale, settings)).toEqual({
      status: 'unavailable',
      reason: 'archiveOutOfDate',
    })
  })

  it('M2: アーカイブのベースラインが base と一致すれば、アーカイブも含めてマージできる', async () => {
    setLocal(baseWorld())
    stores.isArchiveLoaded.value = true
    const x = leaf('x', 'o1', 'X', 'archived')
    stores.archiveNotes.value = [note('o1', 'Old')]
    stores.archiveLeaves.value = [{ ...x, content: 'archived local' }]
    mocks.getArchiveBaseline.mockReturnValue({ notes: [note('o1', 'Old')], leaves: [x] })
    const archiveAt = world([note('o1', 'Old')], [x])
    mocks.fetchCommitSnapshot.mockImplementation(async (_s: unknown, sha: string) =>
      snapshot(sha, baseWorld(), { archive: archiveAt })
    )

    const analysis = await analyzeConflictMerge(stale, settings)
    expect(analysis.status).toBe('mergeable')
    if (analysis.status !== 'mergeable') return
    expect(analysis.plan.archive?.merged.leaves[0].content).toBe('archived local')
  })

  it('Priority バッジを双方が別々に変えたら競合', async () => {
    setLocal(baseWorld())
    const withPriority = (icon: string): Metadata => ({
      ...meta(3),
      leaves: { __priority__: { id: '__priority__', updatedAt: 0, order: 0, badgeIcon: icon } },
    })
    stores.metadata.value = withPriority('local-icon')
    mocks.fetchCommitSnapshot.mockImplementation(async (_s: unknown, sha: string) => {
      const w = baseWorld()
      w.metadata = sha === 'base-sha' ? meta(3) : withPriority('remote-icon')
      return snapshot(sha, w)
    })

    const analysis = await analyzeConflictMerge(stale, settings)
    expect(analysis.status).toBe('conflicts')
    if (analysis.status !== 'conflicts') return
    expect(analysis.conflicts).toEqual([
      { world: 'home', kind: 'attribute', target: 'leaf', path: 'Priority', field: 'badge' },
    ])
  })
})
