import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  showPushToast,
  showStickyPushToast,
  clearPushToast,
  pushToastState,
  showPullToast,
  setPushToastCountdown,
  pushToastCountdown,
} from './ui.svelte'

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

  it('clearPushToast 後は古い showPushToast タイマーが発火しても空のまま', () => {
    // 後勝ち方式: 古いタイマーは「自分が出したトーストがまだ出ているか」を見て、
    // 差し替わっていれば何もしない。clear 後に再表示されない。
    showPushToast('A')
    clearPushToast()

    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('')
  })
})

describe('Push トーストのカウントダウン (#238)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // clearPushToast はカウントダウンも null 化するので、既存パターンのまま
    // これだけでテスト間の状態リセットになる
    clearPushToast()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('showStickyPushToast 直後はカウントダウンが null（初期非表示）', () => {
    showStickyPushToast('toast.pushInProgress')
    expect(pushToastCountdown.value).toBeNull()
  })

  it('sticky 表示後に 5→4→3→2→1 と set すると各値が順に反映される', () => {
    showStickyPushToast('toast.pushInProgress')
    for (const n of [5, 4, 3, 2, 1]) {
      setPushToastCountdown(n)
      expect(pushToastCountdown.value).toBe(n)
    }
  })

  it('3 表示中に setPushToastCountdown(5) しても 3 のまま（巻き戻り遮断）', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(3)
    setPushToastCountdown(5)
    expect(pushToastCountdown.value).toBe(3)
  })

  it('showStickyPushToast の再呼び出しでリセットされ、新しい Push で再カウントできる', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(2)
    expect(pushToastCountdown.value).toBe(2)

    // 新しい Push の開始（トースト再表示）でリセット
    showStickyPushToast('toast.pushInProgress')
    expect(pushToastCountdown.value).toBeNull()
    // リセット後は 5 から採用される（単調減少ガードが持ち越されない）
    setPushToastCountdown(5)
    expect(pushToastCountdown.value).toBe(5)
  })

  it('showPushToast（完了トースト）でカウントダウンが null 化される', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(3)
    showPushToast('done', 'success')
    expect(pushToastCountdown.value).toBeNull()
  })

  it('clearPushToast でカウントダウンが null 化される', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(3)
    clearPushToast()
    expect(pushToastCountdown.value).toBeNull()
  })

  it('showPullToast は push のカウントダウンを変化させない（別スロット）', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(4)
    showPullToast('github.pullSuccess', 'success')
    expect(pushToastCountdown.value).toBe(4)
  })

  it('先行 showPushToast の2秒タイマーが後続 sticky のカウントダウンを消さない（後勝ちの countdown 版）', () => {
    // showPushToast のタイマーは「自分のトーストがまだ表示中か」を見て消すので、
    // 後続 sticky + カウントダウン表示中に発火しても値を消さない
    showPushToast('loading.pushing')
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(4)

    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('toast.pushInProgress')
    expect(pushToastCountdown.value).toBe(4)
  })
})
