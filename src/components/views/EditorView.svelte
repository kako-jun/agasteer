<script lang="ts">
  import MarkdownEditor from '../editor/MarkdownEditor.svelte'
  import type { Note, ThemeType } from '../../lib/types'

  export let note: Note
  export let theme: ThemeType
  export let onContentChange: (content: string) => void
  export let onSave: () => void
  export let onDownload: () => void
  export let onDelete: () => void
  export let disabled: boolean = false
</script>

<section class="editor-section">
  <MarkdownEditor content={note.content} {theme} onChange={onContentChange} />
</section>

<div class="toolbar-fixed">
  <button
    type="button"
    class="secondary icon-only"
    on:click={onDelete}
    title="ノートを削除"
    aria-label="ノートを削除"
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

  <div style="flex: 1; display: flex; align-items: center; gap: 8px;"></div>

  <button
    type="button"
    class="secondary icon-only"
    on:click={onDownload}
    title="Download"
    aria-label="Download"
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  </button>

  <button
    type="button"
    class="icon-only"
    on:click={onSave}
    title="Save"
    aria-label="Save"
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  </button>
</div>

<style>
  .editor-section {
    padding: 0;
    height: calc(100vh - 80px - 60px);
    overflow: hidden;
  }

  .toolbar-fixed {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border-top: 1px solid var(--border-color);
    padding: 0.75rem 1rem;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
    z-index: 10;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  button {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    background: var(--accent-color);
    color: white;
    cursor: pointer;
    font-size: 0.9rem;
    transition: opacity 0.2s;
  }

  button:hover {
    opacity: 0.9;
  }

  button.secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  :global(.button-icon) {
    margin: 0;
  }

  .icon-only {
    padding: 0.5rem;
    width: 40px;
    height: 40px;
    justify-content: center;
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
