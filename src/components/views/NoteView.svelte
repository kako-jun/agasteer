<script lang="ts">
  import Footer from '../layout/Footer.svelte'
  import type { Note, Leaf } from '../../lib/types'

  export let currentNote: Note
  export let subNotes: Note[]
  export let leaves: Leaf[]
  export let onSelectNote: (note: Note) => void
  export let onSelectLeaf: (leaf: Leaf) => void
  export let onCreateNote: () => void
  export let onCreateLeaf: () => void
  export let onDeleteNote: () => void
  export let onDragStartNote: (note: Note) => void
  export let onDragStartLeaf: (leaf: Leaf) => void
  export let onDragOver: (e: DragEvent) => void
  export let onDropNote: (note: Note) => void
  export let onDropLeaf: (leaf: Leaf) => void
  export let onSave: () => void
  export let getNoteItems: (noteId: string) => string[]
  export let disabled: boolean = false

  const canHaveSubNote = !currentNote.parentId
</script>

<section class="view-container">
  <div class="card-grid">
    {#each subNotes as subNote (subNote.id)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="note-card note-group-card"
        draggable="true"
        role="button"
        tabindex="0"
        on:dragstart={() => onDragStartNote(subNote)}
        on:dragover={onDragOver}
        on:drop|preventDefault={() => onDropNote(subNote)}
        on:click={() => onSelectNote(subNote)}
      >
        <strong>{subNote.name}</strong>
        <div class="card-meta">
          {#each getNoteItems(subNote.id) as item}
            <small class="note-item">{item}</small>
          {/each}
        </div>
      </div>
    {/each}
    {#each leaves as leaf (leaf.id)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="note-card"
        draggable="true"
        role="button"
        tabindex="0"
        on:dragstart={() => onDragStartLeaf(leaf)}
        on:dragover={onDragOver}
        on:drop|preventDefault={() => onDropLeaf(leaf)}
        on:click={() => onSelectLeaf(leaf)}
      >
        <strong>{leaf.title}</strong>
        <div class="card-meta">
          <small>更新: {new Date(leaf.updatedAt).toLocaleDateString()}</small>
        </div>
      </div>
    {/each}
  </div>
</section>

<Footer>
  <svelte:fragment slot="left">
    <button
      type="button"
      on:click={onDeleteNote}
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

    {#if canHaveSubNote}
      <button
        type="button"
        on:click={onCreateNote}
        title="新規サブノート"
        aria-label="新規サブノート"
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
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      </button>
    {/if}

    <button
      type="button"
      on:click={onCreateLeaf}
      title="新規リーフ"
      aria-label="新規リーフ"
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
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    </button>
  </svelte:fragment>

  <svelte:fragment slot="right">
    <button type="button" class="primary" on:click={onSave} title="保存" aria-label="保存">
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

  .note-group-card {
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

  .note-item {
    display: block;
  }
</style>
