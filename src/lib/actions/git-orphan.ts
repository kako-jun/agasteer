import {
  settings,
  isPushing,
  isPushingBackground,
  isStale,
  lastKnownCommitSha,
  executeStaleCheck,
} from '../stores'
import { getPushInFlightAt, setPushInFlightAt } from '../data'
import { showPushCompletionToast } from '../ui'
import type { PushResult } from '../api'
import { get } from 'svelte/store'
import { _ } from '../i18n'

/**
 * #235: タイムアウトで UI をあきらめた後の orphan Push を観測する。
 *
 * タイムアウト（PUSH_TIMEOUT_MS）後も executePush の fetch チェーンは生きて
 * おり、遅れて完走すると古い HEAD を parent にしたコミットで ref を force 更新
 * する（= その間に別 Push が成功していてもリモートを上書きする）。従来はこの
 * 結果を誰も観測しなかったため、
 *   - 遅延成功: リモート HEAD が orphan のコミットになったのに
 *     lastKnownCommitSha は更新されず、pushInFlightAt も後続 Push の応答時に
 *     消されるため、以降の stale check が毎回 stale になり衝突ダイアログが
 *     出続けた（#235 の主症状）
 *   - 遅延失敗: 誰も catch せず unhandledrejection
 * という2つの穴があった。settle した瞬間に結果を反映して塞ぐ。
 *
 * 遅延成功時の SHA 追従は 2 段階で判定する:
 * - pushInFlightAt スロットが自分の stamp のまま = 後続 Push は挟まっていない。
 *   settle した瞬間のリモート HEAD はこのコミット（force 更新済み）なので
 *   そのまま追従してよい（通常ケース）
 * - スロットが別値/空 = 後続 Push が挟まった兆候。settle 順 ≠ ref 更新順が
 *   あり得る（orphan の ref 更新 → 後続 Push B 成功 → orphan のレスポンス到着、
 *   の順だと盲目追従で lastKnownCommitSha が shaB → shaA に逆流し偽 stale が出る）
 *   ため盲目追従せず、stale check を 1 回走らせて実リモート HEAD を確認し、
 *   それが自分の orphan コミットと確認できた場合のみ揃える
 *
 * pushInFlightAt は「自分が設定した値のままの場合だけ」クリアする。後続の
 * Push が新しい値を設定していた場合、それはその Push の救済マーカーなので
 * 触らない（このガードがあるため、pushToGitHub 本体側の set / clear は
 * orphan と競合しない）。
 *
 * リポ一致ガード: getPushInFlightAt / setPushInFlightAt / lastKnownCommitSha /
 * isStale はすべて「現在リポ」のスロットを対象とする（storage.ts の
 * currentRepoKey() は settings.repoName 基準）。タイムアウト後は UI ロックが
 * 解放されるため、settle 前にユーザーがリポを切り替え得る。そのまま書き込むと
 * 切替後の**新リポ**の同期状態に旧リポの SHA を混入させてしまうので、settle 時に
 * リポが変わっていたら warn ログのみで全書き込み（SHA・isStale・トースト・
 * フラグ）をスキップする。旧リポ側の pushInFlightAt は残るため、旧リポに
 * 戻ったときの stale check で tryRescueStalePush が救済する（「2段構えの保険」の
 * 第2段がそのまま効く）。
 */
export function observeOrphanPush(pushPromise: Promise<PushResult>, inFlightStamp: number): void {
  // リポ一致ガード用: タイムアウト時点のリポ識別子を控える
  // （storage.ts の currentRepoKey() と同じ settings.repoName 基準）
  const repoNameAtTimeout = settings.value.repoName
  const isRepoSwitched = () => settings.value.repoName !== repoNameAtTimeout
  const warnRepoSwitched = () =>
    console.warn(
      `Orphan push settled after repo switch (${repoNameAtTimeout} -> ${settings.value.repoName}); skipping all state updates`
    )
  const clearOwnInFlightFlag = () => {
    if (getPushInFlightAt() === inFlightStamp) {
      setPushInFlightAt(undefined)
    }
  }
  pushPromise.then(
    async (lateResult) => {
      if (isRepoSwitched()) {
        warnRepoSwitched()
        return
      }
      if (lateResult.success && lateResult.commitSha) {
        if (getPushInFlightAt() === inFlightStamp) {
          // スロットが自分の stamp のまま → 後続 Push なし。リモート HEAD は
          // このコミットで確定しているので追従する
          console.log(
            `Orphan push settled successfully after timeout; updating lastKnownCommitSha to ${lateResult.commitSha}`
          )
          lastKnownCommitSha.value = lateResult.commitSha
          isStale.value = false
          if (isPushing.value || isPushingBackground.value) {
            // 別 Push が進行中: その sticky トースト（toast.pushInProgress）を
            // 成功トーストで消してしまわないよう、通知はログに留める（SHA 反映は実施済み）
            console.log('Orphan push late-success toast suppressed: another push is in progress')
          } else {
            // タイムアウト時の「応答が途切れました」トーストを上書きして成功を通知
            showPushCompletionToast(get(_)('toast.pushLateSuccess'), 'success')
          }
        } else {
          // スロットが別値/空 → 後続 Push が挟まった兆候。盲目追従すると
          // SHA が逆流し得るため、実リモート HEAD を 1 回確認して揃える
          console.log(
            'Orphan push settled successfully but another push intervened; verifying remote HEAD instead of blindly following'
          )
          try {
            const check = await executeStaleCheck(settings.value, lastKnownCommitSha.value)
            // await 中にリポが切り替わった可能性を再チェック（M1 と同じ理由）
            if (isRepoSwitched()) {
              warnRepoSwitched()
              return
            }
            if (check.status === 'stale' && check.remoteCommitSha === lateResult.commitSha) {
              // align は「リモート HEAD が自分の送ったコミット」と確認できた場合のみ。
              // 第三者（別デバイス）のコミットに揃えると真正な divergence を隠し、
              // 次の Push が無警告上書きになる。一致しない stale は通常の stale
              // フロー（次回の定期チェック → ダイアログ）に委ねる。
              // （up_to_date なら既に整合。check_failed は次回の定期チェックに委ねる）
              console.log(
                `Orphan push verification: remote HEAD matches orphan commit; aligning lastKnownCommitSha to ${check.remoteCommitSha}`
              )
              lastKnownCommitSha.value = check.remoteCommitSha
            }
          } catch (checkError) {
            // 検証失敗は握りつぶし、次回の定期 stale check に委ねる
            console.warn('Orphan push verification stale check failed:', checkError)
          }
        }
      } else {
        // 遅延失敗（エラー結果で resolve）: フラグを残すと次の stale check が
        // 「Push 成功」と誤認して SHA を追従（救済）してしまうためクリアする
        console.warn('Orphan push settled with failure after timeout:', lateResult.message)
      }
      clearOwnInFlightFlag()
    },
    (e) => {
      if (isRepoSwitched()) {
        warnRepoSwitched()
        return
      }
      // 遅延 reject: unhandledrejection の解消も兼ねる
      console.warn('Orphan push rejected after timeout:', e)
      clearOwnInFlightFlag()
    }
  )
}
