import { describe, expect, it, beforeEach } from 'vitest'

import type { Leaf, Note } from '../types'

// 他のテスト同様 jsdom を有効にしていないため、storage 系モジュールが
// トップレベルで参照する localStorage をスタブしてから動的 import する。
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size
  },
}

const { leafStatsStore } = await import('./leaf-stats.svelte')

function makeLeaf(id: string, content: string): Leaf {
  return {
    id,
    noteId: 'note-1',
    title: id,
    content,
    order: 0,
  } as Leaf
}

const notes: Note[] = [{ id: 'note-1', name: 'Note', parentId: null, order: 0 }]

describe('leafStatsStore.rebuild', () => {
  beforeEach(() => {
    leafStatsStore.reset()
  })

  it('集計が 0 の状態から rebuild するとリーフ数・文字数が反映される（#168 回帰防止）', () => {
    const leaves = [makeLeaf('a', 'hello'), makeLeaf('b', 'world!!')]
    leafStatsStore.rebuild(leaves, notes)
    expect(leafStatsStore.totalLeafCount).toBe(2)
    expect(leafStatsStore.totalLeafChars).toBe('hello'.length + 'world!!'.length)
  })

  it('Priority リーフは集計から除外される', () => {
    const leaves = [makeLeaf('__priority__', 'ignored content'), makeLeaf('a', 'abc')]
    leafStatsStore.rebuild(leaves, notes)
    expect(leafStatsStore.totalLeafCount).toBe(1)
    expect(leafStatsStore.totalLeafChars).toBe(3)
  })

  it('rebuild は冪等（同じ入力で複数回呼んでも値が安定）', () => {
    const leaves = [makeLeaf('a', 'abc'), makeLeaf('b', 'de')]
    leafStatsStore.rebuild(leaves, notes)
    leafStatsStore.rebuild(leaves, notes)
    expect(leafStatsStore.totalLeafCount).toBe(2)
    expect(leafStatsStore.totalLeafChars).toBe(5)
  })
})
