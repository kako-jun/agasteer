<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Note } from '../../lib/types'
  import { metadata } from '../../lib/stores'
  import NoteCard from '../cards/NoteCard.svelte'

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
  <div class="statistics">
    <div class="stat-item">
      <div class="stat-label">{$_('home.pushCount')}</div>
      <div class="stat-value">{$metadata.pushCount.toLocaleString()}</div>
    </div>
  </div>

  <div class="card-grid">
    {#each notes as note (note.id)}
      <NoteCard
        {note}
        dragOver={dragOverNoteId === note.id}
        onSelect={() => onSelectNote(note)}
        onDragStart={() => onDragStart(note)}
        onDragEnd={() => onDragEnd()}
        onDragOver={(e) => onDragOver(e, note)}
        onDrop={() => onDrop(note)}
        items={getNoteItems(note.id)}
        isGroup={true}
      />
    {/each}
  </div>
</section>

<style>
  .view-container {
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
    position: relative;
  }

  .statistics {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    z-index: 0;
    opacity: 0.5;
    pointer-events: none;
  }

  .stat-item {
    text-align: right;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: var(--accent-color);
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 240px));
    gap: 1rem;
    position: relative;
    z-index: 1;
  }
</style>
