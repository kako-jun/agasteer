import { get } from 'svelte/store'
import { _ } from 'svelte-i18n'
import type { Settings, StaleCheckResult } from '../types'
import { fetchRemotePushCount } from '../api'
import { choiceAsync } from '../ui'
import { PULL_ICON, PUSH_ICON } from '../ui/icons'
import { lastKnownCommitSha } from '../stores'

/**
 * 衝突ダイアログの種別
 *
 * - `stale-push`: push 操作で stale を検知（手動 push / auto-push 共通）
 * - `pull-dirty`: pull 操作時にローカルが dirty（通常時の3択）
 * - `startup-dirty`: 起動時にローカルが dirty（push first を出さない）
 */
export type ConflictDialogKind = 'stale-push' | 'pull-dirty' | 'startup-dirty'

export type ConflictDialogChoice = 'pull' | 'push' | 'cancel' | null

export interface ShowConflictDialogParams {
  kind: ConflictDialogKind
  /** stale-push の場合に必須。SHA を本文の診断情報に流用する */
  staleResult?: StaleCheckResult
  /** ローカル側の pushCount（メタデータの pushCount を渡す） */
  localPushCount: number | string
  /** リモート pushCount を取得するための GitHub 設定 */
  settings: Settings
  /**
   * push first を選ばせない場合 true（起動時の startup-dirty 経路で使う）。
   * true のときボタンは pull / cancel の 2 択になる。
   */
  disablePush?: boolean
}

interface DiagnosticValues {
  localSha: string
  remoteSha: string
  localCount: number | string
  remoteCount: number | string
}

function shortSha(sha: string | null | undefined): string {
  if (!sha) return 'null'
  return sha.slice(0, 7)
}

async function buildDiagnostic(
  staleResult: StaleCheckResult | undefined,
  settings: Settings,
  localPushCount: number | string,
  $_: (key: string, options?: { values?: Record<string, unknown> }) => string
): Promise<string> {
  const remotePushCountResult = await fetchRemotePushCount(settings)
  const remoteCount =
    remotePushCountResult.status === 'success' ? remotePushCountResult.pushCount : '?'

  let localSha: string
  let remoteSha: string
  if (staleResult && staleResult.status === 'stale') {
    localSha = shortSha(staleResult.localCommitSha)
    remoteSha = shortSha(staleResult.remoteCommitSha)
  } else {
    // pull-dirty / startup-dirty 経路: stale 結果がない or stale でない。
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
  return $_('modal.staleEditDiagnostic', { values: values as unknown as Record<string, unknown> })
}

function bodyKey(kind: ConflictDialogKind): string {
  switch (kind) {
    case 'stale-push':
      return 'modal.staleEdit'
    case 'pull-dirty':
      return 'modal.unsavedChangesChoice'
    case 'startup-dirty':
      return 'modal.unsavedChangesOnStartup'
  }
}

interface DialogButton {
  label: string
  value: 'pull' | 'push' | 'cancel'
  variant: 'primary' | 'secondary' | 'cancel'
  icon?: string
}

function buttonsFor(
  kind: ConflictDialogKind,
  disablePush: boolean,
  $_: (key: string) => string
): DialogButton[] {
  const cancel: DialogButton = { label: $_('modal.cancel'), value: 'cancel', variant: 'cancel' }

  // stale-push: 「リモートが新しい」状況。pull で取り込むのが安全な primary。
  // pull-dirty / startup-dirty: 「ローカルに未保存変更あり」。pull すると失う。
  //   pullOverwrite が primary（明示的な上書き選択）、pushFirst が secondary。
  if (kind === 'stale-push') {
    const pull: DialogButton = {
      label: $_('modal.pullFirst'),
      value: 'pull',
      variant: 'primary',
      icon: PULL_ICON,
    }
    const push: DialogButton = {
      label: $_('modal.pushOverwrite'),
      value: 'push',
      variant: 'secondary',
      icon: PUSH_ICON,
    }
    return disablePush ? [pull, cancel] : [pull, push, cancel]
  }

  const pull: DialogButton = {
    label: $_('modal.pullOverwrite'),
    value: 'pull',
    variant: 'primary',
    icon: PULL_ICON,
  }
  const push: DialogButton = {
    label: $_('modal.pushFirst'),
    value: 'push',
    variant: 'secondary',
    icon: PUSH_ICON,
  }
  return disablePush ? [pull, cancel] : [pull, push, cancel]
}

/**
 * push/pull 衝突確認ダイアログを統一形で表示する。
 *
 * 全経路（手動 push stale / auto-push stale / pull dirty / 起動時 dirty）が
 * このヘルパー経由になるため、本文・ボタン文言・診断情報の表示揺れがなくなる。
 *
 * @returns ユーザーの選択。`cancel` または `null`（モーダル外クリック等）はキャンセル扱い
 */
export async function showConflictDialog(
  params: ShowConflictDialogParams
): Promise<ConflictDialogChoice> {
  const { kind, staleResult, localPushCount, settings, disablePush = false } = params
  const $_ = get(_)

  const diagnostic = await buildDiagnostic(staleResult, settings, localPushCount, $_)
  const body = $_(bodyKey(kind)) + diagnostic
  const buttons = buttonsFor(kind, disablePush, $_)

  return (await choiceAsync(body, buttons)) as ConflictDialogChoice
}
