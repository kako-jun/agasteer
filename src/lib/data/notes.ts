/**
 * ノートのCRUD操作とビジネスロジック
 */
import { get } from 'svelte/store'
import type { Note, Leaf } from '../types'
import type { Pane } from '../navigation'
import { notes, leaves, updateNotes, updateLeaves } from '../stores'
import { showAlert, showConfirm, showPushToast } from '../ui'
// 循環参照回避: utils/index.tsではなく、直接utils.tsからインポート
import { generateUniqueName, normalizeBadgeValue } from '../utils/utils'

export interface CreateNoteOptions {
  parentId?: string
  pane: Pane
  isOperationsLocked: boolean
  translate: (key: string) => string
  name?: string
}

export interface DeleteNoteOptions {
  targetNote: Note
  pane: Pane
  isOperationsLocked: boolean
  translate: (key: string) => string
  onNavigate: (pane: Pane, parentNote: Note | null) => void
  rebuildLeafStats: (leaves: Leaf[], notes: Note[]) => void
}

/**
 * 新しいノートを作成
 */
export function createNote(options: CreateNoteOptions): Note | null {
  const { parentId, pane, isOperationsLocked, translate, name } = options

  if (isOperationsLocked) return null

  const allNotes = get(notes)

  // 階層制限チェック: サブノートの下にはサブノートを作成できない
  if (parentId) {
    const parentNote = allNotes.find((n) => n.id === parentId)
    if (parentNote && parentNote.parentId) {
      showAlert(translate('modal.noNestedSubNote'))
      return null
    }
  }

  const targetNotes = parentId
    ? allNotes.filter((f) => f.parentId === parentId)
    : allNotes.filter((f) => !f.parentId)

  const existingNames = targetNotes.map((n) => n.name)

  // 名前が指定されている場合、重複チェック
  if (name && existingNames.includes(name)) {
    showAlert(translate('modal.duplicateNoteSameLevel'))
    return null
  }

  const uniqueName = name || generateUniqueName(translate('common.note'), existingNames)

  const newNote: Note = {
    id: crypto.randomUUID(),
    name: uniqueName,
    parentId: parentId || undefined,
    order: targetNotes.length,
  }

  updateNotes([...allNotes, newNote])

  return newNote
}

/**
 * ノートを削除（子孫も含めて削除）
 */
export function deleteNote(options: DeleteNoteOptions): void {
  const { targetNote, pane, isOperationsLocked, translate, onNavigate, rebuildLeafStats } = options

  if (isOperationsLocked) {
    showAlert(translate('common.needInitialPull'))
    return
  }

  if (!targetNote) return

  const allNotes = get(notes)
  const allLeaves = get(leaves)

  const deleteNoteAndDescendants = () => {
    const targetId = targetNote.id

    const descendantIds = new Set<string>()
    const collectDescendants = (id: string) => {
      descendantIds.add(id)
      allNotes.filter((n) => n.parentId === id).forEach((n) => collectDescendants(n.id))
    }
    collectDescendants(targetId)

    const remainingNotes = allNotes.filter((n) => !descendantIds.has(n.id))
    const remainingLeaves = allLeaves.filter((l) => !descendantIds.has(l.noteId))

    updateNotes(remainingNotes)
    updateLeaves(remainingLeaves)
    rebuildLeafStats(remainingLeaves, remainingNotes)

    const parentId = targetNote.parentId
    const parentNote = parentId ? remainingNotes.find((f) => f.id === parentId) : null

    // ナビゲーション処理
    onNavigate(pane, parentNote || null)

    showPushToast(translate('toast.deleted'), 'success')
  }

  const confirmMessage = targetNote.parentId
    ? translate('modal.deleteSubNote')
    : translate('modal.deleteRootNote')

  const position = pane === 'left' ? 'bottom-left' : 'bottom-right'
  showConfirm(confirmMessage, deleteNoteAndDescendants, position)
}

/**
 * ノート名を更新
 */
export function updateNoteName(noteId: string, newName: string): void {
  const allNotes = get(notes)
  const updatedNotes = allNotes.map((f) => (f.id === noteId ? { ...f, name: newName } : f))
  updateNotes(updatedNotes)
}

/**
 * ノートのバッジを更新
 */
export function updateNoteBadge(noteId: string, badgeIcon: string, badgeColor: string): void {
  const allNotes = get(notes)
  const current = allNotes.find((n) => n.id === noteId)
  if (!current) return

  const nextIcon = normalizeBadgeValue(badgeIcon)
  const nextColor = normalizeBadgeValue(badgeColor)

  if (
    normalizeBadgeValue(current.badgeIcon) === nextIcon &&
    normalizeBadgeValue(current.badgeColor) === nextColor
  ) {
    return
  }

  const updated = allNotes.map((n) =>
    n.id === noteId ? { ...n, badgeIcon: nextIcon, badgeColor: nextColor } : n
  )
  updateNotes(updated)
}

/**
 * ノートの順序を正規化
 */
export function normalizeNoteOrders(list: Note[], parentId: string | undefined | null): Note[] {
  const sorted = list
    .filter((n) => (n.parentId || null) === (parentId || null))
    .sort((a, b) => a.order - b.order)
  return list.map((n) =>
    (n.parentId || null) === (parentId || null)
      ? { ...n, order: sorted.findIndex((s) => s.id === n.id) }
      : n
  )
}

/**
 * ノートを別のノート配下に移動
 */
export function moveNoteTo(
  note: Note,
  destNoteId: string | null,
  translate: (key: string) => string
): { success: boolean; updatedNote?: Note } {
  const currentParent = note.parentId || null
  const nextParent = destNoteId

  if (currentParent === nextParent) {
    return { success: false }
  }

  const allNotes = get(notes)

  if (nextParent) {
    const dest = allNotes.find((n) => n.id === nextParent)
    if (!dest || dest.parentId) {
      return { success: false }
    }
  }

  const hasDuplicate = allNotes.some(
    (n) =>
      (n.parentId || null) === nextParent && n.id !== note.id && n.name.trim() === note.name.trim()
  )

  if (hasDuplicate) {
    showAlert(translate('modal.duplicateNoteDestination'))
    return { success: false }
  }

  let updated = allNotes.map((n) =>
    n.id === note.id ? { ...n, parentId: nextParent || undefined, order: n.order } : n
  )
  updated = normalizeNoteOrders(updated, currentParent)
  updated = normalizeNoteOrders(updated, nextParent)

  updateNotes(updated)

  const updatedNote = updated.find((n) => n.id === note.id) || note
  return { success: true, updatedNote }
}

/**
 * ノート配下のアイテム数を取得
 */
export function getItemCount(noteId: string): number {
  const allNotes = get(notes)
  const allLeaves = get(leaves)
  const subNotesCount = allNotes.filter((f) => f.parentId === noteId).length
  const leavesCount = allLeaves.filter((n) => n.noteId === noteId).length
  return subNotesCount + leavesCount
}

/**
 * ノート配下のアイテム名リストを取得（表示用）
 */
export function getNoteItems(noteId: string): string[] {
  const allNotes = get(notes)
  const allLeaves = get(leaves)

  const subNotesNames = allNotes
    .filter((f) => f.parentId === noteId)
    .sort((a, b) => a.order - b.order)
    .map((f) => `${f.name}/`) // サブノートは末尾にスラッシュで区別

  const leafNames = allLeaves
    .filter((n) => n.noteId === noteId)
    .sort((a, b) => a.order - b.order)
    .map((n) => n.title)

  const allItems = [...subNotesNames, ...leafNames]
  const hasMore = allItems.length > 3
  const items = allItems.slice(0, 3)

  if (hasMore) {
    items.push('...')
  }

  return items
}
