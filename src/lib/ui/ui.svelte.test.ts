import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  showPushToast,
  showPushCompletionToast,
  showStickyPushToast,
  clearPushToast,
  pushToastState,
  showPullToast,
  setPushToastCountdown,
  pushToastCountdown,
  PUSH_COUNTDOWN_MIN_HOLD_MS,
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
    // clearPushToast はカウントダウン・ペーシング状態も全リセットするので、
    // 既存パターンのままこれだけでテスト間の状態リセットになる
    clearPushToast()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('showStickyPushToast 直後はカウントダウンが null（初期非表示）', () => {
    showStickyPushToast('toast.pushInProgress')
    expect(pushToastCountdown.value).toBeNull()
  })

  it('最初の値は即時表示され、以降の値も個別に MIN_HOLD 経過後なら即時反映される', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(5)
    expect(pushToastCountdown.value).toBe(5)

    // 保持満了後に届いた次の値はキューを経由してもすぐ表示される
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS)
    setPushToastCountdown(4)
    expect(pushToastCountdown.value).toBe(4)
  })

  it('5→1 を高速に流し込むと、表示は MIN_HOLD 刻みで順に進む（駆け抜け防止）', () => {
    showStickyPushToast('toast.pushInProgress')
    for (const n of [5, 4, 3, 2, 1]) {
      setPushToastCountdown(n)
    }
    // 先頭は即時表示、残りはキューで保持される
    expect(pushToastCountdown.value).toBe(5)
    for (const expected of [4, 3, 2, 1]) {
      vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS)
      expect(pushToastCountdown.value).toBe(expected)
    }
    // キューが掃けた後は最後の値のまま
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS)
    expect(pushToastCountdown.value).toBe(1)
  })

  it('3 表示中に setPushToastCountdown(5) しても 3 のまま（巻き戻り遮断・時間経過後も再表示なし）', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(3)
    setPushToastCountdown(5)
    expect(pushToastCountdown.value).toBe(3)
    // 増加値はキューにも入らない（保持満了後に湧き出さない）
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS * 2)
    expect(pushToastCountdown.value).toBe(3)
  })

  it('単調減少ガードはキュー末尾に対して効く（増加値・重複値はキューに入らない）', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(5) // 即時表示
    setPushToastCountdown(3) // キュー: [3]
    setPushToastCountdown(4) // 末尾 3 より大きい → 捨てる
    setPushToastCountdown(3) // 末尾 3 と重複 → 捨てる
    setPushToastCountdown(2) // キュー: [3, 2]

    expect(pushToastCountdown.value).toBe(5)
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS)
    expect(pushToastCountdown.value).toBe(3)
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS)
    expect(pushToastCountdown.value).toBe(2)
    // 捨てられた 4 / 重複 3 は後から現れない
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS * 3)
    expect(pushToastCountdown.value).toBe(2)
  })

  it('キュー消化中の完了 success はキューが掃けて最後の数字の保持完了後に表示される', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(2) // 即時表示・保持開始
    setPushToastCountdown(1) // キュー: [1]
    showPushCompletionToast('github.pushSuccess', 'success')

    // 遅延中: sticky とカウントダウンが出続ける
    expect(pushToastState.value.message).toBe('toast.pushInProgress')
    expect(pushToastCountdown.value).toBe(2)

    // 2 の保持満了 → 1 を表示（まだ success は出ない）
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS)
    expect(pushToastCountdown.value).toBe(1)
    expect(pushToastState.value.message).toBe('toast.pushInProgress')

    // 1 の保持満了 → drain 完了 → success 表示・カウントダウン null 化
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS)
    expect(pushToastState.value.message).toBe('github.pushSuccess')
    expect(pushToastState.value.variant).toBe('success')
    expect(pushToastCountdown.value).toBeNull()

    // 遅延表示された success も通常どおり2秒で自動消滅する
    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('')
  })

  it('カウントダウン消化済み（保持満了・キュー空）の完了 success は遅延せず即時表示される', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(1)
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS)

    showPushCompletionToast('github.pushSuccess', 'success')
    expect(pushToastState.value.message).toBe('github.pushSuccess')
    expect(pushToastCountdown.value).toBeNull()
  })

  it('完了 error はキュー消化中でも即時表示され、キューを破棄する', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(3) // 即時表示・保持開始
    setPushToastCountdown(2) // キュー: [2]
    showPushCompletionToast('toast.pushTimeout', 'error')

    expect(pushToastState.value.message).toBe('toast.pushTimeout')
    expect(pushToastState.value.variant).toBe('error')
    expect(pushToastCountdown.value).toBeNull()

    // 破棄されたキュー・タイマーが後から数字を湧き出させない
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS * 3)
    expect(pushToastCountdown.value).toBeNull()
    expect(pushToastState.value.message).toBe('toast.pushTimeout')
  })

  it('新しい sticky（新Push）でキュー・遅延中の完了 success がリセットされ、再カウントできる', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(2) // 即時表示・保持開始
    setPushToastCountdown(1) // キュー: [1]
    showPushCompletionToast('old push success', 'success') // 遅延中の完了トースト

    // 新しい Push の開始（トースト再表示）で全リセット
    showStickyPushToast('toast.pushInProgress')
    expect(pushToastCountdown.value).toBeNull()

    // 旧キューの 1 も遅延中の success も後から現れない
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS * 3)
    expect(pushToastCountdown.value).toBeNull()
    expect(pushToastState.value.message).toBe('toast.pushInProgress')

    // リセット後は 5 から採用される（単調減少ガードが持ち越されない）
    setPushToastCountdown(5)
    expect(pushToastCountdown.value).toBe(5)
  })

  it('clearPushToast でカウントダウン・キュー・遅延中の完了 success が全リセットされる', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(3)
    setPushToastCountdown(2)
    showPushCompletionToast('pending success', 'success')
    clearPushToast()

    expect(pushToastCountdown.value).toBeNull()
    expect(pushToastState.value.message).toBe('')

    // 旧キュー・遅延 success が後から湧き出さない
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS * 3)
    expect(pushToastCountdown.value).toBeNull()
    expect(pushToastState.value.message).toBe('')
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

describe('汎用 showPushToast とペーシングの分離 (#238)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearPushToast()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drain 中の無関係 success は遅延せず即時表示され、カウントダウンは消えて後から湧かない', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(3) // 即時表示・保持開始
    setPushToastCountdown(2) // キュー: [2]

    // crud 等の無関係トーストが割り込む
    showPushToast('toast.deleted', 'success')
    expect(pushToastState.value.message).toBe('toast.deleted')
    expect(pushToastState.value.variant).toBe('success')
    expect(pushToastCountdown.value).toBeNull()

    // 破棄されたキュー・保持タイマーが無関係トーストの下に数字を湧き出させない
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS * 3)
    expect(pushToastCountdown.value).toBeNull()
  })

  it('drain 中の無関係 success は遅延中の完了トーストを破棄せず、2秒消滅後にそれを表示する', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(2) // 即時表示・保持開始
    setPushToastCountdown(1) // キュー: [1]
    showPushCompletionToast('github.pushSuccess', 'success') // 遅延（pending）

    // 無関係トーストが割り込んでも pending は消えない
    showPushToast('toast.deleted', 'success')
    expect(pushToastState.value.message).toBe('toast.deleted')

    // 無関係トーストの2秒消滅時、空にする代わりに pending の完了トーストを表示する
    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('github.pushSuccess')
    expect(pushToastState.value.variant).toBe('success')

    // 完了トーストも通常どおり2秒で自動消滅する
    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('')
  })

  it("drain 中の '' variant の汎用トーストでも pending の完了トーストが生き残って最終表示される", () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(2)
    setPushToastCountdown(1)
    showPushCompletionToast('github.pushSuccess', 'success') // 遅延（pending）

    showPushToast('pwa.exitWarning', '')
    expect(pushToastState.value.message).toBe('pwa.exitWarning')
    expect(pushToastCountdown.value).toBeNull()

    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('github.pushSuccess')
    expect(pushToastState.value.variant).toBe('success')
  })

  it('完了トースト2件が遅延窓に重なった場合は後勝ち（最新の Push 結果だけが表示される）', () => {
    showStickyPushToast('toast.pushInProgress')
    setPushToastCountdown(2) // 即時表示・保持開始
    setPushToastCountdown(1) // キュー: [1]
    showPushCompletionToast('first completion', 'success')
    showPushCompletionToast('second completion', 'success')

    // drain 完了で最新の1件だけが表示される
    vi.advanceTimersByTime(PUSH_COUNTDOWN_MIN_HOLD_MS * 2)
    expect(pushToastState.value.message).toBe('second completion')
    expect(pushToastState.value.variant).toBe('success')

    // first は以後も現れない
    vi.advanceTimersByTime(2000)
    expect(pushToastState.value.message).toBe('')
  })
})
