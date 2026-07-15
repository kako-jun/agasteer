import { settings } from '../stores'
import { showPullToast } from '../ui'
import { testGitHubConnection, translateGitHubMessage } from '../api'
import { appState } from '../app-state.svelte'
import { get } from 'svelte/store'
import { _ } from '../i18n'

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
