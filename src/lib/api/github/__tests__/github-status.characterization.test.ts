/**
 * Characterization テスト（#231 Wave A）— 読み取り / 状態取得系
 *
 * 対象: fetchCurrentSha / fetchRemoteHeadSha / fetchRemotePushCount /
 *       testGitHubConnection / saveToGitHub
 *
 * 本番コードは変更しない。現状の API 呼び出しシーケンス・戻り値・分岐を
 * fetch モックで観測して golden master に固定する（挙動が quirky でも現状のまま pin）。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import {
  createFetchMock,
  makeSettings,
  makeNote,
  makeLeaf,
  b64,
  type FetchMock,
} from './fetch-mock'

// github.ts はバレル `../utils` 経由で `../stores` を読み、その先で localStorage に
// 触れる（モジュール読み込み時）。既存の storage 系テストに倣い、localStorage を
// スタブしてから動的 import する。
const storageBacking = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => storageBacking.get(k) ?? null,
  setItem: (k: string, v: string) => void storageBacking.set(k, v),
  removeItem: (k: string) => void storageBacking.delete(k),
  clear: () => storageBacking.clear(),
  key: (i: number) => Array.from(storageBacking.keys())[i] ?? null,
  get length() {
    return storageBacking.size
  },
}

const {
  fetchCurrentSha,
  fetchRemoteHeadSha,
  fetchRemotePushCount,
  testGitHubConnection,
  saveToGitHub,
  NOTES_METADATA_PATH,
} = await import('../../github')

let mock: FetchMock

beforeEach(() => {
  mock = createFetchMock()
  vi.stubGlobal('fetch', mock.fn)
  // console.error / warn を黙らせる（本番コードがエラー時に出力するため）
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ============================================
// fetchCurrentSha
// ============================================
describe('fetchCurrentSha', () => {
  it('GETs the Contents API with a Bearer token and returns the sha when present', async () => {
    mock.on('GET', '/repos/owner/repo/contents/foo/bar.md', { json: { sha: 'abc123' } })

    const sha = await fetchCurrentSha('foo/bar.md', makeSettings())

    expect(sha).toBe('abc123')
    const call = mock.firstCall('GET', '/contents/foo/bar.md')
    expect(call).toBeDefined()
    // キャッシュバスター ?t= が付く
    expect(call!.url).toMatch(/\/repos\/owner\/repo\/contents\/foo\/bar\.md\?t=\d+/)
    expect(call!.headers.Authorization).toBe('Bearer test-token')
  })

  it('returns null when the file does not exist (non-ok response)', async () => {
    mock.on('GET', '/contents/missing.md', { status: 404, json: { message: 'Not Found' } })
    expect(await fetchCurrentSha('missing.md', makeSettings())).toBeNull()
  })

  it('returns null and swallows network errors', async () => {
    // キューに何も積まない → fetch は throw → catch で null
    expect(await fetchCurrentSha('whatever.md', makeSettings())).toBeNull()
  })
})

// ============================================
// fetchRemoteHeadSha
// ============================================
describe('fetchRemoteHeadSha', () => {
  it('returns settings_invalid before any fetch when token missing', async () => {
    const res = await fetchRemoteHeadSha(makeSettings({ token: '' }))
    expect(res).toEqual({ status: 'settings_invalid' })
    expect(mock.calls).toHaveLength(0)
  })

  it('returns settings_invalid when repoName has no slash', async () => {
    const res = await fetchRemoteHeadSha(makeSettings({ repoName: 'norepo' }))
    expect(res).toEqual({ status: 'settings_invalid' })
    expect(mock.calls).toHaveLength(0)
  })

  it('fetches repo then ref and returns the HEAD commit sha', async () => {
    mock
      .on('GET', '/repos/owner/repo', { json: { default_branch: 'develop' } })
      .on('GET', '/git/ref/heads/develop', { json: { object: { sha: 'head-sha-1' } } })

    const res = await fetchRemoteHeadSha(makeSettings())

    expect(res).toEqual({ status: 'success', commitSha: 'head-sha-1' })
    // repo 取得は cache: no-store
    const repoCall = mock.firstCall('GET', 'https://api.github.com/repos/owner/repo')
    expect(repoCall!.cache).toBe('no-store')
    expect(repoCall!.headers.Authorization).toBe('Bearer test-token')
    // ref はデフォルトブランチ名を使う
    expect(mock.firstCall('GET', '/git/ref/heads/develop')).toBeDefined()
  })

  it('defaults branch to main when default_branch missing', async () => {
    mock
      .on('GET', '/repos/owner/repo', { json: {} })
      .on('GET', '/git/ref/heads/main', { json: { object: { sha: 's' } } })
    const res = await fetchRemoteHeadSha(makeSettings())
    expect(res).toEqual({ status: 'success', commitSha: 's' })
  })

  it('maps repo 401/403 to auth_error', async () => {
    mock.on('GET', '/repos/owner/repo', { status: 403, json: {} })
    expect(await fetchRemoteHeadSha(makeSettings())).toEqual({ status: 'auth_error' })
  })

  it('maps other repo failures to network_error', async () => {
    mock.on('GET', '/repos/owner/repo', { status: 500, json: {} })
    expect(await fetchRemoteHeadSha(makeSettings())).toEqual({ status: 'network_error' })
  })

  it('maps ref 404/409 to empty_repository', async () => {
    mock
      .on('GET', '/repos/owner/repo', { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { status: 409, json: {} })
    expect(await fetchRemoteHeadSha(makeSettings())).toEqual({ status: 'empty_repository' })
  })

  it('maps ref 401/403 to auth_error', async () => {
    mock
      .on('GET', '/repos/owner/repo', { json: { default_branch: 'main' } })
      .on('GET', '/git/ref/heads/main', { status: 401, json: {} })
    expect(await fetchRemoteHeadSha(makeSettings())).toEqual({ status: 'auth_error' })
  })

  it('returns network_error (with error) when fetch throws', async () => {
    // 何も積まない → repo fetch が throw
    const res = await fetchRemoteHeadSha(makeSettings())
    expect(res.status).toBe('network_error')
  })
})

// ============================================
// fetchRemotePushCount
// ============================================
describe('fetchRemotePushCount', () => {
  it('returns settings_invalid before fetch when settings invalid', async () => {
    expect(await fetchRemotePushCount(makeSettings({ token: '' }))).toEqual({
      status: 'settings_invalid',
    })
    expect(mock.calls).toHaveLength(0)
  })

  it('reads metadata.json via Contents API and returns pushCount', async () => {
    const meta = JSON.stringify({ version: 1, notes: {}, leaves: {}, pushCount: 7 })
    mock.on('GET', `/contents/${NOTES_METADATA_PATH}`, { json: { content: b64(meta) } })

    const res = await fetchRemotePushCount(makeSettings())
    expect(res).toEqual({ status: 'success', pushCount: 7 })

    const call = mock.firstCall('GET', `/contents/${NOTES_METADATA_PATH}`)
    expect(call!.headers.Authorization).toBe('Bearer test-token')
  })

  it('defaults pushCount to 0 when field absent', async () => {
    const meta = JSON.stringify({ version: 1, notes: {}, leaves: {} })
    mock.on('GET', `/contents/${NOTES_METADATA_PATH}`, { json: { content: b64(meta) } })
    expect(await fetchRemotePushCount(makeSettings())).toEqual({ status: 'success', pushCount: 0 })
  })

  it('maps 404/409 to empty_repository', async () => {
    mock.on('GET', `/contents/${NOTES_METADATA_PATH}`, { status: 404, json: {} })
    expect(await fetchRemotePushCount(makeSettings())).toEqual({ status: 'empty_repository' })
  })

  it('maps 401/403 to auth_error', async () => {
    mock.on('GET', `/contents/${NOTES_METADATA_PATH}`, { status: 403, json: {} })
    expect(await fetchRemotePushCount(makeSettings())).toEqual({ status: 'auth_error' })
  })

  it('maps other errors to network_error', async () => {
    mock.on('GET', `/contents/${NOTES_METADATA_PATH}`, { status: 500, json: {} })
    expect(await fetchRemotePushCount(makeSettings())).toEqual({ status: 'network_error' })
  })

  it('returns network_error when ok response has no content field', async () => {
    // ok かつ content 無し → if 群を全部すり抜けて最後の network_error に落ちる
    mock.on('GET', `/contents/${NOTES_METADATA_PATH}`, { status: 200, json: {} })
    expect(await fetchRemotePushCount(makeSettings())).toEqual({ status: 'network_error' })
  })

  it('returns network_error (with error) when fetch throws', async () => {
    const res = await fetchRemotePushCount(makeSettings())
    expect(res.status).toBe('network_error')
  })
})

// ============================================
// testGitHubConnection
// ============================================
describe('testGitHubConnection', () => {
  it('returns settings_invalid errorCode E-3001 before any fetch', async () => {
    const res = await testGitHubConnection(makeSettings({ token: '' }))
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('E-3001')
    expect(mock.calls).toHaveLength(0)
  })

  it('checks /user then /repos and returns connectionOk', async () => {
    mock
      .on('GET', 'https://api.github.com/user', { json: { login: 'me' } })
      .on('GET', 'https://api.github.com/repos/owner/repo', { json: { id: 1 } })

    const res = await testGitHubConnection(makeSettings())
    expect(res).toEqual({ success: true, message: 'github.connectionOk' })

    const userCall = mock.firstCall('GET', 'https://api.github.com/user')
    expect(userCall!.cache).toBe('no-store')
    expect(userCall!.headers.Authorization).toBe('Bearer test-token')
  })

  it('maps user 401 to invalidToken E-3002', async () => {
    mock.on('GET', 'https://api.github.com/user', { status: 401, json: {} })
    const res = await testGitHubConnection(makeSettings())
    expect(res.message).toBe('github.invalidToken')
    expect(res.errorCode).toBe('E-3002')
    expect(res.httpStatus).toBe(401)
  })

  it('maps user rate-limit (403 remaining 0) to rateLimited E-3003', async () => {
    mock.on('GET', 'https://api.github.com/user', {
      status: 403,
      json: {},
      headers: { 'X-RateLimit-Remaining': '0' },
    })
    const res = await testGitHubConnection(makeSettings())
    expect(res.message).toBe('github.rateLimited')
    expect(res.errorCode).toBe('E-3003')
    expect(res.rateLimitInfo?.isRateLimited).toBe(true)
  })

  it('maps generic user failure to userFetchFailed E-3004', async () => {
    mock.on('GET', 'https://api.github.com/user', { status: 500, json: {} })
    const res = await testGitHubConnection(makeSettings())
    expect(res.message).toBe('github.userFetchFailed')
    expect(res.errorCode).toBe('E-3004')
  })

  it('maps repo 404 to repoNotFound E-3005', async () => {
    mock
      .on('GET', 'https://api.github.com/user', { json: { login: 'me' } })
      .on('GET', 'https://api.github.com/repos/owner/repo', { status: 404, json: {} })
    const res = await testGitHubConnection(makeSettings())
    expect(res.message).toBe('github.repoNotFound')
    expect(res.errorCode).toBe('E-3005')
  })

  it('maps repo 401 to noPermission E-3007', async () => {
    mock
      .on('GET', 'https://api.github.com/user', { json: { login: 'me' } })
      .on('GET', 'https://api.github.com/repos/owner/repo', { status: 401, json: {} })
    const res = await testGitHubConnection(makeSettings())
    expect(res.message).toBe('github.noPermission')
    expect(res.errorCode).toBe('E-3007')
  })

  it('maps thrown error to networkError E-3009', async () => {
    const res = await testGitHubConnection(makeSettings())
    expect(res.message).toBe('github.networkError')
    expect(res.errorCode).toBe('E-3009')
  })
})

// ============================================
// saveToGitHub（単一ファイル保存）
// ============================================
describe('saveToGitHub', () => {
  const notes = [makeNote({ id: 'note-1', name: 'MyNote' })]
  const leaf = makeLeaf({ noteId: 'note-1', title: 'MyLeaf', content: 'body text' })

  it('returns validation error key without fetching when settings invalid', async () => {
    const res = await saveToGitHub(leaf, notes, makeSettings({ token: '' }))
    expect(res).toEqual({ success: false, message: 'github.tokenNotSet' })
    expect(mock.calls).toHaveLength(0)
  })

  it('fetches current sha then PUTs content with sha for existing files', async () => {
    // 1) fetchCurrentSha -> Contents GET returns sha
    mock.on('GET', '/contents/.agasteer/notes/MyNote/MyLeaf.md', {
      json: { sha: 'existing-sha' },
    })
    // 2) PUT Contents API
    mock.on('PUT', '/contents/.agasteer/notes/MyNote/MyLeaf.md', { json: { content: {} } })

    const res = await saveToGitHub(leaf, notes, makeSettings())
    expect(res).toEqual({ success: true, message: 'github.pushOk' })

    const put = mock.firstCall('PUT', '/contents/.agasteer/notes/MyNote/MyLeaf.md')
    expect(put).toBeDefined()
    expect(put!.headers.Authorization).toBe('Bearer test-token')
    expect(put!.headers['Content-Type']).toBe('application/json')
    expect(put!.body.message).toBe('Agasteer push')
    // 既存ファイルなので sha が含まれる
    expect(put!.body.sha).toBe('existing-sha')
    // content は base64
    expect(put!.body.content).toBe(b64('body text'))
    expect(put!.body.committer).toEqual({
      name: 'agasteer',
      email: 'agasteer@users.noreply.github.com',
    })
  })

  it('omits sha when the file does not exist yet (new file)', async () => {
    mock.on('GET', '/contents/.agasteer/notes/MyNote/MyLeaf.md', { status: 404, json: {} })
    mock.on('PUT', '/contents/.agasteer/notes/MyNote/MyLeaf.md', { json: {} })

    const res = await saveToGitHub(leaf, notes, makeSettings())
    expect(res.success).toBe(true)
    const put = mock.firstCall('PUT', '/contents/.agasteer/notes/MyNote/MyLeaf.md')
    expect('sha' in put!.body).toBe(false)
  })

  it('returns networkError when PUT is not ok', async () => {
    mock.on('GET', '/contents/.agasteer/notes/MyNote/MyLeaf.md', { status: 404, json: {} })
    mock.on('PUT', '/contents/.agasteer/notes/MyNote/MyLeaf.md', { status: 422, json: {} })
    const res = await saveToGitHub(leaf, notes, makeSettings())
    expect(res).toEqual({ success: false, message: 'github.networkError' })
  })

  it('returns networkError when PUT throws', async () => {
    // GET succeeds, PUT not queued -> throws -> catch
    mock.on('GET', '/contents/.agasteer/notes/MyNote/MyLeaf.md', { status: 404, json: {} })
    const res = await saveToGitHub(leaf, notes, makeSettings())
    expect(res).toEqual({ success: false, message: 'github.networkError' })
  })
})
