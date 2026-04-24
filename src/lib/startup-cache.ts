import type { Leaf, Metadata, Note, StaleCheckResult } from './types'

export interface PersistedStartupCache {
  notes: Note[]
  leaves: Leaf[]
  metadata: Metadata | null
  lastPulledPushCount: number | null
  wasDirty: boolean
}

export interface StartupCacheDecisionInput {
  lastKnownCommitSha: string | null
  staleResult: StaleCheckResult | null
  cache: PersistedStartupCache
}

/**
 * 起動時に full pull をスキップしてローカルキャッシュを採用してよいか判定する。
 *
 * 条件:
 * - 過去に同期済み（lastKnownCommitSha !== null）
 * - 直前の stale check で remote HEAD が一致
 * - ローカルに未Push変更が残っていない
 * - Priority badge / pushCount を復元するための metadata がある
 */
export function shouldUseStartupCache(input: StartupCacheDecisionInput): boolean {
  return (
    input.lastKnownCommitSha !== null &&
    input.staleResult?.status === 'up_to_date' &&
    !input.cache.wasDirty &&
    input.cache.metadata !== null &&
    input.cache.lastPulledPushCount !== null
  )
}
