/**
 * リーフ統計管理ストア
 * リーフの総数と文字数をトラッキング
 */

import type { Leaf, Note } from '../types'
import { computeLeafCharCount } from '../utils/stats'
import { isPriorityLeaf } from '../utils/priority'

export interface LeafStatsState {
  totalLeafCount: number
  totalLeafChars: number
  leafCharCounts: Map<string, number>
}

function createLeafStatsStore() {
  let _totalLeafCount = $state(0)
  let _totalLeafChars = $state(0)
  let _leafCharCounts = $state(new Map<string, number>())

  return {
    get totalLeafCount() {
      return _totalLeafCount
    },
    get totalLeafChars() {
      return _totalLeafChars
    },
    get leafCharCounts() {
      return _leafCharCounts
    },

    /**
     * 統計をリセット
     */
    reset() {
      _totalLeafCount = 0
      _totalLeafChars = 0
      _leafCharCounts = new Map()
    },

    /**
     * 全リーフから統計を再構築
     */
    rebuild(allLeaves: Leaf[], allNotes: Note[]) {
      const leafCharCounts = new Map<string, number>()
      let totalLeafCount = 0
      let totalLeafChars = 0

      for (const leaf of allLeaves) {
        // Priority リーフは統計から除外
        if (isPriorityLeaf(leaf.id)) continue

        const chars = computeLeafCharCount(leaf.content)
        leafCharCounts.set(leaf.id, chars)
        totalLeafCount++
        totalLeafChars += chars
      }

      _totalLeafCount = totalLeafCount
      _totalLeafChars = totalLeafChars
      _leafCharCounts = leafCharCounts
    },

    /**
     * リーフを追加
     */
    addLeaf(leafId: string, content: string) {
      const chars = computeLeafCharCount(content)
      const newMap = new Map(_leafCharCounts)
      newMap.set(leafId, chars)
      _totalLeafCount = _totalLeafCount + 1
      _totalLeafChars = _totalLeafChars + chars
      _leafCharCounts = newMap
    },

    /**
     * リーフを削除
     */
    removeLeaf(leafId: string, content?: string) {
      const chars = _leafCharCounts.get(leafId) ?? (content ? computeLeafCharCount(content) : 0)
      const newMap = new Map(_leafCharCounts)
      newMap.delete(leafId)
      _totalLeafCount = Math.max(0, _totalLeafCount - 1)
      _totalLeafChars = Math.max(0, _totalLeafChars - chars)
      _leafCharCounts = newMap
    },

    /**
     * リーフのコンテンツを更新
     */
    updateLeafContent(leafId: string, newContent: string, prevContent?: string) {
      const prevChars =
        _leafCharCounts.get(leafId) ?? (prevContent ? computeLeafCharCount(prevContent) : 0)
      const nextChars = computeLeafCharCount(newContent)
      const newMap = new Map(_leafCharCounts)
      newMap.set(leafId, nextChars)
      _totalLeafChars = _totalLeafChars + (nextChars - prevChars)
      _leafCharCounts = newMap
    },

    /**
     * 現在の状態を取得（リアクティブでない）
     */
    getState(): LeafStatsState {
      return {
        totalLeafCount: _totalLeafCount,
        totalLeafChars: _totalLeafChars,
        leafCharCounts: _leafCharCounts,
      }
    },

    /**
     * 特定リーフの文字数を取得
     */
    getLeafChars(leafId: string): number {
      return _leafCharCounts.get(leafId) ?? 0
    },
  }
}

export const leafStatsStore = createLeafStatsStore()

// ============================================
// アーカイブ用統計ストア
// ============================================
export const archiveLeafStatsStore = createLeafStatsStore()
