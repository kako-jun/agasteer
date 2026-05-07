import { get } from 'svelte/store'
import type { Settings, StaleCheckResult } from '../types'
import { fetchRemotePushCount } from '../api'
import { choiceAsync, type ChoiceOption } from '../ui'
import { PULL_ICON, PUSH_ICON } from '../ui/icons'
import { lastKnownCommitSha } from '../stores'
import { _ } from '../i18n'

/**
 * 衝突ダイアログの種別
 *
 * - `stale-push`: push 操作で stale を検知（手動 push / auto-push 共通）
 * - `pull-dirty`: pull 操作時にローカルが dirty（通常時の3択）
 * - `startup-dirty`: 起動時にローカルが dirty（push first を出さない）
 * - `push-hang`: Push ハング復旧後に状態が不明で 3 択判断が必要（#205）。
 *   ボタン配置・並びは `stale-push` と同じ（pullFirst primary / pushOverwrite secondary / cancel）。
 *   本文だけ「Push 応答が消失した」状況を伝えるメッセージに差し替える。
 */
export type ConflictDialogKind = 'stale-push' | 'pull-dirty' | 'startup-dirty' | 'push-hang'

export type ConflictDialogChoice = 'pull' | 'push' | 'cancel' | null

interface BaseParams {
  /**
   * stale 判定の結果。stale-push 経路では必須（リモート SHA を本文の診断情報に流用する）。
   * pull-dirty / startup-dirty でも、呼び出し側で stale 結果を持っている場合は渡すこと。
   * 未指定や `'stale'` 以外のときは remote SHA を `?` で表示する。
   */
  staleResult?: StaleCheckResult
  /** ローカル側の pushCount（メタデータの pushCount を渡す） */
  localPushCount: number
  /** リモート pushCount を取得するための GitHub 設定 */
  settings: Settings
}

/**
 * `disablePush: true` のとき、ヘルパーは push ボタンを生成しないため
 * 戻り値は `'pull' | 'cancel' | null` に絞られる（型レベルで保証）。
 */
export type ShowConflictDialogParams =
  | (BaseParams & { kind: 'stale-push' | 'pull-dirty' | 'push-hang'; disablePush?: false })
  | (BaseParams & { kind: 'startup-dirty'; disablePush: true })

interface DiagnosticValues extends Record<string, string | number> {
  localSha: string
  remoteSha: string
  localCount: number
  remoteCount: number | string
}

function shortSha(sha: string | null | undefined): string {
  if (!sha) return 'null'
  return sha.slice(0, 7)
}

function assertNever(x: never): never {
  throw new Error(`Unhandled ConflictDialogKind: ${String(x)}`)
}

async function buildDiagnostic(
  staleResult: StaleCheckResult | undefined,
  settings: Settings,
  localPushCount: number,
  $_: (key: string, options?: { values?: Record<string, unknown> }) => string
): Promise<string> {
  // 注意: 衝突ダイアログ表示のたびに fetchRemotePushCount を呼ぶ。
  // pull-dirty / startup-dirty 経路では本 PR (#200) で新たに発生する API 呼び出しだが、
  // 認証済み GitHub API は 5000 req/h なので、衝突確認頻度では実害なし。
  // rate-limit / ネットワークエラー時は '?' で表示にフォールバックする。
  const remotePushCountResult = await fetchRemotePushCount(settings)
  const remoteCount =
    remotePushCountResult.status === 'success' ? remotePushCountResult.pushCount : '?'

  let localSha: string
  let remoteSha: string
  if (staleResult && staleResult.status === 'stale') {
    localSha = shortSha(staleResult.localCommitSha)
    remoteSha = shortSha(staleResult.remoteCommitSha)
  } else {
    // pull-dirty / startup-dirty で staleResult が無い or 'stale' でない場合。
    // 手元で確実に分かる localCommitSha だけ表示し、remote は '?' とする。
    // remote SHA を別 API で改めて取りに行くのは無駄＆失敗時のフォールバックも増えるため避ける。
    localSha = shortSha(lastKnownCommitSha.value)
    remoteSha = '?'
  }

  const values: DiagnosticValues = {
    localSha,
    remoteSha,
    localCount: localPushCount,
    remoteCount,
  }
  return $_('modal.staleEditDiagnostic', { values })
}

function bodyKey(kind: ConflictDialogKind): string {
  switch (kind) {
    case 'stale-push':
      return 'modal.staleEdit'
    case 'pull-dirty':
      return 'modal.unsavedChangesChoice'
    case 'startup-dirty':
      return 'modal.unsavedChangesOnStartup'
    case 'push-hang':
      return 'modal.pushHangRecovery'
    default:
      return assertNever(kind)
  }
}

function buttonsFor(
  kind: ConflictDialogKind,
  disablePush: boolean,
  $_: (key: string) => string
): ChoiceOption[] {
  const cancel: ChoiceOption = { label: $_('modal.cancel'), value: 'cancel', variant: 'cancel' }

  // kind による pull/push のラベル違い:
  // - stale-push: 「リモートが新しい」状況。pull で取り込むのが安全な primary
  // - pull-dirty / startup-dirty: 「ローカルに未保存変更あり」。pull すると失う。
  //   pullOverwrite が primary（明示的な上書き選択）、pushFirst が secondary
  switch (kind) {
    case 'stale-push':
    case 'push-hang': {
      // push-hang は「Push 応答が消失して状態不明」の状況。
      // 安全側として「リモートの最新を取り込む（pull）」を primary に置き、
      // ローカル上書き（push）を secondary とする stale-push と同じ並びにする。
      const pull: ChoiceOption = {
        label: $_('modal.pullFirst'),
        value: 'pull',
        variant: 'primary',
        icon: PULL_ICON,
      }
      const push: ChoiceOption = {
        label: $_('modal.pushOverwrite'),
        value: 'push',
        variant: 'secondary',
        icon: PUSH_ICON,
      }
      return disablePush ? [pull, cancel] : [pull, push, cancel]
    }
    case 'pull-dirty':
    case 'startup-dirty': {
      const pull: ChoiceOption = {
        label: $_('modal.pullOverwrite'),
        value: 'pull',
        variant: 'primary',
        icon: PULL_ICON,
      }
      const push: ChoiceOption = {
        label: $_('modal.pushFirst'),
        value: 'push',
        variant: 'secondary',
        icon: PUSH_ICON,
      }
      return disablePush ? [pull, cancel] : [pull, push, cancel]
    }
    default:
      return assertNever(kind)
  }
}

/**
 * push/pull 衝突確認ダイアログを統一形で表示する。
 *
 * 全経路（手動 push stale / auto-push stale / pull dirty / 起動時 dirty）が
 * このヘルパー経由になるため、本文・ボタン文言・診断情報の表示揺れがなくなる。
 *
 * @returns ユーザーの選択。`cancel` または `null`（モーダル外クリック等）はキャンセル扱い。
 *   `disablePush: true` のときはオーバーロードにより戻り値から `'push'` が型レベルで除外される。
 */
export function showConflictDialog(
  params: BaseParams & { kind: 'startup-dirty'; disablePush: true }
): Promise<Exclude<ConflictDialogChoice, 'push'>>
export function showConflictDialog(
  params: BaseParams & { kind: 'stale-push' | 'pull-dirty' | 'push-hang'; disablePush?: false }
): Promise<ConflictDialogChoice>
export async function showConflictDialog(
  params: ShowConflictDialogParams
): Promise<ConflictDialogChoice> {
  const { kind, staleResult, localPushCount, settings } = params
  const disablePush = params.disablePush === true
  const $_ = get(_)

  const diagnostic = await buildDiagnostic(staleResult, settings, localPushCount, $_)
  const body = $_(bodyKey(kind)) + diagnostic
  const buttons = buttonsFor(kind, disablePush, $_)

  return (await choiceAsync(body, buttons)) as ConflictDialogChoice
}
