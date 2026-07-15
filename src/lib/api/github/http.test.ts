import { describe, expect, it, vi, afterEach } from 'vitest'

import { fetchGitHubContents, runWithConcurrency, validateGitHubSettings } from './http'
import type { Settings } from '../../types'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchGitHubContents', () => {
  function mockFetch() {
    const spy = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 })
    )
    vi.stubGlobal('fetch', spy)
    return spy
  }

  it('builds a Contents API URL with a cache-buster query param', async () => {
    const fetchSpy = mockFetch()
    await fetchGitHubContents('notes/foo.md', 'owner/repo', 'tok')
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('https://api.github.com/repos/owner/repo/contents/notes/foo.md')
    expect(url).toMatch(/\?t=\d+/)
  })

  it('sends an Authorization: Bearer header', async () => {
    const fetchSpy = mockFetch()
    await fetchGitHubContents('p', 'owner/repo', 'secret-token')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret-token')
  })

  it('sets the raw Accept header only when options.raw is true', async () => {
    const fetchSpy = mockFetch()
    await fetchGitHubContents('p', 'owner/repo', 'tok', { raw: true })
    const headers = fetchSpy.mock.calls[0][1]!.headers as Record<string, string>
    expect(headers.Accept).toBe('application/vnd.github.raw')
  })

  it('omits the Accept header when raw is not requested', async () => {
    const fetchSpy = mockFetch()
    await fetchGitHubContents('p', 'owner/repo', 'tok')
    const headers = fetchSpy.mock.calls[0][1]!.headers as Record<string, string>
    expect(headers.Accept).toBeUndefined()
  })
})

describe('runWithConcurrency', () => {
  it('returns an empty array for empty input', async () => {
    const worker = vi.fn(async (n: number) => n)
    expect(await runWithConcurrency([], 5, worker)).toEqual([])
    expect(worker).not.toHaveBeenCalled()
  })

  it('excludes items whose worker returns null', async () => {
    const results = await runWithConcurrency([1, 2, 3, 4], 2, async (n) => (n % 2 === 0 ? n : null))
    expect(results.sort((a, b) => a - b)).toEqual([2, 4])
  })

  it('spawns min(limit, items.length) workers', async () => {
    let active = 0
    let peak = 0
    const resolvers: Array<() => void> = []
    const promise = runWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active++
      peak = Math.max(peak, active)
      await new Promise<void>((resolve) => resolvers.push(resolve))
      active--
      return n
    })
    // Let the initial workers start.
    await Promise.resolve()
    await Promise.resolve()
    expect(peak).toBe(2)
    // Drain all pending workers.
    while (resolvers.length > 0) {
      resolvers.shift()!()
      await Promise.resolve()
      await Promise.resolve()
    }
    await promise
  })

  it('caps worker count at items.length when limit exceeds it', async () => {
    let peak = 0
    let active = 0
    await runWithConcurrency([1, 2], 10, async (n) => {
      active++
      peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      return n
    })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('pushes results in completion order, not input order', async () => {
    const gates: Record<number, () => void> = {}
    const promise = runWithConcurrency([1, 2], 2, async (n) => {
      await new Promise<void>((resolve) => {
        gates[n] = resolve
      })
      return n
    })
    await Promise.resolve()
    // Complete item 2 before item 1.
    gates[2]()
    await Promise.resolve()
    gates[1]()
    const results = await promise
    expect(results).toEqual([2, 1])
  })
})

describe('validateGitHubSettings', () => {
  function makeSettings(overrides: Partial<Settings>): Settings {
    return { token: 'tok', repoName: 'owner/repo', ...overrides } as Settings
  }

  it('returns tokenNotSet when the token is empty', () => {
    expect(validateGitHubSettings(makeSettings({ token: '' }))).toEqual({
      valid: false,
      errorKey: 'github.tokenNotSet',
    })
  })

  it('returns invalidRepoName when repoName has no slash', () => {
    expect(validateGitHubSettings(makeSettings({ repoName: 'noslash' }))).toEqual({
      valid: false,
      errorKey: 'github.invalidRepoName',
    })
  })

  it('returns valid for a well-formed settings object', () => {
    expect(validateGitHubSettings(makeSettings({}))).toEqual({ valid: true })
  })
})
