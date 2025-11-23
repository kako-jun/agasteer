<script lang="ts">
  import { marked } from 'marked'
  import DOMPurify from 'dompurify'
  import type { Leaf } from '../../lib/types'

  export let leaf: Leaf
  export let onScroll: ((scrollTop: number, scrollHeight: number) => void) | null = null

  let previewSection: HTMLElement
  let isScrollingSynced = false // スクロール同期中フラグ（無限ループ防止）

  // マークダウンをHTMLに変換してサニタイズ
  $: htmlContent = DOMPurify.sanitize(marked(leaf.content) as string)

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

  function handleScroll(event: Event) {
    if (isScrollingSynced || !onScroll) return
    const target = event.target as HTMLElement
    if (target) {
      onScroll(target.scrollTop, target.scrollHeight)
    }
  }
</script>

<section class="preview-section" bind:this={previewSection} on:scroll={handleScroll}>
  <div class="preview-content">
    {@html htmlContent}
  </div>
</section>

<style>
  .preview-section {
    padding: 1rem;
    height: 100%;
    overflow: auto;
  }

  .preview-content {
    max-width: 800px;
    margin: 0 auto;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: var(--text-primary);
  }

  /* マークダウン要素のスタイリング */
  .preview-content :global(h1) {
    font-size: 2em;
    margin: 0.67em 0;
    font-weight: bold;
    border-bottom: 2px solid var(--accent-color);
    padding-bottom: 0.3em;
  }

  .preview-content :global(h2) {
    font-size: 1.5em;
    margin: 0.75em 0;
    font-weight: bold;
    border-bottom: 1px solid var(--text-secondary);
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
    color: var(--accent-color);
    text-decoration: none;
  }

  .preview-content :global(a:hover) {
    text-decoration: underline;
  }

  .preview-content :global(code) {
    background: var(--bg-secondary);
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .preview-content :global(pre) {
    background: var(--bg-secondary);
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
    border-left: 4px solid var(--accent-color);
    padding-left: 1em;
    margin: 1em 0;
    color: var(--text-secondary);
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
    border: 1px solid var(--text-secondary);
    padding: 0.5em;
    text-align: left;
  }

  .preview-content :global(th) {
    background: var(--bg-secondary);
    font-weight: bold;
  }

  .preview-content :global(img) {
    max-width: 100%;
    height: auto;
  }

  .preview-content :global(hr) {
    border: none;
    border-top: 1px solid var(--text-secondary);
    margin: 2em 0;
  }
</style>
