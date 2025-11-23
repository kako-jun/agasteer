<script lang="ts">
  import { flip } from 'svelte/animate'
  import type { Note } from '../../lib/types'

  export let notes: Note[]
  export let onSelectNote: (note: Note) => void
  export let onCreateNote: () => void
  export let onDragStart: (note: Note) => void
  export let onDragEnd: () => void
  export let onDragOver: (e: DragEvent, note: Note) => void
  export let onDrop: (note: Note) => void
  export let onSave: () => void
  export let dragOverNoteId: string | null = null
  export let getNoteItems: (noteId: string) => string[]
  export let disabled: boolean = false
</script>

<section class="view-container">
  <div class="card-grid">
    {#each notes as note (note.id)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="note-card note-group-card"
        class:drag-over={dragOverNoteId === note.id}
        draggable="true"
        role="button"
        tabindex="0"
        on:dragstart={() => onDragStart(note)}
        on:dragend={onDragEnd}
        on:dragover={(e) => onDragOver(e, note)}
        on:drop|preventDefault={() => onDrop(note)}
        on:click={() => onSelectNote(note)}
        animate:flip={{ duration: 300 }}
      >
        <strong>{note.name}</strong>
        <div class="card-meta">
          {#each getNoteItems(note.id) as item}
            <small class="note-item">{item}</small>
          {/each}
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
