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
  MEDIA_API_TIMEOUT_MS,
  MEDIA_IDB_TIMEOUT_MS,
  calcMediaPutTimeoutMs,
  raceWithTimeout,
} from './media/timeouts'
import { authHeaders, fetchWithTimeout, readJsonWithTimeout } from './media/http'
import {
  collapseMediaHistory,
  extractMutationCommit,
  recordMediaDefaultBranch,
} from './media/history'
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

// ============================================
// 分離モジュールの再公開（media-library.ts・テストの単一参照点）
// ============================================

// 閾値と算出は純粋層 media/timeouts.ts、HTTP ヘルパは media/http.ts、
// 履歴を残さないコミット方式（#250）は media/history.ts に分離している
export {
  MEDIA_API_TIMEOUT_MS,
  MEDIA_IDB_TIMEOUT_MS,
  MEDIA_PUT_TIMEOUT_BASE_MS,
  MEDIA_PUT_MIN_BYTES_PER_SEC,
  calcMediaPutTimeoutMs,
  raceWithTimeout,
} from './media/timeouts'
export { authHeaders, fetchWithTimeout, readJsonWithTimeout } from './media/http'
export { collapseMediaHistory, extractMutationCommit } from './media/history'

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
      // 本文読みは上限つき（チェーン経路で素の json() を待つと #252 の HOL 保証を破る）
      const repoJson = (await readJsonWithTimeout(repoRes)) as { default_branch?: unknown } | null
      if (typeof repoJson?.default_branch === 'string') {
        recordMediaDefaultBranch(mediaRepo, repoJson.default_branch)
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
        const createJson = (await readJsonWithTimeout(createRes)) as {
          default_branch?: unknown
        } | null
        if (typeof createJson?.default_branch === 'string') {
          recordMediaDefaultBranch(mediaRepo, createJson.default_branch)
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
// アップロード（enqueue → URL 即返し → 背景アップロード）
// ============================================

// 実アップロードは URL 確定後に背景で直列実行する。
// Contents API は default branch へ直接コミットするため、同一リポへの
// 並行 PUT は 409 になりうる。グローバルに直列化して衝突を避ける。
// チェーン経路の全 fetch にはタイムアウト（#252）、全 IndexedDB 操作にも
// タイムアウト（#261: boundIdb）が入っており、1 件のストールで以後の
// 背景アップロードが止まり続けることはない。
let uploadChain: Promise<unknown> = Promise.resolve()

/**
 * IndexedDB 操作を MEDIA_IDB_TIMEOUT_MS で有限化する（#261）。
 * IDB のハング（Safari プライベートモード・storage pressure・別タブの
 * versionchange ブロック等）は request が settle しないまま止まるため、
 * try/catch だけでは防げない。タイムアウト時も元の操作は裏で継続するが、
 * ローカル操作なので #247 の直列化（409 回避）を壊さない（fetch の race 案を
 * 不採用にした理由が当たらない）。遅延完了しても冪等: delete の遅延実行は
 * 内容アドレス dedup が回収し、put の遅延実行は同キー上書きで無害。
 */
function boundIdb<T>(operation: Promise<T>, label: string): Promise<T> {
  return raceWithTimeout(operation, MEDIA_IDB_TIMEOUT_MS, label)
}

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
    // #261: enqueue の IDB 書き込みがハングすると uploadMedia が永遠に返らず、
    // 添付ループ（attachMediaFiles）ごと止まる。有限化して storage_failed に落とす。
    // タイムアウト後に書き込みが遅延成立した場合、URL 未挿入のアイテムが pending に
    // 残りリトライでアップロードされうるが、ライブラリに「未参照」として現れ削除できる
    await boundIdb(putPendingMedia(item), 'putPendingMedia')
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
      // PUT 応答から commit/tree が取れないケース（422 race・本文ストール等）は
      // スキップ（履歴が残るだけで、次回の変更時にまとめて畳まれる）
      if (putRes.ok) {
        const commit = extractMutationCommit(await readJsonWithTimeout(putRes))
        if (commit) {
          // バッチ最適化: 自分の後ろにまだ pending が残っているなら畳みを後続に
          // 委ねる（中間の畳みは最後の 1 回に完全に包含されるため、複数添付で
          // 3×(N-1) 回の無駄な API 呼び出しを避ける）。キューが失敗等で
          // 途切れた場合も、次に成功した変更の畳みが履歴をまとめて回収する
          const others = (await boundIdb(getAllPendingMedia(), 'getAllPendingMedia')).filter(
            (pendingItem) => pendingItem.filename !== item.filename
          )
          if (others.length === 0) {
            const collapsed = await collapseMediaHistory(
              settings,
              parsed.repoFullName,
              commit.sha,
              commit.treeSha
            )
            if (collapsed === 'skipped_head_moved') {
              // 並行変更を検知した＝どこかのデバイスの force 差し替えと交錯した
              // 可能性がある。自ファイルが HEAD から落とされていないか確認し、
              // 見えなければ dequeue せず pending に残す（リトライが dedup 経由で
              // 再アップロードして自己修復する）。ここで黙って dequeue すると、
              // アップロード成功済みのファイルが誰にも再送されず消失し得る
              const verifyRes = await fetchWithTimeout(
                `${contentsUrl}?t=${Date.now()}`,
                {
                  headers: {
                    ...authHeaders(settings),
                    Accept: 'application/vnd.github.object+json',
                  },
                },
                MEDIA_API_TIMEOUT_MS
              )
              if (verifyRes.status === 404) {
                console.warn(
                  'Media upload was clobbered by a concurrent history collapse; keeping it pending for retry:',
                  item.filename
                )
                return false
              }
            }
          }
        }
      }
    }
    // #261: dequeue の IDB 削除がハングすると uploadDone が settle せずチェーンが
    // 恒久ウェッジする（#252 と同型の head-of-line blocking）。有限化して false
    // （pending 残置）に落とす。アップロード自体は成立済みなので、リトライは
    // 存在チェック 200 の dedup で dequeue だけをやり直す
    await boundIdb(deletePendingMedia(item.filename), 'deletePendingMedia')
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

/**
 * online イベントは短時間に多重発火しうる（#203 と同様）ため in-flight ガードを置く。
 * 期限つきフラグにはしない: この関数内の await は fetch（#252）・IndexedDB（#261）
 * とも全てタイムアウトで有限化されており、finally が必ず走る＝フラグが恒久的に
 * 立ちっぱなしになる経路が構造的にない。期限奪還を足すと、正当に長い
 * リトライ（大容量 × 複数件のサイズ比例 PUT タイムアウト）と並行して二重ループが
 * 走り、同一リポへの並行 PUT（409 の温床）を自ら作ってしまう
 */
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
    // #261: 素の getAll がハングすると finally に到達せず、以後の全リトライが
    // in-flight ガードで弾かれ続ける（pending キューが永遠にドレインできない）
    const items = await boundIdb(getAllPendingMedia(), 'getAllPendingMedia')
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
  // IDB ルックアップは有限化する（#261: ハングでプレビューが無限スピナーにならず、
  // 次のティア＝キャッシュ/認証 fetch へフォールバックする）
  try {
    const pending = await boundIdb(getPendingMedia(parsed.path), 'getPendingMedia')
    if (pending) {
      return { ok: true, data: pending.data }
    }
  } catch (error) {
    console.warn('Media pending lookup failed (falling back to cache/fetch):', error)
  }

  // 2. cache: ヒット時は lastAccessedAt を更新して LRU 順位を上げる（best-effort）
  try {
    const cached = await boundIdb(getCachedMedia(url), 'getCachedMedia')
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
    // #261: キャッシュ書き込み系の IDB ハングは、チェーン経路（uploadPendingItem）
    // では uploadDone を settle させず背景アップロードを恒久停止させ、取得経路
    // （resolveMedia）ではプレビュー解決を無限待ちにする。全て有限化する
    const metas = (await boundIdb(getAllCachedMediaMeta(), 'getAllCachedMediaMeta')).filter(
      (meta) => meta.url !== url
    )
    for (const evictUrl of selectCacheEvictions(metas, data.byteLength)) {
      await boundIdb(deleteCachedMedia(evictUrl), 'deleteCachedMedia')
    }
    await boundIdb(
      putCachedMedia({ url, data, size: data.byteLength, lastAccessedAt: Date.now() }),
      'putCachedMedia'
    )
  } catch (error) {
    // キャッシュは補助機構。失敗しても本流（アップロード/取得）は成立している
    console.warn('Media cache write failed (ignored):', error)
  }
}
