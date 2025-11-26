<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Note } from '../../lib/types'
  import NoteCard from '../cards/NoteCard.svelte'
  import StatsPanel from '../layout/StatsPanel.svelte'

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
  export let selectedIndex: number = 0
  export let isActive: boolean = true
  export let vimMode: boolean = false
  export let leafCount: number = 0
  export let leafCharCount: number = 0
  export let pushCount: number = 0
</script>

<section class="view-container">
  <StatsPanel {leafCount} {leafCharCount} {pushCount} />

  <div class="card-grid">
    {#if notes.length === 0 && !disabled}
      <div class="empty-state">
        <p>{$_('home.noNotes')}</p>
      </div>
    {:else if notes.length > 0}
      {#each notes as note, index (note.id)}
        <NoteCard
          {note}
          dragOver={dragOverNoteId === note.id}
          isSelected={isActive && index === selectedIndex}
          onSelect={() => onSelectNote(note)}
          onDragStart={() => onDragStart(note)}
          onDragEnd={() => onDragEnd()}
          onDragOver={(e) => onDragOver(e, note)}
          onDrop={() => onDrop(note)}
          items={getNoteItems(note.id)}
          isGroup={true}
          {vimMode}
        />
      {/each}
    {/if}
  </div>
</section>

<style>
  .view-container {
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
    position: relative;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 0.75rem;
  }

  .empty-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    padding: 2rem;
    color: var(--text-muted);
    font-size: 0.95rem;
    line-height: 1.6;
    width: 100%;
    max-width: 500px;
  }

  .empty-state p {
    margin: 0;
    opacity: 0.8;
    white-space: pre-line;
  }
</style>
