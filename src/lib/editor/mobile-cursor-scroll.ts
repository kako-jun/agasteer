export const MOBILE_POINTER_SCROLL_WINDOW_MS = 1200
export const MOBILE_CURSOR_SCROLL_DELAYS = [0, 250, 600] as const

interface CursorRect {
  top: number
  bottom: number
}

interface ViewportBounds {
  top: number
  bottom: number
}

interface CursorScrollMargins {
  top: number
  bottom: number
}

export function getMobilePointerScrollUntil(now = Date.now()): number {
  return now + MOBILE_POINTER_SCROLL_WINDOW_MS
}

export function isMobilePointerScrollActive(until: number, now = Date.now()): boolean {
  return now < until
}

export function shouldSuppressMobileScrollIntoView(options: {
  isMobile: boolean
  scrollIntoView: boolean
  pointerScrollUntil: number
  now?: number
}): boolean {
  return (
    options.isMobile &&
    options.scrollIntoView &&
    isMobilePointerScrollActive(options.pointerScrollUntil, options.now)
  )
}

export function getCursorVisibilityScrollDelta(
  coords: CursorRect,
  viewport: ViewportBounds,
  margins: CursorScrollMargins
): number {
  if (coords.top < viewport.top + margins.top) {
    return -(viewport.top + margins.top - coords.top)
  }
  if (coords.bottom > viewport.bottom - margins.bottom) {
    return coords.bottom - (viewport.bottom - margins.bottom)
  }
  return 0
}
