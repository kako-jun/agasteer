/**
 * fetch モック基盤（characterization テスト用・#231）
 *
 * 本番コードには一切手を入れず、`fetch` を差し替えて GitHub API の応答を
 * URL + method でマッチ・順番に消費（キュー）する仕組みを提供する。
 * Wave A（push/status）と Wave B（pull）の両方から再利用できる。
 *
 * 使い方の要点:
 *  - `createFetchMock()` で mock を作り、`vi.stubGlobal('fetch', mock.fn)` で差し込む。
 *  - `mock.on(method, urlMatcher, response)` で 1 リクエスト分の応答を**キュー**する。
 *    同じ matcher を複数回 on すると、呼ばれた順に消費される（段階応答）。
 *  - matcher は文字列（完全一致 or 部分一致）・正規表現・述語関数のいずれか。
 *  - 応答は {status, json, text, headers} を持つ簡易記述。`json` があれば JSON 化、
 *    `text` があればそのまま本文にする。
 *  - 記録された全リクエストは `mock.calls` で参照でき、URL・method・body(JSON)・headers を
 *    assert できる。
 *
 * GitHub Contents API はキャッシュバスター `?t=<Date.now()>` を URL に付けるため、
 * matcher は基本「URL に含まれるか（部分一致）」で書く。
 */

import { vi } from 'vitest'

export interface MockResponseSpec {
  status?: number
  /** JSON 本文（指定すると application/json で返す） */
  json?: unknown
  /** テキスト本文（raw コンテンツ取得用） */
  text?: string
  /** レスポンスヘッダ（rate-limit ヘッダ等） */
  headers?: Record<string, string>
  /**
   * 応答を遅延させる（並列度の characterization 用・#231）。
   * gate を渡すとその Promise が resolve するまで fetch は pending のまま
   * （＝runWithConcurrency のスロットを掴んだまま）になる。
   * 何も指定しなければ従来どおり即時 resolve（後方互換）。
   */
  gate?: Promise<unknown>
  /** 応答を delay ミリ秒だけ遅延させる（gate と併用可） */
  delay?: number
}

/** 手動 resolve できる Promise（deferred）。並列 in-flight を段階的に開放する用。 */
export interface Deferred<T = void> {
  promise: Promise<T>
  resolve: (value?: T) => void
  reject: (reason?: unknown) => void
}

export function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value?: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res as (value?: T) => void
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 特定の method + matcher にマッチする fetch の in-flight 数を追跡するトラッカ。 */
export interface InFlightTracker {
  /** 現在 pending 中の件数 */
  readonly current: number
  /** 観測された同時 in-flight の最大値 */
  readonly max: number
}

export type UrlMatcher = string | RegExp | ((url: string) => boolean)

export interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  /** リクエストボディの生文字列（あれば） */
  rawBody?: string
  /** リクエストボディを JSON.parse した結果（パースできた場合のみ） */
  body?: any
  /** fetch の第2引数 init.cache */
  cache?: string
}

interface QueuedResponse {
  method: string
  matcher: UrlMatcher
  spec: MockResponseSpec
}

function urlMatches(matcher: UrlMatcher, url: string): boolean {
  if (typeof matcher === 'function') return matcher(url)
  if (matcher instanceof RegExp) return matcher.test(url)
  // 文字列は「部分一致」で扱う（キャッシュバスター付き URL に対応するため）
  return url.includes(matcher)
}

function specToResponse(spec: MockResponseSpec): Response {
  const status = spec.status ?? 200
  const headers = new Headers(spec.headers ?? {})
  let bodyStr: string | null = null
  if (spec.json !== undefined) {
    bodyStr = JSON.stringify(spec.json)
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  } else if (spec.text !== undefined) {
    bodyStr = spec.text
  }
  // 204/205/304 は body 不可なので null にする
  const noBodyStatuses = [204, 205, 304]
  const body = noBodyStatuses.includes(status) ? null : bodyStr
  return new Response(body, { status, headers })
}

export interface FetchMock {
  /** vi.stubGlobal('fetch', mock.fn) で差し込む関数 */
  fn: ReturnType<typeof vi.fn>
  /** 1 リクエスト分の応答をキューする（同 matcher 複数回 = 段階応答） */
  on: (method: string, matcher: UrlMatcher, spec: MockResponseSpec) => FetchMock
  /** 記録された全リクエスト */
  calls: RecordedCall[]
  /** method + matcher にマッチした記録だけを返す */
  callsMatching: (method: string, matcher: UrlMatcher) => RecordedCall[]
  /** 最初にマッチした記録 */
  firstCall: (method: string, matcher: UrlMatcher) => RecordedCall | undefined
  /** 未消費のキュー（ステージしたが呼ばれなかった応答）が残っていたら throw する。
   *  「過剰ステージングが黙って通る」のを防ぐ opt-in ヘルパ（#231 Wave B / #232 nit）。 */
  assertDrained: () => void
  /** 未消費キューの件数（assertDrained の非例外版） */
  pendingCount: () => number
  /** method + matcher にマッチする fetch の in-flight 数を追跡開始する。
   *  gate/delay で応答を遅延させたとき、同時 in-flight のピークを観測できる。 */
  track: (method: string, matcher: UrlMatcher) => InFlightTracker
}

interface TrackerState {
  method: string
  matcher: UrlMatcher
  current: number
  max: number
}

export function createFetchMock(): FetchMock {
  const queue: QueuedResponse[] = []
  const calls: RecordedCall[] = []
  const trackers: TrackerState[] = []

  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()

    // ヘッダを Record に正規化
    const headers: Record<string, string> = {}
    const rawHeaders = init?.headers
    if (rawHeaders) {
      if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((v, k) => {
          headers[k] = v
        })
      } else if (Array.isArray(rawHeaders)) {
        for (const [k, v] of rawHeaders) headers[k] = v
      } else {
        Object.assign(headers, rawHeaders)
      }
    }

    const rawBody = typeof init?.body === 'string' ? init.body : undefined
    let body: any
    if (rawBody !== undefined) {
      try {
        body = JSON.parse(rawBody)
      } catch {
        body = undefined
      }
    }

    calls.push({
      url,
      method,
      headers,
      rawBody,
      body,
      cache: (init as any)?.cache,
    })

    // キューから最初にマッチするものを探して消費する
    const idx = queue.findIndex(
      (q) => q.method.toUpperCase() === method && urlMatches(q.matcher, url)
    )
    if (idx === -1) {
      throw new Error(
        `[fetch-mock] no queued response for ${method} ${url}\n` +
          `remaining queue: ${queue.map((q) => `${q.method} ${String(q.matcher)}`).join(', ') || '(empty)'}`
      )
    }
    const [matched] = queue.splice(idx, 1)

    // in-flight 追跡: リクエスト受理〜応答 resolve までを bracket する。
    // gate/delay で応答が pending の間はスロットを掴んだままなので、
    // runWithConcurrency の同時実行数がここで観測できる。
    const matchedTrackers = trackers.filter(
      (t) => t.method.toUpperCase() === method && urlMatches(t.matcher, url)
    )
    for (const t of matchedTrackers) {
      t.current++
      if (t.current > t.max) t.max = t.current
    }
    try {
      if (matched.spec.gate) await matched.spec.gate
      if (matched.spec.delay) {
        await new Promise((r) => setTimeout(r, matched.spec.delay))
      }
      return specToResponse(matched.spec)
    } finally {
      for (const t of matchedTrackers) t.current--
    }
  })

  const mock: FetchMock = {
    fn,
    calls,
    on(method, matcher, spec) {
      queue.push({ method, matcher, spec })
      return mock
    },
    callsMatching(method, matcher) {
      return calls.filter(
        (c) => c.method.toUpperCase() === method.toUpperCase() && urlMatches(matcher, c.url)
      )
    },
    firstCall(method, matcher) {
      return mock.callsMatching(method, matcher)[0]
    },
    pendingCount() {
      return queue.length
    },
    track(method, matcher) {
      const state: TrackerState = { method, matcher, current: 0, max: 0 }
      trackers.push(state)
      return {
        get current() {
          return state.current
        },
        get max() {
          return state.max
        },
      }
    },
    assertDrained() {
      if (queue.length > 0) {
        const remaining = queue.map((q) => `${q.method} ${String(q.matcher)}`).join(', ')
        throw new Error(
          `[fetch-mock] assertDrained: ${queue.length} queued response(s) were never consumed: ${remaining}`
        )
      }
    },
  }
  return mock
}

// ============================================
// テスト用のダミーデータ生成ヘルパー
// ============================================

import type { Settings, Leaf, Note, Metadata } from '../../../types'

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    token: 'test-token',
    repoName: 'owner/repo',
    theme: 'light' as Settings['theme'],
    toolName: 'agasteer',
    locale: 'ja' as Settings['locale'],
    ...overrides,
  }
}

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? 'note-1',
    name: overrides.name ?? 'Note',
    parentId: overrides.parentId,
    order: overrides.order ?? 0,
    badgeIcon: overrides.badgeIcon,
    badgeColor: overrides.badgeColor,
  }
}

export function makeLeaf(overrides: Partial<Leaf> = {}): Leaf {
  return {
    id: overrides.id ?? 'leaf-1',
    title: overrides.title ?? 'Leaf',
    noteId: overrides.noteId ?? 'note-1',
    content: overrides.content ?? 'hello world',
    updatedAt: overrides.updatedAt ?? 1000,
    order: overrides.order ?? 0,
    badgeIcon: overrides.badgeIcon,
    badgeColor: overrides.badgeColor,
    blobSha: overrides.blobSha,
  }
}

export function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    version: 1,
    notes: {},
    leaves: {},
    pushCount: 0,
    ...overrides,
  }
}

/** base64 エンコード（GitHub Contents API / Blob API レスポンス用） */
export function b64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
}
