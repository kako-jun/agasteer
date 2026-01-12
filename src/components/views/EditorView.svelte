<script lang="ts">
  import MarkdownEditor from '../editor/MarkdownEditor.svelte'
  import type { Leaf, ThemeType } from '../../lib/types'
  import type { Pane } from '../../lib/navigation'

  export let leaf: Leaf
  export let theme: ThemeType
  export let vimMode: boolean = false
  export let linedMode: boolean = false
  export let pane: Pane
  export let onContentChange: (content: string, leafId: string) => void
  export let onPush: () => void
  export let onClose: (() => void) | null = null
  export let onSwitchPane: (() => void) | null = null
  export let onDownload: (leafId: string) => void
  export let onDelete: (leafId: string) => void
  export let onScroll: ((scrollTop: number, scrollHeight: number) => void) | null = null

  let markdownEditor: any = null

  function handleContentChange(content: string) {
    onContentChange(content, leaf.id)
  }

  function handleDelete() {
    onDelete(leaf.id)
  }

  function handleDownload() {
    onDownload(leaf.id)
  }

  // 外部からスクロール位置を設定する関数
  export function scrollTo(scrollTop: number) {
    if (markdownEditor && markdownEditor.scrollTo) {
      markdownEditor.scrollTo(scrollTop)
    }
  }

  // 外部からエディタにフォーカスを当てる関数
  export function focusEditor() {
    if (markdownEditor && markdownEditor.focus) {
      markdownEditor.focus()
    }
  }

  // 外部から指定行にジャンプする関数
  export function scrollToLine(line: number) {
    if (markdownEditor && markdownEditor.scrollToLine) {
      markdownEditor.scrollToLine(line)
    }
  }

  // 外部から選択テキストを取得する関数
  export function getSelectedText(): string {
    if (markdownEditor && markdownEditor.getSelectedText) {
      return markdownEditor.getSelectedText()
    }
    return ''
  }
</script>

<section class="editor-section">
  <MarkdownEditor
    bind:this={markdownEditor}
    content={leaf.content}
    {theme}
    {vimMode}
    {linedMode}
    {pane}
    onChange={handleContentChange}
    {onPush}
    {onClose}
    {onSwitchPane}
    {onScroll}
  />
</section>

<style>
  .editor-section {
    padding: 0;
    /* フレックスボックス内でオーバーフローしないように */
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
