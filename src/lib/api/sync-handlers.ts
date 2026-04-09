/**
 * GitHub同期のヘルパー関数
 * App.svelteから分離したユーティリティ
 */

import type { RateLimitInfo } from './github'

/**
 * GitHub APIのメッセージキーを翻訳してトースト用テキストに変換
 * rateLimitInfoがある場合は残り時間を含める
 * changedLeafCountがある場合は変更件数を含める
 * errorCodeがある場合はメッセージ末尾に "(E-xxxx)" として付与する
 */
export function translateGitHubMessage(
  messageKey: string,
  translate: (key: string, options?: { values?: Record<string, unknown> }) => string,
  rateLimitInfo?: RateLimitInfo,
  changedLeafCount?: number,
  errorCode?: string
): string {
  // i18nキーでなければそのまま返す（後方互換性のため）
  if (!messageKey.startsWith('github.') && !messageKey.startsWith('toast.')) {
    return messageKey
  }

  // レート制限メッセージの場合、残り時間を含める（GitHub APIは最大60分でリセット）
  if (messageKey === 'github.rateLimited' && rateLimitInfo?.remainingSeconds !== undefined) {
    const minutes = Math.ceil(rateLimitInfo.remainingSeconds / 60)
    return appendErrorCode(translate('github.rateLimited', { values: { minutes } }), errorCode)
  } else if (messageKey === 'github.rateLimited') {
    return appendErrorCode(translate('github.rateLimitedNoTime'), errorCode)
  }

  // Push成功時に変更件数を含める
  if (messageKey === 'github.pushOk') {
    if (changedLeafCount !== undefined && changedLeafCount > 0) {
      return translate('github.pushOkWithCount', { values: { count: changedLeafCount } })
    } else {
      // リーフ変更なし（メタデータのみ更新）
      return translate('github.pushOkMetadataOnly')
    }
  }

  // 通常のi18n翻訳
  return appendErrorCode(translate(messageKey), errorCode)
}

/**
 * エラーコードが提供されている場合はメッセージ末尾に付与する。
 * エラーコードがない場合はそのまま返す。
 */
function appendErrorCode(translated: string, errorCode?: string): string {
  return errorCode ? `${translated} (${errorCode})` : translated
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
