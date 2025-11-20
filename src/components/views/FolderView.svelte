<script lang="ts">
  import type { Folder, Note } from '../../lib/types'

  export let currentFolder: Folder
  export let subfolders: Folder[]
  export let notes: Note[]
  export let onSelectFolder: (folder: Folder) => void
  export let onSelectNote: (note: Note) => void
  export let onCreateFolder: () => void
  export let onCreateNote: () => void
  export let onDeleteFolder: () => void
  export let onDragStartFolder: (folder: Folder) => void
  export let onDragStartNote: (note: Note) => void
  export let onDragOver: (e: DragEvent) => void
  export let onDropFolder: (folder: Folder) => void
  export let onDropNote: (note: Note) => void
  export let getNoteCount: (folderId: string) => number

  const canHaveSubfolder = !currentFolder.parentId
</script>

<section class="view-container">
  <div class="card-grid">
    {#each subfolders as subfolder (subfolder.id)}
      <div
        class="note-card folder-card"
        draggable="true"
        on:dragstart={() => onDragStartFolder(subfolder)}
        on:dragover={onDragOver}
        on:drop|preventDefault={() => onDropFolder(subfolder)}
        on:click={() => onSelectFolder(subfolder)}
      >
        <strong>{subfolder.name}</strong>
        <div class="card-meta">
          <small>{getNoteCount(subfolder.id)} ノート</small>
        </div>
      </div>
    {/each}
    {#each notes as note (note.id)}
      <div
        class="note-card"
        draggable="true"
        on:dragstart={() => onDragStartNote(note)}
        on:dragover={onDragOver}
        on:drop|preventDefault={() => onDropNote(note)}
        on:click={() => onSelectNote(note)}
      >
        <strong>{note.title}</strong>
        <div class="card-meta">
          <small>{new Date(note.updatedAt).toLocaleDateString()}</small>
        </div>
      </div>
    {/each}
  </div>
</section>

<div class="toolbar-fixed">
  <button type="button" class="secondary" on:click={onDeleteFolder}>
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
    フォルダを削除
  </button>

  <div style="flex: 1;"></div>

  {#if canHaveSubfolder}
    <button type="button" class="secondary" on:click={onCreateFolder}>
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
      新規サブフォルダ
    </button>
  {/if}

  <button type="button" on:click={onCreateNote}>
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
    新規ノート
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
</style>
