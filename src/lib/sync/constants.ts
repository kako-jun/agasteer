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

/**
 * Push / Pull preflight がメディア添付の「挿入フェーズ」（画像最適化〜記法挿入の
 * ローカル処理区間）を待つ上限（#254）。
 *
 * 最適化（canvas 再エンコード）＋100MB 上限ファイルのハッシュでも通常は数秒で
 * 終わる。万一ストールしても同期を永久に塞がないための保険であり、超過時は
 * 従来挙動（挿入前の内容でスナップショット）に落ちるだけで悪化はしない。
 * preflight は isPushing のガラスオーバーレイ中なので、長くしすぎると
 * 「固まった」体験になる点にも注意。
 */
export const MEDIA_INSERT_WAIT_TIMEOUT_MS = 10_000

/**
 * 挿入フェーズを「恒久ストール」とみなして in-flight 追跡から隔離する閾値（#254）。
 *
 * `MEDIA_INSERT_WAIT_TIMEOUT_MS` の超過だけで即隔離すると、正当に遅いバッチ
 * （大量写真の連続最適化）が最初のタイムアウト以降の同期で保護されなくなる。
 * 一方、永遠に settle しないフェーズを残すと以後の全 Push/Pull が毎回
 * タイムアウトまで待たされる。そこで「開始からこの時間を超えてなお未完了」の
 * フェーズだけを、タイムアウト発生時に追跡から外す（数分規模の巨大バッチは
 * 稀なので、それ以降は従来挙動に戻る割り切り）。
 */
export const MEDIA_INSERT_PHASE_STALE_MS = 60_000

/**
 * 長時間バックグラウンド復帰直後に stale check が `check_failed` を返した場合の
 * 短期リトライ間隔（ミリ秒）。配列の各要素が「待ってから次の試行をするまでの遅延」。
 *
 * #203: スマホで久しぶりに開いた直後はネットワーク復帰タイミングの都合で
 * 1 回目の stale check が失敗することがあり、そのまま 5 分沈黙する問題を救う。
 * 常時ポーリングではなく「復帰直後だけの限定リトライ」にとどめる。
 */
export const RESUME_RETRY_BACKOFFS_MS = [2_000, 5_000] as const
