import type { Note, Leaf } from '../types'
import type { PullOptions, LeafSkeleton } from '../api'
import type { ChoiceOption } from '../ui'
import { showPushToast, showPullToast } from '../ui'
import {
  settings,
  notes,
  leaves,
  metadata,
  isDirty,
  isPulling,
  isPushing,
  isStale,
  lastPushTime,
  lastKnownCommitSha,
  lastPulledPushCount,
  isArchiveLoaded,
  archiveNotes,
  archiveLeaves,
  archiveMetadata,
  leftNote,
  leftLeaf,
  rightNote,
  rightLeaf,
  leftView,
  leftWorld,
  clearAllChanges,
  getPersistedDirtyFlag,
  executeStaleCheck,
  setLastPushedSnapshot,
  addLeafToBaseline,
  refreshDirtyState,
  flushPendingSaves,
  leafStatsStore,
  pullProgressStore,
} from '../stores'
import {
  clearAllData,
  createBackup,
  restoreFromBackup,
  saveNotes,
  saveLeaves,
  setPushInFlightAt,
} from '../data'
import {
  executePush,
  executePull,
  testGitHubConnection,
  translateGitHubMessage,
  canSync,
  fetchRemotePushCount,
} from '../api'
import { isNoteSaveable, isLeafSaveable } from '../utils'
import * as nav from '../navigation'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { _ } from '../i18n'

/**
 * App.svelte のローカル $state() やコンポーネント固有の関数を渡すためのコンテキスト
 * stores は直接インポートして .value で操作するため、ここには含めない
 */
export interface GitActionContext {
  // $state() getters
  getIsArchiveLoading: () => boolean
  getIsFirstPriorityFetched: () => boolean
  getIsPullCompleted: () => boolean

  // $state() setters
  setIsArchiveLoading: (v: boolean) => void
  setIsFirstPriorityFetched: (v: boolean) => void
  setIsPullCompleted: (v: boolean) => void
  setIsLoadingUI: (v: boolean) => void
  setSelectedIndexLeft: (v: number) => void
  setSelectedIndexRight: (v: number) => void
  setLoadingLeafIds: (v: Set<string>) => void
  setLeafSkeletonMap: (v: Map<string, LeafSkeleton>) => void
  setIsRestoringFromUrl: (v: boolean) => void

  // $state() mutators
  getLoadingLeafIds: () => Set<string>

  // App.svelte 内の関数への参照
  restoreStateFromUrl: (alreadyRestoring?: boolean) => Promise<void> | void
  rebuildLeafStats: (leaves: Leaf[], notes: Note[]) => void
  resetLeafStats: () => void

  // confirmAsync / choiceAsync (UI)
  confirmAsync: (message: string) => Promise<boolean>
  choiceAsync: (message: string, choices: ChoiceOption[]) => Promise<string | null>

  // pushToGitHub 参照 (pullFromGitHub から呼ばれる)
  pushToGitHub: () => Promise<void>
}

/**
 * handleTestConnection 用の軽量コンテキスト
 */
export interface TestConnectionContext {
  setIsTesting: (v: boolean) => void
}

/**
 * GitHub接続テスト
 */
export async function handleTestConnection(ctx: TestConnectionContext): Promise<void> {
  const $_ = get(_)
  ctx.setIsTesting(true)
  try {
    const result = await testGitHubConnection(settings.value)
    const message = translateGitHubMessage(result.message, $_, result.rateLimitInfo)

    showPullToast(message, result.success ? 'success' : 'error')
  } catch (e) {
    showPullToast($_('github.networkError'), 'error')
  } finally {
    ctx.setIsTesting(false)
  }
}

/**
 * GitHubにPush（統合版）
 * すべてのPush処理がこの1つの関数を通る
 */
export async function pushToGitHub(ctx: GitActionContext): Promise<void> {
  const $_ = get(_)

  // 交通整理: Push不可なら何もしない（アーカイブロード中も禁止）
  if (!canSync(isPulling.value, isPushing.value).canPush || ctx.getIsArchiveLoading()) return

  // 即座にロック取得（この後の非同期処理中にPullが開始されるのを防止）
  isPushing.value = true
  try {
    // 保留中の自動保存を即座に実行してからPush
    await flushPendingSaves()

    // Stale編集かどうかチェック（共通関数で時刻も更新）
    const staleResult = await executeStaleCheck(settings.value, lastKnownCommitSha.value)

    if (staleResult.status === 'stale') {
      // リモートに新しい変更あり → 確認ダイアログを表示
      console.log(
        `Push blocked: remote(${staleResult.remoteCommitSha}) !== local(${staleResult.localCommitSha})`
      )
      const confirmed = await ctx.confirmAsync($_('modal.staleEdit'))
      if (!confirmed) return
    }
    // check_failedやup_to_dateの場合はそのまま続行

    // Push開始を通知
    showPushToast($_('loading.pushing'))

    // Push飛行中フラグを設定（スリープによるレスポンス消失検出用）
    setPushInFlightAt(Date.now())

    // ホーム直下のリーフ・仮想ノートを除外してからPush
    const $notes = notes.value
    const $leaves = leaves.value
    const saveableNotes = $notes.filter((n) => isNoteSaveable(n))
    const saveableLeaves = $leaves.filter((l) => isLeafSaveable(l, saveableNotes))
    const result = await executePush({
      leaves: saveableLeaves,
      notes: saveableNotes,
      settings: settings.value,
      isOperationsLocked: !ctx.getIsFirstPriorityFetched(),
      localMetadata: metadata.value,
      // アーカイブがロード済みの場合のみアーカイブデータを渡す
      archiveLeaves: isArchiveLoaded.value ? archiveLeaves.value : undefined,
      archiveNotes: isArchiveLoaded.value ? archiveNotes.value : undefined,
      archiveMetadata: isArchiveLoaded.value ? archiveMetadata.value : undefined,
      isArchiveLoaded: isArchiveLoaded.value,
    })

    // 結果を通知（GitHub APIのメッセージキーを翻訳、変更件数を含める）
    const translatedMessage = translateGitHubMessage(
      result.message,
      $_,
      result.rateLimitInfo,
      result.changedLeafCount
    )
    showPushToast(translatedMessage, result.variant)

    // Push飛行中フラグをクリア（レスポンスを受信できた）
    setPushInFlightAt(undefined)

    // Push成功時にダーティフラグをクリアし、pushCountを更新
    if (result.variant === 'success') {
      // 現在の状態をスナップショットとして保存（次回以降の差分検出のベースライン）
      setLastPushedSnapshot(notes.value, leaves.value, archiveNotes.value, archiveLeaves.value)
      clearAllChanges()
      lastPushTime.value = Date.now() // 自動Push用に最終Push時刻を記録
      // Push成功後のcommit SHAをストアに保存（stale検出用）
      if (result.commitSha) {
        lastKnownCommitSha.value = result.commitSha
      }
      // Push成功後にリモートから最新のpushCountを取得して更新（統計表示用）
      if (result.message === 'github.pushOk') {
        const remoteResult = await fetchRemotePushCount(settings.value)
        if (remoteResult.status === 'success') {
          lastPulledPushCount.value = remoteResult.pushCount
        }
      }
    }
  } finally {
    isPushing.value = false
  }
}

/**
 * Pull処理の統合関数
 */
export async function pullFromGitHub(
  ctx: GitActionContext,
  isInitialStartup = false,
  onCancel?: () => void | Promise<void>
): Promise<void> {
  const $_ = get(_)

  // 交通整理: Pull/Push中またはアーカイブロード中は不可
  if (!canSync(isPulling.value, isPushing.value).canPull || ctx.getIsArchiveLoading()) return

  // 即座にロック取得（この後の非同期処理中にPushが開始されるのを防止）
  isPulling.value = true
  try {
    // 未保存の変更がある場合は確認（PWA強制終了後の再起動も考慮）
    if (isDirty.value || getPersistedDirtyFlag()) {
      if (isInitialStartup) {
        // 起動時: Push first は選べない（まだPullしていないため）ので従来通り
        const confirmed = await ctx.confirmAsync($_('modal.unsavedChangesOnStartup'))
        if (!confirmed) {
          await onCancel?.()
          return
        }
      } else {
        // 通常時: Push first / Pull (overwrite) / Cancel の3択
        const choice = await ctx.choiceAsync($_('modal.unsavedChangesChoice'), [
          { label: $_('modal.pushFirst'), value: 'push', variant: 'primary' },
          { label: $_('modal.pullOverwrite'), value: 'pull', variant: 'secondary' },
          { label: $_('modal.cancel'), value: 'cancel', variant: 'cancel' },
        ])

        if (choice === 'push') {
          // Push first: isPullingロックを解放してPush→Pull
          isPulling.value = false
          await ctx.pushToGitHub()
          // Push後に再度Pull（再帰呼び出し）
          return pullFromGitHub(ctx, false, onCancel)
        } else if (choice === 'cancel' || choice === null) {
          await onCancel?.()
          return
        }
        // choice === 'pull' → 続行（上書き）
      }
    }

    // Staleチェック: リモートに変更があるか確認（共通関数で時刻も更新）
    const staleResult = await executeStaleCheck(settings.value, lastKnownCommitSha.value)

    switch (staleResult.status) {
      case 'up_to_date':
        // リモートに変更なし
        if (ctx.getIsPullCompleted()) {
          showPullToast($_('github.noRemoteChanges'), 'success')
          return
        }
        // 初回は続行
        break

      case 'stale':
        // リモートに変更あり → Pull実行
        console.log(
          `Pull needed: remote(${staleResult.remoteCommitSha}) !== local(${staleResult.localCommitSha})`
        )
        break

      case 'check_failed':
        // チェック失敗 → Pull実行（サーバー側でエラー表示される）
        console.warn('Stale check failed, proceeding with pull:', staleResult.reason)
        break
    }

    // Pull開始準備
    ctx.setIsLoadingUI(true)
    ctx.setIsFirstPriorityFetched(false)
    ctx.setIsPullCompleted(false)

    // Pull開始を通知
    showPullToast($_('toast.pullStart'))

    // Pull失敗時のデータ保護: 既存データをバックアップ
    const backup = await createBackup()
    const hasBackupData = backup.notes.length > 0 || backup.leaves.length > 0
    if (hasBackupData) {
      console.log(
        `Created backup before Pull (${backup.notes.length} notes, ${backup.leaves.length} leaves)`
      )
    }

    // 重要: GitHubが唯一の真実の情報源（Single Source of Truth）
    await clearAllData()
    notes.value = []
    leaves.value = []
    ctx.setLoadingLeafIds(new Set())
    ctx.resetLeafStats()
    leftNote.value = null
    leftLeaf.value = null
    rightNote.value = null
    rightLeaf.value = null

    const options: PullOptions = {
      // ノート構造確定時
      onStructure: (notesFromGitHub, metadataFromGitHub, leafSkeletons) => {
        notes.value = notesFromGitHub
        metadata.value = metadataFromGitHub

        ctx.setLeafSkeletonMap(new Map(leafSkeletons.map((s) => [s.id, s])))
        ctx.setLoadingLeafIds(new Set(leafSkeletons.map((s) => s.id)))

        pullProgressStore.start(leafSkeletons.length)

        return nav.getPriorityFromUrl(notesFromGitHub)
      },

      // 各リーフ取得完了時
      onLeaf: (leaf) => {
        leaves.value = [...leaves.value, leaf]
        leafStatsStore.addLeaf(leaf.id, leaf.content)
        addLeafToBaseline(leaf)
        const currentLoadingIds = ctx.getLoadingLeafIds()
        currentLoadingIds.delete(leaf.id)
        ctx.setLoadingLeafIds(new Set(currentLoadingIds))
        pullProgressStore.increment()
      },

      // 第1優先リーフ取得完了時
      onPriorityComplete: () => {
        ctx.setIsFirstPriorityFetched(true)
        ctx.setIsLoadingUI(false)

        if (isInitialStartup) {
          ctx.setIsRestoringFromUrl(true)
          ctx.restoreStateFromUrl(true)
          ctx.setIsRestoringFromUrl(false)
        } else {
          ctx.restoreStateFromUrl(false)
        }
      },
    }

    const result = await executePull(settings.value, options)

    if (result.success) {
      ctx.setIsPullCompleted(true)
      ctx.setSelectedIndexLeft(0)
      ctx.setSelectedIndexRight(0)

      const currentLeaves = leaves.value
      const currentLeafMap = new Map(currentLeaves.map((l) => [l.id, l]))
      const sortedLeaves = result.leaves
        .sort((a, b) => a.order - b.order)
        .map((leaf) => {
          const currentLeaf = currentLeafMap.get(leaf.id)
          if (currentLeaf && currentLeaf.content !== leaf.content) {
            return { ...leaf, content: currentLeaf.content }
          }
          return leaf
        })
      leaves.value = sortedLeaves
      ctx.rebuildLeafStats(sortedLeaves, result.notes)

      if (result.commitSha) {
        lastKnownCommitSha.value = result.commitSha
      }
      lastPulledPushCount.value = result.metadata.pushCount

      setLastPushedSnapshot(result.notes, result.leaves, archiveNotes.value, archiveLeaves.value)

      saveNotes(result.notes).catch((err) => console.error('Failed to persist notes:', err))
      saveLeaves(sortedLeaves).catch((err) => console.error('Failed to persist leaves:', err))

      await tick()
      refreshDirtyState()
      isStale.value = false
    } else {
      if (result.message === 'github.pullIncomplete') {
        console.error('Pull incomplete: some leaves failed to fetch. UI remains locked.')
        ctx.setIsFirstPriorityFetched(false)
        ctx.setIsPullCompleted(false)
        notes.value = []
        leaves.value = []
      } else if (hasBackupData) {
        console.log('Pull failed, restoring from backup...')
        try {
          await restoreFromBackup(backup)
          notes.value = backup.notes
          leaves.value = backup.leaves
          ctx.rebuildLeafStats(backup.leaves, backup.notes)
          ctx.restoreStateFromUrl(false)
          ctx.setIsFirstPriorityFetched(true)
        } catch (restoreError) {
          console.error('Failed to restore from backup:', restoreError)
        }
      }
    }

    const translatedMessage = translateGitHubMessage(result.message, $_, result.rateLimitInfo)
    showPullToast(translatedMessage, result.variant)
    ctx.setIsLoadingUI(false)
    pullProgressStore.reset()
  } finally {
    isPulling.value = false
  }
}
