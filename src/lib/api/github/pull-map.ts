/**
 * GitHub Pull のパス折り畳み・スケルトン構築（純粋層）
 *
 * fetch・settings・IO に一切触れない純粋関数のみを置く。
 * github.ts から純移動（Phase 3 / #226）。振る舞いは不変。
 *
 * pullFromGitHub / pullArchive で重複していた
 * 「tree レスポンス → notes/leaves スケルトン構築」ロジックを集約する。
 * noteMap を mutate する現状ロジックはそのまま保存し、
 * 非決定性（uuid / Date.now）は optional 引数で注入可能にする（デフォルトは現状維持）。
 */

import type { Leaf, Metadata, Note } from '../../types'
import { sanitizePathPart } from './paths'

/**
 * ノートパス（ファイル名を除いた parts）を最大2階層へ折り畳む。
 * 3階層以上は先頭と残りを '/' で結合した1つにまとめ、各要素は sanitizePathPart を通す
 * （collapse 後の '/'→'-' 変換は仕様）。
 */
export function collapseToTwoLevels(parts: string[]): string[] {
  if (parts.length <= 2) return parts.map((p) => sanitizePathPart(p))
  return [sanitizePathPart(parts[0]), sanitizePathPart(parts.slice(1).join('/'))]
}

/** tree レスポンスの blob/tree エントリ */
export interface TreeEntry {
  path: string
  type: string
  sha: string
}

/** metadata.leaves の値の型（リーフのメタ情報） */
export type LeafMeta = Metadata['leaves'][string]

/**
 * リーフ取得ターゲット（コンテンツ取得前に確定するスケルトン情報）。
 * pullFromGitHub / pullArchive で共通の形状。
 */
export interface LeafTarget {
  entry: TreeEntry
  title: string
  noteId: string
  leafMeta: LeafMeta
  relativePath: string
}

/**
 * ノートパスを noteMap に登録し、末端ノートの id を返す。
 *
 * pathParts は内部で collapseToTwoLevels される（呼び出し側の現状挙動を保存）。
 * meta.notes に partial パスの id があればそれを使い、無ければ idGenerator で新規生成する。
 * noteMap は引数で受けて **mutate** する（現状ロジックそのまま）。
 */
export function ensureNotePath(params: {
  pathParts: string[]
  noteMap: Map<string, Note>
  metadata: Metadata
  idGenerator?: () => string
}): string {
  const { pathParts, noteMap, metadata, idGenerator = () => crypto.randomUUID() } = params
  const collapsed = collapseToTwoLevels(pathParts)
  let parentId: string | undefined
  for (let i = 0; i < collapsed.length; i++) {
    const partial = collapsed.slice(0, i + 1).join('/')
    if (noteMap.has(partial)) {
      parentId = noteMap.get(partial)!.id
      continue
    }
    // metadata.jsonからメタ情報を取得
    const meta = metadata.notes[partial] || {
      id: idGenerator(),
      order: noteMap.size,
      badgeIcon: undefined,
      badgeColor: undefined,
    }
    const note: Note = {
      id: meta.id,
      name: collapsed[i],
      parentId,
      order: meta.order,
      badgeIcon: meta.badgeIcon,
      badgeColor: meta.badgeColor,
    }
    noteMap.set(partial, note)
    parentId = note.id
  }
  return parentId || ''
}

/**
 * .md エントリ群から LeafTarget[] を構築する。
 *
 * ファイル名を先に分離してからノートパス部分だけを collapse し、
 * metadata.leaves を collapsed / original の2キーで引き当てる（現状の順序を保存）。
 * 内部で ensureNotePath を呼び noteMap を **mutate** する。
 * idGenerator / now は注入可能（デフォルトは現状維持）。
 */
export function buildLeafTargets(params: {
  entries: TreeEntry[]
  basePath: string
  metadata: Metadata
  noteMap: Map<string, Note>
  idGenerator?: () => string
  now?: () => number
}): LeafTarget[] {
  const {
    entries,
    basePath,
    metadata,
    noteMap,
    idGenerator = () => crypto.randomUUID(),
    now = () => Date.now(),
  } = params
  const basePathRegExp = new RegExp(`^${basePath}/`)
  return entries.map((entry, idx) => {
    const relativePath = entry.path.replace(basePathRegExp, '')
    const allParts = relativePath.split('/').filter(Boolean)
    // ファイル名を先に分離してから、ノートパス部分だけをcollapseする
    const fileName = allParts.pop() || ''
    const noteParts = collapseToTwoLevels(allParts)
    const title = fileName.replace(/\.md$/i, '') || 'Untitled'
    const noteId = ensureNotePath({ pathParts: noteParts, noteMap, metadata, idGenerator })
    const leafPathOriginal = entry.path.replace(basePathRegExp, '')
    const leafPathCollapsed = [...noteParts, fileName].join('/')
    const leafMeta = metadata.leaves[leafPathCollapsed] ||
      metadata.leaves[leafPathOriginal] || {
        id: idGenerator(),
        updatedAt: now(),
        order: idx,
        badgeIcon: undefined,
        badgeColor: undefined,
      }
    return {
      entry,
      title,
      noteId,
      leafMeta,
      relativePath: leafPathCollapsed,
    }
  })
}

/**
 * リーフの取得優先度を返す（pullFromGitHub 専用）。
 * 0: URLで指定されたリーフ / 1: 指定リーフと同じノート配下 / 2: その他。
 */
export function getLeafPriority(
  target: LeafTarget,
  priority: { leafPaths: Set<string>; noteIds: Set<string> }
): 0 | 1 | 2 {
  // 第1優先: URLで指定されたリーフ
  if (priority.leafPaths.has(target.relativePath)) return 0
  // 第2優先: URLで指定されたリーフと同じノート配下
  if (priority.noteIds.has(target.noteId)) return 1
  // その他
  return 2
}

/**
 * LeafTarget + content + blobSha から Leaf を構築する。
 * cached / fetched の両経路で同形の Leaf を組み立てる重複を解消する。
 */
export function buildLeafFromTarget(target: LeafTarget, content: string, blobSha: string): Leaf {
  return {
    id: target.leafMeta.id,
    title: target.title,
    noteId: target.noteId,
    content,
    updatedAt: target.leafMeta.updatedAt,
    order: target.leafMeta.order,
    badgeIcon: target.leafMeta.badgeIcon,
    badgeColor: target.leafMeta.badgeColor,
    blobSha,
  }
}
