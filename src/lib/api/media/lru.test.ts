import { describe, expect, it } from 'vitest'

import {
  shouldCacheMediaSize,
  selectCacheEvictions,
  MEDIA_CACHE_MAX_ENTRY_BYTES,
  type MediaCacheMeta,
} from './lru'

function entry(url: string, size: number, lastAccessedAt: number): MediaCacheMeta {
  return { url, size, lastAccessedAt }
}

describe('shouldCacheMediaSize', () => {
  it('accepts a file exactly at the 20MB per-entry limit', () => {
    expect(shouldCacheMediaSize(MEDIA_CACHE_MAX_ENTRY_BYTES)).toBe(true)
  })

  it('rejects a file over the 20MB per-entry limit', () => {
    expect(shouldCacheMediaSize(MEDIA_CACHE_MAX_ENTRY_BYTES + 1)).toBe(false)
  })
})

describe('selectCacheEvictions', () => {
  it('returns no evictions while the total stays under the limit', () => {
    const entries = [entry('a', 30, 1), entry('b', 30, 2)]
    expect(selectCacheEvictions(entries, 40, 100)).toEqual([])
  })

  it('returns no evictions when the total is exactly at the limit', () => {
    const entries = [entry('a', 30, 1), entry('b', 30, 2)]
    expect(selectCacheEvictions(entries, 40, 100)).toEqual([])
  })

  it('evicts the least recently accessed entry first', () => {
    const entries = [entry('newer', 50, 200), entry('older', 50, 100)]
    expect(selectCacheEvictions(entries, 30, 100)).toEqual(['older'])
  })

  it('evicts multiple entries until the incoming size fits', () => {
    const entries = [entry('a', 40, 1), entry('b', 40, 2), entry('c', 40, 3)]
    // 合計120、上限100、incoming 50 → 70以下になるまで古い順に追い出す
    expect(selectCacheEvictions(entries, 50, 100)).toEqual(['a', 'b'])
  })

  it('handles an empty cache', () => {
    expect(selectCacheEvictions([], 50, 100)).toEqual([])
  })

  it('does not mutate the input array order', () => {
    const entries = [entry('b', 60, 2), entry('a', 60, 1)]
    selectCacheEvictions(entries, 50, 100)
    expect(entries.map((e) => e.url)).toEqual(['b', 'a'])
  })
})
