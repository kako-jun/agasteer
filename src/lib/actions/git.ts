import type { Note, Leaf } from '../types'
import type { PullOptions } from '../api'
import { showPushToast, showPullToast, confirmAsync, choiceAsync } from '../ui'
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
  addNotesToBaseline,
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
import { appState, appActions } from '../app-state.svelte'
import * as nav from '../navigation'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { _ } from '../i18n'

// Pull のアイコン（↓矢印 + Octocat）
const PULL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 512" fill="currentColor"><path d="M172.86,290.12c-9.75,0-18.11,4.56-24.86,13.87s-10.07,20.58-10.07,34,3.43,24.91,10.07,34.12S163,386,172.86,386c9.1,0,17-4.66,23.68-13.87s10.07-20.58,10.07-34.12-3.43-24.81-10.07-34S182,290.12,172.86,290.12Z"/><path d="M340.32,290.12c-9.64,0-18.11,4.56-24.86,13.87s-10.07,20.58-10.07,34,3.43,24.91,10.07,34.12S330.57,386,340.32,386c9.11,0,17-4.66,23.79-13.87s10.07-20.58,10.07-34.12-3.43-24.81-10.07-34S349.54,290.12,340.32,290.12Z"/><path d="M459.36,165h0c-.11,0,2.89-15.49.32-42.47-2.36-27-8-51.78-17.25-74.53,0,0-4.72.87-13.72,3.14S405,58,384.89,67.18c-19.82,9.2-40.71,21.44-62.46,36.29-14.79-4.23-36.86-6.39-66.43-6.39-28.18,0-50.25,2.16-66.43,6.39Q117.9,53.25,69.46,48,55.65,82.13,52.32,122.75c-2.57,27,.43,42.58.43,42.58C26.71,193.82,16,234.88,16,268.78c0,26.22.75,49.94,6.54,71,6,20.91,13.6,38,22.6,51.14A147.49,147.49,0,0,0,79,425.43c13.39,10.08,25.71,17.34,36.86,21.89,11.25,4.76,24,8.23,38.57,10.72a279.19,279.19,0,0,0,32.68,4.34s30,1.62,69,1.62S325,462.38,325,462.38A285.25,285.25,0,0,0,357.68,458a178.91,178.91,0,0,0,38.46-10.72c11.15-4.66,23.47-11.81,37-21.89a145,145,0,0,0,33.75-34.55c9-13.11,16.6-30.23,22.6-51.14S496,294.89,496,268.67C496,235.85,485.29,194.25,459.36,165ZM389.29,418.07C359.39,432.26,315.46,438,257.18,438h-2.25c-58.29,0-102.22-5.63-131.57-19.93s-44.25-43.45-44.25-87.43c0-26.32,9.21-47.66,27.32-64,7.93-7,17.57-11.92,29.57-14.84s22.93-3,33.21-2.71c10.08.43,24.22,2.38,42.11,3.79s31.39,3.25,44.79,3.25c12.53,0,29.14-2.17,55.82-4.33s46.61-3.25,59.46-1.09c13.18,2.17,24.65,6.72,34.4,15.93q28.44,25.67,28.5,64C434.18,374.62,419.07,403.88,389.29,418.07Z"/><g fill="none" stroke="currentColor" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"><line x1="700" y1="120" x2="700" y2="340"/><polyline points="620,300 700,380 780,300"/></g></svg>`

// Push のアイコン（↑矢印 + Octocat）
const PUSH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 512" fill="currentColor"><g fill="none" stroke="currentColor" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"><line x1="200" y1="160" x2="200" y2="380"/><polyline points="120,180 200,100 280,180"/></g><path d="M572.86,290.12c-9.75,0-18.11,4.56-24.86,13.87s-10.07,20.58-10.07,34,3.43,24.91,10.07,34.12S563,386,572.86,386c9.1,0,17-4.66,23.68-13.87s10.07-20.58,10.07-34.12-3.43-24.81-10.07-34S582,290.12,572.86,290.12Z"/><path d="M740.32,290.12c-9.64,0-18.11,4.56-24.86,13.87s-10.07,20.58-10.07,34,3.43,24.91,10.07,34.12S730.57,386,740.32,386c9.11,0,17-4.66,23.79-13.87s10.07-20.58,10.07-34.12-3.43-24.81-10.07-34S749.54,290.12,740.32,290.12Z"/><path d="M859.36,165h0c-.11,0,2.89-15.49.32-42.47-2.36-27-8-51.78-17.25-74.53,0,0-4.72.87-13.72,3.14S805,58,784.89,67.18c-19.82,9.2-40.71,21.44-62.46,36.29-14.79-4.23-36.86-6.39-66.43-6.39-28.18,0-50.25,2.16-66.43,6.39Q517.9,53.25,469.46,48,455.65,82.13,452.32,122.75c-2.57,27,.43,42.58.43,42.58C426.71,193.82,416,234.88,416,268.78c0,26.22.75,49.94,6.54,71,6,20.91,13.6,38,22.6,51.14A147.49,147.49,0,0,0,479,425.43c13.39,10.08,25.71,17.34,36.86,21.89,11.25,4.76,24,8.23,38.57,10.72a279.19,279.19,0,0,0,32.68,4.34s30,1.62,69,1.62S725,462.38,725,462.38A285.25,285.25,0,0,0,757.68,458a178.91,178.91,0,0,0,38.46-10.72c11.15-4.66,23.47-11.81,37-21.89a145,145,0,0,0,33.75-34.55c9-13.11,16.6-30.23,22.6-51.14S896,294.89,896,268.67C896,235.85,885.29,194.25,859.36,165ZM789.29,418.07C759.39,432.26,715.46,438,657.18,438h-2.25c-58.29,0-102.22-5.63-131.57-19.93s-44.25-43.45-44.25-87.43c0-26.32,9.21-47.66,27.32-64,7.93-7,17.57-11.92,29.57-14.84s22.93-3,33.21-2.71c10.08.43,24.22,2.38,42.11,3.79s31.39,3.25,44.79,3.25c12.53,0,29.14-2.17,55.82-4.33s46.61-3.25,59.46-1.09c13.18,2.17,24.65,6.72,34.4,15.93q28.44,25.67,28.5,64C834.18,374.62,819.07,403.88,789.29,418.07Z"/></svg>`

/**
 * GitHub接続テスト
 */
export async function handleTestConnection(): Promise<void> {
  const $_ = get(_)
  appState.isTesting = true
  try {
    const result = await testGitHubConnection(settings.value)
    const message = translateGitHubMessage(
      result.message,
      $_,
      result.rateLimitInfo,
      undefined,
      result.errorCode,
      result.httpStatus
    )

    showPullToast(message, result.success ? 'success' : 'error')
  } catch (e) {
    showPullToast($_('github.networkError'), 'error')
  } finally {
    appState.isTesting = false
  }
}

/**
 * GitHubにPush（統合版）
 * すべてのPush処理がこの1つの関数を通る
 */
export async function pushToGitHub(): Promise<void> {
  const $_ = get(_)

  // 交通整理: Push不可なら何もしない（アーカイブロード中も禁止）
  if (!canSync(isPulling.value, isPushing.value).canPush || appState.isArchiveLoading) return

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
      const choice = await choiceAsync($_('modal.staleEdit'), [
        { label: $_('modal.pullFirst'), value: 'pull', variant: 'primary', icon: PULL_ICON },
        { label: $_('modal.pushOverwrite'), value: 'push', variant: 'secondary', icon: PUSH_ICON },
        { label: $_('modal.cancel'), value: 'cancel', variant: 'cancel' },
      ])

      if (choice === 'pull') {
        // Pull first: isPushingロックを解放してPull→Push
        isPushing.value = false
        await pullFromGitHub(false)
        // Pull後に再度Push（再帰呼び出し）
        return appActions.pushToGitHub()
      } else if (choice === 'cancel' || choice === null) {
        return
      }
      // choice === 'push' → 続行（上書き）
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
      isOperationsLocked: !appState.isFirstPriorityFetched,
      localMetadata: metadata.value,
      // アーカイブがロード済みの場合のみアーカイブデータを渡す
      archiveLeaves: isArchiveLoaded.value ? archiveLeaves.value : undefined,
      archiveNotes: isArchiveLoaded.value ? archiveNotes.value : undefined,
      archiveMetadata: isArchiveLoaded.value ? archiveMetadata.value : undefined,
      isArchiveLoaded: isArchiveLoaded.value,
    })

    // 結果を通知（GitHub APIのメッセージキーを翻訳、変更件数を含める）
    // リーフ変更件数が0の場合はundefinedを渡し、メタデータのみの変更としてトースト表示する
    const totalLeafCount = (result.changedLeafCount ?? 0) + (result.changedArchiveLeafCount ?? 0)
    const translatedMessage = translateGitHubMessage(
      result.message,
      $_,
      result.rateLimitInfo,
      totalLeafCount > 0 ? totalLeafCount : undefined,
      result.errorCode,
      result.httpStatus
    )
    showPushToast(translatedMessage, result.variant)

    // Push飛行中フラグをクリア（レスポンスを受信できた）
    setPushInFlightAt(undefined)

    // Push成功時にダーティフラグをクリアし、pushCountを更新
    // noChangesの場合は実際にPushしていないので、スナップショット更新やフラグクリアを行わない
    if (result.variant === 'success' && result.message !== 'github.noChanges') {
      // 現在の状態をスナップショットとして保存（次回以降の差分検出のベースライン）
      setLastPushedSnapshot(notes.value, leaves.value, archiveNotes.value, archiveLeaves.value)
      clearAllChanges()
      isStale.value = false
      lastPushTime.value = Date.now() // 自動Push用に最終Push時刻を記録
      // Push成功後のcommit SHAをストアに保存（stale検出用）
      if (result.commitSha) {
        lastKnownCommitSha.value = result.commitSha
      }
      // Push成功後にリモートから最新のpushCountを取得して更新（統計表示用）
      const remoteResult = await fetchRemotePushCount(settings.value)
      if (remoteResult.status === 'success') {
        lastPulledPushCount.value = remoteResult.pushCount
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
  isInitialStartup = false,
  onCancel?: () => void | Promise<void>
): Promise<void> {
  const $_ = get(_)

  // 交通整理: Pull/Push中またはアーカイブロード中は不可
  if (!canSync(isPulling.value, isPushing.value).canPull || appState.isArchiveLoading) return

  // 即座にロック取得（この後の非同期処理中にPushが開始されるのを防止）
  isPulling.value = true
  try {
    // 未保存の変更がある場合は確認（PWA強制終了後の再起動も考慮）
    if (isDirty.value || getPersistedDirtyFlag()) {
      if (isInitialStartup) {
        // 起動時: Push first は選べない（まだPullしていないため）ので従来通り
        const confirmed = await confirmAsync($_('modal.unsavedChangesOnStartup'))
        if (!confirmed) {
          await onCancel?.()
          return
        }
      } else {
        // 通常時: Push first / Pull (overwrite) / Cancel の3択
        const choice = await choiceAsync($_('modal.unsavedChangesChoice'), [
          { label: $_('modal.pullOverwrite'), value: 'pull', variant: 'primary', icon: PULL_ICON },
          { label: $_('modal.pushFirst'), value: 'push', variant: 'secondary', icon: PUSH_ICON },
          { label: $_('modal.cancel'), value: 'cancel', variant: 'cancel' },
        ])

        if (choice === 'push') {
          // Push first: isPullingロックを解放してPush→Pull
          isPulling.value = false
          await appActions.pushToGitHub()
          // Push後に再度Pull（再帰呼び出し）
          return pullFromGitHub(false, onCancel)
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
        if (appState.isPullCompleted) {
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
    appState.isLoadingUI = true
    appState.isFirstPriorityFetched = false
    appState.isPullCompleted = false

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
    appState.loadingLeafIds = new Set()
    appActions.resetLeafStats()
    leftNote.value = null
    leftLeaf.value = null
    rightNote.value = null
    rightLeaf.value = null

    const options: PullOptions = {
      // ノート構造確定時
      onStructure: (notesFromGitHub, metadataFromGitHub, leafSkeletons) => {
        notes.value = notesFromGitHub
        metadata.value = metadataFromGitHub
        addNotesToBaseline(notesFromGitHub)

        appState.leafSkeletonMap = new Map(leafSkeletons.map((s) => [s.id, s]))
        appState.loadingLeafIds = new Set(leafSkeletons.map((s) => s.id))

        pullProgressStore.start(leafSkeletons.length)

        return nav.getPriorityFromUrl(notesFromGitHub)
      },

      // 各リーフ取得完了時
      onLeaf: (leaf) => {
        leaves.value = [...leaves.value, leaf]
        leafStatsStore.addLeaf(leaf.id, leaf.content)
        addLeafToBaseline(leaf)
        const currentLoadingIds = appState.loadingLeafIds
        currentLoadingIds.delete(leaf.id)
        appState.loadingLeafIds = new Set(currentLoadingIds)
        pullProgressStore.increment()
      },

      // 第1優先リーフ取得完了時
      onPriorityComplete: () => {
        appState.isFirstPriorityFetched = true
        appState.isLoadingUI = false

        if (isInitialStartup) {
          appState.isRestoringFromUrl = true
          appActions.restoreStateFromUrl(true)
          appState.isRestoringFromUrl = false
        } else {
          appActions.restoreStateFromUrl(false)
        }
      },
    }

    const result = await executePull(settings.value, options)

    if (result.success) {
      appState.isPullCompleted = true
      appState.selectedIndexLeft = 0
      appState.selectedIndexRight = 0

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
      appActions.rebuildLeafStats(sortedLeaves, result.notes)

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
      appState.isPullCompleted = false
      if (result.message === 'github.pullIncomplete') {
        console.error('Pull incomplete: some leaves failed to fetch. UI remains locked.')
        appState.isFirstPriorityFetched = false
        notes.value = []
        leaves.value = []
      } else if (hasBackupData) {
        console.log('Pull failed, restoring from backup...')
        try {
          await restoreFromBackup(backup)
          notes.value = backup.notes
          leaves.value = backup.leaves
          appActions.rebuildLeafStats(backup.leaves, backup.notes)
          appActions.restoreStateFromUrl(false)
          appState.isFirstPriorityFetched = true
        } catch (restoreError) {
          console.error('Failed to restore from backup:', restoreError)
        }
      }
    }

    const translatedMessage = translateGitHubMessage(
      result.message,
      $_,
      result.rateLimitInfo,
      undefined,
      result.errorCode,
      result.httpStatus
    )
    showPullToast(translatedMessage, result.variant)
    appState.isLoadingUI = false
    pullProgressStore.reset()
  } finally {
    isPulling.value = false
  }
}
