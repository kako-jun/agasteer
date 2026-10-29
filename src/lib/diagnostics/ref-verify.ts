/**
 * バグレポート用診断ログ（#317）: ref PATCH 直後の読み直し確認
 *
 * github.ts の PATCH 直後に呼ばれ、ref を読み直して PATCH した SHA との一致を
 * 記録する。記録専用: 不一致でも失敗しても Push の成否には一切影響しない。
 * api 層との循環 import を避けるため fetch だけで完結させている。
 */
import { recordDiag } from './record'

export async function recordRefVerification(
  repoName: string,
  token: string,
  branch: string,
  pushedSha: string
): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repoName}/git/ref/heads/${branch}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      recordDiag('ref-verify', { pushedSha, refSha: null, match: false, httpStatus: res.status })
      return
    }
    const data = await res.json()
    const refSha = typeof data?.object?.sha === 'string' ? data.object.sha : null
    recordDiag('ref-verify', {
      pushedSha,
      refSha,
      match: refSha === pushedSha,
      httpStatus: res.status,
    })
  } catch (e) {
    console.warn('diagnostics: ref verify failed', e)
  }
}
