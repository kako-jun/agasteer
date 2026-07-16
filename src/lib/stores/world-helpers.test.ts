import { describe, expect, it, beforeEach } from 'vitest'

import { getLeafStatsForWorldView } from './world-helpers'
import type { Leaf, Note, View } from '../types'

// leaf-stats.svelte.ts はモジュール内で $state を使うため、他のテスト（leaf-stats.test.ts）
// 同様に localStorage をスタブしてから動的 import する。
const localStorageStore = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => localStorageStore.get(k) ?? null,
  setItem: (k: string, v: string) => void localStorageStore.set(k, v),
  removeItem: (k: string) => void localStorageStore.delete(k),
  clear: () => localStorageStore.clear(),
  key: (i: number) => Array.from(localStorageStore.keys())[i] ?? null,
  get length() {
    return localStorageStore.size
  },
}

const { leafStatsStore, archiveLeafStatsStore } = await import('./leaf-stats.svelte')

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

describe('getLeafStatsForWorldView', () => {
  const homeStats = { label: 'home' }
  const archiveStats = { label: 'archive' }

  it('[正常系] world=home, view=home のとき homeStats を返す', () => {
    expect(getLeafStatsForWorldView('home', 'home', homeStats, archiveStats)).toBe(homeStats)
  })

  it('[正常系/同値分割] world=home, view=edit のとき homeStats を返す（home ワールドは view によらず home 統計）', () => {
    expect(getLeafStatsForWorldView('home', 'edit', homeStats, archiveStats)).toBe(homeStats)
  })

  it('[決定表] world=archive, view=home のとき archiveStats を返す', () => {
    expect(getLeafStatsForWorldView('archive', 'home', homeStats, archiveStats)).toBe(
      archiveStats
    )
  })

  it('[決定表/バグ再発防止の核] world=archive, view=edit のとき archiveStats ではなく homeStats を返す（#290: 「archiveなら常にarchiveStats」という単純化ミスの検出）', () => {
    expect(getLeafStatsForWorldView('archive', 'edit', homeStats, archiveStats)).toBe(homeStats)
  })

  it.each<View>(['settings', 'note', 'preview', 'media'])(
    '[同値分割の網羅] world=archive, view=%s のとき homeStats を返す（home ビュー以外は常に home 統計）',
    (view) => {
      expect(getLeafStatsForWorldView('archive', view, homeStats, archiveStats)).toBe(homeStats)
    }
  )

  it.each(['Home', 'homepage'])(
    '[境界値相当] view に近似文字列 "%s" を注入しても archiveStats に化けず homeStats のまま（厳密一致の保証）',
    (fakeView) => {
      expect(
        getLeafStatsForWorldView('archive', fakeView as unknown as View, homeStats, archiveStats)
      ).toBe(homeStats)
    }
  )

  it('[異常系] homeStats/archiveStats に undefined を渡しても例外を投げず undefined をそのまま返す', () => {
    expect(() =>
      getLeafStatsForWorldView<undefined>('archive', 'home', undefined, undefined)
    ).not.toThrow()
    expect(getLeafStatsForWorldView<undefined>('archive', 'home', undefined, undefined)).toBeUndefined()
  })

  it('[異常系] homeStats/archiveStats に null を渡しても例外を投げず null をそのまま返す', () => {
    expect(() => getLeafStatsForWorldView<null>('home', 'home', null, null)).not.toThrow()
    expect(getLeafStatsForWorldView<null>('home', 'home', null, null)).toBeNull()
  })

  it('[状態遷移] world を home→archive→home と連続で呼び直しても都度正しい方に切り替わる', () => {
    expect(getLeafStatsForWorldView('home', 'home', homeStats, archiveStats)).toBe(homeStats)
    expect(getLeafStatsForWorldView('archive', 'home', homeStats, archiveStats)).toBe(archiveStats)
    expect(getLeafStatsForWorldView('home', 'home', homeStats, archiveStats)).toBe(homeStats)
  })

  it('[並行実行/コア回帰・最重要] 同一のhomeStats/archiveStats参照で左(home)・右(archive)を同時に呼び出しても互いに独立している（#290 本体）', () => {
    const leftResult = getLeafStatsForWorldView('home', 'home', homeStats, archiveStats)
    const rightResult = getLeafStatsForWorldView('archive', 'home', homeStats, archiveStats)
    expect(leftResult).toBe(homeStats)
    expect(rightResult).toBe(archiveStats)
    expect(leftResult).not.toBe(rightResult)
  })

  it('[並行実行/コア回帰] 左右を入れ替えたケース（左archive/右home）でも互いに独立している', () => {
    const leftResult = getLeafStatsForWorldView('archive', 'home', homeStats, archiveStats)
    const rightResult = getLeafStatsForWorldView('home', 'home', homeStats, archiveStats)
    expect(leftResult).toBe(archiveStats)
    expect(rightResult).toBe(homeStats)
    expect(leftResult).not.toBe(rightResult)
  })

  it('[汎用性] T が number でもそのまま選択される', () => {
    expect(getLeafStatsForWorldView('home', 'home', 1, 2)).toBe(1)
    expect(getLeafStatsForWorldView('archive', 'home', 1, 2)).toBe(2)
  })

  it('[汎用性] T が配列でもそのまま選択される（参照同一性を保つ）', () => {
    const homeArr = [1, 2, 3]
    const archiveArr = [4, 5, 6]
    expect(getLeafStatsForWorldView('archive', 'home', homeArr, archiveArr)).toBe(archiveArr)
    expect(getLeafStatsForWorldView('archive', 'edit', homeArr, archiveArr)).toBe(homeArr)
  })

  it('[汎用性] T がオブジェクトでもそのまま選択される（参照同一性を保つ）', () => {
    const homeObj = { totalLeafCount: 1 }
    const archiveObj = { totalLeafCount: 2 }
    expect(getLeafStatsForWorldView('home', 'edit', homeObj, archiveObj)).toBe(homeObj)
  })
})

describe('PaneView 相当の合成ロジック（実ストア統合・#290 回帰防止）', () => {
  beforeEach(() => {
    leafStatsStore.reset()
    archiveLeafStatsStore.reset()
  })

  it('[統合/最重要] archive側だけrebuildしても、left(home)側の解決結果はhomeStats経由のままで値が変化しない', () => {
    const homeLeaves = [makeLeaf('h1', 'aaaaa')]
    leafStatsStore.rebuild(homeLeaves, notes)

    // PaneView.svelte と同一の呼び出し式を左右2セットで再現
    // left: world='home', right: world='archive'（どちらも currentView は 'home' 相当）
    const view: View = 'home'
    const left = getLeafStatsForWorldView('home', view, leafStatsStore, archiveLeafStatsStore)
    const right = getLeafStatsForWorldView('archive', view, leafStatsStore, archiveLeafStatsStore)

    expect(left).toBe(leafStatsStore)
    expect(right).toBe(archiveLeafStatsStore)
    expect(left.totalLeafCount).toBe(1)
    expect(left.totalLeafChars).toBe('aaaaa'.length)

    // archive側だけ値を変える
    const archiveLeaves = [makeLeaf('a1', 'bb'), makeLeaf('a2', 'cccc')]
    archiveLeafStatsStore.rebuild(archiveLeaves, notes)

    // right(archive) 側は更新されるが、left(home) 側の解決結果は無関係のまま
    expect(right.totalLeafCount).toBe(2)
    expect(left.totalLeafCount).toBe(1)
    expect(left.totalLeafChars).toBe('aaaaa'.length)
  })
})
