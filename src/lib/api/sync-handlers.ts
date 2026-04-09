/**
 * GitHub同期のヘルパー関数
 * App.svelteから分離したユーティリティ
 */

import type { RateLimitInfo } from './github'

/**
 * エラーコードマップ
 * ユーザーからの報告でエラー原因を特定するための識別子。
 * エラーメッセージ末尾に "(E-xx)" として自動付与される。
 */
const ERROR_CODES: Record<string, string> = {
  'github.tokenNotSet': 'E-01',
  'github.invalidRepoName': 'E-02',
  'github.invalidToken': 'E-03',
  'github.userFetchFailed': 'E-04',
  'github.repoNotFound': 'E-05',
  'github.noPermission': 'E-06',
  'github.repoFetchFailed': 'E-07',
  'github.rateLimited': 'E-08',
  'github.treeFetchFailed': 'E-09',
  'github.treeTruncated': 'E-10',
  'github.branchFetchFailed': 'E-11',
  'github.commitFetchFailed': 'E-12',
  'github.metadataFetchFailed': 'E-13',
  'github.treeCreateFailed': 'E-14',
  'github.commitCreateFailed': 'E-15',
  'github.branchUpdateFailed': 'E-16',
  'github.networkError': 'E-17',
  'github.pullIncomplete': 'E-18',
}

/**
 * GitHub APIのメッセージキーを翻訳してトースト用テキストに変換
 * rateLimitInfoがある場合は残り時間を含める
 * changedLeafCountがある場合は変更件数を含める
 * エラーメッセージにはエラーコードを自動付与する
 */
export function translateGitHubMessage(
  messageKey: string,
  translate: (key: string, options?: { values?: Record<string, unknown> }) => string,
  rateLimitInfo?: RateLimitInfo,
  changedLeafCount?: number
): string {
  // i18nキーでなければそのまま返す（後方互換性のため）
  if (!messageKey.startsWith('github.') && !messageKey.startsWith('toast.')) {
    return messageKey
  }

  // レート制限メッセージの場合、残り時間を含める（GitHub APIは最大60分でリセット）
  if (messageKey === 'github.rateLimited' && rateLimitInfo?.remainingSeconds !== undefined) {
    const minutes = Math.ceil(rateLimitInfo.remainingSeconds / 60)
    return appendErrorCode(translate('github.rateLimited', { values: { minutes } }), messageKey)
  } else if (messageKey === 'github.rateLimited') {
    return appendErrorCode(translate('github.rateLimitedNoTime'), messageKey)
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
  return appendErrorCode(translate(messageKey), messageKey)
}

/**
 * エラーコードが定義されているメッセージにはコードを付与する。
 * 成功系メッセージ（コード未定義）はそのまま返す。
 */
function appendErrorCode(translated: string, messageKey: string): string {
  const code = ERROR_CODES[messageKey]
  return code ? `${translated} (${code})` : translated
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
