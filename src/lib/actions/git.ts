import { type Note, type Leaf, buildBlobShaCache } from '../types'
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
import { PULL_ICON, PUSH_ICON } from '../ui/icons'

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
      // 診断情報: ローカル/リモートのpushCountとSHAを付与し、誤検出に気付けるようにする
      const remotePushCountResult = await fetchRemotePushCount(settings.value)
      const remotePushCount =
        remotePushCountResult.status === 'success' ? remotePushCountResult.pushCount : '?'
      const diagnostic = $_('modal.staleEditDiagnostic', {
        values: {
          localSha: (staleResult.localCommitSha ?? 'null').slice(0, 7),
          remoteSha: staleResult.remoteCommitSha.slice(0, 7),
          localCount: metadata.value.pushCount,
          remoteCount: remotePushCount,
        },
      })
      const choice = await choiceAsync($_('modal.staleEdit') + diagnostic, [
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

    // Push成功時の後処理
    if (result.variant === 'success') {
      // commit SHAはリモートHEADの外的事実なので、noChangesでも常に更新する。
      // noChangesで更新しないと、lastKnownCommitShaがドリフトして次回のstaleチェックで
      // 誤検出（pull/push選択ダイアログの誤表示）につながる。
      if (result.commitSha) {
        lastKnownCommitSha.value = result.commitSha
      }

      // スナップショット更新とダーティクリアは実際にPushしたときだけ行う。
      // noChangesで更新すると、executePushをawaitしている間にユーザーが加えた編集が
      // ベースラインに吸収されてダーティ追跡から消える（データ損失リスク）。
      // 参照: docs/development/sync/stale-detection.md
      if (result.message !== 'github.noChanges') {
        setLastPushedSnapshot(notes.value, leaves.value, archiveNotes.value, archiveLeaves.value)
        clearAllChanges()
        isStale.value = false
        lastPushTime.value = Date.now() // 自動Push用に最終Push時刻を記録
        // Push成功後にリモートから最新のpushCountを取得して更新（統計表示用）
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

    // blob SHAキャッシュ用: クリア前にバックアップのリーフからSHA→Leafのマップを構築
    // dirtyな状態ではキャッシュを使わない（編集後contentがリモート由来として扱われるのを防止）
    const cachedLeafMap = isDirty.value ? new Map<string, Leaf>() : buildBlobShaCache(backup.leaves)

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
      cachedLeaves: cachedLeafMap.size > 0 ? cachedLeafMap : undefined,
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
            // Pull中に編集されたリーフ: contentは編集後を採用し、blobShaはクリア
            // blobShaを残すと次回Pullでキャッシュヒットし、リモートの内容が取得されない
            return { ...leaf, content: currentLeaf.content, blobSha: undefined }
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

        // 途中まで取得したリーフをIndexedDBに保存（次回Pullのblobキャッシュ用）
        // これにより数回のPullで全リーフが揃い、最終的にPullが成功する
        const partialLeaves = leaves.value
        const partialNotes = notes.value
        if (partialLeaves.length > 0) {
          console.log(
            `Saving ${partialLeaves.length} partial leaves to IndexedDB for next pull cache`
          )
          saveLeaves(partialLeaves).catch((err) =>
            console.error('Failed to save partial leaves for cache:', err)
          )
        }
        if (partialNotes.length > 0) {
          saveNotes(partialNotes).catch((err) =>
            console.error('Failed to save partial notes for cache:', err)
          )
        }

        // メモリ上はクリア（UIはガラス状を維持）
        notes.value = []
        leaves.value = []
        // ベースラインもリセット（onLeafで追加された部分リーフが残らないように）
        setLastPushedSnapshot([], [], archiveNotes.value, archiveLeaves.value)
      } else if (hasBackupData && !isInitialStartup) {
        // 非初回Pull失敗: 直前の同期済みデータにリストアする（作業中の状態を保護）
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
      } else if (hasBackupData && isInitialStartup) {
        // 初回Pull失敗: メモリにはリストアしない（UIはガラス状を維持）が、
        // IndexedDBにはバックアップを書き戻す（次回PullのblobSHAキャッシュを保全）
        console.log(
          `Initial pull failed, restoring IndexedDB for cache (${backup.notes.length} notes, ${backup.leaves.length} leaves, UI remains locked)`
        )
        try {
          await restoreFromBackup(backup)
        } catch (err) {
          console.error('Failed to restore IndexedDB for cache:', err)
        }
      }
      // Offlineリーフのみ操作可能。オンライン復帰で自動リトライする。
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
