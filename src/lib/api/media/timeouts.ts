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

/**
 * IndexedDB 操作のタイムアウト（#261）。
 *
 * fetch と違い IndexedDB のハング（Safari プライベートモード・storage pressure・
 * 別タブの versionchange ブロック等）は request が settle しないまま止まる。
 * チェーン経路（uploadChain / retryPendingUploads）の IDB await が無期限だと
 * #252 と同型の head-of-line blocking が再発するため、この閾値で有限化する。
 * ローカル操作なので正常時は数十 ms〜数百 ms。10 秒は「ハングの検出」であって
 * 低速の許容ではない（低速端末の大容量キャッシュ書き込みも桁が違う）。
 * MEDIA_INSERT_WAIT_TIMEOUT_MS（sync/constants.ts）と同値なのは偶然で、
 * 意味的な結合はない（あちらは preflight の待ち上限。片方だけ変えてよい）。
 */
export const MEDIA_IDB_TIMEOUT_MS = 10_000

/**
 * Promise を race で有限化する（#261: IndexedDB 操作用）。
 * タイムアウトで reject するが、**元の操作はキャンセルされず裏で継続する**
 * （IndexedDB に abort API はない）。この orphan 継続は fetch と違いローカル操作
 * なので 409 等の衝突リスクがなく、遅延完了しても冪等（delete の遅延実行は
 * 内容アドレス dedup が回収、put の遅延実行は同キー上書き）である前提で使うこと。
 * タイマーは settle 時に解除する（fake timers テストでの残留防止）。
 */
export function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/**
 * IndexedDB 操作を MEDIA_IDB_TIMEOUT_MS で有限化する省略形（#261）。
 * メディア同期層（media.ts / media-library.ts）の全 IDB 呼び出しはこれを通す。
 * 根拠と orphan 継続の無害性は raceWithTimeout / MEDIA_IDB_TIMEOUT_MS の
 * docstring と docs/development/storage.md の mediaPending 節を参照。
 */
export function boundIdb<T>(operation: Promise<T>, label: string): Promise<T> {
  return raceWithTimeout(operation, MEDIA_IDB_TIMEOUT_MS, label)
}
