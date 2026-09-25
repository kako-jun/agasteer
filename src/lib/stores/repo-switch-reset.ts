/**
 * リポジトリ切替時の状態リセット（#300）
 *
 * stores.svelte.ts から分離。core-state.svelte.ts / dirty-tracking.ts への一方向
 * import のみを持つ（循環 import 回避）。
 */

import { clearArchiveData } from '../data/storage'
import {
  archiveNotes,
  archiveLeaves,
  archiveMetadata,
  isArchiveLoaded,
  isStale,
  lastPushTime,
  lastStaleCheckTime,
  leftWorld,
  rightWorld,
  leftNote,
  rightNote,
  leftLeaf,
  rightLeaf,
  leftView,
  rightView,
} from './core-state.svelte'
import { clearAllChanges, resetPushedSnapshots } from './dirty-tracking'

/**
 * アーカイブをリセット（Pull前に呼び出し）
 */
export function resetArchive(): void {
  archiveNotes.value = []
  archiveLeaves.value = []
  archiveMetadata.value = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
  isArchiveLoaded.value = false
  clearArchiveData().catch((err) => console.error('Failed to clear archive data:', err))
}

/**
 * リポジトリ切替時の全状態リセット
 * アーカイブ、Git参照、ダーティスナップショット、stale検出をすべてクリアする
 */
export function resetForRepoSwitch(): void {
  // アーカイブデータをクリア
  resetArchive()

  // Pushスナップショットをクリア（旧リポのスナップショットで誤検出しないように）
  resetPushedSnapshots()

  // ダーティフラグをクリア
  clearAllChanges()

  // Git参照をクリア（旧リポのSHAで誤判定しないように）
  // lastKnownCommitSha は per-repo slot から rehydrateForRepo で復元するため、
  // ここでは触らない（null で上書きすると新リポ slot に null が書き込まれて
  // 復元できなくなる — persistence-effects.svelte.ts の $effect が検知してしまう）。
  // lastPulledPushCount も同様に per-repo slot から復元するため触らない。
  isStale.value = false
  lastPushTime.value = 0
  lastStaleCheckTime.value = 0

  // ワールドをホームに戻す（旧リポのアーカイブ表示を防止）
  leftWorld.value = 'home'
  rightWorld.value = 'home'

  // 旧リポのノート/リーフを開いたまま残さない
  // pullFromGitHub 側でも pane クリアしているが、以下の経路ではそこに到達しない:
  // 1. 設定確定〜pullFromGitHub 開始までの非同期ギャップ
  // 2. 同期中 repo 切替による予約pull 待機中（#134）
  // 3. token/repoName 未設定で pull が走らない無効経路
  // view も 'home' に戻すことで、null leaf を edit しようとする reactive effect を防止
  leftNote.value = null
  rightNote.value = null
  leftLeaf.value = null
  rightLeaf.value = null
  leftView.value = 'home'
  rightView.value = 'home'
}
