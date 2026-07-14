import { type Note, type Leaf, type StaleCheckResult, buildBlobShaCache } from '../types'
import type { PullOptions } from '../api'
import {
  showPushToast,
  showPushCompletionToast,
  showPullToast,
  showStickyPushToast,
  clearPushToast,
  setPushToastCountdown,
} from '../ui'
import { showConflictDialog } from './conflict-dialog'
import {
  settings,
  notes,
  leaves,
  metadata,
  isDirty,
  isPulling,
  isPushing,
  isPushingBackground,
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
  focusedPane,
  getPersistedDirtyFlag,
  executeStaleCheck,
  setLastPushedSnapshot,
  addLeafToBaseline,
  addNotesToBaseline,
  refreshDirtyState,
  flushPendingSaves,
  leafStatsStore,
  pullProgressStore,
  rehydrateForRepo,
  flushAllEditors,
  getActiveEditorPane,
  tryRescueStalePush,
} from '../stores'
import {
  clearAllData,
  createBackup,
  restoreFromBackup,
  saveNotes,
  saveLeaves,
  getPushInFlightAt,
  setPushInFlightAt,
} from '../data'
// fetchRemotePushCount は Push 成功後の lastPulledPushCount 更新（統計表示用）で
// 直接使うため残す。衝突ダイアログ内での pushCount/SHA 表示は showConflictDialog に集約済み。
import {
  executePush,
  executePull,
  testGitHubConnection,
  translateGitHubMessage,
  canSync,
  fetchRemotePushCount,
} from '../api'
import type { PushResult } from '../api'
// #254: 添付フローの挿入フェーズ待ち（詳細は insert-phase.ts のモジュールコメント）
import { waitForPendingMediaInserts } from '../api/media/insert-phase'
import { isNoteSaveable, isLeafSaveable } from '../utils'
import { appState, appActions } from '../app-state.svelte'
import * as nav from '../navigation'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { _ } from '../i18n'
import { runPendingRepoSyncIfIdle as runPendingRepoSyncIfIdleShared } from '../sync/repo-sync-queue'
// #204: Push タイムアウト定数は sync/constants.ts に集約（docs / 実装 / コメントの
// 数値発散を防ぐため）。AbortController を fetch 層まで通すコストは大きいので採らず、
// Promise.race による上限制御 + pushInFlightAt 経由の救済機構（applyStaleResult）に委ねる。
import { PUSH_TIMEOUT_MS } from '../sync/constants'

class PushTimeoutError extends Error {
  constructor() {
    super('PUSH_TIMEOUT')
    this.name = 'PushTimeoutError'
  }
}

/**
 * #238: Push 進捗コールバックの世代カウンタ。
 *
 * タイムアウトで見送った orphan Push（observeOrphanPush 参照）は裏で
 * fetch チェーンが生き続けるため、遅延した onProgress が次の Push の
 * カウントダウン表示を乱し得る（例: 新 Push が「5」の最中に orphan の
 * 「3」が届いて 5→3 に飛ぶ）。executePush を起動するたびに世代を進め、
 * 最新世代のコールバックだけをトーストに反映する。
 */
let pushProgressGeneration = 0

/**
 * #235: タイムアウトで UI をあきらめた後の orphan Push を観測する。
 *
 * タイムアウト（PUSH_TIMEOUT_MS）後も executePush の fetch チェーンは生きて
 * おり、遅れて完走すると古い HEAD を parent にしたコミットで ref を force 更新
 * する（= その間に別 Push が成功していてもリモートを上書きする）。従来はこの
 * 結果を誰も観測しなかったため、
 *   - 遅延成功: リモート HEAD が orphan のコミットになったのに
 *     lastKnownCommitSha は更新されず、pushInFlightAt も後続 Push の応答時に
 *     消されるため、以降の stale check が毎回 stale になり衝突ダイアログが
 *     出続けた（#235 の主症状）
 *   - 遅延失敗: 誰も catch せず unhandledrejection
 * という2つの穴があった。settle した瞬間に結果を反映して塞ぐ。
 *
 * 遅延成功時の SHA 追従は 2 段階で判定する:
 * - pushInFlightAt スロットが自分の stamp のまま = 後続 Push は挟まっていない。
 *   settle した瞬間のリモート HEAD はこのコミット（force 更新済み）なので
 *   そのまま追従してよい（通常ケース）
 * - スロットが別値/空 = 後続 Push が挟まった兆候。settle 順 ≠ ref 更新順が
 *   あり得る（orphan の ref 更新 → 後続 Push B 成功 → orphan のレスポンス到着、
 *   の順だと盲目追従で lastKnownCommitSha が shaB → shaA に逆流し偽 stale が出る）
 *   ため盲目追従せず、stale check を 1 回走らせて実リモート HEAD を確認し、
 *   それが自分の orphan コミットと確認できた場合のみ揃える
 *
 * pushInFlightAt は「自分が設定した値のままの場合だけ」クリアする。後続の
 * Push が新しい値を設定していた場合、それはその Push の救済マーカーなので
 * 触らない（このガードがあるため、pushToGitHub 本体側の set / clear は
 * orphan と競合しない）。
 *
 * リポ一致ガード: getPushInFlightAt / setPushInFlightAt / lastKnownCommitSha /
 * isStale はすべて「現在リポ」のスロットを対象とする（storage.ts の
 * currentRepoKey() は settings.repoName 基準）。タイムアウト後は UI ロックが
 * 解放されるため、settle 前にユーザーがリポを切り替え得る。そのまま書き込むと
 * 切替後の**新リポ**の同期状態に旧リポの SHA を混入させてしまうので、settle 時に
 * リポが変わっていたら warn ログのみで全書き込み（SHA・isStale・トースト・
 * フラグ）をスキップする。旧リポ側の pushInFlightAt は残るため、旧リポに
 * 戻ったときの stale check で tryRescueStalePush が救済する（「2段構えの保険」の
 * 第2段がそのまま効く）。
 */
function observeOrphanPush(pushPromise: Promise<PushResult>, inFlightStamp: number): void {
  // リポ一致ガード用: タイムアウト時点のリポ識別子を控える
  // （storage.ts の currentRepoKey() と同じ settings.repoName 基準）
  const repoNameAtTimeout = settings.value.repoName
  const isRepoSwitched = () => settings.value.repoName !== repoNameAtTimeout
  const warnRepoSwitched = () =>
    console.warn(
      `Orphan push settled after repo switch (${repoNameAtTimeout} -> ${settings.value.repoName}); skipping all state updates`
    )
  const clearOwnInFlightFlag = () => {
    if (getPushInFlightAt() === inFlightStamp) {
      setPushInFlightAt(undefined)
    }
  }
  pushPromise.then(
    async (lateResult) => {
      if (isRepoSwitched()) {
        warnRepoSwitched()
        return
      }
      if (lateResult.success && lateResult.commitSha) {
        if (getPushInFlightAt() === inFlightStamp) {
          // スロットが自分の stamp のまま → 後続 Push なし。リモート HEAD は
          // このコミットで確定しているので追従する
          console.log(
            `Orphan push settled successfully after timeout; updating lastKnownCommitSha to ${lateResult.commitSha}`
          )
          lastKnownCommitSha.value = lateResult.commitSha
          isStale.value = false
          if (isPushing.value || isPushingBackground.value) {
            // 別 Push が進行中: その sticky トースト（toast.pushInProgress）を
            // 成功トーストで消してしまわないよう、通知はログに留める（SHA 反映は実施済み）
            console.log('Orphan push late-success toast suppressed: another push is in progress')
          } else {
            // タイムアウト時の「応答が途切れました」トーストを上書きして成功を通知
            showPushCompletionToast(get(_)('toast.pushLateSuccess'), 'success')
          }
        } else {
          // スロットが別値/空 → 後続 Push が挟まった兆候。盲目追従すると
          // SHA が逆流し得るため、実リモート HEAD を 1 回確認して揃える
          console.log(
            'Orphan push settled successfully but another push intervened; verifying remote HEAD instead of blindly following'
          )
          try {
            const check = await executeStaleCheck(settings.value, lastKnownCommitSha.value)
            // await 中にリポが切り替わった可能性を再チェック（M1 と同じ理由）
            if (isRepoSwitched()) {
              warnRepoSwitched()
              return
            }
            if (check.status === 'stale' && check.remoteCommitSha === lateResult.commitSha) {
              // align は「リモート HEAD が自分の送ったコミット」と確認できた場合のみ。
              // 第三者（別デバイス）のコミットに揃えると真正な divergence を隠し、
              // 次の Push が無警告上書きになる。一致しない stale は通常の stale
              // フロー（次回の定期チェック → ダイアログ）に委ねる。
              // （up_to_date なら既に整合。check_failed は次回の定期チェックに委ねる）
              console.log(
                `Orphan push verification: remote HEAD matches orphan commit; aligning lastKnownCommitSha to ${check.remoteCommitSha}`
              )
              lastKnownCommitSha.value = check.remoteCommitSha
            }
          } catch (checkError) {
            // 検証失敗は握りつぶし、次回の定期 stale check に委ねる
            console.warn('Orphan push verification stale check failed:', checkError)
          }
        }
      } else {
        // 遅延失敗（エラー結果で resolve）: フラグを残すと次の stale check が
        // 「Push 成功」と誤認して SHA を追従（救済）してしまうためクリアする
        console.warn('Orphan push settled with failure after timeout:', lateResult.message)
      }
      clearOwnInFlightFlag()
    },
    (e) => {
      if (isRepoSwitched()) {
        warnRepoSwitched()
        return
      }
      // 遅延 reject: unhandledrejection の解消も兼ねる
      console.warn('Orphan push rejected after timeout:', e)
      clearOwnInFlightFlag()
    }
  )
}

async function runPendingRepoSyncIfIdle(): Promise<void> {
  const hasValidConfig = !!(settings.value.token && settings.value.repoName)
  await runPendingRepoSyncIfIdleShared(
    {
      isPulling: isPulling.value,
      // #206: 背景 Push 中も busy として扱う
      isPushing: isPushing.value || isPushingBackground.value,
      isArchiveLoading: appState.isArchiveLoading,
    },
    hasValidConfig,
    appState.pendingRepoSync,
    () => {
      appState.pendingRepoSync = false
    },
    async () => {
      // 同期中にリポ切替された場合、予約pull開始前に新リポへ rehydrate する
      // （旧 DB に新リポの pull 結果が書かれるのを防ぐ）
      const pendingRehydrate = appState.pendingRehydrateRepo
      if (pendingRehydrate) {
        appState.pendingRehydrateRepo = null
        try {
          await rehydrateForRepo(pendingRehydrate)
        } catch (error) {
          console.error('Failed to rehydrate stores before queued pull:', error)
        }
      }
      await pullFromGitHub(false)
    }
  )
}

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
 * pushToGitHub のオプション（#235）
 */
export interface PushToGitHubOptions {
  /**
   * stale check が check_failed（ネットワーク断・認証エラー等で判定不能）の
   * とき Push を中止する。
   *
   * 手動 Push（既定 false）は「ユーザーが押した」意思を尊重してそのまま
   * 続行するが、auto-push は無人発火なので中止し、オフライン中に 42 秒ごとの
   * エラートースト連発になるのを防ぐ（自前 stale check を preflight に
   * 一本化した後も、旧来の「check_failed は静かにスキップ」挙動を維持する）。
   */
  abortIfStaleCheckFailed?: boolean
}

/**
 * GitHubにPush（統合版）
 * すべてのPush処理がこの1つの関数を通る
 *
 * #206: 2 段階構成
 *   1. preflight phase（同期的・UI ロック）: IME flush / 自動保存 flush / stale check /
 *      競合ダイアログ。`isPushing=true` の間だけ PaneView のガラス効果オーバーレイが出て
 *      編集不可になる。
 *   2. background phase: stale check を通過した時点で送信用 snapshot を deep copy で
 *      固定し、`isPushing=false` / `isPushingBackground=true` に切り替える。これ以降は
 *      編集可能だが、追加の Push / Pull は canSync で禁止される。
 *
 *   成功時のベースライン更新は **固定 snapshot** に対して行うため、Push 中の追記は
 *   refreshDirtyState() で再検出され dirty として残る。
 */
export async function pushToGitHub(options?: PushToGitHubOptions): Promise<void> {
  const $_ = get(_)
  const paneToRefocus = getActiveEditorPane() ?? focusedPane.value

  // 交通整理: Push不可なら何もしない（アーカイブロード中も禁止）
  if (
    !canSync(isPulling.value, isPushing.value, isPushingBackground.value).canPush ||
    appState.isArchiveLoading
  )
    return

  // 即座にロック取得（この後の非同期処理中にPullが開始されるのを防止）
  // 不変条件: ロック取得は canSync 直後・全 await の前に行う。
  // この前に await を挟むと、その隙に別の push/pull が canSync を通過して
  // しまう競合窓ができる（過去に flushPendingSaves をロック前に置いていた
  // ことで発生したリグレッションと同じクラスのバグ）。
  isPushing.value = true

  // ====================================================================
  // Phase 1: preflight — UI ロックを保持したまま IME flush / stale check
  // ====================================================================
  // 送信用 snapshot を保持する変数。preflight 通過時に deep copy で固定する。
  let snapshot: {
    notes: Note[]
    leaves: Leaf[]
    metadata: typeof metadata.value
    archiveNotes: Note[] | undefined
    archiveLeaves: Leaf[] | undefined
    archiveMetadata: typeof archiveMetadata.value | undefined
  } | null = null
  // #235: この Push が setPushInFlightAt に設定した値（Phase 2 とorphan 観測で参照）
  let pushInFlightStamp = 0

  try {
    // #254: メディア添付の挿入フェーズ（最適化＋enqueue の後に走る記法挿入）が
    // 進行中なら、それが store に着地するまで待つ。待たないと、添付直後の Push が
    // 挿入前の内容をスナップショットに固定して「変更なし」で no-op になり、
    // アップロード済みメディアへの参照テキストだけがリポに保存されない窓ができる
    //（次回 Pull で参照が消えるとメディアが孤児化する）。モバイルの画像最適化は
    // 数百 ms〜数秒かかるため実機で顕在化していた。上限つき（ストール時は従来挙動）。
    // flushAllEditors より前に置く: 挿入が IME composition 中に着地した場合も、
    // 後段の flush が store へ確実に反映する。
    await waitForPendingMediaInserts()
    // #186: IME composition 確定前に push が押されると、MarkdownEditor 側の
    // pendingCompositionChange が立ったまま onChange が呼ばれず、leaves.value
    // が IME 確定前の古い content のまま push されてしまう（Android で特に
    // 顕著）。全エディタに composition flush を促し、tick() で Svelte の
    // reactive 更新（dirty line 用の $effect 等）を 1 サイクル待つ。
    // ロック取得後に置くことで、待機中の競合を防ぐ。
    flushAllEditors()
    await tick()
    // 保留中の自動保存を即座に実行してからPush
    await flushPendingSaves()

    // Stale編集かどうかチェック（共通関数で時刻も更新）
    const staleResult = await executeStaleCheck(settings.value, lastKnownCommitSha.value)

    // #235: 無人発火（auto-push）経路では、判定不能のまま Push を強行しない
    if (staleResult.status === 'check_failed' && options?.abortIfStaleCheckFailed) {
      console.warn('Push aborted: stale check failed', staleResult.reason)
      return
    }

    if (staleResult.status === 'stale') {
      // #235: まず push-in-flight 救済を試す。タイムアウトで応答を見送った Push
      // （orphan）が実は成功していた場合、この stale は誤検出（リモート HEAD は
      // 自分が送ったコミット）なので、ダイアログを出さずに Push を続行する。
      // 救済時は lastKnownCommitSha がリモートに揃っており、executePush は
      // 最新 HEAD を parent に読み直すため安全。
      if (!tryRescueStalePush(staleResult, 'Push preflight')) {
        // リモートに新しい変更あり → 確認ダイアログを表示
        isStale.value = true
        console.log(
          `Push blocked: remote(${staleResult.remoteCommitSha}) !== local(${staleResult.localCommitSha})`
        )
        // 診断情報（ローカル/リモートのpushCount・SHA）はヘルパー側で付与される
        const choice = await showConflictDialog({
          kind: 'stale-push',
          staleResult,
          localPushCount: metadata.value.pushCount,
          settings: settings.value,
        })

        if (choice === 'pull') {
          // Pull first: isPushingロックを解放してPull→Push
          isPushing.value = false
          await pullFromGitHub(false)
          // Pull後に再度Push（再帰呼び出し）
          // options（abortIfStaleCheckFailed）を引き継がないのは意図的: ダイアログを操作した時点で有人操作なので、再Pushは手動Push相当の既定値で続行する（#235）
          return appActions.pushToGitHub()
        } else if (choice === 'cancel' || choice === null) {
          return
        }
        // choice === 'push' → 続行（上書き）
      }
    }
    // check_failedやup_to_dateの場合はそのまま続行

    // ★ #206: preflight 通過 → 送信用 snapshot を deep copy で固定する。
    // これ以降に live state（notes / leaves など）を編集しても、送信内容と
    // ベースライン更新には影響しない。構造的変更（追加・削除・並べ替え）も保護される。
    const $notes = notes.value
    const $leaves = leaves.value
    const saveableNotes = $notes.filter((n) => isNoteSaveable(n))
    const saveableLeaves = $leaves.filter((l) => isLeafSaveable(l, saveableNotes))
    // #206: deep clone で固定する。
    // Svelte 5 の $state proxy（および将来 reactive な何かが混入したケース）は
    // structuredClone が DataCloneError を投げる経路があるため、JSON 経由で
    // plain object 化する。Note / Leaf / metadata はすべてシリアライズ可能な
    // 純粋データなのでこのパターンで問題ない（setLastPushedSnapshot が同じ手法）。
    const deepClone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
    snapshot = {
      notes: deepClone(saveableNotes),
      leaves: deepClone(saveableLeaves),
      metadata: deepClone(metadata.value),
      archiveNotes: isArchiveLoaded.value ? deepClone(archiveNotes.value) : undefined,
      archiveLeaves: isArchiveLoaded.value ? deepClone(archiveLeaves.value) : undefined,
      archiveMetadata: isArchiveLoaded.value ? deepClone(archiveMetadata.value) : undefined,
    }

    // Push開始を通知
    showPushToast($_('loading.pushing'))

    // Push飛行中フラグを設定（スリープによるレスポンス消失検出用）
    // #235: 値を控えておき、orphan 継続処理（observeOrphanPush）や応答後の
    // クリアが「自分の設定した値」を対象にしていることを識別できるようにする。
    // ストレージはリポごと 1 スロットのため、先行 Push が orphan のまま
    // ここで上書きされ得るが、in-page の orphan は observeOrphanPush が
    // 直接観測するので救済マーカーの喪失にはならない。
    pushInFlightStamp = Date.now()
    setPushInFlightAt(pushInFlightStamp)

    // ★ #206: ここで preflight phase を終了し UI ロックを解除する。
    // background phase は finally の外で実行する（編集再開のため）。
    // 順序が重要: 先に isPushingBackground を true にしてから isPushing を false に
    // することで、両方 false になる瞬間（_canPush $derived が一瞬 true → 別 Push 受付）
    // のレース窓を作らない。
    isPushingBackground.value = true
    // #224: 送信中はアプリ切替/終了を避けるよう sticky トーストで促す（完了トーストで差し替わる）。
    // ロックフラグを触らず await もしないので、上の「両方 false の瞬間を作らない」順序制約には抵触しない。
    showStickyPushToast($_('toast.pushInProgress'))
    isPushing.value = false
    await tick()
    appActions.getEditorView(paneToRefocus)?.focusEditor?.()
  } finally {
    // preflight phase 終了時、snapshot が設定できなかった経路（cancel / pull-first / 例外）
    // では isPushing が true のまま残るので必ず false に戻す。
    // snapshot が設定できた経路では既に false に切り替え済みなので no-op。
    if (snapshot === null) {
      isPushing.value = false
      await runPendingRepoSyncIfIdle()
    }
  }

  // snapshot が null（cancel / pull-first / 例外）ならここで終了
  if (snapshot === null) return

  // ====================================================================
  // Phase 2: background — UI は編集可能、送信は裏で続ける
  // ====================================================================
  try {
    // #204: Push 全体に 30 秒のタイムアウトを設ける。Promise.race の loser 側
    // （setTimeout）はタイムアウト未発火なら clearTimeout でクリーンアップする
    // （タイマーがイベントループに残らないように）。
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let timeoutFired = false
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        timeoutFired = true
        reject(new PushTimeoutError())
      }, PUSH_TIMEOUT_MS)
    })
    // #238: この Push の進捗だけをカウントダウンに反映する（世代ガード）。
    // 表示のリセットは showStickyPushToast（トースト再表示）側で済んでいる
    const myProgressGeneration = ++pushProgressGeneration
    // #235: race に負けても（タイムアウトしても）observeOrphanPush で
    // 結果を観測するため、executePush の Promise を単独で保持する
    const pushPromise = executePush({
      // ★ live state ではなく固定済み snapshot を渡す（#206）
      leaves: snapshot.leaves,
      notes: snapshot.notes,
      // settings.value / isFirstPriorityFetched は preflight 通過時点から
      // 変わらないことが canSync / pendingRehydrateRepo キューで保証されている
      // ため live 参照で OK。snapshot に含めても等価。
      settings: settings.value,
      isOperationsLocked: !appState.isFirstPriorityFetched,
      localMetadata: snapshot.metadata,
      // アーカイブがロード済みの場合のみアーカイブデータを渡す
      archiveLeaves: snapshot.archiveLeaves,
      archiveNotes: snapshot.archiveNotes,
      archiveMetadata: snapshot.archiveMetadata,
      isArchiveLoaded: isArchiveLoaded.value,
      // #238: 残りステージ数（5→1）を sticky トーストのカウントダウンに配線。
      // setPushToastCountdown 側に単調減少ガードがあり、加えて世代ガードで
      // orphan Push の遅延コールバックを弾く
      onProgress: (remainingStages) => {
        if (myProgressGeneration === pushProgressGeneration) {
          setPushToastCountdown(remainingStages)
        }
      },
    })
    let result
    try {
      result = await Promise.race([pushPromise, timeoutPromise])
    } catch (e) {
      if (timeoutFired || e instanceof PushTimeoutError) {
        // #204: タイムアウト時は isPushingBackground を finally で false に戻し
        // 別 Push / Pull のロックを解除する。pushInFlightAt は意図的に残す:
        // orphan になった executePush が裏で成功した場合、observeOrphanPush が
        // settle 時に SHA を追従させる。ページリロード等で continuation ごと
        // 消えた場合の保険として、次回 stale check の tryRescueStalePush
        // （applyStaleResult / preflight）でも救済される。
        console.warn('Push response timed out after', PUSH_TIMEOUT_MS, 'ms; releasing UI lock')
        showPushCompletionToast(
          translateGitHubMessage('toast.pushTimeout', $_, undefined, undefined, 'E-5101'),
          'error'
        )
        // #238: この Push の onProgress を無効化する。orphan の fetch チェーンは
        // 裏で生き続けるため、放置するとタイムアウトのエラートーストの下に
        // 遅延カウントダウンが描かれてしまう
        pushProgressGeneration++
        // #235: orphan の遅延結果（成功 → SHA 追従＋トースト / 失敗 → フラグ解除）を観測
        observeOrphanPush(pushPromise, pushInFlightStamp)
        return
      }
      // 通常の HTTP 4xx/5xx 等の reject: pushInFlightAt は確実にクリアしてから rethrow。
      // クリアしないと次回 visibility resume で pushHangRecovered=true が誤発火する（#204）。
      // #235: ここに到達するのは race がタイムアウト以外で決着した場合のみで、
      // Push は同時に 1 本しか走らず orphan 継続処理はフラグを set しない
      // （guarded clear のみ）ため、この時点のスロットは自分の値か undefined。
      // 無条件クリアで他者の救済マーカーを壊すことはない。
      setPushInFlightAt(undefined)
      // #224: throw で抜ける経路では完了トーストが出ないため sticky を明示的に消す
      clearPushToast()
      throw e
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }

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
    showPushCompletionToast(translatedMessage, result.variant)

    // Push飛行中フラグをクリア（レスポンスを受信できた）
    // #235: タイムアウト経路は上で return 済みなので、ここに来た時点で
    // スロットは自分の値か undefined（rethrow 経路のコメント参照）。
    setPushInFlightAt(undefined)

    // Push成功時の後処理
    if (result.variant === 'success') {
      // commit SHAはリモートHEADの外的事実なので、noChangesでも常に更新する。
      // noChangesで更新しないと、lastKnownCommitShaがドリフトして次回のstaleチェックで
      // 誤検出（pull/push選択ダイアログの誤表示）につながる。
      if (result.commitSha) {
        lastKnownCommitSha.value = result.commitSha
        isStale.value = false
      }

      // スナップショット更新は実際にPushしたときだけ行う。
      // noChangesで更新すると、executePushをawaitしている間にユーザーが加えた編集が
      // ベースラインに吸収されてダーティ追跡から消える（データ損失リスク）。
      // 参照: docs/development/sync/stale-detection.md
      if (result.message !== 'github.noChanges') {
        // ★ #206: ベースラインは「Push 開始時に固定した snapshot」で更新する。
        // live state（notes.value 等）を渡すと、Push 中にユーザーが書いた追記が
        // ベースラインに吸収されて dirty が消える（データ損失リスク）。
        // archive 系は snapshot に含まれない（= isArchiveLoaded=false の経路）なら
        // undefined を渡し、setLastPushedSnapshot 側のガードで no-op にする。
        // live state へフォールバックすると、Phase 2 中に archive がアンロードされた
        // 場合に空配列でベースラインを上書きしてしまう（archive 全件 dirty 化リスク）。
        setLastPushedSnapshot(
          snapshot.notes,
          snapshot.leaves,
          snapshot.archiveNotes,
          snapshot.archiveLeaves
        )
        // ★ #206: clearAllChanges() ではなく refreshDirtyState() を使う。
        // 固定 snapshot との差分を再計算するので、Push 中の追記は dirty として残り、
        // Push 開始前から残っていた変更だけが clean になる。
        refreshDirtyState()
        lastPushTime.value = Date.now() // 自動Push用に最終Push時刻を記録
        // Push成功後にリモートから最新のpushCountを取得して更新（統計表示用）
        const remoteResult = await fetchRemotePushCount(settings.value)
        if (remoteResult.status === 'success') {
          lastPulledPushCount.value = remoteResult.pushCount
        }
      }
    }
  } finally {
    isPushingBackground.value = false
    // runPendingRepoSyncIfIdle は preflight finally でも呼ぶため、pull-first 再帰経路では
    // 計 3 回発火するが、内部 idle 判定で no-op になるため冪等。
    await runPendingRepoSyncIfIdle()
  }
}

/**
 * Pull処理の統合関数
 *
 * @param isInitialStartup - 起動時の初回 Pull か
 * @param onCancel - Pull キャンセル時のフォールバック処理
 * @param precomputedStale - 呼び出し元で既に実行した stale check の結果。
 *   指定した場合は内部で再取得せずそれを使う（#158: app-state の起動時
 *   スキップ判定で先行実行した結果を流用し、GitHub Refs API の二重呼び出しを避ける）。
 *   **注意**: 鮮度は検証しない。**この関数呼び出しの直前**に取得した結果だけを渡すこと。
 *   古い結果を渡すと、その間にリモートが進んでいても up_to_date と判定してしまう。
 */
export async function pullFromGitHub(
  isInitialStartup = false,
  onCancel?: () => void | Promise<void>,
  precomputedStale?: StaleCheckResult
): Promise<void> {
  const $_ = get(_)

  // 交通整理: Pull/Push中またはアーカイブロード中は不可
  if (
    !canSync(isPulling.value, isPushing.value, isPushingBackground.value).canPull ||
    appState.isArchiveLoading
  )
    return

  // 即座にロック取得（この後の非同期処理中にPushが開始されるのを防止）
  isPulling.value = true
  // #147 綻び2: この Pull がリポ切替起因かを、直後にフラグが落ちる前に控える。
  // repoChangePending は handleSettingsChange の repo 切替検知でのみ true になり、
  // 通常 pull（F5・同期・deep-link 復元・起動時）では false のため、この控えは
  // 「リポ切替による pull かどうか」を安全に表す（下のスクロール残骸リセット判定に使う）。
  const isRepoSwitchPull = appState.repoChangePending
  // pull開始と同時に「pull予約あり」バッジを落とす（進捗%に交代）
  appState.repoChangePending = false
  try {
    // #254: Push 側と同じ理由の待ち。挿入フェーズ着地前に Pull が走ると、
    // isDirty が挿入前の状態で評価されて dirty 警告を素通りし、Pull の
    // クリア＆再取得で挿入テキストが消える（メディア参照の喪失＝孤児化）。
    await waitForPendingMediaInserts()
    // #254: 挿入が IME composition 中に着地した場合、エディタの updateListener は
    // onChange を保留する（#186 と同じ機構）ため、store（leaves.value / isDirty）は
    // 挿入前のまま。Push 側と同様に flush + tick してから下の isDirty 判定に進まないと、
    // dirty 警告を素通りして Pull の上書きで挿入テキストが消える。
    flushAllEditors()
    await tick()
    // Staleチェックを先に行う。
    // リモートに変更がない（= 実際のPullが走らない）場合にまで
    // 「未保存の変更があります。Pullすると上書きされます」系の警告を出すと、
    // インポート直後（ローカルはリモートと同一commitのまま、配下データだけ増えた
    // 状態）の設定クローズなど「ローカル先行」状態でも誤った stale 警告
    // が出てしまうため（#152）。
    const staleResult =
      precomputedStale ?? (await executeStaleCheck(settings.value, lastKnownCommitSha.value))

    // リモートに変更なし & Pull完了済み → 実Pullは走らないので dirty 警告も不要
    if (staleResult.status === 'up_to_date' && appState.isPullCompleted) {
      showPullToast($_('github.noRemoteChanges'), 'success')
      return
    }

    // 未保存の変更がある場合は確認（PWA強制終了後の再起動も考慮）
    // ここから先は実際にPullが走る可能性があるパスのみ
    if (isDirty.value || getPersistedDirtyFlag()) {
      if (isInitialStartup) {
        // 起動時: push first は選べない（まだPullしていないため disablePush=true）。
        // 共通ヘルパー経由で他経路と本文・診断情報を統一する（#201）。
        // disablePush=true により戻り値から 'push' が型レベルで除外される。
        // staleResult は precomputedStale 経由で「やや古い」値が来る可能性があるが、
        // 影響は本文 SHA の表示のみ（判定ロジックには使わない）ため受容範囲。
        const choice = await showConflictDialog({
          kind: 'startup-dirty',
          staleResult,
          localPushCount: metadata.value.pushCount,
          settings: settings.value,
          disablePush: true,
        })
        if (choice !== 'pull') {
          await onCancel?.()
          return
        }
      } else {
        // 通常時: Push first / Pull (overwrite) / Cancel の3択
        const choice = await showConflictDialog({
          kind: 'pull-dirty',
          staleResult,
          localPushCount: metadata.value.pushCount,
          settings: settings.value,
        })

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

    switch (staleResult.status) {
      case 'up_to_date':
        // リモートに変更なし（初回Pull前のみここに到達。実Pull処理を続行して初期化）
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

      // #147 綻び2: リポ切替起因の Pull のときだけ、旧リポの一覧で残った
      // スクロール位置をリセットする。home→home では HomeView が remount されず
      // .main-pane の scrollTop が残るため。selectedIndex=0 は全 pull 成功で走るが、
      // scroll リセットは切替時に限定する（通常 pull で発火すると deep-link 復元時に
      // スクロールが飛ぶデグレになる）。.main-pane の参照は app-state.svelte.ts の
      // PWA 復帰レイアウト修復と同じ .left-column/.right-column 配下セレクタに合わせる。
      if (isRepoSwitchPull) {
        await tick()
        document
          .querySelectorAll('.left-column .main-pane, .right-column .main-pane')
          .forEach((el) => {
            ;(el as HTMLElement).scrollTop = 0
          })
      }

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

      // #207: Pull 成功パスでも save を await する。await しないと、Pull 直後にタブが
      // 閉じる / リロードされる経路で次回 createBackup() が空 IndexedDB を読み、
      // blobSha キャッシュが効かなくなる（pullIncomplete 経路と同じクラスの事故）。
      // 一方が失敗しても他方は続行できるように Promise.allSettled で握る。
      const [notesResult, leavesResult] = await Promise.allSettled([
        saveNotes(result.notes),
        saveLeaves(sortedLeaves),
      ])
      if (notesResult.status === 'rejected') {
        console.error('Failed to persist notes:', notesResult.reason)
      }
      if (leavesResult.status === 'rejected') {
        console.error('Failed to persist leaves:', leavesResult.reason)
      }

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
        // #207: await して完了を待ってからこのPullサイクルを閉じる。
        //   await しないと、次回 Pull の createBackup() が空のIndexedDBを読んでしまい、
        //   blobSha キャッシュが効かず毎回ゼロから再取得する事故が起きる。
        const partialLeaves = leaves.value
        const partialNotes = notes.value
        if (partialLeaves.length > 0 || partialNotes.length > 0) {
          if (partialLeaves.length > 0) {
            console.log(
              `Saving ${partialLeaves.length} partial leaves to IndexedDB for next pull cache`
            )
          }
          try {
            await Promise.all([
              partialLeaves.length > 0 ? saveLeaves(partialLeaves) : Promise.resolve(),
              partialNotes.length > 0 ? saveNotes(partialNotes) : Promise.resolve(),
            ])
          } catch (err) {
            console.error('Failed to persist partial pull cache:', err)
            // 救済できなくても続行。次回 Pull で再試行される。
          }
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
    await runPendingRepoSyncIfIdle()
  }
}
