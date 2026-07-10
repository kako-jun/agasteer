/**
 * メディア背景アップロードのタイムアウト閾値と算出（純粋層）(#252)
 *
 * #247 のグローバル直列化（uploadChain）は、チェーン内のどれか 1 つの fetch が
 * 永久 pending になると以後の背景アップロードが全て止まる（head-of-line blocking）。
 * media.ts はチェーン経路の全 fetch にこの閾値でタイムアウトを掛ける。
 *
 * 配置: media サブシステム専用の閾値なので sync/constants.ts（Push/Pull/stale の
 * 同期フロー用）ではなく media/ の純粋層に置く（naming/validation/lru と同列）。
 */

/**
 * メタデータ系リクエスト（リポ存在確認 GET・リポ作成 POST・存在チェック GET）の
 * タイムアウト。ボディが小さく数秒で返るのが正常なので、短めの固定値でよい。
 */
export const MEDIA_API_TIMEOUT_MS = 30_000

/** アップロード PUT タイムアウトの下限（小さいファイルでもこれ未満では切らない） */
export const MEDIA_PUT_TIMEOUT_BASE_MS = 60_000

/**
 * アップロード PUT タイムアウトの算出に使う「許容最低スループット」。
 *
 * 固定値タイムアウト（例 5 分）だと、低速回線 × 100MB 上限ファイルの正当な
 * アップロードを途中で誤中断し、リトライ→再中断のループでモバイル通信量だけを
 * 浪費しかねない（#252 の閾値トレードオフ）。サイズ比例にすることで
 * 「この速度すら出ていなければストール」という基準になり、生きている正当な
 * アップロードを途中で切らない。50KiB/s: 3G 実効上り相当の保守的な値。
 */
export const MEDIA_PUT_MIN_BYTES_PER_SEC = 50 * 1024

/**
 * アップロード PUT のタイムアウトをペイロード長（base64 後のリクエストボディ長）
 * から算出する。下限 60 秒 + 50KiB/s 換算の転送時間。
 * 例: 最適化済み画像 2MB → 約 100 秒、上限の 100MB（base64 後 ≈133MB）→ 約 46 分。
 * 巨大ファイルのストールはその間チェーンを塞ぐが、有限で必ず解ける。
 */
export function calcMediaPutTimeoutMs(payloadBytes: number): number {
  return MEDIA_PUT_TIMEOUT_BASE_MS + Math.ceil((payloadBytes / MEDIA_PUT_MIN_BYTES_PER_SEC) * 1000)
}
