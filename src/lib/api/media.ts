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
import { MEDIA_API_TIMEOUT_MS, calcMediaPutTimeoutMs } from './media/timeouts'
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

/** GitHub API の認証ヘッダ。media-library.ts（一覧・削除）と共用する */
export function authHeaders(settings: Settings): Record<string, string> {
  return { Authorization: `Bearer ${settings.token}` }
}

// ============================================
// fetch タイムアウト（#252: 背景アップロードチェーンの head-of-line blocking 防止）
// ============================================

// 閾値と算出は純粋層 media/timeouts.ts に分離。テスト・チューニングの単一参照点として再公開する
export {
  MEDIA_API_TIMEOUT_MS,
  MEDIA_PUT_TIMEOUT_BASE_MS,
  MEDIA_PUT_MIN_BYTES_PER_SEC,
  calcMediaPutTimeoutMs,
} from './media/timeouts'

/**
 * AbortController によるタイムアウト付き fetch。
 *
 * #247 のグローバル直列化（uploadChain）は、チェーン内のどれか 1 つの fetch が
 * 永久 pending になると以後の背景アップロードが全て止まる（head-of-line blocking）。
 * チェーン経路の全 fetch に上限を入れ、ストールを reject → 既存の catch →
 * 「false（pending 残置）」に落とすことでチェーンを必ず前進させる。
 * pending に残ったアイテムは online 復帰・次回起動の initMediaOnlineRetry が回収する。
 *
 * AbortSignal.timeout() の一行で書けるが意図的に使わない: Node の実装は
 * vitest の fake timers（vi.useFakeTimers）に乗らず、タイムアウト挙動を
 * 決定的にテストできなくなるため（media-timeout.test.ts が時計を進めて検証する）。
 *
 * タイマーは応答**ヘッダ**到着で解除する（本文ストリーミングは対象外）。
 * ストールの典型（接続不能・応答が永遠に来ない）を有限化するのが目的で、
 * 進行中の大きい本文転送を途中で切らない。
 *
 * media-library.ts（一覧・削除）も共用する（#262）ため export する。
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

// ============================================
// メディアリポの lazy 作成
// ============================================

/** セッション内で存在確認済みのメディアリポ（フルネーム）。重複 GET を避ける */
const ensuredMediaRepos = new Set<string>()

/**
 * メディアリポの default branch（フルネーム → ブランチ名）。
 * ensureMediaRepo の存在確認/作成レスポンスから捕捉し、履歴スナップショット化
 * （collapseMediaHistory）の ref 更新先に使う。未捕捉時は 'main' にフォールバック
 * （auto_init 作成リポの既定。外れても ref GET が 404 → collapse をスキップするだけで無害）。
 */
const mediaDefaultBranches = new Map<string, string>()

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
    const repoRes = await fetchWithTimeout(
      `https://api.github.com/repos/${mediaRepo}`,
      {
        headers: authHeaders(settings),
        cache: 'no-store',
      },
      MEDIA_API_TIMEOUT_MS
    )
    if (repoRes.ok) {
      ensuredMediaRepos.add(mediaRepo)
      const repoJson = await repoRes.json().catch(() => null)
      if (typeof repoJson?.default_branch === 'string') {
        mediaDefaultBranches.set(mediaRepo, repoJson.default_branch)
      }
      return { ok: true }
    }
    if (repoRes.status !== 404) {
      return { ok: false, errorKind: 'repo_unavailable', httpStatus: repoRes.status }
    }
    const createRes = await fetchWithTimeout(
      'https://api.github.com/user/repos',
      {
        method: 'POST',
        headers: { ...authHeaders(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // POST /user/repos の name は owner なしの短縮名
          name: mediaRepo.slice(mediaRepo.indexOf('/') + 1),
          private: true,
          auto_init: true,
          description: 'Agasteer media attachments',
        }),
      },
      MEDIA_API_TIMEOUT_MS
    )
    // 422 = name already exists（並行タブとの作成 race）→ 存在するので成功扱い
    if (createRes.ok || createRes.status === 422) {
      ensuredMediaRepos.add(mediaRepo)
      if (createRes.ok) {
        const createJson = await createRes.json().catch(() => null)
        if (typeof createJson?.default_branch === 'string') {
          mediaDefaultBranches.set(mediaRepo, createJson.default_branch)
        }
      }
      return { ok: true }
    }
    return { ok: false, errorKind: 'repo_unavailable', httpStatus: createRes.status }
  } catch (error) {
    console.error('ensureMediaRepo failed:', error)
    return { ok: false, errorKind: 'repo_unavailable' }
  }
}

// ============================================
// 履歴スナップショット化（#250: 履歴を残さないコミット方式）
// ============================================

/**
 * メディアリポの履歴を「直前の変更と同じ tree を指す親なしコミット 1 つ」に置き換える。
 *
 * メディアは世代管理が不要（最新の状態だけあればよい）なのに、Contents API の
 * 変更はコミットを積み上げ、削除してもファイルは履歴に残り続けてリポが単調に
 * 肥大する。そこで**変更のたびに**履歴を畳み、リポを常に 1 コミット＝現在の
 * ファイルだけに保つ（手動メンテのボタンは設けない。ユーザー操作なしで常に最適）。
 *
 * 手順（すべて Contents 権限で足りる Git Database API。追加のトークン権限は不要）:
 * 1. POST /git/commits: 変更コミットと同じ tree を指す親なしコミットを作る
 * 2. GET /git/ref: HEAD がまだ自分の変更コミットか確認。違えば**スキップ**
 *    （他デバイスの並行変更を force 更新で握り潰さないためのガード。
 *    畳み損ねた履歴は次回の変更時にまとめて畳まれる＝自己修復）
 * 3. PATCH /git/refs（force）: ref を親なしコミットへ差し替え
 *
 * 完全な CAS は GitHub API に無いため 2→3 の間の極小窓は残るが、単一ユーザー×
 * 複数デバイスで同一秒に別デバイスが変更を入れる場合に限られ、実害は
 * 「その変更が tree から落ちる」ではなく（tree は自分の変更コミット由来で不変）、
 * 「相手のコミットが履歴から消える」のみ。相手のファイル自体は内容アドレス
 * dedup により相手側の次回リトライ/存在チェックで整合する。
 *
 * best-effort: どの段階で失敗しても false を返すだけで呼び出し元の成功は覆さない
 * （履歴が残るだけで、データ・URL・表示への影響はゼロ。次回変更時に再試行される）。
 */
export async function collapseMediaHistory(
  settings: Settings,
  repoFullName: string,
  expectedHeadSha: string,
  treeSha: string
): Promise<boolean> {
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
      return false
    }
    const newSha = (await commitRes.json())?.sha
    if (typeof newSha !== 'string') {
      return false
    }
    // HEAD が自分の変更コミットのままか確認（並行変更の握り潰し防止）
    const refRes = await fetchWithTimeout(
      `https://api.github.com/repos/${repoFullName}/git/ref/heads/${branch}`,
      { headers: authHeaders(settings), cache: 'no-store' },
      MEDIA_API_TIMEOUT_MS
    )
    if (!refRes.ok) {
      return false
    }
    const currentSha = (await refRes.json())?.object?.sha
    if (currentSha !== expectedHeadSha) {
      return false
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
    return patchRes.ok
  } catch (error) {
    console.warn('Media history collapse failed (history kept, will retry on next change):', error)
    return false
  }
}

// ============================================
// アップロード（enqueue → URL 即返し → 背景アップロード）
// ============================================

// 実アップロードは URL 確定後に背景で直列実行する。
// Contents API は default branch へ直接コミットするため、同一リポへの
// 並行 PUT は 409 になりうる。グローバルに直列化して衝突を避ける。
// チェーン経路の全 fetch にはタイムアウト（#252）が入っており、
// 1 件のストールで以後の背景アップロードが止まり続けることはない。
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
    // Accept は object メディアタイプを明示する: 既定の JSON 表現は 1MB 超の
    // 既存ファイルに 403（too_large）を返すため、1MB 超のアイテムが永遠に
    // dedup できず pending に残り続ける（object は 1〜100MB でも 200 + content 空で返る）。
    // タイムアウトで中断した PUT がサーバ側では完了していた場合の回収経路でもある（#252）
    const existsRes = await fetchWithTimeout(
      `${contentsUrl}?t=${Date.now()}`,
      {
        headers: { ...authHeaders(settings), Accept: 'application/vnd.github.object+json' },
      },
      MEDIA_API_TIMEOUT_MS
    )
    if (!existsRes.ok && existsRes.status !== 404) {
      return false
    }
    if (existsRes.status === 404) {
      const body = JSON.stringify({
        message: `Agasteer media upload: ${item.filename}`,
        content: encodeArrayBufferToBase64(item.data),
        committer: {
          name: 'agasteer',
          email: 'agasteer@users.noreply.github.com',
        },
      })
      // PUT はボディが大きい（base64 で元サイズの約 4/3）ため、
      // サイズ比例のタイムアウトで正当な低速アップロードを誤中断しない。
      // 注: abort はクライアント側の待機を切るだけで、サーバ側では PUT の
      // コミットが完了していることがあり得る。その場合チェーンは前進済みなので
      // 次アイテムの PUT が同一リポで並行し 409 になり得るが、409 は
      // false（pending 残置）→ リトライで回収され、アイテム自身も次回の
      // 存在チェック 200 で dedup される。#247 の直列化不変条件は
      // 「恒久ブロックしない」ためにこの限定的な劣化を受容する（#252）
      const putRes = await fetchWithTimeout(
        contentsUrl,
        {
          method: 'PUT',
          headers: { ...authHeaders(settings), 'Content-Type': 'application/json' },
          body,
        },
        calcMediaPutTimeoutMs(body.length)
      )
      // 422 = 同名パスが並行作成された race。同名=同内容なので成功扱い
      if (!putRes.ok && putRes.status !== 422) {
        return false
      }
      // 履歴を残さないコミット方式（#250）: PUT が作ったコミットを、同じ tree を
      // 指す親なしコミットに即置き換え、リポを常に 1 コミットに保つ。
      // PUT 応答から commit/tree が取れないケース（422 race 等）はスキップ
      //（履歴が 1 回分残るだけで、次回の変更時にまとめて畳まれる）
      if (putRes.ok) {
        const putJson = await putRes.json().catch(() => null)
        const commitSha = putJson?.commit?.sha
        const treeSha = putJson?.commit?.tree?.sha
        if (typeof commitSha === 'string' && typeof treeSha === 'string') {
          await collapseMediaHistory(settings, parsed.repoFullName, commitSha, treeSha)
        }
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
    // #262: ヘッダ到着までを 30 秒で有限化（失敗時はプレビューの「再試行」UI が受ける）。
    // タイマーはヘッダ到着で解除されるため、100MB 級の本文ダウンロードは切られない
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${parsed.repoFullName}/contents/${encodeURIComponent(parsed.path)}`,
      {
        headers: {
          ...authHeaders(settings),
          Accept: 'application/vnd.github.raw',
        },
      },
      MEDIA_API_TIMEOUT_MS
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
