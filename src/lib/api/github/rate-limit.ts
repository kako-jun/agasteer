/**
 * GitHub レート制限の解析（純粋層）
 *
 * Response からヘッダを読むだけの純粋変換。fetch しない。
 * github.ts から純移動（Phase 1）。振る舞いは不変。
 */

/**
 * レート制限エラー情報
 */
export interface RateLimitInfo {
  isRateLimited: boolean
  resetTime?: Date
  remainingSeconds?: number
}

/**
 * レスポンスからレート制限情報を抽出
 */
export function parseRateLimitResponse(response: Response): RateLimitInfo {
  if (response.status !== 403 && response.status !== 429) {
    return { isRateLimited: false }
  }

  // X-RateLimit-Remaining が 0 の場合はレートリミット確定
  const remainingHeader = response.headers.get('X-RateLimit-Remaining')
  const isRateLimited = remainingHeader === '0' || response.status === 429

  if (!isRateLimited) {
    // 403だがレートリミットではない（権限エラーなど）
    return { isRateLimited: false }
  }

  const resetHeader = response.headers.get('X-RateLimit-Reset')
  if (resetHeader) {
    const resetTimestamp = parseInt(resetHeader, 10) * 1000 // 秒→ミリ秒
    const resetTime = new Date(resetTimestamp)
    const remainingSeconds = Math.max(0, Math.ceil((resetTimestamp - Date.now()) / 1000))
    return {
      isRateLimited: true,
      resetTime,
      remainingSeconds,
    }
  }

  // ヘッダーがない場合（Secondary rate limitなど）
  // GitHubのドキュメントによると通常1分程度で解除される
  return { isRateLimited: true, remainingSeconds: 60 }
}
