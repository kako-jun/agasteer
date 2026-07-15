import { type Note, type Leaf } from '../types'
import {
  showPushToast,
  showPushCompletionToast,
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
  focusedPane,
  executeStaleCheck,
  setLastPushedSnapshot,
  refreshDirtyState,
  flushPendingSaves,
  flushAllEditors,
  getActiveEditorPane,
  tryRescueStalePush,
} from '../stores'
import { setPushInFlightAt } from '../data'
// fetchRemotePushCount は Push 成功後の lastPulledPushCount 更新（統計表示用）で
// 直接使うため残す。衝突ダイアログ内での pushCount/SHA 表示は showConflictDialog に集約済み。
import { executePush, translateGitHubMessage, canSync, fetchRemotePushCount } from '../api'
// #254: 添付フローの挿入フェーズ待ち（詳細は insert-phase.ts のモジュールコメント）
import { waitForPendingMediaInserts } from '../api/media/insert-phase'
import { isNoteSaveable, isLeafSaveable } from '../utils'
import { appState, appActions } from '../app-state.svelte'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { _ } from '../i18n'
// #204: Push タイムアウト定数は sync/constants.ts に集約（docs / 実装 / コメントの
// 数値発散を防ぐため）。AbortController を fetch 層まで通すコストは大きいので採らず、
// Promise.race による上限制御 + pushInFlightAt 経由の救済機構（applyStaleResult）に委ねる。
import { PUSH_TIMEOUT_MS } from '../sync/constants'
import { observeOrphanPush } from './git-orphan'
// push→pull は一方向の静的 import（push↔pull の循環を避けるため pull→push は
// appActions.pushToGitHub 経由の間接呼びで維持する）。
import { pullFromGitHub, runPendingRepoSyncIfIdle } from './git-pull'

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
