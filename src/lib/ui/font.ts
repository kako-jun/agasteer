/**
 * フォント管理
 * カスタムフォントの読み込み・適用を担当
 *
 * 2種類のフォント機能:
 * 1. システム等幅Webフォント: エディタ + codeブロックのみ (--font-mono)
 * 2. カスタムフォント: アプリ全体 (body, input, textarea, button, .cm-editor)
 */

import type { CustomFont } from '../types'
import { saveCustomFont, loadCustomFont, deleteCustomFont } from '../data'

// カスタムフォント（アプリ全体）
const CUSTOM_FONT_FAMILY = 'CustomUserFont'
const CUSTOM_FONT_KEY = 'custom'
let currentFontStyleElement: HTMLStyleElement | null = null

// システム等幅Webフォント（エディタ + codeのみ）
const SYSTEM_MONO_FONT_FAMILY = 'SystemMonoFont'
const SYSTEM_MONO_FONT_KEY = 'system-mono'
const SYSTEM_MONO_FONT_VERSION = '1.1' // バージョンアップでキャッシュ更新
// Google Fonts BIZ UDGothic（ttf単一ファイル）
const GOOGLE_FONTS_TTF_URL =
  'https://fonts.gstatic.com/s/bizudgothic/v12/daafSTouBF7RUjnbt8p3LuKttQ.ttf'
let currentMonoFontStyleElement: HTMLStyleElement | null = null

/**
 * フォントファイルを読み込んで保存
 */
export async function loadFontFile(file: File): Promise<CustomFont> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (e) => {
      if (!e.target?.result) {
        reject(new Error('Failed to read file'))
        return
      }

      const arrayBuffer = e.target.result as ArrayBuffer
      const font: CustomFont = {
        name: file.name,
        data: arrayBuffer,
        type: file.type || 'font/ttf',
      }

      resolve(font)
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * フォントをCSSに登録して適用
 */
export async function applyCustomFont(font: CustomFont): Promise<void> {
  // Blobを作成
  const blob = new Blob([font.data], { type: font.type })
  const url = URL.createObjectURL(blob)

  // 既存のスタイル要素を削除
  if (currentFontStyleElement) {
    currentFontStyleElement.remove()
  }

  // 新しいスタイル要素を作成
  const style = document.createElement('style')
  style.textContent = `
    @font-face {
      font-family: '${CUSTOM_FONT_FAMILY}';
      src: url(${url}) format('truetype');
      font-weight: normal;
      font-style: normal;
    }

    :root {
      --font-mono: '${CUSTOM_FONT_FAMILY}', 'Courier New', Menlo, Consolas, monospace;
    }

    body,
    input,
    textarea,
    button,
    .cm-editor {
      font-family: '${CUSTOM_FONT_FAMILY}', sans-serif !important;
    }
  `

  document.head.appendChild(style)
  currentFontStyleElement = style
}

/**
 * カスタムフォントを解除
 * スタイル要素を削除するだけで、アプリのデフォルトCSSに自動的に戻る
 */
export function removeCustomFont(): void {
  if (currentFontStyleElement) {
    currentFontStyleElement.remove()
    currentFontStyleElement = null
  }
}

/**
 * カスタムフォントをアップロードして保存・適用
 * 既存のフォントは自動的に上書きされる（1つのみ保存）
 */
export async function uploadAndApplyFont(file: File): Promise<void> {
  // フォントファイルを読み込み
  const font = await loadFontFile(file)

  // 固定キーで保存（既存のものは上書き）
  font.name = CUSTOM_FONT_KEY
  await saveCustomFont(font)

  // CSSに適用
  await applyCustomFont(font)
}

/**
 * 保存されたカスタムフォントを読み込んで適用
 */
export async function loadAndApplyCustomFont(): Promise<boolean> {
  const font = await loadCustomFont(CUSTOM_FONT_KEY)

  if (font) {
    await applyCustomFont(font)
    return true
  }

  return false
}

/**
 * カスタムフォントを削除
 */
export async function removeAndDeleteCustomFont(): Promise<void> {
  removeCustomFont()
  await deleteCustomFont(CUSTOM_FONT_KEY)
}

// ============================================================
// システム等幅Webフォント機能（エディタ + codeブロック用）
// ============================================================

interface SystemMonoFont extends CustomFont {
  version: string
}

/**
 * システム等幅フォントをCSSに登録して適用（--font-monoのみ）
 */
function applySystemMonoFont(font: CustomFont): void {
  // Blobを作成
  const blob = new Blob([font.data], { type: font.type })
  const url = URL.createObjectURL(blob)

  // 既存のスタイル要素を削除
  if (currentMonoFontStyleElement) {
    currentMonoFontStyleElement.remove()
  }

  // 新しいスタイル要素を作成（--font-monoのみを上書き）
  const style = document.createElement('style')
  style.textContent = `
    @font-face {
      font-family: '${SYSTEM_MONO_FONT_FAMILY}';
      src: url(${url}) format('truetype');
      font-weight: normal;
      font-style: normal;
    }

    :root {
      --font-mono: '${SYSTEM_MONO_FONT_FAMILY}', 'Courier New', Menlo, Consolas, monospace;
    }
  `

  document.head.appendChild(style)
  currentMonoFontStyleElement = style
}

/**
 * システム等幅Webフォントを読み込んで適用
 * IndexedDBにキャッシュがあればそれを使用、なければGoogle Fontsからダウンロード
 */
export async function loadAndApplySystemMonoFont(): Promise<boolean> {
  try {
    // IndexedDBからキャッシュを確認
    const cached = (await loadCustomFont(SYSTEM_MONO_FONT_KEY)) as SystemMonoFont | null

    if (cached && cached.version === SYSTEM_MONO_FONT_VERSION) {
      // キャッシュがあり、バージョンが一致していれば使用
      applySystemMonoFont(cached)
      console.log('System mono font loaded from IndexedDB cache')
      return true
    }

    // キャッシュがないかバージョンが古い場合はダウンロード
    console.log('Downloading system mono font from Google Fonts...')
    const response = await fetch(GOOGLE_FONTS_TTF_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch font: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const font: SystemMonoFont = {
      name: SYSTEM_MONO_FONT_KEY,
      data: arrayBuffer,
      type: 'font/ttf',
      version: SYSTEM_MONO_FONT_VERSION,
    }

    // IndexedDBに保存
    await saveCustomFont(font)

    // 適用
    applySystemMonoFont(font)
    console.log('System mono font (BIZ UDGothic) downloaded and applied')

    return true
  } catch (error) {
    console.warn('Failed to load system mono font, using fallback:', error)
    // フォールバック: CSSのデフォルト--font-monoが使用される
    return false
  }
}
