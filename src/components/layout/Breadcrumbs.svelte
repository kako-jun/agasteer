<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Breadcrumb, BreadcrumbSibling, WorldType } from '../../lib/types'
  import IconButton from '../buttons/IconButton.svelte'
  import ShareButton from '../buttons/ShareButton.svelte'
  import HomeIcon from '../icons/HomeIcon.svelte'
  import EditIcon from '../icons/EditIcon.svelte'
  import ArchiveIcon from '../icons/ArchiveIcon.svelte'
  import { isOfflineLeaf, isPriorityLeaf } from '../../lib/utils'
  import { portal } from '../../lib/actions'

  export let breadcrumbs: Breadcrumb[]
  export let editingId: string | null = null
  export let onStartEdit: (crumb: Breadcrumb) => void
  export let onSaveEdit: (id: string, newName: string, type: Breadcrumb['type']) => void
  export let onCancelEdit: () => void
  export let onCopyUrl: (() => void) | null = null
  export let onCopyMarkdown: (() => void) | null = null
  export let onShareImage: (() => void) | null = null
  export let onShareSelectionImage: (() => void) | null = null
  export let isPreview: boolean = false
  export let getHasSelection: (() => boolean) | null = null
  export let getSelectedText: (() => string) | null = null
  export let getMarkdownContent: (() => string) | null = null
  export let onSelectSibling: ((id: string, type: 'note' | 'leaf') => void) | null = null
  /** 現在のワールド */
  export let currentWorld: WorldType = 'home'
  /** ワールド切り替え時のコールバック */
  export let onWorldChange: ((world: WorldType) => void) | null = null
  /** アーカイブがロード中かどうか */
  export let isArchiveLoading: boolean = false

  let inputValue = ''
  let inputElement: HTMLInputElement | null = null
  let openDropdownIndex: number | null = null
  let worldDropdownOpen = false
  let worldSeparatorButton: HTMLButtonElement | null = null
  let menuPosition = { top: 0, left: 0 }

  function toggleWorldDropdown(e: MouseEvent) {
    e.stopPropagation()
    // 他のドロップダウンを閉じる
    openDropdownIndex = null
    if (!worldDropdownOpen && worldSeparatorButton) {
      // ボタンの位置を取得してメニューの位置を計算
      const rect = worldSeparatorButton.getBoundingClientRect()
      menuPosition = {
        top: rect.bottom + 4,
        left: rect.left,
      }
    }
    worldDropdownOpen = !worldDropdownOpen
  }

  function handleWorldSelect(world: WorldType) {
    if (world !== currentWorld && onWorldChange) {
      onWorldChange(world)
    }
    worldDropdownOpen = false
  }

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

  function toggleDropdown(index: number) {
    // ワールドドロップダウンを閉じる
    worldDropdownOpen = false
    if (openDropdownIndex === index) {
      openDropdownIndex = null
    } else {
      openDropdownIndex = index
    }
  }

  function closeDropdown() {
    openDropdownIndex = null
  }

  function handleSiblingClick(sibling: BreadcrumbSibling, crumb: Breadcrumb) {
    if (sibling.isCurrent) {
      closeDropdown()
      return
    }
    if (onSelectSibling && (crumb.type === 'note' || crumb.type === 'leaf')) {
      onSelectSibling(sibling.id, crumb.type)
    }
    closeDropdown()
  }

  // ドロップダウン外クリックで閉じる
  function handleWindowClick(e: MouseEvent) {
    closeDropdown()
    // ワールドセパレータドロップダウン外のクリックなら閉じる
    if (worldDropdownOpen) {
      const target = e.target as HTMLElement
      // world-menu内またはworld-separatorをクリックした場合は閉じない
      if (!target.closest('.world-menu') && !target.closest('.world-separator')) {
        worldDropdownOpen = false
      }
    }
  }

  // リーフ表示かどうかを判定
  $: isLeafView = breadcrumbs.some((crumb) => crumb.type === 'leaf')
</script>

<svelte:window on:click={handleWindowClick} />

<div class="breadcrumbs">
  <div class="breadcrumbs-left">
    {#each breadcrumbs as crumb, index}
      {#if index > 0}
        <!-- セパレータ: 現在のパンくず（セパレータの右側）にsiblingsがあればドロップダウン表示 -->
        {#if crumb.siblings && crumb.siblings.length > 0}
          <div class="separator-dropdown">
            <button
              class="separator clickable"
              on:click|stopPropagation={() => toggleDropdown(index)}
              title={$_('breadcrumbs.showSiblings')}
              aria-label={$_('breadcrumbs.showSiblings')}
              aria-expanded={openDropdownIndex === index}
            >
              ›
            </button>
            {#if openDropdownIndex === index}
              <div
                class="dropdown-menu"
                role="menu"
                tabindex="-1"
                on:click|stopPropagation
                on:keydown|stopPropagation
              >
                {#each crumb.siblings as sibling}
                  <button
                    class="dropdown-item"
                    class:current={sibling.isCurrent}
                    on:click={() => handleSiblingClick(sibling, crumb)}
                  >
                    {sibling.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <span class="separator">›</span>
        {/if}
      {/if}

      <!-- ワールド切り替えセパレータ（Homeの左、breadcrumb-itemの外に配置してoverflow: hiddenの影響を受けないようにする） -->
      {#if index === 0 && onWorldChange}
        <div class="world-separator-dropdown">
          <button
            bind:this={worldSeparatorButton}
            class="world-separator clickable"
            on:click={toggleWorldDropdown}
            title={$_('breadcrumbs.goArchive')}
            aria-label={$_('breadcrumbs.goArchive')}
            aria-expanded={worldDropdownOpen}
          >
            ›
          </button>
          {#if worldDropdownOpen}
            <div
              class="world-menu"
              role="menu"
              tabindex="-1"
              style="top: {menuPosition.top}px; left: {menuPosition.left}px;"
              use:portal
              on:click|stopPropagation
              on:keydown|stopPropagation
            >
              <button
                class="world-item"
                class:current={currentWorld === 'home'}
                on:click={() => handleWorldSelect('home')}
              >
                <span class="world-icon"><HomeIcon /></span>
                {$_('breadcrumbs.worldHome')}
              </button>
              <button
                class="world-item"
                class:current={currentWorld === 'archive'}
                class:loading={isArchiveLoading}
                on:click={() => handleWorldSelect('archive')}
              >
                <span class="world-icon"><ArchiveIcon /></span>
                {$_('breadcrumbs.worldArchive')}
                {#if isArchiveLoading}
                  <span class="loading-indicator">...</span>
                {/if}
              </button>
            </div>
          {/if}
        </div>
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
            <!-- Home/Archiveアイコン -->
            {#if onWorldChange}
              <IconButton
                onClick={crumb.action}
                title={currentWorld === 'home'
                  ? $_('breadcrumbs.goHome')
                  : $_('breadcrumbs.goArchive')}
                ariaLabel={currentWorld === 'home'
                  ? $_('breadcrumbs.goHome')
                  : $_('breadcrumbs.goArchive')}
              >
                {#if currentWorld === 'home'}
                  <HomeIcon />
                {:else}
                  <ArchiveIcon />
                {/if}
              </IconButton>
            {:else}
              <IconButton
                onClick={crumb.action}
                title={$_('breadcrumbs.goHome')}
                ariaLabel={$_('breadcrumbs.goHome')}
              >
                <HomeIcon />
              </IconButton>
            {/if}
          {:else}
            <button
              class="breadcrumb-button text-ellipsis"
              class:current={index === breadcrumbs.length - 1}
              on:click={crumb.action}
            >
              {crumb.label}
            </button>
          {/if}
          {#if index === breadcrumbs.length - 1 && (crumb.type === 'note' || (crumb.type === 'leaf' && !isOfflineLeaf(crumb.id) && !isPriorityLeaf(crumb.id)))}
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
    <ShareButton
      {onCopyUrl}
      {onCopyMarkdown}
      {onShareImage}
      {onShareSelectionImage}
      {isPreview}
      {getHasSelection}
      {getSelectedText}
      {getMarkdownContent}
    />
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
    flex-wrap: nowrap;
    flex: 1;
    min-width: 0;
    overflow: visible;
  }

  :global([data-theme='greenboard']) .breadcrumbs,
  :global([data-theme='dotsD']) .breadcrumbs,
  :global([data-theme='dotsF']) .breadcrumbs {
    background: rgba(255, 255, 255, 0.15);
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }

  .separator {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .separator.clickable {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: background 0.2s;
    font-size: 0.9rem;
  }

  .separator.clickable:hover {
    background: var(--surface-2);
    color: var(--accent);
  }

  .separator-dropdown {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 150px;
    max-width: 250px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 200;
    margin-top: 4px;
  }

  .dropdown-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    color: var(--text);
    font-size: 0.85rem;
    transition: background 0.15s;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-item:hover {
    background: var(--surface-2);
  }

  .dropdown-item.current {
    background: var(--accent);
    color: white;
    font-weight: 500;
  }

  .dropdown-item.current:hover {
    background: var(--accent);
  }

  .dropdown-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.25rem;
    min-width: 0;
    max-width: 200px;
    flex-shrink: 1;
    overflow: hidden;
  }

  .breadcrumb-button {
    display: block;
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: background 0.2s;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
    text-align: left;
  }
  .breadcrumb-button.current {
    color: var(--text);
    cursor: default;
  }

  .breadcrumb-button:hover:not(.current) {
    opacity: 0.7;
  }

  .breadcrumb-input {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-size: 0.9rem;
    outline: none;
  }

  /* ワールド切り替えセパレータ（Homeの左に配置） */
  .world-separator-dropdown {
    position: relative;
    display: flex;
    align-items: center;
  }

  .world-separator {
    background: none;
    border: none;
    color: var(--text-muted);
    padding: 0.25rem;
    font-size: 0.9rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .world-separator:hover {
    background: var(--surface-2);
    color: var(--accent);
  }

  /* world-menuをdropdown-menuと同じ見た目に */
  :global(.world-menu) {
    position: fixed;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 150px;
    max-width: 250px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 1000;
  }

  :global(.world-item) {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    color: var(--text);
    font-size: 0.85rem;
    transition: background 0.15s;
  }

  :global(.world-icon) {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  :global(.world-icon svg) {
    width: 16px;
    height: 16px;
  }

  :global(.world-item:hover:not(:disabled)) {
    background: var(--surface-2);
  }

  :global(.world-item.current) {
    background: var(--accent);
    color: white;
    font-weight: 500;
  }

  :global(.world-item.current:hover) {
    background: var(--accent);
  }

  :global(.world-item:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .loading-indicator {
    margin-left: 0.5rem;
    animation: blink 1s infinite;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
</style>
