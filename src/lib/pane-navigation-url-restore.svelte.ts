/**
 * restoreStateFromUrl（URL からの pane 状態復元）の待ち合わせロジック（#314 N3）。
 *
 * pane-navigation.svelte.ts から抽出。restoreStateFromUrl 自体を80行以内に保つため、
 * 「アーカイブ待機（rehydrate→同期アイドル→アーカイブロード、を同期再判定込みで
 * ループする）」「呼び出しの世代管理」「pane 単位のスナップショット比較・解決」を
 * ここに集約する。
 *
 * #314 の設計方針（must M2/M3/M4、should S1）:
 * - M2: 待機条件に isArchiveLoading を含める。move.ts が performArchiveLoad を経由せず
 *   自前でロードしている間も、ここで isArchiveLoading を待つことで二重ロードを防ぐ
 *   （move.ts 側は変更不要。move.ts は自身の busy 判定で isArchiveLoading を見て
 *   既に排他している）。
 * - M3: performArchiveLoad 自体の in-flight 寿命はロック期間と一致する（archive-load
 *   側で対応済み）ので、ここでは performArchiveLoad の結果を信頼してよい。
 * - M4a: 最後の await の後に同期的に「rehydrate 中でない かつ
 *   Pull/Push/背景Push/アーカイブロードが busy でない」を判定し、成り立たなければ
 *   待機に戻る。
 * - M4b: 呼び出しごとの世代カウンタ。すべての await の後で世代が変わっていたら
 *   何もせず抜ける。pane のスナップショットと比較し、ユーザーが動かしていれば
 *   上書きしない。archive を必要としない pane は待たずに即解決する。
 * - S1: 50ms ポーリングではなく、対象フラグの setter からの通知
 *   （stores/sync-signal.ts）で待つ。
 */

import type { WorldType, View } from './types'
import type { Pane } from './navigation'
import { resolvePath, type PathResolution } from './navigation'
import {
  notes,
  leaves,
  leftNote,
  rightNote,
  leftLeaf,
  rightLeaf,
  leftView,
  rightView,
  leftWorld,
  rightWorld,
  archiveNotes,
  archiveLeaves,
  isArchiveLoaded,
  isPulling,
  isPushing,
  isPushingBackground,
  settings,
  getNotesForWorld as _getNotesForWorld,
  getLeavesForWorld as _getLeavesForWorld,
  // waitForRehydrate/isRehydrating は './stores' バレル（rehydrate.svelte.ts の
  // re-export）経由で読む。サブモジュールから直接 import すると、他のコードと違う
  // パスになりテストの vi.mock('./stores', ...) を素通りしてしまう。
  waitForRehydrate,
  isRehydrating,
} from './stores'
import { waitForSyncActivityChange } from './stores/sync-signal'
import { appState } from './app-state.svelte'
import { performArchiveLoad, type ArchiveLoadLogContext } from './archive-load.svelte'

// ========================================
// 呼び出しの世代管理（#314 M4b）
// ========================================

let restoreGeneration = 0

/** 新しい restoreStateFromUrl 呼び出しの開始時に呼ぶ。この呼び出し専用の世代を返す。 */
export function beginRestoreGeneration(): number {
  return ++restoreGeneration
}

/** 呼び出し時に受け取った世代が、まだ最新（＝後続の呼び出しに上書きされていない）か。 */
export function isCurrentRestoreGeneration(gen: number): boolean {
  return gen === restoreGeneration
}

// ========================================
// 同期アイドル待ち（#314 S1）
// ========================================

function isSyncBusy(): boolean {
  return (
    isPulling.value || isPushing.value || isPushingBackground.value || appState.isArchiveLoading
  )
}

/**
 * Pull/Push（背景含む）・アーカイブロードがすべてアイドルになるまで待つ。
 * ポーリングではなく、対象フラグの setter からの通知（waitForSignal）で待つ。
 * テストからは waitForSignal を差し替えて手動 resolve する。
 */
export async function waitForSyncIdle(
  waitForSignal: () => Promise<void> = waitForSyncActivityChange
): Promise<void> {
  while (isSyncBusy()) {
    await waitForSignal()
  }
}

// ========================================
// アーカイブ待機（#314 M2/M3/M4a）
// ========================================

/**
 * アーカイブ読み込みが必要な URL 復元のために、rehydrate・同期アイドル・
 * アーカイブロードを待ち合わせる。世代が変わったら false を返してすぐ抜ける
 * （呼び出し元は pane を解決しない）。
 */
export async function waitUntilArchiveReady(
  gen: number,
  logContext?: ArchiveLoadLogContext,
  waitForSignal?: () => Promise<void>
): Promise<boolean> {
  // M4a: 「rehydrate 中でない かつ 同期が busy でない」を同期的に確認できるまで
  // 待つ。ここでループするのは「待ち直す」ためだけであり、ロード自体は
  // リトライしない（ロード失敗時に無限リトライしないよう、ロード開始は
  // このループの外で高々1回だけ行う）。
  for (;;) {
    await waitForRehydrate()
    if (!isCurrentRestoreGeneration(gen)) return false

    await waitForSyncIdle(waitForSignal)
    if (!isCurrentRestoreGeneration(gen)) return false

    // 最後の await の直後、同期的に再判定する。ここで busy なら待機に戻る
    // （waitForRehydrate() と waitForSyncIdle() の間、または waitForSyncIdle() が
    // 解決してからこの行に来るまでの一瞬で、別の同期が割り込んだ可能性がある）。
    if (isRehydrating() || isSyncBusy()) continue
    break
  }

  if (isArchiveLoaded.value) return true
  if (!(settings.value.token && settings.value.repoName)) {
    // ロードに必要な設定がない。呼び出し元は既存データ（空でもよい）で解決する。
    return false
  }

  // ロードは高々1回だけ試みる（失敗しても呼び出し元は既存データで解決する。
  // performArchiveLoad 自体は再入安全＝#314 M3 なので、他所と競合しても
  // 二重ロードにはならない）。
  await performArchiveLoad(logContext)
  if (!isCurrentRestoreGeneration(gen)) return false
  return isArchiveLoaded.value
}

// ========================================
// pane スナップショット（#314 M4b: ユーザー操作後の上書き防止）
// ========================================

export interface PaneSnapshot {
  world: WorldType
  noteId: string | null
  leafId: string | null
  view: View
}

export function snapshotPane(pane: Pane): PaneSnapshot {
  const isLeft = pane === 'left'
  return {
    world: (isLeft ? leftWorld.value : rightWorld.value) as WorldType,
    noteId: (isLeft ? leftNote.value : rightNote.value)?.id ?? null,
    leafId: (isLeft ? leftLeaf.value : rightLeaf.value)?.id ?? null,
    view: (isLeft ? leftView.value : rightView.value) as View,
  }
}

function paneUnchangedSince(pane: Pane, snapshot: PaneSnapshot): boolean {
  const current = snapshotPane(pane)
  return (
    current.world === snapshot.world &&
    current.noteId === snapshot.noteId &&
    current.leafId === snapshot.leafId &&
    current.view === snapshot.view
  )
}

// ========================================
// pane 解決（URL パス → store 反映）
// ========================================

function getPaneStores(pane: Pane) {
  return pane === 'left'
    ? { note: leftNote, leaf: leftLeaf, view: leftView, world: leftWorld }
    : { note: rightNote, leaf: rightLeaf, view: rightView, world: rightWorld }
}

/**
 * 指定 pane のパスを解決してストアへ反映する。world に応じたデータセット
 * （home/archive）は呼び出し時点の notes/leaves/archiveNotes/archiveLeaves を使う。
 */
export function resolvePaneFromPath(pane: Pane, path: string, world: WorldType): void {
  const notesData = _getNotesForWorld(world, notes.value, archiveNotes.value)
  const leavesData = _getLeavesForWorld(world, leaves.value, archiveLeaves.value)
  const resolution: PathResolution = resolvePath(path, notesData, leavesData)
  const { note, leaf, view, world: worldStore } = getPaneStores(pane)

  worldStore.value = resolution.world
  if (resolution.type === 'home') {
    note.value = null
    leaf.value = null
    view.value = 'home'
  } else if (resolution.type === 'note') {
    note.value = resolution.note
    leaf.value = null
    view.value = 'note'
  } else if (resolution.type === 'leaf') {
    note.value = resolution.note
    leaf.value = resolution.leaf
    view.value = resolution.isPreview ? 'preview' : 'edit'
  }
}

/**
 * アーカイブ待機後、指定 pane を解決してよいかを判定する
 * （世代が最新 かつ 待機開始時からユーザーがそのペインを動かしていない）。
 */
export function shouldApplyResolvedPane(gen: number, pane: Pane, snapshot: PaneSnapshot): boolean {
  return isCurrentRestoreGeneration(gen) && paneUnchangedSince(pane, snapshot)
}
