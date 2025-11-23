import {
  register,
  init,
  getLocaleFromNavigator,
  locale,
  _,
  isLoading,
  waitLocale,
} from 'svelte-i18n'
import type { Locale } from '../types'

// 翻訳ファイルを登録（動的インポート）
register('ja', () => import('./locales/ja.json'))
register('en', () => import('./locales/en.json'))

/**
 * i18nを初期化
 * @param savedLocale - LocalStorageに保存された言語設定（オプション）
 * @returns 初期化完了を待つPromise
 */
export async function initI18n(savedLocale?: Locale): Promise<void> {
  // 保存された設定がある場合はそれを使用
  if (savedLocale) {
    init({
      fallbackLocale: 'en',
      initialLocale: savedLocale,
    })
    await waitLocale(savedLocale)
    return
  }

  // ブラウザの言語設定を取得
  const browserLocale = getLocaleFromNavigator()

  // 日本語（ja, ja-JP）の場合のみ日本語、それ以外は英語
  const detectedLocale: Locale = browserLocale?.startsWith('ja') ? 'ja' : 'en'

  init({
    fallbackLocale: 'en', // 英語にフォールバック
    initialLocale: detectedLocale,
  })

  await waitLocale(detectedLocale)
}

// locale, _, isLoading をエクスポート（他のファイルで使用）
export { locale, _, isLoading }
