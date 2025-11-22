<script lang="ts">
  export let githubConfigured: boolean
  export let title: string = 'SimplestNote.md'
  export let onTitleClick: () => void
  export let onSettingsClick: () => void
</script>

<header>
  <button class="title-button" on:click={onTitleClick}>{title}</button>
  <button
    class="settings-button"
    on:click={onSettingsClick}
    title="設定を開く"
    aria-label="設定を開く"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
    {#if !githubConfigured}
      <span class="notification-badge"></span>
    {/if}
  </button>
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
    color: var(--text-primary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .title-button:hover {
    color: var(--accent-color);
  }

  .settings-button {
    font-size: 1.5rem;
    background: none;
    border: none;
    cursor: pointer;
    position: relative;
    padding: 0.25rem;
    color: var(--text-primary);
  }

  .notification-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
  }
</style>
