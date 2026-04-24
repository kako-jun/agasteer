import { describe, expect, it } from 'vitest'

import type { Metadata, StaleCheckResult } from './types'
import { shouldUseStartupCache } from './startup-cache'

const metadata: Metadata = {
  version: 1,
  notes: {},
  leaves: {
    __priority__: {
      id: '__priority__',
      updatedAt: 0,
      order: 0,
      badgeIcon: 'star',
      badgeColor: '7',
    },
  },
  pushCount: 42,
}

function makeStaleResult(status: StaleCheckResult['status']): StaleCheckResult {
  if (status === 'stale') {
    return { status, localCommitSha: 'local-sha', remoteCommitSha: 'remote-sha' }
  }
  if (status === 'check_failed') {
    return { status, reason: { status: 'network_error' } }
  }
  return { status }
}

describe('shouldUseStartupCache', () => {
  it('does not skip the initial full pull when the persisted cache is dirty', () => {
    expect(
      shouldUseStartupCache({
        lastKnownCommitSha: 'same-sha',
        staleResult: makeStaleResult('up_to_date'),
        cache: {
          wasDirty: true,
          notes: [{ id: 'note-1', name: 'Note', parentId: null, order: 0 }],
          leaves: [
            {
              id: 'leaf-1',
              title: 'Leaf',
              noteId: 'note-1',
              content: 'draft',
              updatedAt: 1,
              order: 0,
            },
          ],
          metadata,
          lastPulledPushCount: 42,
        },
      })
    ).toBe(false)
  })

  it('requires persisted metadata and pushCount so priority badge and stats survive skip startup', () => {
    expect(
      shouldUseStartupCache({
        lastKnownCommitSha: 'same-sha',
        staleResult: makeStaleResult('up_to_date'),
        cache: {
          wasDirty: false,
          notes: [],
          leaves: [],
          metadata,
          lastPulledPushCount: 42,
        },
      })
    ).toBe(true)

    expect(
      shouldUseStartupCache({
        lastKnownCommitSha: 'same-sha',
        staleResult: makeStaleResult('up_to_date'),
        cache: {
          wasDirty: false,
          notes: [],
          leaves: [],
          metadata: null,
          lastPulledPushCount: 42,
        },
      })
    ).toBe(false)

    expect(
      shouldUseStartupCache({
        lastKnownCommitSha: 'same-sha',
        staleResult: makeStaleResult('up_to_date'),
        cache: {
          wasDirty: false,
          notes: [],
          leaves: [],
          metadata,
          lastPulledPushCount: null,
        },
      })
    ).toBe(false)
  })
})
