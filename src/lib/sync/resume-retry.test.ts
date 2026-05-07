import { describe, expect, it, vi } from 'vitest'

import { runResumeStaleCheckRetry } from './resume-retry'
import type { ApplyStaleResultOutcome } from '../stores/stale-checker.svelte'

const noopSleep = () => Promise.resolve()

describe('runResumeStaleCheckRetry', () => {
  it('returns immediately if first retry succeeds (up-to-date)', async () => {
    const runStaleCheck = vi
      .fn<(i: number) => Promise<ApplyStaleResultOutcome>>()
      .mockResolvedValueOnce('up-to-date')

    const outcome = await runResumeStaleCheckRetry({
      backoffsMs: [2000, 5000],
      runStaleCheck,
      isVisible: () => true,
      sleep: noopSleep,
    })

    expect(outcome).toBe('up-to-date')
    expect(runStaleCheck).toHaveBeenCalledTimes(1)
  })

  it('retries up to backoff array length when check-failed continues', async () => {
    const runStaleCheck = vi
      .fn<(i: number) => Promise<ApplyStaleResultOutcome>>()
      .mockResolvedValue('check-failed')

    const outcome = await runResumeStaleCheckRetry({
      backoffsMs: [2000, 5000],
      runStaleCheck,
      isVisible: () => true,
      sleep: noopSleep,
    })

    expect(outcome).toBe('check-failed')
    expect(runStaleCheck).toHaveBeenCalledTimes(2)
  })

  it('returns early as soon as a non-failed outcome is observed', async () => {
    const runStaleCheck = vi
      .fn<(i: number) => Promise<ApplyStaleResultOutcome>>()
      .mockResolvedValueOnce('check-failed')
      .mockResolvedValueOnce('stale-auto-pull')

    const outcome = await runResumeStaleCheckRetry({
      backoffsMs: [2000, 5000],
      runStaleCheck,
      isVisible: () => true,
      sleep: noopSleep,
    })

    expect(outcome).toBe('stale-auto-pull')
    expect(runStaleCheck).toHaveBeenCalledTimes(2)
  })

  it('does not call runStaleCheck if tab is hidden when first attempt is due', async () => {
    const runStaleCheck = vi.fn<(i: number) => Promise<ApplyStaleResultOutcome>>()

    const outcome = await runResumeStaleCheckRetry({
      backoffsMs: [2000, 5000],
      runStaleCheck,
      isVisible: () => false,
      sleep: noopSleep,
    })

    expect(outcome).toBe('check-failed')
    expect(runStaleCheck).not.toHaveBeenCalled()
  })

  it('aborts mid-retry when visibility flips to hidden', async () => {
    let visible = true
    const isVisible = () => visible

    // First attempt runs (visible at that point) but flips visibility to hidden
    // before the next backoff window. The helper must skip the second call.
    const runStaleCheck = vi
      .fn<(i: number) => Promise<ApplyStaleResultOutcome>>()
      .mockImplementationOnce(async () => {
        visible = false
        return 'check-failed'
      })

    const outcome = await runResumeStaleCheckRetry({
      backoffsMs: [2000, 5000],
      runStaleCheck,
      isVisible,
      sleep: noopSleep,
    })

    expect(outcome).toBe('check-failed')
    expect(runStaleCheck).toHaveBeenCalledTimes(1)
  })

  it('waits the configured backoff before each attempt', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    const runStaleCheck = vi
      .fn<(i: number) => Promise<ApplyStaleResultOutcome>>()
      .mockResolvedValue('check-failed')

    await runResumeStaleCheckRetry({
      backoffsMs: [2000, 5000],
      runStaleCheck,
      isVisible: () => true,
      sleep,
    })

    expect(sleep).toHaveBeenNthCalledWith(1, 2000)
    expect(sleep).toHaveBeenNthCalledWith(2, 5000)
  })

  it('handles an empty backoff array as a no-op', async () => {
    const runStaleCheck = vi.fn<(i: number) => Promise<ApplyStaleResultOutcome>>()

    const outcome = await runResumeStaleCheckRetry({
      backoffsMs: [],
      runStaleCheck,
      isVisible: () => true,
      sleep: noopSleep,
    })

    expect(outcome).toBe('check-failed')
    expect(runStaleCheck).not.toHaveBeenCalled()
  })
})
