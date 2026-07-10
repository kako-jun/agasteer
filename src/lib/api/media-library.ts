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
import { isMediaConfigured, type MediaErrorKind } from './media'
import { getMediaRepoFullName, buildRawMediaUrl } from './media/naming'
import { mapContentsToMediaAssets, type MediaAsset } from './media/library'
import { deleteCachedMedia, deletePendingMedia } from '../data/media-storage'

// 取り込んだ MediaAsset をこの層の公開型としても再輸出する（UI は media-library から引く）
export type { MediaAsset }

export type MediaListResult =
  | { ok: true; assets: MediaAsset[] }
  | { ok: false; errorKind: MediaErrorKind; httpStatus?: number }

export type MediaDeleteResult =
  | { ok: true }
  | { ok: false; errorKind: MediaErrorKind; httpStatus?: number }

function authHeaders(settings: Settings): Record<string, string> {
  return { Authorization: `Bearer ${settings.token}` }
}

/**
 * メディアリポ直下のアセット一覧を取得する。
 *
 * - 未設定（token / `owner/repo` 形式でない）は not_configured。
 * - 404（メディアリポ未作成＝まだ何も添付していない）は成功扱いで空配列を返す。
 * - それ以外の HTTP エラー・ネットワークエラーは fetch_failed（UI は再試行導線を出す）。
 */
export async function listMediaAssets(settings: Settings): Promise<MediaListResult> {
  if (!isMediaConfigured(settings)) {
    return { ok: false, errorKind: 'not_configured' }
  }
  const mediaRepo = getMediaRepoFullName(settings.repoName)
  try {
    const res = await fetch(`https://api.github.com/repos/${mediaRepo}/contents/`, {
      headers: authHeaders(settings),
      cache: 'no-store',
    })
    // 404 = メディアリポ未作成。まだ添付が 0 件なだけなので成功（空配列）として扱う
    if (res.status === 404) {
      return { ok: true, assets: [] }
    }
    if (!res.ok) {
      return { ok: false, errorKind: 'fetch_failed', httpStatus: res.status }
    }
    const items = await res.json()
    // ディレクトリ一覧は配列で返る。非配列応答（想定外）は空扱いにして UI を壊さない
    if (!Array.isArray(items)) {
      return { ok: true, assets: [] }
    }
    return { ok: true, assets: mapContentsToMediaAssets(items, mediaRepo) }
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
    const res = await fetch(
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
      }
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
