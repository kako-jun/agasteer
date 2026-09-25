/**
 * リポ切替時のストア再水和（rehydrate）処理（#297）
 *
 * 元は stores.svelte.ts から分離（#297 nit11: 1モジュール ≈400行のハウスルール
 * 超過対応）。その後 #300 で stores.svelte.ts 自体が god-file 解消のため分割され、
 * 現在このモジュールが依存する notes/leaves 等のストアは core-state.svelte.ts に、
 * setLastPushedSnapshot/clearAllChanges は dirty-tracking.ts に、setRehydrating は
 * persistence-effects.svelte.ts にある。個別 import ではなく、既存の import 元
 * （'./stores.svelte'）を壊さないよう分割後の互換バレル経由でまとめて読む一方向の
 * import のみを持ち、逆方向（core-state.svelte.ts 等からこのモジュールへの import）
 * は存在しない（循環 import 回避）。同じ理由で '../stores' バレル（index.ts）からも
 * re-export する。
 */

import {
  notes,
  leaves,
  archiveNotes,
  archiveLeaves,
  metadata,
  lastKnownCommitSha,
  lastPulledPushCount,
  isStale,
  lastPushTime,
  lastStaleCheckTime,
  setLastPushedSnapshot,
  clearAllChanges,
  setRehydrating,
} from './stores.svelte'
import {
  setCurrentRepo,
  closeCurrentRepoDb,
  loadLeaves,
  loadNotes,
  getPersistedCommitSha,
  getPersistedLastPulledPushCount,
} from '../data/storage'
// #295 S4: metadata 永続化はstorage.tsから分離済み
import { getPersistedMetadata, flushPersistedMetadata } from '../data/metadata-storage'
import { flushPendingSaves } from './auto-save.svelte'
import { leafStatsStore } from './leaf-stats.svelte'
// #254: リポ切替前にメディア添付の挿入着地を待つ（詳細は insert-phase.ts）
import { waitForPendingMediaInserts } from '../api/media/insert-phase'

/**
 * 指定リポの IndexedDB に切り替え、キャッシュ済みのノート/リーフを
 * Svelte ストアへロードする（#131）。
 *
 * - 切り替え前に保留中の保存を flush する
 * - 新リポの per-repo DB を open し、ノート/リーフ/アーカイブをロード
 * - ロード結果を「最後にPushしたスナップショット」として扱い、ダーティ判定の基準にする
 * - 新リポの lastKnownCommitSha を localStorage から復元する
 *
 * 初回（キャッシュなし）の場合はストアが空のままになり、
 * 既存の Pull ロジックが commitSha=null を見て初回 Pull を実行する。
 */
async function applyRehydrateForRepo(repoKey: string): Promise<void> {
  // #254: 添付フローの挿入フェーズが進行中なら着地を待つ。待たずにクリアすると、
  // アップロード済みメディアへの参照テキストが旧リポの store/DB に載る前に消え、
  // メディアが孤児化する（push/pull preflight と同じレースのリポ切替版）。
  // 着地後は下の flushPendingSaves が旧リポ DB へ永続化する。
  await waitForPendingMediaInserts()

  // 旧リポの保留保存を先に flush（データ損失防止）
  try {
    await flushPendingSaves()
    await flushPersistedMetadata()
  } catch (error) {
    console.error('Failed to flush pending saves before repo switch:', error)
  }

  // 旧リポのインメモリをクリア（視覚的な残留を防ぐ）
  notes.value = []
  leaves.value = []
  archiveNotes.value = []
  archiveLeaves.value = []

  // 新リポの DB に切り替え
  try {
    await setCurrentRepo(repoKey)
  } catch (error) {
    console.error('Failed to open per-repo DB:', error)
    // 失敗時は何もしない（Pull が走れば復旧する）
    closeCurrentRepoDb()
    return
  }

  // #297 nit8: この時点で既に次の切替要求（nextRehydrateKey）が来ていれば、
  // repoKey はもう最終適用対象ではないと確定している（次の周回で最終キーに
  // 対してこの続きが行われる）。settings.repoName は切替操作の時点で既に
  // 最終リポを指しているため、これより先の getPersistedCommitSha() /
  // getPersistedMetadata() は「repoKey の」ではなく「settings.repoName（＝
  // 最終リポ）の」スロットを読んでしまい、この中間 repoKey の notes/leaves と
  // 食い違う SHA/metadata が一瞬 store に混線する。無駄な IndexedDB 読み出しも
  // 合わせて避けるため、ここで打ち切る（最終適用時に全状態が揃うので安全）。
  if (nextRehydrateKey !== null) {
    return
  }

  // 新リポのキャッシュをロード（アーカイブは isArchiveLoaded=false のまま、
  // アーカイブ画面を開いたときに別途ロードされる既存フローを維持）
  try {
    const [loadedNotes, loadedLeaves] = await Promise.all([loadNotes(), loadLeaves()])
    notes.value = loadedNotes
    leaves.value = loadedLeaves
    // #168: リポ切替直後はキャッシュからのロードのみで pull が走らない経路もあるため、
    // ホーム右下の統計が 0 にならないよう明示的に再計算する
    leafStatsStore.rebuild(loadedLeaves, loadedNotes)
    // 読み込んだ内容をダーティ判定のベースラインに設定（Pull 成功前と同じ扱い）
    setLastPushedSnapshot(loadedNotes, loadedLeaves, [], [])
    clearAllChanges()
  } catch (error) {
    console.error('Failed to load cached data for new repo:', error)
  }

  // lastKnownCommitSha を新リポの localStorage スロットから復元
  // （この代入は $effect を発火させるが、isRehydrating ガードで
  // setPersistedCommitSha への書き込みはスキップされる）
  lastKnownCommitSha.value = getPersistedCommitSha()
  metadata.value = (await getPersistedMetadata()) ?? {
    version: 1,
    notes: {},
    leaves: {},
    pushCount: 0,
  }
  isStale.value = false
  lastPushTime.value = 0
  lastStaleCheckTime.value = 0
  lastPulledPushCount.value = getPersistedLastPulledPushCount() ?? 0
}

// #297: rehydrateForRepo 実行中の Promise（キュー処理も含む）。null なら idle。
let rehydrateInFlight: Promise<void> | null = null
// 実行中にさらに要求された repoKey。呼び出しのたびに上書きするので、
// 常に「最後に要求された repoKey」だけが残り、中間の要求は破棄される。
let nextRehydrateKey: string | null = null

/**
 * rehydrateForRepo を直列化して実行する（#297）。
 *
 * 実行中に別の repoKey で呼ばれた場合は割り込まず、`nextRehydrateKey` に
 * 最後の要求だけを控えて現在実行中の Promise をそのまま返す。実行中の処理が
 * 終わった時点で `nextRehydrateKey` が残っていれば、それを次の対象として
 * 続けて適用する（中間の要求は上書きされて破棄済み）。すべての呼び出し元の
 * Promise は、キューが空になり最後に適用された repoKey の rehydrate が
 * 完了した時点でまとめて resolve/reject する。
 *
 * `isRehydrating` ガードはこの一連の処理（キューが空になるまで）が
 * すべて終わるまで解除しない。
 *
 * #297 must1: 各周回（1 repoKey ぶんの applyRehydrateForRepo）の例外はここで
 * 捕捉し、キュー済みキーがあれば打ち切らずに継続する。これにより「最後に
 * 要求されたリポは必ず適用される」不変条件を、例外発生時も含めて維持する。
 *
 * #297 question1: reject するかどうかは「最終周回（キューが空になった時点の
 * 周回）が成功したか」だけで決める。周回ごとに `lastError` をリセットするため、
 * 途中の周回が失敗しても後続の周回が成功すれば reject されない
 * （呼び出し元にとって「結局、最後に要求したリポは正しく適用された」ため）。
 * 中間周回の失敗はここで console.error に残すだけに留め、最終周回の失敗だけ
 * まとめて reject する（呼び出し元は既に .catch/try-catch 済みで、そちらが
 * ログする。waitForRehydrate() 経由の待機側は reject を握りつぶす。下記参照）。
 *
 * #297 nit9: 実行中と同じ repoKey が再要求された場合（例: A実行中→B→A）も
 * 特別扱いで dedupe しない。最終的に A が2回（実行中の分＋キュー経由の分）
 * 適用され得るが、2回目は1回目と同じ内容の再適用になるだけで無害。
 * キュー消費ロジックを単純に保つことを優先する。
 */
export function rehydrateForRepo(repoKey: string): Promise<void> {
  if (rehydrateInFlight) {
    nextRehydrateKey = repoKey
    return rehydrateInFlight
  }

  rehydrateInFlight = (async () => {
    // rehydrate 実行中は、ストアへの一時的な代入（null リセット等）が
    // localStorage の新リポ slot に書き戻されないようガードする。
    // #297 question12: この setRehydrating(true) は
    // applyRehydrateForRepo 内の waitForPendingMediaInserts() より前に置く。
    // 待機中（=まだガードが立っていない間）に着地した media insert の
    // effect が isRehydrating ガードなしで走ると、確定直後の書き込みが
    // 新リポの localStorage/IndexedDB slot に漏れてしまうため。
    setRehydrating(true)
    let key = repoKey
    let lastError: unknown = null
    try {
      for (;;) {
        // question1: 周回ごとにリセットする。この周回が成功すれば、前の周回の
        // 失敗は reject 対象から外れる（reject するかどうかは最終周回の結果のみで決まる）。
        lastError = null
        try {
          await applyRehydrateForRepo(key)
        } catch (error) {
          lastError = error
        }
        if (nextRehydrateKey === null) {
          // 最終周回（キューが空）。失敗していれば下でまとめて reject するので、
          // ここではログしない（呼び出し元の .catch/try-catch 側がログする。N1）。
          break
        }
        if (lastError !== null) {
          // 中間周回の失敗: 後続のキュー済みキーが最終的に適用されるため reject
          // はしないが、失敗自体を握りつぶさずここでログしておく（N1）。
          console.error(
            `Failed to rehydrate repo "${key}" (superseded by queued key, continuing):`,
            lastError
          )
        }
        key = nextRehydrateKey
        nextRehydrateKey = null
      }
    } finally {
      // ガードを解除。以降の変更は通常通り per-repo slot に永続化される。
      setRehydrating(false)
      rehydrateInFlight = null
      // must1: キュー済みキーを確実に消す（このループでは既に null のはずだが、
      // 想定外の経路で残ることを防ぐ最終防衛）。
      nextRehydrateKey = null
    }
    if (lastError !== null) {
      throw lastError
    }
  })()

  return rehydrateInFlight
}

/**
 * 実行中の rehydrateInFlight を、reject を握りつぶしながら完了まで待つ。
 * #297 nit7: 1回待って終わりにせず、完了直後に新たに rehydrateForRepo() が
 * 呼ばれて rehydrateInFlight が再セットされていたらそれも続けて待つ
 * （idle に戻るまで追従する）。
 */
async function waitForRehydrateLoop(): Promise<void> {
  while (rehydrateInFlight) {
    // must2: rehydrate 失敗の reject を呼び出し元（pullFromGitHub /
    // pushToGitHub / handleWorldChange / moveNoteToWorld / moveLeafToWorld /
    // runPendingRepoSyncIfIdle / handleCloseSettings）へ伝播させない。
    // 伝播すると、これらを try で囲まず await する呼び出し元の
    // 事後処理が丸ごと飛ぶ。ここでは完了（成功/失敗問わず）だけを待つ。
    await rehydrateInFlight.catch(() => {})
  }
}

/**
 * 実行中の rehydrateForRepo（キュー分も含む）が完全に終わるまで待つ（#297）。
 * 実行中でなければ即座に解決する。pullFromGitHub / pushToGitHub の開始前、
 * handleWorldChange / moveNoteToWorld / moveLeafToWorld のアーカイブロード
 * 開始前、および runPendingRepoSyncIfIdle / handleCloseSettings のアイドル
 * 判定前に呼び、rehydrate 途中で旧/新 DB を取り違えて同期・ロードしないようにする。
 */
export function waitForRehydrate(): Promise<void> {
  // #297 nit6: 実行中の Promise があるときだけ await するファストパス。
  // idle 時に async 関数を経由させず解決済み Promise を直接返すことで、
  // 呼び出し元（push-first 経路等、ロック取得直前に await する箇所）で
  // 余計な microtask を挟まない。
  if (!rehydrateInFlight) return Promise.resolve()
  return waitForRehydrateLoop()
}
