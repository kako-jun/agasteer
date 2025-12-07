/**
 * シェア機能（URL、Markdown、画像のコピー・共有）
 */
import type { Leaf } from '../types'
import type { Pane } from '../navigation'
import { showPushToast } from '../ui'

export interface ShareHandlers {
  translate: (key: string) => string
  getLeaf: (pane: Pane) => Leaf | null
  getView: (pane: Pane) => string
  getPreviewView: (pane: Pane) => any
  getEditorView: (pane: Pane) => any
}

/**
 * URLをクリップボードにコピー
 */
export function handleCopyUrl(pane: Pane, translate: (key: string) => string): void {
  const url = window.location.href
  navigator.clipboard
    .writeText(url)
    .then(() => {
      showPushToast(translate('share.urlCopied'), 'success')
    })
    .catch((err) => {
      console.error('URLのコピーに失敗しました:', err)
      showPushToast(translate('share.urlCopied'), 'error')
    })
}

/**
 * エディタから選択テキストを取得
 */
function getSelectedText(pane: Pane, handlers: ShareHandlers): string {
  const { getEditorView, getView } = handlers
  const view = getView(pane)
  if (view !== 'edit') return ''
  const editorView = getEditorView(pane)
  if (!editorView || !editorView.getSelectedText) return ''
  return editorView.getSelectedText()
}

/**
 * Markdownテキストを画像Blobに変換
 */
async function convertMarkdownToImageBlob(markdown: string): Promise<Blob | null> {
  try {
    const [{ marked }, DOMPurifyModule, html2canvasModule] = await Promise.all([
      import('marked'),
      import('dompurify'),
      import('html2canvas'),
    ])
    const DOMPurify = DOMPurifyModule.default
    const html2canvas = html2canvasModule.default

    // MarkdownをHTMLに変換してサニタイズ
    const htmlContent = DOMPurify.sanitize(marked(markdown) as string)

    // 一時要素を作成
    const wrapper = document.createElement('div')
    wrapper.style.padding = '20px'
    wrapper.style.backgroundColor = '#ffffff'
    wrapper.style.display = 'inline-block'
    wrapper.style.maxWidth = '800px'
    wrapper.style.fontFamily =
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif"
    wrapper.style.fontSize = '16px'
    wrapper.style.lineHeight = '1.6'
    wrapper.style.color = '#111111'

    // 画像化用の固定スタイル（テーマ非依存）
    const exportVars: Record<string, string> = {
      '--bg': '#ffffff',
      '--text': '#111111',
      '--text-muted': '#444444',
      '--accent': '#111111',
      '--surface-1': '#f5f5f5',
      '--border': '#666666',
    }
    Object.entries(exportVars).forEach(([key, value]) => {
      wrapper.style.setProperty(key, value)
    })

    // コンテンツ用のスタイルを追加
    const style = document.createElement('style')
    style.textContent = `
      .share-preview-content h1 { font-size: 2em; margin: 0.67em 0; font-weight: bold; border-bottom: 2px solid #111111; padding-bottom: 0.3em; }
      .share-preview-content h2 { font-size: 1.5em; margin: 0.75em 0; font-weight: bold; border-bottom: 1px solid #444444; padding-bottom: 0.3em; }
      .share-preview-content h3 { font-size: 1.17em; margin: 0.83em 0; font-weight: bold; }
      .share-preview-content p { margin: 1em 0; }
      .share-preview-content a { color: #111111; text-decoration: none; }
      .share-preview-content code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; font-family: var(--font-mono); font-size: 0.9em; }
      .share-preview-content pre { background: #f5f5f5; padding: 1em; border-radius: 5px; overflow-x: auto; margin: 1em 0; }
      .share-preview-content pre code { background: none; padding: 0; }
      .share-preview-content blockquote { border-left: 4px solid #111111; padding-left: 1em; margin: 1em 0; color: #444444; }
      .share-preview-content ul, .share-preview-content ol { margin: 1em 0; padding-left: 2em; }
      .share-preview-content li { margin: 0.5em 0; }
      .share-preview-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
      .share-preview-content th, .share-preview-content td { border: 1px solid #444444; padding: 0.5em; text-align: left; }
      .share-preview-content th { background: #f5f5f5; font-weight: bold; }
    `
    wrapper.appendChild(style)

    // コンテンツを追加
    const content = document.createElement('div')
    content.className = 'share-preview-content'
    content.innerHTML = htmlContent
    wrapper.appendChild(content)

    document.body.appendChild(wrapper)

    // html2canvasでキャプチャ
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: 1,
      logging: false,
      useCORS: true,
    })

    // 一時要素を削除
    document.body.removeChild(wrapper)

    // CanvasをBlobに変換
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob)
      })
    })
  } catch (error) {
    console.error('Markdownの画像化に失敗しました:', error)
    throw error
  }
}

/**
 * Markdownをクリップボードにコピー（選択範囲があれば選択範囲、なければ全文）
 */
export async function handleCopyMarkdown(pane: Pane, handlers: ShareHandlers): Promise<void> {
  const { translate, getLeaf, getView, getPreviewView } = handlers
  const leaf = getLeaf(pane)
  const view = getView(pane)

  if (!leaf) return

  // プレビューモード時は画像をコピー
  if (view === 'preview') {
    await handleCopyImageToClipboard(pane, handlers)
    return
  }

  // 編集モード時
  if (view === 'edit') {
    const selectedText = getSelectedText(pane, handlers)
    const textToCopy = selectedText || leaf.content
    const messageKey = selectedText ? 'share.selectionCopied' : 'share.markdownCopied'

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        showPushToast(translate(messageKey), 'success')
      })
      .catch((err) => {
        console.error('Markdownのコピーに失敗しました:', err)
        showPushToast(translate(messageKey), 'error')
      })
  }
}

/**
 * 画像をクリップボードにコピー
 */
export async function handleCopyImageToClipboard(
  pane: Pane,
  handlers: ShareHandlers
): Promise<void> {
  const { translate, getPreviewView } = handlers
  const previewView = getPreviewView(pane)

  if (!previewView || !previewView.copyImageToClipboard) return

  try {
    await previewView.copyImageToClipboard()
    showPushToast(translate('share.imageCopied'), 'success')
  } catch (error) {
    console.error('画像のコピーに失敗しました:', error)
    showPushToast(translate('share.imageCopyFailed'), 'error')
  }
}

/**
 * Web Share APIで画像を共有（プレビューモード用）
 */
export async function handleShareImage(pane: Pane, handlers: ShareHandlers): Promise<void> {
  const { translate, getLeaf, getPreviewView } = handlers
  const leaf = getLeaf(pane)
  const previewView = getPreviewView(pane)

  if (!leaf || !previewView || !previewView.shareImage) return

  try {
    await previewView.shareImage(leaf.title)
    // 成功時はトーストを表示しない（共有ダイアログで完結するため）
  } catch (error: any) {
    // Web Share APIがサポートされていない場合はクリップボードにコピー
    if (error.message === 'Web Share API is not supported') {
      await handleCopyImageToClipboard(pane, handlers)
    } else if (error.name === 'AbortError') {
      // ユーザーが共有をキャンセルした場合は何もしない
    } else {
      console.error('共有に失敗しました:', error)
      showPushToast(translate('share.shareFailed'), 'error')
    }
  }
}

/**
 * 選択範囲を画像化して共有（編集モード用）
 */
export async function handleShareSelectionImage(
  pane: Pane,
  handlers: ShareHandlers
): Promise<void> {
  const { translate, getLeaf } = handlers
  const leaf = getLeaf(pane)

  if (!leaf) return

  // 選択範囲があればそれを、なければ全体を共有
  const selectedText = getSelectedText(pane, handlers)
  const textToShare = selectedText || leaf.content

  if (!textToShare) return

  try {
    const blob = await convertMarkdownToImageBlob(textToShare)
    if (!blob) return

    // Web Share API がサポートされているか確認
    if (!navigator.share || !navigator.canShare) {
      // サポートされていない場合はクリップボードにコピー
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ])
      showPushToast(translate('share.selectionImageCopied'), 'success')
      return
    }

    const file = new File([blob], `${leaf.title}-selection.png`, { type: 'image/png' })
    const shareData = {
      files: [file],
      title: leaf.title,
    }

    if (navigator.canShare(shareData)) {
      await navigator.share(shareData)
      // 成功時はトーストを表示しない（共有ダイアログで完結するため）
    } else {
      throw new Error('Cannot share this content')
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      // ユーザーが共有をキャンセルした場合は何もしない
    } else {
      console.error('選択範囲の共有に失敗しました:', error)
      showPushToast(translate('share.shareFailed'), 'error')
    }
  }
}
