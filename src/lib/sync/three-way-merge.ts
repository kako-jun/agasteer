/**
 * Pull / Push 競合時の3方向マージ（純粋層・#321）
 *
 * 共通の基準（base = 最後に同期したコミット）からの、ローカルとリモートそれぞれの変更を
 * 比較し、両方を安全に取り込めるかを判定する。fetch・ストア・DOM に一切触れない。
 *
 * - 行単位の diff3（`mergeLines`）: Myers 差分で base↔ローカル / base↔リモートの
 *   一致行を求め、両方で一致している行を境に変更箇所を区切る。片側だけが変えた箇所は
 *   その側を採り、両側が同じ内容に変えた箇所はそれを採る。両側が別の内容に変えた箇所
 *   （隣接行の編集を含む）は競合として返す。
 * - ノート / リーフ単位のマージ（`mergeWorld`）: ID で対応づけ、追加・削除・属性変更・
 *   本文を個別に判定する。片側削除＋他方編集、名前・場所・バッジの相反変更、マージ後の
 *   同名衝突、削除されたノートへの追加・移動は競合。並び順（order）の食い違いは
 *   内容を失わないためリモート側を採る（競合にしない）。
 */

import type { Leaf, Note } from '../types'
// 同名衝突は Push が実際に書き込むパス（サニタイズ・80文字切り込み）で判定する
import { buildPath, getFolderPath, sanitizePathPart } from '../api/github/paths'

// ============================================
// 行単位の差分（Myers）
// ============================================

/**
 * 差分の編集距離の上限。これを超える（大規模な書き換え）ときは、一致行の探索を
 * 打ち切って中間部分を「全体が変更された」と扱う。もう片側もそのリーフを編集して
 * いれば、離れた行でも競合になる（安全側。マージ不可で従来の選択肢に戻る）。
 */
const MAX_EDIT_DISTANCE = 2000

/**
 * a と b の一致行を求め、`matches[i] = j`（a[i] と b[j] が一致）/ `-1`（一致なし）で返す。
 * 共通の先頭・末尾を先に除いてから中間部分だけを Myers 差分にかける。
 */
export function matchLines(a: readonly string[], b: readonly string[]): Int32Array {
  const matches = new Int32Array(a.length).fill(-1)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) {
    matches[start] = start
    start++
  }
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
    matches[endA] = endB
  }
  if (endA > start && endB > start) {
    myersMatches(a, b, start, endA, start, endB, matches)
  }
  return matches
}

function myersMatches(
  a: readonly string[],
  b: readonly string[],
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  out: Int32Array
): void {
  const n = aEnd - aStart
  const m = bEnd - bStart
  const max = Math.min(n + m, MAX_EDIT_DISTANCE)
  const offset = max + 1
  const v = new Int32Array(2 * max + 3)
  // trace[d] は d 回目の探索を始める直前の v の [-d-1, d+1] の範囲の写し
  const trace: Int32Array[] = []
  let found = false
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2))
    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1]
      } else {
        x = v[offset + k - 1] + 1
      }
      let y = x - k
      while (x < n && y < m && a[aStart + x] === b[bStart + y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = true
        break
      }
    }
  }
  // 上限内で到達できなかった: 中間部分は一致なし（全体が変更）として扱う
  if (!found) return

  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0; d--) {
    const snap = trace[d]
    const at = (k: number) => snap[k + d + 1]
    const k = x - y
    let prevK: number
    if (k === -d || (k !== d && at(k - 1) < at(k + 1))) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }
    const prevX = at(prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      out[aStart + x - 1] = bStart + y - 1
      x--
      y--
    }
    if (d > 0) {
      x = prevX
      y = prevY
    }
  }
}

// ============================================
// 行単位の3方向マージ（diff3）
// ============================================

/** 行単位の競合1件（行番号は 0 始まり、base の [baseStart, baseEnd)） */
export interface LineConflict {
  baseStart: number
  baseEnd: number
  base: string[]
  local: string[]
  remote: string[]
}

export interface LineMergeResult {
  /** 競合が無いときのマージ結果（競合があるときは null） */
  merged: string[] | null
  conflicts: LineConflict[]
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * 行配列の3方向マージ。
 */
export function mergeLines(
  base: readonly string[],
  local: readonly string[],
  remote: readonly string[]
): LineMergeResult {
  const toLocal = matchLines(base, local)
  const toRemote = matchLines(base, remote)
  const merged: string[] = []
  const conflicts: LineConflict[] = []

  let i = 0
  let j = 0
  let k = 0
  while (i < base.length || j < local.length || k < remote.length) {
    // 3者で一致している行（安定行）はそのまま出力
    if (i < base.length && toLocal[i] === j && toRemote[i] === k) {
      merged.push(base[i])
      i++
      j++
      k++
      continue
    }
    // 次の安定行（base 行が両側に一致している位置）を探し、そこまでを1つの変更箇所とする
    let ni = i
    while (ni < base.length && (toLocal[ni] < 0 || toRemote[ni] < 0)) ni++
    const nj = ni < base.length ? toLocal[ni] : local.length
    const nk = ni < base.length ? toRemote[ni] : remote.length
    const baseChunk = base.slice(i, ni)
    const localChunk = local.slice(j, nj)
    const remoteChunk = remote.slice(k, nk)
    if (sameLines(localChunk, baseChunk)) {
      merged.push(...remoteChunk)
    } else if (sameLines(remoteChunk, baseChunk) || sameLines(localChunk, remoteChunk)) {
      merged.push(...localChunk)
    } else {
      conflicts.push({
        baseStart: i,
        baseEnd: ni,
        base: baseChunk,
        local: localChunk,
        remote: remoteChunk,
      })
    }
    i = ni
    j = nj
    k = nk
  }

  return { merged: conflicts.length === 0 ? merged : null, conflicts }
}

/**
 * テキストの3方向マージ。改行（\n）で行に分け、結果は同じ区切りで連結する。
 */
export function mergeText(
  base: string,
  local: string,
  remote: string
): { merged: string | null; conflicts: LineConflict[] } {
  if (local === remote || remote === base) return { merged: local, conflicts: [] }
  if (local === base) return { merged: remote, conflicts: [] }
  const result = mergeLines(base.split('\n'), local.split('\n'), remote.split('\n'))
  return {
    merged: result.merged ? result.merged.join('\n') : null,
    conflicts: result.conflicts,
  }
}

// ============================================
// ノート / リーフ単位の3方向マージ
// ============================================

export interface WorldSnapshot {
  notes: Note[]
  leaves: Leaf[]
}

export type MergeConflictKind =
  /** 同じ行（隣接行を含む）を双方が別の内容に編集した */
  | 'content'
  /** 片側で削除し、もう片側で編集した */
  | 'deleteEdit'
  /** 名前・場所・バッジを双方が別の値に変更した */
  | 'attribute'
  /** マージすると同じ場所に同じ名前のノート/リーフが2つできる */
  | 'pathCollision'
  /** 削除されたノートへの追加・移動、または3階層以上になる移動 */
  | 'structure'

export type MergeConflictField = 'name' | 'location' | 'badge'

export interface MergeConflict {
  kind: MergeConflictKind
  target: 'note' | 'leaf'
  /** 表示用のパス（ノート名/サブノート名/リーフ名） */
  path: string
  /** kind='content' のときの行単位の競合 */
  lines?: LineConflict[]
  /** kind='deleteEdit' のとき、削除した側 */
  deletedBy?: 'local' | 'remote'
  /** kind='attribute' のとき、食い違った属性 */
  field?: MergeConflictField
  /** kind='attribute' のときの双方の値（表示用） */
  localValue?: string
  remoteValue?: string
}

export interface WorldMergeResult {
  /** 競合が無いときのマージ結果（競合があるときは null） */
  merged: WorldSnapshot | null
  conflicts: MergeConflict[]
  /** base からローカルで変わったノート/リーフの数 */
  localChangeCount: number
  /** base からリモートで変わったノート/リーフの数 */
  remoteChangeCount: number
}

function noteFolder(noteId: string | undefined, notes: readonly Note[]): string {
  const note = noteId ? notes.find((n) => n.id === noteId) : undefined
  if (!note) return ''
  const parent = note.parentId ? notes.find((n) => n.id === note.parentId) : undefined
  return parent ? `${parent.name}/${note.name}` : note.name
}

function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name
}

function badgeOf(x: { badgeIcon?: string; badgeColor?: string }): string {
  return `${x.badgeIcon ?? ''}|${x.badgeColor ?? ''}`
}

/**
 * 名前の比較キー。base / リモートはコミットの tree（ファイル名・フォルダ名）から読むため、
 * Push 時のサニタイズ（`\/:*?"<>|#` → `-`、連続空白を1つ、80文字切り）を通った名前になる。
 * ローカルは元の名前のままなので、同じ正規化を通してから比べる（`11/25 memo` と
 * `11-25 memo` を「改名」と誤認しない）。ノート名も Pull 側で同じ関数を通る。
 */
const nameKey = (name: string) => sanitizePathPart(name)

function noteEdited(a: Note, b: Note): boolean {
  return (
    nameKey(a.name) !== nameKey(b.name) || a.parentId !== b.parentId || badgeOf(a) !== badgeOf(b)
  )
}

function leafEdited(a: Leaf, b: Leaf): boolean {
  return (
    nameKey(a.title) !== nameKey(b.title) ||
    a.noteId !== b.noteId ||
    a.content !== b.content ||
    badgeOf(a) !== badgeOf(b)
  )
}

/** 件数表示用: 並び順だけの変更も「変更」として数える（0件表示にしない） */
function noteChanged(a: Note, b: Note): boolean {
  return noteEdited(a, b) || a.order !== b.order
}

function leafChanged(a: Leaf, b: Leaf): boolean {
  return leafEdited(a, b) || a.order !== b.order
}

/**
 * 名前用の pick3。比較は正規化したキーで行い、採る値は元の名前（ローカルの表記を優先）。
 */
function pickName(
  base: string,
  local: string,
  remote: string
): { value: string; conflict: boolean } {
  const b = nameKey(base)
  const l = nameKey(local)
  const r = nameKey(remote)
  if (l === r || r === b) return { value: local, conflict: false }
  if (l === b) return { value: remote, conflict: false }
  return { value: local, conflict: true }
}

/** 片側だけの変更を採る（両側が別の値に変えたら conflict=true） */
function pick3<T>(base: T, local: T, remote: T): { value: T; conflict: boolean } {
  if (local === remote || remote === base) return { value: local, conflict: false }
  if (local === base) return { value: remote, conflict: false }
  return { value: local, conflict: true }
}

function countChanges<T extends { id: string }>(
  base: readonly T[],
  side: readonly T[],
  edited: (a: T, b: T) => boolean
): number {
  const baseMap = new Map(base.map((x) => [x.id, x]))
  const sideIds = new Set(side.map((x) => x.id))
  let count = 0
  for (const x of side) {
    const b = baseMap.get(x.id)
    if (!b || edited(b, x)) count++
  }
  for (const b of base) if (!sideIds.has(b.id)) count++
  return count
}

/**
 * 1つのワールド（home / archive）のノート・リーフを3方向マージする。
 */
export function mergeWorld(
  base: WorldSnapshot,
  local: WorldSnapshot,
  remote: WorldSnapshot
): WorldMergeResult {
  const conflicts: MergeConflict[] = []
  const notePath = (note: Note, notes: readonly Note[]) =>
    joinPath(noteFolder(note.parentId, notes), note.name)
  const leafPath = (leaf: Leaf, notes: readonly Note[]) =>
    joinPath(noteFolder(leaf.noteId, notes), leaf.title)

  // ---- ノート ----
  const baseNotes = new Map(base.notes.map((n) => [n.id, n]))
  const localNotes = new Map(local.notes.map((n) => [n.id, n]))
  const remoteNotes = new Map(remote.notes.map((n) => [n.id, n]))
  const noteIds = orderedIds(local.notes, remote.notes, base.notes)
  const mergedNotes: Note[] = []

  for (const id of noteIds) {
    const b = baseNotes.get(id)
    const l = localNotes.get(id)
    const r = remoteNotes.get(id)
    if (l && r) {
      const ref = b ?? r
      const name = pickName(ref.name, l.name, r.name)
      const parentId = pick3(ref.parentId, l.parentId, r.parentId)
      const badge = pick3(badgeOf(ref), badgeOf(l), badgeOf(r))
      const order = pick3(ref.order, l.order, r.order)
      const path = notePath(l, local.notes)
      if (name.conflict) {
        conflicts.push({
          kind: 'attribute',
          target: 'note',
          path,
          field: 'name',
          localValue: l.name,
          remoteValue: r.name,
        })
      }
      if (parentId.conflict) {
        conflicts.push({
          kind: 'attribute',
          target: 'note',
          path,
          field: 'location',
          localValue: noteFolder(l.parentId, local.notes),
          remoteValue: noteFolder(r.parentId, remote.notes),
        })
      }
      if (badge.conflict) {
        conflicts.push({ kind: 'attribute', target: 'note', path, field: 'badge' })
      }
      const badgeSource = badge.value === badgeOf(l) ? l : r
      mergedNotes.push({
        id,
        name: name.value,
        parentId: parentId.value,
        // 並び順の相反はリモート側を採る（内容は失われない）
        order: order.conflict ? r.order : order.value,
        badgeIcon: badgeSource.badgeIcon,
        badgeColor: badgeSource.badgeColor,
      })
    } else if (l && !r) {
      if (!b) {
        mergedNotes.push(l) // ローカルで追加
      } else if (noteEdited(b, l)) {
        conflicts.push({
          kind: 'deleteEdit',
          target: 'note',
          path: notePath(l, local.notes),
          deletedBy: 'remote',
        })
      }
      // それ以外: リモートで削除（ローカルは未変更）→ 削除を採る
    } else if (!l && r) {
      if (!b) {
        mergedNotes.push(r) // リモートで追加
      } else if (noteEdited(b, r)) {
        conflicts.push({
          kind: 'deleteEdit',
          target: 'note',
          path: notePath(r, remote.notes),
          deletedBy: 'local',
        })
      }
    }
    // 双方で削除: 何もしない
  }

  // ---- リーフ ----
  const baseLeaves = new Map(base.leaves.map((x) => [x.id, x]))
  const localLeaves = new Map(local.leaves.map((x) => [x.id, x]))
  const remoteLeaves = new Map(remote.leaves.map((x) => [x.id, x]))
  const leafIds = orderedIds(local.leaves, remote.leaves, base.leaves)
  const mergedLeaves: Leaf[] = []

  for (const id of leafIds) {
    const b = baseLeaves.get(id)
    const l = localLeaves.get(id)
    const r = remoteLeaves.get(id)
    if (l && r) {
      const path = leafPath(l, local.notes)
      // base に無い同一 ID（通常は起こらない）: 空の base として扱う
      const ref: Leaf = b ?? { ...r, title: '', content: '', noteId: '' }
      const title = pickName(ref.title, l.title, r.title)
      const noteId = pick3(ref.noteId, l.noteId, r.noteId)
      const badge = pick3(badgeOf(ref), badgeOf(l), badgeOf(r))
      const order = pick3(ref.order, l.order, r.order)
      const text = mergeText(ref.content, l.content, r.content)
      if (title.conflict) {
        conflicts.push({
          kind: 'attribute',
          target: 'leaf',
          path,
          field: 'name',
          localValue: l.title,
          remoteValue: r.title,
        })
      }
      if (noteId.conflict) {
        conflicts.push({
          kind: 'attribute',
          target: 'leaf',
          path,
          field: 'location',
          localValue: noteFolder(l.noteId, local.notes),
          remoteValue: noteFolder(r.noteId, remote.notes),
        })
      }
      if (badge.conflict) {
        conflicts.push({ kind: 'attribute', target: 'leaf', path, field: 'badge' })
      }
      if (text.merged === null) {
        conflicts.push({ kind: 'content', target: 'leaf', path, lines: text.conflicts })
      }
      const badgeSource = badge.value === badgeOf(l) ? l : r
      const content = text.merged ?? l.content
      mergedLeaves.push({
        id,
        title: title.value,
        noteId: noteId.value,
        content,
        updatedAt: Math.max(l.updatedAt, r.updatedAt),
        order: order.conflict ? r.order : order.value,
        badgeIcon: badgeSource.badgeIcon,
        badgeColor: badgeSource.badgeColor,
        // blobSha はリモートの本文と一致するときだけ引き継ぐ（Pull の blob キャッシュ用）
        blobSha: content === r.content ? r.blobSha : undefined,
      })
    } else if (l && !r) {
      if (!b) {
        mergedLeaves.push(l)
      } else if (leafEdited(b, l)) {
        conflicts.push({
          kind: 'deleteEdit',
          target: 'leaf',
          path: leafPath(l, local.notes),
          deletedBy: 'remote',
        })
      }
    } else if (!l && r) {
      if (!b) {
        mergedLeaves.push(r)
      } else if (leafEdited(b, r)) {
        conflicts.push({
          kind: 'deleteEdit',
          target: 'leaf',
          path: leafPath(r, remote.notes),
          deletedBy: 'local',
        })
      }
    }
  }

  // ---- マージ後の構造の検査 ----
  const mergedNoteMap = new Map(mergedNotes.map((n) => [n.id, n]))
  for (const note of mergedNotes) {
    if (!note.parentId) continue
    const parent = mergedNoteMap.get(note.parentId)
    if (!parent || parent.parentId) {
      conflicts.push({ kind: 'structure', target: 'note', path: notePath(note, mergedNotes) })
    }
  }
  for (const leaf of mergedLeaves) {
    if (!mergedNoteMap.has(leaf.noteId)) {
      const notes = localLeaves.has(leaf.id) ? local.notes : remote.notes
      conflicts.push({ kind: 'structure', target: 'leaf', path: leafPath(leaf, notes) })
    }
  }
  // 同名衝突（Push 時のファイルパスが重なると片方が黙って失われる）。
  // 表示名ではなく、Push と同じ getFolderPath / buildPath で作った実パスで比べる
  // （buildPath はリーフ名の `\/:*?"<>|#` を `-` に、連続空白を1つにし、80文字で切る）。
  const seenNotePaths = new Set<string>()
  for (const note of mergedNotes) {
    const key = getFolderPath(note, mergedNotes)
    if (seenNotePaths.has(key)) {
      conflicts.push({ kind: 'pathCollision', target: 'note', path: notePath(note, mergedNotes) })
    }
    seenNotePaths.add(key)
  }
  const seenLeafPaths = new Set<string>()
  for (const leaf of mergedLeaves) {
    // ノートが無いリーフは上の structure で競合済み（buildPath の警告も避ける）
    if (!mergedNoteMap.has(leaf.noteId)) continue
    const key = buildPath(leaf, mergedNotes)
    if (seenLeafPaths.has(key)) {
      conflicts.push({ kind: 'pathCollision', target: 'leaf', path: leafPath(leaf, mergedNotes) })
    }
    seenLeafPaths.add(key)
  }

  return {
    merged:
      conflicts.length === 0
        ? {
            notes: mergedNotes.sort((a, b) => a.order - b.order),
            leaves: mergedLeaves.sort((a, b) => a.order - b.order),
          }
        : null,
    conflicts,
    localChangeCount:
      countChanges(base.notes, local.notes, noteChanged) +
      countChanges(base.leaves, local.leaves, leafChanged),
    remoteChangeCount:
      countChanges(base.notes, remote.notes, noteChanged) +
      countChanges(base.leaves, remote.leaves, leafChanged),
  }
}

/** ローカル → リモート → base の出現順で ID を重複なく並べる */
function orderedIds(...lists: ReadonlyArray<readonly { id: string }[]>): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const list of lists) {
    for (const x of list) {
      if (!seen.has(x.id)) {
        seen.add(x.id)
        ids.push(x.id)
      }
    }
  }
  return ids
}

/**
 * 2つのワールドの内容が同じか（ID ごとに名前・親・バッジ・並び順・本文を比べる。
 * updatedAt / blobSha は比べない）。#321: ロード済みアーカイブが base コミットから
 * 読まれたものかの確認に使う。
 *
 * - 名前は Push の正規化（`nameKey`）を通して比べる（tree から読んだ側はサニタイズ済み）
 * - parentId の undefined と null、バッジの undefined と '' は同じものとして扱う。
 *   metadata.json は undefined のバッジを書かず、読み戻すと undefined / 欠落になるため、
 *   「値が無い」の表し方の違いを内容の違いと誤認しない
 */
export function sameWorldContent(a: WorldSnapshot, b: WorldSnapshot): boolean {
  const noteKey = (n: Note) =>
    JSON.stringify([n.id, nameKey(n.name), n.parentId ?? null, badgeOf(n), n.order])
  const leafKey = (l: Leaf) =>
    JSON.stringify([l.id, nameKey(l.title), l.noteId, l.content, badgeOf(l), l.order])
  const keys = <T>(xs: readonly T[], f: (x: T) => string) => xs.map(f).sort().join('\n')
  return (
    keys(a.notes, noteKey) === keys(b.notes, noteKey) &&
    keys(a.leaves, leafKey) === keys(b.leaves, leafKey)
  )
}
