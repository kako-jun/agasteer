/**
 * メディア添付「挿入フェーズ」の in-flight 追跡（#254）
 *
 * 添付フロー（attachMediaFiles）は「画像最適化 → ハッシュ確定 → enqueue → 記法挿入」
 * の順で進み、挿入はローカル処理の完了後に走る。モバイルでは最適化に数百 ms〜数秒
 * かかるため、添付直後に Push すると preflight のスナップショットが挿入前の内容を
 * 固定してしまい、「変更なし」で no-op になるレースがあった（挿入テキストだけが
 * リポに保存されず、次回 Pull で消えるとメディアが孤児化するデータ整合リスク）。
 *
 * ここでは挿入フェーズ（ネットワーク待ちを含まないローカル処理区間）だけを
 * 追跡し、Push / Pull / リポ切替（rehydrateForRepo）の preflight が
 * waitForPendingMediaInserts() で「挿入 → store 反映 → 変更検出」の順序を
 * 保証できるようにする。実アップロード（背景・数分かかりうる）は対象外。
 *
 * 配置が api/media 配下なのはレイヤ方向のため: editor → api / actions → api /
 * stores → api は既存の依存方向で、editor と actions を直接結ばずに済む。
 * タイムアウト定数は他の同期系閾値と同じく sync/constants.ts に集約している。
 */

import { MEDIA_INSERT_WAIT_TIMEOUT_MS, MEDIA_INSERT_PHASE_STALE_MS } from '../../sync/constants'

/** 進行中の挿入フェーズ → 開始時刻（ms）。開始時刻はストール隔離の判定に使う */
const inFlightInsertPhases = new Map<Promise<void>, number>()

/**
 * 挿入フェーズの開始を登録し、終了関数を返す。
 * attachMediaFiles が挿入（deps.insert）完了までの区間を括るのに使う。
 * 終了関数は冪等で、失敗経路（throw）でも finally から必ず呼ぶこと。
 */
export function beginMediaInsertPhase(): () => void {
  let settle!: () => void
  const phase = new Promise<void>((resolve) => {
    settle = resolve
  })
  inFlightInsertPhases.set(phase, Date.now())
  return () => {
    inFlightInsertPhases.delete(phase)
    settle()
  }
}

/**
 * 進行中の挿入フェーズがすべて終わるまで待つ（Push / Pull / リポ切替の preflight 用）。
 *
 * 呼び出し時点のスナップショットに対して待つ: 待機中に新しく始まった添付は
 * 対象外（preflight 中は isPushing のガラスオーバーレイで編集がロックされる
 * ため実際には発生しない。ループにしないことで livelock も構造的に防ぐ）。
 *
 * 上限超過時は warn を出して解決する（同期を塞がない）。このとき、開始から
 * MEDIA_INSERT_PHASE_STALE_MS を超えてなお未完了のフェーズは「恒久ストール」
 * とみなして追跡から外す。外さないと、settle しないフェーズ 1 つで以後の
 * 全 Push/Pull が毎回タイムアウトまで待たされ続ける。正当に遅いだけの
 * バッチ（大量写真の連続最適化）は閾値内なら追跡に残り、保護が継続する。
 */
export async function waitForPendingMediaInserts(
  timeoutMs: number = MEDIA_INSERT_WAIT_TIMEOUT_MS
): Promise<void> {
  const pending = Array.from(inFlightInsertPhases.keys())
  if (pending.length === 0) return
  let timerId: ReturnType<typeof setTimeout> | undefined
  const timedOut = await Promise.race([
    Promise.all(pending).then(() => false),
    new Promise<boolean>((resolve) => {
      timerId = setTimeout(() => resolve(true), timeoutMs)
    }),
  ])
  clearTimeout(timerId)
  if (!timedOut) return

  console.warn(
    `Media insert phase did not settle within ${timeoutMs}ms; proceeding without waiting (#254)`
  )
  const now = Date.now()
  for (const [phase, startedAt] of inFlightInsertPhases) {
    if (now - startedAt >= MEDIA_INSERT_PHASE_STALE_MS) {
      inFlightInsertPhases.delete(phase)
      console.warn(
        `Evicted a media insert phase stalled for ${now - startedAt}ms from in-flight tracking (#254)`
      )
    }
  }
}
