<script lang="ts">
  import MarkdownEditor from '../editor/MarkdownEditor.svelte'
  import type { Note, ThemeType } from '../../lib/types'

  export let note: Note
  export let theme: ThemeType
  export let syncMessage: string = ''
  export let syncError: string = ''
  export let onContentChange: (content: string) => void
  export let onSave: () => void
  export let onDownload: () => void
  export let onDelete: () => void
</script>

<section class="editor-section">
  <MarkdownEditor content={note.content} {theme} onChange={onContentChange} />
</section>

<div class="toolbar-fixed">
  <button type="button" class="secondary" on:click={onDelete}>
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
    ノートを削除
  </button>

  <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
    {#if syncMessage}
      <span class="message success">{syncMessage}</span>
    {/if}
    {#if syncError}
      <span class="message error">{syncError}</span>
    {/if}
  </div>

  <button type="button" class="secondary" on:click={onDownload}>
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
    Download
  </button>

  <button type="button" on:click={onSave}>
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
    Save
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
    margin-right: 0.25rem;
  }

  .message {
    font-size: 0.85rem;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
  }

  .message.success {
    color: #059669;
    background: #d1fae5;
  }

  .message.error {
    color: #dc2626;
    background: #fee2e2;
  }
</style>
