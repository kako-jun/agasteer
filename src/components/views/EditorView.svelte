<script lang="ts">
  import MarkdownEditor from '../editor/MarkdownEditor.svelte'
  import type { Leaf, ThemeType } from '../../lib/types'
  import type { Pane } from '../../lib/navigation'

  interface Props {
    leaf: Leaf
    theme: ThemeType
    vimMode?: boolean
    linedMode?: boolean
    cursorTrailEnabled?: boolean
    pane: Pane
    initialLine?: number
    onContentChange: (content: string, leafId: string) => void
    onPush: () => void
    onClose?: (() => void) | null
    onSwitchPane?: (() => void) | null
    onDownload: (leafId: string) => void
    onDelete: (leafId: string) => void
    onScroll?: ((scrollTop: number, scrollHeight: number) => void) | null
  }

  let {
    leaf,
    theme,
    vimMode = false,
    linedMode = true,
    cursorTrailEnabled = true,
    pane,
    initialLine = 0,
    onContentChange,
    onPush,
    onClose = null,
    onSwitchPane = null,
    onDownload,
    onDelete,
    onScroll = null,
  }: Props = $props()

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

  // 現在このエディタが表示しているリーフIDを返す
  export function getLeafId(): string {
    return leaf.id
  }

  // 外部からカーソル位置にテキストを挿入する関数
  export function insertAtCursor(text: string) {
    if (markdownEditor && markdownEditor.insertAtCursor) {
      markdownEditor.insertAtCursor(text)
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
    {cursorTrailEnabled}
    leafId={leaf.id}
    {pane}
    {initialLine}
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
