/**
 * GitHub 同期のパス構築（純粋層）
 *
 * fetch・settings・IO に一切触れない純粋関数・定数のみを置く。
 * github.ts から純移動（Phase 1）。振る舞いは不変。
 */

import type { Leaf, Note, WorldType } from '../../types'

// ============================================
// パス定数
// ============================================

/** Home用パス（通常のノート・リーフ） */
export const NOTES_PATH = '.agasteer/notes'
export const NOTES_METADATA_PATH = '.agasteer/notes/metadata.json'

/** Archive用パス */
export const ARCHIVE_PATH = '.agasteer/archive'
export const ARCHIVE_METADATA_PATH = '.agasteer/archive/metadata.json'

/**
 * ワールドに応じたベースパスを取得
 */
export function getBasePath(world: WorldType): string {
  return world === 'home' ? NOTES_PATH : ARCHIVE_PATH
}

/**
 * ワールドに応じたメタデータパスを取得
 */
export function getMetadataPath(world: WorldType): string {
  return world === 'home' ? NOTES_METADATA_PATH : ARCHIVE_METADATA_PATH
}

/**
 * ファイル名・ノート名に使えない文字をサニタイズし、80文字に制限する
 */
export function sanitizePathPart(raw: string): string {
  const cleaned = raw.replace(/[\\/:*?"<>|#]/g, '-').replace(/\s+/g, ' ')
  const limited = cleaned.slice(0, 80)
  return limited.length === 0 ? 'Untitled' : limited
}

/**
 * ノートパスを構築
 */
export function getFolderPath(note: Note, allNotes: Note[]): string {
  const parentNote = note.parentId ? allNotes.find((f) => f.id === note.parentId) : null

  if (parentNote) {
    return `${parentNote.name}/${note.name}`
  }
  return note.name
}

/**
 * ノートのフルパスを取得（.agasteer/notes/または.agasteer/archive/配下のディレクトリパス）
 */
export function getNotePath(note: Note, allNotes: Note[], world: WorldType = 'home'): string {
  const basePath = getBasePath(world)
  return `${basePath}/${getFolderPath(note, allNotes)}`
}

/**
 * リーフのフルパス（.md ファイル）を構築
 */
export function buildPath(leaf: Leaf, notes: Note[], world: WorldType = 'home'): string {
  const note = notes.find((f) => f.id === leaf.noteId)
  const basePath = getBasePath(world)
  // ファイル名に使えない文字をサニタイズ
  const sanitizedTitle = sanitizePathPart(leaf.title)
  if (!note) {
    console.warn('[buildPath] Note not found for leaf:', leaf.title, 'noteId:', leaf.noteId)
    return `${basePath}/${sanitizedTitle}.md`
  }

  const folderPath = getFolderPath(note, notes)
  const path = `${basePath}/${folderPath}/${sanitizedTitle}.md`
  return path
}
