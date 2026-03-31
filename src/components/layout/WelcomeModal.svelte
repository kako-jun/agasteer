<script lang="ts">
  import { _ } from '../../lib/i18n'
  import SettingsIcon from '../icons/SettingsIcon.svelte'

  interface Props {
    show: boolean
    onOpenSettings: () => void
    onClose: () => void
  }

  let { show, onOpenSettings, onClose }: Props = $props()
</script>

{#if show}
  <div class="welcome-modal-overlay">
    <div class="welcome-modal-content">
      <h2 class="welcome-title">
        {$_('welcome.title')}
      </h2>
      <p class="welcome-message">
        {$_('welcome.message1')}
      </p>
      <p class="welcome-message">
        {$_('welcome.message2')}
      </p>
      <div class="welcome-buttons">
        <button class="welcome-button primary" on:click={onOpenSettings}>
          <span class="button-icon">
            <SettingsIcon />
          </span>
          {$_('welcome.openSettings')}
        </button>
        <button class="welcome-button secondary" on:click={onClose}>
          {$_('welcome.later')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .welcome-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
  }

  .welcome-modal-content {
    background: var(--bg);
    border-radius: 12px;
    padding: 32px;
    max-width: 480px;
    width: 90%;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .welcome-title {
    font-size: 1.5rem;
    margin: 0 0 16px 0;
    color: var(--fg);
    white-space: pre-line;
  }

  .welcome-message {
    font-size: 1rem;
    color: var(--fg-muted);
    margin: 0 0 12px 0;
    line-height: 1.5;
  }

  .welcome-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 24px;
  }

  @media (min-width: 480px) {
    .welcome-buttons {
      flex-direction: row;
      justify-content: center;
    }
  }

  .welcome-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    border: none;
    transition: background 0.2s;
  }

  .welcome-button.primary {
    background: var(--accent);
    color: white;
  }

  .welcome-button.primary:hover {
    opacity: 0.85;
  }

  .welcome-button.secondary {
    background: var(--card-bg);
    color: var(--fg);
    border: 1px solid var(--border);
  }

  .welcome-button.secondary:hover {
    opacity: 0.85;
  }

  .button-icon {
    display: flex;
    align-items: center;
  }
</style>
