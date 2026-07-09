import { describe, expect, it } from 'vitest'

import {
  getMediaRepoFullName,
  getMediaRepoShortName,
  sha256Hex,
  formatDateYYYYMMDD,
  getMediaExtension,
  sanitizeMediaBaseName,
  buildMediaFileName,
  buildRawMediaUrl,
  parseRawMediaUrl,
} from './naming'

describe('getMediaRepoFullName / getMediaRepoShortName', () => {
  it('appends -media to the notes repo name', () => {
    expect(getMediaRepoFullName('kako-jun/notes')).toBe('kako-jun/notes-media')
    expect(getMediaRepoShortName('kako-jun/notes')).toBe('notes-media')
  })
})

describe('sha256Hex', () => {
  it('matches the known SHA-256 of an empty buffer', async () => {
    expect(await sha256Hex(new ArrayBuffer(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('matches the known SHA-256 of "abc"', async () => {
    const data = new TextEncoder().encode('abc').buffer as ArrayBuffer
    expect(await sha256Hex(data)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
})

describe('formatDateYYYYMMDD', () => {
  it('formats a local date with zero padding', () => {
    expect(formatDateYYYYMMDD(new Date(2026, 6, 9))).toBe('20260709')
    expect(formatDateYYYYMMDD(new Date(2026, 11, 31))).toBe('20261231')
  })
})

describe('getMediaExtension', () => {
  it('extracts a lowercase extension', () => {
    expect(getMediaExtension('photo.PNG')).toBe('png')
    expect(getMediaExtension('archive.tar.zip')).toBe('zip')
  })

  it('returns an empty string when there is no extension', () => {
    expect(getMediaExtension('README')).toBe('')
  })
})

describe('sanitizeMediaBaseName', () => {
  it('keeps URL-safe characters and drops the extension', () => {
    expect(sanitizeMediaBaseName('My_Photo-1.png')).toBe('My_Photo-1')
  })

  it('collapses unsafe characters into single dashes', () => {
    expect(sanitizeMediaBaseName('My Photo (1).png')).toBe('My-Photo-1')
  })

  it('falls back to "file" when nothing survives (e.g. Japanese name)', () => {
    expect(sanitizeMediaBaseName('写真.png')).toBe('file')
  })

  it('keeps the ASCII part of a mixed Japanese/ASCII name', () => {
    expect(sanitizeMediaBaseName('写真abc.png')).toBe('abc')
  })

  it('limits the length to 40 characters', () => {
    const longName = `${'a'.repeat(100)}.png`
    expect(sanitizeMediaBaseName(longName)).toBe('a'.repeat(40))
  })

  it('does not leave a trailing dash after truncation', () => {
    const name = `${'a'.repeat(39)} b.png` // 40文字目が '-' になる並び
    expect(sanitizeMediaBaseName(name).endsWith('-')).toBe(false)
  })
})

describe('buildMediaFileName', () => {
  it('builds {YYYYMMDD}-{hash8}-{sanitized}.{ext}', () => {
    const date = new Date(2026, 6, 9)
    const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    expect(buildMediaFileName(date, hash, 'My Photo.PNG')).toBe('20260709-ba7816bf-My-Photo.png')
  })

  it('does not append a trailing dot when the name has no extension', () => {
    const date = new Date(2026, 6, 9)
    const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    expect(buildMediaFileName(date, hash, 'README')).toBe('20260709-ba7816bf-README')
  })

  it('produces a different filename for the same content on a different day (dedup is per-day)', () => {
    const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    const day1 = buildMediaFileName(new Date(2026, 6, 9), hash, 'photo.png')
    const day2 = buildMediaFileName(new Date(2026, 6, 10), hash, 'photo.png')
    expect(day1).toBe('20260709-ba7816bf-photo.png')
    expect(day2).toBe('20260710-ba7816bf-photo.png')
    expect(day1).not.toBe(day2)
  })
})

describe('buildRawMediaUrl / parseRawMediaUrl', () => {
  it('builds the deterministic raw URL', () => {
    expect(buildRawMediaUrl('kako-jun/notes-media', '20260709-ba7816bf-My-Photo.png')).toBe(
      'https://raw.githubusercontent.com/kako-jun/notes-media/main/20260709-ba7816bf-My-Photo.png'
    )
  })

  it('round-trips through parseRawMediaUrl', () => {
    const url = buildRawMediaUrl('kako-jun/notes-media', '20260709-ba7816bf-My-Photo.png')
    expect(parseRawMediaUrl(url)).toEqual({
      repoFullName: 'kako-jun/notes-media',
      branch: 'main',
      path: '20260709-ba7816bf-My-Photo.png',
    })
  })

  it('returns null for non-raw URLs', () => {
    expect(parseRawMediaUrl('https://github.com/kako-jun/notes-media/blob/main/a.png')).toBeNull()
    expect(parseRawMediaUrl('https://example.com/a.png')).toBeNull()
    expect(parseRawMediaUrl('not a url')).toBeNull()
  })

  it('rejects path traversal segments (authenticated fetch must not leave the media repo)', () => {
    expect(parseRawMediaUrl('https://raw.githubusercontent.com/../../../../user/repos')).toBeNull()
    expect(
      parseRawMediaUrl('https://raw.githubusercontent.com/a/b-media/main/../secret.png')
    ).toBeNull()
  })

  it('rejects query-string smuggling in the path', () => {
    expect(
      parseRawMediaUrl('https://raw.githubusercontent.com/a/b-media/main/x.png?ref=evil')
    ).toBeNull()
  })

  it('rejects dots-only path segments while allowing harmless leading dots', () => {
    expect(parseRawMediaUrl('https://raw.githubusercontent.com/a/b-media/main/..')).toBeNull()
    expect(parseRawMediaUrl('https://raw.githubusercontent.com/a/b-media/main/.')).toBeNull()
    expect(parseRawMediaUrl('https://raw.githubusercontent.com/a/b-media/main/..png')).toEqual({
      repoFullName: 'a/b-media',
      branch: 'main',
      path: '..png',
    })
  })

  it('rejects repos without the -media suffix (structural invariant of generated URLs)', () => {
    expect(
      parseRawMediaUrl('https://raw.githubusercontent.com/kako-jun/notes/main/x.png')
    ).toBeNull()
    expect(parseRawMediaUrl('https://raw.githubusercontent.com/a/-media/main/x.png')).toBeNull()
  })

  it('rejects nested paths and non-main branches (generator emits root-level files on main)', () => {
    expect(
      parseRawMediaUrl('https://raw.githubusercontent.com/a/b-media/main/dir/x.png')
    ).toBeNull()
    expect(parseRawMediaUrl('https://raw.githubusercontent.com/a/b-media/develop/x.png')).toBeNull()
  })

  it('rejects unsafe owner names', () => {
    expect(parseRawMediaUrl('https://raw.githubusercontent.com/../b-media/main/x.png')).toBeNull()
    expect(
      parseRawMediaUrl('https://raw.githubusercontent.com/-evil/b-media/main/x.png')
    ).toBeNull()
  })
})
