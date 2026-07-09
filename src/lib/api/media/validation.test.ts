import { describe, expect, it } from 'vitest'

import {
  validateMedia,
  MAX_MEDIA_SIZE_BYTES,
  IMAGE_MEDIA_EXTENSIONS,
  ALLOWED_MEDIA_EXTENSIONS,
} from './validation'

describe('validateMedia', () => {
  it('accepts whitelisted formats', () => {
    for (const name of [
      'a.png',
      'a.jpg',
      'a.jpeg',
      'a.gif',
      'a.webp',
      'a.svg',
      'a.mp4',
      'a.webm',
      'a.mp3',
      'a.m4a',
      'a.ogg',
      'a.wav',
      'a.zip',
    ]) {
      expect(validateMedia(name, 1024)).toBeNull()
    }
  })

  it('accepts uppercase extensions (case-insensitive)', () => {
    expect(validateMedia('PHOTO.PNG', 1024)).toBeNull()
  })

  it('rejects non-whitelisted formats', () => {
    expect(validateMedia('a.exe', 1024)).toBe('format_not_allowed')
    expect(validateMedia('a.md', 1024)).toBe('format_not_allowed')
    expect(validateMedia('a.pdf', 1024)).toBe('format_not_allowed')
  })

  it('rejects files without an extension', () => {
    expect(validateMedia('README', 1024)).toBe('format_not_allowed')
  })

  it('accepts a file exactly at the 100MB limit', () => {
    expect(validateMedia('a.zip', MAX_MEDIA_SIZE_BYTES)).toBeNull()
  })

  it('rejects a file over the 100MB limit', () => {
    expect(validateMedia('a.zip', MAX_MEDIA_SIZE_BYTES + 1)).toBe('size_exceeded')
  })

  it('checks the format before the size', () => {
    // 両方 NG の場合は形式エラーを優先して返す
    expect(validateMedia('a.exe', MAX_MEDIA_SIZE_BYTES + 1)).toBe('format_not_allowed')
  })
})

describe('IMAGE_MEDIA_EXTENSIONS', () => {
  it('画像拡張子はすべて形式ホワイトリストに含まれる（単一ソースの包含保証）', () => {
    for (const ext of IMAGE_MEDIA_EXTENSIONS) {
      expect(ALLOWED_MEDIA_EXTENSIONS.has(ext), `missing in whitelist: ${ext}`).toBe(true)
    }
    expect(IMAGE_MEDIA_EXTENSIONS.size).toBeGreaterThan(0)
  })
})
