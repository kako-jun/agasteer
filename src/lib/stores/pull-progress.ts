/**
 * Pull進捗管理ストア
 * Pull中のリーフ取得進捗を追跡
 */
import { writable, derived } from 'svelte/store'

interface PullProgressState {
  /** 総リーフ数（Pull対象） */
  totalLeaves: number
  /** 受信済みリーフ数 */
  fetchedLeaves: number
}

function createPullProgressStore() {
  const { subscribe, set, update } = writable<PullProgressState>({
    totalLeaves: 0,
    fetchedLeaves: 0,
  })

  return {
    subscribe,

    /** Pull開始時に総リーフ数をセット */
    start(totalLeaves: number) {
      set({ totalLeaves, fetchedLeaves: 0 })
    },

    /** リーフ受信時にカウントアップ */
    increment() {
      update((state) => ({
        ...state,
        fetchedLeaves: state.fetchedLeaves + 1,
      }))
    },

    /** Pull完了時にリセット */
    reset() {
      set({ totalLeaves: 0, fetchedLeaves: 0 })
    },
  }
}

export const pullProgressStore = createPullProgressStore()

/** 進捗情報（percent, fetched, total）、Pull中でなければnull */
export const pullProgressInfo = derived(pullProgressStore, ($progress) => {
  if ($progress.totalLeaves === 0) return null
  const percent = Math.round(($progress.fetchedLeaves / $progress.totalLeaves) * 100)
  if (percent >= 100) return null
  return {
    percent,
    fetched: $progress.fetchedLeaves,
    total: $progress.totalLeaves,
  }
})
