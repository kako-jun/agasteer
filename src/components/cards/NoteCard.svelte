<script lang="ts">
  import type { Note } from '../../lib/types'

  export let note: Note
  export let dragOver: boolean = false
  export let isSelected: boolean = false
  export let onSelect: () => void
  export let onDragStart: () => void
  export let onDragEnd: () => void
  export let onDragOver: (e: DragEvent) => void
  export let onDrop: () => void
  export let items: string[] = []
  export let isGroup: boolean = false
  export let vimMode: boolean = false
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="note-card"
  class:note-group-card={isGroup}
  class:drag-over={dragOver}
  class:selected={vimMode && isSelected}
  draggable="true"
  role="button"
  tabindex="0"
  on:dragstart={onDragStart}
  on:dragend={onDragEnd}
  on:dragover={onDragOver}
  on:drop|preventDefault={onDrop}
  on:click={onSelect}
>
  <strong class="text-ellipsis">{note.name}</strong>
  <div class="card-meta">
    {#each items as item}
      <small class="note-item text-ellipsis">{item}</small>
    {/each}
  </div>
</div>

<style>
  .note-card {
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-1);
    cursor: pointer;
    transition: all 0.2s;
    overflow: hidden;
  }

  .note-card strong {
    display: block;
    max-width: 100%;
  }

  .note-group-card {
    background: var(--surface-2);
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
    padding-left: 0.5rem; /* 抜粋は少しインデントして本文と区別 */
  }

  .note-item {
    display: block;
    max-width: 100%;
  }

  .drag-over {
    border-color: var(--accent);
    background: var(--surface-2);
    box-shadow: 0 0 0 2px var(--accent);
  }
</style>
