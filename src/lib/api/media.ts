/**
 * メディア同期層（副作用層: HTTP・pending キュー・キャッシュ）(#242)
 *
 * メディア添付は notes リポとは別の `{owner}/{repo}-media` プライベートリポに保存する。
 * ワールド（WorldType）とは独立したサブシステムであり、Push/Pull フローには関与しない。
 * 純粋層（命名・検証・base64・LRU）は media/ 配下に分離している（github/ の分割パターン踏襲）。
 *
 * - アップロードは「enqueue → URL 即返し → 背景で直列アップロード → 失敗/オフラインは online 復帰でリトライ」
 * - raw URL は内容 SHA-256 から即時確定するため、呼び出し元はアップロード完了を待たずに URL を得る
 * - 取得は raw URL をパースし Contents API（Accept: application/vnd.github.raw）を認証付きで叩く。
 *   raw.githubusercontent.com への直接 fetch は private リポでは CORS/認証とも通らない（#190 実測）
 */

import type { Settings } from '../types'
import { encodeArrayBufferToBase64 } from './media/base64'
import {
  getMediaRepoFullName,
  sha256Hex,
  buildMediaFileName,
  buildRawMediaUrl,
  parseRawMediaUrl,
} from './media/naming'
import { validateMedia } from './media/validation'
import { shouldCacheMediaSize, selectCacheEvictions } from './media/lru'
import {
  putPendingMedia,
  getPendingMedia,
  getAllPendingMedia,
  deletePendingMedia,
  getCachedMedia,
  putCachedMedia,
  deleteCachedMedia,
  getAllCachedMediaMeta,
  type MediaPendingItem,
} from '../data/media-storage'

// ============================================
// 結果型（i18n メッセージは後続 Issue の UI が errorKind から引く）
// ============================================

export type MediaErrorKind =
  | 'not_configured' // token / repoName 未設定
  | 'format_not_allowed' // 形式ホワイトリスト外
  | 'size_exceeded' // 100MB 超
  | 'repo_unavailable' // メディアリポの確認・lazy 作成に失敗
  | 'invalid_url' // raw URL としてパースできない
  | 'fetch_failed' // 認証付き取得に失敗
  | 'storage_failed' // ファイル読み取り・pending キュー書き込み（ローカル）に失敗

export type MediaUploadResult =
  | {
      ok: true
      /** 確定 raw URL（アップロード完了を待たずに埋め込みに使える） */
      url: string
      /**
       * 実アップロードの背景タスク。解決値: true=即時アップロード完了 /
       * false=キュー保留（オフライン or 失敗、online 復帰でリトライ）。
       * 呼び出し側は url を即挿入し、このプロミスの解決で完了/保留トーストを出す。
       */
      uploadDone: Promise<boolean>
    }
  | { ok: false; errorKind: MediaErrorKind; httpStatus?: number }

export type MediaFetchResult =
  | { ok: true; data: ArrayBuffer }
  | { ok: false; errorKind: MediaErrorKind; httpStatus?: number }

/**
 * メディア機能が使える設定（token + `owner/repo` 形式の repoName）かを判定する。
 * UI 側（添付フロー）が事前判定に使えるよう export する（#243 レビュー nit-3）。
 */
export function isMediaConfigured(settings: Settings): boolean {
  // `owner/repo` 形式（owner・repo とも非空）だけを設定済みとみなす。
  // 先頭スラッシュ（"/repo"）・末尾スラッシュ（"owner/"）は弾く
  const slashIndex = settings.repoName.indexOf('/')
  return Boolean(settings.token) && slashIndex > 0 && slashIndex < settings.repoName.length - 1
}

function authHeaders(settings: Settings): Record<string, string> {
  return { Authorization: `Bearer ${settings.token}` }
}

// ============================================
// メディアリポの lazy 作成
// ============================================

/** セッション内で存在確認済みのメディアリポ（フルネーム）。重複 GET を避ける */
const ensuredMediaRepos = new Set<string>()

/**
 * メディアリポ `{owner}/{repo}-media` の存在を確認し、404 なら lazy 作成する。
 * private + auto_init（default branch と初期コミットを持たせ、Contents API を即使えるようにする）。
 *
 * mediaRepoFullName 省略時は settings.repoName から導出する。
 * uploadPendingItem は item.url 由来のフルネームを渡す
 * （リポ切替と重なっても URL・存在確認・アップロード先が構造的に一致する）。
 * メモ化 Set のキーも渡されたフルネーム基準。
 */
export async function ensureMediaRepo(
  settings: Settings,
  mediaRepoFullName?: string
): Promise<{ ok: boolean; errorKind?: MediaErrorKind; httpStatus?: number }> {
  if (!isMediaConfigured(settings)) {
    return { ok: false, errorKind: 'not_configured' }
  }
  const mediaRepo = mediaRepoFullName ?? getMediaRepoFullName(settings.repoName)
  if (ensuredMediaRepos.has(mediaRepo)) {
    return { ok: true }
  }
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${mediaRepo}`, {
      headers: authHeaders(settings),
      cache: 'no-store',
    })
    if (repoRes.ok) {
      ensuredMediaRepos.add(mediaRepo)
      return { ok: true }
    }
    if (repoRes.status !== 404) {
      return { ok: false, errorKind: 'repo_unavailable', httpStatus: repoRes.status }
    }
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: { ...authHeaders(settings), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // POST /user/repos の name は owner なしの短縮名
        name: mediaRepo.slice(mediaRepo.indexOf('/') + 1),
        private: true,
        auto_init: true,
        description: 'Agasteer media attachments',
      }),
    })
    // 422 = name already exists（並行タブとの作成 race）→ 存在するので成功扱い
    if (createRes.ok || createRes.status === 422) {
      ensuredMediaRepos.add(mediaRepo)
      return { ok: true }
    }
    return { ok: false, errorKind: 'repo_unavailable', httpStatus: createRes.status }
  } catch (error) {
    console.error('ensureMediaRepo failed:', error)
    return { ok: false, errorKind: 'repo_unavailable' }
  }
}

// ============================================
// アップロード（enqueue → URL 即返し → 背景アップロード）
// ============================================

// 実アップロードは URL 確定後に背景で直列実行する。
// Contents API は default branch へ直接コミットするため、同一リポへの
// 並行 PUT は 409 になりうる。グローバルに直列化して衝突を避ける。
let uploadChain: Promise<unknown> = Promise.resolve()

/**
 * メディアファイルをアップロードする。URL 確定＝完了を待たず即返す。
 *
 * 1. 形式・サイズ検証（この層で強制）
 * 2. 内容 SHA-256 からファイル名・raw URL を確定
 * 3. pending キューに enqueue（この時点で URL は IndexedDB に永続化される。
 *    アプリを閉じても次回 initMediaOnlineRetry が拾うため、挿入した URL は孤児化しない）
 * 4. enqueue 完了で即返す。実アップロードは待たず背景で直列実行し uploadDone として返す
 *    （オフラインは即 false 解決＝キュー保留。online 復帰でリトライ）
 */
export async function uploadMedia(file: File, settings: Settings): Promise<MediaUploadResult> {
  if (!isMediaConfigured(settings)) {
    return { ok: false, errorKind: 'not_configured' }
  }
  const validationError = validateMedia(file.name, file.size)
  if (validationError) {
    return { ok: false, errorKind: validationError }
  }

  let item: MediaPendingItem
  try {
    const data = await file.arrayBuffer()
    const hash = await sha256Hex(data)
    const filename = buildMediaFileName(new Date(), hash, file.name)
    const url = buildRawMediaUrl(getMediaRepoFullName(settings.repoName), filename)
    item = {
      filename,
      url,
      data,
      size: data.byteLength,
      mimeType: file.type,
      enqueuedAt: Date.now(),
    }
    await putPendingMedia(item)
  } catch (error) {
    // File 読み取り失敗・IndexedDB 書き込み失敗。pending に実体が残らないため
    // URL を返さず失敗にする（結果オブジェクト契約: この層は throw しない）
    console.error('Media enqueue failed:', error)
    return { ok: false, errorKind: 'storage_failed' }
  }

  // オフラインは即時試行せずキュー保留（online 復帰でリトライ）。チェーンも塞がない
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: true, url: item.url, uploadDone: Promise.resolve(false) }
  }
  const uploadDone = uploadChain.then(() => uploadPendingItem(item, settings))
  // チェーン末尾は成否を飲み込み次のアップロードを止めない
  uploadChain = uploadDone.then(
    () => undefined,
    () => undefined
  )
  return { ok: true, url: item.url, uploadDone }
}

/**
 * pending アイテム 1 件のアップロードを試みる。成功したらキューから除去しキャッシュに載せる。
 * 失敗（オフライン・API エラー）は false を返し、キューに残す（online 復帰でリトライ）。
 */
async function uploadPendingItem(item: MediaPendingItem, settings: Settings): Promise<boolean> {
  // アップロード先は実行時の settings.repoName ではなく item.url から導出する。
  // リポ切替とリトライが重なっても、埋め込んだ URL とアップロード先が構造的に一致する
  const parsed = parseRawMediaUrl(item.url)
  if (!parsed) {
    // buildRawMediaUrl 由来の URL は必ずパースできる。到達したら pending の破損
    console.warn('Media pending item has an unparseable URL (skipped):', item.url)
    return false
  }
  // 存在確認・lazy 作成も item.url 由来のリポに対して行う
  const ensured = await ensureMediaRepo(settings, parsed.repoFullName)
  if (!ensured.ok) {
    return false
  }
  const contentsUrl = `https://api.github.com/repos/${parsed.repoFullName}/contents/${encodeURIComponent(parsed.path)}`
  try {
    // 内容アドレス dedup: ファイル名に内容ハッシュを含むため、同名が既にあれば同内容。
    // アップロード自体をスキップしてキューだけ掃除する。
    const existsRes = await fetch(`${contentsUrl}?t=${Date.now()}`, {
      headers: authHeaders(settings),
    })
    if (!existsRes.ok && existsRes.status !== 404) {
      return false
    }
    if (existsRes.status === 404) {
      const putRes = await fetch(contentsUrl, {
        method: 'PUT',
        headers: { ...authHeaders(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Agasteer media upload: ${item.filename}`,
          content: encodeArrayBufferToBase64(item.data),
          committer: {
            name: 'agasteer',
            email: 'agasteer@users.noreply.github.com',
          },
        }),
      })
      // 422 = 同名パスが並行作成された race。同名=同内容なので成功扱い
      if (!putRes.ok && putRes.status !== 422) {
        return false
      }
    }
    await deletePendingMedia(item.filename)
    // アップロード済みデータを手元にも残す（20MB 超はキャッシュしない）
    await cacheMedia(item.url, item.data)
    return true
  } catch (error) {
    console.warn('Media upload failed (kept in pending queue):', error)
    return false
  }
}

// ============================================
// pending キューのリトライ
// ============================================

/** online イベントは短時間に多重発火しうる（#203 と同様）ため in-flight ガードを置く */
let retryInFlight = false

/**
 * pending キューの全アイテムを古い順にアップロード試行する。
 */
export async function retryPendingUploads(
  settings: Settings
): Promise<{ attempted: number; uploaded: number }> {
  if (retryInFlight || !isMediaConfigured(settings)) {
    return { attempted: 0, uploaded: 0 }
  }
  retryInFlight = true
  try {
    const items = await getAllPendingMedia()
    let uploaded = 0
    for (const item of items) {
      if (await uploadPendingItem(item, settings)) {
        uploaded++
      }
    }
    return { attempted: items.length, uploaded }
  } catch (error) {
    console.warn('retryPendingUploads failed:', error)
    return { attempted: 0, uploaded: 0 }
  } finally {
    retryInFlight = false
  }
}

/**
 * online 復帰時に pending キューを自動リトライするリスナーを登録する。
 * initApp から 1 回だけ呼ぶ。戻り値は解除関数。
 * 登録時にも一度リトライを蹴る（前セッション積み残しの回収。
 * in-flight ガード・内容アドレス dedup 済みのため冪等）。
 */
export function initMediaOnlineRetry(getSettings: () => Settings): () => void {
  const handler = () => {
    void retryPendingUploads(getSettings())
  }
  window.addEventListener('online', handler)
  handler()
  return () => window.removeEventListener('online', handler)
}

// ============================================
// 取得（fetch / resolve）
// ============================================

/**
 * raw URL のメディアを認証付きで取得する。
 * raw URL をパースして Contents API（Accept: application/vnd.github.raw）経由で取る。
 * branch は指定せず default branch を使う（auto_init 作成直後は main）。
 */
export async function fetchMedia(url: string, settings: Settings): Promise<MediaFetchResult> {
  if (!isMediaConfigured(settings)) {
    return { ok: false, errorKind: 'not_configured' }
  }
  const parsed = parseRawMediaUrl(url)
  if (!parsed) {
    return { ok: false, errorKind: 'invalid_url' }
  }
  try {
    // parseRawMediaUrl が安全文字に絞っているが、防御の二重化としてエンコードも掛ける
    const res = await fetch(
      `https://api.github.com/repos/${parsed.repoFullName}/contents/${encodeURIComponent(parsed.path)}`,
      {
        headers: {
          ...authHeaders(settings),
          Accept: 'application/vnd.github.raw',
        },
      }
    )
    if (!res.ok) {
      return { ok: false, errorKind: 'fetch_failed', httpStatus: res.status }
    }
    return { ok: true, data: await res.arrayBuffer() }
  } catch (error) {
    console.error('fetchMedia failed:', error)
    return { ok: false, errorKind: 'fetch_failed' }
  }
}

/**
 * raw URL からメディアの実体を解決する。解決順: pending → cache → 認証 fetch。
 * fetch 成功時は 20MB 以下なら LRU キャッシュに載せる。
 */
export async function resolveMedia(url: string, settings: Settings): Promise<MediaFetchResult> {
  const parsed = parseRawMediaUrl(url)
  if (!parsed) {
    return { ok: false, errorKind: 'invalid_url' }
  }

  // 1. pending: 未アップロードでもローカルにデータがある（オフライン直後の表示用）
  try {
    const pending = await getPendingMedia(parsed.path)
    if (pending) {
      return { ok: true, data: pending.data }
    }
  } catch (error) {
    console.warn('Media pending lookup failed (falling back to cache/fetch):', error)
  }

  // 2. cache: ヒット時は lastAccessedAt を更新して LRU 順位を上げる（best-effort）
  try {
    const cached = await getCachedMedia(url)
    if (cached) {
      putCachedMedia({ ...cached, lastAccessedAt: Date.now() }).catch((error) => {
        console.warn('Media cache touch failed (ignored):', error)
      })
      return { ok: true, data: cached.data }
    }
  } catch (error) {
    console.warn('Media cache lookup failed (falling back to fetch):', error)
  }

  // 3. 認証付き fetch
  const result = await fetchMedia(url, settings)
  if (result.ok) {
    await cacheMedia(url, result.data)
  }
  return result
}

/**
 * メディアをキャッシュに載せる（best-effort）。
 * 1 件 20MB 超はキャッシュせず、総量 200MB を超える分は LRU で追い出す。
 */
async function cacheMedia(url: string, data: ArrayBuffer): Promise<void> {
  if (!shouldCacheMediaSize(data.byteLength)) {
    return
  }
  try {
    const metas = (await getAllCachedMediaMeta()).filter((meta) => meta.url !== url)
    for (const evictUrl of selectCacheEvictions(metas, data.byteLength)) {
      await deleteCachedMedia(evictUrl)
    }
    await putCachedMedia({ url, data, size: data.byteLength, lastAccessedAt: Date.now() })
  } catch (error) {
    // キャッシュは補助機構。失敗しても本流（アップロード/取得）は成立している
    console.warn('Media cache write failed (ignored):', error)
  }
}
