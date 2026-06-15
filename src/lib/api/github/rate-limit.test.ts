import { describe, expect, it, vi, afterEach } from 'vitest'

import { parseRateLimitResponse } from './rate-limit'

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('parseRateLimitResponse', () => {
  it('returns not-rate-limited for a 200 response', () => {
    expect(parseRateLimitResponse(makeResponse(200))).toEqual({ isRateLimited: false })
  })

  it('treats 403 with remaining > 0 as a permission error, not rate limiting', () => {
    const res = makeResponse(403, { 'X-RateLimit-Remaining': '50' })
    expect(parseRateLimitResponse(res)).toEqual({ isRateLimited: false })
  })

  it('treats 403 with remaining 0 as rate limited and computes reset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const resetEpochSeconds = Math.floor(Date.UTC(2026, 0, 1, 0, 1, 0) / 1000) // +60s
    const res = makeResponse(403, {
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(resetEpochSeconds),
    })
    const info = parseRateLimitResponse(res)
    expect(info.isRateLimited).toBe(true)
    expect(info.remainingSeconds).toBe(60)
    expect(info.resetTime?.getTime()).toBe(resetEpochSeconds * 1000)
  })

  it('treats 429 as rate limited even when remaining header is absent', () => {
    const info = parseRateLimitResponse(makeResponse(429))
    expect(info.isRateLimited).toBe(true)
    // no reset header -> defaults to 60s secondary-limit fallback
    expect(info.remainingSeconds).toBe(60)
    expect(info.resetTime).toBeUndefined()
  })

  it('clamps remainingSeconds to 0 when the reset time is in the past', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'))
    const pastReset = Math.floor(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000) // 60s ago
    const res = makeResponse(429, {
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(pastReset),
    })
    const info = parseRateLimitResponse(res)
    expect(info.isRateLimited).toBe(true)
    expect(info.remainingSeconds).toBe(0)
  })
})
