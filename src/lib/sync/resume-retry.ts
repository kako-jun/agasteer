/**
 * 復帰直後の stale check 短期リトライ（#203）
 *
 * スマホで Agasteer を久しぶりに開いた直後は OS / PWA / 回線の都合で
 * 1 回目の stale check が `check_failed` を返すことがある。そのまま放置すると
 * 次回の周期 stale check（5 分後）まで何も起きず、ユーザーから見ると
 * 「Pull / Push が灰色のままで動かない」状態になる。
 *
 * 本モジュールはその救済を「純粋関数」として切り出す。Svelte ストアや
 * `document.visibilityState` への依存は呼び出し側の引数として注入し、
 * 単体テストできる形にする。
 *
 * 仕様:
 * - `backoffsMs` の各要素分待ってから `runStaleCheck()` を呼び直す
 * - `check-failed` 以外の outcome を得たら早期 return（成功 / stale / 救済 など）
 * - 各リトライ前に `isVisible()` を確認し、再び hidden になっていたら諦める
 *   （バックグラウンドで API を打ち続けないため）
 * - 全試行を使い切っても `check-failed` のままなら最終 outcome を返す
 *
 * 注意: push-hang ダイアログとの整合のため、このリトライは
 * `consumePushHangFlag` のクロージャを引き継がない。ハング判定は
 * 1 回目の stale check で済んでおり、リトライは「単に通信が不安定だった」
 * 救済目的に限定する。
 */

import type { ApplyStaleResultOutcome } from '../stores/stale-checker.svelte'

export interface RunResumeStaleCheckRetryOptions {
  /** 待ち時間（ミリ秒）の配列。配列長 = 最大リトライ回数。 */
  backoffsMs: readonly number[]
  /**
   * stale check 1 回ぶんの実行関数（executeStaleCheck → applyStaleResult を内包）。
   * `attemptIndex` は 0 始まり、`backoffMs` はその試行の直前に待った時間（ms）。
   * ロギングや診断目的に使える。
   */
  runStaleCheck: (attemptIndex: number, backoffMs: number) => Promise<ApplyStaleResultOutcome>
  /**
   * リトライを継続して良いかを各待機後に判定する getter。
   * `false` を返すと残りのリトライを諦めて早期 return する。
   * 一般的には `document.visibilityState === 'visible' && !isPulling && !isPushing` のような合成条件を渡す。
   */
  shouldContinue: () => boolean
  /** ミリ秒スリープ。テスト時には fake timer 互換の関数を注入できるようにする。 */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 復帰時の `check_failed` を短期リトライする。
 *
 * @returns 最後に得た outcome。最初から全部 `check-failed` だった場合も
 *   最終的な `check-failed` を返す。途中で `shouldContinue()` が false になって
 *   諦めた場合は、その時点までの最後の outcome（= `check-failed`）を返す。
 */
export async function runResumeStaleCheckRetry(
  options: RunResumeStaleCheckRetryOptions
): Promise<ApplyStaleResultOutcome> {
  const { backoffsMs, runStaleCheck, shouldContinue, sleep = defaultSleep } = options
  let lastOutcome: ApplyStaleResultOutcome = 'check-failed'

  for (const [i, ms] of backoffsMs.entries()) {
    await sleep(ms)
    if (!shouldContinue()) {
      // hidden に戻った / 別経路で pull/push が始まった等で続行不能。
      // 無駄な API 呼び出しを避ける。次回の visibility 復帰で初回 stale check からやり直される。
      return lastOutcome
    }
    const outcome = await runStaleCheck(i, ms)
    lastOutcome = outcome
    if (outcome !== 'check-failed') {
      return outcome
    }
  }

  return lastOutcome
}
