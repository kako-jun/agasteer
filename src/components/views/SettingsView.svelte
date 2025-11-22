<script lang="ts">
  import type { Settings, ThemeType } from '../../lib/types'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let onThemeChange: (theme: ThemeType) => void
  export let pullRunning: boolean = false
  export let onPull: (isInitial?: boolean) => void

  function handleThemeSelect(theme: ThemeType) {
    settings.theme = theme
    onThemeChange(theme)
    onSettingsChange({ theme })
  }

  type TextSettingKey = Exclude<keyof Settings, 'theme'>

  function handleInputChange(key: TextSettingKey, value: string) {
    settings[key] = value as Settings[TextSettingKey]
    onSettingsChange({ [key]: value } as Partial<Settings>)
  }

  function handleTextInput(key: TextSettingKey, event: Event) {
    const value = (event.target as HTMLInputElement).value
    handleInputChange(key, value)
  }

  function handleToolNameInput(event: Event) {
    const value = (event.target as HTMLInputElement).value
    handleInputChange('toolName', value)
  }

  // Pullテスト結果の表示はトーストに統一
</script>

<section class="settings-container">
  <div class="settings-content">
    <h2 id="settings-title">設定</h2>

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
        <span>使い方（テキスト）</span>
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
        <span>使い方（動画）</span>
      </a>
    </div>

    <hr />

    <div class="form-section">
      <h3>GitHub連携</h3>
      <div class="form-row">
        <div class="form-field">
          <label for="repo-name">リポジトリ名（owner/repo）</label>
          <input
            id="repo-name"
            type="text"
            bind:value={settings.repoName}
            on:input={(e) => handleTextInput('repoName', e)}
            placeholder="owner/repo"
          />
        </div>
        <div class="form-field">
          <label for="github-token">GitHubトークン</label>
          <input
            id="github-token"
            type="password"
            bind:value={settings.token}
            on:input={(e) => handleTextInput('token', e)}
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
            on:input={(e) => handleTextInput('username', e)}
            placeholder="your-name"
          />
        </div>
        <div class="form-field">
          <label for="commit-email">コミットメールアドレス</label>
          <input
            id="commit-email"
            type="email"
            bind:value={settings.email}
            on:input={(e) => handleTextInput('email', e)}
            placeholder="you@example.com"
          />
        </div>
      </div>
      <div class="test-actions">
        <button
          type="button"
          class="test-button"
          on:click={() => onPull(false)}
          disabled={pullRunning}
        >
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
          {pullRunning ? 'Pull中…' : 'Pullテスト'}
        </button>
      </div>
      <hr />
      <div class="form-row">
        <div class="form-field">
          <h3>おまけ</h3>
          <span class="sub-label">テーマ選択</span>
          <div class="theme-buttons">
            <div class="theme-button-row">
              <button
                type="button"
                class:active={settings.theme === 'yomi'}
                on:click={() => handleThemeSelect('yomi')}
              >
                黄泉
              </button>
              <button
                type="button"
                class:active={settings.theme === 'campus'}
                on:click={() => handleThemeSelect('campus')}
              >
                キャンパス
              </button>
              <button
                type="button"
                class:active={settings.theme === 'greenboard'}
                on:click={() => handleThemeSelect('greenboard')}
              >
                緑板
              </button>
            </div>
            <div class="theme-button-row">
              <button
                type="button"
                class:active={settings.theme === 'whiteboard'}
                on:click={() => handleThemeSelect('whiteboard')}
              >
                ホワイボー
              </button>
              <button
                type="button"
                class:active={settings.theme === 'dotsD'}
                on:click={() => handleThemeSelect('dotsD')}
              >
                ドッツD
              </button>
              <button
                type="button"
                class:active={settings.theme === 'dotsF'}
                on:click={() => handleThemeSelect('dotsF')}
              >
                ドッツF
              </button>
            </div>
          </div>
          <div class="tool-name-field">
            <label for="tool-name">ツール名</label>
            <input
              id="tool-name"
              type="text"
              bind:value={settings.toolName}
              placeholder="SimplestNote.md"
              on:input={handleToolNameInput}
            />
          </div>
        </div>
      </div>
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
  }

  .settings-content {
    max-width: 800px;
    margin: 0 auto;
  }

  h2 {
    margin-bottom: 1.5rem;
    color: var(--text-primary);
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

  .theme-buttons {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0 auto;
    max-width: fit-content;
  }

  .theme-button-row {
    display: flex;
    gap: 0;
    border: 1px solid var(--border-color);
    overflow: hidden;
  }

  .theme-button-row:not(:first-child) {
    border-top: none;
  }

  .theme-button-row:first-child {
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
  }

  .theme-button-row:last-child {
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
  }

  .theme-buttons button {
    padding: 0.5rem 0.75rem;
    border: none;
    background: var(--bg-secondary);
    color: var(--text-primary);
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s;
    min-width: 70px;
    border-radius: 0;
    flex: 1;
  }

  .theme-button-row:first-child button:first-child {
    border-radius: 6px 0 0 0;
  }

  .theme-button-row:first-child button:last-child {
    border-radius: 0 6px 0 0;
  }

  .theme-button-row:last-child button:first-child {
    border-radius: 0 0 0 6px;
  }

  .theme-button-row:last-child button:last-child {
    border-radius: 0 0 6px 0;
  }

  .tool-name-field {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .theme-buttons button.active {
    background: var(--accent-color);
    color: white;
    box-shadow: inset 0 0 0 1px var(--accent-color);
  }

  .theme-buttons button:hover:not(.active) {
    background: var(--bg-primary);
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

  .test-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .test-button {
    margin-left: auto;
    min-width: 120px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .test-icon {
    width: 16px;
    height: 16px;
  }

  .sub-label {
    display: inline-block;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
  }
</style>
