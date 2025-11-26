<script lang="ts">
  import { flip } from 'svelte/animate'
  import { _ } from '../../lib/i18n'
  import type { Note, Leaf } from '../../lib/types'
  import NoteCard from '../cards/NoteCard.svelte'

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
  export let selectedIndex: number = 0
  export let isActive: boolean = true
  export let vimMode: boolean = false

  // リアクティブ宣言: ノートが変わるたびに再計算
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
    {#if subNotes.length === 0 && leaves.length === 0 && !disabled}
      <div class="empty-state">
        <p>{currentNote.parentId ? $_('note.noLeaves') : $_('note.noItems')}</p>
      </div>
    {:else if subNotes.length > 0 || leaves.length > 0}
      {#each subNotes as subNote, index (subNote.id)}
        <NoteCard
          note={subNote}
          dragOver={dragOverNoteId === subNote.id}
          isSelected={isActive && index === selectedIndex}
          onSelect={() => onSelectNote(subNote)}
          onDragStart={() => onDragStartNote(subNote)}
          onDragEnd={() => onDragEndNote()}
          onDragOver={(e) => onDragOverNote(e, subNote)}
          onDrop={() => onDropNote(subNote)}
          items={getNoteItems(subNote.id)}
          isGroup={true}
          {vimMode}
        />
      {/each}
      {#each leaves as leaf, leafIndex (leaf.id)}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="note-card leaf-card"
          class:drag-over={dragOverLeafId === leaf.id}
          class:selected={vimMode && isActive && subNotes.length + leafIndex === selectedIndex}
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
          <strong class="text-ellipsis">{leaf.title}</strong>
          <div class="card-meta">
            <small>{$_('note.updated')}: {formatDateTime(leaf.updatedAt)}</small>
          </div>
        </div>
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
    grid-template-columns: repeat(auto-fill, minmax(200px, 240px));
    gap: 1rem;
  }

  .note-card {
    padding: 1rem;
    border: 1px solid var(--border);
    background: var(--surface-1);
    cursor: pointer;
    transition: all 0.2s;
    overflow: hidden;
  }

  /* リーフは角丸を外してノートと区別する */
  .leaf-card {
    border-radius: 0;
  }

  .note-card:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .note-card.selected {
    border-color: var(--accent);
    background: var(--surface-2);
    box-shadow: 0 0 0 2px var(--accent);
  }

  .card-meta {
    margin-top: 0.5rem;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: flex-end;
    text-align: right;
    max-width: 100%;
    overflow: hidden;
  }

  .drag-over {
    border-color: var(--accent);
    background: var(--surface-2);
    box-shadow: 0 0 0 2px var(--accent);
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
