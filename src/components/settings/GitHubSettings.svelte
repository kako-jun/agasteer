<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let pullRunning: boolean = false
  export let onPull: (isInitial?: boolean) => void

  type TextSettingKey = 'repoName' | 'token' | 'username' | 'email'

  function handleTextInput(key: TextSettingKey, event: Event) {
    const value = (event.target as HTMLInputElement).value
    settings[key] = value
    onSettingsChange({ [key]: value } as Partial<Settings>)
  }
</script>

<div class="github-settings">
  <h3>{$_('settings.github.title')}</h3>
  <div class="form-row">
    <div class="form-field">
      <label for="repo-name">{$_('settings.github.repoName')}</label>
      <input
        id="repo-name"
        type="text"
        bind:value={settings.repoName}
        on:input={(e) => handleTextInput('repoName', e)}
        placeholder={$_('settings.github.repoPlaceholder')}
      />
    </div>
    <div class="form-field">
      <label for="github-token">{$_('settings.github.token')}</label>
      <input
        id="github-token"
        type="password"
        bind:value={settings.token}
        on:input={(e) => handleTextInput('token', e)}
        placeholder={$_('settings.github.tokenPlaceholder')}
      />
    </div>
  </div>
  <div class="form-row">
    <div class="form-field">
      <label for="commit-username">{$_('settings.github.username')}</label>
      <input
        id="commit-username"
        type="text"
        bind:value={settings.username}
        on:input={(e) => handleTextInput('username', e)}
        placeholder={$_('settings.github.usernamePlaceholder')}
      />
    </div>
    <div class="form-field">
      <label for="commit-email">{$_('settings.github.email')}</label>
      <input
        id="commit-email"
        type="email"
        bind:value={settings.email}
        on:input={(e) => handleTextInput('email', e)}
        placeholder={$_('settings.github.emailPlaceholder')}
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

<style>
  .github-settings {
    margin-bottom: 2rem;
  }

  h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--text-primary);
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
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
  }

  input[type='text'],
  input[type='password'],
  input[type='email'] {
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  input[type='text']:focus,
  input[type='password']:focus,
  input[type='email']:focus {
    outline: none;
    border-color: var(--accent-color);
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
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .test-button:hover:not(:disabled) {
    background: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
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

  @media (max-width: 600px) {
    .form-row {
      flex-direction: column;
    }
  }
</style>
