import { describe, expect, it, beforeEach } from 'vitest'

import type { Leaf, Note } from '../types'

// stores.svelte.ts はトップレベルで storage モジュールを読み、その先で localStorage に
// 触れるためスタブしてから動的 import する。
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

const { leftLeaf, rightLeaf, leftNote, rightNote, applyLeafFieldUpdate, applyNoteFieldUpdate } =
  await import('./stores.svelte')

function makeLeaf(id: string, overrides: Partial<Leaf> = {}): Leaf {
  return {
    id,
    noteId: 'note-1',
    title: id,
    content: 'initial',
    order: 0,
    ...overrides,
  } as Leaf
}

function makeNote(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    name: id,
    parentId: null,
    order: 0,
    ...overrides,
  } as Note
}

describe('applyLeafFieldUpdate (#187 抜本対策)', () => {
  beforeEach(() => {
    leftLeaf.value = null
    rightLeaf.value = null
  })

  it('同 id のリーフは reference を保ったまま指定フィールドだけが更新される', () => {
    leftLeaf.value = makeLeaf('a', { content: 'old' })
    const before = leftLeaf.value

    applyLeafFieldUpdate('a', { content: 'new', updatedAt: 123 })

    const after = leftLeaf.value
    // outer source を bump させない = $state プロキシの参照は同一
    expect(Object.is(before, after)).toBe(true)
    expect(after?.content).toBe('new')
    expect(after?.updatedAt).toBe(123)
    // 不変フィールド（id / noteId / title）は触らない
    expect(after?.id).toBe('a')
    expect(after?.noteId).toBe('note-1')
    expect(after?.title).toBe('a')
  })

  it('id が一致しないリーフは何も変更しない', () => {
    leftLeaf.value = makeLeaf('a', { content: 'old' })
    rightLeaf.value = makeLeaf('b', { content: 'old' })

    applyLeafFieldUpdate('z', { content: 'new' })

    expect(leftLeaf.value?.content).toBe('old')
    expect(rightLeaf.value?.content).toBe('old')
  })

  it('左右両ペインに同 id のリーフがある場合、両方 mutate する', () => {
    leftLeaf.value = makeLeaf('a', { content: 'old' })
    rightLeaf.value = makeLeaf('a', { content: 'old' })
    const beforeLeft = leftLeaf.value
    const beforeRight = rightLeaf.value

    applyLeafFieldUpdate('a', { content: 'new' })

    expect(Object.is(beforeLeft, leftLeaf.value)).toBe(true)
    expect(Object.is(beforeRight, rightLeaf.value)).toBe(true)
    expect(leftLeaf.value?.content).toBe('new')
    expect(rightLeaf.value?.content).toBe('new')
  })

  it('片方のペインだけ id 一致の場合、そちらだけ mutate する', () => {
    leftLeaf.value = makeLeaf('a', { content: 'old' })
    rightLeaf.value = makeLeaf('b', { content: 'old' })

    applyLeafFieldUpdate('a', { content: 'new' })

    expect(leftLeaf.value?.content).toBe('new')
    expect(rightLeaf.value?.content).toBe('old')
  })

  it('null の場合はクラッシュせずに何もしない', () => {
    leftLeaf.value = null
    rightLeaf.value = null

    expect(() => applyLeafFieldUpdate('a', { content: 'new' })).not.toThrow()
  })
})

describe('applyNoteFieldUpdate (#187 抜本対策)', () => {
  beforeEach(() => {
    leftNote.value = null
    rightNote.value = null
  })

  it('同 id のノートは reference を保ったまま指定フィールドだけが更新される', () => {
    leftNote.value = makeNote('n1', { name: 'old' })
    const before = leftNote.value

    applyNoteFieldUpdate('n1', { name: 'new' })

    const after = leftNote.value
    expect(Object.is(before, after)).toBe(true)
    expect(after?.name).toBe('new')
    expect(after?.id).toBe('n1')
  })
})
