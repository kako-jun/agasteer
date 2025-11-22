<script lang="ts">
  import Footer from '../layout/Footer.svelte'
  import MarkdownEditor from '../editor/MarkdownEditor.svelte'
  import type { Leaf, ThemeType } from '../../lib/types'

  export let leaf: Leaf
  export let theme: ThemeType
  export let onContentChange: (content: string) => void
  export let onSave: () => void
  export let onDownload: () => void
  export let onDelete: () => void
  export let disabled: boolean = false
</script>

<section class="editor-section">
  <MarkdownEditor content={leaf.content} {theme} onChange={onContentChange} />
</section>

<Footer>
  <svelte:fragment slot="left">
    <button
      type="button"
      on:click={onDelete}
      title="リーフを削除"
      aria-label="リーフを削除"
      {disabled}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="button-icon"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>

    <button type="button" on:click={onDownload} title="Download" aria-label="Download" {disabled}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="button-icon"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </button>
  </svelte:fragment>

  <svelte:fragment slot="right">
    <button type="button" class="primary" on:click={onSave} title="Save" aria-label="Save">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="button-icon"
      >
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
    </button>
  </svelte:fragment>
</Footer>

<style>
  .editor-section {
    padding: 0;
    height: calc(100vh - 80px - 60px);
    overflow: hidden;
  }
</style>
