import { get } from 'svelte/store'
import type { Settings, StaleCheckResult } from '../types'
import { fetchRemotePushCount } from '../api'
import { choiceAsync, type ChoiceOption } from '../ui'
import { PULL_ICON, PUSH_ICON } from '../ui/icons'
import { lastKnownCommitSha } from '../stores'
import { _ } from '../i18n'
// #317: バグレポート用診断ログ（記録専用）
import { recordDiag } from '../diagnostics/record'
// #321: 3方向マージの比較結果
import type { MergeAnalysis, WorldConflict } from './conflict-merge'

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

/** `merge` は「両方の変更をマージして解決する」（#321。`merge` がマージ可能なときだけ出る） */
export type ConflictDialogChoice = 'pull' | 'push' | 'merge' | 'cancel' | null

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
  /**
   * #321: 共通の基準からの3方向比較の結果。stale-push / pull-dirty で渡す。
   * - mergeable: 「両方の変更をマージして解決する」を先頭の主ボタンとして出す
   * - conflicts: 従来の選択肢のまま、競合の対象・種類・行・双方の内容を詳細欄に出す
   * - unavailable: 従来の選択肢のまま、判定できない理由を本文に出す
   */
  merge?: MergeAnalysis
}

/**
 * `disablePush: true` のとき、ヘルパーは push ボタンを生成しないため
 * 戻り値は `'pull' | 'cancel' | null` に絞られる（型レベルで保証）。
 */
export type ShowConflictDialogParams =
  | (BaseParams & { kind: 'stale-push' | 'pull-dirty' | 'push-hang'; disablePush?: false })
  | (BaseParams & { kind: 'startup-dirty'; disablePush: true; merge?: undefined })

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

type Translate = (key: string, options?: { values?: Record<string, unknown> }) => string

/** 競合の詳細欄に出す件数・行数の上限（長すぎるダイアログにしない） */
const MAX_CONFLICTS_SHOWN = 10
const MAX_EXCERPT_LINES = 3
const MAX_EXCERPT_CHARS = 80

function excerpt(lines: readonly string[], $_: Translate): string[] {
  if (lines.length === 0) return [`    ${$_('modal.mergeEmpty')}`]
  const shown = lines.slice(0, MAX_EXCERPT_LINES).map((line) => {
    const cut = line.length > MAX_EXCERPT_CHARS ? `${line.slice(0, MAX_EXCERPT_CHARS)}...` : line
    return `    ${cut}`
  })
  if (lines.length > MAX_EXCERPT_LINES) {
    shown.push(
      `    ${$_('modal.mergeMoreLines', { values: { count: lines.length - MAX_EXCERPT_LINES } })}`
    )
  }
  return shown
}

function conflictKindLabel(c: WorldConflict, $_: Translate): string {
  switch (c.kind) {
    case 'content':
      return $_('modal.mergeKind.content')
    case 'deleteEdit':
      return $_(
        c.deletedBy === 'local'
          ? 'modal.mergeKind.deletedByLocal'
          : 'modal.mergeKind.deletedByRemote'
      )
    case 'attribute': {
      // 移動先がルート（親なし）のときは空文字になるので、ラベルで示す
      const label = (v: string | undefined) =>
        c.field === 'location' && !v ? $_('modal.mergeRoot') : (v ?? '')
      return $_(`modal.mergeKind.${c.field ?? 'name'}`, {
        values: { local: label(c.localValue), remote: label(c.remoteValue) },
      })
    }
    case 'pathCollision':
      return $_('modal.mergeKind.pathCollision')
    case 'structure':
      return $_('modal.mergeKind.structure')
    default:
      return assertNeverKind(c.kind)
  }
}

function assertNeverKind(x: never): never {
  throw new Error(`Unhandled MergeConflictKind: ${String(x)}`)
}

/**
 * #321: 競合の一覧（対象・種類・該当行・双方の内容）を詳細欄用のテキストにする。
 * 本文・タイトルを含むが、テキストとして描画されるだけで診断ログには残さない。
 */
export function formatConflictDetail(conflicts: readonly WorldConflict[], $_: Translate): string {
  const out: string[] = []
  for (const c of conflicts.slice(0, MAX_CONFLICTS_SHOWN)) {
    if (out.length > 0) out.push('')
    const prefix = c.world === 'archive' ? `${$_('modal.mergeArchive')}: ` : ''
    out.push(`${prefix}${c.path}`)
    out.push(`  ${conflictKindLabel(c, $_)}`)
    for (const line of c.lines ?? []) {
      const count = line.baseEnd - line.baseStart
      const range =
        count === 0
          ? $_('modal.mergeLinesInsert', { values: { line: line.baseStart + 1 } })
          : count === 1
            ? $_('modal.mergeLine', { values: { line: line.baseStart + 1 } })
            : $_('modal.mergeLines', { values: { start: line.baseStart + 1, end: line.baseEnd } })
      out.push(`  ${range}`)
      out.push(`   ${$_('modal.mergeLocal')}`)
      out.push(...excerpt(line.local, $_))
      out.push(`   ${$_('modal.mergeRemote')}`)
      out.push(...excerpt(line.remote, $_))
    }
  }
  if (conflicts.length > MAX_CONFLICTS_SHOWN) {
    out.push('')
    out.push(
      $_('modal.mergeMoreConflicts', { values: { count: conflicts.length - MAX_CONFLICTS_SHOWN } })
    )
  }
  return out.join('\n')
}

/** #321: 比較結果を本文（1〜2行）と詳細欄に変換する */
export function describeMergeAnalysis(
  analysis: MergeAnalysis,
  $_: Translate
): { summary: string; detail?: string } {
  switch (analysis.status) {
    case 'mergeable':
      return {
        summary: $_('modal.mergeAvailable', {
          values: {
            localCount: analysis.localChangeCount,
            remoteCount: analysis.remoteChangeCount,
          },
        }),
      }
    case 'conflicts':
      return {
        summary: $_('modal.mergeConflicts', { values: { count: analysis.conflicts.length } }),
        detail: formatConflictDetail(analysis.conflicts, $_),
      }
    case 'unavailable':
      return {
        summary: $_('modal.mergeUnavailable', {
          values: { reason: $_(`modal.mergeReason.${analysis.reason}`) },
        }),
      }
  }
}

function buttonsFor(
  kind: ConflictDialogKind,
  disablePush: boolean,
  $_: (key: string) => string,
  mergeable = false
): ChoiceOption[] {
  const buttons = baseButtonsFor(kind, disablePush, $_)
  if (!mergeable) return buttons
  // #321: マージ可能なときは「両方の変更をマージして解決する」を先頭の主ボタンにし、
  // 従来の主ボタンは副ボタンに下げる（どちらかを捨てる操作より安全なため）
  const merge: ChoiceOption = { label: $_('modal.mergeBoth'), value: 'merge', variant: 'primary' }
  return [
    merge,
    ...buttons.map((b) => (b.variant === 'primary' ? { ...b, variant: 'secondary' as const } : b)),
  ]
}

function baseButtonsFor(
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
  params: BaseParams & { kind: 'startup-dirty'; disablePush: true; merge?: undefined }
): Promise<Exclude<ConflictDialogChoice, 'push' | 'merge'>>
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
  // #321: 3方向比較の結果（マージ可能 / 競合の一覧 / 判定できない理由）
  const mergeInfo = params.merge ? describeMergeAnalysis(params.merge, $_) : undefined
  const body =
    $_(bodyKey(kind)) +
    (mergeInfo ? '\n\n' + mergeInfo.summary : '') +
    diagnostic +
    '\n\n' +
    $_('modal.conflictBugReportHint')
  recordDiag('conflict-dialog', {
    dialogKind: kind,
    localSha:
      staleResult?.status === 'stale' ? staleResult.localCommitSha : lastKnownCommitSha.value,
    remoteSha: staleResult?.status === 'stale' ? staleResult.remoteCommitSha : null,
  })
  const mergeable = params.merge?.status === 'mergeable'
  const buttons = buttonsFor(kind, disablePush, $_, mergeable)

  const raw = (await choiceAsync(
    body,
    buttons,
    'center',
    mergeInfo?.detail
  )) as ConflictDialogChoice
  // マージボタンを出していないのに 'merge' が返ることはないが、念のため cancel 扱いにする
  const choice: ConflictDialogChoice = raw === 'merge' && !mergeable ? 'cancel' : raw
  // #317: 選択を記録（null＝モーダル外クリック等は cancel 扱いと同じ）。戻り値は変えない
  recordDiag('conflict-choice', {
    dialogKind: kind,
    choice: choice === 'pull' || choice === 'push' || choice === 'merge' ? choice : 'cancel',
  })
  return choice
}
