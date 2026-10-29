/**
 * executePush（sync.ts）が github.ts の parentSha を透過すること（#317）
 */
import { describe, expect, it, vi } from 'vitest'

const push = vi.hoisted(() => vi.fn())
vi.mock('../github', () => ({
  pushAllWithTreeAPI: push,
  pullFromGitHub: vi.fn(),
  fetchRemoteHeadSha: vi.fn(),
}))

const { executePush } = await import('../sync')

const base = {
  leaves: [{ id: 'l' } as any],
  notes: [],
  settings: { token: 't', repoName: 'o/r' } as any,
  isOperationsLocked: false,
  localMetadata: { version: 1, notes: {}, leaves: {}, pushCount: 0 } as any,
  isArchiveLoaded: false,
}

describe('executePush: parentSha の透過 (#317)', () => {
  it('成功結果の parentSha と commitSha をそのまま返す', async () => {
    push.mockResolvedValue({
      success: true,
      message: 'github.pushOk',
      commitSha: 'c',
      parentSha: 'p',
    })
    const r = await executePush(base)
    expect(r.parentSha).toBe('p')
    expect(r.commitSha).toBe('c')
    expect(r.variant).toBe('success')
  })

  it('parentSha が無ければ undefined のまま', async () => {
    push.mockResolvedValue({ success: false, message: 'x' })
    const r = await executePush(base)
    expect(r.parentSha).toBeUndefined()
    expect(r.variant).toBe('error')
  })
})
