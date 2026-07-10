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
 * 追跡し、Push / Pull の preflight が waitForPendingMediaInserts() で
 * 「挿入 → store 反映 → 変更検出」の順序を保証できるようにする。
 * 実アップロード（背景・数分かかりうる）は対象外。
 *
 * 配置が api/media 配下なのはレイヤ方向のため: editor → api / actions → api は
 * 既存の依存方向で、editor と actions を直接結ばずに済む。
 */

const inFlightInsertPhases = new Set<Promise<void>>()

/**
 * 挿入フェーズ待ちの上限。
 * 最適化（canvas 再エンコード）＋100MB 上限ファイルのハッシュでも通常は数秒で
 * 終わる。万一ストールしても Push を永久に塞がないための保険であり、超過時は
 * 従来挙動（挿入前の内容で Push）に落ちるだけで悪化はしない。
 */
export const MEDIA_INSERT_WAIT_TIMEOUT_MS = 10_000

/**
 * 挿入フェーズの開始を登録し、終了関数を返す。
 * attachMediaFiles が挿入（deps.insert）完了までの区間を括るのに使う。
 * 終了関数は冪等で、失敗経路（throw・早期 continue の集約後）でも
 * finally から必ず呼ぶこと。
 */
export function beginMediaInsertPhase(): () => void {
  let settle!: () => void
  const phase = new Promise<void>((resolve) => {
    settle = resolve
  })
  inFlightInsertPhases.add(phase)
  return () => {
    inFlightInsertPhases.delete(phase)
    settle()
  }
}

/**
 * 進行中の挿入フェーズがすべて終わるまで待つ（Push / Pull の preflight 用）。
 *
 * 呼び出し時点のスナップショットに対して待つ: 待機中に新しく始まった添付は
 * 対象外（preflight 中は isPushing のガラスオーバーレイで編集がロックされる
 * ため実際には発生しない。ループにしないことで livelock も構造的に防ぐ）。
 * 上限超過時は warn を出して解決する（Push を塞がない）。
 */
export async function waitForPendingMediaInserts(
  timeoutMs: number = MEDIA_INSERT_WAIT_TIMEOUT_MS
): Promise<void> {
  const pending = Array.from(inFlightInsertPhases)
  if (pending.length === 0) return
  let timerId: ReturnType<typeof setTimeout> | undefined
  const timedOut = await Promise.race([
    Promise.all(pending).then(() => false),
    new Promise<boolean>((resolve) => {
      timerId = setTimeout(() => resolve(true), timeoutMs)
    }),
  ])
  if (timerId !== undefined) clearTimeout(timerId)
  if (timedOut) {
    console.warn(
      `Media insert phase did not settle within ${timeoutMs}ms; proceeding without waiting (#254)`
    )
  }
}
