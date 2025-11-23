<script lang="ts">
  import { flip } from 'svelte/animate'
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
  export let onDragEndNote: () => void
  export let onDragEndLeaf: () => void
  export let onDragOverNote: (e: DragEvent, note: Note) => void
  export let onDragOverLeaf: (e: DragEvent, leaf: Leaf) => void
  export let onDropNote: (note: Note) => void
  export let onDropLeaf: (leaf: Leaf) => void
  export let onSave: () => void
  export let dragOverNoteId: string | null = null
  export let dragOverLeafId: string | null = null
  export let getNoteItems: (noteId: string) => string[]
  export let disabled: boolean = false

  // リアクティブ宣言: currentNoteが変わるたびに再計算
  $: canHaveSubNote = !currentNote.parentId

  function formatDateTime(timestamp: number): string {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }
</script>

<section class="view-container">
  <div class="card-grid">
    {#each subNotes as subNote (subNote.id)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="note-card note-group-card"
        class:drag-over={dragOverNoteId === subNote.id}
        draggable="true"
        role="button"
        tabindex="0"
        on:dragstart={() => onDragStartNote(subNote)}
        on:dragend={onDragEndNote}
        on:dragover={(e) => onDragOverNote(e, subNote)}
        on:drop|preventDefault={() => onDropNote(subNote)}
        on:click={() => onSelectNote(subNote)}
        animate:flip={{ duration: 300 }}
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
        class:drag-over={dragOverLeafId === leaf.id}
        draggable="true"
        role="button"
        tabindex="0"
        on:dragstart={() => onDragStartLeaf(leaf)}
        on:dragend={onDragEndLeaf}
        on:dragover={(e) => onDragOverLeaf(e, leaf)}
        on:drop|preventDefault={() => onDropLeaf(leaf)}
        on:click={() => onSelectLeaf(leaf)}
        animate:flip={{ duration: 300 }}
      >
        <strong>{leaf.title}</strong>
        <div class="card-meta">
          <small>更新: {formatDateTime(leaf.updatedAt)}</small>
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  .view-container {
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 240px));
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

  .drag-over {
    border-color: var(--accent-color);
    background: var(--bg-tertiary);
    box-shadow: 0 0 0 2px var(--accent-color);
  }
</style>
