<script lang="ts">
  import type { Breadcrumb } from '../../lib/types'

  export let breadcrumbs: Breadcrumb[]
  export let editingId: string | null = null
  export let onStartEdit: (crumb: Breadcrumb) => void
  export let onSaveEdit: (id: string, newName: string, type: Breadcrumb['type']) => void
  export let onCancelEdit: () => void

  let inputValue = ''
  let inputElement: HTMLInputElement | null = null

  function handleStartEdit(crumb: Breadcrumb) {
    if (crumb.type === 'home' || crumb.type === 'settings') return
    inputValue = crumb.label
    onStartEdit(crumb)
    setTimeout(() => {
      inputElement?.focus()
      inputElement?.select()
    }, 0)
  }

  function handleKeydown(e: KeyboardEvent, crumb: Breadcrumb) {
    if (e.key === 'Enter') {
      if (inputValue.trim()) {
        onSaveEdit(crumb.id, inputValue.trim(), crumb.type)
      }
    } else if (e.key === 'Escape') {
      onCancelEdit()
    }
  }

  function handleBlur(crumb: Breadcrumb) {
    if (inputValue.trim()) {
      onSaveEdit(crumb.id, inputValue.trim(), crumb.type)
    } else {
      onCancelEdit()
    }
  }
</script>

<div class="breadcrumbs">
  {#each breadcrumbs as crumb, index}
    {#if index > 0}
      <span class="separator">›</span>
    {/if}

    <span class="breadcrumb-item">
      {#if editingId === crumb.id}
        <input
          bind:this={inputElement}
          bind:value={inputValue}
          on:keydown={(e) => handleKeydown(e, crumb)}
          on:blur={() => handleBlur(crumb)}
          class="breadcrumb-input"
        />
      {:else}
        <button
          class="breadcrumb-button"
          class:current={index === breadcrumbs.length - 1}
          on:click={crumb.action}
        >
          {#if index === 0}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          {:else}
            {crumb.label}
          {/if}
        </button>
        {#if index === breadcrumbs.length - 1 && (crumb.type === 'folder' || crumb.type === 'note')}
          <button
            class="edit-button"
            on:click={() => handleStartEdit(crumb)}
            title={crumb.type === 'note' ? 'ノート名を編集' : 'フォルダ名を編集'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </button>
        {/if}
      {/if}
    </span>
  {/each}
</div>

<style>
  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1rem;
    height: 40px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    font-size: 0.9rem;
    flex-wrap: wrap;
  }

  .separator {
    color: var(--text-secondary);
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .breadcrumb-button {
    background: none;
    border: none;
    color: var(--accent-color);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: background 0.2s;
  }
  .breadcrumb-button.current {
    color: var(--text-primary);
    cursor: default;
  }

  .breadcrumb-button:hover {
    background: var(--bg-primary);
  }

  .edit-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    font-size: 0.8rem;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .edit-button:hover {
    opacity: 1;
  }

  .breadcrumb-input {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--accent-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.9rem;
    outline: none;
  }
</style>
