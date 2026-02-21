<script lang="ts">
  import { onMount } from 'svelte'
  import { _, locale } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let isTesting: boolean = false
  export let onTestConnection: () => void

  type TextSettingKey = 'repoName' | 'token'

  const SETUP_GUIDE_BASE = 'https://github.com/kako-jun/agasteer/blob/main/docs/user-guide'

  function handleTextInput(key: TextSettingKey, event: Event) {
    const value = (event.target as HTMLInputElement).value
    settings[key] = value
    onSettingsChange({ [key]: value } as Partial<Settings>)
  }

  $: setupGuideUrl = (() => {
    const lang = $locale?.startsWith('ja') ? 'ja' : 'en'
    return `${SETUP_GUIDE_BASE}/${lang}/github-setup.md`
  })()

  $: tokenGuideUrl = (() => {
    const lang = $locale?.startsWith('ja') ? 'ja' : 'en'
    const anchor =
      lang === 'ja' ? '#2-personal-access-tokenを取得する' : '#2-obtain-a-personal-access-token'
    return `${SETUP_GUIDE_BASE}/${lang}/github-setup.md${anchor}`
  })()

  let tokenCopied = false

  let initialRepoName = ''
  let repoChanged = false

  // Combo-box state
  let dropdownOpen = false
  let comboBoxRef: HTMLDivElement

  $: repoHistory = settings.repoHistory || []

  onMount(() => {
    initialRepoName = settings.repoName || ''

    // Ensure current repoName is in history
    if (settings.repoName && !(settings.repoHistory || []).includes(settings.repoName)) {
      const updated = [settings.repoName, ...(settings.repoHistory || [])]
      settings.repoHistory = updated
      onSettingsChange({ repoHistory: updated })
    }
  })

  $: repoChanged = initialRepoName !== '' && settings.repoName !== initialRepoName

  function handleRepoInput(event: Event) {
    const value = (event.target as HTMLInputElement).value
    settings.repoName = value
    onSettingsChange({ repoName: value })
  }

  function handleRepoBlur() {
    // Add to history on blur if non-empty and not already present
    if (settings.repoName && !repoHistory.includes(settings.repoName)) {
      const updated = [settings.repoName, ...repoHistory]
      settings.repoHistory = updated
      onSettingsChange({ repoHistory: updated })
    }
  }

  function selectRepo(repo: string) {
    settings.repoName = repo
    onSettingsChange({ repoName: repo })
    dropdownOpen = false
  }

  function removeRepo(repo: string, event: Event) {
    event.stopPropagation()
    const updated = repoHistory.filter((r) => r !== repo)
    settings.repoHistory = updated
    onSettingsChange({ repoHistory: updated })
    // If removing the current repo, don't clear the input
  }

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen
  }

  function handleClickOutside(event: MouseEvent) {
    if (comboBoxRef && !comboBoxRef.contains(event.target as Node)) {
      dropdownOpen = false
    }
  }

  async function copyToken() {
    if (!settings.token) return
    try {
      await navigator.clipboard.writeText(settings.token)
      tokenCopied = true
      setTimeout(() => {
        tokenCopied = false
      }, 2000)
    } catch {
      // Clipboard API failed, ignore
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="github-settings">
  <h3>{$_('settings.github.title')}</h3>
  <div class="form-row">
    <!-- Token field (LEFT) -->
    <div class="form-field">
      <div class="label-with-help">
        <label for="github-token"
          >{$_('settings.github.token')} <span class="required">*</span></label
        >
        <a
          href={tokenGuideUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="help-icon"
          title="How to get a Personal Access Token"
        >
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
        </a>
      </div>
      <div class="input-with-button">
        <input
          id="github-token"
          type="password"
          bind:value={settings.token}
          on:input={(e) => handleTextInput('token', e)}
          placeholder={$_('settings.github.tokenPlaceholder')}
        />
        {#if settings.token}
          <button
            type="button"
            class="copy-button"
            class:copied={tokenCopied}
            on:click={copyToken}
            title={tokenCopied ? 'Copied!' : 'Copy token'}
          >
            {#if tokenCopied}
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
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {:else}
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
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            {/if}
          </button>
        {/if}
      </div>
    </div>

    <!-- Repository field (RIGHT) with combo-box -->
    <div class="form-field">
      <div class="label-with-help">
        <label for="repo-name"
          >{$_('settings.github.repoName')} <span class="required">*</span></label
        >
        <a
          href={setupGuideUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="help-icon"
          title="How to setup GitHub"
        >
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
        </a>
      </div>
      <div class="combo-box" bind:this={comboBoxRef}>
        <div class="input-with-button">
          <input
            id="repo-name"
            type="text"
            bind:value={settings.repoName}
            on:input={handleRepoInput}
            on:blur={handleRepoBlur}
            placeholder={$_('settings.github.repoPlaceholder')}
          />
          {#if repoHistory.length > 0}
            <button
              type="button"
              class="dropdown-toggle"
              on:click={toggleDropdown}
              title="Recent repositories"
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
                class:flipped={dropdownOpen}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          {/if}
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
        {#if dropdownOpen && repoHistory.length > 0}
          <ul class="dropdown-list">
            {#each repoHistory as repo}
              <li class="dropdown-item" class:active={repo === settings.repoName}>
                <button
                  type="button"
                  class="dropdown-item-select"
                  on:click={() => selectRepo(repo)}
                >
                  {repo}
                </button>
                <button
                  type="button"
                  class="dropdown-item-remove"
                  on:click={(e) => removeRepo(repo, e)}
                  title={$_('settings.github.removeRepo')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      {#if repoChanged}
        <div class="repo-change-warning">
          {$_('settings.github.repoChangeWarning')}
        </div>
      {/if}
    </div>
  </div>
  <div class="video-guide-hint">
    <span>{$_('settings.github.videoGuideHint')}</span>
    <a
      href="https://www.youtube.com/watch?v=example"
      target="_blank"
      rel="noopener noreferrer"
      class="video-link"
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
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
      <span>{$_('settings.github.videoGuide')}</span>
    </a>
  </div>
  <div class="test-actions">
    <button type="button" class="test-button" on:click={onTestConnection} disabled={isTesting}>
      <svg class="test-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <polyline
          points="22 4 12 14.01 9 11.01"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      {isTesting ? $_('settings.github.testing') : $_('settings.github.testConnection')}
    </button>
  </div>
</div>

<style>
  .repo-change-warning {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: color-mix(in srgb, var(--error) 15%, var(--bg) 85%);
    border: 1px solid var(--error);
    border-radius: 4px;
    color: var(--error);
    font-size: 0.85rem;
  }

  .github-settings {
    margin-bottom: 2rem;
  }

  h3 {
    margin-top: 0;
    margin-bottom: 2rem;
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

  .copy-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .copy-button:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .copy-button.copied {
    background: #27ae60;
    color: white;
    border-color: #27ae60;
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

  /* Combo-box styles */
  .combo-box {
    position: relative;
  }

  .dropdown-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .dropdown-toggle:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .dropdown-toggle svg.flipped {
    transform: rotate(180deg);
  }

  .dropdown-toggle svg {
    transition: transform 0.2s;
  }

  .dropdown-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
  }

  .dropdown-item.active {
    background: color-mix(in srgb, var(--accent) 15%, var(--bg) 85%);
  }

  .dropdown-item-select {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    color: var(--text);
    font-size: 0.9rem;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-item-select:hover {
    background: color-mix(in srgb, var(--accent) 10%, var(--bg) 90%);
  }

  .dropdown-item-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.4rem;
    margin-right: 0.25rem;
    background: none;
    border: none;
    border-radius: 3px;
    color: var(--text);
    opacity: 0.4;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .dropdown-item-remove:hover {
    opacity: 1;
    color: var(--error, #e74c3c);
    background: color-mix(in srgb, var(--error, #e74c3c) 10%, transparent 90%);
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
    color: var(--accent);
    text-decoration: none;
    transition: all 0.2s;
    opacity: 0.7;
  }

  .help-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  .video-guide-hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-muted, #888);
    flex-wrap: wrap;
  }

  .video-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--accent);
    text-decoration: none;
    transition: opacity 0.2s;
  }

  .video-link:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  @media (max-width: 600px) {
    .form-row {
      flex-direction: column;
    }
  }
</style>
