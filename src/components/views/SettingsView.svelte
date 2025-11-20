<script lang="ts">
  import type { Settings, ThemeType } from '../../lib/types'

  export let settings: Settings
  export let statusMessage: string = ''
  export let onSave: () => void
  export let onThemeChange: (theme: ThemeType) => void

  function handleThemeSelect(theme: ThemeType) {
    settings.theme = theme
    onThemeChange(theme)
  }
</script>

<section class="settings-container">
  <div class="settings-content">
    <h2>設定</h2>

    <div class="form-section">
      <h3>GitHub連携</h3>
      <div class="form-row">
        <div class="form-field">
          <label for="repo-name">リポジトリ名（owner/repo）</label>
          <input
            id="repo-name"
            type="text"
            bind:value={settings.repoName}
            placeholder="owner/repo"
          />
        </div>
        <div class="form-field">
          <label for="github-token">GitHubトークン</label>
          <input
            id="github-token"
            type="password"
            bind:value={settings.token}
            placeholder="ghp_..."
          />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="commit-username">コミットユーザー名</label>
          <input
            id="commit-username"
            type="text"
            bind:value={settings.username}
            placeholder="your-name"
          />
        </div>
        <div class="form-field">
          <label for="commit-email">コミットメールアドレス</label>
          <input
            id="commit-email"
            type="email"
            bind:value={settings.email}
            placeholder="you@example.com"
          />
        </div>
      </div>
      <div class="form-actions">
        {#if statusMessage}
          <span class="status-message">{statusMessage}</span>
        {/if}
        <button type="button" on:click={onSave}>設定を保存</button>
      </div>
    </div>

    <hr />

    <div class="form-section">
      <h3>テーマ選択</h3>
      <div class="theme-buttons">
        <button
          type="button"
          class:active={settings.theme === 'light'}
          on:click={() => handleThemeSelect('light')}
        >
          ライト
        </button>
        <button
          type="button"
          class:active={settings.theme === 'dark'}
          on:click={() => handleThemeSelect('dark')}
        >
          ダーク
        </button>
        <button
          type="button"
          class:active={settings.theme === 'blackboard'}
          on:click={() => handleThemeSelect('blackboard')}
        >
          黒板
        </button>
        <button
          type="button"
          class:active={settings.theme === 'kawaii'}
          on:click={() => handleThemeSelect('kawaii')}
        >
          Kawaii
        </button>
        <button
          type="button"
          class:active={settings.theme === 'custom'}
          on:click={() => handleThemeSelect('custom')}
        >
          カスタム
        </button>
      </div>
      {#if settings.theme === 'custom'}
        <div class="custom-theme-controls">
          <div class="color-picker">
            <label for="custom-bg-color">背景色</label>
            <input id="custom-bg-color" type="color" bind:value={settings.customBgPrimary} />
          </div>
          <div class="color-picker">
            <label for="custom-accent-color">アクセント色</label>
            <input id="custom-accent-color" type="color" bind:value={settings.customAccentColor} />
          </div>
        </div>
      {/if}
    </div>

    <hr />

    <div class="about-section">
      <h3>SimplestNote.md</h3>
      <p>
        コンフリクトばかりのObsidianや<br />
        シンプルでないSimplenoteがいやになって作りました。<br />
        「こういうのでいいんだよ」を目指しています。
      </p>
      <p class="author">
        作者: <strong>kako-jun</strong>
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
      </p>
    </div>
  </div>
</section>

<style>
  .settings-container {
    padding: 2rem;
    height: calc(100vh - 80px);
    overflow-y: auto;
  }

  .settings-content {
    max-width: 800px;
    margin: 0 auto;
  }

  h2 {
    margin-bottom: 2rem;
    color: var(--text-primary);
  }

  h3 {
    margin-bottom: 1rem;
    color: var(--text-primary);
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

  .form-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
  }

  .status-message {
    color: var(--accent-color);
    font-size: 0.9rem;
  }

  .theme-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .theme-buttons button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .theme-buttons button.active {
    background: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
  }

  .theme-buttons button:hover:not(.active) {
    border-color: var(--accent-color);
  }

  .custom-theme-controls {
    display: flex;
    gap: 2rem;
    justify-content: center;
    margin-top: 1rem;
  }

  .color-picker {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .color-picker label {
    font-size: 0.85rem;
    margin-bottom: 0;
  }

  input[type='color'] {
    width: 80px;
    height: 40px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
  }

  hr {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 2rem 0;
  }

  .about-section {
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .about-section h3 {
    color: var(--text-primary);
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

  button[type='button']:not(.theme-buttons button) {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    background: var(--accent-color);
    color: white;
    cursor: pointer;
    font-size: 0.9rem;
    transition: opacity 0.2s;
  }

  button[type='button']:not(.theme-buttons button):hover {
    opacity: 0.9;
  }
</style>
