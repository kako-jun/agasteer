import { describe, expect, it } from 'vitest'

import type { Leaf, Note } from '../../types'
import {
  NOTES_PATH,
  NOTES_METADATA_PATH,
  ARCHIVE_PATH,
  ARCHIVE_METADATA_PATH,
  getBasePath,
  getMetadataPath,
  sanitizePathPart,
  getFolderPath,
  getNotePath,
  buildPath,
} from './paths'

function makeNote(partial: Partial<Note> & { id: string; name: string }): Note {
  return { order: 0, ...partial }
}

function makeLeaf(partial: Partial<Leaf> & { noteId: string; title: string }): Leaf {
  return { id: 'leaf-id', content: '', updatedAt: 0, order: 0, ...partial }
}

describe('path constants', () => {
  it('home base path / metadata path', () => {
    expect(NOTES_PATH).toBe('.agasteer/notes')
    expect(NOTES_METADATA_PATH).toBe('.agasteer/notes/metadata.json')
    expect(NOTES_METADATA_PATH).toBe(`${NOTES_PATH}/metadata.json`)
  })

  it('archive base path / metadata path', () => {
    expect(ARCHIVE_PATH).toBe('.agasteer/archive')
    expect(ARCHIVE_METADATA_PATH).toBe('.agasteer/archive/metadata.json')
    expect(ARCHIVE_METADATA_PATH).toBe(`${ARCHIVE_PATH}/metadata.json`)
  })
})

describe('getBasePath / getMetadataPath', () => {
  it('home world resolves to notes paths', () => {
    expect(getBasePath('home')).toBe(NOTES_PATH)
    expect(getMetadataPath('home')).toBe(NOTES_METADATA_PATH)
  })

  it('archive world resolves to archive paths', () => {
    expect(getBasePath('archive')).toBe(ARCHIVE_PATH)
    expect(getMetadataPath('archive')).toBe(ARCHIVE_METADATA_PATH)
  })
})

describe('sanitizePathPart', () => {
  it('replaces filesystem-unsafe characters with hyphen', () => {
    expect(sanitizePathPart('a/b\\c:d*e?f"g<h>i|j#k')).toBe('a-b-c-d-e-f-g-h-i-j-k')
  })

  it('collapses runs of whitespace to a single space', () => {
    expect(sanitizePathPart('hello   world\t\nfoo')).toBe('hello world foo')
  })

  it('limits length to 80 characters', () => {
    const long = 'x'.repeat(200)
    expect(sanitizePathPart(long)).toHaveLength(80)
  })

  it('returns "Untitled" when the result is empty', () => {
    expect(sanitizePathPart('')).toBe('Untitled')
    // whitespace-only collapses to a single space (length 1), not empty
    expect(sanitizePathPart('   ')).toBe(' ')
  })

  it('leaves a normal title untouched', () => {
    expect(sanitizePathPart('My Note 2026')).toBe('My Note 2026')
  })
})

describe('getFolderPath', () => {
  const notes: Note[] = [
    makeNote({ id: 'parent', name: 'Parent' }),
    makeNote({ id: 'child', name: 'Child', parentId: 'parent' }),
  ]

  it('returns the note name for a root note', () => {
    expect(getFolderPath(notes[0], notes)).toBe('Parent')
  })

  it('prefixes the parent name for a child note', () => {
    expect(getFolderPath(notes[1], notes)).toBe('Parent/Child')
  })

  it('falls back to the bare name when the parent is missing', () => {
    const orphan = makeNote({ id: 'orphan', name: 'Orphan', parentId: 'nope' })
    expect(getFolderPath(orphan, notes)).toBe('Orphan')
  })
})

describe('getNotePath', () => {
  const notes: Note[] = [
    makeNote({ id: 'parent', name: 'Parent' }),
    makeNote({ id: 'child', name: 'Child', parentId: 'parent' }),
  ]

  it('prefixes the home base path', () => {
    expect(getNotePath(notes[1], notes, 'home')).toBe('.agasteer/notes/Parent/Child')
  })

  it('prefixes the archive base path', () => {
    expect(getNotePath(notes[1], notes, 'archive')).toBe('.agasteer/archive/Parent/Child')
  })

  it('defaults to home when world is omitted', () => {
    expect(getNotePath(notes[0], notes)).toBe('.agasteer/notes/Parent')
  })
})

describe('buildPath', () => {
  const notes: Note[] = [
    makeNote({ id: 'parent', name: 'Parent' }),
    makeNote({ id: 'child', name: 'Child', parentId: 'parent' }),
  ]

  it('builds a full .md path under the note folder', () => {
    const leaf = makeLeaf({ noteId: 'child', title: 'Hello' })
    expect(buildPath(leaf, notes, 'home')).toBe('.agasteer/notes/Parent/Child/Hello.md')
  })

  it('sanitizes the title in the file name', () => {
    const leaf = makeLeaf({ noteId: 'parent', title: 'a/b:c' })
    expect(buildPath(leaf, notes, 'home')).toBe('.agasteer/notes/Parent/a-b-c.md')
  })

  it('uses the archive base path for the archive world', () => {
    const leaf = makeLeaf({ noteId: 'parent', title: 'Hello' })
    expect(buildPath(leaf, notes, 'archive')).toBe('.agasteer/archive/Parent/Hello.md')
  })

  it('falls back to base path + title when the note is not found', () => {
    const leaf = makeLeaf({ noteId: 'missing', title: 'Orphan' })
    expect(buildPath(leaf, notes, 'home')).toBe('.agasteer/notes/Orphan.md')
  })
})
