/**
 * バグレポート用診断ログ（#317）: stale 検出時だけの追加観測
 *
 * stale と判定された場面でのみ呼ぶ。記録専用で判定には使わない。
 * 失敗はすべて握りつぶす（呼び出し側は await しない）。
 */
import type { Settings } from '../types'
import { fetchRemoteHeadSha } from '../api/github'
import { recordDiag } from './record'

export async function recordStaleExtras(
  settings: Settings,
  detectedRemoteSha: string
): Promise<void> {
  try {
    // 直後にもう1回 HEAD を読む（stale 判定が一過性のずれだったかを後から見分ける）
    const recheck = await fetchRemoteHeadSha(settings)
    if (recheck.status === 'success') {
      recordDiag('stale-recheck', {
        status: 'success',
        headSha: recheck.commitSha,
        sameAsRemote: recheck.commitSha === detectedRemoteSha,
      })
    } else {
      recordDiag('stale-recheck', { status: 'failed' })
    }

    // リモート HEAD コミットの親 SHA と日時（誰がいつ積んだ HEAD かの手掛かり）
    const res = await fetch(
      `https://api.github.com/repos/${settings.repoName}/git/commits/${detectedRemoteSha}`,
      { headers: { Authorization: `Bearer ${settings.token}` }, cache: 'no-store' }
    )
    if (!res.ok) return
    const commit = await res.json()
    recordDiag('stale-remote-commit', {
      headSha: detectedRemoteSha,
      parentSha: typeof commit?.parents?.[0]?.sha === 'string' ? commit.parents[0].sha : null,
      commitDate: commit?.committer?.date,
    })
  } catch (e) {
    console.warn('diagnostics: stale extras failed', e)
  }
}
