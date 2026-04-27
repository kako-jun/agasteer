import { describe, expect, it } from 'vitest'

import type { Leaf } from '../types'

// jsdom を有効化していないため、storage 系がトップレベルで参照する
// localStorage をスタブしてから動的 import する
const _kvStore = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => _kvStore.get(k) ?? null,
  setItem: (k: string, v: string) => void _kvStore.set(k, v),
  removeItem: (k: string) => void _kvStore.delete(k),
  clear: () => _kvStore.clear(),
  key: (i: number) => Array.from(_kvStore.keys())[i] ?? null,
  get length() {
    return _kvStore.size
  },
}

const { extractLinePriorities, extractParagraphPriority, extractPriorityItems } =
  await import('./priority')

function makeLeaf(content: string): Leaf {
  return {
    id: 'leaf-1',
    title: 'Test',
    noteId: 'note-1',
    content,
    updatedAt: 0,
    order: 0,
  }
}

describe('extractParagraphPriority', () => {
  it('先頭行の左端 [N] を段落優先度として返す', () => {
    expect(extractParagraphPriority('[1] hello\nworld')).toBe(1)
  })

  it('最終行の右端 [N] を段落優先度として返す', () => {
    expect(extractParagraphPriority('hello\nworld [2]')).toBe(2)
  })

  it('境界以外のマーカーは認識しない', () => {
    expect(extractParagraphPriority('hello\n[3] middle\nworld')).toBeNull()
  })
})

describe('extractLinePriorities', () => {
  it('全位置のマーカー（先頭/中間/最終）を拾う', () => {
    const result = extractLinePriorities('[1] a\nb [2]\n[3] c')
    expect(result).toEqual([
      { lineIndex: 0, priority: 1, lineText: 'a' },
      { lineIndex: 1, priority: 2, lineText: 'b' },
      { lineIndex: 2, priority: 3, lineText: 'c' },
    ])
  })

  it('マーカーのない行は無視する', () => {
    const result = extractLinePriorities('plain\n[1] marked\nplain')
    expect(result).toEqual([{ lineIndex: 1, priority: 1, lineText: 'marked' }])
  })
})

describe('extractPriorityItems (#177 リストの各項目を独立した priority に分割する)', () => {
  it('各リスト項目に [N] が付いていれば項目数ぶん独立した priority になる', () => {
    const leaf = makeLeaf(
      '## やらないこと\n' +
        '- 本を増やしすぎない [1]\n' +
        '- イディオム本や派生シリーズを全部やろうとしない [1]\n' +
        '- 発音記号の勉強に時間を使いすぎない [2]'
    )
    const items = extractPriorityItems(leaf, 'note', 'note/Test', 0)
    expect(items).toHaveLength(3)
    expect(items[0].priority).toBe(1)
    expect(items[0].content).toBe('- 本を増やしすぎない')
    expect(items[1].priority).toBe(1)
    expect(items[1].content).toBe('- イディオム本や派生シリーズを全部やろうとしない')
    expect(items[2].priority).toBe(2)
    expect(items[2].content).toBe('- 発音記号の勉強に時間を使いすぎない')
  })

  it('段落の境界に1個だけマーカーがある場合は段落全体を1項目にする', () => {
    const leaf = makeLeaf('[1] 大事な話\n続きの行1\n続きの行2')
    const items = extractPriorityItems(leaf, 'note', 'note/Test', 0)
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(1)
    expect(items[0].content).toBe('大事な話\n続きの行1\n続きの行2')
  })

  it('段落の最終行右端に1個だけマーカーがある場合も段落全体を1項目にする', () => {
    const leaf = makeLeaf('大事な話\n続きの行1\n続きの行2 [2]')
    const items = extractPriorityItems(leaf, 'note', 'note/Test', 0)
    expect(items).toHaveLength(1)
    expect(items[0].priority).toBe(2)
  })

  it('段落間（空行で区切られた2段落）は別々に処理する', () => {
    const leaf = makeLeaf('[1] 段落A\n\n[2] 段落B')
    const items = extractPriorityItems(leaf, 'note', 'note/Test', 0)
    expect(items).toHaveLength(2)
    expect(items[0].priority).toBe(1)
    expect(items[0].content).toBe('段落A')
    expect(items[1].priority).toBe(2)
    expect(items[1].content).toBe('段落B')
  })

  it('マーカーがなければ何も抽出しない', () => {
    const leaf = makeLeaf('これは普通のテキスト\n何もマーカーなし')
    expect(extractPriorityItems(leaf, 'note', 'note/Test', 0)).toEqual([])
  })
})
