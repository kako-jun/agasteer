import { describe, expect, it } from 'vitest'

import { validateMedia, MAX_MEDIA_SIZE_BYTES } from './validation'

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
