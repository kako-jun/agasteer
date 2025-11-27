<script lang="ts">
  import { afterUpdate } from 'svelte'
  import { _ } from '../../lib/i18n'
  import type { Note, Leaf } from '../../lib/types'
  import NoteCard from '../cards/NoteCard.svelte'
  import BadgeButton from '../badges/BadgeButton.svelte'
  import StatsPanel from '../layout/StatsPanel.svelte'

  export let notes: Note[]
  export let onSelectNote: (note: Note) => void
  export let onDragStart: (note: Note) => void
  export let onDragEnd: () => void
  export let onDragOver: (e: DragEvent, note: Note) => void
  export let onDrop: (note: Note) => void
  export let dragOverNoteId: string | null = null
  export let getNoteItems: (noteId: string) => string[]
  export let disabled: boolean = false
  export let selectedIndex: number = 0
  export let isActive: boolean = true
  export let vimMode: boolean = false
  export let leafCount: number = 0
  export let leafCharCount: number = 0
  export let pushCount: number = 0
  export let onUpdateNoteBadge: (noteId: string, icon: string, color: string) => void
  export let priorityLeaf: Leaf | null = null
  export let onSelectPriority: () => void
  export let onUpdatePriorityBadge: (icon: string, color: string) => void

  // Vimモードで選択が変わったら選択中のカードが見えるようにスクロール
  afterUpdate(() => {
    if (vimMode && isActive) {
      const selectedCard = document.querySelector(
        '.note-card.selected, .leaf-card.selected'
      ) as HTMLElement
      if (selectedCard) {
        selectedCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  })

  function formatDateTime(timestamp: number, variant: 'short' | 'long' = 'long'): string {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    if (variant === 'short') {
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
  <StatsPanel {leafCount} {leafCharCount} {pushCount} />

  <div class="card-grid">
    <!-- Priority リーフ: 常に先頭に表示 -->
    {#if priorityLeaf}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="leaf-card"
        class:selected={vimMode && isActive && selectedIndex === 0}
        role="button"
        tabindex="0"
        on:click={onSelectPriority}
      >
        <BadgeButton
          icon={priorityLeaf.badgeIcon || ''}
          color={priorityLeaf.badgeColor || ''}
          onChange={(icon, color) => onUpdatePriorityBadge(icon, color)}
        />
        <strong class="text-ellipsis">{priorityLeaf.title}</strong>
        <div class="card-meta">
          {#if priorityLeaf.content}
            <small class="leaf-stats">
              {formatLeafStats(priorityLeaf.content)}
            </small>
          {/if}
          <small
            class="leaf-updated"
            title={`${$_('note.updated')}: ${formatDateTime(priorityLeaf.updatedAt, 'long')}`}
            aria-label={`${$_('note.updated')}: ${formatDateTime(priorityLeaf.updatedAt, 'long')}`}
          >
            {formatDateTime(priorityLeaf.updatedAt, 'short')}
          </small>
        </div>
      </div>
    {/if}

    {#if notes.length === 0 && !disabled}
      <div class="empty-state">
        <p>{$_('home.noNotes')}</p>
      </div>
    {:else if notes.length > 0}
      {#each notes as note, index (note.id)}
        <NoteCard
          {note}
          dragOver={dragOverNoteId === note.id}
          isSelected={isActive && index + 1 === selectedIndex}
          onSelect={() => onSelectNote(note)}
          onDragStart={() => onDragStart(note)}
          onDragEnd={() => onDragEnd()}
          onDragOver={(e) => onDragOver(e, note)}
          onDrop={() => onDrop(note)}
          items={getNoteItems(note.id)}
          isGroup={true}
          {vimMode}
          badgeIcon={note.badgeIcon || ''}
          badgeColor={note.badgeColor || ''}
          onBadgeChange={(icon, color) => onUpdateNoteBadge(note.id, icon, color)}
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

  /* リーフカード（NoteViewと同じスタイル） */
  .leaf-card {
    display: flex;
    flex-direction: column;
    position: relative;
    padding: 1rem;
    border: 1px solid var(--border);
    background: var(--surface-1);
    cursor: pointer;
    transition: all 0.2s;
    overflow: hidden;
    border-radius: 0;
    height: 120px;
    min-height: 120px;
    max-height: 120px;
  }

  .leaf-card strong {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
    max-height: 2.6em;
    margin-bottom: 0.5rem;
  }

  .leaf-card:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .leaf-card.selected {
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

  .leaf-updated {
    display: inline-block;
    white-space: nowrap;
  }

  .leaf-stats {
    display: inline-block;
    white-space: nowrap;
  }
</style>
