/**
 * Pull / Push 競合時の「両方の変更をマージして解決する」（#321）
 *
 * - `analyzeConflictMerge`: 共通の基準（lastKnownCommitSha のコミット）・ローカル・
 *   リモート HEAD を比較し、マージ可能か / 競合の一覧 / 判定できない理由を返す。
 *   ストアは読むだけで書き換えない（比較失敗・キャンセル時に何も失われない）。
 * - `applyConflictMerge`: 比較時からリモートとローカルが変わっていないことを確かめてから、
 *   マージ結果をローカルに反映する。ベースラインと lastKnownCommitSha はリモートに
 *   揃えるので、ローカル側の変更は「リモートに対する未 Push の変更」として dirty で残る。
 *
 * マージ判定そのものは純粋関数 `sync/three-way-merge.ts` が担う。
 */

import type { Leaf, Metadata, Note, Settings, StaleCheckResult } from '../types'
import {
  notes,
  leaves,
  metadata,
  archiveNotes,
  archiveLeaves,
  archiveMetadata,
  isArchiveLoaded,
  lastKnownCommitSha,
  lastPulledPushCount,
  isStale,
  leftNote,
  leftLeaf,
  rightNote,
  rightLeaf,
  archiveLeafStatsStore,
  setLastPushedSnapshot,
  getArchiveBaseline,
  refreshDirtyState,
  syncLeafEditors,
} from '../stores'
import { saveNotes, saveLeaves, saveArchiveNotes, saveArchiveLeaves } from '../data'
import { fetchRemoteHeadSha, fetchCommitSnapshot, type WorldData } from '../api'
import { calculateGitBlobSha } from '../api/github/sha'
import { isLeafSaveable, isNoteSaveable, PRIORITY_LEAF_ID, PRIORITY_LEAF_NAME } from '../utils'
import {
  mergeWorld,
  sameWorldContent,
  type MergeConflict,
  type WorldSnapshot,
} from '../sync/three-way-merge'
import { MERGE_COMPARE_TIMEOUT_MS, MERGE_HEAD_CHECK_TIMEOUT_MS } from '../sync/constants'
import { appState, appActions } from '../app-state.svelte'

/** 判定できない理由（ダイアログに表示する） */
export type MergeUnavailableReason =
  /** リモートの状態を確認できなかった（stale 判定が check_failed 等） */
  | 'remoteStateUnknown'
  /** ローカルの読み込み（Pull）が終わっていない（欠けた分を削除と誤認しないため） */
  | 'localIncomplete'
  /** 共通の基準（最後に同期したコミット）が無い・取得できない */
  | 'baseUnavailable'
  /** リモート HEAD の内容を取得できない */
  | 'remoteUnavailable'
  /** 共通の基準に、metadata.json に ID の無いファイルがある */
  | 'untracked'
  /** metadata.json が壊れていて読めない */
  | 'metadataInvalid'
  /**
   * ロード済みのアーカイブが共通の基準と別の時点の内容（アーカイブはブランチの最新を
   * 読むため、最後に同期したコミットより新しいことがある）。そのまま比べると、
   * 他の端末が消したものを「ローカルにある」と誤認して復活させるおそれがある
   */
  | 'archiveOutOfDate'
  /** 比較の通信が時間内に終わらなかった */
  | 'timeout'
  /** tree が大きすぎる */
  | 'tooLarge'
  /** GitHub API の利用上限 */
  | 'rateLimited'
  /** 予期しないエラー */
  | 'failed'

export interface WorldConflict extends MergeConflict {
  world: 'home' | 'archive'
}

interface WorldPlan {
  merged: WorldSnapshot
  remote: WorldData
}

export interface MergePlan {
  baseSha: string
  remoteSha: string
  /** 比較に使ったローカルの内容（適用直前の変化検出用） */
  localFingerprint: string
  home: WorldPlan
  /** 比較時にアーカイブがロード済みだった場合のみ */
  archive?: WorldPlan
  /** 反映後の metadata（リモートの metadata ＋ Priority バッジの3方向マージ） */
  metadata: Metadata
}

export type MergeAnalysis =
  | { status: 'mergeable'; plan: MergePlan; localChangeCount: number; remoteChangeCount: number }
  | { status: 'conflicts'; conflicts: WorldConflict[] }
  | { status: 'unavailable'; reason: MergeUnavailableReason }

export type ApplyMergeResult =
  | { status: 'applied' }
  /** 比較後にリモートが進んだ / ローカルが変わった（何も書き換えていない。再比較が必要） */
  | { status: 'changed'; side: 'remote' | 'local' }
  /**
   * 何も書き換えていない。reason='remote': 反映前のリモート確認に失敗した /
   * reason='save': IndexedDB への保存に失敗した（SHA・ベースラインも進めていない）
   */
  | { status: 'failed'; reason: 'remote' | 'save' }

interface LocalSide {
  home: WorldSnapshot
  archive?: WorldSnapshot
  fingerprint: string
}

/** Push 対象と同じ基準（保存対象のノート/リーフ）でローカルの内容を取り出す */
function readLocal(): LocalSide {
  const saveableNotes = notes.value.filter((n) => isNoteSaveable(n))
  const saveableLeaves = leaves.value.filter((l) => isLeafSaveable(l, saveableNotes))
  const home: WorldSnapshot = JSON.parse(
    JSON.stringify({ notes: saveableNotes, leaves: saveableLeaves })
  )
  const archive: WorldSnapshot | undefined = isArchiveLoaded.value
    ? JSON.parse(JSON.stringify({ notes: archiveNotes.value, leaves: archiveLeaves.value }))
    : undefined
  return { home, archive, fingerprint: JSON.stringify({ home, archive }) }
}

function snapshotReason(reason: string, side: 'base' | 'remote'): MergeUnavailableReason {
  switch (reason) {
    case 'truncated':
      return 'tooLarge'
    case 'rateLimited':
      return 'rateLimited'
    case 'metadataInvalid':
      return 'metadataInvalid'
    case 'timeout':
      return 'timeout'
    case 'notFound':
      return side === 'base' ? 'baseUnavailable' : 'remoteUnavailable'
    default:
      return side === 'base' ? 'baseUnavailable' : 'remoteUnavailable'
  }
}

function priorityBadgeKey(meta: Metadata | undefined): string {
  const p = meta?.leaves?.[PRIORITY_LEAF_ID]
  return `${p?.badgeIcon ?? ''}|${p?.badgeColor ?? ''}`
}

/**
 * Priority（仮想リーフ）のバッジは metadata にだけ保存される。片側だけが変えていれば
 * その側を採り、双方が別の値に変えていれば競合（他のバッジと同じ方針）。
 */
function mergeMetadata(
  base: Metadata,
  local: Metadata,
  remote: Metadata
): { metadata: Metadata; priorityBadgeConflict: boolean } {
  const result: Metadata = JSON.parse(JSON.stringify(remote))
  const b = priorityBadgeKey(base)
  const l = priorityBadgeKey(local)
  const r = priorityBadgeKey(remote)
  if (l !== b && r !== b && l !== r) {
    return { metadata: result, priorityBadgeConflict: true }
  }
  if (l !== b) {
    const localPriority = local.leaves?.[PRIORITY_LEAF_ID]
    if (localPriority) {
      result.leaves[PRIORITY_LEAF_ID] = { ...localPriority }
    } else {
      delete result.leaves[PRIORITY_LEAF_ID]
    }
  }
  return { metadata: result, priorityBadgeConflict: false }
}

/**
 * 競合ダイアログを出す前の比較。
 */
export async function analyzeConflictMerge(
  staleResult: StaleCheckResult | undefined,
  settings: Settings
): Promise<MergeAnalysis> {
  // 通信が返らないまま Push preflight のロックが解けない経路を作らない: 上限で打ち切り、
  // fetch 側が abort に応じない場合も race で必ず抜ける
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<MergeAnalysis>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve({ status: 'unavailable', reason: 'timeout' })
    }, MERGE_COMPARE_TIMEOUT_MS)
  })
  try {
    return await Promise.race([analyze(staleResult, settings, controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function analyze(
  staleResult: StaleCheckResult | undefined,
  settings: Settings,
  signal: AbortSignal
): Promise<MergeAnalysis> {
  if (!staleResult || staleResult.status !== 'stale') {
    return { status: 'unavailable', reason: 'remoteStateUnknown' }
  }
  const baseSha = staleResult.localCommitSha
  if (!baseSha) return { status: 'unavailable', reason: 'baseUnavailable' }
  const remoteSha = staleResult.remoteCommitSha

  try {
    if (!appState.isFirstPriorityFetched || appState.loadingLeafIds.size > 0) {
      return { status: 'unavailable', reason: 'localIncomplete' }
    }
    const local = readLocal()
    // ローカルの本文から blob SHA を計算しておけば、変わっていない本文は取得を省ける
    const contentCache = new Map<string, string>()
    const localLeaves = [...local.home.leaves, ...(local.archive?.leaves ?? [])]
    await Promise.all(
      localLeaves.map(async (leaf) => {
        contentCache.set(await calculateGitBlobSha(leaf.content), leaf.content)
      })
    )
    const includeArchive = local.archive !== undefined
    const base = await fetchCommitSnapshot(settings, baseSha, {
      includeArchive,
      contentCache,
      signal,
    })
    if (base.status === 'error') {
      return { status: 'unavailable', reason: snapshotReason(base.reason, 'base') }
    }
    if (base.hasUntrackedEntries) return { status: 'unavailable', reason: 'untracked' }
    // ロード済みアーカイブの出どころが base コミットかを確かめる。アーカイブはブランチの
    // 最新を読み込むため、ロード時のベースラインが base のアーカイブと違うなら、
    // ローカルのアーカイブを base からの変更として比べられない（判定不能にする）
    if (
      includeArchive &&
      (!base.archive || !sameWorldContent(getArchiveBaseline(), base.archive))
    ) {
      return { status: 'unavailable', reason: 'archiveOutOfDate' }
    }
    const remote = await fetchCommitSnapshot(settings, remoteSha, {
      includeArchive,
      contentCache,
      signal,
    })
    if (remote.status === 'error') {
      return { status: 'unavailable', reason: snapshotReason(remote.reason, 'remote') }
    }

    const homeResult = mergeWorld(base.home, local.home, remote.home)
    const archiveResult =
      local.archive && base.archive && remote.archive
        ? mergeWorld(base.archive, local.archive, remote.archive)
        : undefined

    const mergedMetadata = mergeMetadata(base.home.metadata, metadata.value, remote.home.metadata)
    const conflicts: WorldConflict[] = [
      ...homeResult.conflicts.map((c) => ({ ...c, world: 'home' as const })),
      ...(archiveResult?.conflicts ?? []).map((c) => ({ ...c, world: 'archive' as const })),
    ]
    if (mergedMetadata.priorityBadgeConflict) {
      conflicts.push({
        world: 'home',
        kind: 'attribute',
        target: 'leaf',
        path: PRIORITY_LEAF_NAME,
        field: 'badge',
      })
    }
    if (conflicts.length > 0 || !homeResult.merged) {
      return { status: 'conflicts', conflicts }
    }

    return {
      status: 'mergeable',
      localChangeCount: homeResult.localChangeCount + (archiveResult?.localChangeCount ?? 0),
      remoteChangeCount: homeResult.remoteChangeCount + (archiveResult?.remoteChangeCount ?? 0),
      plan: {
        baseSha,
        remoteSha,
        localFingerprint: local.fingerprint,
        home: { merged: homeResult.merged, remote: remote.home },
        archive:
          archiveResult?.merged && remote.archive
            ? { merged: archiveResult.merged, remote: remote.archive }
            : undefined,
        metadata: mergedMetadata.metadata,
      },
    }
  } catch (e) {
    console.error('analyzeConflictMerge failed:', e)
    return { status: 'unavailable', reason: 'failed' }
  }
}

/** 保存対象外（仮想ノート配下など）のローカル項目は、マージ結果の後ろにそのまま残す */
function withUnsaveable(merged: WorldSnapshot): { notes: Note[]; leaves: Leaf[] } {
  const unsaveableNotes = notes.value.filter((n) => !isNoteSaveable(n))
  const saveableNotes = notes.value.filter((n) => isNoteSaveable(n))
  const unsaveableLeaves = leaves.value.filter((l) => !isLeafSaveable(l, saveableNotes))
  return {
    notes: [...merged.notes, ...JSON.parse(JSON.stringify(unsaveableNotes))],
    leaves: [...merged.leaves, ...JSON.parse(JSON.stringify(unsaveableLeaves))],
  }
}

/** リモート HEAD の確認（時間上限つき。超えたら null） */
async function fetchHeadWithTimeout(settings: Settings): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), MERGE_HEAD_CHECK_TIMEOUT_MS)
  })
  try {
    const head = await Promise.race([fetchRemoteHeadSha(settings), timeout])
    return head && head.status === 'success' ? head.commitSha : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * マージ結果をローカルに反映する。
 *
 * 1. リモート HEAD が比較時の SHA のままか・ローカルが比較時の内容のままかを確かめる。
 *    変わっていれば何も書き換えずに `changed` を返す（呼び出し側で再比較）
 * 2. マージ結果を IndexedDB へ先に保存する。失敗したら SHA・ベースライン・ストアを
 *    進めずに `failed(save)` を返す（「SHA は新しいのに中身は古い」状態を作らない）
 * 3. メモリ上の状態（ストア・ベースライン・lastKnownCommitSha）を一度に書き換える
 */
export async function applyConflictMerge(
  plan: MergePlan,
  settings: Settings
): Promise<ApplyMergeResult> {
  const headSha = await fetchHeadWithTimeout(settings)
  if (headSha === null) return { status: 'failed', reason: 'remote' }
  if (headSha !== plan.remoteSha) return { status: 'changed', side: 'remote' }
  if (readLocal().fingerprint !== plan.localFingerprint) {
    return { status: 'changed', side: 'local' }
  }

  const home = withUnsaveable(plan.home.merged)

  // ---- 先に IndexedDB へ保存する ----
  const results = await Promise.allSettled([
    saveNotes(home.notes),
    saveLeaves(home.leaves),
    ...(plan.archive
      ? [saveArchiveNotes(plan.archive.merged.notes), saveArchiveLeaves(plan.archive.merged.leaves)]
      : []),
  ])
  const failed = results.find((r) => r.status === 'rejected')
  if (failed) {
    console.error('Failed to persist merged data:', (failed as PromiseRejectedResult).reason)
    return { status: 'failed', reason: 'save' }
  }
  // 保存を待つ間にローカルが変わっていたら反映しない（IndexedDB は次の自動保存で追いつく）
  if (readLocal().fingerprint !== plan.localFingerprint) {
    return { status: 'changed', side: 'local' }
  }

  const previousContent = new Map<string, string>()
  for (const leaf of [...leaves.value, ...archiveLeaves.value]) {
    previousContent.set(leaf.id, leaf.content)
  }

  // ---- メモリ上の状態を書き換える（ここから先は await しない） ----
  notes.value = home.notes
  leaves.value = home.leaves
  metadata.value = plan.metadata
  if (plan.archive) {
    archiveNotes.value = plan.archive.merged.notes
    archiveLeaves.value = plan.archive.merged.leaves
    archiveMetadata.value = plan.archive.remote.metadata
  }
  // ベースラインはリモート（＝新しい共通の基準）。ローカルの変更は差分として dirty に残る
  setLastPushedSnapshot(
    plan.home.remote.notes,
    plan.home.remote.leaves,
    plan.archive?.remote.notes,
    plan.archive?.remote.leaves
  )
  lastKnownCommitSha.value = plan.remoteSha
  lastPulledPushCount.value = plan.home.remote.metadata.pushCount
  isStale.value = false
  refreshDirtyState()
  appActions.rebuildLeafStats(home.leaves, home.notes)
  if (plan.archive) {
    archiveLeafStatsStore.rebuild(plan.archive.merged.leaves, plan.archive.merged.notes)
  }

  // 開いているペインの参照を新しいオブジェクトに差し替え、エディタの本文を追従させる
  const allNotes = [...home.notes, ...archiveNotes.value]
  const allLeaves = [...home.leaves, ...archiveLeaves.value]
  let paneTargetMissing = false
  const refreshNote = (note: Note | null): Note | null => {
    if (!note) return null
    const found = allNotes.find((n) => n.id === note.id)
    if (!found && isNoteSaveable(note)) paneTargetMissing = true
    return found ?? note
  }
  const refreshLeaf = (leaf: Leaf | null): Leaf | null => {
    if (!leaf) return null
    const found = allLeaves.find((l) => l.id === leaf.id)
    if (!found && !leaf.id.startsWith('__')) paneTargetMissing = true
    return found ?? leaf
  }
  const nextLeftNote = refreshNote(leftNote.value)
  const nextLeftLeaf = refreshLeaf(leftLeaf.value)
  const nextRightNote = refreshNote(rightNote.value)
  const nextRightLeaf = refreshLeaf(rightLeaf.value)
  if (paneTargetMissing) {
    // 開いていたノート/リーフがマージで消えた（リモートで削除された）: Pull と同じく URL から復元
    leftNote.value = null
    leftLeaf.value = null
    rightNote.value = null
    rightLeaf.value = null
    void appActions
      .restoreStateFromUrl()
      .catch((e) => console.error('restoreStateFromUrl failed:', e))
  } else {
    leftNote.value = nextLeftNote
    leftLeaf.value = nextLeftLeaf
    rightNote.value = nextRightNote
    rightLeaf.value = nextRightLeaf
  }
  for (const leaf of allLeaves) {
    const before = previousContent.get(leaf.id)
    if (before !== undefined && before !== leaf.content) {
      syncLeafEditors(leaf.id, leaf.content)
    }
  }
  return { status: 'applied' }
}
