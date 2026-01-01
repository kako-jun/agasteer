/**
 * Stale定期チェッカー
 *
 * リモートに新しい変更があるかを定期的にチェックし、
 * stale状態を検出したらisStaleストアをtrueにする。
 *
 * - 前回のチェックから5分経過後にチェック
 * - アクティブタブ（visible）のときのみ
 * - Pull/Push中はスキップ
 * - サイレント実行（UIブロックなし、通知なし）
 */

import { get, writable } from 'svelte/store'
import type { Settings } from '../types'
import type { StaleCheckResult } from '../api/sync'
import {
  settings,
  isPulling,
  isPushing,
  isStale,
  lastStaleCheckTime,
  lastPulledPushCount,
  githubConfigured,
} from './stores'
import { checkStaleStatus as checkStaleStatusRaw } from '../api/sync'

/**
 * staleチェックを実行し、時刻を更新する共通関数
 * 全ての呼び元（定期チェック、Pull/Push前）でこの関数を使用する
 */
export async function executeStaleCheck(
  settingsValue: Settings,
  lastPulledCount: number
): Promise<StaleCheckResult> {
  const result = await checkStaleStatusRaw(settingsValue, lastPulledCount)
  // チェック時刻を更新（成功・失敗に関わらず）
  lastStaleCheckTime.set(Date.now())
  return result
}

/** チェック間隔（ミリ秒） */
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5分

/** 最小経過時間（ミリ秒） - 前回チェックからこの時間が経過するまではチェックしない */
const MIN_ELAPSED_MS = CHECK_INTERVAL_MS

/**
 * staleチェック進捗（0〜1）
 * 前回チェックからの経過時間を表示
 * 0 = チェック直後、1 = 次のチェック直前
 */
export const staleCheckProgress = writable<number>(0)

let intervalId: ReturnType<typeof setInterval> | null = null
let progressIntervalId: ReturnType<typeof setInterval> | null = null

/**
 * 定期チェックを実行
 * - 条件を満たさない場合は何もしない
 * - stale検出時はisStaleをtrueにするだけ
 */
async function checkIfNeeded(): Promise<void> {
  // タブが非アクティブならスキップ
  if (document.visibilityState !== 'visible') {
    return
  }

  // GitHub未設定ならスキップ
  if (!get(githubConfigured)) {
    return
  }

  // Pull/Push中ならスキップ
  if (get(isPulling) || get(isPushing)) {
    return
  }

  // 前回のチェックから5分経過していなければスキップ
  const lastCheck = get(lastStaleCheckTime)
  if (lastCheck === 0) {
    // まだ一度もチェックしていない（初回Pull前）
    return
  }

  const elapsed = Date.now() - lastCheck
  if (elapsed < MIN_ELAPSED_MS) {
    return
  }

  // サイレントにstaleチェック（共通関数を使用）
  try {
    const result = await executeStaleCheck(get(settings), get(lastPulledPushCount))
    if (result.status === 'stale') {
      isStale.set(true)
    }
    // up_to_date や check_failed の場合は何もしない（エラー通知もしない）
  } catch {
    // ネットワークエラー等は無視（executeStaleCheck内で時刻は更新済み）
  }
}

/**
 * 進捗バーを更新
 */
function updateProgress(): void {
  const lastCheck = get(lastStaleCheckTime)
  if (lastCheck === 0 || !get(githubConfigured)) {
    staleCheckProgress.set(0)
    return
  }

  const elapsed = Date.now() - lastCheck
  const progress = Math.min(elapsed / CHECK_INTERVAL_MS, 1)
  staleCheckProgress.set(progress)
}

/**
 * 定期チェッカーを開始
 */
export function startStaleChecker(): void {
  if (intervalId !== null) {
    return // 既に開始済み
  }

  // チェック用タイマー
  intervalId = setInterval(checkIfNeeded, CHECK_INTERVAL_MS)

  // 進捗更新タイマー（1秒ごと）
  progressIntervalId = setInterval(updateProgress, 1000)
}

/**
 * 定期チェッカーを停止
 */
export function stopStaleChecker(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (progressIntervalId !== null) {
    clearInterval(progressIntervalId)
    progressIntervalId = null
  }
  staleCheckProgress.set(0)
}
