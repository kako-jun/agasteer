/**
 * 同期処理（Push / Pull / stale check）で共有する時間関連の定数。
 *
 * 同じ意味の閾値が複数モジュールに散らばると、片方だけ更新したときに
 * docs / 実装 / コメントの記述が発散しやすい。ここに一元化することで
 * 将来の調整も 1 箇所で済むようにする。
 */

/**
 * Push 全体のタイムアウト（#204 Phase A）。
 *
 * `pushToGitHub` 内で `Promise.race([executePush, timeout])` の上限。
 * これを超えるとタイムアウトと判断し、UI ロック（ガラス効果＋inert）を解除する。
 * orphan になった executePush Promise は `pushInFlightAt` 経由で次回の
 * stale check で救済される。
 */
export const PUSH_TIMEOUT_MS = 30_000

/**
 * visibility 復帰時に「Push がハング中」と判定する閾値（#204 Phase B）。
 *
 * `PUSH_TIMEOUT_MS` より長くして通常の Push 完了経路と確実に区別する。
 * Phase A の Promise.race タイムアウトでも `isPushing` が true のままに
 * なるパス（バックグラウンドで JS タイマー停止 → 復帰時に reject も発火する前 など）
 * の保険として機能する。
 */
export const PUSH_HANG_THRESHOLD_MS = 60_000

/**
 * `pushInFlightAt` フラグの有効期限。
 *
 * Push API 呼び出し中に立てた飛行中フラグが、この期間を超えても残っていたら
 * 「期限切れ」とみなして無視する。期限内の stale 判定では `applyStaleResult`
 * が「Push 成功でレスポンスだけロスト」とみなして SHA 更新で救済する。
 *
 * 1 時間: ユーザーがスマホをスリープして翌朝開く程度のユースケースをカバー。
 */
export const PUSH_IN_FLIGHT_EXPIRY_MS = 60 * 60 * 1000
