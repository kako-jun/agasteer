<script lang="ts">
  import { flip } from 'svelte/animate'
  import { afterUpdate } from 'svelte'
  import { _ } from '../../lib/i18n'
  import type { Note, Leaf } from '../../lib/types'
  import type { LeafSkeleton } from '../../lib/api'
  import { swipe } from '../../lib/actions'
  import { dirtyNoteIds, dirtyLeafIds } from '../../lib/stores'
  import NoteCard from '../cards/NoteCard.svelte'
  import BadgeButton from '../badges/BadgeButton.svelte'

  export let currentNote: Note
  export let subNotes: Note[]
  export let allNotes: Note[] = []
  export let leaves: Leaf[]
  export let allLeaves: Leaf[] = []
  export let onSelectNote: (note: Note) => void
  export let onSelectLeaf: (leaf: Leaf) => void
  export let onDragStartNote: (note: Note) => void
  export let onDragStartLeaf: (leaf: Leaf) => void
  export let onDragEndNote: () => void
  export let onDragEndLeaf: () => void
  export let onDragOverNote: (e: DragEvent, note: Note) => void
  export let onDragOverLeaf: (e: DragEvent, leaf: Leaf) => void
  export let onDropNote: (note: Note) => void
  export let onDropLeaf: (leaf: Leaf) => void
  export let dragOverNoteId: string | null = null
  export let dragOverLeafId: string | null = null
  export let isFirstPriorityFetched: boolean = false
  export let selectedIndex: number = 0
  export let isActive: boolean = true
  export let vimMode: boolean = false
  export let onUpdateNoteBadge: (noteId: string, icon: string, color: string) => void
  export let onUpdateLeafBadge: (leafId: string, icon: string, color: string) => void
  export let leafSkeletonMap: Map<string, LeafSkeleton> = new Map()
  export let onSwipeLeft: (() => void) | undefined = undefined
  export let onSwipeRight: (() => void) | undefined = undefined
  export let isArchive: boolean = false

  // リアクティブにノートアイテムを計算（leavesが更新されるたびに再計算）
  function computeNoteItems(noteId: string, notes: Note[], leaves: Leaf[]): string[] {
    const subNotesNames = notes
      .filter((f) => f.parentId === noteId)
      .sort((a, b) => a.order - b.order)
      .map((f) => `${f.name}/`)

    const leafNames = leaves
      .filter((n) => n.noteId === noteId)
      .sort((a, b) => a.order - b.order)
      .map((n) => n.title)

    const allItems = [...subNotesNames, ...leafNames]
    const hasMore = allItems.length > 3
    const items = allItems.slice(0, 3)

    if (hasMore) {
      items.push('...')
    }

    return items
  }

  // subNotesとallLeavesが変わるたびに再計算
  $: noteItemsMap = new Map(
    subNotes.map((note) => [note.id, computeNoteItems(note.id, allNotes, allLeaves)])
  )

  // Vimモードで選択が変わったら選択中のカードが見えるようにスクロール
  afterUpdate(() => {
    if (vimMode && isActive) {
      const selectedCard = document.querySelector('.note-card.selected') as HTMLElement
      if (selectedCard) {
        selectedCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  })

  // このノートに属するスケルトン（まだleavesに存在しないもの）
  $: skeletons = Array.from(leafSkeletonMap.values())
    .filter((s) => s.noteId === currentNote.id && !leaves.some((l) => l.id === s.id))
    .sort((a, b) => a.order - b.order)

  // 表示用: 実リーフ + スケルトンを統合してorder順にソート
  type DisplayItem = { type: 'leaf'; leaf: Leaf } | { type: 'skeleton'; skeleton: LeafSkeleton }
  $: displayItems = [
    ...leaves.map((leaf): DisplayItem => ({ type: 'leaf', leaf })),
    ...skeletons.map((skeleton): DisplayItem => ({ type: 'skeleton', skeleton })),
  ].sort((a, b) => {
    const orderA = a.type === 'leaf' ? a.leaf.order : a.skeleton.order
    const orderB = b.type === 'leaf' ? b.leaf.order : b.skeleton.order
    return orderA - orderB
  })

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

  function handleLeafKeydown(e: KeyboardEvent, leaf: Leaf) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelectLeaf(leaf)
    }
  }
</script>

<section
  class="view-container"
  use:swipe={{ onSwipeLeft, onSwipeRight, disabled: !onSwipeLeft && !onSwipeRight }}
>
  <div class="card-grid">
    {#if subNotes.length === 0 && displayItems.length === 0 && isFirstPriorityFetched}
      <div class="empty-state">
        <p>
          {#if isArchive}
            {currentNote.parentId ? $_('note.noLeavesArchive') : $_('note.noItemsArchive')}
          {:else}
            {currentNote.parentId ? $_('note.noLeaves') : $_('note.noItems')}
          {/if}
        </p>
      </div>
    {:else if subNotes.length > 0 || displayItems.length > 0}
      {#each subNotes as subNote, index (subNote.id)}
        <NoteCard
          note={subNote}
          dragOver={dragOverNoteId === subNote.id}
          isSelected={isActive && index === selectedIndex}
          isDirty={allLeaves.some((l) => l.noteId === subNote.id && $dirtyLeafIds.has(l.id)) ||
            $dirtyNoteIds.has(subNote.id)}
          onSelect={() => onSelectNote(subNote)}
          onDragStart={() => onDragStartNote(subNote)}
          onDragEnd={() => onDragEndNote()}
          onDragOver={(e) => onDragOverNote(e, subNote)}
          onDrop={() => onDropNote(subNote)}
          items={noteItemsMap.get(subNote.id) || []}
          isGroup={true}
          {vimMode}
          badgeIcon={subNote.badgeIcon || ''}
          badgeColor={subNote.badgeColor || ''}
          onBadgeChange={(icon, color) => onUpdateNoteBadge(subNote.id, icon, color)}
        />
      {/each}
      {#each displayItems as item, itemIndex (item.type === 'leaf' ? item.leaf.id : item.skeleton.id)}
        <!-- tabindexは条件付きrole="button"と連動、スケルトン時は-1 -->
        <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
        <div
          class="note-card leaf-card"
          class:loading={item.type === 'skeleton'}
          class:fade-in={item.type === 'leaf'}
          class:drag-over={item.type === 'leaf' && dragOverLeafId === item.leaf.id}
          class:selected={item.type === 'leaf' &&
            vimMode &&
            isActive &&
            subNotes.length + itemIndex === selectedIndex}
          draggable={item.type === 'leaf'}
          role={item.type === 'leaf' ? 'button' : undefined}
          tabindex={item.type === 'leaf' ? 0 : -1}
          on:dragstart={() => item.type === 'leaf' && onDragStartLeaf(item.leaf)}
          on:dragend={onDragEndLeaf}
          on:dragover={(e) => item.type === 'leaf' && onDragOverLeaf(e, item.leaf)}
          on:drop|preventDefault={() => item.type === 'leaf' && onDropLeaf(item.leaf)}
          on:click={() => item.type === 'leaf' && onSelectLeaf(item.leaf)}
          on:keydown={(e) => item.type === 'leaf' && handleLeafKeydown(e, item.leaf)}
          animate:flip={{ duration: 300 }}
        >
          {#if item.type === 'skeleton'}
            <!-- スケルトン表示 -->
            <div class="skeleton-badge"></div>
            <div class="skeleton-title"></div>
            <div class="skeleton-meta">
              <div class="skeleton-stats"></div>
              <div class="skeleton-date"></div>
            </div>
          {:else}
            <!-- 実リーフ表示 -->
            <BadgeButton
              icon={item.leaf.badgeIcon || ''}
              color={item.leaf.badgeColor || ''}
              onChange={(icon, color) => onUpdateLeafBadge(item.leaf.id, icon, color)}
            />
            <strong class="text-ellipsis">
              {item.leaf.title}
              {#if $dirtyLeafIds.has(item.leaf.id)}
                <span class="dirty-indicator" title={$_('leaf.unsaved')}></span>
              {/if}
            </strong>
            <div class="card-meta">
              {#if item.leaf.content}
                <small class="note-stats">
                  {formatLeafStats(item.leaf.content)}
                </small>
              {/if}
              <small
                class="note-updated"
                title={`${$_('note.updated')}: ${formatDateTime(item.leaf.updatedAt, 'long')}`}
                aria-label={`${$_('note.updated')}: ${formatDateTime(item.leaf.updatedAt, 'long')}`}
              >
                {formatDateTime(item.leaf.updatedAt, 'short')}
              </small>
            </div>
          {/if}
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

  /* リーフカード内のタイトルは2行まで、それ以上は省略 */
  .leaf-card strong {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
    max-height: 2.6em;
  }

  /* ダーティインジケーター（未保存の変更マーク） */
  .dirty-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
    margin-left: 4px;
    vertical-align: middle;
  }

  /* リーフは角丸を外してノートと区別する、高さ固定でレイアウト安定 */
  .leaf-card {
    border-radius: 0;
    height: 120px;
    min-height: 120px;
    max-height: 120px;
    overflow: hidden;
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

  /* ローディング中のカード */
  .note-card.loading {
    cursor: default;
    pointer-events: none;
  }

  /* 読み込み完了時のフェードイン */
  .note-card.fade-in {
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* スケルトン表示用スタイル */
  .skeleton-badge {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(
      90deg,
      var(--surface-2) 25%,
      var(--surface-1) 50%,
      var(--surface-2) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-title {
    height: 1.2em;
    width: 70%;
    margin-bottom: 0.5rem;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      var(--surface-2) 25%,
      var(--surface-1) 50%,
      var(--surface-2) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-meta {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: flex-end;
  }

  .skeleton-stats {
    height: 0.9em;
    width: 80px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      var(--surface-2) 25%,
      var(--surface-1) 50%,
      var(--surface-2) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-date {
    height: 0.9em;
    width: 100px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      var(--surface-2) 25%,
      var(--surface-1) 50%,
      var(--surface-2) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
</style>
