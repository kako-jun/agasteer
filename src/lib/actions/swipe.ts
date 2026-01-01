/**
 * スワイプナビゲーション用のSvelte action
 * モバイルデバイスでの左右スワイプを検出してコールバックを呼び出す
 */

export interface SwipeOptions {
  /** スワイプと認識する最小距離（px） */
  threshold?: number
  /** スワイプと認識する最大時間（ms） */
  maxTime?: number
  /** 左スワイプ時のコールバック */
  onSwipeLeft?: () => void
  /** 右スワイプ時のコールバック */
  onSwipeRight?: () => void
  /** スワイプを無効にする条件 */
  disabled?: boolean
}

interface TouchState {
  startX: number
  startY: number
  startTime: number
}

/**
 * スワイプ検出用のSvelte action
 * 使用例:
 * <div use:swipe={{ onSwipeLeft: handlePrev, onSwipeRight: handleNext }}>
 */
export function swipe(node: HTMLElement, options: SwipeOptions = {}) {
  const threshold = options.threshold ?? 50
  const maxTime = options.maxTime ?? 500
  let touchState: TouchState | null = null
  let currentOptions = options

  function handleTouchStart(e: TouchEvent) {
    if (currentOptions.disabled) return

    // マルチタッチは無視
    if (e.touches.length !== 1) return

    const touch = e.touches[0]
    touchState = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
    }
  }

  function handleTouchMove(e: TouchEvent) {
    // スクロール可能な要素内ではスワイプを無効化（縦スクロールを優先）
    if (!touchState) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - touchState.startX
    const deltaY = touch.clientY - touchState.startY

    // 縦方向の移動が大きい場合はスワイプをキャンセル（スクロールを優先）
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      touchState = null
      return
    }

    // 横方向のスワイプが検出された場合、スクロールを防止
    if (Math.abs(deltaX) > 10) {
      e.preventDefault()
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (currentOptions.disabled) return
    if (!touchState) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchState.startX
    const deltaY = touch.clientY - touchState.startY
    const elapsed = Date.now() - touchState.startTime

    // スワイプの条件をチェック
    // 1. 閾値以上の横移動
    // 2. 縦移動より横移動が大きい
    // 3. 時間内に完了
    if (
      Math.abs(deltaX) >= threshold &&
      Math.abs(deltaX) > Math.abs(deltaY) &&
      elapsed <= maxTime
    ) {
      if (deltaX > 0) {
        // 右スワイプ（前のノートへ）
        currentOptions.onSwipeRight?.()
      } else {
        // 左スワイプ（次のノートへ）
        currentOptions.onSwipeLeft?.()
      }
    }

    touchState = null
  }

  function handleTouchCancel() {
    touchState = null
  }

  // イベントリスナーを追加
  node.addEventListener('touchstart', handleTouchStart, { passive: true })
  node.addEventListener('touchmove', handleTouchMove, { passive: false })
  node.addEventListener('touchend', handleTouchEnd, { passive: true })
  node.addEventListener('touchcancel', handleTouchCancel, { passive: true })

  return {
    update(newOptions: SwipeOptions) {
      currentOptions = newOptions
    },
    destroy() {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
      node.removeEventListener('touchend', handleTouchEnd)
      node.removeEventListener('touchcancel', handleTouchCancel)
    },
  }
}
