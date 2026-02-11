/**
 * Stale定期チェッカー
 *
 * リモートに新しい変更があるかを定期的にチェックし、
 * stale状態を検出したら:
 * - ローカルがクリーン（isDirty === false）→ 自動Pull実行
 * - ローカルがダーティ（isDirty === true）→ isStaleをtrueにする
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
  isDirty,
  lastStaleCheckTime,
  lastKnownCommitSha,
  githubConfigured,
} from './stores'
import { checkStaleStatus as checkStaleStatusRaw } from '../api/sync'

/**
 * staleチェックを実行し、時刻を更新する共通関数
 * 全ての呼び元（定期チェック、Pull/Push前）でこの関数を使用する
 */
export async function executeStaleCheck(
  settingsValue: Settings,
  lastCommitSha: string | null
): Promise<StaleCheckResult> {
  try {
    const result = await checkStaleStatusRaw(settingsValue, lastCommitSha)
    return result
  } finally {
    // チェック時刻を更新（成功・失敗・エラーに関わらず必ず実行）
    lastStaleCheckTime.set(Date.now())
  }
}

/** チェック間隔（ミリ秒） */
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5分

/**
 * staleチェック進捗（0〜1）
 * 前回チェックからの経過時間を表示
 * 0 = チェック直後、1 = 次のチェック直前
 */
export const staleCheckProgress = writable<number>(0)

/**
 * 自動Pullトリガー用ストア
 * stale検出かつローカルがクリーンなときにtrueになる
 * App.svelteで購読してPull処理を実行
 */
export const shouldAutoPull = writable<boolean>(false)

let progressIntervalId: ReturnType<typeof setInterval> | null = null
let isChecking = false

/**
 * 定期チェックを実行
 * - stale検出時:
 *   - ローカルがクリーン → shouldAutoPull.set(true)（自動Pull）
 *   - ローカルがダーティ → isStale.set(true)（赤バッジ表示）
 */
async function checkIfNeeded(): Promise<void> {
  // サイレントにstaleチェック（共通関数を使用）
  try {
    const result = await executeStaleCheck(get(settings), get(lastKnownCommitSha))
    if (result.status === 'stale') {
      // ローカルがダーティかどうかで分岐
      if (get(isDirty)) {
        // ダーティ → 従来通り赤バッジ表示
        isStale.set(true)
      } else {
        // クリーン → 自動Pullをトリガー
        shouldAutoPull.set(true)
      }
    }
    // up_to_date や check_failed の場合は何もしない（エラー通知もしない）
  } catch {
    // ネットワークエラー等は無視（executeStaleCheck内で時刻は更新済み）
  }
}

/**
 * チェック実行の条件を満たしているか
 */
function canPerformCheck(): boolean {
  // GitHub未設定
  if (!get(githubConfigured)) {
    return false
  }

  // タブが非アクティブ
  if (document.visibilityState !== 'visible') {
    return false
  }

  // Pull/Push中
  if (get(isPulling) || get(isPushing)) {
    return false
  }

  // まだ一度もチェックしていない（初回Pull前）
  if (get(lastStaleCheckTime) === 0) {
    return false
  }

  return true
}

/**
 * 進捗バーを更新し、必要ならチェックを実行
 */
async function updateProgressAndCheck(): Promise<void> {
  // 条件が整っていなければバーを表示しない
  if (!canPerformCheck()) {
    staleCheckProgress.set(0)
    return
  }

  // チェック中は進捗更新をスキップ（再チェック防止）
  if (isChecking) {
    return
  }

  const lastCheck = get(lastStaleCheckTime)
  const elapsed = Date.now() - lastCheck
  const progress = Math.min(elapsed / CHECK_INTERVAL_MS, 1)
  staleCheckProgress.set(progress)

  // 5分経過したらチェックを実行
  if (progress >= 1) {
    isChecking = true
    try {
      await checkIfNeeded()
    } finally {
      isChecking = false
      // チェック完了後、即座にバーをリセット
      staleCheckProgress.set(0)
    }
  }
}

/**
 * 定期チェッカーを開始
 */
export function startStaleChecker(): void {
  if (progressIntervalId !== null) {
    return // 既に開始済み
  }

  // 進捗更新タイマー（1秒ごと）- チェックもここでトリガー
  progressIntervalId = setInterval(updateProgressAndCheck, 1000)
}

/**
 * 定期チェッカーを停止
 */
export function stopStaleChecker(): void {
  if (progressIntervalId !== null) {
    clearInterval(progressIntervalId)
    progressIntervalId = null
  }
  staleCheckProgress.set(0)
}
