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
} from './stores.svelte'
import { checkStaleStatus as checkStaleStatusRaw } from '../api/sync'
import { getPushInFlightAt, setPushInFlightAt } from '../data/storage'

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
    lastStaleCheckTime.value = Date.now()
  }
}

/** チェック間隔（ミリ秒） */
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5分

/**
 * staleチェック進捗（0〜1）
 * 前回チェックからの経過時間を表示
 * 0 = チェック直後、1 = 次のチェック直前
 */
let _staleCheckProgress = $state<number>(0)
export const staleCheckProgress = {
  get value() {
    return _staleCheckProgress
  },
  set value(v: number) {
    _staleCheckProgress = v
  },
}

/**
 * 自動Pullトリガー用ストア
 * stale検出かつローカルがクリーンなときにtrueになる
 * App.svelteで購読してPull処理を実行
 */
let _shouldAutoPull = $state<boolean>(false)
export const shouldAutoPull = {
  get value() {
    return _shouldAutoPull
  },
  set value(v: boolean) {
    _shouldAutoPull = v
  },
}

let progressIntervalId: ReturnType<typeof setInterval> | null = null
let isChecking = false

/** Push 飛行中フラグの有効期限（1時間） */
const PUSH_IN_FLIGHT_EXPIRY_MS = 60 * 60 * 1000

/**
 * staleチェック結果に対する共通の状態遷移
 * 周期チェッカーと `handleVisibilityChange`（長時間バックグラウンド復帰時）の両方から呼ばれる。
 * 両者で挙動を揃えるため、ロジックはこの関数に一本化すること（過去 #164 で非対称が問題化）。
 *
 * - stale + push-in-flight 期限内 → SHA のみ更新（Push 成功の救済）
 * - stale + クリーン → `shouldAutoPull = true`（自動Pull）
 * - stale + ダーティ → `isStale = true`（赤バッジ）
 * - up_to_date → `isStale = false`
 * - check_failed → 何もしない
 *
 * @returns 適用後の遷移種別。push-hang 復旧経路（#204/#205）など、後続処理で
 *   「救済済みか / dirty のまま stale バッジか / 自動 Pull か」を分岐したい呼び出し元向け。
 *   - `rescued`: stale + push-in-flight 期限内 → SHA だけ更新して救済済み
 *   - `stale-dirty`: stale + dirty → 赤バッジ（ユーザー判断待ち）
 *   - `stale-auto-pull`: stale + クリーン → 自動 Pull がスケジュール
 *   - `up-to-date`: 変化なし
 *   - `check-failed`: ネットワーク/認証エラー等で判定不能
 */
export type ApplyStaleResultOutcome =
  | 'rescued'
  | 'stale-dirty'
  | 'stale-auto-pull'
  | 'up-to-date'
  | 'check-failed'

export function applyStaleResult(
  result: StaleCheckResult,
  logContext: string
): ApplyStaleResultOutcome {
  if (result.status === 'stale') {
    const pushInFlight = getPushInFlightAt()
    if (pushInFlight && Date.now() - pushInFlight < PUSH_IN_FLIGHT_EXPIRY_MS) {
      // Pushは成功していたとみなし、SHAのみ更新してstaleを回避
      // スナップショットとダーティは変更しない（push後の追加編集を保護）
      console.log(`${logContext}: push-in-flight detected, updating SHA only`)
      lastKnownCommitSha.value = result.remoteCommitSha
      setPushInFlightAt(undefined)
      isStale.value = false
      return 'rescued'
    }
    // フラグが期限切れの場合はクリア
    if (pushInFlight) {
      setPushInFlightAt(undefined)
    }
    if (isDirty.value) {
      isStale.value = true
      return 'stale-dirty'
    }
    shouldAutoPull.value = true
    return 'stale-auto-pull'
  }
  if (result.status === 'up_to_date') {
    // PushがGitHubに届かなかった場合も安全にフラグをクリア
    if (getPushInFlightAt()) {
      setPushInFlightAt(undefined)
    }
    isStale.value = false
    return 'up-to-date'
  }
  // check_failed は現状維持
  return 'check-failed'
}

/**
 * 定期チェックを実行
 */
async function checkIfNeeded(): Promise<void> {
  try {
    const result = await executeStaleCheck(settings.value, lastKnownCommitSha.value)
    applyStaleResult(result, 'Periodic stale check')
  } catch {
    // ネットワークエラー等は無視（executeStaleCheck内で時刻は更新済み）
  }
}

/**
 * チェック実行の条件を満たしているか
 */
function canPerformCheck(): boolean {
  // GitHub未設定
  if (!githubConfigured.value) {
    return false
  }

  // タブが非アクティブ
  if (document.visibilityState !== 'visible') {
    return false
  }

  // Pull/Push中
  if (isPulling.value || isPushing.value) {
    return false
  }

  // まだ一度もチェックしていない（初回Pull前）
  if (lastStaleCheckTime.value === 0) {
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
    staleCheckProgress.value = 0
    return
  }

  // チェック中は進捗更新をスキップ（再チェック防止）
  if (isChecking) {
    return
  }

  const lastCheck = lastStaleCheckTime.value
  const elapsed = Date.now() - lastCheck
  const progress = Math.min(elapsed / CHECK_INTERVAL_MS, 1)
  staleCheckProgress.value = progress

  // 5分経過したらチェックを実行
  if (progress >= 1) {
    isChecking = true
    try {
      await checkIfNeeded()
    } finally {
      isChecking = false
      // チェック完了後、即座にバーをリセット
      staleCheckProgress.value = 0
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
  staleCheckProgress.value = 0
}
