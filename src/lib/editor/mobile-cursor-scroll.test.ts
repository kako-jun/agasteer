import { describe, expect, it } from 'vitest'

import {
  MOBILE_POINTER_SCROLL_WINDOW_MS,
  getCursorVisibilityScrollDelta,
  getMobilePointerScrollUntil,
  isMobilePointerScrollActive,
  shouldSuppressMobileScrollIntoView,
} from './mobile-cursor-scroll'

describe('mobile cursor scroll helpers', () => {
  it('keeps a short touch-origin scroll window', () => {
    const now = 1000
    const until = getMobilePointerScrollUntil(now)

    expect(until).toBe(now + MOBILE_POINTER_SCROLL_WINDOW_MS)
    expect(isMobilePointerScrollActive(until, now + 1)).toBe(true)
    expect(isMobilePointerScrollActive(until, until)).toBe(false)
  })

  it('suppresses scrollIntoView only for active mobile touch windows', () => {
    const pointerScrollUntil = 2200

    expect(
      shouldSuppressMobileScrollIntoView({
        isMobile: true,
        scrollIntoView: true,
        pointerScrollUntil,
        now: 2000,
      })
    ).toBe(true)
    expect(
      shouldSuppressMobileScrollIntoView({
        isMobile: false,
        scrollIntoView: true,
        pointerScrollUntil,
        now: 2000,
      })
    ).toBe(false)
    expect(
      shouldSuppressMobileScrollIntoView({
        isMobile: true,
        scrollIntoView: false,
        pointerScrollUntil,
        now: 2000,
      })
    ).toBe(false)
    expect(
      shouldSuppressMobileScrollIntoView({
        isMobile: true,
        scrollIntoView: true,
        pointerScrollUntil,
        now: pointerScrollUntil,
      })
    ).toBe(false)
  })

  it('calculates cursor visibility scroll deltas', () => {
    const viewport = { top: 0, bottom: 500 }
    const margins = { top: 16, bottom: 32 }

    expect(getCursorVisibilityScrollDelta({ top: 8, bottom: 24 }, viewport, margins)).toBe(-8)
    expect(getCursorVisibilityScrollDelta({ top: 450, bottom: 490 }, viewport, margins)).toBe(22)
    expect(getCursorVisibilityScrollDelta({ top: 100, bottom: 120 }, viewport, margins)).toBe(0)
  })
})
