<script lang="ts">
  import { _ } from '../../lib/i18n'
  import IconButton from '../buttons/IconButton.svelte'
  import SettingsIcon from '../icons/SettingsIcon.svelte'

  export let githubConfigured: boolean
  export let title: string = 'Agasteer'
  export let onTitleClick: () => void
  export let onSettingsClick: () => void
</script>

<header>
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
  <div class="settings-button-wrapper">
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
</style>
