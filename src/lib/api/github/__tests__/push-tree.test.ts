/**
 * push-tree.ts の直接単体テスト（#226 Phase 3 PR-3）
 *
 * characterization（github-push.characterization.test.ts）は pushAllWithTreeAPI 全体を
 * fetch モックで pin する。ここでは抽出した純粋関数 buildPushMetadata / buildTreeItems を
 * 直接呼び、メタデータ生成・tree エントリ構築・差分判定の分岐を単体で固定する。
 */

import { describe, expect, it } from 'vitest'

import type { TreeItem } from '../push-tree'

// push-tree.ts は PRIORITY_LEAF_ID を ../../utils から取り込み、その連鎖で
// storage.ts が module 評価時に localStorage を触る。metadata.test と同じく
// import 前に localStorage をスタブしておく（純関数の検証には無関係）。
const storageBacking = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => storageBacking.get(k) ?? null,
  setItem: (k: string, v: string) => void storageBacking.set(k, v),
  removeItem: (k: string) => void storageBacking.delete(k),
  clear: () => storageBacking.clear(),
  key: (i: number) => Array.from(storageBacking.keys())[i] ?? null,
  get length() {
    return storageBacking.size
  },
}

const { buildPushMetadata, buildTreeItems } = await import('../push-tree')
const { calculateGitBlobSha } = await import('../sha')
const { makeNote, makeLeaf, makeMetadata } = await import('./fetch-mock')
const { PRIORITY_LEAF_ID } = await import('../../../utils')

// ============================================
// buildPushMetadata（同期・純粋）
// ============================================
describe('buildPushMetadata', () => {
  it('builds home metadata with pushCount and relative leaf paths', () => {
    const notes = [makeNote({ id: 'note-1', name: 'MyNote', order: 2 })]
    const leaves = [
      makeLeaf({ id: 'leaf-1', noteId: 'note-1', title: 'MyLeaf', updatedAt: 42, order: 3 }),
    ]
    const meta = buildPushMetadata({
      notes,
      leaves,
      existingMetadata: makeMetadata(),
      pushCount: 7,
      world: 'home',
    })
    expect(meta.version).toBe(1)
    expect(meta.pushCount).toBe(7)
    expect(meta.notes['MyNote']).toEqual({ id: 'note-1', order: 2 })
    expect(meta.leaves['MyNote/MyLeaf.md']).toEqual({ id: 'leaf-1', updatedAt: 42, order: 3 })
  })

  it('omits undefined badge fields', () => {
    const meta = buildPushMetadata({
      notes: [makeNote({ id: 'note-1', name: 'N' })],
      leaves: [makeLeaf({ id: 'leaf-1', noteId: 'note-1', title: 'L' })],
      existingMetadata: makeMetadata(),
      pushCount: 0,
      world: 'home',
    })
    expect('badgeIcon' in meta.notes['N']).toBe(false)
    expect('badgeColor' in meta.notes['N']).toBe(false)
    expect('badgeIcon' in meta.leaves['N/L.md']).toBe(false)
  })

  it('includes badge fields when present', () => {
    const meta = buildPushMetadata({
      notes: [makeNote({ id: 'note-1', name: 'N', badgeIcon: 'star', badgeColor: 'red' })],
      leaves: [makeLeaf({ id: 'leaf-1', noteId: 'note-1', title: 'L', badgeIcon: 'flag' })],
      existingMetadata: makeMetadata(),
      pushCount: 0,
      world: 'home',
    })
    expect(meta.notes['N']).toMatchObject({ badgeIcon: 'star', badgeColor: 'red' })
    expect(meta.leaves['N/L.md']).toMatchObject({ badgeIcon: 'flag' })
  })

  it('restores __priority__ from localMetadata first (updatedAt:0/order:0 hardcoded)', () => {
    const local = makeMetadata({
      leaves: {
        [PRIORITY_LEAF_ID]: {
          id: PRIORITY_LEAF_ID,
          updatedAt: 999,
          order: 5,
          badgeIcon: 'local-icon',
          badgeColor: 'local-color',
        },
      },
    })
    const existing = makeMetadata({
      leaves: {
        [PRIORITY_LEAF_ID]: {
          id: PRIORITY_LEAF_ID,
          updatedAt: 111,
          order: 1,
          badgeIcon: 'existing-icon',
        },
      },
    })
    const meta = buildPushMetadata({
      notes: [],
      leaves: [],
      localMetadata: local,
      existingMetadata: existing,
      pushCount: 0,
      world: 'home',
    })
    expect(meta.leaves[PRIORITY_LEAF_ID]).toEqual({
      id: PRIORITY_LEAF_ID,
      updatedAt: 0,
      order: 0,
      badgeIcon: 'local-icon',
      badgeColor: 'local-color',
    })
  })

  it('falls back to existingMetadata for __priority__ when local absent', () => {
    const existing = makeMetadata({
      leaves: {
        [PRIORITY_LEAF_ID]: {
          id: PRIORITY_LEAF_ID,
          updatedAt: 111,
          order: 1,
          badgeColor: 'existing-color',
        },
      },
    })
    const meta = buildPushMetadata({
      notes: [],
      leaves: [],
      existingMetadata: existing,
      pushCount: 0,
      world: 'home',
    })
    expect(meta.leaves[PRIORITY_LEAF_ID]).toMatchObject({
      updatedAt: 0,
      order: 0,
      badgeColor: 'existing-color',
    })
  })

  it('does not add __priority__ when neither source has a badge', () => {
    const existing = makeMetadata({
      leaves: {
        [PRIORITY_LEAF_ID]: { id: PRIORITY_LEAF_ID, updatedAt: 0, order: 0 },
      },
    })
    const meta = buildPushMetadata({
      notes: [],
      leaves: [],
      existingMetadata: existing,
      pushCount: 0,
      world: 'home',
    })
    expect(PRIORITY_LEAF_ID in meta.leaves).toBe(false)
  })

  it('archive world never restores __priority__ and uses archive base path', () => {
    const local = makeMetadata({
      leaves: {
        [PRIORITY_LEAF_ID]: { id: PRIORITY_LEAF_ID, updatedAt: 5, order: 5, badgeIcon: 'x' },
      },
    })
    const meta = buildPushMetadata({
      notes: [makeNote({ id: 'an-1', name: 'ArchNote' })],
      leaves: [makeLeaf({ id: 'al-1', noteId: 'an-1', title: 'ArchLeaf' })],
      localMetadata: local,
      existingMetadata: makeMetadata(),
      pushCount: 0,
      world: 'archive',
    })
    expect(PRIORITY_LEAF_ID in meta.leaves).toBe(false)
    // relative path strips .agasteer/archive/
    expect(meta.leaves['ArchNote/ArchLeaf.md']).toMatchObject({ id: 'al-1' })
    expect(meta.pushCount).toBe(0)
  })
})

// ============================================
// buildTreeItems（async・fetch 非依存）
// ============================================
describe('buildTreeItems', () => {
  const findItem = (items: TreeItem[], path: string) => items.find((i) => i.path === path)

  it('preserves items, adds root+note gitkeeps and a changed leaf as content', async () => {
    const notes = [makeNote({ id: 'note-1', name: 'MyNote' })]
    const leaves = [makeLeaf({ id: 'leaf-1', noteId: 'note-1', title: 'MyLeaf', content: 'body' })]
    const preserveItems: TreeItem[] = [
      { path: 'README.md', mode: '100644', type: 'blob', sha: 'readme-sha' },
    ]
    const emptyGitkeepSha = await calculateGitBlobSha('')

    const { treeItems, changedHomeLeafPaths, changedArchiveLeafPaths } = await buildTreeItems({
      notes,
      leaves,
      isArchiveLoaded: false,
      existingNotesFiles: new Map(),
      existingArchiveFiles: new Map(),
      preserveItems,
      emptyGitkeepSha,
    })

    // preserve は先頭
    expect(treeItems[0]).toEqual({
      path: 'README.md',
      mode: '100644',
      type: 'blob',
      sha: 'readme-sha',
    })
    // root gitkeep（新規 → content:''）
    expect(findItem(treeItems, '.agasteer/notes/.gitkeep')).toMatchObject({ content: '' })
    // note gitkeep
    expect(findItem(treeItems, '.agasteer/notes/MyNote/.gitkeep')).toMatchObject({ content: '' })
    // leaf は content 送信・changed に載る
    expect(findItem(treeItems, '.agasteer/notes/MyNote/MyLeaf.md')).toMatchObject({
      content: 'body',
    })
    expect(changedHomeLeafPaths).toEqual(['.agasteer/notes/MyNote/MyLeaf.md'])
    expect(changedArchiveLeafPaths).toEqual([])
  })

  it('reuses existing sha for an unchanged leaf and existing gitkeep', async () => {
    const notes = [makeNote({ id: 'note-1', name: 'MyNote' })]
    const leaves = [makeLeaf({ id: 'leaf-1', noteId: 'note-1', title: 'MyLeaf', content: 'same' })]
    const leafPath = '.agasteer/notes/MyNote/MyLeaf.md'
    const leafSha = await calculateGitBlobSha('same')
    const emptyGitkeepSha = await calculateGitBlobSha('')
    const existingNotesFiles = new Map<string, string>([
      [leafPath, leafSha],
      ['.agasteer/notes/.gitkeep', emptyGitkeepSha],
      ['.agasteer/notes/MyNote/.gitkeep', emptyGitkeepSha],
    ])

    const { treeItems, changedHomeLeafPaths } = await buildTreeItems({
      notes,
      leaves,
      isArchiveLoaded: false,
      existingNotesFiles,
      existingArchiveFiles: new Map(),
      preserveItems: [],
      emptyGitkeepSha,
    })

    const leafItem = findItem(treeItems, leafPath)!
    expect(leafItem.sha).toBe(leafSha)
    expect('content' in leafItem).toBe(false)
    expect(changedHomeLeafPaths).toEqual([])
    // 既存 gitkeep は sha 再利用
    expect(findItem(treeItems, '.agasteer/notes/.gitkeep')).toMatchObject({ sha: emptyGitkeepSha })
  })

  it('writes archive gitkeeps, leaves and raw metadata.json when archive is loaded', async () => {
    const notes = [makeNote({ id: 'note-1', name: 'MyNote' })]
    const leaves = [makeLeaf({ id: 'leaf-1', noteId: 'note-1', title: 'MyLeaf' })]
    const archiveNotes = [makeNote({ id: 'an-1', name: 'ArchNote' })]
    const archiveLeaves = [
      makeLeaf({ id: 'al-1', noteId: 'an-1', title: 'ArchLeaf', content: 'arch body' }),
    ]
    const archiveMetadata = buildPushMetadata({
      notes: archiveNotes,
      leaves: archiveLeaves,
      existingMetadata: makeMetadata(),
      pushCount: 0,
      world: 'archive',
    })
    const emptyGitkeepSha = await calculateGitBlobSha('')

    const { treeItems, changedArchiveLeafPaths } = await buildTreeItems({
      notes,
      leaves,
      archiveNotes,
      archiveLeaves,
      isArchiveLoaded: true,
      existingNotesFiles: new Map(),
      existingArchiveFiles: new Map(),
      preserveItems: [],
      emptyGitkeepSha,
      archiveMetadata,
    })

    expect(findItem(treeItems, '.agasteer/archive/.gitkeep')).toMatchObject({ content: '' })
    expect(findItem(treeItems, '.agasteer/archive/ArchNote/.gitkeep')).toMatchObject({
      content: '',
    })
    expect(findItem(treeItems, '.agasteer/archive/ArchNote/ArchLeaf.md')).toMatchObject({
      content: 'arch body',
    })
    expect(changedArchiveLeafPaths).toEqual(['.agasteer/archive/ArchNote/ArchLeaf.md'])
    // archive metadata.json は raw JSON.stringify（pretty 2-space）
    const metaItem = findItem(treeItems, '.agasteer/archive/metadata.json')!
    expect(metaItem.content).toBe(JSON.stringify(archiveMetadata, null, 2))
    expect(JSON.parse(metaItem.content!).leaves['ArchNote/ArchLeaf.md']).toMatchObject({
      id: 'al-1',
    })
  })

  it('does not emit archive entries when archive is not loaded', async () => {
    const notes = [makeNote({ id: 'note-1', name: 'MyNote' })]
    const leaves = [makeLeaf({ id: 'leaf-1', noteId: 'note-1', title: 'MyLeaf' })]
    const emptyGitkeepSha = await calculateGitBlobSha('')

    const { treeItems } = await buildTreeItems({
      notes,
      leaves,
      isArchiveLoaded: false,
      existingNotesFiles: new Map(),
      existingArchiveFiles: new Map(),
      preserveItems: [],
      emptyGitkeepSha,
    })
    expect(treeItems.some((i) => i.path.startsWith('.agasteer/archive/'))).toBe(false)
  })
})
