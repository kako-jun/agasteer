import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showPushToast, showStickyPushToast, clearPushToast, pushToastState } from './ui.svelte'

describe('Push トーストのタイマー制御 (#224)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearPushToast()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('showStickyPushToast はトーストをセットし2秒経っても消えない', () => {
    showStickyPushToast('toast.pushInProgress')
    expect(pushToastState.value.message).toBe('toast.pushInProgress')

    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('toast.pushInProgress')
  })

  it('sticky の後に showPushToast を呼ぶと差し替わり2秒で消える', () => {
    showStickyPushToast('A')
    showPushToast('B', 'success')
    expect(pushToastState.value.message).toBe('B')
    expect(pushToastState.value.variant).toBe('success')

    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('')
  })

  it('先行 showPushToast のタイマーが後続 showStickyPushToast を消さない', () => {
    // 最重要回帰: showPushToast が張ったタイマーが後続 sticky を消すと
    // 「送信中」表示が一瞬で消えてしまう。
    showPushToast('loading.pushing')
    showStickyPushToast('toast.pushInProgress')

    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('toast.pushInProgress')
  })

  it('clearPushToast は即座に空にする', () => {
    showStickyPushToast('A')
    clearPushToast()
    expect(pushToastState.value.message).toBe('')
    expect(pushToastState.value.variant).toBe('')
  })

  it('clearPushToast は pending な showPushToast タイマーをキャンセルする', () => {
    showPushToast('A')
    clearPushToast()

    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('')
  })
})
