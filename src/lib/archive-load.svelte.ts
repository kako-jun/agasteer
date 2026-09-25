/**
 * アーカイブロード処理
 *
 * pane-navigation.svelte.ts から抽出した、アーカイブ本体のロード（IndexedDBキャッシュ
 * 読み出し + pullArchive）とそのロック管理を集約するモジュール（#301）。
 * #297 でこれらの処理を関数として抽出していたため、独立モジュールへ切り出しやすい
 * 状態になっていた。
 *
 * #307: handleWorldChange に加え、restoreStateFromUrl（URL からの状態復元時の
 * アーカイブロード）も performArchiveLoad 経由に統合。呼び出し元ごとに異なる
 * catch ログ文言は logContext 引数で保つ（#297 S-b のロック窓修正を両呼び出し元に
 * 適用するのが目的で、ログ文言の統一自体は目的ではないため）。
 * #314: performArchiveLoad 自体を再入安全にした。2つの呼び出し元（handleWorldChange /
 * restoreStateFromUrl）が同時に呼んでも pullArchive が2本走らないよう、進行中の
 * ロードの Promise をデデュープする（archiveLoadInFlight）。
 */

import { get } from 'svelte/store'
import { type Leaf, buildBlobShaCache } from './types'
import {
  archiveNotes,
  archiveLeaves,
  archiveMetadata,
  isArchiveLoaded,
  archiveLeafStatsStore,
  isDirty,
  settings,
  setArchiveBaseline,
} from './stores'
import { appState } from './app-state.svelte'
import { saveArchiveNotes, saveArchiveLeaves, loadArchiveNotes, loadArchiveLeaves } from './data'
import { pullArchive, translateGitHubMessage } from './api'
import { showPullToast } from './ui'
import { runPendingRepoSyncIfIdle } from './actions/git-pull'
import { _ } from './i18n'

/**
 * catch のログ文言を出し分けるための呼び出し元識別子（#307 nit4）。
 * 自由文字列だと呼び出し元ごとに文言が揺れうるため、リテラルunionで既知の値に縛る。
 * handleWorldChange は未指定（デフォルトの「Archive pull failed:」）のまま呼ぶ契約。
 */
export type ArchiveLoadLogContext = 'during URL restore'

// ========================================
// Archive cache helper
// ========================================

/**
 * IndexedDBからアーカイブキャッシュを読み込み、ストアにセットする。
 * @returns キャッシュが存在したかどうか
 */
export async function loadArchiveCacheFromDB(): Promise<{ hasCachedData: boolean }> {
  const [cachedNotes, cachedLeaves] = await Promise.all([loadArchiveNotes(), loadArchiveLeaves()])
  const hasCachedData = cachedNotes.length > 0 || cachedLeaves.length > 0
  if (hasCachedData) {
    archiveNotes.value = cachedNotes
    archiveLeaves.value = cachedLeaves
    isArchiveLoaded.value = true
    setArchiveBaseline(cachedNotes, cachedLeaves)
    // キャッシュからstatsを再構築（pullArchive完了前でも統計を表示可能にする）
    archiveLeafStatsStore.rebuild(cachedLeaves, cachedNotes)
  }
  return { hasCachedData }
}

// ========================================
// Archive load
// ========================================

/**
 * アーカイブ本体をロードする（IndexedDBキャッシュ読み出し + pullArchive）。
 * #297 S-b: handleWorldChange から呼ばれる。ロック（appState.isArchiveLoading）の
 * 取得・解除・runPendingRepoSyncIfIdle の呼び出しは呼び出し側（performArchiveLoad）の
 * 責務にし、ここでは実際のロード処理だけを行う（二重実装しない）。
 * #307: restoreStateFromUrl からも呼ばれるようになった。呼び出し元を区別する
 * ための catch ログ文言だけ logContext で差し替え可能にする。
 */
async function loadArchiveIntoStores(logContext?: ArchiveLoadLogContext): Promise<void> {
  // まずIndexedDBキャッシュから読み出し
  const { hasCachedData } = await loadArchiveCacheFromDB()
  if (!hasCachedData) {
    archiveLeafStatsStore.reset()
  }
  // blob SHAキャッシュ用: dirtyでなければキャッシュ済みリーフからSHA→Leafのマップを構築
  const cachedLeafMap = isDirty.value
    ? new Map<string, Leaf>()
    : buildBlobShaCache(archiveLeaves.value)
  try {
    const result = await pullArchive(settings.value, {
      onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
      cachedLeaves: cachedLeafMap.size > 0 ? cachedLeafMap : undefined,
    })
    if (result.success) {
      archiveNotes.value = result.notes
      archiveLeaves.value = result.leaves
      archiveMetadata.value = result.metadata
      isArchiveLoaded.value = true
      setArchiveBaseline(result.notes, result.leaves)
      saveArchiveNotes(result.notes).catch((err) =>
        console.error('Failed to persist archive notes:', err)
      )
      saveArchiveLeaves(result.leaves).catch((err) =>
        console.error('Failed to persist archive leaves:', err)
      )
    } else {
      const t = get(_)
      // キャッシュがなければエラー表示
      if (!hasCachedData) {
        showPullToast(
          translateGitHubMessage(
            result.message,
            t,
            result.rateLimitInfo,
            undefined,
            result.errorCode,
            result.httpStatus
          ),
          'error'
        )
      }
    }
  } catch (e) {
    console.error(logContext ? `Archive pull failed ${logContext}:` : 'Archive pull failed:', e)
    if (!hasCachedData) {
      const t = get(_)
      showPullToast(t('toast.pullFailed'), 'error')
    }
  }
}

/**
 * 進行中のアーカイブロードの Promise（#314）。null なら実行中でない。
 *
 * handleWorldChange 経由の呼び出しが進行中に、popstate 等で restoreStateFromUrl
 * からも performArchiveLoad が呼ばれると、従来は pullArchive が2本走り、先に
 * 終わった方の finally が appState.isArchiveLoading=false にしてしまい、もう片方の
 * pullArchive 実行中にロックが外れる窓ができていた（#314 二重ロード）。
 * この Promise を使って再入をデデュープし、進行中のロードがあれば新しいロードを
 * 始めずその完了を待って同じ Promise を返す。
 *
 * #314 M3: この変数の寿命は「ロックが立っている期間」と厳密に一致させる
 * （isArchiveLoading=false にするのと同じ finally 内で null に戻す）。以前は
 * 外側の `.finally()` で runPendingRepoSyncIfIdle() の完了後に null化しており、
 * ロック解放後・runPendingRepoSyncIfIdle 完了前の窓で archiveLoadInFlight が
 * まだ「実行中」を指したままだった。この窓でリポが切り替わり別の
 * performArchiveLoad 呼び出しが来ると、新リポ向けの新しいロードではなく
 * 旧リポの（実質完了済みの）Promise を再利用してしまう危険があった。
 */
let archiveLoadInFlight: Promise<void> | null = null

/**
 * アーカイブロードのロック取得〜解除〜保留同期の再開までを一括で行う。
 * #297 S-b: 再判定通過直後・IndexedDB読込前（await の前）に同期でロックを取る
 * （loadArchiveCacheFromDB は isArchiveLoading を参照しないため、ここで先に
 * 取っても安全。取らないと IndexedDB 読込中に AL ロックが無い窓ができ、
 * その間に Pull が割り込める）。
 * #307: 呼び出し元は handleWorldChange（引数なし）と restoreStateFromUrl
 * （logContext: 'during URL restore'）の2箇所。ガード（!isArchiveLoaded &&
 * token && repoName 等）は各呼び出し元に残す。
 * #314: 再入時（archiveLoadInFlight が非 null）は新しいロードを開始せず、進行中の
 * Promise をそのまま返す。後から来た呼び出しの logContext は使わない（既に
 * 実行中のロードのログ文言のまま。ログ文言の出し分けは catch 時の診断目的のみで
 * 挙動には影響しないため、rehydrateForRepo のような「最後の要求のキーを追従して
 * 適用する」キューは不要と判断した）。
 * #314 M3: 再入デデュープ対象（archiveLoadInFlight として返す Promise）はロード
 * 本体＋ロック解放までで、runPendingRepoSyncIfIdle() はそこに含めない。
 * 予約同期の再開は「最初にロードを始めた呼び出し」の流れとして in-flight の
 * 外側で行う（再入で dedupe された呼び出し元はこれを待たない。挙動＝「ロード後に
 * 予約同期が走る」という副作用自体は保つが、二重に呼ばれることはない）。
 */
export function performArchiveLoad(logContext?: ArchiveLoadLogContext): Promise<void> {
  if (archiveLoadInFlight) {
    return archiveLoadInFlight
  }

  // 呼び出し直後（このまま同期的に）isArchiveLoading=true まで到達する必要が
  // あるため、async IIFE を即座に呼び出す（後続の待ち合わせは IIFE 内部の await
  // 以降に閉じ込める）。
  const loadPromise = (async () => {
    appState.isArchiveLoading = true
    try {
      await loadArchiveIntoStores(logContext)
    } finally {
      // ロック解放と in-flight のクリアを同じ finally 内・同じタイミングで行う
      // （M3: 「ロックは外れたが in-flight はまだ古い Promise を指す」窓を作らない）。
      appState.isArchiveLoading = false
      archiveLoadInFlight = null
    }
  })()

  archiveLoadInFlight = loadPromise

  // 最初の呼び出し元の流れとして、ロード完了後に保留中の同期を再開する。
  // archiveLoadInFlight は既に上の finally で null 済みなので、この待機中に
  // 来た再入は新しいロードとして扱われる。
  return loadPromise.finally(() => runPendingRepoSyncIfIdle())
}
