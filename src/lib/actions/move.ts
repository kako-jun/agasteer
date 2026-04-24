import { get } from 'svelte/store' // for svelte-i18n only
import type { Note, Leaf, WorldType } from '../types'
import type { Pane } from '../navigation'
import { showPushToast, showPullToast, choiceAsync, alertAsync } from '../ui'
import {
  settings,
  notes,
  leaves,
  archiveNotes,
  archiveLeaves,
  archiveMetadata,
  isPulling,
  isPushing,
  isArchiveLoaded,
  isStructureDirty,
  leftWorld,
  rightWorld,
  leftNote,
  rightNote,
  leftLeaf,
  rightLeaf,
  leftView,
  rightView,
  updateNotes,
  updateLeaves,
  updateArchiveNotes,
  updateArchiveLeaves,
  archiveLeafStatsStore,
  setArchiveBaseline,
} from '../stores'
import {
  saveNotes,
  saveLeaves,
  saveArchiveNotes,
  saveArchiveLeaves,
  moveLeafTo as moveLeafToLib,
  moveNoteTo as moveNoteToLib,
} from '../data'
import { pullArchive, translateGitHubMessage } from '../api'
import { generateUniqueName } from '../utils'
import { appState, appActions, getWorldForPane } from '../app-state.svelte'
import { _ } from '../i18n'
import { runPendingRepoSyncIfIdle } from '../sync/repo-sync-queue'

async function runPendingRepoSyncAfterArchiveLoad(): Promise<void> {
  const hasValidConfig = !!(settings.value.token && settings.value.repoName)
  await runPendingRepoSyncIfIdle(
    {
      isPulling: isPulling.value,
      isPushing: isPushing.value,
      isArchiveLoading: appState.isArchiveLoading,
    },
    hasValidConfig,
    appState.pendingRepoSync,
    () => {
      appState.pendingRepoSync = false
    },
    async () => {
      await appActions.pullFromGitHub(false)
    }
  )
}

/**
 * ノートをワールド間で移動する（Home ⇔ Archive）
 */
export async function moveNoteToWorld(
  note: Note,
  targetWorld: WorldType,
  pane: Pane
): Promise<void> {
  const $_ = get(_)

  // Pull/Push中またはアーカイブロード中は移動を禁止
  if (isPulling.value || isPushing.value || appState.isArchiveLoading) return

  // アーカイブへの移動時、アーカイブがロードされていない場合は先にPull
  // Pull後のデータを保持（$archiveNotesはリアクティブ更新が遅れる可能性があるため）
  let freshArchiveNotes: Note[] | null = null
  let freshArchiveLeaves: Leaf[] | null = null

  if (targetWorld === 'archive' && !isArchiveLoaded.value) {
    const $settings = settings.value
    if ($settings.token && $settings.repoName) {
      appState.isArchiveLoading = true
      archiveLeafStatsStore.reset()
      try {
        const result = await pullArchive($settings, {
          onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
        })
        if (result.success) {
          archiveNotes.value = result.notes
          archiveLeaves.value = result.leaves
          archiveMetadata.value = result.metadata
          isArchiveLoaded.value = true
          // Pull直後のデータを保持（リアクティブ更新を待たずに使用）
          freshArchiveNotes = result.notes
          freshArchiveLeaves = result.leaves
          // Archive部分のベースラインのみ更新（Home側に影響しない）
          setArchiveBaseline(result.notes, result.leaves)
          saveArchiveNotes(result.notes).catch((err) =>
            console.error('Failed to persist archive notes:', err)
          )
          saveArchiveLeaves(result.leaves).catch((err) =>
            console.error('Failed to persist archive leaves:', err)
          )
        } else {
          // Pull失敗時はアーカイブ操作を中止（データ損失防止）
          showPullToast(
            translateGitHubMessage(
              result.message,
              $_,
              result.rateLimitInfo,
              undefined,
              result.errorCode,
              result.httpStatus
            ),
            'error'
          )
          return
        }
      } catch (e) {
        console.error('Archive pull failed before move:', e)
        // エラー時はアーカイブ操作を中止
        showPullToast($_('toast.pullFailed'), 'error')
        return
      } finally {
        appState.isArchiveLoading = false
        await runPendingRepoSyncAfterArchiveLoad()
      }
    } else {
      // GitHub設定がない場合は到達しないはず（ガラス効果でブロックされる）
      return
    }
  }

  const $notes = notes.value
  const $leaves = leaves.value
  const $archiveNotes = archiveNotes.value
  const $archiveLeaves = archiveLeaves.value
  const $leftWorld = leftWorld.value
  const $rightWorld = rightWorld.value

  const sourceWorld = pane === 'left' ? $leftWorld : $rightWorld
  const sourceNotes = sourceWorld === 'home' ? $notes : (freshArchiveNotes ?? $archiveNotes)
  const sourceLeaves = sourceWorld === 'home' ? $leaves : (freshArchiveLeaves ?? $archiveLeaves)

  // ノートを見つける
  const noteToMove = sourceNotes.find((n) => n.id === note.id)
  if (!noteToMove) return

  // ソースノートの親のパス（祖先ノートのリスト）を構築
  const getParentPath = (n: Note): Note[] => {
    const path: Note[] = []
    let current: Note | undefined = n.parentId
      ? sourceNotes.find((sn) => sn.id === n.parentId)
      : undefined
    while (current) {
      path.unshift(current)
      current = current.parentId ? sourceNotes.find((sn) => sn.id === current!.parentId) : undefined
    }
    return path
  }
  const parentPath = getParentPath(noteToMove)

  // ターゲット側で同じ親構造を見つけるか作成する
  // freshArchiveNotesがある場合はそれを使用（Pull直後のデータ）
  let currentTargetNotes =
    targetWorld === 'home' ? [...$notes] : [...(freshArchiveNotes ?? $archiveNotes)]
  let targetParentId: string | undefined

  for (const pathNote of parentPath) {
    const existing = currentTargetNotes.find(
      (n) => n.name === pathNote.name && n.parentId === targetParentId
    )
    if (existing) {
      targetParentId = existing.id
    } else {
      // 新しい親ノートを作成
      const siblingsAtLevel = currentTargetNotes.filter((n) => n.parentId === targetParentId)
      const maxOrder = Math.max(0, ...siblingsAtLevel.map((n) => n.order))
      const newNote: Note = {
        id: crypto.randomUUID(),
        name: pathNote.name,
        parentId: targetParentId,
        order: maxOrder + 1,
      }
      currentTargetNotes = [...currentTargetNotes, newNote]
      targetParentId = newNote.id
    }
  }

  // 同じ階層で同じ名前のノートがあるかチェック
  const siblingsInTarget = currentTargetNotes.filter((n) => n.parentId === targetParentId)
  const existingNote = siblingsInTarget.find((n) => n.name === noteToMove.name)
  const hasDuplicate = !!existingNote

  let mergeIntoExisting = false
  if (hasDuplicate) {
    // 重複がある場合は確認ダイアログを表示
    const choice = await choiceAsync($_('modal.duplicateChoiceMessage'), [
      { label: $_('common.cancel'), value: 'cancel', variant: 'cancel' },
      { label: $_('modal.duplicateChoiceSkip'), value: 'skip', variant: 'secondary' },
      { label: $_('modal.duplicateChoiceAdd'), value: 'add', variant: 'primary' },
    ])

    if (choice === 'cancel' || choice === null) {
      return
    }
    if (choice === 'skip') {
      return
    }
    // choice === 'add': 既存ノートにマージ
    mergeIntoExisting = true
  }

  // ノートとその子ノート、リーフを収集
  const childNotes = sourceNotes.filter((n) => n.parentId === note.id)
  const notesToMove = [noteToMove, ...childNotes]
  const noteIds = new Set(notesToMove.map((n) => n.id))
  const leavesToMove = sourceLeaves.filter((l) => noteIds.has(l.noteId))

  // ソースから削除
  const newSourceNotes = sourceNotes.filter((n) => !noteIds.has(n.id))
  const newSourceLeaves = sourceLeaves.filter((l) => !noteIds.has(l.noteId))

  // ターゲットに追加
  const targetLeaves = targetWorld === 'home' ? $leaves : (freshArchiveLeaves ?? $archiveLeaves)
  let newTargetNotes: Note[]
  let newTargetLeaves: Leaf[]

  if (mergeIntoExisting && existingNote) {
    // 既存ノートにマージする場合
    // メインノートのリーフは既存ノートに追加（重複はリネーム）
    const existingLeafTitles = targetLeaves
      .filter((l) => l.noteId === existingNote.id)
      .map((l) => l.title)
    const mainNoteLeaves = leavesToMove.filter((l) => l.noteId === noteToMove.id)
    const childNoteLeaves = leavesToMove.filter((l) => l.noteId !== noteToMove.id)

    const updatedExistingLeafTitles = [...existingLeafTitles]
    const mergedMainLeaves = mainNoteLeaves.map((l) => {
      if (updatedExistingLeafTitles.includes(l.title)) {
        const newTitle = generateUniqueName(l.title, updatedExistingLeafTitles)
        updatedExistingLeafTitles.push(newTitle)
        return { ...l, noteId: existingNote.id, title: newTitle }
      }
      updatedExistingLeafTitles.push(l.title)
      return { ...l, noteId: existingNote.id }
    })

    // 子ノートは既存ノートの子として追加（重複はリネーム）
    const existingChildNoteNames = currentTargetNotes
      .filter((n) => n.parentId === existingNote.id)
      .map((n) => n.name)
    const updatedChildNoteNames = [...existingChildNoteNames]
    const reparentedChildNotes = childNotes.map((n) => {
      if (updatedChildNoteNames.includes(n.name)) {
        const newName = generateUniqueName(n.name, updatedChildNoteNames)
        updatedChildNoteNames.push(newName)
        return { ...n, parentId: existingNote.id, name: newName }
      }
      updatedChildNoteNames.push(n.name)
      return { ...n, parentId: existingNote.id }
    })

    // 子ノートのリーフはそのまま（noteIdは変わらない）
    newTargetNotes = [...currentTargetNotes, ...reparentedChildNotes]
    newTargetLeaves = [...targetLeaves, ...mergedMainLeaves, ...childNoteLeaves]
  } else {
    // 通常の移動（重複なし）
    const targetSiblings = currentTargetNotes.filter((n) => n.parentId === targetParentId)
    const maxOrder = Math.max(0, ...targetSiblings.map((n) => n.order))
    const movedNote: Note = { ...noteToMove, parentId: targetParentId, order: maxOrder + 1 }
    // 子ノートはparentIdを維持（移動するノートのIDは変わらないので）
    const movedChildNotes = childNotes.map((n) => ({ ...n }))
    newTargetNotes = [...currentTargetNotes, movedNote, ...movedChildNotes]
    newTargetLeaves = [...targetLeaves, ...leavesToMove]
  }

  // ストアを更新
  if (sourceWorld === 'home') {
    updateNotes(newSourceNotes)
    updateLeaves(newSourceLeaves)
  } else {
    updateArchiveNotes(newSourceNotes)
    updateArchiveLeaves(newSourceLeaves)
  }

  if (targetWorld === 'home') {
    updateNotes(newTargetNotes)
    updateLeaves(newTargetLeaves)
  } else {
    updateArchiveNotes(newTargetNotes)
    updateArchiveLeaves(newTargetLeaves)
  }

  // IndexedDBとdirtyフラグを更新
  await saveNotes(sourceWorld === 'home' ? newSourceNotes : $notes)
  await saveLeaves(sourceWorld === 'home' ? newSourceLeaves : $leaves)
  isStructureDirty.value = true

  // スケルトンマップから移動したリーフを削除（Homeからアーカイブ時のみ）
  if (sourceWorld === 'home') {
    const leafIdsToRemove = leavesToMove.map((l) => l.id)
    const leafSkeletonMap = appState.leafSkeletonMap
    let hasChanges = false
    for (const id of leafIdsToRemove) {
      if (leafSkeletonMap.has(id)) {
        leafSkeletonMap.delete(id)
        hasChanges = true
      }
    }
    if (hasChanges) {
      appState.leafSkeletonMap = new Map(leafSkeletonMap) // リアクティブ更新をトリガー
    }
  }

  // 移動したノートを開いていた両ペインを親ノートに遷移（削除と同じ挙動）
  const $leftNote = leftNote.value
  const $rightNote = rightNote.value
  const $leftLeaf = leftLeaf.value
  const $rightLeaf = rightLeaf.value

  const checkPane = (paneToCheck: Pane) => {
    const currentNote = paneToCheck === 'left' ? $leftNote : $rightNote
    const currentLeaf = paneToCheck === 'left' ? $leftLeaf : $rightLeaf
    if (
      currentNote?.id === note.id ||
      noteIds.has(currentNote?.id ?? '') ||
      (currentLeaf && noteIds.has(currentLeaf.noteId))
    ) {
      const parentNote = note.parentId ? newSourceNotes.find((n) => n.id === note.parentId) : null
      if (parentNote) {
        appActions.selectNote(parentNote, paneToCheck)
      } else {
        appActions.goHome(paneToCheck)
      }
    }
  }
  checkPane('left')
  checkPane('right')
  appActions.refreshBreadcrumbs()
  appActions.rebuildLeafStats(leaves.value, notes.value)

  // トースト表示
  const toastKey = targetWorld === 'archive' ? 'toast.archived' : 'toast.restored'
  showPushToast($_(toastKey), 'success')
}

/**
 * リーフをワールド間で移動する（Home ⇔ Archive）
 */
export async function moveLeafToWorld(
  leaf: Leaf,
  targetWorld: WorldType,
  pane: Pane
): Promise<void> {
  const $_ = get(_)

  // Pull/Push中またはアーカイブロード中は移動を禁止
  if (isPulling.value || isPushing.value || appState.isArchiveLoading) return

  // アーカイブへの移動時、アーカイブがロードされていない場合は先にPull
  // Pull後のデータを保持（$archiveNotesはリアクティブ更新が遅れる可能性があるため）
  let freshArchiveNotes: Note[] | null = null
  let freshArchiveLeaves: Leaf[] | null = null

  if (targetWorld === 'archive' && !isArchiveLoaded.value) {
    const $settings = settings.value
    if ($settings.token && $settings.repoName) {
      appState.isArchiveLoading = true
      archiveLeafStatsStore.reset()
      try {
        const result = await pullArchive($settings, {
          onLeafFetched: (leaf) => archiveLeafStatsStore.addLeaf(leaf.id, leaf.content),
        })
        if (result.success) {
          archiveNotes.value = result.notes
          archiveLeaves.value = result.leaves
          archiveMetadata.value = result.metadata
          isArchiveLoaded.value = true
          // Pull直後のデータを保持（リアクティブ更新を待たずに使用）
          freshArchiveNotes = result.notes
          freshArchiveLeaves = result.leaves
          // Archive部分のベースラインのみ更新（Home側に影響しない）
          setArchiveBaseline(result.notes, result.leaves)
          saveArchiveNotes(result.notes).catch((err) =>
            console.error('Failed to persist archive notes:', err)
          )
          saveArchiveLeaves(result.leaves).catch((err) =>
            console.error('Failed to persist archive leaves:', err)
          )
        } else {
          // Pull失敗時はアーカイブ操作を中止（データ損失防止）
          showPullToast(
            translateGitHubMessage(
              result.message,
              $_,
              result.rateLimitInfo,
              undefined,
              result.errorCode,
              result.httpStatus
            ),
            'error'
          )
          return
        }
      } catch (e) {
        console.error('Archive pull failed before move:', e)
        // エラー時はアーカイブ操作を中止
        showPullToast($_('toast.pullFailed'), 'error')
        return
      } finally {
        appState.isArchiveLoading = false
        await runPendingRepoSyncAfterArchiveLoad()
      }
    } else {
      // GitHub設定がない場合は到達しないはず（ガラス効果でブロックされる）
      return
    }
  }

  const $notes = notes.value
  const $leaves = leaves.value
  const $archiveNotes = archiveNotes.value
  const $archiveLeaves = archiveLeaves.value
  const $leftWorld = leftWorld.value
  const $rightWorld = rightWorld.value

  const sourceWorld = pane === 'left' ? $leftWorld : $rightWorld
  const sourceNotes = sourceWorld === 'home' ? $notes : (freshArchiveNotes ?? $archiveNotes)
  const sourceLeaves = sourceWorld === 'home' ? $leaves : (freshArchiveLeaves ?? $archiveLeaves)
  const targetNotes = targetWorld === 'home' ? $notes : (freshArchiveNotes ?? $archiveNotes)
  const targetLeaves = targetWorld === 'home' ? $leaves : (freshArchiveLeaves ?? $archiveLeaves)

  // リーフの親ノートを見つける
  const sourceNote = sourceNotes.find((n) => n.id === leaf.noteId)
  if (!sourceNote) return

  // ソースノートのパス（祖先ノートのリスト）を構築
  const getNotePath = (note: Note): Note[] => {
    const path: Note[] = []
    let current: Note | undefined = note
    while (current) {
      path.unshift(current)
      current = current.parentId ? sourceNotes.find((n) => n.id === current!.parentId) : undefined
    }
    return path
  }
  const sourceNotePath = getNotePath(sourceNote)

  // ターゲット側で同じパス構造を見つけるか作成する
  // freshArchiveNotesがある場合はそれを使用（Pull直後のデータ）
  let currentTargetNotes =
    targetWorld === 'home' ? [...$notes] : [...(freshArchiveNotes ?? $archiveNotes)]
  let targetNote: Note | undefined
  let parentId: string | undefined

  for (const pathNote of sourceNotePath) {
    // 同じ階層で同じ名前のノートを探す
    const existing = currentTargetNotes.find(
      (n) => n.name === pathNote.name && n.parentId === parentId
    )
    if (existing) {
      targetNote = existing
      parentId = existing.id
    } else {
      // 新しいノートを作成
      const siblingsAtLevel = currentTargetNotes.filter((n) => n.parentId === parentId)
      const maxOrder = Math.max(0, ...siblingsAtLevel.map((n) => n.order))
      const newNote: Note = {
        id: crypto.randomUUID(),
        name: pathNote.name,
        parentId,
        order: maxOrder + 1,
      }
      currentTargetNotes = [...currentTargetNotes, newNote]
      targetNote = newNote
      parentId = newNote.id

      // ストアを更新
      if (targetWorld === 'home') {
        updateNotes(currentTargetNotes)
      } else {
        updateArchiveNotes(currentTargetNotes)
      }
    }
  }

  if (!targetNote) return

  // 同じ名前のリーフがあるかチェック
  const targetLeavesInNote = targetLeaves.filter((l) => l.noteId === targetNote!.id)
  const existingTitles = targetLeavesInNote.map((l) => l.title)
  const hasDuplicate = existingTitles.includes(leaf.title)

  let finalTitle = leaf.title
  if (hasDuplicate) {
    // 重複がある場合は確認ダイアログを表示
    const choice = await choiceAsync($_('modal.duplicateChoiceMessage'), [
      { label: $_('common.cancel'), value: 'cancel', variant: 'cancel' },
      { label: $_('modal.duplicateChoiceSkip'), value: 'skip', variant: 'secondary' },
      { label: $_('modal.duplicateChoiceAdd'), value: 'add', variant: 'primary' },
    ])

    if (choice === 'cancel' || choice === null) {
      return
    }
    if (choice === 'skip') {
      return
    }
    // choice === 'add': リネームして追加
    finalTitle = generateUniqueName(leaf.title, existingTitles)
  }

  // ソースから削除
  const newSourceLeaves = sourceLeaves.filter((l) => l.id !== leaf.id)

  // ターゲットに追加
  const maxOrder = Math.max(0, ...targetLeavesInNote.map((l) => l.order))
  const movedLeaf: Leaf = {
    ...leaf,
    title: finalTitle,
    noteId: targetNote.id,
    order: maxOrder + 1,
  }
  const newTargetLeaves = [...targetLeaves.filter((l) => l.id !== leaf.id), movedLeaf]

  // ストアを更新
  if (sourceWorld === 'home') {
    updateLeaves(newSourceLeaves)
  } else {
    updateArchiveLeaves(newSourceLeaves)
  }

  if (targetWorld === 'home') {
    updateLeaves(newTargetLeaves)
  } else {
    updateArchiveLeaves(newTargetLeaves)
  }

  // IndexedDBに保存
  await saveLeaves(sourceWorld === 'home' ? newSourceLeaves : leaves.value)
  // ターゲットがアーカイブなら archive 側も必ず永続化（表示の state は更新済みだが
  // IndexedDB が古いと再起動後に不整合が残るため）
  if (targetWorld === 'archive') {
    await saveArchiveNotes(archiveNotes.value)
    await saveArchiveLeaves(archiveLeaves.value)
  }

  // スケルトンマップ / ロード中IDから移動したリーフを無条件で除去し、
  // 常に新しい Map/Set を再代入してリアクティブ更新を保証する
  // (has() ガードで map 再代入をスキップすると、古い参照を見続けるビューで
  // スケルトン残像が消えないケースがあるため)
  if (sourceWorld === 'home') {
    const nextSkeletonMap = new Map(appState.leafSkeletonMap)
    nextSkeletonMap.delete(leaf.id)
    appState.leafSkeletonMap = nextSkeletonMap

    const nextLoadingIds = new Set(appState.loadingLeafIds)
    nextLoadingIds.delete(leaf.id)
    appState.loadingLeafIds = nextLoadingIds
  }

  // リーフを開いていたペインはソース側の親ノートに遷移する（削除・ノートアーカイブと同じ挙動）。
  // 連続アーカイブ運用のため、移動先 world への追従はしない（#160）。
  // 親ノート一覧でそのリーフを表示していた別ペインは world を保ったままリアクティブに
  // リーフが消えるので明示的な操作は不要。
  const followPane = (paneToCheck: Pane) => {
    const currentLeaf = paneToCheck === 'left' ? leftLeaf.value : rightLeaf.value
    const paneWorld = paneToCheck === 'left' ? leftWorld.value : rightWorld.value
    const leafMatches = currentLeaf?.id === leaf.id && paneWorld === sourceWorld
    if (!leafMatches) return
    if (paneToCheck === 'left') {
      leftNote.value = sourceNote
      leftLeaf.value = null
      leftView.value = 'note'
    } else {
      rightNote.value = sourceNote
      rightLeaf.value = null
      rightView.value = 'note'
    }
  }
  followPane('left')
  followPane('right')
  appActions.refreshBreadcrumbs()
  appActions.rebuildLeafStats(leaves.value, notes.value)

  // トースト表示
  const toastKey = targetWorld === 'archive' ? 'toast.archived' : 'toast.restored'
  showPushToast($_(toastKey), 'success')
}

/**
 * リーフを別のノートに移動する（移動モーダルから呼ばれる）
 */
export async function moveLeafTo(
  destNoteId: string | null,
  targetLeaf: Leaf,
  pane: Pane
): Promise<void> {
  const $_ = get(_)
  const paneWorld = getWorldForPane(pane)

  // アーカイブ内の場合は専用処理
  if (paneWorld === 'archive') {
    if (!destNoteId || targetLeaf.noteId === destNoteId) {
      appActions.closeMoveModal()
      return
    }

    const allLeaves = archiveLeaves.value
    const allNotes = archiveNotes.value
    const destinationNote = allNotes.find((n) => n.id === destNoteId)
    if (!destinationNote) {
      appActions.closeMoveModal()
      return
    }

    const hasDuplicate = allLeaves.some(
      (l) => l.noteId === destNoteId && l.title.trim() === targetLeaf.title.trim()
    )
    if (hasDuplicate) {
      await alertAsync($_('modal.duplicateLeafDestination'))
      appActions.closeMoveModal()
      return
    }

    const remaining = allLeaves.filter((l) => l.id !== targetLeaf.id)
    const movedLeaf: Leaf = {
      ...targetLeaf,
      noteId: destNoteId,
      order: remaining.filter((l) => l.noteId === destNoteId).length,
      updatedAt: Date.now(),
    }
    updateArchiveLeaves([...remaining, movedLeaf])
    isStructureDirty.value = true

    const $leftLeaf = leftLeaf.value
    const $rightLeaf = rightLeaf.value
    if ($leftLeaf?.id === targetLeaf.id) {
      leftLeaf.value = movedLeaf
      leftNote.value = destinationNote
    }
    if ($rightLeaf?.id === targetLeaf.id) {
      rightLeaf.value = movedLeaf
      rightNote.value = destinationNote
    }
    showPushToast($_('toast.moved'), 'success')
    appActions.closeMoveModal()
    return
  }

  // Home内の場合は既存処理
  const result = moveLeafToLib(targetLeaf, destNoteId, $_)
  if (result.success && result.movedLeaf && result.destNote) {
    const $leftLeaf = leftLeaf.value
    const $rightLeaf = rightLeaf.value
    if ($leftLeaf?.id === targetLeaf.id) {
      leftLeaf.value = result.movedLeaf
      leftNote.value = result.destNote
    }
    if ($rightLeaf?.id === targetLeaf.id) {
      rightLeaf.value = result.movedLeaf
      rightNote.value = result.destNote
    }
    // スケルトンマップから移動したリーフを削除（noteIdが古いままになるため）
    const leafSkeletonMap = appState.leafSkeletonMap
    if (leafSkeletonMap.has(targetLeaf.id)) {
      leafSkeletonMap.delete(targetLeaf.id)
      appState.leafSkeletonMap = new Map(leafSkeletonMap) // リアクティブ更新をトリガー
    }
    showPushToast($_('toast.moved'), 'success')
  }
  appActions.closeMoveModal()
}

/**
 * ノートを別のノートに移動する（移動モーダルから呼ばれる）
 */
export async function moveNoteTo(
  destNoteId: string | null,
  targetNote: Note,
  pane: Pane
): Promise<void> {
  const $_ = get(_)
  const paneWorld = getWorldForPane(pane)

  // アーカイブ内の場合は専用処理
  if (paneWorld === 'archive') {
    const currentParent = targetNote.parentId || null
    const nextParent = destNoteId

    if (currentParent === nextParent) {
      appActions.closeMoveModal()
      return
    }

    const allNotes = archiveNotes.value

    // 移動先がサブノートの場合は不可
    if (nextParent) {
      const dest = allNotes.find((n) => n.id === nextParent)
      if (!dest || dest.parentId) {
        appActions.closeMoveModal()
        return
      }
    }

    // 重複チェック
    const hasDuplicate = allNotes.some(
      (n) =>
        (n.parentId || null) === nextParent &&
        n.id !== targetNote.id &&
        n.name.trim() === targetNote.name.trim()
    )
    if (hasDuplicate) {
      await alertAsync($_('modal.duplicateNoteDestination'))
      appActions.closeMoveModal()
      return
    }

    const updated = allNotes.map((n) =>
      n.id === targetNote.id ? { ...n, parentId: nextParent || undefined } : n
    )
    updateArchiveNotes(updated)
    isStructureDirty.value = true

    const updatedNote = updated.find((n) => n.id === targetNote.id)
    if (updatedNote) {
      const $leftNote = leftNote.value
      const $rightNote = rightNote.value
      if ($leftNote?.id === targetNote.id) leftNote.value = updatedNote
      if ($rightNote?.id === targetNote.id) rightNote.value = updatedNote
      showPushToast($_('toast.moved'), 'success')
    }
    appActions.closeMoveModal()
    return
  }

  // Home内の場合は既存処理
  const result = moveNoteToLib(targetNote, destNoteId, $_)
  if (result.success && result.updatedNote) {
    const $leftNote = leftNote.value
    const $rightNote = rightNote.value
    if ($leftNote?.id === targetNote.id) leftNote.value = result.updatedNote
    if ($rightNote?.id === targetNote.id) rightNote.value = result.updatedNote
    showPushToast($_('toast.moved'), 'success')
  }
  appActions.closeMoveModal()
}
