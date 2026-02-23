<script lang="ts">
  import { afterUpdate } from 'svelte'
  import { _, locale } from '../../lib/i18n'
  import type { Note, Leaf } from '../../lib/types'
  import { dirtyNoteIds, dirtyLeafIds } from '../../lib/stores'
  import NoteCard from '../cards/NoteCard.svelte'
  import BadgeButton from '../badges/BadgeButton.svelte'
  import HelpIcon from '../icons/HelpIcon.svelte'

  export let notes: Note[]
  export let allLeaves: Leaf[] = []
  export let onSelectNote: (note: Note) => void
  export let onDragStart: (note: Note) => void
  export let onDragEnd: () => void
  export let onDragOver: (e: DragEvent, note: Note) => void
  export let onDrop: (note: Note) => void
  export let dragOverNoteId: string | null = null
  export let isFirstPriorityFetched: boolean = false
  export let isPullCompleted: boolean = false
  export let selectedIndex: number = 0
  export let isActive: boolean = true
  export let vimMode: boolean = false
  export let onUpdateNoteBadge: (noteId: string, icon: string, color: string) => void
  export let priorityLeaf: Leaf | null = null
  export let onSelectPriority: () => void
  export let onUpdatePriorityBadge: (icon: string, color: string) => void
  export let offlineLeaf: Leaf | null = null
  export let onSelectOffline: () => void
  export let onUpdateOfflineBadge: (icon: string, color: string) => void
  export let isArchive: boolean = false

  // リアクティブにノートアイテムを計算（leavesが更新されるたびに再計算）
  function computeNoteItems(noteId: string, allNotes: Note[], leaves: Leaf[]): string[] {
    const subNotesNames = allNotes
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

  // notesとallLeavesが変わるたびに再計算
  $: noteItemsMap = new Map(
    notes.map((note) => [note.id, computeNoteItems(note.id, notes, allLeaves)])
  )

  // 特殊リーフ（Offline, Priority）のカウント（Vimナビゲーション用）
  // Priorityは全リーフPull完了後のみ表示されるのでカウントに含める
  $: specialLeafCount = (offlineLeaf ? 1 : 0) + (priorityLeaf && isPullCompleted ? 1 : 0)

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

  // ユーザーガイドのURL生成
  const USER_GUIDE_BASE = 'https://github.com/kako-jun/agasteer/blob/main/docs/user-guide'
  function getHelpUrl(page: 'offline' | 'priority'): string {
    const lang = $locale?.startsWith('ja') ? 'ja' : 'en'
    return `${USER_GUIDE_BASE}/${lang}/power/${page}.md`
  }
</script>

<section class="view-container">
  <div class="card-grid" class:loading={!isFirstPriorityFetched}>
    <!-- Offline リーフ: 常に最初に表示、Pull中もクリック可能 -->
    {#if offlineLeaf}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="leaf-card offline-leaf"
        class:selected={vimMode && isActive && selectedIndex === 0}
        role="button"
        tabindex="0"
        on:click={onSelectOffline}
      >
        <BadgeButton
          icon={offlineLeaf.badgeIcon || ''}
          color={offlineLeaf.badgeColor || ''}
          onChange={(icon, color) => onUpdateOfflineBadge(icon, color)}
        />
        <div class="leaf-title-row">
          <strong class="text-ellipsis">{offlineLeaf.title}</strong>
          <a
            class="help-link"
            href={getHelpUrl('offline')}
            target="_blank"
            rel="noopener noreferrer"
            title={$_('header.help')}
            aria-label={$_('header.help')}
            on:click|stopPropagation
          >
            <HelpIcon />
          </a>
        </div>
        <div class="card-meta">
          {#if offlineLeaf.content}
            <small class="leaf-stats">
              {formatLeafStats(offlineLeaf.content)}
            </small>
          {/if}
          <small
            class="leaf-updated"
            title={`${$_('note.updated')}: ${formatDateTime(offlineLeaf.updatedAt, 'long')}`}
            aria-label={`${$_('note.updated')}: ${formatDateTime(offlineLeaf.updatedAt, 'long')}`}
          >
            {formatDateTime(offlineLeaf.updatedAt, 'short')}
          </small>
        </div>
      </div>
    {/if}

    <!-- Priority リーフ: Offlineの次に表示（全リーフPull完了後のみ） -->
    {#if priorityLeaf && isPullCompleted}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="leaf-card"
        class:selected={vimMode && isActive && selectedIndex === (offlineLeaf ? 1 : 0)}
        role="button"
        tabindex="0"
        on:click={onSelectPriority}
      >
        <BadgeButton
          icon={priorityLeaf.badgeIcon || ''}
          color={priorityLeaf.badgeColor || ''}
          onChange={(icon, color) => onUpdatePriorityBadge(icon, color)}
        />
        <div class="leaf-title-row">
          <strong class="text-ellipsis">{priorityLeaf.title}</strong>
          <a
            class="help-link"
            href={getHelpUrl('priority')}
            target="_blank"
            rel="noopener noreferrer"
            title={$_('header.help')}
            aria-label={$_('header.help')}
            on:click|stopPropagation
          >
            <HelpIcon />
          </a>
        </div>
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

    <!-- ノートカード: 特殊リーフの後に表示 -->
    {#if notes.length === 0 && isFirstPriorityFetched}
      <div class="empty-state">
        <p>{isArchive ? $_('home.noNotesArchive') : $_('home.noNotes')}</p>
      </div>
    {:else if notes.length > 0}
      {#each notes as note, index (note.id)}
        <NoteCard
          {note}
          dragOver={dragOverNoteId === note.id}
          isSelected={isActive && index + specialLeafCount === selectedIndex}
          isDirty={allLeaves.some((l) => l.noteId === note.id && $dirtyLeafIds.has(l.id)) ||
            $dirtyNoteIds.has(note.id)}
          onSelect={() => onSelectNote(note)}
          onDragStart={() => onDragStart(note)}
          onDragEnd={() => onDragEnd()}
          onDragOver={(e) => onDragOver(e, note)}
          onDrop={() => onDrop(note)}
          items={noteItemsMap.get(note.id) || []}
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

  /* Pull中は全体を無効化 */
  .card-grid.loading {
    pointer-events: none;
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

  .leaf-title-row {
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .leaf-title-row strong {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
    max-height: 2.6em;
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

  .help-link {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0.6;
    transition:
      opacity 0.2s,
      color 0.2s;
  }

  .help-link:hover {
    opacity: 1;
    color: var(--accent);
  }

  .help-link :global(svg) {
    width: 14px;
    height: 14px;
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

  /* オフラインリーフ: Pull中もクリック可能 */
  .offline-leaf {
    position: relative;
    z-index: 201;
    pointer-events: auto;
  }
</style>
