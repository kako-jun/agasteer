<script lang="ts">
  import MarkdownEditor from '../editor/MarkdownEditor.svelte'
  import type { Leaf, ThemeType } from '../../lib/types'

  export let leaf: Leaf
  export let theme: ThemeType
  export let onContentChange: (content: string, leafId: string) => void
  export let onSave: () => void
  export let onDownload: (leafId: string) => void
  export let onDelete: (leafId: string) => void
  export let disabled: boolean = false

  function handleContentChange(content: string) {
    onContentChange(content, leaf.id)
  }

  function handleDelete() {
    onDelete(leaf.id)
  }

  function handleDownload() {
    onDownload(leaf.id)
  }
</script>

<section class="editor-section">
  <MarkdownEditor content={leaf.content} {theme} onChange={handleContentChange} />
</section>

<style>
  .editor-section {
    padding: 0;
    height: 100%;
    overflow: hidden;
  }
</style>
