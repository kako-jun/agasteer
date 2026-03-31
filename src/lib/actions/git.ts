import { get } from 'svelte/store'
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
import { _ } from '../i18n'

/**
 * App.svelte のローカル $state() やコンポーネント固有の関数を渡すためのコンテキスト
 * stores は直接インポートして get()/.set() で操作するため、ここには含めない
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
    const result = await testGitHubConnection(get(settings))
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
  if (!canSync(get(isPulling), get(isPushing)).canPush || ctx.getIsArchiveLoading()) return

  // 即座にロック取得（この後の非同期処理中にPullが開始されるのを防止）
  isPushing.set(true)
  try {
    // 保留中の自動保存を即座に実行してからPush
    await flushPendingSaves()

    // Stale編集かどうかチェック（共通関数で時刻も更新）
    const staleResult = await executeStaleCheck(get(settings), get(lastKnownCommitSha))

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
    const $notes = get(notes)
    const $leaves = get(leaves)
    const saveableNotes = $notes.filter((n) => isNoteSaveable(n))
    const saveableLeaves = $leaves.filter((l) => isLeafSaveable(l, saveableNotes))
    const result = await executePush({
      leaves: saveableLeaves,
      notes: saveableNotes,
      settings: get(settings),
      isOperationsLocked: !ctx.getIsFirstPriorityFetched(),
      localMetadata: get(metadata),
      // アーカイブがロード済みの場合のみアーカイブデータを渡す
      archiveLeaves: get(isArchiveLoaded) ? get(archiveLeaves) : undefined,
      archiveNotes: get(isArchiveLoaded) ? get(archiveNotes) : undefined,
      archiveMetadata: get(isArchiveLoaded) ? get(archiveMetadata) : undefined,
      isArchiveLoaded: get(isArchiveLoaded),
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
      setLastPushedSnapshot(get(notes), get(leaves), get(archiveNotes), get(archiveLeaves))
      clearAllChanges()
      lastPushTime.set(Date.now()) // 自動Push用に最終Push時刻を記録
      // Push成功後のcommit SHAをストアに保存（stale検出用）
      if (result.commitSha) {
        lastKnownCommitSha.set(result.commitSha)
      }
      // Push成功後にリモートから最新のpushCountを取得して更新（統計表示用）
      if (result.message === 'github.pushOk') {
        const remoteResult = await fetchRemotePushCount(get(settings))
        if (remoteResult.status === 'success') {
          lastPulledPushCount.set(remoteResult.pushCount)
        }
      }
    }
  } finally {
    isPushing.set(false)
  }
}

/**
 * Pull処理の統合関数
 * - 交通整理（canSync）
 * - ダーティチェック（confirmAsync）
 * - Staleチェック（executeStaleCheck）
 * - Pull実行（executePull）
 * を1つの関数で実行し、自動的に排他制御を行う
 */
export async function pullFromGitHub(
  ctx: GitActionContext,
  isInitialStartup = false,
  onCancel?: () => void | Promise<void>
): Promise<void> {
  const $_ = get(_)

  // 交通整理: Pull/Push中またはアーカイブロード中は不可
  if (!canSync(get(isPulling), get(isPushing)).canPull || ctx.getIsArchiveLoading()) return

  // 即座にロック取得（この後の非同期処理中にPushが開始されるのを防止）
  isPulling.set(true)
  try {
    // 未保存の変更がある場合は確認（PWA強制終了後の再起動も考慮）
    if (get(isDirty) || getPersistedDirtyFlag()) {
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
          isPulling.set(false)
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
    const staleResult = await executeStaleCheck(get(settings), get(lastKnownCommitSha))

    switch (staleResult.status) {
      case 'up_to_date':
        // リモートに変更なし
        // ただし初回Pull（isPullCompleted=false）の場合はPullを続行してUI状態を正常化
        // 例: 空のリポジトリを新規に設定した場合
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
    // IndexedDBは単なるキャッシュであり、Pull成功時に全削除→全作成される
    // オフラインリーフは専用storeに保存されているため影響なし
    await clearAllData()
    notes.set([])
    leaves.set([])
    ctx.setLoadingLeafIds(new Set())
    ctx.resetLeafStats()
    leftNote.set(null)
    leftLeaf.set(null)
    rightNote.set(null)
    rightLeaf.set(null)

    const options: PullOptions = {
      // ノート構造確定時: ノートを表示可能に、スケルトン情報を設定、優先情報を計算して返す
      onStructure: (notesFromGitHub, metadataFromGitHub, leafSkeletons) => {
        // ノートを先に反映（ナビゲーション可能に）
        notes.set(notesFromGitHub)
        metadata.set(metadataFromGitHub)

        // スケルトン情報を保存（NoteViewでスケルトン表示に使用）
        ctx.setLeafSkeletonMap(new Map(leafSkeletons.map((s) => [s.id, s])))

        // 全リーフIDをローディング中として登録
        ctx.setLoadingLeafIds(new Set(leafSkeletons.map((s) => s.id)))

        // Pull進捗: 総リーフ数をセット
        pullProgressStore.start(leafSkeletons.length)

        // URLから優先情報を計算して返す
        return nav.getPriorityFromUrl(notesFromGitHub)
      },

      // 各リーフ取得完了時: leavesストアに追加、統計を更新、ベースラインに追加
      onLeaf: (leaf) => {
        leaves.update((current) => [...current, leaf])
        leafStatsStore.addLeaf(leaf.id, leaf.content)
        // Pull完了前でも到着済みリーフの行ダーティが正しく計算されるよう、ベースラインに追加
        addLeafToBaseline(leaf)
        const currentLoadingIds = ctx.getLoadingLeafIds()
        currentLoadingIds.delete(leaf.id)
        ctx.setLoadingLeafIds(new Set(currentLoadingIds)) // リアクティブ更新
        // Pull進捗: カウントアップ
        pullProgressStore.increment()
      },

      // 第1優先リーフ取得完了時: 作成・削除許可、ガラス効果解除、URL復元
      onPriorityComplete: () => {
        ctx.setIsFirstPriorityFetched(true)
        ctx.setIsLoadingUI(false) // ガラス効果を解除（残りのリーフはバックグラウンドで取得継続）

        // 初回Pull時のURL復元
        if (isInitialStartup) {
          ctx.setIsRestoringFromUrl(true)
          ctx.restoreStateFromUrl(true)
          ctx.setIsRestoringFromUrl(false)
        } else {
          ctx.restoreStateFromUrl(false)
        }
      },
    }

    const result = await executePull(get(settings), options)

    if (result.success) {
      // 全リーフ取得完了
      ctx.setIsPullCompleted(true)
      ctx.setSelectedIndexLeft(0)
      ctx.setSelectedIndexRight(0)

      // leavesストアはonLeafで逐次更新済みなので、最終的なソートのみ
      // ただし、Pull中にユーザーが編集したリーフのcontentは保持する
      const currentLeaves = get(leaves)
      const currentLeafMap = new Map(currentLeaves.map((l) => [l.id, l]))
      const sortedLeaves = result.leaves
        .sort((a, b) => a.order - b.order)
        .map((leaf) => {
          const currentLeaf = currentLeafMap.get(leaf.id)
          // ユーザーがPull中に編集した場合、編集内容を保持
          // （リモートのコンテンツと現在のコンテンツが異なる場合）
          if (currentLeaf && currentLeaf.content !== leaf.content) {
            return { ...leaf, content: currentLeaf.content }
          }
          return leaf
        })
      leaves.set(sortedLeaves)
      ctx.rebuildLeafStats(sortedLeaves, result.notes)

      // stale編集検出用にcommit SHAを記録
      if (result.commitSha) {
        lastKnownCommitSha.set(result.commitSha)
      }
      // 統計表示用にpushCountを記録
      lastPulledPushCount.set(result.metadata.pushCount)

      // Pull完了時の状態をスナップショットとして保存（差分検出のベースライン）
      // アーカイブはまだPull完了していない可能性があるので、その時点の状態を使用
      // 注意: setLastPushedSnapshot のベースラインは result（リモート）の内容。
      // sortedLeaves にはPull中のユーザー編集が保持されているため、
      // refreshDirtyState で差分を再検出する。
      setLastPushedSnapshot(result.notes, result.leaves, get(archiveNotes), get(archiveLeaves))

      // IndexedDBに保存
      saveNotes(result.notes).catch((err) => console.error('Failed to persist notes:', err))
      saveLeaves(sortedLeaves).catch((err) => console.error('Failed to persist leaves:', err))

      // ダーティフラグを再検出（Pull中のユーザー編集があれば残る、なければクリア）
      await tick()
      refreshDirtyState()
      isStale.set(false) // Pullしたのでstale状態を解除
    } else {
      // Pull失敗時の処理
      if (result.message === 'github.pullIncomplete') {
        // リーフ取得が不完全な場合は、UIをロック状態に戻す
        // これにより、不完全なデータでのPushによるデータ消失を防ぐ
        console.error('Pull incomplete: some leaves failed to fetch. UI remains locked.')
        ctx.setIsFirstPriorityFetched(false)
        ctx.setIsPullCompleted(false)
        // ストアをクリアして不完全なデータでのPushを防ぐ
        notes.set([])
        leaves.set([])
        // バックアップからの復元はしない（不完全な状態でのPushを防ぐため）
      } else if (hasBackupData) {
        // その他のPull失敗（ネットワークエラー等）: バックアップからデータを復元
        console.log('Pull failed, restoring from backup...')
        try {
          await restoreFromBackup(backup)
          // ストアにもバックアップデータを復元
          notes.set(backup.notes)
          leaves.set(backup.leaves)
          ctx.rebuildLeafStats(backup.leaves, backup.notes)
          // URLから状態を復元
          ctx.restoreStateFromUrl(false)
          ctx.setIsFirstPriorityFetched(true) // 操作可能にする
        } catch (restoreError) {
          console.error('Failed to restore from backup:', restoreError)
        }
      }
      // 初回Pull失敗時は静かに処理（設定未完了は正常な状態）
      // 2回目以降のPull失敗はトーストで通知される
    }

    // 結果を通知（GitHub APIのメッセージキーを翻訳）
    const translatedMessage = translateGitHubMessage(result.message, $_, result.rateLimitInfo)
    showPullToast(translatedMessage, result.variant)
    ctx.setIsLoadingUI(false)
    pullProgressStore.reset() // Pull進捗リセット
  } finally {
    isPulling.set(false)
  }
}
