import { describe, expect, it } from 'vitest'

import { calculateGitBlobSha } from './sha'

// 期待値は `git hash-object --stdin` で算出した既知の Git blob SHA-1。
// Git 仕様: sha1("blob " + UTF-8バイト数 + "\0" + content)
describe('calculateGitBlobSha', () => {
  it('matches git for an empty string', async () => {
    expect(await calculateGitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('matches git for "hello"', async () => {
    expect(await calculateGitBlobSha('hello')).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0')
  })

  it('matches git for "hello\\n" (trailing newline changes the hash)', async () => {
    expect(await calculateGitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })

  it('matches git for a multibyte UTF-8 string (byte length, not char length)', async () => {
    // "あ" is 3 UTF-8 bytes -> header "blob 3\0"
    expect(await calculateGitBlobSha('あ')).toBe('0575c798f05a90ca8b3617062cd61648221d8a63')
  })

  it('produces a 40-character lowercase hex digest', async () => {
    const sha = await calculateGitBlobSha('arbitrary content')
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('is deterministic for the same input', async () => {
    const a = await calculateGitBlobSha('same input')
    const b = await calculateGitBlobSha('same input')
    expect(a).toBe(b)
  })
})
