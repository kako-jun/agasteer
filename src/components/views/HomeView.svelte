<script lang="ts">
  import type { Folder } from '../../lib/types'

  export let folders: Folder[]
  export let onSelectFolder: (folder: Folder) => void
  export let onCreateFolder: () => void
  export let onDragStart: (folder: Folder) => void
  export let onDragOver: (e: DragEvent) => void
  export let onDrop: (folder: Folder) => void
  export let getFolderItems: (folderId: string) => string[]
</script>

<section class="view-container">
  <div class="card-grid">
    {#each folders as folder (folder.id)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="note-card folder-card"
        draggable="true"
        role="button"
        tabindex="0"
        on:dragstart={() => onDragStart(folder)}
        on:dragover={onDragOver}
        on:drop|preventDefault={() => onDrop(folder)}
        on:click={() => onSelectFolder(folder)}
      >
        <strong>{folder.name}</strong>
        <div class="card-meta">
          {#each getFolderItems(folder.id) as item}
            <small class="folder-item">{item}</small>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>

<div class="toolbar-fixed">
  <button type="button" on:click={onCreateFolder}>
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
    新規フォルダ
  </button>
</div>

<style>
  .view-container {
    padding: 1rem;
    height: calc(100vh - 80px - 60px);
    overflow-y: auto;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .note-card {
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .folder-card {
    background: var(--bg-tertiary);
  }

  .note-card:hover {
    border-color: var(--accent-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .card-meta {
    margin-top: 0.5rem;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .folder-item {
    display: block;
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
    justify-content: flex-end;
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

  :global(.button-icon) {
    margin-right: 0.25rem;
  }
</style>
