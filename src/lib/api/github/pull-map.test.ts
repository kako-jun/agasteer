import { describe, expect, it } from 'vitest'

import type { Metadata, Note } from '../../types'
import {
  buildLeafFromTarget,
  buildLeafTargets,
  collapseToTwoLevels,
  ensureNotePath,
  getLeafPriority,
  type LeafTarget,
} from './pull-map'

const emptyMetadata = (): Metadata => ({ version: 1, notes: {}, leaves: {}, pushCount: 0 })

const makeTarget = (overrides: Partial<LeafTarget> = {}): LeafTarget => ({
  entry: { path: 'p', type: 'blob', sha: 'sha1' },
  title: 'Title',
  noteId: 'note-1',
  leafMeta: { id: 'leaf-1', updatedAt: 111, order: 0, badgeIcon: undefined, badgeColor: undefined },
  relativePath: 'a/Title.md',
  ...overrides,
})

describe('collapseToTwoLevels', () => {
  it('returns an empty array unchanged', () => {
    expect(collapseToTwoLevels([])).toEqual([])
  })

  it('keeps a single level', () => {
    expect(collapseToTwoLevels(['a'])).toEqual(['a'])
  })

  it('keeps two levels', () => {
    expect(collapseToTwoLevels(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('collapses three levels into two, joining the tail with sanitize (/ -> -)', () => {
    expect(collapseToTwoLevels(['a', 'b', 'c'])).toEqual(['a', 'b-c'])
  })

  it('collapses four or more levels into the first + sanitized remainder', () => {
    expect(collapseToTwoLevels(['a', 'b', 'c', 'd'])).toEqual(['a', 'b-c-d'])
  })

  it('sanitizes each part even when not collapsing', () => {
    expect(collapseToTwoLevels(['a/b', 'c'])).toEqual(['a-b', 'c'])
  })
})

describe('ensureNotePath', () => {
  it('reuses id/order/badges from metadata.notes when present', () => {
    const metadata = emptyMetadata()
    metadata.notes = { a: { id: 'meta-a', order: 5, badgeIcon: 'star', badgeColor: 'red' } }
    const noteMap = new Map<string, Note>()
    const noteId = ensureNotePath({
      pathParts: ['a'],
      noteMap,
      metadata,
      idGenerator: () => 'GEN',
    })
    expect(noteId).toBe('meta-a')
    const note = noteMap.get('a')!
    expect(note).toMatchObject({ id: 'meta-a', name: 'a', order: 5, badgeIcon: 'star' })
  })

  it('generates a new id via idGenerator when metadata is missing', () => {
    const noteMap = new Map<string, Note>()
    const noteId = ensureNotePath({
      pathParts: ['a'],
      noteMap,
      metadata: emptyMetadata(),
      idGenerator: () => 'FIXED-ID',
    })
    expect(noteId).toBe('FIXED-ID')
    expect(noteMap.get('a')!.order).toBe(0)
  })

  it('builds a parent chain and returns the leaf note id, mutating noteMap', () => {
    const noteMap = new Map<string, Note>()
    let n = 0
    const noteId = ensureNotePath({
      pathParts: ['a', 'b'],
      noteMap,
      metadata: emptyMetadata(),
      idGenerator: () => `id-${n++}`,
    })
    expect(noteMap.get('a')!.parentId).toBeUndefined()
    expect(noteMap.get('a/b')!.parentId).toBe(noteMap.get('a')!.id)
    expect(noteId).toBe(noteMap.get('a/b')!.id)
  })

  it('collapses 3+ levels into two before registering', () => {
    const noteMap = new Map<string, Note>()
    ensureNotePath({
      pathParts: ['a', 'b', 'c'],
      noteMap,
      metadata: emptyMetadata(),
      idGenerator: () => 'x',
    })
    expect([...noteMap.keys()]).toEqual(['a', 'a/b-c'])
  })
})

describe('buildLeafTargets', () => {
  it('maps path/fileName/title and calls ensureNotePath', () => {
    const noteMap = new Map<string, Note>()
    const targets = buildLeafTargets({
      entries: [{ path: '.agasteer/notes/a/Hello.md', type: 'blob', sha: 's1' }],
      basePath: '.agasteer/notes',
      metadata: emptyMetadata(),
      noteMap,
      idGenerator: () => 'UUID',
      now: () => 999,
    })
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({
      title: 'Hello',
      relativePath: 'a/Hello.md',
      noteId: noteMap.get('a')!.id,
    })
    expect(targets[0].leafMeta).toMatchObject({ id: 'UUID', updatedAt: 999, order: 0 })
  })

  it('collapses a deep note path before the filename', () => {
    const noteMap = new Map<string, Note>()
    const targets = buildLeafTargets({
      entries: [{ path: '.agasteer/notes/a/b/c/Deep.md', type: 'blob', sha: 's1' }],
      basePath: '.agasteer/notes',
      metadata: emptyMetadata(),
      noteMap,
      idGenerator: () => 'UUID',
      now: () => 1,
    })
    expect(targets[0].relativePath).toBe('a/b-c/Deep.md')
  })

  it('prefers the collapsed leaf key then the original key in metadata.leaves', () => {
    const noteMap = new Map<string, Note>()
    const metadata = emptyMetadata()
    metadata.leaves = {
      'a/b-c/Deep.md': { id: 'collapsed', updatedAt: 10, order: 3 },
      'a/b/c/Deep.md': { id: 'original', updatedAt: 20, order: 4 },
    }
    const [t] = buildLeafTargets({
      entries: [{ path: '.agasteer/notes/a/b/c/Deep.md', type: 'blob', sha: 's1' }],
      basePath: '.agasteer/notes',
      metadata,
      noteMap,
    })
    expect(t.leafMeta.id).toBe('collapsed')
  })

  it('falls back to the original leaf key when the collapsed key is absent', () => {
    const noteMap = new Map<string, Note>()
    const metadata = emptyMetadata()
    metadata.leaves = { 'a/Hello.md': { id: 'original', updatedAt: 20, order: 4 } }
    const [t] = buildLeafTargets({
      entries: [{ path: '.agasteer/notes/a/Hello.md', type: 'blob', sha: 's1' }],
      basePath: '.agasteer/notes',
      metadata,
      noteMap,
    })
    expect(t.leafMeta.id).toBe('original')
  })
})

describe('getLeafPriority', () => {
  const sets = { leafPaths: new Set(['a/Title.md']), noteIds: new Set(['note-2']) }

  it('returns 0 for a URL-specified leaf', () => {
    expect(getLeafPriority(makeTarget(), sets)).toBe(0)
  })

  it('returns 1 for a leaf under a specified note', () => {
    expect(getLeafPriority(makeTarget({ relativePath: 'x.md', noteId: 'note-2' }), sets)).toBe(1)
  })

  it('returns 2 otherwise', () => {
    expect(getLeafPriority(makeTarget({ relativePath: 'x.md', noteId: 'note-9' }), sets)).toBe(2)
  })
})

describe('buildLeafFromTarget', () => {
  it('builds a Leaf with the target metadata, content, and blobSha', () => {
    const leaf = buildLeafFromTarget(makeTarget(), 'body', 'blob-sha')
    expect(leaf).toEqual({
      id: 'leaf-1',
      title: 'Title',
      noteId: 'note-1',
      content: 'body',
      updatedAt: 111,
      order: 0,
      badgeIcon: undefined,
      badgeColor: undefined,
      blobSha: 'blob-sha',
    })
  })
})
