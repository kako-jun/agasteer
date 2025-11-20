/**
 * テーマ管理
 * アプリケーションのテーマ適用を担当
 */

import type { ThemeType, Settings } from './types'

/**
 * テーマを適用
 */
export function applyTheme(theme: ThemeType, settings?: Settings): void {
  if (theme === 'light') {
    document.documentElement.removeAttribute('data-theme')
  } else if (theme === 'custom' && settings) {
    document.documentElement.setAttribute('data-theme', 'custom')
    // カスタムカラーを適用
    document.documentElement.style.setProperty('--bg-primary', settings.customBgPrimary)
    document.documentElement.style.setProperty('--accent-color', settings.customAccentColor)
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}
