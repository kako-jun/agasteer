<script lang="ts">
  import { _, locale } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let isLoadingUI: boolean = false
  export let onPull: (isInitial?: boolean) => void

  type TextSettingKey = 'repoName' | 'token'

  const SETUP_GUIDE_BASE = 'https://github.com/kako-jun/agasteer/blob/main/docs/user-guide'

  function handleTextInput(key: TextSettingKey, event: Event) {
    const value = (event.target as HTMLInputElement).value
    settings[key] = value
    onSettingsChange({ [key]: value } as Partial<Settings>)
  }

  function openSetupGuide() {
    const lang = $locale?.startsWith('ja') ? 'ja' : 'en'
    const url = `${SETUP_GUIDE_BASE}/${lang}/github-setup.md`
    window.open(url, '_blank', 'noopener,noreferrer')
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
        <span class="help-icon" on:click={openSetupGuide} title="How to setup GitHub">
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
        <span class="help-icon" on:click={openSetupGuide} title="How to setup GitHub">
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
    <button type="button" class="test-button" on:click={() => onPull(false)} disabled={isLoadingUI}>
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
      {isLoadingUI ? $_('settings.github.pulling') : $_('settings.github.pullTest')}
    </button>
  </div>
</div>

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

  @media (max-width: 600px) {
    .form-row {
      flex-direction: column;
    }
  }
</style>
