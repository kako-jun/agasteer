/**
 * メディアリポの「履歴を残さないコミット方式」（#250）
 *
 * メディアは世代管理が不要なのに、Contents API の変更はコミットを積み上げ、
 * 削除してもファイルが履歴に残ってリポが単調に肥大する。そこで変更のたびに
 * 「その変更コミットと同じ tree を指す親なしコミット」で履歴を置き換え、
 * リポを常に 1 コミット＝現在のファイルだけに保つ（手動メンテの UI は設けない。
 * ユーザー操作なしで常に最適）。
 *
 * 変更自体は従来どおり Contents API（安全な 409 セマンティクスを維持）で行い、
 * 履歴の畳みだけをこのモジュール（Git Database API）が担う。必要トークン権限は
 * Contents の範囲内で、Fine-grained トークンでも追加権限は不要。
 */

import type { Settings } from '../../types'
import { authHeaders, fetchWithTimeout, readJsonWithTimeout } from './http'
import { MEDIA_API_TIMEOUT_MS } from './timeouts'

/**
 * メディアリポの default branch（フルネーム → ブランチ名）。
 * ensureMediaRepo（media.ts）が存在確認/作成レスポンスから捕捉して登録し、
 * collapseMediaHistory の ref 更新先に使う。未捕捉時は 'main' にフォールバック
 * （auto_init 作成リポの既定。外れても ref GET が 404 → 畳みをスキップするだけで無害）。
 */
const mediaDefaultBranches = new Map<string, string>()

export function recordMediaDefaultBranch(repoFullName: string, branch: string): void {
  mediaDefaultBranches.set(repoFullName, branch)
}

/** Contents API の変更応答（PUT/DELETE）から履歴畳みに必要な commit/tree を取り出す */
export function extractMutationCommit(json: unknown): { sha: string; treeSha: string } | null {
  const commit = (json as { commit?: { sha?: unknown; tree?: { sha?: unknown } } } | null)?.commit
  const sha = commit?.sha
  const treeSha = commit?.tree?.sha
  if (typeof sha !== 'string' || typeof treeSha !== 'string') return null
  return { sha, treeSha }
}

export type CollapseResult =
  /** ref を親なしコミットへ差し替えた（リポは 1 コミットになった） */
  | 'collapsed'
  /** HEAD が期待コミットでない＝並行変更を検知して中止（force で握り潰さない） */
  | 'skipped_head_moved'
  /** API エラー・タイムアウト等。履歴が残るだけで実害なし（次回の変更時に再試行） */
  | 'failed'

/**
 * メディアリポの履歴を「expectedHeadSha と同じ tree を指す親なしコミット 1 つ」に置き換える。
 *
 * 手順（すべて Contents 権限で足りる Git Database API）:
 * 1. POST /git/commits: treeSha を指す親なしコミットを作る
 * 2. GET /git/ref: HEAD がまだ expectedHeadSha か確認。違えば skipped_head_moved
 *    （他デバイスの並行変更を force 更新で握り潰さないためのガード。
 *    畳み損ねた履歴は次回の変更時にまとめて畳まれる＝自己修復）
 * 3. PATCH /git/refs（force）: ref を親なしコミットへ差し替え
 *
 * 完全な CAS は GitHub API に無いため 2→3 の間の極小窓（〜1 往復）は残る。
 * その窓で他デバイスのコミットが挟まると、そのコミットは履歴から消え、
 * **そのコミットが足したファイルは HEAD の tree から落ちる**。呼び出し側
 * （uploadPendingItem）は skipped_head_moved を受けたとき自ファイルの存在を
 * 再確認して pending 残置に倒す（media.ts 参照）ことで、自分側の取り込まれ
 * 損ねは自己修復する。相手側の窓（相手の check→PATCH に自分の変更が挟まる）
 * は相手の同じ機構が守る。同一クライアント内は uploadChain の直列化で
 * この窓自体が生じない。
 *
 * best-effort: どの段階で失敗しても呼び出し元の変更成功は覆さない。
 */
export async function collapseMediaHistory(
  settings: Settings,
  repoFullName: string,
  expectedHeadSha: string,
  treeSha: string
): Promise<CollapseResult> {
  const branch = mediaDefaultBranches.get(repoFullName) ?? 'main'
  try {
    const commitRes = await fetchWithTimeout(
      `https://api.github.com/repos/${repoFullName}/git/commits`,
      {
        method: 'POST',
        headers: { ...authHeaders(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Agasteer media snapshot',
          tree: treeSha,
          parents: [],
        }),
      },
      MEDIA_API_TIMEOUT_MS
    )
    if (!commitRes.ok) {
      return 'failed'
    }
    const newSha = ((await readJsonWithTimeout(commitRes)) as { sha?: unknown } | null)?.sha
    if (typeof newSha !== 'string') {
      return 'failed'
    }
    // HEAD が期待コミットのままか確認（並行変更の握り潰し防止）
    const refRes = await fetchWithTimeout(
      `https://api.github.com/repos/${repoFullName}/git/ref/heads/${branch}`,
      { headers: authHeaders(settings), cache: 'no-store' },
      MEDIA_API_TIMEOUT_MS
    )
    if (!refRes.ok) {
      return 'failed'
    }
    const currentSha = (
      (await readJsonWithTimeout(refRes)) as { object?: { sha?: unknown } } | null
    )?.object?.sha
    if (currentSha !== expectedHeadSha) {
      return 'skipped_head_moved'
    }
    const patchRes = await fetchWithTimeout(
      `https://api.github.com/repos/${repoFullName}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers: { ...authHeaders(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newSha, force: true }),
      },
      MEDIA_API_TIMEOUT_MS
    )
    return patchRes.ok ? 'collapsed' : 'failed'
  } catch (error) {
    console.warn('Media history collapse failed (history kept, will retry on next change):', error)
    return 'failed'
  }
}
