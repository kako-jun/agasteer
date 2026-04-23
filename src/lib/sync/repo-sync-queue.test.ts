import { describe, expect, it } from 'vitest'

import {
  canRunPendingRepoSync,
  isRepoSyncBusy,
  runPendingRepoSyncIfIdle,
  shouldQueueRepoSync,
} from './repo-sync-queue'

describe('repo sync queue', () => {
  it('treats pull, push, and archive loading as busy states', () => {
    expect(isRepoSyncBusy({ isPulling: true, isPushing: false, isArchiveLoading: false })).toBe(
      true
    )
    expect(isRepoSyncBusy({ isPulling: false, isPushing: true, isArchiveLoading: false })).toBe(
      true
    )
    expect(isRepoSyncBusy({ isPulling: false, isPushing: false, isArchiveLoading: true })).toBe(
      true
    )
    expect(isRepoSyncBusy({ isPulling: false, isPushing: false, isArchiveLoading: false })).toBe(
      false
    )
  })

  it('queues repo sync only when config is valid and another sync is in flight', () => {
    expect(
      shouldQueueRepoSync({ isPulling: true, isPushing: false, isArchiveLoading: false }, true)
    ).toBe(true)
    expect(
      shouldQueueRepoSync({ isPulling: false, isPushing: false, isArchiveLoading: false }, true)
    ).toBe(false)
    expect(
      shouldQueueRepoSync({ isPulling: true, isPushing: false, isArchiveLoading: false }, false)
    ).toBe(false)
  })

  it('runs pending repo sync only after all sync activity is idle', () => {
    expect(
      canRunPendingRepoSync(
        { isPulling: false, isPushing: false, isArchiveLoading: false },
        true,
        true
      )
    ).toBe(true)
    expect(
      canRunPendingRepoSync(
        { isPulling: false, isPushing: true, isArchiveLoading: false },
        true,
        true
      )
    ).toBe(false)
    expect(
      canRunPendingRepoSync(
        { isPulling: false, isPushing: false, isArchiveLoading: false },
        false,
        true
      )
    ).toBe(false)
    expect(
      canRunPendingRepoSync(
        { isPulling: false, isPushing: false, isArchiveLoading: false },
        true,
        false
      )
    ).toBe(false)
  })

  it('clears pending and triggers pull exactly once when idle', async () => {
    let cleared = 0
    let pulled = 0

    const executed = await runPendingRepoSyncIfIdle(
      { isPulling: false, isPushing: false, isArchiveLoading: false },
      true,
      true,
      () => {
        cleared += 1
      },
      async () => {
        pulled += 1
      }
    )

    expect(executed).toBe(true)
    expect(cleared).toBe(1)
    expect(pulled).toBe(1)
  })
})
