/**
 * 背景画像管理
 * カスタム背景画像の読み込み・適用を担当
 */

import type { CustomBackground } from './types'
import { saveCustomBackground, loadCustomBackground, deleteCustomBackground } from './storage'

const CUSTOM_BACKGROUND_KEY_LEFT = 'custom-left'
const CUSTOM_BACKGROUND_KEY_RIGHT = 'custom-right'
let currentBackgroundStyleElement: HTMLStyleElement | null = null
let currentBackgroundUrlLeft: string | null = null
let currentBackgroundUrlRight: string | null = null

/**
 * 画像ファイルを読み込んで保存
 */
export async function loadBackgroundFile(file: File): Promise<CustomBackground> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (e) => {
      if (!e.target?.result) {
        reject(new Error('Failed to read file'))
        return
      }

      const arrayBuffer = e.target.result as ArrayBuffer
      const background: CustomBackground = {
        name: file.name,
        data: arrayBuffer,
        type: file.type || 'image/jpeg',
      }

      resolve(background)
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * 背景画像をCSSに登録して適用（左右ペイン個別）
 */
export async function applyCustomBackgrounds(
  leftBackground: CustomBackground | null,
  rightBackground: CustomBackground | null,
  leftOpacity: number = 0.2,
  rightOpacity: number = 0.2
): Promise<void> {
  // 既存のBlob URLを解放
  if (currentBackgroundUrlLeft) {
    URL.revokeObjectURL(currentBackgroundUrlLeft)
    currentBackgroundUrlLeft = null
  }
  if (currentBackgroundUrlRight) {
    URL.revokeObjectURL(currentBackgroundUrlRight)
    currentBackgroundUrlRight = null
  }

  // Blobを作成
  let leftUrl: string | null = null
  let rightUrl: string | null = null

  if (leftBackground) {
    const blob = new Blob([leftBackground.data], { type: leftBackground.type })
    leftUrl = URL.createObjectURL(blob)
    currentBackgroundUrlLeft = leftUrl
  }

  if (rightBackground) {
    const blob = new Blob([rightBackground.data], { type: rightBackground.type })
    rightUrl = URL.createObjectURL(blob)
    currentBackgroundUrlRight = rightUrl
  }

  // 既存のスタイル要素を削除
  if (currentBackgroundStyleElement) {
    currentBackgroundStyleElement.remove()
  }

  // 新しいスタイル要素を作成
  const style = document.createElement('style')
  let css = `
    /* コンテンツエリアの基本スタイル */
    .main-pane,
    .settings-container {
      position: relative;
      background: var(--bg-primary);
    }

    .main-pane > * {
      position: relative;
      z-index: 1;
      background: transparent;
    }

    /* CodeMirrorエディタの背景を透明に */
    .cm-editor,
    .cm-scroller,
    .cm-content {
      background: transparent !important;
    }
  `

  // 左ペインの背景画像
  if (leftUrl) {
    css += `
    .left-column .main-pane::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url(${leftUrl});
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      background-attachment: local;
      opacity: ${leftOpacity};
      pointer-events: none;
      z-index: 0;
    }

    /* 左ペイン設定のプレビュー */
    .background-preview-left::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url(${leftUrl});
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      opacity: ${leftOpacity};
      z-index: 0;
    }
    `
  }

  // 右ペインの背景画像
  if (rightUrl) {
    css += `
    .right-column .main-pane::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url(${rightUrl});
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      background-attachment: local;
      opacity: ${rightOpacity};
      pointer-events: none;
      z-index: 0;
    }

    /* 右ペイン設定のプレビュー */
    .background-preview-right::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url(${rightUrl});
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      opacity: ${rightOpacity};
      z-index: 0;
    }
    `
  }

  style.textContent = css
  document.head.appendChild(style)
  currentBackgroundStyleElement = style
}

/**
 * カスタム背景画像を解除
 */
export function removeCustomBackgrounds(): void {
  // Blob URLを解放
  if (currentBackgroundUrlLeft) {
    URL.revokeObjectURL(currentBackgroundUrlLeft)
    currentBackgroundUrlLeft = null
  }
  if (currentBackgroundUrlRight) {
    URL.revokeObjectURL(currentBackgroundUrlRight)
    currentBackgroundUrlRight = null
  }

  // スタイル要素を削除するのではなく、リセット用CSSに置き換える
  if (currentBackgroundStyleElement) {
    currentBackgroundStyleElement.textContent = `
      /* 背景画像をクリア */
      .left-column .main-pane::before,
      .right-column .main-pane::before,
      .settings-container::before {
        content: none !important;
        background-image: none !important;
      }

      /* CodeMirrorの背景を元に戻す */
      .cm-editor,
      .cm-scroller,
      .cm-content {
        background: var(--bg-primary) !important;
      }
    `
  }
}

/**
 * カスタム背景画像をアップロードして保存・適用（左ペイン）
 */
export async function uploadAndApplyBackgroundLeft(
  file: File,
  opacity: number = 0.2
): Promise<void> {
  const background = await loadBackgroundFile(file)
  background.name = CUSTOM_BACKGROUND_KEY_LEFT
  await saveCustomBackground(background)

  // 右ペインの背景も読み込んで再適用
  const rightBackground = await loadCustomBackground(CUSTOM_BACKGROUND_KEY_RIGHT)
  const rightOpacity = 0.1 // デフォルト値
  await applyCustomBackgrounds(background, rightBackground, opacity, rightOpacity)
}

/**
 * カスタム背景画像をアップロードして保存・適用（右ペイン）
 */
export async function uploadAndApplyBackgroundRight(
  file: File,
  opacity: number = 0.2
): Promise<void> {
  const background = await loadBackgroundFile(file)
  background.name = CUSTOM_BACKGROUND_KEY_RIGHT
  await saveCustomBackground(background)

  // 左ペインの背景も読み込んで再適用
  const leftBackground = await loadCustomBackground(CUSTOM_BACKGROUND_KEY_LEFT)
  const leftOpacity = 0.1 // デフォルト値
  await applyCustomBackgrounds(leftBackground, background, leftOpacity, opacity)
}

/**
 * 保存されたカスタム背景画像を読み込んで適用
 */
export async function loadAndApplyCustomBackgrounds(
  leftOpacity: number = 0.1,
  rightOpacity: number = 0.1
): Promise<{ left: boolean; right: boolean }> {
  const leftBackground = await loadCustomBackground(CUSTOM_BACKGROUND_KEY_LEFT)
  const rightBackground = await loadCustomBackground(CUSTOM_BACKGROUND_KEY_RIGHT)

  await applyCustomBackgrounds(leftBackground, rightBackground, leftOpacity, rightOpacity)

  return {
    left: !!leftBackground,
    right: !!rightBackground,
  }
}

/**
 * カスタム背景画像を削除（左ペイン）
 */
export async function removeAndDeleteCustomBackgroundLeft(): Promise<void> {
  await deleteCustomBackground(CUSTOM_BACKGROUND_KEY_LEFT)

  // 右ペインの背景を保持したまま再適用
  const rightBackground = await loadCustomBackground(CUSTOM_BACKGROUND_KEY_RIGHT)
  const rightOpacity = 0.1
  await applyCustomBackgrounds(null, rightBackground, 0.1, rightOpacity)
}

/**
 * カスタム背景画像を削除（右ペイン）
 */
export async function removeAndDeleteCustomBackgroundRight(): Promise<void> {
  await deleteCustomBackground(CUSTOM_BACKGROUND_KEY_RIGHT)

  // 左ペインの背景を保持したまま再適用
  const leftBackground = await loadCustomBackground(CUSTOM_BACKGROUND_KEY_LEFT)
  const leftOpacity = 0.1
  await applyCustomBackgrounds(leftBackground, null, leftOpacity, 0.1)
}
