/**
 * リーフ統計管理ストア
 * リーフの総数と文字数をトラッキング
 */

import { writable, get } from 'svelte/store'
import type { Leaf, Note } from '../types'
import { computeLeafCharCount } from '../utils/stats'
import { isPriorityLeaf } from '../utils/priority'

export interface LeafStatsState {
  totalLeafCount: number
  totalLeafChars: number
  leafCharCounts: Map<string, number>
}

function createLeafStatsStore() {
  const { subscribe, set, update } = writable<LeafStatsState>({
    totalLeafCount: 0,
    totalLeafChars: 0,
    leafCharCounts: new Map(),
  })

  return {
    subscribe,

    /**
     * 統計をリセット
     */
    reset() {
      set({
        totalLeafCount: 0,
        totalLeafChars: 0,
        leafCharCounts: new Map(),
      })
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

      set({ totalLeafCount, totalLeafChars, leafCharCounts })
    },

    /**
     * リーフを追加
     */
    addLeaf(leafId: string, content: string) {
      update((state) => {
        const chars = computeLeafCharCount(content)
        const newMap = new Map(state.leafCharCounts)
        newMap.set(leafId, chars)
        return {
          totalLeafCount: state.totalLeafCount + 1,
          totalLeafChars: state.totalLeafChars + chars,
          leafCharCounts: newMap,
        }
      })
    },

    /**
     * リーフを削除
     */
    removeLeaf(leafId: string, content?: string) {
      update((state) => {
        const chars =
          state.leafCharCounts.get(leafId) ?? (content ? computeLeafCharCount(content) : 0)
        const newMap = new Map(state.leafCharCounts)
        newMap.delete(leafId)
        return {
          totalLeafCount: Math.max(0, state.totalLeafCount - 1),
          totalLeafChars: Math.max(0, state.totalLeafChars - chars),
          leafCharCounts: newMap,
        }
      })
    },

    /**
     * リーフのコンテンツを更新
     */
    updateLeafContent(leafId: string, newContent: string, prevContent?: string) {
      update((state) => {
        const prevChars =
          state.leafCharCounts.get(leafId) ?? (prevContent ? computeLeafCharCount(prevContent) : 0)
        const nextChars = computeLeafCharCount(newContent)
        const newMap = new Map(state.leafCharCounts)
        newMap.set(leafId, nextChars)
        return {
          totalLeafCount: state.totalLeafCount,
          totalLeafChars: state.totalLeafChars + (nextChars - prevChars),
          leafCharCounts: newMap,
        }
      })
    },

    /**
     * 現在の状態を取得（リアクティブでない）
     */
    getState(): LeafStatsState {
      return get({ subscribe })
    },

    /**
     * 特定リーフの文字数を取得
     */
    getLeafChars(leafId: string): number {
      return get({ subscribe }).leafCharCounts.get(leafId) ?? 0
    },
  }
}

export const leafStatsStore = createLeafStatsStore()

// ============================================
// アーカイブ用統計ストア
// ============================================
export const archiveLeafStatsStore = createLeafStatsStore()
