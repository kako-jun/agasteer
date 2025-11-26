<script lang="ts">
  import { onMount } from 'svelte'
  import type { Leaf } from '../../lib/types'

  export let leaf: Leaf
  export let onScroll: ((scrollTop: number, scrollHeight: number) => void) | null = null

  let previewSection: HTMLElement
  let isScrollingSynced = false // スクロール同期中フラグ（無限ループ防止）
  let isLoading = true // marked/DOMPurifyローディング中フラグ
  let marked: any
  let DOMPurify: any

  // マークダウンをHTMLに変換してサニタイズ
  $: htmlContent = isLoading ? '' : DOMPurify.sanitize(marked(leaf.content) as string)

  // marked/DOMPurifyを動的ロード
  async function loadMarkdownTools() {
    const [{ marked: m }, DOMPurifyModule] = await Promise.all([
      import('marked'),
      import('dompurify'),
    ])
    marked = m
    DOMPurify = DOMPurifyModule.default
    isLoading = false
  }

  onMount(async () => {
    await loadMarkdownTools()
  })

  // 外部からスクロール位置を設定する関数
  export function scrollTo(scrollTop: number) {
    if (!previewSection || isScrollingSynced) return

    isScrollingSynced = true
    previewSection.scrollTop = scrollTop
    // 次のイベントループでフラグをリセット
    setTimeout(() => {
      isScrollingSynced = false
    }, 0)
  }

  // プレビュー内容を画像Blobとして取得
  async function captureAsBlob(): Promise<Blob | null> {
    if (!previewSection || isLoading) return null

    try {
      // html2canvasを動的にインポート
      const html2canvas = (await import('html2canvas')).default

      // プレビューコンテンツの要素を取得
      const contentElement = previewSection.querySelector('.preview-content') as HTMLElement
      if (!contentElement) return null

      // スクロール位置を保存
      const originalScrollTop = previewSection.scrollTop

      // 一時的にスクロールを最上部に移動して全体をキャプチャ
      previewSection.scrollTop = 0

      // 余白付きの一時要素を作成
      const wrapper = document.createElement('div')
      wrapper.style.padding = '20px'
      wrapper.style.backgroundColor = '#ffffff'
      wrapper.style.display = 'inline-block'

      // コンテンツをクローンして追加
      const clonedContent = contentElement.cloneNode(true) as HTMLElement
      wrapper.appendChild(clonedContent)
      document.body.appendChild(wrapper)

      // html2canvasでキャプチャ（余白を含める）
      const canvas = await html2canvas(wrapper, {
        backgroundColor: '#ffffff', // 白背景を強制
        scale: 1, // 等倍で出力
        logging: false,
        useCORS: true, // 外部画像対応
      })

      // 一時要素を削除
      document.body.removeChild(wrapper)

      // スクロール位置を元に戻す
      previewSection.scrollTop = originalScrollTop

      // CanvasをBlobに変換（Promise版）
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob)
        })
      })
    } catch (error) {
      console.error('画像キャプチャに失敗しました:', error)
      throw error
    }
  }

  // プレビュー内容を画像としてダウンロード
  export async function captureAsImage(filename: string): Promise<void> {
    try {
      const blob = await captureAsBlob()
      if (!blob) return

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('画像ダウンロードに失敗しました:', error)
      throw error
    }
  }

  // プレビュー内容をクリップボードにコピー
  export async function copyImageToClipboard(): Promise<void> {
    try {
      const blob = await captureAsBlob()
      if (!blob) return

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ])
    } catch (error) {
      console.error('クリップボードへのコピーに失敗しました:', error)
      throw error
    }
  }

  // プレビュー内容をWeb Share APIで共有
  export async function shareImage(filename: string): Promise<void> {
    try {
      const blob = await captureAsBlob()
      if (!blob) return

      // Web Share API がサポートされているか確認
      if (!navigator.share || !navigator.canShare) {
        throw new Error('Web Share API is not supported')
      }

      const file = new File([blob], `${filename}.png`, { type: 'image/png' })
      const shareData = {
        files: [file],
        title: filename,
      }

      // 共有可能か確認
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData)
      } else {
        throw new Error('Cannot share this content')
      }
    } catch (error) {
      console.error('共有に失敗しました:', error)
      throw error
    }
  }

  function handleScroll(event: Event) {
    if (isScrollingSynced || !onScroll) return
    const target = event.target as HTMLElement
    if (target) {
      onScroll(target.scrollTop, target.scrollHeight)
    }
  }
</script>

<section class="preview-section" bind:this={previewSection} on:scroll={handleScroll}>
  {#if isLoading}
    <div class="loading-container">
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  {:else}
    <div class="preview-content">
      {@html htmlContent}
    </div>
  {/if}
</section>

<style>
  .preview-section {
    padding: 1rem;
    height: 100%;
    overflow: auto;
    position: relative;
  }

  .loading-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--bg);
  }

  .loading-dots {
    display: flex;
    gap: 0.5rem;
  }

  .loading-dots span {
    width: 12px;
    height: 12px;
    background-color: var(--accent);
    border-radius: 50%;
    animation: pulse 1.4s infinite ease-in-out both;
  }

  .loading-dots span:nth-child(1) {
    animation-delay: -0.32s;
  }

  .loading-dots span:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes pulse {
    0%,
    80%,
    100% {
      transform: scale(0);
      opacity: 0.5;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .preview-content {
    max-width: 800px;
    margin: 0 auto;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: var(--text);
  }

  /* マークダウン要素のスタイリング */
  .preview-content :global(h1) {
    font-size: 2em;
    margin: 0.67em 0;
    font-weight: bold;
    border-bottom: 2px solid var(--accent);
    padding-bottom: 0.3em;
  }

  .preview-content :global(h2) {
    font-size: 1.5em;
    margin: 0.75em 0;
    font-weight: bold;
    border-bottom: 1px solid var(--text-muted);
    padding-bottom: 0.3em;
  }

  .preview-content :global(h3) {
    font-size: 1.17em;
    margin: 0.83em 0;
    font-weight: bold;
  }

  .preview-content :global(h4) {
    font-size: 1em;
    margin: 1.12em 0;
    font-weight: bold;
  }

  .preview-content :global(h5) {
    font-size: 0.83em;
    margin: 1.5em 0;
    font-weight: bold;
  }

  .preview-content :global(h6) {
    font-size: 0.75em;
    margin: 1.67em 0;
    font-weight: bold;
  }

  .preview-content :global(p) {
    margin: 1em 0;
  }

  .preview-content :global(a) {
    color: var(--accent);
    text-decoration: none;
  }

  .preview-content :global(a:hover) {
    text-decoration: underline;
  }

  .preview-content :global(code) {
    background: var(--surface-1);
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .preview-content :global(pre) {
    background: var(--surface-1);
    padding: 1em;
    border-radius: 5px;
    overflow-x: auto;
    margin: 1em 0;
  }

  .preview-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .preview-content :global(blockquote) {
    border-left: 4px solid var(--accent);
    padding-left: 1em;
    margin: 1em 0;
    color: var(--text-muted);
  }

  .preview-content :global(ul),
  .preview-content :global(ol) {
    margin: 1em 0;
    padding-left: 2em;
  }

  .preview-content :global(li) {
    margin: 0.5em 0;
  }

  .preview-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }

  .preview-content :global(th),
  .preview-content :global(td) {
    border: 1px solid var(--text-muted);
    padding: 0.5em;
    text-align: left;
  }

  .preview-content :global(th) {
    background: var(--surface-1);
    font-weight: bold;
  }

  .preview-content :global(img) {
    max-width: 100%;
    height: auto;
  }

  .preview-content :global(hr) {
    border: none;
    border-top: 1px solid var(--text-muted);
    margin: 2em 0;
  }
</style>
