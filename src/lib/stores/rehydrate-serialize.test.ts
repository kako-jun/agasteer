import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// #297: rehydrateForRepo の直列化（実行中の再切替は最後の要求だけを適用し、
// 中間の要求は破棄する）を縛る回帰テスト。
//
// 他のテスト（leaf-stats.test.ts 等）と同様、storage 系モジュールがトップレベルで
// 参照する localStorage をスタブしてから動的 import する。
const localStorageBacking = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => localStorageBacking.get(k) ?? null,
  setItem: (k: string, v: string) => void localStorageBacking.set(k, v),
  removeItem: (k: string) => void localStorageBacking.delete(k),
  clear: () => localStorageBacking.clear(),
  key: (i: number) => Array.from(localStorageBacking.keys())[i] ?? null,
  get length() {
    return localStorageBacking.size
  },
}

const mocks = vi.hoisted(() => ({
  setCurrentRepo: vi.fn(async (_repoKey: string) => {}),
  closeCurrentRepoDb: vi.fn(),
  loadNotes: vi.fn(async () => []),
  loadLeaves: vi.fn(async () => []),
  getPersistedCommitSha: vi.fn(() => null as string | null),
  getPersistedLastPulledPushCount: vi.fn(() => 0 as number | null),
  getPersistedMetadata: vi.fn(async () => null),
  flushPersistedMetadata: vi.fn(async () => {}),
  setPersistedMetadata: vi.fn(async () => {}),
  flushPendingSaves: vi.fn(async () => {}),
  waitForPendingMediaInserts: vi.fn(async () => {}),
  // #297 T2/T3: isRehydrating ガードの true/false トグルを観測するためのスパイ。
  // 実装（isRehydrating フラグ）自体は本テストファイルの経路では誰も読まないため
  // （initStoreEffects は呼ばれない）、実体呼び出しには委譲せず記録だけする。
  setRehydrating: vi.fn(),
}))

// #297: setCurrentRepo の呼び出し順・タイミングだけを観測したいので、実 IndexedDB
// アクセス（loadNotes/loadLeaves/getPersistedCommitSha/getPersistedLastPulledPushCount
// を含む）はモックに差し替える。他の export は素通しする。
vi.mock('../data/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/storage')>()
  return {
    ...actual,
    setCurrentRepo: mocks.setCurrentRepo,
    closeCurrentRepoDb: mocks.closeCurrentRepoDb,
    loadNotes: mocks.loadNotes,
    loadLeaves: mocks.loadLeaves,
    getPersistedCommitSha: mocks.getPersistedCommitSha,
    getPersistedLastPulledPushCount: mocks.getPersistedLastPulledPushCount,
  }
})

vi.mock('../data/metadata-storage', () => ({
  getPersistedMetadata: mocks.getPersistedMetadata,
  flushPersistedMetadata: mocks.flushPersistedMetadata,
  setPersistedMetadata: mocks.setPersistedMetadata,
}))

vi.mock('./auto-save.svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auto-save.svelte')>()
  return {
    ...actual,
    flushPendingSaves: mocks.flushPendingSaves,
  }
})

vi.mock('../api/media/insert-phase', () => ({
  waitForPendingMediaInserts: mocks.waitForPendingMediaInserts,
}))

// #297 T2/T3: setRehydrating だけスパイに差し替える。他の export（notes/leaves 等）は
// 実物をそのまま通す（stores.svelte.ts 内の他ロジックへの影響を避けるため）。
vi.mock('./stores.svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stores.svelte')>()
  return {
    ...actual,
    setRehydrating: mocks.setRehydrating,
  }
})

// #297 nit11: rehydrateForRepo/waitForRehydrate は rehydrate.svelte.ts へ分離済み
const { rehydrateForRepo, waitForRehydrate } = await import('./rehydrate.svelte')
// #297 T3: 最終適用結果（notes.value）を検証するため、実体ストアも取得する
const { notes: notesStore } = await import('./stores.svelte')

/** 明示的に resolve/reject を外から制御できる Promise */
function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('rehydrateForRepo の直列化 (#297)', () => {
  // #297: rehydrateInFlight / nextRehydrateKey は stores.svelte.ts のモジュール
  // スコープ変数のため、テストが assertion 失敗で早期終了しても次のテストへ
  // 「止まったままの rehydrate」を持ち越さないよう、常にゲートを開けて
  // キューを空にしてから終える。
  let repoAGate: ReturnType<typeof deferred<void>>

  beforeEach(() => {
    vi.clearAllMocks()
    repoAGate = deferred<void>()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    repoAGate.resolve()
    // 直前のテストが assertion 失敗で終わっていても、キューを空にして
    // 次のテストへ pending な rehydrate を持ち越さない。
    await waitForRehydrate().catch(() => {})
  })

  it('実行中に来た切替要求は中間を破棄し、最後に要求された repoKey だけを適用する', async () => {
    mocks.setCurrentRepo.mockImplementation(async (repoKey: string) => {
      if (repoKey === 'repoA') {
        await repoAGate.promise
      }
    })

    // repoA の rehydrate を開始（setCurrentRepo('repoA') の途中で止まる）
    const promiseA = rehydrateForRepo('repoA')
    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
    })
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(1, 'repoA')

    // repoA 実行中に repoB → repoC の順で切替要求が来る（中間の repoB は破棄される想定）
    const promiseB = rehydrateForRepo('repoB')
    const promiseC = rehydrateForRepo('repoC')

    // 3つの呼び出し元 Promise は「最終適用の完了」で揃って resolve する仕様
    expect(promiseB).toBe(promiseA)
    expect(promiseC).toBe(promiseA)

    // repoA の setCurrentRepo をまだ止めているので、repoB は一切適用されない
    expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)

    // repoA の処理を進める
    repoAGate.resolve()
    await promiseA

    // repoB を経由せず、最後に要求された repoC だけが repoA の後に適用される
    expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(2)
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(1, 'repoA')
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(2, 'repoC')

    // 3つの Promise はすべて解決済み
    await Promise.all([promiseA, promiseB, promiseC])
  })

  it('キューが空になるまで waitForRehydrate() は解決しない', async () => {
    mocks.setCurrentRepo.mockImplementation(async (repoKey: string) => {
      if (repoKey === 'repoA') {
        await repoAGate.promise
      }
    })

    const promiseA = rehydrateForRepo('repoA')
    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
    })

    rehydrateForRepo('repoD')

    let waitResolved = false
    const waitPromise = waitForRehydrate().then(() => {
      waitResolved = true
    })

    // repoA を止めたままなら waitForRehydrate はまだ解決しない
    await Promise.resolve()
    await Promise.resolve()
    expect(waitResolved).toBe(false)

    repoAGate.resolve()
    await promiseA
    await waitPromise

    expect(waitResolved).toBe(true)
    // idle に戻った後は即座に解決する
    await expect(waitForRehydrate()).resolves.toBeUndefined()
  })
})

describe('rehydrateForRepo の例外耐性 (#297 must1/must2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    // 直前のテストが assertion 失敗で終わっていても、次のテストへ
    // 「止まったままの rehydrate」を持ち越さない。
    await waitForRehydrate().catch(() => {})
  })

  it('must1: 未保護awaitが例外を投げても、キュー済みの最後のキーは必ず適用される（幽霊適用の防止）', async () => {
    // applyRehydrateForRepo の未保護 await（getPersistedMetadata）を、
    // repoA の1周目だけ外部から reject 制御できるゲートにする。
    let rejectRepoAMetadata!: (error: unknown) => void
    const repoAMetadataGate = new Promise<null>((_resolve, reject) => {
      rejectRepoAMetadata = reject
    })
    let metadataCallCount = 0
    mocks.getPersistedMetadata.mockImplementation(async () => {
      metadataCallCount += 1
      if (metadataCallCount === 1) {
        return repoAMetadataGate
      }
      return null
    })

    const promiseA = rehydrateForRepo('repoA')
    // 呼び出し元（例: handleSettingsChange の fire-and-forget rehydrate）は
    // 自前で .catch する契約。本テストの主眼はキュー処理なので同様に握る。
    promiseA.catch(() => {})

    // repoA が setCurrentRepo を終え、getPersistedMetadata で止まるまで待つ
    // （この時点では nextRehydrateKey===null のため nit8 skip は発生せず、
    // repoA は「完全に適用しようとした」状態になる）
    await vi.waitFor(() => {
      expect(metadataCallCount).toBe(1)
    })
    expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(1, 'repoA')

    // repoA が止まっている間に repoB への切替要求が来る
    rehydrateForRepo('repoB')

    // repoA の getPersistedMetadata を失敗させる
    rejectRepoAMetadata(new Error('repoA metadata read failed'))

    // must1: 例外が起きてもキュー済みの repoB が破棄されず、続けて適用される
    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(2)
    })
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(2, 'repoB')

    // question1: reject するかどうかは最終周回（キュー消化後、最後に適用された
    // repoB）の成否だけで決まる。repoA の失敗は中間周回として握りつぶされ、
    // repoB が成功しているため promiseA は reject せず resolve する。
    await expect(promiseA).resolves.toBeUndefined()

    // ゴースト適用の検知: 無関係な後続の rehydrateForRepo('repoD') が、
    // 残留した nextRehydrateKey のせいで余計な repoKey まで適用してしまわないこと
    const promiseD = rehydrateForRepo('repoD')
    await promiseD
    expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(3)
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(3, 'repoD')
  })

  it('must2: waitForRehydrate() はrehydrate失敗のrejectを外へ伝播させず、完了だけを待つ', async () => {
    mocks.getPersistedMetadata.mockRejectedValueOnce(new Error('boom'))

    const promiseA = rehydrateForRepo('repoA')
    // rehydrateForRepo 自体の Promise は reject する契約（呼び出し元の責務で処理）。
    // ここでは unhandled rejection を避けるためだけに握る。
    promiseA.catch(() => {})

    // pullFromGitHub/pushToGitHub/handleWorldChange/moveNoteToWorld の実装と同じ
    // 呼び方（await waitForRehydrate()）が例外で落ちないことを縛る。
    await expect(waitForRehydrate()).resolves.toBeUndefined()

    // rehydrateForRepo 自体は reject する（waitForRehydrate が握るのは
    // 「待機側」だけで、rehydrateForRepo の戻り値の契約は変えない）
    await expect(promiseA).rejects.toThrow('boom')
  })
})

describe('rehydrateForRepo の setCurrentRepo 失敗経路 (#297 T1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    await waitForRehydrate().catch(() => {})
  })

  it('T1: setCurrentRepo失敗（catch→早期return）中にキューされた次キーは、ループが継続して適用される', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      let rejectRepoA!: (error: unknown) => void
      const repoAGate = new Promise<void>((_resolve, reject) => {
        rejectRepoA = reject
      })
      mocks.setCurrentRepo.mockImplementation(async (repoKey: string) => {
        if (repoKey === 'repoA') {
          await repoAGate
        }
      })

      const promiseA = rehydrateForRepo('repoA')
      // setCurrentRepo失敗経路はapplyRehydrateForRepo内部でcatchされ、
      // 例外を再throwしない（早期returnのみ）ため、単独では reject しない契約。
      // 念のため unhandled rejection 対策として握っておく。
      promiseA.catch(() => {})

      await vi.waitFor(() => {
        expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
      })
      expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(1, 'repoA')

      // repoA の setCurrentRepo がまだ失敗する前に、次のキーをキューする
      rehydrateForRepo('repoB')

      // repoA の setCurrentRepo を失敗させる
      rejectRepoA(new Error('failed to open per-repo db'))

      // must1 と同様の不変条件: setCurrentRepo failure でもキュー済みの repoB は
      // 破棄されず、ループが継続して適用される
      await vi.waitFor(() => {
        expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(2)
      })
      expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(2, 'repoB')

      // setCurrentRepo 失敗時の後始末（closeCurrentRepoDb）が行われている
      expect(mocks.closeCurrentRepoDb).toHaveBeenCalledTimes(1)

      await promiseA
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('rehydrateForRepo のガード解除（例外経路） (#297 T2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    await waitForRehydrate().catch(() => {})
  })

  it('T2: must1がカバーしない側面 — 例外でrejectしても isRehydrating ガードは確実に解除される（setRehydrating(false)が呼ばれる）', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.getPersistedMetadata.mockRejectedValueOnce(new Error('boom'))

      const promiseA = rehydrateForRepo('repoA')
      promiseA.catch(() => {})

      // must1 は reject すること自体は検証済みなのでここでは前提としてのみ使う
      await expect(promiseA).rejects.toThrow('boom')

      // 未カバーだった側面: 例外発生時も finally で setRehydrating(true) → (false) の
      // トグルが最後まで完了し、途中で false 化が漏れない
      expect(mocks.setRehydrating.mock.calls.map(([v]) => v)).toEqual([true, false])
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('rehydrateForRepo のガード状態遷移とデータ最終性 (#297 T3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    await waitForRehydrate().catch(() => {})
    notesStore.value = []
  })

  it('T3: A→(中間破棄されるB)→Cの連続適用中、setRehydratingはtrue1回→false1回のみで途中復帰せず、notes.valueは最後に適用されたCのデータになる', async () => {
    let resolveGateA!: () => void
    const gateA = new Promise<void>((resolve) => {
      resolveGateA = resolve
    })
    let currentKey = ''
    mocks.setCurrentRepo.mockImplementation(async (repoKey: string) => {
      currentKey = repoKey
      if (repoKey === 'repoA') {
        await gateA
      }
    })
    const notesByRepo: Record<string, Array<{ id: string }>> = {
      repoA: [{ id: 'note-A' }],
      repoB: [{ id: 'note-B' }],
      repoC: [{ id: 'note-C' }],
    }
    mocks.loadNotes.mockImplementation(async () => notesByRepo[currentKey] ?? [])

    const promiseA = rehydrateForRepo('repoA')
    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
    })
    // この時点までに true が1回だけ呼ばれている
    expect(mocks.setRehydrating.mock.calls.map(([v]) => v)).toEqual([true])

    // repoA 実行中に repoB → repoC の順で切替要求（repoB は中間破棄される想定）
    rehydrateForRepo('repoB')
    rehydrateForRepo('repoC')

    resolveGateA()
    await promiseA

    // repoB の setCurrentRepo は一度も呼ばれない（中間破棄）
    expect(mocks.setCurrentRepo).not.toHaveBeenCalledWith('repoB')
    expect(mocks.setCurrentRepo).toHaveBeenLastCalledWith('repoC')

    // 最終的に store に反映された notes は、最後に適用された repoC のデータ
    expect(notesStore.value).toEqual([{ id: 'note-C' }])

    // setRehydrating は true→false の1往復のみ。中間で false に戻っていない
    expect(mocks.setRehydrating.mock.calls.map(([v]) => v)).toEqual([true, false])

    // N3: nit8 の中間 skip を直接検証する。setCurrentRepo は repoA・repoC の
    // 2回呼ばれるが、repoA は setCurrentRepo 完了時点で nextRehydrateKey（repoC）
    // が既にセットされているため nit8 の早期 return で打ち切られ、
    // loadNotes/getPersistedMetadata まで到達しない。最終キー repoC 分の
    // 1回だけが呼ばれる。
    expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(2)
    expect(mocks.loadNotes).toHaveBeenCalledTimes(1)
    expect(mocks.getPersistedMetadata).toHaveBeenCalledTimes(1)
  })
})

describe('rehydrateForRepo の二重送信 dedupe 非対応 (#297 T4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    await waitForRehydrate().catch(() => {})
  })

  it('T4: 実行中と同じrepoKeyの再要求はdedupeされない（nit9の現状仕様固定。2回適用される）', async () => {
    let resolveGateA!: () => void
    const gateA = new Promise<void>((resolve) => {
      resolveGateA = resolve
    })
    let callCount = 0
    mocks.setCurrentRepo.mockImplementation(async (repoKey: string) => {
      callCount += 1
      if (repoKey === 'repoA' && callCount === 1) {
        await gateA
      }
    })

    const promiseA = rehydrateForRepo('repoA')
    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
    })

    // 実行中に同じ repoA を再要求（nit9: dedupe しない）
    const promiseA2 = rehydrateForRepo('repoA')
    expect(promiseA2).toBe(promiseA)

    resolveGateA()
    await promiseA

    // dedupe されず、repoA の setCurrentRepo が2回呼ばれる
    expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(2)
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(1, 'repoA')
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(2, 'repoA')
  })
})

describe('rehydrateForRepo の A実行中→B→A 分岐 (#297 T5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    await waitForRehydrate().catch(() => {})
  })

  it('T5: A実行中にB→Aの順で要求すると、Bは一度もsetCurrentRepoされず最終的にAが（2回）適用される', async () => {
    let resolveGateA!: () => void
    const gateA = new Promise<void>((resolve) => {
      resolveGateA = resolve
    })
    let firstCall = true
    mocks.setCurrentRepo.mockImplementation(async (repoKey: string) => {
      if (repoKey === 'repoA' && firstCall) {
        firstCall = false
        await gateA
      }
    })

    const promiseA = rehydrateForRepo('repoA')
    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
    })

    rehydrateForRepo('repoB')
    const promiseA2 = rehydrateForRepo('repoA')
    expect(promiseA2).toBe(promiseA)

    resolveGateA()
    await promiseA

    expect(mocks.setCurrentRepo).not.toHaveBeenCalledWith('repoB')
    expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(2)
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(1, 'repoA')
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(2, 'repoA')
  })
})

describe('waitForRehydrate の idle fast path (#297 T6)', () => {
  it('T6: 一度もrehydrateしていない初期状態でwaitForRehydrate()は即座に解決する', async () => {
    await expect(waitForRehydrate()).resolves.toBeUndefined()
  })
})

describe('waitForRehydrate の追従 (#297 T7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    await waitForRehydrate().catch(() => {})
  })

  it('T7: waitForRehydrate()保持中に、直前のrehydrate完了と同じ瞬間に開始した新たなrehydrateForRepoにも追従して待つ（nit7）', async () => {
    let resolveGateA!: () => void
    const gateA = new Promise<void>((resolve) => {
      resolveGateA = resolve
    })
    let resolveGateB!: () => void
    const gateB = new Promise<void>((resolve) => {
      resolveGateB = resolve
    })
    mocks.setCurrentRepo.mockImplementation(async (repoKey: string) => {
      if (repoKey === 'repoA') await gateA
      if (repoKey === 'repoB') await gateB
    })

    const promiseA = rehydrateForRepo('repoA')
    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(1)
    })

    // promiseA 解決と同じマイクロタスクで repoB を起動する継続を、
    // waitForRehydrate() 呼び出し（内部の promiseA.catch）より先に登録しておく。
    // Promise の reaction は attach 順に実行されるため、これで
    // 「repoB 起動 → 内部ループの再チェック」の順序を保証できる。
    const chainedStartB = promiseA.then(() => {
      rehydrateForRepo('repoB')
    })

    let waitResolved = false
    const waitPromise = waitForRehydrate().then(() => {
      waitResolved = true
    })

    resolveGateA()
    await promiseA
    await chainedStartB

    await vi.waitFor(() => {
      expect(mocks.setCurrentRepo).toHaveBeenCalledTimes(2)
    })
    expect(mocks.setCurrentRepo).toHaveBeenNthCalledWith(2, 'repoB')
    // repoA は完了したが、直後に始まった repoB がまだ実行中なので
    // 保持していた waitForRehydrate() の Promise はまだ解決しない
    expect(waitResolved).toBe(false)

    resolveGateB()
    await waitPromise
    expect(waitResolved).toBe(true)
  })
})

describe('rehydrateForRepo のログ出力 (#297 T10/T11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setCurrentRepo.mockImplementation(async () => {})
    mocks.loadNotes.mockResolvedValue([])
    mocks.loadLeaves.mockResolvedValue([])
    mocks.getPersistedCommitSha.mockReturnValue(null)
    mocks.getPersistedLastPulledPushCount.mockReturnValue(0)
    mocks.getPersistedMetadata.mockResolvedValue(null)
  })

  afterEach(async () => {
    await waitForRehydrate().catch(() => {})
  })

  it('T10: 正常系ではconsole.errorが呼ばれない', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await rehydrateForRepo('repoA')
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('T11: setCurrentRepo失敗時に期待メッセージでconsole.errorが呼ばれる', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const error = new Error('open failed')
      mocks.setCurrentRepo.mockRejectedValueOnce(error)

      await rehydrateForRepo('repoA')

      expect(errorSpy).toHaveBeenCalledWith('Failed to open per-repo DB:', error)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('T11: loadNotes/loadLeaves失敗時に期待メッセージでconsole.errorが呼ばれる', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const error = new Error('load failed')
      mocks.loadNotes.mockRejectedValueOnce(error)

      await rehydrateForRepo('repoA')

      expect(errorSpy).toHaveBeenCalledWith('Failed to load cached data for new repo:', error)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('T11: flushPendingSaves失敗時に期待メッセージでconsole.errorが呼ばれる', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const error = new Error('flush failed')
      mocks.flushPendingSaves.mockRejectedValueOnce(error)

      await rehydrateForRepo('repoA')

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to flush pending saves before repo switch:',
        error
      )
    } finally {
      errorSpy.mockRestore()
    }
  })
})
