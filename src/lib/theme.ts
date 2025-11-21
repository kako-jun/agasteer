/**
 * テーマ管理
 * アプリケーションのテーマ適用を担当
 */

import type { ThemeType, Settings } from './types'

/**
 * テーマを適用
 */
export function applyTheme(theme: ThemeType, settings?: Settings): void {
  if (theme === 'yomi') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}
