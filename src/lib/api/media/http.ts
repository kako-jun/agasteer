/**
 * メディア同期層の HTTP ヘルパ（タイムアウト付き fetch・本文読み・認証ヘッダ）
 *
 * media.ts / media-library.ts / history.ts が共用する。
 * 閾値は timeouts.ts（純粋層）に集約している。
 */

import type { Settings } from '../../types'
import { MEDIA_API_TIMEOUT_MS } from './timeouts'

/** GitHub API の認証ヘッダ */
export function authHeaders(settings: Settings): Record<string, string> {
  return { Authorization: `Bearer ${settings.token}` }
}

/**
 * AbortController によるタイムアウト付き fetch。
 *
 * #247 のグローバル直列化（uploadChain）は、チェーン内のどれか 1 つの fetch が
 * 永久 pending になると以後の背景アップロードが全て止まる（head-of-line blocking）。
 * チェーン経路の全 fetch に上限を入れ、ストールを reject → 呼び出し元の catch →
 * 「false（pending 残置）」に落とすことでチェーンを必ず前進させる（#252）。
 *
 * AbortSignal.timeout() の一行で書けるが意図的に使わない: Node の実装は
 * vitest の fake timers（vi.useFakeTimers）に乗らず、タイムアウト挙動を
 * 決定的にテストできなくなるため（media-timeout.test.ts が時計を進めて検証する）。
 *
 * タイマーは応答**ヘッダ**到着で解除する（本文ストリーミングは対象外）。
 * 本文を読む必要がある場合、チェーン経路では readJsonWithTimeout を使うこと
 * （素の res.json() はヘッダ後の本文ストールで無限待ちになり #252 の保証を破る）。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timerId)
  }
}

/**
 * 応答 JSON 本文を上限つきで読む。パース失敗・タイムアウトはどちらも null。
 *
 * fetchWithTimeout はヘッダ到着でタイマーを解除するため、ヘッダ後に本文が
 * ストールすると素の res.json() は永遠に解決しない。背景アップロードチェーン
 * （uploadChain）上で本文を読むと 1 件のストールで以後の全アップロードが
 * 止まるため（#252 と同型の head-of-line blocking）、チェーン経路の本文読みは
 * 必ずこれを通す。タイムアウト時は本文リーダーが orphan として残るが、
 * チェーンは前進する（接続はブラウザのライフサイクルに任せる）。
 */
export async function readJsonWithTimeout(
  res: Response,
  timeoutMs: number = MEDIA_API_TIMEOUT_MS
): Promise<unknown | null> {
  let timerId: ReturnType<typeof setTimeout> | undefined
  const result = await Promise.race([
    res.json().catch(() => null),
    new Promise<null>((resolve) => {
      timerId = setTimeout(() => resolve(null), timeoutMs)
    }),
  ])
  clearTimeout(timerId)
  return result
}
