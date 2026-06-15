import { describe, expect, it } from 'vitest'

import { encodeContent, decodeBase64ToString } from './encoding'

describe('encodeContent', () => {
  it('encodes ASCII to base64', () => {
    // "hello" -> known base64
    expect(encodeContent('hello')).toBe('aGVsbG8=')
  })

  it('encodes an empty string to an empty base64 string', () => {
    expect(encodeContent('')).toBe('')
  })

  it('encodes multibyte UTF-8 (Japanese) correctly', () => {
    // "あ" (U+3042) is E3 81 82 in UTF-8 -> base64 "44GC"
    expect(encodeContent('あ')).toBe('44GC')
  })

  it('encodes an emoji (surrogate pair) correctly', () => {
    // "😀" (U+1F600) is F0 9F 98 80 -> base64 "8J+YgA=="
    expect(encodeContent('😀')).toBe('8J+YgA==')
  })
})

describe('decodeBase64ToString', () => {
  it('decodes base64 back to ASCII', () => {
    expect(decodeBase64ToString('aGVsbG8=')).toBe('hello')
  })

  it('decodes multibyte UTF-8 (Japanese) correctly', () => {
    expect(decodeBase64ToString('44GC')).toBe('あ')
  })

  it('ignores embedded newlines (GitHub-style wrapped base64)', () => {
    // GitHub Contents API returns base64 with \n line wraps
    expect(decodeBase64ToString('aGVs\nbG8=\n')).toBe('hello')
  })
})

describe('encode/decode round trip', () => {
  it('survives a round trip for mixed content', () => {
    const samples = [
      '',
      'plain ascii',
      'マークダウン # 見出し\n- リスト',
      '😀🎉 emoji and ascii mix',
      'line1\nline2\r\nline3\ttab',
    ]
    for (const sample of samples) {
      expect(decodeBase64ToString(encodeContent(sample))).toBe(sample)
    }
  })
})
