/**
 * フォント管理
 * カスタムフォントの読み込み・適用を担当
 */

import type { CustomFont } from './types'
import { saveCustomFont, loadCustomFont, deleteCustomFont } from './storage'

const CUSTOM_FONT_FAMILY = 'CustomUserFont'
const CUSTOM_FONT_KEY = 'custom'
let currentFontStyleElement: HTMLStyleElement | null = null

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
