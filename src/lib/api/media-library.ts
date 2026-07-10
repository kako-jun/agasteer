/**
 * メディアライブラリ同期層（副作用層: 一覧取得・削除）(#250)
 *
 * メディア添付リポ `{owner}/{repo}-media` の一覧取得と削除を担う。
 * media.ts（アップロード/取得）と同じ結果オブジェクト契約（throw しない・
 * errorKind を返す）に従う。純粋な変換（アイテム→MediaAsset・形式フィルタ）は
 * media/library.ts に分離している。
 *
 * media.ts が 400 行超のため、肥大を避けて一覧・削除はこの sibling モジュールに置く
 * （ハウスルール: 1 モジュール ≈400 行）。api/index.ts が両方を re-export する。
 * この層は media.ts に依存するが、media.ts はこの層に依存しない（一方向）。
 */

import type { Settings } from '../types'
import {
  isMediaConfigured,
  fetchWithTimeout,
  authHeaders,
  MEDIA_API_TIMEOUT_MS,
  type MediaErrorKind,
} from './media'
import { getMediaRepoFullName, buildRawMediaUrl } from './media/naming'
import { mapTreeToMediaAssets, type MediaAsset } from './media/library'
import { deleteCachedMedia, deletePendingMedia } from '../data/media-storage'

// 取り込んだ MediaAsset をこの層の公開型としても再輸出する（UI は media-library から引く）
export type { MediaAsset }

export type MediaListResult =
  | {
      ok: true
      assets: MediaAsset[]
      /**
       * Trees API の応答が上限（エントリ 100,000 件 / 7MB）で切り詰められたか（#258）。
       * true のとき一覧は一部のみ。UI は「一部のみ表示」を明示する（silent cap 禁止）
       */
      truncated: boolean
    }
  | { ok: false; errorKind: MediaErrorKind; httpStatus?: number }

export type MediaDeleteResult =
  | { ok: true }
  | { ok: false; errorKind: MediaErrorKind; httpStatus?: number }

/**
 * メディアリポ直下のアセット一覧を取得する。
 *
 * #258: 取得は Git Trees API（`GET /git/trees/HEAD`、非 recursive）。
 * Contents API のディレクトリ一覧は 1000 件で黙って切れる（silent cap）が、
 * Trees API は全件返り、上限超過は truncated フラグで検知できる。
 * - ref に HEAD を使うのは default branch 追従のため（Contents API の既定と同じ挙動）
 * - メディアはルート直下フラット配置の契約なので recursive は不要。非 recursive は
 *   ルートツリーだけを返すため、（ユーザーが手動でフォルダを作った異常系でも）
 *   ネストした大量エントリで応答が肥大したり truncated が誤発火したりしない
 *
 * - 未設定（token / `owner/repo` 形式でない）は not_configured。
 * - 409（空リポ = コミット 0 件で HEAD なし）は「まだ添付が 0 件」なので成功・空配列。
 * - 404 は「リポ未作成」と「ref/tree 解決失敗」を区別できない。黙って空を返すと
 *   実在する全アセットが見えない silent failure に化けるため、リポ自体の存在を
 *   確認して未作成のときだけ空として扱う（それ以外は fetch_failed → 再試行導線）。
 * - それ以外の HTTP エラー・ネットワークエラー・タイムアウト（#262）も fetch_failed。
 */
export async function listMediaAssets(settings: Settings): Promise<MediaListResult> {
  if (!isMediaConfigured(settings)) {
    return { ok: false, errorKind: 'not_configured' }
  }
  const mediaRepo = getMediaRepoFullName(settings.repoName)
  try {
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${mediaRepo}/git/trees/HEAD`,
      {
        headers: authHeaders(settings),
        cache: 'no-store',
      },
      MEDIA_API_TIMEOUT_MS
    )
    if (res.status === 409) {
      return { ok: true, assets: [], truncated: false }
    }
    if (res.status === 404) {
      const repoRes = await fetchWithTimeout(
        `https://api.github.com/repos/${mediaRepo}`,
        {
          headers: authHeaders(settings),
          cache: 'no-store',
        },
        MEDIA_API_TIMEOUT_MS
      )
      if (repoRes.status === 404) {
        // リポ未作成 = まだ何も添付していない
        return { ok: true, assets: [], truncated: false }
      }
      // リポは在るのに tree が引けない（ref 解決失敗・レプリケーション遅延等）は
      // 空一覧に見せかけず、エラー + 再試行に落とす
      return { ok: false, errorKind: 'fetch_failed', httpStatus: res.status }
    }
    if (!res.ok) {
      return { ok: false, errorKind: 'fetch_failed', httpStatus: res.status }
    }
    const json = await res.json()
    const tree = json?.tree
    // tree は配列で返る。非配列応答（想定外）は空扱いにして UI を壊さない
    if (!Array.isArray(tree)) {
      return { ok: true, assets: [], truncated: false }
    }
    return {
      ok: true,
      assets: mapTreeToMediaAssets(tree, mediaRepo),
      truncated: json.truncated === true,
    }
  } catch (error) {
    console.error('listMediaAssets failed:', error)
    return { ok: false, errorKind: 'fetch_failed' }
  }
}

/**
 * メディアアセット 1 件を削除する（Contents API DELETE、sha 必須）。
 * 成功後、ローカルの mediaCache / mediaPending から該当エントリを evict する
 * （best-effort。リモート削除は既に成立しているため evict 失敗は無視する）。
 */
export async function deleteMediaAsset(
  settings: Settings,
  path: string,
  sha: string
): Promise<MediaDeleteResult> {
  if (!isMediaConfigured(settings)) {
    return { ok: false, errorKind: 'not_configured' }
  }
  const mediaRepo = getMediaRepoFullName(settings.repoName)
  try {
    // #262: ユーザー起点の操作なのでチェーンは塞がないが、ストール時に
    // 削除ボタンが無期限にぶら下がらないよう同じ 30 秒で有限化する
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${mediaRepo}/contents/${encodeURIComponent(path)}`,
      {
        method: 'DELETE',
        headers: { ...authHeaders(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Agasteer media delete: ${path}`,
          sha,
          committer: {
            name: 'agasteer',
            email: 'agasteer@users.noreply.github.com',
          },
        }),
      },
      MEDIA_API_TIMEOUT_MS
    )
    if (!res.ok) {
      return { ok: false, errorKind: 'fetch_failed', httpStatus: res.status }
    }
    // メディアはリポルート直下なので path = filename。cache は rawUrl、pending は filename がキー
    const rawUrl = buildRawMediaUrl(mediaRepo, path)
    await Promise.allSettled([deleteCachedMedia(rawUrl), deletePendingMedia(path)])
    return { ok: true }
  } catch (error) {
    console.error('deleteMediaAsset failed:', error)
    return { ok: false, errorKind: 'fetch_failed' }
  }
}
