/**
 * GitHub API 低レベル HTTP ヘルパー（副作用層）
 *
 * Contents API の fetch・並列ワーカー・設定検証をまとめる。
 * github.ts から純移動（Phase 2）。振る舞いは不変。
 */

import type { Settings } from '../../types'

/**
 * 複数アイテムを並列上限付きで処理する
 * worker が null を返した要素は結果から除外する
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R | null>
): Promise<R[]> {
  const results: R[] = []
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const currentIndex = index++
      if (currentIndex >= items.length) break
      const item = items[currentIndex]
      const result = await worker(item, currentIndex)
      if (result !== null) {
        results.push(result)
      }
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * GitHub設定を検証
 * @returns valid: true または valid: false と i18nキー
 */
export function validateGitHubSettings(settings: Settings): { valid: boolean; errorKey?: string } {
  if (!settings.token) {
    return { valid: false, errorKey: 'github.tokenNotSet' }
  }
  if (!settings.repoName || !settings.repoName.includes('/')) {
    return { valid: false, errorKey: 'github.invalidRepoName' }
  }
  return { valid: true }
}

/**
 * GitHub Contents APIを呼ぶヘルパー関数（キャッシュバスター付き）
 */
export async function fetchGitHubContents(
  path: string,
  repoName: string,
  token: string,
  options?: { raw?: boolean }
) {
  const url = `https://api.github.com/repos/${repoName}/contents/${path}?t=${Date.now()}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  // RawモードはBase64デコードを省きレスポンスサイズを抑える
  if (options?.raw) {
    headers.Accept = 'application/vnd.github.raw'
  }
  return fetch(url, {
    headers,
  })
}
