<script lang="ts">
  import { flip } from 'svelte/animate'
  import { _ } from '../../lib/i18n'
  import type { Note, Leaf } from '../../lib/types'
  import NoteCard from '../cards/NoteCard.svelte'
  import BadgeButton from '../badges/BadgeButton.svelte'

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
  export let onUpdateNoteBadge: (noteId: string, icon: string, color: string) => void
  export let onUpdateLeafBadge: (leafId: string, icon: string, color: string) => void

  // リアクティブ宣言: ノートが変わるたびに再計算
  $: canHaveSubNote = !currentNote.parentId

  function formatDateTime(timestamp: number, variant: 'short' | 'long' = 'long'): string {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    if (variant === 'short') {
      // ISO風にして順序を明確化（国際的に誤読されにくい）
      return `${year}-${month}-${day} ${hours}:${minutes}`
    }

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  function getLeafStats(content: string): { chars: number; lines: number } {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0).length
    const chars = content.replace(/\s+/g, '').length
    return { chars, lines }
  }

  function formatNumber(value: number): string {
    return new Intl.NumberFormat().format(value)
  }

  function formatLeafStats(content: string): string {
    const { chars, lines } = getLeafStats(content)
    return `${formatNumber(chars)} chars · ${formatNumber(lines)} lines`
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
          badgeIcon={subNote.badgeIcon || ''}
          badgeColor={subNote.badgeColor || ''}
          onBadgeChange={(icon, color) => onUpdateNoteBadge(subNote.id, icon, color)}
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
          <BadgeButton
            icon={leaf.badgeIcon || ''}
            color={leaf.badgeColor || ''}
            onChange={(icon, color) => onUpdateLeafBadge(leaf.id, icon, color)}
          />
          <strong class="text-ellipsis">{leaf.title}</strong>
          <div class="card-meta">
            {#if leaf.content}
              <small class="note-stats">
                {formatLeafStats(leaf.content)}
              </small>
            {/if}
            <small
              class="note-updated"
              title={`${$_('note.updated')}: ${formatDateTime(leaf.updatedAt, 'long')}`}
              aria-label={`${$_('note.updated')}: ${formatDateTime(leaf.updatedAt, 'long')}`}
            >
              {formatDateTime(leaf.updatedAt, 'short')}
            </small>
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
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 0.75rem;
  }

  .note-card {
    display: flex;
    flex-direction: column;
    position: relative;
    padding: 1rem;
    border: 1px solid var(--border);
    background: var(--surface-1);
    cursor: pointer;
    transition: all 0.2s;
    overflow: visible;
    height: 100%;
  }

  .note-card strong {
    display: block;
    margin-bottom: 0.5rem;
    max-width: 100%;
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
    margin-top: auto;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: flex-end;
    text-align: right;
    max-width: 100%;
    overflow: hidden;
  }

  .note-updated {
    display: inline-block;
    white-space: nowrap;
  }

  .note-stats {
    display: inline-block;
    white-space: nowrap;
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
