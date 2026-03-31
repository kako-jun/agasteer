import { get } from 'svelte/store'
import type { Note, Leaf, Breadcrumb, WorldType, Metadata } from '../types'
import type { Pane } from '../navigation'
import type { LeafSkeleton } from '../api'
import type { ModalPosition } from '../ui'
import { showPushToast, alertAsync, extractH1Title, updateH1Title } from '../ui'
import {
  notes,
  leaves,
  metadata,
  isStructureDirty,
  leftNote,
  rightNote,
  leftLeaf,
  rightLeaf,
  leafStatsStore,
  archiveNotes,
  archiveLeaves,
  updateArchiveNotes,
  updateArchiveLeaves,
  updateNotes,
  updateLeaves,
  getNotesForWorld as _getNotesForWorld,
  getLeavesForWorld as _getLeavesForWorld,
  getWorldForPane as _getWorldForPane,
  leftWorld,
  rightWorld,
} from '../stores'
import {
  createNote as createNoteLib,
  deleteNote as deleteNoteLib,
  updateNoteBadge as updateNoteBadgeLib,
} from '../data'
import {
  createLeaf as createLeafLib,
  deleteLeaf as deleteLeafLib,
  updateLeafContent as updateLeafContentLib,
  updateLeafBadge as updateLeafBadgeLib,
} from '../data'
import { normalizeBadgeValue, PRIORITY_LEAF_ID, isOfflineLeaf } from '../utils'
import { _ } from '../i18n'

/**
 * App.svelte のローカル $state() やコンポーネント固有の関数を渡すためのコンテキスト
 * stores は直接インポートして get()/.set() で操作するため、ここには含めない
 */
export interface CrudActionContext {
  // $state() getters
  getIsFirstPriorityFetched: () => boolean
  getLeafSkeletonMap: () => Map<string, LeafSkeleton>

  // $state() setters
  setEditingBreadcrumb: (v: string | null) => void
  setLeafSkeletonMap: (v: Map<string, LeafSkeleton>) => void

  // App.svelte 内の関数への参照
  selectNote: (note: Note, pane: Pane) => void
  selectLeaf: (leaf: Leaf, pane: Pane) => void
  goHome: (pane: Pane) => void
  refreshBreadcrumbs: () => void
  rebuildLeafStats: (leaves: Leaf[], notes: Note[]) => void
  getWorldForPane: (pane: Pane) => WorldType
  getNotesForWorld: (world: WorldType) => Note[]
  getLeavesForWorld: (world: WorldType) => Leaf[]
  setNotesForWorld: (world: WorldType, newNotes: Note[]) => void
  setLeavesForWorld: (world: WorldType, newLeaves: Leaf[]) => void
  getLeavesForPane: (pane: Pane) => Leaf[]
  showPrompt: (
    message: string,
    onConfirm: (value: string) => void,
    defaultValue: string,
    position?: ModalPosition
  ) => void
  showConfirm: (message: string, onConfirm: () => void, position?: ModalPosition) => void
  getDialogPositionForPane: (pane: Pane) => ModalPosition
  updateOfflineContent: (content: string) => void
}

/**
 * パンくずリスト名の編集を保存
 */
export async function saveEditBreadcrumb(
  ctx: CrudActionContext,
  id: string,
  newName: string,
  type: Breadcrumb['type']
): Promise<void> {
  const $_ = get(_)
  const trimmed = newName.trim()
  if (!trimmed) return

  // 右ペインのパンくずリストかどうかを判定
  const isRight = id.endsWith('-right')
  const actualId = isRight ? id.replace('-right', '') : id
  // ペインのワールドに応じたノート・リーフを取得
  const pane: Pane = isRight ? 'right' : 'left'
  const world = ctx.getWorldForPane(pane)
  const paneNotes = ctx.getNotesForWorld(world)
  const paneLeaves = ctx.getLeavesForWorld(world)

  if (type === 'note') {
    const targetNote = paneNotes.find((f) => f.id === actualId)
    const siblingWithSameName = paneNotes.find(
      (n) =>
        n.id !== actualId &&
        (n.parentId || null) === (targetNote?.parentId || null) &&
        n.name.trim() === trimmed
    )
    if (siblingWithSameName) {
      await alertAsync($_('modal.duplicateNoteSameLevel'))
      return
    }
    if (targetNote && targetNote.name === trimmed) {
      ctx.refreshBreadcrumbs()
      ctx.setEditingBreadcrumb(null)
      return
    }

    // ノート名を更新
    const updatedNotes = paneNotes.map((n) => (n.id === actualId ? { ...n, name: trimmed } : n))
    ctx.setNotesForWorld(world, updatedNotes)

    const updatedNote = updatedNotes.find((f) => f.id === actualId)
    if (updatedNote) {
      if (get(leftNote)?.id === actualId) {
        leftNote.set(updatedNote)
      }
      if (isRight && get(rightNote)?.id === actualId) {
        rightNote.set(updatedNote)
      }
    }
    if (!paneNotes.some((f) => f.id === get(leftNote)?.id)) {
      leftNote.set(null)
    }
    if (isRight && !paneNotes.some((f) => f.id === get(rightNote)?.id)) {
      rightNote.set(null)
    }
  } else if (type === 'leaf') {
    const targetLeaf = paneLeaves.find((n) => n.id === actualId)
    const siblingLeafWithSameName = paneLeaves.find(
      (l) => l.id !== actualId && l.noteId === targetLeaf?.noteId && l.title.trim() === trimmed
    )
    if (siblingLeafWithSameName) {
      await alertAsync($_('modal.duplicateLeafSameNote'))
      return
    }

    if (targetLeaf && targetLeaf.title === trimmed) {
      ctx.refreshBreadcrumbs()
      ctx.setEditingBreadcrumb(null)
      return
    }

    // リーフのコンテンツの1行目が # 見出しの場合、見出しテキストも更新
    let updatedContent = targetLeaf?.content || ''
    if (targetLeaf && extractH1Title(targetLeaf.content)) {
      updatedContent = updateH1Title(targetLeaf.content, trimmed)
    }

    const updatedLeaves = paneLeaves.map((n) =>
      n.id === actualId
        ? { ...n, title: trimmed, content: updatedContent, updatedAt: Date.now() }
        : n
    )
    ctx.setLeavesForWorld(world, updatedLeaves)

    if (targetLeaf) {
      leafStatsStore.updateLeafContent(actualId, updatedContent, targetLeaf.content)
    }

    const updatedLeaf = updatedLeaves.find((n) => n.id === actualId)
    if (updatedLeaf) {
      if (get(leftLeaf)?.id === actualId) {
        leftLeaf.set(updatedLeaf)
      }
      if (isRight && get(rightLeaf)?.id === actualId) {
        rightLeaf.set(updatedLeaf)
      }
    }
    if (!paneLeaves.some((n) => n.id === get(leftLeaf)?.id)) {
      leftLeaf.set(null)
    }
    if (isRight && !paneLeaves.some((n) => n.id === get(rightLeaf)?.id)) {
      rightLeaf.set(null)
    }
  }

  ctx.refreshBreadcrumbs()
  ctx.setEditingBreadcrumb(null)
}

/**
 * ノートを作成
 */
export function createNote(
  ctx: CrudActionContext,
  parentId: string | undefined,
  pane: Pane,
  name?: string
): void {
  const $_ = get(_)

  if (!name) {
    // 名前が指定されていない場合はモーダルで入力を求める
    const position = ctx.getDialogPositionForPane(pane)
    ctx.showPrompt(
      $_('footer.newNote'),
      (inputName) => {
        const newNote = createNoteLib({
          parentId,
          pane,
          isOperationsLocked: !ctx.getIsFirstPriorityFetched(),
          translate: $_,
          name: inputName,
        })
        if (newNote) {
          showPushToast($_('toast.noteCreated'), 'success')
        }
      },
      '',
      position
    )
  } else {
    const newNote = createNoteLib({
      parentId,
      pane,
      isOperationsLocked: !ctx.getIsFirstPriorityFetched(),
      translate: $_,
      name,
    })
    if (newNote) {
      showPushToast($_('toast.noteCreated'), 'success')
    }
  }
}

/**
 * ノートを削除
 */
export function deleteNote(ctx: CrudActionContext, pane: Pane): void {
  const $_ = get(_)
  const $leftNote = get(leftNote)
  const $rightNote = get(rightNote)
  const $leftLeaf = get(leftLeaf)
  const $rightLeaf = get(rightLeaf)

  const targetNote = pane === 'left' ? $leftNote : $rightNote
  if (!targetNote) return

  const paneWorld = ctx.getWorldForPane(pane)
  // アーカイブ内の場合は専用処理
  if (paneWorld === 'archive') {
    const allNotes = get(archiveNotes)
    const allLeaves = get(archiveLeaves)

    const position = ctx.getDialogPositionForPane(pane)
    const confirmMessage = targetNote.parentId
      ? $_('modal.deleteSubNote')
      : $_('modal.deleteRootNote')

    ctx.showConfirm(
      confirmMessage,
      () => {
        // 子孫ノートを収集
        const descendantIds = new Set<string>()
        const collectDescendants = (id: string) => {
          descendantIds.add(id)
          allNotes.filter((n) => n.parentId === id).forEach((n) => collectDescendants(n.id))
        }
        collectDescendants(targetNote.id)

        const remainingNotes = allNotes.filter((n) => !descendantIds.has(n.id))
        const remainingLeaves = allLeaves.filter((l) => !descendantIds.has(l.noteId))

        updateArchiveNotes(remainingNotes)
        updateArchiveLeaves(remainingLeaves)

        // ナビゲーション処理
        const parentNote = targetNote.parentId
          ? remainingNotes.find((n) => n.id === targetNote.parentId)
          : null

        const checkPane = (paneToCheck: Pane) => {
          const currentNote = paneToCheck === 'left' ? get(leftNote) : get(rightNote)
          const currentLeaf = paneToCheck === 'left' ? get(leftLeaf) : get(rightLeaf)
          if (
            currentNote?.id === targetNote.id ||
            descendantIds.has(currentNote?.id ?? '') ||
            (currentLeaf && descendantIds.has(currentLeaf.noteId))
          ) {
            if (parentNote) ctx.selectNote(parentNote, paneToCheck)
            else ctx.goHome(paneToCheck)
          }
        }
        checkPane('left')
        checkPane('right')

        showPushToast($_('toast.deleted'), 'success')
      },
      position
    )
    return
  }

  // Home内の場合は既存処理
  deleteNoteLib({
    targetNote,
    pane,
    isOperationsLocked: !ctx.getIsFirstPriorityFetched(),
    translate: $_,
    onNavigate: (p, parentNote) => {
      // 両ペインのナビゲーション処理
      const checkPane = (paneToCheck: Pane) => {
        const currentNote = paneToCheck === 'left' ? get(leftNote) : get(rightNote)
        const currentLeaf = paneToCheck === 'left' ? get(leftLeaf) : get(rightLeaf)
        if (
          currentNote?.id === targetNote.id ||
          (currentLeaf && currentLeaf.noteId === targetNote.id)
        ) {
          if (parentNote) {
            ctx.selectNote(parentNote, paneToCheck)
          } else {
            ctx.goHome(paneToCheck)
          }
        }
      }
      checkPane('left')
      checkPane('right')
    },
    rebuildLeafStats: ctx.rebuildLeafStats,
  })
}

/**
 * ノートバッジを更新
 */
export function updateNoteBadge(
  ctx: CrudActionContext,
  noteId: string,
  badgeIcon: string,
  badgeColor: string,
  pane: Pane
): void {
  const paneWorld = ctx.getWorldForPane(pane)
  // アーカイブ内の場合は専用処理
  if (paneWorld === 'archive') {
    const allNotes = get(archiveNotes)
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
    updateArchiveNotes(updated)
    return
  }

  // Home内の場合は既存処理
  updateNoteBadgeLib(noteId, badgeIcon, badgeColor)
}

/**
 * リーフを作成
 */
export function createLeaf(ctx: CrudActionContext, pane: Pane, title?: string): void {
  const $_ = get(_)
  const targetNote = pane === 'left' ? get(leftNote) : get(rightNote)
  if (!targetNote) return

  if (!title) {
    // タイトルが指定されていない場合はモーダルで入力を求める
    const position = ctx.getDialogPositionForPane(pane)
    ctx.showPrompt(
      $_('footer.newLeaf'),
      (inputTitle) => {
        const newLeaf = createLeafLib({
          targetNote,
          pane,
          isOperationsLocked: !ctx.getIsFirstPriorityFetched(),
          translate: $_,
          title: inputTitle,
        })
        if (newLeaf) {
          leafStatsStore.addLeaf(newLeaf.id, newLeaf.content)
          ctx.selectLeaf(newLeaf, pane)
          showPushToast($_('toast.leafCreated'), 'success')
        }
      },
      '',
      position
    )
  } else {
    const newLeaf = createLeafLib({
      targetNote,
      pane,
      isOperationsLocked: !ctx.getIsFirstPriorityFetched(),
      translate: $_,
      title,
    })
    if (newLeaf) {
      leafStatsStore.addLeaf(newLeaf.id, newLeaf.content)
      ctx.selectLeaf(newLeaf, pane)
      showPushToast($_('toast.leafCreated'), 'success')
    }
  }
}

/**
 * リーフを削除
 */
export function deleteLeaf(ctx: CrudActionContext, leafId: string, pane: Pane): void {
  const $_ = get(_)
  const otherLeaf = pane === 'left' ? get(rightLeaf) : get(leftLeaf)

  const paneWorld = ctx.getWorldForPane(pane)
  // アーカイブ内の場合は専用処理
  if (paneWorld === 'archive') {
    const allLeaves = get(archiveLeaves)
    const allNotes = get(archiveNotes)
    const targetLeaf = allLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return

    const position = ctx.getDialogPositionForPane(pane)
    ctx.showConfirm(
      $_('modal.deleteLeaf'),
      () => {
        updateArchiveLeaves(allLeaves.filter((l) => l.id !== leafId))

        const note = allNotes.find((n) => n.id === targetLeaf.noteId)
        if (note) ctx.selectNote(note, pane)
        else ctx.goHome(pane)

        if (otherLeaf?.id === leafId) {
          const otherPane = pane === 'left' ? 'right' : 'left'
          if (note) ctx.selectNote(note, otherPane)
          else ctx.goHome(otherPane)
        }

        showPushToast($_('toast.deleted'), 'success')
      },
      position
    )
    return
  }

  // Home内の場合は既存処理
  deleteLeafLib({
    leafId,
    pane,
    isOperationsLocked: !ctx.getIsFirstPriorityFetched(),
    translate: $_,
    onNavigate: (p, note) => {
      if (note) ctx.selectNote(note, p)
      else ctx.goHome(p)
    },
    otherPaneLeafId: otherLeaf?.id,
    onUpdateStats: (id, content) => {
      leafStatsStore.removeLeaf(id, content)
    },
  })
  // スケルトンマップからも削除（削除したリーフがスケルトンとして再表示されるのを防ぐ）
  const leafSkeletonMap = ctx.getLeafSkeletonMap()
  if (leafSkeletonMap.has(leafId)) {
    leafSkeletonMap.delete(leafId)
    ctx.setLeafSkeletonMap(new Map(leafSkeletonMap)) // リアクティブ更新をトリガー
  }
}

/**
 * リーフのコンテンツを更新
 */
export async function updateLeafContent(
  ctx: CrudActionContext,
  content: string,
  leafId: string,
  pane: Pane
): Promise<void> {
  const $_ = get(_)

  // オフラインリーフは専用の自動保存処理
  if (isOfflineLeaf(leafId)) {
    ctx.updateOfflineContent(content)
    // 左右ペインのリーフはcurrentOfflineLeafから自動更新されるので不要
    return
  }

  const paneWorld = ctx.getWorldForPane(pane)
  // アーカイブ内の場合は専用処理
  if (paneWorld === 'archive') {
    const allLeaves = get(archiveLeaves)
    const targetLeaf = allLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return

    // コンテンツの1行目が # 見出しの場合、リーフのタイトルも自動更新
    const h1Title = extractH1Title(content)
    let newTitle = h1Title || targetLeaf.title
    let titleChanged = false

    if (h1Title) {
      const trimmed = h1Title.trim()
      const hasDuplicate = allLeaves.some(
        (l) => l.id !== leafId && l.noteId === targetLeaf.noteId && l.title.trim() === trimmed
      )
      if (hasDuplicate) {
        await alertAsync($_('modal.duplicateLeafHeading'))
        newTitle = targetLeaf.title
      } else {
        titleChanged = true
      }
    }

    const updatedLeaf: Leaf = {
      ...targetLeaf,
      title: newTitle,
      content,
      updatedAt: Date.now(),
    }
    updateArchiveLeaves(allLeaves.map((l) => (l.id === leafId ? updatedLeaf : l)))

    if (get(leftLeaf)?.id === leafId) leftLeaf.set(updatedLeaf)
    if (get(rightLeaf)?.id === leafId) rightLeaf.set(updatedLeaf)
    if (titleChanged) ctx.refreshBreadcrumbs()
    return
  }

  // Home内の場合は既存処理
  const result = updateLeafContentLib({
    content,
    leafId,
    isOperationsLocked: !ctx.getIsFirstPriorityFetched(),
    translate: $_,
    onStatsUpdate: (id, prevContent, newContent) => {
      leafStatsStore.updateLeafContent(id, newContent, prevContent)
    },
  })
  if (result.updatedLeaf) {
    if (get(leftLeaf)?.id === leafId) leftLeaf.set(result.updatedLeaf)
    if (get(rightLeaf)?.id === leafId) rightLeaf.set(result.updatedLeaf)
    if (result.titleChanged) ctx.refreshBreadcrumbs()
  }
}

/**
 * リーフバッジを更新
 */
export function updateLeafBadge(
  ctx: CrudActionContext,
  leafId: string,
  badgeIcon: string,
  badgeColor: string,
  pane: Pane
): void {
  const paneWorld = ctx.getWorldForPane(pane)
  // アーカイブ内の場合は専用処理
  if (paneWorld === 'archive') {
    const allLeaves = get(archiveLeaves)
    const targetLeaf = allLeaves.find((l) => l.id === leafId)
    if (!targetLeaf) return

    const updatedLeaf: Leaf = {
      ...targetLeaf,
      badgeIcon: normalizeBadgeValue(badgeIcon),
      badgeColor: normalizeBadgeValue(badgeColor),
      updatedAt: Date.now(),
    }
    updateArchiveLeaves(allLeaves.map((l) => (l.id === leafId ? updatedLeaf : l)))

    if (get(leftLeaf)?.id === leafId) leftLeaf.set(updatedLeaf)
    if (get(rightLeaf)?.id === leafId) rightLeaf.set(updatedLeaf)
    return
  }

  // Home内の場合は既存処理
  const updated = updateLeafBadgeLib(leafId, badgeIcon, badgeColor)
  if (updated) {
    if (get(leftLeaf)?.id === leafId) leftLeaf.set(updated)
    if (get(rightLeaf)?.id === leafId) rightLeaf.set(updated)
  }
}

/**
 * Priorityリーフのバッジ更新（metadataに直接保存）
 */
export function updatePriorityBadge(badgeIcon: string, badgeColor: string): void {
  metadata.update((m) => {
    const newLeaves = { ...m.leaves }
    if (badgeIcon || badgeColor) {
      newLeaves[PRIORITY_LEAF_ID] = {
        id: PRIORITY_LEAF_ID,
        updatedAt: Date.now(),
        order: 0,
        badgeIcon: badgeIcon || undefined,
        badgeColor: badgeColor || undefined,
      }
    } else {
      // バッジをクリアした場合はエントリを削除
      delete newLeaves[PRIORITY_LEAF_ID]
    }
    return { ...m, leaves: newLeaves }
  })
  // 構造変更フラグを立てて保存が必要な状態にする
  isStructureDirty.set(true)
}
