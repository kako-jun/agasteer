<script lang="ts">
  import { _, locale } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let pullRunning: boolean = false
  export let onPull: (isInitial?: boolean) => void

  type TextSettingKey = 'repoName' | 'token'

  let showTokenHelp = false
  let showRepoHelp = false

  function handleTextInput(key: TextSettingKey, event: Event) {
    const value = (event.target as HTMLInputElement).value
    settings[key] = value
    onSettingsChange({ [key]: value } as Partial<Settings>)
  }

  function openTokenHelp() {
    showTokenHelp = true
  }

  function closeTokenHelp() {
    showTokenHelp = false
  }

  function openRepoHelp() {
    showRepoHelp = true
  }

  function closeRepoHelp() {
    showRepoHelp = false
  }
</script>

<div class="github-settings">
  <h3>{$_('settings.github.title')}</h3>
  <div class="form-row">
    <div class="form-field">
      <div class="label-with-help">
        <label for="repo-name"
          >{$_('settings.github.repoName')} <span class="required">*</span></label
        >
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span class="help-icon" on:click={openRepoHelp} title="How to find repository name">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
      </div>
      <div class="input-with-button">
        <input
          id="repo-name"
          type="text"
          bind:value={settings.repoName}
          on:input={(e) => handleTextInput('repoName', e)}
          placeholder={$_('settings.github.repoPlaceholder')}
        />
        {#if settings.repoName}
          <a
            href="https://github.com/{settings.repoName}"
            target="_blank"
            rel="noopener noreferrer"
            class="repo-link-button"
            title="Open repository on GitHub"
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
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        {/if}
      </div>
    </div>
    <div class="form-field">
      <div class="label-with-help">
        <label for="github-token"
          >{$_('settings.github.token')} <span class="required">*</span></label
        >
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span class="help-icon" on:click={openTokenHelp} title="How to get GitHub token">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
      </div>
      <input
        id="github-token"
        type="password"
        bind:value={settings.token}
        on:input={(e) => handleTextInput('token', e)}
        placeholder={$_('settings.github.tokenPlaceholder')}
      />
    </div>
  </div>
  <div class="test-actions">
    <button type="button" class="test-button" on:click={() => onPull(false)} disabled={pullRunning}>
      <svg class="test-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 3v12m0 0-4-4m4 4 4-4M5 17h14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      {pullRunning ? $_('settings.github.pulling') : $_('settings.github.pullTest')}
    </button>
  </div>
</div>

{#if showRepoHelp}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={closeRepoHelp}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-content" on:click={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>{$_('settings.github.repoHelp.title')}</h3>
        <button class="close-button" on:click={closeRepoHelp}>×</button>
      </div>
      <div class="modal-body">
        <img
          src="/assets/github-repo-help.png"
          alt="How to find repository name"
          class="help-image"
        />
        <p class="help-description">{$_('settings.github.repoHelp.description')}</p>
      </div>
    </div>
  </div>
{/if}

{#if showTokenHelp}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={closeTokenHelp}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-content" on:click={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>{$_('settings.github.tokenHelp.title')}</h3>
        <button class="close-button" on:click={closeTokenHelp}>×</button>
      </div>
      <div class="modal-body">
        <img
          src="/assets/github-token-help.png"
          alt="How to create GitHub Personal Access Token"
          class="help-image"
        />
        <p class="help-description">{$_('settings.github.tokenHelp.description')}</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .github-settings {
    margin-bottom: 2rem;
  }

  h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--text);
  }

  .form-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .form-field {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .required {
    color: #e74c3c;
    font-weight: bold;
  }

  .input-with-button {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .input-with-button input {
    flex: 1;
  }

  .repo-link-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .repo-link-button:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  input[type='text'],
  input[type='password'] {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-size: 0.9rem;
  }

  input[type='text']:focus,
  input[type='password']:focus {
    outline: none;
    border-color: var(--accent);
  }

  .test-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .test-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .test-button:hover:not(:disabled) {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .test-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .test-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .label-with-help {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .label-with-help label {
    margin-bottom: 0;
  }

  .help-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--accent);
    transition: all 0.2s;
    opacity: 0.7;
  }

  .help-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: var(--bg);
    border-radius: 12px;
    max-width: 800px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h3 {
    margin: 0;
    color: var(--text);
  }

  .close-button {
    background: none;
    border: none;
    font-size: 2rem;
    color: var(--text-muted);
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .close-button:hover {
    color: var(--text);
  }

  .modal-body {
    padding: 1.5rem;
  }

  .help-image {
    width: 100%;
    height: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .help-description {
    color: var(--text-muted);
    line-height: 1.6;
    margin: 0;
  }

  @media (max-width: 600px) {
    .form-row {
      flex-direction: column;
    }
  }
</style>
