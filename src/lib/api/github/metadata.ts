/**
 * GitHub 同期のメタデータ正規化・差分判定（純粋層）
 *
 * fetch・settings・IO に一切触れない純粋関数のみを置く。
 * github.ts から純移動（Phase 3 / #226）。振る舞いは不変。
 */

import type { Metadata } from '../../types'
import { PRIORITY_LEAF_ID } from '../../utils'

/**
 * キー順に依存しない安定した文字列化（差分比較用）。
 * undefined を持つキーは除外し、オブジェクトのキーをソートしてから直列化する。
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/**
 * メタデータを比較用に正規化する。
 * - notes/leaves を id/order/badge のみに絞り、キーをソート
 * - __priority__ は仮想リーフなので updatedAt を固定値 0 に正規化（比較時の差分を防ぐ）
 * - pushCount は pushCountOverride があればそれを優先
 */
export function normalizeMetadata(meta: Metadata, pushCountOverride?: number): Metadata {
  const normalized: Metadata = {
    version: meta.version ?? 1,
    pushCount: pushCountOverride ?? meta.pushCount ?? 0,
    notes: {},
    leaves: {},
  }

  const noteKeys = Object.keys(meta.notes || {}).sort()
  for (const key of noteKeys) {
    const n = meta.notes[key]
    const entry: Metadata['notes'][string] = { id: n.id, order: n.order }
    if (n.badgeIcon !== undefined) entry.badgeIcon = n.badgeIcon
    if (n.badgeColor !== undefined) entry.badgeColor = n.badgeColor
    normalized.notes[key] = entry
  }

  const leafKeys = Object.keys(meta.leaves || {}).sort()
  for (const key of leafKeys) {
    const l = meta.leaves[key]
    // __priority__は仮想リーフなのでupdatedAtを固定値0に正規化（比較時の差分を防ぐ）
    const updatedAt = key === PRIORITY_LEAF_ID ? 0 : l.updatedAt
    const entry: Metadata['leaves'][string] = { id: l.id, updatedAt, order: l.order }
    if (l.badgeIcon !== undefined) entry.badgeIcon = l.badgeIcon
    if (l.badgeColor !== undefined) entry.badgeColor = l.badgeColor
    normalized.leaves[key] = entry
  }

  return normalized
}

/**
 * Pull 側で decode 済みの JSON 値をメタデータへ正規化する。
 * JSON.parse とその try/catch は呼び出し側の fetch 層に残し、この関数は
 * parse 済み値を受けてデフォルト補完するだけ（振る舞い不変）。
 */
export function normalizePulledMetadata(parsed: unknown): Metadata {
  const p = (parsed ?? {}) as Partial<Metadata>
  return {
    version: p.version || 1,
    notes: p.notes || {},
    leaves: p.leaves || {},
    pushCount: p.pushCount || 0,
  }
}

/** detectChanges の入力（既に算出済みの値・両メタデータのみ。fetch/sha は持ち込まない） */
export interface DetectChangesInput {
  existingMetadata: Metadata
  metadata: Metadata
  currentPushCount: number
  changedHomeLeafPaths: string[]
  changedArchiveLeafPaths: string[]
  isArchiveLoaded: boolean
  archiveNotes: unknown
  archiveLeaves: unknown
  archiveMeta: Metadata | undefined
  existingArchiveMetadata: Metadata
}

export interface DetectChangesResult {
  metadataChanged: boolean
  archiveMetadataChanged: boolean
  leafChanged: boolean
  hasAnyChanges: boolean
}

/**
 * push 時の変更判定（pushCount のインクリメントは除外）。
 * home metadata は normalizeMetadata(…, currentPushCount) 経由、archive metadata は
 * normalizeMetadata(…, 0) 経由で比較する（「書くのは raw・比較は normalized」
 * 「pushCount は home のみ +1・archive は常に 0」の非対称を保存）。
 */
export function detectChanges(input: DetectChangesInput): DetectChangesResult {
  const {
    existingMetadata,
    metadata,
    currentPushCount,
    changedHomeLeafPaths,
    changedArchiveLeafPaths,
    isArchiveLoaded,
    archiveNotes,
    archiveLeaves,
    archiveMeta,
    existingArchiveMetadata,
  } = input

  // metadata差分を含めて変更チェック（pushCountのインクリメントは除外）
  const normalizedExisting = normalizeMetadata(existingMetadata, currentPushCount)
  const normalizedCurrent = normalizeMetadata(metadata, currentPushCount)
  const metadataChanged = stableStringify(normalizedExisting) !== stableStringify(normalizedCurrent)

  // アーカイブメタデータの差分チェック（ロード済みの場合のみ）
  let archiveMetadataChanged = false
  if (isArchiveLoaded && archiveNotes && archiveLeaves && archiveMeta) {
    const normalizedExistingArchive = normalizeMetadata(existingArchiveMetadata, 0)
    const normalizedCurrentArchive = normalizeMetadata(archiveMeta, 0)
    archiveMetadataChanged =
      stableStringify(normalizedExistingArchive) !== stableStringify(normalizedCurrentArchive)
  }

  const leafChanged = changedHomeLeafPaths.length > 0 || changedArchiveLeafPaths.length > 0
  const hasAnyChanges = leafChanged || metadataChanged || archiveMetadataChanged

  return { metadataChanged, archiveMetadataChanged, leafChanged, hasAnyChanges }
}
