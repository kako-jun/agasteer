<script lang="ts">
  import { _ } from 'svelte-i18n'
  import AppIcon from '../icons/AppIcon.svelte'

  export let onInstall: () => void
  export let onDismiss: () => void
</script>

<div class="install-banner">
  <div class="install-content">
    <AppIcon size={24} />
    <span class="install-message">{$_('install.message')}</span>
    <div class="install-actions">
      <button class="install-button" on:click={onInstall}>
        {$_('install.install')}
      </button>
      <button class="dismiss-button" on:click={onDismiss}>
        {$_('install.dismiss')}
      </button>
    </div>
  </div>
</div>

<style>
  .install-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: var(--surface-1);
    border-bottom: 2px solid var(--accent);
    padding: 12px 16px;
    z-index: 3000;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      transform: translateY(-100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .install-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
    max-width: 600px;
    margin: 0 auto;
  }

  .install-message {
    color: var(--text);
    font-size: 0.9rem;
  }

  .install-actions {
    display: flex;
    gap: 8px;
  }

  .install-button {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .install-button:hover {
    opacity: 0.9;
  }

  .dismiss-button {
    background: transparent;
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--text) 30%, transparent 70%);
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .dismiss-button:hover {
    background: color-mix(in srgb, var(--text) 10%, transparent 90%);
  }
</style>
