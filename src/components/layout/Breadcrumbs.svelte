<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Breadcrumb } from '../../lib/types'
  import IconButton from '../buttons/IconButton.svelte'
  import ShareButton from '../buttons/ShareButton.svelte'
  import HomeIcon from '../icons/HomeIcon.svelte'
  import EditIcon from '../icons/EditIcon.svelte'

  export let breadcrumbs: Breadcrumb[]
  export let editingId: string | null = null
  export let onStartEdit: (crumb: Breadcrumb) => void
  export let onSaveEdit: (id: string, newName: string, type: Breadcrumb['type']) => void
  export let onCancelEdit: () => void
  export let onCopyUrl: (() => void) | null = null
  export let onCopyMarkdown: (() => void) | null = null
  export let onShareImage: (() => void) | null = null
  export let isPreview: boolean = false

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

  // リーフ表示かどうかを判定
  $: isLeafView = breadcrumbs.some((crumb) => crumb.type === 'leaf')
</script>

<div class="breadcrumbs">
  <div class="breadcrumbs-left">
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
          {#if index === 0}
            <IconButton
              onClick={crumb.action}
              title={$_('breadcrumbs.goHome')}
              ariaLabel={$_('breadcrumbs.goHome')}
            >
              <HomeIcon />
            </IconButton>
          {:else}
            <button
              class="breadcrumb-button text-ellipsis"
              class:current={index === breadcrumbs.length - 1}
              on:click={crumb.action}
            >
              {crumb.label}
            </button>
          {/if}
          {#if index === breadcrumbs.length - 1 && (crumb.type === 'note' || crumb.type === 'leaf')}
            <IconButton
              onClick={() => handleStartEdit(crumb)}
              title={crumb.type === 'leaf'
                ? $_('breadcrumbs.editLeafName')
                : $_('breadcrumbs.editNoteName')}
              ariaLabel={crumb.type === 'leaf'
                ? $_('breadcrumbs.editLeafName')
                : $_('breadcrumbs.editNoteName')}
            >
              <EditIcon />
            </IconButton>
          {/if}
        {/if}
      </span>
    {/each}
  </div>

  {#if isLeafView && onCopyUrl && onCopyMarkdown}
    <ShareButton {onCopyUrl} {onCopyMarkdown} {onShareImage} {isPreview} />
  {/if}
</div>

<style>
  .breadcrumbs {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    height: 40px;
    background: rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(0, 0, 0, 0.15);
    font-size: 0.9rem;
    position: relative;
    z-index: 100;
  }

  .breadcrumbs-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
  }

  :global([data-theme='greenboard']) .breadcrumbs,
  :global([data-theme='dotsD']) .breadcrumbs,
  :global([data-theme='dotsF']) .breadcrumbs {
    background: rgba(255, 255, 255, 0.15);
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }

  .separator {
    color: var(--text-secondary);
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    max-width: 320px;
    min-width: 0;
  }

  .breadcrumb-button {
    background: none;
    border: none;
    color: var(--accent-color);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: background 0.2s;
    max-width: 100%;
  }
  .breadcrumb-button.current {
    color: var(--text-primary);
    cursor: default;
  }

  .breadcrumb-button:hover:not(.current) {
    opacity: 0.7;
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
