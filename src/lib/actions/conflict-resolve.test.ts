// #321: 競合ダイアログの全経路（stale-push / pull-dirty / startup-dirty / push-hang）が
// 同じ resolveConflict（比較 → ダイアログ → マージ反映）を通ることを検証する。
// 実際の showConflictDialog を通し、比較・反映（conflict-merge）と choiceAsync だけを差し替える。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings, StaleCheckResult } from '../types'

const lastKnownCommitSha = { value: 'base-sha' as string | null }
const mocks = vi.hoisted(() => ({
  fetchRemotePushCount: vi.fn(),
  choiceAsync: vi.fn(),
  analyzeConflictMerge: vi.fn(),
  applyConflictMerge: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../stores', () => ({ lastKnownCommitSha }))
vi.mock('../api', () => ({ fetchRemotePushCount: mocks.fetchRemotePushCount }))
vi.mock('../ui', () => ({ choiceAsync: mocks.choiceAsync }))
vi.mock('../ui/icons', () => ({ PULL_ICON: 'PULL_ICON', PUSH_ICON: 'PUSH_ICON' }))
vi.mock('../diagnostics/record', () => ({ recordDiag: vi.fn() }))
vi.mock('./conflict-merge', () => ({
  analyzeConflictMerge: mocks.analyzeConflictMerge,
  applyConflictMerge: mocks.applyConflictMerge,
}))
vi.mock('../i18n', () => ({
  _: {
    subscribe(run: (t: (key: string) => string) => void) {
      run((key: string) => key)
      return () => {}
    },
  },
}))

const { resolveConflict, isResolvingConflict } = await import('./conflict-resolve')

const settings = {} as Settings
const stale: StaleCheckResult = {
  status: 'stale',
  localCommitSha: 'base-sha',
  remoteCommitSha: 'remote-sha',
}
const plan = { remoteSha: 'remote-sha' }
const mergeable = { status: 'mergeable', plan, localChangeCount: 1, remoteChangeCount: 1 }

const KINDS = ['stale-push', 'pull-dirty', 'startup-dirty', 'push-hang'] as const

function run(kind: (typeof KINDS)[number]) {
  return resolveConflict({
    kind,
    staleResult: stale,
    localPushCount: 1,
    settings,
    disablePush: kind === 'startup-dirty',
    toast: mocks.toast,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 1 })
  mocks.analyzeConflictMerge.mockResolvedValue(mergeable)
  mocks.applyConflictMerge.mockResolvedValue({ status: 'applied' })
})

describe('resolveConflict: 全経路で同じ比較 → マージ → 反映', () => {
  it.each(KINDS)('%s: マージ可能なら先頭にマージを出し、選ぶと反映して merged', async (kind) => {
    mocks.choiceAsync.mockResolvedValue('merge')

    expect(await run(kind)).toBe('merged')

    expect(mocks.analyzeConflictMerge).toHaveBeenCalledWith(stale, settings)
    const [, options] = mocks.choiceAsync.mock.calls[0]
    expect(options[0]).toMatchObject({ value: 'merge', variant: 'primary' })
    expect(mocks.applyConflictMerge).toHaveBeenCalledWith(plan, settings)
    expect(mocks.toast).toHaveBeenCalledWith('modal.mergeDone', 'success')
  })

  it.each(KINDS)('%s: 判定不能なら理由を本文に出し、マージは出さない', async (kind) => {
    mocks.analyzeConflictMerge.mockResolvedValue({ status: 'unavailable', reason: 'timeout' })
    mocks.choiceAsync.mockResolvedValue('cancel')

    expect(await run(kind)).toBe('cancel')

    const [body, options] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('modal.mergeUnavailable')
    expect(options.some((o: { value: string }) => o.value === 'merge')).toBe(false)
    expect(mocks.applyConflictMerge).not.toHaveBeenCalled()
  })

  it('startup-dirty は Push first を出さない（マージ・Pull・キャンセル）', async () => {
    mocks.choiceAsync.mockResolvedValue('cancel')
    await run('startup-dirty')
    const [, options] = mocks.choiceAsync.mock.calls[0]
    expect(options.map((o: { value: string }) => o.value)).toEqual(['merge', 'pull', 'cancel'])
  })

  it('比較後に変化していたら recompare、反映に失敗したら mergeFailed（理由ごとの文言）', async () => {
    mocks.choiceAsync.mockResolvedValue('merge')
    mocks.applyConflictMerge.mockResolvedValueOnce({ status: 'changed', side: 'remote' })
    expect(await run('push-hang')).toBe('recompare')
    expect(mocks.toast).toHaveBeenCalledWith('modal.mergeRecompare', '')

    mocks.applyConflictMerge.mockResolvedValueOnce({ status: 'failed', reason: 'save' })
    expect(await run('push-hang')).toBe('mergeFailed')
    expect(mocks.toast).toHaveBeenCalledWith('modal.mergeSaveFailed', 'error')

    mocks.applyConflictMerge.mockResolvedValueOnce({ status: 'failed', reason: 'remote' })
    expect(await run('pull-dirty')).toBe('mergeFailed')
    expect(mocks.toast).toHaveBeenCalledWith('modal.mergeApplyFailed', 'error')
  })

  it('従来の選択肢はそのまま返す（null は cancel）', async () => {
    mocks.choiceAsync.mockResolvedValueOnce('pull')
    expect(await run('push-hang')).toBe('pull')
    mocks.choiceAsync.mockResolvedValueOnce('push')
    expect(await run('push-hang')).toBe('push')
    mocks.choiceAsync.mockResolvedValueOnce(null)
    expect(await run('stale-push')).toBe('cancel')
  })

  it('isResolvingConflict は解決中だけ true（例外で終わっても戻る）', async () => {
    let finish: (v: string) => void = () => {}
    mocks.choiceAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    expect(isResolvingConflict()).toBe(false)
    const pending = run('stale-push')
    await vi.waitFor(() => expect(mocks.choiceAsync).toHaveBeenCalled())
    expect(isResolvingConflict()).toBe(true)
    finish('cancel')
    await pending
    expect(isResolvingConflict()).toBe(false)

    mocks.analyzeConflictMerge.mockRejectedValueOnce(new Error('x'))
    await expect(run('pull-dirty')).rejects.toThrow('x')
    expect(isResolvingConflict()).toBe(false)
  })
})
