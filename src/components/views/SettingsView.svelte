<script lang="ts">
  import { _, locale } from '../../lib/i18n'
  import type { Settings, ThemeType, Locale } from '../../lib/types'
  import GitHubSettings from '../settings/GitHubSettings.svelte'
  import ThemeSelector from '../settings/ThemeSelector.svelte'
  import FontCustomizer from '../settings/FontCustomizer.svelte'
  import BackgroundCustomizer from '../settings/BackgroundCustomizer.svelte'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let onThemeChange: (theme: ThemeType) => void
  export let pullRunning: boolean = false
  export let onPull: (isInitial?: boolean) => void

  function handleToolNameInput(event: Event) {
    const value = (event.target as HTMLInputElement).value
    settings.toolName = value
    onSettingsChange({ toolName: value })
  }

  function handleLocaleChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as Locale
    locale.set(value)
    settings.locale = value
    onSettingsChange({ locale: value })
  }
</script>

<section class="settings-container">
  <div class="settings-content">
    <h2 id="settings-title">{$_('settings.title')}</h2>

    <div class="qr-code-container">
      <div class="qr-code-wrapper">
        <img src="/assets/qr.webp" alt="QR Code" class="qr-code-image" />
        <p class="qr-code-description">{$_('settings.qrCodeDescription')}</p>
      </div>
    </div>

    <div class="help-links">
      <a
        href="https://github.com/kako-jun/simplest-note-md#readme"
        target="_blank"
        rel="noopener noreferrer"
        class="help-link"
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
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span>{$_('settings.help.text')}</span>
      </a>
      <a
        href="https://www.youtube.com/watch?v=example"
        target="_blank"
        rel="noopener noreferrer"
        class="help-link"
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
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <span>{$_('settings.help.video')}</span>
      </a>
    </div>

    <hr />

    <div class="form-section">
      <GitHubSettings {settings} {onSettingsChange} {pullRunning} {onPull} />
      <hr />
      <div class="form-row">
        <div class="form-field">
          <h3>{$_('settings.extras.title')}</h3>

          <label for="language">{$_('settings.extras.language')}</label>
          <div class="select-wrapper">
            <select id="language" bind:value={settings.locale} on:change={handleLocaleChange}>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>

          <ThemeSelector {settings} {onThemeChange} {onSettingsChange} />

          <div class="tool-name-field">
            <label for="tool-name">{$_('settings.extras.toolName.label')}</label>
            <input
              id="tool-name"
              type="text"
              bind:value={settings.toolName}
              placeholder={$_('settings.extras.toolName.placeholder')}
              on:input={handleToolNameInput}
            />
          </div>

          <FontCustomizer {settings} {onSettingsChange} />

          <BackgroundCustomizer {settings} {onSettingsChange} />
        </div>
      </div>
    </div>

    <div class="about-section">
      <img src="/assets/app-icon.svg" alt="SimplestNote.md" class="about-icon" />
      <p>{$_('settings.about.description')}</p>
      <p class="author">
        {$_('settings.about.author')}: <strong>kako-jun</strong>
        <a
          href="https://github.com/kako-jun/simplest-note-md"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
            />
          </svg>
        </a>
        <a href="https://llll-ll.com" target="_blank" rel="noopener noreferrer" title="Homepage">
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
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </a>
      </p>
      <div class="sponsor-section">
        <a
          href="https://github.com/sponsors/kako-jun"
          target="_blank"
          rel="noopener noreferrer"
          class="sponsor-link"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="heart-icon"
          >
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            />
          </svg>
          <span>Sponsor on GitHub</span>
        </a>
      </div>
    </div>
  </div>
</section>

<style>
  .settings-container {
    padding: 2rem;
  }

  .settings-content {
    max-width: 800px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }

  h2 {
    margin-bottom: 1.5rem;
    color: var(--text-primary);
  }

  h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--text-primary);
  }

  .qr-code-container {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .qr-code-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .qr-code-image {
    width: 100px;
    height: 100px;
    object-fit: contain;
    border: 2px solid var(--border-color);
    border-radius: 8px;
    padding: 0.5rem;
    background: white;
  }

  .qr-code-description {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .help-links {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .help-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    text-decoration: none;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .help-link:hover {
    background: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .help-link svg {
    flex-shrink: 0;
  }

  .form-section {
    margin-bottom: 2rem;
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
    position: relative;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
  }

  select,
  input[type='text'] {
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  select {
    appearance: none;
    padding-right: 2rem;
    background-image: none;
    width: 100%;
  }

  .select-wrapper {
    position: relative;
  }

  .select-wrapper::after {
    content: '';
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid var(--text-primary);
  }

  select:focus,
  input[type='text']:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .tool-name-field {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
  }

  .tool-name-field label {
    margin-bottom: 0.5rem;
  }

  hr {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 2rem 0;
  }

  .about-section {
    margin-top: 3rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .about-icon {
    width: 100px;
    height: 100px;
    object-fit: contain;
    margin: 0 auto 1rem;
    display: block;
  }

  .about-section p {
    margin: 1rem 0;
    line-height: 1.6;
  }

  .author {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem !important;
  }

  .author a {
    color: var(--text-primary);
    display: flex;
    align-items: center;
    transition: color 0.2s;
  }

  .author a:hover {
    color: var(--accent-color);
  }

  .sponsor-section {
    margin-top: 0;
  }

  .sponsor-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    text-decoration: none;
    border-radius: 6px;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .sponsor-link:hover {
    background: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
  }

  .heart-icon {
    flex-shrink: 0;
    animation: heartbeat 1.5s ease-in-out infinite;
  }

  @keyframes heartbeat {
    0%,
    100% {
      transform: scale(1);
    }
    10%,
    30% {
      transform: scale(1.1);
    }
    20%,
    40% {
      transform: scale(1);
    }
  }
</style>
