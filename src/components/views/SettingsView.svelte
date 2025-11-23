<script lang="ts">
  import type { Settings, ThemeType } from '../../lib/types'
  import { uploadAndApplyFont, removeAndDeleteCustomFont } from '../../lib/font'
  import {
    uploadAndApplyBackgroundLeft,
    uploadAndApplyBackgroundRight,
    removeAndDeleteCustomBackgroundLeft,
    removeAndDeleteCustomBackgroundRight,
  } from '../../lib/background'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let onThemeChange: (theme: ThemeType) => void
  export let pullRunning: boolean = false
  export let onPull: (isInitial?: boolean) => void

  let fileInput: HTMLInputElement
  let fontUploading = false
  let backgroundLeftFileInput: HTMLInputElement
  let backgroundRightFileInput: HTMLInputElement
  let backgroundLeftUploading = false
  let backgroundRightUploading = false

  const BACKGROUND_OPACITY = 0.1

  function handleThemeSelect(theme: ThemeType) {
    settings.theme = theme
    onThemeChange(theme)
    onSettingsChange({ theme })
  }

  type TextSettingKey = Exclude<
    keyof Settings,
    | 'theme'
    | 'hasCustomFont'
    | 'hasCustomBackgroundLeft'
    | 'hasCustomBackgroundRight'
    | 'backgroundOpacityLeft'
    | 'backgroundOpacityRight'
  >

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

  function handleFontButtonClick() {
    fileInput?.click()
  }

  async function handleFontFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]

    if (!file) return

    // フォントファイルの拡張子チェック
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2']
    const fileName = file.name.toLowerCase()
    if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
      alert('対応しているフォント形式: .ttf, .otf, .woff, .woff2')
      return
    }

    try {
      fontUploading = true
      await uploadAndApplyFont(file)
      settings.hasCustomFont = true
      onSettingsChange({ hasCustomFont: true })
    } catch (error) {
      console.error('Failed to upload font:', error)
      alert('フォントの読み込みに失敗しました')
    } finally {
      fontUploading = false
      input.value = ''
    }
  }

  async function handleResetFont() {
    try {
      await removeAndDeleteCustomFont()
      settings.hasCustomFont = false
      onSettingsChange({ hasCustomFont: false })
    } catch (error) {
      console.error('Failed to reset font:', error)
      alert('フォントのリセットに失敗しました')
    }
  }

  function handleBackgroundLeftButtonClick() {
    backgroundLeftFileInput?.click()
  }

  function handleBackgroundRightButtonClick() {
    backgroundRightFileInput?.click()
  }

  async function handleBackgroundLeftFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]

    if (!file) return

    // 画像ファイルの拡張子チェック
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
    const fileName = file.name.toLowerCase()
    if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
      alert('対応している画像形式: .jpg, .jpeg, .png, .webp, .gif')
      return
    }

    try {
      backgroundLeftUploading = true
      await uploadAndApplyBackgroundLeft(file, BACKGROUND_OPACITY)
      settings.hasCustomBackgroundLeft = true
      settings.backgroundOpacityLeft = BACKGROUND_OPACITY
      onSettingsChange({
        hasCustomBackgroundLeft: true,
        backgroundOpacityLeft: BACKGROUND_OPACITY,
      })
    } catch (error) {
      console.error('Failed to upload left background:', error)
      alert('左ペインの背景画像の読み込みに失敗しました')
    } finally {
      backgroundLeftUploading = false
      input.value = ''
    }
  }

  async function handleBackgroundRightFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]

    if (!file) return

    // 画像ファイルの拡張子チェック
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
    const fileName = file.name.toLowerCase()
    if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
      alert('対応している画像形式: .jpg, .jpeg, .png, .webp, .gif')
      return
    }

    try {
      backgroundRightUploading = true
      await uploadAndApplyBackgroundRight(file, BACKGROUND_OPACITY)
      settings.hasCustomBackgroundRight = true
      settings.backgroundOpacityRight = BACKGROUND_OPACITY
      onSettingsChange({
        hasCustomBackgroundRight: true,
        backgroundOpacityRight: BACKGROUND_OPACITY,
      })
    } catch (error) {
      console.error('Failed to upload right background:', error)
      alert('右ペインの背景画像の読み込みに失敗しました')
    } finally {
      backgroundRightUploading = false
      input.value = ''
    }
  }

  async function handleResetBackgroundLeft() {
    try {
      await removeAndDeleteCustomBackgroundLeft()
      settings.hasCustomBackgroundLeft = false
      settings.backgroundOpacityLeft = BACKGROUND_OPACITY
      onSettingsChange({
        hasCustomBackgroundLeft: false,
        backgroundOpacityLeft: BACKGROUND_OPACITY,
      })
    } catch (error) {
      console.error('Failed to reset left background:', error)
      alert('左ペインの背景画像のリセットに失敗しました')
    }
  }

  async function handleResetBackgroundRight() {
    try {
      await removeAndDeleteCustomBackgroundRight()
      settings.hasCustomBackgroundRight = false
      settings.backgroundOpacityRight = BACKGROUND_OPACITY
      onSettingsChange({
        hasCustomBackgroundRight: false,
        backgroundOpacityRight: BACKGROUND_OPACITY,
      })
    } catch (error) {
      console.error('Failed to reset right background:', error)
      alert('右ペインの背景画像のリセットに失敗しました')
    }
  }

  // Pullテスト結果の表示はトーストに統一
</script>

<section class="settings-container">
  <div class="settings-content">
    <h2 id="settings-title">設定</h2>

    <div class="qr-code-container">
      <div class="qr-code-wrapper">
        <img src="/assets/qr.webp" alt="QRコード" class="qr-code-image" />
        <p class="qr-code-description">スマホ用QRコード</p>
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
          <div class="font-field">
            <span class="sub-label">カスタムフォント</span>
            <div class="font-controls">
              <input
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                bind:this={fileInput}
                on:change={handleFontFileChange}
                style="display: none;"
              />
              <button
                type="button"
                class="test-button"
                on:click={handleFontButtonClick}
                disabled={fontUploading}
              >
                <svg
                  class="test-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <path d="M8 7h8" />
                  <path d="M8 11h8" />
                </svg>
                {fontUploading ? 'アップロード中...' : 'フォント選択'}
              </button>
              {#if settings.hasCustomFont}
                <button type="button" class="test-button" on:click={handleResetFont}>
                  デフォルトに戻す
                </button>
              {/if}
            </div>
          </div>
          <div class="background-field-wrapper">
            <span class="sub-label">カスタム背景画像</span>
            <div class="background-dual-pane">
              <div class="background-pane">
                <span class="pane-label">左ペイン</span>
                {#if settings.hasCustomBackgroundLeft}
                  <div class="background-preview background-preview-left">
                    <span class="preview-label">プレビュー</span>
                  </div>
                {/if}
                <div class="background-controls">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif"
                    bind:this={backgroundLeftFileInput}
                    on:change={handleBackgroundLeftFileChange}
                    style="display: none;"
                  />
                  <button
                    type="button"
                    class="test-button"
                    on:click={handleBackgroundLeftButtonClick}
                    disabled={backgroundLeftUploading}
                  >
                    <svg
                      class="test-icon"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    {backgroundLeftUploading ? 'アップロード中...' : '背景画像選択'}
                  </button>
                  {#if settings.hasCustomBackgroundLeft}
                    <button type="button" class="test-button" on:click={handleResetBackgroundLeft}>
                      デフォルトに戻す
                    </button>
                  {/if}
                </div>
              </div>
              <div class="background-pane">
                <span class="pane-label">右ペイン</span>
                {#if settings.hasCustomBackgroundRight}
                  <div class="background-preview background-preview-right">
                    <span class="preview-label">プレビュー</span>
                  </div>
                {/if}
                <div class="background-controls">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif"
                    bind:this={backgroundRightFileInput}
                    on:change={handleBackgroundRightFileChange}
                    style="display: none;"
                  />
                  <button
                    type="button"
                    class="test-button"
                    on:click={handleBackgroundRightButtonClick}
                    disabled={backgroundRightUploading}
                  >
                    <svg
                      class="test-icon"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    {backgroundRightUploading ? 'アップロード中...' : '背景画像選択'}
                  </button>
                  {#if settings.hasCustomBackgroundRight}
                    <button type="button" class="test-button" on:click={handleResetBackgroundRight}>
                      デフォルトに戻す
                    </button>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="about-section">
      <img src="/assets/app-icon.svg" alt="SimplestNote.md" class="about-icon" />
      <p>「こういうのでいいんだよ」を目指しています。</p>
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
    position: relative;
    z-index: 1;
  }

  h2 {
    margin-bottom: 1.5rem;
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

  h3 {
    margin-top: 0;
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
    padding: 0.5rem 1rem;
    border: none;
    border-right: 1px solid var(--border-color);
    background: var(--bg-secondary);
    color: var(--text-primary);
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s;
    min-width: 90px;
    border-radius: 0;
    flex: 1;
    white-space: nowrap;
  }

  .theme-button-row button:last-child {
    border-right: none;
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
  }

  .tool-name-field label {
    margin-bottom: 0.5rem;
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

  button[type='button']:not(.theme-buttons button):not(.test-button) {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    background: var(--accent-color);
    color: white;
    cursor: pointer;
    font-size: 0.9rem;
    transition: opacity 0.2s;
  }

  button[type='button']:not(.theme-buttons button):not(.test-button):hover {
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

  .sub-label {
    display: inline-block;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .font-field {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
  }

  .font-field .sub-label {
    margin-bottom: 0.5rem;
  }

  .font-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .background-field-wrapper {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
  }

  .background-field-wrapper .sub-label {
    margin-bottom: 0.5rem;
  }

  .background-dual-pane {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .background-pane {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .pane-label {
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .background-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .background-preview {
    position: relative;
    width: 100%;
    height: 120px;
    background: var(--bg-primary);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-label {
    position: relative;
    z-index: 1;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
</style>
