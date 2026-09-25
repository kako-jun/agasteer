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
async function loadArchiveIntoStores(logContext?: string): Promise<void> {
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
 * アーカイブロードのロック取得〜解除〜保留同期の再開までを一括で行う。
 * #297 S-b: 再判定通過直後・IndexedDB読込前（await の前）に同期でロックを取る
 * （loadArchiveCacheFromDB は isArchiveLoading を参照しないため、ここで先に
 * 取っても安全。取らないと IndexedDB 読込中に AL ロックが無い窓ができ、
 * その間に Pull が割り込める）。
 * #307: 呼び出し元は handleWorldChange（引数なし）と restoreStateFromUrl
 * （logContext: 'during URL restore'）の2箇所。ガード（!isArchiveLoaded &&
 * token && repoName 等）は各呼び出し元に残す。
 */
export async function performArchiveLoad(logContext?: string): Promise<void> {
  appState.isArchiveLoading = true
  try {
    await loadArchiveIntoStores(logContext)
  } finally {
    appState.isArchiveLoading = false
    await runPendingRepoSyncIfIdle()
  }
}
