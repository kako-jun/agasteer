<script lang="ts">
  import { _ } from '../../lib/i18n'
  import AppIcon from '../icons/AppIcon.svelte'
  import { defaultSettings } from '../../lib/data'
  import IconButton from '../buttons/IconButton.svelte'
  import PullButton from '../buttons/PullButton.svelte'
  import SettingsIcon from '../icons/SettingsIcon.svelte'
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
  export let isDualPane: boolean = false
  export let onSwapPanes: () => void = () => {}
  export let onCopyLeftToRight: () => void = () => {}
  export let onCopyRightToLeft: () => void = () => {}

  $: hasTitle = title.trim().length > 0
  $: showAppIcon = hasTitle && title.trim() === defaultSettings.toolName

  let showPaneMenu = false

  function togglePaneMenu() {
    showPaneMenu = !showPaneMenu
  }

  function handleMenuAction(action: () => void) {
    action()
    showPaneMenu = false
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (!target.closest('.pane-menu-container')) {
      showPaneMenu = false
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

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
  {#if isDualPane}
    <div class="pane-menu-container">
      <div class="swap-button">
        <IconButton
          onClick={togglePaneMenu}
          title={$_('header.swapPanes')}
          ariaLabel={$_('header.swapPanes')}
        >
          <SwapIcon />
        </IconButton>
      </div>
      {#if showPaneMenu}
        <div class="pane-menu">
          <button on:click={() => handleMenuAction(onCopyLeftToRight)}>
            <ArrowRightIcon />
          </button>
          <button on:click={() => handleMenuAction(onSwapPanes)}>
            <SwapIcon />
          </button>
          <button on:click={() => handleMenuAction(onCopyRightToLeft)}>
            <ArrowLeftIcon />
          </button>
        </div>
      {/if}
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
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 0.25rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    display: flex;
    gap: 0;
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

  .pane-menu button:first-child {
    border-radius: 7px 0 0 7px;
  }

  .pane-menu button:last-child {
    border-radius: 0 7px 7px 0;
  }

  .pane-menu button:not(:last-child) {
    border-right: 1px solid var(--border);
  }

  .pane-menu button :global(svg) {
    width: 20px;
    height: 20px;
  }
</style>
