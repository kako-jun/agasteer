/**
 * 競合ダイアログが出る全経路（stale-push / pull-dirty / startup-dirty / push-hang）の共通入口（#321）
 *
 * 3方向比較（conflict-merge.ts）→ ダイアログ（conflict-dialog.ts）→ マージ反映、を1か所で行う。
 * 経路ごとの続き（再 Push / Pull 完了 / やり直し）は呼び出し側が結果を見て決める。
 */

import type { Settings, StaleCheckResult } from '../types'
import { get } from 'svelte/store'
import { _ } from '../i18n'
import { showConflictDialog, type ConflictDialogKind } from './conflict-dialog'
import { analyzeConflictMerge, applyConflictMerge } from './conflict-merge'

/**
 * 競合ダイアログの結果。経路ごとの続き（再 Push / Pull 完了 など）は呼び出し側が決める。
 * - `merged`: マージを反映した（ローカルの変更はリモートに対する dirty として残る）
 * - `recompare`: 比較後にリモート/ローカルが変わったので反映しなかった（最初からやり直す）
 * - `mergeFailed`: 反映前のリモート確認か保存に失敗した（ストア・SHA は進めていない）
 * - `pull` / `push` / `cancel`: 従来の選択肢（cancel は null＝モーダル外クリックも含む）
 */
export type ConflictResolution = 'merged' | 'recompare' | 'mergeFailed' | 'pull' | 'push' | 'cancel'

export interface ResolveConflictParams {
  kind: ConflictDialogKind
  staleResult: StaleCheckResult | undefined
  localPushCount: number
  settings: Settings
  /** 起動時の確認など、従来の「Push」を出さない経路（マージは出る） */
  disablePush?: boolean
  /** 結果の通知（経路ごとにトーストの出し先が違う） */
  toast: (message: string, variant: 'success' | 'error' | '') => void
}

/**
 * 競合ダイアログが出る全経路（stale-push / pull-dirty / startup-dirty / push-hang）で
 * 同じ手順を通す: 3方向比較 → ダイアログ（マージ可能ならマージを先頭）→ 選ばれたら反映。
 * 判定できないときだけ理由を出して従来の選択肢になる（経路ごとの特例は持たない）。
 */
export async function resolveConflict(params: ResolveConflictParams): Promise<ConflictResolution> {
  const $_ = get(_)
  const analysis = await analyzeConflictMerge(params.staleResult, params.settings)
  const dialogParams = {
    kind: params.kind,
    staleResult: params.staleResult,
    localPushCount: params.localPushCount,
    settings: params.settings,
    merge: analysis,
    disablePush: params.disablePush === true,
  }
  const choice = await showConflictDialog(dialogParams as Parameters<typeof showConflictDialog>[0])
  if (choice === 'merge' && analysis.status === 'mergeable') {
    const applied = await applyConflictMerge(analysis.plan, params.settings)
    if (applied.status === 'applied') {
      params.toast($_('modal.mergeDone'), 'success')
      return 'merged'
    }
    if (applied.status === 'changed') {
      params.toast($_('modal.mergeRecompare'), '')
      return 'recompare'
    }
    params.toast(
      $_(applied.reason === 'save' ? 'modal.mergeSaveFailed' : 'modal.mergeApplyFailed'),
      'error'
    )
    return 'mergeFailed'
  }
  if (choice === 'pull') return 'pull'
  if (choice === 'push' && params.disablePush !== true) return 'push'
  return 'cancel'
}
