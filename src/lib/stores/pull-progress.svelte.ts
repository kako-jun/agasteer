/**
 * Pull進捗管理ストア
 * Pull中のリーフ取得進捗を追跡
 */

interface PullProgressState {
  /** 総リーフ数（Pull対象） */
  totalLeaves: number
  /** 受信済みリーフ数 */
  fetchedLeaves: number
}

function createPullProgressStore() {
  let _totalLeaves = $state(0)
  let _fetchedLeaves = $state(0)

  return {
    get totalLeaves() {
      return _totalLeaves
    },
    get fetchedLeaves() {
      return _fetchedLeaves
    },

    /** Pull開始時に総リーフ数をセット */
    start(totalLeaves: number) {
      _totalLeaves = totalLeaves
      _fetchedLeaves = 0
    },

    /** リーフ受信時にカウントアップ */
    increment() {
      _fetchedLeaves = _fetchedLeaves + 1
    },

    /** Pull完了時にリセット */
    reset() {
      _totalLeaves = 0
      _fetchedLeaves = 0
    },
  }
}

export const pullProgressStore = createPullProgressStore()

/** 進捗情報（percent, fetched, total）、Pull中でなければnull */
export const pullProgressInfo = {
  get value(): { percent: number; fetched: number; total: number } | null {
    const totalLeaves = pullProgressStore.totalLeaves
    const fetchedLeaves = pullProgressStore.fetchedLeaves
    if (totalLeaves === 0) return null
    const percent = Math.round((fetchedLeaves / totalLeaves) * 100)
    if (percent >= 100) return null
    return {
      percent,
      fetched: fetchedLeaves,
      total: totalLeaves,
    }
  },
}
