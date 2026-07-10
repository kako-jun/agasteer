/**
 * メディア挿入フェーズの in-flight 追跡（#254）のテスト
 *
 * beginMediaInsertPhase / waitForPendingMediaInserts の待ち合わせ規約
 * （スナップショット待ち・冪等な終了・上限タイムアウト）を固定する。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginMediaInsertPhase, waitForPendingMediaInserts } from './insert-phase'
import { MEDIA_INSERT_WAIT_TIMEOUT_MS, MEDIA_INSERT_PHASE_STALE_MS } from '../../sync/constants'

/** マイクロタスク＋直近のマクロタスクを流しきる（未解決の観測用） */
function flushTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** promise が解決済みかを副作用フラグで観測する */
function observeSettled(promise: Promise<unknown>): { get settled(): boolean } {
  let settled = false
  promise.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  return {
    get settled() {
      return settled
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('waitForPendingMediaInserts', () => {
  it('進行中フェーズがなければ即解決する', async () => {
    await expect(waitForPendingMediaInserts()).resolves.toBeUndefined()
  })

  it('開いているフェーズが終わるまで解決しない', async () => {
    const end = beginMediaInsertPhase()
    const wait = observeSettled(waitForPendingMediaInserts())
    await flushTasks()
    expect(wait.settled).toBe(false)

    end()
    await flushTasks()
    expect(wait.settled).toBe(true)
  })

  it('複数フェーズはすべて終わるまで解決しない', async () => {
    const endA = beginMediaInsertPhase()
    const endB = beginMediaInsertPhase()
    const wait = observeSettled(waitForPendingMediaInserts())

    endA()
    await flushTasks()
    expect(wait.settled).toBe(false)

    endB()
    await flushTasks()
    expect(wait.settled).toBe(true)
  })

  it('待機開始後に始まったフェーズは対象外（スナップショット待ち＝livelock なし）', async () => {
    const endA = beginMediaInsertPhase()
    const wait = observeSettled(waitForPendingMediaInserts())
    const endB = beginMediaInsertPhase()

    endA()
    await flushTasks()
    expect(wait.settled).toBe(true)

    endB()
  })

  it('終了関数は冪等（二重呼び出しで壊れず、以後の待ちは即解決）', async () => {
    const end = beginMediaInsertPhase()
    end()
    end()
    await expect(waitForPendingMediaInserts()).resolves.toBeUndefined()
  })

  it('上限超過時は warn を出して解決する（Push を永久に塞がない）', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const end = beginMediaInsertPhase()
    try {
      const wait = observeSettled(waitForPendingMediaInserts(50))
      await vi.advanceTimersByTimeAsync(49)
      expect(wait.settled).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      expect(wait.settled).toBe(true)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    } finally {
      // 後続テストに開きっぱなしのフェーズを残さない
      end()
    }
  })

  it('フェーズが上限内に終われば warn は出ない', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const end = beginMediaInsertPhase()
    const wait = waitForPendingMediaInserts()
    end()
    await wait
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('恒久ストール隔離: STALE 閾値を超えたフェーズはタイムアウト時に追跡から外れ、以後の待ちは即解決する', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const end = beginMediaInsertPhase()
    try {
      // フェーズ開始から STALE 閾値を超えるまで時計を進める（settle しないフェーズを再現）
      await vi.advanceTimersByTimeAsync(MEDIA_INSERT_PHASE_STALE_MS)

      // 1 回目の待ち: タイムアウトまで待たされるが、ストール隔離が発動する
      const first = observeSettled(waitForPendingMediaInserts())
      await vi.advanceTimersByTimeAsync(MEDIA_INSERT_WAIT_TIMEOUT_MS)
      expect(first.settled).toBe(true)

      // 2 回目以降の待ちは隔離済みなので即解決（毎回 10 秒待たされ続けない）
      const second = observeSettled(waitForPendingMediaInserts())
      await vi.advanceTimersByTimeAsync(0)
      expect(second.settled).toBe(true)
    } finally {
      end()
    }
  })

  it('正当に遅いだけのフェーズ（STALE 閾値未満）はタイムアウトしても追跡に残り、保護が継続する', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const end = beginMediaInsertPhase()
    try {
      // 1 回目の待ちがタイムアウト（フェーズ経過は 10 秒 < STALE 60 秒 → 隔離されない）
      const first = observeSettled(waitForPendingMediaInserts())
      await vi.advanceTimersByTimeAsync(MEDIA_INSERT_WAIT_TIMEOUT_MS)
      expect(first.settled).toBe(true)

      // 2 回目の待ちはまだフェーズを待つ（即解決しない）＝遅いバッチへの保護が続く
      const second = observeSettled(waitForPendingMediaInserts())
      await vi.advanceTimersByTimeAsync(1_000)
      expect(second.settled).toBe(false)

      // フェーズが終われば解決する
      end()
      await vi.advanceTimersByTimeAsync(0)
      expect(second.settled).toBe(true)
    } finally {
      end()
    }
  })
})
