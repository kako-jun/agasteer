/**
 * リーフのCRUD操作とビジネスロジック
 */
import { get } from 'svelte/store'
import type { Note, Leaf } from '../types'
import type { Pane } from '../navigation'
import { notes, leaves, updateLeaves } from '../stores'
import { showAlert, showConfirm, showPushToast } from '../ui'
// 循環参照回避: utils/index.tsではなく、直接utils.tsからインポート
import { generateUniqueName, normalizeBadgeValue } from '../utils/utils'
import { extractH1Title, updateH1Title } from '../ui/breadcrumbs'
import { computeLeafCharCount, type LeafStats } from '../utils/stats'

export interface CreateLeafOptions {
  targetNote: Note
  pane: Pane
  isOperationsLocked: boolean
  translate: (key: string) => string
  title?: string
}

export interface DeleteLeafOptions {
  leafId: string
  pane: Pane
  isOperationsLocked: boolean
  translate: (key: string) => string
  onNavigate: (pane: Pane, note: Note | null) => void
  otherPaneLeafId?: string
  onUpdateStats: (leafId: string, content: string) => void
}

export interface UpdateLeafContentOptions {
  content: string
  leafId: string
  isOperationsLocked: boolean
  translate: (key: string) => string
  onStatsUpdate: (leafId: string, previousContent: string, newContent: string) => void
}

/**
 * 新しいリーフを作成
 */
export function createLeaf(options: CreateLeafOptions): Leaf | null {
  const { targetNote, pane, isOperationsLocked, translate, title } = options

  if (isOperationsLocked) return null
  if (!targetNote) return null

  const allLeaves = get(leaves)
  const noteLeaves = allLeaves.filter((n) => n.noteId === targetNote.id)

  const existingTitles = noteLeaves.map((l) => l.title)

  // タイトルが指定されている場合、重複チェック
  if (title && existingTitles.includes(title)) {
    showAlert(translate('modal.duplicateLeafSameNote'))
    return null
  }

  const uniqueTitle = title || generateUniqueName(translate('common.leaf'), existingTitles)

  const newLeaf: Leaf = {
    id: crypto.randomUUID(),
    title: uniqueTitle,
    noteId: targetNote.id,
    content: `# ${uniqueTitle}\n\n`,
    updatedAt: Date.now(),
    order: noteLeaves.length,
  }

  updateLeaves([...allLeaves, newLeaf])

  return newLeaf
}

/**
 * リーフを削除
 */
export function deleteLeaf(options: DeleteLeafOptions): void {
  const {
    leafId,
    pane,
    isOperationsLocked,
    translate,
    onNavigate,
    otherPaneLeafId,
    onUpdateStats,
  } = options

  if (isOperationsLocked) {
    showAlert(translate('modal.needInitialPull'))
    return
  }

  const allLeaves = get(leaves)
  const allNotes = get(notes)
  const targetLeaf = allLeaves.find((l) => l.id === leafId)
  if (!targetLeaf) return

  const position = pane === 'left' ? 'bottom-left' : 'bottom-right'
  showConfirm(
    translate('modal.deleteLeaf'),
    () => {
      updateLeaves(allLeaves.filter((n) => n.id !== leafId))

      // 統計更新
      onUpdateStats(leafId, targetLeaf.content)

      const note = allNotes.find((f) => f.id === targetLeaf.noteId)

      // 現在のペインをナビゲート
      onNavigate(pane, note || null)

      // 他方のペインも同じリーフを表示している場合はナビゲート
      if (otherPaneLeafId === leafId) {
        const otherPane = pane === 'left' ? 'right' : 'left'
        onNavigate(otherPane, note || null)
      }

      showPushToast(translate('toast.deleted'), 'success')
    },
    position
  )
}

/**
 * リーフコンテンツを更新（タイトル自動同期含む）
 */
export function updateLeafContent(options: UpdateLeafContentOptions): {
  updatedLeaf: Leaf | null
  titleChanged: boolean
} {
  const { content, leafId, isOperationsLocked, translate, onStatsUpdate } = options

  if (isOperationsLocked) return { updatedLeaf: null, titleChanged: false }

  const allLeaves = get(leaves)
  const targetLeaf = allLeaves.find((l) => l.id === leafId)
  if (!targetLeaf) return { updatedLeaf: null, titleChanged: false }

  // 統計更新をコールバック
  onStatsUpdate(leafId, targetLeaf.content, content)

  // コンテンツの1行目が # 見出しの場合、リーフのタイトルも自動更新
  const h1Title = extractH1Title(content)
  let newTitle = h1Title || targetLeaf.title
  let titleChanged = false

  if (h1Title && targetLeaf) {
    const trimmed = h1Title.trim()
    const hasDuplicate = allLeaves.some(
      (l) => l.id !== leafId && l.noteId === targetLeaf.noteId && l.title.trim() === trimmed
    )
    if (hasDuplicate) {
      showAlert(translate('modal.duplicateLeafHeading'))
      newTitle = targetLeaf.title
    } else {
      titleChanged = true
    }
  }

  // グローバルストアを更新（isDirtyはスナップショット比較で自動検出）
  const updatedLeaves = allLeaves.map((n) =>
    n.id === leafId ? { ...n, content, title: newTitle, updatedAt: Date.now() } : n
  )
  updateLeaves(updatedLeaves)

  const updatedLeaf = updatedLeaves.find((n) => n.id === leafId) || null
  return { updatedLeaf, titleChanged }
}

/**
 * リーフのバッジを更新
 */
export function updateLeafBadge(
  leafId: string,
  badgeIcon: string,
  badgeColor: string
): Leaf | null {
  const allLeaves = get(leaves)
  const current = allLeaves.find((l) => l.id === leafId)
  if (!current) return null

  const nextIcon = normalizeBadgeValue(badgeIcon)
  const nextColor = normalizeBadgeValue(badgeColor)

  if (
    normalizeBadgeValue(current.badgeIcon) === nextIcon &&
    normalizeBadgeValue(current.badgeColor) === nextColor
  ) {
    return null
  }

  const updatedLeaves = allLeaves.map((n) =>
    n.id === leafId
      ? { ...n, badgeIcon: nextIcon, badgeColor: nextColor, updatedAt: Date.now() }
      : n
  )
  updateLeaves(updatedLeaves)

  return updatedLeaves.find((l) => l.id === leafId) || null
}

/**
 * リーフの順序を正規化
 */
export function normalizeLeafOrders(list: Leaf[], noteId: string): Leaf[] {
  const sorted = list.filter((l) => l.noteId === noteId).sort((a, b) => a.order - b.order)
  return list.map((l) =>
    l.noteId === noteId ? { ...l, order: sorted.findIndex((s) => s.id === l.id) } : l
  )
}

/**
 * リーフを別のノート配下に移動
 */
export function moveLeafTo(
  leaf: Leaf,
  destNoteId: string | null,
  translate: (key: string) => string
): { success: boolean; movedLeaf?: Leaf; destNote?: Note } {
  if (!destNoteId) return { success: false }
  if (leaf.noteId === destNoteId) return { success: false }

  const allLeaves = get(leaves)
  const allNotes = get(notes)
  const destinationNote = allNotes.find((n) => n.id === destNoteId)
  if (!destinationNote) return { success: false }

  const hasDuplicate = allLeaves.some(
    (l) => l.noteId === destNoteId && l.title.trim() === leaf.title.trim()
  )
  if (hasDuplicate) {
    showAlert(translate('modal.duplicateLeafDestination'))
    return { success: false }
  }

  const remaining = allLeaves.filter((l) => l.id !== leaf.id)
  let updatedLeaves = normalizeLeafOrders(remaining, leaf.noteId)
  updatedLeaves = normalizeLeafOrders(updatedLeaves, destNoteId)

  const movedLeaf: Leaf = {
    ...leaf,
    noteId: destNoteId,
    order: updatedLeaves.filter((l) => l.noteId === destNoteId).length,
    updatedAt: Date.now(),
  }
  updatedLeaves = [...updatedLeaves, movedLeaf]

  updateLeaves(updatedLeaves)

  return { success: true, movedLeaf, destNote: destinationNote }
}

/**
 * ノート配下のリーフ数を取得
 */
export function getLeafCount(noteId: string): number {
  return get(leaves).filter((n) => n.noteId === noteId).length
}
