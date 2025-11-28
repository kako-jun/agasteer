<script lang="ts">
  import { _ } from 'svelte-i18n'
  import type { Note, Leaf } from '../../lib/types'
  import MoveIcon from '../icons/MoveIcon.svelte'

  export let show: boolean
  export let notes: Note[]
  export let targetNote: Note | null = null
  export let targetLeaf: Leaf | null = null
  export let onConfirm: (destNoteId: string | null) => void
  export let onClose: () => void

  const sortedRoots = () => notes.filter((n) => !n.parentId).sort((a, b) => a.order - b.order)

  function getChildren(parentId: string) {
    return notes.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order)
  }

  function isDescendant(sourceId: string, candidateId: string): boolean {
    const children = notes.filter((n) => n.parentId === sourceId)
    for (const child of children) {
      if (child.id === candidateId) return true
      if (isDescendant(child.id, candidateId)) return true
    }
    return false
  }

  function isLeafMode() {
    return !!targetLeaf
  }

  function shouldShow(note: Note): boolean {
    if (isLeafMode()) return true
    if (!targetNote) return true
    if (note.id === targetNote.id) return false
    if (isDescendant(targetNote.id, note.id)) return false
    // 選択できないものは表示しない
    if (!canSelect(note).selectable) return false
    return true
  }

  function canSelect(dest: Note | null): { selectable: boolean; reason?: string } {
    if (isLeafMode()) {
      if (!dest) return { selectable: false, reason: $_('move.cannotPlaceAtHome') }
      if (targetLeaf && targetLeaf.noteId === dest.id) {
        return { selectable: false, reason: $_('move.sameNote') }
      }
      return { selectable: true }
    }

    // note mode
    if (!targetNote) return { selectable: false }

    // ホーム直下
    if (!dest) {
      if (!targetNote.parentId) return { selectable: false, reason: $_('move.currentlyAtHome') }
      return { selectable: true }
    }

    // 自分自身は不可
    if (dest.id === targetNote.id) return { selectable: false }

    // 子孫ノートは不可
    if (isDescendant(targetNote.id, dest.id)) return { selectable: false }

    // サブノートをさらに深くしない（サブノート→サブノート）
    if (targetNote.parentId && dest.parentId) return { selectable: false }

    // ルートノートをサブノートに移動しない（ルート→サブノートは3階層になる）
    if (!targetNote.parentId && dest.parentId) return { selectable: false }

    return { selectable: true }
  }

  let selected: string | null = null

  $: if (show) {
    if (isLeafMode()) {
      selected = null
    } else if (targetNote) {
      selected = targetNote.parentId || null
    } else {
      selected = null
    }
  }

  function handleSelect(destId: string | null) {
    selected = destId
  }

  function handleKeydown(e: KeyboardEvent, destId: string | null, selectable: boolean) {
    if ((e.key === 'Enter' || e.key === ' ') && selectable) {
      e.preventDefault()
      handleSelect(destId)
    }
  }

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close()
    }
  }

  function confirm() {
    if (selected === null && isLeafMode()) return
    onConfirm(selected)
  }
  function close() {
    onClose()
  }
</script>

{#if show}
  <div
    class="move-overlay"
    on:click={close}
    on:keydown={handleOverlayKeydown}
    role="button"
    tabindex="-1"
    aria-label={$_('move.cancel')}
  >
    <!-- イベント伝播停止はオーバーレイクリック時にモーダルが閉じないようにするため -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <section
      class="move-modal"
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-modal-title"
    >
      <header>
        <div class="titles">
          <h2 id="move-modal-title">{$_('move.title')}</h2>
        </div>
      </header>

      <div class="list" role="listbox" tabindex="-1">
        <div class="tree">
          {#if !isLeafMode()}
            {#if canSelect(null).selectable}
              <button
                type="button"
                class="row"
                aria-pressed={selected === null}
                on:click={() => handleSelect(null)}
              >
                <span class="bullet" class:checked={selected === null}></span>
                <span class="row-body">
                  <span class="row-title">{$_('move.home')}</span>
                </span>
              </button>
            {:else}
              <button type="button" class="row disabled" disabled aria-disabled="true">
                <span class="bullet"></span>
                <span class="row-body">
                  <span class="row-title muted">{$_('move.home')}</span>
                  <small>{canSelect(null).reason}</small>
                </span>
              </button>
            {/if}
          {/if}

          {#each sortedRoots().filter((r) => shouldShow(r)) as root}
            <button
              type="button"
              class="row"
              class:disabled={!canSelect(root).selectable}
              disabled={!canSelect(root).selectable}
              aria-pressed={selected === root.id}
              on:click={() => canSelect(root).selectable && handleSelect(root.id)}
            >
              <span class="bullet" class:checked={selected === root.id}></span>
              <span class="row-body">
                <span class="row-title">{root.name}</span>
                {#if canSelect(root).reason}
                  <small>{canSelect(root).reason}</small>
                {/if}
              </span>
            </button>

            {#if getChildren(root.id).filter((c) => shouldShow(c)).length > 0}
              <div class="children">
                {#each getChildren(root.id).filter((c) => shouldShow(c)) as child}
                  <button
                    type="button"
                    class="row"
                    class:disabled={!canSelect(child).selectable}
                    disabled={!canSelect(child).selectable}
                    aria-pressed={selected === child.id}
                    on:click={() => canSelect(child).selectable && handleSelect(child.id)}
                  >
                    <span class="bullet" class:checked={selected === child.id}></span>
                    <span class="row-body">
                      <span class="row-title">{child.name}</span>
                      {#if canSelect(child).reason}
                        <small>{canSelect(child).reason}</small>
                      {/if}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      </div>

      <div class="actions">
        <button class="ghost" on:click={close}>{$_('move.cancel')}</button>
        <button class="primary" disabled={selected === null && isLeafMode()} on:click={confirm}>
          <MoveIcon />
          {$_('move.confirm')}
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  .move-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .move-modal {
    width: min(520px, 100%);
    max-height: 90vh;
    background: var(--bg);
    border-radius: 10px;
    padding: 1.25rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    text-align: left;
    writing-mode: horizontal-tb;
    direction: ltr;
  }

  .move-modal * {
    writing-mode: horizontal-tb;
    direction: ltr;
    color: var(--text);
  }

  header {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .titles h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .list {
    border: none;
    background: transparent;
    border-radius: 10px;
    padding: 0.5rem 0.25rem;
    overflow-y: auto;
    overflow-x: hidden;
    max-height: 55vh;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    writing-mode: horizontal-tb;
    direction: ltr;
  }

  .tree {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    writing-mode: horizontal-tb;
    direction: ltr;
  }

  .row {
    display: grid;
    grid-template-columns: 16px 1fr;
    gap: 0.6rem;
    padding: 0.55rem 0.6rem;
    border-radius: 6px;
    border: none;
    align-items: center;
    cursor: pointer;
    transition: background 0.12s ease;
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    writing-mode: horizontal-tb;
    direction: ltr;
    color: var(--text);
    background: transparent;
    font-size: inherit;
    font-family: inherit;
    font-weight: normal;
  }

  .row:hover {
    background: var(--surface-2);
  }

  .row.disabled,
  .row:disabled {
    cursor: not-allowed;
    opacity: 0.5;
    background: transparent;
  }

  .row:disabled:hover {
    background: transparent;
  }

  .row-body {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    flex: 1;
    min-width: 0;
  }

  .row-title {
    font-weight: 600;
  }

  .row-title.muted {
    color: var(--text-muted);
  }

  .bullet {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-sizing: border-box;
    margin-top: 0;
  }

  .bullet.checked {
    border-color: var(--accent);
    background: var(--accent);
  }

  small {
    color: var(--text-muted);
  }

  .children {
    margin-left: 1rem;
    border-left: 1px solid var(--border);
    padding-left: 0.75rem;
    margin-top: 0.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .ghost,
  .primary {
    padding: 0.65rem 1rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    cursor: pointer;
    font-weight: 600;
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }

  .ghost {
    background: var(--surface-1);
  }

  .primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
