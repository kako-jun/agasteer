<script lang="ts">
  import { _ } from '../../lib/i18n'
  import AppIcon from '../icons/AppIcon.svelte'
  import { defaultSettings } from '../../lib/data'
  import IconButton from '../buttons/IconButton.svelte'
  import PullButton from '../buttons/PullButton.svelte'
  import SettingsIcon from '../icons/SettingsIcon.svelte'
  import HelpIcon from '../icons/HelpIcon.svelte'
  import SearchIcon from '../icons/SearchIcon.svelte'
  import SwapIcon from '../icons/SwapIcon.svelte'
  import ArrowRightIcon from '../icons/ArrowRightIcon.svelte'
  import ArrowLeftIcon from '../icons/ArrowLeftIcon.svelte'
  import StaleCheckIndicator from './header/StaleCheckIndicator.svelte'

  export let githubConfigured: boolean
  export let title: string = 'Agasteer'
  export let onTitleClick: () => void
  export let onSettingsClick: () => void
  export let onPull: () => void
  export let pullDisabled: boolean = false
  export let isStale: boolean = false
  /** Pull進捗情報、nullなら非表示 */
  export let pullProgress: { percent: number; fetched: number; total: number } | null = null
  export let onPullProgressClick: () => void = () => {}
  export let onSearchClick: () => void
  export let onHelpClick: () => void
  export let isDualPane: boolean = false
  export let isOperationsLocked: boolean = false
  export let onSwapPanes: () => void = () => {}
  export let onCopyLeftToRight: () => void = () => {}
  export let onCopyRightToLeft: () => void = () => {}

  $: hasTitle = title.trim().length > 0
  $: showAppIcon = hasTitle && title.trim() === defaultSettings.toolName

  let showPaneMenu = false
  let menuX = 0
  let menuY = 0
  let swapButtonRef: HTMLElement

  function togglePaneMenu() {
    if (!showPaneMenu && swapButtonRef) {
      const rect = swapButtonRef.getBoundingClientRect()
      menuX = rect.left + rect.width / 2
      menuY = rect.bottom + 4
    }
    showPaneMenu = !showPaneMenu
  }

  function handleMenuAction(action: () => void) {
    action()
    showPaneMenu = false
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (!target.closest('.pane-menu-container') && !target.closest('.pane-menu')) {
      showPaneMenu = false
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

{#if showPaneMenu}
  <div class="pane-menu" style="left: {menuX}px; top: {menuY}px;">
    <button on:click={() => handleMenuAction(onCopyRightToLeft)}>
      <ArrowLeftIcon />
    </button>
    <button on:click={() => handleMenuAction(onSwapPanes)}>
      <SwapIcon />
    </button>
    <button on:click={() => handleMenuAction(onCopyLeftToRight)}>
      <ArrowRightIcon />
    </button>
  </div>
{/if}

<header>
  <StaleCheckIndicator />
  <div class="title-group" class:no-title={!hasTitle}>
    {#if showAppIcon}
      <span class="header-app-icon-wrap">
        <AppIcon size={28} ariaLabel="Agasteer icon" />
      </span>
    {/if}
    <a
      class="title-button"
      href="/"
      on:click={(e) => {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
          e.preventDefault()
          onTitleClick()
        }
      }}>{title}</a
    >
    <PullButton
      {onPull}
      disabled={pullDisabled}
      {isStale}
      progress={pullProgress}
      onProgressClick={onPullProgressClick}
      id="tour-pull"
    />
  </div>
  {#if isDualPane && !isOperationsLocked}
    <div class="pane-menu-container">
      <div class="swap-button" bind:this={swapButtonRef}>
        <IconButton
          onClick={togglePaneMenu}
          title={$_('header.swapPanes')}
          ariaLabel={$_('header.swapPanes')}
        >
          <SwapIcon />
        </IconButton>
      </div>
    </div>
  {/if}
  <div class="header-right">
    <IconButton
      onClick={onSearchClick}
      title={$_('search.placeholder')}
      ariaLabel={$_('search.placeholder')}
    >
      <SearchIcon />
    </IconButton>
    <IconButton onClick={onHelpClick} title={$_('header.help')} ariaLabel={$_('header.help')}>
      <HelpIcon />
    </IconButton>
    <div class="settings-button-wrapper" id="tour-settings">
      <IconButton
        onClick={onSettingsClick}
        title={$_('header.settings')}
        ariaLabel={$_('header.settings')}
      >
        <SettingsIcon />
      </IconButton>
      {#if !githubConfigured}
        <span class="notification-badge"></span>
      {/if}
    </div>
  </div>
</header>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(0, 0, 0, 0.15);
    gap: 0.5rem;
    position: relative;
  }

  :global([data-theme='greenboard']) header,
  :global([data-theme='dotsD']) header,
  :global([data-theme='dotsF']) header {
    background: rgba(255, 255, 255, 0.15);
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }

  .title-button {
    font-size: 1.5rem;
    font-weight: bold;
    color: var(--text);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    text-decoration: none;
  }

  .title-button:hover {
    color: var(--accent);
  }

  .title-group {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .title-group.no-title {
    gap: 0;
  }

  .header-app-icon-wrap {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .settings-button-wrapper {
    position: relative;
  }

  .notification-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
    pointer-events: none;
  }

  .pane-menu-container {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .swap-button {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .swap-button :global(.icon-button) {
    padding: 0.35rem;
  }

  .swap-button :global(svg) {
    width: 20px;
    height: 20px;
  }

  .pane-menu {
    position: fixed;
    transform: translateX(-50%);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    display: flex;
    gap: 0;
    overflow: hidden;
  }

  .pane-menu button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    background: none;
    border: none;
    color: var(--text);
    cursor: pointer;
  }

  .pane-menu button:hover {
    background: var(--accent);
    color: var(--bg);
  }

  .pane-menu button :global(svg) {
    width: 20px;
    height: 20px;
  }
</style>
