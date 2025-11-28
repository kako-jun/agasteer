/**
 * GitHub同期のヘルパー関数
 * App.svelteから分離したユーティリティ
 */

import type { RateLimitInfo } from './github'

/**
 * GitHub APIのメッセージキーを翻訳してトースト用テキストに変換
 * rateLimitInfoがある場合は残り時間を含める
 * changedCountがある場合は変更件数を含める
 */
export function translateGitHubMessage(
  messageKey: string,
  translate: (key: string, options?: { values?: Record<string, unknown> }) => string,
  rateLimitInfo?: RateLimitInfo,
  changedCount?: number
): string {
  // i18nキーでなければそのまま返す（後方互換性のため）
  if (!messageKey.startsWith('github.') && !messageKey.startsWith('toast.')) {
    return messageKey
  }

  // レート制限メッセージの場合、残り時間を含める
  if (messageKey === 'github.rateLimited' && rateLimitInfo?.remainingSeconds !== undefined) {
    const totalMinutes = Math.floor(rateLimitInfo.remainingSeconds / 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return translate('github.rateLimited', { values: { hours, minutes } })
  } else if (messageKey === 'github.rateLimited') {
    return translate('github.rateLimitedNoTime')
  }

  // Push成功時に変更件数を含める
  if (messageKey === 'github.pushOk' && changedCount !== undefined) {
    return translate('github.pushOkWithCount', { values: { count: changedCount } })
  }

  // 通常のi18n翻訳
  return translate(messageKey)
}

/**
 * 交通整理: Pull/Pushが実行可能かどうか
 */
export function canSync(
  isPulling: boolean,
  isPushing: boolean
): { canPull: boolean; canPush: boolean } {
  // Pull中またはPush中は両方とも不可
  if (isPulling || isPushing) {
    return { canPull: false, canPush: false }
  }
  return { canPull: true, canPush: true }
}
