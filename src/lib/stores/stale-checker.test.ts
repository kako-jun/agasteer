import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PUSH_IN_FLIGHT_EXPIRY_MS } from '../sync/constants'
import type { StaleCheckResult } from '../types'

// stale-checker が参照するストアを ValueStore オブジェクトで置き換える
// （git.test.ts と同じ流儀。値の書き換わりを直接 assert できる）
const stores = vi.hoisted(() => {
  const createStore = <T>(value: T): { value: T } => ({ value })
  return {
    settings: createStore({ token: 'token', repoName: 'owner/repo', branch: 'main' }),
    isPulling: createStore(false),
    isPushing: createStore(false),
    isPushingBackground: createStore(false),
    isStale: createStore(false),
    isDirty: createStore(false),
    lastStaleCheckTime: createStore(0),
    lastKnownCommitSha: createStore<string | null>('local-sha'),
    githubConfigured: createStore(true),
  }
})

const mocks = vi.hoisted(() => ({
  checkStaleStatus: vi.fn(),
  getPushInFlightAt: vi.fn((): number | undefined => undefined),
  setPushInFlightAt: vi.fn(),
}))

vi.mock('./stores.svelte', () => stores)

vi.mock('../api/sync', () => ({
  checkStaleStatus: mocks.checkStaleStatus,
}))

vi.mock('../data/storage', () => ({
  getPushInFlightAt: mocks.getPushInFlightAt,
  setPushInFlightAt: mocks.setPushInFlightAt,
}))

const { tryRescueStalePush, applyStaleResult, shouldAutoPull } =
  await import('./stale-checker.svelte')

const staleResult: Extract<StaleCheckResult, { status: 'stale' }> = {
  status: 'stale',
  remoteCommitSha: 'remote-sha',
  localCommitSha: 'local-sha',
}

const checkFailedResult: StaleCheckResult = {
  status: 'check_failed',
  reason: { status: 'network_error' },
}

beforeEach(() => {
  // 境界値テスト（EXPIRY-1 / EXPIRY / EXPIRY+1）で Date.now() の進みが
  // 判定をぶらさないよう時刻を凍結する
  vi.useFakeTimers()
  vi.clearAllMocks()
  // clearAllMocks は mockReturnValue を消さないため、既定値を明示的に再設定する
  mocks.getPushInFlightAt.mockReturnValue(undefined)
  stores.isStale.value = false
  stores.isDirty.value = false
  stores.lastKnownCommitSha.value = 'local-sha'
  shouldAutoPull.value = false
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tryRescueStalePush (#235)', () => {
  it('pushInFlightAt 未設定なら救済せず、フラグにも状態にも触らない', () => {
    stores.isStale.value = true
    stores.lastKnownCommitSha.value = null

    const rescued = tryRescueStalePush(staleResult, 'test')

    expect(rescued).toBe(false)
    expect(mocks.setPushInFlightAt).not.toHaveBeenCalled()
    expect(stores.lastKnownCommitSha.value).toBeNull()
    expect(stores.isStale.value).toBe(true)
  })

  it('期限内（EXPIRY-1ms 経過）なら救済: SHA をリモートに揃え、フラグを消費し、stale を解消する', () => {
    stores.isStale.value = true
    mocks.getPushInFlightAt.mockReturnValue(Date.now() - (PUSH_IN_FLIGHT_EXPIRY_MS - 1))

    const rescued = tryRescueStalePush(staleResult, 'test')

    expect(rescued).toBe(true)
    expect(stores.lastKnownCommitSha.value).toBe('remote-sha')
    expect(mocks.setPushInFlightAt).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(stores.isStale.value).toBe(false)
  })

  it('EXPIRY ちょうどの経過は期限切れ（strict <）: 救済せずフラグのクリアだけ行う', () => {
    stores.isStale.value = true
    mocks.getPushInFlightAt.mockReturnValue(Date.now() - PUSH_IN_FLIGHT_EXPIRY_MS)

    const rescued = tryRescueStalePush(staleResult, 'test')

    expect(rescued).toBe(false)
    expect(mocks.setPushInFlightAt).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(stores.isStale.value).toBe(true)
  })

  it('EXPIRY+1ms 経過も期限切れ: 救済せずフラグのクリアだけ行う', () => {
    stores.isStale.value = true
    mocks.getPushInFlightAt.mockReturnValue(Date.now() - (PUSH_IN_FLIGHT_EXPIRY_MS + 1))

    const rescued = tryRescueStalePush(staleResult, 'test')

    expect(rescued).toBe(false)
    expect(mocks.setPushInFlightAt).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(stores.isStale.value).toBe(true)
  })
})

describe('applyStaleResult（tryRescueStalePush 切り出し後の回帰確認 #235）', () => {
  it('stale + push-in-flight 期限内 → rescued', () => {
    mocks.getPushInFlightAt.mockReturnValue(Date.now() - 1000)

    const outcome = applyStaleResult(staleResult, 'test')

    expect(outcome).toBe('rescued')
    expect(stores.lastKnownCommitSha.value).toBe('remote-sha')
    expect(stores.isStale.value).toBe(false)
    expect(shouldAutoPull.value).toBe(false)
  })

  it('stale + フラグ期限切れ + dirty → stale-dirty（赤バッジ）', () => {
    stores.isDirty.value = true
    mocks.getPushInFlightAt.mockReturnValue(Date.now() - (PUSH_IN_FLIGHT_EXPIRY_MS + 1))

    const outcome = applyStaleResult(staleResult, 'test')

    expect(outcome).toBe('stale-dirty')
    expect(stores.isStale.value).toBe(true)
    expect(shouldAutoPull.value).toBe(false)
  })

  it('stale + フラグなし + クリーン → stale-auto-pull（自動 Pull 予約）', () => {
    stores.isDirty.value = false

    const outcome = applyStaleResult(staleResult, 'test')

    expect(outcome).toBe('stale-auto-pull')
    expect(shouldAutoPull.value).toBe(true)
    expect(stores.isStale.value).toBe(false)
  })

  it('up_to_date + フラグ残存 → フラグをクリアして up-to-date', () => {
    stores.isStale.value = true
    mocks.getPushInFlightAt.mockReturnValue(Date.now() - 1000)

    const outcome = applyStaleResult({ status: 'up_to_date' }, 'test')

    expect(outcome).toBe('up-to-date')
    expect(mocks.setPushInFlightAt).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(stores.isStale.value).toBe(false)
  })

  it('check_failed → check-failed（フラグ・SHA・isStale すべて現状維持）', () => {
    stores.isStale.value = true
    mocks.getPushInFlightAt.mockReturnValue(Date.now() - 1000)

    const outcome = applyStaleResult(checkFailedResult, 'test')

    expect(outcome).toBe('check-failed')
    expect(mocks.setPushInFlightAt).not.toHaveBeenCalled()
    expect(stores.lastKnownCommitSha.value).toBe('local-sha')
    expect(stores.isStale.value).toBe(true)
    expect(shouldAutoPull.value).toBe(false)
  })
})
