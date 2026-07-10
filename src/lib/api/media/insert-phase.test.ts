/**
 * メディア挿入フェーズの in-flight 追跡（#254）のテスト
 *
 * beginMediaInsertPhase / waitForPendingMediaInserts の待ち合わせ規約
 * （スナップショット待ち・冪等な終了・上限タイムアウト）を固定する。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginMediaInsertPhase, waitForPendingMediaInserts } from './insert-phase'

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
})
