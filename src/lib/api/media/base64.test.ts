import { describe, expect, it } from 'vitest'

import { encodeArrayBufferToBase64, decodeBase64ToArrayBuffer } from './base64'

function bufferOf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

describe('encodeArrayBufferToBase64', () => {
  it('encodes known bytes to base64', () => {
    // "hello" のバイト列 -> 既知の base64
    expect(encodeArrayBufferToBase64(bufferOf([104, 101, 108, 108, 111]))).toBe('aGVsbG8=')
  })

  it('encodes an empty buffer to an empty string', () => {
    expect(encodeArrayBufferToBase64(new ArrayBuffer(0))).toBe('')
  })

  it('is binary-safe for all byte values (0x00-0xFF)', () => {
    // TextEncoder ベースの encodeContent では壊れる全バイト値を往復できること
    const bytes = Array.from({ length: 256 }, (_, i) => i)
    const encoded = encodeArrayBufferToBase64(bufferOf(bytes))
    expect(Array.from(new Uint8Array(decodeBase64ToArrayBuffer(encoded)))).toEqual(bytes)
  })
})

describe('decodeBase64ToArrayBuffer', () => {
  it('decodes base64 back to the original bytes', () => {
    expect(Array.from(new Uint8Array(decodeBase64ToArrayBuffer('aGVsbG8=')))).toEqual([
      104, 101, 108, 108, 111,
    ])
  })

  it('ignores embedded newlines (GitHub-style wrapped base64)', () => {
    expect(Array.from(new Uint8Array(decodeBase64ToArrayBuffer('aGVs\nbG8=\n')))).toEqual([
      104, 101, 108, 108, 111,
    ])
  })
})

describe('encode/decode round trip', () => {
  it('survives a round trip across the chunk boundary', () => {
    // CHUNK_SIZE (0x8000) をまたぐサイズで分割結合の欠落がないこと
    const size = 0x8000 * 2 + 17
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
      bytes[i] = (i * 31 + 7) % 256
    }
    const decoded = new Uint8Array(
      decodeBase64ToArrayBuffer(encodeArrayBufferToBase64(bytes.buffer))
    )
    expect(decoded.length).toBe(size)
    // 全要素比較は重いので先頭・境界・末尾を抜き取り検査
    for (const i of [0, 1, 0x7fff, 0x8000, 0x8001, 0xffff, 0x10000, size - 2, size - 1]) {
      expect(decoded[i]).toBe(bytes[i])
    }
  })
})
